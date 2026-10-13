// Motor de regras do Assistente — puro (sem DOM), testável em Node.
// Tudo o que é "conhecimento do escritório" vem do regras.json; aqui só há mecânica.

export const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

export const onlyDigits = (s) => String(s ?? '').replace(/\D+/g, '');

/* ---------------- Datas ---------------- */
export function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = norm(s).match(/^(\d{1,2}) DE ([A-Z]+) DE (\d{4})$/);
  if (m) {
    const meses = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const i = meses.indexOf(m[2]);
    if (i >= 0) return new Date(+m[3], i, +m[1]);
  }
  return null;
}
export const fmtDate = (d) => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';
export const iso = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
export const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
export const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
export const diffDays = (a, b) => Math.round((b - a) / 86400000);
const WD = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const weekday = (d) => WD[d.getDay()];

export function makeCalendar(feriados = []) {
  const set = new Set(feriados);
  const isHoliday = (d) => set.has(iso(d));
  const isBusiness = (d) => d.getDay() !== 0 && d.getDay() !== 6 && !isHoliday(d);
  const addBusinessDays = (d, n) => {
    let r = new Date(d); const step = n >= 0 ? 1 : -1; let left = Math.abs(n);
    while (left > 0) { r = addDays(r, step); if (isBusiness(r)) left--; }
    return r;
  };
  const businessDaysBetween = (a, b) => {
    if (!a || !b) return 0;
    let n = 0, d = new Date(a); const sign = b >= a ? 1 : -1;
    while ((sign > 0 && d < b) || (sign < 0 && d > b)) { d = addDays(d, sign); if (isBusiness(d)) n += sign; }
    return n;
  };
  const nextBusiness = (d) => { let r = addDays(d, 1); while (!isBusiness(r)) r = addDays(r, 1); return r; };
  return { isHoliday, isBusiness, addBusinessDays, businessDaysBetween, nextBusiness };
}

/* ---------------- Validadores ---------------- */
export function validCPF(v) {
  const c = onlyDigits(v);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (len) => { let s = 0; for (let i = 0; i < len; i++) s += +c[i] * (len + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +c[9] && dv(10) === +c[10];
}
export function validPIS(v) {
  const p = onlyDigits(v);
  if (p.length !== 11 || /^(\d)\1+$/.test(p)) return false;
  const w = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0;
  for (let i = 0; i < 10; i++) s += +p[i] * w[i];
  let r = 11 - (s % 11); if (r >= 10) r = 0;
  return r === +p[10];
}
export const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
export const fmtCPF = (v) => { const c = onlyDigits(v); return c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : v; };
export const fmtCEP = (v) => { const c = onlyDigits(v); return c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : v; };

/* ---------------- Similaridade de nomes ---------------- */
function lev(a, b) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
export function similarity(a, b) {
  const A = norm(a), B = norm(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const ta = A.split(' ').filter(t => t.length > 1), tb = B.split(' ').filter(t => t.length > 1);
  const common = ta.filter(t => tb.includes(t)).length;
  const tokenScore = common / Math.max(ta.length, tb.length);
  const levScore = 1 - lev(A, B) / Math.max(A.length, B.length);
  const contains = Math.min(A.length, B.length) >= 4 && (A.includes(B) || B.includes(A)) ? 0.9 : 0;
  return Math.max(tokenScore, levScore, contains);
}
export function bestMatch(value, options, min = 0.72) {
  let best = null, score = 0;
  for (const o of options || []) { const s = similarity(value, o); if (s > score) { score = s; best = o; } }
  return score >= min ? { option: best, score } : null;
}
/** Procura no texto qual funcionário da lista aparece (nome completo ou quase). */
export function findEmployeeInText(text, employees) {
  const T = ' ' + norm(text) + ' ';
  let best = null;
  for (const e of employees || []) {
    const E = norm(e); if (!E) continue;
    if (T.includes(' ' + E + ' ')) return { option: e, score: 1 };
    const toks = E.split(' ').filter(t => t.length > 2);
    const hit = toks.filter(t => T.includes(' ' + t + ' ')).length;
    const s = toks.length ? hit / toks.length : 0;
    if (toks.length >= 2 && s >= 0.66 && (!best || s > best.score)) best = { option: e, score: s * 0.95 };
  }
  if (best) return best;
  // só o primeiro nome ("o Jorge pediu demissão"): vale se for único na lista
  const firsts = (employees || []).filter(e => { const f = norm(e).split(' ')[0]; return f.length > 2 && T.includes(' ' + f + ' '); });
  return firsts.length === 1 ? { option: firsts[0], score: 0.7 } : null;
}

/** Funcionários cujo primeiro nome aparece no texto (para perguntar quando há mais de um). */
export function employeeCandidates(text, employees) {
  const T = ' ' + norm(text) + ' ';
  return (employees || []).filter(e => { const f = norm(e).split(' ')[0]; return f.length > 2 && T.includes(' ' + f + ' '); });
}

/* ---------------- Documentos ---------------- */
export function classifyDocument(text, rules) {
  const T = norm(text);
  const out = [];
  for (const d of rules.documentos || []) {
    let hits = 0; const found = [];
    for (const p of d.palavras || []) { const P = norm(p); if (P && (' ' + T + ' ').includes(' ' + P + ' ')) { hits++; found.push(p); } }
    let strong = 0; for (const f of d.forte || []) if (T.includes(norm(f))) strong++;
    if (hits >= (d.minPalavras || 1) || strong) {
      const score = Math.min(1, (hits / Math.max(3, (d.palavras || []).length * 0.6)) + strong * 0.5);
      out.push({ id: d.id, nome: d.nome, tipoSolicitacao: d.tipoSolicitacao, score, found });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Extração genérica "Rótulo: valor" usando os sinônimos dos campos.
 *  O valor vai até: 2+ espaços, " | ", fim da linha ou o início de outro rótulo conhecido ("… Bairro: …"). */
export function extractByLabels(text, campos) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const escRx = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const allSyns = [...new Set(Object.values(campos || {}).flatMap(d => d.sinonimos || []))].sort((a, b) => b.length - a.length);
  const nextLabel = allSyns.length ? new RegExp(`\\s+(?:${allSyns.map(escRx).join('|')})\\s*[:\\-–]\\s`, 'i') : null;
  const out = {};
  for (const [key, def] of Object.entries(campos || {})) {
    const syns = (def.sinonimos || []).slice().sort((a, b) => b.length - a.length);
    for (const syn of syns) {
      const re = new RegExp(`(?:^|\\s|\\|)${escRx(syn)}\\s*[:\\-–]\\s*(.{1,160}?)(?=\\s{2,}|\\s\\|\\s|$)`, 'i');
      for (const l of lines) {
        const m = l.match(re);
        if (!m || !m[1]) continue;
        let v = m[1].trim();
        if (nextLabel) { const cut = (' ' + v).search(nextLabel); if (cut > 0) v = v.slice(0, cut - 1).trim(); }
        v = v.replace(/[;,]$/, '').trim();
        if (v) { out[key] = { valor: v, fonte: syn, conf: 0.75 }; break; }
      }
      if (out[key]) break;
    }
  }
  return out;
}

const RX = {
  cpf: /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g,
  pis: /\b(\d{3}\.?\d{5}\.?\d{2}-?\d)\b/g,
  cep: /\b(\d{5}-?\d{3})\b/,
  email: /\b([\w.+-]+@[\w-]+\.[\w.-]+)\b/,
  tel: /(\(?\d{2}\)?\s?9?\d{4}-?\d{4})/,
  data: /\b(\d{2}\/\d{2}\/\d{4})\b/g
};

export function extractGeneric(text) {
  const out = {};
  const cpfs = [...String(text).matchAll(RX.cpf)].map(m => m[1]).filter(validCPF);
  if (cpfs.length) out.cpf = { valor: fmtCPF(cpfs[0]), conf: 0.95, fonte: 'CPF válido no texto' };
  const pis = [...String(text).matchAll(RX.pis)].map(m => m[1]).filter(p => validPIS(p) && !cpfs.some(c => onlyDigits(c) === onlyDigits(p)));
  if (pis.length) out.pis = { valor: pis[0], conf: 0.8, fonte: 'PIS válido no texto' };
  const cep = String(text).match(RX.cep); if (cep) out.cep = { valor: fmtCEP(cep[1]), conf: 0.6, fonte: 'CEP no texto' };
  const em = String(text).match(RX.email); if (em) out.email = { valor: em[1], conf: 0.8, fonte: 'e-mail no texto' };
  return out;
}

function runPatterns(text, patterns) {
  for (const p of patterns || []) {
    try { const m = String(text).match(new RegExp(p, 'i')); if (m) return (m[1] ?? m[0]).trim(); } catch { /* regex inválida nas regras */ }
  }
  return null;
}

/**
 * Lê um texto e devolve: documento provável, tipo de solicitação sugerido e campos.
 * ctx = { employees: [...], tipoAtual: 'afastamento' | null }
 */
export function analyzeText(text, rules, ctx = {}) {
  const docs = classifyDocument(text, rules);
  const doc = docs[0] || null;
  const docRule = doc ? rules.documentos.find(d => d.id === doc.id) : null;
  let tipoKey = ctx.tipoAtual || doc?.tipoSolicitacao || null;
  if (!ctx.tipoAtual && doc?.id === 'atestado') tipoKey = rules.config?.atestadoAte15DiasVaiPara || 'afastamento';
  const tipo = tipoKey ? resolveTipo(rules, tipoKey) : null;
  const campos = {};
  const put = (k, v, conf, fonte) => { if (v == null || v === '') return; if (!campos[k] || campos[k].conf < conf) campos[k] = { valor: v, conf, fonte }; };

  if (tipo) for (const [k, v] of Object.entries(extractByLabels(text, tipo.campos))) put(k, v.valor, v.conf, v.fonte);
  for (const [k, v] of Object.entries(extractGeneric(text))) if (!tipo || tipo.campos[k]) put(k, v.valor, v.conf, v.fonte);
  if (docRule?.extrair) for (const [k, pats] of Object.entries(docRule.extrair)) { const v = runPatterns(text, pats); if (v) put(k, v, 0.7, docRule.nome); }
  if (docRule?.valores) for (const [k, v] of Object.entries(docRule.valores)) if (!k.startsWith('tipoAfastamentoSe') && !(k === 'tipoAfastamento' && tipo?.tipoAfastamentoAuto)) put(k, v, 0.65, docRule.nome);
  if (docRule?.tipoCatPalavras) {
    const T = norm(text);
    for (const [val, words] of Object.entries(docRule.tipoCatPalavras)) if (words.some(w => T.includes(norm(w)))) { put('tipoCat', val, 0.6, docRule.nome); break; }
  }
  // comprovante de endereço (ou qualquer documento com endereço) para cadastros
  if (tipo?.campos?.cep && (doc?.id === 'comprovanteEndereco' || !campos.endereco)) {
    for (const [k, v] of Object.entries(extractAddress(text))) if (tipo.campos[k]) put(k, v, doc?.id === 'comprovanteEndereco' ? 0.7 : 0.45, 'endereço no documento');
  }
  // datas extraídas: normaliza
  for (const [k, c] of Object.entries(campos)) {
    const def = tipo?.campos?.[k];
    if (def?.tipo === 'data') { const d = parseDate(c.valor); if (d) c.valor = fmtDate(d); else delete campos[k]; }
    if (def?.tipo === 'numero') { const n = parseInt(onlyDigits(c.valor), 10); if (isNaN(n)) delete campos[k]; else c.valor = String(n); }
    if (def?.tipo === 'cpf' && c.valor) c.valor = fmtCPF(c.valor);
  }
  // afastamento: o tipo do portal sai do conteúdo do documento e da quantidade de dias
  if (tipo?.campos?.tipoAfastamento && tipo.tipoAfastamentoAuto) {
    const ta = inferTipoAfastamento(text, campos.dias?.valor, doc?.id, tipo.tipoAfastamentoAuto);
    if (ta) put('tipoAfastamento', ta.valor, 0.7, ta.motivo);
  }
  // funcionário
  if (tipo?.campos?.empregado && ctx.employees?.length) {
    const m = findEmployeeInText(text, ctx.employees);
    if (m) put('empregado', m.option, m.score, 'nome encontrado no documento');
  }
  if (tipo?.campos?.nome && !campos.nome) {
    const m = String(text).match(/(?:nome|paciente|portador|titular)\s*[:\-]?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s]{8,60})(?:\n|\s{2,}|$)/);
    if (m) put('nome', m[1].trim(), 0.5, 'nome em maiúsculas');
  }
  return { documento: doc, alternativas: docs.slice(1, 4), tipoSugerido: tipoKey, campos };
}

/* ---------------- Tipos e campos ---------------- */
export function resolveTipo(rules, key) {
  const t = rules.tipos?.[key];
  if (!t) return null;
  if (!t.herdaCamposDe) return t;
  const base = rules.tipos[t.herdaCamposDe];
  return { ...t, campos: { ...(base?.campos || {}), ...t.campos } };
}
export const tipoBySlug = (rules, slug) => Object.entries(rules.tipos || {}).find(([, t]) => t.slug === slug)?.[0] || null;

const matchCond = (cond, values) => {
  if (!cond) return true;
  const v = norm(values[cond.campo]);
  if (cond.contem) return cond.contem.some(c => v.includes(norm(c)));
  if (cond.igual != null) return v === norm(cond.igual);
  if (cond.preenchido) return !!v;
  return true;
};

export function activeConditionals(tipo, values) {
  return (tipo.condicionais || []).filter(c => matchCond(c.se, values));
}

/* ---------------- Valores derivados ---------------- */
export function derived(tipoKey, values, rules) {
  const cal = makeCalendar(rules.feriados);
  const out = {};
  const ini = parseDate(values.inicioGozo), dias = +values.diasGozo || 0;
  if (ini && dias) {
    out.fimGozo = fmtDate(addDays(ini, dias - 1));
    out.retorno = fmtDate(addDays(ini, dias));
    out.pagamentoAte = fmtDate(addDays(ini, -2));
    out.avisoAte = fmtDate(addDays(ini, -30));
  }
  const afa = parseDate(values.dataAfastamento), diasAfa = +values.dias || 0;
  if (diasAfa) out.diasTexto = diasAfa === 1 ? '1 dia' : `${diasAfa} dias`;
  if (afa && diasAfa) { out.dataRetorno = fmtDate(addDays(afa, diasAfa)); if (diasAfa > 15) out.inicioInss = fmtDate(addDays(afa, 15)); }
  const dem = parseDate(values.dataDemissao);
  if (dem) out.pagamentoAte = fmtDate(addDays(dem, 10));
  const anos = +values.anosEmpresa;
  if (!isNaN(anos) && values.anosEmpresa !== '' && values.anosEmpresa != null) out.diasAviso = String(Math.min(90, 30 + 3 * Math.max(0, Math.floor(anos))));
  const tipo = resolveTipo(rules, tipoKey);
  if (tipo?.complexidade) out.diasUteis = String(rules.config?.prazoInternoDiasUteis?.[tipo.complexidade] ?? '');
  void cal;
  return out;
}

/* ---------------- Modelos de texto ---------------- */
/** Primeiro modelo da lista que sai completo (sem variável faltando). */
export function renderFirst(list, values) {
  for (const tpl of [].concat(list || [])) { const s = renderTemplate(tpl, values); if (s) return s; }
  return '';
}

/**
 * Tipo de afastamento do portal a partir do texto, do documento e dos dias.
 * regras = tipos.afastamento.tipoAfastamentoAuto: lista em ordem de prioridade com
 *   { palavras?, documentos?, valor? | ate15?, acima15?, limiteDias? }
 * Devolve { valor, motivo } ou null (sem dias quando o tipo depende deles).
 */
export function inferTipoAfastamento(text, dias, docId, regras) {
  const T = plain(text || '');
  const n = parseInt(dias, 10);
  for (const r of regras || []) {
    const porPalavra = r.palavras?.length && r.palavras.some(w => T.includes(plain(w)));
    const porDocumento = r.documentos?.length && docId && r.documentos.includes(docId);
    if (!porPalavra && !porDocumento) continue;
    if (r.valor) return { valor: r.valor, motivo: porPalavra ? 'texto do documento' : 'tipo de documento' };
    if (isNaN(n)) return null;
    const lim = r.limiteDias || 15;
    return { valor: n > lim ? r.acima15 : r.ate15, motivo: `${n} ${n === 1 ? 'dia' : 'dias'} no documento` };
  }
  return null;
}

export function renderTemplate(tpl, values) {
  if (!tpl) return '';
  const lines = Array.isArray(tpl) ? tpl : [tpl];
  const out = [];
  for (const line of lines) {
    let missing = false;
    const s = line.replace(/\{(\w+)(?:\|([^}]*))?\}/g, (_, k, fb) => {
      const v = values[k];
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) { if (fb != null) return fb; missing = true; return ''; }
      return Array.isArray(v) ? v.join(', ') : String(v);
    });
    if (!missing && s.trim()) out.push(s);
  }
  return out.join('\n');
}

/* ---------------- Verificações ---------------- */
/**
 * values: { chave: valor } (já mesclados: portal + assistente)
 * anexos: [{ nome, documento }]  (documento = id do tipo de documento reconhecido, se houver)
 * Retorna [{ nivel: 'ok'|'info'|'atencao'|'erro', grupo, mensagem, campo }]
 */
export function runChecks(tipoKey, values, anexos, rules, hoje = today(), portal = {}) {
  const tipo = resolveTipo(rules, tipoKey);
  if (!tipo) return [];
  const cal = makeCalendar(rules.feriados);
  const d = { ...derived(tipoKey, values, rules), ...values };
  const res = [];
  const add = (nivel, grupo, mensagem, campo) => res.push({ nivel, grupo, mensagem: renderTemplate(mensagem, d) || mensagem, campo });
  const conds = activeConditionals(tipo, values);

  // Obrigatórios
  const obrig = new Set(Object.entries(tipo.campos).filter(([, c]) => c.obrigatorio && !c.somenteAssistente).map(([k]) => k));
  conds.forEach(c => (c.obrigatorios || []).forEach(k => obrig.add(k)));
  for (const k of obrig) {
    const c = tipo.campos[k]; if (!c) continue;
    if (portal.ausentes?.includes(k)) continue; // campo não existe nesta tela
    const v = values[k];
    if (v == null || String(v).trim() === '') add('erro', 'Campos obrigatórios', `Falta preencher: ${c.rotulo}`, k);
    else add('ok', 'Campos obrigatórios', `${c.rotulo}`, k);
  }

  // Anexos
  const reqAnexos = (tipo.anexos || []).map(a => ({ ...a }));
  conds.forEach(c => (c.anexos || []).forEach(id => { const a = reqAnexos.find(x => x.id === id); if (a) a.obrigatorio = true; }));
  for (const a of reqAnexos) {
    if (a.excetoQuando && matchCond(a.excetoQuando, values)) continue;
    const has = (anexos || []).some(f => f.documento === a.documento);
    const temAlgum = (anexos || []).length > 0;
    if (has) add('ok', 'Anexos', `${a.rotulo} anexado`);
    else if (a.obrigatorio) add(temAlgum ? 'atencao' : 'erro', 'Anexos', temAlgum ? `Confira se o anexo inclui: ${a.rotulo}` : `Anexe: ${a.rotulo}`);
    else add('info', 'Anexos', `Se tiver, anexe: ${a.rotulo}`);
  }

  // Regras e prazos
  for (const v of tipo.verificacoes || []) {
    if (v.condicao && !matchCond(v.condicao, values)) continue;
    const val = values[v.campo];
    const dt = parseDate(val);
    const nivel = v.nivel || 'atencao';
    const G = 'Prazos e regras';
    switch (v.tipo) {
      case 'info': add(nivel, G, v.mensagem); break;
      case 'antecedenciaMinima':
        if (dt) {
          const ok = v.diasUteis ? cal.businessDaysBetween(hoje, dt) >= v.diasUteis : diffDays(hoje, dt) >= v.dias;
          if (!ok && dt >= hoje) add(nivel, G, v.mensagem, v.campo);
        }
        break;
      case 'dataPassada': if (dt && dt < hoje) add(nivel, G, v.mensagem, v.campo); break;
      case 'dataNaoFutura': if (dt && diffDays(hoje, dt) > (v.dias || 0)) add(nivel, G, v.mensagem, v.campo); break;
      case 'antiguidadeMaxima': if (dt && diffDays(dt, hoje) > v.dias) add(nivel, G, v.mensagem, v.campo); break;
      case 'intervalo':
        if (val !== '' && val != null) { const n = +String(val).replace(',', '.'); if (!isNaN(n) && (n < v.min || n > v.max)) add(nivel, G, v.mensagem, v.campo); }
        break;
      case 'somaMaxima': { const s = v.campos.reduce((a, k) => a + (+values[k] || 0), 0); if (s > v.max) add(nivel, G, v.mensagem, v.campos[0]); break; }
      case 'diasMaiorQue': if (+val > v.valor) add(nivel, G, v.mensagem, v.campo); break;
      case 'inicioFerias':
        if (dt) {
          const proibido = [1, 2].some(n => { const x = addDays(dt, n); return x.getDay() === 0 || cal.isHoliday(x); });
          if (proibido) add(nivel, G, `${v.mensagem} (${fmtDate(dt)} é ${weekday(dt)})`, v.campo);
        }
        break;
      case 'pagamentoAntesDe': {
        const ref = parseDate(values[v.referencia]);
        if (dt && ref && diffDays(dt, ref) < v.dias) add(nivel, G, v.mensagem, v.campo);
        break;
      }
      case 'prazoEscritorio': {
        if (!dt) break;
        const limite = addDays(dt, -(v.menosDias || 0));
        const precisa = rules.config?.prazoInternoDiasUteis?.[v.complexidade] ?? 5;
        if (cal.businessDaysBetween(hoje, limite) < precisa) add(nivel, G, v.mensagem, v.campo);
        break;
      }
      case 'prazoRescisao': {
        if (!dt) break;
        const limite = addDays(dt, v.dias);
        const precisa = rules.config?.prazoInternoDiasUteis?.[v.complexidade] ?? 5;
        if (cal.businessDaysBetween(hoje, limite) < precisa) add(nivel, G, `${v.mensagem} Pagamento até ${fmtDate(limite)}.`, v.campo);
        break;
      }
      case 'prazoCat':
        if (dt && !values.dataCat) add(nivel, G, v.mensagem, 'dataCat');
        else if (dt && parseDate(values.dataCat) > cal.nextBusiness(dt)) add(nivel, G, v.mensagem, 'dataCat');
        break;
      case 'cpf': if (val && !validCPF(val)) add(nivel, G, v.mensagem, v.campo); break;
      case 'pis': if (val && !validPIS(val)) add(nivel, G, v.mensagem, v.campo); break;
      case 'email': if (val && !validEmail(val)) add(nivel, G, v.mensagem, v.campo); break;
      case 'idadeMinima':
        if (dt) { const a = new Date(dt); a.setFullYear(a.getFullYear() + v.anos); if (a > hoje) add(nivel, G, v.mensagem, v.campo); }
        break;
      case 'competenciaRecente': {
        const m = String(val || '').match(/^(\d{2})\/(\d{4})$/);
        if (m) { const c = new Date(+m[2], +m[1] - 1, 1); const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1); if (c < ini || c > fim) add(nivel, G, v.mensagem, v.campo); }
        break;
      }
      case 'diaLimite': {
        const dia = rules.config?.diaLimiteRubricas;
        if (dia && hoje.getDate() > dia) add(nivel, G, v.mensagem.replace('{dia}', dia));
        break;
      }
      case 'abaErrada': {
        const txt = `${values.assunto || ''} ${values.descricao || ''}`;
        const sug = suggestTipoByText(txt, rules, tipoKey);
        if (sug) add('atencao', 'Aba certa', (rules.mensagens?.abaErrada || '').replace('{tipo}', rules.tipos[sug.tipo].nome), null);
        break;
      }
      default: break;
    }
  }
  return res;
}

export function suggestTipoByText(text, rules, atual) {
  const T = ' ' + norm(text) + ' ';
  if (T.trim().length < 4) return null;
  let best = null;
  for (const it of rules.intencoes || []) {
    if (it.tipo === atual || it.tipo === 'geral') continue;
    const hits = (it.palavras || []).filter(p => T.includes(' ' + norm(p) + ' ')).length;
    if (hits && (!best || hits > best.hits)) best = { tipo: it.tipo, hits, intencao: it };
  }
  return best;
}

export function searchIntents(q, rules) {
  const Q = norm(q);
  if (!Q) return rules.intencoes || [];
  return (rules.intencoes || [])
    .map(it => ({ it, s: Math.max(similarity(Q, it.titulo), ...(it.palavras || []).map(p => norm(p).includes(Q) || Q.includes(norm(p)) ? 0.9 : similarity(Q, p) * 0.8)) }))
    .filter(x => x.s > 0.45).sort((a, b) => b.s - a.s).map(x => x.it);
}

export function summarizeChecks(list) {
  const c = { ok: 0, info: 0, atencao: 0, erro: 0 };
  list.forEach(i => c[i.nivel]++);
  return c;
}

/* ================= Texto livre ("descreva com suas palavras") ================= */
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Encontra datas escritas de vários jeitos, na ordem em que aparecem. */
export function findDates(text, hoje = today()) {
  const t = plain(text); const out = [];
  const push = (idx, d) => { if (d && !isNaN(d)) out.push({ idx, d }); };
  for (const m of t.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/g)) {
    let y = m[3] ? +m[3] : hoje.getFullYear(); if (y < 100) y += 2000;
    let d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && d < addDays(hoje, -60)) d = new Date(y + 1, +m[2] - 1, +m[1]);
    if (d.getMonth() === +m[2] - 1) push(m.index, d);
  }
  for (const m of t.matchAll(/\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?/g)) {
    const mi = MESES.indexOf(m[2]); let y = m[3] ? +m[3] : hoje.getFullYear();
    let d = new Date(y, mi, +m[1]); if (!m[3] && d < addDays(hoje, -60)) d = new Date(y + 1, mi, +m[1]);
    push(m.index, d);
  }
  for (const m of t.matchAll(/\b(hoje|amanha|ontem|depois de amanha)\b/g)) push(m.index, addDays(hoje, { hoje: 0, amanha: 1, ontem: -1, 'depois de amanha': 2 }[m[1]]));
  for (const m of t.matchAll(/\b(?:na |nesta |proxima |próxima )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/g)) {
    const alvo = DIAS_SEMANA.indexOf(m[1]); let d = addDays(hoje, 1); while (d.getDay() !== alvo) d = addDays(d, 1); push(m.index, d);
  }
  for (const m of t.matchAll(/\bdia (\d{1,2})\b(?!\s*(?:[\/.-]|de\s+[a-z]))/g)) {
    let d = new Date(hoje.getFullYear(), hoje.getMonth(), +m[1]); if (d < hoje) d = new Date(hoje.getFullYear(), hoje.getMonth() + 1, +m[1]); push(m.index, d);
  }
  const seen = new Set();
  return out.sort((a, b) => a.idx - b.idx).filter(x => { const k = iso(x.d); if (seen.has(k)) return false; seen.add(k); return true; }).map(x => x.d);
}

/** Interpreta um pedido escrito livremente e devolve tipo sugerido + campos. */
export function parseFreeText(text, rules, ctx = {}) {
  const t = plain(text); const hoje = ctx.hoje || today();
  const sug = ctx.tipoAtual ? { tipo: ctx.tipoAtual } : (suggestTipoByText(text, rules, null) || { tipo: 'geral' });
  let tipo = sug.tipo;
  // ajustes de intenção: cálculo x aviso
  if (tipo === 'avisoFerias' && /\b(calcul|recibo|pagar|pagamento)\w*/.test(t)) tipo = 'calculoFerias';
  if (tipo === 'avisoRescisao' && /\b(calcul|verbas|rescisao|trct|homolog)\w*/.test(t) && !/aviso/.test(t)) tipo = 'calculoRescisao';
  const campos = {}; const put = (k, v, conf = 0.6) => { if (v != null && v !== '') campos[k] = { valor: String(v), conf, fonte: 'sua descrição' }; };
  const datas = findDates(text, hoje);
  const diasM = t.match(/(\d{1,3})\s*dias?\b(?!\s*(?:de\s+)?abono)/); const dias = diasM ? +diasM[1] : null;
  const abonoM = t.match(/(?:vender|abono(?:\s+de)?)\s*(\d{1,2})\s*dias?|(\d{1,2})\s*dias?\s*(?:de\s+)?abono/);
  if (ctx.employees?.length) { const m = findEmployeeInText(text, ctx.employees); if (m) put('empregado', m.option, m.score); }
  const d0 = datas[0] ? fmtDate(datas[0]) : null;
  switch (tipo) {
    case 'afastamento': {
      put('dataAfastamento', d0); if (dias) put('dias', dias);
      const auto = resolveTipo(rules, 'afastamento')?.tipoAfastamentoAuto;
      const ta = auto ? inferTipoAfastamento(text, dias, /atestado|medic|doen/.test(t) ? 'atestado' : null, auto) : null;
      if (ta) put('tipoAfastamento', ta.valor);
      break;
    }
    case 'avisoFerias': case 'calculoFerias': {
      put('inicioGozo', d0); if (dias) put('diasGozo', dias);
      if (abonoM) { const n = +(abonoM[1] || abonoM[2]); if (tipo === 'avisoFerias') put('diasAbono', n); else put('abono', 'SIM'); }
      if (tipo === 'calculoFerias' && /13|decimo/.test(t)) put('adiantar13', 'SIM');
      break;
    }
    case 'avisoRescisao': case 'calculoRescisao': {
      let motivo = null, dadoPor = null;
      if (/pediu demissao|pedido de demissao|pedir demissao|quer sair|pediu para sair/.test(t)) { motivo = 'Pedido de demissão SEM justa causa'; dadoPor = 'EMPREGADO'; }
      else if (/\bcom justa causa\b|(?<!sem )\bjusta causa\b/.test(t)) { motivo = 'Demitido COM justa causa'; dadoPor = 'EMPREGADOR'; }
      else if (/sem justa causa|demitir|demissao|dispensar|desligar/.test(t)) { motivo = 'Demitido SEM justa causa'; dadoPor = 'EMPREGADOR'; }
      if (/experiencia/.test(t)) motivo = dadoPor === 'EMPREGADO' ? 'Rescisão contrato experiência antecipado pelo empregado' : 'Rescisão contrato experiência antecipado pelo empregador';
      put('motivo', motivo);
      if (tipo === 'avisoRescisao') { put('avisoDadoPor', dadoPor); put('dataAviso', d0 || fmtDate(hoje), d0 ? 0.6 : 0.4); const anos = t.match(/(\d{1,2})\s*anos?/); if (anos) put('anosEmpresa', anos[1]); }
      else {
        put('dataDemissao', datas[datas.length > 1 ? 1 : 0] ? fmtDate(datas[datas.length > 1 ? 1 : 0]) : null);
        if (datas.length > 1) put('dataAvisoPrevio', d0);
        if (/indenizad/.test(t)) put('tipoAviso', 'INDENIZADO'); else if (/trabalhad/.test(t)) put('tipoAviso', 'TRABALHADO'); else if (/dispensa|ausencia/.test(t)) put('tipoAviso', 'AUSÊNCIA/DISPENSA');
      }
      break;
    }
    case 'rubricas': {
      const comp = t.match(/\b(\d{2})[\/-](\d{4})\b/);
      const mes = MESES.findIndex(m => t.includes(m));
      if (comp) put('competencia', `${comp[1]}/${comp[2]}`);
      else if (mes >= 0) put('competencia', `${String(mes + 1).padStart(2, '0')}/${hoje.getFullYear()}`);
      if (/adiantamento|vale/.test(t)) put('tipoLancamento', 'ADIANTAMENTO'); else if (/\bplr\b|participacao/.test(t)) put('tipoLancamento', 'PLR'); else put('tipoLancamento', 'MENSAL', 0.4);
      break;
    }
    case 'cadastroEmpregado': case 'cadastroEstagiario': case 'cadastroContribuinte': {
      if (d0) put('dataAdmissao', d0);
      const sal = text.match(/R\$\s*([\d.]+,\d{2}|\d+)/); if (sal) put('salario', sal[1]);
      break;
    }
    default: break;
  }
  put('observacoes', String(text).trim(), 0.9);
  return { tipoSugerido: tipo, campos, datas: datas.map(fmtDate) };
}

/* ================= Leituras específicas ================= */
/** Endereço em contas de consumo e comprovantes. */
export function extractAddress(text) {
  const out = {}; const T = String(text || '');
  const cep = T.match(/\b(\d{5})-?(\d{3})\b/);
  if (cep) out.cep = `${cep[1]}-${cep[2]}`;
  const log = T.match(/\b((?:RUA|R\.|AVENIDA|AV\.?|TRAVESSA|TV\.?|ALAMEDA|AL\.?|ESTRADA|RODOVIA|PRA[CÇ]A|LARGO|VIELA)\s+[A-ZÀ-Úa-zà-ú0-9 .'-]{3,60}?)\s*,?\s*(?:N[º°o]?\.?\s*)?(\d{1,6}|S\/?N)\b/i);
  if (log) { out.endereco = log[1].replace(/\s+/g, ' ').trim(); out.numero = log[2].toUpperCase(); }
  const cid = T.match(/([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú ]{2,40})\s*[-\/]\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  if (cid) { out.municipio = cid[1].trim(); out.uf = cid[2]; }
  return out;
}
/** ASO: resultado, tipo de exame e data. */
export function readASO(text) {
  const t = plain(text);
  const resultado = /\binapto\b/.test(t) ? 'INAPTO' : (/\bapto\b/.test(t) ? 'APTO' : null);
  const tipo = ['admissional', 'demissional', 'periodico', 'retorno ao trabalho', 'mudanca de funcao'].find(x => t.includes(x)) || null;
  const datas = findDates(text); const data = datas.length ? fmtDate(datas[datas.length - 1]) : null;
  return { resultado, tipo, data };
}
/** Uma linha que resume o que foi entendido do documento (aparece embaixo do arquivo). */
export function summarizeDocument(analise, text) {
  const id = analise?.documento?.id; const c = analise?.campos || {}; const v = (k) => c[k]?.valor;
  if (id === 'atestado') return [v('empregado'), v('dias') && `${v('dias')} dias`, v('dataAfastamento') && `a partir de ${v('dataAfastamento')}`].filter(Boolean).join(' · ');
  if (id === 'aso') { const a = readASO(text); return ['ASO', a.tipo, a.resultado, a.data].filter(Boolean).join(' · '); }
  if (id === 'cat') return ['CAT', v('numeroCat'), v('dataAfastamento') && `acidente em ${v('dataAfastamento')}`].filter(Boolean).join(' · ');
  if (id === 'pedidoDemissao') return ['Pedido de demissão', v('empregado'), v('dataAviso')].filter(Boolean).join(' · ');
  if (id === 'comprovanteEndereco') { const a = extractAddress(text); return [a.endereco && `${a.endereco}, ${a.numero || ''}`, a.cep].filter(Boolean).join(' · '); }
  if (id === 'fichaAdmissao') return [v('nome'), v('cpf')].filter(Boolean).join(' · ');
  return '';
}
