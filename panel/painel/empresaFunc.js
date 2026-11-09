/* Painel — De qual empresa é o funcionário (2.36).
 * Monta, só na memória, um índice "funcionário → empresa" de todas as empresas do acesso (solicitações já lidas + lista de funcionários de cada empresa quando
 * o id dela é conhecido e validado) e responde, para os documentos lidos, de qual empresa é a pessoa. Quem usa (abrir o pedido, o lote) troca a empresa de acordo. */
import * as E from '../engine.js';
import { P, S, request } from './base.js';
import { empregadosEmpresa } from './modo.js';

const chaveDe = (nome, apelido) => E.norm(apelido) || E.norm(nome);
const consultadas = new Set();   // empresas cujo id já foi consultado (não repete)
const nomesGuardados = new Map();   // chave da empresa → { empresa, nomes } vindos da consulta direta

/** Índice [{ empresa: { nome, apelido }, nomes: [...] }]. A consulta direta à lista de funcionários de cada empresa é feita uma vez por sessão. */
export async function indiceDeFuncionarios() {
  const mapa = new Map();
  const poe = (nome, apelido, func) => {
    const k = chaveDe(nome, apelido); if (!k) return null;
    if (!mapa.has(k)) mapa.set(k, { empresa: { nome, apelido: apelido || '' }, nomes: new Set() });
    const e = mapa.get(k); if (apelido && !e.empresa.apelido) e.empresa.apelido = apelido;
    if (func) e.nomes.add(func);
    return e;
  };
  // as solicitações são a base do índice: se ainda estão sendo lidas (página recém-aberta), espera um pouco
  if (!S.plat?.sol && S.modo === 'plataforma') await Promise.race([P?.carregarSolicitacoes?.(), new Promise(r => setTimeout(r, 8000))]).catch(() => {});
  const itens = S.plat?.sol?.itens || [];
  for (const i of itens) if (i.empresa) poe(i.empresa, i.empresaApelido, i.empregado);
  // a empresa aberta: a lista que o portal já deu
  const nomesAtuais = empregadosEmpresa.get(S.ctx.empresa) || [];
  if (S.ctx.empresa) { const e = poe(S.ctx.empresa, S.ctx.empresaApelido || ''); for (const n of nomesAtuais) e?.nomes.add(n); }
  // as outras: a lista de funcionários de cada uma, só se o id é conhecido e o portal confirma que serve
  const diag = S.plat.funcDiag || (S.plat.funcDiag = {});
  const idDe = new Map(); for (const i of itens) if (i.empresaId && i.empresa) idDe.set(chaveDe(i.empresa, i.empresaApelido), i.empresaId);
  if (idDe.size) {
    const chaveAtual = chaveDe(S.ctx.empresa, S.ctx.empresaApelido);
    try { if (!S.plat.empresasPortal) await P?.carregarEmpresasDoPortal?.(); } catch { /* sem a lista do portal, vale a das solicitações */ }
    const empresas = (P?.empresasDoLogin?.() || []);
    const pedidos = empresas.map(e => ({ chave: chaveDe(e.nome, e.apelido), id: idDe.get(chaveDe(e.nome, e.apelido)) || '' })).filter(p => p.id && !consultadas.has(p.chave));
    for (const p of pedidos) consultadas.add(p.chave);
    const atual = { chave: chaveAtual, id: idDe.get(chaveAtual) || '' };
    if (pedidos.length) try {
      const r = await request({ type: 'empregadosDeEmpresas', pedidos, atual }, 60000);
      if (r?.ok) {
        let ok = 0, falhas = 0;
        for (const [chave, v] of Object.entries(r.porEmpresa || {})) {
          const emp = empresas.find(e => chaveDe(e.nome, e.apelido) === chave); if (!emp) continue;
          if (v.ok) { ok++; nomesGuardados.set(chave, { nome: emp.nome, apelido: emp.apelido, nomes: v.nomes || [] }); } else { falhas++; consultadas.delete(chave); }
        }
        diag.api = `consulta direta: ${ok} empresa(s) lida(s)${falhas ? `, ${falhas} sem acesso` : ''}`;
        S.plat.funcApiOk = ok;
      } else diag.api = `consulta direta não usada (${r?.motivo || 'sem resposta'})`;
    } catch { diag.api = 'consulta direta não usada (sem resposta)'; for (const p of pedidos) consultadas.delete(p.chave); }
  }
  for (const g of nomesGuardados.values()) { const e = poe(g.nome, g.apelido); for (const n of g.nomes) e.nomes.add(n); }
  const lista = [...mapa.values()].map(e => ({ empresa: e.empresa, nomes: [...e.nomes] }));
  diag.resumo = `${lista.length} empresa(s), ${lista.reduce((n, e) => n + e.nomes.length, 0)} nome(s)`;
  return lista;
}

/** De qual empresa são estes documentos? Tenta o funcionário lido, o paciente do atestado e o nome do arquivo, nessa ordem.
 *  Devolve { tipo: 'unica'|'varias'|'nenhuma'|'atual', hits, nomeUsado } ou null se não deu para tentar. */
export async function empresaDosDocumentos(itens) {
  const nomes = [];
  for (const it of itens || []) {
    const a = it.analise;
    for (const n of [a?.campos?.empregado?.valor, a?.paciente, E.nomeDoArquivoLimpo(it.nome)]) if (n && !nomes.includes(n)) nomes.push(n);
  }
  if (!nomes.length) return null;
  const indice = await indiceDeFuncionarios();
  for (const n of nomes) {
    const r = E.empresaDoFuncionario(n, indice);
    if (r.tipo === 'nenhuma') continue;
    const h = r.hits[0];
    if (r.tipo === 'unica' && P.ehEmpresaAtual?.(h.empresa.nome, h.empresa.apelido)) return { tipo: 'atual', hits: r.hits, nomeUsado: n };
    // o nome também está na empresa aberta (e em outras): fica nela, sem perguntar
    if (r.tipo === 'varias' && r.hits.some(x => P.ehEmpresaAtual?.(x.empresa.nome, x.empresa.apelido))) return { tipo: 'atual', hits: r.hits, nomeUsado: n };
    return { ...r, nomeUsado: n };
  }
  return { tipo: 'nenhuma', hits: [], nomeUsado: '' };
}
