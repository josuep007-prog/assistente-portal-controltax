// Motor de regras — Plataforma: solicitações, equipe, conversa, atenção, prazos legais e observações.
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { addDays, diffDays, fmtDate, iso, makeCalendar, norm, onlyDigits, parseDate, today, weekday } from './base.js';
import { renderTemplate } from './modelos.js';
import { mesAno } from './planilhas.js';
import { diaUtilAntes, pagamentoFerias, pagamentoRescisao } from './prazos.js';
import { matchCond, resolveTipo } from './tipos.js';

/* =================== Plataforma (2.0) =================== */
/* Solicitações lidas das listas do portal. O formato dos itens do Onvio ainda não foi visto
   (a calibrar): procura a situação, o funcionário e as datas em vários nomes de campo, e as
   expressões que dizem "aguardando você" ficam nas regras (config.statusSolicitacao). */
export const PADRAO_STATUS = {
  aguardando: ['aguardando[^"]{0,20}(cliente|voc[eê])', 'waiting[_ ]?(for[_ ]?)?(client|customer)', 'awaiting'],
  concluida: ['conclu', 'finaliz', 'complet', 'encerrad'],
  cancelada: ['cancel']
};
export const reLista = (lista) => (lista || []).map(s => { try { return new RegExp(s, 'i'); } catch { return null; } }).filter(Boolean);
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
export const texto1 = (...vs) => { for (const v of vs) { if (v == null || v === '') continue; if (typeof v === 'string' || typeof v === 'number') return String(v); if (typeof v === 'object') { const d = v.description || v.name || v.label || v.value; if (d) return String(d); } } return ''; };
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
export const mesmaEmpresa = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
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
export const marcosExperiencia = (rules) => (rules?.config?.experienciaDias || [45, 90]).map(Number).filter(Boolean);
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
export const PAR_CALCULO = { avisoFerias: 'calculoFerias', avisoRescisao: 'calculoRescisao' };
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
export const gravaCliente = (regras, fam) => new Set((regras?.config?.statusSolicitacao?.clienteGrava?.[fam] || { padrao: [1, 3], cadastro: [1, 2, 4], rubricas: [0, 1, 11, 12] }[fam] || [1, 3]).map(Number));

/* ---------- Conversa: o escritório pede algo? (2.4, regra do Control Onvio) ----------
   Uma resposta do escritório "pede algo" se tiver uma pergunta ou uma das palavras de config.pedidoAoCliente,
   depois de tirar as frases de cortesia (config.cortesiaCliente: "qualquer dúvida…"). O texto é lido na hora
   e nunca guardado; volta a frase que pede, para mostrar ao cliente. */
export const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const textoPlano = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&[a-z#0-9]+;/gi, ' ');
export const semAcento = (x) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const acharTrecho = (texto, lista) => (lista || []).find(p => p && new RegExp(`(^|[^a-z0-9])${escRe(semAcento(p).trim())}($|[^a-z0-9])`).test(texto)) || null;
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
export const ORDEM_MOTIVO = { prescreve: 0, responder: 1, atrasada: 2, respondida: 3, escritorio: 4, concluida: 5 };
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
