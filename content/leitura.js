/* Assistente do Portal do Cliente — conteúdo: Leitura da tela e revelar campos em etapas/abas.
 * Parte de content/ (dividido na 2.17.0; mapa em docs/arquitetura.md). Script comum: compartilha o escopo do mundo isolado
 * com os outros arquivos de content/ (a ordem de carga está no manifest e no simulador). */
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
  post({ type: 'context', route: r, tipo, empresa, versao: VERSAO, modo, form: r.mode === 'form' ? snapshot(tipo) : null, grade: gradeInfo() });
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
