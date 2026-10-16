/* Assistente do Portal do Cliente — camada que roda dentro do Onvio.
 * Faz só o trabalho de "mãos": lê a tela, preenche campos, anexa arquivos,
 * mostra o painel e o aviso de arrastar. Toda a inteligência fica no painel (iframe da extensão). */
(() => {
  if (window.__ctAssistente) return;
  window.__ctAssistente = true;

  const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  const VERSAO = chrome.runtime.getManifest().version;   // versão desta cópia do script (fica velha se a extensão for atualizada sem recarregar a página)
  // Plataforma: na extensão real não existe (mundo isolado); no simulador, a página fornece rota, navegação e listas.
  const plat = window.__ctPlatform || {};
  const currentPath = () => (plat.path ? plat.path() : location.pathname);
  const BASE = '/clientcenter/pt/actions/service-request/';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  let rules = null;
  let port = null;
  // Modo da tela: 'fechado' (só o botão), 'painel' (encaixado ao lado do portal) ou
  // 'plataforma' (tela cheia por cima do portal, que continua carregado e é preenchido por baixo).
  let modo = 'fechado';
  let modoAberto = 'plataforma';   // o que o botão "Assistente" abre
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
      .frame-wrap.full{top:var(--topo,0px);left:0;right:0;bottom:0;height:auto;width:auto;transform:none;box-shadow:none;transition:opacity .18s ease}
      .frame-wrap.full:not(.open){opacity:0;pointer-events:none;transform:none}
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
      .frame-wrap.full.open ~ .toast{bottom:84px}   /* plataforma: acima da barra de ações (Conferir e enviar) */
      .toast.acao{pointer-events:auto;display:flex;align-items:center;gap:14px;padding:8px 8px 8px 16px}
      .toast .t-btn{border:0;border-radius:4px;background:#E9EEF2;color:#0E151B;font:600 13px 'IBM Plex Sans',system-ui,sans-serif;padding:7px 12px;cursor:pointer;display:flex;align-items:center;gap:6px}
      .toast .t-btn:hover{background:#fff}
      .toast .t-btn:focus-visible{outline:2px solid #6BAAC9;outline-offset:2px}
    </style>
    <button class="launcher" part="launcher" type="button" aria-label="Abrir o Assistente ControlTax">
      <span class="mark"><img alt="" src="${chrome.runtime.getURL('icons/icon-32.png')}"></span>
      <span class="lbl">Assistente</span><span class="badge" hidden></span>
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

  function toast(msg, ms = 2600, acao = null) {
    toastEl.textContent = msg; toastEl.classList.toggle('acao', !!acao);
    if (acao) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 't-btn'; b.textContent = acao.rotulo;
      b.addEventListener('click', () => { toastEl.classList.remove('on', 'acao'); acao.fn(); });
      toastEl.appendChild(b);
    }
    toastEl.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('on', 'acao'), ms);
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
  function setModo(m) {
    if (!['fechado', 'painel', 'plataforma'].includes(m)) return;
    ensureFrame();
    modo = m;
    if (m !== 'fechado') modoAberto = m;
    const open = m !== 'fechado';
    wrap.classList.toggle('open', open);
    wrap.classList.toggle('full', m === 'plataforma');
    wrap.style.setProperty('--topo', `${+(plat.reservaTopo?.() || 0)}px`);
    // telas largas: o painel ocupa uma coluna e a página encolhe (nada fica escondido atrás dele)
    document.documentElement.classList.toggle('ct-docked', m === 'painel' && innerWidth >= 1000);
    // plataforma: a página do portal não rola por trás (ela continua renderizada para o preenchimento)
    document.documentElement.classList.toggle('ct-plataforma', m === 'plataforma');
    wrap.setAttribute('aria-hidden', String(!open));
    launcher.classList.toggle('hidden', open);
    post({ type: 'modo', modo: m });
    if (open) sendContext();
    if (m === 'plataforma') iframe?.focus();
  }
  /** Abrir/fechar sem escolher o modo: abre o último usado (plataforma, se nada foi escolhido). */
  const setPanel = (open) => { if (open) { if (modo === 'fechado') setModo(modoAberto); } else setModo('fechado'); };
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
    html.ct-plataforma, html.ct-plataforma body{overflow:hidden!important}
    @media (prefers-reduced-motion: reduce){html.ct-docked{transition:none}}`;
  document.documentElement.appendChild(pageStyle);

  /* ============ Colar (Ctrl+V) um print ou arquivo na página ============ */
  const editavel = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  document.addEventListener('paste', (e) => {
    if (editavel(e.target) || editavel(document.activeElement)) return;      // colar texto num campo do portal: não mexe
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    const hora = new Date().toTimeString().slice(0, 5).replace(':', 'h');
    const nomeados = files.map((f, i) => /^image\.(png|jpe?g)$/i.test(f.name) || !f.name ? new File([f], `print-colado-${hora}${files.length > 1 ? '-' + (i + 1) : ''}.png`, { type: f.type || 'image/png' }) : f);
    setPanel(true);
    setTimeout(() => sendFiles(nomeados, 'colado'), port ? 0 : 900);
    toast('Arquivo colado: o Assistente vai ler.');
  }, true);

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
        case 'close': setModo('fechado'); break;
        case 'modo': setModo(m.modo); break;
        case 'getContext': sendContext(); break;
        case 'navigate': while (navInterna) await sleep(150); await navigate(m.slug, m.add !== false); post({ type: 'navigated', id: m.id }); sendContext(); break;
        case 'fill': {
          preenchendoAgora = true;
          let r; try { r = await comboLock(() => fillForm(m.tipo, m.values || {}, unpackFiles(m.files), m.opts || {})); } finally { preenchendoAgora = false; }
          if (modo === 'plataforma') iframe?.focus();   // o preenchimento foca campos do portal: devolve o teclado à plataforma
          post({ type: 'fillResult', id: m.id, ...r });
          sendContext(); avisarDesfazer();
          if (m.opts?.avisoDesfazer !== false && r.mudou) toast('Preenchido pelo Assistente. Confira antes de enviar.', 9000, { rotulo: '↶ Desfazer', fn: () => desfazer() });
          break;
        }
        case 'undo': { const r = await desfazer(); post({ type: 'undoResult', id: m.id, ...r }); break; }
        case 'attach': { const n = await attachFiles(unpackFiles(m.files)); post({ type: 'attachResult', id: m.id, n }); sendContext(); break; }
        case 'getOptions': {
          const opts = await comboLock(() => comboOptions(m.locator, m.force));
          if (modo === 'plataforma') iframe?.focus();
          post({ type: 'options', id: m.id, options: opts, virtual: !!opts.virtual });
          break;
        }
        case 'employees': {
          let names = await employeeNames();
          if (!names.length && m.aquecer && await aquecerEmpregados()) names = await employeeNames();
          post({ type: 'employees', id: m.id, names, detalhes: employeesInfo.get(companyName()) || [] });
          break;
        }
        case 'highlight': flash(findField(m.locator)); break;
        case 'markMissing': markMissing(m.campos || []); break;
        // "Conferir e enviar": nunca clica no portal — manda o resumo ao painel, aconteça o que
        // acontecer com as regras. Só o confirmSubmit (clique do cliente) aciona o botão do portal.
        case 'requestSubmit': {
          const b = submitButton();
          if (!b) { toast('Abra o formulário da solicitação para enviar.'); break; }
          const r = routeInfo();
          setPanel(true);
          post({ type: 'submitAttempt', pedido: true, tipo: tipoBySlug(r.slug), form: snapshot(tipoBySlug(r.slug)) });
          break;
        }
        case 'confirmSubmit': {
          bypassGuard = true;
          const btn = submitButton();
          if (btn) btn.click();
          setTimeout(() => { bypassGuard = false; }, 1500);
          vigiarEnvio();
          break;
        }
        case 'pendencias': post({ type: 'pendencias', id: m.id, data: await fetchPendencias(m.tipos) }); break;
        // plataforma: dados do portal lidos com a sessão do próprio cliente (nada sai do computador)
        case 'solicitacoes': post({ type: 'solicitacoes', id: m.id, data: await fetchSolicitacoes(m.tipos || [], m.maxPaginas) }); break;
        case 'tramites': post({ type: 'tramites', id: m.id, ...(await fetchTramites(m.base, m.solicitacao)) }); break;
        case 'datasAviso': post({ type: 'datasAviso', id: m.id, ...(await fetchDatasAviso(m.lista, m.solicitacao)) }); break;
        case 'detalheCompleto': post({ type: 'detalheCompleto', id: m.id, ...(await fetchDetalhe(m.lista, m.solicitacao)) }); break;
        case 'portalInfo': await estadoAcesso(); post({ type: 'portalInfo', id: m.id, empresa: companyName(), route: routeInfo(), temCliente: !!clientId(), documentos: !!plat.documentos, acesso: { visto: apiEstado.visto, nomes: apiEstado.nomes }, status: { ...ultimosStatus } }); break;
        case 'documentos': post({ type: 'documentos', id: m.id, ...(plat.documentos ? { disponivel: true, itens: await plat.documentos() } : { disponivel: false, motivo: 'calibrar' }) }); break;
        case 'baixarDocumento': {
          const f = plat.baixarDocumento ? await plat.baixarDocumento(m.docId) : null;
          const packed = f ? (await packFiles([f]))[0] : null;
          post({ type: 'arquivo', id: m.id, arquivo: packed }, packed ? [packed.buf] : []);
          break;
        }
        case 'abrirNoPortal': await abrirNoPortal(m); post({ type: 'abriuNoPortal', id: m.id }); break;
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
    const empresa = companyName(); notaEmpresa(empresa);
    if (navInterna) return;   // navegação feita pelo Assistente para buscar dados: a tela de quem usa não mudou
    post({ type: 'context', route: r, tipo, empresa, versao: VERSAO, modo, form: r.mode === 'form' ? snapshot(tipo) : null });
  }
  /* Texto do botão conforme a tela: no formulário, convida a preencher */
  function atualizarLauncher() {
    const r = routeInfo();
    const tipo = r.slug ? tipoBySlug(r.slug) : null;
    const lbl = root.querySelector('.launcher .lbl');
    const txt = r.mode === 'form' && tipo ? 'Preencher com o Assistente' : 'Assistente';
    if (lbl && lbl.textContent !== txt) lbl.textContent = txt;
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

  /* Uma operação de combobox por vez (abrir duas listas ao mesmo tempo faz uma fechar a outra) */
  let comboChain = Promise.resolve();
  function comboLock(fn) { const r = comboChain.then(fn, fn); comboChain = r.catch(() => {}); return r; }

  /* Lista completa de empregados pela mesma API que o portal usa (a lista da tela é virtualizada
     e só mostra ~13 nomes por vez). O endereço é o que o próprio portal chamou nesta sessão. */
  const employeesCache = new Map();
  const employeesInfo = new Map();   // empresa → [{ nome, admissao, ativo }] (sem CPF nem outros dados)
  let empresaVista = '', empresaDesde = 0;
  const resumoEmpregado = (e) => ({ nome: String(e?.name || '').trim(), admissao: String(e?.hireDate || e?.admissionDate || '').slice(0, 10), ativo: !/demit|deslig|termin|inativ|dismiss|fired/i.test(String(e?.status ?? '')) });
  /** Trocar de empresa sem recarregar: o que foi lido da empresa anterior não vale mais. */
  function notaEmpresa(e) {
    if (!e || e === empresaVista) return;
    const antes = empresaVista;
    empresaVista = e; empresaDesde = performance.now();
    if (!antes) return;                 // primeira leitura: nada a limpar
    optionsCache.clear();               // listas (empregados, motivos…) são de outra empresa
    desfazerPilha.length = 0;           // o desfazer não pode atravessar empresas
    avisarDesfazer();
  }
  async function employeeNames() {
    const empresa = companyName(); notaEmpresa(empresa);
    if (plat.employees) {   // simulador
      const arr = await plat.employees();
      employeesInfo.set(empresa, arr.map(resumoEmpregado));
      return [...new Set(arr.map(e => String(e?.name || '').trim()).filter(Boolean))];
    }
    // só vale uma chamada feita depois que esta empresa foi selecionada
    let url = performance.getEntriesByType('resource')
      .filter(e => e.startTime >= empresaDesde - 2000 && /\/api\/br-payroll-sr\/v1\/clients\/[^/]+\/employees/.test(e.name)).map(e => e.name).pop();
    // a calibrar: com o id da empresa visto em outra chamada do portal, pede a mesma lista que ele pede
    const cid = !url && clientId();
    if (cid) url = `/api/br-payroll-sr/v1/clients/${encodeURIComponent(cid)}/employees?expand=clientEmployeeRelationshipExpanded`;
    if (!url) return employeesCache.get(empresa) || [];
    const key = url.replace(/[?#].*$/, '');
    if (employeesCache.has(key)) return employeesCache.get(key);
    try {
      const r = await apiGet(url);
      if (!r.ok) return [];
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j.items || j.data || []);
      const names = [...new Set(arr.map(e => String(e?.name || '').trim()).filter(Boolean))];
      if (names.length) { employeesCache.set(key, names); employeesCache.set(empresa, names); employeesInfo.set(empresa, arr.map(resumoEmpregado).filter(e => e.nome)); }
      return names;
    } catch { return []; }
  }

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
    // lista virtualizada (cdk-virtual-scroll): só ~13 itens existem na tela; rola para juntar os outros
    const vp = (document.getElementById(cb.getAttribute('aria-owns')) || document).querySelector('cdk-virtual-scroll-viewport')
      || [...document.querySelectorAll('cdk-virtual-scroll-viewport')].find(v => v.offsetParent);
    let virtual = false;
    if (vp && vp.scrollHeight > vp.clientHeight + 5) {
      virtual = true;
      const t0 = Date.now();
      for (let y = 0; y <= vp.scrollHeight && Date.now() - t0 < 4000; y += Math.max(120, vp.clientHeight - 40)) {
        vp.scrollTop = y; vp.dispatchEvent(new Event('scroll')); await sleep(90);
        for (const o of readOpts(vp)) if (!opts.includes(o.text)) opts.push(o.text);
      }
      vp.scrollTop = 0; vp.dispatchEvent(new Event('scroll'));
    }
    await closeCombo(cb);
    opts = Object.assign([...opts], { virtual });
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
    if (score < 0.99) {
      // não achou exato entre os itens visíveis (listas longas ou virtualizadas): digita para filtrar
      // digita sem tirar o foco (blur fecharia a lista)
      inp.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, value);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
      await sleep(500);
      if (cb.getAttribute('aria-expanded') !== 'true') { inp.click(); await sleep(350); }
      box = document.getElementById(cb.getAttribute('aria-owns'));
      opts = readOpts(box); best = null; score = 0; score1();
      // a lista não filtrou (ou filtrou pouco): procura rolando a lista virtualizada
      if (score < 0.99) {
        const vp = (box || document).querySelector?.('cdk-virtual-scroll-viewport') || [...document.querySelectorAll('cdk-virtual-scroll-viewport')].find(v => v.offsetParent);
        if (vp && vp.scrollHeight > vp.clientHeight + 5) {
          const t0 = Date.now();
          for (let y = 0; y <= vp.scrollHeight && score < 0.99 && Date.now() - t0 < 4000; y += Math.max(120, vp.clientHeight - 40)) {
            vp.scrollTop = y; vp.dispatchEvent(new Event('scroll')); await sleep(90);
            opts = readOpts(vp); score1();
          }
          if (best && !best.el.isConnected) { vp.scrollTop = Math.max(0, vp.scrollTop - vp.clientHeight); vp.dispatchEvent(new Event('scroll')); await sleep(90); opts = readOpts(vp); best = null; score = 0; score1(); }
        }
      }
      if (!(best && score >= 0.6)) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, ''); inp.dispatchEvent(new Event('input', { bubbles: true })); }
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
    // como estava antes: é o que o "Desfazer" devolve
    const antes = {};
    for (const [k] of entries) antes[k] = readField(tipo.campos[k]).valor || '';
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
    let anexados = 0, anexadosNomes = [];
    const nomesAntes = new Set(attachedNames().map(norm));
    if (files?.length) { anexados = await attachFiles(files); anexadosNomes = attachedNames().filter(n => !nomesAntes.has(norm(n))); }
    if (firstStepBtn && opts.voltarInicio !== false) { firstStepBtn.click(); await sleep(200); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const depois = {};
    for (const [k] of entries) depois[k] = readField(tipo.campos[k]).valor || '';
    // guarda só o que de fato mudou
    const mudancas = Object.fromEntries(Object.keys(antes).filter(k => antes[k] !== depois[k]).map(k => [k, antes[k]]));
    const mudou = Object.keys(mudancas).length > 0 || anexadosNomes.length > 0;
    if (mudou && !opts.semDesfazer) { desfazerPilha.push({ path: currentPath(), tipo: tipoKey, antes: mudancas, anexos: anexadosNomes }); if (desfazerPilha.length > 10) desfazerPilha.shift(); }
    return { ok: true, resultados, anexados, depois, mudou };
  }

  /* ============ Desfazer o último preenchimento ============ */
  const desfazerPilha = [];
  const avisarDesfazer = () => { const n = desfazerPilha.filter(d => d.path === currentPath()).length; post({ type: 'undoState', n }); };
  async function limparCombo(cb) {
    const inp = cb.querySelector('input'); if (!inp) return { ok: false, motivo: 'campo sem entrada' };
    inp.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, '');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.blur(); inp.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await sleep(250);
    return { ok: !(inp.value || '').trim() };
  }
  /** Tira um anexo pelo nome (botão de remover da linha do arquivo). Calibrar no Onvio real. */
  async function removerAnexo(nome) {
    const zona = mainEl().querySelector('cc-sr-file-selector, bento-file-selector'); if (!zona) return false;
    const alvo = [...zona.querySelectorAll('*')].filter(e => e.children.length <= 3 && (e.innerText || '').includes(nome)).sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
    let linha = alvo; let btn = null;
    for (let i = 0; i < 5 && linha && !btn; i++, linha = linha.parentElement) {
      const bs = [...linha.querySelectorAll('button, [role=button]')];
      btn = bs.find(b => /remov|exclu|delet|apagar|tirar|×|✕/i.test(`${b.getAttribute('aria-label') || ''} ${b.title || ''} ${b.innerText || ''} ${b.className || ''}`)) || (bs.length === 1 ? bs[0] : null);
    }
    if (!btn) return false;
    btn.click(); await sleep(300);
    return !attachedNames().map(norm).includes(norm(nome));
  }
  async function desfazer() {
    const i = desfazerPilha.map(d => d.path).lastIndexOf(currentPath());
    if (i < 0) { toast('Não há preenchimento para desfazer nesta tela.'); return { ok: false, campos: [], anexos: [] }; }
    const d = desfazerPilha.splice(i, 1)[0];
    post({ type: 'undoStart' });
    const tipo = resolveTipoLocal(d.tipo);
    const campos = [], falhas = [], anexos = [];
    await comboLock(async () => {
      for (const [k, v] of Object.entries(d.antes)) {
        const def = tipo?.campos[k]; if (!def) continue;
        try {
          let r;
          if (def.tipo === 'radio') {
            if (v) r = await setRadio(def, v);
            else { for (const sel of Object.values(def.seletores || {})) { const el = mainEl().querySelector(sel); if (el?.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); } } r = { ok: true }; }
          } else {
            const el = findField(def); if (!el) { falhas.push(k); continue; }
            await reveal(el);
            if (el.tagName === 'BENTO-COMBOBOX') r = v ? await pickCombo(el, v) : await limparCombo(el);
            else { setNative(el, v); r = { ok: true }; }
          }
          (r?.ok ? campos : falhas).push(k);
        } catch { falhas.push(k); }
      }
      for (const n of d.anexos) { if (await removerAnexo(n)) anexos.push(n); else falhas.push('anexo:' + n); }
    });
    sendContext(); avisarDesfazer();
    toast(falhas.length ? `Desfeito em parte: confira ${falhas.length} item(ns) no formulário.` : 'Preenchimento desfeito: o formulário voltou a como estava.', 4000);
    post({ type: 'undone', campos, anexos, falhas });
    return { ok: !falhas.length, campos, anexos, falhas };
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
        const r = plat.fetchList ? await plat.fetchList(t.api) : await apiGet(`/api/br-payroll-sr/v1/${t.api}?pageIndex=0&itemsPerPage=50&assignedtome=false`);
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
  /* ============ Adaptador do portal (plataforma) ============ */
  let navInterna = false;        // navegação feita pelo Assistente (não é o cliente mudando de tela)
  let preenchendoAgora = false;
  /** Id da empresa no portal, tirado de uma chamada que o próprio portal fez depois da troca de empresa (só na memória). */
  function clientId() {
    if (plat.clientId) return plat.clientId();
    if (apiEstado.clienteId) return apiEstado.clienteId;
    const e = performance.getEntriesByType('resource').filter(x => x.startTime >= empresaDesde - 2000).map(x => x.name.match(/\/api\/br-payroll-sr\/v1\/clients\/([^/?#]+)/)).filter(Boolean).pop();
    return e ? decodeURIComponent(e[1]) : '';
  }
  /* ============ Leituras da API com o mesmo acesso que o portal usa (ajudante content/pagina.js) ============ */
  /* O cookie sozinho recebe 401 no Onvio real: o portal manda um cabeçalho de acesso em cada chamada.
     O ajudante (mundo da página) faz a leitura com esse acesso; o valor nunca chega até aqui. */
  let apiSeq = 0, apiEsperou = false;
  const apiEspera = new Map();
  let apiEstado = { visto: false, nomes: [], clienteId: '' };
  const ultimosStatus = {};
  document.addEventListener('ct-api-resposta', (e) => {
    let d; try { d = JSON.parse(e.detail); } catch { return; }
    const f = apiEspera.get(d.id); if (f) { apiEspera.delete(d.id); f(d); }
  });
  function pedirPagina(p, ms = 30000) {
    return new Promise((res) => {
      const id = `ct${++apiSeq}`;
      const t = setTimeout(() => { apiEspera.delete(id); res(null); }, ms);
      apiEspera.set(id, (d) => { clearTimeout(t); res(d); });
      document.dispatchEvent(new CustomEvent('ct-api-pedido', { detail: JSON.stringify({ ...p, id }) }));
    });
  }
  let ajudante = null;   // o ajudante da página respondeu? (no simulador ele não existe: as listas vêm de __ctPlatform)
  async function estadoAcesso() {
    if (ajudante === false) return null;
    const d = await pedirPagina({ tipo: 'estado' }, 800);
    ajudante = !!d;
    if (d) apiEstado = { visto: !!d.visto, nomes: d.nomes || [], clienteId: d.clienteId || '' };
    return d ? apiEstado : null;
  }
  const resposta = (status, texto) => ({ ok: status >= 200 && status < 300, status, text: async () => texto || '', json: async () => JSON.parse(texto || 'null') });
  const chaveStatus = (url) => String(url).replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '').replace(/\/clients\/[^/]+/, '/clients/…');
  async function apiGet(url) {
    let st = await estadoAcesso();
    // o portal ainda não fez nenhuma chamada nesta página: espera um pouco pela primeira (é dela que vem o acesso)
    for (let i = 0; st && !st.visto && !apiEsperou && i < 8; i++) { await sleep(500); st = await estadoAcesso(); }
    if (st && !st.visto) apiEsperou = true;
    let r;
    if (st) { const d = await pedirPagina({ tipo: 'get', url }); if (d?.status) r = resposta(d.status, d.texto); }
    // sem o ajudante: só com o cookie, como antes
    if (!r) r = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } });
    ultimosStatus[chaveStatus(url)] = r.status;
    return r;
  }
  // 401/403 aqui quer dizer "leitura sem acesso", não sessão expirada: quem avisa a sessão é a janela do próprio portal (verAtencao)
  const getJson = (url) => apiGet(url);
  /* Listas como o próprio portal pede (mapa do Onvio real, 15/10/2026): pageIndex começa em 1, até 200 por
     página, mais recentes primeiro e com o funcionário e o responsável junto (expand). */
  const POR_PAGINA = 200;
  const chaveSim = (lista) => String(lista || '').replace(/^.*?\/v\d+\//, '');
  function listaPagina(t, pagina) {
    if (plat.fetchList) return plat.fetchList(chaveSim(t.lista) || t.api, { pageIndex: pagina, itemsPerPage: POR_PAGINA });
    const q = new URLSearchParams({ itemsPerPage: POR_PAGINA, pageIndex: pagina, startIndex: (pagina - 1) * POR_PAGINA, orderBy: 'lastUpdated desc' });
    if (t.expand) q.set('expand', t.expand);
    if (!/payroll-entries/.test(t.lista)) q.set('assignedtome', 'false');   // em Rubricas o portal omite quando é falso
    return getJson(`/api/${t.lista}?${q.toString().replace(/\+/g, '%20')}`);
  }
  /** As solicitações de cada tipo (até maxPaginas páginas), 3 tipos por vez. Itens crus: o painel normaliza. */
  async function fetchSolicitacoes(tipos, maxPaginas = 2) {
    const out = []; const fila = [...tipos];
    const umTipo = async (t) => {
      t = { ...t, lista: t.lista || (t.api ? `br-payroll-sr/v1/${t.api}` : '') };
      if (!t.lista) return { tipo: t.key, calibrar: true, itens: [] };
      const itens = []; let total = 0;
      try {
        for (let p = 1; p <= Math.max(1, maxPaginas); p++) {
          const r = await listaPagina(t, p);
          if (!r.ok) return { tipo: t.key, erro: r.status, itens };
          const j = await r.json();
          const arr = Array.isArray(j) ? j : (j.items || j.data || []);
          total = j.totalItems ?? j.total ?? (itens.length + arr.length);
          itens.push(...arr);
          if (itens.length >= total || arr.length < POR_PAGINA) break;
        }
      } catch (e) { return { tipo: t.key, erro: String(e.message || e), itens }; }
      return { tipo: t.key, total, itens, truncado: itens.length < total, chaves: Object.keys(itens[0] || {}) };
    };
    const trabalhador = async () => { while (fila.length) { const t = fila.shift(); out.push(await umTipo(t)); } };
    await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    return out;
  }
  /** Trâmites (a conversa) de uma solicitação: {base}/{id}/topics, com o id GUID do item (mapa do Onvio real). Só leitura; nada é guardado. */
  async function fetchTramites(base, id) {
    if (!base || !id) return { erro: 'sem-id', itens: [] };
    try {
      if (plat.tramites) return { itens: await plat.tramites(base, id) };
      const r = await getJson(`/api/${base}/${encodeURIComponent(id)}/topics?expand=all&itemsPerPage=1000&orderBy=created%20asc&pageIndex=0`);
      if (!r.ok) return { erro: r.status, itens: [] };
      const j = await r.json();
      return { itens: Array.isArray(j) ? j : (j.items || []) };
    } catch (e) { return { erro: String(e.message || e), itens: [] }; }
  }
  /** Datas de um aviso (detalhe da solicitação: {lista}/{id}?expand=all). Só os campos de data voltam ao painel; nada é guardado. */
  const CAMPOS_AVISO = ['vacationStartDate', 'paymentDate', 'adviceDate', 'noticeDate', 'vacationDays', 'resignationDate', 'priorNoticeAdviceDate', 'admissionDate', 'startDate', 'leaveDate', 'effectiveDate'];
  /** A solicitação completa ({lista}/{id}?expand=all): lida na hora para a aba Dados do detalhe; nada é guardado. */
  async function fetchDetalhe(lista, id) {
    if (!lista || !id) return { erro: 'sem-id' };
    try {
      if (plat.detalheItem) return { dados: await plat.detalheItem(chaveSim(lista), id) };
      const r = await getJson(`/api/${lista}/${encodeURIComponent(id)}?expand=all`);
      if (!r.ok) return { erro: r.status };
      return { dados: await r.json() };
    } catch (e) { return { erro: String(e.message || e) }; }
  }
  async function fetchDatasAviso(lista, id) {
    const r = await fetchDetalhe(lista, id);
    if (!r.dados) return { erro: r.erro || 'vazio' };
    return { datas: Object.fromEntries(CAMPOS_AVISO.filter(k => r.dados[k] != null).map(k => [k, r.dados[k]])) };
  }
  /** Sem a lista de empregados (o portal ainda não abriu nenhuma tela que a carrega): abre por
   *  baixo uma solicitação que tem o campo Empregado, espera o portal pedir a lista e volta.
   *  Nunca com um formulário aberto (perderia o que está nele). */
  async function aquecerEmpregados() {
    if (routeInfo().mode === 'form' || navInterna) return false;
    const volta = currentPath();
    navInterna = true;
    try {
      await navigate(rules?.config?.solicitacaoComEmpregados || 'employee-leave', true);
      for (let i = 0; i < 15; i++) { if (performance.getEntriesByType('resource').some(e => e.startTime >= empresaDesde - 2000 && /\/clients\/[^/]+\/employees/.test(e.name))) break; await sleep(300); }
    } finally {
      if (plat.navigate) plat.navigate(volta); else history.back();
      await sleep(700);
      lastHref = currentPath(); ultimoForm = '';
      navInterna = false;
      sendContext();
    }
    return true;
  }
  /** "Ver no portal": leva o portal à tela certa e mostra o portal com o painel encaixado. */
  async function abrirNoPortal(m) {
    if (m.area === 'documentos') {
      if (plat.navigate && plat.rotaDocumentos) plat.navigate(plat.rotaDocumentos);
      else [...document.querySelectorAll('a, button')].find(e => /^\s*documentos\s*$/i.test(e.innerText || '') && !e.closest('form'))?.click();   // a calibrar
    } else if (m.slug) {
      const detalhe = m.id && (plat.detalhe || rules?.config?.rotaDetalheSolicitacao);
      await navigate(detalhe ? `${m.slug}/${m.id}` : m.slug, false);
    }
    setModo('painel');
  }
  /* O portal abriu uma janela (ou a sessão expirou) enquanto está coberto pela plataforma */
  let atencaoVista = '';
  function verAtencao() {
    if (modo !== 'plataforma' || preenchendoAgora || navInterna) return;
    const d = [...document.querySelectorAll('[role=dialog], [role=alertdialog], .modal.show')].find(e => visible(e) && (e.innerText || '').trim());
    const txt = d ? d.innerText.trim().replace(/\s+/g, ' ').slice(0, 160) : '';
    if (txt === atencaoVista) return;
    atencaoVista = txt;
    post({ type: 'portalAtencao', texto: txt, ativo: !!d });
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
  /** Depois de confirmar: se o portal recusou, a tela continua no mesmo formulário. */
  let envioVigiado = null;
  function vigiarEnvio() {
    const onde = currentPath();
    clearTimeout(envioVigiado);
    envioVigiado = setTimeout(() => {
      if (currentPath() === onde && submitButton()) post({ type: 'envioNaoConcluido' });
    }, 4500);
  }

  // A conferência é a trava principal do projeto: só sai do caminho se a regra disser
  // explicitamente que não quer (sem regra carregada, ela continua valendo).
  document.addEventListener('click', (ev) => {
    if (bypassGuard || rules?.config?.confirmarAntesDeEnviar === false) return;
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
    if (bypassGuard || rules?.config?.confirmarAntesDeEnviar === false || !port) return;
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

  // o cliente mexeu num campo do portal → o painel acompanha (assunto/descrição se atualizam)
  let editTimer = null;
  const aoEditar = (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || el.type === 'file' || !mainEl().contains(el)) return;
    clearTimeout(editTimer); editTimer = setTimeout(sendContext, 450);
  };
  document.addEventListener('change', aoEditar, true);
  document.addEventListener('focusout', aoEditar, true);

  /* ============ Mudanças de rota ============ */
  let routeTimer = null;
  let ultimoForm = '';   // último /add visto (prev se perde quando há rota intermediária)
  const routeChanged = () => {
    const href = currentPath();
    if (href === lastHref) return;
    if (navInterna) { lastHref = href; return; }
    const prev = lastHref; lastHref = href;
    // saiu do formulário: o desfazer daquela tela não vale mais (cancelar, enviar, lote)
    if (prev.includes('/add') && !href.includes('/add')) {
      for (let i = desfazerPilha.length - 1; i >= 0; i--) if (desfazerPilha[i].path === prev) desfazerPilha.splice(i, 1);
    }
    if (prev.includes('/add')) ultimoForm = prev;
    clearTimeout(routeTimer);
    routeTimer = setTimeout(() => {
      const r = routeInfo();
      // formulário fechou e voltou à lista → provável envio concluído
      if (ultimoForm && !href.includes('/add') && r.mode === 'list') { post({ type: 'formClosed', from: ultimoForm, to: href }); ultimoForm = ''; }
      sendContext(); atualizarLauncher(); avisarDesfazer();
    }, 600);
  };
  setInterval(routeChanged, 500);
  let formTimer = null;
  new MutationObserver(() => { clearTimeout(formTimer); formTimer = setTimeout(() => { sendContext(); verAtencao(); }, 700); })
    .observe(document.documentElement, { childList: true, subtree: true });

  /* ============ Regras e mensagens do service worker ============ */
  async function loadRules() {
    try { const r = await chrome.runtime.sendMessage({ type: 'getRules' }); rules = r?.rules || rules; } catch { /* extensão recarregada */ }
  }
  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === 'togglePanel') setPanel(modo === 'fechado');
    if (m.type === 'rulesUpdated') { rules = m.rules; post({ type: 'rulesUpdated' }); sendContext(); }
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dropEl.classList.contains('on')) { dropEl.classList.remove('on'); dragDepth = 0; } });
  window.addEventListener('resize', () => document.documentElement.classList.toggle('ct-docked', modo === 'painel' && innerWidth >= 1000));

  /** Modo ao abrir o portal: plataforma (padrão) ou só o botão, se o cliente preferir o painel encaixado. */
  async function modoInicial() {
    if (plat.modoInicial) return plat.modoInicial();
    try { const { prefs } = await chrome.storage.local.get('prefs'); return prefs?.abrirComo === 'painel' ? 'painel' : 'plataforma'; } catch { return 'plataforma'; }
  }
  estadoAcesso();
  Promise.all([loadRules(), modoInicial()]).then(([, inicial]) => {
    lastHref = currentPath(); ensureFrame(); atualizarLauncher();
    modoAberto = inicial;
    if (inicial === 'plataforma') setModo('plataforma');
    // ganchos para o simulador (soltar exemplos, abrir o painel, trocar o modo)
    plat.expose?.({ openPanel: () => setPanel(true), modo: (m) => setModo(m), sendFiles: async (files) => { setPanel(true); const go = () => sendFiles(files, 'arrastar'); if (port) go(); else setTimeout(go, 800); } });
  });
})();
