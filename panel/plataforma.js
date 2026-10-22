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
    escolher: false, empresaFiltro: '', filtroSol: { motivo: null, q: '', tipo: '', vis: null }, filtroEmp: { q: '', sit: 'ativos' },
    agenda: { ano: hoje0.getFullYear(), mes: hoje0.getMonth(), filtro: '' }, docAba: 'solicitacoes', enviado: null
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
  /* Seletor de empresas (2.5): botão com o resumo da escolha e uma janelinha com caixas de marcar — uma, várias ou
     todas. Cada empresa mostra quantas solicitações tem em aberto e quantas esperam o cliente. A escolha fica só na
     memória (volta para a empresa do portal quando ela muda). */
  function seletorEmpresa() {
    const todas = S.plat.sol?.itens || [], emps = E.empresasDasSolicitacoes(todas);
    if (emps.length <= 1) return '';
    const sel = E.empresasSelecionadas(todas, S.plat.empresaFiltro, S.ctx.empresa);
    const doPortal = E.empresaDoFiltro(todas, '', S.ctx.empresa);
    sel.sort((a, b) => (b === doPortal) - (a === doPortal));   // o resumo começa pela empresa aberta no portal
    const apelido = (nome) => todas.find(i => i.empresa === nome)?.empresaApelido || nome;
    const rot = sel.length === emps.length ? `Todas as empresas (${emps.length})` : sel.length === 1 ? apelido(sel[0]) : `${apelido(sel[0])} + ${sel.length - 1}`;
    const linhas = [...emps].sort((a, b) => (b.nome === doPortal) - (a.nome === doPortal)).map(e => {
      const dela = todas.filter(i => i.empresa === e.nome);
      const abertas = dela.filter(i => ['aguardando', 'andamento'].includes(i.estado)).length, suas = dela.filter(i => i.aguardando).length;
      const ap = apelido(e.nome);
      return `<label class="es-li" data-nome="${esc(e.nome)}"><input type="checkbox" value="${esc(e.nome)}"${sel.includes(e.nome) ? ' checked' : ''}>
        <span class="es-tx"><b>${esc(ap)}${e.nome === doPortal ? ' <span class="es-tag">aberta no portal</span>' : ''}</b>${ap !== e.nome ? `<small>${esc(e.nome)}</small>` : ''}</span>
        <span class="es-n">${suas ? `<em>${suas} esperam você</em>` : ''}<span>${abertas} em aberto</span></span>
        <button type="button" class="es-so" data-so="${esc(e.nome)}" title="Mostrar só esta empresa">só esta</button></label>`;
    }).join('');
    return `<details class="emp-sel"><summary class="btn btn-sm" aria-label="Escolher as empresas">${icon('briefcase', 'ic-sm')}<span class="es-rot">${esc(rot)}</span><span class="es-seta" aria-hidden="true">▾</span></summary>
      <div class="es-pop" role="dialog" aria-label="Empresas">
        <div class="es-head"><b>Empresas</b><small>Escolha uma ou mais para ver as solicitações juntas.</small></div>
        ${emps.length > 6 ? '<input type="search" class="es-q" placeholder="Buscar empresa…" autocomplete="off">' : ''}
        <div class="es-rap"><button type="button" class="btn btn-sm btn-ghost" data-es="todas">Marcar todas</button><button type="button" class="btn btn-sm btn-ghost" data-es="portal">Só a aberta no portal</button></div>
        <div class="es-lista">${linhas}</div>
        <div class="es-pe"><span class="es-cont"></span><button type="button" class="btn btn-sm" data-es="cancelar">Cancelar</button><button type="button" class="btn btn-sm btn-primary" data-es="aplicar">Mostrar</button></div>
      </div></details>`;
  }
  function ligarSeletorEmpresa(root) {
    root.querySelectorAll('.emp-sel').forEach(d => {
      const todas = S.plat.sol?.itens || [], nomes = E.empresasDasSolicitacoes(todas).map(e => e.nome);
      const doPortal = E.empresaDoFiltro(todas, '', S.ctx.empresa);
      const caixas = () => [...d.querySelectorAll('.es-lista input[type=checkbox]')];
      const aplicar = (escolha) => {
        // a empresa do portal sozinha volta ao padrão (''): segue a empresa quando ela muda no portal
        S.plat.empresaFiltro = escolha.length === nomes.length ? '*' : escolha.length === 1 && escolha[0] === doPortal ? '' : escolha;
        d.open = false; atualizarBadge(); P.render(S.view);
      };
      const contar = () => {
        const n = caixas().filter(c => c.checked).length;
        d.querySelector('.es-cont').textContent = n ? `${n} de ${nomes.length} marcada(s)` : 'Marque ao menos uma';
        const ap = d.querySelector('[data-es="aplicar"]'); ap.disabled = !n; ap.textContent = n === nomes.length ? 'Mostrar todas' : n > 1 ? `Mostrar ${n} empresas` : 'Mostrar';
      };
      d.addEventListener('toggle', () => { if (d.open) { contar(); d.querySelector('.es-q, .es-lista input')?.focus(); } });
      d.querySelector('.es-lista').addEventListener('change', contar);
      d.querySelectorAll('[data-so]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); aplicar([b.dataset.so]); }));
      d.querySelector('[data-es="todas"]').addEventListener('click', () => { const tudo = caixas().every(c => c.checked); caixas().forEach(c => { c.checked = !tudo; }); contar(); });
      d.querySelector('[data-es="portal"]').addEventListener('click', () => aplicar([doPortal === '*' ? nomes[0] : doPortal]));
      d.querySelector('[data-es="cancelar"]').addEventListener('click', () => { d.open = false; });
      d.querySelector('[data-es="aplicar"]').addEventListener('click', () => aplicar(caixas().filter(c => c.checked).map(c => c.value)));
      d.querySelector('.es-q')?.addEventListener('input', (e) => { const q = E.norm(e.target.value); d.querySelectorAll('.es-li').forEach(l => { l.hidden = !!q && !E.norm(l.textContent).includes(q); }); });
      d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); d.open = false; d.querySelector('summary').focus(); } });
      // clicar fora fecha (sem aplicar)
      const fora = (e) => { if (!d.isConnected) { document.removeEventListener('pointerdown', fora, true); return; } if (d.open && !d.contains(e.target)) d.open = false; };
      document.addEventListener('pointerdown', fora, true);
    });
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
  /* Indicador da leitura (2.5.2): estado (conectado, lendo, em parte, sem leitura), há quanto tempo leu, um anel até a
     próxima leitura automática e, ao abrir, o que foi lido e a garantia de que nada sai do computador. */
  const segLeitura = () => Math.max(15, +S.rules?.config?.leituraAutomaticaSegundos || 30);
  const haQuanto = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 5 ? 'agora' : s < 60 ? `há ${s} s` : s < 3600 ? `há ${Math.round(s / 60)} min` : `há ${Math.round(s / 3600)} h`; };
  const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let tiqueSync = null;
  function estadoLeitura() {
    const sol = S.plat.sol;
    if (!sol) return 'lendo';
    if (!sol.ok || sol.semAcesso || (S.plat.falhaLeitura || 0) > sol.quando) return 'erro';
    if (sol.erros.length) return 'parcial';
    return 'ok';
  }
  function atualizarSync(txt) {
    const el = $('#plat-sync'); if (!el) return;
    const sol = S.plat.sol, st = txt ? 'lendo' : estadoLeitura();
    const rot = { ok: 'Portal conectado', lendo: txt || 'Lendo o portal…', parcial: 'Portal lido em parte', erro: 'Sem leitura do portal' }[st];
    const aberto = el.querySelector('details')?.open;
    const empresas = E.empresasDasSolicitacoes(sol?.itens || []).length;
    const linha = (k, v) => `<div class="sy-l"><span>${k}</span><b>${v}</b></div>`;
    el.innerHTML = `<details class="sync-d st-${st}"${aberto ? ' open' : ''}><summary title="Situação da leitura do portal">
        <span class="sync-dot" aria-hidden="true"></span>
        <span class="sync-t"><b>${esc(rot)}</b><small data-sync-rel>${sol?.quando && st !== 'lendo' ? `lido ${haQuanto(Date.now() - sol.quando)}` : st === 'lendo' ? 'consultando as suas listas' : ''}</small></span>
        ${st === 'lendo' ? '<span class="spin sync-spin"></span>' : `<span class="sync-anel" data-sync-anel title="Próxima leitura automática"></span>`}
      </summary>
      <div class="sync-pop" role="dialog" aria-label="Leitura do portal">
        <div class="sy-head"><span class="sync-dot"></span><b>${esc(rot)}</b></div>
        ${sol ? `${linha('Última leitura', `${hora(sol.quando)} · <span data-sync-rel2>${haQuanto(Date.now() - sol.quando)}</span>`)}
        ${linha('Próxima leitura', `<span data-sync-prox>—</span>`)}
        ${linha('Solicitações lidas', `${sol.itens.length}${empresas > 1 ? ` · ${empresas} empresas` : ''}`)}
        ${S.plat.emp ? linha('Funcionários', `${S.plat.emp.lista.filter(e => e.ativo !== false).length} ativos`) : ''}
        ${sol.erros.length ? `${linha('Não lidas', esc(sol.erros.map(nomeTipo).join(', ')))}<ul class="sy-causas">${(S.rules?.mensagens?.leituraPortal?.causasParcial || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}` : ''}
        <p class="sy-conf">${icon('lock', 'ic-sm')}<span>O Assistente lê o portal com o seu próprio acesso, a cada ${segLeitura()} segundos, e só mostra aqui. Nada é enviado a outro lugar.</span></p>
        <button type="button" class="btn btn-sm" id="plat-ref">${icon('refresh', 'ic-sm')} Ler agora</button>
      </div></details>`;
    $('#plat-ref')?.addEventListener('click', () => { el.querySelector('details').open = false; P.carregarSolicitacoes(true); P.carregarEmpregados(true).then(() => P.render(S.view)); });
    tiqueRelogio();
    if (!tiqueSync) tiqueSync = setInterval(tiqueRelogio, 1000);
  }
  // só os textos que mudam com o tempo (sem redesenhar o indicador)
  function tiqueRelogio() {
    const el = $('#plat-sync'), sol = S.plat.sol; if (!el || !sol?.quando) return;
    const rel = haQuanto(Date.now() - sol.quando);
    el.querySelectorAll('[data-sync-rel]').forEach(x => { x.textContent = `lido ${rel}`; });
    el.querySelectorAll('[data-sync-rel2]').forEach(x => { x.textContent = rel; });
    const prox = S.plat.proximaLeitura, total = segLeitura() * 1000;
    const falta = prox ? Math.max(0, prox - Date.now()) : null;
    el.querySelectorAll('[data-sync-anel]').forEach(x => { x.style.setProperty('--p', falta == null ? '0%' : `${Math.round((1 - falta / total) * 100)}%`); });
    el.querySelectorAll('[data-sync-prox]').forEach(x => { x.textContent = falta == null ? 'automática' : falta < 1000 ? 'agora' : `em ${Math.ceil(falta / 1000)} s`; });
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
    S.plat.proximaLeitura = Date.now() + seg * 1000;
    relogio = setInterval(() => {
      S.plat.proximaLeitura = Date.now() + seg * 1000;
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
        for (const it of g.itens || []) { const n = E.normalizarSolicitacao(it, g.tipo, S.rules); n.status = D.valorPt(n.status); itens.push(n); }   // situação em inglês → português
        (g.chaves || []).forEach(k => chaves.add(k));
      }
      itens.sort((a, b) => (b.atualizado?.getTime() || 0) - (a.atualizado?.getTime() || 0));
      const consultados = (r?.data || []).filter(g => !g.calibrar).length;
      // leitura automática que falhou: fica o que já estava na tela
      if (silencioso && S.plat.sol && (!r || (consultados && erros.length === consultados))) { S.plat.falhaLeitura = Date.now(); atualizarSync(); avisoLeitura(); return S.plat.sol; }
      aplicarDatasGuardadas(itens); aplicarVereditos(itens);
      S.plat.sol = { itens, erros, calibrar, truncado, ok: !!r, quando: Date.now(), chaves: [...chaves], codigos, semAcesso: !!consultados && erros.length === consultados };
      atualizarBadge();
      atualizarSync(); avisoLeitura();
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
    montarCasca(); atualizarCabecalho(); atualizarSync(); avisoLeitura(); carregarRascunhos();
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
  /* Janela do portal (2.5.2): nunca fica fixa na tela. Aparece por cima quando é a resposta a algo que o cliente
     acabou de fazer, ou quando ele tenta agir no portal (abrir, preencher, enviar) com ela ainda aberta. */
  let atencaoMostrada = '';
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { S.plat.ultimoGesto = Date.now(); }, true));
  P.atencao = (m) => {
    S.plat.atencao = m.texto && m.ativo !== false ? { texto: m.texto } : null;
    if (!S.plat.atencao) { atencaoMostrada = ''; return; }
    if (Date.now() - Math.max(S.plat.ultimoGesto || 0, S.plat.ultimaAcao || 0) < 10000) mostrarAtencao();
  };
  S.antesDeAgir = () => {
    S.plat.ultimaAcao = Date.now();
    if (S.plat.atencao && document.body.classList.contains('plat')) setTimeout(() => mostrarAtencao(true), 0);
  };
  function mostrarAtencao(deNovo) {
    const a = S.plat.atencao; if (!a || (!deNovo && atencaoMostrada === a.texto)) return;
    if (!$('#modal').hidden && $('#modal').querySelector('.dlg-atencao')) return;
    atencaoMostrada = a.texto;
    const dica = (S.rules.config?.dicasAvisoPortal || []).find(d => { try { return new RegExp(d.padrao, 'i').test(a.texto); } catch { return false; } });
    dialogo({
      titulo: `${icon('alert')} ${esc(S.rules?.mensagens?.plataformaAtencao || 'O portal mostrou um aviso')}`,
      corpo: `<div class="dlg-atencao"><p class="muted" style="margin:0 0 8px">O portal abriu esta mensagem por baixo da plataforma:</p><blockquote class="at-txt">${esc(a.texto)}</blockquote>
        ${dica ? `<div class="note" style="margin:10px 0 0">${icon('info')}<div>${esc(dica.dica)}</div></div>` : ''}</div>`,
      acoes: [{ rotulo: 'Fechar' }, '|', { rotulo: `${icon('external', 'ic-sm')} Ver no portal`, cls: 'btn-primary', fn: () => send({ type: 'modo', modo: 'painel' }) }]
    });
  }
  /* O único aviso fixo: quando o Assistente não consegue ler o portal, com as causas prováveis e o que fazer. */
  function avisoLeitura() {
    const el = $('#plat-aviso'); if (!el) return;
    const sol = S.plat.sol, L = S.rules?.mensagens?.leituraPortal || {};
    // leitura parcial (um tipo não lido) não vira faixa: fica no indicador, em âmbar, com o que fazer
    const total = !!sol && (!sol.ok || sol.semAcesso || (S.plat.falhaLeitura || 0) > sol.quando);
    if (!total) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="note warn leit-aviso" role="alert">${icon('alert')}<div style="flex:1;min-width:0">
        <b>${esc(L.titulo || 'Não consegui ler o portal agora.')}</b> <span class="muted">${esc(L.sub || 'Os números da tela podem estar desatualizados.')}</span>
        ${(L.causas || []).length ? `<details class="leit-causas" open><summary>Possíveis causas e o que fazer</summary><ol>${L.causas.map(c => `<li>${esc(c)}</li>`).join('')}</ol></details>` : ''}
        <div class="actions" style="margin-top:8px"><button class="btn btn-sm btn-primary" id="leit-tentar">${icon('refresh', 'ic-sm')} Tentar de novo</button><button class="btn btn-sm" id="leit-portal">${icon('external', 'ic-sm')} Ver no portal</button><button class="btn btn-sm btn-ghost" id="leit-diag">${icon('copy', 'ic-sm')} Copiar diagnóstico</button></div></div></div>`;
    $('#leit-tentar').addEventListener('click', () => { S.plat.falhaLeitura = 0; P.carregarSolicitacoes(true); });
    $('#leit-portal').addEventListener('click', () => send({ type: 'modo', modo: 'painel' }));
    $('#leit-diag').addEventListener('click', () => A.copiarDiagnostico?.());
  }
  P.aoEnviar = (tipo, valores = {}) => {
    S.plat.enviado = { tipo, quando: Date.now() };
    // o passo seguinte (regras: tipos.*.depoisDeEnviar), menos o que o lote já vai abrir
    const lote = S.lote && !S.lote.concluido ? S.lote.pedidos.filter(x => x.status === 'pendente').map(x => x.tipo) : [];
    const passos = E.proximosPassos(tipo, valores, S.rules).filter(x => !(x.tipo && lote.includes(x.tipo)));
    S.plat.proximo = passos.length ? { passos, quando: Date.now(), de: tipo } : null;
    setTimeout(() => P.carregarSolicitacoes(true), 1500);
    carregarRascunhos();
  };
  /* Cartão "Próximo: … até DD/MM" depois do envio, com "Preparar agora" (já com os dados do pedido enviado) e "Me lembrar"
     (vira lembrete na Agenda com "Fazer agora"). O passo some quando o portal já tem o pedido desse funcionário. */
  const passosAbertos = () => {
    const pr = S.plat.proximo; if (!pr || Date.now() - pr.quando > 6 * 3600e3) return [];
    return pr.passos.filter(x => !x.feito && !(x.tipo && E.temPedidoDe(S.plat.sol?.itens, x.tipo, x.empregado, new Date(pr.quando))));
  };
  P.renderProximo = (el) => {
    if (!el) return;
    const l = passosAbertos();
    el.innerHTML = l.map((x, n) => `<div class="note ok proximo" data-prox="${n}">${icon(x.tipo ? 'arrow' : 'clock')}<div style="flex:1;min-width:0"><b>Próximo: ${esc(x.titulo)}${x.ate ? ` até ${fmt(x.ate)}` : ''}</b>${x.dica ? `<br><small class="muted">${esc(x.dica)}</small>` : ''}
      <div class="actions" style="margin-top:6px">${x.tipo ? `<button type="button" class="btn btn-sm btn-primary" data-prox-fazer="${n}">Preparar agora</button>` : ''}<button type="button" class="btn btn-sm" data-prox-lembrar="${n}">${icon('clock', 'ic-sm')} Me lembrar</button><button type="button" class="btn btn-sm btn-ghost" data-prox-x="${n}">Dispensar</button></div></div></div>`).join('');
    el.querySelectorAll('[data-prox-fazer]').forEach(b => b.addEventListener('click', () => { const x = l[+b.dataset.proxFazer]; x.feito = true; fazerAgora({ tipo: x.tipo, empregado: x.empregado, valores: x.valores, fonte: 'do pedido enviado' }); }));
    el.querySelectorAll('[data-prox-lembrar]').forEach(b => b.addEventListener('click', async () => {
      const x = l[+b.dataset.proxLembrar]; x.feito = true;
      const d = x.ate && x.ate >= E.today() ? x.ate : E.addDays(E.today(), 1);
      const lem = { id: Date.now().toString(36), texto: x.titulo, data: E.iso(d), hora: '', rep: 'nao', intervalo: 1, ate: '', obs: x.dica || '', pular: [], ...(x.tipo ? { pedir: { tipo: x.tipo, empregado: x.empregado, valores: x.valores, fonte: 'do pedido enviado' } } : {}) };
      S.plat.lembretes = [...S.plat.lembretes, lem]; await chrome.storage.local.set({ lembretes: S.plat.lembretes });
      toast(`Lembrete na Agenda para ${fmt(d)}.`); P.renderProximo(el);
    }));
    el.querySelectorAll('[data-prox-x]').forEach(b => b.addEventListener('click', () => { l[+b.dataset.proxX].feito = true; P.renderProximo(el); }));
  };
  /** "Fazer agora" de um evento da Agenda, de um lembrete ou do próximo passo: abre o pedido já com os dados. */
  function fazerAgora(x) {
    if (!x?.tipo || !S.rules.tipos[x.tipo]) return;
    const { empregado, ...resto } = x.valores || {};
    P.novoPedido(x.tipo, { empregado: x.empregado || empregado, sugeridos: resto, fonte: x.fonte || 'do pedido enviado' });
  }
  P.fazerAgora = fazerAgora;
  /* Rascunhos da empresa (guardados 7 dias neste computador): para o cartão "Para terminar" do Hoje. */
  async function carregarRascunhos() {
    try {
      const { rascunhos = {} } = await chrome.storage.local.get('rascunhos');
      const antes = JSON.stringify(S.plat.rascunhos || {});
      S.plat.rascunhos = rascunhos;
      if (antes !== JSON.stringify(rascunhos) && S.view === 'inicio' && document.body.classList.contains('plat') && seguroRedesenhar()) P.render('inicio');
    } catch { /* sem armazenamento */ }
  }
  async function continuarRascunho(tipo, r) {
    const W = A.w(tipo);
    for (const [k, v] of Object.entries(r.valores || {})) W.valores[k] = v;
    (r.editados || []).forEach(k => W.editados.add(k));
    W.rascunhoVisto = true;
    A.gerarTextos(tipo, true);
    await A.openTipo(tipo, { manter: true });
    for (let k = 0; k < 40 && !(S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo); k++) await esperar(200);
    if (S.ctx.tipo === tipo) A.fillPortal(tipo, { silencioso: true });
  }

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
    for (const p of A.prazosDoHistorico(hist)) if (dentro(p.d)) out.push({ d: p.d, tipo: 'pedido', titulo: p.titulo, detalhe: [p.detalhe, nomeTipo(p.h.tipo)].filter(Boolean).join(' · '), pedir: p.pedir || null });
    for (const e of empregadosAtivos()) {
      const s = E.situacaoEmpregado(e, E.today(), S.rules);
      for (const x of s.experiencia) if (dentro(x.fim)) out.push({ d: x.fim, tipo: 'exp', titulo: `Fim da experiência (${x.n} dias)`, detalhe: A.nomeCurto(e.nome) });
    }
    for (const l of S.plat.lembretes) for (const d of E.ocorrencias(l, de, ate, cal)) out.push({ d, tipo: 'lembrete', titulo: l.texto, detalhe: [l.hora, l.obs].filter(Boolean).join(' · '), lembrete: l, pedir: l.pedir && !E.temPedidoDe(S.plat.sol?.itens, l.pedir.tipo, l.pedir.empregado, E.parseDate(l.data) && E.addDays(E.parseDate(l.data), -30)) ? l.pedir : null });
    for (const f of S.rules.feriados || []) { const d = E.parseDate(f); if (dentro(d)) out.push({ d, tipo: 'feriado', titulo: 'Feriado', detalhe: '' }); }
    return out.sort((a, b) => a.d - b.d || a.tipo.localeCompare(b.tipo));
  }
  const ROT_EV = { legal: 'Prazo legal', pedido: 'Da solicitação', exp: 'Experiência', lembrete: 'Lembrete', feriado: 'Feriado' };
  // eventos de pedido (e lembretes de um pedido) ganham "Fazer agora": abre o pedido já com os dados
  const linhaEvento = (e, n) => { const [c, t] = quando(e.d); return `<div class="pn-li" data-ev-iso="${E.iso(e.d)}"><div class="ag-d"><b>${String(e.d.getDate()).padStart(2, '0')}</b><small>${e.d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></div><div class="main"><b>${esc(e.titulo)}</b><small>${esc(e.detalhe || ROT_EV[e.tipo])}</small></div>${e.pedir && n != null ? `<button type="button" class="btn btn-sm" data-fazer="${n}">Fazer agora</button>` : ''}<span class="pill pill-${c}">${t}</span></div>`; };

  /* =================== HOJE (2.1) =================== */
  /* No formato da tela Hoje do Control Onvio (repositório do escritório), na visão do cliente: rosca "% em dia",
     quantas esperam sua resposta, carrossel (um aviso por vez, com a bolinha da leitura do portal) e "Próximos passos".
     Embaixo: situações (filtros) e cartões agrupados por motivo. A classificação é uma só (E.motivoCliente /
     E.prioridadesCliente), para a rosca, as situações e os cartões baterem. */
  const MOT = Object.fromEntries(E.MOTIVOS_CLIENTE.map(m => [m.k, m]));
  const ICONE_MOT = { prescreve: 'clock', responder: 'chat', atrasada: 'alert', respondida: 'check', escritorio: 'briefcase', concluida: 'check' };
  const ROT_CASO = { anexo: 'Anexo não chegou', duplicada: 'Parece repetida', abaErrada: 'Aba certa' };
  const TAG_MOT = { prescreve: 'Prescreve', responder: 'Sua vez', atrasada: 'Passou da expectativa', respondida: 'Respondida', escritorio: 'Com o escritório', concluida: 'Concluída' };
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const lerPref = (k, p) => { try { return localStorage.getItem(`ct.${k}`) || p; } catch { return p; } };
  const gravarPref = (k, v) => { try { localStorage.setItem(`ct.${k}`, v); } catch { /* sem armazenamento: vale só nesta visita */ } };
  const empDe = (i) => (i.empregado && !E.norm(i.assunto).includes(E.norm(i.empregado)) ? i.empregado : '');   // sem repetir o nome que já está no assunto
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const lembretesDeHoje = () => { const h = E.today(); const cal = E.makeCalendar(S.rules.feriados); return S.plat.lembretes.filter(l => E.ocorrencias(l, h, h, cal).length); };

  /* ---------- Atalhos que abrem um pedido já com dados (20, 21, 40) ---------- */
  const admissaoDe = (nome) => A.admissaoDe?.(nome) || E.parseDate((S.plat.emp?.lista || []).find(e => E.norm(e.nome) === E.norm(nome))?.admissao) || null;
  /** "Pedir o cálculo" de um aviso que está no portal: início, dias e abono (ou a data do aviso) entram como sugestão "do aviso nº X". */
  async function pedirCalculoDoAviso(i, datas = null) {
    let item = datas ? { ...i, datas: { ...(i.datas || {}), ...datas } } : i;
    let vv = E.valoresDoAviso(item, S.rules);
    if (!Object.keys(vv.valores).length && i.id) {   // datas ainda não lidas: lê o detalhe na hora
      const r = await request({ type: 'datasAviso', lista: S.rules.tipos[i.tipo]?.apiDetalhe || S.rules.tipos[i.tipo]?.apiLista, solicitacao: i.id }, 15000);
      if (r?.datas) { item = { ...i, datas: { ...(i.datas || {}), ...Object.fromEntries(Object.entries(E.datasDoAviso(r.datas)).filter(([, v]) => v != null)) } }; vv = E.valoresDoAviso(item, S.rules); }
    }
    if (!vv.tipo || !S.rules.tipos[vv.tipo]) return;
    await P.novoPedido(vv.tipo, { empregado: i.empregado, sugeridos: vv.valores, fonte: vv.fonte });
    const W = A.w(vv.tipo); W.avisoUsado = true;
  }
  /** "Pedir de novo" no detalhe de uma solicitação do portal (feita aqui, direto no portal ou em outra máquina): um pedido do
   *  mesmo tipo, para a mesma empresa, com os valores lidos do detalhe (regras: campos.*.api) — sem datas, sem assunto e
   *  descrição, sem dados de saúde; num cadastro, só os campos da empresa. Tudo entra como sugestão "da solicitação nº X". */
  async function pedirDeNovo(i, bruto = null) {
    const t = S.rules.tipos[i.tipo]; if (!t) return;
    if (!bruto && i.id && (t.apiDetalhe || t.apiLista)) bruto = (await request({ type: 'detalheCompleto', lista: t.apiDetalhe || t.apiLista, solicitacao: i.id }, 20000))?.dados || null;
    const vals = E.valoresDoDetalhe(i.tipo, bruto || {}, S.rules);
    // o funcionário da lista, se o detalhe não trouxe (num cadastro, a pessoa é outra: nunca vai)
    if (!vals.empregado && i.empregado && E.resolveTipo(S.rules, i.tipo)?.campos?.empregado) vals.empregado = i.empregado;
    const { empregado, ...resto } = vals;
    await P.novoPedido(i.tipo, { empregado, sugeridos: resto, fonte: i.numero ? `da solicitação nº ${i.numero}` : 'da solicitação no portal', empresa: i.empresa || undefined });
  }
  /** "Programar" férias a vencer: o aviso já com a 1ª data de início que vale (30 dias de antecedência, fora de sexta e véspera de feriado). */
  function programarFerias(nome) {
    const ini = E.primeiroInicioFerias(E.addDays(E.today(), +S.rules.config?.avisoFeriasDias || 30), S.rules);
    P.novoPedido('avisoFerias', { empregado: nome, sugeridos: { inicioGozo: E.fmtDate(ini) }, fonte: 'sugestão: 1ª data que vale' });
  }
  /* Experiência que vence: três saídas (regras: config.experienciaSaidas). Efetivar só dispensa o aviso (fica neste computador). */
  const chaveExp = (nome, n) => `${S.ctx.empresa}|${E.norm(nome)}|${n}`;
  const lerEfetivados = () => { try { return JSON.parse(localStorage.getItem('ct.expEfetivados') || '[]'); } catch { return []; } };
  const expEfetivado = (nome, n) => lerEfetivados().includes(chaveExp(nome, n));
  const textoCfg = (t, vals) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? '');
  function acoesExperiencia(nome, adm, n) {
    const cfg = S.rules.config?.experienciaSaidas || {};
    const sx = adm ? E.saidasExperiencia(E.iso(adm), n, S.rules) : null;
    const out = [];
    if (sx?.podeProrrogar && cfg.prorrogar !== false) out.push({ rotulo: cfg.prorrogar?.rotulo || 'Prorrogar', titulo: 'Termo de prorrogação pelo modelo e o pedido ao escritório', fn: () => prorrogarExperiencia(nome, adm, n) });
    if (S.rules.tipos.calculoRescisao && cfg.encerrar !== false) out.push({ rotulo: cfg.encerrar?.rotulo || 'Encerrar no fim', titulo: cfg.encerrar?.explicacao || '', fn: () => encerrarExperiencia(nome, adm, n) });
    out.push({ rotulo: cfg.efetivar?.rotulo || 'Efetivar', cls: 'btn-ghost', fn: () => efetivarExperiencia(nome, adm, n) });
    return out;
  }
  function prorrogarExperiencia(nome, adm, n) {
    const cfg = S.rules.config?.experienciaSaidas?.prorrogar || {};
    const sx = E.saidasExperiencia(E.iso(adm), n, S.rules); if (!sx) return;
    const vals = { empregado: nome, dataAdmissao: E.fmtDate(adm), diasProrrogacao: String(sx.diasProrrogacao), fimProrrogacao: E.fmtDate(sx.fimProrrogacao), max: sx.max, fim: E.fmtDate(sx.fim) };
    const md = (S.rules.modelosDocumento || []).find(m => m.id === (cfg.modelo || 'prorrogacaoExperiencia'));
    const pedido = cfg.pedido && S.rules.tipos[cfg.pedido] ? cfg.pedido : null;
    const abrirPedido = () => P.novoPedido(pedido, { valores: Object.fromEntries(Object.entries(cfg.valores || {}).map(([k, v]) => [k, textoCfg(v, vals)])) });
    if (md) abrirModelo(md, E.valoresDoModelo(md, vals), { nota: textoCfg(cfg.explicacao, vals), acao: pedido ? { rotulo: `${icon('fill', 'ic-sm')} Abrir o pedido ao escritório`, fn: abrirPedido } : null });
    else if (pedido) abrirPedido();
  }
  function encerrarExperiencia(nome, adm, n) {
    const cfg = S.rules.config?.experienciaSaidas || {};
    const sx = E.saidasExperiencia(E.iso(adm), n, S.rules); if (!sx) return;
    const motivo = cfg.motivos?.termino || 'Término de contrato de trabalho por tempo determinado';
    P.novoPedido(cfg.encerrar?.pedido && S.rules.tipos[cfg.encerrar.pedido] ? cfg.encerrar.pedido : 'calculoRescisao', { empregado: nome, valores: { motivo, dataDemissao: E.fmtDate(sx.fim) } });
    if (cfg.encerrar?.explicacao) toast(cfg.encerrar.explicacao);
  }
  function efetivarExperiencia(nome, adm, n) {
    const cfg = S.rules.config?.experienciaSaidas?.efetivar || {};
    const sx = adm ? E.saidasExperiencia(E.iso(adm), n, S.rules) : null;
    dialogo({ titulo: `Efetivar ${esc(A.nomeCurto(nome))}`,
      corpo: `<p style="margin:0">${esc(textoCfg(cfg.explicacao || 'Se {empregado} vai continuar, não precisa fazer nada: depois de {fim}, o contrato passa a ser por prazo indeterminado.', { empregado: A.nomeCurto(nome), fim: sx ? E.fmtDate(sx.fim) : 'o fim da experiência' }))}</p>`,
      acoes: ['|', { rotulo: 'Cancelar' }, { rotulo: 'Entendi, tirar o aviso', cls: 'btn-primary', fn: () => {
        try { localStorage.setItem('ct.expEfetivados', JSON.stringify([...lerEfetivados(), chaveExp(nome, n)].slice(-200))); } catch { /* sem armazenamento */ }
        if (S.view === 'inicio') renderPainel();
      } }] });
  }
  P.acoesExperiencia = acoesExperiencia;
  /** "Para terminar" no Hoje: preenchidas e não enviadas nos últimos 7 dias e os rascunhos da empresa, sem repetir. */
  function paraTerminar() {
    const emp = S.ctx.empresa, lim = Date.now() - 7 * 864e5, vistos = new Set(), out = [];
    const chave = (tipo, quem) => `${tipo}|${E.norm(quem)}`;
    const quando = (t) => { const d = E.diffDays(new Date(new Date(t).toDateString()), E.today()); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`; };
    for (const [k, r] of Object.entries(S.plat.rascunhos || {})) {
      const [e, tipo] = k.split('|'); if (e !== emp || !S.rules.tipos[tipo] || !r?.quando || r.quando < lim) continue;
      const quem = r.valores?.empregado?.valor || r.valores?.nome?.valor || '';
      vistos.add(chave(tipo, quem));
      out.push({ t: r.quando, titulo: nomeTipo(tipo), sub: [quem && A.nomeCurto(quem), 'rascunho guardado'].filter(Boolean).join(' · '), quando: quando(r.quando), fn: () => continuarRascunho(tipo, r) });
    }
    for (const h of S.historico || []) {
      if (h.status !== 'preenchido' || h.empresa !== emp || h.quando < lim || !S.rules.tipos[h.tipo]) continue;
      const quem = h.valores?.empregado || h.valores?.nome || '';
      if (vistos.has(chave(h.tipo, quem))) continue; vistos.add(chave(h.tipo, quem));
      out.push({ t: h.quando, titulo: h.resumo || nomeTipo(h.tipo), sub: [nomeTipo(h.tipo), 'preenchido e não enviado'].join(' · '), quando: quando(h.quando), fn: () => reaproveitar(h) });
    }
    return out.sort((a, b) => b.t - a.t).slice(0, 8);
  }

  function renderPainel() {
    const R = S.rules, sol = S.plat.sol, hoje = E.today();
    const lido = !!sol && !sol.semAcesso;
    const animar = lido && !viewEl.querySelector('.hj-hero[data-pronto]');
    const base = lido ? itensVisiveis() : [];
    const comEmpresa = variasEmpresas(base);   // mais de uma empresa na tela: cada item diz de qual é
    const prio = E.prioridadesCliente(base, hoje, R);
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
    const quandoLido = sol?.quando ? new Date(sol.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

    const aviso = '';   // falha de leitura: aviso único no topo (avisoLeitura)
    const enviado = S.plat.enviado && Date.now() - S.plat.enviado.quando < 5 * 60e3
      ? `<div class="aviso-linha ok">${icon('check')}<span><b>Solicitação de ${esc(nomeTipo(S.plat.enviado.tipo))} enviada ao escritório.</b> Ela aparece aqui assim que o portal registrar.</span></div>` : '';

    viewEl.innerHTML = `
      <div id="avisos-esc"></div>
      <div id="lote"></div>
      ${enviado}${aviso}<div id="proximo"></div>
      <p class="hj-saud"><b>${saudacao()}!</b> · ${esc(cap(hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })))}</p>
      <div class="dp-toolbar hj-barra">
        ${seletorEmpresa()}
        <span class="dp-count">${lido ? plural(base.filter(i => ['aguardando', 'andamento'].includes(i.estado)).length, 'em aberto', 'em aberto') : ''}</span>
        <button type="button" class="btn btn-sm" data-ir="pendencias">${icon('list', 'ic-sm')} Ver as solicitações</button>
        <button type="button" class="btn btn-sm" id="hj-lembrete">${icon('plus', 'ic-sm')} Lembrete</button>
        <button type="button" class="btn btn-sm btn-primary" data-ir="preencher">${icon('plus', 'ic-sm')} Novo pedido</button>
      </div>
      ${heroHtml()}
      ${equipeHtml()}
      ${casosHtml()}`;

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
          <div class="hj-donut">${anel(fatias, { ativo: null, rotulo: 'em dia', anima: animar, centro: { n: lido ? pctDia : 0, de: animar ? 0 : pctDia, suf: '%' }, titulo: 'Solicitações por situação (clique numa parte para ver as solicitações)' })}</div>
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
      for (const x of avisos.filter(x => x.falta != null && x.falta <= 10)) passo('', 'var(--viz-crit)', `Pedir o cálculo ${x.tipo === 'ferias' ? 'de férias' : 'da rescisão'} · pagamento até ${fmt(x.pagamento)}`, [A.nomeCurto(x.item.empregado), x.enviarAte ? `envie até ${fmt(x.enviarAte)}` : ''].filter(Boolean).join(' · '), () => pedirCalculoDoAviso(x.item));
      for (const p of prio.filter(p => p.motivo === 'respondida').slice(0, 4)) { const i = p.item; passo('', cor(MOT.respondida.cor), E.acaoCliente(i, 'respondida'), [i.numero && `nº ${i.numero}`, i.assunto || nomeTipo(i.tipo)].filter(Boolean).join(' · '), () => abrirDetalhe(i)); }
      for (const x of legais.filter(x => x.falta <= 5)) passo('', 'var(--viz-crit)', `${x.titulo} até ${fmt(x.alvo)}`, [x.item.empregado, x.ref].filter(Boolean).join(' · '), () => abrirDetalhe(x.item, { aba: 'observar' }));
      for (const l of lems) passo(' n-lem', 'var(--blue-deep)', l.texto, `Lembrete de hoje${l.hora ? ` · ${l.hora}` : ''}`, () => editarLembrete(l, E.iso(hoje)));
      for (const e of prazos) { const [, t] = quando(e.d); passo('', 'var(--hj-today)', e.titulo, `${e.pedir ? 'Fazer agora · ' : ''}${cap(t)} · ${e.detalhe || ROT_EV[e.tipo]}`, e.pedir ? () => fazerAgora(e.pedir) : () => abrirDia(E.iso(e.d))); }
      passosHtml.acoes = acoes;
      return { html: li.length ? `<ol class="hj-passos-l" id="hj-passos">${li.join('')}</ol>` : `<div class="hj-zen">${icon('check')}<span>${sol ? 'Nada para fazer agora. Tudo em dia!' : 'Lendo o portal…'}</span></div>` };
    }
    // Equipe: experiência vencendo, férias a vencer e avisos sem o cálculo (com o atalho para pedir)
    function equipeHtml() {
      // acao: { rotulo, fn } ou uma lista delas (a experiência tem três saídas)
      const linha = (titulo, sub, pill, acao, abrir) => {
        const lista = [].concat(acao || []).filter(Boolean);
        acoesEq.push({ acao: lista[0]?.fn, abrir });
        const n = acoesEq.length - 1;
        const bts = lista.map((a, k) => { if (k) acoesEq.push({ acao: a.fn }); return `<button type="button" class="btn btn-sm${a.cls ? ' ' + a.cls : ''}" data-eq="${k ? acoesEq.length - 1 : n}"${a.titulo ? ` title="${esc(a.titulo)}"` : ''}>${esc(a.rotulo)}</button>`; }).join('');
        return `<div class="pn-li eq-li"${abrir ? ` data-eq-abrir="${n}"` : ''}><div class="main"><b>${esc(titulo)}</b><small>${esc(sub)}</small></div><div class="eq-acoes">${pill}${bts}</div></div>`;
      };
      const pillQ = (d) => { if (!d) return '<span class="pill">sem data</span>'; const [c, t] = quando(d); return `<span class="pill pill-${c}">${t}</span>`; };
      const vazio = (txt) => `<div class="pn-vazio">${icon('check', 'ic-sm')} ${esc(txt)}</div>`;
      const exp = equipe.experiencia.filter(x => !expEfetivado(x.nome, x.n)).map(x => linha(x.nome, `Fim dos ${x.n} dias em ${fmt(x.fim)} · prorrogar, encerrar no fim ou efetivar`, pillQ(x.fim), acoesExperiencia(x.nome, admissaoDe(x.nome), x.n)));
      const fer = equipe.ferias.map(x => linha(x.nome, `${x.falta < 0 ? 'Prazo para conceder passou em' : 'Conceder até'} ${fmt(x.limite)} · período ${x.aquisitivo}`, pillQ(x.limite), S.rules.tipos.avisoFerias ? { rotulo: 'Programar', fn: () => programarFerias(x.nome) } : null));
      const avs = avisos.map(x => linha(x.item.empregado,
        x.tipo === 'ferias'
          ? (x.pagamento ? `Férias${x.inicio ? ` em ${fmt(x.inicio).slice(0, 5)}` : ''} · pedir o cálculo até ${fmt(x.enviarAte).slice(0, 5)} · pagar até ${fmt(x.pagamento).slice(0, 5)}` : 'Aviso de férias sem o cálculo · confira as datas no aviso')
          : (x.pagamento ? `Rescisão · pedir o cálculo até ${fmt(x.enviarAte).slice(0, 5)} · pagar até ${fmt(x.pagamento).slice(0, 5)} (aviso indenizado)` : 'Aviso de rescisão sem o cálculo · confira as datas no aviso'),
        pillQ(x.enviarAte || x.pagamento), S.rules.tipos[x.calculo] ? { rotulo: 'Pedir o cálculo', fn: () => pedirCalculoDoAviso(x.item) } : null, () => abrirDetalhe(x.item)));
      const card = (id, titulo, sub, linhas, txtVazio) => `<section class="pn-card" id="${id}"><div class="pn-card-head"><h3>${titulo} <span class="eq-n">${linhas.length}</span></h3><small>${esc(sub)}</small></div><div class="pn-card-body eq-body">${linhas.length ? `<div class="eq-lista">${linhas.join('')}</div>` : vazio(txtVazio)}</div></section>`;
      const leg = legais.map(x => linha(x.item.empregado || x.item.assunto || nomeTipo(x.item.tipo), `${x.titulo} até ${fmt(x.alvo)} · ${x.ref}${x.retroativa ? ' · pedido depois do início' : ''}`, pillQ(x.alvo), null, () => abrirDetalhe(x.item, { aba: 'observar' })));
      // o que foi preenchido e não enviado nos últimos 7 dias e os rascunhos da empresa
      const term = paraTerminar().map(x => linha(x.titulo, x.sub, `<span class="pill pill-today">${x.quando}</span>`, { rotulo: 'Continuar', cls: 'btn-primary', fn: x.fn }));
      return `<div class="hj-equipe">
        ${term.length ? card('eq-terminar', 'Para terminar', 'Pedidos começados e não enviados (7 dias, neste computador).', term, '') : ''}
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
        <div class="pn-card-body eq-body"><div class="eq-lista">${casos.map(c => {
          const i = c.item;
          const acao = c.tipo === 'abaErrada' ? { rotulo: `Pedir em ${S.rules.tipos[c.aba]?.nome || 'outra aba'}`, fn: () => P.novoPedido(c.aba) }
            : c.tipo === 'duplicada' ? { rotulo: `Ver a nº ${c.outra.numero}`, fn: () => abrirDetalhe(c.outra) }
            : { rotulo: 'Anexar no portal', fn: () => request({ type: 'abrirNoPortal', slug: S.rules.tipos[i.tipo]?.slug, id: i.numero || i.id }) };
          acoesEq.push({ acao: acao.fn, abrir: () => abrirDetalhe(i) });
          const n = acoesEq.length - 1;
          return `<div class="pn-li eq-li caso-${c.tipo}" data-eq-abrir="${n}"><span class="pill pill-${c.tipo === 'anexo' ? 'late' : 'today'}">${ROT_CASO[c.tipo]}</span><div class="main"><b>${esc([i.numero && `nº ${i.numero}`, i.assunto || nomeTipo(i.tipo)].filter(Boolean).join(' · '))}</b><small>${esc(c.porque)}</small></div><div class="eq-acoes"><button type="button" class="btn btn-sm" data-eq="${n}">${esc(acao.rotulo)}</button></div></div>`;
        }).join('')}</div></div></section>`;
    }

    // ---------- interações ----------
    viewEl.querySelectorAll('[data-eq]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); acoesEq[+b.dataset.eq]?.acao?.(); }));
    viewEl.querySelectorAll('[data-eq-abrir]').forEach(b => b.addEventListener('click', () => acoesEq[+b.dataset.eqAbrir]?.abrir?.()));
    viewEl.querySelectorAll('[data-passo]').forEach(b => b.addEventListener('click', () => passosHtml.acoes[+b.dataset.passo]?.()));
    viewEl.querySelectorAll('[data-slide]').forEach(b => b.addEventListener('click', () => slidesDoCarrossel.ultimo[+b.dataset.slide]?.fn()));
    // a rosca leva às Solicitações já filtradas por aquela situação (como no Control Onvio)
    viewEl.querySelectorAll('.an-f[data-motivo]').forEach(b => b.addEventListener('click', () => { Object.assign(S.plat.filtroSol, { motivo: b.dataset.motivo, tipo: '', q: '' }); A.setView('pendencias'); }));
    $('#hj-lembrete').addEventListener('click', () => editarLembrete(null, E.iso(E.today())));
    $('#hj-tentar')?.addEventListener('click', () => { S.plat.sol = null; renderPainel(); P.carregarSolicitacoes(true); });
    ligarSeletorEmpresa(viewEl);
    ligarDicas(viewEl);
    if (animar) { viewEl.classList.remove('hj-anim'); void viewEl.offsetWidth; viewEl.classList.add('hj-anim'); setTimeout(() => viewEl.classList.remove('hj-anim'), 1600); animarNumeros(viewEl); }
    iniciarCarrossel($('#hj-tick'));
    P.renderProximo($('#proximo'));
    marcarRolagem($('#hj-passos'));
    viewEl.querySelectorAll('.eq-lista').forEach(l => { limitarCinco(l); marcarRolagem(l); });   // até 5 itens à vista; o resto rola

    ligarIr(viewEl);
    A.renderLote(); A.renderAvisosInicio();   // o cartão do documento/texto fica no Novo pedido (mostrarSugestao)
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
  // Listas da Equipe e dos casos: a altura vai até o fim do 5º item (as linhas mudam de altura conforme a largura do cartão).
  function limitarCinco(lst) {
    const ajusta = () => {
      const quinto = lst.children[4];
      lst.style.maxHeight = lst.children.length > 5 && quinto ? `${Math.ceil(quinto.getBoundingClientRect().bottom - lst.getBoundingClientRect().top + lst.scrollTop) + 2}px` : '';
    };
    ajusta();
    const ro = new ResizeObserver(() => { if (lst.isConnected) ajusta(); else ro.disconnect(); });
    ro.observe(lst.parentElement);
    new MutationObserver(ajusta).observe(lst, { childList: true });
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
      if (b.dataset.sit) S.plat.filtroEmp.sit = b.dataset.sit;
      A.setView(b.dataset.ir);
    }));
  }
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
    $('#sol-portal')?.addEventListener('click', () => send({ type: 'modo', modo: 'painel' }));
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
      acoes: [...(['avisoFerias', 'avisoRescisao'].includes(i.tipo) && !['cancelada', 'prescrita'].includes(i.estado) ? [{ rotulo: `${icon('calc', 'ic-sm')} Pedir o cálculo`, cls: 'dt-pedir-calc', fn: () => { pedirCalculoDoAviso(i, st.datas); } }] : []),
        ...(t ? [{ rotulo: `${icon('refresh', 'ic-sm')} Pedir de novo`, cls: 'dt-pedir-novo', fn: () => { pedirDeNovo(i, st.bruto); } }] : []),
        { rotulo: `${icon('external', 'ic-sm')} ${i.aguardando ? 'Responder no portal' : 'Ver no portal'}`, cls: 'btn-primary', fn: () => request({ type: 'abrirNoPortal', slug: t?.slug, id: i.numero || i.id }) },
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

  /* =================== NOVO PEDIDO =================== */
  function renderPedido() {
    const aberto = S.ctx.route?.mode === 'form' && S.ctx.tipo;
    if (aberto && !S.plat.escolher) { A.renderPreencher(); return; }
    const R = S.rules;
    const grupos = new Map();
    for (const it of R.intencoes || []) { const setor = R.tipos[it.tipo]?.setor || 'Outros'; if (!grupos.has(setor)) grupos.set(setor, []); grupos.get(setor).push(it); }
    viewEl.innerHTML = `
      <div id="lote"></div>
      ${S.plat.enviado && Date.now() - S.plat.enviado.quando < 5 * 60e3 ? `<div class="note ok">${icon('check')}<div><b>Solicitação de ${esc(nomeTipo(S.plat.enviado.tipo))} enviada.</b> ${passosAbertos().length ? 'Veja o próximo passo:' : 'Quer fazer outra?'}</div></div>` : ''}
      <div id="proximo"></div>
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
    P.renderProximo($('#proximo'));
  }
  /** Botão "Outro tipo" dentro do pedido: volta para a escolha do tipo (o pedido aberto pode ser retomado). */
  P.voltarEscolha = () => { S.plat.escolher = true; P.render('preencher'); };
  /** Abre um pedido já com o funcionário escolhido (atalhos do Hoje, Funcionários, Calcular, Agenda e da busca).
   *  valores: o que o cliente escolheu na outra tela (vale como digitado por ele); sugeridos: dados do aviso, 1ª data que vale…
   *  entram para conferir ("do aviso nº X"), e um documento arrastado depois ainda pode corrigi-los; observacoes: vão para a
   *  descrição (ex.: a linha da simulação); empresa: a do pedido (vários CNPJs no mesmo acesso). Terminando sem falta nada, abre o resumo do "Conferir e enviar". */
  P.novoPedido = async (tipo, { empregado, valores = {}, sugeridos = {}, fonte = 'sugestão do Assistente', observacoes = '', empresa } = {}) => {
    A.comecarDoZeroSeAbandonado(tipo);
    const W = A.w(tipo);
    const dados = { ...(empregado ? { empregado } : {}), ...Object.fromEntries(Object.entries(valores).filter(([k, v]) => v != null && v !== '' && S.rules.tipos[tipo]?.campos?.[k])) };
    for (const [k, v] of Object.entries(dados)) { W.valores[k] = { valor: String(v), conf: 1, fonte: 'você' }; W.editados.add(k); W.fonteVerdade[k] = 'plataforma'; }
    A.aplicarSugestoes(tipo, Object.fromEntries(Object.entries(sugeridos || {}).filter(([k]) => !(k in dados))), fonte);
    if (observacoes) W.valores.observacoes = { valor: observacoes, conf: 1, fonte: 'você' };
    W.rascunhoVisto = true;
    A.gerarTextos(tipo);
    // com funcionário escolhido a empresa já está definida (a lista dele é a da empresa aberta ou a da solicitação de origem)
    const alvo = empresa || (empregado ? S.ctx.empresa : '');
    if (alvo && !(await P.escolherEmpresa({ tipo, empresa: alvo, conservarEmpregado: !!empregado }))) return;
    await A.openTipo(tipo, { manter: true, semEmpresa: !!alvo });
    for (let k = 0; k < 40 && !(S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo); k++) await esperar(200);
    if ((Object.keys(dados).length || Object.keys(sugeridos || {}).length) && S.ctx.tipo === tipo) {
      await A.loadEmpregados(tipo); await A.fillPortal(tipo, { daPlataforma: true });
      await A.abrirResumoSePronto(tipo);
    }
  };

  /* =================== EMPRESA DO PEDIDO ===================
     Com mais de uma empresa no acesso, abrir um pedido pergunta para qual empresa ele é (caixa por cima de tudo) e troca
     a empresa no portal antes de abrir o formulário. Dentro do pedido, o nome da empresa é um botão para trocar. Se a troca
     não puder ser confirmada no portal, nada é aberto nem preenchido: o pedido iria para a empresa errada. */
  S.plat.empresasConhecidas = [];   // só na memória: a lista das solicitações é relida a cada troca de empresa
  const apelidoDe = (nome) => (S.plat.empresasConhecidas || []).find(e => E.mesmaEmpresaNome(e.nome, nome))?.apelido || nome;
  P.apelidoDe = apelidoDe;
  P.empresasDoLogin = () => {
    const lista = E.empresasParaEscolha(S.plat.sol?.itens || [], S.ctx.empresa, S.plat.empresasConhecidas || []);
    S.plat.empresasConhecidas = lista.map(({ nome, apelido }) => ({ nome, apelido }));
    return lista;
  };
  const esperarSolicitacoes = async () => { if (!S.plat.sol) await Promise.race([P.carregarSolicitacoes(), esperar(8000)]).catch(() => {}); };

  /** A caixa: uma empresa por linha (escolha única). Devolve o nome escolhido ou null se o cliente desistiu. */
  function caixaEmpresa({ tipo, emps, sugerida = '', titulo, dica, botao = 'Continuar' }) {
    return new Promise((resolve) => {
      let escolhido = null;
      const atual = emps.find(e => e.atual)?.nome;
      const sug = sugerida && emps.find(e => E.mesmaEmpresaNome(e.nome, sugerida))?.nome;
      const inicial = sug || atual || emps[0].nome;
      const linhas = emps.map(e => `<label class="ee-li" data-nome="${esc(e.nome)}">
        <input type="radio" name="ee-emp" value="${esc(e.nome)}"${e.nome === inicial ? ' checked' : ''}>
        <span class="es-tx"><b>${esc(e.apelido || e.nome)}${e.atual ? ' <span class="es-tag">aberta no portal</span>' : ''}${!e.atual && sug === e.nome ? ' <span class="es-tag">a do pedido anterior</span>' : ''}</b>${e.apelido && e.apelido !== e.nome ? `<small>${esc(e.nome)}</small>` : ''}</span>
        <span class="es-n">${e.esperam ? `<em>${e.esperam} esperam você</em>` : ''}${e.abertas ? `<span>${e.abertas} em aberto</span>` : ''}</span></label>`).join('');
      const dlg = dialogo({
        titulo: titulo || 'Para qual empresa é este pedido?',
        corpo: `<p class="muted ee-dica">${esc(dica || `Você tem acesso a mais de uma empresa. Escolha para qual vai o pedido${tipo ? ` de ${nomeTipo(tipo)}` : ''}: eu troco a empresa no portal e abro a solicitação.`)}</p>
          ${emps.length > 6 ? '<input type="search" class="es-q ee-q" placeholder="Buscar empresa…" autocomplete="off" aria-label="Buscar empresa">' : ''}
          <div class="ee-lista" role="radiogroup" aria-label="Empresas">${linhas}</div>`,
        acoes: [{ rotulo: 'Cancelar' }, '|', { rotulo: botao, cls: 'btn-primary', fn: () => { escolhido = dlg.el.querySelector('input[name="ee-emp"]:checked')?.value || null; if (!escolhido) return false; } }]
      });
      const confirmar = () => dlg.el.querySelector('[data-acao="2"]')?.click();
      dlg.el.querySelectorAll('.ee-li').forEach(l => l.addEventListener('dblclick', confirmar));
      dlg.el.querySelector('.ee-q')?.addEventListener('input', (e) => { const q = E.norm(e.target.value); dlg.el.querySelectorAll('.ee-li').forEach(l => { l.hidden = !!q && !E.norm(l.textContent).includes(q); }); });
      dlg.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); confirmar(); } });
      (dlg.el.querySelector('.ee-q') || dlg.el.querySelector('input[name="ee-emp"]:checked'))?.focus();
      // fechar de qualquer jeito (Cancelar, X, Esc, clicar fora) resolve; o escolhido só existe se confirmou
      const m = $('#modal');
      const mo = new MutationObserver(() => { if (!dlg.el.isConnected) { mo.disconnect(); resolve(escolhido); } });
      mo.observe(m, { childList: true, attributes: true });
    });
  }
  function avisoTroca(alvo, motivo) {
    dialogo({
      titulo: 'Não consegui trocar de empresa',
      corpo: `<p>Não consegui trocar para <b>${esc(apelidoDe(alvo))}</b> no portal${motivo ? ` (${esc(motivo)})` : ''}. Por segurança, não abri nenhum pedido: ele iria para a empresa errada.</p>
        <p class="muted">Troque a empresa pelo seletor do próprio portal (o botão “Ver no portal” mostra a tela original) e peça de novo.</p>`,
      acoes: [{ rotulo: `${icon('external', 'ic-sm')} Ver no portal`, fn: () => send({ type: 'modo', modo: 'painel' }) }, '|', { rotulo: 'Fechar', cls: 'btn-primary' }]
    });
  }
  /** Troca a empresa no portal e confirma vendo o nome novo. `manter` = o pedido (tipo) cujos dados seguem com o cliente. */
  P.irParaEmpresa = async (alvo, { manter = null, conservarEmpregado = false } = {}) => {
    if (E.mesmaEmpresaNome(alvo, S.ctx.empresa)) return true;
    S.trocaPedida = { de: S.ctx.empresa, para: alvo, manter, conservarEmpregado };
    toast(`Trocando para ${apelidoDe(alvo)} no portal…`);
    const r = await request({ type: 'trocarEmpresa', nome: alvo }, 30000);
    // o contexto novo chega pelo canal; se o portal já disse que não trocou, não há o que esperar
    if (r?.ok) for (let k = 0; k < 40 && !E.mesmaEmpresaNome(S.ctx.empresa, alvo); k++) await esperar(250);
    const ok = !!r?.ok && E.mesmaEmpresaNome(S.ctx.empresa, alvo);
    S.trocaPedida = null;
    if (!ok) { avisoTroca(alvo, r?.motivo); return false; }
    return true;
  };
  /** Chamada antes de abrir um formulário novo: pergunta a empresa (se houver mais de uma) e troca no portal.
   *  Devolve false se o cliente desistiu ou se a troca não foi confirmada. */
  P.escolherEmpresa = async ({ tipo, empresa, sugerida, conservarEmpregado = false } = {}) => {
    if (empresa && E.mesmaEmpresaNome(empresa, S.ctx.empresa)) return true;   // já está nela
    if (S.modo === 'plataforma') await esperarSolicitacoes();
    const emps = P.empresasDoLogin();
    if (emps.length <= 1) return true;
    const alvo = empresa || await caixaEmpresa({ tipo, emps, sugerida });
    if (!alvo) return false;
    return P.irParaEmpresa(alvo, { manter: tipo || null, conservarEmpregado });
  };
  /** Botão da empresa dentro do pedido: troca a empresa e leva o pedido junto. O funcionário e as listas são da empresa
   *  antiga (saem); o resto do que o cliente preencheu fica. */
  P.trocarEmpresaDoPedido = async () => {
    const tipo = S.ctx.tipo; if (!tipo || S.ctx.route?.mode !== 'form' || document.body.classList.contains('trocando-empresa')) return;
    if (S.modo === 'plataforma') await esperarSolicitacoes();
    const emps = P.empresasDoLogin(); if (emps.length <= 1) return;
    const alvo = await caixaEmpresa({ tipo, emps, titulo: 'Trocar a empresa do pedido', botao: 'Trocar de empresa',
      dica: 'O funcionário e as listas são de cada empresa: ao trocar, você escolhe o funcionário de novo. O resto do que você preencheu fica.' });
    if (!alvo || E.mesmaEmpresaNome(alvo, S.ctx.empresa)) return;
    document.body.classList.add('trocando-empresa');   // enquanto troca e refaz o pedido (os testes esperam isto acabar)
    try {
      if (!(await P.irParaEmpresa(alvo, { manter: tipo }))) return;
      await A.openTipo(tipo, { manter: true, semEmpresa: true });
      for (let k = 0; k < 40 && !(S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo); k++) await esperar(200);
      if (S.ctx.tipo !== tipo) return;
      await A.loadEmpregados(tipo);
      A.gerarTextos(tipo);
      // o cliente pode ter saído do formulário enquanto isso: preencher sem formulário abriria um pedido sozinho
      if (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) await A.fillPortal(tipo, { daPlataforma: true });
      toast(`Pedido movido para ${apelidoDe(alvo)}. Escolha o funcionário desta empresa.`);
    } finally { document.body.classList.remove('trocando-empresa'); }
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
    $('#ag-prox').innerHTML = prox.slice(0, 12).map((e, n) => linhaEvento(e, n)).join('') || `<div class="pn-vazio">${icon('calendar', 'ic-sm')} Nada nos próximos 30 dias.</div>`;
    $('#ag-prox').querySelectorAll('[data-ev-iso]').forEach(b => b.addEventListener('click', (ev) => { if (!ev.target.closest('[data-fazer]')) abrirDia(b.dataset.evIso); }));
    $('#ag-prox').querySelectorAll('[data-fazer]').forEach(b => b.addEventListener('click', () => fazerAgora(prox[+b.dataset.fazer]?.pedir)));
    const hist = S.historico || [];
    $('#ag-hist').innerHTML = hist.length ? hist.slice(0, 40).map((h, n) => `<button type="button" class="pn-li" data-hist="${n}"><div class="main"><b>${esc(h.resumo)}</b><small>${esc(nomeTipo(h.tipo))} · ${new Date(h.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></div><span class="pill pill-${h.status === 'enviado' ? 'ok' : 'soon'}">${esc(h.status)}</span></button>`).join('') : '<div class="pn-vazio">As solicitações que você fizer com o Assistente aparecem aqui.</div>';
    viewEl.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => abrirDia(b.dataset.dia)));
    viewEl.querySelectorAll('[data-cont]').forEach(b => b.addEventListener('click', () => reaproveitar(inacabados[+b.dataset.cont])));
    viewEl.querySelectorAll('[data-hist]').forEach(b => b.addEventListener('click', () => reaproveitar(hist[+b.dataset.hist], true)));
    $('#ag-prev').addEventListener('click', () => { const d = new Date(G.ano, G.mes - 1, 1); G.ano = d.getFullYear(); G.mes = d.getMonth(); renderAgenda(); });
    $('#ag-next').addEventListener('click', () => { const d = new Date(G.ano, G.mes + 1, 1); G.ano = d.getFullYear(); G.mes = d.getMonth(); renderAgenda(); });
    $('#ag-hoje').addEventListener('click', () => { const d = E.today(); G.ano = d.getFullYear(); G.mes = d.getMonth(); renderAgenda(); });
    $('#ag-filtro').addEventListener('change', (e) => { G.filtro = e.target.value; renderAgenda(); });
    $('#ag-novo').addEventListener('click', () => editarLembrete(null, E.iso(E.today())));
  }
  async function reaproveitar(h, outroPedido = false) {
    if (!h) return;
    const W = A.w(h.tipo);
    // outro pedido a partir do histórico: a regra do Repetir (sem datas; num cadastro, só os campos da empresa).
    // "Começou e não enviou" continua levando tudo
    const vals = outroPedido ? E.valoresParaRepetir(h.tipo, h.valores, S.rules) : h.valores || {};
    for (const [k, v] of Object.entries(vals)) if (!['assunto', 'descricao'].includes(k)) W.valores[k] = { valor: v, conf: 1, fonte: 'histórico' };
    W.rascunhoVisto = true;
    A.gerarTextos(h.tipo, true);
    await A.openTipo(h.tipo, { manter: true });
  }
  function abrirDia(isoDia) {
    const d = E.parseDate(isoDia); if (!d) return;
    const evs = eventosEntre(d, d);
    const dlg = dialogo({
      titulo: cap(d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
      corpo: evs.length ? evs.map((e, n) => `<div class="pn-li"${e.lembrete ? ` data-lb="${n}" style="cursor:pointer"` : ' style="cursor:default"'}><span class="ag-ev ev-${e.tipo}" style="width:10px;padding:8px 0"></span><div class="main"><b>${esc(e.titulo)}</b><small>${esc(e.detalhe || ROT_EV[e.tipo])}</small></div>${e.pedir ? `<button type="button" class="btn btn-sm btn-primary" data-dia-fazer="${n}">Fazer agora</button>` : ''}<span class="pill">${ROT_EV[e.tipo]}</span></div>`).join('') : '<p class="muted" style="margin:0">Nada marcado neste dia.</p>',
      acoes: [{ rotulo: `${icon('plus', 'ic-sm')} Lembrete neste dia`, cls: 'btn-primary', fn: () => { setTimeout(() => editarLembrete(null, isoDia), 0); } }, '|', { rotulo: 'Fechar' }]
    });
    dlg.el.querySelectorAll('[data-lb]').forEach(b => b.addEventListener('click', (ev) => { if (ev.target.closest('[data-dia-fazer]')) return; dlg.fechar(); editarLembrete(evs[+b.dataset.lb].lembrete, isoDia); }));
    dlg.el.querySelectorAll('[data-dia-fazer]').forEach(b => b.addEventListener('click', () => { dlg.fechar(); fazerAgora(evs[+b.dataset.diaFazer].pedir); }));
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
  /* =================== Documentos (2.5) ===================
     Nas solicitações: os arquivos trocados nos trâmites (do escritório e os seus), lidos do portal na hora e
     guardados só na memória, como a conversa do detalhe. Publicados: guias, holerites e recibos da área de
     Documentos do Onvio (no simulador; no Onvio real ainda "a calibrar"). Depois, os enviados pelo Assistente, os
     modelos para assinar e as listas de documentos por tipo. */
  const ABAS_DOC = [['solicitacoes', 'Nas solicitações'], ['escritorio', 'Publicados pelo escritório'], ['anexos', 'Enviados pelo Assistente'], ['modelos', 'Modelos para assinar'], ['listas', 'Listas de documentos']];
  const arquivosLidos = new Map();   // id da solicitação → { em, lista: [{ nome, lado, em, autor }] } (só memória)
  let lendoArquivos = null;
  const LOTE_ARQ = 40;
  function tipoArquivo(nome) {
    const x = (/\.([a-z0-9]{2,5})$/i.exec(nome || '') || [])[1]?.toLowerCase() || '';
    if (x === 'pdf') return ['pdf', 'PDF'];
    if (/^(jpe?g|png|gif|webp|heic|bmp|tiff?)$/.test(x)) return ['img', 'IMG'];
    if (/^(xlsx?|xlsm|csv|ods)$/.test(x)) return ['xls', 'PLAN'];
    if (/^(docx?|odt|rtf|txt)$/.test(x)) return ['doc', 'DOC'];
    if (/^(zip|rar|7z)$/.test(x)) return ['zip', 'ZIP'];
    return ['outro', (x || 'arq').toUpperCase().slice(0, 4)];
  }
  const alvoArquivos = () => itensVisiveis().filter(i => i.id && S.rules.tipos[i.tipo]?.apiTramites)
    .sort((a, b) => (b.atualizado?.getTime() || 0) - (a.atualizado?.getTime() || 0));
  function carregarArquivos(limite, aoAvancar) {
    if (lendoArquivos) return lendoArquivos;
    const alvo = alvoArquivos().slice(0, limite).filter(i => arquivosLidos.get(i.id)?.em !== (i.atualizado?.getTime() || 0));
    if (!alvo.length) return Promise.resolve();
    lendoArquivos = (async () => {
      let n = 0, feitos = 0;
      const trabalhador = async () => { while (n < alvo.length) { const i = alvo[n++];
        const r = await request({ type: 'tramites', base: S.rules.tipos[i.tipo].apiTramites, solicitacao: i.id }, 15000);
        if (r && !r.erro) arquivosLidos.set(i.id, { em: i.atualizado?.getTime() || 0,
          lista: E.tramitesDe(r.itens, i.tipo, S.rules).flatMap(t => t.anexos.map(nome => ({ nome, lado: t.lado, em: E.parseDate(t.em), autor: t.autor }))) });
        aoAvancar?.(++feitos, alvo.length); } };
      await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    })().finally(() => { lendoArquivos = null; });
    return lendoArquivos;
  }
  function renderDocumentos() {
    const aba = ABAS_DOC.some(([k]) => k === S.plat.docAba) ? S.plat.docAba : 'solicitacoes';
    const nArq = alvoArquivos().reduce((t, i) => t + (arquivosLidos.get(i.id)?.lista.length || 0), 0);
    const contas = { solicitacoes: arquivosLidos.size ? nArq : null, escritorio: S.plat.docs?.disponivel ? (S.plat.docs.itens || []).length : null,
      modelos: (S.rules.modelosDocumento || []).length, listas: Object.values(S.rules.tipos).filter(t => (t.anexos || []).length).length };
    viewEl.innerHTML = `<div class="dp-tabs" role="tablist">${ABAS_DOC.map(([k, t]) => `<button type="button" role="tab" class="dp-tab${aba === k ? ' active' : ''}" data-doc-aba="${k}" aria-selected="${aba === k}">${t}${contas[k] != null ? ` <span class="tab-n">${contas[k]}</span>` : ''}</button>`).join('')}</div><div id="doc-body"></div>`;
    viewEl.querySelectorAll('[data-doc-aba]').forEach(b => b.addEventListener('click', () => { S.plat.docAba = b.dataset.docAba; renderDocumentos(); }));
    ({ solicitacoes: docsSolicitacoes, escritorio: docsEscritorio, anexos: docsAnexos, modelos: docsModelos, listas: docsListas }[aba])($('#doc-body'));
  }
  function docsSolicitacoes(el) {
    const F = S.plat.filtroDoc || (S.plat.filtroDoc = { q: '', lado: '', limite: LOTE_ARQ });
    if (!S.plat.sol) { el.innerHTML = loading('Lendo as solicitações no portal…'); P.carregarSolicitacoes().then(() => el.isConnected && docsSolicitacoes(el)); return; }
    el.innerHTML = `<div class="dp-toolbar arq-barra">
        <input type="search" id="arq-q" placeholder="Buscar arquivo, funcionário ou nº da solicitação…" value="${esc(F.q)}" autocomplete="off">
        ${seletorEmpresa()}
        <div class="seg" role="group" aria-label="De quem">${[['', 'Todos'], ['esc', 'Do escritório'], ['cli', 'Enviados por você']].map(([k, r]) => `<button type="button" data-arq-lado="${k}" aria-pressed="${F.lado === k}">${r} <span class="mono arq-n" data-arq-n="${k}"></span></button>`).join('')}</div>
      </div>
      <div id="arq-prog"></div><div id="arq-lista"></div>`;
    ligarSeletorEmpresa(el);
    let vis = [];
    const desenhar = () => {
      if (!el.isConnected) return;
      const alvo = alvoArquivos(), lidas = alvo.slice(0, F.limite);
      const q = E.norm(F.q);
      const todos = lidas.flatMap(i => (arquivosLidos.get(i.id)?.lista || []).map(a => ({ ...a, item: i })))
        .filter(a => !q || E.norm(`${a.nome} ${a.item.numero} ${a.item.empregado} ${a.item.assunto} ${nomeTipo(a.item.tipo)} ${a.item.empresa}`).includes(q));
      const conta = { '': todos.length, esc: todos.filter(a => a.lado === 'esc').length, cli: todos.filter(a => a.lado === 'cli').length };
      el.querySelectorAll('[data-arq-n]').forEach(x => { x.textContent = conta[x.dataset.arqN]; });
      vis = todos.filter(a => !F.lado || a.lado === F.lado).sort((a, b) => (b.em?.getTime() || 0) - (a.em?.getTime() || 0));
      const comEmpresa = variasEmpresas(lidas);
      const grupos = [];
      vis.forEach((a, n) => {
        const k = a.em ? cap(a.em.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })) : 'Sem data';
        if (grupos.at(-1)?.k !== k) grupos.push({ k, linhas: [] });
        const [cls, rot] = tipoArquivo(a.nome), i = a.item;
        grupos.at(-1).linhas.push(`<div class="dp-row arq-cols hov" data-arq="${n}" tabindex="0" role="button" aria-label="${esc(`${a.nome}: abrir a solicitação`)}">
          <span class="arq-nome"><span class="arq-ext ext-${cls}">${rot}</span><span class="arq-tx"><b class="ell" title="${esc(a.nome)}">${esc(a.nome)}</b><span class="sub ell">${esc([comEmpresa && rotEmpresa(i), i.numero && `nº ${i.numero}`, i.assunto || nomeTipo(i.tipo)].filter(Boolean).join(' · '))}</span></span></span>
          <span class="ell">${esc(i.empregado || '—')}</span>
          <span><span class="pill ${a.lado === 'esc' ? 'pill-soon' : 'pill-muted'}">${a.lado === 'esc' ? 'Do escritório' : 'Você enviou'}</span></span>
          <span class="mono">${fmt(a.em)}</span>
          <span class="row-acts"><button type="button" class="btn btn-sm btn-ghost" data-arq-portal="${n}" title="Abrir a solicitação no portal para baixar">${icon('external', 'ic-sm')} No portal</button></span></div>`);
      });
      const lendo = !!lendoArquivos;
      const lista = el.querySelector('#arq-lista');
      lista.innerHTML = `<div class="list-card"><div class="dp-listhead arq-cols"><span>Arquivo</span><span>Funcionário</span><span>De quem</span><span>Data</span><span></span></div>
        ${grupos.map(g => `<div class="arq-mes">${esc(g.k)}</div>${g.linhas.join('')}`).join('')
          || (lendo ? loading('Procurando arquivos nos trâmites…') : `<div class="list-vazio">${F.q || F.lado ? 'Nenhum arquivo com esse filtro.' : 'Nenhum arquivo nas solicitações lidas.'}</div>`)}
        <div class="list-foot">Lidas as ${Math.min(F.limite, alvo.length)} solicitações mais recentes de ${alvo.length}.${alvo.length > F.limite ? ` <button type="button" class="btn btn-sm btn-ghost" id="arq-mais">Ler mais ${Math.min(LOTE_ARQ, alvo.length - F.limite)}</button>` : ''} Os arquivos são lidos do portal na hora e não ficam guardados; para baixar, abra a solicitação no portal.</div></div>`;
      lista.querySelectorAll('[data-arq]').forEach(r => {
        const abrir = (e) => { if (e.target.closest('button')) return; abrirDetalhe(vis[+r.dataset.arq].item, { aba: 'conversa' }); };
        r.addEventListener('click', abrir); r.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(e); });
      });
      lista.querySelectorAll('[data-arq-portal]').forEach(b => b.addEventListener('click', () => { const i = vis[+b.dataset.arqPortal].item; request({ type: 'abrirNoPortal', slug: S.rules.tipos[i.tipo]?.slug, id: i.numero || i.id }); }));
      lista.querySelector('#arq-mais')?.addEventListener('click', () => { F.limite += LOTE_ARQ; ler(); });
      const n = viewEl.querySelector('[data-doc-aba="solicitacoes"]');
      if (n && arquivosLidos.size) { const t = n.querySelector('.tab-n') || n.appendChild(Object.assign(document.createElement('span'), { className: 'tab-n' })); t.textContent = todos.length; }
    };
    const prog = el.querySelector('#arq-prog');
    let ultimo = 0;
    const ler = () => {
      const p = carregarArquivos(F.limite, (f, t) => {
        prog.innerHTML = `<div class="arq-prog"><span>Lendo os trâmites… ${f} de ${t}</span><i style="width:${Math.round(f / t * 100)}%"></i></div>`;
        if (Date.now() - ultimo > 600) { ultimo = Date.now(); desenhar(); }
      });
      desenhar();
      p.then(() => { prog.innerHTML = ''; desenhar(); });
    };
    let t0;
    el.querySelector('#arq-q').addEventListener('input', (e) => { F.q = e.target.value; clearTimeout(t0); t0 = setTimeout(desenhar, 150); });
    el.querySelectorAll('[data-arq-lado]').forEach(b => b.addEventListener('click', () => { F.lado = b.dataset.arqLado; el.querySelectorAll('[data-arq-lado]').forEach(x => x.setAttribute('aria-pressed', x === b)); desenhar(); }));
    ler();
  }
  async function docsEscritorio(el) {
    if (!S.plat.docs) {
      el.innerHTML = loading('Procurando os documentos no portal…');
      S.plat.docs = await request({ type: 'documentos' }, 20000) || { disponivel: false };
      if (S.view !== 'documentos' || S.plat.docAba !== 'escritorio') return;
    }
    const D = S.plat.docs;
    if (!D.disponivel) {
      el.innerHTML = `<div class="note">${icon('info')}<div><b>Guias, holerites e recibos que o escritório publica.</b> ${esc(S.rules.mensagens?.plataformaCalibrar || '')} Enquanto isso, os arquivos que o escritório manda nas solicitações estão em <a href="#" id="doc-ir-sol">Nas solicitações</a>.<div class="actions" style="margin-top:8px"><button class="btn btn-sm btn-primary" id="doc-portal">${icon('external', 'ic-sm')} Abrir Documentos no portal</button></div></div></div>`;
      $('#doc-portal').addEventListener('click', () => request({ type: 'abrirNoPortal', area: 'documentos' }));
      $('#doc-ir-sol').addEventListener('click', (e) => { e.preventDefault(); S.plat.docAba = 'solicitacoes'; renderDocumentos(); });
      return;
    }
    const F = S.plat.filtroPub || (S.plat.filtroPub = { q: '', cat: '' });
    const itens = D.itens || [];
    const cats = [...new Set(itens.map(x => x.categoria || 'Outros'))];
    el.innerHTML = `<div class="dp-toolbar">
        <input type="search" id="pub-q" placeholder="Buscar documento ou competência…" value="${esc(F.q)}" autocomplete="off">
        <div class="seg" role="group" aria-label="Categoria">${[['', 'Todas']].concat(cats.map(c => [c, c])).map(([k, r]) => `<button type="button" data-pub-cat="${esc(k)}" aria-pressed="${F.cat === k}">${esc(r)} <span class="mono arq-n">${k ? itens.filter(x => (x.categoria || 'Outros') === k).length : itens.length}</span></button>`).join('')}</div>
        <span class="spacer"></span>
        <button class="btn btn-sm" id="doc-portal">${icon('external', 'ic-sm')} Ver no portal</button>
      </div><div id="pub-lista"></div>`;
    const desenhar = () => {
      const q = E.norm(F.q);
      const vis = itens.map((x, n) => ({ x, n })).filter(({ x }) => (!F.cat || (x.categoria || 'Outros') === F.cat) && (!q || E.norm(`${x.nome} ${x.categoria} ${x.competencia}`).includes(q)));
      // agrupados pela competência, a mais recente primeiro
      const chave = (c) => { const m = /^(\d{2})\/(\d{4})$/.exec(c || ''); return m ? `${m[2]}${m[1]}` : '0'; };
      const grupos = new Map();
      vis.sort((a, b) => chave(b.x.competencia).localeCompare(chave(a.x.competencia))).forEach(v => { const k = v.x.competencia || ''; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(v); });
      const rotComp = (c) => { const m = /^(\d{2})\/(\d{4})$/.exec(c || ''); return m ? cap(new Date(+m[2], +m[1] - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })) : 'Sem competência'; };
      $('#pub-lista').innerHTML = `<div class="list-card"><div class="dp-listhead doc-cols"><span>Documento</span><span>Categoria</span><span>Competência</span><span>Publicado</span><span></span></div>
        ${[...grupos].map(([k, vs]) => `<div class="arq-mes">${esc(rotComp(k))}</div>${vs.map(({ x, n }) => { const [cls, rot] = tipoArquivo(x.arquivo || 'x.pdf'); return `<div class="dp-row doc-cols hov"><span class="arq-nome"><span class="arq-ext ext-${cls}">${rot}</span><span class="arq-tx"><b class="ell">${esc(x.nome)}</b></span></span><span>${esc(x.categoria || '—')}</span><span class="mono">${esc(x.competencia || '—')}</span><span class="mono">${esc(x.data || '—')}</span><span class="row-acts"><button type="button" class="btn btn-sm" data-baixar="${n}">${icon('download', 'ic-sm')} Baixar</button></span></div>`; }).join('')}`).join('')
          || `<div class="list-vazio">${itens.length ? 'Nenhum documento com esse filtro.' : 'Nenhum documento publicado.'}</div>`}</div>`;
      $('#pub-lista').querySelectorAll('[data-baixar]').forEach(b => b.addEventListener('click', async () => {
        const x = itens[+b.dataset.baixar]; b.disabled = true;
        const r = await request({ type: 'baixarDocumento', docId: x.id }, 30000); b.disabled = false;
        if (!r?.arquivo) { toast('Não consegui baixar. Abra no portal.'); return; }
        const url = URL.createObjectURL(new Blob([r.arquivo.buf], { type: r.arquivo.type || 'application/pdf' }));
        const a = document.createElement('a'); a.href = url; a.download = r.arquivo.name || 'documento.pdf'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }));
    };
    let t0;
    $('#pub-q').addEventListener('input', (e) => { F.q = e.target.value; clearTimeout(t0); t0 = setTimeout(desenhar, 150); });
    el.querySelectorAll('[data-pub-cat]').forEach(b => b.addEventListener('click', () => { F.cat = b.dataset.pubCat; el.querySelectorAll('[data-pub-cat]').forEach(x => x.setAttribute('aria-pressed', x === b)); desenhar(); }));
    $('#doc-portal').addEventListener('click', () => request({ type: 'abrirNoPortal', area: 'documentos' }));
    desenhar();
  }
  function docsAnexos(el) {
    const linhas = [];
    for (const [tipo, W] of Object.entries(S.work)) for (const a of W?.arquivos || []) if (!a.removido) linhas.push({ nome: a.nome, doc: a.analise?.documento?.nome || '—', tipo, quando: 'agora', st: a.jaAnexado || a.anexado ? ['ok', 'no portal'] : a.recusado ? ['late', 'recusado pelo portal'] : ['soon', 'só no Assistente'] });
    for (const h of (S.historico || []).filter(h => !S.ctx.empresa || h.empresa === S.ctx.empresa)) for (const n of h.anexos || []) linhas.push({ nome: n, doc: h.valores?.empregado || h.valores?.nome || '—', tipo: h.tipo, quando: new Date(h.quando).toLocaleDateString('pt-BR'), st: h.status === 'enviado' ? ['ok', 'enviado'] : ['today', 'não enviado'] });
    el.innerHTML = `<div class="list-card"><div class="dp-listhead anx-cols"><span>Arquivo</span><span>Documento / funcionário</span><span>Solicitação</span><span>Quando</span></div>
      ${linhas.map(l => `<div class="dp-row anx-cols hov"><span class="ell"><b>${esc(l.nome)}</b></span><span class="ell">${esc(l.doc)}</span><span><span class="ell">${esc(nomeTipo(l.tipo))}</span></span><span><span class="pill pill-${l.st[0]}">${esc(l.st[1])}</span> <span class="sub">${esc(l.quando)}</span></span></div>`).join('') || '<div class="list-vazio">Os arquivos que você anexar com o Assistente aparecem aqui.</div>'}
      <div class="list-foot">Só os nomes dos arquivos ficam guardados neste computador, nunca o conteúdo.</div></div>`;
  }
  function docsModelos(el) {
    const M = S.rules.modelosDocumento || [];
    el.innerHTML = `<div class="pn-grid">${M.map((md, n) => `<section class="pn-card"><div class="pn-card-head"><h3>${esc(md.titulo)}</h3></div><div class="pn-card-body mdl-card"><p>${esc(md.descricao || '')}</p>${md.revisarComEscritorio ? '<span class="pill pill-today" style="justify-self:start">Modelo sugerido — confirme com o escritório</span>' : ''}<button type="button" class="btn btn-primary btn-sm" data-mdl="${n}" style="justify-self:start">${icon('fill', 'ic-sm')} Preencher</button></div></section>`).join('') || '<p class="muted">Nenhum modelo cadastrado pelo escritório.</p>'}</div>`;
    el.querySelectorAll('[data-mdl]').forEach(b => b.addEventListener('click', () => abrirModelo(M[+b.dataset.mdl], { empresa: S.ctx.empresa })));
  }
  const textoModelo = (md, vals) => (md.texto || []).map(l => String(l).replace(/\{(\w+)(?:\|([^}]*))?\}/g, (_, k, fb) => (vals[k] != null && String(vals[k]).trim() !== '' ? String(vals[k]) : (fb ?? '')))).join('\n');
  /** Modelo para assinar. iniciais: valores do pedido (funcionário, datas, admissão…); opts.nota: explicação; opts.acao: botão extra. */
  function abrirModelo(md, iniciais = {}, opts = {}) {
    const vals = { ...iniciais };
    const nomes = empregadosAtivos().map(e => e.nome);
    const campo = (c) => {
      const id = `md-${c.k}`;
      if (c.tipo === 'opcoes') return `<div class="field"><label for="${id}">${esc(c.rotulo)}</label><select class="input" id="${id}" data-k="${c.k}"><option value="">—</option>${(c.opcoes || []).map(o => `<option>${esc(o)}</option>`).join('')}</select></div>`;
      return `<div class="field"><label for="${id}">${esc(c.rotulo)}</label><input class="input" id="${id}" data-k="${c.k}" data-t="${c.tipo === 'data' ? 'data' : ''}" ${c.tipo === 'empregado' ? 'list="md-emps"' : ''} placeholder="${c.tipo === 'data' ? 'DD/MM/AAAA' : esc(c.dica || '')}" ${['data', 'numero'].includes(c.tipo) ? 'inputmode="numeric"' : ''} autocomplete="off">${c.dica && c.tipo !== 'data' ? `<span class="field-hint">${esc(c.dica)}</span>` : ''}</div>`;
    };
    const base = () => ({ ...vals, empresa: S.ctx.empresa, hoje: E.today().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) });
    const dlg = dialogo({
      titulo: esc(md.titulo), largo: true,
      corpo: `${opts.nota ? `<div class="note" style="margin:0 0 10px">${icon('info')}<div>${esc(opts.nota)}</div></div>` : ''}<div class="mdl-grid"><div style="display:grid;gap:10px;align-content:start">${(md.campos || []).map(campo).join('')}<datalist id="md-emps">${nomes.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        ${md.revisarComEscritorio ? `<div class="note warn" style="margin:0">${icon('alert')}<div>Modelo sugerido. Confirme o texto com o seu analista antes de usar.</div></div>` : ''}</div>
        <div class="mdl-prev" id="md-prev"></div></div>`,
      acoes: [{ rotulo: `${icon('copy', 'ic-sm')} Copiar texto`, fn: async () => { try { await navigator.clipboard.writeText(textoModelo(md, base())); toast('Texto copiado.'); } catch { toast('Não consegui copiar. Selecione o texto e use Ctrl+C.'); } return false; } },
        ...(opts.acao ? [{ rotulo: opts.acao.rotulo, fn: () => { setTimeout(() => opts.acao.fn(), 0); } }] : []),
        '|', { rotulo: 'Fechar' },
        { rotulo: `${icon('print', 'ic-sm')} Imprimir ou salvar em PDF`, cls: 'btn-primary', fn: () => { imprimir(textoModelo(md, base())); return false; } }]
    });
    // já preenchido com o que o pedido tem
    dlg.el.querySelectorAll('[data-k]').forEach(i => { const v = vals[i.dataset.k]; if (v == null || v === '') return; if (i.tagName === 'SELECT') { const o = [...i.options].find(x => E.norm(x.value) === E.norm(v)); if (o) i.value = o.value; } else i.value = v; });
    const prev = () => { dlg.el.querySelector('#md-prev').textContent = textoModelo(md, base()); };
    dlg.el.querySelectorAll('[data-k]').forEach(i => i.addEventListener('input', () => { if (i.dataset.t === 'data') A.maskInput(i); vals[i.dataset.k] = i.value; prev(); }));
    prev();
  }
  P.abrirModelo = abrirModelo;
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
    // frase com data, número ou funcionário ("férias do Ronaldo dia 10/11"): o 1º resultado entende a frase inteira
    const nomes = (S.plat.emp?.lista || []).map(e => e.nome);
    if (toks.length >= 2 && (/\d/.test(Q) || E.findDates(q).length || (nomes.length && E.findEmployeeInText(q, nomes)?.option))) {
      grupos.push(['Entender', [{ titulo: `Entender: ${q.trim()}`, sub: 'Abro o pedido com o que você escreveu', ic: 'chat', fn: () => A.entenderTexto(q.trim()) }]]);
    }
    if (Q) {
      grupos.push(['Novo pedido', E.searchIntents(q, S.rules).slice(0, 4).map(it => ({ titulo: it.titulo, sub: it.subtitulo || '', ic: A.ICONS[it.icone] || 'file', fn: () => A.openTipo(it.tipo) }))]);
      grupos.push(['Funcionários', (S.plat.emp?.lista || []).filter(e => bate(e.nome)).slice(0, 5).map(e => ({ titulo: e.nome, sub: e.ativo === false ? 'Desligado' : `Admissão ${fmt(E.parseDate(e.admissao))}`, ic: 'users', fn: () => { S.plat.filtroEmp = { q: e.nome, sit: 'todos' }; A.setView('funcionarios'); } }))]);
      grupos.push(['Solicitações', (S.plat.sol?.itens || []).filter(i => bate(`${i.numero} ${i.empregado} ${i.assunto} ${nomeTipo(i.tipo)} ${i.empresa}`)).slice(0, 5).map(i => ({ titulo: i.assunto || nomeTipo(i.tipo), sub: `${variasEmpresas(S.plat.sol?.itens) ? `${rotEmpresa(i)} · ` : ''}${nomeTipo(i.tipo)}${i.numero ? ` · nº ${i.numero}` : ''} · ${i.status}`, ic: 'list', fn: () => abrirDetalhe(i) }))]);
      grupos.push(['Dúvidas', E.buscarFaq(q, S.rules, 4).map(f => ({ titulo: f.pergunta, sub: 'Dúvida frequente', ic: 'info', fn: () => dialogo({ titulo: esc(f.pergunta), corpo: `<p style="margin:0">${esc(f.resposta)}</p>`, acoes: ['|', { rotulo: 'Fechar', cls: 'btn-primary' }] }) }))]);
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
