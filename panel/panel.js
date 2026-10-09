import * as E from './engine.js';
import { readFile, aiExtract, aiAvailable } from './extract.js';

/* =================== Estado =================== */
const params = new URLSearchParams(location.search);
const standalone = params.has('standalone');
const S = {
  rules: null, meta: {}, prefs: {}, settingsInfo: null,
  ctx: { route: {}, tipo: null, empresa: '', form: null },
  view: 'inicio', port: null,
  work: {},              // por tipo: { valores, arquivos, editados, empregados, opcoes }
  sugestao: null,        // documento lido fora de formulário
  pend: null, pendLoading: false,
  ultimoEnvio: null,
  ferramenta: 'ferias'
};
const DEFAULT_PREFS = { preencherAoLer: true, incluirCid: false, ocrAutomatico: true, usarIa: true, introVista: false };
let reqId = 0; const waiters = new Map();

/* =================== Utilidades de UI =================== */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = '') => `<svg class="ic ${cls}"><use href="#i-${id}"/></svg>`;
const viewEl = $('#view');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function request(msg, timeout = 15000, transfer = []) {
  if (!S.port) return Promise.resolve(null);
  const id = ++reqId;
  return new Promise((res) => {
    const t = setTimeout(() => { waiters.delete(id); res(null); }, timeout);
    waiters.set(id, (d) => { clearTimeout(t); res(d); });
    S.port.postMessage({ ...msg, id }, transfer);
  });
}
const send = (msg, transfer) => S.port?.postMessage(msg, transfer || []);
const packFiles = async (files) => Promise.all(files.map(async f => ({ name: f.name, type: f.type, lastModified: f.lastModified, buf: await f.arrayBuffer() })));
const toast = (text) => send({ type: 'toast', text });

/* =================== Conexão com a página =================== */
window.addEventListener('message', (e) => {
  // origem do portal (extensão) ou do próprio simulador (mesma origem do painel)
  if (!['https://onvio.com.br', location.origin].includes(e.origin) || e.data?.type !== 'ct-hello' || !e.ports?.[0]) return;
  S.port = e.ports[0];
  S.port.onmessage = (ev) => onPage(ev.data);
  send({ type: 'getContext' });
});

function onPage(m) {
  if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); w(m); return; }
  switch (m.type) {
    case 'context': onContext(m); break;
    case 'files': handleFiles((m.files || []).map(p => p instanceof File ? p : new File([p.buf], p.name, { type: p.type || 'application/octet-stream', lastModified: p.lastModified })), m.origem); break;
    case 'submitAttempt': onSubmitAttempt(m); break;
    case 'formClosed': onFormClosed(); break;
    case 'rulesUpdated': loadRules().then(render); break;
    default: break;
  }
}

/* =================== Regras e preferências =================== */
async function loadRules() {
  const pack = await chrome.runtime.sendMessage({ type: 'getRules' });
  S.rules = pack.rules; S.meta = pack;
  $('#rules-ver').textContent = `regras ${pack.versao}${pack.origem === 'dev' ? ' · dev' : ''}`;
}
async function loadPrefs() {
  const { prefs } = await chrome.storage.local.get('prefs');
  S.prefs = { ...DEFAULT_PREFS, ...(prefs || {}) };
}
const savePrefs = () => chrome.storage.local.set({ prefs: S.prefs });
chrome.runtime.onMessage.addListener((m) => { if (m.type === 'rulesUpdated') { loadRules().then(render); } });

/* =================== Contexto da página =================== */
let lastKey = '';
function onContext(m) {
  const prevTipo = S.ctx.tipo, prevMode = S.ctx.route?.mode;
  S.ctx = { route: m.route || {}, tipo: m.tipo, empresa: m.empresa || '', form: m.form };
  $('#empresa').textContent = S.ctx.empresa || 'Portal do Cliente';
  const key = `${m.route?.path}|${m.tipo}`;
  if (m.route?.mode === 'form' && m.tipo) {
    w(m.tipo);
    if (key !== lastKey) { loadEmpregados(m.tipo); if (S.view === 'inicio' && !S.sugestao) setView('preencher'); }
  }
  lastKey = key;
  $('#dot-preencher').hidden = !(m.route?.mode === 'form');
  if (S.view === 'preencher' && (prevTipo !== m.tipo || prevMode !== m.route?.mode)) render();
  else if (S.view === 'preencher') updateChecks();
  else if (S.view === 'inicio') renderContextBanner();
}

function w(tipo) {
  if (!S.work[tipo]) S.work[tipo] = { valores: {}, arquivos: [], editados: new Set(), empregados: [], opcoes: {}, resultados: null };
  return S.work[tipo];
}
const tipoDef = (k) => E.resolveTipo(S.rules, k);

async function loadEmpregados(tipo) {
  const t = tipoDef(tipo); if (!t) return;
  const W = w(tipo);
  const combos = Object.entries(t.campos).filter(([, c]) => c.tipo === 'combo' && c.fc);
  const simples = !t.assistente;
  for (const [k, c] of combos) {
    if (!simples && c.fonte !== 'empregado') continue;
    if (W.opcoes[k]?.length) continue;
    const r = await request({ type: 'getOptions', locator: { fc: c.fc } }, 6000);
    if (r?.options?.length) { W.opcoes[k] = r.options; if (c.fonte === 'empregado') W.empregados = r.options; }
  }
  if (S.view === 'preencher') renderFieldsOnly();
}

/* =================== Navegação entre abas =================== */
function setView(v) {
  S.view = v;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  render();
  viewEl.scrollTop = 0;
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('#btn-close').addEventListener('click', () => send({ type: 'close' }));
$('#btn-config').addEventListener('click', () => setView('config'));
$('#btn-theme').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('ct-tema', next); } catch { /* sem armazenamento */ }
  syncThemeIcon();
});
function syncThemeIcon() {
  const dark = (document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  $('#btn-theme').innerHTML = icon(dark ? 'sun' : 'moon');
}

function render() {
  if (!S.rules) { viewEl.innerHTML = `<div class="empty"><div class="spin" style="margin:auto"></div><p>Carregando…</p></div>`; return; }
  ({ inicio: renderInicio, preencher: renderPreencher, pendencias: renderPendencias, ferramentas: renderFerramentas, historico: renderHistorico, config: renderConfig }[S.view] || renderInicio)();
}

/* =================== INÍCIO =================== */
const ICONS = { 'user-plus': 'user-plus', graduation: 'graduation', briefcase: 'briefcase', sun: 'sun', calc: 'calc', medical: 'medical', door: 'door', list: 'list', chat: 'chat' };
function renderInicio() {
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
    <div>
      <p class="hello">O que você precisa fazer?</p>
      <p class="lead">${esc(R.escritorio?.saudacao || '')}</p>
    </div>
    <div id="ctx-banner"></div>
    <div class="free card">
      <label for="free-txt" class="free-l">${icon('chat', 'ic-sm')} Escreva com suas palavras</label>
      <textarea id="free-txt" rows="2" placeholder="Ex.: o João vai sair de férias dia 10/11 por 20 dias"></textarea>
      <div class="free-a"><small class="muted">Eu entendo o pedido e abro a solicitação certa.</small><button class="btn btn-primary btn-sm" id="free-go">Continuar ${icon('arrow', 'ic-sm')}</button></div>
    </div>
    <div id="sugestao"></div>
    <div class="search">${icon('search')}<input id="q" type="search" placeholder="Ou procure: atestado, férias, demissão…" aria-label="Buscar o que você precisa"></div>
    <div class="intents" id="intents"></div>
    <div id="modelos-ini"></div>
    <h2 class="sec">Comece por um documento</h2>
    <div class="drop" id="drop-main" role="button" tabindex="0">
      ${icon('upload', 'ic-lg')}
      <b>Arraste um arquivo ou clique para escolher</b>
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
  $('#q').addEventListener('input', (e) => draw(E.searchIntents(e.target.value, R)));
  const closeIntro = () => { S.prefs.introVista = true; savePrefs(); $('#intro')?.remove(); };
  $('#intro-x')?.addEventListener('click', closeIntro); $('#intro-ok')?.addEventListener('click', closeIntro);
  const go = () => { const t = $('#free-txt').value.trim(); if (t) entenderTexto(t); };
  $('#free-go').addEventListener('click', go);
  $('#free-txt').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
  bindDrop($('#drop-main'));
  renderContextBanner();
  renderSugestao();
  renderModelosInicio();
}

/* ---------- Texto livre ---------- */
function entenderTexto(texto) {
  const tipoAtual = S.ctx.route?.mode === 'form' ? S.ctx.tipo : null;
  const emps = tipoAtual ? w(tipoAtual).empregados : [];
  const r = E.parseFreeText(texto, S.rules, { employees: emps, tipoAtual });
  if (tipoAtual) { aplicarCampos(tipoAtual, r.campos, 'sua descrição'); return; }
  S.sugestao = { texto, analise: { tipoSugerido: r.tipoSugerido, campos: r.campos, documento: { nome: 'seu pedido' } } };
  renderSugestao();
}
function aplicarCampos(tipo, campos, fonte) {
  const W = w(tipo); const t = tipoDef(tipo);
  for (const [k, c] of Object.entries(campos)) {
    if (!(t.campos[k] || k === 'observacoes') || W.editados.has(k)) continue;
    if (k === 'empregado' && W.empregados.length) { const m = E.bestMatch(c.valor, W.empregados, 0.6); if (!m) continue; c.valor = m.option; }
    W.valores[k] = { valor: c.valor, conf: c.conf ?? 0.6, fonte: c.fonte || fonte };
  }
  gerarTextos(tipo);
  if (S.view === 'preencher') render(); else setView('preencher');
  if (S.prefs.preencherAoLer && S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo, { silencioso: true });
}

function renderContextBanner() {
  const el = $('#ctx-banner'); if (!el) return;
  const { route, tipo } = S.ctx;
  if (standalone) { el.innerHTML = `<div class="note">${icon('info')}<div>Abra o <b>Portal do Cliente</b> para preencher solicitações. Aqui você pode usar as calculadoras e ajustar as configurações.</div></div>`; return; }
  if (route.mode === 'form' && tipo) {
    el.innerHTML = `<div class="note ok">${icon('fill')}<div>Você está em <b>${esc(S.rules.tipos[tipo]?.nome)}</b>. <button class="btn btn-ghost btn-sm" id="go-fill">Abrir o preenchimento ${icon('arrow', 'ic-sm')}</button></div></div>`;
    $('#go-fill').addEventListener('click', () => setView('preencher'));
  } else el.innerHTML = '';
}

async function openTipo(tipo, { manter = false } = {}) {
  const t = S.rules.tipos[tipo]; if (!t) return;
  if (!manter) S.sugestao = null;
  if (standalone) return;
  await request({ type: 'navigate', slug: t.slug, add: true }, 12000);
  w(tipo);
  setView('preencher');
}

/* =================== Leitura de arquivos =================== */
function bindDrop(el) {
  if (!el) return;
  el.addEventListener('click', () => $('#file-input').click());
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file-input').click(); } });
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); handleFiles([...e.dataTransfer.files], 'painel'); });
}
$('#file-input').addEventListener('change', (e) => { handleFiles([...e.target.files], 'painel'); e.target.value = ''; });

async function handleFiles(files, origem) {
  if (!files?.length) return;
  const noForm = S.ctx.route?.mode !== 'form' || !S.ctx.tipo;
  for (const file of files) {
    const item = { id: Math.random().toString(36).slice(2), file, nome: file.name, tamanho: file.size, status: 'lendo', progresso: 0, etapa: 'Abrindo', jaAnexado: origem === 'portal', documento: null };
    if (noForm) {
      S.sugestao = { item, analise: null };
      if (S.view !== 'inicio') setView('inicio'); else renderSugestao();
      await processItem(item, null);
      renderSugestao();
    } else {
      const W = w(S.ctx.tipo);
      W.arquivos.push(item);
      if (S.view !== 'preencher') setView('preencher'); else renderFilesOnly();
      await processItem(item, S.ctx.tipo);
      applyAnalysis(S.ctx.tipo, item);
    }
  }
}

async function processItem(item, tipoAtual) {
  const onProgress = (p, etapa) => {
    item.progresso = p; item.etapa = etapa || item.etapa;
    const bar = document.querySelector(`[data-file="${item.id}"] .prog i`); if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    const st = document.querySelector(`[data-file="${item.id}"] small`); if (st) st.textContent = item.etapa;
  };
  try {
    const r = await readFile(item.file, onProgress, { ocr: S.prefs.ocrAutomatico });
    item.texto = r.texto; item.metodo = r.metodo; item.tabela = r.tabela;
    const empregados = tipoAtual ? w(tipoAtual).empregados : [];
    item.analise = E.analyzeText(r.texto || item.nome, S.rules, { employees: empregados, tipoAtual });
    if (r.tabela && (tipoAtual === 'rubricas' || !tipoAtual)) {
      item.analise.tipoSugerido = tipoAtual || 'rubricas';
      item.analise.documento = { id: 'planilha', nome: 'Planilha de lançamentos' };
    }
    item.documento = item.analise.documento?.id || null;
    item.resumo = E.summarizeDocument(item.analise, r.texto || '');
    if (item.documento === 'aso') item.aso = E.readASO(r.texto || '');
    const tipoAlvo = tipoAtual || item.analise.tipoSugerido;
    if (S.prefs.usarIa && S.rules.config?.usarIaDoChromeQuandoDisponivel && tipoAlvo && r.texto && await aiAvailable()) {
      onProgress(0.95, 'Conferindo com a IA do Chrome');
      const t = tipoDef(tipoAlvo);
      const faltam = Object.fromEntries(Object.entries(t.campos).filter(([k, c]) => !item.analise.campos[k] && !c.sensivel && c.tipo !== 'textarea' && k !== 'assunto'));
      const extra = await aiExtract(r.texto, faltam);
      for (const [k, v] of Object.entries(extra)) item.analise.campos[k] = { valor: v, conf: 0.55, fonte: 'IA do Chrome (confira)' };
    }
    item.status = r.metodo === 'nao-suportado' ? 'nao-lido' : 'ok';
    item.etapa = r.metodo === 'nao-suportado' ? 'Formato não lido — será só anexado' : `${item.analise.documento?.nome || 'Documento'} · ${r.metodo === 'ocr' ? 'lido por OCR' : 'lido'}${item.resumo ? ' · ' + item.resumo : ''}`;
  } catch (err) {
    console.error(err);
    item.status = 'erro'; item.etapa = 'Não consegui ler este arquivo. Ele ainda pode ser anexado.';
    item.analise = { documento: null, campos: {}, tipoSugerido: null };
  }
}

function renderSugestao() {
  const el = $('#sugestao'); if (!el) return;
  const s = S.sugestao; if (!s) { el.innerHTML = ''; return; }
  if (s.texto) return renderSugestaoTexto(el, s);
  const it = s.item;
  if (it.status === 'lendo') {
    el.innerHTML = `<div class="card pad" data-file="${it.id}"><div style="display:flex;gap:10px;align-items:center"><div class="spin"></div><div style="flex:1;min-width:0"><b>${esc(it.nome)}</b><br><small class="muted">${esc(it.etapa)}</small><div class="prog"><i style="width:${Math.round(it.progresso * 100)}%"></i></div></div></div></div>`;
    return;
  }
  const a = it.analise || {};
  const tipo = a.tipoSugerido;
  const nCampos = Object.keys(a.campos || {}).length;
  el.innerHTML = `
    <div class="card">
      <div class="card-h">${icon('spark')}<h3>${tipo ? 'Encontrei o caminho' : 'Li o arquivo'}</h3><button class="icon-btn" id="sug-x" aria-label="Descartar">${icon('x', 'ic-sm')}</button></div>
      <div class="card-b">
        <p style="margin:0 0 8px">${esc(it.nome)} parece ser <b>${esc(a.documento?.nome || 'um documento')}</b>${tipo ? ` → <b>${esc(S.rules.tipos[tipo]?.nome)}</b>` : ''}.</p>
        ${nCampos ? `<p class="muted" style="margin:0 0 10px">${nCampos} informação(ões) encontradas: ${Object.keys(a.campos).slice(0, 6).map(k => esc(tipoDef(tipo || 'geral')?.campos?.[k]?.rotulo || k)).join(', ')}${nCampos > 6 ? '…' : ''}</p>` : ''}
        ${tipo ? `<button class="btn btn-primary btn-block" id="sug-go">Abrir ${esc(S.rules.tipos[tipo]?.nome)} e preencher ${icon('arrow', 'ic-sm')}</button>` : `<p class="muted">Não reconheci o tipo. Escolha acima o que você precisa fazer — o arquivo vai junto.</p>`}
      </div>
    </div>`;
  $('#sug-x').addEventListener('click', () => { S.sugestao = null; renderSugestao(); });
  $('#sug-go')?.addEventListener('click', async () => {
    const W = w(tipo); W.arquivos.push(it);
    S.sugestao = null;
    await openTipo(tipo, { manter: true });
    // Reanalisa com a lista de funcionários desta tela
    setTimeout(async () => { await loadEmpregados(tipo); if (it.texto) it.analise = E.analyzeText(it.texto, S.rules, { employees: w(tipo).empregados, tipoAtual: tipo }); applyAnalysis(tipo, it); }, 900);
  });
  if (!tipo) {
    $('#intents')?.querySelectorAll('.intent').forEach(b => b.addEventListener('click', () => { const W = w(b.dataset.tipo); if (!W.arquivos.includes(it)) W.arquivos.push(it); }, { once: true }));
  }
}

function renderSugestaoTexto(el, s) {
  const a = s.analise; const tipo = a.tipoSugerido; const t = tipoDef(tipo);
  const achados = Object.entries(a.campos).filter(([k]) => k !== 'observacoes');
  el.innerHTML = `<div class="card">
    <div class="card-h">${icon('spark')}<h3>Entendi assim</h3><button class="icon-btn" id="sug-x" aria-label="Descartar">${icon('x', 'ic-sm')}</button></div>
    <div class="card-b">
      <p style="margin:0 0 8px">Solicitação: <b>${esc(t?.nome || 'Solicitação Geral')}</b></p>
      ${achados.length ? `<dl class="kv" style="margin-bottom:10px">${achados.map(([k, c]) => `<dt>${esc(t?.campos?.[k]?.rotulo || k)}</dt><dd>${esc(c.valor)}</dd>`).join('')}</dl>` : '<p class="muted" style="margin:0 0 10px">Seu texto vai junto, como observação para o analista.</p>'}
      <div class="actions"><button class="btn btn-primary" id="sug-go">Abrir e preencher ${icon('arrow', 'ic-sm')}</button></div>
      <details class="more" style="margin-top:8px"><summary>Não é isso? Escolher outra solicitação</summary>
        <div class="tool-tabs" style="margin-top:8px">${(S.rules.intencoes || []).map(i => `<button type="button" data-alt="${esc(i.tipo)}">${esc(i.titulo)}</button>`).join('')}</div></details>
    </div></div>`;
  const abrir = async (destino) => {
    S.sugestao = null;
    await openTipo(destino, { manter: true });
    setTimeout(async () => { await loadEmpregados(destino); const r = E.parseFreeText(s.texto, S.rules, { employees: w(destino).empregados, tipoAtual: destino }); aplicarCampos(destino, r.campos, 'sua descrição'); }, 900);
  };
  $('#sug-x').addEventListener('click', () => { S.sugestao = null; renderSugestao(); });
  $('#sug-go').addEventListener('click', () => abrir(tipo));
  el.querySelectorAll('[data-alt]').forEach(b => b.addEventListener('click', () => abrir(b.dataset.alt)));
}

/* Documentos neutros (servem a vários pedidos) e famílias de pedidos compatíveis */
const DOCS_NEUTROS = ['certidao', 'aso', 'identidade', 'cpf', 'comprovanteEndereco', 'ctps', 'seguro', 'bancario'];
const FAMILIAS = [['avisoFerias', 'calculoFerias'], ['avisoRescisao', 'calculoRescisao'], ['cadastroEmpregado', 'cadastroEstagiario', 'cadastroContribuinte']];
function docDeOutroTipo(item, tipo) {
  const doc = item.analise?.documento; const dt = doc?.tipoSolicitacao;
  if (!dt || dt === tipo || DOCS_NEUTROS.includes(doc.id)) return null;
  if (FAMILIAS.some(f => f.includes(dt) && f.includes(tipo))) return null;
  return dt;
}

/* Junta o que foi lido com o que já está no assistente e preenche */
function applyAnalysis(tipo, item) {
  const W = w(tipo); const t = tipoDef(tipo);
  item.outroTipo = docDeOutroTipo(item, tipo);
  const campos = item.outroTipo ? {} : (item.analise?.campos || {});
  for (const [k, c] of Object.entries(campos)) {
    if (!t.campos[k] || W.editados.has(k)) continue;
    const cur = W.valores[k];
    if (!cur || (cur.conf ?? 0) <= c.conf) W.valores[k] = { valor: c.valor, conf: c.conf, fonte: c.fonte };
  }
  // empregado com a lista do portal
  if (t.campos.empregado && W.valores.empregado && W.empregados.length) {
    const m = E.bestMatch(W.valores.empregado.valor, W.empregados, 0.7);
    if (m) W.valores.empregado.valor = m.option; else W.valores.empregado.conf = 0.3;
  }
  // tabela de rubricas
  if (item.tabela && tipo === 'rubricas') W.valores.tabelaRubricas = { valor: tabelaRubricasTexto(item.tabela), conf: 0.9, fonte: item.nome };
  // sugere outro tipo
  gerarTextos(tipo);
  if (S.view === 'preencher') render();
  if (S.prefs.preencherAoLer && !item.outroTipo && S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo && item.status !== 'lendo') fillPortal(tipo, { silencioso: true });
}

function tabelaRubricasTexto(rows) {
  if (!rows?.length) return '';
  const head = rows[0].map(h => E.norm(h));
  const P = S.rules.tipos.rubricas.planilha || {};
  const find = (names) => head.findIndex(h => names.some(n => h.includes(E.norm(n))));
  let iE = find(P.colunasEmpregado || []), iR = find(P.colunasRubrica || []), iV = find(P.colunasValor || []);
  const hasHeader = iE >= 0 || iR >= 0 || iV >= 0;
  if (!hasHeader) { iE = 0; iR = 1; iV = 2; }
  const body = hasHeader ? rows.slice(1) : rows;
  return body.filter(r => r.some(c => String(c).trim())).map(r => `• ${r[iE] ?? ''} — ${r[iR] ?? ''}: ${r[iV] ?? ''}`).join('\n');
}

/* =================== Valores combinados =================== */
function portalValores(tipo) {
  const out = {};
  if (S.ctx.tipo !== tipo || !S.ctx.form) return out;
  for (const [k, v] of Object.entries(S.ctx.form.campos || {})) if (v.existe && v.valor) out[k] = v.valor;
  return out;
}
function valoresAssistente(tipo) {
  const W = w(tipo); const out = {};
  for (const [k, v] of Object.entries(W.valores)) if (v?.valor != null && v.valor !== '') out[k] = v.valor;
  return out;
}
/** Para conferir: o que está no portal vale mais (o cliente pode ter mudado lá). */
function valoresParaChecar(tipo) {
  return { ...valoresAssistente(tipo), ...portalValores(tipo) };
}
function anexosAtuais(tipo) {
  const W = w(tipo);
  const nomesPortal = S.ctx.tipo === tipo ? (S.ctx.form?.anexos || []) : [];
  const out = nomesPortal.map(n => {
    const f = W.arquivos.find(a => E.norm(a.nome) === E.norm(n));
    return { nome: n, documento: f?.documento || null };
  });
  for (const a of W.arquivos) if (!out.some(o => E.norm(o.nome) === E.norm(a.nome)) && a.status !== 'erro' && !a.removido) out.push({ nome: a.nome, documento: a.documento, pendente: true });
  return out;
}

function gerarTextos(tipo, force = false) {
  const W = w(tipo); const t = tipoDef(tipo);
  const vals = { ...valoresParaChecar(tipo), ...E.derived(tipo, valoresParaChecar(tipo), S.rules) };
  if (!S.prefs.incluirCid && !S.rules.config?.incluirCidNaDescricao) delete vals.cid;
  vals.anexosNomes = anexosAtuais(tipo).map(a => a.nome).join(', ');
  vals.observacoes = W.valores.observacoes?.valor || '';
  if (t.campos.assunto && t.assunto && (force || !W.editados.has('assunto'))) {
    const s = E.renderTemplate(t.assunto, vals); if (s) W.valores.assunto = { valor: s, conf: 0.9, fonte: 'gerado' };
  }
  if (t.campos.descricao && t.descricao?.length && (force || !W.editados.has('descricao'))) {
    const d = E.renderTemplate(t.descricao, vals); if (d) W.valores.descricao = { valor: d, conf: 0.9, fonte: 'gerado' };
  }
}

/* =================== PREENCHER =================== */
function renderPreencher() {
  const { route, tipo } = S.ctx;
  if (standalone || route.mode !== 'form' || !tipo) {
    viewEl.innerHTML = `
      <div class="empty">${icon('fill', 'ic-lg')}<p><b>Nenhuma solicitação aberta</b></p><p>Escolha no Início o que você precisa fazer, escreva com suas palavras ou arraste um documento — eu abro a solicitação certa.</p>
      <button class="btn btn-primary" id="go-home">Ir para o Início</button></div>`;
    $('#go-home').addEventListener('click', () => setView('inicio'));
    return;
  }
  const t = tipoDef(tipo);
  viewEl.innerHTML = `
    <div class="card">
      <div class="card-h">
        <div style="flex:1;min-width:0"><h3>${esc(t.nome)}</h3><small class="muted">${esc(S.ctx.empresa)}</small></div>
        <span class="chip sector">${esc(t.setor)}</span>
      </div>
      <div class="card-b">
        <ol class="stepper" id="stepper" aria-label="Etapas do pedido"></ol>
        <div class="progress" style="margin-top:10px"><div class="bar" id="bar"><i style="width:0"></i></div><small class="mono" id="bar-txt"></small></div>
      </div>
    </div>
    <div class="drop compact" id="drop-form" role="button" tabindex="0">${icon('upload', 'ic-lg')}<div><b>Arraste documentos aqui</b><small>Eu leio, preencho e anexo.</small></div></div>
    <div class="free mini">
      <label for="free-form" class="sr">Escreva o pedido com suas palavras</label>
      <input id="free-form" class="input" placeholder="Ou escreva: ex. ${esc(exemploTexto(tipo))}" autocomplete="off">
      <button class="btn btn-sm" id="free-form-go">Preencher</button>
    </div>
    <div class="files" id="files"></div>
    <div id="outro-tipo"></div>
    <div id="doc-checklist"></div>
    <h2 class="sec">Dados da solicitação</h2>
    <div class="fields" id="fields"></div>
    <div id="fill-res"></div>
    <h2 class="sec">Conferência</h2>
    <div class="checks" id="checks"></div>
    ${(t.dicas || []).length ? `<h2 class="sec">Dicas</h2><ul class="tips">${t.dicas.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
    <div class="dock" id="dock">
      <button class="btn btn-primary" id="btn-fill">${icon('fill', 'ic-sm')} Preencher no portal</button>
      <button class="btn" id="btn-send" title="Mostra o resumo e envia pelo botão do portal">${icon('check', 'ic-sm')} Conferir e enviar</button>
      <details class="more-menu"><summary class="btn btn-ghost" aria-label="Mais ações">${icon('more')}</summary>
        <div class="menu">
          <button type="button" id="btn-copy">${icon('copy', 'ic-sm')} Copiar resumo</button>
          <button type="button" id="btn-model">${icon('star', 'ic-sm')} Salvar como modelo</button>
          <button type="button" id="btn-regen">${icon('refresh', 'ic-sm')} Gerar assunto e descrição de novo</button>
          <button type="button" id="btn-clear">${icon('trash', 'ic-sm')} Limpar o que o assistente guardou</button>
        </div></details>
    </div>
  `;
  bindDrop($('#drop-form'));
  $('#btn-fill').addEventListener('click', () => fillPortal(tipo));
  $('#btn-send').addEventListener('click', () => { S.pedirResumo = true; send({ type: 'requestSubmit' }); });
  $('#btn-copy').addEventListener('click', () => copiarResumo(tipo));
  $('#btn-model').addEventListener('click', () => salvarModeloUI(tipo));
  $('#btn-regen').addEventListener('click', () => { const W = w(tipo); W.editados.delete('assunto'); W.editados.delete('descricao'); gerarTextos(tipo, true); renderFieldsOnly(); updateChecks(); });
  $('#btn-clear').addEventListener('click', () => { S.work[tipo] = null; w(tipo); loadEmpregados(tipo); render(); });
  const ff = () => { const v = $('#free-form').value.trim(); if (v) { entenderTexto(v); } };
  $('#free-form-go').addEventListener('click', ff);
  $('#free-form').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ff(); } });
  document.querySelectorAll('.more-menu .menu button').forEach(b => b.addEventListener('click', () => b.closest('details').removeAttribute('open')));
  renderFilesOnly(); renderFieldsOnly(); updateChecks(); renderFillResult();
}
function exemploTexto(tipo) {
  return ({ afastamento: 'atestado de 20 dias a partir de ontem', avisoFerias: 'férias dia 10/11 por 30 dias', calculoFerias: 'férias a partir de 03/11, 30 dias, adiantar 13º', avisoRescisao: 'pediu demissão hoje', calculoRescisao: 'último dia 20/10, aviso indenizado', rubricas: 'horas extras de outubro', geral: 'preciso da segunda via da guia do FGTS' }[tipo]) || 'descreva o pedido';
}

/* Etapas: documento/descrição → dados → conferência → envio */
function renderStepper(list) {
  const el = $('#stepper'); if (!el) return;
  const W = w(S.ctx.tipo);
  const temBase = W.arquivos.some(a => a.status === 'ok' && !a.removido) || Object.values(W.valores).some(v => v?.fonte && v.fonte !== 'gerado') || Object.keys(portalValores(S.ctx.tipo)).length > 1;
  const faltaDado = list.some(i => i.grupo === 'Campos obrigatórios' && i.nivel === 'erro');
  const pend = list.some(i => i.nivel === 'erro' || i.nivel === 'atencao');
  const steps = [['Documento', temBase], ['Dados', temBase && !faltaDado], ['Conferência', temBase && !faltaDado && !pend], ['Envio', false]];
  const atual = steps.findIndex(x => !x[1]);
  el.innerHTML = steps.map(([n, ok], i) => `<li class="${ok ? 'done' : i === atual ? 'cur' : ''}"><span class="dot">${ok ? icon('check', 'ic-sm') : i + 1}</span>${n}</li>`).join('');
  const send = $('#btn-send'), fill = $('#btn-fill');
  if (send && fill) { const pronto = temBase && !faltaDado; send.classList.toggle('btn-primary', pronto); fill.classList.toggle('btn-primary', !pronto); }
}

/* Checklist de documentos (cadastros e pedidos com vários anexos) */
function renderDocChecklist() {
  const el = $('#doc-checklist'); if (!el) return;
  const t = tipoDef(S.ctx.tipo); const anexos = t.anexos || [];
  if (anexos.length < 3) { el.innerHTML = ''; return; }
  const atuais = anexosAtuais(S.ctx.tipo);
  const W = w(S.ctx.tipo);
  const inapto = W.arquivos.find(a => a.aso?.resultado === 'INAPTO' && !a.removido);
  el.innerHTML = `<div class="card pad doclist"><b class="dl-t">Documentos para enviar</b>
    ${anexos.map(a => { const ok = atuais.some(x => x.documento === a.documento); return `<div class="dl-i ${ok ? 'ok' : ''}"><span class="st">${icon(ok ? 'check' : 'minus', 'ic-sm')}</span><span>${esc(a.rotulo)}${a.obrigatorio ? '' : ' <small class="muted">(se houver)</small>'}</span></div>`; }).join('')}
    ${inapto ? `<div class="note err" style="margin-top:8px">${icon('alert')}<div>O ASO anexado está como <b>INAPTO</b>. Fale com o seu analista antes de seguir com a admissão.</div></div>` : ''}
  </div>`;
}

function renderFilesOnly() {
  const el = $('#files'); if (!el) return;
  const W = w(S.ctx.tipo);
  el.innerHTML = W.arquivos.filter(a => !a.removido).map(a => `
    <div class="file" data-file="${a.id}">
      ${a.status === 'lendo' ? '<div class="spin"></div>' : icon(a.tabela ? 'sheet' : 'file')}
      <div class="nm"><div>${esc(a.nome)}</div><small title="${esc(a.etapa || '')}">${esc(a.etapa || '')}</small>${a.status === 'lendo' ? `<div class="prog"><i style="width:${Math.round(a.progresso * 100)}%"></i></div>` : ''}</div>
      ${a.status === 'ok' ? `<span class="chip ${a.jaAnexado || a.anexado ? 'ok' : 'info'}">${a.jaAnexado || a.anexado ? 'anexado' : 'a anexar'}</span>` : a.status === 'erro' ? '<span class="chip err">erro</span>' : ''}
      <button class="icon-btn" data-rm="${a.id}" aria-label="Remover da lista">${icon('x', 'ic-sm')}</button>
    </div>`).join('');
  el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { const a = W.arquivos.find(x => x.id === b.dataset.rm); if (a) a.removido = true; renderFilesOnly(); updateChecks(); }));
  const outro = W.arquivos.find(a => a.outroTipo && !a.removido);
  const o = $('#outro-tipo');
  if (o) {
    o.innerHTML = outro ? `<div class="note warn">${icon('alert')}<div>“${esc(outro.nome)}” combina mais com <b>${esc(S.rules.tipos[outro.outroTipo]?.nome)}</b>. <button class="btn btn-ghost btn-sm" id="switch-tipo">Mudar para lá</button></div></div>` : '';
    $('#switch-tipo')?.addEventListener('click', async () => {
      const destino = outro.outroTipo;
      const W2 = w(destino); W2.arquivos.push(outro); W.arquivos = W.arquivos.filter(a => a !== outro);
      outro.outroTipo = null;
      await openTipo(destino, { manter: true });
      setTimeout(async () => { await loadEmpregados(destino); outro.analise = E.analyzeText(outro.texto || '', S.rules, { employees: w(destino).empregados, tipoAtual: destino }); applyAnalysis(destino, outro); }, 900);
    });
  }
}

function fieldInput(k, c, cur, W) {
  const v = cur?.valor ?? '';
  const cls = `input ${cur && !W.editados.has(k) && cur.fonte !== 'gerado' ? (cur.conf >= 0.6 ? 'found' : 'low') : ''}`;
  const id = `f-${k}`;
  if (c.tipo === 'radio') {
    const opts = Object.keys(c.seletores || {});
    return `<div class="seg" role="group" aria-label="${esc(c.rotulo)}">${opts.map(o => `<button type="button" data-k="${k}" data-v="${esc(o)}" aria-pressed="${E.norm(o) === E.norm(v)}">${esc(o)}</button>`).join('')}</div>`;
  }
  if (c.tipo === 'textarea') return `<textarea id="${id}" data-k="${k}" class="${cls}" rows="${k === 'descricao' ? 8 : 3}">${esc(v)}</textarea>`;
  const list = W.opcoes[k]?.length ? `list="dl-${k}"` : '';
  const dl = W.opcoes[k]?.length ? `<datalist id="dl-${k}">${W.opcoes[k].map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '';
  const ph = { data: 'DD/MM/AAAA', competencia: 'MM/AAAA', cpf: '000.000.000-00', cep: '00000-000', moeda: '0,00' }[c.tipo] || (c.tipo === 'combo' ? 'Digite ou escolha' : '');
  const im = ['data', 'competencia', 'numero', 'cpf', 'cep', 'pis', 'moeda', 'telefone'].includes(c.tipo) ? 'inputmode="numeric"' : '';
  return `<input id="${id}" data-k="${k}" data-t="${c.tipo}" class="${cls}" value="${esc(v)}" placeholder="${ph}" ${im} ${list} autocomplete="off">${dl}`;
}

function renderFieldsOnly() {
  const el = $('#fields'); if (!el) return;
  const tipo = S.ctx.tipo; const t = tipoDef(tipo); const W = w(tipo);
  const cond = E.activeConditionals(t, valoresParaChecar(tipo));
  const reqCond = new Set(cond.flatMap(c => c.obrigatorios || []));
  const entries = Object.entries(t.campos);
  const isMain = ([k, c]) => c.obrigatorio || reqCond.has(k) || W.valores[k] || c.somenteAssistente || ['assunto', 'descricao'].includes(k);
  const tail = ['assunto', 'descricao', 'conclusao'];
  const main = entries.filter(isMain).sort((a, b) => tail.indexOf(a[0]) - tail.indexOf(b[0]));
  const rest = entries.filter(e => !isMain(e));
  const row = ([k, c]) => {
    const cur = W.valores[k];
    const portal = S.ctx.form?.campos?.[k];
    const disabled = portal?.disabled && !c.somenteAssistente;
    return `<div class="field" ${disabled ? 'style="opacity:.55"' : ''}>
      <label for="f-${k}">${esc(c.rotulo)}${c.obrigatorio || reqCond.has(k) ? '<span class="req">*</span>' : ''}${c.sensivel ? ` <span class="chip warn" title="Dado sensível">sensível</span>` : ''}${c.somenteAssistente ? ' <span class="chip">só no texto</span>' : ''}
      ${cur?.fonte ? `<span class="src" title="${esc(cur.fonte)}">${esc(cur.fonte)}</span>` : portal?.valor ? '<span class="src">no portal</span>' : ''}</label>
      ${fieldInput(k, c, cur || (portal?.valor ? { valor: portal.valor, fonte: 'portal', conf: 1 } : null), W)}
    </div>`;
  };
  const obs = W.valores.observacoes?.valor || '';
  el.innerHTML = main.map(row).join('') +
    (t.descricao?.length ? `<div class="field"><label for="f-obs">Observações para o analista</label><textarea id="f-obs" class="input" rows="2" data-obs="1" placeholder="Algo mais que o escritório precisa saber?">${esc(obs)}</textarea></div>` : '') +
    (t.campos.cid ? `<label class="toggle"><input type="checkbox" id="tg-cid" ${S.prefs.incluirCid ? 'checked' : ''}><span>Incluir CID na descrição<small>Dado de saúde (LGPD). Deixe desligado se não for necessário.</small></span></label>` : '') +
    calcBox(tipo) +
    (rest.length ? `<details class="more"><summary>Mais campos (${rest.length})</summary><div class="fields" style="margin-top:8px">${rest.map(row).join('')}</div></details>` : '');

  const onInput = debounce(() => { gerarTextos(tipo); syncGenerated(); updateChecks(); refreshCalc(); }, 250);
  el.querySelectorAll('input[data-k], textarea[data-k]').forEach(inp => {
    inp.addEventListener('input', () => {
      maskInput(inp);
      const k = inp.dataset.k;
      W.valores[k] = { valor: inp.value, conf: 1, fonte: 'você' }; W.editados.add(k);
      inp.classList.remove('found', 'low');
      onInput();
    });
  });
  el.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k; W.valores[k] = { valor: b.dataset.v, conf: 1, fonte: 'você' }; W.editados.add(k);
    b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    onInput();
  }));
  $('#f-obs')?.addEventListener('input', (e) => { W.valores.observacoes = { valor: e.target.value, conf: 1, fonte: 'você' }; onInput(); });
  $('#tg-cid')?.addEventListener('change', (e) => { S.prefs.incluirCid = e.target.checked; savePrefs(); gerarTextos(tipo); syncGenerated(); });
}
function syncGenerated() {
  const W = w(S.ctx.tipo);
  for (const k of ['assunto', 'descricao']) { const el = $(`#f-${k}`); if (el && document.activeElement !== el && W.valores[k]) el.value = W.valores[k].valor; }
}
function maskInput(inp) {
  const t = inp.dataset.t; const d = inp.value.replace(/\D/g, '');
  if (t === 'data') inp.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  else if (t === 'competencia') inp.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2, 6)}` : d;
  else if (t === 'cpf' && d.length === 11) inp.value = E.fmtCPF(d);
  else if (t === 'cep' && d.length === 8) inp.value = E.fmtCEP(d);
}

function calcBox(tipo) {
  const v = valoresParaChecar(tipo); const d = E.derived(tipo, v, S.rules);
  const items = [];
  if (d.retorno) items.push(['Último dia de gozo', d.fimGozo], ['Retorno ao trabalho', d.retorno], ['Pagar até', d.pagamentoAte]);
  if (tipo === 'avisoFerias' && d.avisoAte) items.push(['Avisar até', d.avisoAte]);
  if (d.dataRetorno) items.push(['Retorno previsto', d.dataRetorno]);
  if (d.inicioInss) items.push(['A partir do 16º dia (INSS)', d.inicioInss]);
  if (tipo === 'calculoRescisao' && d.pagamentoAte) items.push(['Pagamento das verbas até', d.pagamentoAte]);
  if (d.diasAviso) items.push(['Aviso prévio', `${d.diasAviso} dias`]);
  return `<div id="calc">${items.length ? `<div class="calc">${items.map(([a, b]) => `<div>${esc(a)}: <b>${esc(b)}</b></div>`).join('')}</div>` : ''}</div>`;
}
function refreshCalc() { const el = $('#calc'); if (el) el.outerHTML = calcBox(S.ctx.tipo); }

let lastChecks = [];
function updateChecks() {
  const el = $('#checks'); if (!el || !S.ctx.tipo) return;
  const tipo = S.ctx.tipo;
  const vals = valoresParaChecar(tipo);
  const ausentes = Object.entries(S.ctx.form?.campos || {}).filter(([, v]) => !v.existe).map(([k]) => k);
  const list = E.runChecks(tipo, vals, anexosAtuais(tipo), S.rules, E.today(), { ausentes });
  lastChecks = list;
  const c = E.summarizeChecks(list);
  const total = list.filter(i => i.nivel !== 'info').length || 1;
  const bar = $('#bar'); if (bar) { bar.querySelector('i').style.width = `${Math.round(c.ok / total * 100)}%`; bar.classList.toggle('has-err', c.erro > 0); }
  const bt = $('#bar-txt'); if (bt) bt.textContent = `${c.ok}/${total} ok`;
  const groups = {};
  list.forEach(i => (groups[i.grupo] = groups[i.grupo] || []).push(i));
  const ico = { ok: 'check', erro: 'x', atencao: 'alert', info: 'info' };
  const order = { erro: 0, atencao: 1, info: 2, ok: 3 };
  el.innerHTML = Object.entries(groups).map(([g, items]) => `<div class="grp">${esc(g)}</div>` + items.sort((a, b) => order[a.nivel] - order[b.nivel]).map(i => `
    <button type="button" class="chk ${i.nivel}" ${i.campo ? `data-campo="${esc(i.campo)}"` : ''}><span class="st">${icon(ico[i.nivel], 'ic-sm')}</span><span>${esc(i.mensagem)}</span></button>`).join('')).join('') || '<p class="muted">Sem verificações para esta solicitação.</p>';
  el.querySelectorAll('[data-campo]').forEach(b => b.addEventListener('click', () => {
    const def = tipoDef(tipo).campos[b.dataset.campo];
    if (def && !def.somenteAssistente) send({ type: 'highlight', locator: def });
    $(`#f-${b.dataset.campo}`)?.focus();
  }));
  const dot = $('#dot-preencher'); if (dot) { dot.hidden = !c.erro; dot.textContent = c.erro || ''; }
  renderStepper(list); renderDocChecklist();
}

async function fillPortal(tipo, { silencioso = false } = {}) {
  const W = w(tipo); const t = tipoDef(tipo);
  gerarTextos(tipo);
  const values = {};
  for (const [k, v] of Object.entries(W.valores)) if (t.campos[k] && !t.campos[k].somenteAssistente && v?.valor) values[k] = v.valor;
  // padrões das regras (ex.: país Brasil) só se vazio no portal
  for (const [k, c] of Object.entries(t.campos)) if (c.padrao && !values[k] && !portalValores(tipo)[k]) values[k] = c.padrao;
  // condicionais que definem valores (ex.: pedido de demissão → aviso dado pelo empregado)
  for (const c of E.activeConditionals(t, { ...portalValores(tipo), ...values })) for (const [k, v] of Object.entries(c.valores || {})) if (!values[k] && !W.editados.has(k)) values[k] = v;
  const files = W.arquivos.filter(a => !a.removido && !a.jaAnexado && !a.anexado && !a.outroTipo && a.status !== 'lendo').map(a => a.file);
  const btn = $('#btn-fill'); if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Preenchendo…'; }
  const packed = await packFiles(files);
  const r = await request({ type: 'fill', tipo, values, files: packed, opts: { naoSobrescrever: false } }, 60000, packed.map(p => p.buf));
  if (btn) { btn.disabled = false; btn.innerHTML = `${icon('fill', 'ic-sm')} Preencher no portal`; }
  if (r?.anexados) W.arquivos.forEach(a => { if (files.includes(a.file)) a.anexado = true; });
  W.resultados = r;
  await salvarHistorico(tipo, 'preenchido');
  if (S.view === 'preencher') { renderFilesOnly(); renderFillResult(); updateChecks(); }
  if (!silencioso || r?.resultados?.some(x => !x.ok)) { /* resultado já exibido no painel */ }
  if (r?.resultados) toast(`${r.resultados.filter(x => x.ok).length} campo(s) preenchido(s)${r.anexados ? ` · ${r.anexados} anexo(s)` : ''}. Confira antes de enviar.`);
}
function renderFillResult() {
  const el = $('#fill-res'); if (!el) return;
  const r = w(S.ctx.tipo).resultados; if (!r?.resultados) { el.innerHTML = ''; return; }
  const t = tipoDef(S.ctx.tipo);
  const falhas = r.resultados.filter(x => !x.ok);
  const ok = r.resultados.filter(x => x.ok).length;
  el.innerHTML = `<div class="note ${falhas.length ? 'warn' : 'ok'}" style="margin-top:10px">${icon(falhas.length ? 'alert' : 'check')}<div>
    <b>${ok} campo(s) preenchido(s)${r.anexados ? ` e ${r.anexados} anexo(s)` : ''}.</b> Revise na tela e clique em ${esc((t.botaoEnviar || 'ADICIONAR'))} quando estiver tudo certo.
    ${falhas.length ? `<ul class="tips" style="margin-top:6px">${falhas.map(f => `<li>${esc(t.campos[f.campo]?.rotulo || f.campo)}: ${esc(f.motivo)}</li>`).join('')}</ul>` : ''}</div></div>`;
}

/* =================== Antes de enviar =================== */
function onSubmitAttempt(m) {
  S.ctx.form = m.form; S.ctx.tipo = m.tipo;
  const tipo = m.tipo;
  const pediu = S.pedirResumo; S.pedirResumo = false;
  if (!tipo) { send({ type: 'confirmSubmit' }); return; }
  const vals = valoresParaChecar(tipo);
  const ausentes = Object.entries(m.form?.campos || {}).filter(([, v]) => !v.existe).map(([k]) => k);
  const list = E.runChecks(tipo, vals, anexosAtuais(tipo), S.rules, E.today(), { ausentes }).filter(i => i.nivel === 'erro' || i.nivel === 'atencao');
  if (!list.length && !pediu) { S.ultimoEnvio = { tipo, quando: Date.now() }; send({ type: 'confirmSubmit' }); return; }
  const bloqueia = S.rules.config?.bloquearEnvioComPendencias && list.some(i => i.nivel === 'erro');
  const t = tipoDef(tipo);
  const principais = Object.entries(t.campos).filter(([k, c]) => vals[k] && !['assunto', 'descricao', 'observacoes'].includes(k) && !c.sensivel).slice(0, 8);
  const anexos = anexosAtuais(tipo);
  const modal = $('#modal');
  modal.hidden = false;
  modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mh">
    <h3 id="mh">${list.length ? 'Antes de enviar' : 'Tudo pronto para enviar'}</h3>
    <p class="muted" style="margin:0 0 10px">${esc(list.length ? (S.rules.mensagens?.envioComPendencias || '') : 'Confira o resumo. O envio é feito pelo próprio portal.')}</p>
    <div class="resumo card pad"><b>${esc(vals.assunto || t.nome)}</b>
      <dl class="kv" style="margin-top:6px">${principais.map(([k, c]) => `<dt>${esc(c.rotulo)}</dt><dd>${esc(vals[k])}</dd>`).join('')}
      <dt>Anexos</dt><dd>${anexos.length ? esc(anexos.map(a => a.nome).join(', ')) : 'nenhum'}</dd></dl></div>
    ${list.length ? `<div class="checks" style="margin-top:10px">${list.map(i => `<div class="chk ${i.nivel}"><span class="st">${icon(i.nivel === 'erro' ? 'x' : 'alert', 'ic-sm')}</span><span>${esc(i.mensagem)}</span></div>`).join('')}</div>` : ''}
    <div class="actions" style="margin-top:14px">
      ${list.length ? '<button class="btn btn-primary" id="m-fix">Corrigir agora</button>' : '<button class="btn btn-primary" id="m-send">Enviar ao escritório</button><button class="btn" id="m-fix">Voltar</button>'}
      ${list.length && !bloqueia ? '<button class="btn" id="m-send">Enviar assim mesmo</button>' : ''}
    </div></div>`;
  const close = () => { modal.hidden = true; modal.innerHTML = ''; };
  $('#m-fix').addEventListener('click', () => { close(); setView('preencher'); });
  $('#m-send')?.addEventListener('click', () => { close(); S.ultimoEnvio = { tipo, quando: Date.now() }; send({ type: 'confirmSubmit' }); });
  ($('#m-send') && !list.length ? $('#m-send') : $('#m-fix')).focus();
}
function textoResumo(tipo) {
  const v = valoresParaChecar(tipo); const t = tipoDef(tipo);
  const anexos = anexosAtuais(tipo).map(a => a.nome);
  return [`${t.nome} — ${S.ctx.empresa}`, v.assunto, v.descricao, anexos.length ? `Anexos: ${anexos.join(', ')}` : ''].filter(Boolean).join('\n');
}
async function copiarResumo(tipo) {
  const txt = textoResumo(tipo);
  try { await navigator.clipboard.writeText(txt); toast('Resumo copiado.'); }
  catch { const m = $('#modal'); m.hidden = false; m.innerHTML = `<div class="sheet"><h3>Resumo</h3><textarea class="input" rows="8" id="m-txt">${esc(txt)}</textarea><div class="actions" style="margin-top:10px"><button class="btn btn-primary" id="m-ok">Fechar</button></div></div>`; $('#m-txt').select(); $('#m-ok').addEventListener('click', () => { m.hidden = true; m.innerHTML = ''; }); }
}

/* =================== Modelos =================== */
const PESSOAIS = new Set(['empregado', 'nome', 'nomeSocial', 'cpf', 'pis', 'rg', 'orgaoRg', 'ufRg', 'dataRg', 'titulo', 'zona', 'secao', 'reservista', 'cnh', 'cnhCategoria', 'cnhValidade', 'mae', 'pai', 'conjuge', 'nascimento', 'email', 'telefone', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'municipio', 'uf', 'cid', 'medico', 'numeroCat', 'agencia', 'conta', 'digitoConta', 'assunto', 'descricao', 'ctpsNumero', 'ctpsSerie']);
async function salvarModeloUI(tipo) {
  const t = tipoDef(tipo); const v = valoresAssistente(tipo);
  const valores = Object.fromEntries(Object.entries({ ...v, ...portalValores(tipo) }).filter(([k]) => !PESSOAIS.has(k) && t.campos[k]?.tipo !== 'data' && t.campos[k]?.tipo !== 'competencia' || k === 'observacoes' || k === 'tabelaRubricas'));
  const m = $('#modal'); m.hidden = false;
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mm"><h3 id="mm">Salvar como modelo</h3>
    <p class="muted" style="margin:0 0 10px">Guarda o que se repete (tipo, textos, rubricas), sem dados pessoais nem datas. Fica só neste computador.</p>
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
async function renderModelosInicio() {
  const el = $('#modelos-ini'); if (!el) return;
  const { modelos = [] } = await chrome.storage.local.get('modelos');
  if (!modelos.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<h2 class="sec">Seus modelos</h2><div class="list">${modelos.map(md => `
    <div class="li"><div class="main"><b>${esc(md.nome)}</b><small>${esc(S.rules.tipos[md.tipo]?.nome || md.tipo)}</small></div>
      <button class="btn btn-sm" data-use="${md.id}">Usar</button><button class="icon-btn" data-del="${md.id}" aria-label="Apagar modelo ${esc(md.nome)}" style="color:var(--ink-3)">${icon('trash', 'ic-sm')}</button></div>`).join('')}</div>`;
  el.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', async () => {
    const md = modelos.find(x => x.id === b.dataset.use); if (!md) return;
    const W = w(md.tipo);
    for (const [k, v] of Object.entries(md.valores)) W.valores[k] = { valor: v, conf: 1, fonte: 'modelo' };
    gerarTextos(md.tipo, true);
    await openTipo(md.tipo, { manter: true });
    if (S.prefs.preencherAoLer) setTimeout(() => fillPortal(md.tipo, { silencioso: true }), 900);
  }));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.style.color = 'var(--brand-red)'; b.setAttribute('aria-label', 'Clique de novo para apagar'); setTimeout(() => { delete b.dataset.confirm; b.style.color = 'var(--ink-3)'; }, 3000); return; }
    await chrome.storage.local.set({ modelos: modelos.filter(x => x.id !== b.dataset.del) }); renderModelosInicio();
  }));
}

async function onFormClosed() {
  if (S.ultimoEnvio && Date.now() - S.ultimoEnvio.quando < 60000) {
    const tipo = S.ultimoEnvio.tipo;
    await salvarHistorico(tipo, 'enviado');
    S.work[tipo] = null; S.ultimoEnvio = null;
    toast('Solicitação enviada. Os próximos prazos estão na Agenda.');
    if (S.view === 'preencher') render();
  }
}

/* =================== Histórico =================== */
async function salvarHistorico(tipo, status) {
  const W = w(tipo);
  const valores = { ...valoresAssistente(tipo), ...portalValores(tipo) };
  if (!Object.keys(valores).length) return;
  const { historico = [] } = await chrome.storage.local.get('historico');
  const chave = `${S.ctx.empresa}|${tipo}|${valores.empregado || valores.nome || ''}`;
  const prev = historico.findIndex(h => h.chave === chave && h.status === 'preenchido' && Date.now() - h.quando < 6 * 3600e3);
  const item = { chave, quando: Date.now(), empresa: S.ctx.empresa, tipo, status, resumo: valores.assunto || S.rules.tipos[tipo]?.nome, valores, anexos: W.arquivos.filter(a => !a.removido).map(a => a.nome) };
  delete item.valores.cid;
  if (prev >= 0) historico.splice(prev, 1);
  historico.unshift(item);
  await chrome.storage.local.set({ historico: historico.slice(0, 200) });
}
/* Prazos que nascem das solicitações já preenchidas/enviadas */
function prazosDoHistorico(historico) {
  const cal = E.makeCalendar(S.rules.feriados); const hoje = E.today(); const out = [];
  const dd = (x) => E.parseDate(x);
  const add = (d, titulo, h, detalhe) => { if (d && E.diffDays(hoje, d) >= -7 && E.diffDays(hoje, d) <= 120) out.push({ d, titulo, h, detalhe }); };
  const precisa = S.rules.config?.prazoInternoDiasUteis?.calculo || 5;
  for (const h of historico) {
    const v = h.valores || {}; const quem = v.empregado || v.nome || '';
    switch (h.tipo) {
      case 'avisoFerias': { const i = dd(v.inicioGozo); if (!i) break; const pag = E.addDays(i, -2);
        add(cal.addBusinessDays(pag, -precisa), 'Enviar o Cálculo de Férias', h, quem);
        add(pag, 'Pagamento das férias (limite)', h, quem); add(i, 'Início das férias', h, quem);
        if (+v.diasGozo) add(E.addDays(i, +v.diasGozo), 'Retorno das férias', h, quem); break; }
      case 'calculoFerias': { const i = dd(v.inicioGozo); if (!i) break; add(E.addDays(i, -2), 'Pagamento das férias (limite)', h, quem); if (+v.diasGozo) add(E.addDays(i, +v.diasGozo), 'Retorno das férias', h, quem); break; }
      case 'afastamento': { const i = dd(v.dataAfastamento); if (!i || !+v.dias) break; add(E.addDays(i, +v.dias), 'Retorno do afastamento', h, quem); if (+v.dias > 15) add(E.addDays(i, 15), 'Encaminhamento ao INSS (16º dia)', h, quem); break; }
      case 'avisoRescisao': { const i = dd(v.dataAviso); if (!i) break; add(E.addDays(i, 29), 'Fim do aviso trabalhado (30 dias)', h, quem); break; }
      case 'calculoRescisao': { const i = dd(v.dataDemissao); if (!i) break; add(E.addDays(i, 10), 'Pagamento das verbas rescisórias (limite)', h, quem); break; }
      case 'cadastroEmpregado': { const i = dd(v.dataAdmissao); const e1 = +v.contratoExperiencia; if (!i || !e1) break;
        add(E.addDays(i, e1 - 1), 'Fim do 1º período de experiência', h, quem);
        if (+v.prorrogacao) add(E.addDays(i, e1 + +v.prorrogacao - 1), 'Fim da prorrogação da experiência', h, quem); break; }
      default: break;
    }
  }
  return out.sort((a, b) => a.d - b.d);
}
async function renderHistorico() {
  const { historico = [] } = await chrome.storage.local.get('historico');
  const prazos = prazosDoHistorico(historico.filter(h => h.status === 'enviado' || h.status === 'preenchido'));
  const hoje = E.today();
  const quando = (d) => { const n = E.diffDays(hoje, d); return n < 0 ? ['err', `há ${-n} dia(s)`] : n === 0 ? ['warn', 'hoje'] : n <= 7 ? ['warn', `em ${n} dia(s)`] : ['info', `em ${n} dias`]; };
  viewEl.innerHTML = `
    <p class="hello">Agenda</p>
    <p class="lead">Prazos que vêm das solicitações feitas com o Assistente neste computador.</p>
    ${prazos.length ? `<div class="agenda">${prazos.map(p => { const [c, txt] = quando(p.d); return `
      <div class="ag-i"><div class="ag-d"><b>${String(p.d.getDate()).padStart(2, '0')}</b><small>${p.d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></div>
        <div class="main"><b>${esc(p.titulo)}</b><small>${esc(p.detalhe || '')}${p.detalhe ? ' · ' : ''}${esc(S.rules.tipos[p.h.tipo]?.nome || '')}</small></div>
        <span class="chip ${c}">${txt}</span></div>`; }).join('')}</div>` : `<div class="empty" style="padding:16px">${icon('calc', 'ic-lg')}<p>Sem prazos por enquanto. Eles aparecem quando você preenche férias, afastamentos, rescisões ou admissões.</p></div>`}
    <h2 class="sec">Histórico</h2>
    ${historico.length ? `<p class="muted" style="margin:0 0 8px;font-size:12px">Clique para reaproveitar os dados em uma nova solicitação.</p><div class="list">${historico.map((h, i) => `
      <button class="li" type="button" data-i="${i}" style="text-align:left;cursor:pointer">
        <div class="main"><b>${esc(h.resumo)}</b><small>${esc(S.rules.tipos[h.tipo]?.nome || h.tipo)} · ${esc(h.empresa)} · ${new Date(h.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></div>
        <span class="chip ${h.status === 'enviado' ? 'ok' : 'info'}">${h.status}</span>
      </button>`).join('')}</div>
    <div class="actions" style="margin-top:12px"><button class="btn btn-ghost" id="h-clear">${icon('trash', 'ic-sm')} Limpar histórico</button></div>` : '<p class="muted">As solicitações que você preencher com o Assistente aparecem aqui.</p>'}`;
  viewEl.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', async () => {
    const h = historico[+b.dataset.i];
    const W = w(h.tipo);
    for (const [k, v] of Object.entries(h.valores)) if (!['assunto', 'descricao'].includes(k)) W.valores[k] = { valor: v, conf: 1, fonte: 'histórico' };
    gerarTextos(h.tipo, true);
    await openTipo(h.tipo, { manter: true });
  }));
  $('#h-clear')?.addEventListener('click', async () => {
    const b = $('#h-clear');
    if (b.dataset.confirm) { await chrome.storage.local.set({ historico: [] }); renderHistorico(); }
    else { b.dataset.confirm = '1'; b.innerHTML = `${icon('alert', 'ic-sm')} Clique de novo para confirmar`; setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.innerHTML = `${icon('trash', 'ic-sm')} Limpar histórico`; } }, 4000); }
  });
}

/* =================== Pendências =================== */
async function renderPendencias(force = false) {
  if (standalone) { viewEl.innerHTML = `<div class="empty">${icon('bell', 'ic-lg')}<p>Abra o Portal do Cliente para ver suas solicitações.</p></div>`; return; }
  const tipos = Object.entries(S.rules.tipos).filter(([, t]) => t.api).map(([key, t]) => ({ key, api: t.api }));
  if (!S.pend || force) {
    viewEl.innerHTML = `<div class="empty"><div class="spin" style="margin:0 auto 8px"></div>Consultando suas solicitações…</div>`;
    const r = await request({ type: 'pendencias', tipos }, 30000);
    S.pend = r?.data || [];
  }
  const rows = S.pend.filter(p => !p.erro);
  const aguardando = rows.reduce((a, p) => a + (p.itens || []).filter(i => i.aguardando).length, 0);
  const abertas = rows.reduce((a, p) => a + (p.itens || []).filter(i => i.pendente).length, 0);
  send({ type: 'setBadge', n: aguardando });
  const dot = $('#dot-pend'); dot.hidden = !aguardando; dot.textContent = aguardando;
  viewEl.innerHTML = `
    <div class="row2">
      <div class="card pad"><div class="num" style="text-align:left;color:var(--brand-red)">${aguardando}</div><small class="muted">aguardando você</small></div>
      <div class="card pad"><div class="num" style="text-align:left">${abertas}</div><small class="muted">em andamento</small></div>
    </div>
    ${aguardando ? `<div class="note warn">${icon('alert')}<div>Há solicitação esperando sua resposta. Abra, leia o último trâmite e responda — e lembre: quem conclui a solicitação é você.</div></div>` : ''}
    <h2 class="sec">Por tipo</h2>
    <div class="list">${rows.map(p => {
      const t = S.rules.tipos[p.tipo];
      const ag = (p.itens || []).filter(i => i.aguardando).length;
      const ab = (p.itens || []).filter(i => i.pendente).length;
      return `<button class="li" type="button" data-slug="${esc(t.slug)}" style="cursor:pointer;text-align:left">
        <div class="main"><b>${esc(t.nome)}</b><small>${p.total || 0} no total${ab ? ` · ${ab} em andamento` : ''}</small></div>
        ${ag ? `<span class="chip err">${ag} aguardando</span>` : ''}${icon('arrow', 'ic-sm')}</button>`;
    }).join('')}</div>
    <p class="muted" style="font-size:11.5px">Leitura feita com o seu próprio acesso ao portal. ${S.pend.some(p => p.erro) ? 'Alguns tipos não puderam ser consultados.' : ''}</p>
    <button class="btn btn-ghost" id="p-ref">${icon('refresh', 'ic-sm')} Atualizar</button>`;
  viewEl.querySelectorAll('[data-slug]').forEach(b => b.addEventListener('click', () => request({ type: 'navigate', slug: b.dataset.slug, add: false })));
  $('#p-ref').addEventListener('click', () => renderPendencias(true));
}

/* =================== Calculadoras =================== */
const TOOLS = { ferias: 'Férias', aviso: 'Aviso prévio', rescisao: 'Rescisão', afast: 'Afastamento', exp: 'Experiência', uteis: 'Dias úteis' };
function renderFerramentas() {
  viewEl.innerHTML = `<div class="tool-tabs" role="group" aria-label="Calculadoras">${Object.entries(TOOLS).map(([k, l]) => `<button type="button" data-t="${k}" aria-pressed="${S.ferramenta === k}">${l}</button>`).join('')}</div>
    <div class="card pad" id="tool"></div>
    <p class="muted" style="font-size:11.5px">Cálculos de apoio com base na CLT e nos feriados nacionais cadastrados nas regras. O cálculo oficial é feito pelo escritório.</p>`;
  viewEl.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { S.ferramenta = b.dataset.t; renderFerramentas(); }));
  const tool = $('#tool');
  const cal = E.makeCalendar(S.rules.feriados);
  const F = (id, label, ph = 'DD/MM/AAAA', t = 'data') => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" data-t="${t}" placeholder="${ph}" inputmode="numeric"></div>`;
  const out = '<div class="calc" id="out" style="margin-top:12px"><span class="muted">Preencha os campos acima.</span></div>';
  const forms = {
    ferias: `<div class="row2">${F('a', 'Início do gozo')}${F('b', 'Dias de gozo', '30', 'numero')}</div>${F('c', 'Dias de abono (opcional)', '0', 'numero')}${out}`,
    aviso: `<div class="row2">${F('a', 'Data de admissão')}${F('b', 'Data do aviso')}</div>${out}`,
    rescisao: F('a', 'Último dia de trabalho') + out,
    afast: `<div class="row2">${F('a', 'Início do afastamento')}${F('b', 'Dias de atestado', '15', 'numero')}</div>${out}`,
    exp: `<div class="row2">${F('a', 'Data de admissão')}${F('b', '1º período (dias)', '45', 'numero')}</div>${F('c', 'Prorrogação (dias)', '45', 'numero')}${out}`,
    uteis: `<div class="row2">${F('a', 'De')}${F('b', 'Até')}</div>${out}`
  };
  tool.innerHTML = forms[S.ferramenta];
  const g = (id) => $('#' + id)?.value || '';
  const show = (rows, notes = []) => { $('#out').innerHTML = rows.map(([l, v]) => `<div>${esc(l)}: <b>${esc(v)}</b></div>`).join('') + notes.map(n => `<div style="margin-top:6px;color:var(--warn)">${icon('alert', 'ic-sm')} ${esc(n)}</div>`).join(''); };
  const calc = () => {
    const a = E.parseDate(g('a')), b = E.parseDate(g('b')), nb = parseInt(g('b'), 10), nc = parseInt(g('c'), 10) || 0;
    switch (S.ferramenta) {
      case 'ferias': {
        if (!a || !nb) return;
        const notes = [];
        if ([1, 2].some(n => { const x = E.addDays(a, n); return x.getDay() === 0 || cal.isHoliday(x); })) notes.push(`Início em ${E.weekday(a)}: não pode ser nos 2 dias antes de feriado ou domingo (CLT 134 §3º).`);
        if (nb < 5 || nb > 30) notes.push('Cada período deve ter de 5 a 30 dias.');
        if (nc > 10 || nb + nc > 30) notes.push('Abono de no máximo 10 dias e gozo + abono até 30.');
        if (E.diffDays(E.today(), a) < 30) notes.push('Faltam menos de 30 dias: o aviso deveria ter sido dado com 30 dias de antecedência.');
        show([['Último dia de gozo', E.fmtDate(E.addDays(a, nb - 1))], ['Retorno', `${E.fmtDate(E.addDays(a, nb))} (${E.weekday(E.addDays(a, nb))})`], ['Dar o aviso até', E.fmtDate(E.addDays(a, -30))], ['Pagar até', E.fmtDate(E.addDays(a, -2))], ['Enviar cálculo ao escritório até', E.fmtDate(cal.addBusinessDays(E.addDays(a, -2), -(S.rules.config?.prazoInternoDiasUteis?.calculo || 5)))]], notes);
        break;
      }
      case 'aviso': {
        if (!a || !b) return;
        let anos = b.getFullYear() - a.getFullYear(); const m = new Date(a); m.setFullYear(b.getFullYear()); if (m > b) anos--;
        anos = Math.max(0, anos);
        const dias = Math.min(90, 30 + 3 * anos);
        show([['Anos completos', String(anos)], ['Dias de aviso prévio', `${dias} dias (Lei 12.506/2011)`], ['Fim do aviso (se trabalhado 30 dias)', E.fmtDate(E.addDays(b, 29))], ['Projeção total do aviso', E.fmtDate(E.addDays(b, dias - 1))]], dias > 30 ? ['O aviso trabalhado é de 30 dias; os dias adicionais são indenizados.'] : []);
        break;
      }
      case 'rescisao': {
        if (!a) return;
        const pg = E.addDays(a, 10);
        const env = cal.addBusinessDays(pg, -(S.rules.config?.prazoInternoDiasUteis?.calculo || 5));
        show([['Pagar as verbas até', `${E.fmtDate(pg)} (${E.weekday(pg)})`], ['Enviar ao escritório até', E.fmtDate(env)]], env < E.today() ? ['O prazo ideal de envio já passou — envie o quanto antes e avise seu analista.'] : []);
        break;
      }
      case 'afast': {
        if (!a || !nb) return;
        const rows = [['Retorno previsto', E.fmtDate(E.addDays(a, nb))], ['Dias pagos pela empresa', String(Math.min(15, nb))]];
        if (nb > 15) rows.push(['Encaminhar ao INSS a partir de', E.fmtDate(E.addDays(a, 15))], ['Dias a cargo do INSS', String(nb - 15)]);
        show(rows);
        break;
      }
      case 'exp': {
        if (!a || !nb) return;
        const f1 = E.addDays(a, nb - 1); const rows = [['Fim do 1º período', E.fmtDate(f1)]];
        if (nc) rows.push(['Fim da prorrogação', E.fmtDate(E.addDays(a, nb + nc - 1))]);
        show(rows, nb + nc > 90 ? ['O contrato de experiência não pode passar de 90 dias no total.'] : []);
        break;
      }
      case 'uteis': {
        if (!a || !b) return;
        show([['Dias corridos', String(E.diffDays(a, b))], ['Dias úteis', String(cal.businessDaysBetween(a, b))]]);
        break;
      }
      default: break;
    }
  };
  tool.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { maskInput(i); calc(); }));
}

/* =================== Configurações =================== */
async function renderConfig() {
  const info = await chrome.runtime.sendMessage({ type: 'getSettings' });
  const pack = await chrome.runtime.sendMessage({ type: 'getRules' });
  const s = info.settings;
  const origemTxt = { dev: 'servidor de desenvolvimento (sua pasta)', remota: 'arquivo remoto', cache: 'cópia salva do arquivo remoto', embutida: 'regras que vieram com a extensão' }[pack.origem] || pack.origem;
  viewEl.innerHTML = `
    <p class="hello">Configurações</p>
    <h2 class="sec">Preferências</h2>
    <div class="card pad">
      <label class="toggle"><input type="checkbox" data-p="preencherAoLer" ${S.prefs.preencherAoLer ? 'checked' : ''}><span>Preencher o portal assim que ler um documento<small>Você sempre revisa antes de enviar.</small></span></label>
      <label class="toggle"><input type="checkbox" data-p="ocrAutomatico" ${S.prefs.ocrAutomatico ? 'checked' : ''}><span>Ler fotos e PDFs escaneados (OCR)<small>Pode levar alguns segundos por página.</small></span></label>
      <label class="toggle"><input type="checkbox" data-p="incluirCid" ${S.prefs.incluirCid ? 'checked' : ''}><span>Incluir CID nas descrições<small>Dado de saúde — mantenha desligado se não for exigido.</small></span></label>
      <label class="toggle"><input type="checkbox" data-p="usarIa" ${S.prefs.usarIa ? 'checked' : ''}><span>Usar a IA do próprio Chrome quando disponível<small>${await aiAvailable() ? 'Disponível neste computador. Roda localmente.' : 'Não disponível neste Chrome — sem efeito.'}</small></span></label>
    </div>
    <h2 class="sec">Regras</h2>
    <div class="card pad">
      <dl class="kv"><dt>Versão</dt><dd>${esc(pack.versao)}</dd><dt>Origem</dt><dd>${esc(origemTxt)}</dd><dt>Atualizado</dt><dd>${new Date(pack.atualizadoEm).toLocaleString('pt-BR')}</dd></dl>
      ${pack.erro ? `<div class="note warn" style="margin-top:10px">${icon('alert')}<div>${esc(pack.erro)}</div></div>` : ''}
      <div class="field" style="margin-top:12px"><label for="rules-url">Endereço do arquivo de regras (GitHub)</label>
        <input class="input mono" id="rules-url" placeholder="https://raw.githubusercontent.com/usuario/repo/main/rules/regras.json" value="${esc(s.rulesUrl)}"></div>
      <div class="actions" style="margin-top:10px">
        <button class="btn btn-primary" id="save-url">Salvar endereço</button>
        <button class="btn" id="refresh-rules">${icon('refresh', 'ic-sm')} Atualizar agora</button>
      </div>
    </div>
    <h2 class="sec dev-only">Desenvolvimento</h2>
    <div class="card pad dev-only">
      <dl class="kv"><dt>Instalada como</dt><dd>${info.unpacked ? 'pasta (modo desenvolvedor)' : 'loja / pacote'}</dd>
      <dt>Recarga automática</dt><dd>${info.dev ? (info.devConectado ? 'ligada e conectada' : 'ligada — servidor dev não está rodando') : 'desligada'}</dd>
      <dt>Extensão</dt><dd>v${esc(info.versaoExtensao)}</dd></dl>
      <div class="field" style="margin-top:10px"><label>Recarga automática</label>
        <div class="seg" role="group">${['auto', 'on', 'off'].map(v => `<button type="button" data-dev="${v}" aria-pressed="${s.devMode === v}">${{ auto: 'Automática', on: 'Sempre', off: 'Desligada' }[v]}</button>`).join('')}</div></div>
      <div class="actions" style="margin-top:10px"><button class="btn" id="reload-ext">${icon('refresh', 'ic-sm')} Recarregar extensão</button></div>
    </div>
    <div class="actions" style="margin-top:14px"><button class="btn" id="intro-again">${icon('info', 'ic-sm')} Ver a introdução de novo</button></div>
    <div class="note" style="margin-top:14px">${icon('lock')}<div>${esc(S.rules.mensagens?.privacidade || '')}</div></div>`;
  viewEl.querySelectorAll('[data-p]').forEach(i => i.addEventListener('change', () => { S.prefs[i.dataset.p] = i.checked; savePrefs(); }));
  $('#save-url').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'setSettings', settings: { rulesUrl: $('#rules-url').value.trim() } }); await loadRules(); renderConfig(); });
  $('#refresh-rules').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'refreshRules' }); await loadRules(); renderConfig(); });
  viewEl.querySelectorAll('[data-dev]').forEach(b => b.addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'setSettings', settings: { devMode: b.dataset.dev } }); renderConfig(); }));
  $('#reload-ext')?.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'reloadExtension' }));
  $('#intro-again').addEventListener('click', () => { S.prefs.introVista = false; savePrefs(); setView('inicio'); });
  if (info.simulador) viewEl.querySelectorAll('.dev-only').forEach(e => e.remove());
}

/* =================== Início =================== */
(async () => {
  syncThemeIcon();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeIcon);
  if (standalone) { $('#btn-close').hidden = true; document.body.style.maxWidth = '520px'; document.body.style.margin = '0 auto'; }
  await Promise.all([loadRules(), loadPrefs()]);
  const hash = location.hash.slice(1);
  if (hash && ['config', 'ferramentas', 'historico'].includes(hash)) setView(hash); else render();
  if (!standalone) setTimeout(async () => { const tipos = Object.entries(S.rules.tipos).filter(([, t]) => t.api).map(([key, t]) => ({ key, api: t.api })); const r = await request({ type: 'pendencias', tipos }, 30000); if (r?.data) { S.pend = r.data; const n = r.data.reduce((a, p) => a + (p.itens || []).filter(i => i.aguardando).length, 0); send({ type: 'setBadge', n }); const d = $('#dot-pend'); d.hidden = !n; d.textContent = n; } }, 2500);
})();
