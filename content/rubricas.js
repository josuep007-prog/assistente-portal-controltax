/* Assistente do Portal do Cliente — conteúdo: Planilha de rubricas ampla (2.19.0).
 * Parte de content/ (mapa em docs/arquitetura.md). Script comum: compartilha o escopo do mundo isolado com os outros arquivos
 * de content/ (a ordem de carga está no manifest e no simulador).
 *
 * O Lançamento de Rubricas do portal mostra a grade (Nome + uma coluna por evento) numa janelinha com altura fixa e três
 * barras de rolagem (a da página, a de cima/baixo e a do lado). Aqui a grade ganha: (1) altura que aproveita a tela, (2) a
 * coluna do nome e o cabeçalho fixos ao rolar, (3) títulos que quebram em duas linhas em vez de cortar e (4) o botão "Ampliar
 * planilha": tela cheia só para a grade, com uma única área de rolagem. Só muda o jeito de mostrar (estilo): não lê nem escreve
 * valores, nada é enviado. A grade real não tem seletor mapeado: ela é achada pelo que tem (uma área rolável com várias colunas
 * "código - nome do evento"); o diagnóstico mostra a etiqueta e as classes do que foi achado (a calibrar no Onvio real). */
const gradeAmpla = { card: null, scroller: null, barra: null, cheia: false, viaTelaCheia: false, achada: '' };

const gradeEhRubricas = () => { const r = routeInfo(); return r.mode === 'form' && tipoBySlug(r.slug) === 'rubricas'; };
const gradeNome = (el) => (el ? `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}` : '');
const gradeRotEvento = /^\s*\d{1,6}\s*-\s*\S/;

/** Quantas colunas "código - nome" (os eventos da empresa) o elemento tem. */
function gradeEventosEm(el) {
  let n = 0;
  for (const x of el.querySelectorAll('*')) if (!x.children.length && gradeRotEvento.test(x.textContent || '')) n++;
  return n;
}

function acharPlanilha() {
  const main = mainEl();
  const rolavel = (el) => { const cs = getComputedStyle(el); return /(auto|scroll|overlay)/.test(cs.overflowX) || /(auto|scroll|overlay)/.test(cs.overflowY); };
  let cand = [...main.querySelectorAll('*')].filter(el => el.clientWidth >= 300 && el.clientHeight >= 80 && rolavel(el) && gradeEventosEm(el) >= 2);
  cand = cand.filter(el => !cand.some(o => o !== el && el.contains(o)));   // a área rolável mais de dentro (não a rolagem da página)
  let scroller = cand.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] || null;
  if (!scroller) {   // sem área rolável própria: a tabela da grade, e o pai dela passa a rolar
    const tab = main.querySelector(cfgGrade().tabela) || [...main.querySelectorAll('table, [role=grid]')].find(t => gradeEventosEm(t) >= 2);
    scroller = tab ? tab.parentElement : null;
  }
  if (!scroller || scroller === main || scroller === document.body) return null;
  // o cartão: o primeiro bloco acima que também tem os botões "Adicionar funcionários"
  const botao = /adicionar\s+(todos\s+os\s+)?funcion/;
  let card = scroller.parentElement;
  for (let el = scroller.parentElement; el && el !== main && el !== document.body; el = el.parentElement) {
    if ([...el.querySelectorAll('button')].some(b => botao.test(norm(b.innerText).toLowerCase()))) { card = el; break; }
  }
  return { scroller, card: card && card !== main ? card : scroller.parentElement };
}

const gradeCss = () => `
.ct-grade-scroll { overflow: auto !important; max-height: none !important; }
.ct-grade-scroll tr > :first-child, .ct-grade-scroll [role=row] > :first-child { position: sticky !important; left: 0 !important; z-index: 3 !important; background: #fff !important; box-shadow: 2px 0 0 rgba(0,0,0,.08); }
.ct-grade-scroll thead th, .ct-grade-scroll [role=columnheader] { position: sticky !important; top: 0 !important; z-index: 4 !important; background: #fff !important; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; line-height: 1.2 !important; vertical-align: bottom !important; }
.ct-grade-scroll thead th:first-child, .ct-grade-scroll [role=columnheader]:first-child { z-index: 5 !important; }
.ct-grade-card.ct-grade-cheia { position: fixed !important; inset: 0 !important; z-index: 2147482000 !important; margin: 0 !important; padding: 12px 16px !important; background: #fff !important; box-sizing: border-box !important; overflow: auto !important; }
.ct-grade-card:fullscreen { margin: 0 !important; padding: 12px 16px !important; background: #fff !important; box-sizing: border-box !important; overflow: auto !important; }
.ct-grade-barra { display: flex; align-items: center; gap: 12px; margin: 0 0 8px; font: 500 12.5px 'IBM Plex Sans', system-ui, sans-serif; color: #4b5b68; }
.ct-grade-btn { border: 1px solid #0071a9; background: #fff; color: #0071a9; border-radius: 3px; padding: 6px 12px; font: 700 12px 'IBM Plex Sans', system-ui, sans-serif; letter-spacing: .02em; cursor: pointer; }
.ct-grade-btn:hover { background: #0071a9; color: #fff; }
.ct-grade-btn:focus-visible { outline: 2px solid #0071a9; outline-offset: 2px; }
`;

function gradeEstilo() {
  if (document.getElementById('ct-grade-css')) return;
  const st = document.createElement('style'); st.id = 'ct-grade-css'; st.textContent = gradeCss();
  document.documentElement.appendChild(st);
}

/** Altura da área rolável: a que sobra na tela (cheia) ou quase a tela toda (normal), sem as barras de cima e de baixo da página. */
function gradeAltura() {
  const { scroller } = gradeAmpla; if (!scroller || !scroller.isConnected) return;
  const topo = scroller.getBoundingClientRect().top;
  const h = Math.round(gradeAmpla.cheia ? innerHeight - Math.max(0, topo) - 16 : Math.max(460, innerHeight - 170));
  if (scroller.style.getPropertyValue('height') !== `${h}px`) scroller.style.setProperty('height', `${h}px`, 'important');
}

function gradeBarra() {
  const { card } = gradeAmpla; if (!card) return;
  if (!gradeAmpla.barra || !gradeAmpla.barra.isConnected) {
    const b = document.createElement('div'); b.className = 'ct-grade-barra';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ct-grade-btn';
    const dica = document.createElement('span');
    btn.addEventListener('click', () => gradeCheia(!gradeAmpla.cheia));
    b.append(btn, dica); card.insertBefore(b, card.firstChild); gradeAmpla.barra = b;
  }
  const [btn, dica] = gradeAmpla.barra.children;
  const t = gradeAmpla.cheia ? 'Sair da tela cheia (Esc)' : 'Ampliar planilha (tela cheia)';
  if (btn.textContent !== t) btn.textContent = t;
  const d = gradeAmpla.cheia ? 'Role só dentro da planilha: o nome e os títulos ficam fixos.' : 'Para preencher com mais espaço, sem as barras da página.';
  if (dica.textContent !== d) dica.textContent = d;
}

async function gradeCheia(ligar) {
  const { card } = gradeAmpla; if (!card) return;
  if (ligar) {
    gradeAmpla.cheia = true;
    try { await card.requestFullscreen({ navigationUI: 'hide' }); gradeAmpla.viaTelaCheia = true; }
    catch { gradeAmpla.viaTelaCheia = false; card.classList.add('ct-grade-cheia'); }   // sem tela cheia do navegador: cobre a janela com o próprio bloco
  } else {
    gradeAmpla.cheia = false;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    gradeAmpla.viaTelaCheia = false; card.classList.remove('ct-grade-cheia');
  }
  gradeBarra(); requestAnimationFrame(() => { gradeAltura(); setTimeout(gradeAltura, 150); });
}

function gradeLimpar() {
  const { card, scroller, barra } = gradeAmpla;
  if (document.fullscreenElement && gradeAmpla.viaTelaCheia) document.exitFullscreen().catch(() => {});
  barra?.remove(); card?.classList.remove('ct-grade-card', 'ct-grade-cheia');
  if (scroller) { scroller.classList.remove('ct-grade-scroll'); scroller.style.removeProperty('height'); }
  Object.assign(gradeAmpla, { card: null, scroller: null, barra: null, cheia: false, viaTelaCheia: false, achada: '' });
}

/** Chamada a cada mudança da tela (final.js): acha a planilha quando ela aparece e a deixa ampla; fora do Lançamento de Rubricas, desfaz. */
function atualizarGrade() {
  if (!gradeEhRubricas()) { if (gradeAmpla.card) gradeLimpar(); return; }
  if (rules?.tipos?.rubricas?.grade?.ampla === false) return;
  if (gradeAmpla.scroller && !gradeAmpla.scroller.isConnected) gradeLimpar();   // o portal redesenhou a grade
  if (!gradeAmpla.scroller) {
    const a = acharPlanilha(); if (!a) return;
    gradeEstilo();
    Object.assign(gradeAmpla, a, { achada: `${gradeNome(a.scroller)} em ${gradeNome(a.card)}` });
    a.scroller.classList.add('ct-grade-scroll'); a.card.classList.add('ct-grade-card');
  }
  gradeBarra(); gradeAltura();
}

/** Só etiquetas e classes (nenhum texto da tela): para o diagnóstico. */
const gradeInfo = () => (gradeEhRubricas() ? { achou: !!gradeAmpla.scroller, onde: gradeAmpla.achada, cheia: gradeAmpla.cheia ? (gradeAmpla.viaTelaCheia ? 'navegador' : 'janela') : '' } : null);

addEventListener('resize', () => { if (gradeAmpla.scroller) gradeAltura(); });
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && gradeAmpla.cheia && gradeAmpla.viaTelaCheia) { gradeAmpla.cheia = false; gradeAmpla.viaTelaCheia = false; }   // saiu pelo Esc
  if (gradeAmpla.card) { gradeBarra(); requestAnimationFrame(gradeAltura); }
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && gradeAmpla.cheia && !gradeAmpla.viaTelaCheia) gradeCheia(false); });
