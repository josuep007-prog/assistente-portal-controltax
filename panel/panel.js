import * as E from './engine.js';
import { readFile, aiExtract, aiAvailable, libsPresentes } from './extract.js';
import { montarPlataforma } from './plataforma.js';
import { renderSimulacao } from './calcular.js';

/* =================== Estado =================== */
const params = new URLSearchParams(location.search);
const standalone = params.has('standalone');
const S = {
  rules: null, meta: {}, prefs: {}, settingsInfo: null,
  ctx: { route: {}, tipo: null, empresa: '', form: null },
  view: 'inicio', port: null,
  modo: null,            // 'plataforma' (tela cheia por cima do portal) ou 'painel' (encaixado ao lado)
  work: {},              // por tipo: { valores, arquivos, editados, empregados, opcoes }
  sugestao: null,        // documento lido fora de formulário
  pend: null, pendLoading: false,
  ultimoEnvio: null,
  ferramenta: 'simRescisao',
  rulesBase: null,       // regras sem os ajustes da empresa
  historico: [],         // cópia em memória do histórico (para recentes e pedidos repetidos)
  equipe: new Map()      // empresa → [{ nome, admissao, ativo }] (datas de admissão para os alertas de experiência)
};
const DEFAULT_PREFS = { preencherAoLer: true, incluirCid: false, ocrAutomatico: true, usarIa: true, introVista: false, tamanhoTexto: 'normal', avisosLidos: [] };
/** O CID entra na descrição se o cliente ligar o interruptor ou se o escritório pedir pelas
 *  regras. O interruptor precisa mostrar esse valor efetivo: antes dizia "desligado" enquanto
 *  o dado de saúde ia para o portal. A escolha explícita do cliente vence sempre. */
const cidPeloEscritorio = () => !!S.rules?.config?.incluirCidNaDescricao;
const cidAtivo = () => (S.prefs.cidEscolhido ? S.prefs.incluirCid : (S.prefs.incluirCid || cidPeloEscritorio()));
let reqId = 0; const waiters = new Map();

/* =================== Utilidades de UI =================== */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = '') => `<svg class="ic ${cls}"><use href="#i-${id}"/></svg>`;
const viewEl = $('#view');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function request(msg, timeout = 15000, transfer = []) {
  if (!S.port) return Promise.resolve(null);
  if (AGIR_NO_PORTAL.has(msg?.type)) S.antesDeAgir?.(msg);
  const id = ++reqId;
  return new Promise((res) => {
    const t = setTimeout(() => { waiters.delete(id); res(null); }, timeout);
    waiters.set(id, (d) => { clearTimeout(t); res(d); });
    S.port.postMessage({ ...msg, id }, transfer);
  });
}
/** Preenchimento: o tempo limite conta do último avanço ("n de m" que o conteúdo manda), não do começo —
 *  um cadastro longo não vira "não terminou" enquanto ainda está andando. */
const progresso = new Map();
function requestFill(msg, transfer = [], aoAvancar = null, inatividade = 25000) {
  if (!S.port) return Promise.resolve(null);
  S.antesDeAgir?.(msg);
  const id = ++reqId;
  return new Promise((res) => {
    let t;
    const fim = (d) => { clearTimeout(t); waiters.delete(id); progresso.delete(id); res(d); };
    const armar = () => { clearTimeout(t); t = setTimeout(() => fim(null), inatividade); };
    armar();
    progresso.set(id, (p) => { armar(); aoAvancar?.(p); });
    waiters.set(id, fim);
    S.port.postMessage({ ...msg, id }, transfer);
  });
}
// agir no portal (abrir, preencher, enviar) com uma janela do portal aberta: a plataforma avisa por cima (S.antesDeAgir)
const AGIR_NO_PORTAL = new Set(['navigate', 'fill', 'requestSubmit']);
const send = (msg, transfer) => { if (AGIR_NO_PORTAL.has(msg?.type)) S.antesDeAgir?.(msg); S.port?.postMessage(msg, transfer || []); };
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
  if (m.type === 'fillProgress') { progresso.get(m.id)?.(m); return; }
  if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); w(m); return; }
  switch (m.type) {
    case 'context': onContext(m); break;
    case 'files': handleFiles((m.files || []).map(p => p instanceof File ? p : new File([p.buf], p.name, { type: p.type || 'application/octet-stream', lastModified: p.lastModified })), m.origem); break;
    case 'submitAttempt': onSubmitAttempt(m); break;
    case 'formClosed': onFormClosed(m); break;
    case 'envioNaoConcluido': onEnvioNaoConcluido(m); break;
    case 'undoState': S.desfazerN = m.n || 0; atualizarBotaoDesfazer(); break;
    case 'undoStart': S.preenchendo = true; break;
    case 'undone': aoDesfazer(m); break;
    case 'rulesUpdated': loadRules().then(render); break;
    case 'modo': aplicarModo(m.modo); break;
    case 'portalAtencao': P?.atencao(m); break;
    default: break;
  }
}

/* =================== Regras e preferências =================== */
async function loadRules() {
  const pack = await chrome.runtime.sendMessage({ type: 'getRules' });
  S.rulesBase = pack.rules; S.meta = pack;
  S.rules = regrasDaEmpresa(S.rulesBase, S.ctx.empresa);
  $('#rules-ver').textContent = `regras ${pack.versao}${pack.origem === 'dev' ? ' · dev' : ''}`;
}
async function loadPrefs() {
  const { prefs } = await chrome.storage.local.get('prefs');
  S.prefs = { ...DEFAULT_PREFS, ...(prefs || {}) };
}
const savePrefs = () => chrome.storage.local.set({ prefs: S.prefs });
/** Ajustes por empresa (regras.empresas: { "trecho do nome": { config: {…}, avisos: […] } }). */
function regrasDaEmpresa(base, empresa) {
  if (!base) return base;
  const E1 = E.norm(empresa);
  const ent = E1 && Object.entries(base.empresas || {}).find(([k]) => k && E1.includes(E.norm(k)));
  if (!ent) return base;
  const aj = ent[1] || {};
  return { ...base, config: { ...(base.config || {}), ...(aj.config || {}) }, avisosEscritorio: [...(base.avisosEscritorio || []), ...(aj.avisos || [])], empresaAjustada: ent[0] };
}
function aplicarTamanhoTexto() {
  const z = { normal: '', grande: '1.12', maior: '1.25' }[S.prefs.tamanhoTexto] || '';
  document.documentElement.style.zoom = z;
}
chrome.runtime.onMessage.addListener((m) => { if (m.type === 'rulesUpdated') { loadRules().then(render); } });

/* =================== Contexto da página =================== */
let lastKey = '';
function onContext(m) {
  avisoVersao(m.versao);
  aplicarModo(m.modo);
  const prevTipo = S.ctx.tipo, prevMode = S.ctx.route?.mode;
  const empresaAntes = S.ctx.empresa;
  S.ctx = { route: m.route || {}, tipo: m.tipo, empresa: m.empresa || '', form: m.form };
  $('#empresa').textContent = S.ctx.empresa || 'Portal do Cliente';
  if (S.ctx.empresa !== empresaAntes && S.rulesBase) { S.rules = regrasDaEmpresa(S.rulesBase, S.ctx.empresa); if (S.view === 'inicio') renderAvisosInicio(); }
  // trocou de empresa sem recarregar: o que estava em andamento é da empresa anterior
  if (empresaAntes && S.ctx.empresa && S.ctx.empresa !== empresaAntes) trocouDeEmpresa(empresaAntes);
  P?.aoContexto(!!(S.ctx.empresa && S.ctx.empresa !== empresaAntes));
  const key = `${m.route?.path}|${m.tipo}`;
  if (m.route?.mode === 'form' && m.tipo) {
    const W0 = w(m.tipo);
    if (key !== lastKey) {
      // entrou num formulário novo com dados de uma tentativa anterior (saiu sem enviar)? oferece continuar
      const peloAssistente = S.abrindo === m.tipo; S.abrindo = null;
      W0.entrouComDados = !peloAssistente && (Object.values(W0.valores).some(v => v?.valor && v.fonte !== 'gerado') || W0.arquivos.some(a => !a.removido));
      if (!peloAssistente) W0.rascunhoVisto = false;
      W0.ultimoPreenchido = {}; W0.portalVisto = null;     // formulário novo: nada dele foi preenchido ainda
      loadEmpregados(m.tipo); if (S.view === 'inicio' && !S.sugestao) setView('preencher');
    }
  }
  lastKey = key;
  $('#dot-preencher').hidden = !(m.route?.mode === 'form');
  if (m.route?.mode === 'form' && m.tipo && !S.preenchendo) sincronizarDoPortal(m.tipo);
  if (S.view === 'preencher' && (prevTipo !== m.tipo || prevMode !== m.route?.mode)) render();
  else if (S.view === 'preencher') { updateChecks(); renderFieldsOnlySeMudou(); renderFillResult(); }
  else if (S.view === 'inicio') renderContextBanner();
}

/* =================== Modo da tela: plataforma (tela cheia) ou painel encaixado =================== */
const VIEWS_PAINEL = ['inicio', 'preencher', 'pendencias', 'ferramentas', 'historico', 'config'];
function aplicarModo(modo) {
  if (!['plataforma', 'painel'].includes(modo) || modo === S.modo) return;   // 'fechado' mantém o último desenho
  S.modo = modo;
  const plat = modo === 'plataforma';
  document.body.classList.toggle('plat', plat);
  $('#plat').hidden = !plat;
  const app = $('.app');
  if (plat) $('#plat-body').appendChild(viewEl);
  else { app.insertBefore(viewEl, $('.foot')); viewEl.className = 'view'; }
  if (!plat && !VIEWS_PAINEL.includes(S.view)) S.view = 'inicio';
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === S.view)));
  if (plat) P?.entrou();
  render();
}

/** Guarda o que estava em andamento com o nome da empresa anterior e começa limpo: listas de
 *  empregados, valores lidos e lote não valem para outra empresa. */
function trocouDeEmpresa(empresaAntes) {
  const pares = Object.entries(S.work).filter(([, W]) => W).map(([tipo, W]) => ({ tipo, empresa: empresaAntes, dados: rascunhoDe(W) })).filter(x => x.dados);
  if (pares.length) gravarRascunhos(pares);
  S.work = {}; cargasEmpregados.clear(); S.sugestao = null; S.ultimoEnvio = null;
  if (S.lote && !S.lote.concluido) { S.lote.pausado = true; renderLote(); }
  lastKey = '';
}

/* A página continua com o script antigo quando a extensão é atualizada sem recarregar o portal:
   o painel novo conversa com "mãos" velhas e várias coisas falham. Avisa para recarregar. */
function avisoVersao(versaoPagina) {
  if (standalone) return;
  const minha = chrome.runtime.getManifest?.().version;
  const velho = !!minha && versaoPagina !== minha && !String(versaoPagina || '').endsWith('-sim') && !location.search.includes('sim');
  let el = document.getElementById('aviso-versao');
  if (!velho) { el?.remove(); return; }
  if (el) return;
  el = document.createElement('div');
  el.id = 'aviso-versao'; el.className = 'note warn'; el.setAttribute('role', 'alert');
  el.style.cssText = 'margin:8px 12px 0';
  el.innerHTML = `${icon('alert')}<div><b>O Assistente foi atualizado.</b> Recarregue a página do portal (tecla F5) para usar a versão nova — sem isso, algumas funções podem não preencher.</div>`;
  viewEl.parentElement.insertBefore(el, viewEl);
}

function w(tipo) {
  // fonteVerdade[k] = 'plataforma': o cliente escreveu no formulário da plataforma; vale mais que o portal até ser enviado
  // aproximadas[k] = { escolhida, pedido }: opção parecida escolhida na lista do portal (o cliente confere);
  // sugestoes[k] = opções para "Você quis dizer"; desfeitos[k] = o que o Desfazer tirou (volta no "Preencher no portal")
  if (!S.work[tipo]) S.work[tipo] = { valores: {}, arquivos: [], editados: new Set(), empregados: [], opcoes: {}, resultados: null, fonteVerdade: {}, aproximadas: {}, sugestoes: {}, desfeitos: null };
  return S.work[tipo];
}
const tipoDef = (k) => E.resolveTipo(S.rules, k);
/** Definição de um campo: o das regras ou um campo do portal que as regras não conhecem ("extra:<formcontrolname>"). */
function campoDef(tipo, k) {
  const t = tipoDef(tipo); if (t?.campos?.[k]) return t.campos[k];
  if (!String(k).startsWith('extra:')) return null;
  const x = S.ctx.tipo === tipo ? S.ctx.form?.extras?.[k] : null;
  return { fc: x?.fc || k.slice(6), tipo: x?.tipo || 'texto', rotulo: x?.rotulo || k.slice(6), grupo: 'Outros campos do portal', extra: true };
}
/** O que o portal mostra num campo (das regras ou fora delas). */
const campoPortal = (k) => S.ctx.form?.campos?.[k] || S.ctx.form?.extras?.[k] || {};
const rotuloDe = (tipo, k) => campoDef(tipo, k)?.rotulo || k;
const msgAproximada = (a) => (S.rules.mensagens?.opcaoAproximada || 'Escolhi a mais parecida: {escolhida} (no documento: {pedido}) — confira').replace('{escolhida}', a.escolhida).replace('{pedido}', a.pedido);

/* Empregados: lista do combobox desta tela; se vier vazia, a lista completa da empresa (API do portal).
   Uma carga por vez por tipo, com novas tentativas enquanto o portal ainda carrega a lista. */
const cargasEmpregados = new Map();
const empregadosEmpresa = new Map();   // empresa → nomes (só na memória desta aba)
function loadEmpregados(tipo) {
  if (!cargasEmpregados.has(tipo)) cargasEmpregados.set(tipo, carregarEmpregados(tipo).finally(() => cargasEmpregados.delete(tipo)));
  return cargasEmpregados.get(tipo);
}
async function carregarEmpregados(tipo) {
  const t = tipoDef(tipo); if (!t) return;
  const W = w(tipo);
  const combos = Object.entries(t.campos).filter(([, c]) => c.tipo === 'combo' && c.fc);
  const simples = !t.assistente;
  const naTela = S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo;
  for (const [k, c] of combos) {
    if (!simples && c.fonte !== 'empregado') continue;
    if (W.opcoes[k]?.length || !naTela) continue;
    for (let tent = 0; tent < 3; tent++) {
      const r = await request({ type: 'getOptions', locator: { fc: c.fc }, force: tent > 0 }, 6000);
      if (r?.options?.length) {
        W.opcoes[k] = r.options;
        if (c.fonte === 'empregado') {
          W.empregados = r.options;
          // lista da tela incompleta (virtualizada): completa com a lista da empresa
          if (r.virtual) { const todos = await empregadosDaEmpresa(); W.empregados = [...new Set([...r.options, ...todos])]; }
        }
        break;
      }
      if (c.fonte !== 'empregado') break;
      await new Promise(res => setTimeout(res, 700));
    }
  }
  if (t.campos.empregado && !W.empregados.length) W.empregados = await empregadosDaEmpresa();
  if (W.empregados.length && S.ctx.empresa) empregadosEmpresa.set(S.ctx.empresa, [...new Set([...(empregadosEmpresa.get(S.ctx.empresa) || []), ...W.empregados])]);
  if (S.view === 'preencher') renderFieldsOnly();
}
async function empregadosDaEmpresa() {
  const conhecidos = empregadosEmpresa.get(S.ctx.empresa);
  if (conhecidos?.length) return conhecidos;
  const r = await request({ type: 'employees' }, 8000);
  if (r?.names?.length && S.ctx.empresa) empregadosEmpresa.set(S.ctx.empresa, r.names);
  if (r?.detalhes?.length && S.ctx.empresa) guardarEquipe(S.ctx.empresa, r.detalhes);
  return r?.names || [];
}
/** Lista para entender um texto: a da solicitação, se já carregada; senão, a da empresa. */
async function empregadosPara(tipo) {
  const W = w(tipo);
  if (W.empregados.length) return W.empregados;
  return empregadosDaEmpresa();
}

/* =================== Navegação entre abas =================== */
function setView(v) {
  if (S.modo !== 'plataforma' && !VIEWS_PAINEL.includes(v)) v = 'inicio';
  S.view = v;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  render();
  viewEl.scrollTop = 0;
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('#btn-close').addEventListener('click', () => send({ type: 'close' }));
$('#btn-config').addEventListener('click', () => setView('config'));
function alternarTema() {
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('ct-tema', next); } catch { /* sem armazenamento */ }
  syncThemeIcon();
}
$('#btn-theme').addEventListener('click', alternarTema);
$('#btn-plat').addEventListener('click', () => send({ type: 'modo', modo: 'plataforma' }));
function syncThemeIcon() {
  const dark = (document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  $('#btn-theme').innerHTML = icon(dark ? 'sun' : 'moon');
}

function render() {
  if (!S.rules) { viewEl.innerHTML = `<div class="empty"><div class="spin" style="margin:auto"></div><p>Carregando…</p></div>`; return; }
  if (S.modo === 'plataforma' && P) return P.render(S.view);
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
    <div id="avisos-esc"></div>
    <div>
      <p class="hello">O que você precisa fazer?</p>
      <p class="lead">${esc(R.escritorio?.saudacao || '')}</p>
    </div>
    <div id="lote"></div>
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
  renderLote();
  renderAvisosInicio(); renderExperiencia(); renderRepetir();
}

/* ---------- Texto livre ---------- */
/* Texto livre: o pedido é entendido pelo que foi escrito, não pela solicitação que está aberta.
   Só preenche a solicitação aberta quando o texto é sobre ela (ou o cliente escolhe isso). */
const mesmaFamilia = (a, b) => a === b || FAMILIAS.some(f => f.includes(a) && f.includes(b));
/* Cartões de escolha (aviso ou cálculo, com ou sem atestado, empate) vêm das regras: config.textoLivre.escolhas (E.escolhaPara). */
/** Mostra o cartão do texto livre. */
function mostrarSugestao() { if (S.view !== 'inicio') setView('inicio'); else renderSugestao(); }
/** Campos do cartão com o que o cliente trocou ou descartou nele (ajustes: valor novo ou null). */
function camposComAjustes(s) {
  const c = { ...(s.analise?.campos || {}) };
  for (const [k, v] of Object.entries(s.ajustes || {})) { if (v == null) delete c[k]; else c[k] = v; }
  return c;
}
async function entenderTexto(texto, { origem = 'inicio', mesmoAssim = false } = {}) {
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
    const sugerido = E.destaqueEscolha(texto, escolha);
    const base = sugerido || escolha.tipos[0];
    const empregados = await empregadosPara(base);
    const r = E.parseFreeText(texto, S.rules, { employees: empregados, tipoAtual: base });
    S.sugestao = { texto, tipoAberto, escolha, sugerido, empregados, palpite: r.palpite, candidatos: r.candidatos, linhas: r.linhas, ajustes: {}, analise: { tipoSugerido: base, campos: r.campos, documento: { nome: 'seu pedido' } } };
    mostrarSugestao();
    return;
  }
  // texto sobre a própria solicitação aberta (ou sem tipo claro, escrito dentro dela) → preenche ali
  if (tipoAberto && ((detectado && mesmaFamilia(detectado, tipoAberto)) || (!detectado && origem === 'preencher'))) {
    comecarDoZeroSeAbandonado(tipoAberto);
    await loadEmpregados(tipoAberto);
    const r = E.parseFreeText(texto, S.rules, { employees: w(tipoAberto).empregados, tipoAtual: tipoAberto });
    anotarCandidatos(tipoAberto, texto, r.campos);
    $('#free-sug') && ($('#free-sug').innerHTML = '');
    aplicarCampos(tipoAberto, r.campos, 'sua descrição');
    return;
  }
  const destino = detectado || tipoAberto || 'geral';  // sem tipo claro: propõe a aberta, mas só preenche se o cliente confirmar
  const empregados = await empregadosPara(destino);
  const r = E.parseFreeText(texto, S.rules, { employees: empregados, tipoAtual: destino });
  S.sugestao = { texto, tipoAberto, empregados, palpite: r.palpite, candidatos: r.candidatos, linhas: r.linhas, ajustes: {}, analise: { tipoSugerido: destino, campos: r.campos, documento: { nome: 'seu pedido' } } };
  if (origem === 'preencher' && $('#free-sug')) renderSugestaoTexto($('#free-sug'), S.sugestao);
  else mostrarSugestao();
}
/** Primeiro nome que serve para mais de um funcionário: guarda as opções para o cliente escolher. */
function anotarCandidatos(tipo, texto, campos) {
  const W = w(tipo);
  W.candidatos = null;
  if (campos.empregado || !tipoDef(tipo)?.campos?.empregado) return;
  const c = E.employeeCandidates(texto, W.empregados);
  if (c.length > 1) W.candidatos = c;
}
/* Campos que não são do portal, mas entram no texto gerado (ex.: as linhas das variáveis da folha). */
const CAMPOS_DO_TEXTO = ['tabelaRubricas'];
function juntarCampos(tipo, campos, fonte) {
  const W = w(tipo); const t = tipoDef(tipo);
  for (const [k, c] of Object.entries(campos)) {
    if ((!t.campos[k] && !CAMPOS_DO_TEXTO.includes(k)) || W.editados.has(k)) continue;
    if (k === 'empregado' && W.empregados.length) { const m = E.bestMatch(c.valor, W.empregados, 0.6); if (!m) continue; c.valor = m.option; }
    W.valores[k] = { valor: c.valor, conf: c.conf ?? 0.6, fonte: c.fonte || fonte };
  }
}
function aplicarCampos(tipo, campos, fonte) {
  juntarCampos(tipo, campos, fonte);
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
  S.abrindo = tipo;
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

/** Dois arquivos com o mesmo nome no mesmo pedido: o segundo ganha "(2)" (o portal pularia o repetido). */
function nomeUnico(W, file) {
  const usados = new Set(W.arquivos.filter(a => !a.removido).map(a => E.norm(a.nome)));
  if (!usados.has(E.norm(file.name))) return file;
  const [, base, ext = ''] = file.name.match(/^(.*?)(\.[^.]+)?$/);
  let n = 2, nome;
  do nome = `${base} (${n++})${ext}`; while (usados.has(E.norm(nome)));
  return new File([file], nome, { type: file.type, lastModified: file.lastModified });
}
/** Junta arquivos ao pedido, com nomes únicos (arquivo que o cliente anexou direto no portal fica com o nome dele). */
function juntarArquivos(W, itens) {
  for (const it of itens) {
    if (W.arquivos.includes(it)) continue;
    if (!it.jaAnexado) { const f = nomeUnico(W, it.file); if (f !== it.file) { it.file = f; it.nome = f.name; } }
    W.arquivos.push(it);
  }
}
function novoItem(file, origem) {
  return { id: Math.random().toString(36).slice(2), file, nome: file.name, tamanho: file.size, status: 'lendo', progresso: 0, etapa: 'Abrindo', jaAnexado: origem === 'portal', documento: null };
}

async function handleFiles(files, origem) {
  if (!files?.length) return;
  if (files.length > 1 && origem !== 'portal') return handleVarios(files, origem);
  const noForm = S.ctx.route?.mode !== 'form' || !S.ctx.tipo;
  for (const file of files) {
    const item = novoItem(file, origem);
    if (noForm) {
      S.sugestao = { item, analise: null };
      if (S.view !== 'inicio') setView('inicio'); else renderSugestao();
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

/* =================== Vários arquivos: uma solicitação por documento =================== */
/* Lê tudo primeiro; atestados viram uma solicitação cada; documentos de pedidos diferentes
   viram uma solicitação por tipo. Abre uma de cada vez: o cliente confere e envia, e o
   Assistente abre e preenche a próxima. */
async function handleVarios(files, origem) {
  if (S.lote && !S.lote.concluido) { toast('Termine (ou pare) o lote atual antes de arrastar outros arquivos.'); return; }
  const itens = files.map(f => novoItem(f, origem));
  S.loteLeitura = { itens };
  if (!['inicio', 'preencher'].includes(S.view)) setView(S.ctx.route?.mode === 'form' ? 'preencher' : 'inicio'); else renderLote();
  for (const it of itens) { await processItem(it, null); renderLote(); }
  S.loteLeitura = null;
  const { pedidos, fora } = montarPedidos(itens);
  if (pedidos.length >= 2) return iniciarLote(pedidos, fora);
  renderLote();
  const tipoForm = S.ctx.route?.mode === 'form' ? S.ctx.tipo : null;
  if (tipoForm) {
    // um pedido só (ou nada reconhecido): tudo vai para a solicitação aberta
    comecarDoZeroSeAbandonado(tipoForm);
    const W = w(tipoForm);
    for (const it of itens) {
      juntarArquivos(W, [it]);
      if (it.texto) it.analise = E.analyzeText(it.texto, S.rules, { employees: W.empregados, tipoAtual: tipoForm });
      applyAnalysis(tipoForm, it, { preencher: false });
    }
    if (S.view !== 'preencher') setView('preencher'); else render();
    if (S.prefs.preencherAoLer) fillPortal(tipoForm, { silencioso: true });
    return;
  }
  const principal = pedidos[0]?.itens[0] || itens[0];
  S.sugestao = { item: principal, extras: itens.filter(i => i !== principal) };
  if (S.view !== 'inicio') setView('inicio'); else renderSugestao();
}

function montarPedidos(itens) {
  const individuais = S.rules.config?.umPedidoPorDocumento || ['atestado'];
  const pedidos = []; const grupos = new Map(); const neutros = [];
  for (const it of itens) {
    const tipo = it.analise?.tipoSugerido || null;
    if (individuais.includes(it.documento)) pedidos.push({ tipo: tipo || 'afastamento', itens: [it] });
    else if (tipo && !DOCS_NEUTROS.includes(it.documento)) { if (!grupos.has(tipo)) grupos.set(tipo, []); grupos.get(tipo).push(it); }
    else neutros.push(it);
  }
  // documento que acompanha um atestado (ex.: CAT da mesma data) entra na mesma solicitação
  const data = (it) => it.analise?.campos?.dataAfastamento?.valor || null;
  for (const [tipo, lista] of grupos) {
    for (const it of [...lista]) {
      const alvo = pedidos.find(p => p.tipo === tipo && data(p.itens[0]) && data(p.itens[0]) === data(it));
      if (alvo) { alvo.itens.push(it); lista.splice(lista.indexOf(it), 1); }
    }
    if (lista.length) pedidos.push({ tipo, itens: lista });
  }
  // documentos neutros (RG, certidão…) só entram se houver uma única solicitação possível
  let fora = [];
  if (neutros.length) {
    const naoIndiv = pedidos.filter(p => !individuais.includes(p.itens[0].documento));
    if (pedidos.length === 1) pedidos[0].itens.push(...neutros);
    else if (naoIndiv.length === 1) naoIndiv[0].itens.push(...neutros);
    else fora = neutros;
  }
  return { pedidos, fora };
}

async function iniciarLote(pedidos, fora) {
  S.lote = { pedidos: pedidos.map((p, i) => ({ ...p, n: i + 1, status: 'pendente' })), idx: -1, fora, pausado: false, concluido: false };
  S.sugestao = null;
  toast(`${pedidos.length} solicitações para abrir, uma de cada vez.`);
  await abrirPedido(0);
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));
async function abrirPedido(i) {
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
  await openTipo(p.tipo, { manter: true });
  for (let k = 0; k < 40 && !(S.ctx.route?.mode === 'form' && S.ctx.tipo === p.tipo); k++) await esperar(200);
  await loadEmpregados(p.tipo);
  for (const it of p.itens) {
    if (it.texto) it.analise = E.analyzeText(it.texto, S.rules, { employees: W.empregados, tipoAtual: p.tipo });
    applyAnalysis(p.tipo, it, { preencher: false });
  }
  // pedido que veio do texto livre (vários pedidos numa frase, ou aviso e cálculo): os campos entendidos
  if (p.campos) { juntarCampos(p.tipo, Object.fromEntries(Object.entries(p.campos).map(([k, c]) => [k, { ...c }])), 'sua descrição'); gerarTextos(p.tipo); }
  const v = valoresAssistente(p.tipo);
  p.rotulo = [v.empregado, v.dataAfastamento || v.inicioGozo || v.dataDemissao, v.dias ? `${v.dias} ${+v.dias === 1 ? 'dia' : 'dias'}` : ''].filter(Boolean).join(' · ');
  await fillPortal(p.tipo, { silencioso: true });
  L.navegando = false;
  renderLote();
}

async function proximoPedido() {
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

async function pularPedido() {
  const L = S.lote; const p = L?.pedidos[L.idx]; if (!p) return;
  p.status = 'pulado'; L.navegando = true;
  await request({ type: 'navigate', slug: tipoDef(p.tipo).slug, add: false }, 8000);
  await proximoPedido();
}

/** Chamado quando o formulário fecha: envio concluído → próximo; fechado sem enviar → pausa. */
function loteAoFecharFormulario(enviadoTipo) {
  const L = S.lote; if (!L || L.concluido || L.navegando) return;
  const p = L.pedidos[L.idx]; if (!p || p.status !== 'atual') return;
  if (enviadoTipo === p.tipo) { p.status = 'enviado'; renderLote(); setTimeout(proximoPedido, 1200); }
  else { L.pausado = true; renderLote(); }
}

function renderLote() {
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
  const nomeTipo = (p) => p.itens.some(i => i.documento === 'atestado') ? 'Atestado' : (S.rules.tipos[p.tipo]?.nome || 'Solicitação');
  const rotuloPedido = (p) => p.rotulo || p.itens[0]?.nome || Object.values(p.campos || {}).filter(c => c.conf > 0.45).slice(0, 2).map(c => c.valor).join(' · ') || 'do seu texto';
  el.innerHTML = `<div class="card pad lote" aria-live="polite">
    <div class="lote-h">${icon('list', 'ic-sm')}<b>${L.concluido ? 'Lote concluído' : `Solicitação ${L.idx + 1} de ${L.pedidos.length}`}</b><small class="mono">${env} enviada(s)</small></div>
    <ol>${L.pedidos.map(p => `<li class="${p.status === 'atual' ? 'cur' : p.status === 'enviado' || p.status === 'pulado' ? 'done' : ''}">
      <span class="n">${st[p.status] || p.n}</span><span class="what" title="${esc(p.itens.map(i => i.nome).join(', '))}">${esc(nomeTipo(p))} — ${esc(rotuloPedido(p))}</span>
      <small class="muted">${{ enviado: 'enviada', pulado: 'pulada', atual: 'agora', pendente: 'na fila' }[p.status]}</small></li>`).join('')}</ol>
    ${L.fora?.length ? `<p class="muted" style="margin:8px 0 0;font-size:12px">Não reconheci e deixei de fora: ${esc(L.fora.map(i => i.nome).join(', '))}. Se precisar, arraste depois na solicitação certa.</p>` : ''}
    ${L.concluido ? `<div class="actions"><button class="btn btn-sm" id="lote-ok">Fechar</button></div>`
      : L.pausado ? `<div class="note warn" style="margin-top:8px">${icon('alert')}<div>A solicitação ${L.idx + 1} foi fechada sem enviar.</div></div>
        <div class="actions"><button class="btn btn-primary btn-sm" id="lote-reabrir">Abrir de novo</button><button class="btn btn-sm" id="lote-pular">Pular</button><button class="btn btn-ghost btn-sm" id="lote-parar">Parar</button></div>`
      : atual ? `<p class="muted" style="margin:8px 0 0;font-size:12px">${L.navegando ? 'Abrindo e preenchendo…' : `Confira os dados e clique em ${esc(tipoDef(atual.tipo)?.botaoEnviar || 'ADICIONAR')} no portal (ou em “Conferir e enviar”). Quando o portal salvar, eu abro a próxima.`}</p>
        <div class="actions"><button class="btn btn-sm" id="lote-pular" ${L.navegando ? 'disabled' : ''}>Pular esta</button><button class="btn btn-ghost btn-sm" id="lote-parar">Parar</button></div>` : ''}
  </div>`;
  $('#lote-ok')?.addEventListener('click', () => { S.lote = null; renderLote(); });
  $('#lote-parar')?.addEventListener('click', () => { S.lote = null; renderLote(); toast('Lote parado. O que já foi enviado continua no portal.'); });
  $('#lote-pular')?.addEventListener('click', pularPedido);
  $('#lote-reabrir')?.addEventListener('click', () => abrirPedido(S.lote.idx));
}

async function processItem(item, tipoAtual) {
  const onProgress = (p, etapa) => {
    item.progresso = p; item.etapa = etapa || item.etapa;
    const bar = document.querySelector(`[data-file="${item.id}"] .prog i`); if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    const st = document.querySelector(`[data-file="${item.id}"] small`); if (st) st.textContent = item.etapa;
  };
  try {
    const r = await readFile(item.file, onProgress, { ocr: S.prefs.ocrAutomatico });
    item.texto = r.texto; item.metodo = r.metodo; item.tabela = r.tabela; item.confianca = r.confianca ?? null; item.rotacao = r.rotacao || 0;
    if (tipoAtual && !w(tipoAtual).empregados.length) await loadEmpregados(tipoAtual);
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
    const dificil = r.metodo === 'ocr' && item.confianca != null && item.confianca < 60;
    item.etapa = r.metodo === 'nao-suportado' ? 'Formato não lido — será só anexado' : `${item.analise.documento?.nome || 'Documento'} · ${r.metodo === 'ocr' ? (dificil ? 'leitura difícil, confira' : 'lido por OCR') : 'lido'}${item.rotacao ? ' (imagem girada)' : ''}${item.resumo ? ' · ' + item.resumo : ''}`;
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
        <p style="margin:0 0 8px">${esc(it.nome)} parece ser <b>${esc(a.documento?.nome || 'um documento')}</b>${tipo ? ` → <b>${esc(S.rules.tipos[tipo]?.nome)}</b>` : ''}.${s.extras?.length ? ` Os outros ${s.extras.length} arquivo(s) vão junto.` : ''}</p>
        ${nCampos ? `<p class="muted" style="margin:0 0 10px">${nCampos} informação(ões) encontradas: ${Object.keys(a.campos).map(k => tipoDef(tipo || 'geral')?.campos?.[k]?.rotulo).filter(Boolean).slice(0, 6).map(esc).join(', ')}${nCampos > 6 ? '…' : ''}</p>` : ''}
        ${tipo ? `<button class="btn btn-primary btn-block" id="sug-go">Abrir ${esc(S.rules.tipos[tipo]?.nome)} e preencher ${icon('arrow', 'ic-sm')}</button>` : `<p class="muted">Não reconheci o tipo. Escolha acima o que você precisa fazer — o arquivo vai junto.</p>`}
      </div>
    </div>`;
  $('#sug-x').addEventListener('click', () => { S.sugestao = null; renderSugestao(); });
  $('#sug-go')?.addEventListener('click', async () => {
    comecarDoZeroSeAbandonado(tipo);
    const W = w(tipo); const todos = [it, ...(s.extras || [])]; juntarArquivos(W, todos);
    S.sugestao = null;
    await openTipo(tipo, { manter: true });
    // Reanalisa com a lista de funcionários desta tela
    setTimeout(async () => {
      await loadEmpregados(tipo);
      for (const x of todos) { if (x.texto) x.analise = E.analyzeText(x.texto, S.rules, { employees: w(tipo).empregados, tipoAtual: tipo }); applyAnalysis(tipo, x, { preencher: false }); }
      if (S.prefs.preencherAoLer) fillPortal(tipo, { silencioso: true });
    }, 900);
  });
  if (!tipo) {
    $('#intents')?.querySelectorAll('.intent').forEach(b => b.addEventListener('click', () => { const W = w(b.dataset.tipo); if (!W.arquivos.includes(it)) W.arquivos.push(it); }, { once: true }));
  }
}

/** Lista "rótulo: valor" do cartão, em que cada valor pode ser trocado (clique) ou descartado (x).
 *  Só aparecem campos com nome para o cliente (nunca o nome técnico). */
function kvSugestao(s, nomeCampo) {
  const lista = Object.entries(camposComAjustes(s)).filter(([k]) => k !== 'observacoes' && k !== 'tabelaRubricas' && nomeCampo(k));
  if (!lista.length) return '';
  return `<dl class="kv kv-ed" style="margin-bottom:10px">${lista.map(([k, c]) => `<dt>${esc(nomeCampo(k))}</dt><dd>
    <button type="button" class="kv-v" data-ed="${esc(k)}" title="Clique para trocar">${esc(c.valor)}</button>${c.conf < 0.6 ? ' <small class="chip warn">confira</small>' : ''}${c.corrigido ? ' <small class="chip info">corrigido</small>' : ''}
    <button type="button" class="kv-x" data-tira="${esc(k)}" aria-label="Descartar ${esc(nomeCampo(k))}" title="Descartar">${icon('x', 'ic-sm')}</button></dd>`).join('')}</dl>`;
}
function ligarKv(el, s, nomeCampo, defCampo, redesenhar) {
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
function perguntaEmpregado(s) {
  if (camposComAjustes(s).empregado) return '';
  if (s.candidatos?.length) return `<div class="cands" style="margin:0 0 10px"><small>Qual deles?</small>${s.candidatos.map(n => `<button type="button" class="btn btn-sm" data-quem="${esc(n)}">${esc(n)}</button>`).join('')}</div>`;
  if (s.palpite) return `<div class="note" style="margin:0 0 10px">${icon('info')}<div>Não achei “${esc(s.palpite.trecho)}” na lista. É <b>${esc(s.palpite.nome)}</b>?
    <div class="actions" style="margin-top:6px"><button type="button" class="btn btn-sm btn-primary" data-quem="${esc(s.palpite.nome)}">Sim, é essa pessoa</button><button type="button" class="btn btn-sm btn-ghost" id="sug-nao-e">Não</button></div></div></div>`;
  return '';
}
function ligarPerguntaEmpregado(el, s, redesenhar) {
  el.querySelectorAll('[data-quem]').forEach(b => b.addEventListener('click', () => { s.ajustes = s.ajustes || {}; s.ajustes.empregado = { valor: b.dataset.quem, conf: 1, fonte: 'você' }; s.palpite = null; s.candidatos = null; redesenhar(); }));
  el.querySelector('#sug-nao-e')?.addEventListener('click', () => { s.palpite = null; redesenhar(); });
}
/** Variáveis da folha entendidas no texto: uma linha por funcionário (vão na descrição como itens, não como o texto). */
function linhasHtml(s) {
  if (!s.linhas?.length) return '';
  const v = (l) => l.unidade === 'R$' ? l.valor : `${l.valor} ${l.unidade || ''}`;
  return `<table class="tbl-linhas"><thead><tr><th>Funcionário</th><th>Rubrica</th><th>Valor</th></tr></thead><tbody>${s.linhas.map(l => `<tr><td>${esc(l.empregado || 'a confirmar')}</td><td>${esc(l.rubrica)}</td><td class="mono">${esc(v(l))}</td></tr>`).join('')}</tbody></table>
    <p class="muted" style="margin:4px 0 10px;font-size:12px">Essas linhas vão na descrição para o escritório lançar. Confira os nomes das rubricas.</p>`;
}

function renderSugestaoTexto(el, s) {
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
        ${kvSugestao(s, nomeCampo)}${perguntaEmpregado(s)}${linhasHtml(s)}
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
      ${t?.campos?.empregado ? perguntaEmpregado(s) : ''}
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
const comAjustes = (campos, ajustes) => camposComAjustes({ analise: { campos }, ajustes });

async function abrirDoTexto(el, s, destino) {
  S.sugestao = null; el.innerHTML = '';
  comecarDoZeroSeAbandonado(destino);
  await openTipo(destino, { manter: true });
  for (let k = 0; k < 40 && !(S.ctx.route?.mode === 'form' && S.ctx.tipo === destino); k++) await esperar(200);
  await loadEmpregados(destino);
  const r = E.parseFreeText(s.texto, S.rules, { employees: w(destino).empregados, tipoAtual: destino });
  // o que o cliente trocou, descartou ou corrigiu no cartão vale mais que a leitura do texto
  const campos = comAjustes(r.campos, s.ajustes);
  anotarCandidatos(destino, s.texto, campos);
  aplicarCampos(destino, campos, 'sua descrição');
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
function applyAnalysis(tipo, item, opts = {}) {
  if (item.removido) return;   // o cliente tirou o arquivo da lista enquanto a leitura corria
  const W = w(tipo); const t = tipoDef(tipo);
  item.outroTipo = docDeOutroTipo(item, tipo);
  const campos = item.outroTipo ? {} : (item.analise?.campos || {});
  for (const [k, c] of Object.entries(campos)) {
    if (!t.campos[k] || W.editados.has(k)) continue;
    const cur = W.valores[k];
    if (!cur || (cur.conf ?? 0) <= c.conf) W.valores[k] = { valor: c.valor, conf: c.conf, fonte: c.fonte };
  }
  // nome lido no documento e homônimos (o cliente escolhe)
  if (!item.outroTipo && t.campos.empregado) {
    if (item.analise?.paciente) W.pacienteLido = item.analise.paciente;
    if (item.analise?.candidatos?.length && !W.valores.empregado?.valor) W.candidatos = item.analise.candidatos;
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
  if (opts.preencher !== false && S.prefs.preencherAoLer && !item.outroTipo && S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo && item.status !== 'lendo') fillPortal(tipo, { silencioso: true });
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
  const v = { ...valoresAssistente(tipo), ...portalValores(tipo) };
  // plataforma: o que o cliente escreveu aqui vale até o portal receber
  const W = w(tipo);
  for (const [k, f] of Object.entries(W.fonteVerdade || {})) if (f === 'plataforma' && W.valores[k]?.valor) v[k] = W.valores[k].valor;
  return v;
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

/** Nome do documento principal para o assunto (ex.: "Atestado médico"); sem documento, o nome curto do pedido. */
function documentoPrincipal(tipo) {
  const W = w(tipo);
  for (const a of W.arquivos) {
    if (a.removido || !a.documento) continue;
    const d = (S.rules.documentos || []).find(x => x.id === a.documento);
    if (d?.rotuloAssunto) return d.rotuloAssunto;
  }
  return tipoDef(tipo)?.nomeCurto || (tipo === 'afastamento' ? 'Afastamento' : tipoDef(tipo)?.nome || '');
}

function gerarTextos(tipo, force = false) {
  const W = w(tipo); const t = tipoDef(tipo);
  const vals = { ...valoresParaChecar(tipo), ...E.derived(tipo, valoresParaChecar(tipo), S.rules) };
  if (!cidAtivo()) delete vals.cid;
  vals.anexosNomes = anexosAtuais(tipo).map(a => a.nome).join(', ');
  vals.observacoes = W.valores.observacoes?.valor || '';
  vals.documentoPrincipal = documentoPrincipal(tipo);
  if (t.campos.assunto && (t.assuntos || t.assunto) && (force || !W.editados.has('assunto'))) {
    const s = E.renderFirst(t.assuntos || t.assunto, vals); if (s) W.valores.assunto = { valor: s, conf: 0.9, fonte: 'gerado' };
  }
  if (t.campos.descricao && t.descricao?.length && (force || !W.editados.has('descricao'))) {
    const d = E.renderTemplate(t.descricao, vals); if (d) W.valores.descricao = { valor: d, conf: 0.9, fonte: 'gerado' };
  }
  salvarRascunho(tipo, S.ctx.empresa);
}

/* =================== PREENCHER =================== */
function renderPreencher() {
  const { route, tipo } = S.ctx;
  if (standalone || route.mode !== 'form' || !tipo) {
    viewEl.innerHTML = `<div id="lote"></div>
      <div class="empty">${icon('fill', 'ic-lg')}<p><b>Nenhuma solicitação aberta</b></p><p>Escolha no Início o que você precisa fazer, escreva com suas palavras ou arraste um documento — eu abro a solicitação certa.</p>
      <button class="btn btn-primary" id="go-home">Ir para o Início</button></div>`;
    $('#go-home').addEventListener('click', () => setView('inicio'));
    renderLote();
    return;
  }
  const t = tipoDef(tipo);
  const plat = S.modo === 'plataforma';
  const cab = `<div class="card${plat ? ' pd-head' : ''}">
      ${plat ? `<button type="button" class="btn btn-sm pd-voltar" id="pd-voltar" title="Voltar para a escolha do tipo de solicitação (o pedido aberto continua no portal)">${icon('left', 'ic-sm')} Outro tipo</button><div class="pd-t"><h3>${esc(t.nome)}</h3><small class="muted">${esc(S.ctx.empresa)}</small> <span class="chip sector">${esc(t.setor)}</span></div><ol class="stepper" id="stepper" aria-label="Etapas do pedido"></ol>
        <button type="button" class="btn btn-ghost btn-sm" id="ver-portal" title="Mostra o formulário original do portal">${icon('external', 'ic-sm')} Ver no portal</button>
        <div class="progress"><div class="bar" id="bar"><i style="width:0"></i></div><small class="mono" id="bar-txt"></small></div>` : `
      <div class="card-h">
        <div style="flex:1;min-width:0"><h3>${esc(t.nome)}</h3><small class="muted">${esc(S.ctx.empresa)}</small></div>
        <span class="chip sector">${esc(t.setor)}</span>
      </div>
      <div class="card-b">
        <ol class="stepper" id="stepper" aria-label="Etapas do pedido"></ol>
        <div class="progress" style="margin-top:10px"><div class="bar" id="bar"><i style="width:0"></i></div><small class="mono" id="bar-txt"></small></div>
      </div>`}
    </div>`;
  const drop = `<div class="drop compact" id="drop-form" role="button" tabindex="0">${icon('upload', 'ic-lg')}<div><b>Arraste documentos aqui</b><small>Ou cole um print (Ctrl+V). Eu leio, preencho e anexo.</small></div></div>`;
  const livre = `<div class="free mini">
      <label for="free-form" class="sr">Escreva o pedido com suas palavras</label>
      <input id="free-form" class="input" placeholder="Ou escreva: ex. ${esc(exemploTexto(tipo))}" autocomplete="off">
      <button class="btn btn-sm" id="free-form-go">Preencher</button>
    </div>
    <div id="free-sug"></div>`;
  const arquivos = `<div class="files" id="files"></div><div id="outro-tipo"></div><div id="doc-checklist"></div>`;
  const dicas = (t.dicas || []).length ? `<h2 class="sec">Dicas</h2><ul class="tips">${t.dicas.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : '';
  const dock = `<div class="dock" id="dock">
      <button class="btn btn-primary" id="btn-fill">${icon('fill', 'ic-sm')} Preencher no portal</button>
      <button class="btn btn-undo" id="btn-undo" hidden>${icon('undo', 'ic-sm')} Desfazer o preenchimento</button>
      <button class="btn" id="btn-send" title="Mostra o resumo e envia pelo botão do portal">${icon('check', 'ic-sm')} Conferir e enviar</button>
      <details class="more-menu"><summary class="btn btn-ghost" aria-label="Mais ações">${icon('more')}</summary>
        <div class="menu">
          <button type="button" id="btn-copy">${icon('copy', 'ic-sm')} Copiar resumo</button>
          <button type="button" id="btn-model">${icon('star', 'ic-sm')} Salvar como modelo</button>
          <button type="button" id="btn-regen">${icon('refresh', 'ic-sm')} Gerar assunto e descrição de novo</button>
          <button type="button" id="btn-clear">${icon('trash', 'ic-sm')} Limpar o que o assistente guardou</button>
        </div></details>
    </div>`;
  // plataforma: o formulário é daqui (o portal fica por baixo); encaixado: o portal é o formulário e aqui fica o resumo
  viewEl.innerHTML = plat ? `
    <div id="lote"></div>${cab}<div id="modo-seguro"></div><div id="rascunho"></div>
    <div class="pd-grid">
      <div class="pd-main"><section class="pn-card"><div class="pn-card-head"><h3>Dados do pedido</h3><small>O que você preencher aqui vai para o portal. Antes de enviar, você confere o resumo.</small></div>
        <div class="pn-card-body"><div id="fields"></div><div id="fill-res"></div></div>${dock}</section></div>
      <aside class="pd-side">${drop}${livre}${arquivos}
        <section class="pn-card"><div class="pn-card-head"><h3>Conferência</h3></div><div class="pn-card-body"><div class="checks" id="checks"></div></div></section>
        ${dicas}</aside>
    </div>` : `
    <div id="lote"></div>
    ${cab}
    <div id="modo-seguro"></div>
    <div id="rascunho"></div>
    ${drop}
    ${livre}
    ${arquivos}
    <h2 class="sec">No portal</h2>
    <div id="fields"></div>
    <div id="fill-res"></div>
    <h2 class="sec">Conferência</h2>
    <div class="checks" id="checks"></div>
    ${dicas}
    ${dock}
  `;
  $('#ver-portal')?.addEventListener('click', () => send({ type: 'modo', modo: 'painel' }));
  $('#pd-voltar')?.addEventListener('click', () => P.voltarEscolha());
  bindDrop($('#drop-form'));
  $('#btn-fill').addEventListener('click', () => fillPortal(tipo));
  $('#btn-undo').addEventListener('click', desfazerPreenchimento);
  $('#btn-send').addEventListener('click', async () => { await enviarPendenteAgora(tipo); S.pedirResumo = true; send({ type: 'requestSubmit' }); });
  $('#btn-copy').addEventListener('click', () => copiarResumo(tipo));
  $('#btn-model').addEventListener('click', () => salvarModeloUI(tipo));
  $('#btn-regen').addEventListener('click', () => { const W = w(tipo); W.editados.delete('assunto'); W.editados.delete('descricao'); gerarTextos(tipo, true); renderFieldsOnly(); updateChecks(); });
  $('#btn-clear').addEventListener('click', () => { S.work[tipo] = null; w(tipo).rascunhoVisto = true; apagarRascunho(tipo); loadEmpregados(tipo); render(); });
  const ff = () => { const v = $('#free-form').value.trim(); if (v) { entenderTexto(v, { origem: 'preencher' }); } };
  $('#free-form-go').addEventListener('click', ff);
  $('#free-form').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ff(); } });
  document.querySelectorAll('.more-menu .menu button').forEach(b => b.addEventListener('click', () => b.closest('details').removeAttribute('open')));
  renderFilesOnly(); renderFieldsOnly(); updateChecks(); renderFillResult(); renderLote();
  renderModoSeguro(tipo); ofertaRascunho(tipo); atualizarBotaoDesfazer();
}
function exemploTexto(tipo) {
  return tipoDef(tipo)?.exemploTexto || ({ afastamento: 'atestado de 20 dias a partir de ontem', avisoFerias: 'férias dia 10/11 por 30 dias', calculoFerias: 'férias a partir de 03/11, 30 dias, adiantar 13º', avisoRescisao: 'pediu demissão hoje', calculoRescisao: 'último dia 20/10, aviso indenizado', rubricas: 'horas extras de outubro', geral: 'preciso da segunda via da guia do FGTS' }[tipo]) || 'descreva o pedido';
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
      <div class="nm"><div>${esc(a.nome)}</div><small title="${esc(a.etapa || '')}">${esc(a.recusado ? (S.rules.mensagens?.anexoRecusado || 'O portal não aceitou este arquivo (formato ou tamanho?)') : a.tiradoNoPortal && !a.anexado ? 'Tirado do portal — clique em “Preencher no portal” para anexar de novo' : (a.etapa || ''))}</small>${a.status === 'lendo' ? `<div class="prog"><i style="width:${Math.round(a.progresso * 100)}%"></i></div>` : ''}</div>
      ${a.status === 'ok' || a.status === 'nao-lido' ? `<span class="chip ${a.jaAnexado || a.anexado ? 'ok' : a.recusado ? 'warn' : 'info'}">${a.jaAnexado || a.anexado ? 'anexado' : 'a anexar'}</span>` : a.status === 'erro' ? '<span class="chip err">erro</span>' : ''}
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
  const temLista = W.opcoes[k]?.length || c.tipo === 'combo';
  const list = temLista ? `list="dl-${k}"` : '';
  const dl = temLista ? `<datalist id="dl-${k}">${(W.opcoes[k] || []).map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '';
  const ph = { data: 'DD/MM/AAAA', competencia: 'MM/AAAA', cpf: '000.000.000-00', cep: '00000-000', moeda: '0,00' }[c.tipo] || (c.tipo === 'combo' ? 'Digite ou escolha' : '');
  const im = ['data', 'competencia', 'numero', 'cpf', 'cep', 'pis', 'moeda', 'telefone'].includes(c.tipo) ? 'inputmode="numeric"' : '';
  return `<input id="${id}" data-k="${k}" data-t="${c.tipo}" class="${cls}" value="${esc(v)}" placeholder="${ph}" ${im} ${list} autocomplete="off">${dl}`;
}

/* "No portal": o que está (ou vai) em cada campo do formulário, sem duplicar os campos do portal.
   Só o que o portal não tem (dias, CID, médico, observações) é editável aqui: alimenta a descrição. */
let lastFieldsKey = '';
function renderFieldsOnlySeMudou() {
  const tipo = S.ctx.tipo; if (!tipo) return;
  const k = chaveCampos(tipo);
  if (k === lastFieldsKey) return;
  if (!document.activeElement?.closest?.('#fields')) renderFieldsOnly();
  else if (S.modo === 'plataforma') atualizarEstadosPlat(tipo);
}
function renderFieldsOnly() {
  const el = $('#fields'); if (!el) return;
  if (S.modo === 'plataforma') return renderFormularioProprio(el, S.ctx.tipo);
  const tipo = S.ctx.tipo; const t = tipoDef(tipo); const W = w(tipo);
  lastFieldsKey = chaveCampos(tipo);
  const pf = S.ctx.form?.campos || {};
  const cond = E.activeConditionals(t, valoresParaChecar(tipo));
  const reqCond = new Set(cond.flatMap(c => c.obrigatorios || []));
  const obrig = (k, c) => c.obrigatorio || reqCond.has(k);
  // campos do portal: obrigatórios ou com algum valor (no portal ou lido pelo Assistente)
  const doPortal = Object.entries(t.campos).filter(([k, c]) => !c.somenteAssistente && !TEXTOS.includes(k) && pf[k]?.existe !== false
    && (obrig(k, c) || pf[k]?.valor || W.valores[k]?.valor));
  const linha = ([k, c]) => {
    const p = pf[k] || {}; const v = W.valores[k];
    const noPortal = p.valor || '';
    const nosso = noPortal && W.ultimoPreenchido?.[k] === noPortal;
    const pendente = !noPortal && v?.valor;
    const apx = noPortal && W.aproximadas?.[k] && E.norm(W.aproximadas[k].escolhida) === E.norm(noPortal) ? W.aproximadas[k] : null;
    const erro = erroDoPortal(k);
    const estado = p.disabled ? ['muted', 'bloqueado'] : erro ? ['err', 'recusado'] : apx ? ['warn', 'confira'] : noPortal ? (nosso ? ['ok', 'Assistente'] : ['info', 'você']) : pendente ? ['warn', 'a preencher'] : obrig(k, c) ? ['err', 'vazio'] : ['muted', '—'];
    const fonte = nosso && v?.fonte ? v.fonte : '';
    const baixa = nosso && v?.conf != null && v.conf < 0.6;
    return `<div class="field frow${baixa ? ' low' : ''}">
      <button type="button" class="frow-b" data-k="${k}" title="${esc(fonte ? 'De: ' + fonte : 'Mostrar no portal')}">
        <span class="frow-l">${esc(c.rotulo)}${obrig(k, c) ? '<span class="req">*</span>' : ''}</span>
        <span class="frow-v">${esc(noPortal || v?.valor || '')}${baixa ? ' <small class="chip warn">confira</small>' : ''}</span>
        <span class="chip ${estado[0]}">${estado[1]}</span>
      </button>
      ${k === 'empregado' && W.candidatos?.length && !noPortal ? `<div class="cands"><small>Qual deles?</small>${W.candidatos.map(n => `<button type="button" class="btn btn-sm" data-cand="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
      ${k === 'empregado' && W.pacienteLido && !noPortal && !W.candidatos?.length ? `<small class="hint">No documento: “${esc(W.pacienteLido)}” — não achei esse nome na lista. Escolha o funcionário no portal.</small>` : ''}
      ${apx ? `<small class="aprox">${esc(msgAproximada(apx))}</small>` : ''}
      ${erro ? `<small class="portal-erro">${esc((S.rules.mensagens?.portalAcusa || 'O portal acusa: {mensagem}').replace('{mensagem}', erro.mensagem))}</small>` : ''}
    </div>`;
  };
  const extras = Object.entries(t.campos).filter(([, c]) => c.somenteAssistente);
  const texto = (k) => pf[k]?.valor || W.valores[k]?.valor || '';
  const editadoNoPortal = TEXTOS.some(k => W.editados.has(k));
  el.innerHTML = `
    <div class="card frows">${doPortal.map(linha).join('') || '<p class="muted" style="margin:8px 12px">Nada preenchido ainda. Arraste um documento ou escreva o pedido acima.</p>'}</div>
    <small class="muted frows-nota">Para corrigir, mude direto no portal — eu acompanho e atualizo o assunto e a descrição.</small>
    ${extras.length || t.descricao?.length ? `<h2 class="sec">Só para a descrição</h2>
    <div class="fields">${extras.map(([k, c]) => {
      const cur = W.valores[k];
      return `<div class="field"><label for="f-${k}">${esc(c.rotulo)}${c.sensivel ? ` <span class="chip warn" title="Dado sensível">sensível</span>` : ''}${cur?.fonte ? `<span class="src" title="${esc(cur.fonte)}">${esc(cur.fonte)}</span>` : ''}</label>${fieldInput(k, c, cur, W)}</div>`;
    }).join('')}
    ${t.descricao?.length ? `<div class="field"><label for="f-obs">Observações para o analista</label><textarea id="f-obs" class="input" rows="2" data-obs="1" placeholder="Algo mais que o escritório precisa saber?">${esc(W.valores.observacoes?.valor || '')}</textarea></div>` : ''}
    ${t.campos.cid ? `<label class="toggle"><input type="checkbox" id="tg-cid" ${cidAtivo() ? 'checked' : ''}><span>Incluir CID na descrição<small>${cidAtivo() && !S.prefs.incluirCid ? 'Ligado pelo escritório para esta empresa — você pode desligar.' : 'Dado de saúde (LGPD). Deixe desligado se não for necessário.'}</small></span></label>` : ''}
    </div>` : ''}
    ${t.campos.assunto || t.campos.descricao ? `<details class="more texto-prev"${texto('descricao') ? '' : ' open'}><summary>Assunto e descrição ${editadoNoPortal ? '<small class="chip info">editados por você no portal</small>' : '<small class="chip ok">gerados</small>'}</summary>
      ${texto('assunto') ? `<p class="tp-a">${esc(texto('assunto'))}</p>` : ''}
      ${texto('descricao') ? `<pre class="tp-d">${esc(texto('descricao'))}</pre>` : '<p class="muted">Aparecem quando houver dados.</p>'}</details>` : ''}
    ${calcBox(tipo)}`;

  const onInput = debounce(() => { gerarTextos(tipo); updateChecks(); refreshCalc(); atualizarTextoNoPortal(tipo); }, 400);
  el.querySelectorAll('input[data-k], textarea[data-k]').forEach(inp => {
    inp.addEventListener('input', () => {
      maskInput(inp);
      const k = inp.dataset.k;
      W.valores[k] = { valor: inp.value, conf: 1, fonte: 'você' }; W.editados.add(k);
      inp.classList.remove('found', 'low');
      onInput();
    });
  });
  el.querySelectorAll('.frow-b').forEach(b => b.addEventListener('click', () => { const def = t.campos[b.dataset.k]; if (def) send({ type: 'highlight', locator: def }); }));
  $('#f-obs')?.addEventListener('input', (e) => { W.valores.observacoes = { valor: e.target.value, conf: 1, fonte: 'você' }; onInput(); });
  el.querySelectorAll('[data-cand]').forEach(b => b.addEventListener('click', () => {
    W.valores.empregado = { valor: b.dataset.cand, conf: 1, fonte: 'você' }; W.candidatos = null;
    gerarTextos(tipo); renderFieldsOnly(); updateChecks();
    if (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo);
  }));
  $('#tg-cid')?.addEventListener('change', (e) => { S.prefs.incluirCid = e.target.checked; S.prefs.cidEscolhido = true; savePrefs(); gerarTextos(tipo); atualizarTextoNoPortal(tipo); renderFieldsOnly(); });
}
/* =================== Formulário próprio (plataforma) =================== */
/* Com a plataforma em tela cheia, o formulário é daqui: cada campo do portal aparece aqui, e o que o
   cliente escreve vai para o portal por baixo (ao sair do campo, em lote). Assim que o portal confirma,
   o estado do campo mostra se ficou igual lá. O resumo antes de enviar continua lendo o próprio portal. */
const envioPendente = new Map();   // tipo → { t, campos: Set } (só os campos que o cliente mudou vão ao portal)
function agendarEnvioPortal(tipo, k) {
  const p = envioPendente.get(tipo) || { campos: new Set() };
  clearTimeout(p.t); if (k) p.campos.add(k);
  p.t = setTimeout(() => { envioPendente.delete(tipo); if (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo, { daPlataforma: true, so: [...p.campos] }); }, 500);
  envioPendente.set(tipo, p);
}
async function enviarPendenteAgora(tipo) {
  const p = envioPendente.get(tipo); if (!p) return;
  clearTimeout(p.t); envioPendente.delete(tipo);
  await fillPortal(tipo, { daPlataforma: true, so: [...p.campos] });
}
/** Valor que o formulário da plataforma mostra: o que o cliente escreveu aqui; senão o do portal. Depois de um
 *  Desfazer, o mesmo que o portal (o que foi desfeito não aparece aqui como se ainda estivesse lá). */
function valorPlat(tipo, k) {
  const W = w(tipo); const p = campoPortal(k); const cur = W.valores[k];
  if (W.fonteVerdade?.[k] === 'plataforma') return cur?.valor ?? '';
  if (W.pausarAuto && p.existe) return p.valor || '';
  return p.valor || cur?.valor || '';
}
const erroDoPortal = (k) => (S.ctx.form?.erros || []).find(e => e.k === k) || null;
/** Estado de um campo do formulário próprio: o que está no portal comparado com o que o cliente escreveu aqui. */
function estadoCampoPlat(tipo, k, obrigatorio) {
  const W = w(tipo); const p = campoPortal(k); const cur = W.valores[k];
  const valor = valorPlat(tipo, k);
  if (p.disabled) return ['muted', 'bloqueado'];
  if (erroDoPortal(k)) return ['err', 'o portal recusou'];
  if (valor && E.norm(valor) !== E.norm(p.valor || '')) return ['warn', 'ainda não está no portal'];
  if (p.valor && W.aproximadas?.[k] && E.norm(W.aproximadas[k].escolhida) === E.norm(p.valor)) return ['warn', 'confira'];
  if (p.valor) return W.ultimoPreenchido?.[k] === p.valor && cur?.fonte && cur.fonte !== 'você' ? ['ok', 'lido pelo Assistente'] : ['info', 'no portal'];
  return obrigatorio ? ['err', 'obrigatório'] : ['', ''];
}
/** Enquanto o cliente digita no formulário, não redesenha os campos (perderia o cursor): só os estados. */
function atualizarEstadosPlat(tipo) {
  const t = tipoDef(tipo); if (!t) return;
  document.querySelectorAll('#fields .field.pf[data-campo]').forEach(f => {
    const k = f.dataset.campo; const lbl = f.querySelector('label'); if (!lbl) return;
    const [cls, txt] = estadoCampoPlat(tipo, k, !!(t.campos[k]?.obrigatorio && !campoPortal(k).disabled));
    f.classList.toggle('pf-err', !!erroDoPortal(k));
    let chip = lbl.querySelector('.pf-st');
    if (!txt) { chip?.remove(); return; }
    if (!chip) { chip = document.createElement('span'); lbl.insertBefore(chip, lbl.querySelector('.src')); }
    chip.className = `chip ${cls} pf-st`; chip.textContent = txt;
  });
}
const chaveCampos = (tipo) => { const W = w(tipo); return JSON.stringify([S.ctx.form?.campos, S.ctx.form?.extras, S.ctx.form?.erros, Object.entries(W.valores).map(([a, b]) => [a, b?.valor]), W.ultimoPreenchido, W.aproximadas, W.sugestoes, W.pausarAuto]); };
function renderFormularioProprio(el, tipo) {
  const t = tipoDef(tipo); const W = w(tipo);
  lastFieldsKey = chaveCampos(tipo);
  const pf = S.ctx.form?.campos || {};
  const cond = E.activeConditionals(t, valoresParaChecar(tipo));
  const reqCond = new Set(cond.flatMap(c => c.obrigatorios || []));
  const obrig = (k, c) => (c.obrigatorio || reqCond.has(k)) && !campoPortal(k).disabled;
  const doPortal = Object.entries(t.campos).filter(([k, c]) => !c.somenteAssistente && !TEXTOS.includes(k) && pf[k]?.existe !== false);
  // campos do portal que as regras não conhecem: aparecem num grupo próprio e também são preenchidos
  const foraDasRegras = Object.keys(S.ctx.form?.extras || {}).map(k => [k, campoDef(tipo, k)]);
  const grupos = new Map();
  for (const par of [...doPortal, ...foraDasRegras]) { const g = par[1].grupo || ''; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(par); }
  const fv = W.fonteVerdade || (W.fonteVerdade = {});
  const M = S.rules.mensagens || {};
  const campo = ([k, c]) => {
    const p = campoPortal(k); const cur = W.valores[k];
    const daqui = fv[k] === 'plataforma';
    const valor = valorPlat(tipo, k);
    const estado = estadoCampoPlat(tipo, k, obrig(k, c));
    const fonte = cur?.fonte && !['você', 'gerado'].includes(cur.fonte) && !daqui ? cur.fonte : '';
    const baixa = cur?.conf != null && cur.conf < 0.6 && !W.editados.has(k) && !daqui;
    const erro = erroDoPortal(k);
    const apx = W.aproximadas?.[k] && E.norm(W.aproximadas[k].escolhida) === E.norm(p.valor || '') ? W.aproximadas[k] : null;
    const sug = !p.valor && W.sugestoes?.[k]?.length ? W.sugestoes[k] : null;
    return `<div class="field pf${c.tipo === 'textarea' ? ' wide' : ''}${baixa ? ' low' : ''}${erro ? ' pf-err' : ''}" data-campo="${esc(k)}">
      <label for="f-${esc(k)}">${esc(c.rotulo)}${obrig(k, c) ? '<span class="req">*</span>' : ''}${estado[1] ? ` <span class="chip ${estado[0]} pf-st">${estado[1]}</span>` : ''}${fonte ? `<span class="src" title="${esc('De: ' + fonte)}">${esc(fonte)}</span>` : ''}</label>
      ${fieldInput(k, c, { ...(cur || {}), valor }, W)}
      ${erro ? `<small class="portal-erro">${esc((M.portalAcusa || 'O portal acusa: {mensagem}').replace('{mensagem}', erro.mensagem))}</small>` : ''}
      ${p.disabled ? '<small class="hint">O portal libera este campo depois de outro (por exemplo, depois de escolher o funcionário).</small>' : ''}
      ${baixa ? '<small class="hint">Leitura com dúvida: confira.</small>' : ''}
      ${apx ? `<small class="aprox">${esc(msgAproximada(apx))}</small>` : ''}
      ${sug ? `<div class="cands"><small>Você quis dizer:</small>${sug.map(s => `<button type="button" class="btn btn-sm" data-sug-k="${esc(k)}" data-sug-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
      ${k === 'empregado' && W.candidatos?.length && !p.valor ? `<div class="cands"><small>Qual deles?</small>${W.candidatos.map(n => `<button type="button" class="btn btn-sm" data-cand="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
      ${k === 'empregado' && W.pacienteLido && !valor && !W.candidatos?.length ? `<small class="hint">No documento: “${esc(W.pacienteLido)}” — não achei esse nome na lista. Escolha o funcionário.</small>` : ''}
    </div>`;
  };
  const extras = Object.entries(t.campos).filter(([, c]) => c.somenteAssistente);
  const textos = TEXTOS.filter(k => t.campos[k] && pf[k]?.existe !== false);
  const OUTROS = 'Outros campos do portal';
  el.innerHTML = `
    ${[...grupos].map(([g, lista], i) => g ? `<details class="pf-grupo" ${i === 0 || lista.some(([k, c]) => (obrig(k, c) && !(campoPortal(k).valor || W.valores[k]?.valor)) || erroDoPortal(k)) ? 'open' : ''}><summary>${esc(g)}</summary>${g === OUTROS ? '<small class="hint" style="margin:0 0 8px">Campos do portal que o escritório ainda não incluiu nas regras do Assistente. O que você preencher aqui também vai para o portal.</small>' : ''}<div class="pf-grid">${lista.map(campo).join('')}</div></details>` : `<div class="pf-grid">${lista.map(campo).join('')}</div>`).join('')
      || '<p class="muted">Abrindo o formulário no portal…</p>'}
    ${extras.length || t.descricao?.length ? `<div class="pf-sec">Só para a descrição</div><div class="pf-grid">${extras.map(([k, c]) => {
      const cur = W.valores[k];
      return `<div class="field"><label for="f-${k}">${esc(c.rotulo)}${c.sensivel ? ` <span class="chip warn" title="Dado sensível">sensível</span>` : ''}${cur?.fonte ? `<span class="src" title="${esc(cur.fonte)}">${esc(cur.fonte)}</span>` : ''}</label>${fieldInput(k, c, cur, W)}</div>`;
    }).join('')}
      ${t.descricao?.length ? `<div class="field wide"><label for="f-obs">Observações para o analista</label><textarea id="f-obs" class="input" rows="2" data-obs="1" placeholder="Algo mais que o escritório precisa saber?">${esc(W.valores.observacoes?.valor || '')}</textarea></div>` : ''}</div>
      ${t.campos.cid ? `<label class="toggle"><input type="checkbox" id="tg-cid" ${cidAtivo() ? 'checked' : ''}><span>Incluir CID na descrição<small>${cidAtivo() && !S.prefs.incluirCid ? 'Ligado pelo escritório para esta empresa — você pode desligar.' : 'Dado de saúde (LGPD). Deixe desligado se não for necessário.'}</small></span></label>` : ''}` : ''}
    ${textos.length ? `<div class="pf-sec">Assunto e descrição ${textos.some(k => W.editados.has(k)) ? '<small class="chip info">editados por você</small>' : '<small class="chip ok">gerados</small>'}</div>
      <div class="pf-grid">${textos.map(k => campo([k, t.campos[k]])).join('')}</div>` : ''}
    ${calcBox(tipo)}`;
  // campos bloqueados pelo portal
  for (const [k] of [...doPortal, ...foraDasRegras]) if (campoPortal(k).disabled) el.querySelectorAll(`[data-k="${CSS.escape(k)}"]`).forEach(i => { i.disabled = true; });
  const aoDigitar = debounce(() => { gerarTextos(tipo); syncGenerated(); updateChecks(); refreshCalc(); }, 400);
  const marcar = (k, valor) => {
    W.valores[k] = { valor, conf: 1, fonte: 'você' }; W.editados.add(k);
    delete W.aproximadas?.[k]; delete W.sugestoes?.[k];
    if (!campoDef(tipo, k)?.somenteAssistente) fv[k] = 'plataforma';
  };
  el.querySelectorAll('input[data-k], textarea[data-k]').forEach(inp => {
    const k = inp.dataset.k; const c = campoDef(tipo, k);
    inp.addEventListener('input', () => { maskInput(inp); marcar(k, inp.value); inp.classList.remove('found', 'low'); aoDigitar(); });
    inp.addEventListener('change', () => { if (c?.somenteAssistente) atualizarTextoNoPortal(tipo); else agendarEnvioPortal(tipo, k); });
    // listas do portal (motivos, cargos…): busca as opções quando o campo ganha o foco; se a busca falhou, tenta de novo na próxima vez
    if (c?.tipo === 'combo' && c.fc) inp.addEventListener('focus', async () => {
      if (W.opcoes[k]?.length || inp.dataset.buscando) return;
      inp.dataset.buscando = '1';
      let r; try { r = await request({ type: 'getOptions', locator: { fc: c.fc } }, 8000); } finally { delete inp.dataset.buscando; }
      if (r?.options?.length) { W.opcoes[k] = r.options; const dl = document.getElementById(`dl-${k}`); if (dl) dl.innerHTML = r.options.map(o => `<option value="${esc(o)}">`).join(''); }
      if (!document.activeElement || document.activeElement === document.body) inp.focus();
    });
  });
  el.querySelectorAll('.seg [data-k]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k; marcar(k, b.dataset.v);
    b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    gerarTextos(tipo); updateChecks(); agendarEnvioPortal(tipo, k);
  }));
  $('#f-obs')?.addEventListener('input', (e) => { W.valores.observacoes = { valor: e.target.value, conf: 1, fonte: 'você' }; aoDigitar(); });
  $('#f-obs')?.addEventListener('change', () => atualizarTextoNoPortal(tipo));
  el.querySelectorAll('[data-cand]').forEach(b => b.addEventListener('click', () => {
    marcar('empregado', b.dataset.cand); W.candidatos = null;
    gerarTextos(tipo); renderFieldsOnly(); updateChecks(); fillPortal(tipo, { daPlataforma: true, so: ['empregado'] });
  }));
  el.querySelectorAll('[data-sug-k]').forEach(b => b.addEventListener('click', () => escolherSugestao(tipo, b.dataset.sugK, b.dataset.sugV)));
  $('#tg-cid')?.addEventListener('change', (e) => { S.prefs.incluirCid = e.target.checked; S.prefs.cidEscolhido = true; savePrefs(); gerarTextos(tipo); atualizarTextoNoPortal(tipo); renderFieldsOnly(); });
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
/** Avisos que não vêm das regras do pedido: o que o leitor viu nos documentos, leitura difícil, pedido repetido. */
function avisosExtras(tipo, vals) {
  const W = w(tipo); const out = [];
  const docs = W.arquivos.filter(a => !a.removido && !a.outroTipo && a.status === 'ok');
  for (const a of docs) {
    for (const av of a.analise?.avisos || []) out.push({ nivel: av.nivel, grupo: 'Documento', mensagem: docs.length > 1 ? `${a.nome}: ${av.mensagem}` : av.mensagem });
    if (a.metodo === 'ocr' && a.confianca != null && a.confianca < 60) out.push({ nivel: 'info', grupo: 'Documento', mensagem: `A leitura de “${a.nome}” foi difícil (letra à mão ou foto). Confira os campos — os duvidosos ficam em amarelo.` });
  }
  const dup = duplicado(tipo, vals);
  if (dup) out.push({ nivel: 'atencao', grupo: 'Pedido repetido?', mensagem: dup });
  return out;
}
/** Campos que não existem nesta tela ou estão bloqueados pelo portal não contam como obrigatórios. */
function camposAusentes(form) {
  return Object.entries(form?.campos || {}).filter(([, v]) => !v.existe || v.disabled).map(([k]) => k);
}

/* Campos que o leitor não encontrou: aviso no painel e no próprio portal */
let lastMissingKey = '';
function camposFaltando(tipo, list) {
  const t = tipoDef(tipo); const W = w(tipo);
  const leuDocumento = W.arquivos.some(a => a.status === 'ok' && !a.removido && !a.outroTipo);
  const vals = valoresParaChecar(tipo);
  const out = new Map();
  for (const i of list) if (i.nivel === 'erro' && i.grupo === 'Campos obrigatórios' && i.campo && !['assunto', 'descricao'].includes(i.campo)) out.set(i.campo, true);
  if (leuDocumento) for (const k of t.esperadoDoDocumento || []) {
    if (!t.campos[k] || (vals[k] != null && String(vals[k]).trim() !== '')) continue;
    if (S.ctx.form?.campos?.[k]?.disabled) continue;
    out.set(k, true);
  }
  return [...out.keys()].map(k => ({ k, def: t.campos[k], texto: leuDocumento ? 'Não encontrado no documento — preencha aqui' : 'Preencha este campo' }));
}
function marcarFaltando(tipo, list) {
  const falt = camposFaltando(tipo, list);
  const set = new Set(falt.map(f => f.k));
  // no painel
  document.querySelectorAll('#fields .field').forEach(f => {
    const k = f.querySelector('[data-k]')?.dataset.k; if (!k) return;
    const on = set.has(k);
    f.classList.toggle('missing', on);
    let hint = f.querySelector('.miss');
    if (on && !hint) { hint = document.createElement('small'); hint.className = 'miss'; f.appendChild(hint); }
    if (on) hint.textContent = falt.find(x => x.k === k).texto.replace(' — preencha aqui', '');
    else hint?.remove();
  });
  // no portal (só campos que existem lá)
  const campos = falt.filter(f => !f.def.somenteAssistente).map(f => ({ k: f.k, texto: f.texto, locator: f.def }));
  const key = JSON.stringify(campos.map(c => [c.k, c.texto]));
  if (key !== lastMissingKey) { lastMissingKey = key; send({ type: 'markMissing', campos }); }
}

function updateChecks() {
  const el = $('#checks'); if (!el || !S.ctx.tipo) return;
  const tipo = S.ctx.tipo;
  const vals = valoresParaChecar(tipo);
  const list = [...E.runChecks(tipo, vals, anexosAtuais(tipo), S.rules, E.today(), { ausentes: camposAusentes(S.ctx.form) }), ...avisosExtras(tipo, vals)];
  lastChecks = list;
  marcarFaltando(tipo, list);
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

/** Listas em que o Assistente escolhe sozinho quando o portal tem uma opção só (regras: config.escolherUnicaOpcao). */
function camposUnicaOpcao(tipo) {
  const u = S.rules.config?.escolherUnicaOpcao; if (!u || u.ativo === false) return [];
  if (Array.isArray(u.tipos) && !u.tipos.includes(tipo)) return [];
  const t = tipoDef(tipo); const W = w(tipo);
  return (u.campos || []).filter(k => t.campos[k]?.tipo === 'combo' && !W.editados.has(k) && !W.valores[k]?.valor);
}
/**
 * Manda os valores ao portal. Sem `so`, manda tudo (botão "Preencher no portal", documento, modelo, lote).
 * Com `so` (lista de campos), manda só esses — é o ajuste feito no formulário da plataforma — e o assunto e a
 * descrição quando o texto gerado mudou e o portal ainda está com o texto do Assistente.
 */
async function fillPortal(tipo, { silencioso = false, daPlataforma = false, so = null } = {}) {
  const W = w(tipo); const t = tipoDef(tipo);
  const parcial = Array.isArray(so);
  if (!silencioso && !parcial) {
    W.pausarAuto = false;
    // "Preencher no portal" depois de um Desfazer: o que tinha sido lido volta
    for (const [k, v] of Object.entries(W.desfeitos || {})) if (!W.valores[k]?.valor && !W.editados.has(k)) W.valores[k] = v;
    W.desfeitos = null;
  } else if (silencioso && W.pausarAuto) return;       // o cliente desfez: só preenche de novo se ele pedir
  gerarTextos(tipo);
  if (silencioso && telaDiferente(tipo) && !W.forcarPreenchimento) { renderModoSeguro(tipo); return; }
  const values = {};
  const noPortal = (k) => campoPortal(k).valor || '';
  for (const [k, v] of Object.entries(W.valores)) {
    const def = campoDef(tipo, k);
    if (!def || def.somenteAssistente || !v?.valor) continue;
    if (parcial && !so.includes(k) && !TEXTOS.includes(k)) continue;
    // o que o cliente escreveu direto no portal fica como está
    if (noPortal(k) && noPortal(k) !== (W.ultimoPreenchido?.[k] ?? null) && noPortal(k) !== v.valor && W.fonteVerdade?.[k] !== 'plataforma') continue;
    // ajuste de um campo: o texto gerado só vai se mudou e se o portal ainda está com o texto do Assistente
    if (parcial && TEXTOS.includes(k) && !so.includes(k) && (W.pausarAuto || W.editados.has(k) || noPortal(k) !== (W.ultimoPreenchido?.[k] || '') || noPortal(k) === v.valor)) continue;
    values[k] = v.valor;
  }
  if (!parcial) {
    // padrões das regras (ex.: país Brasil) só se vazio no portal
    for (const [k, c] of Object.entries(t.campos)) if (c.padrao && !values[k] && !portalValores(tipo)[k]) values[k] = c.padrao;
    // condicionais que definem valores (ex.: pedido de demissão → aviso dado pelo empregado)
    for (const c of E.activeConditionals(t, { ...portalValores(tipo), ...values })) for (const [k, v] of Object.entries(c.valores || {})) if (!values[k] && !W.editados.has(k)) values[k] = v;
  }
  if (parcial && !Object.keys(values).length) return;
  // anexos: recusados pelo portal ou tirados pelo cliente lá só voltam quando ele pede ("Preencher no portal")
  const files = parcial ? [] : W.arquivos.filter(a => !a.removido && !a.jaAnexado && !a.anexado && !a.outroTipo && a.status !== 'lendo' && !(silencioso && (a.recusado || a.tiradoNoPortal))).map(a => a.file);
  const btn = parcial ? null : $('#btn-fill');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Preenchendo…'; }
  const aoAvancar = (p) => { if (btn?.isConnected && p.m) btn.innerHTML = `<div class="spin"></div> Preenchendo… ${Math.min(p.n + 1, p.m)} de ${p.m}`; };
  const packed = await packFiles(files);
  S.preenchendo = true;
  let r;
  // o preenchimento foca campos do portal: guarda onde o cliente estava digitando na plataforma
  const foco = document.activeElement?.id;
  // o que o cliente digita na plataforma não entra no Desfazer (para corrigir, basta editar o campo)
  const opts = { naoSobrescrever: false, avisoDesfazer: !daPlataforma, semDesfazer: daPlataforma, voltarInicio: !parcial, unicaOpcao: parcial ? [] : camposUnicaOpcao(tipo) };
  try { r = await requestFill({ type: 'fill', tipo, values, files: packed, opts }, packed.map(p => p.buf), aoAvancar); }
  finally { S.preenchendo = false; }
  if (S.modo === 'plataforma' && foco && document.activeElement?.id !== foco) document.getElementById(foco)?.focus();
  const btn2 = $('#btn-fill'); if (btn2 && !parcial) { btn2.disabled = false; btn2.innerHTML = `${icon('fill', 'ic-sm')} Preencher no portal`; }
  if (r?.depois) W.ultimoPreenchido = { ...(W.ultimoPreenchido || {}), ...Object.fromEntries(Object.entries(r.depois).filter(([, v]) => v)) };
  W.portalVisto = { ...portalValores(tipo), ...(r?.depois || {}) };
  aplicarResultados(tipo, r, files);
  // ajuste de um campo: junta ao resultado do último preenchimento completo
  if (parcial && r && W.resultados?.resultados) {
    const novos = new Set(r.resultados.map(x => x.campo));
    W.resultados = { ...W.resultados, resultados: [...W.resultados.resultados.filter(x => !novos.has(x.campo)), ...r.resultados] };
  } else if (r || !parcial) W.resultados = r;
  // sem resposta (o preenchimento não terminou): não grava como "preenchido", para a Agenda
  // não criar prazos de um pedido que não existe
  if (r) await salvarHistorico(tipo, 'preenchido');
  if (S.view === 'preencher') { renderFilesOnly(); if (S.modo === 'plataforma') renderFieldsOnlySeMudou(); else renderFieldsOnly(); renderFillResult(); updateChecks(); }
  if (!r) toast('O preenchimento não terminou. Confira o portal — o botão “Desfazer” volta tudo.');
  else if (daPlataforma) { /* ajuste de um campo: o estado aparece no próprio formulário, sem aviso */ }
  // quando a página já mostrou o aviso com "↶ Desfazer", não sobrescreve (apagaria o botão)
  else if (r.resultados && !r.mudou) toast(`${r.resultados.filter(x => x.ok).length} campo(s) preenchido(s)${r.anexados ? ` · ${r.anexados} anexo(s)` : ''}. Confira antes de enviar.`);
}
/** O que o portal respondeu, campo a campo: opção aproximada, sugestões, única opção e anexo por anexo. */
function aplicarResultados(tipo, r, files) {
  if (!r) return;
  const W = w(tipo);
  W.aproximadas = W.aproximadas || {}; W.sugestoes = W.sugestoes || {};
  for (const x of r.resultados || []) {
    const k = x.campo;
    if (x.ok) {
      delete W.sugestoes[k];
      if (x.aproximada) { W.aproximadas[k] = { escolhida: x.valor, pedido: x.pedido }; if (W.valores[k]) W.valores[k] = { ...W.valores[k], valor: x.valor }; }
      else if (!x.igual) delete W.aproximadas[k];
      if (x.unica) W.valores[k] = { valor: x.valor, conf: 0.9, fonte: S.rules.mensagens?.unicaOpcao || 'única opção do portal' };
    } else if (x.sugestoes?.length) {
      // funcionário: "Qual deles?"; outras listas: "Você quis dizer"
      if (campoDef(tipo, k)?.fonte === 'empregado') W.candidatos = x.sugestoes; else W.sugestoes[k] = x.sugestoes;
    }
  }
  const an = r.anexos;
  for (const a of W.arquivos) {
    if (!files.includes(a.file)) continue;
    if (!an) { if (r.anexados) a.anexado = true; continue; }
    if (an.aceitos?.includes(a.nome) || an.jaEstavam?.includes(a.nome)) { a.anexado = true; a.recusado = false; a.tiradoNoPortal = false; }
    else if (an.recusados?.includes(a.nome)) { a.anexado = false; a.recusado = true; }
  }
}
function renderFillResult() {
  const el = $('#fill-res'); if (!el) return;
  const tipo = S.ctx.tipo; if (!tipo) { el.innerHTML = ''; return; }
  const W = w(tipo); const t = tipoDef(tipo); const r = W.resultados;
  const erros = S.ctx.form?.erros || [];
  const aprox = Object.entries(W.aproximadas || {}).filter(([k, a]) => E.norm(campoPortal(k).valor || '') === E.norm(a.escolhida));
  const sug = Object.entries(W.sugestoes || {}).filter(([, l]) => l?.length);
  const recusados = W.arquivos.filter(a => a.recusado && !a.removido);
  const chave = JSON.stringify([r?.resultados?.map(x => [x.campo, x.ok, x.motivo]), erros, aprox, sug, recusados.map(a => a.nome), S.modo]);
  if (chave === el.dataset.chave) return;
  el.dataset.chave = chave;
  const M = S.rules.mensagens || {};
  const partes = [];
  // o portal recusou o envio: o que ele acusa (só rótulo e mensagem) e o caminho para ver a página
  if (erros.length) partes.push(`<div class="note err" style="margin-top:10px">${icon('alert')}<div><b>O portal não aceitou estes campos:</b>
    <ul class="tips" style="margin-top:6px">${erros.map(e => `<li>${esc(e.rotulo)}: ${esc(e.mensagem)}</li>`).join('')}</ul>
    ${S.modo === 'plataforma' ? `<button type="button" class="btn btn-sm" id="fr-ver-portal">${icon('external', 'ic-sm')} Ver no portal</button>` : ''}</div></div>`);
  if (r?.resultados) {
    const falhas = r.resultados.filter(x => !x.ok);
    const ok = r.resultados.filter(x => x.ok).length;
    const unicas = r.resultados.filter(x => x.ok && x.unica);
    const linhas = [
      ...falhas.map(f => `<li>${esc(rotuloDe(tipo, f.campo))}: ${esc(f.motivo)}${W.sugestoes?.[f.campo]?.length ? ` <span class="cands"><small>Você quis dizer:</small>${W.sugestoes[f.campo].map(s => `<button type="button" class="btn btn-sm" data-sug-k="${esc(f.campo)}" data-sug-v="${esc(s)}">${esc(s)}</button>`).join('')}</span>` : ''}</li>`),
      ...aprox.map(([k, a]) => `<li>${esc(rotuloDe(tipo, k))}: ${esc(msgAproximada(a))}</li>`),
      ...unicas.map(x => `<li>${esc(rotuloDe(tipo, x.campo))}: ${esc(x.valor)} (${esc(M.unicaOpcao || 'única opção do portal')})</li>`),
      ...recusados.map(a => `<li>${esc(a.nome)}: ${esc(M.anexoRecusado || 'O portal não aceitou este arquivo (formato ou tamanho?)')}</li>`)
    ];
    const atencao = falhas.length || aprox.length || recusados.length;
    partes.push(`<div class="note ${atencao ? 'warn' : 'ok'}" style="margin-top:10px">${icon(atencao ? 'alert' : 'check')}<div>
      <b>${ok} campo(s) preenchido(s)${r.anexados ? ` e ${r.anexados} anexo(s)` : ''}.</b> Revise na tela e clique em ${esc((t.botaoEnviar || 'ADICIONAR'))} quando estiver tudo certo.
      ${linhas.length ? `<ul class="tips" style="margin-top:6px">${linhas.join('')}</ul>` : ''}</div></div>`);
  }
  el.innerHTML = partes.join('');
  $('#fr-ver-portal')?.addEventListener('click', () => send({ type: 'modo', modo: 'painel' }));
  el.querySelectorAll('[data-sug-k]').forEach(b => b.addEventListener('click', () => escolherSugestao(tipo, b.dataset.sugK, b.dataset.sugV)));
}
/** "Você quis dizer": o cliente escolheu uma das opções parecidas da lista do portal. */
function escolherSugestao(tipo, k, v) {
  const W = w(tipo);
  W.valores[k] = { valor: v, conf: 1, fonte: 'você' }; W.editados.add(k); W.fonteVerdade[k] = 'plataforma';
  delete W.sugestoes[k]; delete W.aproximadas[k];
  gerarTextos(tipo); renderFieldsOnly(); renderFillResult(); updateChecks();
  if (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo, { daPlataforma: true, so: [k] });
}

/* =================== Portal ↔ Assistente =================== */
/* O portal é onde se preenche e se corrige. O Assistente só acompanha: se o cliente muda um campo
   lá, vale o que está no portal (e o assunto/descrição gerados se atualizam sozinhos). */
const TEXTOS = ['assunto', 'descricao'];
function sincronizarDoPortal(tipo) {
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
const atualizarTextoNoPortal = debounce(async (tipo) => {
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
function atualizarBotaoDesfazer() {
  const b = $('#btn-undo'); if (!b) return;
  b.hidden = !(S.desfazerN > 0 && S.ctx.route?.mode === 'form');
  b.title = S.desfazerN > 1 ? `Desfaz o último preenchimento (há ${S.desfazerN})` : 'Volta o formulário do portal a como estava antes do último preenchimento';
}
async function desfazerPreenchimento() {
  const b = $('#btn-undo'); if (b) { b.disabled = true; b.innerHTML = '<div class="spin"></div> Desfazendo…'; }
  await request({ type: 'undo' }, 30000);
  if (b) { b.disabled = false; b.innerHTML = `${icon('undo', 'ic-sm')} Desfazer o preenchimento`; }
}
function aoDesfazer(m) {
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
  W.pausarAuto = true;
  W.resultados = null;
  if (S.view === 'preencher') render();
}

/* =================== Antes de enviar =================== */
function onSubmitAttempt(m) {
  S.ctx.form = m.form; S.ctx.tipo = m.tipo;
  const tipo = m.tipo;
  const pediu = S.pedirResumo; S.pedirResumo = false;
  if (!tipo) { send({ type: 'confirmSubmit' }); return; }
  const vals = valoresParaChecar(tipo);
  const list = [...E.runChecks(tipo, vals, anexosAtuais(tipo), S.rules, E.today(), { ausentes: camposAusentes(m.form) }), ...avisosExtras(tipo, vals), ...naoAceitosPeloPortal(tipo, m.form)].filter(i => i.nivel === 'erro' || i.nivel === 'atencao');
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
/** Plataforma: o cliente escreveu um valor aqui que o portal não ficou com ele (ex.: opção que não existe na lista). */
function naoAceitosPeloPortal(tipo, form) {
  const W = w(tipo); const f = { ...(form?.extras || {}), ...(form?.campos || {}) };
  const out = Object.entries(W.fonteVerdade || {}).filter(([k, o]) => o === 'plataforma' && f[k]?.existe && !f[k].disabled && W.valores[k]?.valor && E.norm(f[k].valor) !== E.norm(W.valores[k].valor))
    .map(([k]) => ({ nivel: 'atencao', grupo: 'Portal', campo: k, mensagem: `${rotuloDe(tipo, k)}: o portal está com “${f[k].valor || 'vazio'}”, e não com “${W.valores[k].valor}”. Confira esse campo.` }));
  // erros de validação que o próprio portal mostra (só rótulo e mensagem)
  for (const e of form?.erros || []) out.push({ nivel: 'erro', grupo: 'Portal', campo: e.k || null, mensagem: `${e.rotulo}: ${(S.rules.mensagens?.portalAcusa || 'O portal acusa: {mensagem}').replace('{mensagem}', e.mensagem)}` });
  // opção parecida escolhida na lista: o cliente confere
  for (const [k, a] of Object.entries(W.aproximadas || {})) if (f[k]?.valor && E.norm(f[k].valor) === E.norm(a.escolhida)) out.push({ nivel: 'atencao', grupo: 'Portal', campo: k, mensagem: `${rotuloDe(tipo, k)}: ${msgAproximada(a)}` });
  return out;
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
  const valores = Object.fromEntries(Object.entries({ ...v, ...portalValores(tipo) }).filter(([k]) => !k.startsWith('extra:')).filter(([k]) => !PESSOAIS.has(k) && t.campos[k]?.tipo !== 'data' && t.campos[k]?.tipo !== 'competencia' || k === 'observacoes' || k === 'tabelaRubricas'));
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

/* O portal não aceitou o envio: a tela continua no formulário. Sem isso, um CANCELAR
   logo depois virava "enviado" no histórico, com prazos na Agenda e o rascunho apagado. */
function onEnvioNaoConcluido(m = {}) {
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

async function onFormClosed(m = {}) {
  let enviadoTipo = null;
  // saiu do formulário sem enviar: o que ficou guardado não se mistura com o próximo documento ou pedido
  const slugSaiu = String(m.from || '').match(/service-request\/([a-z-]+)/)?.[1];
  const tipoSaiu = slugSaiu && E.tipoBySlug(S.rules, slugSaiu);
  if (tipoSaiu && S.work[tipoSaiu] && S.ultimoEnvio?.tipo !== tipoSaiu) S.work[tipoSaiu].abandonado = true;
  if (S.ultimoEnvio && Date.now() - S.ultimoEnvio.quando < 60000) {
    const tipo = S.ultimoEnvio.tipo; enviadoTipo = tipo;
    await salvarHistorico(tipo, 'enviado');
    await apagarRascunho(tipo);
    S.work[tipo] = null; S.ultimoEnvio = null;
    if (!S.lote) toast('Solicitação enviada. Os próximos prazos estão na Agenda.');
    P?.aoEnviar(tipo);
    if (S.view === 'preencher') render();
  }
  loteAoFecharFormulario(enviadoTipo);
  lastMissingKey = '';
}

/* =================== Facilidades (1.3) =================== */
async function carregarHistorico() { const { historico = [] } = await chrome.storage.local.get('historico'); S.historico = historico; return historico; }
const nomeCurto = (n) => { const p = String(n).trim().split(/\s+/); const t = (x) => x.charAt(0) + x.slice(1).toLowerCase(); return p.length > 1 ? `${t(p[0])} ${t(p[p.length - 1])}` : t(p[0] || ''); };

/** Mesmo pedido já enviado por este computador (mesmo funcionário e mesma data). */
const CHAVE_REPETIDO = { afastamento: 'dataAfastamento', avisoFerias: 'inicioGozo', calculoFerias: 'inicioGozo', avisoRescisao: 'dataAviso', calculoRescisao: 'dataDemissao', rubricas: 'competencia' };
function duplicado(tipo, vals) {
  const k = CHAVE_REPETIDO[tipo]; const quem = vals.empregado || '';
  if (!k || !vals[k] || (tipo !== 'rubricas' && !quem)) return null;
  const h = S.historico.find(x => x.status === 'enviado' && x.empresa === S.ctx.empresa && x.tipo === tipo && (x.valores?.empregado || '') === quem && x.valores?.[k] === vals[k] && Date.now() - x.quando < 180 * 864e5);
  return h ? `Uma solicitação igual já foi enviada em ${new Date(h.quando).toLocaleDateString('pt-BR')} (“${h.resumo}”). Confira se esta não é repetida.` : null;
}

/* ---------- Rascunho: o que foi preenchido fica guardado neste computador por 7 dias ---------- */
const RASCUNHO_DIAS = 7;
const chaveRascunho = (tipo) => `${S.ctx.empresa}|${tipo}`;
/** O que vale guardar de um formulário (sem CID e sem os textos gerados). */
function rascunhoDe(W) {
  const valores = Object.fromEntries(Object.entries(W.valores).filter(([k, v]) => v?.valor && v.fonte !== 'gerado' && k !== 'cid').map(([k, v]) => [k, { valor: v.valor, conf: v.conf, fonte: v.fonte }]));
  if (!Object.keys(valores).length) return null;
  return { quando: Date.now(), valores, editados: [...W.editados], anexos: W.arquivos.filter(a => !a.removido).map(a => a.nome) };
}
/** Grava já (sem esperar o debounce), numa só leitura e escrita — usado ao trocar de empresa. */
async function gravarRascunhos(pares) {
  if (standalone || !pares.length) return;
  const { rascunhos = {} } = await chrome.storage.local.get('rascunhos');
  for (const { tipo, empresa, dados } of pares) {
    if (!tipo || !empresa) continue;
    if (dados) rascunhos[`${empresa}|${tipo}`] = dados; else delete rascunhos[`${empresa}|${tipo}`];
  }
  for (const [k, r] of Object.entries(rascunhos)) if (Date.now() - r.quando > RASCUNHO_DIAS * 864e5) delete rascunhos[k];
  await chrome.storage.local.set({ rascunhos });
}
const salvarRascunho = debounce(async (tipo, empresa) => {
  if (!empresa || !tipo || standalone) return;
  const W = S.work[tipo]; if (!W) return;
  await gravarRascunhos([{ tipo, empresa, dados: rascunhoDe(W) }]);
}, 900);
async function apagarRascunho(tipo, empresa = S.ctx.empresa) {
  const { rascunhos = {} } = await chrome.storage.local.get('rascunhos');
  if (rascunhos[`${empresa}|${tipo}`]) { delete rascunhos[`${empresa}|${tipo}`]; await chrome.storage.local.set({ rascunhos }); }
}
/** Formulário novo com dados de uma tentativa abandonada: se o cliente já começou outra coisa
 *  (arrastou um documento ou escreveu), os dados antigos não se misturam com os novos. */
function comecarDoZeroSeAbandonado(tipo) {
  const W = S.work[tipo];
  if (!W || !((W.entrouComDados && !W.rascunhoVisto) || W.abandonado)) return;
  const empregados = W.empregados, opcoes = W.opcoes;
  S.work[tipo] = null;
  const N = w(tipo); N.rascunhoVisto = true; N.empregados = empregados; N.opcoes = opcoes;
  const el = $('#rascunho'); if (el) el.innerHTML = '';
}
async function ofertaRascunho(tipo) {
  const el = $('#rascunho'); if (!el) return;
  const W = w(tipo);
  if (W.rascunhoVisto || (S.lote && !S.lote.concluido)) { el.innerHTML = ''; return; }
  const temAlgo = Object.values(W.valores).some(v => v?.valor && v.fonte !== 'gerado') || W.arquivos.some(a => !a.removido);
  const portalVazio = !Object.entries(portalValores(tipo)).some(([k, v]) => v && k !== 'conclusao');
  if (temAlgo && W.entrouComDados && portalVazio) {
    // saiu do formulário sem enviar e abriu de novo: os dados continuam aqui, o portal está vazio
    const quem = W.valores.empregado?.valor || W.valores.nome?.valor || '';
    el.innerHTML = `<div class="note">${icon('info')}<div><b>Você já tinha começado esta solicitação${quem ? ` (${esc(nomeCurto(quem))})` : ''}.</b> Quer continuar de onde parou?
      <div class="actions" style="margin-top:6px"><button class="btn btn-primary btn-sm" id="rasc-sim">Continuar</button><button class="btn btn-ghost btn-sm" id="rasc-nao">Começar do zero</button></div></div></div>`;
    $('#rasc-sim').addEventListener('click', () => { W.rascunhoVisto = true; W.entrouComDados = false; W.abandonado = false; W.arquivos.forEach(a => { a.anexado = false; }); el.innerHTML = ''; fillPortal(tipo); });
    $('#rasc-nao').addEventListener('click', () => { S.work[tipo] = null; w(tipo).rascunhoVisto = true; apagarRascunho(tipo); render(); });
    return;
  }
  if (temAlgo) { el.innerHTML = ''; return; }
  const { rascunhos = {} } = await chrome.storage.local.get('rascunhos');
  const r = rascunhos[chaveRascunho(tipo)];
  if (!r || Date.now() - r.quando > RASCUNHO_DIAS * 864e5) { el.innerHTML = ''; return; }
  const quem = r.valores.empregado?.valor || r.valores.nome?.valor || '';
  el.innerHTML = `<div class="note">${icon('info')}<div><b>Você começou esta solicitação ${new Date(r.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${quem ? ` (${esc(nomeCurto(quem))})` : ''}.</b> Quer continuar de onde parou?${r.anexos?.length ? ` <small class="muted">Os anexos (${esc(r.anexos.join(', '))}) precisam ser arrastados de novo.</small>` : ''}
    <div class="actions" style="margin-top:6px"><button class="btn btn-primary btn-sm" id="rasc-sim">Continuar</button><button class="btn btn-ghost btn-sm" id="rasc-nao">Começar do zero</button></div></div></div>`;
  $('#rasc-sim').addEventListener('click', () => {
    W.rascunhoVisto = true;
    for (const [k, v] of Object.entries(r.valores)) W.valores[k] = v;
    (r.editados || []).forEach(k => W.editados.add(k));
    gerarTextos(tipo); render();
    if (S.prefs.preencherAoLer && S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo, { silencioso: true });
  });
  $('#rasc-nao').addEventListener('click', () => { W.rascunhoVisto = true; apagarRascunho(tipo); el.innerHTML = ''; });
}

/* ---------- Avisos do escritório (regras.avisosEscritorio) ---------- */
function renderAvisosInicio() {
  const el = $('#avisos-esc'); if (!el) return;
  const hoje = E.iso(E.today());
  const lidos = new Set(S.prefs.avisosLidos || []);
  const lista = (S.rules.avisosEscritorio || []).filter(a => a?.texto && (!a.ate || a.ate >= hoje) && (!a.desde || a.desde <= hoje) && !lidos.has(a.id || a.texto));
  el.innerHTML = lista.map(a => `<div class="note ${a.nivel === 'importante' ? 'warn' : ''} aviso-esc">${icon(a.nivel === 'importante' ? 'alert' : 'info')}<div>${a.titulo ? `<b>${esc(a.titulo)}</b> ` : ''}${esc(a.texto)}${a.link ? ` <a href="${esc(a.link)}" target="_blank" rel="noopener">Saiba mais</a>` : ''}</div>
    <button class="icon-btn" data-lido="${esc(a.id || a.texto)}" aria-label="Dispensar aviso">${icon('x', 'ic-sm')}</button></div>`).join('');
  el.querySelectorAll('[data-lido]').forEach(b => b.addEventListener('click', () => { S.prefs.avisosLidos = [...(S.prefs.avisosLidos || []), b.dataset.lido].slice(-50); savePrefs(); renderAvisosInicio(); }));
}

/* ---------- Contratos de experiência (data de admissão da lista de empregados do portal) ---------- */
async function guardarEquipe(empresa, detalhes) {
  const recentes = detalhes.filter(d => { const a = E.parseDate(d.admissao); return d.ativo !== false && a && E.diffDays(a, E.today()) <= 120; }).map(d => ({ nome: d.nome, admissao: d.admissao }));
  S.equipe.set(empresa, recentes);
  const { equipe = {} } = await chrome.storage.local.get('equipe');
  equipe[empresa] = { quando: Date.now(), recentes };
  await chrome.storage.local.set({ equipe });
  if (S.view === 'inicio') renderExperiencia();
}
async function renderExperiencia() {
  const el = $('#experiencia'); if (!el || standalone) return;
  const emp = S.ctx.empresa; if (!emp) { el.innerHTML = ''; return; }
  let lista = S.equipe.get(emp);
  if (!lista) {
    const { equipe = {} } = await chrome.storage.local.get('equipe');
    if (equipe[emp] && Date.now() - equipe[emp].quando < 7 * 864e5) { lista = equipe[emp].recentes; S.equipe.set(emp, lista); }
    else { S.equipe.set(emp, []); request({ type: 'employees' }, 8000).then(r => { if (r?.detalhes?.length) guardarEquipe(emp, r.detalhes); }); return; }
  }
  const marcos = (S.rules.config?.experienciaDias || [45, 90]).map(Number).filter(Boolean);
  const hoje = E.today(); const itens = [];
  for (const p of lista || []) {
    const adm = E.parseDate(p.admissao); if (!adm) continue;
    for (const [i, n] of marcos.entries()) {
      const fim = E.addDays(adm, n - 1); const falta = E.diffDays(hoje, fim);
      if (falta >= -2 && falta <= 10) itens.push({ nome: p.nome, fim, falta, n, ultimo: i === marcos.length - 1 });
    }
  }
  if (!itens.length) { el.innerHTML = ''; return; }
  itens.sort((a, b) => a.fim - b.fim);
  el.innerHTML = `<div class="card pad exp">${icon('calc', 'ic-sm')} <b>Contratos de experiência</b>
    <ul>${itens.map(x => `<li><b>${esc(nomeCurto(x.nome))}</b> completa ${x.n} dias em <span class="mono">${E.fmtDate(x.fim)}</span> <span class="chip ${x.falta <= 3 ? 'warn' : 'info'}">${x.falta < 0 ? `há ${-x.falta} dia(s)` : x.falta === 0 ? 'hoje' : `em ${x.falta} dia(s)`}</span></li>`).join('')}</ul>
    <small class="muted">Contado pela data de admissão no portal (${marcos.join(' e ')} dias). Se for contrato de experiência, avise o escritório se vai ${itens.some(x => !x.ultimo) ? 'prorrogar, efetivar ou desligar' : 'efetivar ou desligar'} — antes da data.</small></div>`;
}

/* ---------- Repetir a última solicitação ---------- */
function renderRepetir() {
  const el = $('#repetir'); if (!el || standalone) return;
  const h = S.historico.find(x => x.status === 'enviado' && x.empresa === S.ctx.empresa && S.rules.tipos[x.tipo]);
  if (!h) { el.innerHTML = ''; return; }
  el.innerHTML = `<button class="li repetir" type="button" id="rep-go">${icon('refresh')}<div class="main"><b>Repetir a última solicitação</b><small>${esc(h.resumo)} · ${new Date(h.quando).toLocaleDateString('pt-BR')}</small></div>${icon('arrow', 'ic-sm')}</button>`;
  $('#rep-go').addEventListener('click', async () => {
    const t = tipoDef(h.tipo); const W = w(h.tipo);
    for (const [k, v] of Object.entries(h.valores || {})) {
      if (['assunto', 'descricao', 'cid', 'dias'].includes(k) || ['data', 'competencia'].includes(t.campos[k]?.tipo)) continue;
      W.valores[k] = { valor: v, conf: 1, fonte: 'última solicitação' };
    }
    W.rascunhoVisto = true;
    gerarTextos(h.tipo, true);
    await openTipo(h.tipo, { manter: true });
    if (S.prefs.preencherAoLer) setTimeout(() => fillPortal(h.tipo, { silencioso: true }), 900);
    toast('Repeti os dados da última solicitação, menos as datas. Confira e complete.');
  });
}

/* ---------- Perguntas frequentes (regras.faq) ---------- */
function renderFaq(q) {
  const el = $('#faq'); if (!el) return;
  // casa pelo radical das palavras (o plural acha o singular)
  const achadas = E.buscarFaq(q, S.rules, 4).map(f => ({ f }));
  el.innerHTML = achadas.length ? `<h2 class="sec">Dúvidas frequentes</h2>${achadas.map(({ f }) => `<details class="faq-i card"><summary>${esc(f.pergunta)}</summary><p>${esc(f.resposta)}</p></details>`).join('')}` : '';
}

/* ---------- Colar print/arquivo (Ctrl+V) no painel ---------- */
let printSeq = 0;
function renomearColados(files) {
  const d = new Date(); const p2 = (n) => String(n).padStart(2, '0');
  const hora = `${p2(d.getHours())}h${p2(d.getMinutes())}m${p2(d.getSeconds())}s`;
  return files.map(f => /^image\.(png|jpe?g)$/i.test(f.name) || !f.name ? new File([f], `print-colado-${hora}-${++printSeq}.${/jpe?g/i.test(f.type || '') ? 'jpg' : 'png'}`, { type: f.type || 'image/png' }) : f);
}
document.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (!files.length) return;
  e.preventDefault();
  handleFiles(renomearColados(files), 'colado');
});

/* ---------- Tela do portal diferente do esperado: não preenche sozinho ---------- */
function telaDiferente(tipo) {
  const t = tipoDef(tipo); const f = S.ctx.form?.campos;
  if (!t || !f || S.ctx.tipo !== tipo) return false;
  const obr = Object.entries(t.campos).filter(([, c]) => c.obrigatorio && c.fc && !c.somenteAssistente).map(([k]) => k);
  if (obr.length < 2) return false;
  const carregou = S.ctx.form.temArquivo || Object.values(f).some(v => v.existe);
  return carregou && obr.filter(k => f[k]?.existe).length / obr.length < 0.34;
}
function renderModoSeguro(tipo) {
  const el = $('#modo-seguro'); if (!el) return;
  if (!telaDiferente(tipo) || w(tipo).forcarPreenchimento) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="note warn">${icon('alert')}<div><b>Esta tela do portal está diferente do que eu conheço.</b> Por segurança, não vou preencher sozinho. Você pode preencher assim mesmo ou mandar o diagnóstico para o escritório.
    <div class="actions" style="margin-top:6px"><button class="btn btn-sm" id="ms-forcar">Preencher assim mesmo</button><button class="btn btn-ghost btn-sm" id="ms-diag">Copiar diagnóstico</button></div></div></div>`;
  $('#ms-forcar').addEventListener('click', () => { w(tipo).forcarPreenchimento = true; el.innerHTML = ''; fillPortal(tipo); });
  $('#ms-diag').addEventListener('click', copiarDiagnostico);
}

/* ---------- Diagnóstico (sem dados pessoais): para o escritório entender um problema ---------- */
async function textoDiagnostico() {
  const info = await chrome.runtime.sendMessage({ type: 'getSettings' }).catch(() => null);
  const tipo = S.ctx.tipo; const W = tipo ? w(tipo) : null; const f = S.ctx.form?.campos || {};
  const semValores = (m) => String(m || '').replace(/"[^"]*"|“[^”]*”/g, '"…"');
  return [
    'Diagnóstico do Assistente ControlTax (sem dados pessoais)',
    `Quando: ${new Date().toLocaleString('pt-BR')}`,
    `Extensão: v${info?.versaoExtensao || chrome.runtime.getManifest?.().version || '?'} · ${info?.unpacked ? 'instalada como pasta' : 'pacote'}${info?.simulador ? ' · simulador' : ''}`,
    `Regras: ${S.meta.versao} (${S.meta.origem})${S.rules?.empresaAjustada ? ' · com ajustes da empresa' : ''}${S.meta.erro ? ' · aviso: ' + S.meta.erro : ''}`,
    `Navegador: ${(navigator.userAgent.match(/Chrome\/[\d.]+/) || ['?'])[0]} · tela ${screen.width}x${screen.height} · texto ${S.prefs.tamanhoTexto}`,
    `Página: ${S.ctx.route?.mode || '?'} · ${S.ctx.route?.slug || '-'} · solicitação ${tipo || '-'}`,
    `Leitura de arquivos: ${await libsPresentes() ? 'bibliotecas ok' : 'pasta lib faltando'}`,
    await (async () => { const pi = await request({ type: 'portalInfo' }, 3000); if (!pi) return ''; return `Acesso à API do portal: ${pi.acesso?.visto ? 'visto (' + (pi.acesso.nomes || []).join(',') + ')' : 'não visto'} · respostas: ${Object.entries(pi.status || {}).map(([k, v]) => `${k.replace('/api/br-payroll-sr/', '')}=${v}`).join(' ') || '-'}`; })(),
    `Tela: ${S.modo || '?'}${S.plat?.sol ? ` · solicitações lidas: ${S.plat.sol.itens.length}${S.plat.sol.erros.length ? ` (falharam: ${S.plat.sol.erros.map(t => `${t}=${S.plat.sol.codigos?.[t] ?? '?'}`).join(',')})` : ''} · situações: ${[...new Set(S.plat.sol.itens.map(i => i.estado))].join(',') || '-'} · campos dos itens: ${S.plat.sol.chaves.join(',') || '-'}` : ''}${S.plat?.emp ? ` · funcionários: ${S.plat.emp.lista.length}` : ''}`,
    tipo ? `Campos do portal (S=existe, B=bloqueado, P=preenchido): ${Object.entries(f).map(([k, v]) => `${k}:${v.existe ? 'S' : 'N'}${v.disabled ? 'B' : ''}${v.valor ? 'P' : ''}`).join(' ')}` : '',
    tipo ? `Campos do portal fora das regras: ${Object.values(S.ctx.form?.extras || {}).map(x => `${x.fc} (${x.rotulo})`).join(', ') || 'nenhum'}` : '',
    tipo && S.ctx.form?.erros?.length ? `Recusados pelo portal: ${S.ctx.form.erros.map(e => e.fc || e.k || '?').join(', ')}` : '',
    tipo ? `Listas carregadas: ${Object.entries(W.opcoes).map(([k, o]) => `${k}=${o.length}`).join(' ') || 'nenhuma'} · empregados=${W.empregados.length} · tela diferente: ${telaDiferente(tipo) ? 'sim' : 'não'}` : '',
    tipo && W.resultados?.resultados ? `Último preenchimento: ${W.resultados.resultados.filter(x => x.ok).length} ok; falhas: ${W.resultados.resultados.filter(x => !x.ok).map(x => `${x.campo} (${semValores(x.motivo)})`).join('; ') || 'nenhuma'}` : '',
    tipo ? `Arquivos: ${W.arquivos.map((a, i) => `#${i + 1} ${a.metodo || '?'}${a.confianca != null ? ' conf ' + a.confianca : ''}${a.rotacao ? ' girado ' + a.rotacao + '°' : ''} → ${a.documento || 'não reconhecido'}`).join(' · ') || 'nenhum'}` : '',
    tipo ? `Verificações: ${lastChecks.filter(i => i.nivel === 'erro' || i.nivel === 'atencao').map(i => `${i.nivel}:${i.campo || i.grupo}`).join(' ') || 'nenhuma pendência'}` : ''
  ].filter(Boolean).join('\n');
}
async function copiarDiagnostico() {
  const txt = await textoDiagnostico();
  try { await navigator.clipboard.writeText(txt); toast('Diagnóstico copiado. Cole na conversa com o escritório.'); }
  catch { const m = $('#modal'); m.hidden = false; m.innerHTML = `<div class="sheet"><h3>Diagnóstico</h3><textarea class="input mono" rows="12" id="m-txt">${esc(txt)}</textarea><div class="actions" style="margin-top:10px"><button class="btn btn-primary" id="m-ok">Fechar</button></div></div>`; $('#m-txt').select(); $('#m-ok').addEventListener('click', () => { m.hidden = true; m.innerHTML = ''; }); }
}

/* =================== Histórico =================== */
async function salvarHistorico(tipo, status) {
  const W = w(tipo);
  const valores = { ...valoresAssistente(tipo), ...portalValores(tipo) };
  if (!Object.keys(valores).length) return;
  const { historico = [] } = await chrome.storage.local.get('historico');
  const chave = `${S.ctx.empresa}|${tipo}|${valores.empregado || valores.nome || ''}`;
  const prev = status === 'enviado'
    ? historico.findIndex(h => h.chave === chave && h.status === 'preenchido')
    : historico.findIndex(h => h.chave === chave && h.status === 'preenchido' && Date.now() - h.quando < 6 * 3600e3);
  const item = { chave, quando: Date.now(), empresa: S.ctx.empresa, tipo, status, resumo: valores.assunto || S.rules.tipos[tipo]?.nome, valores, anexos: W.arquivos.filter(a => !a.removido).map(a => a.nome) };
  // a descrição pode trazer o CID; nada disso é usado para reaproveitar o pedido
  delete item.valores.cid; delete item.valores.descricao; delete item.valores.observacoes;
  if (prev >= 0) historico.splice(prev, 1);
  historico.unshift(item);
  S.historico = historico.slice(0, 200);
  await chrome.storage.local.set({ historico: S.historico });
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
      case 'afastamento': { const i = dd(v.dataAfastamento); if (!i || !+v.dias) break; add(E.addDays(i, +v.dias), 'Retorno do afastamento', h, quem); if (+v.dias > 15 && E.vaiAoInss(v.tipoAfastamento, S.rules)) add(E.addDays(i, 15), 'Encaminhamento ao INSS (16º dia)', h, quem); break; }
      case 'avisoRescisao': { const i = dd(v.dataAviso); if (!i || !E.temAviso(v, S.rules)) break;
        const dias = +v.diasAviso || 30;
        add(E.fimDoAviso(i, dias), `Fim do aviso, se trabalhado (${dias} dias)`, h, quem); break; }
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
  const prazos = prazosDoHistorico(historico.filter(h => h.status === 'enviado'));
  const inacabados = historico.filter(h => h.status === 'preenchido' && Date.now() - h.quando < RASCUNHO_DIAS * 864e5);
  const hoje = E.today();
  const quando = (d) => { const n = E.diffDays(hoje, d); return n < 0 ? ['err', `há ${-n} dia(s)`] : n === 0 ? ['warn', 'hoje'] : n <= 7 ? ['warn', `em ${n} dia(s)`] : ['info', `em ${n} dias`]; };
  viewEl.innerHTML = `
    <p class="hello">Agenda</p>
    <p class="lead">Prazos que vêm das solicitações feitas com o Assistente neste computador.</p>
    ${prazos.length ? `<div class="agenda">${prazos.map(p => { const [c, txt] = quando(p.d); return `
      <div class="ag-i"><div class="ag-d"><b>${String(p.d.getDate()).padStart(2, '0')}</b><small>${p.d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></div>
        <div class="main"><b>${esc(p.titulo)}</b><small>${esc(p.detalhe || '')}${p.detalhe ? ' · ' : ''}${esc(S.rules.tipos[p.h.tipo]?.nome || '')}</small></div>
        <span class="chip ${c}">${txt}</span></div>`; }).join('')}</div>` : `<div class="empty" style="padding:16px">${icon('calc', 'ic-lg')}<p>Sem prazos por enquanto. Eles aparecem quando você preenche férias, afastamentos, rescisões ou admissões.</p></div>`}
    ${inacabados.length ? `<h2 class="sec">Começou e não enviou</h2>
    <p class="muted" style="margin:0 0 8px;font-size:12px">Preenchidas no portal, mas o envio não foi confirmado. Clique para continuar.</p>
    <div class="list">${inacabados.map(h => `
      <button class="li" type="button" data-cont="${esc(String(historico.indexOf(h)))}" style="text-align:left;cursor:pointer">
        <div class="main"><b>${esc(h.resumo)}</b><small>${esc(S.rules.tipos[h.tipo]?.nome || h.tipo)} · ${new Date(h.quando).toLocaleDateString('pt-BR')}</small></div>
        <span class="chip warn">continuar</span></button>`).join('')}</div>` : ''}
    <h2 class="sec">Histórico</h2>
    ${historico.length ? `<p class="muted" style="margin:0 0 8px;font-size:12px">Clique para reaproveitar os dados em uma nova solicitação.</p><div class="list">${historico.map((h, i) => `
      <button class="li" type="button" data-i="${i}" style="text-align:left;cursor:pointer">
        <div class="main"><b>${esc(h.resumo)}</b><small>${esc(S.rules.tipos[h.tipo]?.nome || h.tipo)} · ${esc(h.empresa)} · ${new Date(h.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></div>
        <span class="chip ${h.status === 'enviado' ? 'ok' : 'info'}">${h.status}</span>
      </button>`).join('')}</div>
    <div class="actions" style="margin-top:12px"><button class="btn btn-ghost" id="h-clear">${icon('trash', 'ic-sm')} Limpar histórico</button></div>` : '<p class="muted">As solicitações que você preencher com o Assistente aparecem aqui.</p>'}`;
  viewEl.querySelectorAll('[data-cont]').forEach(b => b.addEventListener('click', async () => {
    const h = historico[+b.dataset.cont]; const W = w(h.tipo);
    for (const [k, v] of Object.entries(h.valores)) if (!['assunto', 'descricao'].includes(k)) W.valores[k] = { valor: v, conf: 1, fonte: 'histórico' };
    gerarTextos(h.tipo, true);
    await openTipo(h.tipo, { manter: true });
  }));
  viewEl.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', async () => {
    const h = historico[+b.dataset.i];
    const W = w(h.tipo);
    for (const [k, v] of Object.entries(h.valores)) if (!['assunto', 'descricao'].includes(k)) W.valores[k] = { valor: v, conf: 1, fonte: 'histórico' };
    gerarTextos(h.tipo, true);
    await openTipo(h.tipo, { manter: true });
  }));
  $('#h-clear')?.addEventListener('click', async () => {
    const b = $('#h-clear');
    if (b.dataset.confirm) { await chrome.storage.local.set({ historico: [], rascunhos: {}, equipe: {} }); S.historico = []; S.equipe.clear(); renderHistorico(); }
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
const TOOLS = { simRescisao: 'Simular rescisão', simFerias: 'Simular férias', ferias: 'Prazos das férias', aviso: 'Aviso prévio', rescisao: 'Prazo da rescisão', afast: 'Afastamento', exp: 'Experiência', uteis: 'Dias úteis', admissao: 'Docs. admissão' };
/** Mensagem pronta (WhatsApp/e-mail) com os documentos que o novo funcionário precisa mandar. */
function mensagemAdmissao() {
  const M = S.rules.mensagens || {};
  const docs = tipoDef('cadastroEmpregado')?.anexos || [];
  return [M.admissaoInicio || 'Olá! Para fazermos a sua admissão, envie por favor:', ...docs.map(a => `• ${a.rotulo}${a.obrigatorio ? '' : ' (se tiver)'}`), M.admissaoFim || 'Pode mandar foto bem legível ou PDF. Obrigado!'].join('\n');
}
function renderFerramentas() {
  viewEl.innerHTML = `<div class="tool-tabs" role="group" aria-label="Calculadoras">${Object.entries(TOOLS).map(([k, l]) => `<button type="button" data-t="${k}" aria-pressed="${S.ferramenta === k}">${l}</button>`).join('')}</div>
    <div class="card pad" id="tool"></div>
    <p class="muted" style="font-size:11.5px">Cálculos de apoio com base na CLT e nos feriados nacionais cadastrados nas regras. O cálculo oficial é feito pelo escritório.</p>`;
  viewEl.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { S.ferramenta = b.dataset.t; renderFerramentas(); }));
  const tool = $('#tool');
  // simulações de férias e rescisão (2.3): a função principal do Calcular
  if (S.ferramenta === 'simRescisao' || S.ferramenta === 'simFerias') {
    viewEl.querySelector('.muted:last-child')?.remove();
    renderSimulacao(tool, S.ferramenta === 'simRescisao' ? 'rescisao' : 'ferias', {
      S, esc, icon, toast, maskInput,
      empregados: () => (S.plat?.emp?.lista?.length ? S.plat.emp.lista : (S.equipe.get(S.ctx.empresa) || [])).filter(e => e.ativo !== false),
      pedir: (tipo, o) => P.novoPedido(tipo, o)
    });
    return;
  }
  const cal = E.makeCalendar(S.rules.feriados);
  const F = (id, label, ph = 'DD/MM/AAAA', t = 'data') => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" data-t="${t}" placeholder="${ph}" inputmode="numeric"></div>`;
  const out = '<div class="calc" id="out" style="margin-top:12px"><span class="muted">Preencha os campos acima.</span></div>';
  const forms = {
    ferias: `<div class="row2">${F('a', 'Início do gozo')}${F('b', 'Dias de gozo', '30', 'numero')}</div>${F('c', 'Dias de abono (opcional)', '0', 'numero')}${out}`,
    aviso: `<div class="row2">${F('a', 'Data de admissão')}${F('b', 'Data do aviso')}</div>${out}`,
    rescisao: F('a', 'Último dia de trabalho') + out,
    afast: `<div class="row2">${F('a', 'Início do afastamento')}${F('b', 'Dias de atestado', '15', 'numero')}</div>${out}`,
    exp: `<div class="row2">${F('a', 'Data de admissão')}${F('b', '1º período (dias)', '45', 'numero')}</div>${F('c', 'Prorrogação (dias)', '45', 'numero')}${out}`,
    uteis: `<div class="row2">${F('a', 'De')}${F('b', 'Até')}</div>${out}`,
    admissao: `<p class="muted" style="margin:0 0 8px">Mensagem pronta para mandar ao novo funcionário pelo WhatsApp ou e-mail, com os documentos que o escritório pede.</p>
      <textarea class="input" id="adm-msg" rows="11">${esc(mensagemAdmissao())}</textarea>
      <div class="actions" style="margin-top:8px"><button class="btn btn-primary" id="adm-copy">${icon('copy', 'ic-sm')} Copiar mensagem</button></div>`
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
        show([['Anos completos', String(anos)], ['Dias de aviso prévio', `${dias} dias (Lei 12.506/2011)`], ['Fim do aviso (se trabalhado 30 dias)', E.fmtDate(E.fimDoAviso(b, 30))], ['Projeção total do aviso', E.fmtDate(E.fimDoAviso(b, dias))]], dias > 30 ? ['O aviso trabalhado é de 30 dias; os dias adicionais são indenizados.', 'A contagem exclui o dia do aviso e inclui o último (Súmula 380 do TST).'] : ['A contagem exclui o dia do aviso e inclui o último (Súmula 380 do TST).']);
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
  $('#adm-copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#adm-msg').value); toast('Mensagem copiada.'); } catch { $('#adm-msg').select(); toast('Selecionei o texto: use Ctrl+C.'); } });
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
      <label class="toggle"><input type="checkbox" data-p="incluirCid" ${cidAtivo() ? 'checked' : ''}><span>Incluir CID nas descrições<small>Dado de saúde — mantenha desligado se não for exigido.</small></span></label>
      <label class="toggle"><input type="checkbox" data-p="usarIa" ${S.prefs.usarIa ? 'checked' : ''}><span>Usar a IA do próprio Chrome quando disponível<small>${await aiAvailable() ? 'Disponível neste computador. Roda localmente.' : 'Não disponível neste Chrome — sem efeito.'}</small></span></label>
      <div class="field" style="margin-top:10px"><label>Ao abrir o portal</label>
        <div class="seg" role="group" aria-label="Ao abrir o portal">${[['plataforma', 'Abrir a plataforma (tela cheia)'], ['painel', 'Só o botão Assistente']].map(([v, l]) => `<button type="button" data-abrir="${v}" aria-pressed="${(S.prefs.abrirComo || 'plataforma') === v}">${l}</button>`).join('')}</div>
        <small class="muted">A plataforma cobre o portal e preenche por trás. Você pode ver o portal a qualquer momento.</small></div>
      <div class="field" style="margin-top:10px"><label>Tamanho do texto do painel</label>
        <div class="seg" role="group" aria-label="Tamanho do texto">${[['normal', 'Normal'], ['grande', 'Grande'], ['maior', 'Maior']].map(([v, l]) => `<button type="button" data-tam="${v}" aria-pressed="${S.prefs.tamanhoTexto === v}">${l}</button>`).join('')}</div></div>
    </div>
    <h2 class="sec">Ajuda</h2>
    <div class="card pad">
      <p class="muted" style="margin:0 0 8px">Algo não funcionou? Copie o diagnóstico e cole na conversa com o escritório. Ele não leva nomes, valores nem documentos — só versões e o que o Assistente encontrou na tela.</p>
      <button class="btn" id="diag">${icon('copy', 'ic-sm')} Copiar diagnóstico</button>
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
  viewEl.querySelectorAll('[data-p]').forEach(i => i.addEventListener('change', () => { S.prefs[i.dataset.p] = i.checked; if (i.dataset.p === 'incluirCid') S.prefs.cidEscolhido = true; savePrefs(); }));
  viewEl.querySelectorAll('[data-tam]').forEach(b => b.addEventListener('click', () => { S.prefs.tamanhoTexto = b.dataset.tam; savePrefs(); aplicarTamanhoTexto(); renderConfig(); }));
  viewEl.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => { S.prefs.abrirComo = b.dataset.abrir; savePrefs(); renderConfig(); }));
  $('#diag').addEventListener('click', copiarDiagnostico);
  $('#save-url').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'setSettings', settings: { rulesUrl: $('#rules-url').value.trim() } }); await loadRules(); renderConfig(); });
  $('#refresh-rules').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'refreshRules' }); await loadRules(); renderConfig(); });
  viewEl.querySelectorAll('[data-dev]').forEach(b => b.addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'setSettings', settings: { devMode: b.dataset.dev } }); renderConfig(); }));
  $('#reload-ext')?.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'reloadExtension' }));
  $('#intro-again').addEventListener('click', () => { S.prefs.introVista = false; savePrefs(); setView('inicio'); });
  if (info.simulador) viewEl.querySelectorAll('.dev-only').forEach(e => e.remove());
}

/* =================== Plataforma (2.0) =================== */
const P = montarPlataforma({
  S, $, esc, icon, request, send, toast, viewEl, debounce, ICONS,
  setView, w, tipoDef, openTipo, entenderTexto, handleFiles, bindDrop, gerarTextos, loadEmpregados, fillPortal,
  renderPreencher, renderFerramentas, renderConfig, renderSugestao, renderLote, renderAvisosInicio, renderRepetir, renderModelosInicio, renderFaq,
  prazosDoHistorico, guardarEquipe, mensagemAdmissao, nomeCurto, alternarTema, maskInput, comecarDoZeroSeAbandonado, copiarDiagnostico
});

/* =================== Início =================== */
(async () => {
  syncThemeIcon();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeIcon);
  if (standalone) { $('#btn-close').hidden = true; document.body.style.maxWidth = '520px'; document.body.style.margin = '0 auto'; }
  await Promise.all([loadRules(), loadPrefs(), carregarHistorico()]);
  aplicarTamanhoTexto();
  if (!(await libsPresentes())) {
    const el = document.createElement('div'); el.className = 'note warn'; el.setAttribute('role', 'alert'); el.style.cssText = 'margin:8px 12px 0';
    el.innerHTML = `${icon('alert')}<div><b>Esta cópia da extensão está incompleta</b> (falta a pasta <code>lib</code>). O preenchimento funciona, mas PDFs, fotos e planilhas não serão lidos. Instale pelo .zip completo.</div>`;
    viewEl.parentElement.insertBefore(el, viewEl);
  }
  const hash = location.hash.slice(1);
  if (hash && ['config', 'ferramentas', 'historico'].includes(hash)) setView(hash); else render();
  if (S.modo === 'plataforma') P.entrou();
  if (!standalone) setTimeout(async () => {
    if (S.modo === 'plataforma') return;   /* a plataforma lê as solicitações por conta própria */
    const tipos = Object.entries(S.rules.tipos).filter(([, t]) => t.api).map(([key, t]) => ({ key, api: t.api })); const r = await request({ type: 'pendencias', tipos }, 30000); if (r?.data) { S.pend = r.data; const n = r.data.reduce((a, p) => a + (p.itens || []).filter(i => i.aguardando).length, 0); send({ type: 'setBadge', n }); const d = $('#dot-pend'); d.hidden = !n; d.textContent = n; } }, 2500);
})();
