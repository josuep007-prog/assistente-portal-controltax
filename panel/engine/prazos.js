// Motor de regras — Prazos compartilhados, valores derivados e datas calculáveis.
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { addDays, fmtDate, makeCalendar, norm, parseDate, today } from './base.js';
import { matchCond, resolveTipo } from './tipos.js';

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
export const SEM_AVISO = ['COM JUSTA CAUSA', 'EXPERIENCIA', 'TEMPO DETERMINADO', 'CULPA RECIPROCA'];
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
export const COM_INSS = ['Doença', 'Acid. Trabalho', 'mesma doença', 'mesmo acid', 'Doença profissional'];
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
