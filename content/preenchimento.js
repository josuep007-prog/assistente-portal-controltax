/* Assistente do Portal do Cliente — conteúdo: Preenchimento dos campos, anexos e aviso de campo não encontrado.
 * Parte de content/ (dividido na 2.17.0; mapa em docs/arquitetura.md). Script comum: compartilha o escopo do mundo isolado
 * com os outros arquivos de content/ (a ordem de carga está no manifest e no simulador). */
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
