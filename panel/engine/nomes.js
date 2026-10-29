// Motor de regras — Similaridade de nomes e escolha de funcionário.
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { norm } from './base.js';

/* ---------------- Similaridade de nomes ---------------- */
export function lev(a, b) {
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
