// Motor de regras — Variáveis da folha, grade de rubricas, planilha de rubricas e catálogo da Solicitação Geral.
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { empregadoPorNome } from './atestado.js';
import { norm, today } from './base.js';
import { renderTemplate } from './modelos.js';
import { bestMatch, findEmployeeInText, similarity } from './nomes.js';
import { texto1 } from './plataforma.js';
import { MESES, RX_NUM, numeroPorExtenso, plain, temTermo, tl } from './textolivre.js';

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
