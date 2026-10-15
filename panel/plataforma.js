/* Plataforma (2.0): a interface em tela cheia por cima do Portal do Cliente, no estilo do
 * módulo Departamento Pessoal do Control Hub. O portal continua carregado por baixo e é
 * preenchido por trás; os dados vêm dele, com a sessão do próprio cliente. Nada sai do computador.
 * O painel (panel.js) continua o orquestrador e passa aqui as funções que já existem (A). */
import * as E from './engine.js';

export function montarPlataforma(A) {
  const { S, $, esc, icon, request, send, toast, viewEl } = A;
  const P = {};
  const hoje0 = E.today();
  S.plat = {
    sol: null, carregandoSol: null, emp: null, carregandoEmp: null, docs: null, lembretes: [],
    filtroSol: { aba: 'todas', q: '', tipo: '' }, filtroEmp: { q: '', sit: 'ativos' },
    agenda: { ano: hoje0.getFullYear(), mes: hoje0.getMonth(), filtro: '' }, docAba: 'escritorio', enviado: null
  };
  chrome.storage.local.get('lembretes').then(({ lembretes }) => { S.plat.lembretes = Array.isArray(lembretes) ? lembretes : []; }).catch(() => {});

  const MODULOS = [
    ['inicio', 'Painel', 'home'], ['pendencias', 'Solicitações', 'list'], ['preencher', 'Novo pedido', 'fill'],
    ['funcionarios', 'Funcionários', 'users'], ['historico', 'Agenda', 'calendar'], ['documentos', 'Documentos', 'folder'], ['ferramentas', 'Calcular', 'calc']
  ];
  const TITULOS = { ...Object.fromEntries(MODULOS.map(m => [m[0], m[1]])), config: 'Configurações' };
  const nomeTipo = (k) => S.rules?.tipos?.[k]?.nome || k;
  const esperar = (ms) => new Promise(r => setTimeout(r, ms));
  const fmt = (d) => (d ? E.fmtDate(d) : '—');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const loading = (txt) => `<div class="empty"><div class="spin" style="margin:0 auto 10px"></div>${esc(txt)}</div>`;
  const quando = (d) => { const n = E.diffDays(E.today(), d); return n < 0 ? ['late', `há ${-n} dia(s)`] : n === 0 ? ['today', 'hoje'] : n <= 7 ? ['today', `em ${n} dia(s)`] : ['soon', `em ${n} dias`]; };
  const editavel = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  /* =================== Casca: trilho, cabeçalho, busca =================== */
  let montada = false;
  function montarCasca() {
    if (montada) return; montada = true;
    $('#rail-mods').innerHTML = MODULOS.map(([v, t, ic]) => `<button type="button" class="rail-i" data-mod="${v}" title="${t}"><span class="rail-ico">${icon(ic)}</span><span class="rail-t">${t}</span><span class="rail-badge" data-badge="${v}" hidden></span></button>`).join('');
    $('#rail-bottom').innerHTML = [['portal', 'Ver no portal', 'external'], ['tema', 'Tema claro/escuro', 'moon'], ['config', 'Configurações', 'gear'], ['minimizar', 'Minimizar', 'minus']]
      .map(([a, t, ic]) => `<button type="button" class="rail-i" data-acao="${a}" title="${t}"><span class="rail-ico">${icon(ic)}</span><span class="rail-t">${t}</span></button>`).join('');
    document.querySelectorAll('#rail [data-mod]').forEach(b => b.addEventListener('click', () => A.setView(b.dataset.mod)));
    document.querySelectorAll('#rail [data-acao]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.acao;
      if (a === 'portal') send({ type: 'modo', modo: 'painel' });
      else if (a === 'minimizar') send({ type: 'modo', modo: 'fechado' });
      else if (a === 'tema') A.alternarTema();
      else if (a === 'config') A.setView('config');
    }));
    $('#plat-busca').addEventListener('click', abrirBusca);
    document.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('plat')) return;
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !editavel(e.target))) { e.preventDefault(); abrirBusca(); }
    });
    // soltar arquivos em qualquer lugar da plataforma
    let fundo = 0; const temArq = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    document.addEventListener('dragenter', (e) => { if (!document.body.classList.contains('plat') || !temArq(e)) return; fundo++; $('#plat-drop').hidden = false; });
    document.addEventListener('dragleave', () => { fundo = Math.max(0, fundo - 1); if (!fundo) $('#plat-drop').hidden = true; });
    document.addEventListener('dragover', (e) => { if (document.body.classList.contains('plat') && temArq(e)) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      fundo = 0; $('#plat-drop').hidden = true;
      if (!document.body.classList.contains('plat') || e.defaultPrevented) return;   // as áreas de soltar já trataram
      const files = [...(e.dataTransfer?.files || [])]; if (!files.length) return;
      e.preventDefault(); A.handleFiles(files, 'arrastar');
    });
    montarBusca();
  }
  function marcarModulo(v) {
    document.querySelectorAll('#rail [data-mod]').forEach(b => b.classList.toggle('on', b.dataset.mod === v));
    $('#plat-titulo').textContent = TITULOS[v] || 'Painel';
  }
  function badge(v, n) { const b = document.querySelector(`[data-badge="${v}"]`); if (!b) return; b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n || ''); }
  function atualizarSync(txt) {
    const el = $('#plat-sync'); if (!el) return;
    if (txt) { el.innerHTML = `<div class="spin"></div>${esc(txt)}`; return; }
    const q = S.plat.sol?.quando;
    el.innerHTML = q ? `Portal lido ${new Date(q).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}<button type="button" id="plat-ref" title="Ler de novo as solicitações e os funcionários">${icon('refresh', 'ic-sm')}</button>` : '';
    $('#plat-ref')?.addEventListener('click', () => { P.carregarSolicitacoes(true); P.carregarEmpregados(true).then(() => P.render(S.view)); });
  }
  function atualizarCabecalho() { const e = $('#plat-empresa'); if (e) e.textContent = S.ctx.empresa || 'Portal do Cliente'; }

  /* =================== Dados do portal =================== */
  P.carregarSolicitacoes = (force = false) => {
    if (S.plat.carregandoSol) return S.plat.carregandoSol;
    if (S.plat.sol && !force) return Promise.resolve(S.plat.sol);
    S.plat.carregandoSol = (async () => {
      atualizarSync('Lendo o portal…');
      const tipos = Object.entries(S.rules.tipos).map(([key, t]) => ({ key, api: t.api || null }));
      const r = await request({ type: 'solicitacoes', tipos, maxPaginas: S.rules.config?.solicitacoesMaxPaginas || 4 }, 90000);
      const itens = [], erros = [], calibrar = [], chaves = new Set(), codigos = {}; let truncado = false;
      for (const g of r?.data || []) {
        if (g.calibrar) { calibrar.push(g.tipo); continue; }
        if (g.erro) { erros.push(g.tipo); codigos[g.tipo] = g.erro; }
        if (g.truncado) truncado = true;
        for (const it of g.itens || []) itens.push(E.normalizarSolicitacao(it, g.tipo, S.rules));
        (g.chaves || []).forEach(k => chaves.add(k));
      }
      itens.sort((a, b) => (b.atualizado?.getTime() || 0) - (a.atualizado?.getTime() || 0));
      const consultados = (r?.data || []).filter(g => !g.calibrar).length;
      S.plat.sol = { itens, erros, calibrar, truncado, ok: !!r, quando: Date.now(), chaves: [...chaves], codigos, semAcesso: !!consultados && erros.length === consultados };
      const n = itens.filter(i => i.aguardando).length;
      send({ type: 'setBadge', n }); badge('pendencias', n);
      atualizarSync();
      if (['inicio', 'pendencias'].includes(S.view) && document.body.classList.contains('plat')) P.render(S.view);
      return S.plat.sol;
    })().finally(() => { S.plat.carregandoSol = null; });
    return S.plat.carregandoSol;
  };
  P.carregarEmpregados = (force = false) => {
    if (S.plat.carregandoEmp) return S.plat.carregandoEmp;
    if (S.plat.emp && !force) return Promise.resolve(S.plat.emp);
    S.plat.carregandoEmp = (async () => {
      // sem lista conhecida, o conteúdo abre por baixo uma solicitação com o campo Empregado (só sem formulário aberto)
      const r = await request({ type: 'employees', aquecer: S.ctx.route?.mode !== 'form' }, 30000);
      const lista = r?.detalhes?.length ? r.detalhes : (r?.names || []).map(nome => ({ nome, admissao: '', ativo: true }));
      S.plat.emp = { lista, quando: Date.now(), empresa: S.ctx.empresa };
      if (r?.detalhes?.length && S.ctx.empresa) A.guardarEquipe(S.ctx.empresa, r.detalhes);
      return S.plat.emp;
    })().finally(() => { S.plat.carregandoEmp = null; });
    return S.plat.carregandoEmp;
  };

  /* =================== Entrada, contexto, avisos =================== */
  P.entrou = () => {
    montarCasca(); atualizarCabecalho(); atualizarSync();
    if (!S.rules) return;
    P.carregarSolicitacoes();
    P.carregarEmpregados().then(() => { if (['funcionarios', 'historico', 'inicio'].includes(S.view)) P.render(S.view); });
  };
  P.aoContexto = (empresaMudou) => {
    atualizarCabecalho();
    badge('preencher', S.ctx.route?.mode === 'form' ? 1 : 0);
    if (empresaMudou) { S.plat.sol = null; S.plat.emp = null; S.plat.docs = null; if (document.body.classList.contains('plat')) P.entrou(); }
  };
  P.atencao = (m) => {
    const el = $('#plat-aviso'); if (!el) return;
    if (!m.texto || m.ativo === false) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="note warn" role="alert">${icon('alert')}<div style="flex:1"><b>${esc(S.rules?.mensagens?.plataformaAtencao || 'O portal está pedindo sua atenção.')}</b> <span class="muted">“${esc(m.texto)}”</span></div><button class="btn btn-sm" id="aviso-portal">${icon('external', 'ic-sm')} Ver no portal</button></div>`;
    $('#aviso-portal').addEventListener('click', () => send({ type: 'modo', modo: 'painel' }));
  };
  P.aoEnviar = (tipo) => { S.plat.enviado = { tipo, quando: Date.now() }; setTimeout(() => P.carregarSolicitacoes(true), 1500); };

  P.render = (v) => {
    montarCasca(); marcarModulo(v);
    viewEl.className = `view plat-view v-${v}`;
    ({ inicio: renderPainel, pendencias: renderSolicitacoes, preencher: renderPedido, funcionarios: renderFuncionarios, historico: renderAgenda, documentos: renderDocumentos, ferramentas: A.renderFerramentas, config: A.renderConfig }[v] || renderPainel)();
  };

  /* =================== Diálogo genérico =================== */
  function dialogo({ titulo, corpo, acoes = [], largo = false }) {
    const m = $('#modal'); m.hidden = false;
    m.innerHTML = `<div class="sheet dlg${largo ? ' dlg-lg' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
      <div class="dlg-head"><h3 id="dlg-t">${titulo}</h3><button type="button" class="icon-btn dlg-x" aria-label="Fechar">${icon('x')}</button></div>
      <div class="dlg-body">${corpo}</div>
      ${acoes.length ? `<div class="dlg-actions">${acoes.map((a, i) => a === '|' ? '<span class="sp"></span>' : `<button type="button" class="btn ${a.cls || ''}" data-acao="${i}">${a.rotulo}</button>`).join('')}</div>` : ''}</div>`;
    const tecla = (e) => { if (e.key === 'Escape') fechar(); };
    const fechar = () => { m.hidden = true; m.innerHTML = ''; m.onclick = null; document.removeEventListener('keydown', tecla); };
    m.querySelector('.dlg-x').addEventListener('click', fechar);
    m.onclick = (e) => { if (e.target === m) fechar(); };
    document.addEventListener('keydown', tecla);
    acoes.forEach((a, i) => a !== '|' && m.querySelector(`[data-acao="${i}"]`)?.addEventListener('click', async () => { if (await a.fn?.(m) !== false) fechar(); }));
    return { el: m.querySelector('.sheet'), fechar };
  }
  P.dialogo = dialogo;

  /* =================== Eventos de agenda (Painel e Agenda) =================== */
  function empregadosAtivos() {
    const l = S.plat.emp?.lista?.length ? S.plat.emp.lista : (S.equipe.get(S.ctx.empresa) || []);
    return l.filter(e => e.ativo !== false);
  }
  function eventosEntre(de, ate) {
    const out = []; const cal = E.makeCalendar(S.rules.feriados);
    const dentro = (d) => d && d >= de && d <= ate;
    for (let m = new Date(de.getFullYear(), de.getMonth(), 1); m <= ate; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      for (const p of E.prazosFixos(S.rules, m.getFullYear(), m.getMonth(), cal)) if (dentro(p.d)) out.push({ d: p.d, tipo: 'legal', titulo: p.titulo, detalhe: p.detalhe });
    }
    const hist = (S.historico || []).filter(h => h.status === 'enviado' && (!S.ctx.empresa || h.empresa === S.ctx.empresa));
    for (const p of A.prazosDoHistorico(hist)) if (dentro(p.d)) out.push({ d: p.d, tipo: 'pedido', titulo: p.titulo, detalhe: [p.detalhe, nomeTipo(p.h.tipo)].filter(Boolean).join(' · ') });
    for (const e of empregadosAtivos()) {
      const s = E.situacaoEmpregado(e, E.today(), S.rules);
      for (const x of s.experiencia) if (dentro(x.fim)) out.push({ d: x.fim, tipo: 'exp', titulo: `Fim da experiência (${x.n} dias)`, detalhe: A.nomeCurto(e.nome) });
    }
    for (const l of S.plat.lembretes) for (const d of E.ocorrencias(l, de, ate, cal)) out.push({ d, tipo: 'lembrete', titulo: l.texto, detalhe: [l.hora, l.obs].filter(Boolean).join(' · '), lembrete: l });
    for (const f of S.rules.feriados || []) { const d = E.parseDate(f); if (dentro(d)) out.push({ d, tipo: 'feriado', titulo: 'Feriado', detalhe: '' }); }
    return out.sort((a, b) => a.d - b.d || a.tipo.localeCompare(b.tipo));
  }
  const ROT_EV = { legal: 'Prazo legal', pedido: 'Da solicitação', exp: 'Experiência', lembrete: 'Lembrete', feriado: 'Feriado' };
  const linhaEvento = (e) => { const [c, t] = quando(e.d); return `<div class="pn-li" data-ev-iso="${E.iso(e.d)}"><div class="ag-d"><b>${String(e.d.getDate()).padStart(2, '0')}</b><small>${e.d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></div><div class="main"><b>${esc(e.titulo)}</b><small>${esc(e.detalhe || ROT_EV[e.tipo])}</small></div><span class="pill pill-${c}">${t}</span></div>`; };

  /* =================== PAINEL =================== */
  function renderPainel() {
    const R = S.rules;
    viewEl.innerHTML = `
      <div id="avisos-esc"></div>
      <div class="kpi-grid" id="kpis">${kpisHtml()}</div>
      <div id="lote"></div>
      ${S.plat.enviado && Date.now() - S.plat.enviado.quando < 5 * 60e3 ? `<div class="note ok">${icon('check')}<div><b>Solicitação de ${esc(nomeTipo(S.plat.enviado.tipo))} enviada ao escritório.</b> Acompanhe em Solicitações.</div></div>` : ''}
      <div class="pn-grid">
        <section class="pn-card pn-comece">
          <div class="pn-card-head"><h3>Comece um pedido</h3><small>Escreva com suas palavras, arraste um documento ou escolha um atalho.</small></div>
          <div class="pn-card-body">
            <div class="free" style="padding:0"><label for="free-txt" class="free-l">${icon('chat', 'ic-sm')} Escreva com suas palavras</label>
              <textarea id="free-txt" rows="2" placeholder="Ex.: o João vai sair de férias dia 10/11 por 20 dias"></textarea>
              <div class="free-a"><small class="muted">Eu entendo o pedido e abro a solicitação certa.</small><button class="btn btn-primary btn-sm" id="free-go">Continuar ${icon('arrow', 'ic-sm')}</button></div></div>
            <div id="sugestao"></div>
            <div class="drop" id="drop-main" role="button" tabindex="0">${icon('upload', 'ic-lg')}<b>Arraste um arquivo, clique para escolher ou cole um print (Ctrl+V)</b><small>Atestado, pedido de demissão, ficha de admissão, CAT, planilha… Eu descubro qual solicitação abrir.</small></div>
          </div>
        </section>
        <section class="pn-card"><div class="pn-card-head"><h3>O que espera você</h3><button type="button" class="linkish" data-ir="pendencias">Ver todas</button></div><div class="pn-card-body" id="pn-espera"></div></section>
        <section class="pn-card"><div class="pn-card-head"><h3>Próximos prazos</h3><button type="button" class="linkish" data-ir="historico">Agenda</button></div><div class="pn-card-body" id="pn-prazos"></div></section>
      </div>
      <section class="pn-card"><div class="pn-card-head"><h3>Atalhos</h3><small>${esc(R.escritorio?.saudacao || '')}</small></div>
        <div class="pn-card-body"><div class="intents plat-intents" id="intents"></div><div id="repetir"></div></div></section>
      <div id="modelos-ini"></div>
      <div class="search">${icon('search')}<input id="q" type="search" placeholder="Dúvida? Procure: férias, atestado, 13º, rescisão…" aria-label="Procurar uma dúvida"></div>
      <div id="faq"></div>`;
    $('#intents').innerHTML = (R.intencoes || []).map(it => `<button class="intent" type="button" data-tipo="${esc(it.tipo)}"><span class="ico">${icon(A.ICONS[it.icone] || 'file')}</span><b>${esc(it.titulo)}</b><span>${esc(it.subtitulo || '')}</span></button>`).join('');
    $('#intents').querySelectorAll('.intent').forEach(b => b.addEventListener('click', () => A.openTipo(b.dataset.tipo)));
    const go = () => { const t = $('#free-txt').value.trim(); if (t) A.entenderTexto(t); };
    $('#free-go').addEventListener('click', go);
    $('#free-txt').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    $('#q').addEventListener('input', (e) => A.renderFaq(e.target.value));
    A.bindDrop($('#drop-main'));
    ligarIr(viewEl);
    desenharEspera(); desenharPrazos();
    A.renderSugestao(); A.renderLote(); A.renderAvisosInicio(); A.renderRepetir(); A.renderModelosInicio();
  }
  function ligarIr(root) {
    root.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.aba) S.plat.filtroSol.aba = b.dataset.aba;
      if (b.dataset.sit) S.plat.filtroEmp.sit = b.dataset.sit;
      A.setView(b.dataset.ir);
    }));
  }
  function kpisHtml() {
    const sol = S.plat.sol; const itens = sol?.itens || [];
    const v = (n) => (sol ? (sol.semAcesso ? '—' : n) : '<span class="spin" style="display:inline-block"></span>');
    const ag = itens.filter(i => i.estado === 'aguardando').length, and = itens.filter(i => i.estado === 'andamento').length;
    const prox = eventosEntre(E.today(), E.addDays(E.today(), 7)).filter(e => e.tipo !== 'feriado');
    const hoje = prox.filter(e => E.diffDays(E.today(), e.d) === 0).length;
    const exp = empregadosAtivos().map(e => E.situacaoEmpregado(e, E.today(), S.rules)).filter(s => s.experiencia.some(x => x.falta >= 0 && x.falta <= 30)).length;
    const k = (label, valor, cls, ir, extra = '', sub = '') => `<button type="button" class="kpi-card clickable ${cls}" data-ir="${ir}" ${extra}><span class="kpi-label">${label}</span><span class="kpi-value">${valor}</span>${sub ? `<span class="kpi-sub">${sub}</span>` : ''}</button>`;
    return k('Aguardando você', v(ag), ag ? 'is-late' : 'is-ok', 'pendencias', 'data-aba="aguardando"', ag ? 'Responda no portal' : 'Nada pendente')
      + k('Em andamento', v(and), '', 'pendencias', 'data-aba="andamento"', 'Com o escritório')
      + k('Prazos em 7 dias', prox.length, hoje ? 'is-today' : '', 'historico', '', hoje ? `${hoje} hoje` : 'Agenda do mês')
      + k('Experiências', exp, exp ? 'is-today' : '', 'funcionarios', '', 'Vencem em 30 dias');
  }
  function desenharEspera() {
    const el = $('#pn-espera'); if (!el) return;
    const sol = S.plat.sol;
    if (!sol) { el.innerHTML = `<div class="pn-vazio"><div class="spin"></div>Consultando suas solicitações no portal…</div>`; return; }
    if (sol.semAcesso) { el.innerHTML = `<div class="pn-vazio">${icon('alert', 'ic-sm')} Não consegui ler suas solicitações agora.</div><button type="button" class="linkish" data-ir="pendencias" style="justify-self:start">Ver detalhes</button>`; ligarIr(el); return; }
    const ag = sol.itens.filter(i => i.aguardando).slice(0, 6);
    el.innerHTML = ag.length ? `<div class="note warn" style="margin:0">${icon('alert')}<div>${esc(S.rules.mensagens?.plataformaAguardando || '')}</div></div>${ag.map((i, n) => linhaSol(i, `data-esp="${n}"`)).join('')}`
      : `<div class="pn-vazio">${icon('check', 'ic-sm')} Nenhuma solicitação esperando por você.</div>`;
    el.querySelectorAll('[data-esp]').forEach(b => b.addEventListener('click', () => abrirDetalhe(ag[+b.dataset.esp])));
  }
  const linhaSol = (i, attr) => `<button type="button" class="pn-li" ${attr}><div class="main"><b>${esc(i.assunto || nomeTipo(i.tipo))}</b><small>${esc(nomeTipo(i.tipo))}${i.numero ? ` · nº ${esc(i.numero)}` : ''}${i.atualizado ? ` · ${fmt(i.atualizado)}` : ''}</small></div>${pillSol(i)}</button>`;
  function desenharPrazos() {
    const el = $('#pn-prazos'); if (!el) return;
    const evs = eventosEntre(E.today(), E.addDays(E.today(), 30)).filter(e => e.tipo !== 'feriado').slice(0, 6);
    el.innerHTML = evs.length ? evs.map(linhaEvento).join('') : `<div class="pn-vazio">${icon('calendar', 'ic-sm')} Sem prazos nos próximos 30 dias.</div>`;
    el.querySelectorAll('[data-ev-iso]').forEach(b => b.addEventListener('click', () => abrirDia(b.dataset.evIso)));
  }

  /* =================== SOLICITAÇÕES =================== */
  const ABAS_SOL = [['todas', 'Todas'], ['aguardando', 'Aguardando você'], ['andamento', 'Em andamento'], ['encerradas', 'Concluídas']];
  const naAba = (i, aba) => aba === 'todas' || (aba === 'encerradas' ? ['concluida', 'cancelada'].includes(i.estado) : i.estado === aba);
  function pillSol(i) {
    const c = { aguardando: 'late', andamento: 'soon', concluida: 'ok', cancelada: 'muted' }[i.estado] || 'soon';
    return `<span class="pill pill-${c}">${esc(i.status || S.rules.config?.statusSolicitacao?.rotulos?.[i.estado] || i.estado)}</span>`;
  }
  function renderSolicitacoes() {
    const sol = S.plat.sol; const F = S.plat.filtroSol;
    if (!sol) { viewEl.innerHTML = loading('Consultando suas solicitações no portal…'); P.carregarSolicitacoes(); return; }
    const conta = (aba) => sol.itens.filter(i => naAba(i, aba)).length;
    const tipos = [...new Set(sol.itens.map(i => i.tipo))];
    viewEl.innerHTML = `
      <div class="dp-tabs" role="tablist">${ABAS_SOL.map(([k, t]) => `<button type="button" role="tab" class="dp-tab${F.aba === k ? ' active' : ''}" data-aba-sol="${k}">${t} <span class="dp-tab-badge${k === 'aguardando' && conta(k) ? ' late' : ''}">${conta(k)}</span></button>`).join('')}</div>
      <div class="dp-toolbar">
        <input type="search" id="sol-q" placeholder="Buscar por número, funcionário ou assunto…" value="${esc(F.q)}" autocomplete="off">
        <select id="sol-tipo" aria-label="Tipo de solicitação"><option value="">Todos os tipos</option>${tipos.map(t => `<option value="${esc(t)}"${F.tipo === t ? ' selected' : ''}>${esc(nomeTipo(t))}</option>`).join('')}</select>
        <span class="dp-count" id="sol-n"></span>
        <button type="button" class="btn btn-sm" id="sol-ref">${icon('refresh', 'ic-sm')} Atualizar</button>
        <button type="button" class="btn btn-sm btn-primary" data-ir="preencher">${icon('plus', 'ic-sm')} Novo pedido</button>
      </div>
      ${conta('aguardando') && F.aba !== 'encerradas' ? `<div class="note warn">${icon('alert')}<div>${esc(S.rules.mensagens?.plataformaAguardando || '')}</div></div>` : ''}
      <div class="list-card"><div class="dp-listhead sol-cols"><span>Nº</span><span>Solicitação</span><span>Funcionário</span><span>Assunto</span><span>Situação</span><span>Atualizada</span></div><div id="sol-list"></div></div>
      ${!sol.ok ? `<div class="note">${icon('info')}<div>Abra o Portal do Cliente para ver suas solicitações.</div></div>` : ''}
      ${sol.calibrar.length ? `<div class="note">${icon('info')}<div><b>${esc(sol.calibrar.map(nomeTipo).join(', '))}:</b> ${esc(S.rules.mensagens?.plataformaCalibrar || '')} <button class="btn btn-ghost btn-sm" id="sol-geral">${icon('external', 'ic-sm')} Abrir no portal</button></div></div>` : ''}
      ${sol.semAcesso ? `<div class="note warn">${icon('alert')}<div><b>Não consegui ler suas solicitações agora.</b> ${esc(S.rules.mensagens?.plataformaSemAcesso || '')}<div class="actions" style="margin-top:8px"><button class="btn btn-sm" id="sol-tentar">${icon('refresh', 'ic-sm')} Tentar de novo</button><button class="btn btn-sm btn-ghost" id="sol-portal">${icon('external', 'ic-sm')} Ver no portal</button></div></div></div>`
        : sol.erros.length ? `<div class="note warn">${icon('alert')}<div>Não consegui ler: ${esc(sol.erros.map(nomeTipo).join(', '))}. Tente atualizar daqui a pouco.</div></div>` : ''}
      ${sol.truncado ? `<p class="muted" style="font-size:11.5px">Mostrando as mais recentes de cada tipo. As mais antigas continuam no portal.</p>` : ''}`;
    const desenhar = () => {
      const q = E.norm(F.q);
      const lista = sol.itens.filter(i => naAba(i, F.aba) && (!F.tipo || i.tipo === F.tipo) && (!q || E.norm(`${i.numero} ${i.empregado} ${i.assunto} ${nomeTipo(i.tipo)}`).includes(q)));
      $('#sol-n').textContent = `${lista.length} de ${sol.itens.length}`;
      $('#sol-list').innerHTML = lista.slice(0, 300).map((i, n) => `<button type="button" class="dp-row sol-cols" data-sol="${n}">
          <span class="mono">${esc(i.numero || '—')}</span><span class="ell">${esc(nomeTipo(i.tipo))}</span><span class="ell">${esc(i.empregado || '—')}</span>
          <span><span class="ell">${esc(i.assunto || '—')}</span>${i.tramite ? `<span class="sub ell">${esc(i.tramite)}</span>` : ''}</span><span>${pillSol(i)}</span><span class="mono">${fmt(i.atualizado)}</span></button>`).join('')
        || `<div class="list-vazio">${esc(S.rules.mensagens?.plataformaVazioSolicitacoes || 'Nada por aqui.')}</div>`;
      $('#sol-list').querySelectorAll('[data-sol]').forEach(b => b.addEventListener('click', () => abrirDetalhe(lista[+b.dataset.sol])));
    };
    desenhar();
    viewEl.querySelectorAll('[data-aba-sol]').forEach(b => b.addEventListener('click', () => { F.aba = b.dataset.abaSol; renderSolicitacoes(); }));
    $('#sol-q').addEventListener('input', A.debounce((e) => { F.q = e.target.value; desenhar(); }, 200));
    $('#sol-tipo').addEventListener('change', (e) => { F.tipo = e.target.value; desenhar(); });
    $('#sol-ref').addEventListener('click', () => { S.plat.sol = null; renderSolicitacoes(); P.carregarSolicitacoes(true); });
    $('#sol-tentar')?.addEventListener('click', () => { S.plat.sol = null; renderSolicitacoes(); P.carregarSolicitacoes(true); });
    $('#sol-portal')?.addEventListener('click', () => send({ type: 'modo', modo: 'painel' }));
    $('#sol-geral')?.addEventListener('click', () => request({ type: 'abrirNoPortal', slug: S.rules.tipos[sol.calibrar[0]]?.slug }));
    ligarIr(viewEl);
  }
  function abrirDetalhe(i) {
    if (!i) return;
    const t = S.rules.tipos[i.tipo];
    dialogo({
      titulo: `${esc(nomeTipo(i.tipo))}${i.numero ? ` <span class="mono" style="font-size:13px;color:var(--ink-3)">nº ${esc(i.numero)}</span>` : ''}`,
      corpo: `<div>${pillSol(i)}</div>
        <dl class="kv"><dt>Assunto</dt><dd>${esc(i.assunto || '—')}</dd><dt>Funcionário</dt><dd>${esc(i.empregado || '—')}</dd><dt>Atualizada</dt><dd>${fmt(i.atualizado)}</dd></dl>
        ${i.tramite ? `<div class="note">${icon('chat')}<div><b>Último trâmite</b><br>${esc(i.tramite)}</div></div>` : ''}
        ${i.aguardando ? `<div class="note warn">${icon('alert')}<div>O escritório está esperando sua resposta. Abra no portal, leia o trâmite e responda. Quem conclui a solicitação é você.</div></div>` : ''}`,
      acoes: [{ rotulo: `${icon('external', 'ic-sm')} ${i.aguardando ? 'Responder no portal' : 'Ver no portal'}`, cls: 'btn-primary', fn: () => request({ type: 'abrirNoPortal', slug: t?.slug, id: i.id }) }, '|', { rotulo: 'Fechar' }]
    });
  }

  /* =================== NOVO PEDIDO =================== */
  function renderPedido() {
    if (S.ctx.route?.mode === 'form' && S.ctx.tipo) { A.renderPreencher(); return; }
    const R = S.rules;
    const grupos = new Map();
    for (const it of R.intencoes || []) { const setor = R.tipos[it.tipo]?.setor || 'Outros'; if (!grupos.has(setor)) grupos.set(setor, []); grupos.get(setor).push(it); }
    viewEl.innerHTML = `
      <div id="lote"></div>
      ${S.plat.enviado && Date.now() - S.plat.enviado.quando < 5 * 60e3 ? `<div class="note ok">${icon('check')}<div><b>Solicitação de ${esc(nomeTipo(S.plat.enviado.tipo))} enviada.</b> Quer fazer outra?</div></div>` : ''}
      <div id="sugestao"></div>
      <div class="pd-escolha">
        <section class="pn-card"><div class="pn-card-head"><h3>O que você precisa pedir ao escritório?</h3><small>Escolha o pedido. Eu abro a solicitação certa no portal e você preenche aqui.</small></div>
          <div class="pn-card-body">${[...grupos].map(([setor, its]) => `<div class="pf-sec">${esc(setor)}</div><div class="tipo-grid">${its.map(it => `<button class="intent" type="button" data-tipo="${esc(it.tipo)}"><span class="ico">${icon(A.ICONS[it.icone] || 'file')}</span><b>${esc(it.titulo)}</b><span>${esc(it.subtitulo || '')}</span></button>`).join('')}</div>`).join('')}</div></section>
        <aside>
          <div class="drop" id="drop-main" role="button" tabindex="0">${icon('upload', 'ic-lg')}<b>Comece por um documento</b><small>Arraste, clique para escolher ou cole um print (Ctrl+V). Eu leio e abro o pedido certo.</small></div>
          <div class="pn-card"><div class="pn-card-body"><label for="free-txt" class="free-l">${icon('chat', 'ic-sm')} Ou escreva com suas palavras</label>
            <textarea id="free-txt" class="input" rows="3" placeholder="Ex.: atestado do João de 3 dias a partir de ontem"></textarea>
            <button class="btn btn-primary btn-sm" id="free-go">Continuar ${icon('arrow', 'ic-sm')}</button></div></div>
        </aside>
      </div>`;
    viewEl.querySelectorAll('.intent').forEach(b => b.addEventListener('click', () => A.openTipo(b.dataset.tipo)));
    const go = () => { const t = $('#free-txt').value.trim(); if (t) A.entenderTexto(t); };
    $('#free-go').addEventListener('click', go);
    $('#free-txt').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    A.bindDrop($('#drop-main'));
    A.renderSugestao(); A.renderLote();
  }
  /** Abre um pedido já com o funcionário escolhido (atalho da lista de Funcionários e da busca). */
  P.novoPedido = async (tipo, { empregado } = {}) => {
    A.comecarDoZeroSeAbandonado(tipo);
    const W = A.w(tipo);
    if (empregado) { W.valores.empregado = { valor: empregado, conf: 1, fonte: 'você' }; W.editados.add('empregado'); W.fonteVerdade.empregado = 'plataforma'; }
    W.rascunhoVisto = true;
    A.gerarTextos(tipo);
    await A.openTipo(tipo, { manter: true });
    for (let k = 0; k < 40 && !(S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo); k++) await esperar(200);
    if (empregado && S.ctx.tipo === tipo) { await A.loadEmpregados(tipo); await A.fillPortal(tipo, { daPlataforma: true }); }
  };

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
      <div class="list-card"><div class="dp-listhead emp-cols"><span>Funcionário</span><span>Admissão</span><span>Tempo de casa</span><span>Próxima data</span><span></span></div><div id="emp-list"></div></div>
      <p class="muted" style="font-size:11.5px">A lista e as datas de admissão vêm do próprio portal. As férias são uma estimativa pela data de admissão: o portal não informa as férias já tiradas.</p>`;
    const desenhar = () => {
      const q = E.norm(F.q);
      const filtro = { ativos: (x) => x.e.ativo !== false, desligados: (x) => x.e.ativo === false, exp: (x) => x.e.ativo !== false && x.s.experiencia.some(k => k.falta >= 0), ferias: (x) => x.e.ativo !== false && x.s.ferias && x.s.ferias.falta <= 60, todos: () => true }[F.sit] || (() => true);
      const lista = todos.filter(x => filtro(x) && (!q || E.norm(x.e.nome).includes(q)));
      $('#emp-n').textContent = `${lista.length} funcionário(s)`;
      $('#emp-list').innerHTML = lista.map((x, n) => {
        const p = x.s.proxima;
        return `<div class="dp-row emp-cols hov"><span><b class="ell">${esc(x.e.nome)}</b>${x.e.ativo === false ? '<span class="pill pill-muted">desligado</span>' : x.s.ferias ? `<span class="sub">Período aquisitivo ${esc(x.s.ferias.aquisitivo)}</span>` : ''}</span>
          <span class="mono">${fmt(x.s.admissao)}</span><span>${esc(x.s.tempoCasa || '—')}</span>
          <span>${p ? `<span class="pill pill-${p.nivel}">${p.falta < 0 ? `há ${-p.falta} dia(s)` : p.falta === 0 ? 'hoje' : `em ${p.falta} dia(s)`}</span> <span class="sub">${esc(p.titulo)} · ${fmt(p.d)}</span>` : '<span class="muted">—</span>'}</span>
          <span class="row-acts">${x.e.ativo !== false ? `<details class="menu-acts"><summary class="btn btn-sm">Pedir ${icon('arrow', 'ic-sm')}</summary><div class="menu-list">${ACOES_EMP.filter(([t]) => S.rules.tipos[t]).map(([t, r, ic]) => `<button type="button" data-emp="${n}" data-tipo="${t}">${icon(ic, 'ic-sm')} ${r}</button>`).join('')}</div></details>` : ''}</span></div>`;
      }).join('') || `<div class="list-vazio">${emp.lista.length ? 'Ninguém com esse filtro.' : `Ainda não consegui a lista de funcionários do portal. ${esc(S.rules.mensagens?.plataformaSemAcesso || '')}`}${emp.lista.length ? '' : `<div class="actions" style="justify-content:center;margin-top:10px"><button class="btn btn-sm btn-primary" id="emp-tentar">${icon('refresh', 'ic-sm')} Tentar de novo</button></div>`}</div>`;
      $('#emp-list').querySelectorAll('[data-emp]').forEach(b => b.addEventListener('click', () => { b.closest('details').removeAttribute('open'); P.novoPedido(b.dataset.tipo, { empregado: lista[+b.dataset.emp].e.nome }); }));
      $('#emp-tentar')?.addEventListener('click', () => { S.plat.emp = null; renderFuncionarios(); P.carregarEmpregados(true).then(() => S.view === 'funcionarios' && renderFuncionarios()); });
    };
    desenhar();
    $('#emp-q').addEventListener('input', A.debounce((e) => { F.q = e.target.value; desenhar(); }, 150));
    viewEl.querySelectorAll('[data-sit]').forEach(b => b.addEventListener('click', () => { F.sit = b.dataset.sit; renderFuncionarios(); }));
    viewEl.querySelectorAll('[data-sit-k]').forEach(b => b.addEventListener('click', () => { F.sit = b.dataset.sitK; renderFuncionarios(); }));
    $('#emp-ref').addEventListener('click', () => { S.plat.emp = null; renderFuncionarios(); P.carregarEmpregados(true).then(() => S.view === 'funcionarios' && renderFuncionarios()); });
  }

  /* =================== AGENDA =================== */
  function renderAgenda() {
    const G = S.plat.agenda;
    const ini = new Date(G.ano, G.mes, 1), fim = new Date(G.ano, G.mes + 1, 0);
    const g0 = E.addDays(ini, -ini.getDay()), g1 = E.addDays(fim, 6 - fim.getDay());
    const todos = eventosEntre(g0, g1);
    const evs = todos.filter(e => !G.filtro || e.tipo === G.filtro || e.tipo === 'feriado');
    const porDia = new Map(); for (const e of evs) { const k = E.iso(e.d); if (!porDia.has(k)) porDia.set(k, []); porDia.get(k).push(e); }
    const hoje = E.iso(E.today());
    const dias = []; for (let d = g0; d <= g1; d = E.addDays(d, 1)) dias.push(d);
    const inacabados = (S.historico || []).filter(h => h.status === 'preenchido' && Date.now() - h.quando < 7 * 864e5 && (!S.ctx.empresa || h.empresa === S.ctx.empresa));
    viewEl.innerHTML = `
      <div class="dp-toolbar">
        <div class="dp-month" role="group" aria-label="Mês da agenda"><button type="button" id="ag-prev" aria-label="Mês anterior">${icon('left', 'ic-sm')}</button><span class="dp-month-label">${cap(ini.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</span><button type="button" id="ag-next" aria-label="Próximo mês">${icon('right', 'ic-sm')}</button></div>
        <button type="button" class="btn btn-sm" id="ag-hoje">Hoje</button>
        <select id="ag-filtro" aria-label="Mostrar"><option value="">Tudo</option>${['legal', 'pedido', 'exp', 'lembrete'].map(k => `<option value="${k}"${G.filtro === k ? ' selected' : ''}>${ROT_EV[k]}${k === 'lembrete' ? 's' : k === 'legal' ? 's' : ''}</option>`).join('')}</select>
        <span class="sp"></span>
        <button type="button" class="btn btn-sm btn-primary" id="ag-novo">${icon('plus', 'ic-sm')} Lembrete</button>
      </div>
      <div class="ag-grid">
        <div class="list-card">
          <div class="ag-wd">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => `<span>${d}</span>`).join('')}</div>
          <div class="ag-days">${dias.map(d => { const k = E.iso(d); const l = porDia.get(k) || []; const fer = l.some(e => e.tipo === 'feriado'); const vis = l.filter(e => e.tipo !== 'feriado');
            return `<button type="button" class="ag-day${d.getMonth() !== G.mes ? ' out' : ''}${k === hoje ? ' today' : ''}${fer ? ' feriado' : ''}" data-dia="${k}" aria-label="${E.fmtDate(d)}: ${vis.length} evento(s)"><span class="ag-n">${d.getDate()}</span>${fer ? '<span class="ag-ev ev-feriado">Feriado</span>' : ''}${vis.slice(0, 3).map(e => `<span class="ag-ev ev-${e.tipo}" title="${esc(e.titulo)}">${esc(e.titulo)}</span>`).join('')}${vis.length > 3 ? `<span class="ag-more">+${vis.length - 3} mais</span>` : ''}</button>`; }).join('')}</div>
          <div class="ag-legenda">${['legal', 'pedido', 'exp', 'lembrete'].map(k => `<span><i class="ev-${k}" style="background:currentColor"></i>${ROT_EV[k]}</span>`).join('')}</div>
        </div>
        <aside class="ag-side">
          <section class="pn-card"><div class="pn-card-head"><h3>Próximos 30 dias</h3></div><div class="pn-card-body" id="ag-prox"></div></section>
          ${inacabados.length ? `<section class="pn-card"><div class="pn-card-head"><h3>Começou e não enviou</h3><small>Preenchidas no portal, mas o envio não foi confirmado.</small></div><div class="pn-card-body">${inacabados.map((h, n) => `<button type="button" class="pn-li" data-cont="${n}"><div class="main"><b>${esc(h.resumo)}</b><small>${esc(nomeTipo(h.tipo))} · ${new Date(h.quando).toLocaleDateString('pt-BR')}</small></div><span class="pill pill-today">continuar</span></button>`).join('')}</div></section>` : ''}
          <details class="pn-card"><summary>Histórico deste computador</summary><div class="pn-card-body" id="ag-hist"></div></details>
        </aside>
      </div>`;
    const prox = eventosEntre(E.today(), E.addDays(E.today(), 30)).filter(e => e.tipo !== 'feriado' && (!G.filtro || e.tipo === G.filtro));
    $('#ag-prox').innerHTML = prox.slice(0, 12).map(linhaEvento).join('') || `<div class="pn-vazio">${icon('calendar', 'ic-sm')} Nada nos próximos 30 dias.</div>`;
    $('#ag-prox').querySelectorAll('[data-ev-iso]').forEach(b => b.addEventListener('click', () => abrirDia(b.dataset.evIso)));
    const hist = S.historico || [];
    $('#ag-hist').innerHTML = hist.length ? hist.slice(0, 40).map((h, n) => `<button type="button" class="pn-li" data-hist="${n}"><div class="main"><b>${esc(h.resumo)}</b><small>${esc(nomeTipo(h.tipo))} · ${new Date(h.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></div><span class="pill pill-${h.status === 'enviado' ? 'ok' : 'soon'}">${esc(h.status)}</span></button>`).join('') : '<div class="pn-vazio">As solicitações que você fizer com o Assistente aparecem aqui.</div>';
    viewEl.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => abrirDia(b.dataset.dia)));
    viewEl.querySelectorAll('[data-cont]').forEach(b => b.addEventListener('click', () => reaproveitar(inacabados[+b.dataset.cont])));
    viewEl.querySelectorAll('[data-hist]').forEach(b => b.addEventListener('click', () => reaproveitar(hist[+b.dataset.hist])));
    $('#ag-prev').addEventListener('click', () => { const d = new Date(G.ano, G.mes - 1, 1); G.ano = d.getFullYear(); G.mes = d.getMonth(); renderAgenda(); });
    $('#ag-next').addEventListener('click', () => { const d = new Date(G.ano, G.mes + 1, 1); G.ano = d.getFullYear(); G.mes = d.getMonth(); renderAgenda(); });
    $('#ag-hoje').addEventListener('click', () => { const d = E.today(); G.ano = d.getFullYear(); G.mes = d.getMonth(); renderAgenda(); });
    $('#ag-filtro').addEventListener('change', (e) => { G.filtro = e.target.value; renderAgenda(); });
    $('#ag-novo').addEventListener('click', () => editarLembrete(null, E.iso(E.today())));
  }
  async function reaproveitar(h) {
    if (!h) return;
    const W = A.w(h.tipo);
    for (const [k, v] of Object.entries(h.valores || {})) if (!['assunto', 'descricao'].includes(k)) W.valores[k] = { valor: v, conf: 1, fonte: 'histórico' };
    W.rascunhoVisto = true;
    A.gerarTextos(h.tipo, true);
    await A.openTipo(h.tipo, { manter: true });
  }
  function abrirDia(isoDia) {
    const d = E.parseDate(isoDia); if (!d) return;
    const evs = eventosEntre(d, d);
    const dlg = dialogo({
      titulo: cap(d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
      corpo: evs.length ? evs.map((e, n) => `<div class="pn-li"${e.lembrete ? ` data-lb="${n}" style="cursor:pointer"` : ' style="cursor:default"'}><span class="ag-ev ev-${e.tipo}" style="width:10px;padding:8px 0"></span><div class="main"><b>${esc(e.titulo)}</b><small>${esc(e.detalhe || ROT_EV[e.tipo])}</small></div><span class="pill">${ROT_EV[e.tipo]}</span></div>`).join('') : '<p class="muted" style="margin:0">Nada marcado neste dia.</p>',
      acoes: [{ rotulo: `${icon('plus', 'ic-sm')} Lembrete neste dia`, cls: 'btn-primary', fn: () => { setTimeout(() => editarLembrete(null, isoDia), 0); } }, '|', { rotulo: 'Fechar' }]
    });
    dlg.el.querySelectorAll('[data-lb]').forEach(b => b.addEventListener('click', () => { dlg.fechar(); editarLembrete(evs[+b.dataset.lb].lembrete, isoDia); }));
  }
  function editarLembrete(l, diaIso) {
    const novo = !l;
    const L = l ? { ...l } : { id: Date.now().toString(36), texto: '', data: diaIso, hora: '', rep: 'nao', intervalo: 1, ate: '', obs: '', pular: [] };
    const REP = [['nao', 'Não repete'], ['diaria', 'Todo dia'], ['util', 'Todo dia útil (seg. a sex.)'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês'], ['anual', 'Todo ano']];
    const salvar = async (lista) => { S.plat.lembretes = lista; await chrome.storage.local.set({ lembretes: lista }); if (S.view === 'historico') renderAgenda(); else if (S.view === 'inicio') renderPainel(); };
    const dlg = dialogo({
      titulo: novo ? 'Novo lembrete' : 'Lembrete',
      corpo: `<div class="field"><label for="lb-texto">Lembrete *</label><input class="input" id="lb-texto" maxlength="200" placeholder="Ex.: mandar as horas extras para o escritório" value="${esc(L.texto)}"></div>
        <div class="form-row"><div class="field"><label for="lb-data">Data *</label><input class="input" type="date" id="lb-data" value="${esc(L.data)}"></div><div class="field"><label for="lb-hora">Hora</label><input class="input" type="time" id="lb-hora" value="${esc(L.hora || '')}"></div></div>
        <div class="form-row"><div class="field"><label for="lb-rep">Repetição</label><select id="lb-rep" class="input">${REP.map(([k, t]) => `<option value="${k}"${L.rep === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field" id="lb-int-w"><label for="lb-int">A cada</label><input class="input" type="number" min="1" max="99" id="lb-int" value="${esc(L.intervalo || 1)}"></div>
          <div class="field" id="lb-ate-w"><label for="lb-ate">Termina em</label><input class="input" type="date" id="lb-ate" value="${esc(L.ate || '')}"><span class="field-hint">Em branco: repete sem fim.</span></div></div>
        <span class="field-hint" id="lb-resumo"></span>
        <div class="field"><label for="lb-obs">Observação</label><textarea class="input" id="lb-obs" rows="2" maxlength="500" style="min-height:56px">${esc(L.obs || '')}</textarea></div>
        <p class="field-hint" style="margin:0">${icon('lock', 'ic-sm')} Fica só neste computador.</p>`,
      acoes: [
        ...(novo ? [] : [{ rotulo: `${icon('trash', 'ic-sm')} Excluir`, cls: 'btn-ghost', fn: () => salvar(S.plat.lembretes.filter(x => x.id !== L.id)) }]),
        ...(!novo && L.rep !== 'nao' && diaIso ? [{ rotulo: 'Excluir só este dia', cls: 'btn-ghost', fn: () => salvar(S.plat.lembretes.map(x => x.id === L.id ? { ...x, pular: [...(x.pular || []), diaIso] } : x)) }] : []),
        '|', { rotulo: 'Cancelar' },
        { rotulo: 'Salvar', cls: 'btn-primary', fn: async (m) => {
          const g = (id) => m.querySelector('#' + id).value.trim();
          const dados = { ...L, texto: g('lb-texto'), data: g('lb-data'), hora: g('lb-hora'), rep: g('lb-rep'), intervalo: Math.max(1, parseInt(g('lb-int'), 10) || 1), ate: g('lb-ate'), obs: g('lb-obs') };
          if (!dados.texto || !E.parseDate(dados.data)) { m.querySelector(dados.texto ? '#lb-data' : '#lb-texto').focus(); toast('Escreva o lembrete e escolha a data.'); return false; }
          await salvar(novo ? [...S.plat.lembretes, dados] : S.plat.lembretes.map(x => x.id === L.id ? dados : x));
          toast('Lembrete salvo na Agenda.');
        } }
      ]
    });
    const m = dlg.el;
    const atualizar = () => {
      const rep = m.querySelector('#lb-rep').value;
      m.querySelector('#lb-int-w').hidden = ['nao', 'util'].includes(rep);
      m.querySelector('#lb-ate-w').hidden = rep === 'nao';
      m.querySelector('#lb-resumo').textContent = E.resumoRepeticao({ data: m.querySelector('#lb-data').value, rep, intervalo: m.querySelector('#lb-int').value, ate: m.querySelector('#lb-ate').value });
    };
    m.querySelectorAll('input, select').forEach(i => i.addEventListener('input', atualizar));
    atualizar(); m.querySelector('#lb-texto').focus();
  }

  /* =================== DOCUMENTOS =================== */
  const ABAS_DOC = [['escritorio', 'Do escritório'], ['anexos', 'Anexos das solicitações'], ['modelos', 'Modelos para assinar'], ['listas', 'Listas de documentos']];
  function renderDocumentos() {
    const aba = S.plat.docAba;
    viewEl.innerHTML = `<div class="dp-tabs" role="tablist">${ABAS_DOC.map(([k, t]) => `<button type="button" role="tab" class="dp-tab${aba === k ? ' active' : ''}" data-doc-aba="${k}">${t}</button>`).join('')}</div><div id="doc-body"></div>`;
    viewEl.querySelectorAll('[data-doc-aba]').forEach(b => b.addEventListener('click', () => { S.plat.docAba = b.dataset.docAba; renderDocumentos(); }));
    ({ escritorio: docsEscritorio, anexos: docsAnexos, modelos: docsModelos, listas: docsListas }[aba] || docsEscritorio)($('#doc-body'));
  }
  async function docsEscritorio(el) {
    if (!S.plat.docs) {
      el.innerHTML = loading('Procurando os documentos no portal…');
      S.plat.docs = await request({ type: 'documentos' }, 20000) || { disponivel: false };
      if (S.view !== 'documentos' || S.plat.docAba !== 'escritorio') return;
    }
    const D = S.plat.docs;
    if (!D.disponivel) {
      el.innerHTML = `<div class="note">${icon('info')}<div><b>Guias, holerites e recibos que o escritório publica.</b> ${esc(S.rules.mensagens?.plataformaCalibrar || '')}<div class="actions" style="margin-top:8px"><button class="btn btn-sm btn-primary" id="doc-portal">${icon('external', 'ic-sm')} Abrir Documentos no portal</button></div></div></div>`;
      $('#doc-portal').addEventListener('click', () => request({ type: 'abrirNoPortal', area: 'documentos' }));
      return;
    }
    el.innerHTML = `<div class="list-card"><div class="dp-listhead doc-cols"><span>Documento</span><span>Categoria</span><span>Competência</span><span>Publicado</span><span></span></div>
      ${(D.itens || []).map((x, n) => `<div class="dp-row doc-cols hov"><span class="ell"><b>${esc(x.nome)}</b></span><span>${esc(x.categoria || '—')}</span><span class="mono">${esc(x.competencia || '—')}</span><span class="mono">${esc(x.data || '—')}</span><span class="row-acts"><button type="button" class="btn btn-sm" data-baixar="${n}">${icon('download', 'ic-sm')} Baixar</button></span></div>`).join('') || '<div class="list-vazio">Nenhum documento publicado.</div>'}</div>
      <div class="actions"><button class="btn btn-ghost btn-sm" id="doc-portal">${icon('external', 'ic-sm')} Ver no portal</button></div>`;
    el.querySelectorAll('[data-baixar]').forEach(b => b.addEventListener('click', async () => {
      const x = D.itens[+b.dataset.baixar]; b.disabled = true;
      const r = await request({ type: 'baixarDocumento', docId: x.id }, 30000); b.disabled = false;
      if (!r?.arquivo) { toast('Não consegui baixar. Abra no portal.'); return; }
      const url = URL.createObjectURL(new Blob([r.arquivo.buf], { type: r.arquivo.type || 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = r.arquivo.name || 'documento.pdf'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }));
    $('#doc-portal').addEventListener('click', () => request({ type: 'abrirNoPortal', area: 'documentos' }));
  }
  function docsAnexos(el) {
    const linhas = [];
    for (const [tipo, W] of Object.entries(S.work)) for (const a of W?.arquivos || []) if (!a.removido) linhas.push({ nome: a.nome, doc: a.analise?.documento?.nome || '—', tipo, quando: 'agora', st: a.jaAnexado || a.anexado ? ['ok', 'no portal'] : ['soon', 'só no Assistente'] });
    for (const h of (S.historico || []).filter(h => !S.ctx.empresa || h.empresa === S.ctx.empresa)) for (const n of h.anexos || []) linhas.push({ nome: n, doc: h.valores?.empregado || h.valores?.nome || '—', tipo: h.tipo, quando: new Date(h.quando).toLocaleDateString('pt-BR'), st: h.status === 'enviado' ? ['ok', 'enviado'] : ['today', 'não enviado'] });
    el.innerHTML = `<div class="list-card"><div class="dp-listhead anx-cols"><span>Arquivo</span><span>Documento / funcionário</span><span>Solicitação</span><span>Quando</span></div>
      ${linhas.map(l => `<div class="dp-row anx-cols hov"><span class="ell"><b>${esc(l.nome)}</b></span><span class="ell">${esc(l.doc)}</span><span><span class="ell">${esc(nomeTipo(l.tipo))}</span></span><span><span class="pill pill-${l.st[0]}">${esc(l.st[1])}</span> <span class="sub">${esc(l.quando)}</span></span></div>`).join('') || '<div class="list-vazio">Os arquivos que você anexar com o Assistente aparecem aqui.</div>'}
      <div class="list-foot">Só os nomes dos arquivos ficam guardados neste computador, nunca o conteúdo.</div></div>`;
  }
  function docsModelos(el) {
    const M = S.rules.modelosDocumento || [];
    el.innerHTML = `<div class="pn-grid">${M.map((md, n) => `<section class="pn-card"><div class="pn-card-head"><h3>${esc(md.titulo)}</h3></div><div class="pn-card-body mdl-card"><p>${esc(md.descricao || '')}</p>${md.revisarComEscritorio ? '<span class="pill pill-today" style="justify-self:start">Modelo sugerido — confirme com o escritório</span>' : ''}<button type="button" class="btn btn-primary btn-sm" data-mdl="${n}" style="justify-self:start">${icon('fill', 'ic-sm')} Preencher</button></div></section>`).join('') || '<p class="muted">Nenhum modelo cadastrado pelo escritório.</p>'}</div>`;
    el.querySelectorAll('[data-mdl]').forEach(b => b.addEventListener('click', () => abrirModelo(M[+b.dataset.mdl])));
  }
  const textoModelo = (md, vals) => (md.texto || []).map(l => String(l).replace(/\{(\w+)(?:\|([^}]*))?\}/g, (_, k, fb) => (vals[k] != null && String(vals[k]).trim() !== '' ? String(vals[k]) : (fb ?? '')))).join('\n');
  function abrirModelo(md) {
    const vals = {};
    const nomes = empregadosAtivos().map(e => e.nome);
    const campo = (c) => {
      const id = `md-${c.k}`;
      if (c.tipo === 'opcoes') return `<div class="field"><label for="${id}">${esc(c.rotulo)}</label><select class="input" id="${id}" data-k="${c.k}"><option value="">—</option>${(c.opcoes || []).map(o => `<option>${esc(o)}</option>`).join('')}</select></div>`;
      return `<div class="field"><label for="${id}">${esc(c.rotulo)}</label><input class="input" id="${id}" data-k="${c.k}" data-t="${c.tipo === 'data' ? 'data' : ''}" ${c.tipo === 'empregado' ? 'list="md-emps"' : ''} placeholder="${c.tipo === 'data' ? 'DD/MM/AAAA' : esc(c.dica || '')}" ${['data', 'numero'].includes(c.tipo) ? 'inputmode="numeric"' : ''} autocomplete="off">${c.dica && c.tipo !== 'data' ? `<span class="field-hint">${esc(c.dica)}</span>` : ''}</div>`;
    };
    const base = () => ({ ...vals, empresa: S.ctx.empresa, hoje: E.today().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) });
    const dlg = dialogo({
      titulo: esc(md.titulo), largo: true,
      corpo: `<div class="mdl-grid"><div style="display:grid;gap:10px;align-content:start">${(md.campos || []).map(campo).join('')}<datalist id="md-emps">${nomes.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        ${md.revisarComEscritorio ? `<div class="note warn" style="margin:0">${icon('alert')}<div>Modelo sugerido. Confirme o texto com o seu analista antes de usar.</div></div>` : ''}</div>
        <div class="mdl-prev" id="md-prev"></div></div>`,
      acoes: [{ rotulo: `${icon('copy', 'ic-sm')} Copiar texto`, fn: async () => { try { await navigator.clipboard.writeText(textoModelo(md, base())); toast('Texto copiado.'); } catch { toast('Não consegui copiar. Selecione o texto e use Ctrl+C.'); } return false; } },
        '|', { rotulo: 'Fechar' },
        { rotulo: `${icon('print', 'ic-sm')} Imprimir ou salvar em PDF`, cls: 'btn-primary', fn: () => { imprimir(textoModelo(md, base())); return false; } }]
    });
    const prev = () => { dlg.el.querySelector('#md-prev').textContent = textoModelo(md, base()); };
    dlg.el.querySelectorAll('[data-k]').forEach(i => i.addEventListener('input', () => { if (i.dataset.t === 'data') A.maskInput(i); vals[i.dataset.k] = i.value; prev(); }));
    prev();
  }
  function imprimir(texto) {
    const area = $('#print-area'); area.innerHTML = `<pre>${esc(texto)}</pre>`;
    document.body.classList.add('imprimindo');
    const fim = () => { document.body.classList.remove('imprimindo'); area.innerHTML = ''; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    setTimeout(() => { window.print(); setTimeout(fim, 500); }, 50);
  }
  function docsListas(el) {
    const tipos = Object.entries(S.rules.tipos).filter(([, t]) => (t.anexos || []).length);
    el.innerHTML = `<div class="pn-grid">${tipos.map(([k, t]) => `<section class="pn-card"><div class="pn-card-head"><h3>${esc(t.nome)}</h3></div><div class="pn-card-body"><div class="doclist">${t.anexos.map(a => `<div class="dl-i"><span class="st">${icon(a.obrigatorio ? 'check' : 'minus', 'ic-sm')}</span><span>${esc(a.rotulo)}${a.obrigatorio ? '' : ' <small class="muted">(se houver)</small>'}</span></div>`).join('')}</div>
      ${k === 'cadastroEmpregado' ? `<button type="button" class="btn btn-sm" id="doc-msg" style="justify-self:start">${icon('copy', 'ic-sm')} Copiar mensagem para o novo funcionário</button>` : ''}</div></section>`).join('')}</div>`;
    $('#doc-msg')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(A.mensagemAdmissao()); toast('Mensagem copiada. Cole no WhatsApp ou no e-mail.'); } catch { toast('Não consegui copiar.'); } });
  }

  /* =================== BUSCA (Ctrl+K ou /) =================== */
  let resultados = [], sel = 0;
  function montarBusca() {
    const box = $('#cmdk'), inp = $('#cmdk-q');
    const fechar = () => { box.hidden = true; };
    box.addEventListener('click', (e) => { if (e.target === box) fechar(); });
    inp.addEventListener('input', () => { sel = 0; desenharBusca(inp.value); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fechar(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, Math.min(resultados.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); marcarSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); const r = resultados[sel]; if (r) { fechar(); r.fn(); } }
    });
  }
  function abrirBusca() {
    const box = $('#cmdk'); box.hidden = false; const inp = $('#cmdk-q'); inp.value = ''; sel = 0; desenharBusca(''); inp.focus();
    if (!S.plat.emp) P.carregarEmpregados(); if (!S.plat.sol) P.carregarSolicitacoes();
  }
  function desenharBusca(q) {
    const Q = E.norm(q); const toks = Q.split(' ').filter(Boolean);
    const bate = (s) => toks.every(t => E.norm(s).includes(t));
    const grupos = [];
    const mods = MODULOS.filter(([, t]) => !Q || bate(t)).map(([v, t, ic]) => ({ titulo: t, sub: 'Ir para', ic, fn: () => A.setView(v) }));
    grupos.push(['Ir para', mods.slice(0, Q ? 4 : 7)]);
    if (Q) {
      grupos.push(['Novo pedido', E.searchIntents(q, S.rules).slice(0, 4).map(it => ({ titulo: it.titulo, sub: it.subtitulo || '', ic: A.ICONS[it.icone] || 'file', fn: () => A.openTipo(it.tipo) }))]);
      grupos.push(['Funcionários', (S.plat.emp?.lista || []).filter(e => bate(e.nome)).slice(0, 5).map(e => ({ titulo: e.nome, sub: e.ativo === false ? 'Desligado' : `Admissão ${fmt(E.parseDate(e.admissao))}`, ic: 'users', fn: () => { S.plat.filtroEmp = { q: e.nome, sit: 'todos' }; A.setView('funcionarios'); } }))]);
      grupos.push(['Solicitações', (S.plat.sol?.itens || []).filter(i => bate(`${i.numero} ${i.empregado} ${i.assunto} ${nomeTipo(i.tipo)}`)).slice(0, 5).map(i => ({ titulo: i.assunto || nomeTipo(i.tipo), sub: `${nomeTipo(i.tipo)}${i.numero ? ` · nº ${i.numero}` : ''} · ${i.status}`, ic: 'list', fn: () => abrirDetalhe(i) }))]);
      grupos.push(['Dúvidas', (S.rules.faq || []).filter(f => toks.some(t => t.length > 2 && E.norm(`${f.pergunta} ${(f.palavras || []).join(' ')}`).includes(t))).slice(0, 4).map(f => ({ titulo: f.pergunta, sub: 'Dúvida frequente', ic: 'info', fn: () => dialogo({ titulo: esc(f.pergunta), corpo: `<p style="margin:0">${esc(f.resposta)}</p>`, acoes: ['|', { rotulo: 'Fechar', cls: 'btn-primary' }] }) }))]);
    }
    resultados = grupos.flatMap(([, l]) => l);
    let n = 0;
    $('#cmdk-res').innerHTML = grupos.filter(([, l]) => l.length).map(([g, l]) => `<div class="cmdk-g">${g}</div>${l.map(r => `<button type="button" class="cmdk-i" data-r="${n++}">${icon(r.ic, 'ic-sm')}<div class="main">${esc(r.titulo)}<small>${esc(r.sub)}</small></div></button>`).join('')}`).join('')
      || `<div class="cmdk-vazio">Nada encontrado para “${esc(q)}”.</div>`;
    $('#cmdk-res').querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { $('#cmdk').hidden = true; resultados[+b.dataset.r].fn(); }));
    marcarSel();
  }
  function marcarSel() { document.querySelectorAll('#cmdk-res [data-r]').forEach(b => b.classList.toggle('on', +b.dataset.r === sel)); document.querySelector('#cmdk-res .on')?.scrollIntoView({ block: 'nearest' }); }

  return P;
}
