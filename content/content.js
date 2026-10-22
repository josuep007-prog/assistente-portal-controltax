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
  // nome de print colado: hora com segundos e um contador (dois prints no mesmo minuto não ficam com o mesmo nome)
  let printSeq = 0;
  const nomeDoPrint = (f) => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `print-colado-${p(d.getHours())}h${p(d.getMinutes())}m${p(d.getSeconds())}s-${++printSeq}.${/jpe?g/i.test(f.type || '') ? 'jpg' : 'png'}`; };
  document.addEventListener('paste', (e) => {
    if (editavel(e.target) || editavel(document.activeElement)) return;      // colar texto num campo do portal: não mexe
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    const nomeados = files.map(f => /^image\.(png|jpe?g)$/i.test(f.name) || !f.name ? new File([f], nomeDoPrint(f), { type: f.type || 'image/png' }) : f);
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
        case 'trocarEmpresa': { const r = await trocarEmpresa(m.nome); post({ type: 'empresaTrocada', id: m.id, ...r }); sendContext(); break; }
        case 'fill': {
          preenchendoAgora = true;
          let r; try { r = await comboLock(() => fillForm(m.tipo, m.values || {}, unpackFiles(m.files), { ...(m.opts || {}), reqId: m.id })); } finally { preenchendoAgora = false; }
          if (modo === 'plataforma') iframe?.focus();   // o preenchimento foca campos do portal: devolve o teclado à plataforma
          post({ type: 'fillResult', id: m.id, ...r });
          sendContext(); avisarDesfazer();
          if (m.opts?.avisoDesfazer !== false && !m.opts?.semDesfazer && r.mudou) toast('Preenchido pelo Assistente. Confira antes de enviar.', 9000, { rotulo: '↶ Desfazer', fn: () => desfazer() });
          break;
        }
        case 'undo': { const r = await desfazer(); post({ type: 'undoResult', id: m.id, ...r }); break; }
        // grade do Lançamento de Rubricas (lote 6; a grade real não foi mapeada — a calibrar). Nunca envia.
        case 'lerGrade': post({ type: 'grade', id: m.id, ...(await comboLock(() => lerGrade(!!m.adicionar))) }); break;
        case 'preencherGrade': {
          preenchendoAgora = true;
          let r; try { r = await comboLock(() => preencherGrade(m.celulas || [])); } finally { preenchendoAgora = false; }
          if (modo === 'plataforma') iframe?.focus();
          post({ type: 'gradePreenchida', id: m.id, ...r });
          sendContext(); avisarDesfazer();
          if (r.mudou) toast('Grade preenchida pelo Assistente. Confira antes de enviar.', 9000, { rotulo: '↶ Desfazer', fn: () => desfazer() });
          break;
        }
        case 'attach': { const a = await attachFiles(unpackFiles(m.files)); post({ type: 'attachResult', id: m.id, n: a.n, anexos: a }); sendContext(); break; }
        case 'getOptions': {
          const opts = await comboLock(() => comboOptions(m.locator, m.force));
          if (modo === 'plataforma') iframe?.focus();
          post({ type: 'options', id: m.id, options: opts, virtual: !!opts.virtual });
          break;
        }
        case 'empregadoDetalhe': {   // ficha do funcionário: o registro que o portal já leu (nada é gravado)
          if (!employeesRaw.has(companyName())) { employeesCache.clear(); await employeeNames(); }
          const alvo = norm(m.nome);
          post({ type: 'empregadoDetalhe', id: m.id, dados: (employeesRaw.get(companyName()) || []).find(e => norm(e?.name) === alvo) || null });
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
        case 'abrirNoPortal': { const ok = await abrirNoPortal(m); post({ type: 'abriuNoPortal', id: m.id, ok }); break; }
        case 'prepararResposta': post({ type: 'respostaPreparada', id: m.id, ...(await prepararResposta(m)) }); break;
        case 'setBadge': setBadge(m.n); break;
        // "Ver no portal" no aviso: o portal fica coberto pela plataforma, o botão mostra a página com o painel ao lado
        case 'toast': toast(m.text, m.ms || 2600, m.acao === 'verPortal' ? { rotulo: 'Ver no portal', fn: () => setModo('painel') } : null); break;
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
    return { campos, extras: tipo ? camposForaDasRegras(tipo) : {}, erros: tipo ? errosDoPortal(tipoKey) : [], anexos: attachedNames(), temArquivo: !!mainEl().querySelector('input[type=file]') };
  }
  const limparRotulo = (s) => String(s || '').replace(/\s*-\s*opcional\s*$/i, '').replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim();
  const tipoDoElemento = (el) => el.tagName === 'BENTO-COMBOBOX' ? 'combo' : el.tagName === 'TEXTAREA' ? 'textarea' : /DD\/MM/i.test(el.getAttribute('placeholder') || '') ? 'data' : 'texto';
  /** Campos do portal que as regras não conhecem (um Onvio novo, ou um campo que o escritório ainda não pôs nas regras).
   *  Chave "extra:<formcontrolname>": a plataforma mostra e preenche; o diagnóstico leva só os nomes. */
  function camposForaDasRegras(tipo) {
    const conhecidos = new Set(Object.values(tipo?.campos || {}).map(d => d.fc).filter(Boolean));
    const out = {};
    for (const el of mainEl().querySelectorAll('[formcontrolname]')) {
      if (/^(radio|checkbox|file|hidden)$/i.test(el.type || '') || el.closest('app-help-menu')) continue;
      if (el.tagName !== 'BENTO-COMBOBOX' && el.closest('bento-combobox')) continue;
      const fc = el.getAttribute('formcontrolname');
      if (!fc || conhecidos.has(fc) || out['extra:' + fc]) continue;
      const alvo = el.tagName === 'BENTO-COMBOBOX' ? el.querySelector('input') : el;
      if (!alvo || !/^(INPUT|TEXTAREA)$/.test(alvo.tagName)) continue;
      const r = readField({ fc });
      out['extra:' + fc] = { fc, rotulo: limparRotulo(labelFor(alvo)) || fc, tipo: tipoDoElemento(el), valor: r.valor || '', disabled: !!r.disabled, existe: true };
    }
    return out;
  }
  /* Erros de validação do próprio portal (Angular/Bento): só o rótulo e a mensagem curta, nunca o valor.
     Classes e textos a calibrar no Onvio real; o simulador imita ng-invalid/aria-invalid e .invalid-feedback. */
  const SEL_INVALIDO = '[formcontrolname].ng-invalid.ng-touched, [formcontrolname].ng-invalid.ng-dirty, [aria-invalid="true"], .is-invalid';
  const SEL_MSG_ERRO = '.invalid-feedback, .bento-form-error, .form-error, .error-message, .field-error, mat-error, [class*="error-message"], [class*="validation-message"]';
  const textoCurto = (t) => { const s = String(t || '').replace(/\s+/g, ' ').trim().replace(/\d{3,}/g, '…'); return s.length > 70 ? s.slice(0, 67) + '…' : s; };
  function errosDoPortal(tipoKey) {
    const tipo = tipoKey ? resolveTipoLocal(tipoKey) : null;
    const defs = Object.entries(tipo?.campos || {});
    const campos = [];
    for (const el of mainEl().querySelectorAll(SEL_INVALIDO)) {
      let c = el.closest('bento-combobox[formcontrolname]') || el;
      if (c.type === 'radio') c = c.closest('fieldset, [role=radiogroup]') || c;
      if (/^(FORM|BUTTON)$/.test(c.tagName) || c.hasAttribute('formgroupname') || c.hasAttribute('formarrayname') || c.closest('#ct-assistente-host') || campos.includes(c)) continue;
      campos.push(c);
    }
    const msgs = new Map();
    for (const m of mainEl().querySelectorAll(SEL_MSG_ERRO)) {
      if (!(m.innerText || '').trim()) continue;
      // a mensagem é do campo que está no mesmo bloco (o primeiro ancestral que contém um campo inválido)
      for (let p = m.parentElement, i = 0; p && i < 4; p = p.parentElement, i++) { const dono = campos.find(c => p.contains(c)); if (dono) { if (!msgs.has(dono)) msgs.set(dono, m.innerText); break; } }
    }
    return campos.slice(0, 20).map(c => {
      const fc = c.getAttribute('formcontrolname') || '';
      const rotulo = limparRotulo(c.matches('fieldset') ? (c.querySelector('legend')?.innerText || '') : labelFor(c.tagName === 'BENTO-COMBOBOX' ? (c.querySelector('input') || c) : c));
      let k = fc ? (defs.find(([, d]) => d.fc === fc)?.[0] || 'extra:' + fc) : '';
      if (!k) k = defs.find(([, d]) => d.seletores && c.querySelector?.(Object.values(d.seletores)[0]))?.[0] || defs.find(([, d]) => d.rotuloCampo && norm(d.rotuloCampo) === norm(rotulo))?.[0] || '';
      return { k, fc, rotulo: rotulo || fc || 'Campo', mensagem: textoCurto(msgs.get(c)) || 'não aceito pelo portal' };
    });
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
  const employeesRaw = new Map();    // empresa → registros completos do portal, só na memória desta aba (para a ficha do funcionário)
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
      employeesInfo.set(empresa, arr.map(resumoEmpregado)); employeesRaw.set(empresa, arr);
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
      if (names.length) { employeesCache.set(key, names); employeesCache.set(empresa, names); employeesInfo.set(empresa, arr.map(resumoEmpregado).filter(e => e.nome)); employeesRaw.set(empresa, arr); }
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

  const bloqueado = (el) => !!(el?.disabled || el?.classList?.contains('disabled') || el?.getAttribute?.('aria-disabled') === 'true' || el?.querySelector?.('input:disabled'));
  const aliasDe = (v) => (rules?.aliasesOpcoes ? Object.entries(rules.aliasesOpcoes).find(([k]) => !k.startsWith('_') && norm(k) === norm(v))?.[1] : null) || null;
  const setValor = (inp, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); };
  const caixaDe = (cb) => document.getElementById(cb.getAttribute('aria-owns'));
  /** Digita na lista para filtrar (sem tirar o foco: o blur fecharia a lista) e devolve as linhas à vista. */
  async function filtrar(cb, inp, texto) {
    inp.focus(); setValor(inp, texto);
    inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    await sleep(texto ? 500 : 300);
    if (cb.getAttribute('aria-expanded') !== 'true') { inp.click(); await sleep(350); }
    return readOpts(caixaDe(cb));
  }
  /** Lista virtualizada (cdk-virtual-scroll, ~13 linhas no DOM): rola e entrega as linhas a fn até ela devolver algo. */
  async function rolarLista(cb, fn) {
    const vp = (caixaDe(cb) || document).querySelector?.('cdk-virtual-scroll-viewport') || [...document.querySelectorAll('cdk-virtual-scroll-viewport')].find(v => v.offsetParent);
    if (!vp || vp.scrollHeight <= vp.clientHeight + 5) return null;
    const t0 = Date.now();
    for (let y = 0; y <= vp.scrollHeight && Date.now() - t0 < 4000; y += Math.max(120, vp.clientHeight - 40)) {
      vp.scrollTop = y; vp.dispatchEvent(new Event('scroll')); await sleep(90);
      const achou = fn(readOpts(vp)); if (achou) return achou;
    }
    vp.scrollTop = 0; vp.dispatchEvent(new Event('scroll')); await sleep(60);
    return null;
  }

  /** Escolhe na lista do portal. Igual (ou pelo apelido das regras) primeiro; senão a mais parecida, com a
   *  mesma comparação do motor (CtOpcoes, content/opcoes.js), e avisa que foi aproximada. Funcionário
   *  (pessoa): nunca por pedaço de palavra e só com 0,9 ou mais; abaixo disso devolve sugestões. */
  async function pickCombo(cb, value, o = {}) {
    await reveal(cb);
    if (!visible(cb)) return { ok: false, motivo: 'campo não visível' };
    if (bloqueado(cb)) return { ok: false, motivo: 'campo bloqueado' };
    const pedido = String(value);
    const { inp, box } = await openCombo(cb);
    let opts = readOpts(box);
    for (const t0 = Date.now(); !opts.length && Date.now() - t0 < (o.esperaLista || 1500);) {
      await sleep(300);
      if (cb.getAttribute('aria-expanded') !== 'true') { inp.click(); await sleep(250); }   // a lista fechou sozinha (foco que saiu de outro campo)
      opts = readOpts(caixaDe(cb));
    }
    // nenhuma opção: o portal ainda está carregando a lista (não é "opção que não existe")
    if (!opts.length) { await closeCombo(cb); return { ok: false, motivo: 'lista vazia' }; }
    const procurados = [pedido, aliasDe(pedido)].filter(Boolean);
    const exato = (lista) => lista.find(x => procurados.some(p => norm(x.text) === norm(p)));
    const todas = new Set(opts.map(x => x.text));
    const juntar = (lista) => lista.forEach(x => todas.add(x.text));
    let alvo = exato(opts), escolha = null;
    // não está entre as linhas à vista (lista longa ou virtualizada): digita para filtrar — o apelido primeiro (é o nome da lista)
    for (const p of [...procurados].reverse()) {
      if (alvo) break;
      const f = await filtrar(cb, inp, p); juntar(f);
      alvo = exato(f) || await rolarLista(cb, (l) => { juntar(l); return exato(l); });
    }
    if (!alvo) {
      // nada igual: compara com a lista inteira (sem filtro)
      juntar(await filtrar(cb, inp, ''));
      await rolarLista(cb, (l) => { juntar(l); return null; });
      const notas = procurados.map(p => CtOpcoes.escolher(p, [...todas], { pessoa: !!o.pessoa })).sort((a, b) => (b.opcao ? 1 : 0) - (a.opcao ? 1 : 0) || b.score - a.score);
      escolha = notas[0] || null;
      if (escolha?.opcao) {
        const igual = (l) => l.find(x => x.text === escolha.opcao);
        alvo = igual(readOpts(caixaDe(cb))) || await rolarLista(cb, igual);
        if (!alvo) { const f = await filtrar(cb, inp, escolha.opcao); alvo = igual(f) || await rolarLista(cb, igual); }
      }
    }
    if (alvo) {
      alvo.el.scrollIntoView({ block: 'nearest' });
      alvo.el.click(); await sleep(200);
      if (cb.getAttribute('aria-expanded') === 'true') await closeCombo(cb);
      mark(cb);
      const aprox = !!escolha?.opcao;
      return { ok: true, valor: alvo.text, score: aprox ? escolha.score : 1, ...(aprox ? { aproximada: true, pedido } : {}) };
    }
    setValor(inp, ''); await closeCombo(cb);
    return { ok: false, motivo: `opção "${pedido}" não encontrada`, sugestoes: escolha?.sugestoes || [] };
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

  /* Tipos de campo comparados só pelos números (as máscaras do portal mudam pontos, barras e espaços). */
  const SO_DIGITOS = new Set(['data', 'competencia', 'cpf', 'pis', 'cep', 'telefone', 'moeda', 'numero']);
  /** O portal já está com este valor? Então o campo é pulado (não reabre a lista nem tira o foco). */
  function jaIgual(def, atual, v) {
    if (!atual) return false;
    if (SO_DIGITOS.has(def.tipo)) { const a = String(atual).replace(/\D/g, ''); return !!a && a === String(v).replace(/\D/g, ''); }
    if (norm(atual) === norm(v)) return true;
    const al = def.tipo === 'combo' || def.tipo === 'radio' ? aliasDe(v) : null;
    return !!al && norm(al) === norm(atual);
  }
  /** Definição de um campo: o das regras, ou um campo do portal fora das regras ("extra:<formcontrolname>"). */
  function defDoCampo(tipo, k) {
    if (tipo.campos[k]) return tipo.campos[k];
    if (!String(k).startsWith('extra:')) return null;
    const fc = k.slice(6); const el = findField({ fc });
    return { fc, tipo: el ? tipoDoElemento(el) : 'texto', rotulo: fc, extra: true };
  }
  const PARA_TENTAR_DE_NOVO = new Set(['campo bloqueado', 'campo não visível', 'lista vazia']);

  async function fillForm(tipoKey, values, files, opts) {
    const tipo = resolveTipoLocal(tipoKey);
    if (!tipo) return { ok: false, resultados: [], erro: 'Tipo de solicitação desconhecido nas regras.' };
    const r = routeInfo();
    if (r.mode !== 'form' || tipoBySlug(r.slug) !== tipoKey) {
      await navigate(tipo.slug, true);
      await waitForForm(8000);
    }
    // na ordem das etapas e dos campos das regras (funcionário antes do motivo, UF antes do município);
    // campos fora das regras vão no fim
    const ordem = Object.keys(tipo.campos);
    const pos = (k) => { const i = ordem.indexOf(k); return i < 0 ? ordem.length : i; };
    const entries = Object.entries(values)
      .filter(([k, v]) => { const d = defDoCampo(tipo, k); return d && !d.somenteAssistente && v != null && String(v).trim() !== ''; })
      .sort(([a], [b]) => pos(a) - pos(b));
    const resultados = [];
    const firstStepBtn = document.querySelector('button.bento-wizard-step');
    const avancou = (n) => { if (opts.reqId) post({ type: 'fillProgress', id: opts.reqId, n, m: entries.length }); };
    // como estava antes: é o que o "Desfazer" devolve
    const antes = {};
    for (const [k] of entries) antes[k] = readField(defDoCampo(tipo, k)).valor || '';
    const umCampo = async (k, v, esperaLista) => {
      const def = defDoCampo(tipo, k);
      try {
        const atual = readField(def).valor || '';
        if (jaIgual(def, atual, v)) return { ok: true, valor: atual, igual: true };
        if (def.tipo === 'radio') return await setRadio(def, v);
        const el = findField(def);
        if (!el) return { ok: false, motivo: 'campo não está nesta tela' };
        if (el.tagName === 'BENTO-COMBOBOX') return await pickCombo(el, String(v), { pessoa: def.fonte === 'empregado', esperaLista });
        await reveal(el);
        if (el.disabled) return { ok: false, motivo: 'campo bloqueado' };
        const cur = (el.value || '').trim();
        if (cur && opts.naoSobrescrever && cur !== String(v)) return { ok: false, motivo: 'já preenchido (mantido)' };
        let val = String(v);
        if (def.tipo === 'moeda') val = val.replace(/[^\d,.]/g, '');
        setNative(el, val); mark(el);
        await sleep(40);
        return { ok: true, valor: el.value };
      } catch (e) {
        return { ok: false, motivo: String(e.message || e) };
      }
    };
    // o cliente saiu do formulário no meio (cancelou, abriu outro): para, sem escrever no formulário novo
    const formulario = mainEl().querySelector('form');
    const saiu = () => !!formulario && !formulario.isConnected;
    for (const [i, [k, v]] of entries.entries()) {
      if (saiu()) break;
      avancou(i); resultados.push({ campo: k, ...(await umCampo(k, v)) });
    }
    if (saiu()) return { ok: false, resultados, anexados: 0, anexos: null, depois: {}, mudou: false, erro: 'O formulário foi fechado durante o preenchimento.' };
    // o que voltou bloqueado, escondido ou com a lista vazia: o portal pode estar carregando (ex.: municípios
    // depois da UF). Espera até ~5 s e tenta de novo, uma vez.
    const deNovo = resultados.filter(x => !x.ok && PARA_TENTAR_DE_NOVO.has(x.motivo));
    if (deNovo.length) {
      const pronto = (x) => { const d = defDoCampo(tipo, x.campo); const el = d.seletores ? mainEl().querySelector(Object.values(d.seletores)[0]) : findField(d); return !!el && !bloqueado(el); };
      // lista vazia: a nova tentativa já espera a lista (até 5 s); bloqueado ou escondido: espera ficar livre
      const esperar = () => deNovo.some(x => x.motivo !== 'lista vazia' && !pronto(x));
      for (const t0 = Date.now(); Date.now() - t0 < 5000 && esperar();) { await sleep(300); avancou(entries.length); }
      for (const x of deNovo) {
        avancou(entries.length);
        const novo = await umCampo(x.campo, values[x.campo], 5000);
        const i = resultados.indexOf(x);
        resultados[i] = { campo: x.campo, ...novo, tentouDeNovo: true };
        if (!novo.ok && novo.motivo === 'lista vazia') resultados[i].motivo = rules?.mensagens?.listaCarregando || 'O portal ainda está carregando a lista deste campo — tentei de novo';
      }
    }
    // listas com uma opção só (centro de custo, sindicato…): escolhe sozinho, só nos campos que as regras marcam
    for (const k of opts.unicaOpcao || []) {
      const def = tipo.campos[k];
      if (!def || def.tipo !== 'combo' || String(values[k] ?? '').trim()) continue;
      const el = findField(def);
      if (!el || el.tagName !== 'BENTO-COMBOBOX' || bloqueado(el) || readField(def).valor) continue;
      avancou(entries.length);
      const lista = await comboOptions(def, true);
      if (lista.length !== 1) continue;
      await sleep(250);   // a lista acabou de fechar: espera antes de abrir de novo
      antes[k] = '';
      const res = await pickCombo(el, lista[0]);
      if (res.ok) resultados.push({ campo: k, ...res, unica: true });
    }
    let anexos = null;
    if (files?.length) anexos = await attachFiles(files);
    const mexeu = resultados.some(x => x.ok && !x.igual) || !!anexos?.n;
    if (firstStepBtn && opts.voltarInicio !== false && mexeu) { firstStepBtn.click(); await sleep(200); }
    if (mexeu && opts.voltarInicio !== false) window.scrollTo({ top: 0, behavior: 'smooth' });
    const depois = {};
    for (const k of Object.keys(antes)) depois[k] = readField(defDoCampo(tipo, k)).valor || '';
    // guarda só o que de fato mudou
    const mudancas = Object.fromEntries(Object.keys(antes).filter(k => antes[k] !== depois[k]).map(k => [k, antes[k]]));
    const anexadosNomes = anexos?.aceitos || [];
    const mudou = Object.keys(mudancas).length > 0 || anexadosNomes.length > 0;
    if (mudou && !opts.semDesfazer) { desfazerPilha.push({ path: currentPath(), tipo: tipoKey, antes: mudancas, anexos: anexadosNomes }); if (desfazerPilha.length > 10) desfazerPilha.shift(); }
    return { ok: true, resultados, anexados: anexos?.n || 0, anexos, depois, mudou };
  }

  /* ============ Grade do Lançamento de Rubricas (lote 6) ============ */
  /* A grade real ainda NÃO foi mapeada (a empresa de teste não tem eventos): o simulador reproduz uma grade plausível — tabela
     com o funcionário na 1ª coluna e um evento por coluna, um campo por célula. Seletores nas regras (tipos.rubricas.grade),
     a calibrar no Onvio real. Só escreve nos campos da grade (com Desfazer); quem envia é o cliente, pelo botão do portal. */
  const cfgGrade = () => ({ tabela: "table[aria-label='Rubricas'], [role=grid][aria-label='Rubricas']", botaoAdicionarTodos: 'Adicionar todos os funcionários', colunaEmpregado: 0, ...(rules?.tipos?.rubricas?.grade || {}) });
  const acharGrade = () => mainEl().querySelector(cfgGrade().tabela);
  function lerTabelaGrade(tab) {
    const ce = +cfgGrade().colunaEmpregado || 0;
    const titulos = [...tab.querySelectorAll('thead th, [role=columnheader]')].map(th => (th.innerText || '').trim());
    const linhas = [...tab.querySelectorAll('tbody tr, [role=row]')].filter(r => r.querySelector('input'));
    const celulas = (r) => [...r.querySelectorAll('td, [role=gridcell], [role=rowheader]')];
    const empregados = linhas.map(r => (celulas(r)[ce]?.innerText || '').trim());
    return { titulos, linhas, empregados, celulas, eventos: titulos.filter((_, i) => i !== ce) };
  }
  async function lerGrade(adicionar) {
    const r = routeInfo();
    if (r.mode !== 'form' || tipoBySlug(r.slug) !== 'rubricas') return { ok: false, motivo: 'abra o Lançamento de Rubricas' };
    let tab = acharGrade();
    if ((!tab || !lerTabelaGrade(tab).linhas.length) && adicionar) {
      const alvo = norm(cfgGrade().botaoAdicionarTodos);
      const b = [...mainEl().querySelectorAll('button')].find(x => norm(x.innerText) === alvo && !x.disabled);
      if (!b) return { ok: false, motivo: 'não achei o botão para adicionar os funcionários na grade' };
      await reveal(b); b.click();
      for (let i = 0; i < 20 && !(tab = acharGrade()); i++) await sleep(250);
    }
    if (!tab) return { ok: false, motivo: 'a grade não apareceu (a competência está preenchida?)' };
    const g = lerTabelaGrade(tab);
    return { ok: true, eventos: g.eventos, empregados: g.empregados };
  }
  /** celulas: [{ empregado, evento, valor }] com os nomes exatos da grade (o painel casa os nomes antes). */
  async function preencherGrade(celulas) {
    const tab = acharGrade(); if (!tab) return { ok: false, n: 0, mudou: 0, faltaram: celulas };
    await reveal(tab);
    const g = lerTabelaGrade(tab);
    const antes = [], faltaram = [];
    for (const c of celulas) {
      const i = g.empregados.findIndex(e => norm(e) === norm(c.empregado));
      const col = g.titulos.findIndex(t => norm(t) === norm(c.evento));
      const inp = i >= 0 && col >= 0 ? g.celulas(g.linhas[i])[col]?.querySelector('input') : null;
      if (!inp || inp.disabled || inp.readOnly) { faltaram.push(c); continue; }
      const v0 = inp.value || '';
      if (v0 === String(c.valor)) continue;
      setNative(inp, String(c.valor)); mark(inp); await sleep(30);
      antes.push({ empregado: c.empregado, evento: c.evento, antes: v0 });
    }
    if (antes.length) { desfazerPilha.push({ path: currentPath(), tipo: 'rubricas', antes: {}, anexos: [], grade: antes }); if (desfazerPilha.length > 10) desfazerPilha.shift(); }
    return { ok: true, n: celulas.length - faltaram.length, mudou: antes.length, faltaram };
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
        const def = tipo && defDoCampo(tipo, k); if (!def) continue;
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
      // grade de rubricas: cada célula volta ao valor de antes
      const tab = d.grade?.length ? acharGrade() : null;
      const g = tab ? lerTabelaGrade(tab) : null;
      for (const c of d.grade || []) {
        const i = g ? g.empregados.findIndex(e => norm(e) === norm(c.empregado)) : -1;
        const col = g ? g.titulos.findIndex(t => norm(t) === norm(c.evento)) : -1;
        const inp = i >= 0 && col >= 0 ? g.celulas(g.linhas[i])[col]?.querySelector('input') : null;
        if (inp) setNative(inp, c.antes); else falhas.push('grade:' + c.evento);
      }
    });
    sendContext(); avisarDesfazer();
    toast(falhas.length ? `Desfeito em parte: confira ${falhas.length} item(ns) no formulário.` : 'Preenchimento desfeito: o formulário voltou a como estava.', 4000);
    // os valores que voltaram: a plataforma mostra o mesmo que o portal
    const valores = Object.fromEntries(campos.map(k => [k, d.antes[k] || '']));
    post({ type: 'undone', campos, anexos, falhas, valores, grade: (d.grade || []).length });
    return { ok: !falhas.length, campos, anexos, falhas, valores };
  }

  /** Anexa e confere arquivo por arquivo se o portal ficou com ele (pode recusar por formato ou tamanho — a calibrar no Onvio real). */
  async function attachFiles(files) {
    const inp = mainEl().querySelector('input[type=file]');
    if (!inp) return { n: 0, aceitos: [], recusados: [], jaEstavam: [], semCampo: true };
    await reveal(inp);
    const already = new Set(attachedNames().map(norm));
    const dt = new DataTransfer(); const jaEstavam = [];
    for (const f of files) if (already.has(norm(f.name))) jaEstavam.push(f.name); else dt.items.add(f);
    if (!dt.files.length) return { n: 0, aceitos: [], recusados: [], jaEstavam };
    const enviados = [...dt.files].map(f => f.name);
    inp.__ctOwn = true;
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => { inp.__ctOwn = false; }, 0);
    let agora = [];
    for (let i = 0; i < 8; i++) { await sleep(250); agora = attachedNames().map(norm); if (enviados.every(n => agora.includes(norm(n)))) break; }
    const aceitos = enviados.filter(n => agora.includes(norm(n)));
    return { n: aceitos.length, aceitos, recusados: enviados.filter(n => !aceitos.includes(n)), jaEstavam };
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

  /* ============ Trocar de empresa ============ */
  const mesmoNome = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
  async function esperarEmpresa(nome, ms) {
    for (let t = 0; t < ms; t += 250) { if (mesmoNome(companyName(), nome)) return true; await sleep(250); }
    return mesmoNome(companyName(), nome);
  }
  /** Troca a empresa pelo seletor do próprio portal e só diz "ok" depois de ver o nome novo na tela. Se a troca não
   *  puder ser confirmada, o painel não preenche nada (para não montar o pedido na empresa errada).
   *  O seletor do Onvio real ainda não foi mapeado: a busca abaixo é um palpite — **a calibrar no Chrome do Josué**. */
  async function trocarEmpresa(nome) {
    if (!norm(nome)) return { ok: false, motivo: 'sem nome de empresa' };
    if (mesmoNome(companyName(), nome)) return { ok: true, empresa: companyName() };
    if (plat.trocarEmpresa) {   // simulador
      const r = await plat.trocarEmpresa(nome);
      if (!r?.ok) return { ok: false, motivo: 'esta empresa não está neste acesso' };
      return (await esperarEmpresa(nome, 4000)) ? { ok: true, empresa: companyName() } : { ok: false, motivo: 'o portal não mostrou a empresa nova' };
    }
    // 1) o gatilho: o bloco do cabeçalho com o rótulo "EMPRESA" e o nome da empresa aberta
    const rotulo = [...document.querySelectorAll('body *')].find(e => !e.children.length && /^empresa$/i.test((e.textContent || '').trim()));
    const gatilho = rotulo?.closest('button,[role=button],[role=combobox],a,bento-combobox,[tabindex]') || rotulo?.parentElement;
    if (!gatilho) return { ok: false, motivo: 'não achei o seletor de empresas do portal' };
    gatilho.click();
    // 2) a lista (pode ter busca): escolhe a opção cujo texto é o da empresa
    const opcao = async () => {
      for (let t = 0; t < 3000; t += 250) {
        const o = [...document.querySelectorAll('[role=option],[role=menuitem],[role=listbox] li,bento-list-row,.bento-list-row')].find(e => mesmoNome(e.innerText, nome));
        if (o) return o;
        const busca = [...document.querySelectorAll('[role=dialog] input,[role=listbox] input,bento-combobox input,input[type=search]')].find(i => i.offsetParent && i.type !== 'file' && !i.disabled);
        if (busca && t === 500) setNative(busca, nome);
        await sleep(250);
      }
      return null;
    };
    const o = await opcao();
    if (!o) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, motivo: 'a empresa não apareceu na lista do portal' }; }
    o.click();
    return (await esperarEmpresa(nome, 12000)) ? { ok: true, empresa: companyName() } : { ok: false, motivo: 'o portal não confirmou a troca de empresa' };
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
  // bonusDays e priorNoticeDate: para "Pedir o cálculo" com os dados do aviso (a calibrar no Onvio real)
  const CAMPOS_AVISO = ['vacationStartDate', 'paymentDate', 'adviceDate', 'noticeDate', 'priorNoticeDate', 'vacationDays', 'bonusDays', 'resignationDate', 'priorNoticeAdviceDate', 'admissionDate', 'startDate', 'leaveDate', 'effectiveDate'];
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
  /** "Ver no portal" / "Responder no portal" / "Anexar no portal": leva o portal à solicitação certa (procura o nº na lista, como o
   *  Control Onvio) e mostra o portal com o painel encaixado. Sem achar o nº, fica na lista e avisa. */
  async function abrirNoPortal(m) {
    let aberta = false;
    if (m.area === 'documentos') {
      if (plat.navigate && plat.rotaDocumentos) plat.navigate(plat.rotaDocumentos);
      else [...document.querySelectorAll('a, button')].find(e => /^\s*documentos\s*$/i.test(e.innerText || '') && !e.closest('form'))?.click();   // a calibrar
    } else if (m.slug) {
      // m.id é o número do pedido no canal: o nº da solicitação vem em m.numero
      const numero = String(m.numero || '').trim();
      aberta = !!numero && await abrirSolicitacao(m.slug, numero);
      if (!aberta) {
        const rota = numero && (plat.detalhe || rules?.config?.rotaDetalheSolicitacao);
        await navigate(rota ? `${m.slug}/${numero}` : m.slug, false);
        aberta = !!rota;
        if (!rota && numero) toast(`Abri a lista: procure a solicitação nº ${numero}.`, 6000);
      }
    }
    setModo('painel');
    return aberta;
  }
  /** Abre a solicitação pelo nº: abre a lista do tipo e clica na célula com o número (nunca em botões da linha).
   *  A calibrar no Onvio real: lista paginada, se o clique é na linha ou num link, e a rota do detalhe. */
  async function abrirSolicitacao(slug, numero) {
    const alvo = String(numero || '').trim(); if (!alvo) return false;
    await navigate(slug, false);
    const lista = currentPath();
    const celula = () => [...mainEl().querySelectorAll('tbody td, [role=gridcell]')].find(c => (c.innerText || '').trim() === alvo && !c.closest('form'));
    let c = null;
    for (let i = 0; i < 24 && !(c = celula()); i++) await sleep(250);
    if (!c) return false;
    (c.querySelector('a, [role=link]') || c).click();
    for (let i = 0; i < 24; i++) { await sleep(250); if (currentPath() !== lista || !celula()) return true; }
    return false;
  }
  /* ============ Preparar a resposta (lote 6) ============ */
  /* Abre a solicitação certa e deixa um texto sugerido (das regras, escolhido pelo cliente no painel — nunca o texto livre, nunca
     CID) na caixa de resposta, com os arquivos anexados. NUNCA clica em responder/enviar: isso é sempre do cliente, no portal.
     Não escreve nada pela API. A tela do detalhe e a caixa de resposta do Onvio real não foram mapeadas: a calibrar (regras:
     config.respostaPortal). */
  function caixaResposta() {
    const sels = [].concat(rules?.config?.respostaPortal?.caixa || ['[data-resposta] textarea', 'textarea[formcontrolname=topicDescription]']);
    for (const s of sels) { try { const el = [...mainEl().querySelectorAll(s)].find(e => !e.disabled && !e.closest('#ct-assistente-host')); if (el) return el; } catch { /* seletor inválido nas regras */ } }
    return null;
  }
  async function prepararResposta(m) {
    const files = unpackFiles(m.files);
    const aberta = await abrirNoPortal({ slug: m.slug, numero: m.numero });
    if (!aberta) return { ok: false, motivo: 'não achei a solicitação na lista do portal' };
    let caixa = null;
    for (let i = 0; i < 24 && !(caixa = caixaResposta()); i++) await sleep(250);
    if (!caixa) return { ok: false, motivo: 'não achei a caixa de resposta' };
    await reveal(caixa);
    const atual = (caixa.value || '').trim();
    if (!atual && m.texto) setNative(caixa, String(m.texto));   // o que o cliente já escreveu fica como está
    let anexos = null;
    if (files.length) anexos = await attachFiles(files);
    caixa.scrollIntoView({ block: 'center', behavior: 'instant' }); mark(caixa); caixa.focus?.();
    sendContext();
    toast(`Resposta preparada: confira e clique em ${rules?.config?.respostaPortal?.botaoResponder || 'RESPONDER'} no portal.`, 9000);
    return { ok: true, textoPosto: !atual && !!m.texto, anexados: anexos?.aceitos || [], recusados: anexos?.recusados || [] };
  }
  /* O portal abriu uma janela (ou a sessão expirou) enquanto está coberto pela plataforma */
  let atencaoVista = '';
  function verAtencao() {
    if (modo !== 'plataforma' || preenchendoAgora || navInterna) return;
    const d = [...document.querySelectorAll('[role=dialog], [role=alertdialog], .modal.show')].find(e => visible(e) && (e.innerText || '').trim());
    const txt = d ? d.innerText.trim().replace(/\s+/g, ' ').slice(0, 400) : '';
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
      // o portal recusou: leva junto o que ele marcou como inválido (só rótulo e mensagem curta)
      if (currentPath() === onde && submitButton()) post({ type: 'envioNaoConcluido', erros: errosDoPortal(tipoBySlug(routeInfo().slug)) });
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
    plat.expose?.({ openPanel: () => setPanel(true), modo: (m) => setModo(m), sendFiles: async (files) => { setPanel(true); const go = () => sendFiles(files, 'arrastar'); if (port) go(); else setTimeout(go, 800); },
      // testes do simulador: o mesmo preenchimento que o painel pede (nunca envia)
      preencher: (tipo, values, opts) => comboLock(() => fillForm(tipo, values || {}, [], opts || {})) });
  });
})();
