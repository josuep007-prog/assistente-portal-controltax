/* Camada de compatibilidade do simulador.
 * Na extensão real (chrome.runtime.id existe) este arquivo não faz nada.
 * No simulador (artefato), imita as APIs do Chrome que o Assistente usa,
 * para que content.js, panel.js e extract.js rodem sem nenhuma alteração. */
(function () {
  if (window.chrome && window.chrome.runtime && window.chrome.runtime.id) return; // extensão de verdade

  var script = document.currentScript;
  var ROOT = new URL('../', script ? script.src : location.href).href; // pasta raiz (platform/..)
  var mem = {};
  var KEY = 'ct-sim-storage';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return mem; } }
  function save(o) { mem = o; try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* armazenamento indisponível */ } }

  var rulesPromise = null;
  function getRules(force) {
    if (!rulesPromise || force) {
      rulesPromise = fetch(ROOT + 'rules/regras.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (rules) {
        return { rules: rules, origem: 'simulador', versao: rules.versao || '?', atualizadoEm: new Date().toISOString(), erro: null };
      });
    }
    return rulesPromise;
  }
  var listeners = [];

  function handle(msg) {
    switch (msg && msg.type) {
      case 'getRules': return getRules(false);
      case 'refreshRules': return getRules(true);
      case 'getSettings': {
        var st = load();
        return Promise.resolve({ settings: Object.assign({ rulesUrl: '', tema: 'auto', devMode: 'off' }, st.settings || {}), unpacked: false, dev: false, devConectado: false, simulador: true, versaoExtensao: (window.__ctVersao || 'simulador') });
      }
      case 'setSettings': { var s2 = load(); s2.settings = Object.assign({}, s2.settings || {}, msg.settings || {}); save(s2); return Promise.resolve({ ok: true }); }
      case 'reloadExtension': try { window.top.location.reload(); } catch (e) { location.reload(); } return Promise.resolve({ ok: true });
      case 'badge': try { window.top.dispatchEvent(new CustomEvent('ct-badge', { detail: msg.n })); } catch (e) { /* ignore */ } return Promise.resolve({ ok: true });
      default: return Promise.resolve(null);
    }
  }

  var chromeSim = window.chrome || {};
  chromeSim.runtime = {
    __simulador: true,
    getURL: function (p) {
      p = String(p || '').replace(/^\//, '');
      if (p === 'lib/tesseract/worker.min.js') p = 'platform/tesseract-worker-sim.js'; // ver arquivo
      // a planilha (SheetJS) vem da CDN permitida nos artefatos, mesma versão 0.18.5 empacotada na extensão
      if (p === 'lib/xlsx/xlsx.full.min.js') return 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      return new URL(p, ROOT).href;
    },
    getManifest: function () { return { version: window.__ctVersao || 'simulador' }; },
    sendMessage: function (msg) { return handle(msg); },
    onMessage: { addListener: function (fn) { listeners.push(fn); }, removeListener: function () {} }
  };
  chromeSim.storage = {
    local: {
      get: function (keys) {
        var st = load(); var out = {};
        var list = keys == null ? Object.keys(st) : (typeof keys === 'string' ? [keys] : (Array.isArray(keys) ? keys : Object.keys(keys)));
        list.forEach(function (k) { if (k in st) out[k] = st[k]; else if (keys && typeof keys === 'object' && !Array.isArray(keys)) out[k] = keys[k]; });
        return Promise.resolve(out);
      },
      set: function (obj) { var st = load(); Object.keys(obj).forEach(function (k) { st[k] = obj[k]; }); save(st); return Promise.resolve(); },
      remove: function (k) { var st = load(); [].concat(k).forEach(function (x) { delete st[x]; }); save(st); return Promise.resolve(); }
    }
  };
  try { window.chrome = chromeSim; } catch (e) { /* ignore */ }
  if (window.chrome !== chromeSim) { try { Object.defineProperty(window, 'chrome', { value: chromeSim, configurable: true }); } catch (e) { /* ignore */ } }
  // Avisos para as telas abertas (ex.: regras recarregadas)
  window.__ctSimBroadcast = function (m) { listeners.forEach(function (fn) { try { fn(m); } catch (e) { /* ignore */ } }); };
})();
