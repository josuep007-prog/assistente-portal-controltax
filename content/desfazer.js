/* Assistente do Portal do Cliente — conteúdo: Grade de rubricas e desfazer o último preenchimento.
 * Parte de content/ (dividido na 2.17.0; mapa em docs/arquitetura.md). Script comum: compartilha o escopo do mundo isolado
 * com os outros arquivos de content/ (a ordem de carga está no manifest e no simulador). */
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
