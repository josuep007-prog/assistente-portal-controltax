/* Plataforma — Solicitações: cartões, situações, lista, tabela e detalhe.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';
import * as D from '../dados.js';
import { anelProgresso, cor } from '../graficos.js';

export function montarSolicitacoes(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { ICONE_MOT, MOT, P, dialogo, familiaTipo, fmt, gravarPref, icTipo, itensVisiveis, lerPref, ligarIr, ligarSeletorEmpresa, loading, nomeTipo, pedirCalculoDoAviso, pedirDeNovo, plural, prepararResposta, quando, rotEmpresa, seletorEmpresa, variasEmpresas } = C;   // definidos em partes que montam antes
  const abrirDetalhe = (...a) => C.abrirDetalhe(...a);   // o detalhe vive em detalhe.js, que monta depois (chamado só em tempo de uso)
  /* =================== SOLICITAÇÕES =================== */
  /* No formato das Solicitações do Control Onvio: cartões por tipo (ícone na cor da família, número grande e uma
     linha), situações que filtram e as solicitações em cartões agrupados pela situação (ou em lista). A tabela com
     todas, inclusive as encerradas há mais tempo, fica no terceiro modo. Tipo e situação filtram juntos. */
  const POR_GRUPO = 6;
  function pillSol(i) {
    const c = { aguardando: 'late', andamento: 'soon', concluida: 'ok', cancelada: 'muted', prescrita: 'muted' }[i.estado] || 'soon';
    return `<span class="pill pill-${c}">${esc(i.status || S.rules.config?.statusSolicitacao?.rotulos?.[i.estado] || i.estado)}</span>`;
  }
  function renderSolicitacoes() {
    const sol = S.plat.sol, F = S.plat.filtroSol, R = S.rules, hoje = E.today();
    if (!F.vis) F.vis = lerPref('solVis', 'cartoes');
    if (!sol) { viewEl.innerHTML = loading('Consultando suas solicitações no portal…'); P.carregarSolicitacoes(); return; }
    const vis = itensVisiveis(), comEmpresa = variasEmpresas(vis);
    const prio = E.prioridadesCliente(vis, hoje, R);
    const motivoDe = new Map(prio.map(p => [p.item, p.motivo]));
    let mostrados = [];
    const busca = (i) => { const q = E.norm(F.q); return !q || E.norm(`${i.numero} ${i.empregado} ${i.assunto} ${nomeTipo(i.tipo)} ${i.responsavel} ${i.status} ${i.empresa}`).includes(q); };
    viewEl.innerHTML = `
      <div class="dp-toolbar">
        <input type="search" id="sol-q" placeholder="Buscar por número, funcionário ou assunto…" value="${esc(F.q)}" autocomplete="off">
        ${seletorEmpresa()}
        <div class="seg" role="group" aria-label="Como mostrar">${[['cartoes', 'grid', 'Cartões'], ['lista', 'list', 'Lista'], ['tabela', 'sheet', 'Tabela']].map(([k, ic, r]) => `<button type="button" data-vis-sol="${k}" aria-pressed="${F.vis === k}" title="${k === 'tabela' ? 'Todas as solicitações, inclusive as encerradas há mais tempo' : r}">${icon(ic, 'ic-sm')} ${r}</button>`).join('')}</div>
        <span class="dp-count" id="sol-n"></span>
        <button type="button" class="btn btn-sm" id="sol-ref">${icon('refresh', 'ic-sm')} Atualizar</button>
        <button type="button" class="btn btn-sm btn-primary" data-ir="preencher">${icon('plus', 'ic-sm')} Novo pedido</button>
      </div>

      ${sol.calibrar.length ? `<div class="note">${icon('info')}<div><b>${esc(sol.calibrar.map(nomeTipo).join(', '))}:</b> ${esc(R.mensagens?.plataformaCalibrar || '')} <button class="btn btn-ghost btn-sm" id="sol-geral">${icon('external', 'ic-sm')} Abrir no portal</button></div></div>` : ''}

      <div class="tipos" id="sol-tipos" role="group" aria-label="Tipo de solicitação"></div>
      <div class="hj-sits" id="sol-sits" role="group" aria-label="Filtrar por situação"></div>
      <div id="sol-grupos"></div>
      ${sol.truncado ? `<p class="muted" style="font-size:11.5px">Mostrando as mais recentes de cada tipo. As mais antigas continuam no portal.</p>` : ''}`;

    // cartões dos tipos: quantas em aberto em cada tipo (com a busca e a situação aplicadas) e quantas esperam você
    // (na Tabela, contam tudo o que a tabela mostra, inclusive as encerradas; nos outros modos, só as em aberto)
    const tiposHtml = () => {
      const tab = F.vis === 'tabela';
      const l = tab ? vis.filter(i => (!F.motivo || motivoDe.get(i) === F.motivo) && busca(i))
        : prio.filter(p => p.motivo !== 'concluida' && (!F.motivo || p.motivo === F.motivo) && busca(p.item)).map(p => p.item);
      const cartao = (k, rot, xs) => {
        const suas = xs.filter(i => i.estado === 'aguardando').length, abertas = xs.filter(i => ['aguardando', 'andamento'].includes(i.estado)).length;
        const sub = suas ? `<em>${suas} ${suas === 1 ? 'espera' : 'esperam'} você</em>` : abertas ? (tab ? `${abertas} em aberto` : 'com o escritório') : xs.length ? 'todas encerradas' : tab ? 'nenhuma' : 'nenhuma em aberto';
        return `<button type="button" class="tipo-c ${k ? `fam-${familiaTipo(k)}` : 'fam-todos'}${F.tipo === k ? ' on' : ''}${!xs.length ? ' zero' : ''}" data-tipo-sol="${esc(k)}" aria-pressed="${F.tipo === k}">
          <span class="tipo-topo">${k ? icTipo(k) : `<span class="tp-ic fam-todos">${icon('list', 'ic-sm')}</span>`}<span class="tipo-rot">${esc(rot)}</span></span>
          <b>${xs.length}</b><span class="tipo-sub">${sub}</span></button>`;
      };
      return cartao('', 'Todos os tipos', l) + Object.keys(R.tipos).map(k => cartao(k, nomeTipo(k), l.filter(i => i.tipo === k))).join('');
    };
    const sitsHtml = () => {
      const l = prio.filter(p => (!F.tipo || p.item.tipo === F.tipo) && busca(p.item));
      return E.MOTIVOS_CLIENTE.map((m, n) => { const c = l.filter(p => p.motivo === m.k).length;
        return `<button type="button" class="hj-sit${F.motivo === m.k ? ' on' : ''}${!c ? ' zero' : ''}" style="--i:${n + 1};--c:${cor(m.cor)}" data-sit="${m.k}" aria-pressed="${F.motivo === m.k}"><i class="hj-sit-dot"></i><span class="hj-sit-l">${esc(m.rot)}</span><b data-conta="${c}">${c}</b></button>`; }).join('');
    };
    const cartao = (p, n) => {
      const i = p.item, mo = p.motivo, c = cor(MOT[mo].cor);
      const pg = E.progressoCliente(i, R);
      mostrados.push(i);
      const anelC = mo === 'concluida' ? anelProgresso(100, icon('check')) : anelProgresso(pg.pct, `<b>${pg.dias}</b><small>${pg.dias === 1 ? 'dia' : 'dias'}</small>`);
      const lim = mo === 'concluida' ? `concluída em ${fmt(i.atualizado)}` : i.estado === 'aguardando' ? (i.prescreveEm != null ? `parada ${pg.dias} de ${pg.limite} d · prescrição` : `parada há ${plural(pg.dias, 'dia', 'dias')}`) : `parada ${pg.dias} d · o escritório costuma levar ${pg.limite} d úteis`;
      const terceira = i.estado === 'aguardando' && i.prescreveEm != null ? ['Prescreve em', plural(i.prescreveEm, 'dia', 'dias')] : mo === 'atrasada' && i.expectativa ? ['Expectativa', fmt(i.expectativa)] : ['Responsável', i.responsavel || '—'];
      return `<button type="button" class="hj-card" style="--i:${n};--c:${c}" data-card="${mostrados.length - 1}" aria-label="${esc(`${i.numero ? `nº ${i.numero} ` : ''}${i.assunto || nomeTipo(i.tipo)}`)}">
        <header><span class="hj-chip">${icon(ICONE_MOT[mo], 'ic-sm')} ${esc(MOT[mo].rot)}</span><span class="spacer"></span>${comEmpresa ? `<span class="hj-emp" title="${esc(i.empresa)}">${esc(rotEmpresa(i))}</span>` : ''}<span class="mono hj-num">${i.numero ? `nº ${esc(i.numero)}` : ''}</span></header>
        <div class="hj-card-id">${anelC}<div><h4 title="${esc(i.assunto || '')}">${esc(i.assunto || nomeTipo(i.tipo))}</h4><div class="hj-sub">${icTipo(i.tipo)}${esc([nomeTipo(i.tipo), i.empregado].filter(Boolean).join(' · '))}</div><div class="hj-lim">${esc(lim)}</div></div></div>
        ${i.veredito?.pede && i.veredito.frase && i.estado === 'aguardando' ? `<div class="hj-pedido" title="${esc(i.veredito.frase)}">${icon('chat', 'ic-sm')}<span>O escritório pediu: “${esc(i.veredito.frase)}”</span></div>` : ''}
        <dl class="hj-stats"><div><dt>Situação</dt><dd>${esc(i.status || '—')}</dd></div><div><dt>Vez</dt><dd>${i.lado === 'cli' ? 'Sua' : i.lado === 'esc' ? 'Escritório' : '—'}</dd></div><div><dt>${terceira[0]}</dt><dd>${esc(terceira[1])}</dd></div></dl>
        <span class="hj-cta">${icon(mo === 'concluida' ? 'check' : 'right', 'ic-sm')}<span>${esc(E.acaoCliente(i, mo))}</span></span>
      </button>`;
    };
    const linha = (p) => {
      const i = p.item, mo = p.motivo;
      mostrados.push(i);
      const tag = mo === 'prescreve' && i.prescreveEm != null ? `Prescreve em ${i.prescreveEm} d` : MOT[mo].rot;
      return `<button type="button" class="prio m-${mo}" data-card="${mostrados.length - 1}"><span class="pr-tag">${esc(tag)}</span><span class="mono pr-num">${esc(i.numero || '—')}</span>
        <span class="pr-tx"><b>${icTipo(i.tipo)}${esc(i.assunto || nomeTipo(i.tipo))}</b><small>${esc([comEmpresa && rotEmpresa(i), nomeTipo(i.tipo), i.empregado].filter(Boolean).join(' · '))}</small></span>
        <span class="pr-resp">${esc(i.responsavel || '—')}</span><span class="mono pr-d">${i.parado ?? 0}d</span></button>`;
    };
    const tabela = () => {
      const l = vis.filter(i => (!F.tipo || i.tipo === F.tipo) && (!F.motivo || motivoDe.get(i) === F.motivo) && busca(i));
      $('#sol-n').textContent = `${l.length} de ${vis.length}`;
      mostrados = l.slice(0, 300);
      return `<div class="list-card"><div class="dp-listhead sol-cols"><span>Nº</span><span>Solicitação</span><span>Funcionário</span><span>Assunto</span><span>Situação</span><span>Atualizada</span></div><div id="sol-list">${mostrados.map((i, n) => `<button type="button" class="dp-row sol-cols" data-card="${n}">
          <span class="mono">${esc(i.numero || '—')}</span><span><span class="ell">${icTipo(i.tipo)}${esc(nomeTipo(i.tipo))}</span>${comEmpresa ? `<span class="sub ell">${esc(rotEmpresa(i))}</span>` : ''}</span><span class="ell">${esc(i.empregado || '—')}</span>
          <span><span class="ell">${esc(i.assunto || '—')}</span>${i.tramite ? `<span class="sub ell">${esc(i.tramite)}</span>` : ''}</span><span>${pillSol(i)}${i.prescreveEm != null ? `<span class="sub">prescreve em ${i.prescreveEm} d</span>` : i.responsavel && i.estado === 'andamento' ? `<span class="sub ell">${esc(i.responsavel)}</span>` : ''}</span><span class="mono">${fmt(i.atualizado)}</span></button>`).join('')
        || `<div class="list-vazio">${esc(R.mensagens?.plataformaVazioSolicitacoes || 'Nada por aqui.')}</div>`}</div></div>`;
    };
    const grupos = () => {
      mostrados = [];
      if (sol.semAcesso) return '';
      if (F.vis === 'tabela') return tabela();
      const l = prio.filter(p => (!F.tipo || p.item.tipo === F.tipo) && busca(p.item));
      const gs = E.MOTIVOS_CLIENTE.filter(m => F.motivo ? m.k === F.motivo : m.k !== 'concluida').map(m => ({ m, itens: l.filter(p => p.motivo === m.k) })).filter(g => g.itens.length);
      $('#sol-n').textContent = `${gs.reduce((a, g) => a + g.itens.length, 0)} de ${vis.length}`;
      if (!gs.length) return `<div class="hj-zen big">${icon(F.q || F.motivo || F.tipo ? 'search' : 'check')}<span>${F.q || F.motivo || F.tipo ? 'Nada com esse filtro.' : l.length ? 'Nenhuma solicitação em aberto. As concluídas estão em “Concluídas (30 dias)”, acima.' : esc(R.mensagens?.plataformaVazioSolicitacoes || 'Nenhuma solicitação por aqui.')}</span></div>`;
      let n = 1;
      return gs.map(({ m, itens }) => {
        const mostra = F.motivo ? itens : itens.slice(0, F.vis === 'lista' ? POR_GRUPO * 2 : POR_GRUPO);
        const corpo = F.vis === 'lista' ? `<div class="list-card hj-lista">${mostra.map(linha).join('')}</div>` : `<div class="hj-grade">${mostra.map(p => cartao(p, n++)).join('')}</div>`;
        return `<section class="hj-sec" style="--c:${cor(m.cor)}" data-grupo="${m.k}"><h3>${icon(ICONE_MOT[m.k], 'ic-sm')} ${esc(m.rot)} <span>${itens.length}</span>${itens.length > mostra.length ? `<button type="button" class="hj-sec-mais" data-mais="${m.k}">Ver todas as ${itens.length} ${icon('right', 'ic-sm')}</button>` : ''}</h3>${corpo}</section>`;
      }).join('');
    };
    // redesenha só o que depende dos filtros (a busca não perde o foco)
    const desenhar = () => {
      $('#sol-tipos').innerHTML = tiposHtml(); $('#sol-sits').innerHTML = sitsHtml(); $('#sol-grupos').innerHTML = grupos();
      $('#sol-tipos').hidden = $('#sol-sits').hidden = !!sol.semAcesso;
      S.plat.listaSol = mostrados;   // o que está na tela, na ordem: o detalhe navega por ela (‹ ›) e o foco que pisca a encontra
      // filtro ativo nunca fica escondido: um botão para tirar todos de uma vez
      if (F.tipo || F.motivo || F.q) $('#sol-sits').insertAdjacentHTML('beforeend', `<button type="button" class="hj-sit sol-limpar" data-limpar-sol title="Mostrar todas as solicitações">${icon('x', 'ic-sm')}<span class="hj-sit-l">Limpar filtros</span></button>`);
      $('#sol-sits').querySelector('[data-limpar-sol]')?.addEventListener('click', () => { F.tipo = ''; F.motivo = null; F.q = ''; const q = $('#sol-q'); if (q) q.value = ''; desenhar(); });
      viewEl.querySelectorAll('[data-tipo-sol]').forEach(b => b.addEventListener('click', () => { F.tipo = F.tipo === b.dataset.tipoSol ? '' : b.dataset.tipoSol; desenhar(); }));
      viewEl.querySelectorAll('[data-sit]').forEach(b => b.addEventListener('click', () => { F.motivo = F.motivo === b.dataset.sit ? null : b.dataset.sit; desenhar(); }));
      $('#sol-grupos').querySelectorAll('[data-card]').forEach(b => b.addEventListener('click', () => abrirDetalhe(mostrados[+b.dataset.card])));
      $('#sol-grupos').querySelectorAll('[data-mais]').forEach(b => b.addEventListener('click', () => { F.motivo = b.dataset.mais; desenhar(); viewEl.scrollTop = 0; }));
    };
    desenhar();
    viewEl.querySelectorAll('[data-vis-sol]').forEach(b => b.addEventListener('click', () => { F.vis = b.dataset.visSol; gravarPref('solVis', F.vis); renderSolicitacoes(); }));
    $('#sol-q').addEventListener('input', A.debounce((e) => { F.q = e.target.value; desenhar(); }, 200));
    ligarSeletorEmpresa(viewEl);
    $('#sol-ref').addEventListener('click', () => { S.plat.sol = null; renderSolicitacoes(); P.carregarSolicitacoes(true); });
    $('#sol-tentar')?.addEventListener('click', () => { S.plat.sol = null; renderSolicitacoes(); P.carregarSolicitacoes(true); });
    $('#sol-portal')?.addEventListener('click', () => send({ type: 'verPortal' }));
    $('#sol-geral')?.addEventListener('click', () => request({ type: 'abrirNoPortal', slug: R.tipos[sol.calibrar[0]]?.slug }));
    ligarIr(viewEl);
  }

  Object.assign(C, { pillSol, renderSolicitacoes });
}
