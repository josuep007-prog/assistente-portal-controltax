// Sino de novidades (lógica pura): quais solicitações mudaram desde a última vez que o cliente viu.
// O que se guarda no navegador é só uma foto mínima por solicitação: [situação, data da última movimentação, estado].
// Nenhum nome, assunto, empresa ou valor entra na foto. Os textos vêm de regras.mensagens.sino.
import { motivoCliente } from './plataforma.js';

const chaveDe = (i) => `${i.tipo}:${i.id}`;
const msDe = (i) => i.atualizado?.getTime?.() || 0;
const ESTADOS = ['aguardando', 'andamento', 'concluida', 'cancelada', 'prescrita'];

/** Foto das solicitações lidas: { v, em, itens: { 'tipo:id': [situação, ms, estado] } } — as mais recentes, no máximo `max`. */
export function fotoSino(itens, regras = {}, agora = Date.now()) {
  const max = +regras?.config?.sino?.maxGuardadas || 400;
  const recentes = [...(itens || [])].filter(i => i?.id != null && i.id !== '').sort((a, b) => msDe(b) - msDe(a)).slice(0, max);
  return { v: 1, em: agora, itens: Object.fromEntries(recentes.map(i => [chaveDe(i), [String(i.status || ''), msDe(i), ESTADOS.includes(i.estado) ? i.estado : 'andamento']])) };
}

/** O que mudou para o cliente: aguardando ele, concluída, cancelada, encerrada ou movimentada pelo escritório.
 *  O que o próprio cliente causa (responder, abrir pedido) não conta. Sem foto anterior (`visto` nulo) não há novidade:
 *  a primeira leitura só serve de ponto de partida. */
export function novidadesSino(itens, visto, regras = {}) {
  if (!visto || !visto.itens) return [];
  const out = [];
  for (const i of itens || []) {
    if (i?.id == null || i.id === '') continue;
    const k = chaveDe(i), ant = visto.itens[k];
    if (ant && ant[0] === String(i.status || '') && ant[1] === msDe(i)) continue;   // nada mudou
    const antes = ant ? ant[2] : null;
    let tipo = null;
    if (i.estado === 'aguardando') tipo = motivoCliente(i, undefined, regras) === 'respondida' ? 'respondeuSemPedido' : 'respondeu';
    else if (i.estado === 'concluida') tipo = antes !== 'concluida' && ant ? 'concluida' : null;
    else if (i.estado === 'cancelada') tipo = antes !== 'cancelada' && ant ? 'cancelada' : null;
    else if (i.estado === 'prescrita') tipo = antes !== 'prescrita' && ant ? 'prescrita' : null;
    else if (i.estado === 'andamento') tipo = antes === 'andamento' ? 'andamento' : null;   // aguardando → andamento é o cliente respondendo
    if (!tipo) continue;
    out.push({ chave: k, item: i, tipo, texto: textoNovidade(tipo, i, regras) });
  }
  const ordem = { respondeu: 0, respondeuSemPedido: 1, prescrita: 2, concluida: 3, cancelada: 4, andamento: 5 };
  return out.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || msDe(b.item) - msDe(a.item));
}

const PADRAO = {
  respondeu: 'O escritório respondeu {tipo} nº {numero} e espera a sua resposta.',
  respondeuSemPedido: 'O escritório respondeu {tipo} nº {numero}. Confira a resposta no portal.',
  concluida: '{tipo} nº {numero} foi concluída.',
  cancelada: '{tipo} nº {numero} foi cancelada.',
  prescrita: '{tipo} nº {numero} foi encerrada pelo portal.',
  andamento: 'O escritório atualizou {tipo} nº {numero}: {status}.'
};
export function textoNovidade(tipo, i, regras = {}) {
  const modelo = regras?.mensagens?.sino?.[tipo] || PADRAO[tipo] || '';
  const vals = { tipo: regras?.tipos?.[i.tipo]?.nome || i.tipo, numero: i.numero || i.id, status: String(i.status || '').toLowerCase() };
  return modelo.replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? '');
}

/** Foto depois de o cliente ler: só as `chaves` (ou tudo, sem `chaves`) passam a valer como vistas; o resto da foto antiga fica. */
export function marcarVistas(visto, itens, chaves = null, regras = {}, agora = Date.now()) {
  const nova = fotoSino(itens, regras, agora);
  if (!visto || !chaves) return nova;
  const itensNovos = { ...visto.itens };
  for (const k of chaves) if (nova.itens[k]) itensNovos[k] = nova.itens[k];
  return { v: 1, em: agora, itens: itensNovos };
}
