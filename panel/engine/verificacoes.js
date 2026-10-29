// Motor de regras — Verificações antes de enviar.
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { addDays, diffDays, fmtDate, makeCalendar, norm, parseDate, today, validCPF, validEmail, validPIS, weekday } from './base.js';
import { renderTemplate } from './modelos.js';
import { lev, similarity } from './nomes.js';
import { assuntoGeral } from './planilhas.js';
import { derived } from './prazos.js';
import { CADASTROS, fichaColada } from './textolivre.js';
import { activeConditionals, anexoCasa, matchCond, resolveTipo, verificarAso } from './tipos.js';

/* ---------------- Verificações ---------------- */
/**
 * values: { chave: valor } (já mesclados: portal + assistente)
 * anexos: [{ nome, documento }]  (documento = id do tipo de documento reconhecido, se houver)
 * Retorna [{ nivel: 'ok'|'info'|'atencao'|'erro', grupo, mensagem, campo }]
 */
export function runChecks(tipoKey, values, anexos, rules, hoje = today(), portal = {}) {
  const tipo = resolveTipo(rules, tipoKey);
  if (!tipo) return [];
  const cal = makeCalendar(rules.feriados);
  const d = { ...derived(tipoKey, values, rules), ...values };
  const res = [];
  const add = (nivel, grupo, mensagem, campo) => res.push({ nivel, grupo, mensagem: renderTemplate(mensagem, d) || mensagem, campo });
  const conds = activeConditionals(tipo, values);

  // Obrigatórios
  const obrig = new Set(Object.entries(tipo.campos).filter(([, c]) => c.obrigatorio && !c.somenteAssistente).map(([k]) => k));
  conds.forEach(c => (c.obrigatorios || []).forEach(k => obrig.add(k)));
  for (const k of obrig) {
    const c = tipo.campos[k]; if (!c) continue;
    if (portal.ausentes?.includes(k)) continue; // campo não existe nesta tela
    const v = values[k];
    if (v == null || String(v).trim() === '') add('erro', 'Campos obrigatórios', `Falta preencher: ${c.rotulo}`, k);
    else add('ok', 'Campos obrigatórios', `${c.rotulo}`, k);
  }

  // Anexos
  const reqAnexos = (tipo.anexos || []).map(a => ({ ...a }));
  conds.forEach(c => (c.anexos || []).forEach(id => { const a = reqAnexos.find(x => x.id === id); if (a) a.obrigatorio = true; }));
  for (const a of reqAnexos) {
    if (a.excetoQuando && matchCond(a.excetoQuando, values)) continue;
    // só conta como anexado o que está mesmo no portal: o que está só na lista do
    // Assistente ainda não foi para a solicitação (pendente)
    const has = (anexos || []).some(f => anexoCasa(a, f) && !f.pendente);
    const soNoAssistente = !has && (anexos || []).find(f => anexoCasa(a, f) && f.pendente);
    const temAlgum = (anexos || []).some(f => !f.pendente);
    // falta a carta e há modelo dela (anexos[].modelo, só quando modeloSe vale): a tela oferece "Gerar pelo modelo"
    const modelo = a.modelo && (!a.modeloSe || matchCond(a.modeloSe, values)) ? a.modelo : null;
    const n0 = res.length;
    if (has) add('ok', 'Anexos', `${a.rotulo} anexado`);
    else if (soNoAssistente) add('erro', 'Anexos', (rules?.mensagens?.anexoSoNoAssistente || 'O arquivo “{arquivo}” ainda não foi anexado no portal. Clique em “Preencher no portal” ou anexe-o direto na solicitação.').replace('{arquivo}', soNoAssistente.nome));
    else if (a.obrigatorio) add(temAlgum ? 'atencao' : 'erro', 'Anexos', temAlgum ? `Confira se o anexo inclui: ${a.rotulo}` : `Anexe: ${a.rotulo}`);
    else add('info', 'Anexos', `Se tiver, anexe: ${a.rotulo}`);
    if (!has && !soNoAssistente && modelo && res[n0]) Object.assign(res[n0], { modelo, anexo: a.id });
  }
  // ASO anexado (em qualquer pedido): INAPTO é erro; exame de outro tipo, admissional depois da admissão e demissional
  // longe do término (NR-7) são atenção — regras: config.aso
  for (const v of verificarAso(tipoKey, values, anexos, rules)) add(v.nivel, 'Documento', v.mensagem, v.campo);

  // Regras e prazos
  for (const v of tipo.verificacoes || []) {
    if (v.condicao && !matchCond(v.condicao, values)) continue;
    const val = values[v.campo];
    const dt = parseDate(val);
    const nivel = v.nivel || 'atencao';
    const G = 'Prazos e regras';
    switch (v.tipo) {
      case 'info': add(nivel, G, v.mensagem); break;
      case 'antecedenciaMinima':
        if (dt) {
          const ok = v.diasUteis ? cal.businessDaysBetween(hoje, dt) >= v.diasUteis : diffDays(hoje, dt) >= v.dias;
          if (!ok && dt >= hoje) add(nivel, G, v.mensagem, v.campo);
        }
        break;
      case 'dataPassada': if (dt && dt < hoje) add(nivel, G, v.mensagem, v.campo); break;
      case 'dataNaoFutura': if (dt && diffDays(hoje, dt) > (v.dias || 0)) add(nivel, G, v.mensagem, v.campo); break;
      case 'antiguidadeMaxima': if (dt && diffDays(dt, hoje) > v.dias) add(nivel, G, v.mensagem, v.campo); break;
      case 'intervalo':
        if (val !== '' && val != null) { const n = +String(val).replace(',', '.'); if (!isNaN(n) && (n < v.min || n > v.max)) add(nivel, G, v.mensagem, v.campo); }
        break;
      case 'somaMaxima': { const s = v.campos.reduce((a, k) => a + (+values[k] || 0), 0); if (s > v.max) add(nivel, G, v.mensagem, v.campos[0]); break; }
      case 'diasMaiorQue': if (+val > v.valor) add(nivel, G, v.mensagem, v.campo); break;
      case 'inicioFerias':
        if (dt) {
          const proibido = [1, 2].some(n => { const x = addDays(dt, n); return x.getDay() === 0 || cal.isHoliday(x); });
          if (proibido) add(nivel, G, `${v.mensagem} (${fmtDate(dt)} é ${weekday(dt)})`, v.campo);
        }
        break;
      case 'pagamentoAntesDe': {
        const ref = parseDate(values[v.referencia]);
        if (dt && ref && diffDays(dt, ref) < v.dias) add(nivel, G, v.mensagem, v.campo);
        break;
      }
      case 'prazoEscritorio': {
        if (!dt) break;
        const limite = addDays(dt, -(v.menosDias || 0));
        const precisa = rules.config?.prazoInternoDiasUteis?.[v.complexidade] ?? 5;
        if (cal.businessDaysBetween(hoje, limite) < precisa) add(nivel, G, v.mensagem, v.campo);
        break;
      }
      case 'prazoRescisao': {
        if (!dt) break;
        const limite = addDays(dt, v.dias);
        const precisa = rules.config?.prazoInternoDiasUteis?.[v.complexidade] ?? 5;
        if (cal.businessDaysBetween(hoje, limite) < precisa) add(nivel, G, `${v.mensagem} Pagamento até ${fmtDate(limite)}.`, v.campo);
        break;
      }
      case 'prazoCat':
        if (dt && !values.dataCat) add(nivel, G, v.mensagem, 'dataCat');
        else if (dt && parseDate(values.dataCat) > cal.nextBusiness(dt)) add(nivel, G, v.mensagem, 'dataCat');
        break;
      case 'cpf': if (val && !validCPF(val)) add(nivel, G, v.mensagem, v.campo); break;
      case 'pis': if (val && !validPIS(val)) add(nivel, G, v.mensagem, v.campo); break;
      case 'email': if (val && !validEmail(val)) add(nivel, G, v.mensagem, v.campo); break;
      case 'idadeMinima':
        if (dt) { const a = new Date(dt); a.setFullYear(a.getFullYear() + v.anos); if (a > hoje) add(nivel, G, v.mensagem, v.campo); }
        break;
      case 'competenciaRecente': {
        const m = String(val || '').match(/^(\d{2})\/(\d{4})$/);
        if (m) { const c = new Date(+m[2], +m[1] - 1, 1); const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1); if (c < ini || c > fim) add(nivel, G, v.mensagem, v.campo); }
        break;
      }
      case 'diaLimite': {
        const dia = rules.config?.diaLimiteRubricas;
        if (dia && hoje.getDate() > dia) add(nivel, G, v.mensagem.replace('{dia}', dia));
        break;
      }
      case 'abaErrada': {
        const txt = `${values.assunto || ''} ${values.descricao || ''}`;
        const sug = suggestTipoByText(txt, rules, tipoKey);
        if (sug) add('atencao', 'Aba certa', (rules.mensagens?.abaErrada || '').replace('{tipo}', rules.tipos[sug.tipo].nome), null);
        break;
      }
      default: break;
    }
  }
  return res;
}

/** Pontos de cada pedido (intencoes) no texto: palavras inteiras (mais as de config.abaErrada do mesmo tipo),
 *  radicais ("demit" casa demitido), uma letra trocada em palavras de 5 letras ou mais, peso por palavra
 *  (intencoes[].pesos) e trechos que não contam para o pedido (intencoes[].excluir, ex.: "folha de pagamento"). */
export function pontuarIntencoes(text, rules) {
  const base = ' ' + norm(text) + ' ';
  const extra = new Map();
  for (const e of rules?.config?.abaErrada || []) extra.set(e.tipo, [...(extra.get(e.tipo) || []), ...(e.palavras || [])]);
  const out = [];
  for (const it of rules?.intencoes || []) {
    if (it.tipo === 'geral') continue;
    let T = base;
    for (const x of it.excluir || []) { const X = norm(x); if (X) T = T.split(' ' + X + ' ').join(' # '); }
    const toks = T.split(' ').filter(Boolean);
    const pesos = new Map(Object.entries(it.pesos || {}).map(([k, v]) => [norm(k), +v || 1]));
    const peso = (P) => pesos.get(P) ?? 1;
    let pontos = 0; const achou = [];
    for (const P of new Set([...(it.palavras || []), ...(extra.get(it.tipo) || [])].map(norm).filter(Boolean))) {
      if (T.includes(' ' + P + ' ')) { pontos += peso(P); achou.push(P); continue; }
      // erro de digitação: uma letra a mais, a menos ou trocada, só em palavras de 5 letras ou mais
      if (!P.includes(' ') && P.length >= 5 && toks.some(x => x.length >= 5 && Math.abs(x.length - P.length) <= 1 && lev(x, P) === 1)) { pontos += 0.8 * peso(P); achou.push(P + '~'); }
    }
    for (const r of it.radicais || []) {
      const R = norm(String(r).replace(/\*$/, ''));
      if (R && toks.some(x => x.startsWith(R))) { pontos += peso(R); achou.push(R + '*'); }
    }
    const ja = out.find(x => x.tipo === it.tipo);
    if (ja) { if (pontos > ja.pontos) Object.assign(ja, { pontos, achou, intencao: it }); }
    else out.push({ tipo: it.tipo, pontos, achou, intencao: it });
  }
  return out.sort((a, b) => b.pontos - a.pontos);
}

/** Pedido mais provável do texto. Empate de verdade (mesma pontuação) vem em `empate` para o cliente escolher. */
export function suggestTipoByText(text, rules, atual) {
  const T = ' ' + norm(text) + ' ';
  if (T.trim().length < 4) return null;
  const l = pontuarIntencoes(text, rules).filter(x => x.tipo !== atual && x.pontos > 0);
  // ficha colada ("Nome: … CPF: … Nome da mãe: …") abre o Cadastro mesmo sem a palavra admissão
  if (!atual && (!l.length || (!CADASTROS.includes(l[0].tipo) && l[0].pontos < 3))) {
    const n = fichaColada(text, rules);
    if (n && (!l.length || l[0].pontos < n)) return { tipo: 'cadastroEmpregado', hits: n, pontos: n, ficha: true, intencao: (rules?.intencoes || []).find(i => i.tipo === 'cadastroEmpregado') || null };
  }
  if (!l.length) {
    // nenhum pedido com aba própria: a Solicitação Geral, se o catálogo (tipos.geral.catalogo) reconhece o assunto
    const g = atual !== 'geral' ? assuntoGeral(text, rules) : null;
    return g ? { tipo: 'geral', hits: 1, pontos: 1, geral: g, intencao: (rules?.intencoes || []).find(i => i.tipo === 'geral') || null } : null;
  }
  const best = l[0];
  const empate = l.filter(x => x !== best && Math.abs(x.pontos - best.pontos) < 0.01).map(x => x.tipo);
  return { tipo: best.tipo, hits: best.pontos, pontos: best.pontos, intencao: best.intencao, ...(empate.length ? { empate: [best.tipo, ...empate] } : {}) };
}
export function searchIntents(q, rules) {
  const Q = norm(q);
  if (!Q) return rules.intencoes || [];
  return (rules.intencoes || [])
    .map(it => ({ it, s: Math.max(similarity(Q, it.titulo), ...(it.palavras || []).map(p => norm(p).includes(Q) || Q.includes(norm(p)) ? 0.9 : similarity(Q, p) * 0.8)) }))
    .filter(x => x.s > 0.45).sort((a, b) => b.s - a.s).map(x => x.it);
}
export function summarizeChecks(list) {
  const c = { ok: 0, info: 0, atencao: 0, erro: 0 };
  list.forEach(i => c[i.nivel]++);
  return c;
}
