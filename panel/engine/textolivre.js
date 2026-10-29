// Motor de regras — Texto livre: quantidades, datas, cartões de escolha, palpites, leitura do pedido, cadastro por texto, vários pedidos.
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { CONECTORES } from './atestado.js';
import { addDays, dataValida, diffDays, fmtCPF, fmtDate, iso, norm, today } from './base.js';
import { analyzeText, extractByLabels, extractGeneric } from './leitor.js';
import { inferTipoAfastamento } from './modelos.js';
import { findEmployeeInText, lev } from './nomes.js';
import { assuntoGeral, competenciaDoTexto, linhasRubricas, textoLinhasRubricas } from './planilhas.js';
import { temAviso } from './prazos.js';
import { resolveTipo } from './tipos.js';
import { suggestTipoByText } from './verificacoes.js';

/* ================= Texto livre ("descreva com suas palavras") ================= */
export const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const DIAS_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
export const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const escR = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* As palavras do texto livre ficam em config.textoLivre (regras); aqui só o mínimo para regras antigas. */
export const TL_PADRAO = {
  sentidoDatas: 'futuro', naoEhDiaDaSemana: ['via', 'parcela', 'vez', 'opcao', 'quinzena'], passado: ['passada', 'passado', 'ultima', 'ultimo'],
  proximo: ['que vem', 'proxima', 'proximo', 'seguinte'], prazo: ['preciso ate', 'prazo', 'urgente ate'],
  correcao: ['na verdade', 'alias', 'ou melhor', 'errei'], descartaAntes: ['daqui a', 'daqui', 'ha', 'faz'], descartaDepois: ['atras', 'antes', 'de antecedencia', 'uteis'],
  abono: { verbos: ['vender', 'vende', 'abono de'], sim: ['com abono'], nao: ['sem abono'] }, gozoVerbos: ['tirar', 'gozar', 'por'], abonoPadraoDias: 10,
  decimoTerceiro: { palavras: ['13º', '13o', 'decimo terceiro', '13 salario'], nao: ['sem adiantar', 'nao adiantar'] },
  pergunta: ['como', 'posso', 'qual', 'quando'], palavrasVazias: [], apelidos: {},
  competencia: { passado: ['mes passado'], atual: ['este mes', 'mes atual'], proximo: ['mes que vem'] }, adiantamento: ['adiantamento', 'vale salarial'],
  tipoAviso: { 'AUSÊNCIA/DISPENSA': ['aviso dispensado', 'dispensa do aviso', 'dispensa do cumprimento', 'ausencia'], INDENIZADO: ['indenizad*'], TRABALHADO: ['trabalhad*'] }
};
export const tl = (rules) => ({ ...TL_PADRAO, ...(rules?.config?.textoLivre || {}) });

/** Expressão regular de uma lista de palavras (sem acento); "radical*" casa o começo da palavra. */
export function rxTermos(lista) {
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
export const UNID = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 };
export const DEZ = { dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 };
export const DEZENAS = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
export const porTamanho = (o) => Object.keys(o).sort((a, b) => b.length - a.length);
export const RX_NUM = `(?:\\d{1,3}|(?:${porTamanho(DEZENAS).join('|')})(?:\\s+e\\s+(?:${porTamanho(UNID).join('|')}))?|${[...porTamanho(DEZ), ...porTamanho(UNID), 'cem'].join('|')})(?![a-z])`;
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
export const ESCOLHAS_PADRAO = [
  { id: 'ferias', titulo: 'Aviso ou cálculo?', tipos: ['avisoFerias', 'calculoFerias'], ajuda: { avisoFerias: 'Comunicar as datas para o escritório emitir o aviso de férias (com 30 dias de antecedência).', calculoFerias: 'Pedir o cálculo e o recibo das férias para o pagamento (até 2 dias antes do início).' }, destaque: { avisoFerias: { aviso: 2 }, calculoFerias: { 'calcul*': 2, recibo: 2, pagar: 1, pagamento: 1 } } },
  { id: 'rescisao', titulo: 'Aviso ou cálculo?', tipos: ['avisoRescisao', 'calculoRescisao'], ajuda: { avisoRescisao: 'Comunicar a demissão ou o pedido de demissão e emitir o aviso prévio.', calculoRescisao: 'Pedir o cálculo das verbas rescisórias (TRCT) para o pagamento em até 10 dias.' }, destaque: { avisoRescisao: { aviso: 2 }, calculoRescisao: { 'calcul*': 2, verbas: 2, trct: 2, recibo: 1, pagar: 1, pagamento: 1 } }, naoContam: ['aviso indenizado', 'aviso trabalhado', 'aviso previo indenizado', 'aviso previo trabalhado'] }
];
export function escolhasTexto(rules) {
  const l = rules?.config?.textoLivre?.escolhas;
  return Array.isArray(l) && l.length ? l : ESCOLHAS_PADRAO;
}
export const semTrechos = (t, lista) => { let s = ' ' + plain(t) + ' '; for (const x of lista || []) { const r = rxTermos([x]); if (r) s = s.replace(new RegExp(`(^|[^a-z0-9])${r}(?=$|[^a-z0-9])`, 'g'), '$1 '); } return s; };
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
export function vocabulario(rules) {
  const c = tl(rules); const v = new Set([...(c.palavrasVazias || []), ...(c.naoSaoNomes || []), ...MESES, ...DIAS_SEMANA, ...Object.keys(UNID), ...Object.keys(DEZ), ...Object.keys(DEZENAS)].map(plain));
  const juntar = (l) => (l || []).forEach(p => plain(p).split(/[^a-z0-9]+/).forEach(x => x && v.add(x)));
  for (const it of rules?.intencoes || []) { juntar(it.palavras); juntar(it.radicais); }
  for (const e of rules?.config?.abaErrada || []) juntar(e.palavras);
  return v;
}
/** Palavra do texto original que corresponde ao trecho sem acento (para mostrar "Ronado" e não "ronado"). */
export function palavraOriginal(text, p) {
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
/* ---------- Pergunta e dúvidas ---------- */
/** O texto é uma pergunta? (termina em "?" ou começa com como, posso, qual… — config.textoLivre.pergunta) */
export function ehPergunta(text, rules) {
  const s = String(text || '').trim(); if (!s) return false;
  if (/\?\s*$/.test(s)) return true;
  const r = rxTermos(tl(rules).pergunta);
  return !!r && new RegExp(`^[^a-z0-9]*${r}(?![a-z0-9])`).test(plain(s));
}
export const radical = (w) => w.length > 4 ? w.slice(0, Math.max(4, w.length - 2)) : w;
export const casaRadical = (w, tk) => w === tk || (tk.length >= 4 && w.length >= 4 && (radical(w) === radical(tk) || w.startsWith(radical(tk)) || tk.startsWith(radical(w))));
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
export function dividirCorrecao(text, rules) {
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
export const CAD_PADRAO = {
  fichaMinRotulos: 3, admissaoAteDiasAtras: 365,
  datas: [{ campo: 'nascimento', palavras: ['nascid*', 'nasceu', 'nascimento'] }, { campo: 'dataAdmissao', palavras: ['comec*', 'entra', 'inicio', 'admissao', 'a partir de'] }],
  salario: ['salario', 'bolsa', 'pro-labore'], experiencia: ['experiencia'], prorrogacao: ['prorrogacao'], cargo: ['cargo'], funcao: ['funcao'],
  fimDoValor: ['com', 'e', 'cpf', 'dia', 'salario', 'no', 'na', 'em'], admitir: ['admitir', 'contratar']
};
export const CADASTROS = ['cadastroEmpregado', 'cadastroEstagiario', 'cadastroContribuinte'];
export const cadCfg = (rules) => ({ ...CAD_PADRAO, ...(tl(rules).cadastro || {}) });
/** Ficha colada ("Nome: … CPF: … Nome da mãe: …"): quantos rótulos do cadastro aparecem (0 abaixo do mínimo das regras). */
export function fichaColada(text, rules, tipoKey = 'cadastroEmpregado') {
  const def = resolveTipo(rules, tipoKey); if (!def || !/[:\-–]/.test(String(text || ''))) return 0;
  const n = Object.keys(extractByLabels(text, def.campos)).length;
  return n >= (cadCfg(rules).fichaMinRotulos || 3) ? n : 0;
}
export const ARTIGOS_NOME = /^(?:a|o|as|os|um|uma|da|do|de|nova|novo|funcionari[oa]|empregad[oa]|estagiari[oa]|colaborador[a]?|senhor[a]?|sr[a]?|chamad[oa])$/;
export const tituloSeMinusculo = (s) => s === s.toLowerCase() ? s.replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\s(D[aeo]s?|E)(?=\s)/g, (m) => m.toLowerCase()) : s;
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
