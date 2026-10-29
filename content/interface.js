/* Assistente do Portal do Cliente — conteúdo: Interface na página (Shadow DOM: botão, painel, aviso) e colar com Ctrl+V.
 * Parte de content/ (dividido na 2.17.0; mapa em docs/arquitetura.md). Script comum: compartilha o escopo do mundo isolado
 * com os outros arquivos de content/ (a ordem de carga está no manifest e no simulador). */
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
    .launcher{position:fixed;right:20px;bottom:22px;width:60px;height:60px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;
      background:#fff;cursor:pointer;
      box-shadow:0 0 0 6px rgba(194,0,12,.12),0 2px 6px rgba(16,24,32,.22),0 12px 28px rgba(16,24,32,.26);transition:transform .15s ease, box-shadow .15s ease}
    .launcher:hover{transform:scale(1.06)}
    .launcher:focus-visible{outline:2px solid #6BAAC9;outline-offset:4px}
    .launcher .mark{width:46px;height:46px;border-radius:50%;background:#0E151B;display:flex;align-items:center;justify-content:center}
    .launcher .mark img{height:24px;width:auto;display:block;transform:translateX(2px)}
    .launcher .lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
    .launcher .badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#C2000C;color:#fff;box-shadow:0 0 0 2px #fff;font:600 11px 'Archivo',sans-serif;display:grid;place-items:center}
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
    <span class="mark"><img alt="" src="${chrome.runtime.getURL('icons/logo.svg')}"></span>
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
