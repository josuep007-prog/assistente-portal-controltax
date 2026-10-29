/* Plataforma — Funcionários e ficha do funcionário.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';
import * as D from '../dados.js';
import { prepararSimulacao } from '../calcular.js';

export function montarFuncionarios(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { P, abrirDetalhe, acoesExperiencia, dialogo, fmt, icTipo, loading, nomeTipo, pillSol, programarFerias, quando } = C;   // definidos em partes que montam antes
  /* =================== FUNCIONÁRIOS =================== */
  const ACOES_EMP = [['avisoFerias', 'Férias', 'sun'], ['afastamento', 'Afastamento / atestado', 'medical'], ['avisoRescisao', 'Desligamento', 'door'], ['calculoFerias', 'Cálculo de férias', 'calc'], ['calculoRescisao', 'Cálculo de rescisão', 'calc']];
  function renderFuncionarios() {
    const emp = S.plat.emp; const F = S.plat.filtroEmp;
    if (!emp) { viewEl.innerHTML = loading('Buscando a lista de funcionários no portal…'); P.carregarEmpregados().then(() => S.view === 'funcionarios' && renderFuncionarios()); return; }
    // veio vazia (o portal ainda não tinha pedido a lista quando a plataforma abriu): tenta de novo
    if (!emp.lista.length && Date.now() - emp.quando > 3000) { S.plat.emp = null; viewEl.innerHTML = loading('Buscando a lista de funcionários no portal…'); P.carregarEmpregados(true).then(() => S.view === 'funcionarios' && renderFuncionarios()); return; }
    const hoje = E.today();
    const todos = emp.lista.map(e => ({ e, s: E.situacaoEmpregado(e, hoje, S.rules) })).sort((a, b) => a.e.nome.localeCompare(b.e.nome));
    const ativos = todos.filter(x => x.e.ativo !== false);
    const emExp = ativos.filter(x => x.s.experiencia.some(k => k.falta >= 0)).length;
    const ferias = ativos.filter(x => x.s.ferias && x.s.ferias.falta <= 60).length;
    viewEl.innerHTML = `
      <div class="kpi-grid">
        <button type="button" class="kpi-card clickable" data-sit-k="ativos"><span class="kpi-label">Ativos</span><span class="kpi-value">${ativos.length}</span></button>
        <button type="button" class="kpi-card clickable ${emExp ? 'is-today' : ''}" data-sit-k="exp"><span class="kpi-label">Em experiência</span><span class="kpi-value">${emExp}</span><span class="kpi-sub">45 + 45 dias pela admissão</span></button>
        <button type="button" class="kpi-card clickable ${ferias ? 'is-late' : ''}" data-sit-k="ferias"><span class="kpi-label">Férias a conceder</span><span class="kpi-value">${ferias}</span><span class="kpi-sub">em até 60 dias (estimativa)</span></button>
      </div>
      <div class="dp-toolbar">
        <input type="search" id="emp-q" placeholder="Buscar funcionário…" value="${esc(F.q)}" autocomplete="off">
        <div class="seg" role="group" aria-label="Situação">${[['ativos', 'Ativos'], ['exp', 'Em experiência'], ['ferias', 'Férias'], ['desligados', 'Desligados'], ['todos', 'Todos']].map(([k, t]) => `<button type="button" data-sit="${k}" aria-pressed="${F.sit === k}">${t}</button>`).join('')}</div>
        <span class="dp-count" id="emp-n"></span>
        <button type="button" class="btn btn-sm" id="emp-ref">${icon('refresh', 'ic-sm')} Atualizar</button>
      </div>
      <div class="list-card"><div class="dp-listhead emp-cols"><span>Funcionário</span><span>Admissão</span><span>Tempo de casa</span><span>Próxima data</span><span></span></div><div id="emp-list" class="emp-rolagem"></div></div>
      <p class="muted" style="font-size:11.5px">A lista e as datas de admissão vêm do próprio portal. As férias são uma estimativa pela data de admissão: o portal não informa as férias já tiradas.</p>`;
    const desenhar = () => {
      const q = E.norm(F.q);
      const filtro = { ativos: (x) => x.e.ativo !== false, desligados: (x) => x.e.ativo === false, exp: (x) => x.e.ativo !== false && x.s.experiencia.some(k => k.falta >= 0), ferias: (x) => x.e.ativo !== false && x.s.ferias && x.s.ferias.falta <= 60, todos: () => true }[F.sit] || (() => true);
      const lista = todos.filter(x => filtro(x) && (!q || E.norm(x.e.nome).includes(q)));
      $('#emp-n').textContent = `${lista.length} funcionário(s)`;
      $('#emp-list').innerHTML = lista.map((x, n) => {
        const p = x.s.proxima;
        return `<div class="dp-row emp-cols hov emp-linha" data-ficha="${n}" tabindex="0" role="button" aria-label="Ver a ficha de ${esc(x.e.nome)}"><span><b class="ell">${esc(x.e.nome)}</b>${x.e.ativo === false ? '<span class="pill pill-muted">desligado</span>' : x.s.ferias ? `<span class="sub">Período aquisitivo ${esc(x.s.ferias.aquisitivo)}</span>` : ''}</span>
          <span class="mono">${fmt(x.s.admissao)}</span><span>${esc(x.s.tempoCasa || '—')}</span>
          <span>${p ? `<span class="pill pill-${p.nivel}">${p.falta < 0 ? `há ${-p.falta} dia(s)` : p.falta === 0 ? 'hoje' : `em ${p.falta} dia(s)`}</span> <span class="sub">${esc(p.titulo)} · ${fmt(p.d)}</span>` : '<span class="muted">—</span>'}</span>
          <span class="row-acts">${x.e.ativo !== false ? `<details class="menu-acts"><summary class="btn btn-sm">Pedir ${icon('arrow', 'ic-sm')}</summary><div class="menu-list">${ACOES_EMP.filter(([t]) => S.rules.tipos[t]).map(([t, r, ic]) => `<button type="button" data-emp="${n}" data-tipo="${t}">${icon(ic, 'ic-sm')} ${r}</button>`).join('')}<button type="button" data-sim-emp="${n}" data-sim="rescisao">${icon('calc', 'ic-sm')} Simular rescisão</button><button type="button" data-sim-emp="${n}" data-sim="ferias">${icon('calc', 'ic-sm')} Simular férias</button></div></details>` : ''}</span></div>`;
      }).join('') || `<div class="list-vazio">${emp.lista.length ? 'Ninguém com esse filtro.' : `Ainda não consegui a lista de funcionários do portal. ${esc(S.rules.mensagens?.plataformaSemAcesso || '')}`}${emp.lista.length ? '' : `<div class="actions" style="justify-content:center;margin-top:10px"><button class="btn btn-sm btn-primary" id="emp-tentar">${icon('refresh', 'ic-sm')} Tentar de novo</button></div>`}</div>`;
      $('#emp-list').querySelectorAll('[data-emp]').forEach(b => b.addEventListener('click', () => { b.closest('details').removeAttribute('open'); P.novoPedido(b.dataset.tipo, { empregado: lista[+b.dataset.emp].e.nome }); }));
      $('#emp-list').querySelectorAll('[data-sim-emp]').forEach(b => b.addEventListener('click', () => {
        const x = lista[+b.dataset.simEmp]; b.closest('details').removeAttribute('open');
        prepararSimulacao(b.dataset.sim, { quem: x.e.nome, admissao: x.s.admissao ? E.fmtDate(x.s.admissao) : '' });
        S.ferramenta = b.dataset.sim === 'rescisao' ? 'simRescisao' : 'simFerias'; A.setView('ferramentas');
      }));
      $('#emp-list').querySelectorAll('[data-ficha]').forEach(r => {
        const abrir = (e) => { if (e.target.closest('details, button')) return; abrirFuncionario(lista[+r.dataset.ficha]); };
        r.addEventListener('click', abrir); r.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(e); });
      });
      $('#emp-tentar')?.addEventListener('click', () => { S.plat.emp = null; renderFuncionarios(); P.carregarEmpregados(true).then(() => S.view === 'funcionarios' && renderFuncionarios()); });
    };
    desenhar();
    $('#emp-q').addEventListener('input', A.debounce((e) => { F.q = e.target.value; desenhar(); }, 150));
    viewEl.querySelectorAll('[data-sit]').forEach(b => b.addEventListener('click', () => { F.sit = b.dataset.sit; renderFuncionarios(); }));
    viewEl.querySelectorAll('[data-sit-k]').forEach(b => b.addEventListener('click', () => { F.sit = b.dataset.sitK; renderFuncionarios(); }));
    $('#emp-ref').addEventListener('click', () => { S.plat.emp = null; renderFuncionarios(); P.carregarEmpregados(true).then(() => S.view === 'funcionarios' && renderFuncionarios()); });
  }

  /* Ficha do funcionário: tudo o que o portal tem sobre ele (lido na hora, nada guardado), datas de experiência e
     férias, as solicitações em aberto sobre ele e, no Histórico, as já encerradas. */
  function abrirFuncionario(x) {
    if (!x) return;
    const { e, s: st } = x, nome = e.nome, hoje = E.today();
    const dele = (i) => E.norm(i.empregado) === E.norm(nome) || (!i.empregado && E.norm(i.assunto).includes(E.norm(nome)));
    const pillQ = (d) => { const [c, t] = quando(d); return `<span class="pill pill-${c}">${t}</span>`; };
    const st0 = { historico: false, dados: null, dadosErro: false };
    // experiência que vence (próximos 30 dias): as mesmas três saídas do Hoje
    const expVence = e.ativo !== false && st.admissao ? st.experiencia.find(k => k.falta >= 0 && k.falta <= 30) : null;
    const acoesExp = expVence ? acoesExperiencia(nome, st.admissao, expVence.n) : [];
    const dlg = dialogo({
      titulo: `${esc(nome)} ${e.ativo === false ? '<span class="pill pill-muted">desligado</span>' : '<span class="pill pill-ok">ativo</span>'}`, largo: true,
      corpo: `<div class="dt-meta">${[['Admissão', fmt(st.admissao)], ['Tempo de casa', st.tempoCasa || '—'], ['Período aquisitivo', st.ferias?.aquisitivo || '—'], ['Conceder férias até', st.ferias ? `${fmt(st.ferias.limite)} (estimativa)` : '—']].map(([k, v]) => `<span><small>${esc(k)}</small><b>${esc(v)}</b></span>`).join('')}</div>
        ${st.experiencia.length && e.ativo !== false ? `<div class="fu-exp">${st.experiencia.map(k => `<span class="dq"><small>Fim dos ${k.n} dias</small><b>${fmt(k.fim)}</b>${k.falta >= -2 ? pillQ(k.fim) : ''}</span>`).join('')}</div>` : ''}
        ${expVence ? `<div class="fu-exp-acoes"><small class="muted">A experiência termina em ${fmt(expVence.fim)}:</small>${acoesExp.map((a, n) => `<button type="button" class="btn btn-sm${a.cls ? ' ' + a.cls : ''}" data-fu-exp="${n}"${a.titulo ? ` title="${esc(a.titulo)}"` : ''}>${esc(a.rotulo)}</button>`).join('')}</div>` : ''}
        <div class="fu-acoes">${e.ativo !== false ? ACOES_EMP.filter(([t]) => S.rules.tipos[t]).map(([t, r, ic]) => `<button type="button" class="btn btn-sm" data-fu-pedir="${t}">${icon(ic, 'ic-sm')} ${r}</button>`).join('') + `<button type="button" class="btn btn-sm btn-ghost" data-fu-sim="rescisao">${icon('calc', 'ic-sm')} Simular rescisão</button><button type="button" class="btn btn-sm btn-ghost" data-fu-sim="ferias">${icon('calc', 'ic-sm')} Simular férias</button>` : ''}</div>
        <h4 class="dlg-sec" id="fu-tit-sol"></h4>
        <div id="fu-sol" class="fu-sol"></div>
        <h4 class="dlg-sec">Dados do portal</h4>
        <div id="fu-dados"><div class="pn-vazio"><div class="spin"></div>Lendo os dados do funcionário no portal…</div></div>`,
      acoes: [{ rotulo: `${icon('clock', 'ic-sm')} Histórico`, cls: 'fu-hist-btn', fn: () => { st0.historico = !st0.historico; desenharSol(); return false; } }, '|', { rotulo: 'Fechar', cls: 'btn-primary' }]
    });
    const el = dlg.el;
    const desenharSol = () => {
      const sol = S.plat.sol;
      const todas = (sol?.itens || []).filter(dele).sort((a, b) => (b.atualizado?.getTime() || 0) - (a.atualizado?.getTime() || 0));
      const abertas = todas.filter(i => ['aguardando', 'andamento'].includes(i.estado)), encerradas = todas.filter(i => !['aguardando', 'andamento'].includes(i.estado));
      const lista = st0.historico ? encerradas : abertas;
      el.querySelector('#fu-tit-sol').textContent = st0.historico ? `Histórico: solicitações encerradas (${encerradas.length})` : `Solicitações em aberto (${abertas.length})`;
      const btn = el.querySelector('.fu-hist-btn'); btn.innerHTML = st0.historico ? `${icon('list', 'ic-sm')} Ver as em aberto` : `${icon('clock', 'ic-sm')} Histórico (${encerradas.length})`; btn.setAttribute('aria-pressed', st0.historico);
      el.querySelector('#fu-sol').innerHTML = !sol ? `<div class="pn-vazio"><div class="spin"></div>Lendo as solicitações no portal…</div>`
        : lista.map((i, n) => `<button type="button" class="pn-li" data-fu-sol="${n}">${icTipo(i.tipo)}<div class="main"><b>${esc([i.numero && `nº ${i.numero}`, nomeTipo(i.tipo)].filter(Boolean).join(' · '))}</b><small>${esc([i.assunto, `atualizada em ${fmt(i.atualizado)}`].filter(Boolean).join(' · '))}</small></div>${pillSol(i)}</button>`).join('')
          || `<div class="pn-vazio">${icon('check', 'ic-sm')} ${st0.historico ? 'Nenhuma solicitação encerrada para este funcionário.' : 'Nenhuma solicitação em aberto para este funcionário.'}</div>`;
      el.querySelectorAll('[data-fu-sol]').forEach(b => b.addEventListener('click', () => abrirDetalhe(lista[+b.dataset.fuSol])));
    };
    desenharSol();
    if (!S.plat.sol) P.carregarSolicitacoes().then(() => el.isConnected && desenharSol());
    el.querySelectorAll('[data-fu-pedir]').forEach(b => b.addEventListener('click', () => { dlg.fechar(); if (b.dataset.fuPedir === 'avisoFerias' && st.ferias && st.ferias.falta <= 60) programarFerias(nome); else P.novoPedido(b.dataset.fuPedir, { empregado: nome }); }));
    el.querySelectorAll('[data-fu-exp]').forEach(b => b.addEventListener('click', () => { dlg.fechar(); setTimeout(() => acoesExp[+b.dataset.fuExp]?.fn(), 0); }));
    el.querySelectorAll('[data-fu-sim]').forEach(b => b.addEventListener('click', () => {
      dlg.fechar(); prepararSimulacao(b.dataset.fuSim, { quem: nome, admissao: st.admissao ? E.fmtDate(st.admissao) : '' });
      S.ferramenta = b.dataset.fuSim === 'rescisao' ? 'simRescisao' : 'simFerias'; A.setView('ferramentas');
    }));
    request({ type: 'empregadoDetalhe', nome }, 20000).then((r) => {
      const box = el.querySelector('#fu-dados'); if (!box || !box.isConnected) return;
      const g = r?.dados ? D.camposDetalhe(r.dados).grupos : [];
      box.innerHTML = g.length ? g.map(gr => `<section class="dt-grupo">${g.length > 1 ? `<h4>${esc(gr.titulo === 'Solicitação' ? 'Cadastro' : gr.titulo)}</h4>` : ''}<div class="dt-campos">${gr.campos.map(c => `<div class="dt-campo${c.longo ? ' longo' : ''}"><small>${esc(c.k)}</small><span>${esc(c.v)}</span></div>`).join('')}</div></section>`).join('')
        : `<div class="pn-vazio">${icon('info', 'ic-sm')} O portal não trouxe mais dados deste funcionário.</div>`;
    });
  }

  Object.assign(C, { renderFuncionarios });
}
