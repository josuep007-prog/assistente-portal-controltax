/* Assistente do Portal do Cliente — camada que roda dentro do Onvio.
 * Faz só o trabalho de "mãos": lê a tela, preenche campos, anexa arquivos,
 * mostra o painel e o aviso de arrastar. Toda a inteligência fica no painel (iframe da extensão). */
(() => {
  if (window.__ctAssistente) return;
  window.__ctAssistente = true;

  const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  // Plataforma: na extensão real não existe (mundo isolado); no simulador, a página fornece rota, navegação e listas.
  const plat = window.__ctPlatform || {};
  const currentPath = () => (plat.path ? plat.path() : location.pathname);
  const BASE = '/clientcenter/pt/actions/service-request/';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  let rules = null;
  let port = null;
  let panelOpen = false;
  let lastHref = '';
  let bypassGuard = false;
  const optionsCache = new Map();

  /* ============ Interface na página (Shadow DOM) ============ */
  const host = document.createElement('div');
  host.id = 'ct-assistente-host';
  host.style.cssText = 'all:initial;position:fixed;inset:auto 0 0 auto;z-index:2147483000;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      @font-face{font-family:'Archivo';font-weight:600;src:url('${chrome.runtime.getURL('fonts/archivo-latin-600-normal.woff2')}') format('woff2')}
      @font-face{font-family:'IBM Plex Sans';font-weight:500;src:url('${chrome.runtime.getURL('fonts/ibm-plex-sans-latin-500-normal.woff2')}') format('woff2')}
      :host{all:initial}
      *{box-sizing:border-box}
      .launcher{position:fixed;right:20px;bottom:22px;display:flex;align-items:center;gap:10px;height:46px;padding:0 16px 0 8px;border:0;border-radius:23px;
        background:#0E151B;color:#E9EEF2;font:500 13px 'IBM Plex Sans',system-ui,sans-serif;cursor:pointer;
        box-shadow:0 2px 6px rgba(16,24,32,.18),0 14px 32px rgba(16,24,32,.22);transition:transform .15s ease, box-shadow .15s ease}
      .launcher:hover{transform:translateY(-2px)}
      .launcher:focus-visible{outline:2px solid #6BAAC9;outline-offset:3px}
      .launcher .mark{width:32px;height:32px;border-radius:16px;background:#fff;display:grid;place-items:center}
      .launcher .mark img{width:20px;height:20px}
      .launcher .badge{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#C2000C;color:#fff;font:600 11px 'Archivo',sans-serif;display:grid;place-items:center}
      .launcher .badge[hidden]{display:none}
      .launcher.hidden{display:none}
      .frame-wrap{position:fixed;top:0;right:0;height:100vh;width:min(420px,100vw);transform:translateX(105%);transition:transform .22s cubic-bezier(.2,.7,.2,1);
        box-shadow:-2px 0 6px rgba(16,24,32,.08),-18px 0 40px rgba(16,24,32,.16)}
      .frame-wrap.open{transform:none}
      iframe{border:0;width:100%;height:100%;display:block;background:#EDF0F3;color-scheme:normal}
      .drop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(14,21,27,.55);backdrop-filter:blur(2px)}
      .drop.on{display:flex}
      .drop .box{width:min(560px,90vw);padding:36px 28px;border-radius:8px;border:2px dashed #6BAAC9;background:#0E151B;color:#E9EEF2;text-align:center;
        font:500 15px 'IBM Plex Sans',system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.4)}
      .drop .box b{display:block;font:600 22px 'Archivo',sans-serif;margin-bottom:8px;color:#fff}
      .drop .box small{display:block;margin-top:10px;color:#8FA0AD;font-size:12px}
      .toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);opacity:0;pointer-events:none;
        background:#0E151B;color:#E9EEF2;padding:10px 16px;border-radius:4px;font:500 13px 'IBM Plex Sans',system-ui,sans-serif;transition:all .2s ease;
        box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:80vw}
      .toast.on{opacity:1;transform:translateX(-50%)}
    </style>
    <button class="launcher" part="launcher" type="button" aria-label="Abrir o Assistente ControlTax">
      <span class="mark"><img alt="" src="${chrome.runtime.getURL('icons/icon-32.png')}"></span>
      <span>Assistente</span><span class="badge" hidden></span>
    </button>
    <div class="frame-wrap" aria-hidden="true"></div>
    <div class="drop" role="dialog" aria-label="Solte o arquivo">
      <div class="box"><b>Solte aqui para o Assistente ler</b>Atestados, documentos, pedidos de demissão, planilhas…<small>O arquivo é lido no seu computador e anexado à solicitação.</small></div>
    </div>
    <div class="toast" role="status" aria-live="polite"></div>`;
  const launcher = root.querySelector('.launcher');
  const badge = root.querySelector('.badge');
  const wrap = root.querySelector('.frame-wrap');
  const dropEl = root.querySelector('.drop');
  const toastEl = root.querySelector('.toast');
  let iframe = null;

  function toast(msg, ms = 2600) {
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('on'), ms);
  }

  function ensureFrame() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.title = 'Assistente ControlTax';
    iframe.allow = 'clipboard-write';
    iframe.src = chrome.runtime.getURL('panel/panel.html');
    iframe.addEventListener('load', connectPort);
    wrap.appendChild(iframe);
  }
  function setPanel(open) {
    ensureFrame();
    panelOpen = open;
    wrap.classList.toggle('open', open);
    // telas largas: o painel ocupa uma coluna e a página encolhe (nada fica escondido atrás dele)
    document.documentElement.classList.toggle('ct-docked', open && innerWidth >= 1000);
    wrap.setAttribute('aria-hidden', String(!open));
    launcher.classList.toggle('hidden', open);
    if (open) sendContext();
  }
  launcher.addEventListener('click', () => setPanel(true));

  (document.body || document.documentElement).appendChild(host);
  // estilos de destaque dentro da página (não alteram layout)
  const pageStyle = document.createElement('style');
  pageStyle.textContent = `
    .ct-filled{box-shadow:0 0 0 2px rgba(60,101,155,.55)!important;transition:box-shadow .3s}
    .ct-flash{box-shadow:0 0 0 3px #C2000C!important;transition:box-shadow .3s}
    .ct-missing{box-shadow:0 0 0 2px #E8A317!important;border-radius:4px}
    .ct-miss-tag{display:flex;align-items:center;gap:6px;width:fit-content;max-width:100%;margin:4px 0 2px;padding:3px 8px;border-left:3px solid #E8A317;border-radius:3px;background:#FFF6E0;color:#6B4500;font:500 12px/1.35 system-ui,sans-serif}
    .ct-miss-tag::before{content:"!";display:inline-grid;place-items:center;width:14px;height:14px;border-radius:50%;background:#E8A317;color:#fff;font-weight:700;font-size:10px}
    html.ct-docked{margin-right:420px!important;transition:margin-right .22s ease}
    @media (prefers-reduced-motion: reduce){html.ct-docked{transition:none}}`;
  document.documentElement.appendChild(pageStyle);

  /* ============ Canal privado com o painel ============ */
  function connectPort() {
    const ch = new MessageChannel();
    port = ch.port1;
    port.onmessage = (e) => onPanelMessage(e.data);
    iframe.contentWindow.postMessage({ type: 'ct-hello' }, EXT_ORIGIN, [ch.port2]);
    setTimeout(sendContext, 50);
  }
  const post = (msg, transfer) => port && port.postMessage(msg, transfer || []);
  // Arquivos atravessam o canal como bytes (mais robusto que File entre processos)
  const packFiles = async (files) => Promise.all([...files].map(async f => ({ name: f.name, type: f.type, lastModified: f.lastModified, buf: await f.arrayBuffer() })));
  const unpackFiles = (list) => (list || []).map(p => p instanceof File ? p : new File([p.buf], p.name, { type: p.type || 'application/octet-stream', lastModified: p.lastModified || Date.now() }));
  const sendFiles = async (files, origem) => { const packed = await packFiles(files); post({ type: 'files', files: packed, origem }, packed.map(p => p.buf)); };

  async function onPanelMessage(m) {
    try {
      switch (m.type) {
        case 'close': setPanel(false); break;
        case 'getContext': sendContext(); break;
        case 'navigate': await navigate(m.slug, m.add !== false); post({ type: 'navigated', id: m.id }); sendContext(); break;
        case 'fill': {
          const r = await fillForm(m.tipo, m.values || {}, unpackFiles(m.files), m.opts || {});
          post({ type: 'fillResult', id: m.id, ...r });
          sendContext();
          break;
        }
        case 'attach': { const n = await attachFiles(unpackFiles(m.files)); post({ type: 'attachResult', id: m.id, n }); sendContext(); break; }
        case 'getOptions': {
          const opts = await comboOptions(m.locator, m.force);
          post({ type: 'options', id: m.id, options: opts });
          break;
        }
        case 'highlight': flash(findField(m.locator)); break;
        case 'markMissing': markMissing(m.campos || []); break;
        case 'requestSubmit': { const b = submitButton(); if (b) b.click(); else toast('Abra o formulário da solicitação para enviar.'); break; }
        case 'confirmSubmit': {
          bypassGuard = true;
          const btn = submitButton();
          if (btn) btn.click();
          setTimeout(() => { bypassGuard = false; }, 1500);
          break;
        }
        case 'pendencias': post({ type: 'pendencias', id: m.id, data: await fetchPendencias(m.tipos) }); break;
        case 'setBadge': setBadge(m.n); break;
        case 'toast': toast(m.text); break;
        default: break;
      }
    } catch (err) {
      post({ type: 'error', id: m.id, message: String(err?.message || err) });
    }
  }

  /* ============ Leitura da tela ============ */
  function routeInfo() {
    const p = currentPath();
    const m = p.match(/\/actions\/service-request\/([a-z-]+)(?:\/(add|edit|\d+|[0-9a-f-]{8,}))?/i);
    const slug = m ? m[1] : null;
    const sub = m ? m[2] : null;
    const mode = slug ? (sub === 'add' || sub === 'edit' || (sub && hasForm()) ? 'form' : 'list') : (/\/actions\/?$/.test(p) ? 'menu' : 'other');
    return { href: p, path: p, slug, mode };
  }
  const mainEl = () => document.querySelector('main') || document.body;
  const hasForm = () => !!mainEl().querySelector('form [formcontrolname], form input[type=file]');

  function companyName() {
    const h = mainEl().querySelector('h1,h2,h3,.title');
    const t = [...mainEl().querySelectorAll('h1,h2,h3,.title,[class*=title]')].map(e => e.innerText).find(s => /para:\s*/i.test(s || ''));
    if (t) return t.split(/para:\s*/i)[1].trim();
    const txt = (document.body.innerText || '').match(/EMPRESA\s*\n\s*([^\n]{3,80})/);
    return txt ? txt[1].trim() : (h?.innerText || '').trim();
  }

  function labelFor(el) {
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && !l.classList.contains('d-none') && l.innerText.trim()) return l.innerText.trim(); }
    let p = el;
    for (let i = 0; i < 6 && p; i++) {
      p = p.parentElement; if (!p) break;
      const l = [...p.querySelectorAll('label,legend')].find(x => !x.classList.contains('d-none') && x.innerText.trim());
      if (l) return l.innerText.trim();
    }
    return '';
  }

  /** Localiza um campo: { fc } | { sel } | { rotuloCampo } | { seletores } (rádio) */
  function findField(loc) {
    if (!loc) return null;
    const m = mainEl();
    if (loc.fc) return m.querySelector(`bento-combobox[formcontrolname="${loc.fc}"], [formcontrolname="${loc.fc}"]:not(bento-combobox *)`) || m.querySelector(`[formcontrolname="${loc.fc}"]`);
    if (loc.sel) return m.querySelector(loc.sel);
    if (loc.seletores) { const first = Object.values(loc.seletores)[0]; return first ? m.querySelector(first) : null; }
    if (loc.rotuloCampo) {
      const want = norm(loc.rotuloCampo);
      const els = [...m.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=radio]):not([type=checkbox]), textarea')].filter(e => !e.closest('app-help-menu') && !e.closest('bento-combobox'));
      return els.find(e => norm(labelFor(e)).replace(/ OPCIONAL$/, '') === want) || els.find(e => norm(labelFor(e)).startsWith(want)) || null;
    }
    return null;
  }

  function readField(def) {
    const el = findField(def);
    if (!el) return { existe: false };
    const disabled = !!(el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled') || el.querySelector?.('input:disabled'));
    if (def.tipo === 'radio' && def.seletores) {
      for (const [val, sel] of Object.entries(def.seletores)) { const r = mainEl().querySelector(sel); if (r?.checked) return { existe: true, valor: val, disabled: r.disabled }; }
      const any = mainEl().querySelector(Object.values(def.seletores)[0]);
      return { existe: true, valor: '', disabled: !!any?.disabled };
    }
    if (el.tagName === 'BENTO-COMBOBOX') return { existe: true, valor: el.querySelector('input')?.value?.trim() || '', disabled };
    return { existe: true, valor: (el.value || '').trim(), disabled };
  }

  function attachedNames() {
    const zone = mainEl().querySelector('bento-file-selector, cc-sr-file-selector');
    if (!zone) return [];
    const scope = zone.closest('cc-sr-file-selector') || zone;
    const txt = scope.innerText || '';
    return [...txt.matchAll(/([^\n]+?\.[a-z0-9]{2,5})\s*\(\s*[\d.,]+\s*[KMG]?B\)/gi)].map(m => m[1].trim());
  }

  function snapshot(tipoKey) {
    const tipo = tipoKey && rules ? resolveTipoLocal(tipoKey) : null;
    const campos = {};
    if (tipo) for (const [k, def] of Object.entries(tipo.campos)) if (!def.somenteAssistente) campos[k] = readField(def);
    return { campos, anexos: attachedNames(), temArquivo: !!mainEl().querySelector('input[type=file]') };
  }
  function resolveTipoLocal(key) {
    const t = rules?.tipos?.[key]; if (!t) return null;
    if (!t.herdaCamposDe) return t;
    return { ...t, campos: { ...(rules.tipos[t.herdaCamposDe]?.campos || {}), ...t.campos } };
  }
  const tipoBySlug = (slug) => Object.entries(rules?.tipos || {}).find(([, t]) => t.slug === slug)?.[0] || null;

  function sendContext() {
    if (!port) return;
    const r = routeInfo();
    const tipo = r.slug ? tipoBySlug(r.slug) : null;
    post({ type: 'context', route: r, tipo, empresa: companyName(), form: r.mode === 'form' ? snapshot(tipo) : null });
  }

  /* ============ Revelar campos em etapas/abas ============ */
  async function reveal(el) {
    if (!el || visible(el)) return;
    const step = el.closest('bento-wizard-step');
    if (step) {
      const steps = [...document.querySelectorAll('bento-wizard-step')];
      const idx = steps.indexOf(step);
      const btns = [...document.querySelectorAll('button.bento-wizard-step')];
      if (btns[idx] && !btns[idx].classList.contains('disabled')) { btns[idx].click(); await sleep(350); }
    }
    const pane = el.closest('[role=tabpanel]');
    if (pane && pane.id) {
      const tab = document.querySelector(`[role=tab][aria-controls="${CSS.escape(pane.id)}"]`);
      if (tab) { tab.click(); await sleep(300); }
    }
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
  }

  /* ============ Preenchimento ============ */
  function setNative(el, v) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  }
  function mark(el) { const t = el?.tagName === 'BENTO-COMBOBOX' ? el.querySelector('input') : el; if (!t) return; t.classList.add('ct-filled'); setTimeout(() => t.classList.remove('ct-filled'), 2500); }
  function flash(el) { if (!el) return; reveal(el).then(() => { const t = el.tagName === 'BENTO-COMBOBOX' ? el.querySelector('input') : el; t.classList.add('ct-flash'); t.focus?.(); setTimeout(() => t.classList.remove('ct-flash'), 1800); }); }

  /* ============ Aviso visual de campo não encontrado ============ */
  let missingKey = '';
  function missingTarget(loc) {
    if (loc.seletores) { const r = mainEl().querySelector(Object.values(loc.seletores)[0]); return r?.closest('fieldset, [role=radiogroup], .form-group') || r?.parentElement?.parentElement || null; }
    return findField(loc);
  }
  function clearMissing() {
    document.querySelectorAll('.ct-miss-tag').forEach(t => t.remove());
    document.querySelectorAll('.ct-missing').forEach(e => e.classList.remove('ct-missing'));
  }
  function markMissing(campos) {
    const key = JSON.stringify(campos.map(c => [c.k, c.texto]));
    if (key === missingKey && (!campos.length || document.querySelector('.ct-miss-tag'))) return;
    missingKey = key;
    clearMissing();
    for (const c of campos) {
      const el = missingTarget(c.locator); if (!el) continue;
      const box = el.tagName === 'BENTO-COMBOBOX' ? (el.querySelector('.bento-combobox-container, input')?.closest('div') || el) : el;
      box.classList.add('ct-missing');
      const tag = document.createElement('div');
      tag.className = 'ct-miss-tag'; tag.setAttribute('role', 'note'); tag.textContent = c.texto;
      const anchor = el.tagName === 'BENTO-COMBOBOX' ? el : (el.closest('bento-datepicker, .input-group, .bento-input-group') || el);
      anchor.insertAdjacentElement('afterend', tag);
      const done = () => { box.classList.remove('ct-missing'); tag.remove(); };
      (el.tagName === 'BENTO-COMBOBOX' ? el.querySelector('input') : el)?.addEventListener('change', done, { once: true });
      if (el.matches?.('input, textarea')) el.addEventListener('input', () => { if (el.value.trim()) done(); });
      el.addEventListener?.('click', (e) => { if (e.target.matches?.('input[type=radio], label')) setTimeout(done, 50); });
    }
  }

  async function openCombo(cb) {
    const inp = cb.querySelector('input');
    if (cb.getAttribute('aria-expanded') !== 'true') { inp.focus(); inp.click(); await sleep(350); }
    const box = document.getElementById(cb.getAttribute('aria-owns'));
    return { inp, box };
  }
  async function closeCombo(cb) {
    const inp = cb.querySelector('input');
    if (cb.getAttribute('aria-expanded') === 'true') { inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true })); await sleep(80); }
    if (cb.getAttribute('aria-expanded') === 'true') { inp.click(); await sleep(80); }
    inp.blur();
  }
  const readOpts = (box) => [...(box || document).querySelectorAll('[role=option]')].map(o => ({ el: o, text: o.innerText.trim() })).filter(o => o.text);

  async function comboOptions(loc, force) {
    const key = currentPath() + '|' + (loc.fc || loc.sel);
    if (!force && optionsCache.has(key)) return optionsCache.get(key);
    const cb = findField(loc);
    if (!cb || cb.tagName !== 'BENTO-COMBOBOX') return [];
    await reveal(cb);
    if (!visible(cb)) return [];
    const { box } = await openCombo(cb);
    let opts = readOpts(box).map(o => o.text);
    for (let i = 0; i < 6 && !opts.length; i++) { await sleep(300); opts = readOpts(document.getElementById(cb.getAttribute('aria-owns'))).map(o => o.text); }
    await closeCombo(cb);
    if (opts.length) optionsCache.set(key, opts);
    return opts;
  }

  function similarity(a, b) {
    const A = norm(a), B = norm(b);
    if (!A || !B) return 0; if (A === B) return 1;
    const curto = Math.min(A.length, B.length);
    if (curto >= 4 && (A.includes(B) || B.includes(A))) return 0.9;
    const ta = A.split(' '), tb = B.split(' ');
    return ta.filter(t => tb.includes(t)).length / Math.max(ta.length, tb.length);
  }

  async function pickCombo(cb, value) {
    await reveal(cb);
    if (!visible(cb)) return { ok: false, motivo: 'campo não visível' };
    if (cb.classList.contains('disabled') || cb.querySelector('input:disabled')) return { ok: false, motivo: 'campo bloqueado' };
    let { inp, box } = await openCombo(cb);
    let opts = readOpts(box);
    for (let i = 0; i < 5 && !opts.length; i++) { await sleep(300); box = document.getElementById(cb.getAttribute('aria-owns')); opts = readOpts(box); }
    let best = null, score = 0;
    const alias = rules?.aliasesOpcoes ? Object.entries(rules.aliasesOpcoes).find(([k]) => !k.startsWith('_') && norm(k) === norm(value))?.[1] : null;
    if (alias && !opts.some(o => norm(o.text) === norm(value))) value = alias;
    const score1 = () => { for (const o of opts) { const s = similarity(value, o.text); if (s > score) { score = s; best = o; } } };
    score1();
    if (score < 0.99 && (opts.length >= 50 || !opts.length)) {
      // listas longas (cargos, municípios): digita para filtrar
      setNative(inp, value); inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
      await sleep(600);
      box = document.getElementById(cb.getAttribute('aria-owns'));
      opts = readOpts(box); best = null; score = 0; score1();
    }
    if (best && score >= 0.6) {
      best.el.scrollIntoView({ block: 'nearest' });
      best.el.click(); await sleep(200);
      if (cb.getAttribute('aria-expanded') === 'true') await closeCombo(cb);
      mark(cb);
      return { ok: true, valor: best.text, score };
    }
    await closeCombo(cb);
    return { ok: false, motivo: `opção "${value}" não encontrada` };
  }

  async function setRadio(def, value) {
    const entry = Object.entries(def.seletores || {}).find(([k]) => norm(k) === norm(value)) || Object.entries(def.seletores || {}).find(([k]) => norm(k).startsWith(norm(value)) || norm(value).startsWith(norm(k)));
    if (!entry) return { ok: false, motivo: `opção "${value}" não existe` };
    const r = mainEl().querySelector(entry[1]);
    if (!r) return { ok: false, motivo: 'campo não encontrado' };
    await reveal(r);
    if (r.disabled) return { ok: false, motivo: 'campo bloqueado' };
    if (!r.checked) { (document.querySelector(`label[for="${CSS.escape(r.id)}"]`) || r).click(); await sleep(120); if (!r.checked) { r.click(); await sleep(80); } }
    mark(r.closest('label') || r);
    return { ok: r.checked, valor: entry[0] };
  }

  const ORDER = { combo: 0, radio: 1, data: 2, competencia: 2, texto: 3, numero: 3, cpf: 3, pis: 3, cep: 3, email: 3, telefone: 3, moeda: 3, textarea: 4 };

  async function fillForm(tipoKey, values, files, opts) {
    const tipo = resolveTipoLocal(tipoKey);
    if (!tipo) return { ok: false, resultados: [], erro: 'Tipo de solicitação desconhecido nas regras.' };
    const r = routeInfo();
    if (r.mode !== 'form' || tipoBySlug(r.slug) !== tipoKey) {
      await navigate(tipo.slug, true);
      await waitForForm(8000);
    }
    const entries = Object.entries(values)
      .filter(([k, v]) => tipo.campos[k] && !tipo.campos[k].somenteAssistente && v != null && String(v).trim() !== '')
      .sort(([a], [b]) => (ORDER[tipo.campos[a].tipo] ?? 3) - (ORDER[tipo.campos[b].tipo] ?? 3));
    const resultados = [];
    const firstStepBtn = document.querySelector('button.bento-wizard-step');
    for (const [k, v] of entries) {
      const def = tipo.campos[k];
      try {
        if (def.tipo === 'radio') { resultados.push({ campo: k, ...(await setRadio(def, v)) }); continue; }
        const el = findField(def);
        if (!el) { resultados.push({ campo: k, ok: false, motivo: 'campo não está nesta tela' }); continue; }
        if (el.tagName === 'BENTO-COMBOBOX') { resultados.push({ campo: k, ...(await pickCombo(el, String(v))) }); continue; }
        await reveal(el);
        if (el.disabled) { resultados.push({ campo: k, ok: false, motivo: 'campo bloqueado' }); continue; }
        const cur = (el.value || '').trim();
        if (cur && opts.naoSobrescrever && cur !== String(v)) { resultados.push({ campo: k, ok: false, motivo: 'já preenchido (mantido)' }); continue; }
        let val = String(v);
        if (def.tipo === 'moeda') val = val.replace(/[^\d,.]/g, '');
        setNative(el, val); mark(el);
        await sleep(40);
        resultados.push({ campo: k, ok: true, valor: el.value });
      } catch (e) {
        resultados.push({ campo: k, ok: false, motivo: String(e.message || e) });
      }
    }
    let anexados = 0;
    if (files?.length) anexados = await attachFiles(files);
    if (firstStepBtn && opts.voltarInicio !== false) { firstStepBtn.click(); await sleep(200); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return { ok: true, resultados, anexados };
  }

  async function attachFiles(files) {
    const inp = mainEl().querySelector('input[type=file]');
    if (!inp) return 0;
    await reveal(inp);
    const already = new Set(attachedNames().map(norm));
    const dt = new DataTransfer();
    for (const f of files) if (!already.has(norm(f.name))) dt.items.add(f);
    if (!dt.files.length) return 0;
    inp.__ctOwn = true;
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => { inp.__ctOwn = false; }, 0);
    await sleep(500);
    return dt.files.length;
  }

  async function waitForForm(ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (hasForm()) { await sleep(400); return true; } await sleep(200); }
    return false;
  }

  async function navigate(slug, add) {
    const path = BASE + slug + (add ? '/add' : '');
    if (currentPath() === path) return;
    if (plat.navigate) plat.navigate(path);
    else {
      history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    }
    if (add) await waitForForm(8000); else await sleep(800);
  }

  /* ============ Pendências (lê as listas com a sessão do próprio usuário) ============ */
  async function fetchPendencias(tipos) {
    const out = [];
    for (const t of tipos) {
      try {
        const r = plat.fetchList ? await plat.fetchList(t.api) : await fetch(`/api/br-payroll-sr/v1/${t.api}?pageIndex=0&itemsPerPage=50&assignedtome=false`, { credentials: 'include', headers: { accept: 'application/json' } });
        if (!r.ok) { out.push({ tipo: t.key, erro: r.status }); continue; }
        const j = await r.json();
        const itens = (j.items || []).map(it => {
          const s = JSON.stringify(it);
          const status = it.status?.description || it.status?.name || it.situation?.description || it.statusDescription || it.status || '';
          return {
            id: it.id || it.requestNumber || it.number || '',
            status: typeof status === 'string' ? status : JSON.stringify(status),
            aguardando: /aguardando[^"]{0,20}cliente|waiting[_ ]?(for[_ ]?)?(client|customer)|awaiting/i.test(s),
            pendente: !/conclu|finaliz|complet|cancel/i.test(typeof status === 'string' ? status : s),
            empregado: it.employee?.name || it.employeeName || it.selectedEmployee?.name || '',
            assunto: it.subject || '',
            atualizado: it.lastUpdate || it.updatedAt || it.lastProceedingDate || it.createdAt || ''
          };
        });
        out.push({ tipo: t.key, total: j.totalItems ?? itens.length, itens });
      } catch (e) { out.push({ tipo: t.key, erro: String(e.message || e) }); }
    }
    return out;
  }
  function setBadge(n) {
    badge.hidden = !n; badge.textContent = n > 99 ? '99+' : String(n || '');
    chrome.runtime.sendMessage({ type: 'badge', n }).catch(() => {});
  }

  /* ============ Conferência antes de enviar ============ */
  function submitButton() {
    const r = routeInfo(); if (r.mode !== 'form') return null;
    // as telas usam classes diferentes (form__buttons--add, btn-primary…): o texto é o que é estável
    return [...mainEl().querySelectorAll('button')].find(b => /^(ADICIONAR|SALVAR E ENVIAR(\s+PARA\s+(O\s+)?ESCRIT[ÓO]RIO)?)$/i.test(b.innerText.trim()) && !b.closest('bento-toolbar'));
  }
  document.addEventListener('click', (ev) => {
    if (bypassGuard || !rules?.config?.confirmarAntesDeEnviar) return;
    const btn = ev.target.closest?.('button');
    if (!btn || btn !== submitButton()) return;
    if (!port) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    setPanel(true);
    const r = routeInfo();
    post({ type: 'submitAttempt', tipo: tipoBySlug(r.slug), form: snapshot(tipoBySlug(r.slug)) });
  }, true);

  // Enter dentro do formulário também envia: passa pela mesma conferência
  document.addEventListener('submit', (ev) => {
    if (bypassGuard || !rules?.config?.confirmarAntesDeEnviar || !port) return;
    const form = ev.target; const btn = submitButton();
    if (!btn || !mainEl().contains(form) || !form.contains(btn)) return;
    if (ev.submitter && ev.submitter !== btn) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    setPanel(true);
    const r = routeInfo();
    post({ type: 'submitAttempt', tipo: tipoBySlug(r.slug), form: snapshot(tipoBySlug(r.slug)) });
  }, true);

  /* ============ Arrastar e soltar em qualquer lugar ============ */
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const overNativeZone = (e) => !!e.target?.closest?.('bento-file-selector, cc-sr-file-selector');
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; dragDepth++; if (!overNativeZone(e)) dropEl.classList.add('on'); }, true);
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropEl.classList.remove('on'); }, true);
  dropEl.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  dropEl.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; dropEl.classList.remove('on');
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    setPanel(true);
    const send = () => sendFiles(files, 'arrastar');
    if (port) send(); else setTimeout(send, 700);
  });
  window.addEventListener('drop', () => { dragDepth = 0; dropEl.classList.remove('on'); }, true);

  // arquivos anexados direto no portal → o assistente também lê (para checar e sugerir)
  document.addEventListener('change', (e) => {
    const inp = e.target;
    if (!(inp instanceof HTMLInputElement) || inp.type !== 'file' || inp.__ctOwn || !inp.files?.length) return;
    if (!mainEl().contains(inp)) return;
    sendFiles([...inp.files], 'portal');
  }, true);

  /* ============ Mudanças de rota ============ */
  let routeTimer = null;
  const routeChanged = () => {
    const href = currentPath();
    if (href === lastHref) return;
    const prev = lastHref; lastHref = href;
    clearTimeout(routeTimer);
    routeTimer = setTimeout(() => {
      const r = routeInfo();
      // formulário fechou e voltou à lista → provável envio concluído
      if (prev.includes('/add') && r.mode === 'list') post({ type: 'formClosed', from: prev, to: href });
      sendContext();
    }, 600);
  };
  setInterval(routeChanged, 500);
  let formTimer = null;
  new MutationObserver(() => { clearTimeout(formTimer); formTimer = setTimeout(sendContext, 700); })
    .observe(document.documentElement, { childList: true, subtree: true });

  /* ============ Regras e mensagens do service worker ============ */
  async function loadRules() {
    try { const r = await chrome.runtime.sendMessage({ type: 'getRules' }); rules = r?.rules || rules; } catch { /* extensão recarregada */ }
  }
  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === 'togglePanel') setPanel(!panelOpen);
    if (m.type === 'rulesUpdated') { rules = m.rules; post({ type: 'rulesUpdated' }); sendContext(); }
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dropEl.classList.contains('on')) { dropEl.classList.remove('on'); dragDepth = 0; } });
  window.addEventListener('resize', () => document.documentElement.classList.toggle('ct-docked', panelOpen && innerWidth >= 1000));

  loadRules().then(() => {
    lastHref = currentPath(); ensureFrame();
    // ganchos para o simulador (soltar exemplos, abrir o painel)
    plat.expose?.({ openPanel: () => setPanel(true), sendFiles: async (files) => { setPanel(true); const go = () => sendFiles(files, 'arrastar'); if (port) go(); else setTimeout(go, 800); } });
  });
})();
