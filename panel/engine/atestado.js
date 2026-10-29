// Motor de regras — Leitor de atestados.
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { addDays, fmtDate, norm, today } from './base.js';
import { lev } from './nomes.js';
import { plain } from './textolivre.js';

/* ================= Leituras específicas ================= */
/* ---------- Atestado ---------- */
export const NUM_PALAVRA = { um: 1, hum: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, sessenta: 60, noventa: 90, cento: 100 };
export const PARA_DIAS = /\b(?:por|de|durante|periodo|repouso|necessita\w*|necessitando|afastad[oa]s?|afastamento|ficar|permanecer|total|minimo|apenas|somente)\b/;
/** Número escrito por extenso ou com erro de OCR comum ("OL", "0l", "( 03 )"). */
export function lerNumeroToken(tok) {
  if (/^\d{1,3}$/.test(tok)) return { n: /^0\d\d$/.test(tok) ? +tok.slice(0, 2) : +tok, digito: true, duvida: /^0\d\d$/.test(tok) };
  if (/^[c(]?[o0][1lij|]$/.test(tok)) return { n: 1, digito: true, duvida: true };
  if (/^[o][0-9]$/.test(tok)) return { n: +tok[1], digito: true, duvida: true };
  if (NUM_PALAVRA[tok.replace(/\*+$/, '')]) return { n: NUM_PALAVRA[tok.replace(/\*+$/, '')], digito: false };
  return null;
}
export function trechoDe(text, i, j) {
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
export const MES_NUM = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
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
export const CONECTORES = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'D']);
export const NAO_NOME = new Set(['PORTADOR', 'PORTADORA', 'INSCRITO', 'INSCRITA', 'CPF', 'RG', 'FOI', 'ESTEVE', 'NECESSITA', 'NECESSITANDO', 'SEXO', 'NASC', 'NASCIMENTO', 'IDADE', 'CONVENIO', 'ACIMA', 'ABAIXO', 'PACIENTE', 'PRONTUARIO', 'ATENDIDO', 'ATENDIDA', 'RECEBEU', 'DATA', 'COMPARECEU', 'SOB', 'PARA', 'POR', 'COM', 'QUE', 'NESTA', 'NA', 'NO', 'ENDERECO', 'MAE', 'PAI', 'CARTEIRA', 'IDENTIDADE', 'SENHOR', 'SENHORA', 'SR', 'SRA', 'DR', 'DRA', 'ESTADO', 'CIVIL']);
export function nomeDepois(texto) {
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
