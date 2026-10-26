// Motor de regras do Assistente — puro (sem DOM), testável em Node.
// Tudo o que é "conhecimento do escritório" vem do regras.json; aqui só há mecânica.

export const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

export const onlyDigits = (s) => String(s ?? '').replace(/\D+/g, '');

/* ---------------- Datas ---------------- */
/** Data só existe se o mês e o dia continuarem os pedidos: o JS rola 30/02 para 02/03 em silêncio. */
export function dataValida(ano, mesIndice, dia) {
  if (!(ano >= 1900 && ano <= 2100) || mesIndice < 0 || mesIndice > 11 || dia < 1 || dia > 31) return null;
  const d = new Date(ano, mesIndice, dia);
  return d.getMonth() === mesIndice && d.getDate() === dia ? d : null;
}
export function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    return dataValida(y, +m[2] - 1, +m[1]);
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return dataValida(+m[1], +m[2] - 1, +m[3]);
  m = norm(s).match(/^(\d{1,2}) DE ([A-Z]+) DE (\d{4})$/);
  if (m) {
    const meses = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const i = meses.indexOf(m[2]);
    if (i >= 0) return dataValida(+m[3], i, +m[1]);
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
export function findEmployeeInText(text, employees, { soPrimeiroNome = true } = {}) {
  const T = ' ' + norm(text) + ' ';
  let best = null; const empates = new Set();
  for (const e of employees || []) {
    const E = norm(e); if (!E) continue;
    if (T.includes(' ' + E + ' ')) return { option: e, score: 1 };
    const toks = E.split(' ').filter(t => t.length > 2);
    const hit = toks.filter(t => T.includes(' ' + t + ' ')).length;
    const s = toks.length ? hit / toks.length : 0;
    if (toks.length >= 2 && s >= 0.66) {
      if (!best || s > best.bruto) { best = { option: e, score: Math.min(0.8, s * 0.95), bruto: s }; empates.clear(); }   // nome incompleto: até 0,8
      else if (s === best.bruto && best.option !== e) empates.add(e);
    }
  }
  // empate (mesmo nome parcial para duas pessoas): quem decide é o cliente, não a ordem da lista
  if (best && empates.size) return { option: null, score: 0, candidatos: [best.option, ...empates] };
  if (best) return best;
  if (!soPrimeiroNome) return null;
  // só o primeiro nome ("o Jorge pediu demissão"): vale se for único na lista, mas o cliente confirma (abaixo do limiar)
  const firsts = (employees || []).filter(e => { const f = norm(e).split(' ')[0]; return f.length > 2 && T.includes(' ' + f + ' '); });
  return firsts.length === 1 ? { option: firsts[0], score: 0.55, soPrimeiroNome: true } : null;
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
      const bruto = (hits / Math.max(3, (d.palavras || []).length * 0.6)) + strong * 0.5;
      // palavras que derrubam a nota (ex.: "TRCT" num aviso de rescisão)
      const contra = (d.negativas || []).filter(x => T.includes(norm(x))).length;
      out.push({ id: d.id, nome: d.nome, tipoSolicitacao: d.tipoSolicitacao, score: Math.min(1, Math.max(0, bruto - contra * 0.5)), bruto: bruto - contra * 0.5, found });
    }
  }
  return out.sort((a, b) => b.bruto - a.bruto);
}

/* ---------------- Leitor: confiança, âncoras e formatos (regras: config.leitor) ---------------- */
/* Precisão acima de tudo: valor com confiança abaixo do limiar não vai ao portal sozinho (vira sugestão de um clique);
   valor sem âncora (1º CPF/CEP/e-mail do texto, "Data:" genérico) fica abaixo do limiar; a qualidade do OCR põe um teto. */
const LEITOR_PADRAO = {
  confiancaMinimaPortal: 0.6, semAncora: 0.5,
  ocrBaixo: 75, ocrTetoBaixo: 0.55, ocrTetoNomes: 85, ocrRuim: 45,
  contextoCpfDescarta: ['registro', 'renach', 'inscri[cç][aã]o', 'pis', 'pasep', 'nis', 'nit', 'cns', 'cart[aã]o sus', 'matr[ií]cula', 'protocolo', 'espelho', 'c[oó]digo', 'c[oô]njuge', 'dependente', 'respons[aá]vel', 'genitor', 'm[aã]e', 'pai', 'cnpj', 'empregador', 'empresa'],
  formatos: {
    cpf: '^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$', cep: '^\\d{5}-?\\d{3}$', pis: '^[\\d.\\-]{11,14}$',
    rg: '^(?:[A-Z]{2}[\\s\\-]?)?(?:\\d{1,2}\\.?\\d{3}\\.?\\d{3}(?:-?[\\dXx])?|\\d{5,14}(?:-?[\\dXx])?)$',
    agencia: '^\\d{3,5}(?:-?[\\dXx])?$', conta: '^\\d{1,13}(?:-?[\\dXx]{1,2})?$',
    telefone: '^\\(?\\d{2}\\)?\\s?\\d{4,5}-?\\d{4}$', numero: '^(?:\\d{1,6}[A-Za-z]?|S\\/?N)$',
    ctpsNumero: '^\\d{4,8}$', ctpsSerie: '^\\d{3,5}(?:-?[A-Z]{2})?$', titulo: '^\\d{12}$', zona: '^\\d{1,4}$', secao: '^\\d{1,4}$', cnh: '^\\d{9,11}$'
  },
  tiposComNome: ['nome', 'mae', 'pai', 'conjuge', 'nomeSocial']
};
export const cfgLeitor = (rules) => ({ ...LEITOR_PADRAO, ...(rules?.config?.leitor || {}), formatos: { ...LEITOR_PADRAO.formatos, ...(rules?.config?.leitor?.formatos || {}) } });
/** Confiança mínima para um valor lido ir ao portal sem o cliente confirmar. */
export const limiarPortal = (rules) => cfgLeitor(rules).confiancaMinimaPortal;

/** O valor tem o formato do campo? (e-mail, CEP, CPF, PIS, RG, agência, conta, telefone, número, datas, nomes e listas
 *  com valoresAceitos). Devolve { ok, valor } — valor corrigido quando a lista das regras tem uma opção quase igual. */
export function validarValor(k, def, valor, rules) {
  const v = String(valor ?? '').trim(); if (!v) return { ok: false };
  const L = cfgLeitor(rules); const tp = def?.tipo;
  const casa = (rx) => { try { return new RegExp(rx, 'i').test(v); } catch { return true; } };
  if (tp === 'email' || k === 'email') return { ok: validEmail(v) };
  if (tp === 'cpf' || k === 'cpf') return { ok: validCPF(v) };
  if (tp === 'pis' || k === 'pis') return { ok: validPIS(v) };
  if (tp === 'cep' || k === 'cep') return { ok: onlyDigits(v).length === 8 && casa(L.formatos.cep) };
  if (tp === 'data') return { ok: !!parseDate(v) };
  if (tp === 'telefone' || k === 'telefone') { const d = onlyDigits(v).length; return { ok: d >= 10 && d <= 11 }; }
  if (L.formatos[k]) return { ok: casa(L.formatos[k]) };
  if (L.tiposComNome.includes(k)) return { ok: !/\d/.test(v) && /\p{L}{2}/u.test(v) && !/[=:;|@#$%&*_<>]/.test(v) };
  if (def?.seletores && Object.keys(def.seletores).length) return { ok: Object.keys(def.seletores).some(o => norm(o) === norm(v)) };
  const aceitos = def?.valoresAceitos;
  if (Array.isArray(aceitos) && aceitos.length) {
    const N = norm(v);
    const exato = aceitos.find(o => norm(o) === N || norm(o).replace(/\s*\(.*?\)/g, '') === N || casaRadical(N.toLowerCase(), norm(o).toLowerCase().split(' ')[0]));
    if (exato) return { ok: true };
    const quase = bestMatch(v, aceitos, 0.72);
    return quase ? { ok: false, valor: quase.option } : { ok: false };
  }
  // lista sem opções conhecidas: texto com sobra de OCR ("Sotteira =") não serve
  if (tp === 'combo' || tp === 'radio') return { ok: !/[=|_<>{}\[\]#]/.test(v) && /\p{L}/u.test(v) };
  return { ok: true };
}

/** Extração genérica "Rótulo: valor" usando os sinônimos dos campos.
 *  O valor vai até: 2+ espaços, " | ", " = ", fim da linha ou o início de outro rótulo conhecido ("… Bairro: …",
 *  também sem acento, como o OCR lê). Sinônimos genéricos só valem nos documentos de campos[].sinonimosSoEm
 *  ({ "sinônimo": ["docId", …, "texto" = texto colado sem documento] }). */
export function extractByLabels(text, campos, opts = {}) {
  const docId = opts.docId ?? null;
  const lines = String(text || '').normalize('NFC').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const escRx = (x) => plain(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const synsDe = (def) => [...(def.sinonimos || []), ...Object.entries(def.sinonimosSoEm || {}).filter(([, docs]) => [].concat(docs || []).includes(docId || 'texto')).map(([s]) => s)];
  const allSyns = [...new Set(Object.values(campos || {}).flatMap(d => [...(d.sinonimos || []), ...Object.keys(d.sinonimosSoEm || {})]))].sort((a, b) => b.length - a.length);
  const nextLabel = allSyns.length ? new RegExp(`\\s+(?:${allSyns.map(escRx).join('|')})\\s*[:\\-–=]\\s`) : null;
  const out = {};
  for (const [key, def] of Object.entries(campos || {})) {
    const syns = synsDe(def).slice().sort((a, b) => b.length - a.length);
    for (const syn of syns) {
      // ":" "-" "=" separam rótulo e valor; "." (o OCR troca ":" por ".") só com o rótulo no começo da linha ou de uma coluna
      const re = new RegExp(`(?:(?:^|\\s{2,}|\\|\\s*)${escRx(syn)}\\s*[:\\-–=.]|(?:^|\\s|\\|)${escRx(syn)}\\s*[:\\-–=])\\s*(.{1,160}?)(?=\\s{2,}|\\s\\|\\s|$)`);
      for (const l of lines) {
        const lp = plain(l);                 // mesma posição de cada letra (texto em NFC), sem acentos e em minúsculas
        const m = lp.match(re);
        if (!m || !m[1]) continue;
        const ini = m.index + m[0].length - m[1].length;
        let v = l.slice(ini, ini + m[1].length).trim(); let vp = lp.slice(ini, ini + m[1].length).trim();
        if (nextLabel) { const cut = (' ' + vp).search(nextLabel); if (cut > 0) { v = v.slice(0, cut - 1).trim(); vp = vp.slice(0, cut - 1).trim(); } }
        // " = " e "—" separam colunas no OCR; aspas e símbolos soltos no fim são sobra da leitura
        v = v.split(/\s+[=—]\s*|\s*=\s+/)[0].replace(/(?<=\d)["“”'`´|=]+\S*$/, '').replace(/[;,]$/, '').trim();
        if (v) { out[key] = { valor: v, fonte: syn, conf: 0.75, linha: l, ancora: true }; break; }
      }
      if (out[key]) break;
    }
  }
  return out;
}

const RX = {
  // CPF com os grupos separados por espaço ou vírgula (OCR: "000 .123.407-23", "000,123.407-23")
  cpf: /(?<![\d.,])(\d{3}(?:\s?[.,]\s?)?\d{3}(?:\s?[.,]\s?)?\d{3}(?:\s?[-–]\s?)?\d{2})(?![\d])/g,
  pis: /\b(\d{3}\.?\d{5}\.?\d{2}-?\d)\b/g,
  cep: /\b(\d{5}-?\d{3})\b/,
  email: /\b([\w.+-]+@[\w-]+\.[\w.-]+)\b/,
  tel: /(\(?\d{2}\)?\s?9?\d{4}-?\d{4})/,
  data: /\b(\d{2}\/\d{2}\/\d{4})\b/g
};
/** O número está junto de qual rótulo? 'sim' (o rótulo do campo é o mais perto, na linha ou na de cima),
 *  'outro' (o mais perto é registro/RENACH/inscrição/PIS/CNS…), null (nenhum rótulo). */
function rotuloPerto(text, idx, rotulo, descarta) {
  const ini = text.lastIndexOf('\n', idx - 1) + 1;
  const antes = plain(text.slice(Math.max(ini, idx - 60), idx));
  const ultimo = (rx) => { let p = -1; for (const m of antes.matchAll(new RegExp(`(?<![a-z])(?:${rx})(?![a-z])`, 'g'))) p = m.index; return p; };
  const pR = ultimo(rotulo), pD = descarta.length ? ultimo(descarta.join('|')) : -1;
  if (pR >= 0 || pD >= 0) return pR > pD ? 'sim' : 'outro';
  // rótulo na linha de cima (RG, CNH, CIN: "CPF   DATA NASCIMENTO" e o valor embaixo)
  if (antes.trim()) return null;
  const fimAnt = ini - 1; if (fimAnt <= 0) return null;
  const linhaAnt = plain(text.slice(text.lastIndexOf('\n', fimAnt - 1) + 1, fimAnt));
  const temR = new RegExp(`(?<![a-z])(?:${rotulo})(?![a-z])`).test(linhaAnt);
  const temD = descarta.length && new RegExp(`(?<![a-z])(?:${descarta.join('|')})(?![a-z])`).test(linhaAnt);
  return temR && !temD ? 'sim' : temD && !temR ? 'outro' : null;
}

export function extractGeneric(text, rules) {
  const out = {}; const T = String(text || '').normalize('NFC');
  const L = cfgLeitor(rules);
  // CPF: o que está junto do rótulo "CPF" vale; perto de registro/RENACH/inscrição/PIS/CNS é outro número; sem rótulo fica para conferir
  const cpfs = [];
  for (const m of T.matchAll(RX.cpf)) {
    const d = onlyDigits(m[1]); if (d.length !== 11 || !validCPF(d)) continue;
    const r = rotuloPerto(T, m.index, 'cpf|c\\.p\\.f\\.?', L.contextoCpfDescarta);
    if (r !== 'outro') cpfs.push({ d, ancora: r === 'sim' });
  }
  const cpf = cpfs.find(c => c.ancora) || cpfs[0];
  if (cpf) out.cpf = cpf.ancora ? { valor: fmtCPF(cpf.d), conf: 0.95, fonte: 'CPF junto do rótulo', ancora: true, validado: true } : { valor: fmtCPF(cpf.d), conf: Math.min(0.5, L.semAncora), fonte: 'CPF no texto (sem rótulo)' };
  const pis = [];
  for (const m of T.matchAll(RX.pis)) {
    if (!validPIS(m[1]) || cpfs.some(c => c.d === onlyDigits(m[1]))) continue;
    pis.push({ v: m[1], ancora: rotuloPerto(T, m.index, 'pis|pasep|nis|nit|pis\\/pasep', []) === 'sim' });
  }
  const p1 = pis.find(p => p.ancora) || pis[0];
  if (p1) out.pis = p1.ancora ? { valor: p1.v, conf: 0.8, fonte: 'PIS junto do rótulo', ancora: true, validado: true } : { valor: p1.v, conf: L.semAncora, fonte: 'PIS no texto (sem rótulo)' };
  // CEP sem o bloco do endereço não diz de quem é (pode ser da empresa ou da clínica): fica baixo, o leitor de endereço decide
  const cep = T.match(RX.cep); if (cep) out.cep = { valor: fmtCEP(cep[1]), conf: 0.4, fonte: 'CEP no texto' };
  const em = T.match(RX.email);
  if (em) { const ancora = /e-?mail\s*:?\s*$/i.test(T.slice(Math.max(0, em.index - 20), em.index)); out.email = { valor: em[1], conf: ancora ? 0.8 : L.semAncora, fonte: ancora ? 'e-mail junto do rótulo' : 'e-mail no texto (sem rótulo)', ancora, validado: true }; }
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
 * ctx = { employees: [...], tipoAtual: 'afastamento' | null, hoje, confiancaOcr: 0–100 | null, metodo: 'ocr' | 'pdf-texto' | … }
 * Cada campo traz { valor, conf, fonte } e, quando vale, ancora (junto do rótulo/frase) e validado (formato conferido).
 * Abaixo de config.leitor.confiancaMinimaPortal o valor é só sugestão: o painel não o manda ao portal sem o cliente usar.
 */
export function analyzeText(text, rules, ctx = {}) {
  const docs = classifyDocument(text, rules);
  const doc = docs[0] || null;
  const docRule = doc ? rules.documentos.find(d => d.id === doc.id) : null;
  let tipoKey = ctx.tipoAtual || doc?.tipoSolicitacao || null;
  if (!ctx.tipoAtual && doc?.id === 'atestado') tipoKey = rules.config?.atestadoAte15DiasVaiPara || 'afastamento';
  // ASO sozinho: o tipo de exame marcado diz o pedido (documentos[].tipoPorExame: admissional → cadastro, demissional → cálculo da rescisão)
  const exameAso = docRule?.tipoPorExame ? readASO(text, docRule).tipo : null;
  if (!ctx.tipoAtual && exameAso && typeof docRule.tipoPorExame[exameAso] === 'string') tipoKey = docRule.tipoPorExame[exameAso];
  const tipo = tipoKey ? resolveTipo(rules, tipoKey) : null;
  const LC = cfgLeitor(rules);
  const campos = {};
  const put = (k, v, conf, fonte, extra = {}) => { if (v == null || v === '') return; if (!campos[k] || campos[k].conf < conf) campos[k] = { valor: v, conf, fonte, ...extra }; };
  // documento de outro pedido (ex.: pedido de demissão aberto num afastamento): os rótulos do tipo não valem nele
  const outraFamilia = !!(ctx.tipoAtual && docRule?.tipoSolicitacao && docRule.tipoSolicitacao !== ctx.tipoAtual && !FAMILIAS_PEDIDO.some(f => f.includes(docRule.tipoSolicitacao) && f.includes(ctx.tipoAtual)));

  const rotulados = tipo && !outraFamilia ? extractByLabels(text, tipo.campos, { docId: docRule?.id || null }) : {};
  for (const [k, v] of Object.entries(rotulados)) put(k, v.valor, v.conf, v.fonte, { ancora: true });
  for (const [k, v] of Object.entries(extractGeneric(text, rules))) if (!tipo || tipo.campos[k]) put(k, v.valor, v.conf, v.fonte, { ancora: !!v.ancora, validado: !!v.validado });
  // documento pessoal (RG, CNH, CIN, CTPS digital, título): rótulo numa linha, valor na de baixo
  const pessoal = docRule?.leitor === 'pessoal' && tipo ? lerDocumentoPessoal(text, rules.config?.leitorPessoal, docRule.id) : null;
  if (pessoal) for (const [k, v] of Object.entries(pessoal.campos)) if (tipo.campos[k]) put(k, v.valor, v.conf, v.fonte, { ancora: true });
  // leitor próprio do documento (atestado): lê dias, data, CID, médico e paciente com mais cuidado
  const usaLeitor = docRule ? (docRule.leitor || (docRule.id === 'atestado' ? 'atestado' : null)) === 'atestado' : tipoKey === 'afastamento';
  const leitor = usaLeitor ? lerAtestado(text, ctx.hoje || today()) : null;
  if (leitor) {
    const cite = (x) => x?.trecho ? `“${x.trecho}”` : (docRule?.nome || 'documento');
    if (leitor.dias) put('dias', String(leitor.dias.n), leitor.dias.conf, cite(leitor.dias), { ancora: true, validado: leitor.dias.conf >= 0.9 });
    if (leitor.data) put('dataAfastamento', leitor.data.data, leitor.data.conf, cite(leitor.data), { ancora: leitor.data.conf >= 0.75, validado: leitor.data.conf >= 0.75 });
    if (leitor.cid) put('cid', leitor.cid, 0.7, docRule?.nome || 'documento', { ancora: true });
    if (leitor.medico) put('medico', leitor.medico, 0.7, docRule?.nome || 'documento', { ancora: true });
  } else if (docRule?.extrair) for (const [k, pats] of Object.entries(docRule.extrair)) { const v = runPatterns(text, pats); if (v) put(k, v.replace(/\s+/g, ' '), 0.7, docRule.nome, { ancora: true }); }
  if (docRule?.valores) for (const [k, v] of Object.entries(docRule.valores)) if (!k.startsWith('tipoAfastamentoSe') && !(k === 'tipoAfastamento' && tipo?.tipoAfastamentoAuto)) put(k, v, 0.65, docRule.nome);
  // Solicitação Geral (alvará, CND…): departamento e assunto pelo catálogo; a descrição só do modelo do item
  if (tipoKey === 'geral' && docRule) {
    const g = assuntoGeral(text, rules, { docId: docRule.id, hoje: ctx.hoje || today() });
    if (g) { put('departamento', g.departamento, 0.65, docRule.nome); put('assunto', g.assunto, 0.65, docRule.nome); if (g.descricao) put('descricao', g.descricao, 0.5, 'modelo do escritório'); }
  }
  // opções escolhidas por palavras do documento (documentos[].opcoesPorPalavra; tipoCatPalavras é o formato antigo da CAT)
  for (const o of regrasDeOpcoes(docRule)) { const v = opcaoPorPalavra(text, o); if (v) put(o.campo, v, 0.6, docRule.nome); }
  // motivo da rescisão pela tabela das regras (config.motivoAuto): "término do contrato de experiência" no documento
  const avisosMotivo = [];
  if (tipo?.campos?.motivo && rules.config?.motivoAuto && docRule) {
    const m = motivoRescisao(text, rules, { docId: docRule.id, soAuto: true });
    if (m?.nenhum) { delete campos.motivo; if (m.dica) avisosMotivo.push({ nivel: 'atencao', id: 'motivo', mensagem: m.dica }); }
    else if (m?.valor) { put('motivo', m.valor, 0.7, docRule.nome); if (m.dadoPor) put('avisoDadoPor', m.dadoPor, 0.7, docRule.nome); }
  }
  // campos do pedido irmão: "dataAviso" lido vale como "Data do aviso prévio" no cálculo (campos[].tambem);
  // dias de abono → abono SIM/NÃO (campos[].porNumero); fim do gozo → dias de gozo
  if (tipo) {
    for (const [k, def] of Object.entries(tipo.campos)) {
      if (!campos[k]) for (const a of def.tambem || []) if (campos[a]) { campos[k] = { ...campos[a] }; break; }
      const pn = def.porNumero;
      if (pn && campos[pn.campo]) { const n = parseInt(onlyDigits(campos[pn.campo].valor), 10); if (!isNaN(n)) put(k, n > 0 ? pn.maiorQueZero : pn.zero, 0.65, campos[pn.campo].fonte); }
    }
    if (tipo.campos.diasGozo && !campos.diasGozo && campos.inicioGozo && campos.fimGozo) {
      const a = parseDate(campos.inicioGozo.valor), b = parseDate(campos.fimGozo.valor);
      if (a && b && b >= a && diffDays(a, b) < 31) put('diasGozo', String(diffDays(a, b) + 1), 0.65, campos.fimGozo.fonte);
    }
  }
  // endereço: só de documentos que podem trazê-lo (documentos[].endereco: comprovante e ficha) ou de um texto sem documento;
  // no comprovante, só o bloco do titular (o da empresa emissora fica de fora); as linhas que já viraram outros campos não entram
  const titular = doc?.id === 'comprovanteEndereco' ? titularComprovante(text) : null;
  let bairroDuvida = false;
  if (tipo?.campos?.cep) {
    const ADDR = ['cep', 'endereco', 'numero', 'complemento', 'bairro', 'municipio', 'uf'];
    if (!docRule || docRule.endereco) {
      const ender = rotulados.endereco ? separarEndereco(rotulados.endereco.valor) : {};
      if (ender.endereco) { campos.endereco.valor = ender.endereco; for (const k of ['numero', 'complemento', 'bairro', 'municipio', 'uf']) if (ender[k] && tipo.campos[k] && !rotulados[k]) put(k, ender[k], 0.7, rotulados.endereco.fonte, { ancora: true }); }
      if (campos.cep && !rotulados.cep) delete campos.cep;     // o 1º CEP do texto pode ser da empresa: vale o do bloco escolhido
      const le = lerEndereco(text, rules, { docId: docRule?.id || null, titular });
      if (le) {
        bairroDuvida = le.bairroDuvida;
        // com rótulos (ficha), o leitor de blocos só completa; sem o bloco do titular, nada passa do limiar
        const conf = docRule?.id === 'comprovanteEndereco' ? le.conf : Math.min(le.conf, 0.45);
        for (const [k, v] of Object.entries(le.campos)) if (tipo.campos[k] && !rotulados[k]) put(k, v, k === 'bairro' && le.bairroDuvida ? Math.min(conf, 0.45) : conf, le.fonte, { ancora: conf >= 0.6 });
      }
    } else for (const k of ADDR) if (campos[k] && !rotulados[k]) delete campos[k];
  }
  for (const k of docRule?.naoPreenche || []) delete campos[k];
  // datas extraídas: normaliza
  for (const [k, c] of Object.entries(campos)) {
    const def = tipo?.campos?.[k];
    const junto = (alvo, v) => { if (v && tipo.campos[alvo] && (!campos[alvo] || campos[alvo].conf < c.conf)) campos[alvo] = { valor: v, conf: c.conf, fonte: c.fonte, ancora: c.ancora }; };
    // "Vitória/ES" → município e UF; "1234567 SSP/ES" → RG, órgão e UF; "45 + 45" → experiência e prorrogação (regras: separaUf, separaOrgaoUf, prorrogacaoEm)
    if (def?.separaOrgaoUf) { const r = separarRg(c.valor); if (r) { c.valor = r.numero; junto(def.separaOrgaoUf[0], r.orgao); junto(def.separaOrgaoUf[1], r.uf); } }
    if (def?.separaUf) { const u = separarUf(c.valor); if (u) { c.valor = u.antes; junto(def.separaUf, u.uf); } }
    if (def?.prorrogacaoEm) { const d = diasExperiencia(c.valor); if (d[1] != null) junto(def.prorrogacaoEm, String(d[1])); }
    if (def?.tipo === 'data') {
      // "01/11/2026 a 31/10/2027" (vigência do estágio), "03/11/2026 por 30 dias": vale a primeira data
      const d = parseDate(c.valor) || parseDate(String(c.valor).match(/\d{1,2}\s?[\/.\-]\s?\d{1,2}\s?[\/.\-]\s?\d{2,4}/)?.[0]?.replace(/\s/g, ''));
      if (d) c.valor = fmtDate(d); else delete campos[k];
    }
    if (def?.tipo === 'numero') { const m = String(c.valor).match(/\d[\d.]*/); const n = m ? parseInt(onlyDigits(m[0]), 10) : NaN; if (isNaN(n)) delete campos[k]; else c.valor = String(n); }
    if (def?.tipo === 'cpf' && c.valor) c.valor = fmtCPF(c.valor);
    // nome com sobra do OCR no fim ("MARTA LUCIA PRADO í", "ANA SOUZA |"): tira a sobra
    if (LC.tiposComNome.includes(k)) c.valor = String(c.valor).replace(/(?:\s+(?:\p{Ll}|[^\p{L}\s]+))+$/u, '').trim();
    if (def?.tipo === 'radio' && def.seletores?.['Sim'] && def.seletores?.['Não']) { const v = simNao(c.valor) || def.outroTextoVira || null; if (v) c.valor = v; else delete campos[k]; }
    else if (def?.tipo === 'radio' && def.seletores) { const ops = Object.keys(def.seletores).filter(o => norm(o).startsWith(norm(c.valor)) && norm(c.valor)); if (ops.length === 1) c.valor = ops[0]; }
  }
  // afastamento: o tipo do portal sai do conteúdo do documento e da quantidade de dias
  if (tipo?.campos?.tipoAfastamento && tipo.tipoAfastamentoAuto) {
    const ta = inferTipoAfastamento(text, campos.dias?.valor, doc?.id, tipo.tipoAfastamentoAuto);
    if (ta) put('tipoAfastamento', ta.valor, 0.7, ta.motivo);
  }
  // certidão (documentos[].leitor = "certidao"): só o que ela diz sobre o funcionário — casamento marca o estado civil e o cônjuge;
  // nascimento sugere dependentes (cadastro) ou a data como início para conferir (afastamento). Os dados do registrado não entram.
  const avisosExtra = [];
  const certidao = docRule?.leitor === 'certidao' && tipo ? lerCertidao(text) : null;
  if (certidao) {
    for (const k of Object.keys(campos)) delete campos[k];
    const fonteC = certidao.tipo === 'casamento' ? 'certidão de casamento' : 'certidão de nascimento';
    if (certidao.tipo === 'casamento') {
      if (tipo.campos.estadoCivil) put('estadoCivil', docRule.estadoCivilCasamento || 'Casado', 0.65, fonteC);
      const nomes = certidao.nomes || [];
      const i = ctx.nome && nomes.length === 2 ? nomes.findIndex(n => mesmaPessoa({ nome: n }, { nome: ctx.nome }) === true) : -1;
      if (tipo.campos.conjuge && i >= 0) put('conjuge', nomes[1 - i], 0.7, fonteC, { ancora: true });
      else if (tipo.campos.conjuge && nomes.length === 2) avisosExtra.push({ nivel: 'info', id: 'conjuge', mensagem: (rules.mensagens?.certidaoConjuge || 'Na certidão de casamento li {a} e {b}. Quando o nome do funcionário estiver no cadastro, eu marco o outro como cônjuge — ou escreva o nome do cônjuge.').replace('{a}', nomes[0]).replace('{b}', nomes[1]) });
    } else if (certidao.tipo === 'nascimento') {
      if (tipo.campos.possuiDependentes) {
        put('possuiDependentes', 'Sim', 0.5, `${fonteC} (confira)`);
        if (certidao.registrado) avisosExtra.push({ nivel: 'info', id: 'dependente', mensagem: (rules.mensagens?.certidaoDependente || 'Certidão de nascimento de {nome}{data}: se for filho(a) do funcionário, marque “Possui dependentes” — o escritório cadastra o dependente.').replace('{nome}', certidao.registrado).replace('{data}', certidao.data ? ` (nascido em ${certidao.data})` : '') });
      }
      if (tipo.campos.dataAfastamento && certidao.data) put('dataAfastamento', certidao.data, 0.5, `data de nascimento na ${fonteC} (confira)`);
    }
  }
  // funcionário
  let candidatos = null; let pacienteOutro = false;
  if (tipo?.campos?.empregado && ctx.employees?.length) {
    const pac = leitor?.paciente;
    const pm = pac ? empregadoPorNome(pac.nome, ctx.employees) : null;
    if (pm?.option && pm.contradiz) {
      // "MARIA EDUARDA" no atestado e "MARIA APARECIDA" na lista: pode ser de uma filha — o cliente confere
      put('empregado', pm.option, 0.45, `“${pac.trecho}”`);
      pacienteOutro = true;
      avisosExtra.push({ nivel: 'atencao', id: 'outroNome', mensagem: (rules.mensagens?.documentoOutroNome || 'O documento está em nome de {nome}, que não é exatamente {funcionario}. Confira se é do funcionário (pode ser de um dependente).').replaceAll('{nome}', pac.nome).replaceAll('{funcionario}', pm.option) });
    } else if (pm?.option) put('empregado', pm.option, Math.min(pm.score, pac.conf + 0.15), `“${pac.trecho}”`, { ancora: true, validado: pm.score >= 0.9 });
    else if (pm?.candidatos) candidatos = pm.candidatos;
    else {
      const m = findEmployeeInText(leitor ? semOutrasPessoas(text) : text, ctx.employees, { soPrimeiroNome: !leitor && !doc });
      const outroNome = pac && pac.nome.split(' ').length >= 2;
      if (m?.candidatos) candidatos = m.candidatos;       // empate: o cliente escolhe
      else if (m && outroNome) {
        put('empregado', m.option, Math.min(m.score, 0.45), `sobrenome igual ao de “${pac.nome}”`);
        pacienteOutro = true;
        avisosExtra.push({ nivel: 'atencao', id: 'outroNome', mensagem: `O atestado está em nome de ${pac.nome}, que não é exatamente ${m.option}. Confira se é do funcionário (pode ser de um dependente).` });
      } else if (m) put('empregado', m.option, m.score, 'nome encontrado no documento', { validado: m.score >= 0.95 });
    }
  }
  // funcionário pelo CPF do documento: o painel perguntou à aba do portal de quem é cada CPF (ctx.cpfNomes = { cpf: nome | null };
  // ctx.cpfListaTemCpf: a lista traz CPF). O nome achado pelo CPF vale mais que o nome lido e resolve o "Qual deles?".
  if (tipo?.campos?.empregado && ctx.cpfNomes && ctx.employees?.length) {
    const doc_ = cpfsDoTexto(text, rules);
    const achados = doc_.map(c => ({ ...c, nome: ctx.cpfNomes[c.cpf] })).filter(c => c.nome && ctx.employees.some(e => norm(e) === norm(c.nome)));
    const nomes = [...new Set(achados.map(c => norm(c.nome)))];
    if (nomes.length === 1) {
      const c = achados.find(x => x.ancora) || achados[0];
      campos.empregado = { valor: ctx.employees.find(e => norm(e) === norm(c.nome)), conf: c.ancora ? 0.97 : Math.min(0.55, LC.semAncora), fonte: 'CPF do documento', ancora: c.ancora, validado: true };
      candidatos = null;
    } else if (!nomes.length && ctx.cpfListaTemCpf && doc_.length && pacienteOutro) {
      avisosExtra.push({ nivel: 'atencao', id: 'cpfOutraPessoa', mensagem: (rules.mensagens?.cpfDeOutraPessoa || 'O CPF do documento ({cpf}) não é de nenhum funcionário da lista — pode ser de um dependente. Confira de quem é o documento.').replace('{cpf}', fmtCPF(doc_[0].cpf)) });
    }
  }
  // atestado de outra pessoa (dependente): o tipo de afastamento fica com o cliente
  if (pacienteOutro && campos.tipoAfastamento) delete campos.tipoAfastamento;
  if (tipo?.campos?.nome && !campos.nome && !(docRule?.naoPreenche || []).includes('nome')) {
    // na mesma linha do rótulo (o nome da linha de baixo é do leitor de documento pessoal)
    const m = String(text).match(/(?:nome|paciente|portador|titular)[ \t]*[:\-]?[ \t]*([A-ZÀ-Ú][A-ZÀ-Ú \t]{8,60})(?=\n|\s{2,}|$)/);
    if (m) put('nome', m[1].trim(), 0.5, 'nome em maiúsculas');
  }
  // motivo sem aviso prévio (término da experiência, justa causa): o cálculo não leva data nem tipo de aviso
  if (tipo?.campos?.tipoAviso && campos.motivo && !temAviso({ motivo: campos.motivo.valor }, rules)) { delete campos.tipoAviso; delete campos.dataAvisoPrevio; }
  // comprovante em nome de outra pessoa (a tela compara com o nome do cadastro) e filiação para confirmar
  const avComp = avisoComprovante(titular, ctx.nome, rules);
  if (avComp) avisosExtra.push(avComp);
  if (pessoal?.filiacao?.length === 2 && tipo?.campos?.mae && campos.mae) {
    const outro = pessoal.filiacao.find(x => x !== campos.mae.valor) || '';
    avisosExtra.push({ nivel: 'atencao', id: 'filiacao', mensagem: (rules.mensagens?.filiacaoConfira || 'Na filiação do documento li “{mae}” e “{outro}”. Coloquei “{mae}” como mãe — confira.').replaceAll('{mae}', campos.mae.valor).replaceAll('{outro}', outro) });
  }
  // documento que só pode trazer alguns campos (documentos[].preencheSo: a certidão não traz CPF nem nome do funcionário)
  if (Array.isArray(docRule?.preencheSo)) for (const k of Object.keys(campos)) if (!docRule.preencheSo.includes(k)) delete campos[k];
  // notas para a descrição (DIB/DCB da carta do INSS, totais do espelho de ponto): o que o portal não tem campo
  let notas = notasDoDocumento(text, docRule);
  // CPFs válidos do documento (sem os de registro/PIS/CNS/responsável): o painel pergunta à aba do portal de quem são
  const cpfs = tipo?.campos?.empregado ? cpfsDoTexto(text, rules).map(c => c.cpf) : [];
  // P6 — formato: e-mail, CPF, CEP, RG, agência, conta, telefone, nomes e listas; o que não serve fica para conferir
  for (const [k, c] of Object.entries(campos)) {
    const def = tipo?.campos?.[k]; if (!def || k === 'empregado') continue;
    const v = validarValor(k, def, c.valor, rules);
    if (v.ok) { if (['cpf', 'pis', 'email', 'cep', 'data', 'telefone'].includes(def.tipo) || ['cpf', 'pis', 'email', 'cep'].includes(k) || LC.formatos[k]) c.validado = c.validado ?? true; continue; }
    if (v.valor) { c.fonte = `${c.fonte} — li “${c.valor}”, parece “${v.valor}”`; c.valor = v.valor; }
    c.conf = Math.min(c.conf, v.valor ? 0.5 : 0.4); c.confira = 'formato'; c.validado = false;
  }
  if (bairroDuvida && campos.bairro && campos.bairro.conf > 0.45 && !rotulados.bairro) campos.bairro.conf = 0.45;
  // P2 — qualidade do OCR: leitura ruim não preenche nada (pede outra foto); leitura fraca, só sugestão (menos o validado e ancorado)
  const ocrConf = ctx.metodo === 'ocr' || (ctx.metodo == null && ctx.confiancaOcr != null) ? ctx.confiancaOcr : null;
  let fotoRuim = false;
  if (ocrConf != null && ocrConf < LC.ocrRuim && Object.keys(campos).length) {
    fotoRuim = true;
    for (const k of Object.keys(campos)) delete campos[k];
    candidatos = null; notas = []; cpfs.length = 0;
  } else if (ocrConf != null && ocrConf < LC.ocrBaixo) {
    for (const c of [...Object.values(campos), ...notas]) if (!(c.ancora && c.validado) && c.conf > LC.ocrTetoBaixo) { c.conf = LC.ocrTetoBaixo; c.confira = c.confira || 'leitura'; }
  }
  // nomes não têm dígito verificador: de foto, o OCR troca ou junta palavras ("EMMA THIAGO…") — ficam para o cliente confirmar
  if (ocrConf != null && ocrConf < LC.ocrTetoNomes) for (const k of LC.tiposComNome) if (campos[k] && campos[k].conf > LC.ocrTetoBaixo) { campos[k].conf = LC.ocrTetoBaixo; campos[k].confira = campos[k].confira || 'leitura'; }
  if (fotoRuim || (ocrConf != null && ocrConf < LC.ocrRuim)) avisosExtra.push({ nivel: 'atencao', id: 'fotoRuim', mensagem: rules.mensagens?.leituraRuimOutraFoto || 'Não consegui ler este arquivo com segurança (foto tremida, escura ou cortada). Para não preencher nada errado, deixei os campos em branco. Se puder, mande outra foto: o documento inteiro, de frente, com boa luz e sem reflexo.' });
  // quem é a pessoa do documento (um documento, uma pessoa: o painel não mistura documentos de pessoas diferentes)
  const pessoa = pessoaDaAnalise({ campos, paciente: leitor?.paciente?.nome || null });
  const avisos = [...avisosDoDocumento(text, docRule || (leitor ? (rules.documentos || []).find(d => d.id === 'atestado') : null), campos), ...avisosExtra, ...avisosMotivo];
  return { documento: doc, alternativas: docs.slice(1, 4), tipoSugerido: tipoKey, campos, avisos, paciente: leitor?.paciente?.nome || null, candidatos, titular, filiacao: pessoal?.filiacao || null, layout: pessoal?.layout || null, pessoa, fotoRuim, confiancaOcr: ocrConf, notas, cpfs, exameAso, certidao: certidao ? { tipo: certidao.tipo } : null };
}

/**
 * PDF com vários documentos (RG + comprovante + ASO): cada trecho é lido com o que o SEU documento pode trazer (o endereço só
 * sai do comprovante, nunca da clínica do ASO) e os resultados se juntam — o campo de maior confiança fica (empate: o do
 * trecho mais antigo). partes: [{ documento, texto }]. Devolve a análise do 1º trecho com os campos, avisos e notas de todos,
 * mais `documentos` (ids reconhecidos) e `partes` (análise de cada um).
 */
export function analisarPartes(partes, rules, ctx = {}) {
  const lista = (partes || []).map(p => ({ p, a: analyzeText(p.texto, rules, ctx) }));
  if (!lista.length) return analyzeText('', rules, ctx);
  const principal = lista.find(x => x.a.tipoSugerido && x.a.documento && !docsNeutros(rules).includes(x.a.documento.id)) || lista.find(x => x.a.tipoSugerido) || lista[0];
  const base = principal.a;
  const campos = {};
  for (const { a } of lista) for (const [k, c] of Object.entries(a.campos)) if (!campos[k] || campos[k].conf < c.conf) campos[k] = c;
  const tipoKey = ctx.tipoAtual || base.tipoSugerido;
  const ids = [...new Set(lista.map(x => x.a.documento?.id).filter(Boolean))];
  const cpfs = [...new Set(lista.flatMap(x => x.a.cpfs || []))];
  const pessoa = pessoaDaAnalise({ campos, paciente: base.paciente });
  return { ...base, tipoSugerido: tipoKey, campos, avisos: lista.flatMap(x => x.a.avisos), notas: lista.flatMap(x => x.a.notas || []), cpfs, pessoa,
    candidatos: base.candidatos || lista.find(x => x.a.candidatos)?.a.candidatos || null, titular: base.titular || lista.find(x => x.a.titular)?.a.titular || null,
    documentos: ids, partes: lista.map(x => ({ documento: x.a.documento?.id || null, paginas: x.p.paginas || null })) };
}

/* ---------------- Notas, certidão e CPFs do documento ---------------- */
/** Linhas para a descrição com o que o documento traz e o portal não tem campo (documentos[].notas, com os valores de
 *  documentos[].extrairNotas): DIB e DCB da carta do INSS, totais do espelho de ponto. Cada nota: { texto: "…{dib}…" ou
 *  [alternativas, a 1ª completa vale] } ou { titulo, linhas: [...] } (só as linhas com valor). Datas normalizadas. */
export function notasDoDocumento(text, docRule) {
  if (!docRule?.notas?.length) return [];
  const vals = {};
  for (const [k, pats] of Object.entries(docRule.extrairNotas || {})) {
    let v = runPatterns(text, pats); if (!v) continue;
    v = v.replace(/\s+/g, ' ').trim();
    if (/^\d{1,2}\s?[/.-]\s?\d{1,2}\s?[/.-]\s?\d{2,4}$/.test(v)) { const d = parseDate(v.replace(/\s/g, '')); if (!d) continue; v = fmtDate(d); }
    if (v) vals[k] = v;
  }
  const out = [];
  for (const n of docRule.notas) {
    let s = '';
    if (Array.isArray(n?.linhas)) {
      const ls = n.linhas.map(l => renderTemplate(l, vals)).filter(Boolean);
      if (ls.length) s = `${renderFirst(n.titulo || '', vals)} ${ls.join('; ')}`.trim();
    } else s = renderFirst(n?.texto ?? n, vals);
    if (s) out.push({ id: n?.id || docRule.id, texto: s, conf: n?.conf ?? 0.7, fonte: docRule.nome });
  }
  return out;
}

const CERT_ROTULOS_CONJUGE = /c[oô]njuges?|contraentes?|nubentes?|noivos?/i;
const nomeDeLinha = (s) => {
  const n = String(s || '').replace(/[^\p{L}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const ws = n.split(' ').filter(Boolean);
  return ws.length >= 2 && ws.length <= 8 && n === n.toUpperCase() && !ws.some(w => NAO_NOME.has(norm(w))) ? n : null;
};
/** Certidão de casamento ou de nascimento (civil): { tipo: 'casamento'|'nascimento'|null, nomes: [cônjuges], registrado, data }. */
export function lerCertidao(text) {
  const T = String(text || '').normalize('NFC'); const t = plain(T);
  const tipo = /certidao\s+de\s+casamento/.test(t) ? 'casamento' : /certidao\s+de\s+nascimento/.test(t) ? 'nascimento'
    : /\bcasamento\b/.test(t) && !/\bnascid[oa]\b/.test(t) ? 'casamento' : /\bnascimento\b/.test(t) ? 'nascimento' : null;
  const linhas = T.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // data junto da pista: na mesma linha (depois do rótulo) ou na linha de baixo, na mesma coluna aproximada
  const dataPerto = (rx) => {
    for (let i = 0; i < linhas.length; i++) {
      const m = plain(linhas[i]).match(rx); if (!m) continue;
      const resto = linhas[i].slice(m.index + m[0].length);
      const d1 = resto.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/); if (d1 && parseDate(d1[1])) return fmtDate(parseDate(d1[1]));
      const prox = linhas[i + 1] || ''; const ds = [...prox.matchAll(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g)];
      if (ds.length === 1 && parseDate(ds[0][1])) return fmtDate(parseDate(ds[0][1]));
    }
    return null;
  };
  const out = { tipo, nomes: [], registrado: null, data: null };
  if (tipo === 'casamento') {
    for (let i = 0; i < linhas.length && out.nomes.length < 2; i++) {
      if (!CERT_ROTULOS_CONJUGE.test(linhas[i])) continue;
      const depois = linhas[i].replace(/^.*?(?:c[oô]njuges?|contraentes?|nubentes?|noivos?)[^:]*:?/i, '');
      for (const l of [depois, linhas[i + 1], linhas[i + 2], linhas[i + 3]]) {
        for (const parte of String(l || '').split(/\s+E\s+|;|\s{3,}|\s+e\s+(?=[A-ZÀ-Ú])/)) { const n = nomeDeLinha(parte); if (n && !out.nomes.includes(n) && out.nomes.length < 2) out.nomes.push(n); }
        if (out.nomes.length >= 2) break;
      }
    }
    out.data = dataPerto(/data\s+do\s+(?:registro\s+do\s+)?casamento|celebrad[oa]\s+em|casaram-se\s+em/);
  } else if (tipo === 'nascimento') {
    for (let i = 0; i < linhas.length && !out.registrado; i++) {
      const m = linhas[i].match(/^\s*nome(?:\s+do\s+registrado)?\s*:?\s*(.*)$/i); if (!m) continue;
      out.registrado = nomeDeLinha(m[1]) || nomeDeLinha(linhas[i + 1]);
    }
    out.data = dataPerto(/data\s+de\s+nascimento|nascid[oa]\s+em|nasceu\s+em/);
  }
  return out;
}

/**
 * PDF com vários documentos: separa as páginas por documento (RG + comprovante + ASO num arquivo só). Uma página fraca
 * (sem documento reconhecido com segurança) fica com a anterior, para não partir o verso de um RG. paginas: [texto].
 * Devolve [{ documento, paginas: [índices], texto }] — mais de um só quando há documentos diferentes.
 */
export function separarDocumentos(paginas, rules, { minimo = 0.4 } = {}) {
  const partes = [];
  (paginas || []).forEach((tx, i) => {
    const d = classifyDocument(tx || '', rules)[0];
    const forte = d && d.bruto >= minimo ? d.id : null;
    const ult = partes[partes.length - 1];
    if (!ult || (forte && ult.documento && forte !== ult.documento)) partes.push({ documento: forte, paginas: [i], textos: [tx || ''] });
    else { ult.paginas.push(i); ult.textos.push(tx || ''); if (!ult.documento && forte) ult.documento = forte; }
  });
  return partes.map(p => ({ documento: p.documento, paginas: p.paginas, texto: p.textos.join('\n\n') }));
}

/**
 * Onde o valor está na foto: as palavras do OCR (só na memória: [{ t, conf 0–100, bbox: { x0, y0, x1, y1 }, pagina }]) que
 * formam o valor, juntas (sem espaço e sem pontuação). Valores com menos de 3 letras/dígitos não são procurados (casariam
 * em qualquer lugar). Achado mais de uma vez, vale a leitura melhor. Devolve { conf (média), min, bbox, pagina } ou null.
 */
export function localizarValor(valor, palavras) {
  const alvo = norm(valor).replace(/ /g, '');
  if (alvo.length < 3 || !palavras?.length) return null;
  const P = palavras.map(p => ({ ...p, n: norm(p.t).replace(/ /g, '') }));
  let melhor = null;
  for (let i = 0; i < P.length; i++) {
    if (!P[i].n || !alvo.startsWith(P[i].n)) continue;
    let acc = ''; const usados = [];
    for (let j = i; j < P.length; j++) {
      if (!P[j].n) continue;
      if ((P[j].pagina ?? 0) !== (P[i].pagina ?? 0)) break;
      acc += P[j].n; usados.push(P[j]);
      if (acc === alvo) {
        const confs = usados.map(u => +u.conf || 0);
        const r = { conf: Math.round(confs.reduce((a, b) => a + b, 0) / confs.length), min: Math.round(Math.min(...confs)), pagina: P[i].pagina ?? 0,
          bbox: { x0: Math.min(...usados.map(u => u.bbox.x0)), y0: Math.min(...usados.map(u => u.bbox.y0)), x1: Math.max(...usados.map(u => u.bbox.x1)), y1: Math.max(...usados.map(u => u.bbox.y1)) } };
        if (!melhor || r.conf > melhor.conf) melhor = r;
        break;
      }
      if (!alvo.startsWith(acc)) break;
    }
  }
  return melhor;
}
/** Confiança de cada valor pela leitura das palavras da foto (config.recorteLeitura): abaixo do limite, fica como sugestão
 *  (não vai ao portal sem o cliente confirmar). Dados de saúde (sensivel, CID, médico) nunca ganham recorte. Muda `campos`. */
export function aplicarLeituraDasPalavras(campos, palavras, tipoDef, rules) {
  const R = { confiancaPalavraMinima: 70, ...(rules?.config?.recorteLeitura || {}) };
  if (R.ativo === false || !palavras?.length) return campos;
  for (const [k, c] of Object.entries(campos || {})) {
    const def = tipoDef?.campos?.[k];
    if (!def || def.sensivel || ['cid', 'medico'].includes(k) || c.confira === 'formato') continue;
    if (c.ancora && c.validado && ['cpf', 'pis'].includes(k)) continue;   // o dígito verificador já confere o valor (mesma exceção do P2)
    const loc = localizarValor(c.valor, palavras); if (!loc) continue;
    c.leitura = loc;
    if (loc.conf < R.confiancaPalavraMinima && c.conf > Math.min(0.55, limiarPortal(rules) - 0.05)) { c.conf = Math.min(0.55, limiarPortal(rules) - 0.05); c.confira = c.confira || 'leitura'; c.validado = false; }
  }
  return campos;
}

/** Texto de um documento do Word (document.xml) ou do LibreOffice (content.xml): um parágrafo por linha; as células de uma
 *  tabela ficam na mesma linha, separadas por espaços (rótulo e valor como num formulário). Sem biblioteca: só o XML. */
export function xmlParaTexto(xml, tipo = 'docx') {
  const dec = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
  let x = String(xml || '');
  if (tipo === 'docx') x = x.replace(/<\/w:p>(?=\s*<\/w:tc>)/g, '').replace(/<w:tab\s*\/>/g, '\t').replace(/<w:(?:br|cr)\s*\/>/g, '\n').replace(/<\/w:tc>/g, '   ').replace(/<\/w:p>/g, '\n').replace(/<\/w:tr>/g, '\n');
  else x = x.replace(/<\/text:p>(?=\s*<\/table:table-cell>)/g, '').replace(/<text:tab\s*\/>/g, '\t').replace(/<text:line-break\s*\/>/g, '\n').replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n) => ' '.repeat(+n || 1)).replace(/<\/table:table-cell>/g, '   ').replace(/<\/text:(?:p|h)>/g, '\n').replace(/<\/table:table-row>/g, '\n');
  return dec(x.replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n').trim();
}

/** CPFs válidos do texto que não estão junto de outro rótulo (registro, PIS, CNS, responsável, mãe…): [{ cpf, ancora }]. */
export function cpfsDoTexto(text, rules) {
  const T = String(text || '').normalize('NFC'); const L = cfgLeitor(rules); const out = [];
  for (const m of T.matchAll(RX.cpf)) {
    const d = onlyDigits(m[1]); if (d.length !== 11 || !validCPF(d) || out.some(c => c.cpf === d)) continue;
    const r = rotuloPerto(T, m.index, 'cpf|c\\.p\\.f\\.?', L.contextoCpfDescarta);
    if (r !== 'outro') out.push({ cpf: d, ancora: r === 'sim' });
  }
  return out;
}

/* ---------------- Um documento, uma pessoa ---------------- */
const FAMILIAS_PEDIDO = [['avisoFerias', 'calculoFerias'], ['avisoRescisao', 'calculoRescisao'], ['cadastroEmpregado', 'cadastroEstagiario', 'cadastroContribuinte']];
/** De quem é o documento: { nome, cpf } (nome do cadastro, funcionário escolhido ou paciente; CPF válido). null = não diz. */
export function pessoaDaAnalise(a) {
  const c = a?.campos || {};
  const cpf = c.cpf?.valor && validCPF(c.cpf.valor) && (c.cpf.conf ?? 0) >= 0.6 ? onlyDigits(c.cpf.valor) : null;
  const nome = (c.nome?.valor && (c.nome.conf ?? 0) >= 0.6 ? c.nome.valor : null) || (c.empregado?.valor && (c.empregado.conf ?? 0) >= 0.6 ? c.empregado.valor : null) || null;
  return cpf || nome ? { nome, cpf } : null;
}
/** Duas pessoas são a mesma? true / false / null (não dá para dizer). CPF manda; sem CPF, o nome inteiro. */
export function mesmaPessoa(a, b) {
  if (!a || !b) return null;
  if (a.cpf && b.cpf) return a.cpf === b.cpf;
  if (a.nome && b.nome) {
    if (norm(a.nome) === norm(b.nome)) return true;
    const pm = empregadoPorNome(a.nome, [b.nome]);
    if (pm?.option && !pm.contradiz && pm.score >= 0.8) return true;
    return similarity(a.nome, b.nome) >= 0.9;
  }
  return null;
}

/* ---------------- Lote: um pedido por tipo e por pessoa ---------------- */
const NEUTROS_PADRAO = ['certidao', 'aso', 'identidade', 'cpf', 'comprovanteEndereco', 'ctps', 'seguro', 'bancario'];
const SEM_PESSOA_PADRAO = ['comprovanteEndereco', 'bancario'];
/** Documentos que servem a vários pedidos (RG, ASO, certidão…): documentos[].neutro nas regras (sem a marca, a lista antiga). */
export function docsNeutros(rules) {
  const docs = rules?.documentos || [];
  return docs.some(d => 'neutro' in d) ? docs.filter(d => d.neutro).map(d => d.id) : NEUTROS_PADRAO;
}
/** Documentos que não dizem de quem é o pedido (comprovante de residência, dados bancários): documentos[].definePessoa = false. */
export function docsSemPessoa(rules) {
  const docs = rules?.documentos || [];
  return docs.some(d => 'definePessoa' in d) ? docs.filter(d => d.definePessoa === false).map(d => d.id) : SEM_PESSOA_PADRAO;
}
/** De quem é o arquivo lido no lote: o funcionário encontrado; nos cadastros, o CPF ou o nome lido; no atestado, o paciente. */
export function pessoaDoItem(it, rules) {
  if (docsSemPessoa(rules).includes(it?.documento)) return null;
  const a = it?.analise || {}; const e = a.campos?.empregado;
  if (e?.valor && (e.conf ?? 0) >= 0.6) return { nome: e.valor, cpf: a.pessoa?.cpf || null };
  return a.pessoa || (a.paciente ? { nome: a.paciente } : null);
}
const mesmoPedido = (a, b) => a === b || (CADASTROS.includes(a) && CADASTROS.includes(b));
/** O tipo que mais aparece nos arquivos (o cartão de "Encontrei o caminho" usa este, não o do 1º arquivo). */
export function tipoMaisFrequente(itens, rules) {
  const neutros = docsNeutros(rules); const n = new Map();
  for (const it of itens || []) { const t = it?.analise?.tipoSugerido; if (t) n.set(t, (n.get(t) || 0) + (neutros.includes(it.documento) ? 0.5 : 1)); }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
/**
 * Vários arquivos de uma vez → pedidos de um tipo e de uma pessoa. itens: [{ documento, analise: { tipoSugerido, campos,
 * pessoa, paciente, titular } }]. Atestados (config.umPedidoPorDocumento) viram um pedido cada; o resto, um por tipo e pessoa.
 * Documentos neutros (RG, ASO, certidão) vão para o pedido da mesma pessoa; sem pessoa, para o único pedido possível;
 * senão ficam em `fora` (o cliente escolhe). Devolve { pedidos: [{ tipo, itens, pessoa }], fora, pessoas }.
 */
export function montarPedidosLote(itens, rules) {
  const individuais = rules?.config?.umPedidoPorDocumento || ['atestado', 'comparecimento'];
  const neutrosIds = docsNeutros(rules);
  const pessoaDe = (it) => pessoaDoItem(it, rules);
  const pedidos = []; const grupos = []; const neutros = []; const semPessoa = [];
  for (const it of itens || []) {
    const tipo = it.analise?.tipoSugerido || null;
    if (individuais.includes(it.documento)) pedidos.push({ tipo: tipo || 'afastamento', itens: [it], pessoa: pessoaDe(it), individual: true });
    else if (tipo && !neutrosIds.includes(it.documento)) { if (pessoaDe(it)) grupos.push({ tipo, it }); else semPessoa.push({ tipo, it }); }
    else neutros.push(it);
  }
  const lista = [];   // pedidos que juntam documentos (não individuais)
  const juntar = (tipo, it, p) => {
    const g = lista.find(x => mesmoPedido(x.tipo, tipo) && (p ? mesmaPessoa(x.pessoa, p) === true : !x.pessoa));
    if (g) { g.itens.push(it); if (!g.pessoa && p) g.pessoa = p; } else lista.push({ tipo, itens: [it], pessoa: p || null });
  };
  for (const { tipo, it } of grupos) juntar(tipo, it, pessoaDe(it));
  // sem pessoa (nome não achado): vai para o único pedido desse tipo; senão, um pedido próprio
  for (const { tipo, it } of semPessoa) {
    const doTipo = lista.filter(x => mesmoPedido(x.tipo, tipo));
    if (doTipo.length === 1) doTipo[0].itens.push(it); else juntar(tipo, it, null);
  }
  // neutros com pessoa: o pedido da mesma pessoa; sem esse pedido, um cadastro próprio quando o documento é de cadastro
  const restoNeutros = [];
  for (const it of neutros) {
    const p = pessoaDe(it);
    const alvo = p && [...pedidos, ...lista].find(x => mesmaPessoa(x.pessoa, p) === true);
    if (alvo) alvo.itens.push(it);
    else if (p && CADASTROS.includes(it.analise?.tipoSugerido)) juntar(it.analise.tipoSugerido, it, p);
    else restoNeutros.push(it);
  }
  // documento que acompanha um atestado (ex.: CAT da mesma data e da mesma pessoa) entra na mesma solicitação
  const data = (it) => it.analise?.campos?.dataAfastamento?.valor || null;
  for (const g of [...lista]) {
    const alvo = pedidos.find(p => p.individual && p.tipo === g.tipo && g.itens.every(it => data(it) && data(it) === data(p.itens[0])) && mesmaPessoa(p.pessoa, g.pessoa) !== false);
    if (alvo) { alvo.itens.push(...g.itens); lista.splice(lista.indexOf(g), 1); }
  }
  // o tipo do pedido é o que mais aparece nele (sem contar os neutros)
  for (const g of lista) { const t = tipoMaisFrequente(g.itens.filter(it => !neutrosIds.includes(it.documento)), rules); if (t) g.tipo = t; }
  pedidos.push(...lista);
  // neutros sem pessoa: comprovante pelo titular; senão o único pedido possível; senão o cliente escolhe
  const fora = [];
  for (const it of restoNeutros) {
    const tt = it.analise?.titular;
    const peloTitular = tt && pedidos.filter(p => mesmaPessoa(p.pessoa, { nome: tt }) === true);
    if (peloTitular?.length === 1) { peloTitular[0].itens.push(it); continue; }
    const naoIndiv = pedidos.filter(p => !p.individual);
    if (pedidos.length === 1) pedidos[0].itens.push(it);
    else if (naoIndiv.length === 1 && (!pessoaDe(it) || mesmaPessoa(naoIndiv[0].pessoa, pessoaDe(it)) !== false)) naoIndiv[0].itens.push(it);
    else fora.push(it);
  }
  const pessoas = pedidos.reduce((acc, p) => p.pessoa && !acc.some(x => mesmaPessoa(x, p.pessoa) === true) ? [...acc, p.pessoa] : acc, []);
  return { pedidos: pedidos.map(({ individual, ...p }) => p), fora, pessoas };
}

/* ---------------- Regra dos 60 dias (atestados do mesmo funcionário) ---------------- */
const R60_PADRAO = { janelaDias: 60, limiteDias: 15, tipoSugerido: 'Novo afast. mesma doença', textoDescricao: 'Soma {soma} dias com {anteriores} (regra dos 60 dias — mesma doença, informado pelo cliente).' };
export const regra60 = (rules) => ({ ...R60_PADRAO, ...(rules?.config?.regra60dias || {}) });
/**
 * Decreto 3.048/99, art. 75: afastamentos pela mesma doença se somam quando um começa até 60 dias depois do retorno do
 * anterior; passando de 15 dias, o INSS paga a partir do 16º. atual/anteriores = { empregado, data: 'dd/mm/aaaa', dias,
 * origem? }. Devolve null ou { soma, anteriores: [do mais antigo ao mais recente], passa, tipoSugerido, texto }.
 */
export function somaAtestados(atual, anteriores, rules) {
  const R = regra60(rules); if (R.ativo === false) return null;
  const ini = parseDate(atual?.data); const n = parseInt(atual?.dias, 10);
  if (!ini || !(n > 0) || !atual?.empregado) return null;
  const doMesmo = (anteriores || []).map(a => ({ ...a, ini: parseDate(a.data), n: parseInt(a.dias, 10) }))
    .filter(a => a.ini && a.n > 0 && a.empregado && a.ini < ini && mesmaPessoa({ nome: a.empregado }, { nome: atual.empregado }) === true)
    .sort((a, b) => b.ini - a.ini);
  const cadeia = []; let ref = ini;
  for (const a of doMesmo) {
    if (cadeia.some(c => +c.ini === +a.ini)) continue;         // o mesmo atestado duas vezes (lote e histórico)
    const retorno = addDays(a.ini, a.n);                       // dia em que voltou ao trabalho
    const intervalo = diffDays(retorno, ref);
    if (intervalo < 0) continue;                               // sobreposto (pedido repetido?): não soma
    if (intervalo > (+R.janelaDias || 60)) break;
    cadeia.unshift(a); ref = a.ini;
  }
  if (!cadeia.length) return null;
  const soma = n + cadeia.reduce((s, a) => s + a.n, 0);
  const anteriores_ = cadeia.map(a => ({ data: fmtDate(a.ini), dias: a.n, origem: a.origem || null }));
  const lista = anteriores_.map(a => `o atestado de ${a.data.slice(0, 5)} (${a.dias} ${a.dias === 1 ? 'dia' : 'dias'})`);
  const texto = renderTemplate(R.textoDescricao, { soma: String(soma), anteriores: lista.length > 1 ? `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}` : lista[0] });
  return { soma, anteriores: anteriores_, passa: soma > (+R.limiteDias || 15), tipoSugerido: R.tipoSugerido, texto };
}
/** Mesma doença pelo CID (só na memória, dentro do lote): mesma categoria (3 primeiros caracteres). null = não dá para dizer. */
export function mesmaDoencaPeloCid(a, b) {
  const x = norm(a).replace(/\s/g, '').slice(0, 3), y = norm(b).replace(/\s/g, '').slice(0, 3);
  return x.length === 3 && y.length === 3 ? x === y : null;
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
  // número maior que (ex.: dias de abono > 0); vem antes de "preenchido", que as versões antigas usam no lugar
  if (cond.maiorQue != null) { const n = parseFloat(String(values[cond.campo] ?? '').replace(',', '.')); return !isNaN(n) && n > +cond.maiorQue; }
  if (cond.preenchido) return !!v;
  return true;
};

export function activeConditionals(tipo, values) {
  return (tipo.condicionais || []).filter(c => matchCond(c.se, values));
}
export const condicaoVale = (cond, values) => matchCond(cond, values || {});
/** Documentos que servem a um anexo: anexos[].documentos (lista) ou o formato antigo anexos[].documento. */
export const docsDoAnexo = (a) => [...new Set([...(a?.documentos || []), a?.documento].filter(Boolean))];
export const anexoAceita = (a, docId) => !!docId && docsDoAnexo(a).includes(docId);
/** O arquivo f ({ documento, documentos?, aso? }) cumpre o anexo a? Um PDF com vários documentos marca cada um; com
 *  anexos[].asoTipo só vale o ASO desse exame (o periódico não conta como admissional; exame não lido conta). */
export function anexoCasa(a, f) {
  const ids = [...new Set([f?.documento, ...(f?.documentos || [])].filter(Boolean))];
  if (!ids.some(id => anexoAceita(a, id))) return false;
  if (a?.asoTipo && ids.includes('aso') && f?.aso?.tipo && plain(f.aso.tipo) !== plain(a.asoTipo)) return false;
  return true;
}
const ASO_PADRAO = {
  exameDoPedido: { cadastroEmpregado: 'admissional', cadastroEstagiario: 'admissional', cadastroContribuinte: 'admissional', avisoRescisao: 'demissional', calculoRescisao: 'demissional' },
  diasDemissional: 10,
  mensagens: {
    inapto: 'O ASO “{arquivo}” está como INAPTO. Fale com o seu analista antes de seguir.',
    exameOutro: 'O ASO anexado é {exame}, mas este pedido pede o {esperado}. Confira se é o exame certo.',
    admissionalDepois: 'O ASO admissional é de {exame}, depois da admissão ({admissao}). O exame admissional deve ser feito antes do início do trabalho.',
    demissionalLonge: 'O ASO demissional é de {exame} e o término é {termino}: pela NR-7, o exame demissional é feito em até {dias} dias do término do contrato. Confira com o escritório.'
  }
};
/** Conferência do ASO anexado (anexos[].aso = { tipo, resultado, data } lidos do documento). Pura, para todos os pedidos. */
export function verificarAso(tipoKey, values, anexos, rules) {
  const C = { ...ASO_PADRAO, ...(rules?.config?.aso || {}) }; const M = { ...ASO_PADRAO.mensagens, ...(rules?.config?.aso?.mensagens || {}) };
  const out = [];
  for (const f of anexos || []) {
    const a = f?.aso; if (!a) continue;
    if (a.resultado === 'INAPTO') out.push({ nivel: 'erro', mensagem: M.inapto.replace('{arquivo}', f.nome || 'ASO') });
    const esperado = C.exameDoPedido?.[tipoKey]; const ex = plain(a.tipo || '');
    if (esperado && ex && ex !== plain(esperado)) out.push({ nivel: 'atencao', mensagem: M.exameOutro.replace('{exame}', a.tipo).replace('{esperado}', esperado) });
    const dExame = parseDate(a.data); if (!dExame) continue;
    const adm = parseDate(values?.dataAdmissao);
    if (ex === 'admissional' && adm && dExame > adm) out.push({ nivel: 'atencao', campo: 'dataAdmissao', mensagem: M.admissionalDepois.replace('{exame}', fmtDate(dExame)).replace('{admissao}', fmtDate(adm)) });
    const fim = parseDate(values?.dataDemissao);
    if (ex === 'demissional' && fim && Math.abs(diffDays(fim, dExame)) > (+C.diasDemissional || 10)) out.push({ nivel: 'atencao', campo: 'dataDemissao', mensagem: M.demissionalLonge.replace('{exame}', fmtDate(dExame)).replace('{termino}', fmtDate(fim)).replace('{dias}', String(+C.diasDemissional || 10)) });
  }
  return out;
}

/* ---------------- Cadastros: o que se repete é da empresa, não da pessoa ---------------- */
/* regras: config.camposDaEmpresa = { tipos, campos, historicoEnviado }; empresas.<trecho>.padroes; config.experienciaSugerida */
const CAMPOS_EMPRESA_PADRAO = {
  tipos: ['cadastroEmpregado', 'cadastroEstagiario', 'cadastroContribuinte'],
  campos: ['departamento', 'centroCusto', 'sindicato', 'jornada', 'cargaHoraria', 'cargo', 'funcao', 'contratoExperiencia', 'prorrogacao'],
  historicoEnviado: ['nome', 'dataAdmissao', 'contratoExperiencia', 'prorrogacao']
};
const cfgEmpresa = (rules) => ({ ...CAMPOS_EMPRESA_PADRAO, ...(rules?.config?.camposDaEmpresa || {}) });
/** Campos da empresa do tipo (null quando o tipo não é um cadastro: lá vale o comportamento antigo). */
export function camposDaEmpresa(tipoKey, rules) {
  const c = cfgEmpresa(rules);
  return (c.tipos || []).includes(tipoKey) ? [...(c.campos || [])] : null;
}
/** O que pode ir de uma solicitação para outra (repetir, histórico, modelo): nunca assunto, descrição e CID;
 *  num cadastro, só os campos da empresa — os dados da pessoa anterior ficam de fora. */
export function valoresReaproveitaveis(tipoKey, valores, rules) {
  const lista = camposDaEmpresa(tipoKey, rules); const out = {};
  for (const [k, v] of Object.entries(valores || {})) {
    if (['assunto', 'descricao', 'cid'].includes(k) || v == null || v === '') continue;
    if (lista && !lista.includes(k)) continue;
    out[k] = v;
  }
  return out;
}
/** O que o "Repetir" leva (e o "Histórico deste computador" também): o que pode ser reaproveitado, menos as datas, a
 *  competência e os dias do afastamento — são de cada pedido. ("Começou e não enviou" continua levando tudo.) */
export function valoresParaRepetir(tipoKey, valores, rules) {
  const tipo = resolveTipo(rules, tipoKey); const out = {};
  for (const [k, v] of Object.entries(valoresReaproveitaveis(tipoKey, valores, rules))) {
    if (k === 'dias' || ['data', 'competencia'].includes(tipo?.campos?.[k]?.tipo)) continue;
    out[k] = v;
  }
  return out;
}
/* "Pedir de novo" a partir do detalhe de uma solicitação do portal ({lista}/{id}?expand=all): cada campo diz onde está no
   detalhe (regras: campos.*.api, um caminho ou uma lista; apiValores traduz os códigos do Onvio). Nunca vão datas, competência,
   assunto, descrição nem dados de saúde (CID, médico, CRM); num cadastro, só os campos da empresa (config.camposDaEmpresa).
   Código técnico sem tradução ("ApprenticeContractTermination") fica de fora: o cliente escolhe na lista. A calibrar no Onvio real. */
const NAO_REPETE = new Set(['assunto', 'descricao', 'cid', 'medico', 'crm', 'observacoes', 'dias']);
function noCaminho(obj, caminho) {
  let v = obj;
  for (const p of String(caminho).split('.')) { if (v == null || typeof v !== 'object') return undefined; v = v[p]; }
  return v;
}
/** O primeiro pedaço do caminho pode vir dentro de um bloco do detalhe (ex.: employeeRegistrationProfessionalExpanded). */
function noDetalhe(obj, caminho, prof = 3) {
  const v = noCaminho(obj, caminho); if (v != null && v !== '') return v;
  if (prof <= 0 || !obj || typeof obj !== 'object') return undefined;
  for (const x of Object.values(obj)) if (x && typeof x === 'object' && !Array.isArray(x)) { const r = noDetalhe(x, caminho, prof - 1); if (r != null && r !== '') return r; }
  return undefined;
}
const pareceCodigo = (s) => /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(s) || /^[A-Z][a-z0-9]+([A-Z][a-z0-9]*)+$/.test(s);
export function valoresDoDetalhe(tipoKey, detalhe, rules) {
  const tipo = resolveTipo(rules, tipoKey); if (!tipo || !detalhe || typeof detalhe !== 'object') return {};
  const daEmpresa = camposDaEmpresa(tipoKey, rules); const out = {};
  for (const [k, def] of Object.entries(tipo.campos || {})) {
    if (!def.api || def.sensivel || def.somenteAssistente || NAO_REPETE.has(k) || ['data', 'competencia'].includes(def.tipo)) continue;
    if (daEmpresa && !daEmpresa.includes(k)) continue;
    let bruto;
    for (const c of [].concat(def.api)) { bruto = noDetalhe(detalhe, c); if (bruto != null && bruto !== '') break; }
    if (bruto == null || bruto === '') continue;
    let v = typeof bruto === 'object' ? texto1(bruto) : String(bruto);
    v = String(v || '').trim(); if (!v) continue;
    const mapa = def.apiValores || null;
    if (mapa) { const m = mapa[v] ?? mapa[v.toUpperCase()]; if (m != null) v = String(m); else if (def.tipo === 'radio') continue; }
    if (def.tipo === 'radio' && def.seletores && !Object.keys(def.seletores).some(o => norm(o) === norm(v))) continue;
    if (!mapa?.[v] && pareceCodigo(v)) continue;
    if (def.tipo === 'numero') { v = onlyDigits(v); if (!v) continue; }
    out[k] = v;
  }
  // Solicitação Geral: o assunto sai do catálogo pelo assunto antigo (sem a competência), nunca copiado
  if (tipoKey === 'geral') {
    const g = assuntoGeral(texto1(detalhe.subject), rules);
    if (g) { const it = rules.tipos.geral.catalogo.itens.find(x => x.id === g.id); out.assunto = it.assunto; if (!out.departamento) out.departamento = g.departamento; const d = renderTemplate(it.descricao || [], {}); if (d) out.descricao = d; }
  }
  return out;
}
/** Valores guardados no histórico: um cadastro enviado fica só com o nome, as datas da Agenda e os campos da empresa. */
export function valoresParaHistorico(tipoKey, valores, status, rules) {
  const lista = camposDaEmpresa(tipoKey, rules);
  const v = { ...(valores || {}) }; delete v.cid; delete v.descricao; delete v.observacoes;
  if (!lista || status !== 'enviado') return v;
  const manter = new Set([...lista, ...(cfgEmpresa(rules).historicoEnviado || [])]);
  return Object.fromEntries(Object.entries(v).filter(([k]) => manter.has(k) || k === 'assunto'));
}
/** Ajustes da empresa pelo trecho do nome (regras.empresas). */
export function ajustesDaEmpresa(rules, empresa) {
  const E1 = norm(empresa);
  const ent = E1 && Object.entries(rules?.empresas || {}).find(([k]) => k && !k.startsWith('_') && E1.includes(norm(k)));
  return ent ? ent[1] || {} : null;
}
/** Sugestões para um cadastro novo (o cliente confere e escolhe "Usar"): última admissão da empresa,
 *  padrões da empresa e experiência 45 + 45. Devolve { campo: { valor, conf, fonte } } só de campos da empresa. */
export function sugestoesCadastro(tipoKey, rules, { empresa = '', historico = [] } = {}) {
  const lista = camposDaEmpresa(tipoKey, rules); if (!lista) return {};
  const tipo = resolveTipo(rules, tipoKey); const out = {};
  const put = (k, v, conf, fonte) => { if (v == null || v === '' || out[k] || !tipo?.campos?.[k] || !lista.includes(k)) return; out[k] = { valor: String(v), conf, fonte }; };
  const ult = (historico || []).find(h => h.status === 'enviado' && h.tipo === tipoKey && h.empresa === empresa);
  if (ult) for (const [k, v] of Object.entries(valoresReaproveitaveis(tipoKey, ult.valores, rules))) put(k, v, 0.5, 'como na última admissão');
  const pad = ajustesDaEmpresa(rules, empresa)?.padroes || {};
  for (const [k, v] of Object.entries(pad)) if (v && typeof v === 'object') { if (k === tipoKey) for (const [k2, v2] of Object.entries(v)) put(k2, v2, 0.5, 'padrão da empresa'); }
  for (const [k, v] of Object.entries(pad)) if (typeof v !== 'object') put(k, v, 0.5, 'padrão da empresa');
  const xp = rules?.config?.experienciaSugerida;
  if (xp && (xp.tipos || ['cadastroEmpregado']).includes(tipoKey)) {
    put('contratoExperiencia', xp.contratoExperiencia, 0.4, `sugestão: ${xp.contratoExperiencia} + ${xp.prorrogacao} dias`);
    put('prorrogacao', xp.prorrogacao, 0.4, `sugestão: ${xp.contratoExperiencia} + ${xp.prorrogacao} dias`);
  }
  return out;
}

/* ---------------- Regras de prazo compartilhadas ---------------- */
/** Súmula 380 do TST (art. 132 do Código Civil): não conta o dia do aviso, conta o último. */
export const fimDoAviso = (dataAviso, dias = 30) => addDays(dataAviso, dias);
/** O inverso, com a mesma conta (regras: config.avisoPrevioContagem): último dia trabalhado → data do aviso.
 *  É a conta do formulário e do Calcular (antes o Calcular contava o dia do aviso: −29). */
export const inicioDoAviso = (fim, dias = 30) => addDays(fim, -dias);
/** Recua para o dia útil anterior (prazo de pagamento que cai no fim de semana ou feriado). */
export const diaUtilAntes = (d, cal) => { let x = d; for (let i = 0; i < 15 && !cal.isBusiness(x); i++) x = addDays(x, -1); return x; };
/** Pagamento das férias: config.pagamentoFeriasAntes dias antes do início (CLT 145), no dia útil anterior. */
export const pagamentoFerias = (inicio, rules, cal = makeCalendar(rules?.feriados)) => inicio ? diaUtilAntes(addDays(inicio, -(rules?.config?.pagamentoFeriasAntes ?? 2)), cal) : null;
/** Pagamento da rescisão: config.pagamentoRescisaoDias depois do fim do contrato (CLT 477 §6º), no dia útil anterior. */
export const pagamentoRescisao = (base, rules, cal = makeCalendar(rules?.feriados)) => base ? diaUtilAntes(addDays(base, rules?.config?.pagamentoRescisaoDias ?? 10), cal) : null;
/** Anos completos de casa numa data. */
export function anosCompletos(admissao, data) {
  let a = data.getFullYear() - admissao.getFullYear();
  if (data.getMonth() < admissao.getMonth() || (data.getMonth() === admissao.getMonth() && data.getDate() < admissao.getDate())) a--;
  return Math.max(0, a);
}
const SEM_AVISO = ['COM JUSTA CAUSA', 'EXPERIENCIA', 'TEMPO DETERMINADO', 'CULPA RECIPROCA'];
/** Dispensa por justa causa e fim de contrato não geram aviso prévio. */
export function temAviso(values, rules) {
  const m = norm(values.motivo || '');
  if (!m) return true;   // sem motivo escolhido, não dá para afirmar que não há aviso
  return !(rules?.config?.motivosSemAviso || SEM_AVISO).some(x => m.includes(norm(x)));
}
/** O proporcional vale a favor do empregado; quem pede demissão cumpre 30 dias (NT 184/2012 do MTE). */
export const avisoPeloEmpregador = (values) => norm(values.avisoDadoPor || '') !== 'EMPREGADO';
/** Os 15 primeiros dias pela empresa e o INSS a partir do 16º valem para doença e acidente
    (Lei 8.213/91, art. 60 §3º), não para maternidade, licença sem vencimento ou serviço militar. */
const COM_INSS = ['Doença', 'Acid. Trabalho', 'mesma doença', 'mesmo acid', 'Doença profissional'];
export function vaiAoInss(tipoAfastamento, rules) {
  const t = norm(tipoAfastamento || '');
  if (!t) return true;   // sem tipo escolhido, mantém o aviso geral
  return (rules?.tipos?.afastamento?.tiposComInss || COM_INSS).some(x => t.includes(norm(x)));
}

/* ---------------- Valores derivados ---------------- */
export function derived(tipoKey, values, rules) {
  const cal = makeCalendar(rules.feriados);
  const out = {};
  const ini = parseDate(values.inicioGozo), dias = +values.diasGozo || 0;
  if (ini && dias) {
    out.fimGozo = fmtDate(addDays(ini, dias - 1));
    out.retorno = fmtDate(addDays(ini, dias));
    // mesmos dias e o mesmo recuo para dia útil do Hoje (config.pagamentoFeriasAntes, config.avisoFeriasDias)
    out.pagamentoAte = fmtDate(pagamentoFerias(ini, rules, cal));
    out.avisoAte = fmtDate(addDays(ini, -(rules.config?.avisoFeriasDias ?? 30)));
  }
  const afa = parseDate(values.dataAfastamento), diasAfa = +values.dias || 0;
  if (diasAfa) out.diasTexto = diasAfa === 1 ? '1 dia' : `${diasAfa} dias`;
  if (afa && diasAfa) { out.dataRetorno = fmtDate(addDays(afa, diasAfa)); if (diasAfa > 15 && vaiAoInss(values.tipoAfastamento, rules)) out.inicioInss = fmtDate(addDays(afa, 15)); }
  const dem = parseDate(values.dataDemissao);
  if (dem) out.pagamentoAte = fmtDate(pagamentoRescisao(dem, rules, cal));
  const anos = +values.anosEmpresa;
  // proporcional (Lei 12.506/2011) é direito do empregado: só quando a empresa demite
  if (!isNaN(anos) && values.anosEmpresa !== '' && values.anosEmpresa != null && temAviso(values, rules)) {
    out.diasAviso = avisoPeloEmpregador(values) ? String(Math.min(90, 30 + 3 * Math.max(0, Math.floor(anos)))) : '30';
  }
  const avisoEm = parseDate(values.dataAviso) || parseDate(values.dataAvisoPrevio);
  if (dem || avisoEm) {
    const base = avisoEm || dem;
    const d = +out.diasAviso || 30;
    if (base && temAviso(values, rules)) out.fimAviso = fmtDate(fimDoAviso(base, d));
  }
  const tipo = resolveTipo(rules, tipoKey);
  if (tipo?.complexidade) out.diasUteis = String(rules.config?.prazoInternoDiasUteis?.[tipo.complexidade] ?? '');
  return out;
}

/* ---------------- Datas que dá para calcular (tipos.*.calculados) ----------------
   Cada regra: { campo, formula, de?, dias? (número ou "config.chave"), diaUtil?: 'antes', se?, explicacao? }
   formula: 'hoje' | 'diasAntes' | 'diasDepois' | 'prazoDoPedido' (prazo interno do escritório em dias úteis) |
   'demissaoPeloAviso' (trabalhado: fim do aviso; indenizado/dispensa: a data do aviso) | 'avisoPelaDemissao' (o inverso).
   config.expectativaConclusao liga a Expectativa de conclusão em todos os pedidos que têm o campo.
   Devolve { campo: { valor, explicacao } }; a tela usa só em campo vazio e não mexido pelo cliente. */
export function sugeridos(tipoKey, values, rules, hoje = today(), cal = makeCalendar(rules?.feriados)) {
  const tipo = resolveTipo(rules, tipoKey); if (!tipo) return {};
  const c = rules?.config || {};
  const num = (x) => (typeof x === 'string' && x.startsWith('config.') ? +c[x.slice(7)] : +x) || 0;
  const regras = Object.values(tipo.calculados || {}).filter(r => r?.campo && tipo.campos[r.campo]);
  const ec = c.expectativaConclusao;
  if (ec && ec.ativo !== false && tipo.campos.conclusao && !regras.some(r => r.campo === 'conclusao')) regras.push({ campo: 'conclusao', formula: 'prazoDoPedido', explicacao: ec.explicacao });
  const out = {};
  for (const r of regras) {
    if (r.se && !matchCond(r.se, values)) continue;
    const base = parseDate(values[r.de]);
    const ta = norm(values.tipoAviso || '');
    let d = null;
    switch (r.formula) {
      case 'hoje': d = hoje; break;
      case 'diasAntes': case 'subtrairDias': if (base) d = addDays(base, -num(r.dias)); break;
      case 'diasDepois': case 'somarDias': if (base) d = addDays(base, num(r.dias)); break;
      case 'prazoDoPedido': d = cal.addBusinessDays(hoje, num(r.dias) || c.prazoInternoDiasUteis?.[tipo.complexidade] || 3); break;
      case 'demissaoPeloAviso': if (base && ta && temAviso(values, rules)) d = ta === 'TRABALHADO' ? fimDoAviso(base, num(r.dias) || 30) : base; break;
      case 'avisoPelaDemissao': if (base && ta && temAviso(values, rules)) d = ta === 'TRABALHADO' ? inicioDoAviso(base, num(r.dias) || 30) : base; break;
      default: break;
    }
    if (!d) continue;
    if (r.diaUtil === 'antes') d = diaUtilAntes(d, cal);
    out[r.campo] = { valor: fmtDate(d), explicacao: r.explicacao || '' };
  }
  return out;
}
/** 1ª data de início de férias que vale (a partir de `aPartir`): dia útil fora dos 2 dias antes de domingo ou feriado. */
export function primeiroInicioFerias(aPartir, rules, cal = makeCalendar(rules?.feriados)) {
  let d = aPartir;
  for (let i = 0; i < 60; i++, d = addDays(d, 1)) {
    if (!cal.isBusiness(d)) continue;
    if ([1, 2].some(n => { const x = addDays(d, n); return x.getDay() === 0 || cal.isHoliday(x); })) continue;
    return d;
  }
  return aPartir;
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
/** Tira do texto as opções de formulário que NÃO estão marcadas: "(X) Doença ( ) Acidente do trabalho" → "(X) Doença".
 *  Formulários impressos trazem todas as opções escritas; só a marcada diz alguma coisa. */
export function semOpcoesDesmarcadas(text) {
  const MARCA = /([(\[]\s*(?:[xX✓✔☒■▣])?\s*[)\]])/;
  return String(text || '').split(/\n/).map(l => {
    const partes = l.split(MARCA);
    if (partes.length < 3) return l;
    let out = partes[0];
    for (let i = 1; i < partes.length; i += 2) if (/[xX✓✔☒■▣]/.test(partes[i])) out += partes[i] + partes[i + 1];
    return out;
  }).join('\n');
}
export function inferTipoAfastamento(text, dias, docId, regras) {
  // linhas que são só uma opção de formulário ("( ) doença", "U acidente do trabalho") e opções desmarcadas não dizem nada
  const T = plain(semOpcoesDesmarcadas(text).split(/\n/).filter(l => !(l.trim().length < 34 && /^\W{0,4}[a-zà-úA-ZÀ-Ú]?\W{0,4}\s*(doen[cç]a|acidente d[eo] trabalho|acidente de trajeto|outros?)\s*\W*$/i.test(l.trim()))).join('\n'));
  const n = parseInt(dias, 10);
  for (const r of regras || []) {
    const porPalavra = r.palavras?.length && r.palavras.some(w => T.includes(plain(w)));
    const porDocumento = r.documentos?.length && docId && r.documentos.includes(docId);
    if (!porPalavra && !porDocumento) continue;
    if (r.nenhum) return null;          // caso que o escritório decide (ex.: atestado de acompanhante)
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
    // só conta como anexado o que está mesmo no portal: o que está só na lista do
    // Assistente ainda não foi para a solicitação (pendente)
    const has = (anexos || []).some(f => anexoCasa(a, f) && !f.pendente);
    const soNoAssistente = !has && (anexos || []).find(f => anexoCasa(a, f) && f.pendente);
    const temAlgum = (anexos || []).some(f => !f.pendente);
    // falta a carta e há modelo dela (anexos[].modelo, só quando modeloSe vale): a tela oferece "Gerar pelo modelo"
    const modelo = a.modelo && (!a.modeloSe || matchCond(a.modeloSe, values)) ? a.modelo : null;
    const n0 = res.length;
    if (has) add('ok', 'Anexos', `${a.rotulo} anexado`);
    else if (soNoAssistente) add('erro', 'Anexos', (rules?.mensagens?.anexoSoNoAssistente || 'O arquivo “{arquivo}” ainda não foi anexado no portal. Clique em “Preencher no portal” ou anexe-o direto na solicitação.').replace('{arquivo}', soNoAssistente.nome));
    else if (a.obrigatorio) add(temAlgum ? 'atencao' : 'erro', 'Anexos', temAlgum ? `Confira se o anexo inclui: ${a.rotulo}` : `Anexe: ${a.rotulo}`);
    else add('info', 'Anexos', `Se tiver, anexe: ${a.rotulo}`);
    if (!has && !soNoAssistente && modelo && res[n0]) Object.assign(res[n0], { modelo, anexo: a.id });
  }
  // ASO anexado (em qualquer pedido): INAPTO é erro; exame de outro tipo, admissional depois da admissão e demissional
  // longe do término (NR-7) são atenção — regras: config.aso
  for (const v of verificarAso(tipoKey, values, anexos, rules)) add(v.nivel, 'Documento', v.mensagem, v.campo);

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

/** Pontos de cada pedido (intencoes) no texto: palavras inteiras (mais as de config.abaErrada do mesmo tipo),
 *  radicais ("demit" casa demitido), uma letra trocada em palavras de 5 letras ou mais, peso por palavra
 *  (intencoes[].pesos) e trechos que não contam para o pedido (intencoes[].excluir, ex.: "folha de pagamento"). */
export function pontuarIntencoes(text, rules) {
  const base = ' ' + norm(text) + ' ';
  const extra = new Map();
  for (const e of rules?.config?.abaErrada || []) extra.set(e.tipo, [...(extra.get(e.tipo) || []), ...(e.palavras || [])]);
  const out = [];
  for (const it of rules?.intencoes || []) {
    if (it.tipo === 'geral') continue;
    let T = base;
    for (const x of it.excluir || []) { const X = norm(x); if (X) T = T.split(' ' + X + ' ').join(' # '); }
    const toks = T.split(' ').filter(Boolean);
    const pesos = new Map(Object.entries(it.pesos || {}).map(([k, v]) => [norm(k), +v || 1]));
    const peso = (P) => pesos.get(P) ?? 1;
    let pontos = 0; const achou = [];
    for (const P of new Set([...(it.palavras || []), ...(extra.get(it.tipo) || [])].map(norm).filter(Boolean))) {
      if (T.includes(' ' + P + ' ')) { pontos += peso(P); achou.push(P); continue; }
      // erro de digitação: uma letra a mais, a menos ou trocada, só em palavras de 5 letras ou mais
      if (!P.includes(' ') && P.length >= 5 && toks.some(x => x.length >= 5 && Math.abs(x.length - P.length) <= 1 && lev(x, P) === 1)) { pontos += 0.8 * peso(P); achou.push(P + '~'); }
    }
    for (const r of it.radicais || []) {
      const R = norm(String(r).replace(/\*$/, ''));
      if (R && toks.some(x => x.startsWith(R))) { pontos += peso(R); achou.push(R + '*'); }
    }
    const ja = out.find(x => x.tipo === it.tipo);
    if (ja) { if (pontos > ja.pontos) Object.assign(ja, { pontos, achou, intencao: it }); }
    else out.push({ tipo: it.tipo, pontos, achou, intencao: it });
  }
  return out.sort((a, b) => b.pontos - a.pontos);
}

/** Pedido mais provável do texto. Empate de verdade (mesma pontuação) vem em `empate` para o cliente escolher. */
export function suggestTipoByText(text, rules, atual) {
  const T = ' ' + norm(text) + ' ';
  if (T.trim().length < 4) return null;
  const l = pontuarIntencoes(text, rules).filter(x => x.tipo !== atual && x.pontos > 0);
  // ficha colada ("Nome: … CPF: … Nome da mãe: …") abre o Cadastro mesmo sem a palavra admissão
  if (!atual && (!l.length || (!CADASTROS.includes(l[0].tipo) && l[0].pontos < 3))) {
    const n = fichaColada(text, rules);
    if (n && (!l.length || l[0].pontos < n)) return { tipo: 'cadastroEmpregado', hits: n, pontos: n, ficha: true, intencao: (rules?.intencoes || []).find(i => i.tipo === 'cadastroEmpregado') || null };
  }
  if (!l.length) {
    // nenhum pedido com aba própria: a Solicitação Geral, se o catálogo (tipos.geral.catalogo) reconhece o assunto
    const g = atual !== 'geral' ? assuntoGeral(text, rules) : null;
    return g ? { tipo: 'geral', hits: 1, pontos: 1, geral: g, intencao: (rules?.intencoes || []).find(i => i.tipo === 'geral') || null } : null;
  }
  const best = l[0];
  const empate = l.filter(x => x !== best && Math.abs(x.pontos - best.pontos) < 0.01).map(x => x.tipo);
  return { tipo: best.tipo, hits: best.pontos, pontos: best.pontos, intencao: best.intencao, ...(empate.length ? { empate: [best.tipo, ...empate] } : {}) };
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
const escR = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* As palavras do texto livre ficam em config.textoLivre (regras); aqui só o mínimo para regras antigas. */
const TL_PADRAO = {
  sentidoDatas: 'futuro', naoEhDiaDaSemana: ['via', 'parcela', 'vez', 'opcao', 'quinzena'], passado: ['passada', 'passado', 'ultima', 'ultimo'],
  proximo: ['que vem', 'proxima', 'proximo', 'seguinte'], prazo: ['preciso ate', 'prazo', 'urgente ate'],
  correcao: ['na verdade', 'alias', 'ou melhor', 'errei'], descartaAntes: ['daqui a', 'daqui', 'ha', 'faz'], descartaDepois: ['atras', 'antes', 'de antecedencia', 'uteis'],
  abono: { verbos: ['vender', 'vende', 'abono de'], sim: ['com abono'], nao: ['sem abono'] }, gozoVerbos: ['tirar', 'gozar', 'por'], abonoPadraoDias: 10,
  decimoTerceiro: { palavras: ['13º', '13o', 'decimo terceiro', '13 salario'], nao: ['sem adiantar', 'nao adiantar'] },
  pergunta: ['como', 'posso', 'qual', 'quando'], palavrasVazias: [], apelidos: {},
  competencia: { passado: ['mes passado'], atual: ['este mes', 'mes atual'], proximo: ['mes que vem'] }, adiantamento: ['adiantamento', 'vale salarial'],
  tipoAviso: { 'AUSÊNCIA/DISPENSA': ['aviso dispensado', 'dispensa do aviso', 'dispensa do cumprimento', 'ausencia'], INDENIZADO: ['indenizad*'], TRABALHADO: ['trabalhad*'] }
};
const tl = (rules) => ({ ...TL_PADRAO, ...(rules?.config?.textoLivre || {}) });

/** Expressão regular de uma lista de palavras (sem acento); "radical*" casa o começo da palavra. */
function rxTermos(lista) {
  const alts = [...new Set((lista || []).map(p => plain(p).trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
    .map(p => p.endsWith('*') ? escR(p.slice(0, -1)).replace(/\s+/g, '\\s+') + '[a-z]*' : escR(p).replace(/\s+/g, '\\s+'));
  return alts.length ? `(?:${alts.join('|')})` : null;
}
/** O texto (já sem acento) tem alguma das palavras, inteira? */
export function temTermo(t, lista) {
  const r = rxTermos(lista);
  return !!r && new RegExp(`(?:^|[^a-z0-9])${r}(?=$|[^a-z0-9])`).test(plain(t));
}

/* ---------- Quantidades: algarismos ou por extenso ---------- */
const UNID = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 };
const DEZ = { dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 };
const DEZENAS = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
const porTamanho = (o) => Object.keys(o).sort((a, b) => b.length - a.length);
const RX_NUM = `(?:\\d{1,3}|(?:${porTamanho(DEZENAS).join('|')})(?:\\s+e\\s+(?:${porTamanho(UNID).join('|')}))?|${[...porTamanho(DEZ), ...porTamanho(UNID), 'cem'].join('|')})(?![a-z])`;
/** "vinte e cinco" → 25; "12" → 12; o que não for número → null. */
export function numeroPorExtenso(s) {
  const x = plain(s).trim().replace(/\s+/g, ' ');
  if (/^\d+$/.test(x)) return +x;
  const m = x.match(/^([a-z]+)(?: e ([a-z]+))?$/);
  if (!m) return null;
  if (DEZENAS[m[1]]) return m[2] ? (UNID[m[2]] ? DEZENAS[m[1]] + UNID[m[2]] : null) : DEZENAS[m[1]];
  if (m[2]) return null;
  return DEZ[m[1]] ?? UNID[m[1]] ?? (m[1] === 'cem' ? 100 : null);
}
/**
 * Quantidades de dias (semanas, meses, anos) e o papel de cada uma pela palavra vizinha:
 * 'abono' ("vender 10", "10 dias de abono", "1/3", "um terço"), 'descartar' ("daqui a 15 dias", "30 dias de antecedência")
 * ou 'gozo' (o resto: "tirar 20", "por 30", "20 dias"). Semana = 7 e mês = 30 vêm como sugestão (aprox).
 */
export function lerQuantidades(text, rules) {
  const c = tl(rules); const t = plain(String(text || '').normalize('NFC')); const out = [];
  const rAntes = rxTermos(c.descartaAntes), rDepois = rxTermos(c.descartaDepois), rAbono = rxTermos(c.abono?.verbos), rGozo = rxTermos(c.gozoVerbos);
  const fimCom = (s, r) => !!r && new RegExp(`(?:^|[^a-z0-9])${r}\\s*(?:de\\s+|a\\s+)?$`).test(s);
  const papel = (i, fim) => {
    const antes = t.slice(Math.max(0, i - 30), i), depois = t.slice(fim, fim + 30);
    if (fimCom(antes, rAntes) || (rDepois && new RegExp(`^\\s*${rDepois}(?![a-z])`).test(depois))) return 'descartar';
    if (fimCom(antes, rAbono) || /^\s*(?:de\s+)?abono/.test(depois)) return 'abono';
    return 'gozo';
  };
  const usados = [];
  for (const m of t.matchAll(new RegExp(`(?<![a-z0-9/,.])(${RX_NUM})\\s*(dias?|semanas?|mes|meses|anos?)(?![a-z])`, 'g'))) {
    const n0 = numeroPorExtenso(m[1]); if (n0 == null) continue;
    const u = m[2].startsWith('dia') ? 'dias' : m[2].startsWith('semana') ? 'semanas' : m[2].startsWith('ano') ? 'anos' : 'meses';
    const n = u === 'semanas' ? n0 * 7 : u === 'meses' ? n0 * 30 : n0;
    out.push({ n, unidade: u === 'anos' ? 'anos' : 'dias', aprox: u === 'semanas' || u === 'meses', papel: papel(m.index, m.index + m[0].length), idx: m.index, fim: m.index + m[0].length });
    usados.push([m.index, m.index + m[0].length]);
  }
  // "tirar 20", "vender 10", "por 30": número sem a palavra dias, logo depois do verbo
  const verbos = [rAbono, rGozo].filter(Boolean).join('|');
  if (verbos) for (const m of t.matchAll(new RegExp(`(?<![a-z0-9])(${verbos})\\s+(?:os\\s+|as\\s+)?(${RX_NUM})`, 'g'))) {
    const i = m.index + m[0].length - m[2].length;
    if (usados.some(([a, b]) => i >= a && i < b) || /^\s*(?:[/.,-]\d|de\s+[a-z]|dias?|semanas?|mes|meses|anos?|horas?|reais|%)/.test(t.slice(m.index + m[0].length))) continue;
    const n = numeroPorExtenso(m[2]); if (n == null) continue;
    out.push({ n, unidade: 'dias', aprox: false, papel: rAbono && new RegExp(`^${rAbono}$`).test(m[1]) ? 'abono' : 'gozo', idx: i, fim: m.index + m[0].length });
  }
  // "vender 1/3", "um terço de abono": abono sem número (o Assistente sugere)
  for (const m of t.matchAll(/(?<![\d/])(?:1\s*\/\s*3|um\s+terco|1\s+terco)(?![\d/])/g)) out.push({ n: null, unidade: 'dias', papel: 'abono', terco: true, idx: m.index, fim: m.index + m[0].length });
  return out.sort((a, b) => a.idx - b.idx);
}

/* ---------- Datas ---------- */
/**
 * Datas do texto, de vários jeitos, com a posição: "10/11", "3 de novembro", "1º de dez.", "hoje", "ontem",
 * "segunda passada", "sexta que vem", "dia 13", "dia 5 do mês que vem", "daqui a 15 dias", "semana que vem".
 * sentido (regras: tipos.*.sentidoDatas) decide para que lado vai uma data sem ano/mês/semana:
 *  'futuro' (padrão: a próxima), 'passado' (a mais recente; afastamento) ou 'perto' (a mais perto de hoje; rescisão).
 * Datas depois de "preciso até"/"prazo" (config.textoLivre.prazo) vêm com prazo = true e olham sempre para a frente.
 * Também devolve os intervalos ("de 03/11 a 22/11", "entre X e Y", "de 3 a 22 de novembro").
 */
export function analisarDatas(text, hoje = today(), { sentido = 'futuro', rules } = {}) {
  const c = tl(rules); const t = plain(String(text || '').normalize('NFC'));
  const out = []; const ocupado = [];
  const livre = (i, f) => !ocupado.some(([a, b]) => i < b && f > a);
  const rPrazo = rxTermos(c.prazo);
  const rePrazo = rPrazo ? new RegExp(`(?:^|[^a-z0-9])${rPrazo}\\s*[:,]?\\s*(?:(?:o|a|no|na|para|pra|dia|de|ate|em)\\s+){0,3}$`) : null;
  const ehPrazo = (i) => !!rePrazo && rePrazo.test(t.slice(Math.max(0, i - 40), i));
  const add = (idx, fim, d, extra = {}) => {
    if (!d || isNaN(d) || !livre(idx, fim)) return;
    out.push({ idx, fim, d, prazo: ehPrazo(idx), ...extra }); ocupado.push([idx, fim]);
  };
  const sentidoEm = (i) => ehPrazo(i) ? 'futuro' : sentido;
  const escolher = (cands, s, tol) => {
    const l = cands.filter(Boolean).sort((a, b) => a - b);
    if (!l.length) return null;
    if (s === 'passado') { const ok = l.filter(d => d <= addDays(hoje, tol)); return ok.length ? ok[ok.length - 1] : l[0]; }
    return l.reduce((a, b) => Math.abs(diffDays(hoje, b)) <= Math.abs(diffDays(hoje, a)) ? b : a);   // perto (empate: a de depois)
  };
  /** dia/mês sem ano */
  const semAno = (dia, mi, s) => {
    const y = hoje.getFullYear();
    if (s === 'futuro') { let d = dataValida(y, mi, dia); if (d && d < addDays(hoje, -60)) d = dataValida(y + 1, mi, dia); return d; }
    return escolher([y - 1, y, y + 1].map(a => dataValida(a, mi, dia)), s, 60);
  };
  const anoDe = (s) => { let y = +s; if (y < 100) y += 2000; return y; };
  const numDia = (s) => s === 'primeiro' ? 1 : +s;
  const ORD = '(?:º|°|o(?![a-z]))?';

  // 10/11, 10/11/2026, 10.11.2026, 10-11-2026 (ponto e traço só com o ano; "1/3" perto de vender/abono é um terço)
  for (const m of t.matchAll(/(?<![\d/.,-])(\d{1,2})(?:º|°)?([/.-])(\d{1,2})(?:\2(\d{4}|\d{2}))?(?![\d]|[/.-]\d)/g)) {
    if (!m[4] && m[2] !== '/') continue;
    if (!m[4] && m[1] === '1' && m[3] === '3' && /(vend|abono|terco|conver)\w*\s*(?:de\s+|o\s+)?$/.test(t.slice(Math.max(0, m.index - 25), m.index))) continue;
    const mi = +m[3] - 1;
    const d = m[4] ? dataValida(anoDe(m[4]), mi, +m[1]) : semAno(+m[1], mi, sentidoEm(m.index));
    add(m.index, m.index + m[0].length, d, { ano: !!m[4] });
  }
  // 3 de novembro, 1º de dez., 22 nov 2026 (mês abreviado só se for o começo do nome do mês)
  for (const m of t.matchAll(new RegExp(`(?<![a-z0-9/])(\\d{1,2}|primeiro)${ORD}\\s*(?:de\\s+|/\\s*|-\\s*|\\s)\\s*([a-z]{3,9})\\.?(?:\\s*(?:de\\s+|/\\s*|-\\s*)(\\d{4}))?(?![a-z0-9])`, 'g'))) {
    const mi = MESES.findIndex(x => x.startsWith(m[2]));
    if (mi < 0) continue;
    const d = m[3] ? dataValida(+m[3], mi, numDia(m[1])) : semAno(numDia(m[1]), mi, sentidoEm(m.index));
    add(m.index, m.index + m[0].length, d, { ano: !!m[3] });
  }
  for (const m of t.matchAll(/(?<![a-z])(depois de amanha|anteontem|hoje|amanha|ontem)(?![a-z])/g)) add(m.index, m.index + m[0].length, addDays(hoje, { hoje: 0, amanha: 1, ontem: -1, 'depois de amanha': 2, anteontem: -2 }[m[1]]));
  // daqui a 15 dias, daqui a uma semana
  for (const m of t.matchAll(new RegExp(`(?<![a-z])daqui\\s+(?:a\\s+)?(${RX_NUM})\\s*(dias?|semanas?)(?![a-z])`, 'g'))) {
    const n = numeroPorExtenso(m[1]); if (n != null) add(m.index, m.index + m[0].length, addDays(hoje, m[2].startsWith('semana') ? n * 7 : n));
  }
  // dias da semana: "segunda" (pelo sentido), "segunda passada", "próxima sexta", "quarta que vem"; "segunda via/parcela" não é data
  const rPas = rxTermos(c.passado), rProx = rxTermos(c.proximo);
  const pre = [rPas, rProx, '(?:esta|nesta|essa|nessa)'].filter(Boolean).join('|');
  const pos = [rPas, rProx].filter(Boolean).join('|');
  const reSem = new RegExp(`(?<![a-z])(?:(${pre})\\s+)?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(-feira|\\s+feira)?(?:\\s+(?:da\\s+|na\\s+)?(?:semana\\s+)?(${pos || 'x^'}))?(?![a-z])`, 'g');
  const naoSemana = new Set((c.naoEhDiaDaSemana || []).map(plain));
  for (const m of t.matchAll(reSem)) {
    const fim = m.index + m[0].length;
    if (!m[3] && !m[1] && !m[4]) {
      const prox = t.slice(fim).match(/^\s+(?:de\s+|do\s+|da\s+)?([a-z]+)/)?.[1];
      if (prox && naoSemana.has(prox)) continue;
    }
    const alvo = DIAS_SEMANA.indexOf(m[2]);
    const mod = m[1] || m[4] || '';
    const antes = () => { let d = addDays(hoje, -1); while (d.getDay() !== alvo) d = addDays(d, -1); return d; };
    const depois = () => { let d = addDays(hoje, 1); while (d.getDay() !== alvo) d = addDays(d, 1); return d; };
    const ateHoje = () => { let d = hoje; while (d.getDay() !== alvo) d = addDays(d, -1); return d; };
    let d;
    if (rPas && new RegExp(`^${rPas}$`).test(mod)) d = antes();
    else if (rProx && new RegExp(`^${rProx}$`).test(mod)) d = depois();
    else {
      const s = sentidoEm(m.index);
      if (s === 'passado') d = ateHoje();
      else if (s === 'perto') { const a = ateHoje(), b = depois(); d = diffDays(a, hoje) < diffDays(hoje, b) ? a : b; }
      else d = depois();
    }
    add(m.index, fim, d);
  }
  // "semana que vem" sozinha: a segunda-feira da próxima semana
  for (const m of t.matchAll(/(?<![a-z])(?:na\s+|da\s+)?semana\s+que\s+vem(?![a-z])/g)) {
    let d = addDays(hoje, 1); while (d.getDay() !== 1) d = addDays(d, 1);
    add(m.index, m.index + m[0].length, d, { aprox: true });
  }
  // dia 13, dia 1º, dia primeiro, dia 5 do mês que vem
  for (const m of t.matchAll(new RegExp(`(?<![a-z])dia\\s+(\\d{1,2}|primeiro)${ORD}(?!\\s*(?:[/.-]\\s*\\d|de\\s+[a-z]))(?:\\s+(?:do|deste|desse|neste|nesse)\\s+(mes que vem|proximo mes|mes passado|mes anterior|mes atual|mes))?(?![a-z0-9])`, 'g'))) {
    const n = numDia(m[1]); const y = hoje.getFullYear(), mo = hoje.getMonth();
    let d;
    if (m[2]) { const desl = /que vem|proximo/.test(m[2]) ? 1 : /passado|anterior/.test(m[2]) ? -1 : 0; const r = new Date(y, mo + desl, 1); d = dataValida(r.getFullYear(), r.getMonth(), n); }
    else {
      // "dia 31" num mês de 30 dias não vira 01 do mês seguinte: sem data, o cliente confirma
      d = dataValida(y, mo, n);
      const s = sentidoEm(m.index);
      if (d && s === 'futuro' && d < hoje) { const prox = new Date(y, mo + 1, 1); d = dataValida(prox.getFullYear(), prox.getMonth(), n); }   // dezembro → janeiro do ano seguinte
      else if (d && s !== 'futuro') d = escolher([-1, 0, 1].map(k => { const r = new Date(y, mo + k, 1); return dataValida(r.getFullYear(), r.getMonth(), n); }), s, 7);
    }
    add(m.index, m.index + m[0].length, d, m[2] ? {} : { diaSolto: n });
  }
  out.sort((a, b) => a.idx - b.idx);
  // intervalos: "de 03/11 a 22/11", "do dia 3 ao dia 22", "entre 03/11 e 22/11", "de 3 a 22 de novembro"
  const intervalos = [];
  for (let k = 0; k < out.length; k++) {
    const b = out[k]; if (b.prazo || b.noIntervalo) continue;
    const a = out[k - 1];
    const meio = a && !a.prazo && !a.noIntervalo ? t.slice(a.fim, b.idx) : null;
    let ini = null;
    if (meio != null && (/^\s*(?:a|ate|ao|-)\s*(?:o\s+)?(?:dia\s+)?$/.test(meio)
      || (/^\s*e\s+(?:o\s+)?(?:dia\s+)?$/.test(meio) && /entre\s+(?:o\s+|os\s+)?(?:dias?\s+)?$/.test(t.slice(Math.max(0, a.idx - 20), a.idx))))) ini = a;
    else {
      const mm = t.slice(0, b.idx).match(new RegExp(`(?<![a-z0-9/])(?:de|do|do dia|desde o dia|entre|entre os dias|entre o dia|dos dias)\\s+(\\d{1,2})${ORD}\\s+(?:a|ate|ao|e)\\s+(?:o\\s+)?(?:dia\\s+)?$`));
      if (mm) {
        let d = dataValida(b.d.getFullYear(), b.d.getMonth(), +mm[1]);
        if (d && d > b.d) { const r = new Date(b.d.getFullYear(), b.d.getMonth() - 1, 1); d = dataValida(r.getFullYear(), r.getMonth(), +mm[1]); }
        if (d) ini = { idx: mm.index, fim: mm.index + mm[0].length, d, prazo: false, solto: true };
      }
    }
    if (!ini) continue;
    // "dia 3" de um lado e uma data com mês do outro: o "dia" fica no mesmo mês (ou no seguinte, no fim)
    if (ini.diaSolto && !b.diaSolto) { let d = dataValida(b.d.getFullYear(), b.d.getMonth(), ini.diaSolto); if (d && d > b.d) { const r = new Date(b.d.getFullYear(), b.d.getMonth() - 1, 1); d = dataValida(r.getFullYear(), r.getMonth(), ini.diaSolto); } if (d) ini.d = d; }
    if (b.diaSolto) { let d = dataValida(ini.d.getFullYear(), ini.d.getMonth(), b.diaSolto); if (d && d < ini.d) { const r = new Date(ini.d.getFullYear(), ini.d.getMonth() + 1, 1); d = dataValida(r.getFullYear(), r.getMonth(), b.diaSolto); } if (d) b.d = d; }
    let fimD = b.d;
    if (fimD < ini.d && b.ano === false) fimD = new Date(fimD.getFullYear() + 1, fimD.getMonth(), fimD.getDate());
    if (fimD < ini.d) continue;
    b.d = fimD; ini.noIntervalo = true; b.noIntervalo = true;
    intervalos.push({ ini: ini.d, fim: fimD, dias: diffDays(ini.d, fimD) + 1, idx: ini.idx, ate: b.fim });
    if (ini.solto) { out.splice(k, 0, ini); k++; }
  }
  return { lista: out, intervalos };
}

/** Encontra datas escritas de vários jeitos, na ordem em que aparecem (sem repetir). */
export function findDates(text, hoje = today(), opts = {}) {
  const seen = new Set();
  return analisarDatas(text, hoje, opts).lista.filter(x => { const k = iso(x.d); if (seen.has(k)) return false; seen.add(k); return true; }).map(x => x.d);
}

/* ---------- Cartões de escolha (regras: config.textoLivre.escolhas) ---------- */
const ESCOLHAS_PADRAO = [
  { id: 'ferias', titulo: 'Aviso ou cálculo?', tipos: ['avisoFerias', 'calculoFerias'], ajuda: { avisoFerias: 'Comunicar as datas para o escritório emitir o aviso de férias (com 30 dias de antecedência).', calculoFerias: 'Pedir o cálculo e o recibo das férias para o pagamento (até 2 dias antes do início).' }, destaque: { avisoFerias: { aviso: 2 }, calculoFerias: { 'calcul*': 2, recibo: 2, pagar: 1, pagamento: 1 } } },
  { id: 'rescisao', titulo: 'Aviso ou cálculo?', tipos: ['avisoRescisao', 'calculoRescisao'], ajuda: { avisoRescisao: 'Comunicar a demissão ou o pedido de demissão e emitir o aviso prévio.', calculoRescisao: 'Pedir o cálculo das verbas rescisórias (TRCT) para o pagamento em até 10 dias.' }, destaque: { avisoRescisao: { aviso: 2 }, calculoRescisao: { 'calcul*': 2, verbas: 2, trct: 2, recibo: 1, pagar: 1, pagamento: 1 } }, naoContam: ['aviso indenizado', 'aviso trabalhado', 'aviso previo indenizado', 'aviso previo trabalhado'] }
];
export function escolhasTexto(rules) {
  const l = rules?.config?.textoLivre?.escolhas;
  return Array.isArray(l) && l.length ? l : ESCOLHAS_PADRAO;
}
const semTrechos = (t, lista) => { let s = ' ' + plain(t) + ' '; for (const x of lista || []) { const r = rxTermos([x]); if (r) s = s.replace(new RegExp(`(^|[^a-z0-9])${r}(?=$|[^a-z0-9])`, 'g'), '$1 '); } return s; };
/** Cartão de escolha que vale para o texto: o da família do pedido (aviso ou cálculo), o de uma palavra ("faltou")
 *  ou, num empate de verdade, um cartão com os pedidos empatados. null quando não há o que perguntar. */
export function escolhaPara(text, rules, sug = suggestTipoByText(text, rules, null)) {
  for (const e of escolhasTexto(rules)) {
    if (!e.quando) continue;
    const t = semTrechos(text, e.quando.naoContam);
    if (temTermo(t, [...(e.quando.palavras || []), ...(e.quando.radicais || []).map(r => String(r).replace(/\*?$/, '*'))]) && !temTermo(t, e.quando.exceto)) return e;
  }
  for (const e of escolhasTexto(rules)) {
    if (e.quando || !sug?.tipo || !e.tipos?.includes(sug.tipo)) continue;
    if ((sug.empate || []).every(x => e.tipos.includes(x))) return e;
  }
  if (sug?.empate?.length > 1) {
    const it = (k) => (rules.intencoes || []).find(i => i.tipo === k);
    return { id: 'empate', titulo: 'Qual pedido?', pergunta: 'O texto serve para mais de um pedido. Qual você quer abrir?', tipos: sug.empate, ajuda: Object.fromEntries(sug.empate.map(k => [k, it(k)?.subtitulo || ''])) };
  }
  return null;
}
/** Dentro de um cartão de escolha, a opção que o texto destaca pelos pesos (escolha.destaque); "aviso indenizado"
 *  (escolha.naoContam) não conta como aviso. null no empate ou sem nada. */
export function destaqueEscolha(text, escolha) {
  const t = semTrechos(text, escolha?.naoContam);
  const pts = Object.entries(escolha?.destaque || {}).map(([tipo, mapa]) => [tipo, Object.entries(mapa).reduce((s, [p, w]) => s + (temTermo(t, [p]) ? (+w || 1) : 0), 0)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  if (!pts.length || (pts[1] && pts[1][1] === pts[0][1])) return null;
  return pts[0][0];
}

/* ---------- Funcionário: palpite para perguntar (apelido, sobrenome único, uma letra de diferença) ---------- */
function vocabulario(rules) {
  const c = tl(rules); const v = new Set([...(c.palavrasVazias || []), ...(c.naoSaoNomes || []), ...MESES, ...DIAS_SEMANA, ...Object.keys(UNID), ...Object.keys(DEZ), ...Object.keys(DEZENAS)].map(plain));
  const juntar = (l) => (l || []).forEach(p => plain(p).split(/[^a-z0-9]+/).forEach(x => x && v.add(x)));
  for (const it of rules?.intencoes || []) { juntar(it.palavras); juntar(it.radicais); }
  for (const e of rules?.config?.abaErrada || []) juntar(e.palavras);
  return v;
}
/** Palavra do texto original que corresponde ao trecho sem acento (para mostrar "Ronado" e não "ronado"). */
function palavraOriginal(text, p) {
  const src = String(text || '').normalize('NFC');
  const m = plain(src).match(new RegExp(`(?<![a-z])${escR(p)}(?![a-z])`));
  return m ? src.slice(m.index, m.index + p.length) : p;
}
/** Quando o nome não foi achado do jeito normal: { nome, porque: 'apelido'|'sobrenome'|'parecido', trecho }.
 *  É só um palpite: a tela pergunta ("Não achei Ronado. É RONALDO DE SOUZA?") e nunca preenche sozinha. */
export function palpiteEmpregado(text, employees, rules) {
  const c = tl(rules); const vaz = vocabulario(rules);
  const src = String(text || '').normalize('NFC');
  const toks = [...new Set(plain(src).split(/[^a-z]+/).filter(Boolean))];
  // palavras com maiúscula (fora do começo da frase) primeiro: costumam ser o nome
  const maius = new Set([...src.matchAll(/(?<=[^.!?\n]\s)\p{Lu}[\p{L}]+/gu)].map(m => plain(m[0])));
  const ordem = [...toks.filter(x => maius.has(x)), ...toks.filter(x => !maius.has(x))].filter(x => x.length >= 2 && !vaz.has(x));
  const emps = (employees || []).map(e => ({ e, toks: plain(e).split(/[^a-z]+/).filter(x => x.length > 1) })).filter(x => x.toks.length);
  const r = (e, porque, tk) => ({ nome: e, porque, trecho: palavraOriginal(src, tk) });
  for (const [ap, nomes] of Array.isArray(c.apelidos) ? c.apelidos.map(a => [a.apelido, a.nomes]) : Object.entries(c.apelidos || {})) {
    const A = plain(ap); if (!toks.includes(A)) continue;
    const alvo = emps.filter(x => [].concat(nomes).some(n => x.toks[0] === plain(n)));
    if (alvo.length === 1) return r(alvo[0].e, 'apelido', A);
    const fino = alvo.filter(x => x.toks.slice(1).some(tk => tk.length > 2 && toks.includes(tk)));
    if (fino.length === 1) return r(fino[0].e, 'apelido', A);
  }
  for (const tk of ordem) {
    if (tk.length < 4) continue;
    const donos = emps.filter(x => x.toks.slice(1).includes(tk));
    if (donos.length === 1 && !emps.some(x => x.toks[0] === tk)) return r(donos[0].e, 'sobrenome', tk);
  }
  for (const tk of ordem) {
    if (tk.length < 4) continue;
    const donos = emps.filter(x => x.toks.some(n => n.length >= 4 && n !== tk && Math.abs(n.length - tk.length) <= 1 && lev(n, tk) === 1));
    if (donos.length === 1) return r(donos[0].e, 'parecido', tk);
  }
  return null;
}

/* ---------- Variáveis da folha: competência e uma linha por funcionário ---------- */
const mesAno = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
/** "10/2026", "mês passado", "este mês", "mês que vem" ou o nome do mês (o mais recente com esse nome). */
export function competenciaDoTexto(text, hoje = today(), rules) {
  const t = plain(text); const cc = tl(rules).competencia || {};
  const comp = t.match(/(?<![\d/])(\d{1,2})[/-](\d{4})(?!\d)/);
  if (comp && +comp[1] >= 1 && +comp[1] <= 12) return `${comp[1].padStart(2, '0')}/${comp[2]}`;
  if (temTermo(t, cc.passado)) return mesAno(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));
  if (temTermo(t, cc.proximo)) return mesAno(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1));
  if (temTermo(t, cc.atual)) return mesAno(hoje);
  const m = t.match(new RegExp(`(?<![a-z])(${MESES.join('|')})(?![a-z])(?:\\s*(?:de\\s+|/\\s*)(\\d{4}))?`));
  if (!m) return null;
  const mi = MESES.indexOf(m[1]);
  return `${String(mi + 1).padStart(2, '0')}/${m[2] || (mi > hoje.getMonth() ? hoje.getFullYear() - 1 : hoje.getFullYear())}`;
}
/** "Ronaldo fez 10 horas extras, Carla 2 faltas" → [{ empregado, rubrica, valor, unidade }] pelo dicionário das
 *  regras (tipos.rubricas.dicionarioRubricas). Sem rubrica, vale a anterior; sem funcionário, o anterior. */
export function linhasRubricas(text, rules, employees = []) {
  const dic = rules?.tipos?.rubricas?.dicionarioRubricas?.itens || [];
  if (!dic.length) return [];
  const src = String(text || '').normalize('NFC');
  const partes = src.split(/[;\n]|,(?!\d)|\s+e\s+(?=\p{L}+\s+\d|\d)/u).map(s => s.trim()).filter(Boolean);
  const linhas = []; let ultEmp = null, ultRub = null; const pendentes = [];
  for (const p of partes) {
    const t = plain(p);
    let rub = null, tam = 0;
    for (const it of dic) for (const w of it.palavras || []) { const W = plain(w); if (W.length > tam && temTermo(t, [w])) { rub = it; tam = W.length; } }
    const dinheiro = t.match(/r\$\s*([\d.]+(?:,\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*reais/);
    const num = dinheiro ? null : t.match(new RegExp(`(?<![\\d/:])(\\d{1,2}:\\d{2}|\\d{1,4}(?:[.,]\\d{1,2})?|${RX_NUM.replace('\\d{1,3}|', '')})(?![\\d/])`));
    const valor = dinheiro ? `R$ ${dinheiro[1] || dinheiro[2]}` : num ? String(/^\d/.test(num[1]) ? num[1] : numeroPorExtenso(num[1])) : null;
    const emp = (employees.length && findEmployeeInText(p, employees)?.option) || null;
    if (emp && !valor && !rub) { pendentes.push(emp); continue; }
    if (!valor) continue;
    const r = rub || ultRub; if (!r) continue;
    const quem = emp || (pendentes.length ? null : ultEmp);
    const unidade = dinheiro ? 'R$' : (r.unidade || '');
    for (const e of [...pendentes, ...(quem || !pendentes.length ? [quem] : [])]) linhas.push({ empregado: e || '', rubrica: r.rubrica, valor, unidade });
    pendentes.length = 0; ultRub = r; ultEmp = emp || ultEmp;
  }
  return linhas;
}
/** Linhas entendidas → texto da descrição (itens entendidos, nunca o texto do cliente). */
export function textoLinhasRubricas(linhas) {
  const v = (l) => l.unidade === 'R$' ? l.valor : `${l.valor}${l.unidade ? ' ' + l.unidade : ''}`;
  return (linhas || []).map(l => `• ${l.empregado || 'Funcionário a confirmar'} — ${l.rubrica}: ${v(l)}`).join('\n');
}

/** O texto das linhas (o que vai na descrição: "• JOAO — Horas extras 50%: 10 horas") de volta em linhas. */
export function linhasDoTexto(texto) {
  return String(texto || '').split(/\n/).map(l => l.match(/^\s*[•*-]\s*(.+?)\s+[—–-]\s+(.+?):\s*(.+?)\s*$/)).filter(Boolean)
    .map(m => ({ empregado: /a confirmar/i.test(m[1]) ? '' : m[1].trim(), rubrica: m[2].trim(), valor: m[3].trim() }));
}

/* ---------- Grade do Lançamento de Rubricas (lote 6; a grade real ainda não foi mapeada: a calibrar) ---------- */
/** Planilha (linhas lidas do Excel/CSV) → [{ empregado, rubrica, valor }]: colunas pelos nomes das regras
 *  (tipos.rubricas.planilha); sem cabeçalho, a ordem Empregado, Rubrica, Valor. */
export function linhasDaPlanilha(rows, rules) {
  if (!rows?.length) return [];
  // cabeçalho em qualquer das 10 primeiras linhas, formato longo ou largo (lerPlanilhaRubricas); sem cabeçalho, a ordem antiga
  const lida = lerPlanilhaRubricas([{ nome: '', linhas: rows }], rules);
  if (lida) return lida.linhas;
  const head = rows[0].map(h => norm(h));
  const P = rules?.tipos?.rubricas?.planilha || {};
  const find = (names) => head.findIndex(h => (names || []).some(n => h.includes(norm(n))));
  let iE = find(P.colunasEmpregado), iR = find(P.colunasRubrica), iV = find(P.colunasValor);
  const hasHeader = iE >= 0 || iR >= 0 || iV >= 0;
  if (!hasHeader) { iE = 0; iR = 1; iV = 2; }
  return (hasHeader ? rows.slice(1) : rows).filter(r => r.some(c => String(c).trim()))
    .map(r => ({ empregado: String(r[iE] ?? '').trim(), rubrica: String(r[iR] ?? '').trim(), valor: String(r[iV] ?? '').trim() }));
}
/* ---------- Planilha de rubricas em qualquer formato (lote 5, item 14) ---------- */
const PLAN_IGNORAR = ['matricula', 'matrícula', 'cpf', 'cargo', 'função', 'funcao', 'setor', 'departamento', 'admissão', 'admissao', 'código', 'codigo', 'id', 'obs', 'observação', 'observações', 'total', 'situação', 'situacao', 'centro de custo', 'pis'];
const PLAN_TIPOS = { ADIANTAMENTO: ['adiantamento', 'quinzena'], PLR: ['plr', 'participação nos lucros', 'participacao nos lucros'], MENSAL: ['mensal', 'folha mensal', 'folha do mês'] };
const celulaVazia = (v) => { const s = String(v ?? '').trim(); return !s || /^[-–—]$/.test(s) || /^(?:r\$\s*)?0+(?:[.,]0+)?$/i.test(s) || /^0{1,2}:00$/.test(s); };
const casaColuna = (h, nomes) => !!h && (nomes || []).some(n => { const N = norm(n); return N && (h === N || (' ' + h + ' ').includes(' ' + N + ' ') || h.startsWith(N + ' ')); });
/**
 * Planilha de rubricas: acha o cabeçalho nas 10 primeiras linhas da aba certa e entende os dois formatos — longo
 * (Empregado | Rubrica | Valor) e largo (Nome | HE 50% | Faltas…, uma rubrica por coluna; células vazias ou zeradas ficam de
 * fora). A competência e o tipo de lançamento saem do título, do nome da aba ou do nome do arquivo. Linhas de título e de
 * total não viram lançamento. abas: [{ nome, linhas: [[…]] }]. Sem cabeçalho que bata → null (a planilha não vira rubricas).
 * Devolve { formato, aba, linhas: [{ empregado, rubrica, valor }], totais: [{ rubrica, total }], competencia, tipoLancamento }.
 */
export function lerPlanilhaRubricas(abas, rules, { nomeArquivo = '', hoje = today() } = {}) {
  const P = rules?.tipos?.rubricas?.planilha || {};
  const dic = (rules?.tipos?.rubricas?.dicionarioRubricas?.itens || []).flatMap(i => [i.rubrica, ...(i.palavras || [])]);
  const apel = (rules?.tipos?.rubricas?.apelidosEventos?.itens || []).flatMap(i => [i.evento, ...(i.apelidos || [])]);
  const ehRubrica = (h) => !!h && [...dic, ...apel, ...(P.colunasRubricaLarga || [])].some(n => { const N = norm(n); return N.length >= 2 && (h === N || (' ' + h + ' ').includes(' ' + N + ' ')); });
  const ignorar = [...PLAN_IGNORAR, ...(P.colunasIgnorar || [])];
  for (const aba of abas || []) {
    const rows = (aba?.linhas || []).filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim()));
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const head = rows[i].map(h => norm(h));
      const iE = head.findIndex(h => casaColuna(h, P.colunasEmpregado));
      if (iE < 0) continue;
      const iR = head.findIndex((h, j) => j !== iE && casaColuna(h, P.colunasRubrica));
      const iV = head.findIndex((h, j) => j !== iE && j !== iR && casaColuna(h, P.colunasValor));
      const corpo = rows.slice(i + 1).filter(r => { const e = String(r[iE] ?? '').trim(); return e && !/^(?:sub)?total\b/i.test(plain(e)); });
      let linhas = [], formato = null;
      if (iR >= 0 && iV >= 0) {
        formato = 'longo';
        linhas = corpo.filter(r => !celulaVazia(r[iV]) && String(r[iR] ?? '').trim()).map(r => ({ empregado: String(r[iE]).trim(), rubrica: String(r[iR]).trim(), valor: String(r[iV]).trim() }));
      } else {
        // largo: as outras colunas com nome são rubricas (pelo menos uma conhecida pelas regras)
        const cols = head.map((h, j) => ({ h, j, rot: String(rows[i][j] ?? '').trim() })).filter(c => c.j !== iE && c.h && !casaColuna(c.h, ignorar));
        if (!cols.some(c => ehRubrica(c.h))) continue;
        formato = 'largo';
        for (const r of corpo) for (const c of cols) if (!celulaVazia(r[c.j])) linhas.push({ empregado: String(r[iE]).trim(), rubrica: c.rot, valor: String(r[c.j]).trim() });
      }
      const titulo = rows.slice(0, i).map(r => r.join(' ')).join(' ');
      const fontes = [titulo, aba.nome || '', String(nomeArquivo || '').replace(/\.[a-z0-9]+$/i, '').replace(/_+/g, ' ').replace(/(?<=\p{L})-(?=\p{L})/gu, ' ')];
      const competencia = fontes.map(t => t && competenciaDoTexto(t.replace(/\b(?:passad[oa]|anterior|que vem|pr[oó]xim[oa]|atual|este|esse)\b/gi, ' '), hoje, rules)).find(Boolean) || null;
      let tipoLancamento = null;
      for (const t of fontes) { const T = ' ' + norm(t) + ' '; const k = Object.entries(P.tiposLancamento || PLAN_TIPOS).find(([, ws]) => !String(ws).startsWith('_') && [].concat(ws).some(w => T.includes(' ' + norm(w) + ' '))); if (k) { tipoLancamento = k[0]; break; } }
      return { formato, aba: aba.nome || '', linhas, totais: totaisRubricas(linhas), competencia, tipoLancamento };
    }
  }
  return null;
}
/** Soma por rubrica: horas (hh:mm) ou números (com vírgula); valores misturados ficam sem total. */
export function totaisRubricas(linhas) {
  const por = new Map();
  for (const l of linhas || []) { if (!por.has(l.rubrica)) por.set(l.rubrica, []); por.get(l.rubrica).push(String(l.valor).trim()); }
  const out = [];
  for (const [rubrica, vs] of por) {
    if (vs.every(v => /^\d{1,4}:\d{2}$/.test(v))) {
      const min = vs.reduce((s, v) => { const [h, m] = v.split(':').map(Number); return s + h * 60 + m; }, 0);
      out.push({ rubrica, total: `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`, n: vs.length });
    } else {
      const nums = vs.map(v => { const t = v.replace(/r\$\s*/i, '').replace(/\s*(?:horas?|h|dias?|d)$/i, '').trim(); return /^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^-?\d+(?:[.,]\d+)?$/.test(t) ? parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) : NaN; });
      if (nums.some(isNaN)) continue;
      const s = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
      const dinheiro = vs.some(v => /r\$|,\d{2}$/i.test(v));
      out.push({ rubrica, total: dinheiro ? s.toFixed(2).replace('.', ',') : String(s).replace('.', ','), n: vs.length });
    }
  }
  return out;
}
/** Texto dos totais para a descrição ("Totais: HE 50%: 12:30; Faltas: 3"). */
export const textoTotaisRubricas = (totais) => (totais || []).length ? `Totais por rubrica: ${totais.map(t => `${t.rubrica}: ${t.total}`).join('; ')}` : '';
/**
 * Confere os nomes da planilha com a lista de funcionários: { naoAchados, desligados, repetidas: [{ empregado, rubrica }],
 * nomes: { nome da planilha → nome da lista } (só com o nome inteiro batendo). Sem lista, não confere nada.
 */
export function conferirPlanilha(linhas, employees = [], desligados = []) {
  const out = { naoAchados: [], desligados: [], repetidas: [], nomes: {} };
  const vistos = new Set();
  for (const l of linhas || []) {
    const k = norm(l.empregado) + '|' + norm(l.rubrica);
    if (vistos.has(k) && !out.repetidas.some(r => norm(r.empregado) + '|' + norm(r.rubrica) === k)) out.repetidas.push({ empregado: l.empregado, rubrica: l.rubrica });
    vistos.add(k);
  }
  if (!employees?.length) return out;
  for (const nome of [...new Set((linhas || []).map(l => l.empregado))]) {
    const N = norm(nome); const ehDeslig = (n) => (desligados || []).some(d => norm(d) === norm(n));
    const lista = [...new Set([...employees, ...(desligados || [])])];
    if (lista.some(e => norm(e) === N)) { if (ehDeslig(nome)) out.desligados.push(nome); continue; }
    const pm = empregadoPorNome(nome, lista);
    if (pm?.option && !pm.contradiz && pm.score >= 0.9) { out.nomes[nome] = pm.option; if (ehDeslig(pm.option)) out.desligados.push(nome); continue; }
    out.naoAchados.push(nome);
  }
  return out;
}
const semCodigo = (s) => String(s || '').replace(/^\s*\d+\s*[-–.:]\s*/, '');
const nomeEvento = (s) => norm(semCodigo(s).replace(/\([^)]*\)/g, ' '));
/** Grupos de nomes de um mesmo evento: tipos.rubricas.apelidosEventos e o dicionário do texto livre. */
function gruposDeEventos(rules) {
  const r = rules?.tipos?.rubricas || {};
  return [...(r.apelidosEventos?.itens || []).map(g => [g.evento, ...(g.apelidos || [])]), ...(r.dicionarioRubricas?.itens || []).map(g => [g.rubrica, ...(g.palavras || [])])]
    .map(l => l.map(nomeEvento).filter(Boolean));
}
/** Nome da rubrica da planilha ("HE 50", "Comissão") → evento da empresa na grade ("0001 - HORAS EXTRAS 50%"): igual (sem o código
 *  e sem parênteses), depois pelos apelidos das regras, depois o único bem parecido. Sem par seguro → null (o cliente lança). */
export function eventoDaRubrica(nome, eventos, rules) {
  const evs = (eventos || []).map(e => ({ e, n: nomeEvento(e) })).filter(x => x.n);
  const q = nomeEvento(nome); if (!q || !evs.length) return null;
  const igual = evs.find(x => x.n === q); if (igual) return igual.e;
  for (const g of gruposDeEventos(rules).filter(g => g.includes(q))) {
    const ev = evs.find(x => g.includes(x.n)) || evs.find(x => (' ' + x.n + ' ').includes(' ' + g[0] + ' ') && g[0].length >= 4);
    if (ev) return ev.e;
  }
  const notas = evs.map(x => ({ e: x.e, s: similarity(q, x.n) })).sort((a, b) => b.s - a.s);
  return notas[0].s >= 0.85 && !(notas[1] && notas[1].s >= notas[0].s - 0.02) ? notas[0].e : null;
}
/** Linhas → células da grade: o funcionário da grade (nome igual ou quase) e a coluna do evento. O que não casar fica de fora,
 *  para o cliente lançar (semEvento, semEmpregado). */
export function montarGrade(linhas, eventos, empregados, rules) {
  const celulas = [], semEvento = [], semEmpregado = [];
  for (const l of linhas || []) {
    if (!String(l.valor ?? '').trim()) continue;
    const ev = eventoDaRubrica(l.rubrica, eventos, rules);
    const emp = bestMatch(l.empregado, empregados, 0.85)?.option || null;
    if (!ev) { if (!semEvento.includes(l.rubrica)) semEvento.push(l.rubrica); continue; }
    if (!emp) { if (!semEmpregado.includes(l.empregado || '?')) semEmpregado.push(l.empregado || '?'); continue; }
    // só o número: "R$ 350,00" → 350,00; "10 horas" → 10 (a coluna já diz se é hora, dia ou valor)
    celulas.push({ empregado: emp, evento: ev, valor: String(l.valor).replace(/^R\$\s*/, '').replace(/\s*(horas?|dias?|h)$/i, '').trim(), rubrica: l.rubrica });
  }
  return { celulas, semEvento, semEmpregado };
}
/** Linhas de um lançamento já feito (detalhe do portal, {apiDetalhe}/{id}?expand=all) para "Usar o lançamento do mês passado".
 *  O formato real não foi visto (empresa de teste sem eventos): procura listas de funcionários com listas de eventos e valores. A calibrar. */
export function linhasDoLancamento(detalhe) {
  const out = [];
  const nomeDe = (o) => texto1(o?.clientEmployeeExpanded?.name, o?.employeeName, o?.clientEmployeeName, o?.employee?.name, o?.name);
  const eventoDe = (o) => texto1(o?.eventExpanded, o?.rubricExpanded, o?.event, o?.rubric, o?.rubricName, o?.eventName, o?.description);
  const valorDe = (o) => texto1(o?.value, o?.amount, o?.quantity, o?.reference, o?.hours, o?.days);
  const visitar = (x, prof) => {
    if (!x || typeof x !== 'object' || prof > 4) return;
    if (Array.isArray(x)) {
      for (const p of x) {
        const nome = nomeDe(p); const itens = nome && Object.values(p).find(v => Array.isArray(v) && v.some(i => eventoDe(i) && valorDe(i)));
        if (itens) { for (const i of itens) { const ev = eventoDe(i), v = valorDe(i); if (ev && v) out.push({ empregado: nome, rubrica: semCodigo(ev), valor: v }); } }
        else visitar(p, prof + 1);
      }
      return;
    }
    for (const v of Object.values(x)) visitar(v, prof + 1);
  };
  visitar(detalhe, 0);
  return out;
}

/* ---------- Solicitação Geral: departamento e assunto pelo catálogo (tipos.geral.catalogo) ---------- */
/** "segunda via da guia do FGTS de setembro" → { departamento: 'Pessoal', assunto: 'Guia do FGTS – 2ª via – competência 09/2026',
 *  descricao (do modelo do item, nunca o texto do cliente), competencia, id }. Ganha o item com mais palavras (as longas valem
 *  mais); um documento listado no item (alvará, CND) ganha sempre. Sem nada no catálogo → null. */
export function assuntoGeral(text, rules, { docId = null, hoje = today() } = {}) {
  const cat = rules?.tipos?.geral?.catalogo; if (!cat?.itens?.length) return null;
  const t = plain(String(text || '').normalize('NFC'));
  let best = null;
  for (const it of cat.itens) {
    let pontos = 0;
    if (docId && (it.documentos || []).includes(docId)) pontos += 1000;
    for (const w of it.palavras || []) if (temTermo(t, [w])) pontos += 10 + plain(w).replace(/\*$/, '').length;
    if (pontos && (!best || pontos > best.pontos)) best = { it, pontos };
  }
  if (!best) return null;
  const it = best.it, porDoc = !!(docId && (it.documentos || []).includes(docId));
  // competência só do que o cliente escreveu (num documento, datas de validade não são competência)
  const competencia = porDoc ? '' : competenciaDoTexto(text, hoje, rules) || '';
  const assunto = it.assunto + (competencia && cat.sufixoCompetencia ? cat.sufixoCompetencia.replace('{competencia}', competencia) : '');
  const descricao = renderTemplate((porDoc && it.descricaoDocumento) || it.descricao || [], { competencia });
  return { id: it.id, departamento: it.departamento, assunto, descricao, competencia, porDocumento: porDoc };
}
/** O departamento do catálogo na lista do portal (os nomes são os do escritório): o próprio nome ou um sinônimo de
 *  catalogo.departamentos, igual primeiro e depois como palavra inteira dentro da opção. Sem lista ou sem par → null. */
export function departamentoDaLista(nome, opcoes, rules) {
  const ops = (opcoes || []).filter(Boolean); if (!nome || !ops.length) return null;
  const sin = [nome, ...((rules?.tipos?.geral?.catalogo?.departamentos || {})[nome] || [])].map(norm).filter(Boolean);
  for (const s of sin) { const o = ops.find(x => norm(x) === s); if (o) return o; }
  for (const s of sin) { if (s.length < 3) continue; const o = ops.find(x => (' ' + norm(x) + ' ').includes(' ' + s + ' ')); if (o) return o; }
  return null;
}

/* ---------- Pergunta e dúvidas ---------- */
/** O texto é uma pergunta? (termina em "?" ou começa com como, posso, qual… — config.textoLivre.pergunta) */
export function ehPergunta(text, rules) {
  const s = String(text || '').trim(); if (!s) return false;
  if (/\?\s*$/.test(s)) return true;
  const r = rxTermos(tl(rules).pergunta);
  return !!r && new RegExp(`^[^a-z0-9]*${r}(?![a-z0-9])`).test(plain(s));
}
const radical = (w) => w.length > 4 ? w.slice(0, Math.max(4, w.length - 2)) : w;
const casaRadical = (w, tk) => w === tk || (tk.length >= 4 && w.length >= 4 && (radical(w) === radical(tk) || w.startsWith(radical(tk)) || tk.startsWith(radical(w))));
/** Dúvidas (regras.faq) que casam com o texto pelo radical das palavras (o plural acha o singular). */
export function buscarFaq(q, rules, max = 4) {
  const vaz = new Set((tl(rules).palavrasVazias || []).map(plain));
  const pal = (s) => plain(s).split(/[^a-z0-9º]+/).filter(Boolean);
  const toks = [...new Set(pal(q).filter(x => x.length > 2 && !vaz.has(x)))];
  if (!toks.length) return [];
  return (rules?.faq || []).map((f, i) => {
    const P = pal((f.palavras || []).join(' ')), Q = pal(f.pergunta), R = pal(f.resposta);
    let n = 0;
    for (const tk of toks) n += P.some(w => casaRadical(w, tk)) ? 2 : Q.some(w => casaRadical(w, tk)) ? 1.5 : R.some(w => casaRadical(w, tk)) ? 0.5 : 0;
    return { f, n, i };
  }).filter(x => x.n >= 1.5).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, max).map(x => x.f);
}

/* ---------- Leitura do pedido ---------- */
/** Correção no meio do texto ("…dia 10/11, não, é dia 12/11"): o que vem depois da última palavra de correção. */
function dividirCorrecao(text, rules) {
  const r = rxTermos(tl(rules).correcao); if (!r) return null;
  const src = String(text || '').normalize('NFC'); const t = plain(src);
  let ult = null; for (const m of t.matchAll(new RegExp(`(?<![a-z0-9])${r}(?![a-z0-9])`, 'g'))) ult = m;
  if (!ult) return null;
  const antes = src.slice(0, ult.index), depois = src.slice(ult.index + ult[0].length);
  if (!plain(antes).replace(/[^a-z0-9]/g, '') || !plain(depois).replace(/[^a-z0-9]/g, '')) return null;
  return { antes, depois };
}

/** Interpreta um pedido escrito livremente e devolve tipo sugerido + campos.
 *  ctx = { employees, tipoAtual, hoje }. Também devolve: intervalo, prazo, palpite (funcionário a perguntar),
 *  linhas (variáveis da folha) e corrigidos (campos trocados por uma correção). */
export function parseFreeText(text, rules, ctx = {}) {
  const corr = ctx.semCorrecao ? null : dividirCorrecao(text, rules);
  if (corr) {
    const tipoAtual = ctx.tipoAtual || parseFreeText(text, rules, { ...ctx, semCorrecao: true, employees: [] }).tipoSugerido;
    const a = parseFreeText(corr.antes, rules, { ...ctx, tipoAtual, semCorrecao: true });
    const b = parseFreeText(corr.depois, rules, { ...ctx, tipoAtual, semCorrecao: true });
    const campos = { ...a.campos }; const corrigidos = [];
    for (const [k, c] of Object.entries(b.campos)) {
      if (campos[k] && c.conf <= 0.45) continue;   // valor padrão da parte corrigida não apaga o que foi dito
      if (campos[k] && campos[k].valor !== c.valor) corrigidos.push(k);
      campos[k] = { ...c, ...(campos[k] ? { corrigido: true } : {}) };
    }
    if (tipoAtual === 'afastamento' && campos.dias && corrigidos.includes('dias')) {
      const auto = resolveTipo(rules, 'afastamento')?.tipoAfastamentoAuto;
      const ta = auto ? inferTipoAfastamento(text, +campos.dias.valor, /atestado|medic|doen/.test(plain(text)) ? 'atestado' : null, auto) : null;
      if (ta) campos.tipoAfastamento = { valor: ta.valor, conf: 0.6, fonte: 'sua descrição' };
    }
    const emp = b.campos.empregado ? b : a;
    return { ...a, campos, corrigidos, datas: [...a.datas, ...b.datas], palpite: campos.empregado ? null : (b.palpite || a.palpite), ...(emp.candidatos && !campos.empregado ? { candidatos: emp.candidatos } : {}), linhas: b.linhas?.length ? b.linhas : a.linhas };
  }
  const c = tl(rules);
  const t = plain(String(text || '').normalize('NFC')); const hoje = ctx.hoje || today();
  let tipo = ctx.tipoAtual;
  if (!tipo) {
    tipo = suggestTipoByText(text, rules, null)?.tipo || 'geral';
    // aviso x cálculo: as palavras do texto decidem (com peso; "aviso indenizado" não conta como aviso)
    const fam = escolhasTexto(rules).find(e => !e.quando && e.tipos?.includes(tipo));
    const d = fam && destaqueEscolha(text, fam);
    if (d) tipo = d;
  }
  const def = resolveTipo(rules, tipo);
  const campos = {}; const put = (k, v, conf = 0.6) => { if (v != null && v !== '') campos[k] = { valor: String(v), conf, fonte: 'sua descrição' }; };
  const { lista, intervalos } = analisarDatas(text, hoje, { sentido: def?.sentidoDatas || c.sentidoDatas || 'futuro', rules });
  const normais = lista.filter(x => !x.prazo).map(x => x.d);
  const prazo = lista.find(x => x.prazo) || null;
  const intervalo = intervalos[0] || null;
  const quant = lerQuantidades(text, rules);
  const gozo = quant.find(q => q.papel === 'gozo' && q.unidade === 'dias');
  const abonoQ = quant.find(q => q.papel === 'abono');
  const anosQ = quant.find(q => q.unidade === 'anos' && q.papel !== 'descartar');
  // dias: os ditos no texto; com um intervalo, a conta (fim − início + 1). Se não baterem, fica para conferir.
  const diasDoTexto = () => {
    if (intervalo && gozo && gozo.n !== intervalo.dias) return { n: gozo.n, conf: 0.45 };
    if (intervalo) return { n: intervalo.dias, conf: 0.6 };
    if (gozo) return { n: gozo.n, conf: gozo.aprox ? 0.45 : 0.6 };
    return null;
  };
  const inicio = intervalo ? intervalo.ini : normais[0] || null;
  const d0 = inicio ? fmtDate(inicio) : null;
  let candidatosNome = null, palpite = null;
  // funcionário: só nos pedidos que têm esse campo
  if (def?.campos?.empregado && ctx.employees?.length) {
    const m = findEmployeeInText(text, ctx.employees);
    if (m?.option) put('empregado', m.option, m.score); else if (m?.candidatos) candidatosNome = m.candidatos;
    else palpite = palpiteEmpregado(text, ctx.employees, rules);
  }
  let linhas = []; const dicas = [];
  switch (tipo) {
    case 'afastamento': {
      put('dataAfastamento', d0);
      const dd = diasDoTexto(); if (dd) put('dias', dd.n, dd.conf);
      const auto = resolveTipo(rules, 'afastamento')?.tipoAfastamentoAuto;
      const ta = auto ? inferTipoAfastamento(text, dd?.n ?? null, /atestado|medic|doen/.test(t) ? 'atestado' : null, auto) : null;
      if (ta) put('tipoAfastamento', ta.valor);
      break;
    }
    case 'avisoFerias': case 'calculoFerias': {
      put('inicioGozo', d0);
      const dd = diasDoTexto(); if (dd) put('diasGozo', dd.n, dd.conf);
      const ab = c.abono || {};
      const semAbono = temTermo(t, ab.nao), comAbono = !semAbono && (!!abonoQ || temTermo(t, ab.sim));
      if (tipo === 'avisoFerias' && comAbono) {
        // abono sem número: sugere 10 dias (ou o que falta para 30), para conferir
        if (abonoQ?.n) put('diasAbono', abonoQ.n);
        else { const g = dd?.n; put('diasAbono', g && g < 30 && 30 - g <= 10 ? 30 - g : (c.abonoPadraoDias || 10), 0.45); }
      }
      // abono só vira SIM com dias maiores que zero (ou sem número: "vai vender")
      if (tipo === 'calculoFerias' && (comAbono || semAbono)) put('abono', comAbono && abonoQ?.n !== 0 ? 'SIM' : 'NÃO');
      const dt = c.decimoTerceiro || {};
      if (tipo === 'calculoFerias') { if (temTermo(t, dt.nao)) put('adiantar13', 'NÃO'); else if (temTermo(t, dt.palavras)) put('adiantar13', 'SIM'); }
      break;
    }
    case 'avisoRescisao': case 'calculoRescisao': {
      // motivo pela tabela das regras (config.motivoAuto: experiência, acordo, culpa recíproca, extinção…) e, sem ela, pelas palavras do texto livre
      const m = motivoRescisao(text, rules);
      let motivo = m?.valor || null; const dadoPor = m?.dadoPor || null;
      if (m?.dica) dicas.push(m.dica);
      if (!rules?.config?.motivoAuto && /experiencia/.test(t)) motivo = dadoPor === 'EMPREGADO' ? 'Rescisão contrato experiência antecipado pelo empregado' : 'Rescisão contrato experiência antecipado pelo empregador';
      put('motivo', motivo);
      const semAviso = !!motivo && !temAviso({ motivo }, rules);
      if (tipo === 'avisoRescisao') { put('avisoDadoPor', dadoPor); put('dataAviso', d0 || fmtDate(hoje), d0 ? 0.6 : 0.4); if (anosQ) put('anosEmpresa', anosQ.n); }
      else {
        const dem = normais[normais.length > 1 && !semAviso ? 1 : 0];
        put('dataDemissao', dem ? fmtDate(dem) : null);
        // motivo sem aviso prévio: o cálculo não recebe data nem tipo de aviso
        if (!semAviso) {
          if (normais.length > 1) put('dataAvisoPrevio', fmtDate(normais[0]));
          // expressão inteira (config.textoLivre.tipoAviso): "aviso dispensado" conta, "vamos dispensar" não
          for (const [valor, ws] of Object.entries(c.tipoAviso || {})) if (!valor.startsWith('_') && Array.isArray(ws) && temTermo(t, ws)) { put('tipoAviso', valor); break; }
        }
      }
      break;
    }
    case 'rubricas': {
      put('competencia', competenciaDoTexto(text, hoje, rules));
      if (temTermo(t, c.adiantamento)) put('tipoLancamento', 'ADIANTAMENTO'); else if (/\bplr\b|participacao/.test(t)) put('tipoLancamento', 'PLR'); else put('tipoLancamento', 'MENSAL', 0.4);
      linhas = linhasRubricas(text, rules, ctx.employees || []);
      if (linhas.length) put('tabelaRubricas', textoLinhasRubricas(linhas));
      break;
    }
    case 'cadastroEmpregado': case 'cadastroEstagiario': case 'cadastroContribuinte': {
      // ficha colada (mesma leitura dos documentos) e frases soltas: cada data com o seu papel
      for (const [k, v] of Object.entries(lerCadastroTexto(text, tipo, rules, { hoje, employees: ctx.employees || [] }))) campos[k] = v;
      break;
    }
    case 'geral': {
      // departamento e assunto curto pelo catálogo; a descrição só do modelo do item (o texto do cliente não é copiado)
      const g = assuntoGeral(text, rules, { hoje });
      if (g) { put('departamento', g.departamento); put('assunto', g.assunto); if (g.descricao) campos.descricao = { valor: g.descricao, conf: 0.5, fonte: 'modelo do escritório' }; }
      break;
    }
    default: break;
  }
  // "preciso até sexta": vai para a Expectativa de conclusão (nos pedidos que têm esse campo), não para o início
  if (prazo && def?.campos?.conclusao) put('conclusao', fmtDate(prazo.d));
  // o texto do cliente serve só para entender o pedido: não vai literalmente para a descrição
  return { tipoSugerido: tipo, campos, datas: normais.map(fmtDate), intervalo, prazo: prazo ? fmtDate(prazo.d) : null, palpite, linhas, dicas, ...(candidatosNome ? { candidatos: candidatosNome } : {}) };
}

/* ---------- Motivo da rescisão (regras: config.motivoAuto) ----------
   Lista em ordem de prioridade, no formato do tipoAfastamentoAuto: { palavras?, e? (precisa também de uma destas), exceto?,
   modalidades? (do Calcular), documentos?, valor | nenhum + dica, dadoPor? }. Sem a tabela (ou sem achar nela), o texto livre
   usa config.textoLivre.motivosRescisao. modalidade: só pela modalidade; soAuto: só a tabela (documentos). */
export function motivoRescisao(text, rules, { modalidade = null, docId = null, soAuto = false } = {}) {
  const t = plain(String(text || '').normalize('NFC'));
  for (const r of rules?.config?.motivoAuto || []) {
    const porMod = !!modalidade && (r.modalidades || []).includes(modalidade);
    const porDoc = !modalidade && !!docId && (r.documentos || []).includes(docId);
    const porTexto = !modalidade && !!r.palavras?.length && temTermo(t, r.palavras) && (!r.e?.length || temTermo(t, r.e)) && !temTermo(t, r.exceto);
    if (!porMod && !porDoc && !porTexto) continue;
    return { valor: r.nenhum ? null : r.valor || null, dadoPor: r.dadoPor || null, dica: r.dica || null, nenhum: !!r.nenhum };
  }
  if (modalidade || soAuto) return null;
  for (const r of tl(rules).motivosRescisao || []) if (temTermo(t, r.palavras) && !temTermo(t, r.exceto)) return { valor: r.valor, dadoPor: r.dadoPor || null, dica: null, nenhum: false };
  if (!tl(rules).motivosRescisao) {
    if (/pediu demissao|pedido de demissao|pedir demissao|quer sair|pediu para sair/.test(t)) return { valor: 'Pedido de demissão SEM justa causa', dadoPor: 'EMPREGADO' };
    if (/\bcom justa causa\b|(?<!sem )\bjusta causa\b/.test(t)) return { valor: 'Demitido COM justa causa', dadoPor: 'EMPREGADOR' };
    if (/sem justa causa|demit|demissao|dispens|deslig/.test(t)) return { valor: 'Demitido SEM justa causa', dadoPor: 'EMPREGADOR' };
  }
  return null;
}
/** Tipo de aviso do portal (rádio do Cálculo de Rescisão) para o aviso da modalidade do Calcular (config.tipoAvisoModalidade). */
export function tipoAvisoDaModalidade(aviso, rules) {
  const m = { indenizado: 'INDENIZADO', trabalhado: 'TRABALHADO', dispensado: 'AUSÊNCIA/DISPENSA', naoCumprido: 'AUSÊNCIA/DISPENSA', ...(rules?.config?.tipoAvisoModalidade || {}) };
  return aviso && typeof m[aviso] === 'string' ? m[aviso] : null;
}

/* ---------- Cadastro pelo texto: ficha colada e frases soltas (config.textoLivre.cadastro) ---------- */
const CAD_PADRAO = {
  fichaMinRotulos: 3, admissaoAteDiasAtras: 365,
  datas: [{ campo: 'nascimento', palavras: ['nascid*', 'nasceu', 'nascimento'] }, { campo: 'dataAdmissao', palavras: ['comec*', 'entra', 'inicio', 'admissao', 'a partir de'] }],
  salario: ['salario', 'bolsa', 'pro-labore'], experiencia: ['experiencia'], prorrogacao: ['prorrogacao'], cargo: ['cargo'], funcao: ['funcao'],
  fimDoValor: ['com', 'e', 'cpf', 'dia', 'salario', 'no', 'na', 'em'], admitir: ['admitir', 'contratar']
};
export const CADASTROS = ['cadastroEmpregado', 'cadastroEstagiario', 'cadastroContribuinte'];
const cadCfg = (rules) => ({ ...CAD_PADRAO, ...(tl(rules).cadastro || {}) });
/** Ficha colada ("Nome: … CPF: … Nome da mãe: …"): quantos rótulos do cadastro aparecem (0 abaixo do mínimo das regras). */
export function fichaColada(text, rules, tipoKey = 'cadastroEmpregado') {
  const def = resolveTipo(rules, tipoKey); if (!def || !/[:\-–]/.test(String(text || ''))) return 0;
  const n = Object.keys(extractByLabels(text, def.campos)).length;
  return n >= (cadCfg(rules).fichaMinRotulos || 3) ? n : 0;
}
const ARTIGOS_NOME = /^(?:a|o|as|os|um|uma|da|do|de|nova|novo|funcionari[oa]|empregad[oa]|estagiari[oa]|colaborador[a]?|senhor[a]?|sr[a]?|chamad[oa])$/;
const tituloSeMinusculo = (s) => s === s.toLowerCase() ? s.replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\s(D[aeo]s?|E)(?=\s)/g, (m) => m.toLowerCase()) : s;
/** Cadastro escrito com as próprias palavras: { campo: { valor, conf, fonte } }. O texto nunca vai para a descrição. */
export function lerCadastroTexto(text, tipoKey, rules, { hoje = today(), employees = [] } = {}) {
  const c = cadCfg(rules); const def = resolveTipo(rules, tipoKey); if (!def) return {};
  const src = String(text || '').normalize('NFC'); const t = plain(src);
  const out = {};
  const put = (k, v, conf = 0.6, fonte = 'sua descrição') => { if (v == null || v === '' || !def.campos[k] || out[k]) return; out[k] = { valor: String(v), conf, fonte }; };
  // 1) ficha colada: a mesma leitura de um arquivo
  if (fichaColada(src, rules, tipoKey)) {
    const a = analyzeText(src, rules, { tipoAtual: tipoKey, hoje });
    for (const [k, v] of Object.entries(a.campos)) put(k, v.valor, v.conf, `ficha colada (${v.fonte})`);
  }
  const rFim = rxTermos(c.fimDoValor);
  const ehFim = (pw) => !!rFim && new RegExp(`^${rFim}$`).test(pw);
  /** Palavras depois de um termo, até pontuação, número ou uma palavra de fim. */
  const depoisDe = (lista, max = 5) => {
    const r = rxTermos(lista); if (!r) return null;
    const m = t.match(new RegExp(`(?<![a-z0-9])${r}(?![a-z0-9])\\s*:?\\s*`)); if (!m) return null;
    const pal = [];
    for (const w of src.slice(m.index + m[0].length).split(/\s+/)) {
      const wc = w.replace(/[.,;:!?)]+$/, ''); const pw = plain(wc);
      if (!pal.length && /^(?:de|da|do)$/.test(pw)) continue;
      if (!pw || /[^a-z'´-]/.test(pw) || ehFim(pw)) break;
      pal.push(wc); if (wc !== w || pal.length >= max) break;
    }
    while (pal.length && /^(?:de|da|do|dos|das|e)$/i.test(pal[pal.length - 1])) pal.pop();
    return pal.join(' ') || null;
  };
  // 2) datas: o papel vem da palavra logo antes ("nascida em", "começa", "emissão do RG"); sem palavra, só uma data recente vira admissão
  const papeis = (c.datas || []).map(d => ({ campo: d.campo, r: rxTermos(d.palavras) })).filter(x => x.r);
  let fimAnt = 0;
  for (const x of analisarDatas(src, hoje, { sentido: 'futuro', rules }).lista) {
    if (x.prazo) { fimAnt = x.fim; continue; }
    const ini = Math.max(fimAnt, x.idx - 45); const janela = t.slice(ini, x.idx);
    let melhor = null;
    for (const p of papeis) for (const m of janela.matchAll(new RegExp(`(?<![a-z0-9])${p.r}(?![a-z0-9])`, 'g'))) { const f = m.index + m[0].length; const meio = janela.slice(f); if (/[,;.]\s/.test(meio + ' ') || meio.trim().split(/\s+/).filter(Boolean).length > 3) continue; if (!melhor || f > melhor.f) melhor = { campo: p.campo, f, i: m.index }; }
    let d = x.d;
    if (melhor) {
      if (melhor.campo === 'nascimento' && d > hoje) d = new Date(d.getFullYear() - 100, d.getMonth(), d.getDate());   // "12/03/95"
      put(melhor.campo, fmtDate(d), 0.6, `“${src.slice(ini + melhor.i, x.fim).trim()}”`);
    } else if (diffDays(d, hoje) <= (c.admissaoAteDiasAtras ?? 365)) put('dataAdmissao', fmtDate(d), 0.5);
    fimAnt = x.fim;
  }
  // 3) salário, bolsa ou pró-labore: com ou sem R$
  const NUM = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)';
  const rSal = rxTermos(c.salario);
  const sal = (rSal && t.match(new RegExp(`(?<![a-z])${rSal}(?![a-z])\\s*(?:de\\s+|:\\s*|=\\s*|sera\\s+|vai ser\\s+)?(?:r\\$\\s*)?${NUM}(?![\\d/])`)))
    || t.match(new RegExp(`r\\$\\s*${NUM}`)) || t.match(new RegExp(`${NUM}\\s*reais`));
  if (sal) put('salario', sal[1]);
  // 4) experiência: "45 + 45", "experiência de 45 dias", "prorrogação de 45"
  const xp = t.match(/(?<![\d/.,])(\d{1,2})\s*(?:dias?\s*)?(?:\+|mais)\s*(\d{1,2})(?![\d/])/);
  if (xp && +xp[1] + +xp[2] <= 90) { put('contratoExperiencia', xp[1]); put('prorrogacao', xp[2]); }
  const nDepois = (lista) => { const r = rxTermos(lista); const m = r && (t.match(new RegExp(`(?<![a-z])${r}(?![a-z])\\s*(?:de\\s+|:\\s*)?(${RX_NUM})\\s*(?:dias)?`)) || t.match(new RegExp(`(${RX_NUM})\\s*dias\\s*(?:de\\s+)?${r}(?![a-z])`))); return m ? numeroPorExtenso(m[1]) : null; };
  if (!xp) { put('contratoExperiencia', nDepois(c.experiencia)); put('prorrogacao', nDepois(c.prorrogacao)); }
  // 5) cargo e função
  put('cargo', depoisDe(c.cargo), 0.55); put('funcao', depoisDe(c.funcao), 0.55);
  // 6) CPF (o inválido entra para a conferência acusar), PIS e e-mail
  for (const [k, v] of Object.entries(extractGeneric(src))) if (k !== 'cep') put(k, v.valor, v.conf);
  const cpfD = t.match(/cpf\s*(?:n[o.]?\s*)?:?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/);
  if (cpfD) put('cpf', fmtCPF(cpfD[1]), 0.45);
  // 7) nome depois de "admitir/contratar" (quando não é alguém da lista)
  const rAdm = rxTermos(c.admitir);
  const mAdm = rAdm && def.campos.nome && t.match(new RegExp(`(?<![a-z])${rAdm}(?![a-z])\\s*`));
  if (mAdm) {
    const vaz = new Set([...(tl(rules).palavrasVazias || []), ...MESES, ...DIAS_SEMANA].map(plain));
    // "contratar estagiária Ana", "cadastro de autônomo": a palavra do tipo de cadastro não é nome
    const doTipo = new Set([...(tl(rules).tipoContribuinte?.opcoes || []).flatMap(o => o.palavras || []), ...(rules?.intencoes || []).filter(i => CADASTROS.includes(i.tipo)).flatMap(i => i.palavras || [])].flatMap(p => plain(p).split(/[^a-z]+/)).filter(x => x.length > 2));
    const pal = [];
    for (const w of src.slice(mAdm.index + mAdm[0].length).split(/\s+/)) {
      const wc = w.replace(/[.,;:!?)]+$/, ''); const pw = plain(wc);
      if (!pal.length && (ARTIGOS_NOME.test(pw) || doTipo.has(pw))) continue;
      if (doTipo.has(pw)) break;
      if (!pw || /[^a-z'´-]/.test(pw)) break;
      if (pal.length && CONECTORES.has(norm(wc))) { pal.push(wc); continue; }
      if (vaz.has(pw) || ehFim(pw)) break;
      pal.push(wc); if (wc !== w || pal.length >= 7) break;
    }
    while (pal.length && CONECTORES.has(norm(pal[pal.length - 1]))) pal.pop();
    const nome = pal.join(' ');
    const daLista = employees.length && findEmployeeInText(nome, employees, { soPrimeiroNome: false })?.option;
    if (pal.filter(x => !CONECTORES.has(norm(x))).length >= 2 && !daLista) put('nome', tituloSeMinusculo(nome), 0.55);
  }
  // 8) contribuinte: sócio/pró-labore ou autônomo/RPA marcam o Tipo (as categorias vêm das condicionais)
  for (const o of tl(rules).tipoContribuinte?.opcoes || []) if (temTermo(t, o.palavras)) { put('tipoContribuinte', o.valor); break; }
  return out;
}

/* ---------- Vários pedidos numa frase ---------- */
/** Onde cada funcionário aparece no texto (nome inteiro, nome + sobrenome ou primeiro nome único). */
export function mencoesEmpregados(text, employees) {
  const t = plain(String(text || '').normalize('NFC'));
  const emps = (employees || []).map(e => ({ e, toks: plain(e).split(/[^a-z]+/).filter(Boolean) })).filter(x => x.toks.length);
  const primeiros = new Map(); emps.forEach(x => primeiros.set(x.toks[0], (primeiros.get(x.toks[0]) || 0) + 1));
  const achar = (frase) => { const m = t.match(new RegExp(`(?<![a-z])${frase}(?![a-z])`)); return m ? m.index : -1; };
  const out = [];
  for (const x of emps) {
    let i = achar(x.toks.map(escR).join('\\s+'));
    if (i < 0) for (const s of x.toks.slice(1).filter(s => s.length > 2)) { i = achar(`${escR(x.toks[0])}\\s+(?:(?:de|da|do|dos|das)\\s+)?${escR(s)}`); if (i >= 0) break; }
    if (i < 0 && x.toks[0].length > 2 && primeiros.get(x.toks[0]) === 1) i = achar(escR(x.toks[0]));
    if (i >= 0) out.push({ nome: x.e, idx: i });
  }
  // dois funcionários no mesmo lugar (nome repetido): ninguém
  const porIdx = new Map(); out.forEach(o => porIdx.set(o.idx, (porIdx.get(o.idx) || 0) + 1));
  return out.filter(o => porIdx.get(o.idx) === 1).sort((a, b) => a.idx - b.idx);
}
/**
 * Uma frase com vários pedidos ("férias do Ronaldo dia 10/11 por 20 dias e da Carla dia 01/12 por 30",
 * "atestado da Maria de 2 dias ontem e do João de 1 dia hoje", férias em dois períodos) →
 * [{ tipo, texto, campos }] (vazio quando é um pedido só). Cada parte herda o que é comum: o começo da frase
 * e, se ela só tem o nome ("o Ronaldo e a Carla, dia 10/11"), os dados da parte seguinte.
 */
export function dividirPedidos(text, rules, ctx = {}) {
  const src = String(text || '').normalize('NFC');
  const hoje = ctx.hoje || today();
  const geral = parseFreeText(src, rules, { ...ctx, employees: [] }).tipoSugerido;
  if (geral === 'rubricas' || !resolveTipo(rules, geral)?.campos?.empregado) return [];   // a folha tem as linhas por funcionário
  const mencoes = mencoesEmpregados(src, ctx.employees);
  let cortes = [];
  if (new Set(mencoes.map(m => m.nome)).size >= 2) {
    const vistos = new Set();
    cortes = mencoes.filter(m => !vistos.has(m.nome) && vistos.add(m.nome)).map(m => m.idx);
  } else if (['avisoFerias', 'calculoFerias'].includes(geral)) {
    // férias em dois (ou três) períodos do mesmo funcionário
    const def = resolveTipo(rules, geral);
    const { lista, intervalos } = analisarDatas(src, hoje, { sentido: def?.sentidoDatas || 'futuro', rules });
    const q = lerQuantidades(src, rules).filter(x => x.papel === 'gozo' && x.unidade === 'dias');
    const inicios = lista.filter(x => !x.prazo && (!x.noIntervalo || intervalos.some(iv => iv.idx === x.idx)));
    if (intervalos.length >= 2 || (inicios.length >= 2 && q.length >= 2 && !intervalos.length)) cortes = inicios.map(x => x.idx);
  }
  if (cortes.length < 2) return [];
  const comum = parseFreeText(src.slice(0, cortes[0]), rules, { ...ctx, tipoAtual: geral, hoje }).campos;
  const partes = cortes.map((ini, i) => {
    const texto = src.slice(ini, cortes[i + 1] ?? src.length);
    const proprio = suggestTipoByText(texto, rules, null)?.tipo;
    const tipo = proprio && proprio !== 'geral' ? proprio : geral;
    const r = parseFreeText(texto, rules, { ...ctx, tipoAtual: tipo, hoje });
    return { tipo, texto, campos: r.campos, candidatos: r.candidatos || null };
  });
  const dados = (p) => Object.keys(p.campos).filter(k => k !== 'empregado' && p.campos[k].conf > 0.45);
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    for (const [k, v] of Object.entries(comum)) if (!p.campos[k] && v.conf > 0.45) p.campos[k] = { ...v };
    if (!dados(p).length) {
      const seg = partes.slice(i + 1).find(x => x.tipo === p.tipo && dados(x).length);
      if (seg) for (const k of dados(seg)) if (!p.campos[k]) p.campos[k] = { ...seg.campos[k] };
    }
  }
  return partes;
}

/* ================= Leituras específicas ================= */
/* ---------- Atestado ---------- */
const NUM_PALAVRA = { um: 1, hum: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, sessenta: 60, noventa: 90, cento: 100 };
const PARA_DIAS = /\b(?:por|de|durante|periodo|repouso|necessita\w*|necessitando|afastad[oa]s?|afastamento|ficar|permanecer|total|minimo|apenas|somente)\b/;
/** Número escrito por extenso ou com erro de OCR comum ("OL", "0l", "( 03 )"). */
function lerNumeroToken(tok) {
  if (/^\d{1,3}$/.test(tok)) return { n: /^0\d\d$/.test(tok) ? +tok.slice(0, 2) : +tok, digito: true, duvida: /^0\d\d$/.test(tok) };
  if (/^[c(]?[o0][1lij|]$/.test(tok)) return { n: 1, digito: true, duvida: true };
  if (/^[o][0-9]$/.test(tok)) return { n: +tok[1], digito: true, duvida: true };
  if (NUM_PALAVRA[tok.replace(/\*+$/, '')]) return { n: NUM_PALAVRA[tok.replace(/\*+$/, '')], digito: false };
  return null;
}
function trechoDe(text, i, j) {
  let t = String(text).slice(Math.max(0, i), Math.min(text.length, j)).replace(/\s+/g, ' ').trim();
  if (i > 0) t = t.replace(/^\S*\s+/, '');          // não começa no meio de uma palavra
  return t;
}

/** Dias de afastamento: "01 (um) dia", "(03) três dias", "2 dia(s)", "repouso por 4 dias", "1 ( hum* ) dia(s)". */
export function lerDiasAtestado(text) {
  const p = plain(String(text || '').normalize('NFC'));
  const cands = [];
  for (const m of p.matchAll(/dias?(?:\s*\(s\))?(?=de|[^a-z]|$)/g)) {
    const idx = m.index;
    const antes = p.slice(Math.max(0, idx - 36), idx);
    if (/\b0?1\s*a\s*\d{1,2}\s*$/.test(antes) || /justificativa|justificar/.test(p.slice(Math.max(0, idx - 60), idx))) continue;  // "de 1 a 15 dias" das notas
    if (/\b(horas?|comprimidos?|capsulas?|gotas|ml|mg|vezes|x ao)\b/.test(p.slice(Math.max(0, idx - 40), idx + 12))) continue;      // receita de remédio
    const toks = antes.split(/[\s()[\]{}*_=+—–\-:.,;|'"!~]+/).filter(Boolean);
    let dig = null, pal = null, ruido = 0;
    for (let k = toks.length - 1; k >= 0 && k >= toks.length - 6; k--) {
      const t = toks[k];
      const n = lerNumeroToken(t);
      if (n) { if (n.digito) { dig = n; break; } if (!pal) pal = n; continue; }
      if (PARA_DIAS.test(t) || t.length > 4) break;
      if (++ruido > 3) break;
    }
    if (!dig && !pal) continue;
    const n = dig ? dig.n : pal.n;
    if (!n || n > 365) continue;
    let conf = dig && pal ? (dig.n === pal.n ? 0.92 : 0.5) : dig ? (dig.duvida ? 0.5 : 0.78) : 0.7;
    if (dig && pal && dig.n !== pal.n && !dig.duvida) conf = 0.5;
    const usado = dig && pal && dig.n !== pal.n && dig.duvida ? pal.n : n;
    const ctx = p.slice(Math.max(0, idx - 80), idx + 60);
    const bonus = /afastamento|afastad|repouso|necessit|periodo|durante|atividades|trabalho/.test(ctx) ? 0.05 : 0;
    cands.push({ n: usado, conf: Math.min(0.95, conf + bonus), trecho: trechoDe(text, idx - 30, idx + 8) });
  }
  cands.sort((a, b) => b.conf - a.conf);
  return cands[0] || null;
}

const MES_NUM = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
/** Data de início do afastamento: "a partir de 03/09/2026", "na data de…", "02/09/26", "3 de setembro de 2026";
 *  "a partir desta data" usa a data do próprio documento. Ignora nascimento, decretos e leis. */
export function lerDataAtestado(text, hoje = today()) {
  const orig0 = String(text || '').normalize('NFC');
  // OCR: O no lugar de 0 e l/I no lugar de 1 dentro de uma data ("O8/1O/2O26", "l5/10/2026") — troca 1 por 1, mesma posição
  const orig = orig0.replace(/(?<![\p{L}\d])[\dOoIl|]{1,2}\s?[\/.\-]\s?[\dOoIl|]{1,2}\s?[\/.\-]\s?[\dOoIl|]{2,4}(?![\p{L}\d])/gu, (m) => /\d/.test(m) ? m.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1') : m);
  const p = plain(orig);
  const ds = [];
  const add = (i, len, d, y2, semAno) => { if (d && !isNaN(d)) ds.push({ i, len, d, y2, semAno }); };
  const mk = (dd, mm, yy) => { let y = +yy; if (y < 100) y += 2000; const d = new Date(y, mm - 1, dd); return d.getMonth() === mm - 1 && d.getDate() === +dd ? d : null; };
  // sem ano ("no dia 10 de outubro", "a partir de 10/10"): o ano de hoje (ou o anterior, se cairia muito no futuro)
  const mkSemAno = (dd, mm) => { let d = mk(dd, mm, hoje.getFullYear()); if (d && d > addDays(hoje, 90)) d = mk(dd, mm, hoje.getFullYear() - 1); return d; };
  const MES = 'janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';
  for (const m of p.matchAll(/(?<![\d/])(\d{1,2})\s?[\/.\-]\s?(\d{1,2})\s?[\/.\-]\s?(\d{4}|\d{2})(?![\d/])/g)) add(m.index, m[0].length, mk(+m[1], +m[2], m[3]), m[3].length === 2);
  for (const m of p.matchAll(new RegExp(`\\b(\\d{1,2})(?:o|º)?\\s+de\\s+(${MES})\\s+de\\s+(\\d{4})`, 'g'))) add(m.index, m[0].length, mk(+m[1], MES_NUM[m[2]], m[3]));
  for (const m of p.matchAll(/\b(\d{1,2})\s+de\s+(\d{1,2})\s+de\s+(\d{2}|\d{4})\b/g)) add(m.index, m[0].length, mk(+m[1], +m[2], m[3]), m[3].length === 2);
  for (const m of p.matchAll(new RegExp(`(?:\\bdia\\s+|\\bem\\s+|a\\s?partir\\s+de\\s+)(\\d{1,2})(?:o|º)?\\s+de\\s+(${MES})(?!\\s+de\\s+\\d)`, 'g'))) { const i = m.index + m[0].indexOf(m[1]); add(i, m.index + m[0].length - i, mkSemAno(+m[1], MES_NUM[m[2]]), false, true); }
  for (const m of p.matchAll(/(?:\bdia\s+|a\s?partir\s+de\s+)(\d{1,2})\/(\d{1,2})(?![\d/])/g)) { const i = m.index + m[0].indexOf(m[1]); add(i, m.index + m[0].length - i, mkSemAno(+m[1], +m[2]), false, true); }
  const min = addDays(hoje, -400), max = addDays(hoje, 90);
  // "a partir desta data" / "nesta data": a data é a do atendimento da frase (ou, sem ela, a data do documento)
  const desta = [...p.matchAll(/a\s?parti[r]?\s+(?:desta|da presente|da)\s+data|\bnesta data\b|\bna presente data\b/g)].map(m => m.index);
  const ATEND = /(no dia|na data de|na data|entrada|atendid[oa]|atendimento|consulta|data e hora|data\/hora)[^\n]{0,14}$/;
  let best = null;
  for (const x of ds) {
    if (x.d < min || x.d > max) continue;
    const antes = p.slice(Math.max(0, x.i - 40), x.i);
    let sc = 0; let generico = false;
    if (/(nasc|nascimento|decreto|portaria|resolucao|\blei\b|validade|vencimento)[^\n]{0,25}$/.test(antes)) sc -= 10;
    // emissão, impressão e 2ª via são da folha, não do atendimento
    const daFolha = /(emissao|emitid[oa]|impress[aoã]o|impresso|reimpress|2a via|segunda via|gerado em|gerada em)[^\n]{0,25}$/.test(antes);
    if (/a\s?parti[r]?\s+d[eo]a?\s*[\[(]?\s*$/.test(antes) || /a\s?parti[r]?\s+(?:desta|da presente)\s+data\s*[:,]?\s*$/.test(antes)) sc += 6;
    else if (!daFolha && ATEND.test(antes)) sc += 3;
    else if (!daFolha && /\bdata\s*:\s*$/.test(antes)) { sc += 2; generico = true; }
    else if (!daFolha && (/,\s*$/.test(antes) || /\b[a-z]{2}\s*[-,]\s*$/.test(antes))) sc += 2;   // "Serra-ES, 17 de setembro de 2026"
    if (daFolha) sc -= 3;
    if (desta.length && sc > -5) {
      // a frase "a partir desta data" fala do atendimento mais perto antes dela; sem atendimento, da data do documento
      const depois = desta.find(i => i > x.i && i - x.i < 260);
      if (depois != null && ATEND.test(antes)) sc += 7;
      else if (depois == null && !daFolha && sc >= 2) sc += 4;
    }
    if (x.d > hoje) sc -= 1;
    if (!best || sc > best.sc) best = { ...x, sc, generico };
  }
  if (!best || best.sc < -5) return null;
  // "Data:" sozinho, data sem ano ou sem contexto: fica para o cliente conferir (abaixo do limiar)
  let conf = best.sc >= 6 ? 0.85 : best.sc >= 3 ? 0.75 : best.sc >= 2 && !best.generico ? 0.6 : 0.5;
  if (best.semAno) conf = Math.min(conf, 0.55);
  return { data: fmtDate(best.d), conf, trecho: trechoDe(orig0, best.i - 28, best.i + best.len), generico: best.generico, semAno: !!best.semAno };
}

/** CID: "CID: A09", "CID10 N390", "CID 10: B349", "C.I.D. F419"; corrige trocas comuns do OCR (2→Z, O→0). */
export function lerCid(text) {
  const m = String(text || '').match(/(?:\bC\.?\s?I\.?\s?D\.?|\bCID|\bCl[DO]|\bcio)(?:\s*-?\s*10\b)?\s*[:\-–]?\s*\(?\s*([A-Z0-9])\s?([0-9OIlS]{2})(?:\s?\.?\s?([0-9OIlS]))?(?![A-Za-z0-9])/i);
  if (!m) return null;
  const L = { 2: 'Z', 5: 'S', 0: 'O', 1: 'I', 8: 'B', 6: 'G', 7: 'T' }[m[1]] || m[1].toUpperCase();
  const D = (s) => String(s || '').replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/[Ss]/g, '5');
  if (!/^[A-TV-Z]$/.test(L)) return null;
  return L + D(m[2]) + (m[3] ? '.' + D(m[3]) : '');
}

const CONECTORES = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'D']);
const NAO_NOME = new Set(['PORTADOR', 'PORTADORA', 'INSCRITO', 'INSCRITA', 'CPF', 'RG', 'FOI', 'ESTEVE', 'NECESSITA', 'NECESSITANDO', 'SEXO', 'NASC', 'NASCIMENTO', 'IDADE', 'CONVENIO', 'ACIMA', 'ABAIXO', 'PACIENTE', 'PRONTUARIO', 'ATENDIDO', 'ATENDIDA', 'RECEBEU', 'DATA', 'COMPARECEU', 'SOB', 'PARA', 'POR', 'COM', 'QUE', 'NESTA', 'NA', 'NO', 'ENDERECO', 'MAE', 'PAI', 'CARTEIRA', 'IDENTIDADE', 'SENHOR', 'SENHORA', 'SR', 'SRA', 'DR', 'DRA', 'ESTADO', 'CIVIL']);
function nomeDepois(texto) {
  const linha = String(texto).split(/\n|\s{3,}|[,;|]/)[0];
  const out = [];
  for (const w of linha.split(/\s+/).filter(Boolean)) {
    const W = norm(w); if (!W) { if (out.length) break; continue; }
    if (CONECTORES.has(W) && out.length) { out.push(w); continue; }
    if (NAO_NOME.has(W)) break;
    if (!/^[A-ZÀ-Ý][A-Za-zÀ-ÿ'´]{1,}$/.test(w.replace(/[.:]+$/, ''))) break;
    out.push(w.replace(/[.:]+$/, ''));
    if (/[.:]$/.test(w) || out.length >= 7) break;
  }
  while (out.length && CONECTORES.has(norm(out[out.length - 1]))) out.pop();
  return out.join(' ');
}
/** Nome do paciente pelos rótulos e frases comuns dos atestados (ignora médico e nome da mãe). */
export function lerPacienteAtestado(text) {
  const t = String(text || '').normalize('NFC');
  const gatilhos = [
    /paciente\s*[.…]*\s*:\s*/gi,
    /\bsr\.?\s*\(\s*a\s*\)\s*:?\s*|\bsr[a]?\.?\s*:\s*|senhor\s*\(a\)\s*:?\s*|\bo\s*\(a\)\s*sr\.?\s*\(a\)\.?\s*:?\s*/gi,
    /\b(?:a?test[oa](?:mos)?|declaro)\b[^\n]{0,80}?\bque\s+(?:o\s*\(a\)\s*|a\s+|o\s+)?(?:paciente\s+)?(?:sr\.?\s*\(?a?\)?\s*:?\s*)?/gi,
    /\bpaciente\s+/gi,
    /\bnome\s*[.…]*\s*:\s*(?!d[ao]\s+m[aã]e)/gi,
    /(?:^|\n)[^\n]{0,8}?\bque\s+(?:o\s*\(a\)\s*|a\s+|o\s+)?/gi      // "Atesto" cortado pelo OCR: "to que FULANO"
  ];
  let um = '';
  for (const g of gatilhos) {
    for (const m of t.matchAll(g)) {
      const antes = t.slice(Math.max(0, m.index - 12), m.index);
      if (/m[aã]e\s*$|pai\s*$/i.test(antes)) continue;
      const n = nomeDepois(t.slice(m.index + m[0].length, m.index + m[0].length + 90));
      const partes = n.split(' ').filter(x => !CONECTORES.has(norm(x)));
      if (partes.length >= 2) return { nome: n, conf: 0.8, trecho: trechoDe(t, m.index, m.index + m[0].length + n.length) };
      if (partes.length === 1 && !um && partes[0].length >= 3) um = { nome: n, conf: 0.5, trecho: trechoDe(t, m.index, m.index + m[0].length + n.length) };
    }
  }
  return um || null;
}

/** Médico: "CRM 18669-ES", "CRM - ES Nº 7076", "CRM: 52-1260251 - RJ". */
export function lerCrm(text) {
  const m = String(text || '').match(/C\.?\s?R\.?\s?M\.?\s*[\-\/:.]*\s*(?:([A-Z]{2})\s*)?[\-\/:]*\s*(?:N[º°o.]*\s*:?\s*)?(\d[\d.\-]{2,11}\d)(?:\s*[\-\/]\s*([A-Z]{2})\b)?/);
  if (!m) return null;
  const uf = m[1] || m[3] || '';
  return `CRM ${m[2]}${uf ? '-' + uf : ''}`;
}

/** Junta tudo o que se lê de um atestado. */
export function lerAtestado(text, hoje = today()) {
  const dias = lerDiasAtestado(text);
  const data = lerDataAtestado(text, hoje);
  const pac = lerPacienteAtestado(text);
  return { dias, data, paciente: pac, cid: lerCid(text), medico: lerCrm(text) };
}

/** Linhas que falam de outras pessoas (médico, mãe, responsável) — fora da busca do funcionário. */
export function semOutrasPessoas(text) {
  const L = String(text || '').split(/\n/);
  const outra = (l) => /\b(dr\.?|dra\.?|c\.?r\.?m|m[eé]dic[oa]|conselho|nome da m[aã]e|m[aã]e\s*:|pai\s*:|profissional|respons[aá]vel|assinad[oa] digitalmente|acompanhando|carimbo)/i.test(l);
  // a linha acima de "Médico…/CRM…" costuma ser o nome do médico
  return L.filter((l, i) => !outra(l) && !(L[i + 1] != null && /^\s*(m[eé]dic[oa]|c\.?r\.?m|conselho|dr\.?|dra\.?)\b/i.test(L[i + 1]))).join('\n');
}

/** Funcionário a partir do nome lido no documento (tolera erros pequenos de OCR e sobrenome cortado). */
/* Mais de 0,85 só com o nome inteiro batendo (abreviação "N." vale); nome do meio que contradiz ("MARIA EDUARDA" ×
   "MARIA APARECIDA") fica em 0,45 com o aviso; só o primeiro nome, 0,55 — o cliente confirma. */
export function empregadoPorNome(nome, employees) {
  const toks = (s) => norm(s).split(' ').filter(t => t.length > 1 && !CONECTORES.has(t));
  const P = toks(nome); if (!P.length) return null;
  const iniciais = norm(nome).split(' ').filter(t => t.length === 1 && !CONECTORES.has(t));
  const parecido = (a, b) => a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b)) || (Math.min(a.length, b.length) >= 5 && lev(a, b) <= 1);
  const res = [];
  for (const e of employees || []) {
    const T = toks(e); if (!T.length) continue;
    if (!parecido(P[0], T[0])) continue;
    const hit = P.filter(p => T.some(t => parecido(p, t))).length;
    const score = hit / Math.max(P.length, Math.min(T.length, 3));
    if (!(P.length === 1 || score >= 0.5)) continue;
    const sobraP = P.filter(p => !T.some(t => parecido(p, t)));                 // no documento e não no cadastro
    const sobraT = T.filter(t => !P.some(p => parecido(p, t)) && !iniciais.some(i => t.startsWith(i)));   // no cadastro e não no documento
    let conf;
    if (P.length === 1) conf = 0.55;                                            // só o primeiro nome
    else if (sobraP.length && sobraT.length) conf = 0.45;                       // nome do meio contradiz
    else if (!sobraP.length && !sobraT.length) conf = 0.95;                     // nome inteiro (abreviações valem)
    else conf = Math.min(0.8, 0.55 + score * 0.3);                             // falta ou sobra um nome: confira
    res.push({ option: e, score: conf, ordem: Math.min(0.97, 0.55 + score * 0.42), contradiz: !!(sobraP.length && sobraT.length) });
  }
  res.sort((a, b) => b.ordem - a.ordem || b.score - a.score);
  if (!res.length) return null;
  if (res.length > 1 && res[1].ordem >= res[0].ordem - 0.02) return { option: null, candidatos: res.filter(r => r.ordem >= res[0].ordem - 0.02).map(r => r.option) };
  const { ordem, ...r } = res[0]; void ordem;
  return r;
}

/** Avisos sobre o documento (regras: documentos[].avisos = [{ palavras?, cid?, semCampo?, nivel, mensagem }]). */
export function avisosDoDocumento(text, docRule, campos = {}) {
  const T = plain(text); const out = [];
  for (const a of docRule?.avisos || []) {
    const porPalavra = a.palavras?.some(w => T.includes(plain(w)));
    const porCid = a.cid?.some(c => norm(campos.cid?.valor || '').replace(/ /g, '').startsWith(norm(c).replace(/ /g, '')));
    if (!(porPalavra || porCid)) continue;
    if (a.semCampo && campos[a.semCampo]) continue;
    out.push({ nivel: a.nivel || 'atencao', mensagem: a.mensagem, id: a.id || null });
  }
  return out;
}

/* ---------- Endereço, UF junto do valor, sim/não e experiência ---------- */
export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const UF_SET = new Set(UFS);
/** "Vitória/ES", "São Paulo - SP", "SSP/SP", "Vila Velha ES" → { antes, uf }; sem UF no fim → null. */
export function separarUf(v) {
  const s = String(v ?? '').trim().replace(/[.;,]+$/, '');
  let m = s.match(/^(.*?\S)\s*[\/\-–,]\s*([A-Za-z]{2})$/);
  if (m && UF_SET.has(m[2].toUpperCase()) && /\p{L}/u.test(m[1])) return { antes: m[1].trim(), uf: m[2].toUpperCase() };
  m = s.match(/^(.*\S)\s+([A-Z]{2})$/);
  if (m && UF_SET.has(m[2]) && /\p{L}{2}/u.test(m[1])) return { antes: m[1].trim(), uf: m[2] };
  return null;
}
/** "1234567 SSP/ES", "MG-12.345.678 SSP MG" → { numero, orgao, uf } (RG com o órgão e a UF juntos). */
export function separarRg(v) {
  const s = String(v ?? '').trim();
  const m = s.match(/^(?:[A-Z]{2}[\s\-]?)?([\dXx][\d.\-\/Xx]{3,}[\dXx])\s*[\-\/]?\s*([A-Za-z]{2,8})?(?:\s*[\/\-–]?\s*([A-Za-z]{2}))?$/);
  if (!m || !m[2]) return null;
  const orgao = m[2].toUpperCase(); let uf = m[3] ? m[3].toUpperCase() : null;
  if (uf && !UF_SET.has(uf)) uf = null;
  return { numero: m[1], orgao, uf };
}
/** Rádio Sim/Não: "sim", "x", "não", "nenhum", um número (dependentes: 2 → Sim). */
export function simNao(v) {
  const s = norm(v); if (!s) return null;
  if (/^(SIM|S|X|YES|POSSUI|TEM)\b/.test(s)) return 'Sim';
  if (/^(NAO|N|NENHUM|NENHUMA|NO|0+)\b/.test(s)) return 'Não';
  const n = s.match(/^(\d+)/); if (n) return +n[1] > 0 ? 'Sim' : 'Não';
  return null;
}
/** "45 + 45 dias", "45 e 45" → [45, 45]; "90 dias" → [90]. */
export function diasExperiencia(v) {
  const s = String(v ?? '');
  const m = s.match(/(\d{1,3})\s*(?:dias?\s*)?(?:\+|\be\b|mais)\s*(\d{1,3})(?!\d)/i);
  if (m) return [+m[1], +m[2]];
  const n = s.match(/\d{1,3}/); return n ? [+n[0]] : [];
}
const COMPL = /^(?:AP(?:TO?|ARTAMENTO)?|BL(?:OCO)?|CASA|SALA|LOJA|FUNDOS|LOTE|LT|QUADRA|QD|ANDAR|CONJ(?:UNTO)?|CJ|ED(?:IF[IÍ]CIO)?|TORRE|KM|CHAC(?:ARA)?|SOBRADO)\b/i;
const RX_LOGRADOURO = /\b(?:RUA|R\.|AVENIDA|AV\.?|TRAVESSA|TV\.?|ALAMEDA|AL\.|ESTRADA|ESTR\.|RODOVIA|ROD\.|PRA[CÇ]A|P[CÇ]\.|LARGO|VIELA|BECO|VILA|QUADRA)\s+/i;
/** "Rua das Flores, 123, Apto 4 - Centro - Vitória/ES" → { endereco, numero, complemento, bairro, municipio, uf }. */
export function separarEndereco(linha) {
  const out = {}; const txt = String(linha || '').replace(/\s+/g, ' ').replace(/\bCEP\s*:?\s*\d{5}-?\d{3}\b/i, '').trim();
  const m = txt.match(/^(.*?)\s*(?:,\s*|\bn[º°o]?\.?\s*|\bn[úu]mero\s*:?\s*)(\d{1,6}[A-Za-z]?|S\/?N)\b(.*)$/i)
    || txt.match(/^(.*?[A-Za-zÀ-ú.])\s+(\d{1,6}[A-Za-z]?|S\/?N)\b(.*)$/i);
  if (!m) return out;
  out.endereco = m[1].replace(/[,\-–\s]+$/, '').trim(); out.numero = m[2].toUpperCase();
  const segs = m[3].split(/\s*[,;–]\s*|\s+-\s+|^\s*-\s*/).map(x => x.trim()).filter(x => x && !/^\d{5}-?\d{3}$/.test(x));
  const livres = [];
  for (const sg of segs) {
    if (COMPL.test(sg)) { out.complemento = out.complemento ? `${out.complemento} ${sg}` : sg; continue; }
    const b = sg.match(/^bairro\s*:?\s*(.+)$/i); if (b) { out.bairro = b[1]; continue; }
    if (UF_SET.has(sg.toUpperCase()) && sg.length === 2) { out.uf = sg.toUpperCase(); if (livres.length && !out.municipio) out.municipio = livres.pop(); continue; }
    const u = separarUf(sg); if (u && !out.uf) { out.municipio = u.antes; out.uf = u.uf; continue; }
    if (/\p{L}/u.test(sg) && !/\d{3,}/.test(sg)) livres.push(sg);
  }
  if (livres.length && !out.bairro) out.bairro = livres.shift();
  if (livres.length && !out.municipio && out.uf) out.municipio = livres.shift();
  return out;
}
/* ---------- Endereço por blocos (regras: config.leitorEndereco) ----------
   Uma conta de luz traz o endereço da distribuidora (com CNPJ, no topo) e o do cliente (embaixo de "Dados do cliente"
   ou do nome do titular). Cada endereço do texto vira um bloco (rua + bairro + CEP + cidade, linhas vizinhas);
   blocos com CNPJ/S.A./LTDA/SAC ou no topo perdem pontos, o bloco do titular ganha. Dois blocos parecidos = dúvida. */
const END_PADRAO = {
  rotulosTitular: ['dados do cliente', 'unidade consumidora', 'dados do consumidor', 'dados do titular', 'local de instalacao', 'endereco de instalacao', 'endereco da instalacao', 'endereco do imovel', 'endereco de entrega', 'endereco de correspondencia', 'endereco do cliente', 'endereco do titular', 'cliente', 'titular', 'consumidor', 'destinatario'],
  rebaixar: ['cnpj', 'cnp\\)', 's\\.a\\.?', 's\\/a', 'ltda', 'eireli', 'sac', 'central de atendimento', 'atendimento ao cliente', 'ouvidoria', 'www', 'inscricao estadual', 'companhia', 'cia\\.'],
  palavrasDeConta: ['consumo', 'leitura', 'instalacao', 'matricula', 'hidrometro', 'medidor', 'vencimento', 'referencia', 'plano', 'periodo', 'telefone', 'fatura', 'nota fiscal', 'kwh', 'total', 'valor', 'conta', 'codigo', 'cliente', 'classe', 'tarifa', 'ligacao', 'rota', 'emissao']
};
const cfgEnd = (rules) => ({ ...END_PADRAO, ...(rules?.config?.leitorEndereco || {}) });
const RX_CEP = /\b(\d{5})\s?[-.]?\s?(\d{3})\b/;
/** Corta a linha no começo de outra coluna: 3+ espaços, "Rótulo:" (palavras com minúsculas antes de dois-pontos) ou palavra de conta. */
const ROT_ENDERECO = /^(?:bairro|cep|cidade|municipio|uf|estado|complemento|numero|n[º°o]|endereco|logradouro|rua)$/;
function cortarColuna(l, palavras) {
  let s = String(l || '').split(/\s{3,}|\s\|\s|\s·\s/)[0];
  // "… APTO 302 Consumo: 210 kWh": corta no começo do rótulo (palavras com minúsculas antes dos dois-pontos; em maiúsculas, a última);
  // rótulo no começo da linha ("CEP: …") ou de endereço ("Bairro: …") fica
  for (let dp = s.indexOf(':'); dp > 0; dp = s.indexOf(':', dp + 1)) {
    const ws = s.slice(0, dp).split(/\s+/).filter(Boolean); let k = ws.length;
    while (k > 0 && /\p{Ll}/u.test(ws[k - 1]) && k > ws.length - 3) k--;
    if (k === ws.length) k = ws.length - 1;
    if (k <= 0 || ROT_ENDERECO.test(plain(ws[ws.length - 1]))) continue;
    if (/^\d/.test(s.slice(dp + 1).trim()) && /^\d{1,2}$/.test(ws[ws.length - 1])) continue;   // hora "08:00"
    s = ws.slice(0, k).join(' '); break;
  }
  const p = plain(s); let corte = s.length;
  for (const w of palavras || []) { const m = p.match(new RegExp(`(?:^|\\s)${escR(plain(w))}(?![a-z])`)); if (m && m.index < corte) corte = m.index; }
  return s.slice(0, corte).replace(/[\s,;\-–]+$/, '').trim();
}
/** Cidade e UF na linha do CEP ("CEP 29101-450 VILA VELHA - ES", "Vila Velha/ES - CEP 29101-450"). */
function cidadeDaLinha(l, palavras) {
  const s = cortarColuna(l, palavras).replace(/\bCEP\b\s*:?/i, ' ').replace(RX_CEP, ' ').replace(/\s+/g, ' ').trim().replace(/^[\s,;\-–·]+|[\s,;\-–·]+$/g, '');
  const u = separarUf(s.split(/\s{2,}|·/)[0]) || separarUf(s.replace(/^.*?[,;]\s*/, ''));
  if (u && /^[\p{L} .'-]{3,40}$/u.test(u.antes)) return { municipio: u.antes.trim(), uf: u.uf };
  return null;
}
/** Todos os endereços do texto, com a pontuação de cada um. */
export function blocosEndereco(text, rules, { titular = null, ignorar = null } = {}) {
  const C = cfgEnd(rules);
  const L = String(text || '').normalize('NFC').split(/\r?\n/).map(l => l.trim());
  const rxReb = new RegExp(`(?<![a-z])(?:${C.rebaixar.join('|')})(?![a-z])`);
  const rxTit = new RegExp(`(?:^|\\s{2,}|^\\W*)(?:${C.rotulosTitular.map(x => escR(plain(x))).join('|')})(?![a-z])`);
  const T = titular ? norm(titular) : '';
  const blocos = [];
  const usadas = new Set();
  for (let i = 0; i < L.length; i++) {
    const lp = plain(L[i]); const r = L[i].search(RX_LOGRADOURO);
    const cepAqui = RX_CEP.test(L[i]) && /\bcep\b|\d{5}-\d{3}/i.test(L[i]);
    if (r < 0 && !cepAqui) continue;
    if (usadas.has(i) || ignorar?.has(L[i])) continue;   // linha que já virou outro campo (naturalidade, "SSP/ES"…)
    const b = { linhas: [i], pontos: 0, motivos: [] };
    if (r >= 0) {
      const e = separarEndereco(cortarColuna(L[i].slice(r), C.palavrasDeConta));
      if (!e.endereco || !e.numero) { if (!cepAqui) continue; } else Object.assign(b, { endereco: e.endereco, numero: e.numero, complemento: e.complemento, bairro: e.bairro, municipio: e.municipio, uf: e.uf });
    }
    const cepM = L[i].match(RX_CEP); if (cepAqui && cepM) { b.cep = `${cepM[1]}-${cepM[2]}`; const c = cidadeDaLinha(L[i].slice(L[i].search(/\bcep\b/i) >= 0 ? L[i].search(/\bcep\b/i) : 0), C.palavrasDeConta); if (c && !b.municipio) Object.assign(b, c); }
    // rua sem CEP na linha: bairro e CEP nas linhas de baixo (até 4)
    if (b.endereco && !b.cep) {
      const meio = [];
      for (let j = i + 1; j < Math.min(L.length, i + 5); j++) {
        if (L[j].search(RX_LOGRADOURO) >= 0 && !RX_CEP.test(L[j])) break;
        if (RX_CEP.test(L[j]) && /\bcep\b|\d{5}-\d{3}/i.test(L[j])) {
          const m = L[j].match(RX_CEP); b.cep = `${m[1]}-${m[2]}`; b.linhas.push(j); usadas.add(j);
          const c = cidadeDaLinha(L[j], C.palavrasDeConta); if (c) { if (!b.municipio) b.municipio = c.municipio; if (!b.uf) b.uf = c.uf; }
          break;
        }
        meio.push(j);
      }
      if (b.cep && !b.bairro) {
        const cand = meio.map(j => ({ j, v: cortarColuna(L[j], C.palavrasDeConta) })).filter(x => x.v && /^[\p{L} .'’-]{3,40}$/u.test(x.v) && x.v.split(/\s+/).length <= 5 && !rxReb.test(plain(x.v)) && !(T && norm(x.v) === T));
        if (cand.length === 1) { b.bairro = cand[0].v; b.linhas.push(cand[0].j); }
        else if (cand.length > 1) { b.bairro = cand[0].v; b.bairroDuvida = true; b.linhas.push(cand[0].j); }
      }
    }
    // pontos: empresa (CNPJ, S.A., SAC) e topo da página perdem; o bloco do titular ganha
    const viz = [...b.linhas, i - 1].filter(x => x >= 0).map(x => plain(L[x]));
    if (viz.some(x => rxReb.test(x))) { b.pontos -= 3; b.motivos.push('empresa'); }
    if (i <= 1) { b.pontos -= 2; b.motivos.push('topo'); }
    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      const pj = plain(L[j]);
      if (rxTit.test(pj) || (T && norm(L[j]).includes(T))) { b.pontos += 3; b.titular = true; b.motivos.push('titular'); break; }
      if (j < i - 1 && RX_CEP.test(L[j])) break;
    }
    if (!b.endereco) { b.pontos -= 1; b.motivos.push('so cep'); }
    if (b.endereco && b.cep && b.municipio) b.pontos += 1;
    blocos.push(b);
  }
  return blocos.sort((a, b) => b.pontos - a.pontos);
}
/** Endereço do documento: { campos: { k: valor }, conf, fonte } ou null.
 *  Comprovante: só o bloco do titular (sem ele, abaixo do limiar). Dois blocos que empatam: abaixo do limiar. */
export function lerEndereco(text, rules, { docId = null, titular = null, ignorar = null } = {}) {
  const bl = blocosEndereco(text, rules, { titular, ignorar });
  const bom = bl.filter(b => b.pontos >= 0);
  const b = bom[0]; if (!b) return null;
  const empate = bom.length > 1 && bom[1].pontos >= b.pontos - 1 && (bom[1].cep !== b.cep || norm(bom[1].endereco) !== norm(b.endereco));
  let conf = docId === 'comprovanteEndereco' ? (b.titular ? 0.7 : 0.5) : 0.5;
  if (empate) conf = Math.min(conf, 0.45);
  const campos = {};
  for (const k of ['cep', 'endereco', 'numero', 'complemento', 'bairro', 'municipio', 'uf']) if (b[k]) campos[k] = String(b[k]).trim();
  return { campos, conf, bairroDuvida: !!b.bairroDuvida, fonte: b.titular ? 'endereço do titular no documento' : 'endereço no documento', blocos: bl.length };
}
/** Endereço em contas de consumo, comprovantes e fichas (as linhas que já viraram outros campos não entram). */
export function extractAddress(text, rules) {
  return lerEndereco(text, rules)?.campos || {};
}
/* ---------- Documento pessoal com o rótulo em cima do valor (RG, CNH, CIN, CTPS digital, título) ---------- */
/* Regras: config.leitorPessoal = { layouts: { id: { palavras, campos, maeLinha, rgIgualCpf, padroesTexto } },
   porDocumento: { docId: layout }, rotulos: { "campo" | "campoA+campoB": [rótulos] }, tipos: { campo: tipo }, padroes: { campo: regex } }.
   Campos que começam com "_" (ex.: "_data") são rótulos conhecidos cujo valor não interessa. */
const LP_TIPOS = { nascimento: 'data', dataRg: 'data', cnhValidade: 'data', rg: 'numero', cnh: 'numero', cpf: 'cpf', titulo: 'numero', zona: 'numero', secao: 'numero', pis: 'numero', orgaoRg: 'sigla', ufRg: 'uf', ufNascimento: 'uf', cnhCategoria: 'categoria', nome: 'nome', mae: 'nome', pai: 'nome', nomeSocial: 'nome', municipioNascimento: 'texto', sexo: 'texto' };
export function lerDocumentoPessoal(text, cfg = {}, docId = null) {
  const src = String(text || '').normalize('NFC');
  const T = ' ' + norm(src) + ' ';
  let layout = null;
  for (const [id, l] of Object.entries(cfg?.layouts || {})) if ((l.palavras || []).some(p => norm(p) && T.includes(' ' + norm(p) + ' '))) { layout = id; break; }
  layout = layout || cfg?.porDocumento?.[docId] || null;
  const L = cfg?.layouts?.[layout] || {};
  const permitido = (k) => !L.campos || L.campos.includes(k);
  const tipos = { ...LP_TIPOS, ...(cfg?.tipos || {}) };
  const tipoDe = (k) => k.startsWith('_') ? (k.slice(1) || 'texto') : (tipos[k] || 'texto');
  const pad = cfg?.padroes || {};
  const rot = [];
  for (const [k, lst] of Object.entries(cfg?.rotulos || {})) for (const r of [].concat(lst)) { const P = norm(r); if (P) rot.push({ campos: k.split('+'), P }); }
  rot.sort((a, b) => b.P.length - a.P.length);
  const linhas = src.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
  const ehCodigo = (x) => /^\d{1,2}[A-D]?$|^[A-Z]$/.test(x);   // números de campo da CNH nova ("4a", "5") e letras soltas
  /** Rótulos de uma linha que só tem rótulos (null quando a linha tem outra coisa). */
  const rotulosDe = (l) => {
    let s = ' ' + norm(l) + ' '; const achados = [];
    for (const r of rot) {
      let i;
      while ((i = s.indexOf(' ' + r.P + ' ')) >= 0) { achados.push({ ...r, i }); s = s.slice(0, i + 1) + '#'.repeat(r.P.length) + s.slice(i + 1 + r.P.length); }
    }
    const resto = s.replace(/#+/g, ' ').trim().split(' ').filter(x => x && !ehCodigo(x));
    return !resto.length && achados.length ? achados.sort((a, b) => a.i - b.i) : null;
  };
  /** O valor serve para o campo? (data, número, sigla, UF, categoria, nome, texto + padrão das regras) */
  const serve = (k, v) => {
    const tp = tipoDe(k); const x = String(v || '').trim(); if (!x) return false;
    if (pad[k]) { try { if (!new RegExp(pad[k], 'i').test(x)) return false; } catch { /* regex inválida nas regras */ } }
    switch (tp) {
      case 'data': return !!parseDate(x);
      case 'cpf': return /^\d{3}[.,]?\d{3}[.,]?\d{3}-?\d{2}$/.test(x.replace(/\s+/g, ''));   // OCR: "000 .123.407-23"
      case 'numero': return /\d/.test(x) && /^[\d.\-\/ Xx]+$/.test(x);
      case 'uf': return x.length === 2 && UF_SET.has(x.toUpperCase());
      case 'sigla': return /^[A-Za-z]{2,8}(?:\/[A-Za-z]{2})?$/.test(x);   // "SSP/ES": órgão e UF juntos (o cadastro separa)
      case 'categoria': return /^(?:ACC|[A-E]{1,2})$/i.test(x);
      case 'nome': return !/\d/.test(x) && /\p{L}{2}/u.test(x);
      default: return /\p{L}/u.test(x);
    }
  };
  /** Casa os pedaços do valor com os campos, pelo tipo e na ordem: primeiro os que têm forma (data, número, sigla), depois os textos. */
  const casar = (campos, valor) => {
    const toks = String(valor).split(/[\s,;]+/).filter(x => x && !/^[\-–\/|]+$/.test(x));
    const pos = {}; const usado = new Set(); let p = 0;
    for (const k of campos) {
      const tp = tipoDe(k); if (tp === 'nome' || tp === 'texto') continue;
      let achou = -1, tam = 1;
      for (let q = p; q < toks.length && achou < 0; q++) for (const n of [3, 2, 1]) { if (q + n > toks.length) continue; if (serve(k, toks.slice(q, q + n).join(' '))) { achou = q; tam = n; break; } }
      if (achou >= 0) { pos[k] = [achou, achou + tam]; for (let z = achou; z < achou + tam; z++) usado.add(z); p = achou + tam; }
    }
    const res = {};
    campos.forEach((k, n) => {
      const tp = tipoDe(k);
      if (pos[k]) { res[k] = toks.slice(pos[k][0], pos[k][1]).join(' '); return; }
      if (tp !== 'nome' && tp !== 'texto') return;
      const antes = campos.slice(0, n).map(x => pos[x]?.[1] ?? -1); const depois = campos.slice(n + 1).map(x => pos[x]?.[0] ?? Infinity);
      const lo = Math.max(0, ...antes), hi = Math.min(toks.length, ...depois);
      const pegos = []; for (let z = lo; z < hi; z++) { if (usado.has(z) || /\d/.test(toks[z])) { if (pegos.length) break; continue; } pegos.push(toks[z]); usado.add(z); }
      if (pegos.length && serve(k, pegos.join(' '))) res[k] = pegos.join(' ');
    });
    return res;
  };
  const colunas = (l) => [...l.matchAll(/\S+(?: \S+)*/g)].map(m => ({ t: m[0], i: m.index }));
  /** O rótulo como está no documento (com acento), para mostrar de onde veio o valor. */
  const rotuloOriginal = (linha, P) => {
    const ws = linha.trim().split(/\s+/);
    for (let a = 0; a < ws.length; a++) for (let b = a + 1; b <= ws.length; b++) { const x = norm(ws.slice(a, b).join(' ')); if (x === P) return ws.slice(a, b).join(' '); if (x.length > P.length) break; }
    return P;
  };
  const out = {}; let filiacao = null;
  const put = (k, v, conf, fonte) => { if (!k || k.startsWith('_') || !permitido(k) || v == null || v === '' || out[k]) return; out[k] = { valor: String(v).replace(/\s+/g, ' ').trim(), conf, fonte }; };
  for (let i = 0; i < linhas.length; i++) {
    const labs = rotulosDe(linhas[i]); if (!labs) continue;
    const rotTxt = linhas[i].trim().replace(/\s{2,}/g, ' · ');
    // filiação: as duas linhas seguintes (o cliente confirma qual é a mãe)
    if (labs.length === 1 && labs[0].campos[0] === 'filiacao') {
      const nomes = [];
      for (let j = i + 1; j < linhas.length && nomes.length < 2 && !rotulosDe(linhas[j]); j++) { if (!serve('mae', linhas[j]) || linhas[j].trim().split(/\s+/).length < 2) break; nomes.push(linhas[j].trim().replace(/\s+/g, ' ')); }
      if (nomes.length) {
        filiacao = nomes;
        let im = nomes.length === 1 ? 0 : (L.maeLinha || cfg?.maeLinha || 2) - 1;
        const fem = nomes.map(n => /A$/i.test(norm(n).split(' ')[0]));
        if (nomes.length === 2 && fem[0] !== fem[1]) im = fem[0] ? 0 : 1;      // primeiro nome terminado em "a" costuma ser o da mãe
        put('mae', nomes[im], nomes.length === 2 && fem[0] !== fem[1] ? 0.55 : 0.45, `“${rotTxt}: ${nomes.join(' / ')}”`);
        if (nomes.length === 2) put('pai', nomes[1 - im], 0.45, `“${rotTxt}: ${nomes.join(' / ')}”`);
      }
      continue;
    }
    const j = i + 1; if (j >= linhas.length || rotulosDe(linhas[j])) continue;
    const vlin = linhas[j];
    const segL = colunas(linhas[i]), segV = colunas(vlin);
    const grupos = labs.map(() => []);
    if (labs.length > 1 && segL.length === labs.length && segV.length > 1) {
      // PDF: colunas separadas por espaços — cada pedaço vai para o rótulo mais perto
      for (const v of segV) { let best = 0; segL.forEach((c, n) => { if (Math.abs(c.i - v.i) < Math.abs(segL[best].i - v.i)) best = n; }); grupos[best].push(v.t); }
      labs.forEach((lab, n) => { if (!grupos[n].length) return; const r = casar(lab.campos, grupos[n].join(' ')); for (const [k, v] of Object.entries(r)) put(k, v, 0.7, `“${segL[n].t}: ${v}”`); });
    } else {
      // foto (OCR junta as colunas): casa pelo tipo, na ordem dos rótulos
      const r = casar(labs.flatMap(l => l.campos), vlin.trim());
      for (const [k, v] of Object.entries(r)) put(k, v, labs.length > 1 ? 0.6 : 0.7, `“${rotuloOriginal(linhas[i], (labs.find(l => l.campos.includes(k)) || labs[0]).P)}: ${v}”`);
    }
  }
  // padrões de texto do layout (título: zona e seção sem dois-pontos, inscrição de 12 dígitos)
  for (const [k, pats] of Object.entries(L.padroesTexto || {})) if (!out[k]) { const v = runPatterns(src, pats); if (v) put(k, v, 0.6, `“${v}” no documento`); }
  // ajustes finais: datas, CPF, números
  for (const [k, c] of Object.entries(out)) {
    const tp = tipoDe(k);
    if (tp === 'data') { const d = parseDate(c.valor); if (d) c.valor = fmtDate(d); else delete out[k]; }
    if (tp === 'cpf') { c.valor = fmtCPF(c.valor); if (!validCPF(c.valor)) c.conf = 0.45; }
    if (['titulo', 'zona', 'secao', 'cnh'].includes(k)) c.valor = onlyDigits(c.valor);
  }
  // CIN: o número da identidade é o CPF
  if (L.rgIgualCpf && out.cpf && !out.rg) out.rg = { valor: onlyDigits(out.cpf.valor), conf: out.cpf.conf, fonte: 'na CIN, o número é o CPF' };
  return { layout, campos: out, filiacao };
}
/** Titular de um comprovante de residência ("Nome:", "Cliente:", "Titular:"). */
export function titularComprovante(text) {
  const t = String(text || '').normalize('NFC');
  for (const m of t.matchAll(/\b(?:nome(?:\s+do\s+(?:cliente|titular))?|cliente|titular|destinat[aá]rio|consumidor)\s*:\s*/gi)) {
    const n = nomeDepois(t.slice(m.index + m[0].length, m.index + m[0].length + 90));
    if (n.split(' ').filter(x => !CONECTORES.has(norm(x))).length >= 2) return n;
  }
  return null;
}
/** Comprovante em nome de outra pessoa: aviso educativo (pode ser de um parente; o escritório pode pedir uma declaração). */
export function avisoComprovante(titular, nome, rules) {
  const pm = titular && nome ? empregadoPorNome(titular, [nome]) : null;
  if (!titular || !nome || (pm?.option && !pm.contradiz && pm.score > 0.55) || similarity(titular, nome) >= 0.85) return null;
  const msg = rules?.mensagens?.comprovanteOutraPessoa || 'O comprovante de residência está em nome de {titular}. Tudo bem se for de um parente (pai, mãe, cônjuge): nesse caso o escritório pode pedir uma declaração de residência assinada pelo titular.';
  return { nivel: 'info', id: 'comprovanteOutraPessoa', mensagem: msg.replace('{titular}', titular).replace('{nome}', nome) };
}
/** ASO: resultado, tipo de exame e data. */
/** Qual opção está marcada num formulário impresso ("( ) Apto (X) Inapto", "[x]", "☒").
 *  ASO e CAT trazem todas as opções escritas: procurar a palavra solta elegia a errada.
 *  Devolve null quando nenhuma ou mais de uma está marcada — aí o cliente confere. */
export function opcaoMarcada(text, opcoes, { exigeMarca = false } = {}) {
  const t = plain(text);
  const esc = (x) => plain(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const lista = (opcoes || []).filter(Boolean);
  if (!lista.length) return null;
  // onde cada opção aparece no texto
  const ondes = [];
  for (const o of lista) {
    const re = new RegExp(`\\b${esc(o)}\\b`, 'gi');
    for (let m; (m = re.exec(t));) ondes.push({ o, ini: m.index, fim: m.index + m[0].length });
  }
  if (!ondes.length) return null;
  // cada marca pertence à opção colada nela: a que começa logo depois, senão a que termina logo antes
  const marcas = /[(\[]\s*(?:x|☒|■|▣|✓|✔)\s*[)\]]|(?:^|\s)(?:☒|■|▣|✓|✔)(?=\s|$)/gi;
  const marcadas = new Set();
  for (let m; (m = marcas.exec(t));) {
    const ini = m.index, fim = m.index + m[0].length;
    const depois = ondes.filter(x => x.ini >= fim && x.ini - fim <= 2).sort((a, b) => a.ini - b.ini)[0];
    const antes = ondes.filter(x => x.fim <= ini && ini - x.fim <= 2).sort((a, b) => b.fim - a.fim)[0];
    // "(X) Opção" vem antes da opção; um símbolo solto ("Opção ☒") vem depois dela
    const dono = /[(\[]/.test(m[0]) ? (depois || antes) : (antes || depois);
    if (dono) marcadas.add(dono.o);
  }
  if (marcadas.size === 1) return [...marcadas][0];
  if (marcadas.size > 1 || exigeMarca) return null;
  // sem marca nenhuma: só vale quando o documento traz uma única opção (texto corrido)
  const presentes = [...new Set(ondes.map(x => x.o))];
  return presentes.length === 1 ? presentes[0] : null;
}
/** Regras de "opções por palavra" de um documento: documentos[].opcoesPorPalavra = [{ campo, opcoes: { valor: [expressões] },
 *  soMarcada? }]. O formato antigo da CAT (tipoCatPalavras) continua valendo para o campo tipoCat. */
export function regrasDeOpcoes(docRule) {
  const l = [...(docRule?.opcoesPorPalavra || [])];
  if (docRule?.tipoCatPalavras && !l.some(o => o.campo === 'tipoCat')) l.push({ campo: 'tipoCat', opcoes: docRule.tipoCatPalavras });
  return l;
}
/** Valor de uma opção pelas expressões do documento (sempre a expressão inteira: "dispensar" não casa "dispensa do aviso").
 *  Formulário impresso com todas as opções: só vale a marcada. soMarcada: só com marca ("( X ) Abono pecuniário"). */
export function opcaoPorPalavra(text, regra) {
  const T = ' ' + norm(text) + ' ';
  const tem = (w) => { const W = norm(w); return !!W && T.includes(' ' + W + ' '); };
  const cands = Object.entries(regra?.opcoes || {}).filter(([k, ws]) => !k.startsWith('_') && Array.isArray(ws) && ws.some(tem));
  if (!cands.length) return null;
  if (cands.length === 1 && !regra.soMarcada) return cands[0][0];
  const marcada = opcaoMarcada(text, cands.flatMap(([, ws]) => ws.filter(tem)), { exigeMarca: !!regra.soMarcada });
  const dono = marcada && cands.find(([, ws]) => ws.some(w => norm(w) === norm(marcada)));
  return dono ? dono[0] : null;
}
const ASO_TIPOS = ['admissional', 'demissional', 'periodico', 'retorno ao trabalho', 'mudanca de funcao'];
const ASO_PISTAS = ['data do exame', 'data de realização', 'data da realização', 'realizado em', 'data do aso', 'data de emissão', 'data:'];
/** ASO: resultado, tipo de exame marcado e data do exame — pela pista (documentos[].pistasData: "data do exame",
 *  "realizado em", "Data:"); sem pista, a da linha "Cidade/UF, dd/mm/aaaa"; senão a última do texto (nunca nascimento/admissão). */
export function readASO(text, docRule = null) {
  const t = plain(text);
  const resultado = opcaoMarcada(t, ['inapto', 'apto']);
  const tipo = opcaoMarcada(t, ASO_TIPOS);
  const T = String(text || '').normalize('NFC');
  const RXD = /(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4})/;
  let data = null;
  for (const p of docRule?.pistasData || ASO_PISTAS) {
    const P = plain(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    const m = plain(T).match(new RegExp(`(?<![a-z])${P}`)); if (!m) continue;
    const resto = T.slice(m.index + m[0].length, m.index + m[0].length + 40).split('\n')[0];
    const d = resto.match(RXD); const dt = d && dataValida(+d[3], +d[2] - 1, +d[1]);
    if (dt) { data = fmtDate(dt); break; }
  }
  if (!data) {
    const local = T.match(/[A-Za-zÀ-ú .'-]{3,}\/[A-Z]{2}\s*,\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (local && parseDate(local[1])) data = fmtDate(parseDate(local[1]));
  }
  if (!data) {
    // a última data que não é de nascimento nem de admissão
    const linhas = T.split(/\n/).filter(l => !/nasc|admiss/i.test(plain(l)));
    const datas = findDates(linhas.join('\n')); data = datas.length ? fmtDate(datas[datas.length - 1]) : null;
  }
  return { resultado: resultado ? resultado.toUpperCase() : null, tipo, data };
}
/** Uma linha que resume o que foi entendido do documento (aparece embaixo do arquivo). */
export function summarizeDocument(analise, text) {
  const id = analise?.documento?.id; const c = analise?.campos || {}; const v = (k) => c[k]?.valor;
  if (id === 'atestado') return [v('empregado') || (analise.paciente && `paciente: ${analise.paciente}`), v('dias') && `${v('dias')} ${+v('dias') === 1 ? 'dia' : 'dias'}`, v('dataAfastamento') && `a partir de ${v('dataAfastamento')}`].filter(Boolean).join(' · ');
  if (id === 'aso') { const a = readASO(text); return ['ASO', a.tipo, a.resultado, a.data].filter(Boolean).join(' · '); }
  if (id === 'cat') return ['CAT', v('numeroCat'), v('dataAfastamento') && `acidente em ${v('dataAfastamento')}`].filter(Boolean).join(' · ');
  if (id === 'pedidoDemissao') return ['Pedido de demissão', v('empregado'), v('dataAviso')].filter(Boolean).join(' · ');
  if (id === 'comprovanteEndereco') { const a = extractAddress(text); return [a.endereco && `${a.endereco}, ${a.numero || ''}`, a.cep].filter(Boolean).join(' · '); }
  if (id === 'fichaAdmissao') return [v('nome'), v('cpf')].filter(Boolean).join(' · ');
  return '';
}

/* =================== Plataforma (2.0) =================== */
/* Solicitações lidas das listas do portal. O formato dos itens do Onvio ainda não foi visto
   (a calibrar): procura a situação, o funcionário e as datas em vários nomes de campo, e as
   expressões que dizem "aguardando você" ficam nas regras (config.statusSolicitacao). */
const PADRAO_STATUS = {
  aguardando: ['aguardando[^"]{0,20}(cliente|voc[eê])', 'waiting[_ ]?(for[_ ]?)?(client|customer)', 'awaiting'],
  concluida: ['conclu', 'finaliz', 'complet', 'encerrad'],
  cancelada: ['cancel']
};
const reLista = (lista) => (lista || []).map(s => { try { return new RegExp(s, 'i'); } catch { return null; } }).filter(Boolean);
/** 'aguardando' | 'andamento' | 'concluida' | 'cancelada' */
export function classificarEstado(status, bruto, regras) {
  const cfg = { ...PADRAO_STATUS, ...(regras?.config?.statusSolicitacao || {}) };
  const s = String(status || '');
  const tudo = `${s} ${typeof bruto === 'string' ? bruto : JSON.stringify(bruto || '')}`;
  if (reLista(cfg.aguardando).some(r => r.test(tudo))) return 'aguardando';
  if (reLista(cfg.cancelada).some(r => r.test(s))) return 'cancelada';
  if (reLista(cfg.concluida).some(r => r.test(s))) return 'concluida';
  return 'andamento';
}
const texto1 = (...vs) => { for (const v of vs) { if (v == null || v === '') continue; if (typeof v === 'string' || typeof v === 'number') return String(v); if (typeof v === 'object') { const d = v.description || v.name || v.label || v.value; if (d) return String(d); } } return ''; };
/** Item cru da lista → { tipo, id, numero, status, estado, lado, aguardando, empregado, responsavel, assunto,
 *  atualizado, criado, expectativa, parado (dias), prescreveEm }.
 *  No Onvio o item traz genericStatus (número) com sentido por família (regras.config.statusSolicitacao.familias,
 *  mapeado no Onvio real); situação em texto continua valendo pelas expressões. */
export function normalizarSolicitacao(it, tipo, regras, hoje = today()) {
  const cfg = regras?.config?.statusSolicitacao || {};
  const fam = regras?.tipos?.[tipo]?.familiaStatus;
  const codigo = [it?.genericStatus, it?.clientStatus, typeof it?.status === 'number' ? it.status : null].find(v => v != null && v !== '' && !isNaN(+v));
  let status = texto1(it?.status, it?.situation, it?.statusDescription, it?.state);
  let estado, lado;
  const ent = codigo != null ? cfg.familias?.[fam]?.[String(+codigo)] : null;
  if (ent) {
    status = ent[0]; lado = ent[1];
    estado = { cli: 'aguardando', esc: 'andamento', fim: 'concluida', prescrita: 'prescrita' }[lado] || 'andamento';
  } else if (codigo != null && !status) {
    status = `Situação desconhecida (código ${codigo})`; estado = 'andamento'; lado = 'esc';
  } else {
    estado = classificarEstado(status, it, regras);
    lado = estado === 'aguardando' ? 'cli' : estado === 'andamento' ? 'esc' : 'fim';
  }
  const atualizado = parseDate(texto1(it?.lastUpdated, it?.genericLastUpdated, it?.lastUpdate, it?.updatedAt, it?.lastProceedingDate, it?.modifiedDate, it?.created, it?.createdAt, it?.creationDate, it?.date));
  const parado = atualizado ? Math.max(0, diffDays(atualizado, hoje)) : null;
  const prescreve = (cfg.prescreve || ['padrao', 'rubricas']).includes(fam);
  const dias = +regras?.config?.prescricaoDias || 30;
  return {
    tipo,
    id: texto1(it?.id, it?.requestNumber, it?.number, it?.protocol),
    numero: texto1(it?.identifier, it?.requestNumber, it?.number, it?.protocol, it?.id),
    status: status || (cfg.rotulos || {})[estado] || '',
    estado, lado,
    aguardando: estado === 'aguardando',
    empregado: texto1(it?.clientEmployeeExpanded?.name, it?.employee?.name, it?.employeeName, it?.selectedEmployee?.name, it?.payrollEntryClientEmployeeExpanded?.name, typeof it?.employee === 'string' ? it.employee : null, it?.name),
    responsavel: texto1(it?.staffResponsibleExpanded?.name),
    empresa: texto1(it?.clientExpanded?.name), empresaApelido: texto1(it?.clientExpanded?.nickname),
    assunto: texto1(it?.subject, it?.title, typeof it?.description === 'string' && it.description.length < 140 ? it.description : null),
    atualizado, parado,
    criado: parseDate(texto1(it?.created, it?.createdAt)),
    expectativa: parseDate(texto1(it?.dueDate)),
    competencia: texto1(it?.effectiveDate) ? fmtDate(parseDate(it.effectiveDate))?.slice(3) : '',
    prescreveEm: estado === 'aguardando' && prescreve && parado != null ? Math.max(0, dias - parado) : null,
    // datas do aviso (vêm no detalhe da solicitação no Onvio real; se a lista trouxer, já valem)
    datas: datasDoAviso(it),
    tramite: texto1(it?.lastProceeding?.description, it?.lastProceeding, it?.lastComment)
  };
}

/* Um login pode ver várias empresas: as listas do Onvio trazem as solicitações de todas (clientExpanded).
   filtro: '' = a empresa aberta no portal (se nenhum item bater com o nome, mostra tudo), '*' = todas, ou o nome de uma. */
const mesmaEmpresa = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
export function empresasDasSolicitacoes(itens) {
  const m = new Map(); for (const i of itens || []) if (i.empresa) m.set(i.empresa, (m.get(i.empresa) || 0) + 1);
  return [...m].map(([nome, n]) => ({ nome, n })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
export function filtrarPorEmpresa(itens, filtro, empresaAtual) {
  const l = itens || [];
  if (empresasDasSolicitacoes(l).length <= 1 || filtro === '*') return l;
  // várias empresas escolhidas (2.5): lista de nomes; item sem empresa sempre entra
  if (Array.isArray(filtro)) { const q = new Set(filtro); return filtro.length ? l.filter(i => !i.empresa || q.has(i.empresa)) : l; }
  if (filtro) return l.filter(i => i.empresa === filtro);
  const atual = l.filter(i => !i.empresa || mesmaEmpresa(i.empresa, empresaAtual));
  return atual.some(i => i.empresa) ? atual : l;
}
/** Empresas que o login enxerga, para a caixa "Para qual empresa?" ao abrir um pedido: as das solicitações lidas,
 *  as já vistas antes (a lista é relida quando a empresa muda) e a que está aberta no portal. Cada uma traz quantas
 *  solicitações tem em aberto e quantas esperam o cliente. A aberta no portal vem primeiro. */
export function empresasParaEscolha(itens, empresaAtual, conhecidas = []) {
  const m = new Map();
  const poe = (nome, apelido = '') => {
    const k = norm(nome); if (!k) return null;
    if (!m.has(k)) m.set(k, { nome, apelido: '', abertas: 0, esperam: 0 });
    const e = m.get(k); if (apelido && !e.apelido) e.apelido = apelido;
    return e;
  };
  for (const c of conhecidas || []) poe(c.nome, c.apelido);
  for (const i of itens || []) {
    const e = poe(i.empresa, i.empresaApelido); if (!e) continue;
    if (['aguardando', 'andamento'].includes(i.estado)) e.abertas++;
    if (i.aguardando) e.esperam++;
  }
  // a do portal: se for a mesma de uma já listada (nome um pouco diferente no cabeçalho), não duplica
  const atual = [...m.values()].find(e => mesmaEmpresa(e.nome, empresaAtual));
  if (!atual && norm(empresaAtual)) poe(empresaAtual);
  const lista = [...m.values()].map(e => ({ ...e, atual: mesmaEmpresa(e.nome, empresaAtual) }));
  return lista.sort((a, b) => (b.atual - a.atual) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
export const mesmaEmpresaNome = (a, b) => mesmaEmpresa(a, b);
/** Nomes das empresas que o filtro mostra (para marcar as caixas do seletor). */
export function empresasSelecionadas(itens, filtro, empresaAtual) {
  const todas = empresasDasSolicitacoes(itens).map(e => e.nome);
  if (filtro === '*') return todas;
  if (Array.isArray(filtro)) return filtro.length ? todas.filter(n => filtro.includes(n)) : todas;
  const d = empresaDoFiltro(itens, filtro, empresaAtual);
  return d === '*' ? todas : [d];
}
export const empresaDoFiltro = (itens, filtro, empresaAtual) => Array.isArray(filtro) ? (filtro.length === 1 ? filtro[0] : '*') : filtro === '*' ? '*' : filtro || (empresasDasSolicitacoes(itens).find(e => mesmaEmpresa(e.nome, empresaAtual))?.nome || '*');

/** Datas de um aviso de férias ou rescisão (campos do Onvio real, mapa do Control Onvio). */
export function datasDoAviso(it) {
  const d = (v) => parseDate(texto1(v));
  const abono = it?.bonusDays != null && it.bonusDays !== '' && !isNaN(+it.bonusDays) ? +it.bonusDays : null;
  return { inicioFerias: d(it?.vacationStartDate), pagamento: d(it?.paymentDate), aviso: d(it?.adviceDate || it?.noticeDate || it?.priorNoticeDate), dias: +it?.vacationDays || null,
    desligamento: d(it?.resignationDate), avisoPrevio: d(it?.priorNoticeAdviceDate), admissao: d(it?.admissionDate || it?.startDate),
    afastamento: d(it?.leaveDate), competencia: d(it?.effectiveDate), abono };
}
/* "Pedir o cálculo" de um aviso que já está no portal: os dados do aviso viram sugestão no cálculo ("do aviso nº X"),
   não valores digitados pelo cliente — um documento arrastado depois ainda pode corrigi-los. O tipo de aviso
   (trabalhado ou indenizado) continua com o cliente. Rescisão e abono: a calibrar no Onvio real (adviceDate, bonusDays). */
export function valoresDoAviso(item, rules) {
  const d = item?.datas || {}; const out = {};
  const tipo = PAR_CALCULO[item?.tipo] || null;
  if (item?.tipo === 'avisoFerias') {
    if (d.inicioFerias) out.inicioGozo = fmtDate(d.inicioFerias);
    if (d.dias) out.diasGozo = String(d.dias);
    if (d.abono != null) Object.assign(out, levarValores(['diasAbono→abono'], { diasAbono: String(d.abono) }, rules, 'calculoFerias'));
  } else if (item?.tipo === 'avisoRescisao') {
    const a = d.aviso || d.avisoPrevio; if (a) out.dataAvisoPrevio = fmtDate(a);
  }
  return { tipo, valores: out, fonte: item?.numero ? `do aviso nº ${item.numero}` : 'do aviso no portal', em: d.aviso || item?.criado || null };
}
/** O aviso mais recente desse funcionário no portal (para "Usar os dados do aviso" e o destaque do cálculo no texto livre). */
export function avisoDoFuncionario(itens, empregado, tipoAviso, hoje = today(), dias = 120) {
  const q = norm(empregado); if (!q) return null;
  return (itens || []).filter(i => i.tipo === tipoAviso && norm(i.empregado) === q && !['cancelada', 'prescrita'].includes(i.estado) && (!i.criado || diffDays(i.criado, hoje) <= dias))
    .sort((a, b) => (b.criado?.getTime() || 0) - (a.criado?.getTime() || 0))[0] || null;
}
/** O portal já tem o pedido desse tipo para o funcionário (criado a partir de `desde`, com 1 dia de folga)? */
export function temPedidoDe(itens, tipo, empregado, desde = null) {
  const q = norm(empregado);
  return !!q && (itens || []).some(i => i.tipo === tipo && norm(i.empregado) === q && !['cancelada', 'prescrita'].includes(i.estado) && (!desde || !i.criado || diffDays(desde, i.criado) >= -1));
}
/** Valores que vão de um pedido para o seguinte (regras: "campo" ou "de→para"); dias de abono viram o SIM/NÃO do
 *  campo que tem porNumero (o abono só vira SIM com dias maiores que zero). */
export function levarValores(levar, values, rules, destino) {
  const def = resolveTipo(rules, destino); const out = {};
  for (const s of levar || []) {
    const [de, para = de] = String(s).split(/\s*(?:→|->)\s*/);
    const v = values?.[de]; if (v == null || v === '') continue;
    const c = def?.campos?.[para]; if (!c) continue;
    if (c.porNumero && c.porNumero.campo === de) { const n = parseInt(onlyDigits(v), 10); if (!isNaN(n)) out[para] = n > 0 ? c.porNumero.maiorQueZero : c.porNumero.zero; continue; }
    out[para] = String(v);
  }
  return out;
}
/* ---------- Depois de enviar (regras: tipos.*.depoisDeEnviar) ----------
   [{ tipo? (o pedido seguinte) ou lembrete, titulo, prazo: { formula: 'pagamentoFerias'|'pagamentoRescisao'|'dias', de, dias?,
   diasUteisAntes? (chave de config.prazoInternoDiasUteis) }, levar: ['campo', 'de→para'], se? }] → [{ tipo, lembrete, titulo, ate, valores }] */
export function proximosPassos(tipoKey, values, rules, cal = makeCalendar(rules?.feriados)) {
  const out = [];
  for (const p of rules?.tipos?.[tipoKey]?.depoisDeEnviar || []) {
    if (p.se && !matchCond(p.se, values || {})) continue;
    if (p.tipo && !rules.tipos[p.tipo]) continue;
    const pr = p.prazo || {}; const base = parseDate(values?.[pr.de]);
    let ate = null;
    if (base) {
      if (pr.formula === 'pagamentoFerias') ate = pagamentoFerias(base, rules, cal);
      else if (pr.formula === 'pagamentoRescisao') ate = pagamentoRescisao(base, rules, cal);
      else ate = addDays(base, +pr.dias || 0);
      const uteis = pr.diasUteisAntes ? +rules.config?.prazoInternoDiasUteis?.[pr.diasUteisAntes] || 0 : 0;
      if (uteis) ate = cal.addBusinessDays(ate, -uteis);
    }
    const vals = { ...values, empregado: values?.empregado || '' };
    out.push({ tipo: p.tipo || null, lembrete: !p.tipo, titulo: renderTemplate(p.titulo, vals) || String(p.titulo || '').replace(/\{[^}]*\}/g, '').trim(), ate,
      valores: p.tipo ? levarValores(p.levar, values, rules, p.tipo) : {}, empregado: values?.empregado || '', dica: p.dica || '' });
  }
  return out;
}

/* ---------- Experiência: tempo de casa, saídas e o motivo certo ---------- */
const marcosExperiencia = (rules) => (rules?.config?.experienciaDias || [45, 90]).map(Number).filter(Boolean);
/** As três saídas de uma experiência que vence no marco n: prorrogar (até o total máximo), encerrar no fim ou efetivar. */
export function saidasExperiencia(admissao, n, rules) {
  const a = parseDate(admissao); if (!a) return null;
  const max = Math.max(...marcosExperiencia(rules), 0) || 90;
  const pode = n < max;
  return { fim: addDays(a, n - 1), podeProrrogar: pode, diasProrrogacao: pode ? max - n : 0, fimProrrogacao: pode ? addDays(a, max - 1) : null, max };
}
/** No Aviso/Cálculo de Rescisão: o funcionário ainda está na experiência na data do aviso (ou da saída)? Então sugere o
 *  motivo de contrato de experiência (config.experienciaSaidas.motivos) — a tela pergunta, nunca escolhe sozinha. */
export function sugestaoMotivoExperiencia(values, admissao, rules, hoje = today()) {
  const adm = parseDate(admissao); if (!adm) return null;
  const ref = parseDate(values?.dataDemissao) || parseDate(values?.dataAviso) || parseDate(values?.dataAvisoPrevio) || hoje;
  const marcos = marcosExperiencia(rules); const max = Math.max(...marcos, 0) || 90;
  const dia = diffDays(adm, ref) + 1;
  if (dia < 1 || dia > max) return null;
  const m = norm(values?.motivo || '');
  if (/EXPERIENCIA|TEMPO DETERMINADO/.test(m)) return null;
  const mot = { termino: 'Término de contrato de trabalho por tempo determinado', antecipadoEmpregador: 'Rescisão contrato experiência antecipado pelo empregador', antecipadoEmpregado: 'Rescisão contrato experiência antecipado pelo empregado', ...(rules?.config?.experienciaSaidas?.motivos || {}) };
  const fim = marcos.map(n => addDays(adm, n - 1)).find(f => f >= ref) || addDays(adm, max - 1);
  const noFim = iso(fim) === iso(ref);
  const peloEmpregado = norm(values?.avisoDadoPor || '') === 'EMPREGADO' || m.includes('PEDIDO DE DEMISSAO');
  return { valor: noFim ? mot.termino : peloEmpregado ? mot.antecipadoEmpregado : mot.antecipadoEmpregador, dia, fim, noFim, admissao: adm };
}
/** Valores de um modelo para assinar a partir do pedido (modelosDocumento[].campos[].de = chave do contexto; mapa = troca de valor). */
export function valoresDoModelo(md, ctx = {}) {
  const out = {};
  for (const c of md?.campos || []) {
    let v = ctx[c.de || c.k];
    if (v != null && c.mapa) v = Object.entries(c.mapa).find(([k]) => norm(k) === norm(v))?.[1] ?? null;
    if (v != null && v !== '') out[c.k] = String(v);
  }
  return out;
}
/* Avisos que pedem o cálculo: aviso de férias ou de rescisão criado no portal sem a solicitação de
   cálculo do mesmo funcionário. Férias: pagamento até 2 dias antes do início (CLT 145). Rescisão: até 10 dias
   do fim do contrato (CLT 477 §6) — com aviso indenizado conta da data do aviso (o mais cedo possível). */
const PAR_CALCULO = { avisoFerias: 'calculoFerias', avisoRescisao: 'calculoRescisao' };
export function avisosSemCalculo(itens, hoje = today(), regras = {}, cal = makeCalendar(regras?.feriados)) {
  const lista = itens || [];
  const precisa = regras?.config?.prazoInternoDiasUteis?.calculo || 5;
  const out = [];
  for (const a of lista) {
    const par = PAR_CALCULO[a.tipo];
    if (!par || ['cancelada', 'prescrita'].includes(a.estado) || !a.empregado) continue;
    const quem = norm(a.empregado);
    const base = a.criado || a.atualizado;
    const temCalculo = lista.some(c => c.tipo === par && norm(c.empregado) === quem && !['cancelada', 'prescrita'].includes(c.estado)
      && (!base || !c.criado || diffDays(base, c.criado) >= -30));
    if (temCalculo) continue;
    const dt = a.datas || {};
    let pagamento = null, estimado = false, inicio = null;
    if (a.tipo === 'avisoFerias') {
      inicio = dt.inicioFerias;
      pagamento = dt.pagamento || pagamentoFerias(inicio, regras, cal);
    } else {
      const av = dt.aviso || null;
      if (av) { pagamento = pagamentoRescisao(av, regras, cal); estimado = true; }
    }
    if (pagamento) {
      const falta = diffDays(hoje, pagamento);
      if (falta < -10 || falta > 45) continue;
      out.push({ item: a, tipo: a.tipo === 'avisoFerias' ? 'ferias' : 'rescisao', calculo: par, pagamento, inicio, estimado, falta,
        enviarAte: cal.addBusinessDays(pagamento, -precisa) });
    } else if (base && diffDays(base, hoje) <= 45) {
      out.push({ item: a, tipo: a.tipo === 'avisoFerias' ? 'ferias' : 'rescisao', calculo: par, pagamento: null, inicio, estimado: true, falta: null, enviarAte: null });
    }
  }
  return out.sort((x, y) => (x.falta ?? 99) - (y.falta ?? 99));
}
/** Equipe no Hoje: experiência vencendo (30 dias) e férias a vencer (prazo de concessão em até 60 dias, estimativa). */
export function equipeVencendo(empregados, itens, hoje = today(), regras = {}) {
  const exp = [], ferias = [];
  const recente = (tipo, nome, dias) => (itens || []).some(i => i.tipo === tipo && norm(i.empregado) === norm(nome) && i.criado && diffDays(i.criado, hoje) <= dias && !['cancelada', 'prescrita'].includes(i.estado));
  for (const e of empregados || []) {
    if (e.ativo === false) continue;
    const s = situacaoEmpregado(e, hoje, regras);
    const x = s.experiencia.find(k => k.falta >= 0 && k.falta <= 30);
    if (x && !recente('avisoRescisao', e.nome, 60)) exp.push({ nome: e.nome, n: x.n, fim: x.fim, falta: x.falta });
    if (s.ferias && s.ferias.falta <= 60 && !recente('avisoFerias', e.nome, 120) && !recente('calculoFerias', e.nome, 120))
      ferias.push({ nome: e.nome, limite: s.ferias.limite, falta: s.ferias.falta, aquisitivo: s.ferias.aquisitivo });
  }
  return { experiencia: exp.sort((a, b) => a.falta - b.falta), ferias: ferias.sort((a, b) => a.falta - b.falta) };
}

/** Trâmites crus ({base}/{id}/topics) → [{ n, em, situacao, autor, texto (HTML do portal), anexos }], do mais antigo ao mais novo.
 *  A situação de cada trâmite usa os códigos da família do tipo (como no Control Onvio). */
export function tramitesDe(lista, tipo, regras) {
  const fam = regras?.tipos?.[tipo]?.familiaStatus;
  const mapa = regras?.config?.statusSolicitacao?.familias?.[fam] || {};
  const arr = Array.isArray(lista) ? lista : (lista?.items || []);
  return arr.filter(x => x && x.created).sort((a, b) => String(a.created).localeCompare(String(b.created))).map((x, i) => ({
    n: i + 1,
    em: x.created,
    situacao: x.status != null && mapa[String(+x.status)] ? mapa[String(+x.status)][0] : (typeof x.status === 'string' ? x.status : ''),
    autor: texto1(x.createdByContactExpanded?.name, x.createdByExpanded?.name),
    texto: typeof x.description === 'string' ? x.description : '',
    anexos: (x.attachmentsExpanded || []).map(a => a && (a.name || a.fileName)).filter(Boolean).slice(0, 30),
    // quem escreveu (como no Control Onvio): a 1ª é a abertura (cliente); depois, pela situação que o trâmite gravou
    lado: i === 0 || gravaCliente(regras, fam).has(Number(x.status)) ? 'cli' : 'esc'
  }));
}
/* Situações que o CLIENTE grava em cada família (mapa do Control Onvio): o resto é do escritório. */
const gravaCliente = (regras, fam) => new Set((regras?.config?.statusSolicitacao?.clienteGrava?.[fam] || { padrao: [1, 3], cadastro: [1, 2, 4], rubricas: [0, 1, 11, 12] }[fam] || [1, 3]).map(Number));

/* ---------- Conversa: o escritório pede algo? (2.4, regra do Control Onvio) ----------
   Uma resposta do escritório "pede algo" se tiver uma pergunta ou uma das palavras de config.pedidoAoCliente,
   depois de tirar as frases de cortesia (config.cortesiaCliente: "qualquer dúvida…"). O texto é lido na hora
   e nunca guardado; volta a frase que pede, para mostrar ao cliente. */
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const textoPlano = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&[a-z#0-9]+;/gi, ' ');
const semAcento = (x) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const acharTrecho = (texto, lista) => (lista || []).find(p => p && new RegExp(`(^|[^a-z0-9])${escRe(semAcento(p).trim())}($|[^a-z0-9])`).test(texto)) || null;
export function pedeAlgo(html, regras) {
  const c = regras?.config || {};
  const plano = textoPlano(html).replace(/[ \t]+/g, ' ').trim();
  // frases (para mostrar a que pede) e o texto sem acento para procurar
  const frases = plano.split(/(?<=[.!?\n])\s+/).map(f => f.trim()).filter(Boolean);
  const semCortesia = (f) => { let t = semAcento(f); for (const x of c.cortesiaCliente || []) t = t.replace(new RegExp(`${escRe(semAcento(x).trim())}[^.!?\\n]*[.!?]?`, 'g'), ' '); return t; };
  for (const f of frases) {
    const t = semCortesia(f);
    if (t.includes('?')) return { pede: true, trecho: '?', frase: f };
    const tr = acharTrecho(t, c.pedidoAoCliente);
    if (tr) return { pede: true, trecho: tr, frase: f };
  }
  return { pede: false, trecho: '', frase: '' };
}
/** Veredito da conversa para o cliente: { ultimoLado, pede, frase, anexoSemArquivo, trecho }. */
export function vereditoConversa(trs, regras) {
  const l = trs || [];
  const ult = l[l.length - 1];
  if (!ult) return null;
  const out = { ultimoLado: ult.lado, pede: false, frase: '', anexoSemArquivo: false, trecho: '' };
  if (ult.lado === 'esc') Object.assign(out, pedeAlgo(ult.texto, regras));
  // o cliente fala em anexo depois da última resposta do escritório e nenhum arquivo chegou
  let k = l.length - 1; while (k > 0 && l[k].lado === 'cli') k--;
  const doCliente = l.slice(l[k]?.lado === 'esc' ? k + 1 : 0).filter(x => x.lado === 'cli');
  if (doCliente.length && !doCliente.some(x => x.anexos.length)) {
    const cita = doCliente.map(x => acharTrecho(semAcento(textoPlano(x.texto)), regras?.config?.anexoCitado)).find(Boolean);
    if (cita) { out.anexoSemArquivo = true; out.trecho = cita; }
  }
  return out;
}

/* ---------- Atenção nas suas solicitações (casos do Control Onvio, na visão do cliente) ----------
   anexo: você falou em anexo e nenhum arquivo chegou; duplicada: duas em aberto do mesmo tipo e funcionário
   (ou assunto, na Geral); abaErrada: pedido na Geral que tem aba própria (config.abaErrada). */
export function abaProvavel(assunto, regras) {
  const alvo = semAcento(assunto);
  if (!alvo.trim()) return null;
  for (const e of regras?.config?.abaErrada || []) {
    if (!regras?.tipos?.[e.tipo] || e.tipo === 'geral') continue;
    const w = (e.palavras || []).find(p => new RegExp(`(^|[^a-z0-9])${escRe(semAcento(p).trim())}([^a-z0-9]|$)`).test(alvo));
    if (w) return { tipo: e.tipo, palavra: w };
  }
  return null;
}
export function casosCliente(itens, regras) {
  const abertos = (itens || []).filter(i => ['aguardando', 'andamento'].includes(i.estado));
  const casos = new Map();
  const add = (i, tipo, extra) => { if (!casos.has(i)) casos.set(i, { item: i, tipo, ...extra }); };
  for (const i of abertos) if (i.veredito?.anexoSemArquivo) add(i, 'anexo', { porque: 'Você falou em anexo, mas nenhum arquivo chegou ao escritório.' });
  const chave = (i) => `${i.empresa}|${i.tipo}|${norm(i.tipo === 'geral' ? i.assunto : i.empregado).trim()}`;
  const grupos = new Map();
  for (const i of abertos) if (norm(i.tipo === 'geral' ? i.assunto : i.empregado).trim()) { const k = chave(i); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(i); }
  for (const g of grupos.values()) if (g.length > 1) {
    g.sort((a, b) => (+a.numero || 0) - (+b.numero || 0));
    for (const i of g.slice(1)) add(i, 'duplicada', { outra: g[0], porque: `Parece repetir a nº ${g[0].numero}, que ainda está em aberto.` });
  }
  for (const i of abertos) if (i.tipo === 'geral') { const a = abaProvavel(i.assunto, regras); if (a) add(i, 'abaErrada', { aba: a.tipo, porque: `Pedido feito na Solicitação Geral, mas tem aba própria: ${regras.tipos[a.tipo].nome}.` }); }
  return [...casos.values()];
}

/* ---------- Prazos legais do lado do cliente ----------
   Pagamento dos cálculos em aberto (férias: 2 dias antes do início, CLT 145; rescisão: 10 dias do desligamento,
   CLT 477 §6º, antecipando para o dia útil anterior) e o eSocial das admissões (empregado: até o dia anterior ao
   início; estagiário: até config.estagiarioPrazoDias depois). Datas vindas do detalhe ou da lista. */
export function prazosLegaisCliente(itens, hoje = today(), regras = {}, cal = makeCalendar(regras?.feriados)) {
  const c = regras?.config || {};
  const out = [];
  for (const i of itens || []) {
    if (!['aguardando', 'andamento'].includes(i.estado)) continue;
    const dt = i.datas || {};
    let alvo = null, titulo = '', ref = '';
    if (i.tipo === 'calculoFerias' && dt.inicioFerias) { alvo = pagamentoFerias(dt.inicioFerias, regras, cal); titulo = 'Pagamento das férias'; ref = `início em ${fmtDate(dt.inicioFerias)}`; }
    else if (i.tipo === 'calculoRescisao' && (dt.desligamento || dt.avisoPrevio)) { const b = dt.desligamento || dt.avisoPrevio; alvo = pagamentoRescisao(b, regras, cal); titulo = 'Pagamento da rescisão'; ref = dt.desligamento ? `desligamento em ${fmtDate(b)}` : `aviso em ${fmtDate(b)}`; }
    else if (/^cadastro(Empregado|Estagiario)$/.test(i.tipo) && dt.admissao) {
      const est = i.tipo === 'cadastroEstagiario';
      alvo = est ? addDays(dt.admissao, c.estagiarioPrazoDias ?? 15) : addDays(dt.admissao, -1);
      titulo = 'Admissão no eSocial'; ref = `início em ${fmtDate(dt.admissao)}${est ? ' (estágio)' : ''}`;
    }
    if (!alvo) continue;
    const falta = diffDays(hoje, alvo);
    if (falta > 15 || falta < -10) continue;
    out.push({ item: i, titulo, alvo, ref, falta, retroativa: !!(i.criado && dt.admissao && dt.admissao < i.criado) });
  }
  return out.sort((a, b) => a.falta - b.falta);
}

/* ---------- O que observar (observações do Control Onvio, na voz do cliente) ----------
   Frases de config.observacoes por tipo, com as datas da solicitação; a linha com alguma chave sem valor não
   aparece. Alertas calculados (prazo já passou ou muito perto) vêm primeiro. */
export function observacoesCliente(item, datas, regras = {}, hoje = today(), cal = makeCalendar(regras?.feriados)) {
  const c = regras?.config || {};
  const d = datas || item?.datas || {};
  const ini = d.inicioFerias, pf = pagamentoFerias(ini, regras, cal);
  const vals = { inicio: fmtDate(ini), pagamentoFerias: fmtDate(pf), aviso: fmtDate(d.aviso || d.avisoPrevio), desligamento: fmtDate(d.desligamento),
    admissao: fmtDate(d.admissao), afastamento: fmtDate(d.afastamento), competencia: d.competencia ? fmtDate(d.competencia).slice(3) : '',
    pagamentoFeriasAntes: c.pagamentoFeriasAntes ?? 2, pagamentoRescisaoDias: c.pagamentoRescisaoDias ?? 10, avisoFeriasDias: c.avisoFeriasDias ?? 30,
    estagiarioPrazoDias: c.estagiarioPrazoDias ?? 15 };
  const out = [];
  if (ini && /Ferias$/.test(item.tipo)) {
    const corridos = diffDays(hoje, ini);
    if (item.tipo === 'avisoFerias' && corridos >= 0 && corridos < vals.avisoFeriasDias) out.push({ alerta: true, texto: `Faltam ${corridos} dias para o início das férias (${vals.inicio}), menos que os ${vals.avisoFeriasDias} dias de antecedência do aviso (CLT, art. 135).` });
    if (pf && pf < hoje) out.push({ alerta: true, texto: `O prazo de pagamento das férias (${vals.pagamentoFerias}) já passou.` });
    else if (pf && diffDays(hoje, pf) <= 3) out.push({ alerta: true, texto: `O pagamento das férias vence em ${vals.pagamentoFerias}.` });
  }
  const preencher = (t) => { let falta = false; const r = String(t).replace(/\{(\w+)\}/g, (_, k) => { const v = vals[k]; if (v == null || v === '') { falta = true; return ''; } return String(v); }); return falta ? null : r; };
  for (const t of c.observacoes?.[item.tipo] || []) { const r = preencher(t); if (r) out.push({ texto: r }); }
  return out;
}

/* "Hoje" do cliente (no formato da tela Hoje do Control Onvio): cada solicitação tem um motivo só,
   para a rosca, as situações e os cartões baterem. */
export const MOTIVOS_CLIENTE = [
  { k: 'prescreve', rot: 'Responda antes de prescrever', cor: 'crit' },
  { k: 'responder', rot: 'Esperando sua resposta', cor: 'serious' },
  { k: 'atrasada', rot: 'Passou da expectativa', cor: 'warn' },
  { k: 'respondida', rot: 'Respondidas, nada pendente', cor: 's3' },
  { k: 'escritorio', rot: 'Com o escritório', cor: 's1' },
  { k: 'concluida', rot: 'Concluídas (30 dias)', cor: 'ok' }
];
export function motivoCliente(i, hoje = today(), regras = {}) {
  const aviso = +regras?.config?.prescricaoAvisoDias || 10;
  // a resposta do escritório não pede nada (lida nos trâmites, 2.4): é só conferir e concluir
  if (i.estado === 'aguardando' && i.veredito && i.veredito.ultimoLado === 'esc' && !i.veredito.pede) return 'respondida';
  if (i.estado === 'aguardando') return i.prescreveEm != null && i.prescreveEm <= aviso ? 'prescreve' : 'responder';
  if (i.estado === 'andamento') return i.expectativa && i.expectativa < hoje ? 'atrasada' : 'escritorio';
  if (i.estado === 'concluida' && i.atualizado && diffDays(i.atualizado, hoje) <= 30) return 'concluida';
  return null;   // encerradas há mais tempo e prescritas não entram no Hoje
}
const ORDEM_MOTIVO = { prescreve: 0, responder: 1, atrasada: 2, respondida: 3, escritorio: 4, concluida: 5 };
/** O que pede atenção primeiro: prescrição mais perto, depois o que espera você há mais tempo. */
export function prioridadesCliente(itens, hoje = today(), regras = {}) {
  return (itens || []).map(item => ({ item, motivo: motivoCliente(item, hoje, regras) })).filter(p => p.motivo)
    .sort((a, b) => ORDEM_MOTIVO[a.motivo] - ORDEM_MOTIVO[b.motivo]
      || (a.item.prescreveEm ?? 99) - (b.item.prescreveEm ?? 99)
      || (b.item.parado || 0) - (a.item.parado || 0));
}
export function acaoCliente(i, motivo) {
  const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
  switch (motivo) {
    case 'prescreve': return i.prescreveEm != null ? `Responder no portal · prescreve em ${dias(i.prescreveEm)}` : 'Responder antes de prescrever';
    case 'responder': return 'Responder no portal · o escritório espera você';
    case 'respondida': return 'Ler a resposta e concluir no portal';
    case 'atrasada': return 'Passou da expectativa de conclusão · acompanhar';
    case 'escritorio': return `Com o escritório${i.parado != null ? ` · última movimentação há ${dias(i.parado)}` : ''}`;
    case 'concluida': return 'Concluída · ver os trâmites';
    default: return '';
  }
}
/** Por que a solicitação está nesse motivo, em palavras (como o "porquê da gravidade" do Control Onvio). */
export function porqueMotivo(i, motivo, regras = {}) {
  const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
  const prazo = +regras?.config?.prescricaoDias || 30;
  switch (motivo) {
    case 'prescreve': return `Esperando sua resposta há ${dias(i.parado ?? 0)}: sem resposta em ${prazo} dias, o portal encerra a solicitação.`;
    case 'responder': return i.veredito?.frase ? `O escritório pediu: “${i.veredito.frase}”` : 'O escritório respondeu e a vez é sua.';
    case 'respondida': return 'O escritório respondeu e não pediu nada. Confira a resposta e conclua no portal.';
    case 'atrasada': return i.expectativa ? `A expectativa de conclusão era ${fmtDate(i.expectativa)}.` : 'Passou da expectativa de conclusão.';
    case 'escritorio': return i.parado != null ? `Com o escritório, última movimentação há ${dias(i.parado)}.` : 'Com o escritório.';
    case 'concluida': return i.atualizado ? `Concluída em ${fmtDate(i.atualizado)}.` : 'Concluída.';
    default: return '';
  }
}
/** Anel do cartão: na sua vez, quanto da prescrição já passou; com o escritório, os dias parada contra o prazo interno. */
export function progressoCliente(i, regras = {}) {
  const d = Math.max(0, i.parado || 0);
  const calc = regras?.tipos?.[i.tipo]?.complexidade === 'calculo';
  const limite = i.estado === 'aguardando' ? (+regras?.config?.prescricaoDias || 30) : (regras?.config?.prazoInternoDiasUteis?.[calc ? 'calculo' : 'simples'] || (calc ? 5 : 3));
  return { pct: Math.min(100, Math.round(d / Math.max(1, limite) * 100)), dias: d, limite };
}

/* Lembretes do cliente (guardados só no computador) com repetição.
   l = { data:'AAAA-MM-DD', rep:'nao'|'diaria'|'util'|'semanal'|'mensal'|'anual', intervalo?, ate?, pular?:[iso] } */
export function ocorrencias(l, de, ate, cal = makeCalendar()) {
  const ini = parseDate(l?.data); if (!ini || !de || !ate) return [];
  const fim = l.ate ? parseDate(l.ate) : null;
  const pular = new Set(l.pular || []);
  const passo = Math.max(1, parseInt(l.intervalo, 10) || 1);
  const out = [];
  const ok = (d) => d >= de && d <= ate && (!fim || d <= fim) && !pular.has(iso(d));
  const rep = l.rep || 'nao';
  if (rep === 'nao') return ok(ini) ? [ini] : [];
  // mensal/anual no dia 31 (ou 29/02): nos meses sem esse dia, vale o último dia do mês
  const noMes = (y, m, dia) => new Date(y, m, Math.min(dia, new Date(y, m + 1, 0).getDate()));
  for (let i = 0, d = ini; d <= ate && i < 5000; i++) {
    if (fim && d > fim) break;
    if (ok(d) && (rep !== 'util' || cal.isBusiness(d))) out.push(d);
    if (rep === 'diaria' || rep === 'util') d = addDays(d, rep === 'util' ? 1 : passo);
    else if (rep === 'semanal') d = addDays(d, 7 * passo);
    else if (rep === 'mensal') d = noMes(ini.getFullYear(), ini.getMonth() + passo * (i + 1), ini.getDate());
    else if (rep === 'anual') d = noMes(ini.getFullYear() + passo * (i + 1), ini.getMonth(), ini.getDate());
    else break;
  }
  return out;
}
/** Texto curto da repetição ("Todo mês, dia 10, até 31/12/2026"). */
export function resumoRepeticao(l) {
  const d = parseDate(l?.data); if (!d) return '';
  const n = Math.max(1, parseInt(l.intervalo, 10) || 1);
  const cada = (um, varios) => n === 1 ? um : `A cada ${n} ${varios}`;
  const base = { nao: `Só em ${fmtDate(d)}`, diaria: cada('Todo dia', 'dias'), util: 'Todo dia útil (seg. a sex.)', semanal: `${cada('Toda semana', 'semanas')}, ${weekday(d)}`, mensal: `${cada('Todo mês', 'meses')}, dia ${d.getDate()}`, anual: `${cada('Todo ano', 'anos')}, em ${fmtDate(d).slice(0, 5)}` }[l.rep || 'nao'] || '';
  return base + (l.rep && l.rep !== 'nao' && l.ate ? `, até ${fmtDate(parseDate(l.ate))}` : '');
}

/* Prazos que valem todo mês (regras.agendaFixa): { dia, mes?, ajuste:'antecipa'|'prorroga' } ou { diaUtil: N } */
export function prazosFixos(regras, ano, mes, cal = makeCalendar(regras?.feriados)) {
  const out = [];
  for (const it of regras?.agendaFixa?.itens || []) {
    const q = it.quando || {};
    if (q.mes && q.mes - 1 !== mes) continue;
    let d = null;
    if (q.diaUtil) {
      d = new Date(ano, mes, 1); let n = cal.isBusiness(d) ? 1 : 0;
      while (n < q.diaUtil) { d = addDays(d, 1); if (cal.isBusiness(d)) n++; }
    } else if (q.dia) {
      d = new Date(ano, mes, Math.min(q.dia, new Date(ano, mes + 1, 0).getDate()));
      if (q.ajuste && !cal.isBusiness(d)) d = cal.addBusinessDays(d, q.ajuste === 'antecipa' ? -1 : 1);
    }
    if (d) out.push({ id: it.id, d, titulo: it.titulo, detalhe: it.detalhe || '' });
  }
  const lim = parseInt(regras?.config?.diaLimiteRubricas, 10);
  if (lim) { let d = new Date(ano, mes, Math.min(lim, new Date(ano, mes + 1, 0).getDate())); if (!cal.isBusiness(d)) d = cal.addBusinessDays(d, -1); out.push({ id: 'rubricas', d, titulo: 'Enviar as variáveis da folha (rubricas)', detalhe: 'Prazo combinado com o escritório.' }); }
  return out.sort((a, b) => a.d - b.d);
}

/* Variáveis da folha do mês (regras: config.variaveisFolha). Do dia `avisarAPartirDoDia` do mês da competência até o
   `diaLimite` do mês seguinte (num dia útil: se cair num feriado ou fim de semana, antecipa), o Hoje lembra de enviar o
   Lançamento de Rubricas. A competência é a do mês anterior até o dia limite; depois, a do mês atual. Some quando o portal
   já tem um lançamento dessa competência (effectiveDate; sem a competência na lista, vale um lançamento criado desde o início
   do aviso — a calibrar) ou quando o cliente disse "Nada a lançar este mês" (dispensadas: competências 'MM/AAAA'). */
export function variaveisDoMes(hoje = today(), regras = {}, itens = [], dispensadas = [], cal = makeCalendar(regras?.feriados)) {
  const cfg = regras?.config?.variaveisFolha; if (!cfg || cfg.ativo === false) return null;
  const lim = +cfg.diaLimite || +regras?.config?.diaLimiteRubricas || 3, desde = +cfg.avisarAPartirDoDia || 20;
  const y = hoje.getFullYear(), m = hoje.getMonth(), d = hoje.getDate();
  let base;   // primeiro dia do mês da competência
  if (d <= lim) base = new Date(y, m - 1, 1); else if (d >= desde) base = new Date(y, m, 1); else return null;
  const competencia = mesAno(base);
  if ((dispensadas || []).includes(competencia)) return null;
  const inicio = new Date(base.getFullYear(), base.getMonth(), Math.min(desde, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()));
  let limite = new Date(base.getFullYear(), base.getMonth() + 1, Math.min(lim, new Date(base.getFullYear(), base.getMonth() + 2, 0).getDate()));
  if (!cal.isBusiness(limite)) limite = diaUtilAntes(limite, cal);
  const enviado = (itens || []).some(i => i.tipo === 'rubricas' && !['cancelada', 'prescrita'].includes(i.estado)
    && (i.competencia ? i.competencia === competencia : (cfg.semCompetenciaPelaData !== false && i.criado && i.criado >= inicio)));
  if (enviado) return null;
  return { competencia, limite, inicio, falta: diffDays(hoje, limite), tipoLancamento: cfg.tipoLancamento || 'MENSAL' };
}

/* Situação de um funcionário a partir do que o portal informa (nome, admissão, ativo).
   Férias são estimativa: o portal não informa férias já gozadas. */
export function situacaoEmpregado(e, hoje = today(), regras = {}) {
  const adm = parseDate(e?.admissao);
  const out = { nome: e?.nome || '', ativo: e?.ativo !== false, admissao: adm, tempoCasa: '', experiencia: [], ferias: null, proxima: null };
  if (!adm) return out;
  let meses = (hoje.getFullYear() - adm.getFullYear()) * 12 + hoje.getMonth() - adm.getMonth();
  if (hoje.getDate() < adm.getDate()) meses--;
  meses = Math.max(0, meses);
  const anos = Math.floor(meses / 12), m = meses % 12;
  out.tempoCasa = anos ? `${anos} ano${anos > 1 ? 's' : ''}${m ? ` e ${m} ${m > 1 ? 'meses' : 'mês'}` : ''}` : meses ? `${meses} ${meses > 1 ? 'meses' : 'mês'}` : `${diffDays(adm, hoje)} dia(s)`;
  if (!out.ativo) return out;
  const marcos = (regras?.config?.experienciaDias || [45, 90]).map(Number).filter(Boolean);
  for (const n of marcos) { const fim = addDays(adm, n - 1); out.experiencia.push({ n, fim, falta: diffDays(hoje, fim) }); }
  // período aquisitivo atual e prazo para conceder as férias do período vencido (CLT 134 e 137)
  if (anos >= 1) {
    const ini = new Date(adm.getFullYear() + anos - 1, adm.getMonth(), adm.getDate());
    const fimAq = addDays(new Date(adm.getFullYear() + anos, adm.getMonth(), adm.getDate()), -1);
    const limite = addDays(new Date(adm.getFullYear() + anos + 1, adm.getMonth(), adm.getDate()), -1);
    out.ferias = { aquisitivo: `${fmtDate(ini)} a ${fmtDate(fimAq)}`, limite, falta: diffDays(hoje, limite) };
  }
  const exp = out.experiencia.find(x => x.falta >= -2);
  if (exp && exp.falta <= 30) out.proxima = { d: exp.fim, titulo: `Fim da experiência (${exp.n} dias)`, nivel: exp.falta <= 5 ? 'late' : 'soon', falta: exp.falta };
  else if (out.ferias && out.ferias.falta <= 90) out.proxima = { d: out.ferias.limite, titulo: 'Conceder férias até (estimativa)', nivel: out.ferias.falta <= 30 ? 'late' : 'soon', falta: out.ferias.falta };
  return out;
}

/** Documentos que o escritório publica (área Documentos do Onvio): resposta crua da API → itens do painel.
 *  A forma real da resposta ainda está sendo calibrada: os nomes dos campos vêm de config.documentosPortal (vale o primeiro
 *  que existir) e a competência também é procurada em customFields. Só os NOMES dos campos vão para o diagnóstico. */
export function documentosDoPortal(json, rules) {
  const cfg = rules?.config?.documentosPortal || {};
  const caminho = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const primeiro = (o, lista) => { for (const p of lista || []) { const v = caminho(o, p); if (v != null && v !== '' && typeof v !== 'object') return v; } return undefined; };
  let lista = Array.isArray(json) ? json : null;
  if (!lista && json && typeof json === 'object') {
    for (const k of cfg.listaEm || []) if (Array.isArray(json[k])) { lista = json[k]; break; }
    if (!lista) lista = Object.values(json).find(Array.isArray) || null;
  }
  if (!lista) return { itens: [], total: null, campos: [], reconhecido: false };
  const total = (() => { const v = json && !Array.isArray(json) ? primeiro(json, cfg.total || ['totalItems', 'total']) : undefined; return Number.isFinite(+v) ? +v : null; })();
  const dataBr = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const competenciaDe = (v) => {
    const t = String(v ?? '').trim(); let m;
    if ((m = /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(t))) return `${m[2]}/${m[1]}`;
    if ((m = /^(\d{2})[/-](\d{4})$/.exec(t))) return `${m[1]}/${m[2]}`;
    if ((m = /^(\d{4})(\d{2})$/.exec(t))) return `${m[2]}/${m[1]}`;
    return '';
  };
  const reComp = new RegExp(`^(${(cfg.competencia || ['competence']).map(x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`, 'i');
  const doCustom = (raw) => {
    const cf = raw?.customFields ?? raw?.CustomFields;
    if (Array.isArray(cf)) { const c = cf.find(x => reComp.test(String(x?.Name ?? x?.name ?? ''))); return c ? competenciaDe(c.Value ?? c.value) : ''; }
    if (cf && typeof cf === 'object') { const k = Object.keys(cf).find(x => reComp.test(x)); return k ? competenciaDe(cf[k]) : ''; }
    return '';
  };
  const itens = [];
  for (const raw of lista) {
    if (!raw || typeof raw !== 'object' || raw.isFolder === true) continue;
    const id = primeiro(raw, cfg.campos?.id), nome = primeiro(raw, cfg.campos?.nome);
    if (id == null || !nome) continue;
    const c = primeiro(raw, cfg.campos?.criado); const d = c ? new Date(c) : null;
    const diretaComp = primeiro(raw, cfg.competencia);
    itens.push({
      id: String(id), nome: String(nome), arquivo: String(nome), categoria: String(primeiro(raw, cfg.campos?.pasta) || ''),
      competencia: doCustom(raw) || competenciaDe(diretaComp), data: d && !isNaN(d) ? dataBr(d) : '', criado: d && !isNaN(d) ? d.getTime() : 0
    });
  }
  const campos = Object.keys(lista.find(x => x && typeof x === 'object') || {}).slice(0, 40);
  return { itens, total, campos, reconhecido: itens.length > 0 || lista.length === 0 };
}
