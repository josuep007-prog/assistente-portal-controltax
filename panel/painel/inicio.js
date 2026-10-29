/* Painel — Início e leitura de arquivos. (parte de panel/panel.js, dividido na 2.16.4; mapa em docs/arquitetura.md). */
import * as E from '../engine.js';
import { $, P, S, esc, icon, progresso, request, standalone, toast, viewEl } from './base.js';
import { FAMILIAS, analisarItem, applyAnalysis, esperar, handleVarios, processItem, renderLote, renderSugestao, renderSugestaoTexto } from './lote.js';
import { PAR_AVISO, fillPortal } from './formulario.js';
import { comecarDoZeroSeAbandonado, renderAvisosInicio, renderExperiencia, renderFaq, renderRepetir } from './facilidades.js';
import { empregadosDaEmpresa, empregadosPara, loadEmpregados, render, setView, tipoDef, w } from './modo.js';
import { gerarTextos } from './valores.js';
import { renderFilesOnly } from './preencher.js';
import { renderModelosInicio } from './portal.js';
import { savePrefs } from './conexao.js';

export const ICONS = { 'user-plus': 'user-plus', graduation: 'graduation', briefcase: 'briefcase', sun: 'sun', calc: 'calc', medical: 'medical', door: 'door', list: 'list', chat: 'chat' };

export function renderInicio() {
  const R = S.rules;
  const links = (R.escritorio?.links || []).filter(l => l.url);
  viewEl.innerHTML = `
    ${!S.prefs.introVista ? `
    <div class="intro card" id="intro">
      <div class="intro-h"><b>Como o Assistente ajuda</b><button class="icon-btn" id="intro-x" aria-label="Fechar a introdução">${icon('x', 'ic-sm')}</button></div>
      <ol class="intro-steps">
        <li><span class="n">1</span><div><b>Diga o que precisa</b><small>Escolha abaixo, escreva com suas palavras ou arraste um documento.</small></div></li>
        <li><span class="n">2</span><div><b>Eu preencho o portal</b><small>Leio atestados, fichas e cartas, abro a solicitação certa e anexo o arquivo.</small></div></li>
        <li><span class="n">3</span><div><b>Você confere e envia</b><small>Antes do envio, mostro o que falta e os prazos que importam.</small></div></li>
      </ol>
      <button class="btn btn-primary btn-sm" id="intro-ok">Entendi</button>
    </div>` : ''}
    <div id="avisos-esc"></div>
    <div>
      <p class="hello">O que você precisa fazer?</p>
      <p class="lead">${esc(R.escritorio?.saudacao || '')}</p>
    </div>
    <div id="lote"></div>
    <div id="proximo"></div>
    <div id="experiencia"></div>
    <div id="ctx-banner"></div>
    <div class="free card">
      <label for="free-txt" class="free-l">${icon('chat', 'ic-sm')} Escreva com suas palavras</label>
      <textarea id="free-txt" rows="2" placeholder="Ex.: o João vai sair de férias dia 10/11 por 20 dias"></textarea>
      <div class="free-a"><small class="muted">Eu entendo o pedido e abro a solicitação certa.</small><button class="btn btn-primary btn-sm" id="free-go">Continuar ${icon('arrow', 'ic-sm')}</button></div>
    </div>
    <div id="sugestao"></div>
    <div class="search">${icon('search')}<input id="q" type="search" placeholder="Ou procure: atestado, férias, uma dúvida…" aria-label="Buscar o que você precisa ou uma dúvida"></div>
    <div id="faq"></div>
    <div class="intents" id="intents"></div>
    <div id="repetir"></div>
    <div id="modelos-ini"></div>
    <h2 class="sec">Comece por um documento</h2>
    <div class="drop" id="drop-main" role="button" tabindex="0">
      ${icon('upload', 'ic-lg')}
      <b>Arraste um arquivo, clique para escolher ou cole um print (Ctrl+V)</b>
      <small>Atestado, pedido de demissão, ficha de admissão, CAT, planilha de horas… Eu descubro qual solicitação abrir e preencho.</small>
    </div>
    ${links.length ? `<h2 class="sec">Aprenda a usar</h2><div class="list">${links.map(l => `<a class="li" href="${esc(l.url)}" target="_blank" rel="noopener">${icon('external')}<div class="main"><b>${esc(l.rotulo)}</b></div></a>`).join('')}</div>` : ''}
  `;
  const draw = (list) => {
    $('#intents').innerHTML = list.map(it => `
      <button class="intent" type="button" data-tipo="${esc(it.tipo)}">
        <span class="ico">${icon(ICONS[it.icone] || 'file')}</span>
        <b>${esc(it.titulo)}</b><span>${esc(it.subtitulo || '')}</span>
      </button>`).join('') || `<p class="muted">Nada encontrado. Tente outra palavra ou use “Outro assunto”.</p>`;
    $('#intents').querySelectorAll('.intent').forEach(b => b.addEventListener('click', () => openTipo(b.dataset.tipo)));
  };
  draw(R.intencoes || []);
  $('#q').addEventListener('input', (e) => { draw(E.searchIntents(e.target.value, R)); renderFaq(e.target.value); });
  const closeIntro = () => { S.prefs.introVista = true; savePrefs(); $('#intro')?.remove(); };
  $('#intro-x')?.addEventListener('click', closeIntro); $('#intro-ok')?.addEventListener('click', closeIntro);
  const go = () => { const t = $('#free-txt').value.trim(); if (t) entenderTexto(t); };
  $('#free-go').addEventListener('click', go);
  $('#free-txt').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
  bindDrop($('#drop-main'));
  renderContextBanner();
  renderSugestao();
  renderModelosInicio();
  renderLote(); P?.renderProximo($('#proximo'));
  renderAvisosInicio(); renderExperiencia(); renderRepetir();
}

/* ---------- Texto livre ---------- */
/* Texto livre: o pedido é entendido pelo que foi escrito, não pela solicitação que está aberta.
   Só preenche a solicitação aberta quando o texto é sobre ela (ou o cliente escolhe isso). */
export const mesmaFamilia = (a, b) => a === b || FAMILIAS.some(f => f.includes(a) && f.includes(b));

/* Cartões de escolha (aviso ou cálculo, com ou sem atestado, empate) vêm das regras: config.textoLivre.escolhas (E.escolhaPara). */
/** Mostra o cartão do texto livre ou do documento lido. Na plataforma ele fica no Novo pedido (onde estão a escolha do
 *  tipo, o texto livre e o documento): com um formulário aberto, volta para a escolha; no painel encaixado, no Início. */
export function mostrarSugestao() {
  if (S.modo === 'plataforma' && S.plat) {
    if (S.ctx.route?.mode === 'form') S.plat.escolher = true;
    if (S.view !== 'preencher' || !$('#sugestao')) setView('preencher'); else renderSugestao();
    return;
  }
  if (S.view !== 'inicio') setView('inicio'); else renderSugestao();
}

/** Campos do cartão com o que o cliente trocou ou descartou nele (ajustes: valor novo ou null). */
export function camposComAjustes(s) {
  const c = { ...(s.analise?.campos || {}) };
  for (const [k, v] of Object.entries(s.ajustes || {})) { if (v == null) delete c[k]; else c[k] = v; }
  return c;
}

export async function entenderTexto(texto, { origem = 'inicio', mesmoAssim = false } = {}) {
  const tipoAberto = S.ctx.route?.mode === 'form' ? S.ctx.tipo : null;
  const sug = E.suggestTipoByText(texto, S.rules, null);
  const detectado = sug?.tipo || null;
  // cartão "Entendi assim" ainda aberto e um texto sem pedido novo ("não, é dia 12"): corrige o cartão
  const s0 = S.sugestao;
  if (origem === 'inicio' && s0?.texto && s0.analise && !s0.pergunta && !s0.pedidos && (!detectado || mesmaFamilia(detectado, s0.analise.tipoSugerido)) && !E.ehPergunta(texto, S.rules)) {
    const base = s0.analise.tipoSugerido;
    const r = E.parseFreeText(texto, S.rules, { employees: await empregadosPara(base), tipoAtual: base });
    const novos = Object.entries(r.campos).filter(([k, c]) => c.conf > 0.45 || !camposComAjustes(s0)[k]);
    if (novos.length || r.palpite) {
      s0.ajustes = s0.ajustes || {};
      for (const [k, c] of novos) s0.ajustes[k] = { ...c, corrigido: !!camposComAjustes(s0)[k] };
      if (r.palpite && !camposComAjustes(s0).empregado) s0.palpite = r.palpite;
      if (r.linhas?.length) s0.linhas = r.linhas;
      mostrarSugestao();
      return;
    }
  }
  // pergunta ("posso mandar foto do atestado?"): primeiro as dúvidas, com "Abrir o pedido mesmo assim"
  if (origem === 'inicio' && !mesmoAssim && E.ehPergunta(texto, S.rules)) {
    const faqs = E.buscarFaq(texto, S.rules, 3);
    if (faqs.length) { S.sugestao = { texto, pergunta: true, faqs }; mostrarSugestao(); return; }
  }
  // vários pedidos numa frase: "Entendi N pedidos" e o lote abre um de cada vez
  if (origem === 'inicio') {
    // a lista da empresa inteira: a da solicitação aberta pode não ter todos (cada tela tem a sua)
    const empregados = [...new Set([...(await empregadosDaEmpresa()), ...(detectado ? w(detectado).empregados : [])])];
    const partes = E.dividirPedidos(texto, S.rules, { employees: empregados });
    if (partes.length >= 2) { S.sugestao = { texto, tipoAberto, pedidos: partes }; mostrarSugestao(); return; }
  }
  const escolha = origem === 'inicio' && E.escolhaPara(texto, S.rules, sug);
  if (escolha) {
    let sugerido = E.destaqueEscolha(texto, escolha);
    let base = sugerido || escolha.tipos[0];
    const empregados = await empregadosPara(base);
    let r = E.parseFreeText(texto, S.rules, { employees: empregados, tipoAtual: base });
    // o aviso desse funcionário já está no portal: o cartão destaca o Cálculo
    const tAviso = escolha.tipos.find(x => Object.values(PAR_AVISO).includes(x)), tCalc = escolha.tipos.find(x => PAR_AVISO[x]);
    const avisoNoPortal = tAviso && tCalc && r.campos.empregado ? E.avisoDoFuncionario(S.plat?.sol?.itens, r.campos.empregado.valor, tAviso) : null;
    if (avisoNoPortal && sugerido !== tCalc) { sugerido = tCalc; base = tCalc; r = E.parseFreeText(texto, S.rules, { employees: empregados, tipoAtual: base }); }
    S.sugestao = { texto, tipoAberto, escolha, sugerido, empregados, avisoNoPortal, dicas: r.dicas, palpite: r.palpite, candidatos: r.candidatos, linhas: r.linhas, ajustes: {}, analise: { tipoSugerido: base, campos: r.campos, documento: { nome: 'seu pedido' } } };
    mostrarSugestao();
    return;
  }
  // texto sobre a própria solicitação aberta (ou sem tipo claro, escrito dentro dela) → preenche ali
  if (tipoAberto && ((detectado && mesmaFamilia(detectado, tipoAberto)) || (!detectado && origem === 'preencher'))) {
    comecarDoZeroSeAbandonado(tipoAberto);
    await loadEmpregados(tipoAberto);
    const r = E.parseFreeText(texto, S.rules, { employees: w(tipoAberto).empregados, tipoAtual: tipoAberto });
    anotarCandidatos(tipoAberto, texto, r.campos);
    if (tipoAberto === 'rubricas' && r.linhas?.length) { w(tipoAberto).linhasRubricas = r.linhas; w(tipoAberto).grade = null; }
    $('#free-sug') && ($('#free-sug').innerHTML = '');
    aplicarCampos(tipoAberto, r.campos, 'sua descrição');
    if (r.dicas?.length) toast(r.dicas.join(' '));
    return;
  }
  const destino = detectado || tipoAberto || 'geral';  // sem tipo claro: propõe a aberta, mas só preenche se o cliente confirmar
  const empregados = await empregadosPara(destino);
  const r = E.parseFreeText(texto, S.rules, { employees: empregados, tipoAtual: destino });
  S.sugestao = { texto, tipoAberto, empregados, dicas: r.dicas, palpite: r.palpite, candidatos: r.candidatos, linhas: r.linhas, ajustes: {}, analise: { tipoSugerido: destino, campos: r.campos, documento: { nome: 'seu pedido' } } };
  if (origem === 'preencher' && $('#free-sug')) renderSugestaoTexto($('#free-sug'), S.sugestao);
  else mostrarSugestao();
}

/** Primeiro nome que serve para mais de um funcionário: guarda as opções para o cliente escolher. */
export function anotarCandidatos(tipo, texto, campos) {
  const W = w(tipo);
  W.candidatos = null;
  if (campos.empregado || !tipoDef(tipo)?.campos?.empregado) return;
  const c = E.employeeCandidates(texto, W.empregados);
  if (c.length > 1) W.candidatos = c;
}

/* Campos que não são do portal, mas entram no texto gerado (ex.: as linhas das variáveis da folha). */
export const CAMPOS_DO_TEXTO = ['tabelaRubricas'];

export function juntarCampos(tipo, campos, fonte) {
  const W = w(tipo); const t = tipoDef(tipo);
  for (const [k, c] of Object.entries(campos)) {
    if ((!t.campos[k] && !CAMPOS_DO_TEXTO.includes(k)) || W.editados.has(k)) continue;
    if (k === 'empregado' && W.empregados.length) { const m = E.bestMatch(c.valor, W.empregados, 0.6); if (!m) continue; c.valor = m.option; }
    W.valores[k] = { valor: c.valor, conf: c.conf ?? 0.6, fonte: c.fonte || fonte };
  }
  ajustarDepartamento(tipo);
}

/** Solicitação Geral: o departamento do catálogo das regras ("Pessoal") vira o nome da lista do portal ("DEPARTAMENTO PESSOAL"),
 *  pelos sinônimos de tipos.geral.catalogo.departamentos. Sem a lista carregada, fica como está (o portal escolhe a parecida). */
export function ajustarDepartamento(tipo) {
  const W = w(tipo); const v = W.valores.departamento;
  if (tipo !== 'geral' || !v?.valor || W.editados.has('departamento') || !W.opcoes.departamento?.length) return;
  const o = E.departamentoDaLista(v.valor, W.opcoes.departamento, S.rules);
  if (o && o !== v.valor) W.valores.departamento = { ...v, valor: o };
}

export function aplicarCampos(tipo, campos, fonte) {
  juntarCampos(tipo, campos, fonte);
  gerarTextos(tipo);
  if (S.view === 'preencher') render(); else setView('preencher');
  if (S.prefs.preencherAoLer && S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo, { silencioso: true });
}

export function renderContextBanner() {
  const el = $('#ctx-banner'); if (!el) return;
  const { route, tipo } = S.ctx;
  if (standalone) { el.innerHTML = `<div class="note">${icon('info')}<div>Abra o <b>Portal do Cliente</b> para preencher solicitações. Aqui você pode usar as calculadoras e ajustar as configurações.</div></div>`; return; }
  if (route.mode === 'form' && tipo) {
    el.innerHTML = `<div class="note ok">${icon('fill')}<div>Você está em <b>${esc(S.rules.tipos[tipo]?.nome)}</b>. <button class="btn btn-ghost btn-sm" id="go-fill">Abrir o preenchimento ${icon('arrow', 'ic-sm')}</button></div></div>`;
    $('#go-fill').addEventListener('click', () => setView('preencher'));
  } else el.innerHTML = '';
}

/** Pergunta para qual empresa é o pedido (se o acesso tem mais de uma) e troca no portal. Quem prepara dados antes de
 *  abrir o formulário chama isto primeiro: se o cliente desistir, nada fica preparado. false = desistiu ou a troca falhou. */
export async function empresaDoPedido(tipo, { sugerida = '' } = {}) {
  if (standalone || (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) || !P?.escolherEmpresa) return true;
  return !!(await P.escolherEmpresa({ tipo, sugerida }));
}

export async function openTipo(tipo, { manter = false, semEmpresa = false, sugerida = '' } = {}) {
  const t = S.rules.tipos[tipo]; if (!t) return;
  // documento lido fora de um formulário (cartão na tela) e o cliente escolheu o pedido: os arquivos vão junto
  if (!manter && !standalone && S.sugestao?.item) return abrirComArquivos(tipo, S.sugestao);
  if (!manter) S.sugestao = null;
  if (standalone) return;
  // com mais de uma empresa no acesso, pergunta para qual é o pedido e troca no portal antes de abrir o formulário
  // (se este pedido já está aberto, a empresa já foi escolhida)
  if (!semEmpresa && !(await empresaDoPedido(tipo, { sugerida }))) return false;
  S.abrindo = tipo;
  await request({ type: 'navigate', slug: t.slug, add: true }, 12000);
  w(tipo);
  if (S.plat) S.plat.escolher = false;   // plataforma: mostra o formulário (mesmo se este pedido já estava aberto)
  setView('preencher');
}

/** Abre o pedido com os arquivos do cartão (o documento lido e os demais do lote) e relê cada um com a lista de
 *  funcionários desta solicitação. Vale para "Abrir … e preencher" e para o tipo que o cliente escolheu quando o
 *  documento não foi reconhecido — o arquivo não se perde. */
export async function abrirComArquivos(tipo, s) {
  if (!(await empresaDoPedido(tipo))) return false;      // desistiu da empresa: o cartão continua na tela
  const todos = [s.item, ...(s.extras || [])].filter(Boolean);
  for (let k = 0; k < 300 && todos.some(x => x.status === 'lendo'); k++) await esperar(200);   // ainda lendo: espera terminar
  comecarDoZeroSeAbandonado(tipo);
  juntarArquivos(w(tipo), todos);
  if (S.sugestao === s) S.sugestao = null;
  await openTipo(tipo, { manter: true, semEmpresa: true });
  for (let k = 0; k < 40 && !(S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo); k++) await esperar(200);
  if (S.ctx.tipo !== tipo) return false;
  await loadEmpregados(tipo);
  for (const x of todos) { if (x.texto) x.analise = analisarItem(x, tipo, w(tipo).empregados); applyAnalysis(tipo, x, { preencher: false }); }
  if (S.prefs.preencherAoLer) await fillPortal(tipo, { silencioso: true });
  return true;
}

export function bindDrop(el) {
  if (!el) return;
  el.addEventListener('click', () => $('#file-input').click());
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file-input').click(); } });
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); handleFiles([...e.dataTransfer.files], 'painel'); });
}

/** Dois arquivos com o mesmo nome no mesmo pedido: o segundo ganha "(2)" (o portal pularia o repetido). */
export function nomeUnico(W, file) {
  const usados = new Set(W.arquivos.filter(a => !a.removido).map(a => E.norm(a.nome)));
  if (!usados.has(E.norm(file.name))) return file;
  const [, base, ext = ''] = file.name.match(/^(.*?)(\.[^.]+)?$/);
  let n = 2, nome;
  do nome = `${base} (${n++})${ext}`; while (usados.has(E.norm(nome)));
  return new File([file], nome, { type: file.type, lastModified: file.lastModified });
}

/** Junta arquivos ao pedido, com nomes únicos (arquivo que o cliente anexou direto no portal fica com o nome dele). */
export function juntarArquivos(W, itens) {
  for (const it of itens) {
    if (W.arquivos.includes(it)) continue;
    if (!it.jaAnexado) { const f = nomeUnico(W, it.file); if (f !== it.file) { it.file = f; it.nome = f.name; } }
    W.arquivos.push(it);
  }
}

export function novoItem(file, origem) {
  return { id: Math.random().toString(36).slice(2), file, nome: file.name, tamanho: file.size, status: 'lendo', progresso: 0, etapa: 'Abrindo', jaAnexado: origem === 'portal', documento: null };
}

export async function handleFiles(files, origem) {
  if (!files?.length) return;
  if (files.length > 1 && origem !== 'portal') return handleVarios(files, origem);
  const noForm = S.ctx.route?.mode !== 'form' || !S.ctx.tipo;
  for (const file of files) {
    const item = novoItem(file, origem);
    if (noForm) {
      S.sugestao = { item, analise: null };
      mostrarSugestao();
      await processItem(item, null);
      renderSugestao();
    } else {
      comecarDoZeroSeAbandonado(S.ctx.tipo);
      const W = w(S.ctx.tipo);
      juntarArquivos(W, [item]);
      if (S.view !== 'preencher') setView('preencher'); else renderFilesOnly();
      await processItem(item, S.ctx.tipo);
      applyAnalysis(S.ctx.tipo, item);
    }
  }
}

/** Liga os ouvintes deste módulo (chamado uma vez por panel.js, na ordem de antes). */
export function ligar() {
  $('#file-input').addEventListener('change', (e) => { handleFiles([...e.target.files], 'painel'); e.target.value = ''; });
}
