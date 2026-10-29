/* Plataforma — Solicitações: cartões, situações, lista, tabela e detalhe.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';
import * as D from '../dados.js';
import { anelProgresso, cor } from '../graficos.js';

export function montarSolicitacoes(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { ICONE_MOT, MOT, P, dialogo, familiaTipo, fmt, gravarPref, icTipo, itensVisiveis, lerPref, ligarIr, ligarSeletorEmpresa, loading, nomeTipo, pedirCalculoDoAviso, pedirDeNovo, plural, prepararResposta, quando, rotEmpresa, seletorEmpresa, variasEmpresas } = C;   // definidos em partes que montam antes
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
  /* Detalhe (2.4, como o do Control Onvio): Conversa (trâmites em bolhas: você à direita, o escritório à esquerda,
     o tempo entre um e outro e o fim à vista), Dados (a solicitação completa, em português) e O que observar
     (prazos e cuidados do que você pediu). Tudo lido na hora com o acesso do portal e nunca guardado. */
  const iniciais = (n) => String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  function abrirDetalhe(i, { aba = 'conversa' } = {}) {
    if (!i) return;
    const t = S.rules.tipos[i.tipo];
    const mo = E.motivoCliente(i, E.today(), S.rules);
    const st = { aba, trs: null, trsErro: false, dados: null, dadosErro: false, bruto: null, datas: { ...(i.datas || {}) } };
    // resposta ao vivo (2.12, regras: config.respostaPortal.livre): só em solicitação que aguarda o cliente; o texto fica só na memória
    const livre = S.rules.config?.respostaPortal?.livre || {};
    const podeResponder = !!(t && i.numero && i.aguardando && livre.ativo !== false);
    const resp = { texto: '', arquivos: [], aberta: false, escrito: '', fila: null, esperando: null, confirmando: false, enviando: false, estado: ['', ''] };
    const bloqueios = (livre.bloquear || []).map(x => { try { return new RegExp(x, 'i'); } catch { return null; } }).filter(Boolean);
    const bloqueada = () => bloqueios.some(r => r.test(resp.texto));
    const topo = [['Responsável no escritório', i.responsavel], ['Aberta em', fmt(i.criado)], ['Atualizada', fmt(i.atualizado)], ['Expectativa', i.expectativa ? fmt(i.expectativa) : ''],
      ['Prescreve em', i.prescreveEm != null ? `${i.prescreveEm} dia(s)` : ''], ['Empresa', variasEmpresas(S.plat.sol?.itens) ? i.empresa : '']].filter(([, v]) => v && v !== '—');
    const dlg = dialogo({
      titulo: `${esc(nomeTipo(i.tipo))}${i.numero ? ` <span class="mono" style="font-size:13px;color:var(--ink-3)">nº ${esc(i.numero)}</span>` : ''}`, largo: true,
      corpo: `<div class="dt-top"><div class="dt-assunto"><b>${esc(i.assunto || nomeTipo(i.tipo))}</b>${i.empregado && !E.norm(i.assunto).includes(E.norm(i.empregado)) ? `<small>${esc(i.empregado)}</small>` : ''}</div>${pillSol(i)}</div>
        ${mo ? `<p class="dt-porque">${esc(E.porqueMotivo(i, mo, S.rules))}</p>` : ''}
        <div class="dt-meta">${topo.map(([k, v]) => `<span><small>${esc(k)}</small><b>${esc(v)}</b></span>`).join('')}</div>
        <div class="dt-dq" id="dt-dq"></div>
        <div class="dp-tabs dt-tabs" role="tablist">${[['conversa', 'Conversa'], ['dados', 'Dados'], ['observar', 'O que observar']].map(([k, r]) => `<button type="button" role="tab" class="dp-tab" data-dt="${k}">${r}</button>`).join('')}</div>
        <div class="dt-body" id="dt-body"></div>
        <div class="dt-resp" id="dt-resp" hidden></div>`,
      aoFechar: () => { if (resp.escrito) request({ type: 'respostaLimpar' }, 5000); },
      acoes: [...(['avisoFerias', 'avisoRescisao'].includes(i.tipo) && !['cancelada', 'prescrita'].includes(i.estado) ? [{ rotulo: `${icon('calc', 'ic-sm')} Pedir o cálculo`, cls: 'dt-pedir-calc', fn: () => { pedirCalculoDoAviso(i, st.datas); } }] : []),
        ...(t ? [{ rotulo: `${icon('refresh', 'ic-sm')} Pedir de novo`, cls: 'dt-pedir-novo', fn: () => { pedirDeNovo(i, st.bruto); } }] : []),
        ...(t && i.aguardando && (S.rules.config?.respostaPortal?.textos || []).length ? [{ rotulo: `${icon('chat', 'ic-sm')} Preparar resposta`, cls: 'dt-responder', fn: () => { setTimeout(() => prepararResposta(i), 0); } }] : []),
        { rotulo: `${icon('external', 'ic-sm')} ${i.aguardando ? 'Responder no portal' : 'Ver no portal'}`, cls: 'btn-primary', fn: () => request({ type: 'abrirNoPortal', slug: t?.slug, numero: i.numero }, 30000) },
        { rotulo: `${icon('copy', 'ic-sm')} Copiar observações`, cls: 'btn-ghost dt-copiar', fn: async () => { const o = E.observacoesCliente(i, st.datas, S.rules); try { await navigator.clipboard.writeText(o.map(x => `• ${x.texto}`).join('\n')); toast('Observações copiadas.'); } catch { toast('Não consegui copiar.'); } return false; } },
        '|', { rotulo: 'Fechar' }]
    });
    const el = dlg.el, body = el.querySelector('#dt-body');
    const carregando = (txt) => `<div class="pn-vazio"><div class="spin"></div>${esc(txt)}</div>`;
    const conversa = () => {
      if (st.trsErro) return `${i.tramite ? `<div class="note">${icon('chat')}<div><b>Último trâmite</b><br>${esc(i.tramite)}</div></div>` : ''}<div class="note">${icon('info')}<div>Não consegui ler os trâmites agora. Use “${i.aguardando ? 'Responder' : 'Ver'} no portal” para ver a conversa completa.</div></div>`;
      if (!st.trs) return carregando('Lendo a conversa no portal…');
      if (!st.trs.length) return `<div class="pn-vazio">${icon('chat', 'ic-sm')} Nenhum trâmite ainda: o escritório ainda não respondeu.</div>`;
      const v = i.veredito;
      const faixa = !v ? '' : v.anexoSemArquivo ? `<div class="aviso-linha late">${icon('alert')}<span>Você falou em anexo (“${esc(v.trecho)}”), mas nenhum arquivo chegou. Anexe de novo no portal.</span></div>`
        : v.ultimoLado === 'esc' && v.pede ? `<div class="aviso-linha late">${icon('chat')}<span><b>O escritório está pedindo:</b> “${esc(v.frase)}”</span></div>`
        : v.ultimoLado === 'esc' && i.aguardando ? `<div class="aviso-linha ok">${icon('check')}<span>O escritório respondeu e não pediu nada. Confira a resposta e conclua no portal.</span></div>` : '';
      const ult = st.trs[st.trs.length - 1];
      let ant = null;
      return faixa + `<div class="tr-lista">${st.trs.map(x => {
        let gap = '';
        if (ant) { const d = Math.abs(E.diffDays(E.parseDate(ant.em) || new Date(ant.em), E.parseDate(x.em) || new Date(x.em))); if (d >= 1) gap = `<div class="tr-gap"><span>${d} ${d === 1 ? 'dia' : 'dias'} depois</span></div>`; }
        ant = x;
        const voce = x.lado === 'cli', quem = x.autor || (voce ? 'Você' : 'Escritório');
        return `${gap}<div class="tr-item ${voce ? 'cli' : 'esc'}${x === ult ? ' ultimo' : ''}"><span class="tr-av" title="${esc(quem)}">${esc(iniciais(quem) || (voce ? 'V' : 'E'))}</span>
          <div class="tr-bolha"><div class="tr-meta"><b>${esc(quem)}</b><span class="tr-lado">${x.n === 1 ? 'abertura' : voce ? 'você' : 'escritório'}</span>${x.situacao ? `<span class="pill">${esc(x.situacao)}</span>` : ''}${x === ult ? '<span class="pill pill-soon">último</span>' : ''}<span class="tr-quando" title="${esc(fmtDataHora(x.em))}">${esc(fmtDataHora(x.em))}</span></div>
          ${x.texto ? `<div class="tr-texto">${esc(textoPuro(x.texto))}</div><button type="button" class="tr-mais">Ver tudo</button>` : `<div class="tr-texto muted">Sem texto${x.anexos.length ? ' (só anexo)' : ''}</div>`}
          ${x.anexos.length ? `<div class="tr-anexos">${x.anexos.map(a => `<span class="tr-arq">${icon('clip', 'ic-sm')}<span>${esc(a)}</span></span>`).join('')}</div>` : ''}</div></div>`;
      }).join('')}</div>`;
    };
    const dados = () => {
      if (st.dadosErro) return `<div class="note">${icon('info')}<div>Não consegui ler a solicitação completa agora. Use “Ver no portal”.</div></div>`;
      if (!st.dados) return carregando('Lendo a solicitação completa no portal…');
      if (!st.dados.grupos.length) return `<div class="pn-vazio">Sem dados para mostrar.</div>`;
      return st.dados.grupos.map(g => `<section class="dt-grupo"><h4>${esc(g.titulo)}</h4><div class="dt-campos">${g.campos.map(c => `<div class="dt-campo${c.destaque ? ' dq' : ''}${c.longo ? ' longo' : ''}"><small>${esc(c.k)}</small><span>${esc(c.v)}</span></div>`).join('')}</div></section>`).join('')
        + (st.dados.anexos.length ? `<section class="dt-grupo"><h4>Anexos da abertura</h4><div class="tr-anexos">${st.dados.anexos.map(a => `<span class="tr-arq">${icon('clip', 'ic-sm')}<span>${esc(a)}</span></span>`).join('')}</div></section>` : '');
    };
    const observar = () => {
      const o = E.observacoesCliente(i, st.datas, S.rules);
      if (!o.length) return st.dados || st.dadosErro ? `<div class="pn-vazio">${icon('check', 'ic-sm')} Nada especial a observar neste pedido.</div>` : carregando('Lendo as datas do pedido…');
      return `<ul class="dt-obs">${o.map(x => `<li class="${x.alerta ? 'alerta' : ''}">${icon(x.alerta ? 'alert' : 'info', 'ic-sm')}<span>${esc(x.texto)}</span></li>`).join('')}</ul>`;
    };
    const desenhar = () => {
      if (!el.isConnected) return;
      el.querySelectorAll('[data-dt]').forEach(b => { const on = b.dataset.dt === st.aba; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
      body.innerHTML = { conversa, dados, observar }[st.aba]();
      el.querySelector('#dt-resp').hidden = !(podeResponder && st.aba === 'conversa');
      const dq = st.dados?.grupos.flatMap(g => g.campos).filter(c => c.destaque && !c.longo && c.k !== 'Assunto').slice(0, 6) || [];
      el.querySelector('#dt-dq').innerHTML = dq.map(c => `<span class="dq"><small>${esc(c.k)}</small><b>${esc(c.v)}</b></span>`).join('');
      el.querySelector('.dt-copiar').hidden = !E.observacoesCliente(i, st.datas, S.rules).length;
      body.querySelectorAll('.tr-mais').forEach(b => b.addEventListener('click', () => { const c = b.closest('.tr-bolha'); const ab = c.classList.toggle('aberto'); b.textContent = ab ? 'Ver menos' : 'Ver tudo'; }));
      requestAnimationFrame(() => {
        body.querySelectorAll('.tr-texto').forEach(x => { if (x.scrollHeight > x.clientHeight + 4) x.closest('.tr-bolha')?.classList.add('longo'); });
        if (st.aba === 'conversa') body.scrollTop = body.scrollHeight;   // a conversa abre no fim (o mais recente)
      });
    };
    el.querySelectorAll('[data-dt]').forEach(b => b.addEventListener('click', () => { st.aba = b.dataset.dt; desenhar(); }));
    desenhar();
    /* A caixa de resposta: o texto vai ao portal por baixo enquanto o cliente escreve (a caixa do portal só recebe o que o
       Assistente pôs; se o cliente escreveu algo direto lá, não mexo). Enviar = dois passos: o resumo e o "Confirmar e enviar". */
    const rl = el.querySelector('#dt-resp');
    const rlEstado = (cls, txt) => { resp.estado = [cls, txt]; const c = rl.querySelector('#rl-st'); if (c) { c.className = `chip ${cls}`; c.textContent = txt; c.hidden = !txt; } };
    const rlBotoes = () => {
      const vazio = !resp.texto.trim(), bloq = bloqueada();
      rl.querySelector('#rl-bloq').hidden = !bloq;
      const b = rl.querySelector('#rl-enviar'); b.disabled = vazio || bloq || resp.enviando;
      rl.querySelector('#rl-resumo').hidden = !resp.confirmando;
      rl.querySelector('#rl-acoes').hidden = resp.confirmando;
      if (resp.confirmando) {
        rl.querySelector('#rl-resumo-t').textContent = resp.texto.trim().length > 220 ? `${resp.texto.trim().slice(0, 220)}…` : resp.texto.trim();
        rl.querySelector('#rl-resumo-a').textContent = resp.arquivos.length ? `${resp.arquivos.length} arquivo(s): ${resp.arquivos.map(a => a.name).join(', ')}` : 'Sem arquivos.';
      }
    };
    const rlArquivos = () => {
      rl.querySelector('#rl-arqs').innerHTML = resp.arquivos.map((a, n) => `<span class="tr-arq">${icon('clip', 'ic-sm')}<span>${esc(a.name)}</span><button type="button" class="icon-btn" data-rl-x="${n}" aria-label="Tirar ${esc(a.name)}">${icon('x', 'ic-sm')}</button></span>`).join('');
      rl.querySelectorAll('[data-rl-x]').forEach(b => b.addEventListener('click', () => { resp.arquivos.splice(+b.dataset.rlX, 1); rlArquivos(); rlBotoes(); }));
    };
    /** Põe no portal o texto de agora (uma escrita por vez, na ordem; abre a solicitação na primeira). */
    const escreverUma = async () => {
      const texto = resp.texto;
      if (bloqueada()) return { ok: false, bloqueada: true };
      if (!resp.aberta) {
        if (!texto.trim()) return { ok: true };
        rlEstado('info', 'abrindo a resposta no portal…');
        const r = await request({ type: 'respostaAbrir', slug: t.slug, numero: i.numero }, 30000);
        if (!r?.ok) { rlEstado('err', 'não consegui abrir a resposta no portal'); return { ok: false, motivo: r?.motivo || 'sem resposta do portal' }; }
        resp.aberta = true;
        if (r.portalTem) { rlEstado('warn', 'o portal já tem texto na resposta — não mexi'); return { ok: false, portalTem: true }; }
      }
      if (resp.escrito === texto) return { ok: true };
      const r = await request({ type: 'respostaTexto', texto }, 10000);
      if (r?.ok) { resp.escrito = texto; rlEstado(texto.trim() ? 'ok' : '', texto.trim() ? 'no portal' : ''); }
      else if (r?.portalTem) rlEstado('warn', 'você escreveu direto no portal — não mexi no texto de lá');
      else { rlEstado('err', 'não consegui escrever no portal'); if (/sumiu/.test(r?.motivo || '')) resp.aberta = false; }
      return r || { ok: false };
    };
    const rlFila = () => (resp.fila = (resp.fila || Promise.resolve()).then(escreverUma, escreverUma));
    const rlAoDigitar = () => {
      rlBotoes();
      clearTimeout(resp.esperando);
      if (bloqueada()) { rlEstado('warn', 'não vai ao portal'); return; }
      rlEstado('info', 'a enviar ao portal…');
      resp.esperando = setTimeout(rlFila, Math.max(150, livre.esperaMs || 600));
    };
    const rlEnviar = async () => {
      clearTimeout(resp.esperando); resp.enviando = true; rlBotoes();
      rl.querySelector('#rl-confirmar').disabled = true;
      try {
        const g = await rlFila();
        if (!g?.ok) { rlEstado('err', 'não deu para escrever a resposta no portal'); toast(`Não enviei: ${g?.portalTem ? 'há texto escrito direto no portal; limpe-o ou use “Responder no portal”' : (g?.motivo || 'o portal não respondeu')}.`); return; }
        if (resp.arquivos.length) {
          const packed = await A.packFiles(resp.arquivos);
          const a = await request({ type: 'respostaArquivos', files: packed }, 45000, packed.map(p => p.buf));
          if (!a?.ok || a.recusados?.length) { toast(`O portal não aceitou ${a?.recusados?.length ? a.recusados.join(', ') : 'os arquivos'}. Tire-os e tente de novo, ou responda direto no portal.`); return; }
        }
        const r = await request({ type: 'respostaEnviar', texto: resp.texto }, 20000);
        if (!r?.ok) { rlEstado('err', 'o portal não confirmou o envio'); toast(`Não consegui enviar a resposta (${r?.motivo || 'sem resposta do portal'}). Confira no portal.`, 8000); return; }
        resp.texto = ''; resp.escrito = ''; resp.aberta = false; resp.arquivos = [];
        rl.querySelector('#rl-texto').value = ''; rlArquivos(); rlEstado('ok', 'enviada');
        toast('Resposta enviada ao escritório.');
        carregarTramites();
        P.carregarSolicitacoes(true, { silencioso: true });
      } finally { resp.enviando = false; resp.confirmando = false; rl.querySelector('#rl-confirmar').disabled = false; rlBotoes(); }
    };
    if (podeResponder) {
      rl.innerHTML = `<div class="rl-head">${icon('chat')}<b>Responder ao escritório</b><span class="chip" id="rl-st" hidden></span></div>
        <textarea id="rl-texto" rows="3" maxlength="${+livre.maximo || 2000}" aria-label="Sua resposta" placeholder="Escreva sua resposta. Ela aparece no portal enquanto você escreve, mas só é enviada quando você confirmar."></textarea>
        <div class="rl-bloq note" id="rl-bloq" hidden>${icon('alert')}<div>${esc(livre.mensagemBloqueio || 'Há um trecho que não pode ir na mensagem. Tire-o para enviar.')}</div></div>
        <div class="tr-anexos" id="rl-arqs"></div>
        <div class="rl-acoes" id="rl-acoes"><button type="button" class="btn btn-ghost" id="rl-anexar">${icon('clip', 'ic-sm')} Anexar arquivo</button><input type="file" id="rl-file" multiple hidden><span class="sp"></span><button type="button" class="btn rl-prim" id="rl-enviar" disabled>Enviar resposta</button></div>
        <div class="rl-resumo note" id="rl-resumo" hidden>${icon('arrow')}<div><b>Vou enviar ao escritório, pelo portal:</b><div class="rl-t" id="rl-resumo-t"></div><small id="rl-resumo-a"></small><div class="rl-acoes"><button type="button" class="btn btn-ghost" id="rl-voltar">Voltar</button><span class="sp"></span><button type="button" class="btn rl-prim" id="rl-confirmar">Confirmar e enviar</button></div></div></div>`;
      const ta = rl.querySelector('#rl-texto'), fi = rl.querySelector('#rl-file');
      ta.addEventListener('input', () => { resp.texto = ta.value; rlAoDigitar(); });
      rl.querySelector('#rl-anexar').addEventListener('click', () => fi.click());
      fi.addEventListener('change', () => { for (const f of fi.files) if (!resp.arquivos.some(a => a.name === f.name && a.size === f.size)) resp.arquivos.push(f); fi.value = ''; rlArquivos(); rlBotoes(); });
      rl.querySelector('#rl-enviar').addEventListener('click', () => { resp.confirmando = true; rlBotoes(); });
      rl.querySelector('#rl-voltar').addEventListener('click', () => { resp.confirmando = false; rlBotoes(); });
      rl.querySelector('#rl-confirmar').addEventListener('click', rlEnviar);
      rlBotoes();
    }
    const carregarTramites = () => {
      if (t?.apiTramites && i.id) return request({ type: 'tramites', base: t.apiTramites, solicitacao: i.id }, 20000).then((r) => {
        if (!r || r.erro) st.trsErro = true;
        else { st.trsErro = false; st.trs = E.tramitesDe(r.itens, i.tipo, S.rules); i.veredito = E.vereditoConversa(st.trs, S.rules) || i.veredito; }
        desenhar();
      });
      st.trs = []; desenhar();
    };
    carregarTramites();
    const lista = t?.apiDetalhe || t?.apiLista;
    if (lista && i.id) request({ type: 'detalheCompleto', lista, solicitacao: i.id }, 20000).then((r) => {
      if (!r?.dados) st.dadosErro = true;
      else {
        st.bruto = r.dados;   // só na memória, enquanto o detalhe está aberto (para o "Pedir de novo")
        st.dados = D.camposDetalhe(r.dados);
        const d = E.datasDoAviso(r.dados);
        for (const [k, v] of Object.entries(d)) if (v != null) st.datas[k] = v;
      }
      desenhar();
    }); else { st.dadosErro = true; desenhar(); }
  }
  const fmtDataHora = (s) => { const d = new Date(s); return isNaN(d) ? String(s || '') : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };
  /** HTML do trâmite → texto (o portal guarda a conversa em HTML). Nada é executado: o DOMParser não roda scripts. */
  function textoPuro(html) {
    if (!html) return '';
    if (!/[<&]/.test(html)) return html;
    const doc = new DOMParser().parseFromString(`<div>${String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')}</div>`, 'text/html');
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  Object.assign(C, { abrirDetalhe, iniciais, pillSol, renderSolicitacoes });
}
