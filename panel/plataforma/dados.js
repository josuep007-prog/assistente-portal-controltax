/* Plataforma — Dados do portal: solicitações, funcionários e leitura automática.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';
import * as D from '../dados.js';

export function montarDados(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { P, atualizarBadge, atualizarSync, editavel, quando } = C;   // definidos em partes que montam antes
  const avisoLeitura = (...a) => C.avisoLeitura(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  /* =================== Dados do portal =================== */
  /* Leitura automática (config.leituraAutomaticaSegundos, padrão 30): só com a aba à vista e sem preenchimento
     em andamento. Redesenha só quando algo mudou e ninguém está digitando nem com uma janela aberta. */
  const assinatura = (sol) => (sol?.itens || []).map(i => `${i.tipo}:${i.id}:${i.status}:${i.atualizado?.getTime() || ''}:${i.veredito ? `${i.veredito.pede ? 'p' : 'n'}${i.veredito.anexoSemArquivo ? 'a' : ''}` : ''}:${i.datas?.inicioFerias || i.datas?.admissao || i.datas?.desligamento ? 'd' : ''}`).join('|') + `#${sol?.semAcesso ? 1 : 0}`;
  S.plat.desenhada = '';
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
    if (ass !== S.plat.desenhada && seguroRedesenhar()) P.render(S.view);
  }
  let cicloDocs = 0;
  function iniciarLeituraAutomatica() {
    if (relogio) return;
    const seg = Math.max(15, +S.rules?.config?.leituraAutomaticaSegundos || 30);
    S.plat.proximaLeitura = Date.now() + seg * 1000;
    relogio = setInterval(() => {
      S.plat.proximaLeitura = Date.now() + seg * 1000;
      if (document.hidden || S.plat.carregandoSol || S.preenchendo || !S.plat.sol) { redesenharSePreciso(); return; }
      P.carregarSolicitacoes(true, { silencioso: true });
      if (++cicloDocs % 10 === 0 && S.plat.docs?.disponivel) P.carregarDocumentos(true, { silencioso: true });   // documentos novos do escritório (~a cada 5 min)
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
      if (!S.plat.docs) P.carregarDocumentos().catch(() => {});   // documentos novos do escritório (número no menu)
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

  Object.assign(C, { assinatura, relogio, seguroRedesenhar });
}
