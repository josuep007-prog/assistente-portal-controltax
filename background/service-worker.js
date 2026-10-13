// Service worker: regras (remotas/cache/embutidas), modo dev com recarga automática, atalhos e selo.
const DEV_PORT = 35729;
const DEV_HTTP = `http://localhost:${DEV_PORT}`;
const DEV_WS = `ws://localhost:${DEV_PORT}/ws`;
const ONVIO = 'https://onvio.com.br/clientcenter/*';

const DEFAULT_SETTINGS = {
  rulesUrl: 'https://raw.githubusercontent.com/josuep007-prog/assistente-portal-regras/main/regras.json', // repositório público das regras
  tema: 'auto',            // auto | claro | escuro
  devMode: 'auto'          // auto (ativo quando instalado como pasta) | on | off
};

const isUnpacked = () => !('update_url' in chrome.runtime.getManifest());

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}
async function devEnabled() {
  const s = await getSettings();
  return s.devMode === 'on' || (s.devMode === 'auto' && isUnpacked());
}

function validRules(r) { return r && typeof r === 'object' && r.tipos && r.documentos && r.intencoes; }

async function bundledRules() {
  const r = await fetch(chrome.runtime.getURL('rules/regras.json'), { cache: 'no-store' });
  return r.json();
}

async function fetchJson(url, ms = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const sep = url.includes('?') ? '&' : '?';
    const r = await fetch(`${url}${sep}t=${Date.now()}`, { cache: 'no-store', signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Ordem: servidor dev (se ativo) → URL remota → cache → embutidas. */
async function refreshRules(reason = 'manual') {
  const s = await getSettings();
  let rules = null, origem = null, erro = null;
  if (await devEnabled()) {
    try { const r = await fetchJson(`${DEV_HTTP}/regras.json`, 1500); if (validRules(r)) { rules = r; origem = 'dev'; } } catch { /* servidor dev desligado */ }
  }
  if (!rules && s.rulesUrl) {
    try { const r = await fetchJson(s.rulesUrl); if (validRules(r)) { rules = r; origem = 'remota'; } else erro = 'Arquivo remoto sem a estrutura esperada.'; }
    catch (e) { erro = `Não foi possível baixar as regras (${e.message}).`; }
  }
  if (!rules) {
    const cache = await readCache();
    if (cache?.rules && validRules(cache.rules) && cache.origem !== 'embutida' && s.rulesUrl) { rules = cache.rules; origem = 'cache'; }
  }
  // regras embutidas mais novas que as remotas/cache (extensão atualizada antes da publicação) prevalecem
  const embutidas = await bundledRules();
  if (!rules || (origem !== 'dev' && String(embutidas.versao || '') > String(rules.versao || ''))) { rules = embutidas; origem = 'embutida'; }
  const pack = { rules, origem, versao: rules.versao || '?', atualizadoEm: new Date().toISOString(), erro, reason };
  // guardado como texto: o chrome.storage reordena as chaves de objetos, e a ordem dos campos importa
  await chrome.storage.local.set({ rulesCache: { ...pack, rules: undefined, rulesJson: JSON.stringify(rules) } });
  await broadcast({ type: 'rulesUpdated', rules, meta: { origem, versao: pack.versao, atualizadoEm: pack.atualizadoEm, erro } });
  const min = Math.max(5, rules.config?.intervaloAtualizacaoRegrasMin || 30);
  chrome.alarms.create('rules', { periodInMinutes: min });
  return pack;
}

async function readCache() {
  const { rulesCache } = await chrome.storage.local.get('rulesCache');
  if (!rulesCache?.rulesJson) return null;
  try { return { ...rulesCache, rules: JSON.parse(rulesCache.rulesJson), rulesJson: undefined }; } catch { return null; }
}
async function getRules() {
  const cache = await readCache();
  if (cache?.rules) return cache;
  return refreshRules('primeira carga');
}

async function broadcast(msg) {
  const tabs = await chrome.tabs.query({ url: ONVIO });
  await Promise.all(tabs.map(t => chrome.tabs.sendMessage(t.id, msg).catch(() => {})));
  chrome.runtime.sendMessage(msg).catch(() => {});
}

/* ---------- Modo dev: recarrega sozinho quando você salva um arquivo ---------- */
let ws = null;
async function devServerOnline() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 1000);
  try { await fetch(`${DEV_HTTP}/regras.json?ping=${Date.now()}`, { cache: 'no-store', signal: ctl.signal }); return true; }
  catch { return false; }
  finally { clearTimeout(t); }
}
async function connectDev() {
  if (!(await devEnabled())) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  // Só abre o WebSocket se o servidor dev responder: uma tentativa recusada de WebSocket
  // aparece como erro em chrome://extensions, já um fetch recusado fica silencioso.
  if (!(await devServerOnline())) return;
  try {
    ws = new WebSocket(DEV_WS);
    ws.onopen = () => { chrome.action.setBadgeText({ text: 'DEV' }); chrome.action.setBadgeBackgroundColor({ color: '#3C659B' }); };
    ws.onmessage = async (e) => {
      const msg = String(e.data || '');
      if (msg === 'rules') await refreshRules('dev: regras alteradas');
      else if (msg === 'reload') {
        await chrome.storage.local.set({ reloadTabsAfterRestart: true });
        chrome.runtime.reload();
      }
    };
    ws.onclose = () => { ws = null; chrome.action.setBadgeText({ text: '' }); };
    ws.onerror = () => { /* servidor dev não está rodando — tudo bem */ };
  } catch { ws = null; }
}

async function reloadOnvioTabsIfNeeded() {
  const { reloadTabsAfterRestart } = await chrome.storage.local.get('reloadTabsAfterRestart');
  if (!reloadTabsAfterRestart) return;
  await chrome.storage.local.remove('reloadTabsAfterRestart');
  const tabs = await chrome.tabs.query({ url: ONVIO });
  for (const t of tabs) chrome.tabs.reload(t.id);
}

/* ---------- Eventos ---------- */
chrome.runtime.onInstalled.addListener(async (details) => {
  await refreshRules('instalação/atualização');
  await reloadOnvioTabsIfNeeded();
  // extensão atualizada: abas do portal fora de formulário recarregam para pegar a versão nova
  // (as que estão num formulário mostram um aviso no painel, para não perder o que foi digitado)
  if (details?.reason === 'update') {
    const tabs = await chrome.tabs.query({ url: ONVIO }).catch(() => []);
    for (const t of tabs) if (!/\/add(\b|$|\?)/.test(t.url || '')) chrome.tabs.reload(t.id).catch(() => {});
  }
  connectDev();
  chrome.alarms.create('dev', { periodInMinutes: 0.5 });
});
chrome.runtime.onStartup.addListener(async () => { await refreshRules('inicialização'); connectDev(); chrome.alarms.create('dev', { periodInMinutes: 0.5 }); });

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === 'rules') await refreshRules('agendada');
  if (a.name === 'dev') connectDev();
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url && tab.url.startsWith('https://onvio.com.br/clientcenter')) {
    chrome.tabs.sendMessage(tab.id, { type: 'togglePanel' }).catch(() => {});
  } else {
    chrome.tabs.create({ url: 'https://onvio.com.br/clientcenter/pt/actions' });
  }
});

chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (cmd === 'toggle-panel' && tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'togglePanel' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
  (async () => {
    switch (m.type) {
      case 'getRules': sendResponse(await getRules()); break;
      case 'refreshRules': sendResponse(await refreshRules('manual')); break;
      case 'getSettings': sendResponse({ settings: await getSettings(), unpacked: isUnpacked(), dev: await devEnabled(), devConectado: ws?.readyState === WebSocket.OPEN, versaoExtensao: chrome.runtime.getManifest().version }); break;
      case 'setSettings': {
        const cur = await getSettings();
        await chrome.storage.local.set({ settings: { ...cur, ...m.settings } });
        if ('rulesUrl' in m.settings || 'devMode' in m.settings) await refreshRules('configuração');
        connectDev();
        sendResponse({ ok: true });
        break;
      }
      case 'reloadExtension': await chrome.storage.local.set({ reloadTabsAfterRestart: true }); sendResponse({ ok: true }); chrome.runtime.reload(); break;
      case 'badge': {
        if (ws?.readyState === WebSocket.OPEN) { sendResponse(null); break; }
        const tabId = sender.tab?.id;
        await chrome.action.setBadgeBackgroundColor({ color: '#C2000C' });
        await chrome.action.setBadgeText({ text: m.n ? String(m.n) : '', tabId });
        sendResponse({ ok: true });
        break;
      }
      default: sendResponse(null);
    }
  })();
  return true;
});

connectDev();
