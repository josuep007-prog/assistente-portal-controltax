/* Painel — Estado, utilidades de interface e ícones. (parte de panel/panel.js, dividido na 2.16.4; mapa em docs/arquitetura.md). */

export let plataformaMontada = null;

/** A plataforma só é montada no fim de panel.js; as telas usam P como atalho para ela. */
export const P = new Proxy({}, { get: (_, k) => plataformaMontada?.[k] });

export const definirPlat = (p) => { plataformaMontada = p; };

export const params = new URLSearchParams(location.search);

export const standalone = params.has('standalone');

export const S = {
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
  pv: { reqId: 0, lastKey: '', pedindoAdmissoes: '', lastFieldsKey: '', lastChecks: [], lastMissingKey: '', printSeq: 0 },  // estado solto que antes eram variáveis do módulo
  equipe: new Map()      // empresa → [{ nome, admissao, ativo }] (datas de admissão para os alertas de experiência)
};

export const DEFAULT_PREFS = { preencherAoLer: true, incluirCid: false, ocrAutomatico: true, usarIa: true, introVista: false, tamanhoTexto: 'normal', avisosLidos: [] };

/** O CID entra na descrição se o cliente ligar o interruptor ou se o escritório pedir pelas
 *  regras. O interruptor precisa mostrar esse valor efetivo: antes dizia "desligado" enquanto
 *  o dado de saúde ia para o portal. A escolha explícita do cliente vence sempre. */
export const cidPeloEscritorio = () => !!S.rules?.config?.incluirCidNaDescricao;

export const cidAtivo = () => (S.prefs.cidEscolhido ? S.prefs.incluirCid : (S.prefs.incluirCid || cidPeloEscritorio()));

export const waiters = new Map();

export const $ = (s, r = document) => r.querySelector(s);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icon = (id, cls = '') => `<svg class="ic ${cls}"><use href="#i-${id}"/></svg>`;

export const viewEl = $('#view');

export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function request(msg, timeout = 15000, transfer = []) {
  if (!S.port) return Promise.resolve(null);
  if (AGIR_NO_PORTAL.has(msg?.type)) S.antesDeAgir?.(msg);
  const id = ++S.pv.reqId;
  return new Promise((res) => {
    const t = setTimeout(() => { waiters.delete(id); res(null); }, timeout);
    waiters.set(id, (d) => { clearTimeout(t); res(d); });
    S.port.postMessage({ ...msg, id }, transfer);
  });
}

/** Preenchimento: o tempo limite conta do último avanço ("n de m" que o conteúdo manda), não do começo —
 *  um cadastro longo não vira "não terminou" enquanto ainda está andando. */
export const progresso = new Map();

export function requestFill(msg, transfer = [], aoAvancar = null, inatividade = 25000) {
  if (!S.port) return Promise.resolve(null);
  S.antesDeAgir?.(msg);
  const id = ++S.pv.reqId;
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
export const AGIR_NO_PORTAL = new Set(['navigate', 'fill', 'requestSubmit', 'preencherGrade', 'prepararResposta', 'respostaAbrir', 'respostaTexto', 'respostaArquivos', 'respostaEnviar']);

export const send = (msg, transfer) => { if (AGIR_NO_PORTAL.has(msg?.type)) S.antesDeAgir?.(msg); S.port?.postMessage(msg, transfer || []); };

export const packFiles = async (files) => Promise.all(files.map(async f => ({ name: f.name, type: f.type, lastModified: f.lastModified, buf: await f.arrayBuffer() })));

export const toast = (text) => send({ type: 'toast', text });
