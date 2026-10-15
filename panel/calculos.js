/* Simulações de férias e rescisão (módulo Calcular). Puro e testável em Node: nada de tela aqui.
 * Valores de apoio pela CLT; o cálculo oficial é do escritório. Tabelas de INSS e IRRF ficam nas regras
 * (config.tabelas), para o escritório corrigir sem nova versão da extensão. */
import { parseDate, addDays, diffDays, fmtDate } from './engine.js';

export const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
export const brl = (x) => Number(x || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** "3.000,50", "3000.5", "R$ 3.000" → 3000.5 */
export function numeroBR(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s); return isFinite(n) ? n : 0;
}

/* ---------- INSS e IRRF ---------- */
/** INSS progressivo por faixas [[ate, aliquota]]; acima da última faixa não incide (teto). */
export function inss(base, T) {
  let total = 0, ant = 0;
  for (const [ate, aliq] of T?.inss?.faixas || []) {
    if (base <= ant) break;
    total += r2((Math.min(base, ate) - ant) * aliq); ant = ate;
  }
  return r2(total);
}
/** IRRF mensal: base = rendimento − (INSS + dependentes) ou o desconto simplificado, o que for maior;
 *  faixas [[ate|null, aliquota, deduzir]]; redutor da Lei 15.270/2025 (isenção até R$ 5.000 e redução até R$ 7.350). */
export function irrf(rendimento, inssDesc, dependentes, T, { redutor = true } = {}) {
  const I = T?.irrf || {};
  const legais = (inssDesc || 0) + (dependentes || 0) * (I.dependente || 0);
  const deducao = Math.max(legais, I.simplificado || 0);
  const base = Math.max(0, rendimento - deducao);
  let imposto = 0;
  for (const [ate, aliq, deduzir] of I.faixas || []) { if (ate == null || base <= ate) { imposto = base * aliq - deduzir; break; } }
  imposto = Math.max(0, imposto);
  const R = I.redutor;
  if (redutor && R && imposto > 0) {
    if (rendimento <= R.isentoAte) imposto = 0;
    else if (rendimento <= R.ate) imposto = Math.max(0, imposto - (R.a - R.b * rendimento));
  }
  return { base: r2(base), imposto: r2(imposto), deducao: r2(deducao), simplificado: deducao > legais };
}

/* ---------- datas ---------- */
const ultimoDiaDoMes = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
/** Anos completos de casa numa data. */
export function anosCompletos(admissao, data) {
  let a = data.getFullYear() - admissao.getFullYear();
  if (data.getMonth() < admissao.getMonth() || (data.getMonth() === admissao.getMonth() && data.getDate() < admissao.getDate())) a--;
  return Math.max(0, a);
}
/** Dias de aviso prévio proporcional (Lei 12.506/2011): 30 + 3 por ano completo, até 90. */
export const diasAvisoProporcional = (admissao, dataAviso) => Math.min(90, 30 + 3 * anosCompletos(admissao, dataAviso));
/** Avos de 13º no ano de `fim`: mês com 15 dias ou mais de trabalho conta 1/12. */
export function avos13(admissao, fim) {
  let n = 0;
  for (let m = 0; m <= fim.getMonth(); m++) {
    const ini = new Date(fim.getFullYear(), m, 1), ult = new Date(fim.getFullYear(), m + 1, 0);
    const de = admissao > ini ? admissao : ini, ate = fim < ult ? fim : ult;
    if (ate >= de && diffDays(de, ate) + 1 >= 15) n++;
  }
  return Math.min(12, n);
}
/** Período aquisitivo em curso numa data e os avos de férias proporcionais (fração de 15 dias ou mais conta). */
export function avosFerias(admissao, fim) {
  const k = anosCompletos(admissao, fim);
  const inicio = new Date(admissao.getFullYear() + k, admissao.getMonth(), admissao.getDate());
  let n = 0, cursor = inicio;
  for (;;) {
    const prox = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
    if (addDays(prox, -1) <= fim) { n++; cursor = prox; } else break;
  }
  if (diffDays(cursor, fim) + 1 >= 15) n++;
  return { inicio, avos: Math.min(12, n) };
}
/** Dias de férias pelo número de faltas injustificadas no período aquisitivo (CLT 130). */
export function diasDeDireito(faltas = 0) {
  const f = Math.max(0, +faltas || 0);
  return f <= 5 ? 30 : f <= 14 ? 24 : f <= 23 ? 18 : f <= 32 ? 12 : 0;
}

/* ---------- Férias ---------- */
/** p: { salario, medias, diasGozo, diasAbono, adiantar13, dependentes, faltas, emDobro, inicio } */
export function simularFerias(p, T) {
  const remun = numeroBR(p.salario) + numeroBR(p.medias);
  const direito = diasDeDireito(p.faltas);
  const gozo = Math.max(0, +p.diasGozo || 0), abonoDias = Math.max(0, +p.diasAbono || 0);
  const avisos = [];
  if (!remun) return { erro: 'Informe o salário.' };
  if (!direito) return { erro: 'Com mais de 32 faltas injustificadas no período aquisitivo, não há direito a férias (CLT 130).' };
  if (gozo + abonoDias > direito) avisos.push(`Gozo + abono passam dos ${direito} dias de direito${direito < 30 ? ' (pelas faltas no período)' : ''}.`);
  if (abonoDias > Math.floor(direito / 3)) avisos.push(`O abono pecuniário é de no máximo 1/3 das férias (${Math.floor(direito / 3)} dias).`);
  if (gozo && gozo < 5) avisos.push('Nenhum período de férias pode ter menos de 5 dias (CLT 134 §1º).');
  const dia = remun / 30, dobro = p.emDobro ? 2 : 1;
  const ferias = r2(dia * gozo * dobro), terco = r2(ferias / 3);
  const abono = r2(dia * abonoDias), tercoAbono = r2(abono / 3);
  const adiant13 = p.adiantar13 ? r2(remun / 2) : 0;
  const inssV = inss(ferias + terco, T);
  const ir = irrf(ferias + terco, inssV, +p.dependentes || 0, T);
  const proventos = [
    { rubrica: p.emDobro ? 'Férias em dobro (fora do prazo de concessão)' : 'Férias', ref: `${gozo} dias`, valor: ferias },
    { rubrica: '1/3 constitucional das férias', ref: '', valor: terco },
    ...(abonoDias ? [{ rubrica: 'Abono pecuniário', ref: `${abonoDias} dias`, valor: abono, isento: true }, { rubrica: '1/3 sobre o abono', ref: '', valor: tercoAbono, isento: true }] : []),
    ...(adiant13 ? [{ rubrica: '1ª parcela do 13º salário', ref: '50%', valor: adiant13 }] : [])
  ];
  const descontos = [{ rubrica: 'INSS sobre as férias', ref: '', valor: inssV }, { rubrica: 'IRRF sobre as férias', ref: ir.simplificado ? 'desconto simplificado' : '', valor: ir.imposto }].filter(d => d.valor > 0);
  const inicio = parseDate(p.inicio);
  const datas = inicio ? { pagarAte: addDays(inicio, -2), avisoAte: addDays(inicio, -30), ultimoDia: addDays(inicio, gozo - 1), retorno: addDays(inicio, gozo) } : null;
  avisos.push('O INSS das férias entra no cálculo do mês junto com o salário; o valor final pode mudar um pouco.');
  return fechar({ tipo: 'ferias', remun, direito, proventos, descontos, datas, avisos });
}

/* ---------- Rescisão ---------- */
export const MODALIDADES = {
  semJustaCausa: { rot: 'Dispensa sem justa causa', aviso: ['indenizado', 'trabalhado'], multa: 0.4, saque: 1, seguro: true },
  pedidoDemissao: { rot: 'Pedido de demissão', aviso: ['trabalhado', 'dispensado', 'naoCumprido'], multa: 0, saque: 0, seguro: false },
  justaCausa: { rot: 'Dispensa por justa causa', aviso: [], multa: 0, saque: 0, seguro: false, sem13: true, semFeriasProp: true },
  acordo: { rot: 'Acordo entre empregado e empresa (art. 484-A)', aviso: ['indenizado', 'trabalhado'], multa: 0.2, saque: 0.8, seguro: false, metadeAviso: true },
  fimContrato: { rot: 'Término do contrato de experiência ou a prazo', aviso: [], multa: 0, saque: 1, seguro: false, prazo: true },
  antecipadaEmpregador: { rot: 'Fim antecipado do contrato a prazo pela empresa (art. 479)', aviso: [], multa: 0.4, saque: 1, seguro: true, prazo: true, art479: true },
  antecipadaEmpregado: { rot: 'Fim antecipado do contrato a prazo pelo empregado (art. 480)', aviso: [], multa: 0, saque: 0, seguro: false, prazo: true, art480: true },
  rescisaoIndireta: { rot: 'Rescisão indireta (art. 483)', aviso: ['indenizado'], multa: 0.4, saque: 1, seguro: true },
  culpaReciproca: { rot: 'Culpa recíproca (art. 484)', aviso: ['indenizado'], multa: 0.2, saque: 1, seguro: false, metade: true },
  falecimento: { rot: 'Falecimento do empregado', aviso: [], multa: 0, saque: 1, seguro: false }
};
export const ROTULO_AVISO = { indenizado: 'Indenizado', trabalhado: 'Trabalhado (cumprido)', dispensado: 'Dispensado pela empresa', naoCumprido: 'Não cumprido (descontado)' };

/** p: { modalidade, salario, medias, admissao, desligamento (último dia), aviso, fimContrato, clausulaAssecuratoria,
 *       feriasVencidas, feriasEmDobro, adiantamento13, saldoFgts, dependentes } */
export function simularRescisao(p, T) {
  let M = MODALIDADES[p.modalidade];
  if (!M) return { erro: 'Escolha a modalidade.' };
  // contrato a prazo com cláusula de rescisão antecipada (CLT 481): vale como dispensa sem justa causa ou pedido de demissão
  if (p.clausulaAssecuratoria && M.art479) M = { ...MODALIDADES.semJustaCausa, rot: `${M.rot}, com cláusula do art. 481` };
  if (p.clausulaAssecuratoria && M.art480) M = { ...MODALIDADES.pedidoDemissao, rot: `${M.rot}, com cláusula do art. 481` };
  const remun = numeroBR(p.salario) + numeroBR(p.medias);
  const adm = parseDate(p.admissao), fim = parseDate(p.desligamento);
  if (!remun) return { erro: 'Informe o salário.' };
  if (!adm || !fim) return { erro: 'Informe a admissão e o último dia de trabalho.' };
  if (fim < adm) return { erro: 'O último dia é antes da admissão.' };
  const avisos = [], proventos = [], descontos = [];
  const dia = remun / 30, fator = M.metade ? 0.5 : 1;
  const tipoAviso = M.aviso.includes(p.aviso) ? p.aviso : (M.aviso[0] || null);

  // saldo de salário: dias do mês até o último dia (mês completo = 30)
  const desdeDia = adm.getFullYear() === fim.getFullYear() && adm.getMonth() === fim.getMonth() ? adm.getDate() : 1;
  const diasSaldo = fim.getDate() === ultimoDiaDoMes(fim) && desdeDia === 1 ? 30 : Math.min(30, fim.getDate() - desdeDia + 1);
  const saldo = r2(dia * diasSaldo);
  proventos.push({ rubrica: 'Saldo de salário', ref: `${diasSaldo} dias`, valor: saldo, base: 'salario' });

  // aviso prévio
  let diasIndenizados = 0;
  const empregadoNoAviso = p.modalidade === 'pedidoDemissao' || (p.clausulaAssecuratoria && MODALIDADES[p.modalidade]?.art480);
  const diasProp = diasAvisoProporcional(adm, tipoAviso === 'trabalhado' ? addDays(fim, -29) : fim);
  const meioAviso = M.metadeAviso || M.metade;   // acordo e culpa recíproca: metade do aviso (o período inteiro projeta)
  if (tipoAviso === 'indenizado') {
    diasIndenizados = diasProp;
    proventos.push({ rubrica: `Aviso prévio indenizado${M.metadeAviso ? ' (metade, art. 484-A)' : M.metade ? ' (50%, culpa recíproca)' : ''}`, ref: `${diasProp} dias${meioAviso ? ' ÷ 2' : ''}`, valor: r2(dia * diasProp * (meioAviso ? 0.5 : 1)), isento: true, base: 'aviso' });
  } else if (tipoAviso === 'trabalhado' && !empregadoNoAviso && diasProp > 30) {
    diasIndenizados = diasProp - 30;
    proventos.push({ rubrica: 'Aviso prévio indenizado (dias além dos 30 trabalhados, Lei 12.506)', ref: `${diasIndenizados} dias${meioAviso ? ' ÷ 2' : ''}`, valor: r2(dia * diasIndenizados * (meioAviso ? 0.5 : 1)), isento: true, base: 'aviso' });
  } else if (tipoAviso === 'naoCumprido') {
    descontos.push({ rubrica: 'Aviso prévio não cumprido (CLT 487 §2º)', ref: '30 dias', valor: r2(dia * 30) });
  }
  const projecao = addDays(fim, diasIndenizados);
  if (diasIndenizados) avisos.push(`Com a projeção do aviso, o contrato conta até ${fmtDate(projecao)} para 13º e férias (OJ 82 SDI-1).`);

  // contrato a prazo: indenizações dos arts. 479 e 480
  const fimPrazo = parseDate(p.fimContrato);
  if (M.prazo && !fimPrazo) avisos.push('Informe a data prevista para o fim do contrato.');
  if ((M.art479 || M.art480) && fimPrazo && fimPrazo > fim) {
    const restantes = diffDays(fim, fimPrazo);
    const valor = r2(dia * restantes / 2);
    if (M.art479) proventos.push({ rubrica: 'Indenização do art. 479 (metade dos dias que faltavam)', ref: `${restantes} dias`, valor, isento: true, base: 'indenizacao' });
    else { descontos.push({ rubrica: 'Indenização do art. 480 (até a metade dos dias que faltavam)', ref: `${restantes} dias`, valor }); avisos.push('O desconto do art. 480 é limitado ao prejuízo que a empresa comprovar.'); }
  }
  if (M.prazo && fimPrazo && p.modalidade === 'fimContrato' && diffDays(fim, fimPrazo) !== 0) avisos.push('No término do contrato a prazo, o último dia deve ser a data prevista para o fim.');

  // 13º proporcional
  let decimo = 0;
  if (!M.sem13) {
    const avos = avos13(adm, projecao);
    decimo = r2(remun / 12 * avos * fator);
    if (avos) proventos.push({ rubrica: `13º salário proporcional${M.metade ? ' (50%)' : ''}`, ref: `${avos}/12`, valor: decimo, base: '13' });
  } else avisos.push('Na justa causa não há 13º proporcional nem férias proporcionais (Lei 4.090, Súmula 171 do TST).');
  const adiant = numeroBR(p.adiantamento13);
  if (adiant) descontos.push({ rubrica: 'Adiantamento do 13º já pago', ref: '', valor: r2(adiant) });

  // férias vencidas e proporcionais (indenizadas: sem INSS e sem IR)
  const venc = Math.max(0, Math.min(2, +p.feriasVencidas || 0)), dobro = Math.max(0, Math.min(venc, +p.feriasEmDobro || 0));
  for (let k = 0; k < venc; k++) {
    const emDobro = k < dobro, v = r2(remun * (emDobro ? 2 : 1));
    proventos.push({ rubrica: `Férias vencidas${emDobro ? ' em dobro' : ''}${venc > 1 ? ` (${k + 1}º período)` : ''}`, ref: '30 dias', valor: v, isento: true, base: 'ferias' });
    proventos.push({ rubrica: '1/3 sobre férias vencidas', ref: '', valor: r2(v / 3), isento: true, base: 'ferias' });
  }
  if (!M.semFeriasProp) {
    const { avos, inicio } = avosFerias(adm, projecao);
    if (avos) {
      const v = r2(remun / 12 * avos * fator);
      proventos.push({ rubrica: `Férias proporcionais${M.metade ? ' (50%)' : ''}`, ref: `${avos}/12 desde ${fmtDate(inicio)}`, valor: v, isento: true, base: 'ferias' });
      proventos.push({ rubrica: '1/3 sobre férias proporcionais', ref: '', valor: r2(v / 3), isento: true, base: 'ferias' });
    }
  }

  // INSS e IRRF: saldo de salário (mensal) e 13º (tributação exclusiva) em separado
  const dep = +p.dependentes || 0;
  const inssSal = inss(saldo, T), irSal = irrf(saldo, inssSal, dep, T);
  const inss13 = decimo ? inss(decimo, T) : 0, ir13 = decimo ? irrf(decimo, inss13, dep, T, { redutor: T?.irrf?.redutorNo13 !== false }) : { imposto: 0 };
  if (inssSal) descontos.push({ rubrica: 'INSS sobre o saldo de salário', ref: '', valor: inssSal });
  if (irSal.imposto) descontos.push({ rubrica: 'IRRF sobre o saldo de salário', ref: irSal.simplificado ? 'desconto simplificado' : '', valor: irSal.imposto });
  if (inss13) descontos.push({ rubrica: 'INSS sobre o 13º', ref: '', valor: inss13 });
  if (ir13.imposto) descontos.push({ rubrica: 'IRRF sobre o 13º', ref: '', valor: ir13.imposto });

  // FGTS (vai por guia, não entra no líquido)
  const aviso = proventos.filter(x => x.base === 'aviso').reduce((a, x) => a + x.valor, 0);
  const depositoRescisao = r2(0.08 * (saldo + aviso + decimo));
  const meses = Math.max(1, Math.round(diffDays(adm, fim) / 30.4375));
  const saldoInformado = numeroBR(p.saldoFgts);
  const saldoFgts = saldoInformado || r2(0.08 * remun * meses * 13 / 12);
  const multa = r2((saldoFgts + depositoRescisao) * M.multa);
  if (!saldoInformado && M.multa) avisos.push('Sem o saldo do FGTS, a multa foi estimada por 8% do salário em cada mês de casa. O valor certo sai do extrato do FGTS.');

  const prazoPagamento = addDays(fim, 10);
  const r = fechar({ tipo: 'rescisao', modalidade: p.modalidade, rotulo: M.rot, remun, tipoAviso, diasAviso: diasProp, projecao, proventos, descontos, avisos,
    fgts: { saldo: r2(saldoFgts), estimado: !saldoInformado, depositoRescisao, multa, multaPct: M.multa, saque: M.saque },
    seguroDesemprego: !!M.seguro, datas: { pagarAte: prazoPagamento } });
  if (r.liquido < 0) avisos.push('Os descontos passam dos valores a receber: confira com o escritório (o desconto na rescisão tem limite de uma remuneração, CLT 477 §5º).');
  return r;
}

function fechar(r) {
  const tp = r2(r.proventos.reduce((a, x) => a + x.valor, 0)), td = r2(r.descontos.reduce((a, x) => a + x.valor, 0));
  return { ...r, totalProventos: tp, totalDescontos: td, liquido: r2(tp - td) };
}

/** Texto para copiar (WhatsApp, e-mail): sem CPF nem dados de saúde. */
export function textoSimulacao(r, quem = '') {
  if (!r || r.erro) return '';
  const linhas = [`Simulação de ${r.tipo === 'ferias' ? 'férias' : `rescisão — ${r.rotulo}`}${quem ? ` — ${quem}` : ''}`, ''];
  for (const x of r.proventos) linhas.push(`+ ${x.rubrica}${x.ref ? ` (${x.ref})` : ''}: ${brl(x.valor)}`);
  for (const x of r.descontos) linhas.push(`- ${x.rubrica}${x.ref ? ` (${x.ref})` : ''}: ${brl(x.valor)}`);
  linhas.push('', `Total a receber: ${brl(r.totalProventos)}`, `Descontos: ${brl(r.totalDescontos)}`, `Líquido estimado: ${brl(r.liquido)}`);
  if (r.fgts?.multa) linhas.push(`Multa do FGTS (${Math.round(r.fgts.multaPct * 100)}%, por guia): ${brl(r.fgts.multa)}${r.fgts.estimado ? ' (estimada)' : ''}`);
  if (r.datas?.pagarAte) linhas.push(`Pagar até: ${fmtDate(r.datas.pagarAte)}`);
  linhas.push('', 'Simulação de apoio. O cálculo oficial é feito pelo escritório.');
  return linhas.join('\n');
}
