/* Plataforma — Novo pedido.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */

export function montarNovopedido(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { P, esperar, nomeTipo, passosAbertos } = C;   // definidos em partes que montam antes
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
  P.novoPedido = async (tipo, { empregado, valores = {}, sugeridos = {}, fonte = 'sugestão do Assistente', observacoes = '', empresa, extras = null, linhas = null, semResumo = false } = {}) => {
    A.comecarDoZeroSeAbandonado(tipo);
    const W = A.w(tipo);
    const dados = { ...(empregado ? { empregado } : {}), ...Object.fromEntries(Object.entries(valores).filter(([k, v]) => v != null && v !== '' && S.rules.tipos[tipo]?.campos?.[k])) };
    for (const [k, v] of Object.entries(dados)) { W.valores[k] = { valor: String(v), conf: 1, fonte: 'você' }; W.editados.add(k); W.fonteVerdade[k] = 'plataforma'; }
    A.aplicarSugestoes(tipo, Object.fromEntries(Object.entries(sugeridos || {}).filter(([k]) => !(k in dados))), fonte);
    if (observacoes) W.valores.observacoes = { valor: observacoes, conf: 1, fonte: 'você' };
    // o que não é campo do portal mas entra no texto (ex.: as linhas das variáveis da folha) e as linhas para a grade
    for (const [k, v] of Object.entries(extras || {})) if (v?.valor) W.valores[k] = v;
    if (linhas?.length) W.linhasRubricas = linhas;
    W.rascunhoVisto = true;
    A.gerarTextos(tipo);
    // com funcionário escolhido a empresa já está definida (a lista dele é a da empresa aberta ou a da solicitação de origem)
    const alvo = empresa || (empregado ? S.ctx.empresa : '');
    if (alvo && !(await P.escolherEmpresa({ tipo, empresa: alvo, conservarEmpregado: !!empregado }))) return;
    await A.openTipo(tipo, { manter: true, semEmpresa: !!alvo });
    for (let k = 0; k < 40 && !(S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo); k++) await esperar(200);
    if ((Object.keys(dados).length || Object.keys(sugeridos || {}).length) && S.ctx.tipo === tipo) {
      await A.loadEmpregados(tipo); await A.fillPortal(tipo, { daPlataforma: true });
      if (!semResumo) await A.abrirResumoSePronto(tipo);
    }
  };

  Object.assign(C, { renderPedido });
}
