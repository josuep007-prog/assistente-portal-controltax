/* Plataforma — Entrada, contexto, avisos e troca de tela.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';

export function montarEntrada(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { P, assinatura, atualizarCabecalho, atualizarSync, badge, esperar, fmt, hora, marcarModulo, montarCasca, quando, seguroRedesenhar } = C;   // definidos em partes que montam antes
  const dialogo = (...a) => C.dialogo(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const renderAgenda = (...a) => C.renderAgenda(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const renderDocumentos = (...a) => C.renderDocumentos(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const renderFuncionarios = (...a) => C.renderFuncionarios(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const renderPainel = (...a) => C.renderPainel(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const renderPedido = (...a) => C.renderPedido(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const renderSolicitacoes = (...a) => C.renderSolicitacoes(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
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
      acoes: [{ rotulo: 'Fechar' }, '|', { rotulo: `${icon('external', 'ic-sm')} Ver no portal`, cls: 'btn-primary', fn: () => send({ type: 'verPortal' }) }]
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
    $('#leit-portal').addEventListener('click', () => send({ type: 'verPortal' }));
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
    S.plat.desenhada = assinatura(S.plat.sol);
    const trocou = P.ultimaVista !== v; P.ultimaVista = v;   // entrada suave só ao trocar de tela
    if (v !== 'preencher') S.plat.escolher = false;
    viewEl.className = `view plat-view v-${v}${trocou ? ' entra' : ''}`;
    ({ inicio: renderPainel, pendencias: renderSolicitacoes, preencher: renderPedido, funcionarios: renderFuncionarios, historico: renderAgenda, documentos: renderDocumentos, ferramentas: A.renderFerramentas, config: A.renderConfig }[v] || renderPainel)();
  };

  Object.assign(C, { avisoLeitura, continuarRascunho, fazerAgora, passosAbertos });
}
