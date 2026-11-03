// Motor de regras — Variáveis da folha, grade de rubricas, planilha de rubricas e catálogo da Solicitação Geral.
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { empregadoPorNome } from './atestado.js';
import { norm, today } from './base.js';
import { renderTemplate } from './modelos.js';
import { bestMatch, findEmployeeInText, similarity } from './nomes.js';
import { texto1 } from './plataforma.js';
import { MESES, RX_NUM, escR, numeroPorExtenso, plain, temTermo, tl } from './textolivre.js';

/* ---------- Variáveis da folha: competência e uma linha por funcionário ---------- */
export const mesAno = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
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
export const PLAN_IGNORAR = ['matricula', 'matrícula', 'cpf', 'cargo', 'função', 'funcao', 'setor', 'departamento', 'admissão', 'admissao', 'código', 'codigo', 'id', 'obs', 'observação', 'observações', 'total', 'situação', 'situacao', 'centro de custo', 'pis'];
export const PLAN_TIPOS = { ADIANTAMENTO: ['adiantamento', 'quinzena'], PLR: ['plr', 'participação nos lucros', 'participacao nos lucros'], MENSAL: ['mensal', 'folha mensal', 'folha do mês'] };
export const celulaVazia = (v) => { const s = String(v ?? '').trim(); return !s || /^[-–—]$/.test(s) || /^(?:r\$\s*)?0+(?:[.,]0+)?$/i.test(s) || /^0{1,2}:00$/.test(s); };
export const casaColuna = (h, nomes) => !!h && (nomes || []).some(n => { const N = norm(n); return N && (h === N || (' ' + h + ' ').includes(' ' + N + ' ') || h.startsWith(N + ' ')); });
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
export const semCodigo = (s) => String(s || '').replace(/^\s*\d+\s*[-–.:]\s*/, '');
export const nomeEvento = (s) => norm(semCodigo(s).replace(/\([^)]*\)/g, ' '));
/** Grupos de nomes de um mesmo evento: tipos.rubricas.apelidosEventos e o dicionário do texto livre. */
export function gruposDeEventos(rules) {
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
    const emp = (empregados || []).find(e => norm(e) === norm(l.empregado)) || bestMatch(l.empregado, empregados, 0.85)?.option || null;   // o nome igual vale antes do parecido
    if (!ev) { if (!semEvento.includes(l.rubrica)) semEvento.push(l.rubrica); continue; }
    if (!emp) { if (!semEmpregado.includes(l.empregado || '?')) semEmpregado.push(l.empregado || '?'); continue; }
    // só o número: "R$ 350,00" → 350,00; "10 horas" → 10 (a coluna já diz se é hora, dia ou valor)
    celulas.push({ empregado: emp, evento: ev, valor: String(l.valor).replace(/^R\$\s*/, '').replace(/\s*(horas?|dias?|h)$/i, '').trim(), rubrica: l.rubrica });
  }
  return { celulas, semEvento, semEmpregado };
}
/** Planilha preenchida no Excel (o que "Exportar para Excel" gera: Funcionário + uma coluna por rubrica da grade) → células da grade.
 *  `abas` = [{ nome, linhas }] como lidas por panel/extract.js. A linha de títulos é achada nas 10 primeiras de cada aba: cada título que for uma
 *  rubrica da grade (nome igual, o código "150 -" igual, ou o nome sem o código igual) vira uma coluna; a coluna do funcionário é a que se chama
 *  Nome/Empregado/Funcionário (senão a primeira que não é rubrica). Funcionário pelo nome da grade (igual ou quase); o que não casar volta em
 *  semEmpregado/semEvento, para o cliente lançar. Sem nenhuma rubrica da grade nos títulos → null (aí vale o formato Empregado/Rubrica/Valor). */
export function lerPlanilhaDaGrade(abas, eventos, empregados) {
  const limpa = (x) => plain(x).replace(/[^a-z0-9]+/g, ' ').trim();
  const codigo = (t) => (String(t).match(/^\s*(\d{1,6})\s*(?:-|$)/) || [])[1] || '';
  const evs = (eventos || []).map(e => ({ e, cheio: limpa(e), sem: limpa(semCodigo(e)), cod: codigo(e) }));
  const achaEvento = (t) => {
    const c = limpa(t); if (!c) return null;
    const cod = codigo(t), sem = limpa(semCodigo(t));
    return evs.find(x => x.cheio === c) || (cod && evs.find(x => x.cod === cod)) || (sem && evs.find(x => x.sem === sem)) || null;
  };
  const ehNome = (c) => /^(nome|empregad|funcionari)/.test(limpa(c)) && limpa(c).length < 25;
  let melhor = null;
  for (const aba of abas || []) {
    const linhas = aba.linhas || [];
    for (let h = 0; h < Math.min(10, linhas.length); h++) {
      const cols = {};   // índice da coluna → rubrica da grade
      (linhas[h] || []).forEach((c, k) => { const ev = achaEvento(c); if (ev && !Object.values(cols).includes(ev.e)) cols[k] = ev.e; });
      const n = Object.keys(cols).length;
      if (n && (!melhor || n > melhor.n)) melhor = { aba, h, cols, n };
    }
  }
  if (!melhor) return null;
  const { aba, h, cols } = melhor, linhas = aba.linhas, titulo = linhas[h] || [];
  let ni = titulo.findIndex(ehNome);
  if (ni < 0) ni = titulo.findIndex((c, k) => !(k in cols) && String(c).trim());
  if (ni < 0) ni = 0;
  const celulas = [], semEmpregado = [], colunasComValor = new Set();
  const valorDe = (v) => { let x = String(v ?? '').trim().replace(/^R\$\s*/i, ''); if (/^\d+\.\d{1,2}$/.test(x)) x = x.replace('.', ','); return x; };   // o Excel entrega 350.5; o portal quer 350,5
  for (const linha of linhas.slice(h + 1)) {
    const nome = String(linha[ni] ?? '').trim();
    if (!nome || /^total/i.test(limpa(nome))) continue;
    const valores = Object.entries(cols).map(([k, ev]) => [ev, valorDe(linha[k])]).filter(([, v]) => v !== '');
    Object.keys(linha).forEach(k => { if (!(k in cols) && +k !== ni && String(linha[k] ?? '').trim() !== '' && String(titulo[k] ?? '').trim()) colunasComValor.add(String(titulo[k]).trim()); });
    if (!valores.length) continue;
    const emp = (empregados || []).find(e => norm(e) === norm(nome)) || bestMatch(nome, empregados || [], 0.85)?.option || null;   // o nome igual vale antes do parecido
    if (!emp) { if (!semEmpregado.includes(nome)) semEmpregado.push(nome); continue; }
    for (const [ev, v] of valores) celulas.push({ empregado: emp, evento: ev, valor: v });
  }
  const semEvento = [...colunasComValor].filter(t => !achaEvento(t) && !ehNome(t));
  return { formato: 'grade', aba: aba.nome || '', celulas, semEmpregado, semEvento };
}

/** O valor da planilha e o que a grade do portal tem são o mesmo? O portal reescreve o formato ("12:45" fica "012:45", "350" fica "350,00", horas podem virar
 *  decimal): horas comparam em minutos, números pelo valor (vírgula decimal, ponto de milhar), o resto como texto sem acento e sem caixa. */
export function mesmoValorGrade(a, b) {
  const minutos = (x) => { const m = /^\s*(\d{1,3}):(\d{2})\s*$/.exec(String(x ?? '')); return m ? +m[1] * 60 + +m[2] : null; };
  const numero = (x) => {
    let v = String(x ?? '').trim().replace(/^R\$\s*/i, '');
    if (!/^-?[\d.,]+$/.test(v)) return null;
    if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
    const n = parseFloat(v); return Number.isFinite(n) ? n : null;
  };
  const ma = minutos(a), mb = minutos(b);
  if (ma != null && mb != null) return ma === mb;
  if (ma != null || mb != null) { const h = ma != null ? ma : mb, n = numero(ma != null ? b : a); return n != null && Math.abs(h - n * 60) < 0.5; }   // horas × decimal
  const na = numero(a), nb = numero(b);
  if (na != null && nb != null) return Math.abs(na - nb) < 0.005;
  return norm(String(a ?? '')) === norm(String(b ?? ''));
}

/** Comando escrito pelo cliente ("Ronaldo 10 horas extras, Carla 2 faltas e prêmio 200 para o Artur") → células da grade do portal.
 *  Primeiro o dicionário das regras (horas extras, faltas…); depois o nome das rubricas da própria grade ("440 - PREMIO", "37 - COMISSOES"),
 *  que cobre os eventos de cada empresa. O funcionário é o da grade (nome inteiro ou só o primeiro, se for único); sem funcionário na frase vale o
 *  anterior. O que não foi entendido volta em naoEntendidas, para o cliente lançar. Nada é inventado: só o que o texto diz. */
export function comandoRubricas(texto, eventos, empregados, rules, { hoje = today() } = {}) {
  const celulas = [], semEvento = [], semEmpregado = [], naoEntendidas = [];
  const partes = String(texto || '').normalize('NFC').split(/[;\n]|,(?!\d)|\s+e\s+(?=(?:\p{L}+\s+){1,4}\d|\d)/u).map(x => x.trim()).filter(Boolean);
  const limpa = (x) => plain(x).replace(/[^a-z0-9]+/g, ' ').trim();
  const nomes = (eventos || []).map(ev => ({ ev, cheio: limpa(semCodigo(ev)), curto: limpa(nomeEvento(ev)) })).filter(x => x.curto.length >= 4);
  const nasPalavras = (t, trecho) => (' ' + t + ' ').includes(' ' + trecho + ' ');
  const poe = (empregado, evento, valor, rubrica) => { if (!celulas.some(c => c.empregado === empregado && c.evento === evento)) celulas.push({ empregado, evento, valor: String(valor), rubrica }); };
  // palavras de uma frase ou de uma rubrica, sem artigos e sem números, no singular ("vale compras" = "VALE COMPRA", "hr" = "horas")
  const UNIDADE = { hr: 'hora', hrs: 'hora', hs: 'hora', h: 'hora', hora: 'hora', horas: 'hora', dia: 'dia', dias: 'dia', d: 'dia' };
  const LIGACAO = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'para', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'com', 'por', 'um', 'uma', 'coloque', 'colocar', 'lance', 'lancar', 'lancamento', 'valor', 'reais', 'real']);
  // singular simples: comissões/comissão, viagens/viagem, faltas/falta (o acento já saiu: "oes" e "aes" = "ao", "ens" = "em")
  const singular = (w) => UNIDADE[w] || (w.length > 4 && /(oes|aes)$/.test(w) ? w.slice(0, -3) + 'ao' : w.length > 4 && w.endsWith('ens') ? w.slice(0, -3) + 'em' : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
  const palavras = (x) => limpa(x).split(' ').filter(Boolean).map(singular).filter(w => !LIGACAO.has(w) && !/^\d+$/.test(w));
  const rubricas = (eventos || []).map(ev => ({ ev, pal: new Set(palavras(semCodigo(ev))) })).filter(x => x.pal.size);
  // o funcionário de cada frase; a frase sem nome fica com o anterior e, no começo, com o primeiro citado ("... para ANA CAROLINA" vale para todas)
  const achados = partes.map(p => (empregados?.length && findEmployeeInText(p, empregados)?.option) || null);
  const iPrimeiro = achados.findIndex(Boolean);
  const primeiro = iPrimeiro >= 0 && /(^|\s)(para|pra|pro|ao|à)\s/i.test(partes[iPrimeiro]) ? achados[iPrimeiro] : null;   // só "… para ANA" vale para as frases de antes; um nome solto não adota as que ficaram sem nome
  let ultEmp = null;
  const quemDe = achados.map(e => { if (e) ultEmp = e; return e || ultEmp || primeiro; });
  const duvidas = [];
  const trata = (p, idx) => {
    const t = limpa(p), emp = achados[idx], quem = quemDe[idx];
    const dinheiro = (txt) => txt.match(/r\$\s*([\d.]+(?:,\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*reais/i);
    const semMilhar = (v) => (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v) ? v.replace(/\./g, '') : /^\d+\.\d{1,2}$/.test(v) ? v.replace('.', ',') : v);   // 1.500 = 1500 e 1.500,50 = 1500,50 (ponto de milhar)
    const numeroDe = (txt, tirar) => { const d = dinheiro(txt); if (d) return semMilhar(d[1] || d[2]); const m = plain(txt).replace(new RegExp(escR(tirar || '\u0000'), 'g'), ' ').match(/(?<![\d/:.,])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{1,2}:\d{2}|\d{1,6}(?:[.,]\d{1,2})?)(?![\d/])/); return m ? semMilhar(m[1]) : null; };
    // 1) pontuação por palavras: as palavras da frase contra as de cada rubrica da grade. Palavra da rubrica que a frase tem soma; palavra que falta tira
    //    um pouco ("comissoes mes anterior" = COMISSOES (MES ANTERIOR); só "comissoes" = COMISSOES). Vence a rubrica que se destaca; empate vira dúvida.
    const donas = new Set(emp ? palavras(emp) : []);
    const frase = new Set(palavras(p).filter(w => !donas.has(w)));
    const pontos = rubricas.map(r => { const ac = [...r.pal].filter(w => frase.has(w)); return { ev: r.ev, ac: ac.length, forte: ac.filter(w => w !== 'hora' && w !== 'dia').length, razao: ac.length / r.pal.size, nota: ac.length - 0.6 * (r.pal.size - ac.length) }; })
      .filter(x => x.forte >= 1 && x.razao >= 0.5).sort((a, b) => b.nota - a.nota);
    let ev = pontos.length && (pontos.length === 1 || pontos[0].nota - pontos[1].nota >= 0.3) ? pontos[0].ev : null, trecho = '';
    // 2) o nome da rubrica inteiro e corrido na frase ("horas extras 100"), que a pontuação não separa por causa dos números
    if (!ev) {
      let nota = 0;
      for (const x of nomes) {
        const achou = nasPalavras(t, x.cheio) ? x.cheio : nasPalavras(t, x.curto) ? x.curto : '';
        if (!achou || (x.cheio !== x.curto && achou !== x.cheio)) continue;
        if (achou.length > nota) { ev = x.ev; nota = achou.length; trecho = achou; }
      }
    }
    const valor = numeroDe(p, trecho);
    if (ev && valor) {
      if (quem) poe(quem, ev, valor, semCodigo(ev)); else if (!semEmpregado.includes('?')) semEmpregado.push('?');
      return;
    }
    // 3) o dicionário das regras (horas extras, faltas…) para o que a grade não nomeia
    const linhas = linhasRubricas(p, rules, empregados).map(l => ({ ...l, empregado: l.empregado || quem || '' }));
    if (linhas.length) {
      const g = montarGrade(linhas, eventos, empregados, rules);
      g.celulas.forEach(c => poe(c.empregado, c.evento, c.valor, c.rubrica));
      g.semEvento.forEach(x => { if (!semEvento.includes(x)) semEvento.push(x); });
      g.semEmpregado.forEach(x => { if (!semEmpregado.includes(x)) semEmpregado.push(x); });
      return;
    }
    // 4) em dúvida entre rubricas parecidas: pergunta qual (com o funcionário e o valor já entendidos) em vez de chutar ou desistir
    if (valor && quem && pontos.length) { duvidas.push({ frase: p, empregado: quem, valor, opcoes: pontos.slice(0, 4).map(x => x.ev) }); return; }
    if (valor || ev) naoEntendidas.push(p);
  };
  // "do mês anterior" que faz parte do nome da rubrica (COMISSOES (MES ANTERIOR)) não é a competência do lançamento
  const consumiu = new Set();
  partes.forEach((p, idx) => { const n0 = celulas.length; trata(p, idx); if (celulas.slice(n0).some(c => /anterior|passado/.test(limpa(c.evento)))) consumiu.add(idx); });
  const textoComp = partes.map((p, i) => (consumiu.has(i) ? p.replace(/m[eê]s\s+(anterior|passado)|[uú]ltimo\s+m[eê]s/gi, ' ') : p)).join('; ');
  return { celulas, semEvento, semEmpregado, naoEntendidas, duvidas, competencia: competenciaDoTexto(textoComp, hoje, rules) };
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
