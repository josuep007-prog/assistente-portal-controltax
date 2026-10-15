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
      if (!best || s > best.bruto) { best = { option: e, score: s * 0.95, bruto: s }; empates.clear(); }
      else if (s === best.bruto && best.option !== e) empates.add(e);
    }
  }
  // empate (mesmo nome parcial para duas pessoas): quem decide é o cliente, não a ordem da lista
  if (best && empates.size) return { option: null, score: 0, candidatos: [best.option, ...empates] };
  if (best) return best;
  if (!soPrimeiroNome) return null;
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
      const bruto = (hits / Math.max(3, (d.palavras || []).length * 0.6)) + strong * 0.5;
      // palavras que derrubam a nota (ex.: "TRCT" num aviso de rescisão)
      const contra = (d.negativas || []).filter(x => T.includes(norm(x))).length;
      out.push({ id: d.id, nome: d.nome, tipoSolicitacao: d.tipoSolicitacao, score: Math.min(1, Math.max(0, bruto - contra * 0.5)), bruto: bruto - contra * 0.5, found });
    }
  }
  return out.sort((a, b) => b.bruto - a.bruto);
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
  // leitor próprio do documento (atestado): lê dias, data, CID, médico e paciente com mais cuidado
  const usaLeitor = docRule ? (docRule.leitor || (docRule.id === 'atestado' ? 'atestado' : null)) === 'atestado' : tipoKey === 'afastamento';
  const leitor = usaLeitor ? lerAtestado(text, ctx.hoje || today()) : null;
  if (leitor) {
    const cite = (x) => x?.trecho ? `“${x.trecho}”` : (docRule?.nome || 'documento');
    if (leitor.dias) put('dias', String(leitor.dias.n), leitor.dias.conf, cite(leitor.dias));
    if (leitor.data) put('dataAfastamento', leitor.data.data, leitor.data.conf, cite(leitor.data));
    if (leitor.cid) put('cid', leitor.cid, 0.7, docRule?.nome || 'documento');
    if (leitor.medico) put('medico', leitor.medico, 0.7, docRule?.nome || 'documento');
  } else if (docRule?.extrair) for (const [k, pats] of Object.entries(docRule.extrair)) { const v = runPatterns(text, pats); if (v) put(k, v, 0.7, docRule.nome); }
  if (docRule?.valores) for (const [k, v] of Object.entries(docRule.valores)) if (!k.startsWith('tipoAfastamentoSe') && !(k === 'tipoAfastamento' && tipo?.tipoAfastamentoAuto)) put(k, v, 0.65, docRule.nome);
  if (docRule?.tipoCatPalavras) {
    // a CAT imprime todas as opções ("( ) Típico ( ) Trajeto"): só vale a marcada
    const T = norm(text);
    const candidatos = Object.entries(docRule.tipoCatPalavras).filter(([, words]) => words.some(w => T.includes(norm(w))));
    if (candidatos.length === 1) put('tipoCat', candidatos[0][0], 0.6, docRule.nome);
    else if (candidatos.length > 1) {
      const marcada = opcaoMarcada(text, candidatos.flatMap(([, words]) => words));
      const dono = marcada && candidatos.find(([, words]) => words.some(w => norm(w) === norm(marcada)));
      if (dono) put('tipoCat', dono[0], 0.6, docRule.nome);
    }
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
  let candidatos = null; const avisosExtra = [];
  if (tipo?.campos?.empregado && ctx.employees?.length) {
    const pm = leitor?.paciente ? empregadoPorNome(leitor.paciente.nome, ctx.employees) : null;
    if (pm?.option) put('empregado', pm.option, Math.min(pm.score, leitor.paciente.conf + 0.15), `“${leitor.paciente.trecho}”`);
    else if (pm?.candidatos) candidatos = pm.candidatos;
    else {
      const m = findEmployeeInText(leitor ? semOutrasPessoas(text) : text, ctx.employees, { soPrimeiroNome: !leitor && !doc });
      const outroNome = leitor?.paciente && leitor.paciente.nome.split(' ').length >= 2;
      if (m?.candidatos) candidatos = m.candidatos;       // empate: o cliente escolhe
      else if (m && outroNome) {
        put('empregado', m.option, Math.min(m.score, 0.45), `sobrenome igual ao de “${leitor.paciente.nome}”`);
        avisosExtra.push({ nivel: 'atencao', id: 'outroNome', mensagem: `O atestado está em nome de ${leitor.paciente.nome}, que não é exatamente ${m.option}. Confira se é do funcionário (pode ser de um dependente).` });
      } else if (m) put('empregado', m.option, m.score, 'nome encontrado no documento');
    }
  }
  if (tipo?.campos?.nome && !campos.nome) {
    const m = String(text).match(/(?:nome|paciente|portador|titular)\s*[:\-]?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s]{8,60})(?:\n|\s{2,}|$)/);
    if (m) put('nome', m[1].trim(), 0.5, 'nome em maiúsculas');
  }
  const avisos = [...avisosDoDocumento(text, docRule || (leitor ? (rules.documentos || []).find(d => d.id === 'atestado') : null), campos), ...avisosExtra];
  return { documento: doc, alternativas: docs.slice(1, 4), tipoSugerido: tipoKey, campos, avisos, paciente: leitor?.paciente?.nome || null, candidatos };
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

/* ---------------- Regras de prazo compartilhadas ---------------- */
/** Súmula 380 do TST (art. 132 do Código Civil): não conta o dia do aviso, conta o último. */
export const fimDoAviso = (dataAviso, dias = 30) => addDays(dataAviso, dias);
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
    out.pagamentoAte = fmtDate(addDays(ini, -2));
    out.avisoAte = fmtDate(addDays(ini, -30));
  }
  const afa = parseDate(values.dataAfastamento), diasAfa = +values.dias || 0;
  if (diasAfa) out.diasTexto = diasAfa === 1 ? '1 dia' : `${diasAfa} dias`;
  if (afa && diasAfa) { out.dataRetorno = fmtDate(addDays(afa, diasAfa)); if (diasAfa > 15 && vaiAoInss(values.tipoAfastamento, rules)) out.inicioInss = fmtDate(addDays(afa, 15)); }
  const dem = parseDate(values.dataDemissao);
  if (dem) out.pagamentoAte = fmtDate(addDays(dem, 10));
  const anos = +values.anosEmpresa;
  // proporcional (Lei 12.506/2011) é direito do empregado: só quando a empresa demite
  if (!isNaN(anos) && values.anosEmpresa !== '' && values.anosEmpresa != null && temAviso(values, rules)) {
    out.diasAviso = avisoPeloEmpregador(values) ? String(Math.min(90, 30 + 3 * Math.max(0, Math.floor(anos)))) : '30';
  }
  if (dem || parseDate(values.dataAviso)) {
    const base = parseDate(values.dataAviso) || dem;
    const d = +out.diasAviso || 30;
    if (base && temAviso(values, rules)) out.fimAviso = fmtDate(fimDoAviso(base, d));
  }
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
  // linhas que são só uma opção de formulário ("( ) doença", "U acidente do trabalho") não dizem nada
  const T = plain(String(text || '').split(/\n/).filter(l => !(l.trim().length < 34 && /^\W{0,4}[a-zà-úA-ZÀ-Ú]?\W{0,4}\s*(doen[cç]a|acidente d[eo] trabalho|acidente de trajeto|outros?)\s*\W*$/i.test(l.trim()))).join('\n'));
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
    const has = (anexos || []).some(f => f.documento === a.documento && !f.pendente);
    const soNoAssistente = !has && (anexos || []).find(f => f.documento === a.documento && f.pendente);
    const temAlgum = (anexos || []).some(f => !f.pendente);
    if (has) add('ok', 'Anexos', `${a.rotulo} anexado`);
    else if (soNoAssistente) add('erro', 'Anexos', (rules?.mensagens?.anexoSoNoAssistente || 'O arquivo “{arquivo}” ainda não foi anexado no portal. Clique em “Preencher no portal” ou anexe-o direto na solicitação.').replace('{arquivo}', soNoAssistente.nome));
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
    let d = dataValida(y, mi, +m[1]);
    if (d && !m[3] && d < addDays(hoje, -60)) d = dataValida(y + 1, mi, +m[1]);
    push(m.index, d);
  }
  for (const m of t.matchAll(/\b(hoje|amanha|ontem|depois de amanha)\b/g)) push(m.index, addDays(hoje, { hoje: 0, amanha: 1, ontem: -1, 'depois de amanha': 2 }[m[1]]));
  for (const m of t.matchAll(/\b(?:na |nesta |proxima |próxima )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/g)) {
    const alvo = DIAS_SEMANA.indexOf(m[1]); let d = addDays(hoje, 1); while (d.getDay() !== alvo) d = addDays(d, 1); push(m.index, d);
  }
  for (const m of t.matchAll(/\bdia (\d{1,2})\b(?!\s*(?:[\/.-]|de\s+[a-z]))/g)) {
    // "dia 31" num mês de 30 dias não vira 01 do mês seguinte: sem data, o cliente confirma
    let d = dataValida(hoje.getFullYear(), hoje.getMonth(), +m[1]);
    if (d && d < hoje) {
      const prox = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);   // dezembro → janeiro do ano seguinte
      d = dataValida(prox.getFullYear(), prox.getMonth(), +m[1]);
    }
    push(m.index, d);
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
  let candidatosNome = null;
  if (ctx.employees?.length) { const m = findEmployeeInText(text, ctx.employees); if (m?.option) put('empregado', m.option, m.score); else if (m?.candidatos) candidatosNome = m.candidatos; }
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
  // o texto do cliente serve só para entender o pedido: não vai literalmente para a descrição
  return { tipoSugerido: tipo, campos, datas: datas.map(fmtDate), ...(candidatosNome ? { candidatos: candidatosNome } : {}) };
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
  const orig = String(text || '').normalize('NFC'); const p = plain(orig);
  const ds = [];
  const add = (i, len, d, y2) => { if (d && !isNaN(d)) ds.push({ i, len, d, y2 }); };
  const mk = (dd, mm, yy) => { let y = +yy; if (y < 100) y += 2000; const d = new Date(y, mm - 1, dd); return d.getMonth() === mm - 1 && d.getDate() === +dd ? d : null; };
  for (const m of p.matchAll(/(?<![\d/])(\d{1,2})\s?[\/.\-]\s?(\d{1,2})\s?[\/.\-]\s?(\d{4}|\d{2})(?![\d/])/g)) add(m.index, m[0].length, mk(+m[1], +m[2], m[3]), m[3].length === 2);
  for (const m of p.matchAll(/\b(\d{1,2})(?:o|º)?\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/g)) add(m.index, m[0].length, mk(+m[1], MES_NUM[m[2]], m[3]));
  for (const m of p.matchAll(/\b(\d{1,2})\s+de\s+(\d{1,2})\s+de\s+(\d{2}|\d{4})\b/g)) add(m.index, m[0].length, mk(+m[1], +m[2], m[3]), m[3].length === 2);
  const min = addDays(hoje, -400), max = addDays(hoje, 90);
  let best = null;
  for (const x of ds) {
    if (x.d < min || x.d > max) continue;
    const antes = p.slice(Math.max(0, x.i - 40), x.i);
    let sc = 0;
    if (/(nasc|nascimento|decreto|portaria|resolucao|\blei\b|validade|vencimento)[^\n]{0,25}$/.test(antes)) sc -= 10;
    if (/a\s?parti[r]?\s+d[eo]a?\s*[\[(]?\s*$/.test(antes) || /a\s?parti[r]?\s+(?:desta|da presente)\s+data\s*[:,]?\s*$/.test(antes)) sc += 6;
    else if (/(no dia|na data de|na data|data de emissao|emissao|entrada|atendid[oa]|data e hora|data\s*:|data\/hora)[^\n]{0,14}$/.test(antes)) sc += 3;
    else if (/,\s*$/.test(antes) || /\b[a-z]{2}\s*[-,]\s*$/.test(antes)) sc += 2;   // "Serra-ES, 17 de setembro de 2026"
    if (/impressao[^\n]{0,14}$/.test(antes)) sc -= 1;
    if (x.d > hoje) sc -= 1;
    if (!best || sc > best.sc) best = { ...x, sc };
  }
  if (!best || best.sc < -5) return null;
  return { data: fmtDate(best.d), conf: best.sc >= 6 ? 0.85 : best.sc >= 2 ? 0.75 : 0.6, trecho: trechoDe(orig, best.i - 28, best.i + best.len) };
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
export function empregadoPorNome(nome, employees) {
  const toks = (s) => norm(s).split(' ').filter(t => t.length > 1 && !CONECTORES.has(t));
  const P = toks(nome); if (!P.length) return null;
  const parecido = (a, b) => a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b)) || (Math.min(a.length, b.length) >= 5 && lev(a, b) <= 1);
  const res = [];
  for (const e of employees || []) {
    const T = toks(e); if (!T.length) continue;
    if (!parecido(P[0], T[0])) continue;
    const hit = P.filter(p => T.some(t => parecido(p, t))).length;
    const score = hit / Math.max(P.length, Math.min(T.length, 3));
    if (P.length === 1 || score >= 0.5) res.push({ option: e, score: Math.min(0.97, 0.55 + score * 0.42) });
  }
  res.sort((a, b) => b.score - a.score);
  if (!res.length) return null;
  if (res.length > 1 && res[1].score >= res[0].score - 0.02) return { option: null, candidatos: res.filter(r => r.score >= res[0].score - 0.02).map(r => r.option) };
  return res[0];
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
/** Qual opção está marcada num formulário impresso ("( ) Apto (X) Inapto", "[x]", "☒").
 *  ASO e CAT trazem todas as opções escritas: procurar a palavra solta elegia a errada.
 *  Devolve null quando nenhuma ou mais de uma está marcada — aí o cliente confere. */
export function opcaoMarcada(text, opcoes) {
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
  if (marcadas.size > 1) return null;
  // sem marca nenhuma: só vale quando o documento traz uma única opção (texto corrido)
  const presentes = [...new Set(ondes.map(x => x.o))];
  return presentes.length === 1 ? presentes[0] : null;
}
const ASO_TIPOS = ['admissional', 'demissional', 'periodico', 'retorno ao trabalho', 'mudanca de funcao'];
export function readASO(text) {
  const t = plain(text);
  const resultado = opcaoMarcada(t, ['inapto', 'apto']);
  const tipo = opcaoMarcada(t, ASO_TIPOS);
  const datas = findDates(text); const data = datas.length ? fmtDate(datas[datas.length - 1]) : null;
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
    assunto: texto1(it?.subject, it?.title, typeof it?.description === 'string' && it.description.length < 140 ? it.description : null),
    atualizado, parado,
    criado: parseDate(texto1(it?.created, it?.createdAt)),
    expectativa: parseDate(texto1(it?.dueDate)),
    competencia: texto1(it?.effectiveDate) ? fmtDate(parseDate(it.effectiveDate))?.slice(3) : '',
    prescreveEm: estado === 'aguardando' && prescreve && parado != null ? Math.max(0, dias - parado) : null,
    tramite: texto1(it?.lastProceeding?.description, it?.lastProceeding, it?.lastComment)
  };
}

/* "Hoje" do cliente (no formato da tela Hoje do Control Onvio): cada solicitação tem um motivo só,
   para a rosca, as situações e os cartões baterem. */
export const MOTIVOS_CLIENTE = [
  { k: 'prescreve', rot: 'Responda antes de prescrever', cor: 'crit' },
  { k: 'responder', rot: 'Esperando sua resposta', cor: 'serious' },
  { k: 'atrasada', rot: 'Passou da expectativa', cor: 'warn' },
  { k: 'escritorio', rot: 'Com o escritório', cor: 's1' },
  { k: 'concluida', rot: 'Concluídas (30 dias)', cor: 'ok' }
];
export function motivoCliente(i, hoje = today(), regras = {}) {
  const aviso = +regras?.config?.prescricaoAvisoDias || 10;
  if (i.estado === 'aguardando') return i.prescreveEm != null && i.prescreveEm <= aviso ? 'prescreve' : 'responder';
  if (i.estado === 'andamento') return i.expectativa && i.expectativa < hoje ? 'atrasada' : 'escritorio';
  if (i.estado === 'concluida' && i.atualizado && diffDays(i.atualizado, hoje) <= 30) return 'concluida';
  return null;   // encerradas há mais tempo e prescritas não entram no Hoje
}
const ORDEM_MOTIVO = { prescreve: 0, responder: 1, atrasada: 2, escritorio: 3, concluida: 4 };
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
    case 'atrasada': return 'Passou da expectativa de conclusão · acompanhar';
    case 'escritorio': return `Com o escritório${i.parado != null ? ` · última movimentação há ${dias(i.parado)}` : ''}`;
    case 'concluida': return 'Concluída · ver os trâmites';
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
