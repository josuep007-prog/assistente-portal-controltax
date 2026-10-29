/* Plataforma — Agenda de prazos e lembretes.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';

export function montarAgenda(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { ROT_EV, cap, dialogo, eventosEntre, fazerAgora, hora, linhaEvento, nomeTipo, renderPainel } = C;   // definidos em partes que montam antes
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

  Object.assign(C, { abrirDia, editarLembrete, reaproveitar, renderAgenda });
}
