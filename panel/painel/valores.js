/* Painel — Valores combinados entre documento, texto e portal. (parte de panel/panel.js, dividido na 2.16.4; mapa em docs/arquitetura.md). */
import * as E from '../engine.js';
import { $, S, cidAtivo, request } from './base.js';
import { ehSugestao } from './lote.js';
import { guardarEquipe, salvarRascunho } from './facilidades.js';
import { tipoDef, w } from './modo.js';
import { updateChecks } from './formulario.js';

export function portalValores(tipo) {
  const out = {};
  if (S.ctx.tipo !== tipo || !S.ctx.form) return out;
  for (const [k, v] of Object.entries(S.ctx.form.campos || {})) if (v.existe && v.valor) out[k] = v.valor;
  return out;
}

export function valoresAssistente(tipo) {
  const W = w(tipo); const out = {};
  for (const [k, v] of Object.entries(W.valores)) if (v?.valor != null && v.valor !== '' && !ehSugestao(v)) out[k] = v.valor;
  return out;
}

/** Para conferir: o que está no portal vale mais (o cliente pode ter mudado lá). */
export function valoresParaChecar(tipo) {
  const v = { ...valoresAssistente(tipo), ...portalValores(tipo) };
  // plataforma: o que o cliente escreveu aqui vale até o portal receber
  const W = w(tipo);
  for (const [k, f] of Object.entries(W.fonteVerdade || {})) if (f === 'plataforma' && W.valores[k]?.valor) v[k] = W.valores[k].valor;
  return v;
}

export function anexosAtuais(tipo) {
  const W = w(tipo);
  const nomesPortal = S.ctx.tipo === tipo ? (S.ctx.form?.anexos || []) : [];
  const out = nomesPortal.map(n => {
    const f = W.arquivos.find(a => E.norm(a.nome) === E.norm(n));
    return { nome: n, documento: f?.documento || null, documentos: f?.documentos || null, aso: f?.aso || null };
  });
  for (const a of W.arquivos) if (!out.some(o => E.norm(o.nome) === E.norm(a.nome)) && a.status !== 'erro' && !a.removido) out.push({ nome: a.nome, documento: a.documento, documentos: a.documentos || null, aso: a.aso || null, pendente: true });
  return out;
}

/** Nome do documento principal para o assunto (ex.: "Atestado médico"); sem documento, o nome curto do pedido. */
export function documentoPrincipal(tipo) {
  const W = w(tipo);
  for (const a of W.arquivos) {
    if (a.removido || !a.documento) continue;
    const d = (S.rules.documentos || []).find(x => x.id === a.documento);
    if (d?.rotuloAssunto) return d.rotuloAssunto;
  }
  return tipoDef(tipo)?.nomeCurto || (tipo === 'afastamento' ? 'Afastamento' : tipoDef(tipo)?.nome || '');
}

/* Datas que dá para calcular (E.sugeridos, regras: tipos.*.calculados): só em campo vazio e não mexido pelo cliente,
   como "calculado — confira"; mudam junto quando a data de base muda (o calculado nunca serve de base). */
export const FONTE_CALC = 'calculado — confira';

export function aplicarCalculados(tipo) {
  const W = w(tipo); const pv = portalValores(tipo);
  const base = valoresParaChecar(tipo);
  for (const [k, v] of Object.entries(W.valores)) if (v?.calculado && (pv[k] == null || pv[k] === v.valor || pv[k] === W.ultimoPreenchido?.[k])) delete base[k];
  const sug = E.sugeridos(tipo, base, S.rules);
  for (const [k, cur] of Object.entries(W.valores)) if (cur?.calculado && !sug[k]) delete W.valores[k];
  for (const [k, sg] of Object.entries(sug)) {
    if (W.editados.has(k)) continue;
    const cur = W.valores[k];
    if (cur?.valor && !cur.calculado) continue;
    if (pv[k] && pv[k] !== W.ultimoPreenchido?.[k] && pv[k] !== cur?.valor) continue;   // o cliente escreveu direto no portal
    W.valores[k] = { valor: sg.valor, conf: 0.6, fonte: FONTE_CALC, calculado: true, explicacao: sg.explicacao };
  }
}

/* Tempo de casa no Aviso de Rescisão: pela admissão que o portal mostra na lista de funcionários (a linha
   "Tempo de casa… aviso prévio de N dias" volta à descrição). O que o cliente disse ou digitou vale mais. */
export const admissoes = new Map();   // empresa → Map(nome normalizado → admissão) — só na memória desta aba

export function guardarAdmissoes(empresa, detalhes) {
  if (!empresa || !detalhes?.length) return;
  const m = admissoes.get(empresa) || new Map();
  for (const d of detalhes) { const a = E.parseDate(d.admissao); if (d.nome && a) m.set(E.norm(d.nome), a); }
  admissoes.set(empresa, m);
}

export function admissaoDe(nome) {
  if (!nome) return null;
  const q = E.norm(nome);
  const daLista = (S.plat?.emp?.lista || []).find(e => E.norm(e.nome) === q);
  const a = (daLista && E.parseDate(daLista.admissao)) || admissoes.get(S.ctx.empresa)?.get(q) || null;
  if (!a && !admissoes.has(S.ctx.empresa) && S.ctx.empresa && S.pv.pedindoAdmissoes !== S.ctx.empresa && S.port) {
    S.pv.pedindoAdmissoes = S.ctx.empresa;
    request({ type: 'employees' }, 8000).then(r => { if (r?.detalhes?.length) { guardarEquipe(S.ctx.empresa, r.detalhes); if (S.view === 'preencher' && S.ctx.tipo) { gerarTextos(S.ctx.tipo); updateChecks(); } } else admissoes.set(S.ctx.empresa, new Map()); });
  }
  return a;
}

export function aplicarTempoDeCasa(tipo) {
  const W = w(tipo); const t = tipoDef(tipo);
  if (!t?.campos?.anosEmpresa || W.editados.has('anosEmpresa')) return;
  const cur = W.valores.anosEmpresa;
  if (cur?.valor && !cur.porAdmissao) return;
  const v = valoresParaChecar(tipo);
  const adm = admissaoDe(v.empregado);
  if (!adm) { if (cur?.porAdmissao) delete W.valores.anosEmpresa; return; }
  const ref = E.parseDate(v.dataAviso) || E.today();
  W.valores.anosEmpresa = { valor: String(E.anosCompletos(adm, ref)), conf: 0.9, fonte: `admissão em ${E.fmtDate(adm)} (portal)`, porAdmissao: true };
}

export function gerarTextos(tipo, force = false) {
  const W = w(tipo); const t = tipoDef(tipo);
  aplicarCalculados(tipo); aplicarTempoDeCasa(tipo);
  const vals = { ...valoresParaChecar(tipo), ...E.derived(tipo, valoresParaChecar(tipo), S.rules) };
  if (!cidAtivo()) delete vals.cid;
  vals.anexosNomes = anexosAtuais(tipo).map(a => a.nome).join(', ');
  vals.observacoes = W.valores.observacoes?.valor || '';
  vals.documentoPrincipal = documentoPrincipal(tipo);
  // o que o documento traz e o portal não tem campo (DIB/DCB da carta do INSS, totais do espelho de ponto): só leitura com confiança
  const limiar = E.limiarPortal(S.rules);
  vals.notasDocumento = W.arquivos.filter(a => !a.removido && !a.outroTipo && !a.outraPessoa && a.status === 'ok').flatMap(a => a.analise?.notas || []).filter(n => (n.conf ?? 1) >= limiar).map(n => n.texto).join('\n');
  vals.regra60Texto = W.regra60?.sim ? W.regra60.texto : '';
  if (t.campos.assunto && (t.assuntos || t.assunto) && (force || !W.editados.has('assunto'))) {
    const s = E.renderFirst(t.assuntos || t.assunto, vals); if (s) W.valores.assunto = { valor: s, conf: 0.9, fonte: 'gerado' };
  }
  if (t.campos.descricao && t.descricao?.length && (force || !W.editados.has('descricao'))) {
    const d = E.renderTemplate(t.descricao, vals); if (d) W.valores.descricao = { valor: d, conf: 0.9, fonte: 'gerado' };
  }
  salvarRascunho(tipo, S.ctx.empresa);
}
