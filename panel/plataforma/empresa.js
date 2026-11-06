/* Plataforma — Empresa do pedido (escolha e troca).
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';

export function montarEmpresa(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { P, dialogo, esperar, nomeTipo } = C;   // definidos em partes que montam antes
  /* =================== EMPRESA DO PEDIDO ===================
     Com mais de uma empresa no acesso, abrir um pedido pergunta para qual empresa ele é (caixa por cima de tudo) e troca
     a empresa no portal antes de abrir o formulário. Dentro do pedido, o nome da empresa é um botão para trocar. Se a troca
     não puder ser confirmada no portal, nada é aberto nem preenchido: o pedido iria para a empresa errada. */
  S.plat.empresasConhecidas = [];   // só na memória: a lista das solicitações é relida a cada troca de empresa
  // filiais têm o mesmo nome: a escolhida na caixa leva o apelido ("MERCOCAMP | 0001-33"), que é o que as distingue
  const apelidoDe = (nome) => {
    const esc = S.plat.apelidoEscolhido;
    if (esc?.apelido && E.mesmaEmpresaNome(esc.nome, nome)) return esc.apelido;
    return (S.plat.empresasConhecidas || []).find(e => E.mesmaEmpresaNome(e.nome, nome))?.apelido || nome;
  };
  P.apelidoDe = apelidoDe;
  /** A empresa (nome e, se se sabe, apelido) já é a aberta no portal? Com o apelido dos dois lados vale o apelido; senão, o nome. */
  const codigoDe = (a) => (String(a || '').match(/\d{4}-\d{2}/) || [''])[0];
  const ehAtual = (nome, apelido = '') => {
    const ca = codigoDe(apelido), cb = codigoDe(S.ctx.empresaApelido);
    if (ca && cb) return ca === cb;                      // os dois lados têm o código da filial: é ele que decide
    return E.mesmaEmpresaNome(nome, S.ctx.empresa);      // sem código (empresa única ou apelido sem número): vale o nome
  };
  P.ehEmpresaAtual = ehAtual;
  P.empresasDoLogin = () => {
    // as da janela "Selecione uma empresa" do portal (todas as do acesso) + as já vistas + as das solicitações (que trazem quantas esperam e estão em aberto)
    const lista = E.empresasParaEscolha(S.plat.sol?.itens || [], S.ctx.empresa, [...(S.plat.empresasPortal || []), ...(S.plat.empresasConhecidas || [])], S.ctx.empresaApelido || '');
    S.plat.empresasConhecidas = lista.map(({ nome, apelido }) => ({ nome, apelido }));
    return lista;
  };
  /** Lê uma vez por sessão (na memória) a lista de empresas da janela do próprio portal. Se não der, a caixa segue só com as das solicitações e o motivo vai para o diagnóstico. */
  let lendoEmpresas = null;
  P.carregarEmpresasDoPortal = () => {
    if (S.plat.empresasPortal || S.plat.empresasPortalFalhou) return Promise.resolve();
    if (!lendoEmpresas) lendoEmpresas = (async () => {
      try {
        const r = await request({ type: 'empresasDoPortal' }, 20000);
        if (r?.ok && r.empresas?.length) { S.plat.empresasPortal = r.empresas.map(({ nome, apelido }) => ({ nome, apelido })); S.plat.empresasPortalDiag = `${r.empresas.length} empresa(s) lida(s) da janela do portal`; }
        else { S.plat.empresasPortalFalhou = true; S.plat.empresasPortalDiag = `não li a janela do portal (${r?.motivo || 'sem resposta'}); a caixa mostra só as empresas com solicitações`; }
      } catch { S.plat.empresasPortalFalhou = true; S.plat.empresasPortalDiag = 'não li a janela do portal (sem resposta); a caixa mostra só as empresas com solicitações'; }
      finally { lendoEmpresas = null; }
    })();
    return lendoEmpresas;
  };
  const esperarSolicitacoes = async () => { if (!S.plat.sol) await Promise.race([P.carregarSolicitacoes(), esperar(8000)]).catch(() => {}); };

  /** A caixa: uma empresa por linha (escolha única). Devolve o nome escolhido ou null se o cliente desistiu. */
  function caixaEmpresa({ tipo, emps, sugerida = '', titulo, dica, botao = 'Continuar' }) {
    return new Promise((resolve) => {
      let escolhido = null;
      const atual = emps.find(e => e.atual)?.nome;
      const sug = sugerida && emps.find(e => E.mesmaEmpresaNome(e.nome, sugerida))?.nome;
      const inicial = sug || atual || emps[0].nome;
      const linhas = emps.map((e, i) => `<label class="ee-li" data-nome="${esc(e.nome)}" data-ap="${esc(e.apelido || '')}">
        <input type="radio" name="ee-emp" value="${esc(e.nome)}"${e.nome === inicial && emps.findIndex(x => x.nome === inicial) === i ? ' checked' : ''}>
        <span class="es-tx"><b>${esc(e.apelido || e.nome)}${e.atual ? ' <span class="es-tag">aberta no portal</span>' : ''}${!e.atual && sug === e.nome ? ' <span class="es-tag">a do pedido anterior</span>' : ''}</b>${e.apelido && e.apelido !== e.nome ? `<small>${esc(e.nome)}</small>` : ''}</span>
        <span class="es-n">${e.esperam ? `<em>${e.esperam} esperam você</em>` : ''}${e.abertas ? `<span>${e.abertas} em aberto</span>` : ''}</span></label>`).join('');
      const dlg = dialogo({
        titulo: titulo || 'Para qual empresa é este pedido?',
        corpo: `<p class="muted ee-dica">${esc(dica || `Você tem acesso a mais de uma empresa. Escolha para qual vai o pedido${tipo ? ` de ${nomeTipo(tipo)}` : ''}: eu troco a empresa no portal e abro a solicitação.`)}</p>
          ${emps.length > 6 ? '<input type="search" class="es-q ee-q" placeholder="Buscar empresa…" autocomplete="off" aria-label="Buscar empresa">' : ''}
          <div class="ee-lista" role="radiogroup" aria-label="Empresas">${linhas}</div>`,
        acoes: [{ rotulo: 'Cancelar' }, '|', { rotulo: botao, cls: 'btn-primary', fn: () => { const marcado = dlg.el.querySelector('input[name="ee-emp"]:checked'); escolhido = marcado?.value || null; if (!escolhido) return false; S.plat.apelidoEscolhido = { nome: escolhido, apelido: marcado.closest('.ee-li')?.dataset.ap || '' }; } }]
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
      acoes: [{ rotulo: `${icon('external', 'ic-sm')} Ver no portal`, fn: () => send({ type: 'verPortal' }) }, { rotulo: `${icon('copy', 'ic-sm')} Copiar diagnóstico`, fn: () => A.copiarDiagnostico?.() }, '|', { rotulo: 'Fechar', cls: 'btn-primary' }]
    });
  }
  /** Troca a empresa no portal e confirma vendo o nome novo. `manter` = o pedido (tipo) cujos dados seguem com o cliente. */
  P.irParaEmpresa = async (alvo, { manter = null, conservarEmpregado = false, doLote = false } = {}) => {
    if (ehAtual(alvo, S.plat.apelidoEscolhido && E.mesmaEmpresaNome(S.plat.apelidoEscolhido.nome, alvo) ? S.plat.apelidoEscolhido.apelido : '')) return true;
    S.trocaPedida = { de: S.ctx.empresa, para: alvo, manter, conservarEmpregado, doLote };
    toast(`Trocando para ${apelidoDe(alvo)} no portal…`);
    const ap = apelidoDe(alvo);
    const r = await request({ type: 'trocarEmpresa', nome: alvo, apelido: ap && ap !== alvo ? ap : '' }, 70000);   // o portal lista a empresa pelo nome ou pelo apelido
    S.plat.trocaDiag = r && !r.ok ? { motivo: r.motivo || '', detalhe: r.detalhe || '' } : null;
    // o contexto novo chega pelo canal; se o portal já disse que não trocou, não há o que esperar
    if (r?.ok) for (let k = 0; k < 40 && !ehAtual(alvo, ap && ap !== alvo ? ap : ''); k++) await esperar(250);
    const ok = !!r?.ok && ehAtual(alvo, ap && ap !== alvo ? ap : '');
    S.trocaPedida = null;
    if (!ok) { avisoTroca(alvo, r?.motivo); return false; }
    return true;
  };
  /** Chamada antes de abrir um formulário novo: pergunta a empresa (se houver mais de uma) e troca no portal.
   *  Devolve false se o cliente desistiu ou se a troca não foi confirmada. */
  P.escolherEmpresa = async ({ tipo, empresa, apelido = '', sugerida, conservarEmpregado = false, doLote = false } = {}) => {
    if (empresa && ehAtual(empresa, apelido)) return true;   // já está nela
    if (empresa) S.plat.apelidoEscolhido = { nome: empresa, apelido };   // empresa já decidida (ex.: a do funcionário do atestado): não pergunta
    if (S.modo === 'plataforma') await Promise.all([esperarSolicitacoes(), P.carregarEmpresasDoPortal()]);
    const emps = P.empresasDoLogin();
    if (emps.length <= 1) return true;
    const alvo = empresa || await caixaEmpresa({ tipo, emps, sugerida });
    if (!alvo) return false;
    return P.irParaEmpresa(alvo, { manter: tipo || null, conservarEmpregado, doLote });
  };
  /** Botão da empresa dentro do pedido: troca a empresa e leva o pedido junto. O funcionário e as listas são da empresa
   *  antiga (saem); o resto do que o cliente preencheu fica. */
  P.trocarEmpresaDoPedido = async () => {
    const tipo = S.ctx.tipo; if (!tipo || S.ctx.route?.mode !== 'form' || document.body.classList.contains('trocando-empresa')) return;
    if (S.modo === 'plataforma') await Promise.all([esperarSolicitacoes(), P.carregarEmpresasDoPortal()]);
    const emps = P.empresasDoLogin(); if (emps.length <= 1) return;
    const alvo = await caixaEmpresa({ tipo, emps, titulo: 'Trocar a empresa do pedido', botao: 'Trocar de empresa',
      dica: 'O funcionário e as listas são de cada empresa: ao trocar, você escolhe o funcionário de novo. O resto do que você preencheu fica.' });
    if (!alvo || ehAtual(alvo, S.plat.apelidoEscolhido?.apelido || '')) return;
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
      // o foco pode ter voltado ao campo do funcionário (e com foco num campo o formulário não é redesenhado): redesenha
      if (document.activeElement?.closest?.('#fields')) document.activeElement.blur();
      if (S.ctx.tipo === tipo) A.renderFieldsOnly();
      toast(`Pedido movido para ${apelidoDe(alvo)}. Escolha o funcionário desta empresa.`);
    } finally { document.body.classList.remove('trocando-empresa'); }
  };

}
