/* Assistente do Portal do Cliente — conteúdo: leitura da grade do Lançamento de Rubricas (2.20.1).
 * Parte de content/ (mapa em docs/arquitetura.md). Script comum: compartilha o escopo do mundo isolado com os outros arquivos
 * de content/ (a ordem de carga está no manifest e no simulador).
 *
 * NADA aqui muda o jeito que o Onvio aparece (sem estilo, botão ou classe na página): a 2.19.0 chegou a ampliar a planilha do
 * próprio portal e foi desfeita a pedido do Josué. Este arquivo só ACHA a grade e a lê (colunas "código - evento", funcionários,
 * células) para a Planilha de rubricas da plataforma (panel/painel/planilha.js) lançar os valores digitados nela. A grade real é
 * feita de blocos (div em div.content__grid), não de tabela: é achada pelo conteúdo e lida pela posição na tela. */
const gradeAmpla = { card: null, scroller: null, achada: '' };   // só guarda o que foi achado (o nome vem da 2.19.0)

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
  if (!scroller) {   // sem área rolável própria: a tabela da grade (ou o bloco que tem as colunas)
    const tab = main.querySelector(cfgGrade().tabela) || [...main.querySelectorAll('table, [role=grid], div')].find(t => gradeEventosEm(t) >= 2 && !t.querySelector('table, [role=grid]'));
    scroller = tab ? (tab.tagName === 'TABLE' ? tab.parentElement : tab) : null;
  }
  if (!scroller || scroller === main || scroller === document.body) return null;
  return { scroller, card: scroller.parentElement };
}

/** Chamada a cada mudança da tela (final.js): acha a grade quando ela aparece. Só guarda a referência (não mexe na página). */
function atualizarGrade() {
  if (!gradeEhRubricas()) { if (gradeAmpla.scroller) Object.assign(gradeAmpla, { card: null, scroller: null, achada: '' }); return; }
  if (gradeAmpla.scroller && !gradeAmpla.scroller.isConnected) Object.assign(gradeAmpla, { card: null, scroller: null, achada: '' });   // o portal redesenhou a grade
  if (gradeAmpla.scroller) return;
  const a = acharPlanilha(); if (!a) return;
  Object.assign(gradeAmpla, a, { achada: `${gradeNome(a.scroller)} em ${gradeNome(a.card)}` });
}

let gradeDiag = { t: 0, estrutura: '', entradas: '' };
/** Só etiquetas, classes e contagens (nenhum texto da tela): para o diagnóstico. */
const gradeInfo = () => {
  if (!gradeEhRubricas()) return null;
  if (Date.now() - gradeDiag.t > 5000) gradeDiag = { t: Date.now(), estrutura: gradeEstrutura(), entradas: gradeEntradas() };   // varrer a tela a cada mudança pesaria
  return { achou: !!gradeAmpla.scroller, onde: gradeAmpla.achada, cheia: '', estrutura: gradeDiag.estrutura, entradas: gradeDiag.entradas };
};

/* ============ Grade que não é <table> (o portal real: div em div.content__grid, visto em 30/10/2026) ============ */
/* Colunas e linhas pela posição na tela: os títulos "código - evento" dão as colunas; a coluna "Nome" dá os funcionários; cada
   linha é o menor bloco que tem a caixa de marcar e alcança a última coluna. A célula é o campo (input) que cai na coluna; sem
   campo, o bloco da célula (o campo aparece ao clicar). Só estrutura e posição: nenhum valor da grade é guardado. */
const gradeRect = (el) => el.getBoundingClientRect();
const gradeCentroX = (el) => { const r = gradeRect(el); return (r.left + r.right) / 2; };

/** Grade com linhas `[role=row]` e células nos filhos (Wijmo FlexGrid): colunas pelo índice da célula do cabeçalho. Só estrutura; nenhum valor é guardado. */
let gradeAriaInfo = '';   // forma das linhas da grade (só contagens), para o diagnóstico e para o aviso de falha
function gradeAriaLer(scroller, evs) {
  const celulasDe = (row) => [...row.children];
  const cabEl = evs[0].closest('[role=row]'); if (!cabEl) { gradeAriaInfo = 'sem linha [role=row] no cabeçalho'; return null; }
  const cab = celulasDe(cabEl);
  const idx = cab.map((c, k) => (gradeRotEvento.test((c.textContent || '').trim()) ? k : -1)).filter(k => k >= 0);
  if (idx.length < 2) { gradeAriaInfo = 'cabeçalho com menos de 2 eventos'; return null; }
  const ehNome = (c) => /^(nome|empregad|funcionari)/.test(norm(c.textContent || '').toLowerCase()) && (c.textContent || '').trim().length < 25;
  let ni = cab.findIndex(ehNome); if (ni < 0) ni = cab.findIndex((c, k) => k < idx[0] && (c.textContent || '').trim());
  const rows = [...scroller.querySelectorAll('[role=row]')].filter(r => r !== cabEl && !r.querySelector('[role=columnheader]'));
  // o nome: a célula da coluna Nome; se estiver vazia, a primeira célula com texto que não seja uma coluna de evento
  const nomeDe = (r) => {
    // o nome pode estar num campo (input) da célula: o valor dele não aparece como texto
    const cs = celulasDe(r), t = (c) => ((c?.textContent || '').trim() || (c?.matches?.('input') ? c.value : c?.querySelector?.('input:not([type=checkbox]):not([type=radio])')?.value) || '').trim();
    return (ni >= 0 && t(cs[ni])) || t(cs.find((c, k) => !idx.includes(k) && t(c) && !/^\d+([.,]\d+)?$/.test(t(c))));
  };
  const linhas = rows.map(r => ({ y: (gradeRect(r).top + gradeRect(r).bottom) / 2, h: gradeRect(r).height, row: r, els: () => [r, ...r.querySelectorAll('*')] }));
  const dados = linhas.filter(l => nomeDe(l.row));
  gradeAriaInfo = `${rows.length} linhas de dados (filhos: ${rows.slice(0, 6).map(r => celulasDe(r).length).join(',')}; com nome: ${dados.length}; linhas com campo: ${rows.filter(r => r.querySelector('input:not([type=checkbox]):not([type=radio])')).length}, com campo preenchido: ${rows.filter(r => [...r.querySelectorAll('input:not([type=checkbox]):not([type=radio])')].some(i => i.value)).length}; cabeçalho: ${cab.length} filhos, nome no índice ${ni}, eventos nos índices ${idx.join(',')})`;
  if (!dados.length) return null;
  const campos = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, [contenteditable=true]';
  const celula = (l, j) => { const c = celulasDe(l.row)[idx[j]]; if (!c) return { bloco: null }; const campo = c.matches?.(campos) ? c : c.querySelector(campos); return campo ? { campo } : { bloco: c }; };
  return { titulos: idx.map(k => (cab[k].textContent || '').trim()), linhas: dados, empregados: dados.map(l => nomeDe(l.row)), celula };
}

function gradeDivLer(scroller) {
  if (!scroller) return null;
  const folhas = [...scroller.querySelectorAll('*')].filter(x => !x.children.length && (x.textContent || '').trim());
  const evs = folhas.filter(x => gradeRotEvento.test(x.textContent));
  if (evs.length < 2) return null;
  const centroY = (el) => { const r = gradeRect(el); return (r.top + r.bottom) / 2; };   // pelo centro: um título de duas linhas tem o topo mais alto
  const aria = gradeAriaLer(scroller, evs);   // grade com linhas/células de verdade (Wijmo do Onvio: wj-row / wj-cell, role=row)
  if (aria) return aria;
  const topo = centroY(evs[0]);
  const cab = evs.filter(x => Math.abs(centroY(x) - topo) < 14).sort((a, b) => gradeRect(a).left - gradeRect(b).left);
  if (cab.length < 2) return null;
  // a caixa de cada coluna: o maior bloco acima do título que ainda não alcança o título vizinho
  const caixaDe = (x, vizinhos) => {
    let el = x, box = gradeRect(x);
    for (let p = x.parentElement; p && p !== scroller; p = p.parentElement) {
      if (vizinhos.some(v => v && p.contains(v)) || gradeRect(p).height > 140) break;
      el = p; box = gradeRect(p);
    }
    return { el, left: box.left, right: box.right };
  };
  const colunas = cab.map((x, i) => ({ titulo: (x.textContent || '').trim(), ...caixaDe(x, [cab[i - 1], cab[i + 1]]) }));
  const nomeTit = folhas.find(x => /^(nome|empregad|funcionari)/.test(norm(x.textContent).toLowerCase()) && x.textContent.trim().length < 25 && gradeRect(x).left < gradeRect(cab[0]).left);
  const nomeCol = nomeTit ? caixaDe(nomeTit, [cab[0]]) : null;
  let caixas = [...scroller.querySelectorAll('input[type=checkbox], [role=checkbox], mat-checkbox, [class*=checkbox]')].filter(c => centroY(c) - topo > 14 && gradeRect(c).height > 0 && gradeRect(c).height < 60).sort((x, y) => centroY(x) - centroY(y));   // sem a caixa do cabeçalho
  if (!caixas.length) {   // sem caixa de marcar: cada nome da coluna Nome, abaixo do cabeçalho, marca uma linha
    const esq = nomeCol ? (x) => gradeCentroX(x) >= nomeCol.left - 2 && gradeCentroX(x) <= nomeCol.right + 2 : (x) => gradeRect(x).right <= gradeRect(cab[0]).left + 4;
    caixas = folhas.filter(x => centroY(x) - topo > 14 && !gradeRotEvento.test(x.textContent) && esq(x)).sort((x, y) => centroY(x) - centroY(y));
  }
  // as linhas pela altura na tela: vale para linhas em bloco e para grade de células soltas lado a lado (CSS grid, sem bloco por linha)
  const ys = caixas.map(centroY);
  const linhas = [];
  caixas.forEach((cb, i) => {
    const y = ys[i];
    if (linhas.length && Math.abs(linhas[linhas.length - 1].y - y) < 6) return;   // a mesma linha
    const h = Math.min(140, Math.max(20, ys[i + 1] != null ? ys[i + 1] - y : (ys[i - 1] != null ? y - ys[i - 1] : 50)));
    linhas.push({ y, h, els: () => [...scroller.querySelectorAll('*')].filter(e => { const r = gradeRect(e); return r.height > 0 && r.height < h * 1.4 && Math.abs((r.top + r.bottom) / 2 - y) < h / 2; }) });
  });
  const nomeDe = (row) => {
    const fl = row.els().filter(x => !x.children.length && (x.textContent || '').trim());
    const na = nomeCol ? fl.filter(x => gradeCentroX(x) >= nomeCol.left - 2 && gradeCentroX(x) <= nomeCol.right + 2) : fl;
    return ((na[0] || fl[0])?.textContent || '').trim();
  };
  const campos = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, [contenteditable=true]';
  const celula = (row, j) => {
    const c = colunas[j], cx = (c.left + c.right) / 2, els = row.els();
    const campo = els.find(i => i.matches?.(campos) && (() => { const r = gradeRect(i); return r.width > 0 && cx >= r.left - 2 && cx <= r.right + 2; })());
    if (campo) return { campo };
    const blocos = els.filter(e => { const r = gradeRect(e); return r.width > 0 && r.height >= 16 && cx >= r.left && cx <= r.right && r.width <= (c.right - c.left) + 6; });
    return { bloco: blocos.sort((x, y) => gradeRect(y).width * gradeRect(y).height - gradeRect(x).width * gradeRect(x).height)[0] || null };
  };
  return { titulos: colunas.map(c => c.titulo), linhas, empregados: linhas.map(nomeDe), celula };
}

/** Acha o campo de uma célula; sem campo, clica na célula (duas vezes) para o portal abrir o editor. */
async function gradeCampoDaCelula(cel) {
  if (cel.campo) return cel.campo;
  const b = cel.bloco; if (!b) return null;
  b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  const doBloco = () => b.querySelector('input:not([type=checkbox]), textarea, [contenteditable=true]');
  const antes = document.activeElement;   // o campo que já estava em foco (de outra célula) não conta
  // a planilha do portal acha a célula pela posição do mouse: os eventos levam as coordenadas do centro da célula
  const r = gradeRect(b), pos = { clientX: Math.round((r.left + r.right) / 2), clientY: Math.round((r.top + r.bottom) / 2), screenX: Math.round((r.left + r.right) / 2), screenY: Math.round((r.top + r.bottom) / 2) };
  for (const tipo of ['click', 'dblclick']) {
    const seq = tipo === 'click' ? ['mousedown', 'mouseup', 'click'] : ['mousedown', 'mouseup', 'click', 'mousedown', 'mouseup', 'click', 'dblclick'];
    for (const t of seq) b.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, button: 0, detail: t === 'dblclick' ? 2 : 1, ...pos }));
    await sleep(120);
    const ativo = document.activeElement;
    const novo = ativo && ativo !== antes && ativo.matches?.('input, textarea, [contenteditable=true]') && gradeAmpla.scroller?.contains(ativo) ? ativo : null;
    const campo = doBloco() || novo;
    if (campo) return campo;
  }
  return null;
}

/** Só etiquetas, classes e contagens (nenhum texto da tela): para calibrar a grade do portal real pelo diagnóstico. */
function gradeEstrutura() {
  const sc = gradeAmpla.scroller; if (!sc) return '';
  const d = (el) => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}`;
  const ramo = (de) => { const t = []; for (let e = de; e && e !== sc.parentElement; e = e.parentElement) t.unshift(`${d(e)}(${e.children.length})`); return t.join('>'); };
  const folhas = [...sc.querySelectorAll('*')].filter(x => !x.children.length && (x.textContent || '').trim());
  const ev = folhas.find(x => gradeRotEvento.test(x.textContent));
  const cbs = [...sc.querySelectorAll('input[type=checkbox], [role=checkbox]')];
  const campos = sc.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, [contenteditable=true]');
  const g = gradeDivLer(sc);
  const filhos = g?.linhas[0] ? `${g.linhas[0].els().length} elementos na faixa da linha (${[...new Set(g.linhas[0].els().map(d))].slice(0, 8).join(',')})` : '';
  return [`rolagem=${d(sc)} pai=${d(sc.parentElement)}`, ev ? `título=${ramo(ev)}` : 'sem título de evento', cbs[1] ? `linha=${ramo(cbs[1])}` : 'sem caixas de marcar',
    `leitura por linhas: ${gradeAriaInfo || '-'}${typeof gradeAddInfo === 'string' && gradeAddInfo ? ` | após adicionar: ${gradeAddInfo}` : ''}`, `linhas[role=row]=${sc.querySelectorAll('[role=row]').length} celulas[role]=${[...new Set([...sc.querySelectorAll('[role]')].map(x => x.getAttribute('role')))].slice(0, 8).join(',')}`, `caixas=${cbs.length} campos=${campos.length}${campos[0] ? ` (${d(campos[0])} type=${campos[0].getAttribute('type') || '-'})` : ''}`,
    g ? `lido: ${g.titulos.length} colunas, ${g.linhas.length} linhas; ${filhos}` : `leitura por posição: não leu (${gradeEventosEm(sc)} títulos de evento, ${cbs.length} caixas de marcar)`].join(' | ').slice(0, 1400);
}

/** Entradas do formulário fora da grade (nomes de atributos, nunca valores): para achar o campo da competência. */
function gradeEntradas() {
  const sc = gradeAmpla.scroller;
  return [...mainEl().querySelectorAll('input:not([type=hidden]):not([type=file]), textarea, select')].filter(e => !sc?.contains(e) && !e.closest('app-help-menu')).slice(0, 16).map(e => {
    const at = (n) => (e.getAttribute(n) ? `${n}=${String(e.getAttribute(n)).slice(0, 28)}` : '');
    const estado = [e.disabled ? 'desligado' : '', e.readOnly ? 'só-leitura' : '', e.checked ? 'marcado' : '', ...[...e.classList].filter(c => /^ng-(valid|invalid|touched|dirty)$/.test(c)).map(c => c.slice(3)), e.value ? `valor=${e.value.length}car` : ''].filter(Boolean).join(',');
    return `${e.tagName.toLowerCase()}${[at('type'), at('formcontrolname'), at('name'), at('id'), at('placeholder'), at('aria-label')].filter(Boolean).map(x => ' ' + x).join('')}${estado ? ` {${estado}}` : ''} pai=${e.parentElement?.tagName.toLowerCase()}${typeof e.parentElement?.className === 'string' && e.parentElement.className.trim() ? '.' + e.parentElement.className.trim().split(/\s+/)[0] : ''}`;
  }).join(' ; ').slice(0, 2000);
}

/* ============ Grade virtualizada (Wijmo): rolar para ver tudo ============ */
/* A planilha do portal só desenha o que cabe na tela (linhas e colunas). Para ler todos os funcionários e todas as rubricas, rola a
   grade (nomes pela rolagem vertical, rubricas pela horizontal) e junta o que foi aparecendo. Só rolagem: nada é clicado nem escrito. */
let gradeMapa = { empregados: [], eventos: [] };   // a lista completa, na ordem da grade (só na memória)

/** O elemento que realmente rola (o da grade ou um de dentro dele). */
function gradeRolante(sc) {
  const rola = (e) => { const cs = getComputedStyle(e); return (e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(cs.overflowY)) || (e.scrollWidth > e.clientWidth + 2 && /(auto|scroll)/.test(cs.overflowX)); };
  const c = [sc, ...sc.querySelectorAll('*')].filter(rola);
  return c.sort((a, b) => b.scrollWidth * b.scrollHeight - a.scrollWidth * a.scrollHeight)[0] || null;
}
const gradeUnir = (lista, novos) => { const vistos = new Set(lista.map(x => norm(x))); for (const n of novos) { const k = norm(n); if (n && !vistos.has(k)) { vistos.add(k); lista.push(n); } } };

async function gradeLerTudo() {
  // 1) pela própria planilha do portal (todas as linhas e colunas, sem rolar)
  const api = await pedirGrade('ler');
  gradeApiInfo = api ? { achou: !!api.achou, semGrade: !!api.semGrade, colunas: api.colunas, linhas: api.linhas, colunaDoNome: api.colunaDoNome, chaves: api.chaves, erro: api.erro } : { ajudante: false };
  if (api?.ok && api.empregados.length) {
    gradeMapa = { empregados: [...api.empregados], eventos: [...api.titulos] };
    return { titulos: api.titulos, empregados: api.empregados, fonte: 'planilha do portal' };
  }
  // 2) pela tela, rolando
  atualizarGrade();
  const sc = gradeAmpla.scroller; const g0 = sc && gradeDivLer(sc);
  if (!g0) return { titulos: [], empregados: [], fonte: '' };
  const rol = gradeRolante(sc);
  const empregados = [], titulos = [];
  gradeUnir(empregados, g0.empregados); gradeUnir(titulos, g0.titulos);
  if (rol) {
    const ant = { x: rol.scrollLeft, y: rol.scrollTop };
    const passo = (tam) => Math.max(40, Math.floor(tam * 0.6));
    // funcionários: de cima para baixo, na borda esquerda (a coluna do nome fica fixa)
    rol.scrollTo(0, 0); await sleep(150);
    for (let y = 0, n = 0; n < 200; n++) {
      const g = gradeDivLer(sc); if (g) gradeUnir(empregados, g.empregados);
      const max = rol.scrollHeight - rol.clientHeight; if (y >= max - 1) break;
      y = Math.min(max, y + passo(rol.clientHeight)); rol.scrollTo(rol.scrollLeft, y); await sleep(130);
    }
    // rubricas: da esquerda para a direita, no alto (o cabeçalho fica fixo)
    rol.scrollTo(0, 0); await sleep(150);
    for (let x = 0, n = 0; n < 200; n++) {
      const g = gradeDivLer(sc); if (g) gradeUnir(titulos, g.titulos);
      const max = rol.scrollWidth - rol.clientWidth; if (x >= max - 1) break;
      x = Math.min(max, x + passo(rol.clientWidth)); rol.scrollTo(x, 0); await sleep(130);
    }
    rol.scrollTo(ant.x, ant.y); await sleep(100);
  }
  gradeMapa = { empregados: [...empregados], eventos: [...titulos] };
  return { titulos, empregados, fonte: 'tela (rolando)' };
}

/** Rola a grade até a linha e a coluna aparecerem (sem clicar). Devolve se achou as duas. */
async function gradeIrPara(empregado, evento) {
  const sc = gradeAmpla.scroller; if (!sc) return false;
  const rol = gradeRolante(sc);
  const tem = () => { const g = gradeDivLer(sc); return g && g.empregados.some(e => norm(e) === norm(empregado)) && g.titulos.some(t => norm(t) === norm(evento)); };
  if (tem() || !rol) return !!tem();
  const alvoI = gradeMapa.empregados.findIndex(e => norm(e) === norm(empregado)), alvoJ = gradeMapa.eventos.findIndex(t => norm(t) === norm(evento));
  for (let n = 0; n < 80; n++) {
    const g = gradeDivLer(sc); if (!g) { await sleep(100); continue; }
    const vi = g.empregados.some(e => norm(e) === norm(empregado)), vj = g.titulos.some(t => norm(t) === norm(evento));
    if (vi && vj) return true;
    if (!vi) {   // para que lado está a linha: compara a posição dela com a da primeira linha visível
      const primeira = gradeMapa.empregados.findIndex(e => norm(e) === norm(g.empregados[0]));
      const dir = alvoI >= 0 && primeira >= 0 ? Math.sign(alvoI - primeira) || 1 : 1;
      rol.scrollTo(rol.scrollLeft, Math.max(0, rol.scrollTop + dir * Math.max(40, rol.clientHeight * 0.5)));
    }
    if (!vj) {
      const primeira = gradeMapa.eventos.findIndex(t => norm(t) === norm(g.titulos[0]));
      const dir = alvoJ >= 0 && primeira >= 0 ? Math.sign(alvoJ - primeira) || 1 : 1;
      rol.scrollTo(Math.max(0, rol.scrollLeft + dir * Math.max(40, rol.clientWidth * 0.5)), rol.scrollTop);
    }
    await sleep(130);
  }
  return !!tem();
}

/* ============ Planilha do portal pelo objeto dela (ajudante content/pagina-grade.js, mundo da página) ============ */
const gradeEspera = new Map(); let gradeSeq = 0, gradeSemAjudanteAte = 0;
let gradeAjudante = false;
let gradeApiInfo = null;   // o que o ajudante achou (só contagens e nomes de propriedades), para o diagnóstico
document.addEventListener('ct-grade-resposta', (e) => {
  let d; try { d = JSON.parse(e.detail); } catch { return; }
  const f = gradeEspera.get(d.id); if (f) { gradeEspera.delete(d.id); f(d); }
});
function pedirUma(op, dados, ms) {
  return new Promise((res) => {
    const id = `g${++gradeSeq}`;
    const t = setTimeout(() => { gradeEspera.delete(id); res(null); }, ms);
    gradeEspera.set(id, (d) => { clearTimeout(t); res(d); });
    document.dispatchEvent(new CustomEvent('ct-grade-pedido', { detail: JSON.stringify({ ...dados, op, id }) }));
  });
}
/** Pede ao ajudante da página; null se ele não responde (aba antiga, sem o ajudante) — aí vale a leitura e a digitação pela tela. */
async function pedirGrade(op, dados = {}, ms = 5000) {
  if (Date.now() < gradeSemAjudanteAte) return null;
  if (!gradeAjudante) {   // ele está aí? (resposta rápida; a operação em si pode demorar mais)
    gradeAjudante = !!(await pedirUma('ping', {}, 1500));
    if (!gradeAjudante) { gradeSemAjudanteAte = Date.now() + 30000; return null; }
  }
  return pedirUma(op, dados, ms);
}
