/* Plataforma — Hoje do setor (2.42): a tela inicial do Fiscal e do Contábil.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam.
 * Mostra a competência a enviar (Enviar documentos), o que espera o cliente nas solicitações do setor, os próximos prazos
 * do setor (Agenda) e os pedidos mais comuns ao setor (catálogo da Solicitação Geral, nas regras). Nada é guardado aqui. */
import * as E from '../engine.js';

export function montarSetor(C) {
  const { A, S, $, esc, icon, viewEl } = C;
  const { P, setorAtual, itensVisiveis, eventosEntre, abrirDetalhe } = C;   // definidos em partes que montam antes
  const rot = (s) => E.setorDef(S.rules, s).rotulo || s;
  const fmt = (d) => d ? E.fmtDate(d) : '';
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

  /** Pedidos do catálogo da Solicitação Geral que são do departamento do setor. */
  function pedidosDoSetor(setor) {
    const dep = E.norm(E.setorDef(S.rules, setor).departamento || setor);
    return (S.rules.tipos?.geral?.catalogo?.itens || []).filter(it => E.norm(it.departamento) === dep);
  }
  async function pedir(it) {
    const cat = S.rules.tipos.geral.catalogo;
    const competencia = E.competenciaSugerida(S.rules, E.today());
    const usaComp = (it.descricao || []).some(l => l.includes('{competencia}'));
    const assunto = it.assunto + (usaComp && cat.sufixoCompetencia ? cat.sufixoCompetencia.replace('{competencia}', competencia) : '');
    S.plat.escolher = false;
    A.setView('preencher');
    await P.novoPedido('geral', { valores: { assunto, descricao: E.renderTemplate(it.descricao || [], { competencia }) }, sugeridos: { departamento: it.departamento }, fonte: `Pedir ao ${rot(setorAtual())}` });
  }

  function renderHojeSetor() {
    const setor = setorAtual();
    const hoje = E.today();
    const env = C.resumoEnvio?.(setor);
    const itens = itensVisiveis();
    const esperam = itens.filter(i => i.aguardando);
    const abertas = itens.filter(i => ['aguardando', 'andamento'].includes(i.estado));
    const prazos = (eventosEntre?.(hoje, E.addDays(hoje, 45)) || []).filter(e => e.tipo === 'legal').slice(0, 5);
    const pedidos = pedidosDoSetor(setor);
    const lido = !!S.plat.sol;
    const pct = env?.total ? Math.round(100 * env.feitos / env.total) : 0;
    viewEl.innerHTML = `
      <div id="avisos-esc"></div>
      <p class="hj-saud"><span class="hj-saud-t"><b>${saudacao()}!</b> · ${esc(rot(setor))} · ${esc(hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase()))}</span></p>
      <div class="hs-grid">
        ${env?.temItens ? `<section class="pn-card hs-env st-${esc(env.estado)}">
          <div class="pn-card-head"><h3>${icon('upload', 'ic-sm')} Documentos de ${esc(env.competencia)}</h3><span class="pill env-pill st-${esc(env.estado)}">${esc(env.rotulo)}</span>
            <small>${env.limite ? `Enviar até ${esc(fmt(env.limite))}` : ''}</small></div>
          <div class="pn-card-body">
            <div class="hs-prog" role="img" aria-label="${env.feitos} de ${env.total} documentos obrigatórios enviados"><b class="mono">${env.feitos}/${env.total}</b><span class="hs-barra"><i style="width:${pct}%"></i></span><small class="muted">documentos obrigatórios enviados</small></div>
            ${env.faltam?.length && !env.semDetalhe ? `<small class="muted">Falta: ${esc(env.faltam.map(f => f.rotulo).join('; '))}</small>` : ''}
            <div><button type="button" class="btn btn-primary btn-sm" id="hs-enviar">${icon('upload', 'ic-sm')} Enviar documentos</button></div>
          </div></section>` : ''}
        <section class="pn-card hs-esp">
          <div class="pn-card-head"><h3>${icon('list', 'ic-sm')} Solicitações do ${esc(rot(setor))}</h3><small>${lido ? `${abertas.length} em aberto · ${esperam.length} ${esperam.length === 1 ? 'espera' : 'esperam'} você` : 'Lendo o portal…'}</small></div>
          <div class="pn-card-body">${esperam.length ? `<div class="hs-lista">${esperam.slice(0, 6).map((i, n) => `<button type="button" class="hs-li" data-sol="${n}"><b>${esc(i.assunto || 'Solicitação')}</b><small>nº ${esc(i.numero || '')} · ${esc(i.status || '')}${i.prescreveEm != null ? ` · prescreve em ${i.prescreveEm} d` : ''}</small></button>`).join('')}</div>`
            : `<p class="muted" style="margin:0">${lido ? 'Nada esperando você neste setor.' : 'Lendo as solicitações…'}</p>`}
            <div><button type="button" class="btn btn-sm" data-ir="pendencias">${icon('list', 'ic-sm')} Ver as solicitações do ${esc(rot(setor))}</button></div></div>
        </section>
        <section class="pn-card hs-prazos">
          <div class="pn-card-head"><h3>${icon('calendar', 'ic-sm')} Próximos prazos</h3><small>Do ${esc(rot(setor))}, nos próximos 45 dias</small></div>
          <div class="pn-card-body">${prazos.length ? `<ul class="hs-pz">${prazos.map(p => `<li><span class="mono">${esc(fmt(p.d))}</span><span>${esc(p.titulo)}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Nenhum prazo deste setor nos próximos dias.</p>'}
            <div><button type="button" class="btn btn-sm" data-ir="historico">${icon('calendar', 'ic-sm')} Abrir a Agenda</button></div></div>
        </section>
        ${pedidos.length ? `<section class="pn-card hs-pedir">
          <div class="pn-card-head"><h3>${icon('chat', 'ic-sm')} Pedir ao ${esc(rot(setor))}</h3><small>Eu abro a Solicitação Geral já preenchida; você confere e envia.</small></div>
          <div class="pn-card-body"><div class="hs-pedidos">${pedidos.map((it, n) => `<button type="button" class="hs-ped" data-ped="${n}">${esc(it.assunto)}</button>`).join('')}</div>
            <div><button type="button" class="btn btn-sm btn-ghost" data-ir="preencher">${icon('plus', 'ic-sm')} Outro assunto</button></div></div>
        </section>` : ''}
      </div>`;
    $('#hs-enviar')?.addEventListener('click', () => C.irEnviar?.(env.competencia));
    viewEl.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => A.setView(b.dataset.ir)));
    viewEl.querySelectorAll('[data-sol]').forEach(b => b.addEventListener('click', () => abrirDetalhe?.(esperam[+b.dataset.sol])));
    viewEl.querySelectorAll('[data-ped]').forEach(b => b.addEventListener('click', () => pedir(pedidos[+b.dataset.ped])));
    A.renderAvisosInicio?.();
  }

  /** Hoje (Pessoal): os documentos do mês que ainda faltam enviar aos outros setores, com o atalho para a tela de envio. */
  function renderDocsMes(el) {
    if (!el) return;
    const linhas = E.setoresAtivos(S.rules).filter(s => E.menuDoSetor(S.rules, s)).map(s => ({ s, r: C.resumoEnvio?.(s) })).filter(x => x.r?.temItens && ['pendente', 'parcial', 'atrasado'].includes(x.r.estado));
    if (!linhas.length) { el.innerHTML = ''; return; }
    // compacto, na linha da saudação (não empurra o destaque nem as seções em telas baixas)
    el.innerHTML = `<span class="docs-mes">${icon('upload', 'ic-sm')}<span>Documentos de ${esc(linhas[0].r.competencia)}:</span>${linhas.map(({ s, r }) => `<button type="button" class="docs-mes-b st-${esc(r.estado)}" data-docs-setor="${esc(s)}" title="${esc(`${r.feitos} de ${r.total} obrigatórios enviados${r.limite ? ` · enviar até ${fmt(r.limite)}` : ''} — abrir o envio do ${rot(s)}`)}"><b>${esc(rot(s))}</b> · ${esc(r.rotulo)}</button>`).join('')}</span>`;
    el.querySelectorAll('[data-docs-setor]').forEach(b => b.addEventListener('click', async () => { await C.trocarSetor?.(b.dataset.docsSetor); C.irEnviar?.(); }));
  }

  Object.assign(C, { pedidosDoSetor, renderDocsMes, renderHojeSetor });
}
