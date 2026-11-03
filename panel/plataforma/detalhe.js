/* Plataforma — Detalhe da solicitação (2.4, ampliado na 2.19).
 * Conversa, Dados e O que observar; navegação ‹ › entre as solicitações da lista que o cliente via; destaques em chips
 * por tipo de pedido (regras: config.destaquesDetalhe) e o foco que pisca na lista (P.focarSolicitacao).
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';
import * as D from '../dados.js';

export function montarDetalhe(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { P, dialogo, editavel, fmt, itensVisiveis, nomeTipo, pedirCalculoDoAviso, pedirDeNovo, pillSol, prepararResposta, variasEmpresas } = C;   // definidos em partes que montam antes
  /* Detalhe (2.4, como o do Control Onvio): Conversa (trâmites em bolhas: você à direita, o escritório à esquerda,
     o tempo entre um e outro e o fim à vista), Dados (a solicitação completa, em português) e O que observar
     (prazos e cuidados do que você pediu). Tudo lido na hora com o acesso do portal e nunca guardado. */
  const iniciais = (n) => String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const chaveSol = (i) => `${i?.tipo}|${i?.id || i?.numero}`;
  const maisNova = (i) => (S.plat.sol?.itens || []).find(x => chaveSol(x) === chaveSol(i)) || i;   // a leitura automática troca os objetos
  // a lista que o cliente estava vendo: a das Solicitações (filtrada e ordenada na tela) ou a do Hoje (mesma ordem de urgência)
  const listaHoje = () => E.prioridadesCliente(itensVisiveis(), E.today(), S.rules).filter(p => p.motivo !== 'concluida').map(p => p.item);
  function filaDoContexto(i, lista) {
    const l = (lista || (S.view === 'pendencias' ? S.plat.listaSol : S.view === 'inicio' ? listaHoje() : null) || []).filter(Boolean);
    return l.some(x => chaveSol(x) === chaveSol(i)) ? l.slice() : [i];   // vindo da busca ou de outra tela: só a própria
  }
  function abrirDetalhe(i, { aba = 'conversa', lista = null } = {}) {
    if (!i) return;
    i = maisNova(i);
    const fila = filaDoContexto(i, lista), pos = Math.max(0, fila.findIndex(x => chaveSol(x) === chaveSol(i)));
    let navegando = false, irLista = false;   // trocar de solicitação e "Ver na lista" fecham a janela sem piscar o cartão de antes
    const t = S.rules.tipos[i.tipo];
    const mo = E.motivoCliente(i, E.today(), S.rules);
    const st = { aba, trs: null, trsErro: false, dados: null, dadosErro: false, bruto: null, datas: { ...(i.datas || {}) } };
    // resposta ao vivo (2.12, regras: config.respostaPortal.livre): só em solicitação que aguarda o cliente; o texto fica só na memória
    const livre = S.rules.config?.respostaPortal?.livre || {};
    const podeResponder = !!(t && i.numero && i.aguardando && livre.ativo !== false);
    const resp = { texto: '', arquivos: [], aberta: false, escrito: '', fila: null, esperando: null, confirmando: false, enviando: false, estado: ['', ''] };
    const bloqueios = (livre.bloquear || []).map(x => { try { return new RegExp(x, 'i'); } catch { return null; } }).filter(Boolean);
    const bloqueada = () => bloqueios.some(r => r.test(resp.texto));
    const nosChips = new Set(E.destaquesDetalhe(i, i.datas, null, S.rules, E.today()).map(x => x.id));   // o que já está nos chips não repete aqui
    const topo = [['Responsável no escritório', i.responsavel], ['Aberta em', fmt(i.criado)], ['Atualizada', fmt(i.atualizado)], ['Expectativa', i.expectativa && !nosChips.has('expectativa') ? fmt(i.expectativa) : ''],
      ['Prescreve em', i.prescreveEm != null && !nosChips.has('prescreve') ? `${i.prescreveEm} dia(s)` : ''], ['Empresa', variasEmpresas(S.plat.sol?.itens) ? i.empresa : '']].filter(([, v]) => v && v !== '—');
    const irAoPortal = () => request({ type: 'abrirNoPortal', slug: t?.slug, numero: i.numero }, 30000);
    /* ‹ › e as setas ← → (sem roubar o foco de campos de texto) percorrem a lista; a aba aberta continua a mesma */
    const irPara = (delta) => {
      const n = pos + delta; if (n < 0 || n >= fila.length) return;
      if (resp.texto.trim()) { toast('Você começou uma resposta aqui. Envie ou apague o texto antes de ver outra solicitação.'); return; }
      navegando = true;
      abrirDetalhe(fila[n], { aba: st.aba, lista: fila });
      const d = $('#modal').querySelector(`[data-dt-nav="${delta}"]:not([disabled])`) || $('#modal').querySelector('[data-dt-nav]:not([disabled])');
      d?.focus();   // o foco continua no botão usado (ou no que sobrou, se chegou a uma ponta)
    };
    const teclas = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      if (editavel(e.target) || e.target.closest?.('details') || !$('#cmdk').hidden) return;
      e.preventDefault(); irPara(e.key === 'ArrowLeft' ? -1 : 1);
    };
    const navHtml = fila.length > 1 ? `<nav class="dt-nav" aria-label="Navegar entre as solicitações da lista">
        <button type="button" class="btn btn-sm" data-dt-nav="-1" aria-label="Solicitação anterior" title="Anterior (seta para a esquerda)"${pos === 0 ? ' disabled' : ''}>${icon('left', 'ic-sm')}</button>
        <span class="dt-nav-n" aria-live="polite" aria-atomic="true"><b>${pos + 1}</b> de ${fila.length}</span>
        <button type="button" class="btn btn-sm" data-dt-nav="1" aria-label="Próxima solicitação" title="Próxima (seta para a direita)"${pos === fila.length - 1 ? ' disabled' : ''}>${icon('right', 'ic-sm')}</button></nav>` : '';
    const dlg = dialogo({
      titulo: `${esc(nomeTipo(i.tipo))}${i.numero ? ` <span class="mono" style="font-size:13px;color:var(--ink-3)">nº ${esc(i.numero)}</span>` : ''}`, largo: true,
      corpo: `<div class="dt-top"><div class="dt-assunto"><b>${esc(i.assunto || nomeTipo(i.tipo))}</b>${i.empregado && !E.norm(i.assunto).includes(E.norm(i.empregado)) ? `<small>${esc(i.empregado)}</small>` : ''}</div>${pillSol(i)}${navHtml}</div>
        ${mo ? `<p class="dt-porque">${esc(E.porqueMotivo(i, mo, S.rules))}</p>` : ''}
        <div class="dt-meta">${topo.map(([k, v]) => `<span><small>${esc(k)}</small><b>${esc(v)}</b></span>`).join('')}</div>
        <div class="dt-dq" id="dt-dq" role="list" aria-label="Em destaque"></div>
        <div class="dp-tabs dt-tabs" role="tablist">${[['conversa', 'Conversa'], ['dados', 'Dados'], ['observar', 'O que observar']].map(([k, r]) => `<button type="button" role="tab" class="dp-tab" data-dt="${k}">${r}</button>`).join('')}</div>
        <div class="dt-aviso" id="dt-aviso" hidden></div>
        <div class="dt-body" id="dt-body"></div>
        <div class="dt-resp" id="dt-resp" hidden></div>`,
      aoFechar: () => {
        if (resp.escrito) request({ type: 'respostaLimpar' }, 5000);
        document.removeEventListener('keydown', teclas);
        // voltou para a lista: o cartão desta solicitação pisca para o cliente se achar (depois de ‹ ›, é o da última que viu)
        if (!navegando && !irLista && S.view === 'pendencias') setTimeout(() => P.focarSolicitacao(i, { navegar: false }), 60);
      },
      acoes: [...(['avisoFerias', 'avisoRescisao'].includes(i.tipo) && !['cancelada', 'prescrita'].includes(i.estado) ? [{ rotulo: `${icon('calc', 'ic-sm')} Pedir o cálculo`, cls: 'dt-pedir-calc', fn: () => { pedirCalculoDoAviso(i, st.datas); } }] : []),
        ...(t ? [{ rotulo: `${icon('refresh', 'ic-sm')} Pedir de novo`, cls: 'dt-pedir-novo', fn: () => { pedirDeNovo(i, st.bruto); } }] : []),
        ...(t && i.aguardando && (S.rules.config?.respostaPortal?.textos || []).length ? [{ rotulo: `${icon('chat', 'ic-sm')} Preparar resposta`, cls: 'dt-responder', fn: () => { setTimeout(() => prepararResposta(i), 0); } }] : []),
        ...(S.view !== 'pendencias' ? [{ rotulo: `${icon('list', 'ic-sm')} Ver na lista`, cls: 'btn-ghost dt-na-lista', fn: () => { irLista = true; setTimeout(() => P.focarSolicitacao(i), 0); } }] : []),
        { rotulo: `${icon('external', 'ic-sm')} ${i.aguardando ? 'Responder no portal' : 'Ver no portal'}`, cls: 'btn-primary', fn: () => irAoPortal() },
        { rotulo: `${icon('copy', 'ic-sm')} Copiar observações`, cls: 'btn-ghost dt-copiar', fn: async () => { const o = E.observacoesCliente(i, st.datas, S.rules); try { await navigator.clipboard.writeText(o.map(x => `• ${x.texto}`).join('\n')); toast('Observações copiadas.'); } catch { toast('Não consegui copiar.'); } return false; } },
        '|', { rotulo: 'Fechar' }]
    });
    const el = dlg.el, body = el.querySelector('#dt-body');
    el.classList.add('dlg-detalhe');
    document.addEventListener('keydown', teclas);
    el.querySelectorAll('[data-dt-nav]').forEach(b => b.addEventListener('click', () => irPara(+b.dataset.dtNav)));
    const chipAnexo = (a) => { const ext = (/\.([a-z0-9]{2,5})$/i.exec(a || '') || [])[1]; return `<span class="tr-arq" title="${esc(a)}">${icon('clip', 'ic-sm')}${ext ? `<em class="tr-ext">${esc(ext.toUpperCase())}</em>` : ''}<span>${esc(a)}</span></span>`; };
    const carregando = (txt) => `<div class="pn-vazio"><div class="spin"></div>${esc(txt)}</div>`;
    const conversa = () => {
      if (st.trsErro) return `${i.tramite ? `<div class="note">${icon('chat')}<div><b>Último trâmite</b><br>${esc(i.tramite)}</div></div>` : ''}<div class="note">${icon('info')}<div>Não consegui ler os trâmites agora. Use “${i.aguardando ? 'Responder' : 'Ver'} no portal” para ver a conversa completa.</div></div>`;
      if (!st.trs) return carregando('Lendo a conversa no portal…');
      if (!st.trs.length) return `<div class="pn-vazio">${icon('chat', 'ic-sm')} Nenhum trâmite ainda: o escritório ainda não respondeu.</div>`;
      const ult = st.trs[st.trs.length - 1];
      let ant = null;
      return `<div class="tr-lista">${st.trs.map(x => {
        const intervalo = ant ? E.intervaloEntre(ant.em, x.em, S.rules) : '';   // só quando o intervalo é longo (config.detalheConversa)
        const gap = intervalo ? `<div class="tr-gap" role="separator"><span>${esc(intervalo)}</span></div>` : '';
        ant = x;
        const voce = x.lado === 'cli', quem = x.autor || (voce ? 'Você' : 'Escritório');
        return `${gap}<div class="tr-item ${voce ? 'cli' : 'esc'}${x === ult ? ' ultimo' : ''}"><span class="tr-av" title="${esc(quem)}">${esc(iniciais(quem) || (voce ? 'V' : 'E'))}</span>
          <div class="tr-bolha"><div class="tr-meta"><b>${esc(quem)}</b><span class="tr-lado">${x.n === 1 ? 'abertura' : voce ? 'você' : 'escritório'}</span>${x.situacao ? `<span class="pill">${esc(x.situacao)}</span>` : ''}${x === ult ? '<span class="pill pill-soon">último</span>' : ''}<time class="tr-quando" datetime="${esc(x.em)}" title="${esc(E.dataHoraLonga(x.em))}">${esc(E.tempoRelativo(x.em))}</time></div>
          ${x.texto ? `<div class="tr-texto">${esc(textoPuro(x.texto))}</div><button type="button" class="tr-mais" aria-expanded="false">Ver mais</button>` : `<div class="tr-texto muted">Sem texto${x.anexos.length ? ' (só anexo)' : ''}</div>`}
          ${x.anexos.length ? `<div class="tr-anexos">${x.anexos.map(chipAnexo).join('')}</div>` : ''}</div></div>`;
      }).join('')}</div>`;
    };
    /* O que a conversa pede ao cliente, fixo acima dela (não rola com as mensagens). O botão é o mesmo "Responder no portal". */
    const avisoDaConversa = () => {
      const v = i.veredito;
      if (st.aba !== 'conversa' || st.trsErro || !st.trs?.length || !v) return '';
      if (v.anexoSemArquivo) return `<div class="aviso-linha late">${icon('alert')}<span>Você falou em anexo (“${esc(v.trecho)}”), mas nenhum arquivo chegou. Anexe de novo no portal.</span></div>`;
      if (v.ultimoLado !== 'esc') return '';
      if (v.pede) {
        const prazo = i.aguardando && i.prescreveEm != null ? ` Responda em até ${i.prescreveEm} ${i.prescreveEm === 1 ? 'dia' : 'dias'}, para a solicitação não ser encerrada.` : '';
        return `<div class="aviso-linha late dt-pede">${icon('chat')}<span><b>O escritório está pedindo:</b> “${esc(v.frase)}”<small>Responder logo ajuda o pedido a andar.${esc(prazo)}</small></span>${i.aguardando ? `<button type="button" class="btn btn-sm btn-primary" id="dt-aviso-resp" aria-label="Responder no portal: o escritório está pedindo uma informação">${icon('external', 'ic-sm')} Responder no portal</button>` : ''}</div>`;
      }
      return i.aguardando ? `<div class="aviso-linha ok">${icon('check')}<span>O escritório respondeu e não pediu nada. Confira a resposta e conclua no portal.</span></div>` : '';
    };
    const dados = () => {
      if (st.dadosErro) return `<div class="note">${icon('info')}<div>Não consegui ler a solicitação completa agora. Use “Ver no portal”.</div></div>`;
      if (!st.dados) return carregando('Lendo a solicitação completa no portal…');
      if (!st.dados.grupos.length) return `<div class="pn-vazio">Sem dados para mostrar.</div>`;
      return st.dados.grupos.map(g => `<section class="dt-grupo"><h4>${esc(g.titulo)}</h4><div class="dt-campos">${g.campos.map(c => `<div class="dt-campo${c.destaque ? ' dq' : ''}${c.longo ? ' longo' : ''}"><small>${esc(c.k)}</small><span>${esc(c.v)}</span></div>`).join('')}</div></section>`).join('')
        + (st.dados.anexos.length ? `<section class="dt-grupo"><h4>Anexos da abertura</h4><div class="tr-anexos">${st.dados.anexos.map(chipAnexo).join('')}</div></section>` : '');
    };
    const observar = () => {
      const o = E.observacoesCliente(i, st.datas, S.rules);
      if (!o.length) return st.dados || st.dadosErro ? `<div class="pn-vazio">${icon('check', 'ic-sm')} Nada especial a observar neste pedido.</div>` : carregando('Lendo as datas do pedido…');
      return `<ul class="dt-obs">${o.map(x => `<li class="${x.alerta ? 'alerta' : ''}">${icon(x.alerta ? 'alert' : 'info', 'ic-sm')}<span>${esc(x.texto)}</span></li>`).join('')}</ul>`;
    };
    // por tipo de pedido (regras); sem regra para o tipo, os campos em destaque que o portal mandou na aba Dados
    const destaques = () => {
      const l = E.destaquesDetalhe(i, st.datas, st.bruto, S.rules, E.today());
      return l.length ? l : (st.dados?.grupos.flatMap(g => g.campos).filter(c => c.destaque && !c.longo && c.k !== 'Assunto').slice(0, 4) || []);
    };
    const desenhar = () => {
      if (!el.isConnected) return;
      el.querySelectorAll('[data-dt]').forEach(b => { const on = b.dataset.dt === st.aba; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
      body.innerHTML = { conversa, dados, observar }[st.aba]();
      el.querySelector('#dt-resp').hidden = !(podeResponder && st.aba === 'conversa');
      el.querySelector('#dt-dq').innerHTML = destaques().map(c => `<span class="dq${c.alerta ? ' alerta' : ''}" role="listitem"><small>${esc(c.k)}</small><b>${esc(c.v)}</b></span>`).join('');
      const av = el.querySelector('#dt-aviso'), htmlAviso = avisoDaConversa();
      av.hidden = !htmlAviso; av.innerHTML = htmlAviso;
      av.querySelector('#dt-aviso-resp')?.addEventListener('click', () => { irAoPortal(); dlg.fechar(); });
      el.querySelector('.dt-copiar').hidden = !E.observacoesCliente(i, st.datas, S.rules).length;
      body.querySelectorAll('.tr-mais').forEach(b => b.addEventListener('click', () => { const c = b.closest('.tr-bolha'); const ab = c.classList.toggle('aberto'); b.textContent = ab ? 'Ver menos' : 'Ver mais'; b.setAttribute('aria-expanded', String(ab)); }));
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
    const apiDet = t?.apiDetalhe || t?.apiLista;
    if (apiDet && i.id) request({ type: 'detalheCompleto', lista: apiDet, solicitacao: i.id }, 20000).then((r) => {
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
  /** HTML do trâmite → texto (o portal guarda a conversa em HTML). Nada é executado: o DOMParser não roda scripts. */
  function textoPuro(html) {
    if (!html) return '';
    if (!/[<&]/.test(html)) return html;
    const doc = new DOMParser().parseFromString(`<div>${String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')}</div>`, 'text/html');
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  /* Foco que pisca (2.19): leva o cliente à lista de Solicitações, mostra o cartão/linha da solicitação (tirando os filtros
     que a escondem), rola até ele e pisca um contorno vermelho por ~2 s. Serve a quem chega por um aviso, pelo sino ou
     pela busca. ref = a solicitação, o id ou o nº. navegar:false só pisca se já estiver na tela de Solicitações. */
  const ACHAR_CARTAO = '#sol-grupos [data-card]';
  const elementoDe = (i) => { const l = S.plat.listaSol || []; return [...viewEl.querySelectorAll(ACHAR_CARTAO)].find(b => l[+b.dataset.card] && chaveSol(l[+b.dataset.card]) === chaveSol(i)) || null; };
  function acharSolicitacao(ref) {
    const itens = S.plat.sol?.itens || [];
    if (ref && typeof ref === 'object') return itens.find(x => chaveSol(x) === chaveSol(ref)) || ref;
    const r = String(ref ?? ''); if (!r) return null;
    return itens.find(x => x.id === r) || itens.find(x => x.numero === r) || null;
  }
  function focarSolicitacao(ref, { navegar = true } = {}) {
    const i = acharSolicitacao(ref); if (!i) return false;
    if (S.view !== 'pendencias') { if (!navegar) return false; A.setView('pendencias'); }
    S.plat.focoSol = chaveSol(i);   // o "marcador" (como o foco= do endereço no Control Onvio): sai assim que pisca
    let relaxou = false, tentativas = 0;
    const tique = setInterval(() => {
      if (S.plat.focoSol !== chaveSol(i) || S.view !== 'pendencias' || ++tentativas > 50) { clearInterval(tique); if (S.plat.focoSol === chaveSol(i)) S.plat.focoSol = null; return; }
      if (!S.plat.sol || !$('#sol-grupos')) return;   // ainda lendo o portal
      const el = elementoDe(i);
      if (el) { clearInterval(tique); S.plat.focoSol = null; piscar(el); return; }
      if (relaxou) return;
      // escondida por filtro, pela empresa, pelo limite do grupo ou por ser antiga: mostra tudo o que for preciso
      relaxou = true;
      const F = S.plat.filtroSol, mo = E.motivoCliente(i, E.today(), S.rules);
      F.tipo = ''; F.q = ''; F.motivo = mo && F.vis !== 'tabela' ? mo : null;
      if (!mo) F.vis = 'tabela';
      if (!itensVisiveis().some(x => chaveSol(x) === chaveSol(i))) S.plat.empresaFiltro = '*';
      P.render('pendencias');
    }, 120);
    return true;
  }
  function piscar(el) {
    const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { el.scrollIntoView({ block: 'center', behavior: reduzido ? 'auto' : 'smooth' }); } catch { /* sem rolagem */ }
    try { el.focus({ preventScroll: true }); } catch { /* sem foco */ }
    el.classList.remove('foco-pisca'); void el.offsetWidth; el.classList.add('foco-pisca');
    setTimeout(() => el.classList.remove('foco-pisca'), 2400);
  }
  P.focarSolicitacao = focarSolicitacao;

  Object.assign(C, { abrirDetalhe, focarSolicitacao, iniciais });
}
