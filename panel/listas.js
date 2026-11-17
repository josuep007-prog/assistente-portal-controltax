/* Listas de opções no tema da extensão (2.54).
   O Chrome desenha a lista do <datalist> sempre clara e no estilo do sistema, fora do tema. Aqui, todo <input list="…">
   do painel ganha uma lista própria: abre ao clicar no campo, ao digitar (filtra) ou com ↓; ↑/↓ escolhem, Enter usa,
   Esc fecha. As opções continuam vindo do <datalist> da tela (quem monta o campo não muda nada). Ao escolher, o campo
   recebe o valor e os eventos `input` e `change`, como se o cliente tivesse digitado. Nada é guardado. */

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MAX = 300;   // opções desenhadas de uma vez (listas de funcionários e cargos cabem; o resto aparece ao digitar)

let pop = null, alvo = null, itens = [], ativo = -1, quer = false;

function opcoesDe(inp) {
  const id = inp.dataset.lista || inp.getAttribute('list');
  const dl = id ? document.getElementById(id) : null;
  return dl ? [...dl.querySelectorAll('option')].map(o => o.value).filter(Boolean) : [];
}

function fechar() {
  if (pop) { pop.remove(); pop = null; }
  if (alvo) { alvo.setAttribute('aria-expanded', 'false'); alvo.removeAttribute('aria-activedescendant'); }
  itens = []; ativo = -1;
}

function posicionar() {
  if (!pop || !alvo) return;
  const r = alvo.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) { fechar(); return; }
  const largura = Math.max(r.width, 220);
  const abaixo = innerHeight - r.bottom - 8, acima = r.top - 8;
  const altMax = Math.min(320, Math.max(abaixo, acima));
  pop.style.maxHeight = `${Math.max(120, altMax)}px`;
  pop.style.width = `${Math.min(largura, innerWidth - 16)}px`;
  pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - largura - 8))}px`;
  const h = Math.min(pop.scrollHeight, Math.max(120, altMax));
  if (abaixo >= Math.min(h, 200) || abaixo >= acima) { pop.style.top = `${r.bottom + 4}px`; pop.classList.remove('acima'); }
  else { pop.style.top = `${Math.max(8, r.top - 4 - h)}px`; pop.classList.add('acima'); }
}

function marcar(n, rolar = true) {
  if (!pop) return;
  const els = pop.querySelectorAll('.ctl-op');
  els.forEach((e, i) => e.classList.toggle('on', i === n));
  ativo = n;
  const el = els[n];
  if (el) { alvo.setAttribute('aria-activedescendant', el.id); if (rolar) el.scrollIntoView({ block: 'nearest' }); }
  else alvo.removeAttribute('aria-activedescendant');
}

function escolher(valor) {
  const inp = alvo; if (!inp) return;
  fechar(); quer = false;
  inp.value = valor;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  inp.focus();
}

function desenhar(inp, { todas = false } = {}) {
  const todasOps = opcoesDe(inp);
  if (!todasOps.length) { fechar(); return; }
  const q = norm(inp.value);
  const exato = todasOps.some(o => norm(o) === q);
  // ao abrir pelo clique (ou com o valor já escolhido), mostra a lista toda com o atual marcado; ao digitar, filtra
  let lista = todas || !q || exato ? todasOps : todasOps.filter(o => norm(o).includes(q));
  // quem começa com o que foi digitado vem primeiro
  if (!(todas || !q || exato)) lista = [...lista.filter(o => norm(o).startsWith(q)), ...lista.filter(o => !norm(o).startsWith(q))];
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'ctl-pop';
    pop.id = 'ctl-pop';
    pop.setAttribute('role', 'listbox');
    pop.addEventListener('mousedown', (e) => e.preventDefault());   // não tira o foco do campo
    pop.addEventListener('click', (e) => { const b = e.target.closest('.ctl-op'); if (b) escolher(b.dataset.v); });
    pop.addEventListener('mousemove', (e) => { const b = e.target.closest('.ctl-op'); if (b) { const n = [...pop.querySelectorAll('.ctl-op')].indexOf(b); if (n !== ativo) marcar(n, false); } });
    document.body.appendChild(pop);
  }
  alvo = inp;
  inp.setAttribute('aria-expanded', 'true');
  inp.setAttribute('aria-controls', 'ctl-pop');
  itens = lista.slice(0, MAX);
  const realce = (o) => {
    if (!q || todas || exato) return escH(o);
    const i = norm(o).indexOf(q);
    return i < 0 ? escH(o) : `${escH(o.slice(0, i))}<mark>${escH(o.slice(i, i + q.length))}</mark>${escH(o.slice(i + q.length))}`;
  };
  pop.innerHTML = itens.length
    ? itens.map((o, n) => `<div class="ctl-op${norm(o) === q ? ' atual' : ''}" role="option" id="ctl-op-${n}" data-v="${escH(o)}" aria-selected="${norm(o) === q}">${realce(o)}</div>`).join('')
      + (lista.length > MAX ? `<div class="ctl-mais">Mais ${lista.length - MAX} opções: digite para filtrar.</div>` : '')
    : '<div class="ctl-vazio">Nenhuma opção com esse texto.</div>';
  posicionar();
  const atual = itens.findIndex(o => norm(o) === q);
  marcar(atual >= 0 ? atual : (q && !todas ? 0 : -1));
}

export function ligarListas(raiz = document) {
  // o campo deixa de usar a lista do Chrome (fica em data-lista) assim que recebe o foco ou o ponteiro
  const preparar = (inp) => {
    if (!(inp instanceof HTMLInputElement)) return false;
    const id = inp.getAttribute('list');
    if (id) { inp.dataset.lista = id; inp.removeAttribute('list'); inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false'); }
    return !!inp.dataset.lista;
  };
  raiz.addEventListener('pointerdown', (e) => {
    const inp = e.target.closest?.('input');
    if (inp && preparar(inp)) { quer = true; if (pop && alvo === inp) { fechar(); quer = false; return; } setTimeout(() => { if (document.activeElement === inp) desenhar(inp, { todas: true }); }, 0); }
  }, true);
  raiz.addEventListener('focusin', (e) => { preparar(e.target); }, true);
  raiz.addEventListener('keydown', (e) => {
    const inp = e.target;
    if (!(inp instanceof HTMLInputElement) || !preparar(inp)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!pop || alvo !== inp) { desenhar(inp, { todas: true }); return; }
      const n = itens.length; if (!n) return;
      marcar(e.key === 'ArrowDown' ? (ativo + 1) % n : (ativo <= 0 ? n - 1 : ativo - 1));
    } else if (e.key === 'Enter' && pop && alvo === inp && ativo >= 0 && itens[ativo] != null) {
      e.preventDefault(); e.stopPropagation(); escolher(itens[ativo]);
    } else if (e.key === 'Escape' && pop && alvo === inp) {
      e.preventDefault(); e.stopPropagation(); fechar();
    } else if (e.key === 'Tab') fechar();
    else if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') quer = true;   // digitando de verdade
  }, true);
  raiz.addEventListener('input', (e) => {
    const inp = e.target;
    if (!(inp instanceof HTMLInputElement) || !inp.dataset.lista || !e.isTrusted) return;   // o próprio "escolher" não reabre
    if (pop && alvo === inp) desenhar(inp);
    else if (quer && document.activeElement === inp) desenhar(inp);
    quer = false;
  }, true);
  raiz.addEventListener('focusout', (e) => { if (e.target === alvo) setTimeout(() => { if (alvo && document.activeElement !== alvo) fechar(); }, 120); }, true);
  addEventListener('resize', () => fechar());
  document.addEventListener('scroll', (e) => { if (pop && !pop.contains(e.target)) posicionar(); }, true);
}

export const fecharLista = fechar;
