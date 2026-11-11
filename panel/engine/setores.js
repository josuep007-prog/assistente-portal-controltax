// Motor de regras — Setores (Pessoal, Fiscal, Contábil) e documentos que o cliente envia por competência (2.40).
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
// Tudo o que é lista, texto e prazo vem de regras.config.setores e regras.config.documentosCliente.
import { norm, today, addDays, makeCalendar } from './base.js';
import { renderTemplate } from './modelos.js';

const cfgSetores = (regras) => regras?.config?.setores || null;
const cfgDocs = (regras) => regras?.config?.documentosCliente || {};
const doisDig = (n) => String(n).padStart(2, '0');

/** Setores na ordem das regras. Sem `config.setores` (regras antigas) devolve [] e a plataforma fica como antes. */
export function setoresAtivos(regras) {
  const c = cfgSetores(regras); if (!c) return [];
  const ordem = Array.isArray(c.ordem) && c.ordem.length ? c.ordem : Object.keys(c).filter(k => k !== 'ordem' && !k.startsWith('_'));
  return ordem.filter(s => c[s] && typeof c[s] === 'object' && c[s].ativo !== false);
}
export const setorPadrao = (regras) => setoresAtivos(regras)[0] || '';
/** Menu (vistas, na ordem) do setor; null = o menu de sempre (Pessoal). */
export function menuDoSetor(regras, setor) {
  const m = cfgSetores(regras)?.[setor]?.menu;
  return Array.isArray(m) && m.length ? m : null;
}
export const setorDef = (regras, setor) => cfgSetores(regras)?.[setor] || {};

/** "MM/AAAA" de uma data; e de volta ({ ano, mes } com mes de 1 a 12). */
export const competenciaDe = (d) => `${doisDig(d.getMonth() + 1)}/${d.getFullYear()}`;
export function partesCompetencia(c) {
  const m = String(c || '').match(/^(\d{1,2})\/(\d{4})$/); if (!m) return null;
  const mes = +m[1], ano = +m[2];
  return mes >= 1 && mes <= 12 ? { mes, ano } : null;
}
/** Data-limite para enviar os documentos de uma competência: dia `limiteDia` do mês seguinte, no próximo dia útil. */
export function limiteDaCompetencia(regras, competencia) {
  const p = partesCompetencia(competencia); if (!p) return null;
  const dia = +cfgDocs(regras).limiteDia || 10;
  const cal = makeCalendar(regras?.feriados || []);
  let d = new Date(p.ano, p.mes, Math.min(dia, 28));   // mes (1-12) como índice = mês seguinte
  for (let k = 0; k < 10 && !cal.isBusiness(d); k++) d = addDays(d, 1);
  return d;
}
/** As competências à vista, da mais nova para a mais antiga. A primeira é o mês corrente (documentos que já podem ir chegando). */
export function competenciasDoSetor(regras, hoje = today(), n) {
  const total = Math.max(1, +n || +cfgDocs(regras).mesesVisiveis || 12);
  const out = [];
  for (let k = 0; k < total; k++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1);
    const competencia = competenciaDe(d);
    out.push({ competencia, ano: d.getFullYear(), mes: d.getMonth() + 1, limite: limiteDaCompetencia(regras, competencia), corrente: k === 0 });
  }
  return out;
}
/** A competência que o cliente mais provavelmente está enviando hoje: o mês anterior (os documentos de um mês fecham no seguinte). */
export function competenciaSugerida(regras, hoje = today()) {
  return competenciaDe(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));
}

/** O item vale nesta competência? mensal: sempre; trimestral: fim de trimestre (ou `meses`); anual: no `mes` (padrão dezembro). */
export function itemValeNaCompetencia(it, competencia) {
  const p = partesCompetencia(competencia); if (!p) return false;
  const per = it?.periodicidade || 'mensal';
  if (Array.isArray(it?.meses) && it.meses.length) return it.meses.includes(p.mes);
  if (per === 'mensal') return true;
  if (per === 'trimestral') return p.mes % 3 === 0;
  if (per === 'anual') return p.mes === (+it.mes || 12);
  return true;
}
/** Itens que o cliente envia para o setor nesta competência. `naoSeAplica` = ids dispensados para a empresa (regras + cliente). */
export function itensDoSetor(regras, setor, competencia, { naoSeAplica = [] } = {}) {
  const fora = new Set([...(regras?.config?.documentosNaoSeAplica || []), ...naoSeAplica]);
  return (cfgDocs(regras).itens || [])
    .filter(it => it?.id && it.rotulo && (it.setores || []).includes(setor) && !fora.has(it.id) && itemValeNaCompetencia(it, competencia))
    .map(it => ({ ...it, obrigatorio: it.obrigatorio !== false, compartilhado: (it.setores || []).length > 1 }));
}

/** Situação de uma competência. `enviados` = { itemId: {...} } (deste computador); `dispensados` = ids "não se aplica neste mês";
 *  `noPortal` = a solicitação do setor/competência existe no portal (enviada em outro computador conta como enviada).
 *  Devolve { estado: 'enviado'|'parcial'|'atrasado'|'pendente', total, feitos, faltam: [itens] }. */
export function situacaoCompetencia(itens, enviados = {}, { dispensados = [], limite = null, hoje = today(), noPortal = false } = {}) {
  const disp = new Set(dispensados);
  const contam = (itens || []).filter(it => !disp.has(it.id));
  const obrig = contam.filter(it => it.obrigatorio);
  const base = obrig.length ? obrig : contam;
  const feitos = base.filter(it => enviados[it.id]);
  const faltam = base.filter(it => !enviados[it.id]);
  const algum = contam.some(it => enviados[it.id]);
  let estado;
  if (!base.length) estado = contam.length || (itens || []).length ? 'enviado' : 'pendente';
  else if (!faltam.length) estado = 'enviado';
  else if (noPortal && !algum) estado = 'enviado';   // enviado por outro computador: sem o detalhe por item
  else if (limite && hoje > limite) estado = 'atrasado';
  else estado = algum || noPortal ? 'parcial' : 'pendente';
  return { estado, total: base.length, feitos: noPortal && !algum && base.length ? base.length : feitos.length, faltam, parcial: algum && !!faltam.length, semDetalhe: noPortal && !algum };
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
/** O que vai para a Solicitação Geral: departamento (nome do catálogo), assunto com a competência e a descrição com a lista. */
export function textoEnvio(regras, { setor, competencia, enviados = [], faltam = [], dispensados = [], complemento = false, copiaDe = '' } = {}) {
  const def = setorDef(regras, setor), cfg = cfgDocs(regras);
  const T = cfg.textos || {};
  const assunto = renderTemplate(def.assuntoEnvio || `Documentos – ${setor} – competência {competencia}`, { competencia })
    + (complemento ? (T.sufixoComplemento || ' – complemento') : '');
  const linhas = [
    T.enviados || 'Documentos enviados nesta solicitação:',
    ...enviados.map(e => `• ${e.rotulo}${e.n ? ` — ${plural(e.n, 'arquivo', 'arquivos')}` : ''}`)
  ];
  if (faltam.length) linhas.push('', T.faltam || 'Ainda vou enviar:', ...faltam.map(r => `• ${r}`));
  if (dispensados.length) linhas.push('', T.dispensados || 'Não se aplica neste mês:', ...dispensados.map(r => `• ${r}`));
  if (copiaDe) linhas.push('', renderTemplate(cfg.copiaParaOutroSetor || 'Cópia da solicitação enviada ao {setor}.', { setor: copiaDe }));
  return { setor, departamento: def.departamento || setor, assunto, descricao: linhas.join('\n') };
}
/** Um pedido para o setor e uma cópia (mesmo assunto, mesma lista, mesmos anexos) para cada setor de "Enviar também para". */
export function pedidosDoEnvio(regras, dados, tambemPara = []) {
  const primeiro = textoEnvio(regras, dados);
  const outros = [...new Set(tambemPara)].filter(s => s && s !== dados.setor && setoresAtivos(regras).includes(s));
  return [primeiro, ...outros.map(s => ({ ...primeiro, setor: s, departamento: setorDef(regras, s).departamento || s,
    descricao: textoEnvio(regras, { ...dados, copiaDe: dados.setor }).descricao, copiaDe: dados.setor }))];
}
/** Setores que já vêm marcados em "Enviar também para": os outros setores dos itens anexados que servem a mais de um. */
export function setoresSugeridos(regras, itens, setor) {
  const ativos = setoresAtivos(regras);
  return [...new Set((itens || []).flatMap(it => it.setores || []))].filter(s => s !== setor && ativos.includes(s));
}

const escapar = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Expressão que reconhece o assunto padronizado de um setor (tolerante a acento, caixa e ao tipo de traço). */
function reDoAssunto(modelo) {
  const partes = norm(String(modelo).replace('{competencia}', ' @@ ')).split('@@').map(p => p.trim().split(/\s+/).filter(Boolean).map(escapar).join('\\s+'));
  return new RegExp('^' + partes[0] + '\\s+(\\d{1,2})\\s+(\\d{4})' + (partes[1] ? '\\s+' + partes[1] : ''));
}
/** Envios de documentos que já estão no portal, reconhecidos pelo assunto padronizado: [{ setor, competencia, numero, quando, estado }]. */
export function enviosNoPortal(solicitacoes, regras) {
  const modelos = setoresAtivos(regras).map(s => [s, setorDef(regras, s).assuntoEnvio]).filter(([, m]) => m && m.includes('{competencia}')).map(([s, m]) => [s, reDoAssunto(m)]);
  const out = [];
  for (const it of solicitacoes || []) {
    const a = norm(it?.assunto || ''); if (!a) continue;
    for (const [setor, re] of modelos) {
      const m = a.match(re); if (!m) continue;
      const mes = +m[1]; if (mes < 1 || mes > 12) continue;
      out.push({ setor, competencia: `${doisDig(mes)}/${m[2]}`, numero: it.numero || it.id || '', quando: it.atualizado || null, estado: it.estado || '' });
      break;
    }
  }
  return out;
}
/** De qual setor é uma solicitação: o departamento (quando o portal manda o nome) ou o assunto padronizado. '' = não sei. */
export function setorDaSolicitacao(item, regras) {
  const ativos = setoresAtivos(regras); if (!ativos.length) return '';
  const dep = norm(item?.departamento || '');
  if (dep) {
    const sin = regras?.tipos?.geral?.catalogo?.departamentos || {};
    for (const s of ativos) {
      const nomes = [setorDef(regras, s).departamento || s, s, ...(sin[setorDef(regras, s).departamento || s] || [])].map(norm);
      if (nomes.some(n => n && (n === dep || (' ' + dep + ' ').includes(' ' + n + ' ')))) return s;
    }
  }
  return enviosNoPortal([item], regras)[0]?.setor || '';
}
