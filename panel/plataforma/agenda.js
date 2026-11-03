/* Plataforma — Agenda: calendário do mês, painel do dia, lembretes e prazos.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam.
 * A conta do mês (dias, semanas, eventos por dia, dia útil e feriado) é pura e fica em panel/engine/agenda.js; aqui só há tela. */
import * as E from '../engine.js';

export function montarAgenda(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { ROT_EV, cap, dialogo, eventosEntre, fazerAgora, hora, linhaEvento, nomeTipo, renderPainel } = C;   // definidos em partes que montam antes
  const abrirDetalhe = (...a) => C.abrirDetalhe(...a);   // definido numa parte que monta antes (chamado só em tempo de uso)
  /* =================== AGENDA (calendário do mês) =================== */
  // tipos escondidos na legenda: preferência desta tela, neste computador
  const lerOcultos = () => { try { const v = JSON.parse(localStorage.getItem('ct.agOcultos') || '[]'); return Array.isArray(v) ? v.filter(k => E.TIPOS_AGENDA.includes(k)) : []; } catch { return []; } };
  const gravarOcultos = (l) => { try { localStorage.setItem('ct.agOcultos', JSON.stringify(l)); } catch { /* sem armazenamento: vale só nesta tela */ } };
  const admissaoDe = (nome) => A.admissaoDe?.(nome) || E.parseDate((S.plat.emp?.lista || []).find(e => E.norm(e.nome) === E.norm(nome))?.admissao) || null;
  let D = null;   // o mês montado na última vez que desenhou: { G, msg, todos, mes }

  function estado() {
    const G = S.plat.agenda, hoje = E.today();
    if (!G.ocultos) G.ocultos = lerOcultos();
    if (!E.parseDate(G.sel)) G.sel = E.iso(hoje);
    // o dia escolhido fica sempre dentro do mês mostrado (senão o teclado não teria por onde entrar na grade)
    const s = E.parseDate(G.sel);
    if (s.getFullYear() !== G.ano || s.getMonth() !== G.mes) G.sel = E.iso(hoje.getFullYear() === G.ano && hoje.getMonth() === G.mes ? hoje : new Date(G.ano, G.mes, 1));
    return G;
  }
  function montar() {
    const G = estado(), msg = E.msgAgenda(S.rules);
    const fer = E.feriadosDaAgenda(S.rules, S.ctx.empresa), cal = E.makeCalendar(fer.datas);
    const vazio = E.montarMes(G.ano, G.mes, [], { cal, nomes: fer.nomes });
    const todos = eventosEntre(E.parseDate(vazio.de), E.parseDate(vazio.ate), { completo: true }).filter(e => e.tipo !== 'feriado');
    D = { G, msg, todos, mes: E.montarMes(G.ano, G.mes, todos, { cal, nomes: fer.nomes, ocultos: G.ocultos }) };
    return D;
  }
  const diaDe = (k) => D.mes.semanas.flat().find(x => x.iso === k);

  /* ---------- Grade do mês ---------- */
  function celula(dia) {
    const sel = dia.iso === D.G.sel;
    const cls = ['ag-day', !dia.doMes && 'out', dia.hoje && 'today', !dia.util && 'nu', dia.feriado && 'feriado', sel && 'sel'].filter(Boolean).join(' ');
    return `<button type="button" role="gridcell" class="${cls}" data-dia="${dia.iso}" tabindex="${sel ? 0 : -1}" aria-selected="${sel}" aria-label="${esc(E.descreverDia(dia, D.msg))}">
      <span class="ag-n">${dia.numero}</span>${dia.feriado ? `<span class="ag-fer">${esc(dia.feriado)}</span>` : ''}
      <span class="ag-pts" aria-hidden="true">${dia.pontos.map(t => `<i class="ag-pt t-${t}"></i>`).join('')}${dia.mais ? `<b class="ag-mais">+${dia.mais}</b>` : ''}</span></button>`;
  }
  function desenharGrade() {
    const { mes, msg } = D;
    $('#ag-grade').innerHTML = `<div class="ag-wd" role="row">${E.DIAS_SEMANA.map(([c, l]) => `<span role="columnheader" aria-label="${l}">${c}</span>`).join('')}</div>
      ${mes.semanas.map(sem => `<div class="ag-sem" role="row">${sem.map(celula).join('')}</div>`).join('')}`;
    $('#ag-grade').setAttribute('aria-label', E.textoAgenda(msg.titulo, { mes: mes.rotulo }));
    $('#ag-mes').textContent = cap(mes.rotulo);
  }
  // a legenda liga e desliga cada tipo no calendário
  function desenharLegenda() {
    const { msg, G } = D;
    $('#ag-tipos').innerHTML = E.TIPOS_AGENDA.map(k => { const off = G.ocultos.includes(k); return `<button type="button" class="ag-tipo${off ? ' off' : ''}" data-tipo="${k}" aria-pressed="${!off}" title="${esc(msg.legendaAjuda)}"><i class="ag-pt t-${k}" aria-hidden="true"></i>${esc(msg.tipos[k].legenda)}</button>`; }).join('')
      + `<span class="ag-tipo-fer"><i class="ag-fer-sw" aria-hidden="true"></i>${esc(msg.legendaFeriado)}</span>`;
    $('#ag-tipos').querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.tipo;
      G.ocultos = G.ocultos.includes(k) ? G.ocultos.filter(x => x !== k) : [...G.ocultos, k];
      gravarOcultos(G.ocultos);
      renderAgenda({ foco: `[data-tipo="${k}"]` });
    }));
  }

  /* ---------- Painel do dia: os eventos do dia escolhido, com as ações que já existem em cada tipo ---------- */
  function acoesDoEvento(e, n, hoje) {
    const { msg } = D, b = (a, rot, cls = '') => `<button type="button" class="btn btn-sm${cls ? ' ' + cls : ''}" data-a="${a}" data-i="${n}">${rot}</button>`;
    const out = [];
    if (e.pedir) out.push(b('fazer', esc(msg.fazerAgora), 'btn-primary'));
    if (e.item) out.push(b('abrir', esc(msg.abrir)));
    if (e.tipo === 'exp' && e.empregado && C.acoesExperiencia) C.acoesExperiencia(e.empregado, admissaoDe(e.empregado), e.n).forEach((x, k) => out.push(`<button type="button" class="btn btn-sm${x.cls ? ' ' + x.cls : ''}" data-a="exp" data-i="${n}" data-k="${k}"${x.titulo ? ` title="${esc(x.titulo)}"` : ''}>${esc(x.rotulo)}</button>`));
    if (e.lembrete) {
      if (e.feito) out.push(b('reabrir', esc(msg.reabrir)));
      else {
        out.push(b('feito', `${icon('check', 'ic-sm')} ${esc(msg.feito)}`));
        out.push(b('adiar', esc(msg.adiarDia)));
        if (E.iso(E.addDays(hoje, 1)) !== E.iso(E.addDays(e.d, 1))) out.push(b('amanha', esc(msg.amanha)));   // senão seria o mesmo botão
      }
      out.push(b('editar', 'Editar', 'btn-ghost'));
    }
    return out.join('');
  }
  function desenharDia() {
    const { G, msg } = D, hoje = E.today();
    const dia = diaDe(G.sel) || { eventos: [], util: true, hoje: false, feriado: '' };
    const d = E.parseDate(G.sel);
    const escondidos = D.todos.filter(e => E.iso(e.d) === G.sel && G.ocultos.includes(e.tipo)).length;
    const evs = dia.eventos;
    const chips = [dia.hoje && '<span class="pill pill-today">Hoje</span>',
      dia.feriado && `<span class="pill pill-late">${esc(dia.feriado === 'Feriado' ? msg.feriadoGenerico : `${msg.feriadoGenerico}: ${dia.feriado}`)}</span>`,
      !dia.util && !dia.feriado && `<span class="pill pill-muted">${esc(cap(msg.naoUtil))}</span>`].filter(Boolean).join(' ');
    $('#ag-dia').innerHTML = `<div class="pn-card-head"><h3 id="ag-dia-t" tabindex="-1">${esc(cap(d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })))}</h3>${chips ? `<span class="ag-chips">${chips}</span>` : ''}</div>
      <div class="pn-card-body">
        ${!dia.util ? `<p class="ag-nota">${icon('info', 'ic-sm')} ${esc(msg.diaNaoUtil)}</p>` : ''}
        ${evs.length ? `<div class="ag-ev-lista">${evs.map((e, n) => `<div class="ag-ev-li${e.feito ? ' feito' : ''}" data-ev="${n}"><i class="ag-pt t-${e.tipo}" aria-hidden="true"></i>
          <div class="ag-ev-tx"><b>${esc(e.titulo)}</b>${e.detalhe ? `<small>${esc(e.detalhe)}</small>` : ''}<span class="ag-ev-tp">${esc(msg.tipos[e.tipo].rotulo)}${e.feito ? ` · ${esc(msg.feito)}` : ''}</span></div>
          <div class="ag-ev-ac">${acoesDoEvento(e, n, hoje)}</div></div>`).join('')}</div>` : `<div class="pn-vazio">${icon('calendar', 'ic-sm')} ${esc(msg.diaVazio)}</div>`}
        ${escondidos ? `<p class="ag-nota">${escondidos} ${escondidos === 1 ? 'evento escondido' : 'eventos escondidos'} pela legenda.</p>` : ''}
        <button type="button" class="btn btn-sm" id="ag-novo-dia">${icon('plus', 'ic-sm')} ${esc(msg.novoLembrete)}</button>
      </div>`;
    $('#ag-novo-dia').addEventListener('click', () => editarLembrete(null, G.sel));
    $('#ag-dia').querySelectorAll('[data-a]').forEach(btn => btn.addEventListener('click', () => acaoDoEvento(evs[+btn.dataset.i], btn.dataset.a, btn)));
  }
  async function gravarLembretes(lista) {
    S.plat.lembretes = lista;
    try { await chrome.storage.local.set({ lembretes: lista }); } catch { /* fica só nesta sessão */ }
  }
  async function acaoDoEvento(e, a, btn) {
    if (!e) return;
    const { msg } = D, k = E.iso(e.d), L = S.plat.lembretes;
    if (a === 'fazer') return fazerAgora(e.pedir);
    if (a === 'abrir') return abrirDetalhe(e.item);
    if (a === 'editar') return editarLembrete(e.lembrete, k);
    if (a === 'exp') { const x = C.acoesExperiencia?.(e.empregado, admissaoDe(e.empregado), e.n)[+btn.dataset.k]; return x?.fn(); }
    if (a === 'feito') { await gravarLembretes(E.concluirLembrete(L, e.lembrete.id, k)); toast(msg.feitoToast); }
    else if (a === 'reabrir') { await gravarLembretes(E.reabrirLembrete(L, e.lembrete.id, k)); toast(msg.reabertoToast); }
    else if (a === 'adiar' || a === 'amanha') {
      const novo = a === 'adiar' ? E.addDays(e.d, 1) : E.addDays(E.today(), 1);
      await gravarLembretes(E.adiarLembrete(L, e.lembrete.id, k, E.iso(novo), Date.now().toString(36)));
      toast(E.textoAgenda(msg.adiadoToast, { data: E.fmtDate(novo).slice(0, 5) }));
    }
    renderAgenda({ foco: 'painel' });
  }

  /* ---------- Próximos 30 dias (ao lado do calendário; embaixo, em tela estreita) ---------- */
  function desenharProximos() {
    const hoje = E.today(), { G } = D;
    const prox = eventosEntre(hoje, E.addDays(hoje, 30), { completo: true }).filter(e => e.tipo !== 'feriado' && !e.feito && !G.ocultos.includes(e.tipo)).slice(0, 14);
    $('#ag-prox').innerHTML = prox.map((e, n) => linhaEvento(e, n)).join('') || `<div class="pn-vazio">${icon('calendar', 'ic-sm')} ${esc(D.msg.proximosVazio)}</div>`;
    $('#ag-prox').querySelectorAll('[data-ev-iso]').forEach(b => b.addEventListener('click', (ev) => { if (!ev.target.closest('[data-fazer]')) abrirDia(b.dataset.evIso); }));
    $('#ag-prox').querySelectorAll('[data-fazer]').forEach(b => b.addEventListener('click', () => fazerAgora(prox[+b.dataset.fazer]?.pedir)));
  }

  /* ---------- Escolher o dia e andar pelo teclado ---------- */
  // mês igual: só troca a marca e o painel; outro mês: desenha de novo
  function selecionar(k, { foco = null } = {}) {
    const G = estado(), d = E.parseDate(k); if (!d) return;
    G.sel = k;
    if (d.getFullYear() !== G.ano || d.getMonth() !== G.mes) { G.ano = d.getFullYear(); G.mes = d.getMonth(); return renderAgenda({ foco: foco || 'dia' }); }
    $('#ag-grade').querySelectorAll('.ag-day').forEach(c => { const s = c.dataset.dia === k; c.classList.toggle('sel', s); c.tabIndex = s ? 0 : -1; c.setAttribute('aria-selected', String(s)); });
    desenharDia();
    if (foco) aplicarFoco(foco);
  }
  // foco: 'dia' (célula escolhida), 'painel' (título do dia) ou um seletor
  function aplicarFoco(foco) {
    const el = foco === 'dia' ? $('#ag-grade .ag-day.sel') : foco === 'painel' ? $('#ag-dia-t') : $(foco);
    if (!el) return;
    el.focus({ preventScroll: foco !== 'painel' });
    if (foco === 'painel') el.scrollIntoView({ block: 'nearest' });
  }
  function ligarGrade() {
    const grade = $('#ag-grade');
    grade.addEventListener('click', (ev) => {
      const c = ev.target.closest('.ag-day'); if (!c) return;
      selecionar(c.dataset.dia);
      if (matchMedia('(max-width: 1080px)').matches) $('#ag-dia').scrollIntoView({ block: 'nearest' });   // painel embaixo: leva até ele
    });
    grade.addEventListener('keydown', (ev) => {
      const c = ev.target.closest('.ag-day'); if (!c || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const k = c.dataset.dia;
      const alvo = { ArrowLeft: () => E.moverDia(k, -1), ArrowRight: () => E.moverDia(k, 1), ArrowUp: () => E.moverDia(k, -7), ArrowDown: () => E.moverDia(k, 7),
        PageUp: () => E.moverMes(k, -1), PageDown: () => E.moverMes(k, 1), Home: () => E.semanaDe(k)[0], End: () => E.semanaDe(k)[1] }[ev.key];
      if (alvo) { ev.preventDefault(); selecionar(alvo(), { foco: 'dia' }); }
      else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selecionar(k, { foco: 'painel' }); }
    });
  }

  function renderAgenda({ foco = null } = {}) {
    montar();
    const { G, msg } = D;
    const inacabados = (S.historico || []).filter(h => h.status === 'preenchido' && Date.now() - h.quando < 7 * 864e5 && (!S.ctx.empresa || h.empresa === S.ctx.empresa));
    viewEl.innerHTML = `
      <div class="dp-toolbar ag-bar">
        <div class="dp-month" role="group" aria-label="Mês da agenda"><button type="button" id="ag-prev" aria-label="Mês anterior">${icon('left', 'ic-sm')}</button><h2 class="dp-month-label" id="ag-mes" aria-live="polite" tabindex="-1"></h2><button type="button" id="ag-next" aria-label="Próximo mês">${icon('right', 'ic-sm')}</button></div>
        <button type="button" class="btn btn-sm" id="ag-hoje">Hoje</button>
        <span class="sp"></span>
        <button type="button" class="btn btn-sm btn-primary" id="ag-novo">${icon('plus', 'ic-sm')} Lembrete</button>
      </div>
      <div class="ag-tipos" id="ag-tipos" role="group" aria-label="Tipos de evento"></div>
      <div class="ag-grid">
        <div class="list-card ag-cal">
          <div class="ag-calendario" id="ag-grade" role="grid"></div>
          <div class="ag-rodape">${icon('info', 'ic-sm')} <span>${esc(msg.teclado)}</span></div>
        </div>
        <aside class="ag-side">
          <section class="pn-card" id="ag-dia" aria-label="Dia escolhido"></section>
          <section class="pn-card"><div class="pn-card-head"><h3>${esc(msg.proximos)}</h3></div><div class="pn-card-body" id="ag-prox"></div></section>
          ${inacabados.length ? `<section class="pn-card"><div class="pn-card-head"><h3>Começou e não enviou</h3><small>Preenchidas no portal, mas o envio não foi confirmado.</small></div><div class="pn-card-body">${inacabados.map((h, n) => `<button type="button" class="pn-li" data-cont="${n}"><div class="main"><b>${esc(h.resumo)}</b><small>${esc(nomeTipo(h.tipo))} · ${new Date(h.quando).toLocaleDateString('pt-BR')}</small></div><span class="pill pill-today">continuar</span></button>`).join('')}</div></section>` : ''}
          <details class="pn-card"><summary>Histórico deste computador</summary><div class="pn-card-body" id="ag-hist"></div></details>
        </aside>
      </div>`;
    desenharLegenda(); desenharGrade(); desenharDia(); desenharProximos(); ligarGrade();
    const hist = S.historico || [];
    $('#ag-hist').innerHTML = hist.length ? hist.slice(0, 40).map((h, n) => `<button type="button" class="pn-li" data-hist="${n}"><div class="main"><b>${esc(h.resumo)}</b><small>${esc(nomeTipo(h.tipo))} · ${new Date(h.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></div><span class="pill pill-${h.status === 'enviado' ? 'ok' : 'soon'}">${esc(h.status)}</span></button>`).join('') : '<div class="pn-vazio">As solicitações que você fizer com o Assistente aparecem aqui.</div>';
    viewEl.querySelectorAll('[data-cont]').forEach(b => b.addEventListener('click', () => reaproveitar(inacabados[+b.dataset.cont])));
    viewEl.querySelectorAll('[data-hist]').forEach(b => b.addEventListener('click', () => reaproveitar(hist[+b.dataset.hist], true)));
    // trocar de mês leva o dia escolhido junto (no mesmo dia do mês, ou no último dia, se o mês for mais curto)
    const irMes = (n) => { G.sel = E.moverMes(G.sel, n); const d = E.parseDate(G.sel); G.ano = d.getFullYear(); G.mes = d.getMonth(); renderAgenda({ foco: n < 0 ? '#ag-prev' : '#ag-next' }); };
    $('#ag-prev').addEventListener('click', () => irMes(-1));
    $('#ag-next').addEventListener('click', () => irMes(1));
    $('#ag-hoje').addEventListener('click', () => { const d = E.today(); G.ano = d.getFullYear(); G.mes = d.getMonth(); G.sel = E.iso(d); renderAgenda({ foco: 'dia' }); });
    $('#ag-novo').addEventListener('click', () => editarLembrete(null, G.sel));
    if (foco) aplicarFoco(foco);
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
  /** Mostra o dia na Agenda (de outras telas, como o Hoje, leva até ela). */
  function abrirDia(isoDia) {
    const d = E.parseDate(isoDia); if (!d) return;
    const G = S.plat.agenda;
    G.sel = E.iso(d); G.ano = d.getFullYear(); G.mes = d.getMonth();
    if (S.view === 'historico') renderAgenda({ foco: 'painel' }); else A.setView('historico');
  }
  /* "Próximo prazo" discreto no Hoje (uma chamada em hoje.js): o primeiro prazo legal, de solicitação ou de experiência
     a partir de hoje, e um clique leva à Agenda no dia dele. Só texto: nada é guardado. */
  function proximoPrazoHtml() {
    try {
      const msg = E.msgAgenda(S.rules), hoje = E.today();
      const p = E.proximoPrazo(eventosEntre(hoje, E.addDays(hoje, 60), { completo: true }), hoje);
      if (!p) return '';
      const q = E.quandoTexto(p.falta, msg), dd = p.falta > 1 ? ` (${E.fmtDate(p.d).slice(0, 5)})` : '';
      return `<span class="hj-sep"> · </span><button type="button" class="hj-prazo" data-ag-prox="${E.iso(p.d)}" title="${esc(msg.verAgenda)}">${esc(E.textoAgenda(msg.proximoPrazo, { titulo: p.titulo }))} <span>${esc(q + dd)}</span> ›</button>`;
    } catch { return ''; }
  }
  viewEl.addEventListener('click', (ev) => { const b = ev.target.closest?.('[data-ag-prox]'); if (b) abrirDia(b.dataset.agProx); });

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

  Object.assign(C, { abrirDia, editarLembrete, proximoPrazoHtml, reaproveitar, renderAgenda });
}
