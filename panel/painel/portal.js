/* Painel — Portal ↔ Assistente, antes de enviar e modelos. (parte de panel/panel.js, dividido na 2.16.4; mapa em docs/arquitetura.md). */
import * as E from '../engine.js';
import { $, P, S, debounce, esc, icon, request, send, toast } from './base.js';
import { anexosAtuais, gerarTextos, portalValores, valoresAssistente, valoresParaChecar } from './valores.js';
import { apagarRascunho } from './facilidades.js';
import { avisosExtras, botaoModelo, camposAusentes, fillPortal, gerarPeloModelo, renderFillResult, updateChecks } from './formulario.js';
import { empresaDoPedido, openTipo } from './inicio.js';
import { loteAoFecharFormulario, renderLote } from './lote.js';
import { msgAproximada, render, rotuloDe, setView, tipoDef, w } from './modo.js';
import { renderFieldsOnly, renderFilesOnly } from './preencher.js';
import { salvarHistorico } from './historico.js';

/* O portal é onde se preenche e se corrige. O Assistente só acompanha: se o cliente muda um campo
   lá, vale o que está no portal (e o assunto/descrição gerados se atualizam sozinhos). */
export const TEXTOS = ['assunto', 'descricao'];

export function sincronizarDoPortal(tipo) {
  const W = S.work[tipo]; if (!W) return;
  const f = S.ctx.form?.campos || {};
  const atual = Object.fromEntries([...Object.entries(f), ...Object.entries(S.ctx.form?.extras || {})].filter(([, v]) => v.existe).map(([k, v]) => [k, v.valor || '']));
  let mudouDado = false;
  // opção aproximada que o cliente trocou no portal: o aviso "confira" sai
  for (const [k, a] of Object.entries(W.aproximadas || {})) if (k in atual && E.norm(atual[k]) !== E.norm(a.escolhida)) delete W.aproximadas[k];
  // anexo que o cliente tirou no portal volta para "a anexar" (e não volta sozinho: só no "Preencher no portal")
  const anexosPortal = (S.ctx.form?.anexos || []).map(E.norm);
  let mudouAnexo = false;
  for (const a of W.arquivos) if (a.anexado && !a.removido && !anexosPortal.includes(E.norm(a.nome))) { a.anexado = false; a.tiradoNoPortal = true; mudouAnexo = true; }
  if (mudouAnexo && S.view === 'preencher' && S.ctx.tipo === tipo) renderFilesOnly();
  for (const [k, ult] of Object.entries(W.ultimoPreenchido || {})) {
    if (!(k in atual) || atual[k] === ult) continue;
    delete W.ultimoPreenchido[k];
    if (W.fonteVerdade) delete W.fonteVerdade[k];
    if (atual[k]) W.valores[k] = { valor: atual[k], conf: 1, fonte: 'você, no portal' }; else delete W.valores[k];
    W.editados.add(k);
  }
  const visto = W.portalVisto || {};
  for (const [k, v] of Object.entries(atual)) if (!TEXTOS.includes(k) && (visto[k] ?? '') !== v) mudouDado = true;
  W.portalVisto = atual;
  if (mudouDado && W.ultimoPreenchido && TEXTOS.some(k => k in W.ultimoPreenchido)) atualizarTextoNoPortal(tipo);
}

export const atualizarTextoNoPortal = debounce(async (tipo) => {
  if (S.ctx.tipo !== tipo || S.preenchendo) return;
  const W = w(tipo); gerarTextos(tipo);
  const pv = portalValores(tipo); const values = {};
  for (const k of TEXTOS) {
    const novo = W.valores[k]?.valor;
    if (novo && !W.editados.has(k) && (pv[k] || '') === (W.ultimoPreenchido?.[k] || '') && pv[k] !== novo) values[k] = novo;
  }
  if (!Object.keys(values).length) return;
  S.preenchendo = true;
  let r; try { r = await request({ type: 'fill', tipo, values, files: [], opts: { semDesfazer: true, avisoDesfazer: false, voltarInicio: false } }, 20000); } finally { S.preenchendo = false; }
  if (r?.depois) Object.assign(W.ultimoPreenchido, r.depois);
  if (S.view === 'preencher') { renderFieldsOnly(); updateChecks(); }
}, 700);

/* ---------- Desfazer ---------- */
export function atualizarBotaoDesfazer() {
  const b = $('#btn-undo'); if (!b) return;
  b.hidden = !(S.desfazerN > 0 && S.ctx.route?.mode === 'form');
  b.title = S.desfazerN > 1 ? `Desfaz o último preenchimento (há ${S.desfazerN})` : 'Volta o formulário do portal a como estava antes do último preenchimento';
}

export async function desfazerPreenchimento() {
  const b = $('#btn-undo'); if (b) { b.disabled = true; b.innerHTML = '<div class="spin"></div> Desfazendo…'; }
  await request({ type: 'undo' }, 30000);
  if (b) { b.disabled = false; b.innerHTML = `${icon('undo', 'ic-sm')} Desfazer o preenchimento`; }
}

export function aoDesfazer(m) {
  S.preenchendo = false;
  const tipo = S.ctx.tipo; if (!tipo) return;
  const W = w(tipo);
  // o formulário da plataforma volta junto: o valor de antes (ou vazio); o que foi tirado volta no "Preencher no portal"
  W.desfeitos = W.desfeitos || {};
  for (const k of m.campos || []) {
    delete W.ultimoPreenchido?.[k];
    if (W.fonteVerdade) delete W.fonteVerdade[k];
    delete W.aproximadas?.[k];
    if (W.valores[k]?.valor && !TEXTOS.includes(k) && !W.desfeitos[k]) W.desfeitos[k] = W.valores[k];
    const antes = m.valores?.[k];
    if (antes) W.valores[k] = { valor: antes, conf: 1, fonte: 'portal' };
    else if (!TEXTOS.includes(k)) delete W.valores[k];
  }
  W.portalVisto = null;
  for (const n of m.anexos || []) { const a = W.arquivos.find(x => E.norm(x.nome) === E.norm(n)); if (a) a.anexado = false; }
  if (m.grade) W.grade = null;   // a grade de rubricas voltou: o botão "Lançar na grade" volta também
  W.pausarAuto = true;
  W.resultados = null;
  if (S.view === 'preencher') render();
}

export function onSubmitAttempt(m) {
  S.ctx.form = m.form; S.ctx.tipo = m.tipo;
  const tipo = m.tipo;
  const pediu = S.pedirResumo; S.pedirResumo = false;
  // pedido preparado pelo Assistente: o resumo abre sozinho só se não falta nada (o envio continua sendo o clique do cliente)
  const auto = S.resumoAuto; S.resumoAuto = false;
  if (!tipo) { if (!auto) send({ type: 'confirmSubmit' }); return; }
  const vals = valoresParaChecar(tipo);
  const list = [...E.runChecks(tipo, vals, anexosAtuais(tipo), S.rules, E.today(), { ausentes: camposAusentes(m.form) }), ...avisosExtras(tipo, vals), ...naoAceitosPeloPortal(tipo, m.form)].filter(i => i.nivel === 'erro' || i.nivel === 'atencao');
  // Lançamento de Rubricas: o resumo diz quantos valores a planilha tem e avisa dos que não chegaram à grade do portal
  const plan = tipo === 'rubricas' ? S.work[tipo]?.planilha : null;
  const planValores = plan ? Object.entries(plan.valores).filter(([, v]) => String(v).trim()) : [];
  const planFuncionarios = new Set(planValores.map(([k]) => k.split('|')[0])).size;
  if (plan && (plan.falhas?.size || plan.pend?.size)) list.push({ nivel: 'atencao', grupo: 'Planilha', mensagem: `${(plan.falhas?.size || 0) + (plan.pend?.size || 0)} valor(es) da planilha ainda não chegaram à grade do portal${plan.falhas?.size ? ' (as células marcadas em vermelho foram recusadas)' : ''}. Confira a grade do portal antes de enviar.` });
  if (auto && list.some(i => i.nivel === 'erro' || i.grupo === 'Portal')) return;
  if (!list.length && !pediu && !auto) { S.ultimoEnvio = { tipo, quando: Date.now(), valores: vals }; send({ type: 'confirmSubmit' }); return; }
  const bloqueia = S.rules.config?.bloquearEnvioComPendencias && list.some(i => i.nivel === 'erro');
  const t = tipoDef(tipo);
  const principais = Object.entries(t.campos).filter(([k, c]) => vals[k] && !['assunto', 'descricao', 'observacoes'].includes(k) && !c.sensivel).slice(0, 8);
  const anexos = anexosAtuais(tipo);
  const modal = $('#modal');
  modal.hidden = false;
  modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mh">
    <h3 id="mh">${list.length ? 'Antes de enviar' : 'Tudo pronto para enviar'}</h3>
    <p class="muted" style="margin:0 0 10px">${esc(auto && !list.length ? 'Preparei o pedido. Confira o resumo e, se estiver certo, envie: o envio é feito pelo próprio portal.' : list.length ? (S.rules.mensagens?.envioComPendencias || '') : 'Confira o resumo. O envio é feito pelo próprio portal.')}</p>
    <div class="resumo card pad"><b>${esc(vals.assunto || t.nome)}</b>
      <dl class="kv" style="margin-top:6px">${(P?.empresasDoLogin?.().length || 0) > 1 ? `<dt>Empresa</dt><dd>${esc(S.ctx.empresa)}</dd>` : ''}${principais.map(([k, c]) => `<dt>${esc(c.rotulo)}</dt><dd>${esc(vals[k])}</dd>`).join('')}
      ${planValores.length ? `<dt>Lançamentos na planilha</dt><dd>${planValores.length} valor(es) para ${planFuncionarios} funcionário(s)</dd>` : ''}
      <dt>Anexos</dt><dd>${anexos.length ? esc(anexos.map(a => a.nome).join(', ')) : 'nenhum'}</dd></dl></div>
    ${list.length ? `<div class="checks" style="margin-top:10px">${list.map(i => `<div class="chk ${i.nivel}"><span class="st">${icon(i.nivel === 'erro' ? 'x' : 'alert', 'ic-sm')}</span><span>${esc(i.mensagem)}</span></div>${i.modelo ? botaoModelo(i.modelo) : ''}`).join('')}</div>` : ''}
    <div class="actions" style="margin-top:14px">
      ${list.length ? '<button class="btn btn-primary" id="m-fix">Corrigir agora</button>' : '<button class="btn btn-primary" id="m-send">Enviar ao escritório</button><button class="btn" id="m-fix">Voltar</button>'}
      ${list.length && !bloqueia ? '<button class="btn" id="m-send">Enviar assim mesmo</button>' : ''}
    </div></div>`;
  const close = () => { modal.hidden = true; modal.innerHTML = ''; };
  $('#m-fix').addEventListener('click', () => { close(); setView('preencher'); });
  $('#m-send')?.addEventListener('click', () => { close(); S.ultimoEnvio = { tipo, quando: Date.now(), valores: vals }; send({ type: 'confirmSubmit' }); });
  modal.querySelectorAll('[data-modelo]').forEach(b => b.addEventListener('click', () => { close(); gerarPeloModelo(b.dataset.modelo, tipo); }));
  ($('#m-send') && !list.length ? $('#m-send') : $('#m-fix')).focus();
}

/** Plataforma: o cliente escreveu um valor aqui que o portal não ficou com ele (ex.: opção que não existe na lista). */
export function naoAceitosPeloPortal(tipo, form) {
  const W = w(tipo); const f = { ...(form?.extras || {}), ...(form?.campos || {}) };
  const out = Object.entries(W.fonteVerdade || {}).filter(([k, o]) => o === 'plataforma' && f[k]?.existe && !f[k].disabled && W.valores[k]?.valor && E.norm(f[k].valor) !== E.norm(W.valores[k].valor))
    .map(([k]) => ({ nivel: 'atencao', grupo: 'Portal', campo: k, mensagem: `${rotuloDe(tipo, k)}: o portal está com “${f[k].valor || 'vazio'}”, e não com “${W.valores[k].valor}”. Confira esse campo.` }));
  // erros de validação que o próprio portal mostra (só rótulo e mensagem)
  for (const e of form?.erros || []) out.push({ nivel: 'erro', grupo: 'Portal', campo: e.k || null, mensagem: `${e.rotulo}: ${(S.rules.mensagens?.portalAcusa || 'O portal acusa: {mensagem}').replace('{mensagem}', e.mensagem)}` });
  // opção parecida escolhida na lista: o cliente confere
  for (const [k, a] of Object.entries(W.aproximadas || {})) if (f[k]?.valor && E.norm(f[k].valor) === E.norm(a.escolhida)) out.push({ nivel: 'atencao', grupo: 'Portal', campo: k, mensagem: `${rotuloDe(tipo, k)}: ${msgAproximada(a)}` });
  return out;
}

export function textoResumo(tipo) {
  const v = valoresParaChecar(tipo); const t = tipoDef(tipo);
  const anexos = anexosAtuais(tipo).map(a => a.nome);
  return [`${t.nome} — ${S.ctx.empresa}`, v.assunto, v.descricao, anexos.length ? `Anexos: ${anexos.join(', ')}` : ''].filter(Boolean).join('\n');
}

export async function copiarResumo(tipo) {
  const txt = textoResumo(tipo);
  try { await navigator.clipboard.writeText(txt); toast('Resumo copiado.'); }
  catch { const m = $('#modal'); m.hidden = false; m.innerHTML = `<div class="sheet"><h3>Resumo</h3><textarea class="input" rows="8" id="m-txt">${esc(txt)}</textarea><div class="actions" style="margin-top:10px"><button class="btn btn-primary" id="m-ok">Fechar</button></div></div>`; $('#m-txt').select(); $('#m-ok').addEventListener('click', () => { m.hidden = true; m.innerHTML = ''; }); }
}

export const PESSOAIS = new Set(['empregado', 'nome', 'nomeSocial', 'cpf', 'pis', 'rg', 'orgaoRg', 'ufRg', 'dataRg', 'titulo', 'zona', 'secao', 'reservista', 'cnh', 'cnhCategoria', 'cnhValidade', 'mae', 'pai', 'conjuge', 'nascimento', 'email', 'telefone', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'municipio', 'uf', 'cid', 'medico', 'numeroCat', 'agencia', 'conta', 'digitoConta', 'assunto', 'descricao', 'ctpsNumero', 'ctpsSerie', 'ctpsUf',
  'sexo', 'racaCor', 'estadoCivil', 'grauInstrucao', 'nacionalidade', 'paisNascimento', 'ufNascimento', 'municipioNascimento', 'deficiencia', 'possuiDependentes', 'banco', 'tipoConta', 'formaPagamento', 'tipoEndereco', 'matricula', 'instituicaoEnsino', 'inss']);

export async function salvarModeloUI(tipo) {
  const t = tipoDef(tipo); const v = valoresAssistente(tipo);
  // cadastro: só os campos da empresa (lista nas regras); outros pedidos: tudo menos dados pessoais e datas
  const daEmpresa = E.camposDaEmpresa(tipo, S.rules);
  const valores = Object.fromEntries(Object.entries({ ...v, ...portalValores(tipo) }).filter(([k]) => !k.startsWith('extra:')).filter(([k]) => daEmpresa ? daEmpresa.includes(k) : (!PESSOAIS.has(k) && t.campos[k]?.tipo !== 'data' && t.campos[k]?.tipo !== 'competencia' || k === 'observacoes' || k === 'tabelaRubricas')));
  const m = $('#modal'); m.hidden = false;
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mm"><h3 id="mm">Salvar como modelo</h3>
    <p class="muted" style="margin:0 0 10px">${daEmpresa ? 'Guarda só as escolhas da empresa (cargo, departamento, jornada…), sem os dados da pessoa.' : 'Guarda o que se repete (tipo, textos, rubricas), sem dados pessoais nem datas.'} Fica só neste computador.</p>
    <div class="field"><label for="m-nome">Nome do modelo</label><input class="input" id="m-nome" value="${esc(t.nome)}"></div>
    <p class="muted" style="font-size:12px">${Object.keys(valores).length ? 'Inclui: ' + esc(Object.keys(valores).map(k => t.campos[k]?.rotulo || (k === 'observacoes' ? 'Observações' : k === 'tabelaRubricas' ? 'Tabela de rubricas' : k)).join(', ')) : 'Nenhum dado reaproveitável ainda — o modelo vai abrir a solicitação vazia.'}</p>
    <div class="actions"><button class="btn btn-primary" id="m-save">Salvar</button><button class="btn" id="m-cancel">Cancelar</button></div></div>`;
  const close = () => { m.hidden = true; m.innerHTML = ''; };
  $('#m-cancel').addEventListener('click', close);
  $('#m-save').addEventListener('click', async () => {
    const { modelos = [] } = await chrome.storage.local.get('modelos');
    modelos.unshift({ id: Date.now().toString(36), nome: $('#m-nome').value.trim() || t.nome, tipo, valores, criado: Date.now() });
    await chrome.storage.local.set({ modelos: modelos.slice(0, 30) });
    close(); toast('Modelo salvo. Ele aparece no Início.');
  });
  $('#m-nome').focus(); $('#m-nome').select();
}

export async function renderModelosInicio() {
  const el = $('#modelos-ini'); if (!el) return;
  const { modelos = [] } = await chrome.storage.local.get('modelos');
  if (!modelos.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<h2 class="sec">Seus modelos</h2><div class="list">${modelos.map(md => `
    <div class="li"><div class="main"><b>${esc(md.nome)}</b><small>${esc(S.rules.tipos[md.tipo]?.nome || md.tipo)}</small></div>
      <button class="btn btn-sm" data-use="${md.id}">Usar</button><button class="icon-btn" data-del="${md.id}" aria-label="Apagar modelo ${esc(md.nome)}" style="color:var(--ink-3)">${icon('trash', 'ic-sm')}</button></div>`).join('')}</div>`;
  el.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', async () => {
    const md = modelos.find(x => x.id === b.dataset.use); if (!md) return;
    if (!(await empresaDoPedido(md.tipo))) return;
    const W = w(md.tipo);
    // modelos antigos de cadastro podem ter dados da pessoa: só os campos da empresa voltam
    for (const [k, v] of Object.entries(E.camposDaEmpresa(md.tipo, S.rules) ? E.valoresReaproveitaveis(md.tipo, md.valores, S.rules) : md.valores)) W.valores[k] = { valor: v, conf: 1, fonte: 'modelo' };
    gerarTextos(md.tipo, true);
    await openTipo(md.tipo, { manter: true, semEmpresa: true });
    if (S.prefs.preencherAoLer) setTimeout(() => fillPortal(md.tipo, { silencioso: true }), 900);
  }));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.style.color = 'var(--brand-red)'; b.setAttribute('aria-label', 'Clique de novo para apagar'); setTimeout(() => { delete b.dataset.confirm; b.style.color = 'var(--ink-3)'; }, 3000); return; }
    await chrome.storage.local.set({ modelos: modelos.filter(x => x.id !== b.dataset.del) }); renderModelosInicio();
  }));
}

/* O portal não aceitou o envio: a tela continua no formulário. Sem isso, um CANCELAR
   logo depois virava "enviado" no histórico, com prazos na Agenda e o rascunho apagado. */
export function onEnvioNaoConcluido(m = {}) {
  if (!S.ultimoEnvio) return;
  S.ultimoEnvio = null;
  if (S.lote) { S.lote.pausado = true; renderLote(); }
  const M = S.rules.mensagens || {};
  const erros = m.erros || [];
  if (erros.length && S.ctx.form) S.ctx.form.erros = erros;
  const lista = erros.slice(0, 4).map(e => `${e.rotulo} (${e.mensagem})`).join(', ') + (erros.length > 4 ? ` e mais ${erros.length - 4}` : '');
  const text = erros.length ? (M.envioRecusadoPortal || 'O portal não aceitou: {erros}. Corrija esses campos e envie de novo.').replace('{erros}', lista)
    : (M.envioNaoConcluido || 'O portal ainda não aceitou o envio: confira os avisos em vermelho na página e tente de novo.');
  // na plataforma a página fica coberta: o aviso leva o botão "Ver no portal"
  send({ type: 'toast', text, ms: 12000, acao: S.modo === 'plataforma' ? 'verPortal' : null });
  if (S.view === 'preencher') { renderFieldsOnly(); renderFillResult(); updateChecks(); }
}

export async function onFormClosed(m = {}) {
  let enviadoTipo = null;
  // o formulário fechou com o resumo do "Conferir e enviar" aberto: o resumo já não vale
  const md = $('#modal'); if (!md.hidden && md.querySelector('#mh')) { md.hidden = true; md.innerHTML = ''; }
  // saiu do formulário sem enviar: o que ficou guardado não se mistura com o próximo documento ou pedido
  const slugSaiu = String(m.from || '').match(/service-request\/([a-z-]+)/)?.[1];
  const tipoSaiu = slugSaiu && E.tipoBySlug(S.rules, slugSaiu);
  if (tipoSaiu && S.work[tipoSaiu] && S.ultimoEnvio?.tipo !== tipoSaiu) S.work[tipoSaiu].abandonado = true;
  if (S.ultimoEnvio && Date.now() - S.ultimoEnvio.quando < 60000) {
    const tipo = S.ultimoEnvio.tipo; enviadoTipo = tipo;
    const enviados = { ...valoresAssistente(tipo), ...(S.ultimoEnvio.valores || {}) };
    await salvarHistorico(tipo, 'enviado');
    await apagarRascunho(tipo);
    S.work[tipo] = null; S.ultimoEnvio = null;
    if (!S.lote) toast('Solicitação enviada. Os próximos prazos estão na Agenda.');
    P?.aoEnviar(tipo, enviados);
    if (S.view === 'preencher') render();
  }
  loteAoFecharFormulario(enviadoTipo);
  S.pv.lastMissingKey = '';
}
