/* Plataforma (2.0): a interface em tela cheia por cima do Portal do Cliente, no estilo do
 * módulo Departamento Pessoal do Control Hub. O portal continua carregado por baixo e é
 * preenchido por trás; os dados vêm dele, com a sessão do próprio cliente. Nada sai do computador.
 * O painel (panel.js) continua o orquestrador e passa aqui as funções que já existem (A). */
import * as E from './engine.js';
import { anel, anelProgresso, animarNumeros, ligarDicas, cor } from './graficos.js';
import { prepararSimulacao } from './calcular.js';
import * as D from './dados.js';

export function montarPlataforma(A) {
  const { S, $, esc, icon, request, send, toast, viewEl } = A;
  const P = {};
  const hoje0 = E.today();
  S.plat = {
    sol: null, carregandoSol: null, emp: null, carregandoEmp: null, docs: null, lembretes: [],
    escolher: false, empresaFiltro: '', filtroSol: { aba: null, q: '', tipo: '' }, filtroEmp: { q: '', sit: 'ativos' },
    agenda: { ano: hoje0.getFullYear(), mes: hoje0.getMonth(), filtro: '' }, docAba: 'escritorio', enviado: null
  };
  chrome.storage.local.get('lembretes').then(({ lembretes }) => { S.plat.lembretes = Array.isArray(lembretes) ? lembretes : []; }).catch(() => {});

  const MODULOS = [
    ['inicio', 'Hoje', 'home'], ['pendencias', 'Solicitações', 'list'], ['preencher', 'Novo pedido', 'fill'],
    ['funcionarios', 'Funcionários', 'users'], ['historico', 'Agenda', 'calendar'], ['documentos', 'Documentos', 'folder'], ['ferramentas', 'Calcular', 'calc']
  ];
  const TITULOS = { ...Object.fromEntries(MODULOS.map(m => [m[0], m[1]])), config: 'Configurações' };
  const nomeTipo = (k) => S.rules?.tipos?.[k]?.nome || k;
  // ícone e cor por família (como no Control Onvio): o ícone vem do atalho do tipo nas regras
  const familiaTipo = (k) => /^cadastro/.test(k) ? 'cadastro' : /Ferias$/.test(k) ? 'ferias' : /Rescisao$/.test(k) ? 'rescisao' : k === 'afastamento' ? 'afastamento' : k === 'rubricas' ? 'rubricas' : 'geral';
  const icTipo = (k) => `<span class="tp-ic fam-${familiaTipo(k)}" aria-hidden="true">${icon(A.ICONS[(S.rules?.intencoes || []).find(x => x.tipo === k)?.icone] || 'file', 'ic-sm')}</span>`;
  const esperar = (ms) => new Promise(r => setTimeout(r, ms));
  const fmt = (d) => (d ? E.fmtDate(d) : '—');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const loading = (txt) => `<div class="empty"><div class="spin" style="margin:0 auto 10px"></div>${esc(txt)}</div>`;
  const quando = (d) => { const n = E.diffDays(E.today(), d); return n < 0 ? ['late', `há ${-n} dia(s)`] : n === 0 ? ['today', 'hoje'] : n <= 7 ? ['today', `em ${n} dia(s)`] : ['soon', `em ${n} dias`]; };
  /* várias empresas no mesmo login: por padrão, só a empresa aberta no portal; com mais de uma na tela, cada item mostra a sua */
  const itensVisiveis = () => E.filtrarPorEmpresa(S.plat.sol?.itens || [], S.plat.empresaFiltro, S.ctx.empresa);
  const variasEmpresas = (l) => new Set((l || []).map(i => i.empresa).filter(Boolean)).size > 1;
  const rotEmpresa = (i) => i.empresaApelido || i.empresa || '';
  function seletorEmpresa() {
    const todas = S.plat.sol?.itens || [], emps = E.empresasDasSolicitacoes(todas);
    if (emps.length <= 1) return '';
    const atual = E.empresaDoFiltro(todas, S.plat.empresaFiltro, S.ctx.empresa);
    return `<select class="emp-filtro" aria-label="Empresa">${emps.map(e => `<option value="${esc(e.nome)}"${atual === e.nome ? ' selected' : ''}>${esc(e.nome)} (${e.n})</option>`).join('')}<option value="*"${atual === '*' ? ' selected' : ''}>Todas as empresas (${todas.length})</option></select>`;
  }
  function ligarSeletorEmpresa(root) {
    root.querySelectorAll('.emp-filtro').forEach(sel => sel.addEventListener('change', () => {
      const v = sel.value, doPortal = E.empresaDoFiltro(S.plat.sol?.itens || [], '', S.ctx.empresa);
      S.plat.empresaFiltro = v === doPortal ? '' : v;
      atualizarBadge(); P.render(S.view);
    }));
  }
  function atualizarBadge() { const n = itensVisiveis().filter(i => i.aguardando).length; send({ type: 'setBadge', n }); badge('pendencias', n); }
  const editavel = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  /* =================== Casca: trilho, cabeçalho, busca =================== */
  let montada = false;
  function montarCasca() {
    if (montada) return; montada = true;
    $('#rail-mods').innerHTML = MODULOS.map(([v, t, ic]) => `<button type="button" class="rail-i" data-mod="${v}" title="${t}"><span class="rail-ico">${icon(ic)}</span><span class="rail-t">${t}</span><span class="rail-badge" data-badge="${v}" hidden></span></button>`).join('');
    $('#rail-bottom').innerHTML = [['portal', 'Ver no portal', 'external'], ['tema', 'Tema claro/escuro', 'moon'], ['config', 'Configurações', 'gear'], ['minimizar', 'Minimizar', 'minus']]
      .map(([a, t, ic]) => `<button type="button" class="rail-i" data-acao="${a}" title="${t}"><span class="rail-ico">${icon(ic)}</span><span class="rail-t">${t}</span></button>`).join('');
    document.querySelectorAll('#rail [data-mod]').forEach(b => b.addEventListener('click', () => {
      // "Novo pedido" de novo, com o formulário na tela: volta para a escolha do tipo (o pedido aberto pode ser retomado)
      if (b.dataset.mod === 'preencher' && S.view === 'preencher' && S.ctx.route?.mode === 'form' && !S.plat.escolher) { S.plat.escolher = true; P.render('preencher'); return; }
      A.setView(b.dataset.mod);
    }));
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
      e.preventDefault(); S.plat.escolher = false; A.handleFiles(files, 'arrastar');
    });
    montarBusca();
  }
  function marcarModulo(v) {
    document.querySelectorAll('#rail [data-mod]').forEach(b => b.classList.toggle('on', b.dataset.mod === v));
    $('#plat-titulo').textContent = TITULOS[v] || 'Hoje';
  }
  function badge(v, n) { const b = document.querySelector(`[data-badge="${v}"]`); if (!b) return; b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n || ''); }
  function atualizarSync(txt) {
    const el = $('#plat-sync'); if (!el) return;
    if (txt) { el.innerHTML = `<div class="spin"></div>${esc(txt)}`; return; }
    const q = S.plat.sol?.quando;
    el.innerHTML = q ? `<span title="Lido de novo a cada ${Math.max(15, +S.rules?.config?.leituraAutomaticaSegundos || 30)} segundos">Portal lido ${new Date(q).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><button type="button" id="plat-ref" title="Ler de novo as solicitações e os funcionários">${icon('refresh', 'ic-sm')}</button>` : '';
    $('#plat-ref')?.addEventListener('click', () => { P.carregarSolicitacoes(true); P.carregarEmpregados(true).then(() => P.render(S.view)); });
  }
  function atualizarCabecalho() { const e = $('#plat-empresa'); if (e) e.textContent = S.ctx.empresa || 'Portal do Cliente'; }

  /* =================== Dados do portal =================== */
  /* Leitura automática (config.leituraAutomaticaSegundos, padrão 30): só com a aba à vista e sem preenchimento
     em andamento. Redesenha só quando algo mudou e ninguém está digitando nem com uma janela aberta. */
  const assinatura = (sol) => (sol?.itens || []).map(i => `${i.tipo}:${i.id}:${i.status}:${i.atualizado?.getTime() || ''}:${i.veredito ? `${i.veredito.pede ? 'p' : 'n'}${i.veredito.anexoSemArquivo ? 'a' : ''}` : ''}:${i.datas?.inicioFerias || i.datas?.admissao || i.datas?.desligamento ? 'd' : ''}`).join('|') + `#${sol?.semAcesso ? 1 : 0}`;
  let desenhada = '';
  let relogio = null;
  function seguroRedesenhar() {
    const a = document.activeElement;
    return $('#modal').hidden && $('#cmdk').hidden && !(a && viewEl.contains(a) && editavel(a));
  }
  // clique ou tecla há pouco: espera, para a tela não mudar debaixo da mão de quem está usando
  let ultimaInteracao = 0;
  ['pointerdown', 'keydown'].forEach(ev => viewEl.addEventListener(ev, () => { ultimaInteracao = Date.now(); }, true));
  function redesenharSePreciso() {
    if (!['inicio', 'pendencias'].includes(S.view) || !document.body.classList.contains('plat')) return;
    if (Date.now() - ultimaInteracao < 1500) { setTimeout(redesenharSePreciso, 1600); return; }
    const ass = assinatura(S.plat.sol);
    if (ass !== desenhada && seguroRedesenhar()) P.render(S.view);
  }
  function iniciarLeituraAutomatica() {
    if (relogio) return;
    const seg = Math.max(15, +S.rules?.config?.leituraAutomaticaSegundos || 30);
    relogio = setInterval(() => {
      if (document.hidden || S.plat.carregandoSol || S.preenchendo || !S.plat.sol) { redesenharSePreciso(); return; }
      P.carregarSolicitacoes(true, { silencioso: true });
    }, seg * 1000);
  }
  P.carregarSolicitacoes = (force = false, { silencioso = false } = {}) => {
    if (S.plat.carregandoSol) return S.plat.carregandoSol;
    if (S.plat.sol && !force) return Promise.resolve(S.plat.sol);
    S.plat.carregandoSol = (async () => {
      if (!silencioso) atualizarSync('Lendo o portal…');
      const tipos = Object.entries(S.rules.tipos).map(([key, t]) => ({ key, api: t.api || null, lista: t.apiLista || null, expand: t.apiExpand || '' }));
      const r = await request({ type: 'solicitacoes', tipos, maxPaginas: S.rules.config?.solicitacoesMaxPaginas || 2 }, 90000);
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
      // leitura automática que falhou: fica o que já estava na tela
      if (silencioso && S.plat.sol && (!r || (consultados && erros.length === consultados))) { atualizarSync(); return S.plat.sol; }
      aplicarDatasGuardadas(itens); aplicarVereditos(itens);
      S.plat.sol = { itens, erros, calibrar, truncado, ok: !!r, quando: Date.now(), chaves: [...chaves], codigos, semAcesso: !!consultados && erros.length === consultados };
      atualizarBadge();
      atualizarSync();
      if (silencioso) redesenharSePreciso();
      else if (['inicio', 'pendencias'].includes(S.view) && document.body.classList.contains('plat')) P.render(S.view);
      carregarDatasAvisos(); carregarVereditos();
      iniciarLeituraAutomatica();
      return S.plat.sol;
    })().finally(() => { S.plat.carregandoSol = null; });
    return S.plat.carregandoSol;
  };
  /* Datas dos avisos de férias e rescisão (início, pagamento, data do aviso) ficam no detalhe da solicitação:
     lidas só para os avisos recentes, na hora, e guardadas só na memória junto do item. */
  const datasGuardadas = new Map();   // id da solicitação → datas do aviso (só na memória; null = já tentou)
  function aplicarDatasGuardadas(itens) {
    for (const i of itens) if (datasGuardadas.has(i.id)) { i.datasLidas = true; const d = datasGuardadas.get(i.id); if (d) i.datas = Object.fromEntries(Object.entries({ ...i.datas, ...d }).map(([k, v]) => [k, v ?? i.datas?.[k] ?? null])); }
  }
  async function carregarDatasAvisos() {
    const sol = S.plat.sol; if (!sol?.itens?.length) return;
    const hoje = E.today();
    const COM_DATA = ['avisoFerias', 'avisoRescisao', 'calculoFerias', 'calculoRescisao', 'cadastroEmpregado', 'cadastroEstagiario'];
    const alvo = sol.itens.filter(i => COM_DATA.includes(i.tipo) && !i.datasLidas && !['cancelada', 'prescrita', 'concluida'].includes(i.estado)
      && !(i.datas?.inicioFerias || i.datas?.pagamento || i.datas?.aviso || i.datas?.desligamento || i.datas?.admissao) && i.criado && E.diffDays(i.criado, hoje) <= 120).slice(0, 16);
    if (!alvo.length) return;
    await Promise.all(alvo.map(async (i) => {
      i.datasLidas = true; datasGuardadas.set(i.id, null);
      const r = await request({ type: 'datasAviso', lista: S.rules.tipos[i.tipo]?.apiDetalhe || S.rules.tipos[i.tipo]?.apiLista, solicitacao: i.id }, 15000);
      if (!r?.datas) return;
      const d = E.datasDoAviso(r.datas);
      datasGuardadas.set(i.id, d);
      i.datas = Object.fromEntries(Object.entries({ ...i.datas, ...d }).map(([k, v]) => [k, v ?? i.datas?.[k] ?? null]));
    }));
    if (S.plat.sol === sol) redesenharSePreciso();
  }
  /* Conversas (2.4): para as que estão com você e as que mexeram nos últimos 30 dias, lê os trâmites e guarda só o
     veredito na memória (o escritório pede algo? você citou anexo sem arquivo?), por solicitação e data da movimentação. */
  const vereditos = new Map();   // id → { em, v }
  function aplicarVereditos(itens) { for (const i of itens) { const c = vereditos.get(i.id); if (c && c.em === (i.atualizado?.getTime() || 0)) i.veredito = c.v; } }
  let lendoVereditos = false;
  async function carregarVereditos() {
    const sol = S.plat.sol; if (!sol?.itens?.length || lendoVereditos) return;
    const hoje = E.today();
    const alvo = sol.itens.filter(i => i.id && S.rules.tipos[i.tipo]?.apiTramites && !i.veredito
      && (i.estado === 'aguardando' || (i.estado === 'andamento' && i.atualizado && E.diffDays(i.atualizado, hoje) <= 30)))
      .sort((a, b) => (a.estado === 'aguardando' ? 0 : 1) - (b.estado === 'aguardando' ? 0 : 1)).slice(0, 40);
    if (!alvo.length) return;
    lendoVereditos = true;
    try {
      let n = 0;
      const trabalhador = async () => { while (n < alvo.length) { const i = alvo[n++];
        const r = await request({ type: 'tramites', base: S.rules.tipos[i.tipo].apiTramites, solicitacao: i.id }, 15000);
        if (!r || r.erro) continue;
        const v = E.vereditoConversa(E.tramitesDe(r.itens, i.tipo, S.rules), S.rules) || { ultimoLado: null, pede: false };
        vereditos.set(i.id, { em: i.atualizado?.getTime() || 0, v }); i.veredito = v; } };
      await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    } finally { lendoVereditos = false; }
    if (S.plat.sol === sol) { atualizarBadge(); redesenharSePreciso(); }
  }
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
  let ultimoForm = '';
  P.aoContexto = (empresaMudou) => {
    atualizarCabecalho();
    badge('preencher', S.ctx.route?.mode === 'form' ? 1 : 0);
    const formAgora = S.ctx.route?.mode === 'form' ? `${S.ctx.route.path}|${S.ctx.tipo}` : '';
    if (formAgora !== ultimoForm) { ultimoForm = formAgora; S.plat.escolher = false; }   // abriu (ou fechou) um formulário
    if (empresaMudou) { S.plat.empresaFiltro = ''; S.plat.sol = null; S.plat.emp = null; S.plat.docs = null; if (document.body.classList.contains('plat')) P.entrou(); }
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
    desenhada = assinatura(S.plat.sol);
    const trocou = P.ultimaVista !== v; P.ultimaVista = v;   // entrada suave só ao trocar de tela
    if (v !== 'preencher') S.plat.escolher = false;
    viewEl.className = `view plat-view v-${v}${trocou ? ' entra' : ''}`;
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

  /* =================== HOJE (2.1) =================== */
  /* No formato da tela Hoje do Control Onvio (repositório do escritório), na visão do cliente: rosca "% em dia",
     quantas esperam sua resposta, carrossel (um aviso por vez, com a bolinha da leitura do portal) e "Próximos passos".
     Embaixo: situações (filtros) e cartões agrupados por motivo. A classificação é uma só (E.motivoCliente /
     E.prioridadesCliente), para a rosca, as situações e os cartões baterem. */
  const POR_GRUPO = 6;
  const MOT = Object.fromEntries(E.MOTIVOS_CLIENTE.map(m => [m.k, m]));
  const ICONE_MOT = { prescreve: 'clock', responder: 'chat', atrasada: 'alert', respondida: 'check', escritorio: 'briefcase', concluida: 'check' };
  const ROT_CASO = { anexo: 'Anexo não chegou', duplicada: 'Parece repetida', abaErrada: 'Aba certa' };
  const TAG_MOT = { prescreve: 'Prescreve', responder: 'Sua vez', atrasada: 'Passou da expectativa', respondida: 'Respondida', escritorio: 'Com o escritório', concluida: 'Concluída' };
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const lerPref = (k, p) => { try { return localStorage.getItem(`ct.${k}`) || p; } catch { return p; } };
  const gravarPref = (k, v) => { try { localStorage.setItem(`ct.${k}`, v); } catch { /* sem armazenamento: vale só nesta visita */ } };
  S.plat.hoje = { filtro: null, q: '', vis: lerPref('hojeVis', 'cartoes') };
  const empDe = (i) => (i.empregado && !E.norm(i.assunto).includes(E.norm(i.empregado)) ? i.empregado : '');   // sem repetir o nome que já está no assunto
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const lembretesDeHoje = () => { const h = E.today(); const cal = E.makeCalendar(S.rules.feriados); return S.plat.lembretes.filter(l => E.ocorrencias(l, h, h, cal).length); };

  function renderPainel() {
    const R = S.rules, H = S.plat.hoje, sol = S.plat.sol, hoje = E.today();
    const lido = !!sol && !sol.semAcesso;
    const animar = lido && !viewEl.querySelector('.hj-hero[data-pronto]');
    const base = lido ? itensVisiveis() : [];
    const comEmpresa = variasEmpresas(base);   // mais de uma empresa na tela: cada item diz de qual é
    const prio = E.prioridadesCliente(base, hoje, R);
    const motivoDe = new Map(prio.map(p => [p.item, p.motivo]));
    const cont = Object.fromEntries(E.MOTIVOS_CLIENTE.map(m => [m.k, prio.filter(p => p.motivo === m.k).length]));
    const total = prio.length;
    const suaVez = cont.prescreve + cont.responder;
    const pctDia = total ? Math.round((total - suaVez) / total * 100) : 100;
    const fatias = E.MOTIVOS_CLIENTE.map(m => ({ k: m.k, rot: m.rot, n: cont[m.k], cor: m.cor }));
    const lems = lembretesDeHoje();
    const prazos = eventosEntre(hoje, E.addDays(hoje, 3)).filter(e => ['legal', 'exp', 'pedido'].includes(e.tipo));
    const atencao = prio.filter(p => ['prescreve', 'responder', 'atrasada'].includes(p.motivo));
    const avisos = lido ? E.avisosSemCalculo(base, hoje, R) : [];
    const casos = lido ? E.casosCliente(base, R) : [];
    const legais = lido ? E.prazosLegaisCliente(base, hoje, R) : [];
    const equipe = E.equipeVencendo(empregadosAtivos(), base, hoje, R);
    const acoesEq = [];
    const q = () => E.norm(H.q.trim());
    const naBusca = () => { const t = q(); return t ? prio.filter(p => E.norm(`${p.item.numero} ${p.item.empregado} ${p.item.assunto} ${nomeTipo(p.item.tipo)} ${p.item.responsavel} ${p.item.status}`).includes(t)) : prio; };
    let mostrados = [];   // solicitações dos cartões na tela (data-card = posição)
    const quandoLido = sol?.quando ? new Date(sol.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

    const aviso = !sol ? '' : sol.semAcesso
      ? `<div class="aviso-linha late">${icon('alert')}<span><b>Não consegui ler suas solicitações agora.</b> ${esc(R.mensagens?.plataformaSemAcesso || '')}</span><button type="button" class="btn btn-sm" id="hj-tentar">${icon('refresh', 'ic-sm')} Tentar de novo</button></div>`
      : sol.erros.length ? `<div class="aviso-linha late">${icon('alert')}<span>Não consegui ler: ${esc(sol.erros.map(nomeTipo).join(', '))}. Os números abaixo podem estar incompletos.</span></div>` : '';
    const enviado = S.plat.enviado && Date.now() - S.plat.enviado.quando < 5 * 60e3
      ? `<div class="aviso-linha ok">${icon('check')}<span><b>Solicitação de ${esc(nomeTipo(S.plat.enviado.tipo))} enviada ao escritório.</b> Ela aparece aqui assim que o portal registrar.</span></div>` : '';

    viewEl.innerHTML = `
      <div id="avisos-esc"></div>
      <div id="lote"></div>
      <div id="sugestao"></div>
      ${enviado}${aviso}
      <p class="hj-saud"><b>${saudacao()}!</b> · ${esc(cap(hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })))}</p>
      <div class="dp-toolbar hj-barra">
        <input type="search" id="hj-busca" placeholder="Buscar por número, funcionário ou assunto…" value="${esc(H.q)}" aria-label="Buscar nas solicitações" autocomplete="off">
        ${seletorEmpresa()}
        <div class="seg" role="group" aria-label="Como mostrar"><button type="button" data-vis="cartoes" aria-pressed="${H.vis === 'cartoes'}">${icon('grid', 'ic-sm')} Cartões</button><button type="button" data-vis="lista" aria-pressed="${H.vis === 'lista'}">${icon('list', 'ic-sm')} Lista</button></div>
        <span class="dp-count">${lido ? plural(base.filter(i => ['aguardando', 'andamento'].includes(i.estado)).length, 'em aberto', 'em aberto') : ''}</span>
        <button type="button" class="btn btn-sm" id="hj-lembrete">${icon('plus', 'ic-sm')} Lembrete</button>
        <button type="button" class="btn btn-sm btn-primary" data-ir="preencher">${icon('plus', 'ic-sm')} Novo pedido</button>
      </div>
      ${heroHtml()}
      ${equipeHtml()}
      ${casosHtml()}
      <div class="hj-sits" role="group" aria-label="Filtrar por situação">${sitsHtml()}</div>
      <div id="hj-cartoes">${cartoesHtml()}</div>`;

    function heroHtml() {
      const slides = slidesDoCarrossel();
      const estadoLeitura = !sol ? 'parado' : sol.semAcesso || sol.erros.length ? 'erro' : '';
      const dica = !sol ? 'Lendo o portal…' : sol.semAcesso ? 'Não consegui ler o portal agora' : `Portal lido às ${quandoLido}`;
      const titulo = !sol ? 'Lendo suas solicitações no portal…'
        : sol.semAcesso ? 'Não consegui ler suas solicitações agora'
        : suaVez ? `<em data-conta="${suaVez}" data-de="0">${suaVez}</em> ${suaVez === 1 ? 'solicitação espera' : 'solicitações esperam'} sua resposta`
        : total ? `Tudo em dia do seu lado ${icon('check')}` : 'Nenhuma solicitação em aberto';
      const abertas = base.filter(i => ['aguardando', 'andamento'].includes(i.estado));
      const resumo = lido ? [plural(abertas.length, 'em aberto', 'em aberto'), `${abertas.filter(i => i.lado === 'esc').length} com o escritório`, `${abertas.filter(i => i.lado === 'cli').length} com você`]
        .concat(cont.atrasada ? [`${cont.atrasada} ${cont.atrasada === 1 ? 'passou' : 'passaram'} da expectativa`] : []).join(' · ') : 'Os números vêm do próprio portal, com o seu acesso.';
      const passos = passosHtml();
      return `<section class="hj-hero" style="--i:0"${lido ? ' data-pronto' : ''}>
        <div class="hj-hero-g">
          <div class="hj-donut">${anel(fatias, { ativo: MOT[H.filtro] ? H.filtro : null, rotulo: 'em dia', anima: animar, centro: { n: lido ? pctDia : 0, de: animar ? 0 : pctDia, suf: '%' }, titulo: 'Solicitações por situação (clique numa parte para filtrar)' })}</div>
          <div class="hj-hero-tx">
            <span class="hj-eyebrow">Suas solicitações no portal${quandoLido ? ` · lidas às ${quandoLido}` : ''}</span>
            <h2 id="hj-titulo">${titulo}</h2>
            <p>${resumo}</p>
            <div class="hj-tick ${estadoLeitura}${slides.length < 2 ? ' uno' : ''}" id="hj-tick" role="region" aria-label="Avisos, um por vez" aria-live="off">
              <span class="hj-bola" title="${esc(dica)}" aria-label="${esc(dica)}"></span>
              <div class="hj-tick-palco">${slides.length ? slides.map((s, n) => `<button type="button" class="hj-tk${n === 0 ? ' on' : ''}" data-slide="${n}"${n ? ' tabindex="-1" aria-hidden="true"' : ''} style="--c:${s.c}"><span class="hj-tk-tag">${esc(s.tag)}</span><b>${esc(s.txt)}</b><small>${esc(s.sub)}</small></button>`).join('')
                : `<span class="hj-tk on vazio"><b>${!sol ? 'Lendo o portal…' : 'Nada pedindo sua atenção agora.'}</b><small>${sol ? 'Quando o escritório responder, aparece aqui.' : ''}</small></span>`}</div>
              <i class="hj-tick-relogio"><i></i></i>
            </div>
            <div class="hj-legenda">${fatias.filter(f => f.n).map(f => `<span><i style="background:${cor(f.cor)}"></i>${esc(f.rot)} <b>${f.n}</b></span>`).join('')}</div>
          </div>
        </div>
        <div class="hj-passos"><h3>Próximos passos</h3>${passos.html}</div>
      </section>`;
    }
    function slidesDoCarrossel() {
      const out = [];
      for (const p of atencao.slice(0, 12)) {
        const i = p.item;
        out.push({ tag: TAG_MOT[p.motivo], txt: `${i.numero ? `nº ${i.numero} · ` : ''}${i.assunto || nomeTipo(i.tipo)}: ${E.acaoCliente(i, p.motivo).toLowerCase()}`, sub: [comEmpresa && rotEmpresa(i), nomeTipo(i.tipo), empDe(i), i.responsavel && `com ${i.responsavel}`].filter(Boolean).join(' · '), c: cor(MOT[p.motivo].cor), fn: () => abrirDetalhe(i) });
      }
      for (const l of lems) out.push({ tag: 'Lembrete de hoje', txt: l.texto, sub: [l.hora, l.obs].filter(Boolean).join(' · ') || 'Agenda', c: 'var(--blue-deep)', fn: () => editarLembrete(l, E.iso(hoje)) });
      for (const e of prazos) { const [, t] = quando(e.d); out.push({ tag: ROT_EV[e.tipo], txt: e.titulo, sub: [cap(t), e.detalhe].filter(Boolean).join(' · '), c: 'var(--hj-today)', fn: () => abrirDia(E.iso(e.d)) }); }
      slidesDoCarrossel.ultimo = out;
      return out;
    }
    function passosHtml() {
      const li = [], acoes = []; let n = 2;
      const passo = (cls, c, titulo, sub, fn, fim = icon('right', 'ic-sm')) => { acoes.push(fn); li.push(`<li style="--i:${n++}"><button type="button" class="hj-step${cls}" data-passo="${acoes.length - 1}" style="--c:${c}"><i></i><span><b>${esc(titulo)}</b><small>${esc(sub)}</small></span>${fim}</button></li>`); };
      for (const p of atencao.slice(0, 8)) { const i = p.item; passo('', cor(MOT[p.motivo].cor), E.acaoCliente(i, p.motivo), [comEmpresa && rotEmpresa(i), i.numero && `nº ${i.numero}`, i.assunto || nomeTipo(i.tipo), empDe(i)].filter(Boolean).join(' · '), () => abrirDetalhe(i)); }
      for (const x of avisos.filter(x => x.falta != null && x.falta <= 10)) passo('', 'var(--viz-crit)', `Pedir o cálculo ${x.tipo === 'ferias' ? 'de férias' : 'da rescisão'} · pagamento até ${fmt(x.pagamento)}`, [A.nomeCurto(x.item.empregado), x.enviarAte ? `envie até ${fmt(x.enviarAte)}` : ''].filter(Boolean).join(' · '), () => P.novoPedido(x.calculo, { empregado: x.item.empregado }));
      for (const p of prio.filter(p => p.motivo === 'respondida').slice(0, 4)) { const i = p.item; passo('', cor(MOT.respondida.cor), E.acaoCliente(i, 'respondida'), [i.numero && `nº ${i.numero}`, i.assunto || nomeTipo(i.tipo)].filter(Boolean).join(' · '), () => abrirDetalhe(i)); }
      for (const x of legais.filter(x => x.falta <= 5)) passo('', 'var(--viz-crit)', `${x.titulo} até ${fmt(x.alvo)}`, [x.item.empregado, x.ref].filter(Boolean).join(' · '), () => abrirDetalhe(x.item, { aba: 'observar' }));
      for (const l of lems) passo(' n-lem', 'var(--blue-deep)', l.texto, `Lembrete de hoje${l.hora ? ` · ${l.hora}` : ''}`, () => editarLembrete(l, E.iso(hoje)));
      for (const e of prazos) { const [, t] = quando(e.d); passo('', 'var(--hj-today)', e.titulo, `${cap(t)} · ${e.detalhe || ROT_EV[e.tipo]}`, () => abrirDia(E.iso(e.d))); }
      passosHtml.acoes = acoes;
      return { html: li.length ? `<ol class="hj-passos-l" id="hj-passos">${li.join('')}</ol>` : `<div class="hj-zen">${icon('check')}<span>${sol ? 'Nada para fazer agora. Tudo em dia!' : 'Lendo o portal…'}</span></div>` };
    }
    // Equipe: experiência vencendo, férias a vencer e avisos sem o cálculo (com o atalho para pedir)
    function equipeHtml() {
      const linha = (titulo, sub, pill, acao, abrir) => {
        acoesEq.push({ acao: acao?.fn, abrir });
        const n = acoesEq.length - 1;
        return `<div class="pn-li eq-li"${abrir ? ` data-eq-abrir="${n}"` : ''}><div class="main"><b>${esc(titulo)}</b><small>${esc(sub)}</small></div>${pill}${acao ? `<button type="button" class="btn btn-sm" data-eq="${n}">${esc(acao.rotulo)}</button>` : ''}</div>`;
      };
      const pillQ = (d) => { if (!d) return '<span class="pill">sem data</span>'; const [c, t] = quando(d); return `<span class="pill pill-${c}">${t}</span>`; };
      const vazio = (txt) => `<div class="pn-vazio">${icon('check', 'ic-sm')} ${esc(txt)}</div>`;
      const exp = equipe.experiencia.map(x => linha(x.nome, `Fim dos ${x.n} dias em ${fmt(x.fim)} · efetivar, prorrogar ou desligar`, pillQ(x.fim), S.rules.tipos.avisoRescisao ? { rotulo: 'Desligar', fn: () => P.novoPedido('avisoRescisao', { empregado: x.nome }) } : null));
      const fer = equipe.ferias.map(x => linha(x.nome, `${x.falta < 0 ? 'Prazo para conceder passou em' : 'Conceder até'} ${fmt(x.limite)} · período ${x.aquisitivo}`, pillQ(x.limite), S.rules.tipos.avisoFerias ? { rotulo: 'Programar', fn: () => P.novoPedido('avisoFerias', { empregado: x.nome }) } : null));
      const avs = avisos.map(x => linha(x.item.empregado,
        x.tipo === 'ferias'
          ? (x.pagamento ? `Férias${x.inicio ? ` em ${fmt(x.inicio).slice(0, 5)}` : ''} · pedir o cálculo até ${fmt(x.enviarAte).slice(0, 5)} · pagar até ${fmt(x.pagamento).slice(0, 5)}` : 'Aviso de férias sem o cálculo · confira as datas no aviso')
          : (x.pagamento ? `Rescisão · pedir o cálculo até ${fmt(x.enviarAte).slice(0, 5)} · pagar até ${fmt(x.pagamento).slice(0, 5)} (aviso indenizado)` : 'Aviso de rescisão sem o cálculo · confira as datas no aviso'),
        pillQ(x.enviarAte || x.pagamento), S.rules.tipos[x.calculo] ? { rotulo: 'Pedir o cálculo', fn: () => P.novoPedido(x.calculo, { empregado: x.item.empregado }) } : null, () => abrirDetalhe(x.item)));
      const card = (id, titulo, sub, linhas, txtVazio) => `<section class="pn-card" id="${id}"><div class="pn-card-head"><h3>${titulo} <span class="eq-n">${linhas.length}</span></h3><small>${esc(sub)}</small></div><div class="pn-card-body eq-body">${linhas.slice(0, 8).join('') || vazio(txtVazio)}${linhas.length > 8 ? `<button type="button" class="linkish" data-ir="funcionarios" style="justify-self:start">Ver todos (${linhas.length})</button>` : ''}</div></section>`;
      const leg = legais.map(x => linha(x.item.empregado || x.item.assunto || nomeTipo(x.item.tipo), `${x.titulo} até ${fmt(x.alvo)} · ${x.ref}${x.retroativa ? ' · pedido depois do início' : ''}`, pillQ(x.alvo), null, () => abrirDetalhe(x.item, { aba: 'observar' })));
      return `<div class="hj-equipe">
        ${card('eq-legais', 'Prazos legais', 'Pagamento dos cálculos em aberto e eSocial das admissões.', leg, lido ? 'Nenhum prazo legal perto.' : 'Lendo o portal…')}
        ${card('eq-avisos', 'Aviso sem cálculo', 'Férias e rescisões perto do pagamento com só o aviso no portal.', avs, lido ? 'Nenhum aviso esperando o cálculo.' : 'Lendo o portal…')}
        ${card('eq-exp', 'Experiência vencendo', 'Próximos 30 dias, pela data de admissão.', exp, 'Nenhuma experiência vencendo.')}
        ${card('eq-ferias', 'Férias a vencer', 'Prazo para conceder em até 60 dias (estimativa: o portal não informa as férias já tiradas).', fer, 'Nenhuma férias a vencer.')}
      </div>`;
    }
    // Atenção nas suas solicitações (casos do Control Onvio na visão do cliente)
    function casosHtml() {
      if (!casos.length) return '';
      return `<section class="pn-card hj-casos"><div class="pn-card-head"><h3>Atenção nas suas solicitações <span class="eq-n">${casos.length}</span></h3><small>O que pode atrasar o atendimento, lido nas conversas e nos pedidos.</small></div>
        <div class="pn-card-body eq-body">${casos.map(c => {
          const i = c.item;
          const acao = c.tipo === 'abaErrada' ? { rotulo: `Pedir em ${S.rules.tipos[c.aba]?.nome || 'outra aba'}`, fn: () => P.novoPedido(c.aba) }
            : c.tipo === 'duplicada' ? { rotulo: `Ver a nº ${c.outra.numero}`, fn: () => abrirDetalhe(c.outra) }
            : { rotulo: 'Anexar no portal', fn: () => request({ type: 'abrirNoPortal', slug: S.rules.tipos[i.tipo]?.slug, id: i.numero || i.id }) };
          acoesEq.push({ acao: acao.fn, abrir: () => abrirDetalhe(i) });
          const n = acoesEq.length - 1;
          return `<div class="pn-li eq-li caso-${c.tipo}" data-eq-abrir="${n}"><span class="pill pill-${c.tipo === 'anexo' ? 'late' : 'today'}">${ROT_CASO[c.tipo]}</span><div class="main"><b>${esc([i.numero && `nº ${i.numero}`, i.assunto || nomeTipo(i.tipo)].filter(Boolean).join(' · '))}</b><small>${esc(c.porque)}</small></div><button type="button" class="btn btn-sm" data-eq="${n}">${esc(acao.rotulo)}</button></div>`;
        }).join('')}</div></section>`;
    }
    function sitsHtml() {
      return E.MOTIVOS_CLIENTE.map((m, n) => `<button type="button" class="hj-sit${H.filtro === m.k ? ' on' : ''}${!cont[m.k] ? ' zero' : ''}" style="--i:${n + 1};--c:${cor(m.cor)}" data-sit="${m.k}" aria-pressed="${H.filtro === m.k}"><i class="hj-sit-dot"></i><span class="hj-sit-l">${esc(m.rot)}</span><b data-conta="${cont[m.k]}" data-de="${animar ? 0 : cont[m.k]}">${cont[m.k]}</b></button>`).join('');
    }
    // grupos: sem filtro, tudo menos as concluídas; com filtro, só o escolhido
    function cartoesHtml() {
      mostrados = [];
      if (!sol) return `<div class="hj-zen big"><div class="spin"></div><span>Consultando suas solicitações no portal…</span></div>`;
      if (sol.semAcesso) return '';
      const lista = naBusca();
      const gs = E.MOTIVOS_CLIENTE.filter(m => H.filtro ? m.k === H.filtro : m.k !== 'concluida').map(m => ({ m, itens: lista.filter(p => p.motivo === m.k) })).filter(g => g.itens.length);
      if (!gs.length) return `<div class="hj-zen big">${icon(H.q || H.filtro ? 'search' : 'check')}<span>${H.q || H.filtro ? 'Nada com esse filtro.' : total ? 'Nenhuma solicitação em aberto. As concluídas estão em “Concluídas (30 dias)”, acima.' : esc(R.mensagens?.plataformaVazioSolicitacoes || 'Nenhuma solicitação por aqui.')}</span></div>`;
      let n = 7;
      return gs.map(({ m, itens }) => {
        const vis = itens.slice(0, H.vis === 'lista' ? POR_GRUPO * 2 : POR_GRUPO);
        const corpo = H.vis === 'lista'
          ? `<div class="list-card hj-lista">${vis.map(p => linhaHoje(p)).join('')}</div>`
          : `<div class="hj-grade">${vis.map(p => cartaoHoje(p, n++)).join('')}</div>`;
        return `<section class="hj-sec" style="--c:${cor(m.cor)}" data-grupo="${m.k}"><h3>${icon(ICONE_MOT[m.k], 'ic-sm')} ${esc(m.rot)} <span>${itens.length}</span>${itens.length > vis.length ? `<button type="button" class="hj-sec-mais" data-mais="${m.k}">Ver todas as ${itens.length} em Solicitações ${icon('right', 'ic-sm')}</button>` : ''}</h3>${corpo}</section>`;
      }).join('');
    }
    function cartaoHoje(p, n) {
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
    }
    function linhaHoje(p) {
      const i = p.item, mo = p.motivo;
      mostrados.push(i);
      const tag = mo === 'prescreve' && i.prescreveEm != null ? `Prescreve em ${i.prescreveEm} d` : MOT[mo].rot;
      return `<button type="button" class="prio m-${mo}" data-card="${mostrados.length - 1}"><span class="pr-tag">${esc(tag)}</span><span class="mono pr-num">${esc(i.numero || '—')}</span>
        <span class="pr-tx"><b>${esc(i.assunto || nomeTipo(i.tipo))}</b><small>${esc([comEmpresa && rotEmpresa(i), nomeTipo(i.tipo), i.empregado].filter(Boolean).join(' · '))}</small></span>
        <span class="pr-resp">${esc(i.responsavel || '—')}</span><span class="mono pr-d">${i.parado ?? 0}d</span></button>`;
    }

    // ---------- interações ----------
    const ligarCartoes = () => {
      $('#hj-cartoes').querySelectorAll('[data-card]').forEach(b => b.addEventListener('click', () => abrirDetalhe(mostrados[+b.dataset.card])));
      $('#hj-cartoes').querySelectorAll('[data-mais]').forEach(b => b.addEventListener('click', () => { S.plat.filtroSol.aba = ['prescreve', 'responder'].includes(b.dataset.mais) ? 'aguardando' : b.dataset.mais === 'concluida' ? 'encerradas' : 'andamento'; A.setView('pendencias'); }));
    };
    ligarCartoes();
    viewEl.querySelectorAll('[data-eq]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); acoesEq[+b.dataset.eq]?.acao?.(); }));
    viewEl.querySelectorAll('[data-eq-abrir]').forEach(b => b.addEventListener('click', () => acoesEq[+b.dataset.eqAbrir]?.abrir?.()));
    viewEl.querySelectorAll('[data-passo]').forEach(b => b.addEventListener('click', () => passosHtml.acoes[+b.dataset.passo]?.()));
    viewEl.querySelectorAll('[data-slide]').forEach(b => b.addEventListener('click', () => slidesDoCarrossel.ultimo[+b.dataset.slide]?.fn()));
    viewEl.querySelectorAll('[data-motivo], [data-sit]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.motivo || b.dataset.sit; H.filtro = H.filtro === k ? null : k; renderPainel(); }));
    viewEl.querySelectorAll('[data-vis]').forEach(b => b.addEventListener('click', () => { H.vis = b.dataset.vis; gravarPref('hojeVis', H.vis); renderPainel(); }));
    $('#hj-busca').addEventListener('input', (e) => { H.q = e.target.value; $('#hj-cartoes').innerHTML = cartoesHtml(); ligarCartoes(); });   // só os cartões mudam: a busca não perde o foco
    $('#hj-lembrete').addEventListener('click', () => editarLembrete(null, E.iso(E.today())));
    $('#hj-tentar')?.addEventListener('click', () => { S.plat.sol = null; renderPainel(); P.carregarSolicitacoes(true); });
    ligarSeletorEmpresa(viewEl);
    ligarDicas(viewEl);
    if (animar) { viewEl.classList.remove('hj-anim'); void viewEl.offsetWidth; viewEl.classList.add('hj-anim'); setTimeout(() => viewEl.classList.remove('hj-anim'), 1600); animarNumeros(viewEl); }
    iniciarCarrossel($('#hj-tick'));
    marcarRolagem($('#hj-passos'));

    ligarIr(viewEl);
    A.renderSugestao(); A.renderLote(); A.renderAvisosInicio();
  }
  // Carrossel: um aviso por vez. A barra invisível é o relógio (5 s por volta); passar o mouse ou focar pausa.
  function iniciarCarrossel(raiz) {
    if (!raiz) return;
    const sl = [...raiz.querySelectorAll('.hj-tk')];
    if (sl.length < 2) return;
    const ir = () => {
      const at = sl.findIndex(x => x.classList.contains('on')), prox = (at + 1) % sl.length;
      sl.forEach((x, n) => { x.classList.toggle('on', n === prox); x.classList.toggle('sai', n === at); x.tabIndex = n === prox ? 0 : -1; x.setAttribute('aria-hidden', String(n !== prox)); });
    };
    raiz.querySelector('.hj-tick-relogio i').addEventListener('animationiteration', () => { if (!document.hidden && raiz.isConnected) ir(); });
  }
  // Próximos passos: o esmaecido embaixo só aparece quando a lista passa da caixa.
  function marcarRolagem(lst) {
    if (!lst) return;
    // medido pela própria lista (offsetTop contava a altura de tudo acima dela e esmaecia mesmo com um item só)
    const marca = () => {
      const passa = lst.scrollHeight - lst.clientHeight > 2;
      lst.classList.toggle('rola', passa);
      lst.classList.toggle('fim', !passa || lst.scrollTop + lst.clientHeight >= lst.scrollHeight - 2);
    };
    marca(); lst.addEventListener('scroll', marca, { passive: true });
    const ro = new ResizeObserver(() => { if (lst.isConnected) marca(); else ro.disconnect(); });
    ro.observe(lst);
  }
  function ligarIr(root) {
    root.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.aba) S.plat.filtroSol.aba = b.dataset.aba;
      if (b.dataset.sit) S.plat.filtroEmp.sit = b.dataset.sit;
      A.setView(b.dataset.ir);
    }));
  }
  /* =================== SOLICITAÇÕES =================== */
  const ABAS_SOL = [['todas', 'Todas'], ['aguardando', 'Aguardando você'], ['andamento', 'Em andamento'], ['encerradas', 'Concluídas']];
  const naAba = (i, aba) => aba === 'todas' || (aba === 'encerradas' ? ['concluida', 'cancelada', 'prescrita'].includes(i.estado) : i.estado === aba);
  function pillSol(i) {
    const c = { aguardando: 'late', andamento: 'soon', concluida: 'ok', cancelada: 'muted', prescrita: 'muted' }[i.estado] || 'soon';
    return `<span class="pill pill-${c}">${esc(i.status || S.rules.config?.statusSolicitacao?.rotulos?.[i.estado] || i.estado)}</span>`;
  }
  function renderSolicitacoes() {
    const sol = S.plat.sol; const F = S.plat.filtroSol;
    if (!sol) { viewEl.innerHTML = loading('Consultando suas solicitações no portal…'); P.carregarSolicitacoes(); return; }
    const vis = itensVisiveis(), comEmpresa = variasEmpresas(vis);
    const conta = (aba) => vis.filter(i => naAba(i, aba)).length;
    if (F.aba == null) F.aba = conta('aguardando') ? 'aguardando' : 'todas';   // como o "A responder" do Control Onvio
    const tipos = [...new Set(vis.map(i => i.tipo))];
    viewEl.innerHTML = `
      <div class="dp-tabs" role="tablist">${ABAS_SOL.map(([k, t]) => `<button type="button" role="tab" class="dp-tab${F.aba === k ? ' active' : ''}" data-aba-sol="${k}">${t} <span class="dp-tab-badge${k === 'aguardando' && conta(k) ? ' late' : ''}">${conta(k)}</span></button>`).join('')}</div>
      <div class="dp-toolbar">
        <input type="search" id="sol-q" placeholder="Buscar por número, funcionário ou assunto…" value="${esc(F.q)}" autocomplete="off">
        ${seletorEmpresa()}
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
      const lista = vis.filter(i => naAba(i, F.aba) && (!F.tipo || i.tipo === F.tipo) && (!q || E.norm(`${i.numero} ${i.empregado} ${i.assunto} ${nomeTipo(i.tipo)} ${i.responsavel} ${i.empresa}`).includes(q)));
      $('#sol-n').textContent = `${lista.length} de ${vis.length}`;
      $('#sol-list').innerHTML = lista.slice(0, 300).map((i, n) => `<button type="button" class="dp-row sol-cols" data-sol="${n}">
          <span class="mono">${esc(i.numero || '—')}</span><span><span class="ell">${icTipo(i.tipo)}${esc(nomeTipo(i.tipo))}</span>${comEmpresa ? `<span class="sub ell">${esc(rotEmpresa(i))}</span>` : ''}</span><span class="ell">${esc(i.empregado || '—')}</span>
          <span><span class="ell">${esc(i.assunto || '—')}</span>${i.tramite ? `<span class="sub ell">${esc(i.tramite)}</span>` : ''}</span><span>${pillSol(i)}${i.prescreveEm != null ? `<span class="sub">prescreve em ${i.prescreveEm} d</span>` : i.responsavel && i.estado === 'andamento' ? `<span class="sub ell">${esc(i.responsavel)}</span>` : ''}</span><span class="mono">${fmt(i.atualizado)}</span></button>`).join('')
        || `<div class="list-vazio">${esc(S.rules.mensagens?.plataformaVazioSolicitacoes || 'Nada por aqui.')}</div>`;
      $('#sol-list').querySelectorAll('[data-sol]').forEach(b => b.addEventListener('click', () => abrirDetalhe(lista[+b.dataset.sol])));
    };
    desenhar();
    viewEl.querySelectorAll('[data-aba-sol]').forEach(b => b.addEventListener('click', () => { F.aba = b.dataset.abaSol; renderSolicitacoes(); }));
    $('#sol-q').addEventListener('input', A.debounce((e) => { F.q = e.target.value; desenhar(); }, 200));
    ligarSeletorEmpresa(viewEl);
    $('#sol-tipo').addEventListener('change', (e) => { F.tipo = e.target.value; desenhar(); });
    $('#sol-ref').addEventListener('click', () => { S.plat.sol = null; renderSolicitacoes(); P.carregarSolicitacoes(true); });
    $('#sol-tentar')?.addEventListener('click', () => { S.plat.sol = null; renderSolicitacoes(); P.carregarSolicitacoes(true); });
    $('#sol-portal')?.addEventListener('click', () => send({ type: 'modo', modo: 'painel' }));
    $('#sol-geral')?.addEventListener('click', () => request({ type: 'abrirNoPortal', slug: S.rules.tipos[sol.calibrar[0]]?.slug }));
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
    const st = { aba, trs: null, trsErro: false, dados: null, dadosErro: false, datas: { ...(i.datas || {}) } };
    const topo = [['Responsável no escritório', i.responsavel], ['Aberta em', fmt(i.criado)], ['Atualizada', fmt(i.atualizado)], ['Expectativa', i.expectativa ? fmt(i.expectativa) : ''],
      ['Prescreve em', i.prescreveEm != null ? `${i.prescreveEm} dia(s)` : ''], ['Empresa', variasEmpresas(S.plat.sol?.itens) ? i.empresa : '']].filter(([, v]) => v && v !== '—');
    const dlg = dialogo({
      titulo: `${esc(nomeTipo(i.tipo))}${i.numero ? ` <span class="mono" style="font-size:13px;color:var(--ink-3)">nº ${esc(i.numero)}</span>` : ''}`, largo: true,
      corpo: `<div class="dt-top"><div class="dt-assunto"><b>${esc(i.assunto || nomeTipo(i.tipo))}</b>${i.empregado && !E.norm(i.assunto).includes(E.norm(i.empregado)) ? `<small>${esc(i.empregado)}</small>` : ''}</div>${pillSol(i)}</div>
        ${mo ? `<p class="dt-porque">${esc(E.porqueMotivo(i, mo, S.rules))}</p>` : ''}
        <div class="dt-meta">${topo.map(([k, v]) => `<span><small>${esc(k)}</small><b>${esc(v)}</b></span>`).join('')}</div>
        <div class="dt-dq" id="dt-dq"></div>
        <div class="dp-tabs dt-tabs" role="tablist">${[['conversa', 'Conversa'], ['dados', 'Dados'], ['observar', 'O que observar']].map(([k, r]) => `<button type="button" role="tab" class="dp-tab" data-dt="${k}">${r}</button>`).join('')}</div>
        <div class="dt-body" id="dt-body"></div>`,
      acoes: [{ rotulo: `${icon('external', 'ic-sm')} ${i.aguardando ? 'Responder no portal' : 'Ver no portal'}`, cls: 'btn-primary', fn: () => request({ type: 'abrirNoPortal', slug: t?.slug, id: i.numero || i.id }) },
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
    if (t?.apiTramites && i.id) request({ type: 'tramites', base: t.apiTramites, solicitacao: i.id }, 20000).then((r) => {
      if (!r || r.erro) st.trsErro = true;
      else { st.trs = E.tramitesDe(r.itens, i.tipo, S.rules); i.veredito = E.vereditoConversa(st.trs, S.rules) || i.veredito; }
      desenhar();
    }); else { st.trs = []; desenhar(); }
    const lista = t?.apiDetalhe || t?.apiLista;
    if (lista && i.id) request({ type: 'detalheCompleto', lista, solicitacao: i.id }, 20000).then((r) => {
      if (!r?.dados) st.dadosErro = true;
      else {
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

  /* =================== NOVO PEDIDO =================== */
  function renderPedido() {
    const aberto = S.ctx.route?.mode === 'form' && S.ctx.tipo;
    if (aberto && !S.plat.escolher) { A.renderPreencher(); return; }
    const R = S.rules;
    const grupos = new Map();
    for (const it of R.intencoes || []) { const setor = R.tipos[it.tipo]?.setor || 'Outros'; if (!grupos.has(setor)) grupos.set(setor, []); grupos.get(setor).push(it); }
    viewEl.innerHTML = `
      <div id="lote"></div>
      ${S.plat.enviado && Date.now() - S.plat.enviado.quando < 5 * 60e3 ? `<div class="note ok">${icon('check')}<div><b>Solicitação de ${esc(nomeTipo(S.plat.enviado.tipo))} enviada.</b> Quer fazer outra?</div></div>` : ''}
      ${aberto ? `<div class="aviso-linha">${icon('fill')}<span>O pedido de <b>${esc(nomeTipo(S.ctx.tipo))}</b> continua aberto no portal. Escolha outro abaixo ou volte a ele.</span><button type="button" class="btn btn-sm btn-primary" id="pd-continuar">Continuar o pedido ${icon('arrow', 'ic-sm')}</button></div>` : ''}
      <div id="sugestao"></div>
      <div class="pd-escolha">
        <section class="pn-card"><div class="pn-card-head"><h3>O que você precisa pedir ao escritório?</h3><small>Escolha o pedido. Eu abro a solicitação certa no portal e você preenche aqui.</small></div>
          <div class="pn-card-body">${[...grupos].map(([setor, its]) => `<div class="pf-sec">${esc(setor)}</div><div class="tipo-grid">${its.map(it => `<button class="intent" type="button" data-tipo="${esc(it.tipo)}"><span class="ico">${icon(A.ICONS[it.icone] || 'file')}</span><b>${esc(it.titulo)}</b><span>${esc(it.subtitulo || '')}</span></button>`).join('')}</div>`).join('')}</div></section>
        <aside>
          <div class="drop" id="drop-main" role="button" tabindex="0">${icon('upload', 'ic-lg')}<b>Comece por um documento</b><small>Arraste, clique para escolher ou cole um print (Ctrl+V). Eu leio e abro o pedido certo.</small></div>
          <div class="pn-card"><div class="pn-card-body"><label for="free-txt" class="free-l">${icon('chat', 'ic-sm')} Ou escreva com suas palavras</label>
            <textarea id="free-txt" class="input" rows="3" placeholder="Ex.: atestado do João de 3 dias a partir de ontem"></textarea>
            <button class="btn btn-primary btn-sm" id="free-go">Continuar ${icon('arrow', 'ic-sm')}</button></div></div>
          <div id="repetir"></div>
        </aside>
      </div>
      <div id="modelos-ini"></div>
      <div class="search">${icon('search')}<input id="q" type="search" placeholder="Dúvida? Procure: férias, atestado, 13º, rescisão…" aria-label="Procurar uma dúvida"></div>
      <div id="faq"></div>`;
    // qualquer escolha daqui (tipo, texto, documento) volta a mostrar o formulário quando ele abrir
    const mostrarForm = () => { S.plat.escolher = false; };
    $('#pd-continuar')?.addEventListener('click', () => { mostrarForm(); P.render('preencher'); });
    viewEl.querySelectorAll('.intent').forEach(b => b.addEventListener('click', () => { mostrarForm(); A.openTipo(b.dataset.tipo); }));
    $('#drop-main').addEventListener('drop', mostrarForm, true); $('#drop-main').addEventListener('click', mostrarForm, true);
    $('#q').addEventListener('input', (e) => A.renderFaq(e.target.value));
    const go = () => { const t = $('#free-txt').value.trim(); if (t) { mostrarForm(); A.entenderTexto(t); } };
    $('#free-go').addEventListener('click', go);
    $('#free-txt').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    A.bindDrop($('#drop-main'));
    A.renderSugestao(); A.renderLote(); A.renderRepetir(); A.renderModelosInicio();
  }
  /** Abre um pedido já com o funcionário escolhido (atalho da lista de Funcionários e da busca). */
  P.novoPedido = async (tipo, { empregado, valores = {} } = {}) => {
    A.comecarDoZeroSeAbandonado(tipo);
    const W = A.w(tipo);
    // valores vindos de outra tela (funcionário escolhido, simulação do Calcular): valem como digitados pelo cliente
    const dados = { ...(empregado ? { empregado } : {}), ...Object.fromEntries(Object.entries(valores).filter(([k, v]) => v != null && v !== '' && S.rules.tipos[tipo]?.campos?.[k])) };
    for (const [k, v] of Object.entries(dados)) { W.valores[k] = { valor: String(v), conf: 1, fonte: 'você' }; W.editados.add(k); W.fonteVerdade[k] = 'plataforma'; }
    W.rascunhoVisto = true;
    A.gerarTextos(tipo);
    await A.openTipo(tipo, { manter: true });
    for (let k = 0; k < 40 && !(S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo); k++) await esperar(200);
    if (Object.keys(dados).length && S.ctx.tipo === tipo) { await A.loadEmpregados(tipo); await A.fillPortal(tipo, { daPlataforma: true }); }
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
          <span class="row-acts">${x.e.ativo !== false ? `<details class="menu-acts"><summary class="btn btn-sm">Pedir ${icon('arrow', 'ic-sm')}</summary><div class="menu-list">${ACOES_EMP.filter(([t]) => S.rules.tipos[t]).map(([t, r, ic]) => `<button type="button" data-emp="${n}" data-tipo="${t}">${icon(ic, 'ic-sm')} ${r}</button>`).join('')}<button type="button" data-sim-emp="${n}" data-sim="rescisao">${icon('calc', 'ic-sm')} Simular rescisão</button><button type="button" data-sim-emp="${n}" data-sim="ferias">${icon('calc', 'ic-sm')} Simular férias</button></div></details>` : ''}</span></div>`;
      }).join('') || `<div class="list-vazio">${emp.lista.length ? 'Ninguém com esse filtro.' : `Ainda não consegui a lista de funcionários do portal. ${esc(S.rules.mensagens?.plataformaSemAcesso || '')}`}${emp.lista.length ? '' : `<div class="actions" style="justify-content:center;margin-top:10px"><button class="btn btn-sm btn-primary" id="emp-tentar">${icon('refresh', 'ic-sm')} Tentar de novo</button></div>`}</div>`;
      $('#emp-list').querySelectorAll('[data-emp]').forEach(b => b.addEventListener('click', () => { b.closest('details').removeAttribute('open'); P.novoPedido(b.dataset.tipo, { empregado: lista[+b.dataset.emp].e.nome }); }));
      $('#emp-list').querySelectorAll('[data-sim-emp]').forEach(b => b.addEventListener('click', () => {
        const x = lista[+b.dataset.simEmp]; b.closest('details').removeAttribute('open');
        prepararSimulacao(b.dataset.sim, { quem: x.e.nome, admissao: x.s.admissao ? E.fmtDate(x.s.admissao) : '' });
        S.ferramenta = b.dataset.sim === 'rescisao' ? 'simRescisao' : 'simFerias'; A.setView('ferramentas');
      }));
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
      grupos.push(['Solicitações', (S.plat.sol?.itens || []).filter(i => bate(`${i.numero} ${i.empregado} ${i.assunto} ${nomeTipo(i.tipo)} ${i.empresa}`)).slice(0, 5).map(i => ({ titulo: i.assunto || nomeTipo(i.tipo), sub: `${variasEmpresas(S.plat.sol?.itens) ? `${rotEmpresa(i)} · ` : ''}${nomeTipo(i.tipo)}${i.numero ? ` · nº ${i.numero}` : ''} · ${i.status}`, ic: 'list', fn: () => abrirDetalhe(i) }))]);
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
