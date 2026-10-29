// Motor de regras — Tipos, campos e cadastros (o que se repete é da empresa).
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { diffDays, fmtDate, norm, onlyDigits, parseDate } from './base.js';
import { renderTemplate } from './modelos.js';
import { assuntoGeral } from './planilhas.js';
import { texto1 } from './plataforma.js';
import { plain } from './textolivre.js';

/* ---------------- Tipos e campos ---------------- */
export function resolveTipo(rules, key) {
  const t = rules.tipos?.[key];
  if (!t) return null;
  if (!t.herdaCamposDe) return t;
  const base = rules.tipos[t.herdaCamposDe];
  return { ...t, campos: { ...(base?.campos || {}), ...t.campos } };
}
export const tipoBySlug = (rules, slug) => Object.entries(rules.tipos || {}).find(([, t]) => t.slug === slug)?.[0] || null;
export const matchCond = (cond, values) => {
  if (!cond) return true;
  const v = norm(values[cond.campo]);
  if (cond.contem) return cond.contem.some(c => v.includes(norm(c)));
  if (cond.igual != null) return v === norm(cond.igual);
  // número maior que (ex.: dias de abono > 0); vem antes de "preenchido", que as versões antigas usam no lugar
  if (cond.maiorQue != null) { const n = parseFloat(String(values[cond.campo] ?? '').replace(',', '.')); return !isNaN(n) && n > +cond.maiorQue; }
  if (cond.preenchido) return !!v;
  return true;
};
export function activeConditionals(tipo, values) {
  return (tipo.condicionais || []).filter(c => matchCond(c.se, values));
}
export const condicaoVale = (cond, values) => matchCond(cond, values || {});
/** Documentos que servem a um anexo: anexos[].documentos (lista) ou o formato antigo anexos[].documento. */
export const docsDoAnexo = (a) => [...new Set([...(a?.documentos || []), a?.documento].filter(Boolean))];
export const anexoAceita = (a, docId) => !!docId && docsDoAnexo(a).includes(docId);
/** O arquivo f ({ documento, documentos?, aso? }) cumpre o anexo a? Um PDF com vários documentos marca cada um; com
 *  anexos[].asoTipo só vale o ASO desse exame (o periódico não conta como admissional; exame não lido conta). */
export function anexoCasa(a, f) {
  const ids = [...new Set([f?.documento, ...(f?.documentos || [])].filter(Boolean))];
  if (!ids.some(id => anexoAceita(a, id))) return false;
  if (a?.asoTipo && ids.includes('aso') && f?.aso?.tipo && plain(f.aso.tipo) !== plain(a.asoTipo)) return false;
  return true;
}
export const ASO_PADRAO = {
  exameDoPedido: { cadastroEmpregado: 'admissional', cadastroEstagiario: 'admissional', cadastroContribuinte: 'admissional', avisoRescisao: 'demissional', calculoRescisao: 'demissional' },
  diasDemissional: 10,
  mensagens: {
    inapto: 'O ASO “{arquivo}” está como INAPTO. Fale com o seu analista antes de seguir.',
    exameOutro: 'O ASO anexado é {exame}, mas este pedido pede o {esperado}. Confira se é o exame certo.',
    admissionalDepois: 'O ASO admissional é de {exame}, depois da admissão ({admissao}). O exame admissional deve ser feito antes do início do trabalho.',
    demissionalLonge: 'O ASO demissional é de {exame} e o término é {termino}: pela NR-7, o exame demissional é feito em até {dias} dias do término do contrato. Confira com o escritório.'
  }
};
/** Conferência do ASO anexado (anexos[].aso = { tipo, resultado, data } lidos do documento). Pura, para todos os pedidos. */
export function verificarAso(tipoKey, values, anexos, rules) {
  const C = { ...ASO_PADRAO, ...(rules?.config?.aso || {}) }; const M = { ...ASO_PADRAO.mensagens, ...(rules?.config?.aso?.mensagens || {}) };
  const out = [];
  for (const f of anexos || []) {
    const a = f?.aso; if (!a) continue;
    if (a.resultado === 'INAPTO') out.push({ nivel: 'erro', mensagem: M.inapto.replace('{arquivo}', f.nome || 'ASO') });
    const esperado = C.exameDoPedido?.[tipoKey]; const ex = plain(a.tipo || '');
    if (esperado && ex && ex !== plain(esperado)) out.push({ nivel: 'atencao', mensagem: M.exameOutro.replace('{exame}', a.tipo).replace('{esperado}', esperado) });
    const dExame = parseDate(a.data); if (!dExame) continue;
    const adm = parseDate(values?.dataAdmissao);
    if (ex === 'admissional' && adm && dExame > adm) out.push({ nivel: 'atencao', campo: 'dataAdmissao', mensagem: M.admissionalDepois.replace('{exame}', fmtDate(dExame)).replace('{admissao}', fmtDate(adm)) });
    const fim = parseDate(values?.dataDemissao);
    if (ex === 'demissional' && fim && Math.abs(diffDays(fim, dExame)) > (+C.diasDemissional || 10)) out.push({ nivel: 'atencao', campo: 'dataDemissao', mensagem: M.demissionalLonge.replace('{exame}', fmtDate(dExame)).replace('{termino}', fmtDate(fim)).replace('{dias}', String(+C.diasDemissional || 10)) });
  }
  return out;
}

/* ---------------- Cadastros: o que se repete é da empresa, não da pessoa ---------------- */
/* regras: config.camposDaEmpresa = { tipos, campos, historicoEnviado }; empresas.<trecho>.padroes; config.experienciaSugerida */
export const CAMPOS_EMPRESA_PADRAO = {
  tipos: ['cadastroEmpregado', 'cadastroEstagiario', 'cadastroContribuinte'],
  campos: ['departamento', 'centroCusto', 'sindicato', 'jornada', 'cargaHoraria', 'cargo', 'funcao', 'contratoExperiencia', 'prorrogacao'],
  historicoEnviado: ['nome', 'dataAdmissao', 'contratoExperiencia', 'prorrogacao']
};
export const cfgEmpresa = (rules) => ({ ...CAMPOS_EMPRESA_PADRAO, ...(rules?.config?.camposDaEmpresa || {}) });
/** Campos da empresa do tipo (null quando o tipo não é um cadastro: lá vale o comportamento antigo). */
export function camposDaEmpresa(tipoKey, rules) {
  const c = cfgEmpresa(rules);
  return (c.tipos || []).includes(tipoKey) ? [...(c.campos || [])] : null;
}
/** O que pode ir de uma solicitação para outra (repetir, histórico, modelo): nunca assunto, descrição e CID;
 *  num cadastro, só os campos da empresa — os dados da pessoa anterior ficam de fora. */
export function valoresReaproveitaveis(tipoKey, valores, rules) {
  const lista = camposDaEmpresa(tipoKey, rules); const out = {};
  for (const [k, v] of Object.entries(valores || {})) {
    if (['assunto', 'descricao', 'cid'].includes(k) || v == null || v === '') continue;
    if (lista && !lista.includes(k)) continue;
    out[k] = v;
  }
  return out;
}
/** O que o "Repetir" leva (e o "Histórico deste computador" também): o que pode ser reaproveitado, menos as datas, a
 *  competência e os dias do afastamento — são de cada pedido. ("Começou e não enviou" continua levando tudo.) */
export function valoresParaRepetir(tipoKey, valores, rules) {
  const tipo = resolveTipo(rules, tipoKey); const out = {};
  for (const [k, v] of Object.entries(valoresReaproveitaveis(tipoKey, valores, rules))) {
    if (k === 'dias' || ['data', 'competencia'].includes(tipo?.campos?.[k]?.tipo)) continue;
    out[k] = v;
  }
  return out;
}
/* "Pedir de novo" a partir do detalhe de uma solicitação do portal ({lista}/{id}?expand=all): cada campo diz onde está no
   detalhe (regras: campos.*.api, um caminho ou uma lista; apiValores traduz os códigos do Onvio). Nunca vão datas, competência,
   assunto, descrição nem dados de saúde (CID, médico, CRM); num cadastro, só os campos da empresa (config.camposDaEmpresa).
   Código técnico sem tradução ("ApprenticeContractTermination") fica de fora: o cliente escolhe na lista. A calibrar no Onvio real. */
export const NAO_REPETE = new Set(['assunto', 'descricao', 'cid', 'medico', 'crm', 'observacoes', 'dias']);
export function noCaminho(obj, caminho) {
  let v = obj;
  for (const p of String(caminho).split('.')) { if (v == null || typeof v !== 'object') return undefined; v = v[p]; }
  return v;
}
/** O primeiro pedaço do caminho pode vir dentro de um bloco do detalhe (ex.: employeeRegistrationProfessionalExpanded). */
export function noDetalhe(obj, caminho, prof = 3) {
  const v = noCaminho(obj, caminho); if (v != null && v !== '') return v;
  if (prof <= 0 || !obj || typeof obj !== 'object') return undefined;
  for (const x of Object.values(obj)) if (x && typeof x === 'object' && !Array.isArray(x)) { const r = noDetalhe(x, caminho, prof - 1); if (r != null && r !== '') return r; }
  return undefined;
}
export const pareceCodigo = (s) => /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(s) || /^[A-Z][a-z0-9]+([A-Z][a-z0-9]*)+$/.test(s);
export function valoresDoDetalhe(tipoKey, detalhe, rules) {
  const tipo = resolveTipo(rules, tipoKey); if (!tipo || !detalhe || typeof detalhe !== 'object') return {};
  const daEmpresa = camposDaEmpresa(tipoKey, rules); const out = {};
  for (const [k, def] of Object.entries(tipo.campos || {})) {
    if (!def.api || def.sensivel || def.somenteAssistente || NAO_REPETE.has(k) || ['data', 'competencia'].includes(def.tipo)) continue;
    if (daEmpresa && !daEmpresa.includes(k)) continue;
    let bruto;
    for (const c of [].concat(def.api)) { bruto = noDetalhe(detalhe, c); if (bruto != null && bruto !== '') break; }
    if (bruto == null || bruto === '') continue;
    let v = typeof bruto === 'object' ? texto1(bruto) : String(bruto);
    v = String(v || '').trim(); if (!v) continue;
    const mapa = def.apiValores || null;
    if (mapa) { const m = mapa[v] ?? mapa[v.toUpperCase()]; if (m != null) v = String(m); else if (def.tipo === 'radio') continue; }
    if (def.tipo === 'radio' && def.seletores && !Object.keys(def.seletores).some(o => norm(o) === norm(v))) continue;
    if (!mapa?.[v] && pareceCodigo(v)) continue;
    if (def.tipo === 'numero') { v = onlyDigits(v); if (!v) continue; }
    out[k] = v;
  }
  // Solicitação Geral: o assunto sai do catálogo pelo assunto antigo (sem a competência), nunca copiado
  if (tipoKey === 'geral') {
    const g = assuntoGeral(texto1(detalhe.subject), rules);
    if (g) { const it = rules.tipos.geral.catalogo.itens.find(x => x.id === g.id); out.assunto = it.assunto; if (!out.departamento) out.departamento = g.departamento; const d = renderTemplate(it.descricao || [], {}); if (d) out.descricao = d; }
  }
  return out;
}
/** Valores guardados no histórico: um cadastro enviado fica só com o nome, as datas da Agenda e os campos da empresa. */
export function valoresParaHistorico(tipoKey, valores, status, rules) {
  const lista = camposDaEmpresa(tipoKey, rules);
  const v = { ...(valores || {}) }; delete v.cid; delete v.descricao; delete v.observacoes;
  if (!lista || status !== 'enviado') return v;
  const manter = new Set([...lista, ...(cfgEmpresa(rules).historicoEnviado || [])]);
  return Object.fromEntries(Object.entries(v).filter(([k]) => manter.has(k) || k === 'assunto'));
}
/** Ajustes da empresa pelo trecho do nome (regras.empresas). */
export function ajustesDaEmpresa(rules, empresa) {
  const E1 = norm(empresa);
  const ent = E1 && Object.entries(rules?.empresas || {}).find(([k]) => k && !k.startsWith('_') && E1.includes(norm(k)));
  return ent ? ent[1] || {} : null;
}
/** Sugestões para um cadastro novo (o cliente confere e escolhe "Usar"): última admissão da empresa,
 *  padrões da empresa e experiência 45 + 45. Devolve { campo: { valor, conf, fonte } } só de campos da empresa. */
export function sugestoesCadastro(tipoKey, rules, { empresa = '', historico = [] } = {}) {
  const lista = camposDaEmpresa(tipoKey, rules); if (!lista) return {};
  const tipo = resolveTipo(rules, tipoKey); const out = {};
  const put = (k, v, conf, fonte) => { if (v == null || v === '' || out[k] || !tipo?.campos?.[k] || !lista.includes(k)) return; out[k] = { valor: String(v), conf, fonte }; };
  const ult = (historico || []).find(h => h.status === 'enviado' && h.tipo === tipoKey && h.empresa === empresa);
  if (ult) for (const [k, v] of Object.entries(valoresReaproveitaveis(tipoKey, ult.valores, rules))) put(k, v, 0.5, 'como na última admissão');
  const pad = ajustesDaEmpresa(rules, empresa)?.padroes || {};
  for (const [k, v] of Object.entries(pad)) if (v && typeof v === 'object') { if (k === tipoKey) for (const [k2, v2] of Object.entries(v)) put(k2, v2, 0.5, 'padrão da empresa'); }
  for (const [k, v] of Object.entries(pad)) if (typeof v !== 'object') put(k, v, 0.5, 'padrão da empresa');
  const xp = rules?.config?.experienciaSugerida;
  if (xp && (xp.tipos || ['cadastroEmpregado']).includes(tipoKey)) {
    put('contratoExperiencia', xp.contratoExperiencia, 0.4, `sugestão: ${xp.contratoExperiencia} + ${xp.prorrogacao} dias`);
    put('prorrogacao', xp.prorrogacao, 0.4, `sugestão: ${xp.contratoExperiencia} + ${xp.prorrogacao} dias`);
  }
  return out;
}
