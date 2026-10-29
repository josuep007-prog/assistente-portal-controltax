/* Plataforma — Eventos de agenda (Painel e Agenda).
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';

export function montarEventos(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { nomeTipo, quando } = C;   // definidos em partes que montam antes
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

  Object.assign(C, { ROT_EV, empregadosAtivos, eventosEntre, linhaEvento });
}
