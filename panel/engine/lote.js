// Motor de regras — Lote (um pedido por tipo e por pessoa) e regra dos 60 dias.
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { addDays, diffDays, fmtDate, norm, parseDate } from './base.js';
import { mesmaPessoa } from './leitor.js';
import { renderTemplate } from './modelos.js';
import { CADASTROS } from './textolivre.js';

/* ---------------- Lote: um pedido por tipo e por pessoa ---------------- */
export const NEUTROS_PADRAO = ['certidao', 'aso', 'identidade', 'cpf', 'comprovanteEndereco', 'ctps', 'seguro', 'bancario'];
export const SEM_PESSOA_PADRAO = ['comprovanteEndereco', 'bancario'];
/** Documentos que servem a vários pedidos (RG, ASO, certidão…): documentos[].neutro nas regras (sem a marca, a lista antiga). */
export function docsNeutros(rules) {
  const docs = rules?.documentos || [];
  return docs.some(d => 'neutro' in d) ? docs.filter(d => d.neutro).map(d => d.id) : NEUTROS_PADRAO;
}
/** Documentos que não dizem de quem é o pedido (comprovante de residência, dados bancários): documentos[].definePessoa = false. */
export function docsSemPessoa(rules) {
  const docs = rules?.documentos || [];
  return docs.some(d => 'definePessoa' in d) ? docs.filter(d => d.definePessoa === false).map(d => d.id) : SEM_PESSOA_PADRAO;
}
/** De quem é o arquivo lido no lote: o funcionário encontrado; nos cadastros, o CPF ou o nome lido; no atestado, o paciente. */
export function pessoaDoItem(it, rules) {
  if (docsSemPessoa(rules).includes(it?.documento)) return null;
  const a = it?.analise || {}; const e = a.campos?.empregado;
  if (e?.valor && (e.conf ?? 0) >= 0.6) return { nome: e.valor, cpf: a.pessoa?.cpf || null };
  return a.pessoa || (a.paciente ? { nome: a.paciente } : null);
}
export const mesmoPedido = (a, b) => a === b || (CADASTROS.includes(a) && CADASTROS.includes(b));
/** O tipo que mais aparece nos arquivos (o cartão de "Encontrei o caminho" usa este, não o do 1º arquivo). */
export function tipoMaisFrequente(itens, rules) {
  const neutros = docsNeutros(rules); const n = new Map();
  for (const it of itens || []) { const t = it?.analise?.tipoSugerido; if (t) n.set(t, (n.get(t) || 0) + (neutros.includes(it.documento) ? 0.5 : 1)); }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
/**
 * Vários arquivos de uma vez → pedidos de um tipo e de uma pessoa. itens: [{ documento, analise: { tipoSugerido, campos,
 * pessoa, paciente, titular } }]. Atestados (config.umPedidoPorDocumento) viram um pedido cada; o resto, um por tipo e pessoa.
 * Documentos neutros (RG, ASO, certidão) vão para o pedido da mesma pessoa; sem pessoa, para o único pedido possível;
 * senão ficam em `fora` (o cliente escolhe). Devolve { pedidos: [{ tipo, itens, pessoa }], fora, pessoas }.
 */
export function montarPedidosLote(itens, rules) {
  const individuais = rules?.config?.umPedidoPorDocumento || ['atestado', 'comparecimento'];
  const neutrosIds = docsNeutros(rules);
  const pessoaDe = (it) => pessoaDoItem(it, rules);
  const pedidos = []; const grupos = []; const neutros = []; const semPessoa = [];
  for (const it of itens || []) {
    const tipo = it.analise?.tipoSugerido || null;
    if (individuais.includes(it.documento)) pedidos.push({ tipo: tipo || 'afastamento', itens: [it], pessoa: pessoaDe(it), individual: true });
    else if (tipo && !neutrosIds.includes(it.documento)) { if (pessoaDe(it)) grupos.push({ tipo, it }); else semPessoa.push({ tipo, it }); }
    else neutros.push(it);
  }
  const lista = [];   // pedidos que juntam documentos (não individuais)
  const juntar = (tipo, it, p) => {
    const g = lista.find(x => mesmoPedido(x.tipo, tipo) && (p ? mesmaPessoa(x.pessoa, p) === true : !x.pessoa));
    if (g) { g.itens.push(it); if (!g.pessoa && p) g.pessoa = p; } else lista.push({ tipo, itens: [it], pessoa: p || null });
  };
  for (const { tipo, it } of grupos) juntar(tipo, it, pessoaDe(it));
  // sem pessoa (nome não achado): vai para o único pedido desse tipo; senão, um pedido próprio
  for (const { tipo, it } of semPessoa) {
    const doTipo = lista.filter(x => mesmoPedido(x.tipo, tipo));
    if (doTipo.length === 1) doTipo[0].itens.push(it); else juntar(tipo, it, null);
  }
  // neutros com pessoa: o pedido da mesma pessoa; sem esse pedido, um cadastro próprio quando o documento é de cadastro
  const restoNeutros = [];
  for (const it of neutros) {
    const p = pessoaDe(it);
    const alvo = p && [...pedidos, ...lista].find(x => mesmaPessoa(x.pessoa, p) === true);
    if (alvo) alvo.itens.push(it);
    else if (p && CADASTROS.includes(it.analise?.tipoSugerido)) juntar(it.analise.tipoSugerido, it, p);
    else restoNeutros.push(it);
  }
  // documento que acompanha um atestado (ex.: CAT da mesma data e da mesma pessoa) entra na mesma solicitação
  const data = (it) => it.analise?.campos?.dataAfastamento?.valor || null;
  for (const g of [...lista]) {
    const alvo = pedidos.find(p => p.individual && p.tipo === g.tipo && g.itens.every(it => data(it) && data(it) === data(p.itens[0])) && mesmaPessoa(p.pessoa, g.pessoa) !== false);
    if (alvo) { alvo.itens.push(...g.itens); lista.splice(lista.indexOf(g), 1); }
  }
  // o tipo do pedido é o que mais aparece nele (sem contar os neutros)
  for (const g of lista) { const t = tipoMaisFrequente(g.itens.filter(it => !neutrosIds.includes(it.documento)), rules); if (t) g.tipo = t; }
  pedidos.push(...lista);
  // neutros sem pessoa: comprovante pelo titular; senão o único pedido possível; senão o cliente escolhe
  const fora = [];
  for (const it of restoNeutros) {
    const tt = it.analise?.titular;
    const peloTitular = tt && pedidos.filter(p => mesmaPessoa(p.pessoa, { nome: tt }) === true);
    if (peloTitular?.length === 1) { peloTitular[0].itens.push(it); continue; }
    const naoIndiv = pedidos.filter(p => !p.individual);
    if (pedidos.length === 1) pedidos[0].itens.push(it);
    else if (naoIndiv.length === 1 && (!pessoaDe(it) || mesmaPessoa(naoIndiv[0].pessoa, pessoaDe(it)) !== false)) naoIndiv[0].itens.push(it);
    else fora.push(it);
  }
  const pessoas = pedidos.reduce((acc, p) => p.pessoa && !acc.some(x => mesmaPessoa(x, p.pessoa) === true) ? [...acc, p.pessoa] : acc, []);
  return { pedidos: pedidos.map(({ individual, ...p }) => p), fora, pessoas };
}

/* ---------------- Regra dos 60 dias (atestados do mesmo funcionário) ---------------- */
export const R60_PADRAO = { janelaDias: 60, limiteDias: 15, tipoSugerido: 'Novo afast. mesma doença', textoDescricao: 'Soma {soma} dias com {anteriores} (regra dos 60 dias — mesma doença, informado pelo cliente).' };
export const regra60 = (rules) => ({ ...R60_PADRAO, ...(rules?.config?.regra60dias || {}) });
/**
 * Decreto 3.048/99, art. 75: afastamentos pela mesma doença se somam quando um começa até 60 dias depois do retorno do
 * anterior; passando de 15 dias, o INSS paga a partir do 16º. atual/anteriores = { empregado, data: 'dd/mm/aaaa', dias,
 * origem? }. Devolve null ou { soma, anteriores: [do mais antigo ao mais recente], passa, tipoSugerido, texto }.
 */
export function somaAtestados(atual, anteriores, rules) {
  const R = regra60(rules); if (R.ativo === false) return null;
  const ini = parseDate(atual?.data); const n = parseInt(atual?.dias, 10);
  if (!ini || !(n > 0) || !atual?.empregado) return null;
  const doMesmo = (anteriores || []).map(a => ({ ...a, ini: parseDate(a.data), n: parseInt(a.dias, 10) }))
    .filter(a => a.ini && a.n > 0 && a.empregado && a.ini < ini && mesmaPessoa({ nome: a.empregado }, { nome: atual.empregado }) === true)
    .sort((a, b) => b.ini - a.ini);
  const cadeia = []; let ref = ini;
  for (const a of doMesmo) {
    if (cadeia.some(c => +c.ini === +a.ini)) continue;         // o mesmo atestado duas vezes (lote e histórico)
    const retorno = addDays(a.ini, a.n);                       // dia em que voltou ao trabalho
    const intervalo = diffDays(retorno, ref);
    if (intervalo < 0) continue;                               // sobreposto (pedido repetido?): não soma
    if (intervalo > (+R.janelaDias || 60)) break;
    cadeia.unshift(a); ref = a.ini;
  }
  if (!cadeia.length) return null;
  const soma = n + cadeia.reduce((s, a) => s + a.n, 0);
  const anteriores_ = cadeia.map(a => ({ data: fmtDate(a.ini), dias: a.n, origem: a.origem || null }));
  const lista = anteriores_.map(a => `o atestado de ${a.data.slice(0, 5)} (${a.dias} ${a.dias === 1 ? 'dia' : 'dias'})`);
  const texto = renderTemplate(R.textoDescricao, { soma: String(soma), anteriores: lista.length > 1 ? `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}` : lista[0] });
  return { soma, anteriores: anteriores_, passa: soma > (+R.limiteDias || 15), tipoSugerido: R.tipoSugerido, texto };
}
/** Mesma doença pelo CID (só na memória, dentro do lote): mesma categoria (3 primeiros caracteres). null = não dá para dizer. */
export function mesmaDoencaPeloCid(a, b) {
  const x = norm(a).replace(/\s/g, '').slice(0, 3), y = norm(b).replace(/\s/g, '').slice(0, 3);
  return x.length === 3 && y.length === 3 ? x === y : null;
}
