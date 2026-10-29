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
      acoes: [{ rotulo: `${icon('external', 'ic-sm')} Ver no portal`, fn: () => send({ type: 'verPortal' }) }, '|', { rotulo: 'Fechar', cls: 'btn-primary' }]
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
      // o foco pode ter voltado ao campo do funcionário (e com foco num campo o formulário não é redesenhado): redesenha
      if (document.activeElement?.closest?.('#fields')) document.activeElement.blur();
      if (S.ctx.tipo === tipo) A.renderFieldsOnly();
      toast(`Pedido movido para ${apelidoDe(alvo)}. Escolha o funcionário desta empresa.`);
    } finally { document.body.classList.remove('trocando-empresa'); }
  };

}
