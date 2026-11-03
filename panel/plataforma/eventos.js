/* Plataforma — Eventos de agenda (Painel e Agenda).
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';

export function montarEventos(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { itensVisiveis, nomeTipo, quando } = C;   // definidos em partes que montam antes
  /* =================== Eventos de agenda (Painel e Agenda) =================== */
  function empregadosAtivos() {
    const l = S.plat.emp?.lista?.length ? S.plat.emp.lista : (S.equipe.get(S.ctx.empresa) || []);
    return l.filter(e => e.ativo !== false);
  }
  // Fim da experiência já "efetivado" no Hoje (ct.expEfetivados, mesma chave do hoje.js): a Agenda também não lembra
  const efetivado = (nome, n) => { try { return JSON.parse(localStorage.getItem('ct.expEfetivados') || '[]').includes(`${S.ctx.empresa}|${E.norm(nome)}|${n}`); } catch { return false; } };
  /* Tudo o que cai entre duas datas, calculado na hora (só lembretes e histórico ficam guardados, como antes).
     Com { completo: true } (a Agenda) entram também as datas das solicitações já lidas no portal e a prescrição;
     o Hoje não pede, para não repetir o que ele já mostra pelos prazos legais e pela fila. */
  function eventosEntre(de, ate, { completo = false } = {}) {
    const out = []; const fer = E.feriadosDaAgenda(S.rules, S.ctx.empresa); const cal = E.makeCalendar(fer.datas);
    const dentro = (d) => d && d >= de && d <= ate;
    for (let m = new Date(de.getFullYear(), de.getMonth(), 1); m <= ate; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      for (const p of E.prazosFixos(S.rules, m.getFullYear(), m.getMonth(), cal)) if (dentro(p.d)) out.push({ d: p.d, tipo: 'legal', titulo: p.titulo, detalhe: p.detalhe });
    }
    const hist = (S.historico || []).filter(h => h.status === 'enviado' && (!S.ctx.empresa || h.empresa === S.ctx.empresa));
    for (const p of A.prazosDoHistorico(hist)) if (dentro(p.d)) out.push({ d: p.d, tipo: 'pedido', titulo: p.titulo, detalhe: [p.detalhe, nomeTipo(p.h.tipo)].filter(Boolean).join(' · '), quem: p.h.valores?.empregado || p.h.valores?.nome || '', pedir: p.pedir || null });
    if (completo && S.plat.sol && !S.plat.sol.semAcesso) for (const e of E.eventosDasSolicitacoes(itensVisiveis(), E.today(), S.rules, cal)) if (dentro(e.d)) out.push(e);
    for (const e of E.eventosDaEquipe(empregadosAtivos(), E.today(), S.rules, { dispensado: efetivado, nomeCurto: A.nomeCurto })) if (dentro(e.d)) out.push(e);
    for (const l of S.plat.lembretes) for (const d of E.ocorrencias(l, de, ate, cal, { comFeitos: true })) out.push({ d, tipo: 'lembrete', titulo: l.texto, detalhe: [l.hora, l.obs].filter(Boolean).join(' · '), lembrete: l, feito: (l.feitos || []).includes(E.iso(d)), pedir: l.pedir && !E.temPedidoDe(S.plat.sol?.itens, l.pedir.tipo, l.pedir.empregado, E.parseDate(l.data) && E.addDays(E.parseDate(l.data), -30)) ? l.pedir : null });
    out.push(...E.eventosDosFeriados(de, ate, fer));
    return E.ordenarEventos(E.mesclarEventos(out));
  }
  // rótulo de cada tipo (regras: mensagens.agenda.tipos); lido na hora, porque as regras podem chegar depois da montagem
  const ROT_EV = { feriado: 'Feriado' };
  for (const k of E.TIPOS_AGENDA) Object.defineProperty(ROT_EV, k, { enumerable: true, get: () => E.msgAgenda(S.rules).tipos[k].rotulo });
  // eventos de pedido (e lembretes de um pedido) ganham "Fazer agora": abre o pedido já com os dados
  const linhaEvento = (e, n) => { const [c, t] = quando(e.d); return `<div class="pn-li" data-ev-iso="${E.iso(e.d)}"><div class="ag-d"><b>${String(e.d.getDate()).padStart(2, '0')}</b><small>${e.d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></div><div class="main"><b>${esc(e.titulo)}</b><small>${esc(e.detalhe || ROT_EV[e.tipo])}</small></div>${e.pedir && n != null ? `<button type="button" class="btn btn-sm" data-fazer="${n}">Fazer agora</button>` : ''}<span class="pill pill-${c}">${t}</span></div>`; };

  Object.assign(C, { ROT_EV, empregadosAtivos, eventosEntre, linhaEvento });
}
