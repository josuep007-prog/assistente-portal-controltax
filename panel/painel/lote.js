/* Painel — Vários arquivos: uma solicitação por documento. (parte de panel/panel.js, dividido na 2.16.4; mapa em docs/arquitetura.md). */
import * as E from '../engine.js';
import { readFile, aiExtract, aiAvailable } from '../extract.js';
import { $, S, esc, icon, request, send, toast } from './base.js';
import { PAR_AVISO, aplicarSugestoes, camposAusentes, fillPortal, updateChecks } from './formulario.js';
import { abrirComArquivos, ajustarDepartamento, anotarCandidatos, aplicarCampos, camposComAjustes, empresaDoPedido, entenderTexto, juntarArquivos, juntarCampos, mostrarSugestao, novoItem, openTipo } from './inicio.js';
import { anexosAtuais, gerarTextos, portalValores, valoresAssistente, valoresParaChecar } from './valores.js';
import { atualizarTextoNoPortal, naoAceitosPeloPortal } from './portal.js';
import { campoDef, campoPortal, desligadosEmpresa, empregadosDaEmpresa, loadEmpregados, render, setView, tipoDef, w } from './modo.js';
import { comecarDoZeroSeAbandonado, nomeCurto } from './facilidades.js';
import { renderFieldsOnly } from './preencher.js';

/* Lê tudo primeiro; atestados viram uma solicitação cada; documentos de pedidos diferentes
   viram uma solicitação por tipo. Abre uma de cada vez: o cliente confere e envia, e o
   Assistente abre e preenche a próxima. */
export async function handleVarios(files, origem) {
  if (S.lote && !S.lote.concluido) { toast('Termine (ou pare) o lote atual antes de arrastar outros arquivos.'); return; }
  const itens = files.map(f => novoItem(f, origem));
  S.loteLeitura = { itens };
  // plataforma: a leitura aparece no Novo pedido (com um formulário aberto, nele); painel: no Início ou no Preencher
  if (S.modo === 'plataforma' ? S.view !== 'preencher' : !['inicio', 'preencher'].includes(S.view)) setView(S.modo === 'plataforma' || S.ctx.route?.mode === 'form' ? 'preencher' : 'inicio'); else renderLote();
  for (const it of itens) { await processItem(it, null); renderLote(); }
  S.loteLeitura = null;
  // de quem é cada documento: relê com a lista de funcionários da empresa (o pedido é de um tipo e de uma pessoa)
  const lista = await empregadosDaEmpresa();
  if (lista.length) for (const it of itens) if (it.texto && it.analise?.tipoSugerido && !it.rubricas && it.status === 'ok') it.analise = analisarItem(it, it.analise.tipoSugerido, lista);
  const { pedidos, fora, pessoas } = montarPedidos(itens);
  if (pedidos.length >= 2) return iniciarLote(pedidos, fora, pessoas);
  renderLote();
  const tipoForm = S.ctx.route?.mode === 'form' ? S.ctx.tipo : null;
  if (tipoForm) {
    // um pedido só (ou nada reconhecido): tudo vai para a solicitação aberta
    comecarDoZeroSeAbandonado(tipoForm);
    const W = w(tipoForm);
    for (const it of itens) {
      juntarArquivos(W, [it]);
      if (it.texto) it.analise = analisarItem(it, tipoForm, W.empregados);
      applyAnalysis(tipoForm, it, { preencher: false });
    }
    if (S.view !== 'preencher') setView('preencher'); else render();
    if (S.prefs.preencherAoLer) fillPortal(tipoForm, { silencioso: true });
    return;
  }
  const principal = pedidos[0]?.itens[0] || itens[0];
  // o cartão usa o tipo que mais aparece nos arquivos (não o do primeiro)
  S.sugestao = { item: principal, extras: itens.filter(i => i !== principal), tipo: E.tipoMaisFrequente(itens, S.rules) || pedidos[0]?.tipo || null };
  mostrarSugestao();
}

/** Um pedido por tipo e por pessoa (a lógica está no motor: E.montarPedidosLote, com testes). */
export const montarPedidos = (itens) => E.montarPedidosLote(itens, S.rules);

export async function iniciarLote(pedidos, fora, pessoas = []) {
  // pergunta a empresa uma vez só: todas as solicitações do lote vão para ela
  if (!(await empresaDoPedido(null))) return;
  S.lote = { pedidos: pedidos.map((p, i) => ({ ...p, n: i + 1, status: 'pendente' })), idx: -1, fora, pessoas, pausado: false, concluido: false };
  S.sugestao = null;
  toast(pessoas.length >= 2 ? (S.rules.mensagens?.lotePessoas || 'Há documentos de {n} pessoas: abri um pedido para cada uma, para não misturar os dados.').replace('{n}', pessoas.length) : `${pedidos.length} solicitações para abrir, uma de cada vez.`);
  await abrirPedido(0);
}

export const esperar = (ms) => new Promise(r => setTimeout(r, ms));

export async function abrirPedido(i) {
  const L = S.lote; if (!L) return;
  const p = L.pedidos[i]; if (!p) return;
  L.idx = i; p.status = 'atual'; L.pausado = false; L.navegando = true;
  renderLote();
  const t = tipoDef(p.tipo);
  // começa sempre de um formulário limpo
  if (S.ctx.route?.mode === 'form' && S.ctx.tipo === p.tipo && (i > 0 || Object.keys(portalValores(p.tipo)).length)) {
    await request({ type: 'navigate', slug: t.slug, add: false }, 8000);
  }
  S.work[p.tipo] = null;
  const W = w(p.tipo);
  p.itens.forEach(it => { it.anexado = false; it.removido = false; it.outroTipo = null; });
  W.arquivos = []; juntarArquivos(W, p.itens);
  await openTipo(p.tipo, { manter: true, semEmpresa: true });
  for (let k = 0; k < 40 && !(S.ctx.route?.mode === 'form' && S.ctx.tipo === p.tipo); k++) await esperar(200);
  await loadEmpregados(p.tipo);
  for (const it of p.itens) {
    if (it.texto) it.analise = analisarItem(it, p.tipo, W.empregados);
    applyAnalysis(p.tipo, it, { preencher: false });
  }
  // pedido que veio do texto livre (vários pedidos numa frase, ou aviso e cálculo): os campos entendidos
  if (p.campos) { juntarCampos(p.tipo, Object.fromEntries(Object.entries(p.campos).map(([k, c]) => [k, { ...c }])), 'sua descrição'); gerarTextos(p.tipo); }
  const v = valoresAssistente(p.tipo);
  p.rotulo = [v.empregado, v.dataAfastamento || v.inicioGozo || v.dataDemissao, v.dias ? `${v.dias} ${+v.dias === 1 ? 'dia' : 'dias'}` : ''].filter(Boolean).join(' · ');
  await fillPortal(p.tipo, { silencioso: true });
  L.navegando = false;
  renderLote();
  if (await abrirResumoSePronto(p.tipo)) { p.resumo = true; renderLote(); }
}

/** Pedido preparado pelo Assistente (atalhos do Hoje, Funcionários, Calcular e o lote) que terminou sem falha, sem
 *  obrigatório faltando e com os anexos no portal: abre o resumo do "Conferir e enviar". Quem envia é o cliente. */
export async function abrirResumoSePronto(tipo) {
  if (S.ctx.route?.mode !== 'form' || S.ctx.tipo !== tipo) return false;
  const W = w(tipo);
  if (!W.resultados || W.resultados.resultados?.some(x => !x.ok)) return false;
  if (W.arquivos.some(a => !a.removido && !a.outroTipo && a.status !== 'erro' && !(a.anexado || a.jaAnexado))) return false;
  await esperar(500);   // o portal manda a tela de novo depois do preenchimento
  if (S.ctx.route?.mode !== 'form' || S.ctx.tipo !== tipo) return false;
  // obrigatórios pelo que está no portal (o que só está aqui ainda não vale)
  const vals = valoresParaChecar(tipo);
  for (const [k, c] of Object.entries(tipoDef(tipo).campos)) if (!c.somenteAssistente && campoPortal(k).existe) vals[k] = campoPortal(k).valor || '';
  const list = [...E.runChecks(tipo, vals, anexosAtuais(tipo), S.rules, E.today(), { ausentes: camposAusentes(S.ctx.form) }), ...naoAceitosPeloPortal(tipo, S.ctx.form)];
  if (list.some(i => i.nivel === 'erro' || i.grupo === 'Portal') || (S.ctx.form?.erros || []).length) return false;
  S.resumoAuto = true;
  send({ type: 'requestSubmit' });
  return true;
}

export async function proximoPedido() {
  const L = S.lote; if (!L) return;
  const next = L.pedidos.findIndex(p => p.status === 'pendente');
  if (next < 0) {
    L.concluido = true; renderLote();
    const env = L.pedidos.filter(p => p.status === 'enviado').length;
    toast(`Lote concluído: ${env} de ${L.pedidos.length} solicitação(ões) enviada(s).`);
    return;
  }
  await abrirPedido(next);
}

export async function pularPedido() {
  const L = S.lote; const p = L?.pedidos[L.idx]; if (!p) return;
  p.status = 'pulado'; L.navegando = true;
  await request({ type: 'navigate', slug: tipoDef(p.tipo).slug, add: false }, 8000);
  await proximoPedido();
}

/** Chamado quando o formulário fecha: envio concluído → próximo; fechado sem enviar → pausa. */
export function loteAoFecharFormulario(enviadoTipo) {
  const L = S.lote; if (!L || L.concluido || L.navegando) return;
  const p = L.pedidos[L.idx]; if (!p || p.status !== 'atual') return;
  if (enviadoTipo === p.tipo) { p.status = 'enviado'; renderLote(); setTimeout(proximoPedido, 1200); }
  else { L.pausado = true; renderLote(); }
}

export function renderLote() {
  const el = $('#lote'); if (!el) return;
  if (S.loteLeitura) {
    const its = S.loteLeitura.itens; const lidos = its.filter(i => i.status !== 'lendo').length;
    el.innerHTML = `<div class="card pad lote"><div class="lote-h"><div class="spin"></div><b>Lendo ${its.length} arquivos…</b><small class="mono">${lidos}/${its.length}</small></div>
      <div class="prog" style="margin-top:8px"><i style="width:${Math.round(lidos / its.length * 100)}%"></i></div></div>`;
    return;
  }
  const L = S.lote; if (!L) { el.innerHTML = ''; return; }
  const env = L.pedidos.filter(p => p.status === 'enviado').length;
  const atual = L.pedidos[L.idx];
  const st = { enviado: icon('check', 'ic-sm'), pulado: icon('minus', 'ic-sm'), atual: icon('arrow', 'ic-sm') };
  const nomeTipo = (p) => p.itens.some(i => i.documento === 'atestado') ? 'Atestado' : p.itens.some(i => i.documento === 'comparecimento') ? 'Declaração de comparecimento' : (S.rules.tipos[p.tipo]?.nome || 'Solicitação');
  const rotuloPedido = (p) => p.rotulo || p.pessoa?.nome || p.itens[0]?.nome || Object.values(p.campos || {}).filter(c => c.conf > 0.45).slice(0, 2).map(c => c.valor).join(' · ') || 'do seu texto';
  el.innerHTML = `<div class="card pad lote" aria-live="polite">
    <div class="lote-h">${icon('list', 'ic-sm')}<b>${L.concluido ? 'Lote concluído' : `Solicitação ${L.idx + 1} de ${L.pedidos.length}`}</b><small class="mono">${env} enviada(s)</small></div>
    <ol>${L.pedidos.map(p => `<li class="${p.status === 'atual' ? 'cur' : p.status === 'enviado' || p.status === 'pulado' ? 'done' : ''}">
      <span class="n">${st[p.status] || p.n}</span><span class="what" title="${esc(p.itens.map(i => i.nome).join(', '))}">${esc(nomeTipo(p))} — ${esc(rotuloPedido(p))}</span>
      <small class="muted">${{ enviado: 'enviada', pulado: 'pulada', atual: 'agora', pendente: 'na fila' }[p.status]}</small></li>`).join('')}</ol>
    ${L.pessoas?.length >= 2 ? `<p class="muted" style="margin:8px 0 0;font-size:12px">${esc((S.rules.mensagens?.lotePessoas || 'Há documentos de {n} pessoas: abri um pedido para cada uma, para não misturar os dados.').replace('{n}', L.pessoas.length))}</p>` : ''}
    ${L.fora?.length ? `<div class="note warn" id="lote-fora" style="margin-top:8px">${icon('alert')}<div style="flex:1;min-width:0"><b>${esc(S.rules.mensagens?.loteSemPessoa || 'Não sei de quem é este documento')}</b>
      ${L.fora.map((it, i) => `<div class="lote-fora-i" style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap"><span title="${esc(it.nome)}" style="flex:1;min-width:120px">${esc(it.nome)} <small class="muted">(${esc(it.analise?.documento?.nome || 'documento')})</small></span>
        <select class="input" data-fora="${i}" aria-label="Em qual pedido vai ${esc(it.nome)}"><option value="">Escolher o pedido…</option>${L.pedidos.map((p, k) => p.status === 'pendente' ? `<option value="${k}">${esc(nomeTipo(p))} — ${esc(rotuloPedido(p))}</option>` : '').join('')}<option value="x">Deixar de fora</option></select></div>`).join('')}</div></div>` : ''}
    ${L.concluido ? `<div class="actions"><button class="btn btn-sm" id="lote-ok">Fechar</button></div>`
      : L.pausado ? `<div class="note warn" style="margin-top:8px">${icon('alert')}<div>A solicitação ${L.idx + 1} foi fechada sem enviar.</div></div>
        <div class="actions"><button class="btn btn-primary btn-sm" id="lote-reabrir">Abrir de novo</button><button class="btn btn-sm" id="lote-pular">Pular</button><button class="btn btn-ghost btn-sm" id="lote-parar">Parar</button></div>`
      : atual ? `<p class="muted" style="margin:8px 0 0;font-size:12px">${L.navegando ? 'Abrindo e preenchendo…' : atual.resumo ? 'Preenchi tudo e abri o resumo: confira e clique em “Enviar ao escritório”. Quando o portal salvar, eu abro a próxima.' : `Confira os dados e clique em ${esc(tipoDef(atual.tipo)?.botaoEnviar || 'ADICIONAR')} no portal (ou em “Conferir e enviar”). Quando o portal salvar, eu abro a próxima.`}</p>
        <div class="actions"><button class="btn btn-sm" id="lote-pular" ${L.navegando ? 'disabled' : ''}>Pular esta</button><button class="btn btn-ghost btn-sm" id="lote-parar">Parar</button></div>` : ''}
  </div>`;
  el.querySelectorAll('[data-fora]').forEach(sel => sel.addEventListener('change', () => {
    const it = L.fora[+sel.dataset.fora]; if (!it || !sel.value) return;
    if (sel.value !== 'x') { const p = L.pedidos[+sel.value]; if (p && p.status === 'pendente') p.itens.push(it); }
    L.fora = L.fora.filter(x => x !== it); renderLote();
  }));
  $('#lote-ok')?.addEventListener('click', () => { S.lote = null; renderLote(); });
  $('#lote-parar')?.addEventListener('click', () => { S.lote = null; renderLote(); toast('Lote parado. O que já foi enviado continua no portal.'); });
  $('#lote-pular')?.addEventListener('click', pularPedido);
  $('#lote-reabrir')?.addEventListener('click', () => abrirPedido(S.lote.idx));
}

/** Texto para o cliente quando um arquivo não pôde ser lido (regras: mensagens.leitura*): o que fazer, sem culpa. */
export function msgLeitura(motivo, item) {
  const M = S.rules.mensagens || {};
  const m = { heic: M.leituraHeic, tiff: M.leituraTiff, senha: M.leituraPdfSenha, imagem: M.leituraImagem }[motivo];
  return m || (M.leituraFalhou || 'Não consegui ler “{arquivo}”. Escolha o pedido e eu anexo o arquivo assim mesmo.').replace('{arquivo}', item.nome);
}

/** De quem são os CPFs do documento: pergunta à aba do portal (só o nome volta; a lista com os CPFs não sai de lá).
 *  Guarda no arquivo { cpf: nome | null } e se a lista traz CPF. Lista sem CPF (campo a calibrar): nada muda. */
export const cpfsPerguntados = new Map();   // empresa|cpf → nome | null (só na memória desta aba)

export async function resolverCpfs(item) {
  const cpfs = item.analise?.cpfs || []; if (!cpfs.length || !S.port) return;
  const falta = cpfs.filter(c => !cpfsPerguntados.has(`${S.ctx.empresa}|${c}`));
  if (falta.length) {
    const r = await request({ type: 'empregadoPorCpf', cpfs: falta }, 9000);
    if (!r?.achados) return;
    for (const c of falta) cpfsPerguntados.set(`${S.ctx.empresa}|${c}`, r.achados.find(a => a.cpf === c)?.nome || null);
    cpfsPerguntados.set(`${S.ctx.empresa}|_listaTemCpf`, !!r.listaTemCpf);
  }
  item.cpfNomes = Object.fromEntries(cpfs.map(c => [c, cpfsPerguntados.get(`${S.ctx.empresa}|${c}`) ?? null]));
  item.cpfListaTemCpf = cpfsPerguntados.get(`${S.ctx.empresa}|_listaTemCpf`) === true;
}

/** Planilha de rubricas: nomes conferidos com a lista de funcionários da empresa (não achei, desligado, linha repetida). */
export async function conferirPlanilhaItem(item) {
  const R = item.rubricas; if (!R) return;
  const nomes = await empregadosDaEmpresa();
  R.conferencia = E.conferirPlanilha(R.linhas, nomes, desligadosEmpresa.get(S.ctx.empresa) || []);
}

export async function processItem(item, tipoAtual) {
  const onProgress = (p, etapa) => {
    item.progresso = p; item.etapa = etapa || item.etapa;
    const bar = document.querySelector(`[data-file="${item.id}"] .prog i`); if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    const st = document.querySelector(`[data-file="${item.id}"] small`); if (st) st.textContent = item.etapa;
  };
  const M = S.rules.mensagens || {};
  try {
    const r = await readFile(item.file, onProgress, { ocr: S.prefs.ocrAutomatico, ocrMaxPaginas: S.rules.config?.ocrMaxPaginas || 8 });
    item.texto = r.texto; item.metodo = r.metodo; item.tabela = r.tabela; item.confianca = r.confianca ?? null; item.rotacao = r.rotacao || 0;
    // só na memória: as palavras da foto com posição e confiança, e a imagem de onde saíram (recorte dos campos com dúvida)
    item.palavras = r.palavras || null; item.imagens = r.imagens || null; item.paginasTotal = r.paginas || 1;
    // PDF com vários documentos: cada trecho é lido pelo seu documento (o endereço só do comprovante)
    const partes = r.paginasTexto?.length > 1 ? E.separarDocumentos(r.paginasTexto, S.rules) : [];
    item.partes = partes.length > 1 ? partes : null;
    // planilha: só vira rubricas se o cabeçalho bater (formato longo ou largo, em qualquer aba)
    item.rubricas = r.tabela ? E.lerPlanilhaRubricas(r.abas || [{ nome: '', linhas: r.tabela }], S.rules, { nomeArquivo: item.nome }) : null;
    if (item.rubricas) await conferirPlanilhaItem(item);
    if (tipoAtual && !w(tipoAtual).empregados.length) await loadEmpregados(tipoAtual);
    const empregados = tipoAtual ? w(tipoAtual).empregados : [];
    item.analise = analisarItem(item, tipoAtual, empregados);
    if (item.analise.cpfs?.length) { await resolverCpfs(item); if (item.cpfNomes) item.analise = analisarItem(item, tipoAtual, empregados); }
    if (item.rubricas && (tipoAtual === 'rubricas' || !tipoAtual)) {
      item.analise.tipoSugerido = tipoAtual || 'rubricas';
      item.analise.documento = { id: 'planilha', nome: 'Planilha de lançamentos' };
    }
    item.documento = item.analise.documento?.id || null;
    item.documentos = item.analise.documentos || null;
    item.resumo = item.rubricas ? `${item.rubricas.linhas.length} lançamento(s)${item.rubricas.competencia ? ' · ' + item.rubricas.competencia : ''}` : E.summarizeDocument(item.analise, r.texto || '');
    const regraAso = (S.rules.documentos || []).find(d => d.id === 'aso');
    const textoAso = item.partes ? item.partes.find(p => p.documento === 'aso')?.texto : (item.documento === 'aso' ? r.texto : null);
    if (textoAso) item.aso = E.readASO(textoAso, regraAso);
    const tipoAlvo = tipoAtual || item.analise.tipoSugerido;
    if (S.prefs.usarIa && S.rules.config?.usarIaDoChromeQuandoDisponivel && tipoAlvo && r.texto && await aiAvailable()) {
      onProgress(0.95, 'Conferindo com a IA do Chrome');
      const t = tipoDef(tipoAlvo);
      const faltam = Object.fromEntries(Object.entries(t.campos).filter(([k, c]) => !item.analise.campos[k] && !c.sensivel && c.tipo !== 'textarea' && k !== 'assunto'));
      const extra = await aiExtract(r.texto, faltam);
      for (const [k, v] of Object.entries(extra)) item.analise.campos[k] = { valor: v, conf: 0.55, fonte: 'IA do Chrome (confira)' };
    }
    item.status = r.metodo === 'nao-suportado' ? 'nao-lido' : 'ok';
    const dificil = r.metodo === 'ocr' && item.confianca != null && item.confianca < 60;
    // páginas: "li N de M" quando o limite (15 páginas de texto, config.ocrMaxPaginas de OCR) deixou páginas de fora
    item.paginasLidas = r.paginasLidas ?? r.paginas ?? 1;
    item.avisoPaginas = r.paginas > 1 && item.paginasLidas < r.paginas ? (M.leituraPaginas || 'Li {lidas} de {total} páginas de “{arquivo}” (o limite é {limite}).').replace('{lidas}', item.paginasLidas).replace('{total}', r.paginas).replace('{arquivo}', item.nome).replace('{limite}', r.ocrCortado ? (S.rules.config?.ocrMaxPaginas || 8) : (r.limitePaginas || 15)) : null;
    item.etapa = r.metodo === 'nao-suportado' ? (r.motivo ? msgLeitura(r.motivo, item) : 'Formato não lido — será só anexado')
      : `${item.analise.documento?.nome || 'Documento'}${item.documentos?.length > 1 ? ` + ${item.documentos.length - 1} outro(s)` : ''} · ${r.metodo === 'ocr' ? (dificil ? 'leitura difícil, confira' : 'lido por OCR') : 'lido'}${item.rotacao ? ' (imagem girada)' : ''}${item.resumo ? ' · ' + item.resumo : ''}${item.avisoPaginas ? ` · li ${item.paginasLidas} de ${r.paginas} páginas` : ''}`;
    if (r.tabela && !item.rubricas && tipoAtual === 'rubricas') item.etapa = (M.planilhaSemCabecalho || 'Não achei o cabeçalho de rubricas (Empregado, Rubrica, Valor) em “{arquivo}”: ela vai só anexada.').replace('{arquivo}', item.nome);
  } catch (err) {
    console.error(err);
    item.status = 'erro'; item.falhou = true; item.etapa = msgLeitura(err?.motivo, item);
    item.analise = { documento: null, campos: {}, tipoSugerido: null };
  }
}

export function renderSugestao() {
  const el = $('#sugestao'); if (!el) return;
  const s = S.sugestao; if (!s) { el.innerHTML = ''; return; }
  if (s.texto) return renderSugestaoTexto(el, s);
  const it = s.item;
  if (it.status === 'lendo') {
    el.innerHTML = `<div class="card pad" data-file="${it.id}"><div style="display:flex;gap:10px;align-items:center"><div class="spin"></div><div style="flex:1;min-width:0"><b>${esc(it.nome)}</b><br><small class="muted">${esc(it.etapa)}</small><div class="prog"><i style="width:${Math.round(it.progresso * 100)}%"></i></div></div></div></div>`;
    return;
  }
  const a = it.analise || {};
  const falhou = it.status === 'erro' || it.status === 'nao-lido';   // não deu para ler: o cartão diz isso, em vez de "parece ser um documento"
  const tipo = falhou ? null : (s.tipo ?? a.tipoSugerido);
  const nCampos = Object.keys(a.campos || {}).length;
  if (falhou) {
    el.innerHTML = `<div class="card"><div class="card-h">${icon('alert')}<h3>Não consegui ler o arquivo</h3><button class="icon-btn" id="sug-x" aria-label="Descartar">${icon('x', 'ic-sm')}</button></div>
      <div class="card-b"><p style="margin:0 0 8px"><b>${esc(it.nome)}</b></p><p class="muted" id="sug-escolha" style="margin:0">${esc(it.etapa)}</p>
      ${(() => { const m = (S.rules.mensagens?.leituraFalhou || 'Não consegui ler “{arquivo}”. Escolha o pedido e eu anexo o arquivo assim mesmo.').replace('{arquivo}', it.nome); return m === it.etapa ? '' : `<p class="muted" style="margin:8px 0 0">${esc(m)}</p>`; })()}</div></div>`;
    $('#sug-x').addEventListener('click', () => { S.sugestao = null; renderSugestao(); });
    return;
  }
  el.innerHTML = `
    <div class="card">
      <div class="card-h">${icon('spark')}<h3>${tipo ? 'Encontrei o caminho' : 'Li o arquivo'}</h3><button class="icon-btn" id="sug-x" aria-label="Descartar">${icon('x', 'ic-sm')}</button></div>
      <div class="card-b">
        <p style="margin:0 0 8px">${esc(it.nome)} parece ser <b>${esc(a.documento?.nome || 'um documento')}</b>${tipo ? ` → <b>${esc(S.rules.tipos[tipo]?.nome)}</b>` : ''}.${s.extras?.length ? ` Os outros ${s.extras.length} arquivo(s) vão junto.` : ''}</p>
        ${nCampos ? `<p class="muted" style="margin:0 0 10px">${nCampos} informação(ões) encontradas: ${Object.keys(a.campos).map(k => tipoDef(tipo || 'geral')?.campos?.[k]?.rotulo).filter(Boolean).slice(0, 6).map(esc).join(', ')}${nCampos > 6 ? '…' : ''}</p>` : ''}
        ${tipo ? `<button class="btn btn-primary btn-block" id="sug-go">Abrir ${esc(S.rules.tipos[tipo]?.nome)} e preencher ${icon('arrow', 'ic-sm')}</button>` : `<p class="muted" id="sug-escolha">Não reconheci o tipo. Escolha abaixo o que você precisa fazer — ${s.extras?.length ? 'os arquivos vão' : 'o arquivo vai'} junto e eu leio de novo com a lista de funcionários.</p>`}
      </div>
    </div>`;
  $('#sug-x').addEventListener('click', () => { S.sugestao = null; renderSugestao(); });
  // os arquivos vão junto e são relidos com a lista de funcionários da solicitação (o tipo escolhido abaixo faz o mesmo: openTipo)
  $('#sug-go')?.addEventListener('click', () => abrirComArquivos(tipo, s));
}

/** Lista "rótulo: valor" do cartão, em que cada valor pode ser trocado (clique) ou descartado (x).
 *  Só aparecem campos com nome para o cliente (nunca o nome técnico). */
export function kvSugestao(s, nomeCampo) {
  const lista = Object.entries(camposComAjustes(s)).filter(([k]) => k !== 'observacoes' && k !== 'tabelaRubricas' && nomeCampo(k));
  if (!lista.length) return '';
  return `<dl class="kv kv-ed" style="margin-bottom:10px">${lista.map(([k, c]) => `<dt>${esc(nomeCampo(k))}</dt><dd>
    <button type="button" class="kv-v" data-ed="${esc(k)}" title="Clique para trocar">${esc(c.valor)}</button>${c.conf < 0.6 ? ' <small class="chip warn">confira</small>' : ''}${c.corrigido ? ' <small class="chip info">corrigido</small>' : ''}
    <button type="button" class="kv-x" data-tira="${esc(k)}" aria-label="Descartar ${esc(nomeCampo(k))}" title="Descartar">${icon('x', 'ic-sm')}</button></dd>`).join('')}</dl>`;
}

export function ligarKv(el, s, nomeCampo, defCampo, redesenhar) {
  el.querySelectorAll('[data-tira]').forEach(b => b.addEventListener('click', () => { s.ajustes = s.ajustes || {}; s.ajustes[b.dataset.tira] = null; redesenhar(); }));
  el.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.ed; const def = defCampo(k);
    const inp = document.createElement('input');
    inp.className = 'input kv-in'; inp.value = camposComAjustes(s)[k]?.valor || ''; inp.setAttribute('aria-label', nomeCampo(k));
    const opcoes = k === 'empregado' ? (s.empregados || []) : def?.seletores ? Object.keys(def.seletores) : (def?.opcoes || []);
    if (opcoes.length) { const dl = document.createElement('datalist'); dl.id = 'kv-dl'; dl.innerHTML = opcoes.map(o => `<option value="${esc(o)}">`).join(''); el.appendChild(dl); inp.setAttribute('list', 'kv-dl'); }
    b.replaceWith(inp); inp.focus(); inp.select();
    let feito = false;
    const ok = () => {
      if (feito) return; feito = true;
      let v = inp.value.trim();
      if (v && def?.tipo === 'data') { const d = E.parseDate(v) || E.findDates(v)[0]; if (!d) { toast('Não entendi essa data. Escreva como dd/mm/aaaa.'); redesenhar(); return; } v = E.fmtDate(d); }
      if (v && def?.tipo === 'numero') v = E.onlyDigits(v);
      s.ajustes = s.ajustes || {}; s.ajustes[k] = v ? { valor: v, conf: 1, fonte: 'você' } : null;
      if (k === 'empregado') { s.palpite = null; s.candidatos = null; }
      redesenhar();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } else if (e.key === 'Escape') { feito = true; redesenhar(); } });
    inp.addEventListener('blur', ok);
  }));
}

/** Funcionário que precisa de resposta: palpite ("Não achei Ronado. É RONALDO DE SOUZA?") ou homônimos ("Qual deles?"). */
export function perguntaEmpregado(s) {
  if (camposComAjustes(s).empregado) return '';
  if (s.candidatos?.length) return `<div class="cands" style="margin:0 0 10px"><small>Qual deles?</small>${s.candidatos.map(n => `<button type="button" class="btn btn-sm" data-quem="${esc(n)}">${esc(n)}</button>`).join('')}</div>`;
  if (s.palpite) return `<div class="note" style="margin:0 0 10px">${icon('info')}<div>Não achei “${esc(s.palpite.trecho)}” na lista. É <b>${esc(s.palpite.nome)}</b>?
    <div class="actions" style="margin-top:6px"><button type="button" class="btn btn-sm btn-primary" data-quem="${esc(s.palpite.nome)}">Sim, é essa pessoa</button><button type="button" class="btn btn-sm btn-ghost" id="sug-nao-e">Não</button></div></div></div>`;
  return '';
}

export function ligarPerguntaEmpregado(el, s, redesenhar) {
  el.querySelectorAll('[data-quem]').forEach(b => b.addEventListener('click', () => { s.ajustes = s.ajustes || {}; s.ajustes.empregado = { valor: b.dataset.quem, conf: 1, fonte: 'você' }; s.palpite = null; s.candidatos = null; redesenhar(); }));
  el.querySelector('#sug-nao-e')?.addEventListener('click', () => { s.palpite = null; redesenhar(); });
}

/** Variáveis da folha entendidas no texto: uma linha por funcionário (vão na descrição como itens, não como o texto). */
export function linhasHtml(s) {
  if (!s.linhas?.length) return '';
  const v = (l) => l.unidade === 'R$' ? l.valor : `${l.valor} ${l.unidade || ''}`;
  return `<table class="tbl-linhas"><thead><tr><th>Funcionário</th><th>Rubrica</th><th>Valor</th></tr></thead><tbody>${s.linhas.map(l => `<tr><td>${esc(l.empregado || 'a confirmar')}</td><td>${esc(l.rubrica)}</td><td class="mono">${esc(v(l))}</td></tr>`).join('')}</tbody></table>
    <p class="muted" style="margin:4px 0 10px;font-size:12px">Essas linhas vão na descrição para o escritório lançar. Confira os nomes das rubricas.</p>`;
}

export function renderSugestaoTexto(el, s) {
  const redesenhar = () => renderSugestaoTexto(el, s);
  const fechar = () => { S.sugestao = null; el.innerHTML = ''; renderSugestao(); };
  const aviso = (tipo) => s.tipoAberto && s.tipoAberto !== tipo ? `<p class="muted" style="margin:10px 0 0;font-size:12px">A solicitação de ${esc(S.rules.tipos[s.tipoAberto]?.nome)} que está aberta será fechada no portal sem enviar. O que eu já tinha preenchido continua guardado aqui.</p>` : '';
  // pergunta: as dúvidas primeiro
  if (s.pergunta) {
    el.innerHTML = `<div class="card">
      <div class="card-h">${icon('info')}<h3>Encontrei nas dúvidas</h3><button class="icon-btn" id="sug-x" aria-label="Descartar">${icon('x', 'ic-sm')}</button></div>
      <div class="card-b">${s.faqs.map((f, i) => `<details class="faq-i"${i === 0 ? ' open' : ''}><summary>${esc(f.pergunta)}</summary><p>${esc(f.resposta)}</p></details>`).join('')}
        <div class="actions" style="margin-top:10px"><button class="btn" id="sug-mesmo">Abrir o pedido mesmo assim ${icon('arrow', 'ic-sm')}</button></div></div></div>`;
    $('#sug-x').addEventListener('click', fechar);
    $('#sug-mesmo').addEventListener('click', () => { S.sugestao = null; el.innerHTML = ''; entenderTexto(s.texto, { mesmoAssim: true }); });
    return;
  }
  // vários pedidos: confere a lista e abre um de cada vez (o lote de sempre)
  if (s.pedidos) {
    const nome = (p) => (k) => tipoDef(p.tipo)?.campos?.[k]?.rotulo || null;
    el.innerHTML = `<div class="card">
      <div class="card-h">${icon('list')}<h3>Entendi ${s.pedidos.length} pedidos</h3><button class="icon-btn" id="sug-x" aria-label="Descartar">${icon('x', 'ic-sm')}</button></div>
      <div class="card-b"><ol class="ped-lista">${s.pedidos.map((p, i) => `<li><div class="ped-h"><b>${esc(S.rules.tipos[p.tipo]?.nome || p.tipo)}</b><button type="button" class="icon-btn" data-tira-ped="${i}" aria-label="Tirar o pedido ${i + 1}">${icon('x', 'ic-sm')}</button></div>
        ${Object.entries(p.campos).filter(([k]) => nome(p)(k)).length ? `<dl class="kv">${Object.entries(p.campos).filter(([k]) => nome(p)(k)).map(([k, c]) => `<dt>${esc(nome(p)(k))}</dt><dd>${esc(c.valor)}${c.conf < 0.6 ? ' <small class="chip warn">confira</small>' : ''}</dd>`).join('')}</dl>` : '<small class="muted">Sem dados no texto: você completa no pedido.</small>'}</li>`).join('')}</ol>
        <p class="muted" style="margin:8px 0 10px;font-size:12.5px">Abro um de cada vez: você confere e envia cada um pelo portal; quando o portal salvar, eu abro o próximo.</p>
        <div class="actions"><button class="btn btn-primary" id="sug-lote">Abrir um de cada vez ${icon('arrow', 'ic-sm')}</button></div>${aviso(s.pedidos[0].tipo)}</div></div>`;
    $('#sug-x').addEventListener('click', fechar);
    el.querySelectorAll('[data-tira-ped]').forEach(b => b.addEventListener('click', () => {
      s.pedidos.splice(+b.dataset.tiraPed, 1);
      if (s.pedidos.length < 2) { const p = s.pedidos[0]; Object.assign(s, { pedidos: null, ajustes: {}, analise: { tipoSugerido: p?.tipo || 'geral', campos: p?.campos || {}, documento: { nome: 'seu pedido' } } }); s.texto = p?.texto || s.texto; }
      redesenhar();
    }));
    $('#sug-lote').addEventListener('click', () => { const peds = s.pedidos.map(p => ({ tipo: p.tipo, itens: [], campos: p.campos })); fechar(); iniciarLote(peds, []); });
    return;
  }
  const a = s.analise; const tipo = a.tipoSugerido; const t = tipoDef(tipo);
  if (s.escolha) {
    const nomeCampo = (k) => s.escolha.tipos.map(x => tipoDef(x)?.campos?.[k]?.rotulo).find(Boolean) || null;
    const defCampo = (k) => s.escolha.tipos.map(x => tipoDef(x)?.campos?.[k]).find(Boolean) || null;
    const amb = s.escolha.ambos;
    el.innerHTML = `<div class="card">
      <div class="card-h">${icon('spark')}<h3>${esc(s.escolha.titulo || 'Qual pedido?')}</h3><button class="icon-btn" id="sug-x" aria-label="Descartar">${icon('x', 'ic-sm')}</button></div>
      <div class="card-b">
        ${kvSugestao(s, nomeCampo)}${perguntaEmpregado(s)}${linhasHtml(s)}${dicasHtml(s)}
        ${s.avisoNoPortal ? `<p class="muted aviso-portal" style="margin:0 0 8px;font-size:12.5px">${icon('info', 'ic-sm')} O aviso de ${esc(nomeCurto(s.avisoNoPortal.empregado))}${s.avisoNoPortal.numero ? ` (nº ${esc(s.avisoNoPortal.numero)})` : ''} já está no portal: destaquei o cálculo, que leva os dados do aviso.</p>` : ''}
        <p style="margin:0 0 8px">${esc(s.escolha.pergunta || 'Qual solicitação você quer abrir?')}</p>
        <div class="escolha">${s.escolha.tipos.map(x => `<button type="button" class="opc${x === s.sugerido ? ' sug' : ''}" data-escolha="${esc(x)}">
          <b>${esc(s.escolha.rotulos?.[x] || S.rules.tipos[x]?.nome)}${x === s.tipoAberto ? ' <small class="chip">aberta</small>' : ''}</b><small>${esc(s.escolha.ajuda?.[x] || '')}</small></button>`).join('')}
          ${amb ? `<button type="button" class="opc" data-ambos="1"><b>${esc(amb.rotulo || 'Os dois')}</b><small>${esc(amb.ajuda || '')}</small></button>` : ''}</div>
        ${s.tipoAberto && !s.escolha.tipos.includes(s.tipoAberto) ? aviso(null) : ''}
      </div></div>`;
    $('#sug-x').addEventListener('click', fechar);
    el.querySelectorAll('[data-escolha]').forEach(b => b.addEventListener('click', () => abrirDoTexto(el, s, b.dataset.escolha)));
    el.querySelector('[data-ambos]')?.addEventListener('click', () => {
      // aviso agora e cálculo em seguida: o lote abre um, o cliente envia, e abre o outro com os mesmos dados
      const peds = s.escolha.tipos.map(x => ({ tipo: x, itens: [], campos: comAjustes(E.parseFreeText(s.texto, S.rules, { employees: s.empregados || [], tipoAtual: x }).campos, s.ajustes) }));
      fechar(); iniciarLote(peds, []);
    });
    ligarKv(el, s, nomeCampo, defCampo, redesenhar); ligarPerguntaEmpregado(el, s, redesenhar);
    return;
  }
  const nomeCampo = (k) => t?.campos?.[k]?.rotulo || null;
  const tem = !!kvSugestao(s, nomeCampo) || !!s.linhas?.length;
  el.innerHTML = `<div class="card">
    <div class="card-h">${icon('spark')}<h3>Entendi assim</h3><button class="icon-btn" id="sug-x" aria-label="Descartar">${icon('x', 'ic-sm')}</button></div>
    <div class="card-b">
      <p style="margin:0 0 8px">Solicitação: <b>${esc(t?.nome || 'Solicitação Geral')}</b></p>
      ${tem ? `${kvSugestao(s, nomeCampo)}${linhasHtml(s)}<p class="muted" style="margin:-4px 0 10px;font-size:11.5px">Clique num valor para trocar, ou no x para descartar.</p>` : '<p class="muted" style="margin:0 0 10px">Não encontrei dados para preencher no texto. Abra a solicitação e complete os campos.</p>'}
      ${t?.campos?.empregado ? perguntaEmpregado(s) : ''}${dicasHtml(s)}
      ${aviso(tipo).replace('margin:10px 0 0', 'margin:0 0 10px')}
      <div class="actions"><button class="btn btn-primary" id="sug-go">${s.tipoAberto === tipo ? 'Preencher em' : 'Abrir'} ${esc(t?.nome || 'Solicitação Geral')} ${icon('arrow', 'ic-sm')}</button>
        ${s.tipoAberto && s.tipoAberto !== tipo ? `<button class="btn" id="sug-aqui">Usar em ${esc(S.rules.tipos[s.tipoAberto]?.nome)}</button>` : ''}</div>
      <details class="more" style="margin-top:8px"><summary>Não é isso? Escolher outra solicitação</summary>
        <div class="tool-tabs" style="margin-top:8px">${(S.rules.intencoes || []).map(i => `<button type="button" data-alt="${esc(i.tipo)}">${esc(i.titulo)}</button>`).join('')}</div></details>
    </div></div>`;
  const abrir = (destino) => abrirDoTexto(el, s, destino);
  $('#sug-x').addEventListener('click', fechar);
  $('#sug-go').addEventListener('click', () => abrir(tipo));
  $('#sug-aqui')?.addEventListener('click', () => abrir(s.tipoAberto));
  el.querySelectorAll('[data-alt]').forEach(b => b.addEventListener('click', () => abrir(b.dataset.alt)));
  ligarKv(el, s, nomeCampo, (k) => t?.campos?.[k] || null, redesenhar); ligarPerguntaEmpregado(el, s, redesenhar);
}

export const comAjustes = (campos, ajustes) => camposComAjustes({ analise: { campos }, ajustes });

/** Dicas do texto livre que pedem atenção (ex.: acordo, que não tem motivo na lista do portal). */
export const dicasHtml = (s) => (s.dicas || []).map(d => `<div class="note warn" style="margin:0 0 10px">${icon('alert')}<div>${esc(d)}</div></div>`).join('');

export async function abrirDoTexto(el, s, destino) {
  if (!(await empresaDoPedido(destino))) return;     // desistiu da empresa: o texto entendido continua na tela
  S.sugestao = null; el.innerHTML = '';
  comecarDoZeroSeAbandonado(destino);
  await openTipo(destino, { manter: true, semEmpresa: true });
  for (let k = 0; k < 40 && !(S.ctx.route?.mode === 'form' && S.ctx.tipo === destino); k++) await esperar(200);
  await loadEmpregados(destino);
  const r = E.parseFreeText(s.texto, S.rules, { employees: w(destino).empregados, tipoAtual: destino });
  // o que o cliente trocou, descartou ou corrigiu no cartão vale mais que a leitura do texto
  const campos = comAjustes(r.campos, s.ajustes);
  anotarCandidatos(destino, s.texto, campos);
  // cálculo de um aviso que já está no portal: os dados do aviso entram como sugestão (o texto vale mais)
  if (s.avisoNoPortal && PAR_AVISO[destino] === s.avisoNoPortal.tipo) { const vv = E.valoresDoAviso(s.avisoNoPortal, S.rules); aplicarSugestoes(destino, vv.valores, vv.fonte); w(destino).avisoUsado = true; }
  // variáveis da folha entendidas no texto: as linhas também podem ir para a grade do portal
  if (destino === 'rubricas' && (s.linhas || r.linhas)?.length) { w(destino).linhasRubricas = s.linhas || r.linhas; w(destino).grade = null; }
  aplicarCampos(destino, campos, 'sua descrição');
}

/* P1 — precisão acima de tudo: valor lido de documento abaixo do limiar das regras (config.leitor.confiancaMinimaPortal)
   é só sugestão: não vai ao portal, não entra no assunto/descrição nem conta como preenchido até o cliente tocar em "Usar". */
export const ehSugestao = (v) => !!(v && v.origem && !v.confirmado && v.valor != null && v.valor !== '' && (v.conf ?? 1) < E.limiarPortal(S.rules));

/** Lê o texto de um arquivo com o tipo e os funcionários (e a qualidade do OCR: leitura fraca vira sugestão). */
export function analisarItem(item, tipo, empregados = []) {
  const ctx = { employees: empregados, tipoAtual: tipo, metodo: item.metodo, confiancaOcr: item.confianca, cpfNomes: item.cpfNomes, cpfListaTemCpf: item.cpfListaTemCpf };
  const a = item.partes?.length > 1 ? E.analisarPartes(item.partes, S.rules, ctx) : E.analyzeText(item.texto || item.nome || '', S.rules, ctx);
  // foto: confiança das palavras de onde cada valor saiu (valor mal lido vira sugestão); nunca para dados de saúde
  const alvo = tipo || a.tipoSugerido;
  if (item.palavras?.length && alvo) { E.aplicarLeituraDasPalavras(a.campos, item.palavras, tipoDef(alvo), S.rules); a.pessoa = E.pessoaDaAnalise({ campos: a.campos, paciente: a.paciente }); }
  return a;
}

/** Usar uma sugestão do documento: vira valor confirmado (vai ao portal e entra no texto). */
export async function usarSugestao(tipo, k) {
  const W = w(tipo); const v = W.valores[k]; if (!v?.valor) return;
  W.valores[k] = { ...v, conf: Math.max(v.conf ?? 0, 0.9), confirmado: true };
  if (S.modo === 'plataforma' && !campoDef(tipo, k)?.somenteAssistente) (W.fonteVerdade || (W.fonteVerdade = {}))[k] = 'plataforma';
  gerarTextos(tipo);
  if (S.view === 'preencher') { renderFieldsOnly(); updateChecks(); }
  if (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) {
    if (campoDef(tipo, k)?.somenteAssistente) atualizarTextoNoPortal(tipo);
    else await fillPortal(tipo, { so: [k], daPlataforma: S.modo === 'plataforma' });
  }
}

/** Linha "Li no documento: … [Usar]" de um campo com sugestão (formato inválido: só o aviso, sem Usar). */
export function htmlSugestao(k, v) {
  const M = S.rules.mensagens || {};
  if (v.confira === 'formato') return `<div class="sug-doc"><small>Li no documento “${esc(v.valor)}”, mas não parece válido — confira e escreva no campo.</small></div>`;
  return `<div class="sug-doc"><small title="${esc(v.fonte || '')}">${esc(M.sugestaoLeitura || 'Li no documento, mas com dúvida — confira e toque em Usar.')} <b>${esc(v.valor)}</b></small><button type="button" class="btn btn-sm" data-usar-k="${esc(k)}">Usar</button></div>`;
}

/* Documentos neutros (servem a vários pedidos) e famílias de pedidos compatíveis */
export const FAMILIAS = [['avisoFerias', 'calculoFerias'], ['avisoRescisao', 'calculoRescisao'], ['cadastroEmpregado', 'cadastroEstagiario', 'cadastroContribuinte']];

export function docDeOutroTipo(item, tipo) {
  const doc = item.analise?.documento; const dt = doc?.tipoSolicitacao;
  if (!dt || dt === tipo || E.docsNeutros(S.rules).includes(doc.id)) return null;
  if (FAMILIAS.some(f => f.includes(dt) && f.includes(tipo))) return null;
  return dt;
}

/* Junta o que foi lido com o que já está no assistente e preenche */
export function applyAnalysis(tipo, item, opts = {}) {
  if (item.removido) return;   // o cliente tirou o arquivo da lista enquanto a leitura corria
  const W = w(tipo); const t = tipoDef(tipo);
  item.outroTipo = docDeOutroTipo(item, tipo);
  // P5 — um documento, uma pessoa: documento de outra pessoa (nome/CPF diferente) não se mistura neste pedido
  item.outraPessoa = item.outroTipo ? null : outraPessoaNoPedido(W, item);
  const campos = item.outroTipo || item.outraPessoa ? {} : (item.analise?.campos || {});
  for (const [k, c] of Object.entries(campos)) {
    if (!t.campos[k] || W.editados.has(k)) continue;
    const cur = W.valores[k];
    // cada valor guarda o arquivo de onde veio (origem); o que já foi confirmado pelo cliente não é trocado por uma leitura
    if (!cur || (!cur.confirmado && (cur.conf ?? 0) <= c.conf)) W.valores[k] = { valor: c.valor, conf: c.conf, fonte: c.fonte, origem: item.id, origemNome: item.nome, ...(c.confira ? { confira: c.confira } : {}), ...(c.leitura ? { leitura: c.leitura } : {}) };
  }
  // nome lido no documento e homônimos (o cliente escolhe)
  if (!item.outroTipo && !item.outraPessoa && t.campos.empregado) {
    if (item.analise?.paciente) W.pacienteLido = item.analise.paciente;
    if (item.analise?.candidatos?.length && !W.valores.empregado?.valor) W.candidatos = item.analise.candidatos;
  }
  // empregado com a lista do portal
  if (t.campos.empregado && W.valores.empregado && W.empregados.length) {
    const m = E.bestMatch(W.valores.empregado.valor, W.empregados, 0.7);
    if (m) W.valores.empregado.valor = m.option; else W.valores.empregado.conf = 0.3;
  }
  ajustarDepartamento(tipo);
  // tabela de rubricas: o texto da descrição e as linhas para a grade do portal (todas as planilhas do pedido)
  if (item.rubricas && tipo === 'rubricas') aplicarPlanilhaRubricas(W);
  // sugere outro tipo
  gerarTextos(tipo);
  if (S.view === 'preencher') render();
  if (opts.preencher !== false && S.prefs.preencherAoLer && !item.outroTipo && !item.outraPessoa && S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo && item.status !== 'lendo') fillPortal(tipo, { silencioso: true });
}

/** A pessoa deste documento é outra que a do pedido (lida de outro arquivo ou escrita pelo cliente)? Devolve o nome dela, ou null. */
export function outraPessoaNoPedido(W, item) {
  const p = item.analise?.pessoa; if (!p) return null;
  const doPedido = E.pessoaDaAnalise({ campos: Object.fromEntries(Object.entries(W.valores).filter(([, v]) => v?.origem !== item.id && !ehSugestao(v)).map(([k, v]) => [k, { ...v, conf: v.conf ?? 1 }])) });
  return E.mesmaPessoa(doPedido, p) === false ? (p.nome || E.fmtCPF(p.cpf)) : null;
}

/** "Usar este no lugar": tira os valores lidos dos outros arquivos e usa os deste (o que o cliente escreveu fica). */
export function usarDocumentoNoLugar(tipo, item) {
  const W = w(tipo);
  for (const [k, v] of Object.entries(W.valores)) if (v?.origem && v.origem !== item.id && !W.editados.has(k)) delete W.valores[k];
  for (const a of W.arquivos) if (a !== item && a.analise?.pessoa && E.mesmaPessoa(a.analise.pessoa, item.analise?.pessoa) === false) a.removido = true;
  item.outraPessoa = null;
  applyAnalysis(tipo, item);
}

/** Planilhas de rubricas do pedido (qualquer formato): o resumo e os totais na descrição, as linhas para a grade (com o nome
 *  que a lista de funcionários usa), a competência e o tipo de lançamento lidos do título, da aba ou do nome do arquivo. */
export function aplicarPlanilhaRubricas(W) {
  const lidas = W.arquivos.filter(a => a.rubricas && !a.removido).map(a => a.rubricas);
  const linhas = lidas.flatMap(R => R.linhas.map(l => ({ ...l, empregado: R.conferencia?.nomes?.[l.empregado] || l.empregado })));
  W.valores.tabelaRubricas = { valor: linhas.map(l => `• ${l.empregado} — ${l.rubrica}: ${l.valor}`).join('\n'), conf: 0.9, fonte: lidas.map(R => R.aba).filter(Boolean).join(', ') || 'planilha' };
  W.valores.totaisRubricas = { valor: E.textoTotaisRubricas(E.totaisRubricas(linhas)), conf: 0.9, fonte: 'planilha' };
  W.linhasRubricas = linhas; W.grade = null;
  const R0 = lidas[0];
  if (R0?.competencia && !W.editados.has('competencia') && !W.valores.competencia?.confirmado && !W.valores.competencia?.valor) W.valores.competencia = { valor: R0.competencia, conf: 0.7, fonte: 'título, aba ou nome da planilha' };
  if (R0?.tipoLancamento && !W.editados.has('tipoLancamento') && !W.valores.tipoLancamento?.valor) W.valores.tipoLancamento = { valor: R0.tipoLancamento, conf: 0.65, fonte: 'título, aba ou nome da planilha' };
}
