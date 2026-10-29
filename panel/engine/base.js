// Motor de regras — Texto, datas e validadores (CPF, PIS, CEP…).
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
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
export const WD = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
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
