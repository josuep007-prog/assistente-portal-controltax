/* Plataforma — Busca (Ctrl+K ou /).
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';

export function montarBusca(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { MODULOS, P, abrirDetalhe, dialogo, fmt, nomeTipo, rotEmpresa, variasEmpresas } = C;   // definidos em partes que montam antes
  /* =================== BUSCA (Ctrl+K ou /) =================== */
  let resultados = [], sel = 0;
  function montarBusca() {
    const box = $('#cmdk'), inp = $('#cmdk-q');
    const fechar = () => { box.hidden = true; };
    box.addEventListener('click', (e) => { if (e.target === box) fechar(); });
    inp.addEventListener('input', () => { sel = 0; desenharBusca(inp.value); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fechar(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, Math.min(resultados.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); marcarSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); const r = resultados[sel]; if (r) { fechar(); r.fn(); } }
    });
  }
  function abrirBusca() {
    const box = $('#cmdk'); box.hidden = false; const inp = $('#cmdk-q'); inp.value = ''; sel = 0; desenharBusca(''); inp.focus();
    if (!S.plat.emp) P.carregarEmpregados(); if (!S.plat.sol) P.carregarSolicitacoes();
  }
  function desenharBusca(q) {
    const Q = E.norm(q); const toks = Q.split(' ').filter(Boolean);
    const bate = (s) => toks.every(t => E.norm(s).includes(t));
    const grupos = [];
    const mods = MODULOS.filter(([, t]) => !Q || bate(t)).map(([v, t, ic]) => ({ titulo: t, sub: 'Ir para', ic, fn: () => A.setView(v) }));
    grupos.push(['Ir para', mods.slice(0, Q ? 4 : 7)]);
    // frase com data, número ou funcionário ("férias do Ronaldo dia 10/11"): o 1º resultado entende a frase inteira
    const nomes = (S.plat.emp?.lista || []).map(e => e.nome);
    if (toks.length >= 2 && (/\d/.test(Q) || E.findDates(q).length || (nomes.length && E.findEmployeeInText(q, nomes)?.option))) {
      grupos.push(['Entender', [{ titulo: `Entender: ${q.trim()}`, sub: 'Abro o pedido com o que você escreveu', ic: 'chat', fn: () => A.entenderTexto(q.trim()) }]]);
    }
    if (Q) {
      grupos.push(['Novo pedido', E.searchIntents(q, S.rules).slice(0, 4).map(it => ({ titulo: it.titulo, sub: it.subtitulo || '', ic: A.ICONS[it.icone] || 'file', fn: () => A.openTipo(it.tipo) }))]);
      grupos.push(['Funcionários', (S.plat.emp?.lista || []).filter(e => bate(e.nome)).slice(0, 5).map(e => ({ titulo: e.nome, sub: e.ativo === false ? 'Desligado' : `Admissão ${fmt(E.parseDate(e.admissao))}`, ic: 'users', fn: () => { S.plat.filtroEmp = { q: e.nome, sit: 'todos' }; A.setView('funcionarios'); } }))]);
      grupos.push(['Solicitações', (S.plat.sol?.itens || []).filter(i => bate(`${i.numero} ${i.empregado} ${i.assunto} ${nomeTipo(i.tipo)} ${i.empresa}`)).slice(0, 5).map(i => ({ titulo: i.assunto || nomeTipo(i.tipo), sub: `${variasEmpresas(S.plat.sol?.itens) ? `${rotEmpresa(i)} · ` : ''}${nomeTipo(i.tipo)}${i.numero ? ` · nº ${i.numero}` : ''} · ${i.status}`, ic: 'list', fn: () => abrirDetalhe(i) }))]);
      grupos.push(['Dúvidas', E.buscarFaq(q, S.rules, 4).map(f => ({ titulo: f.pergunta, sub: 'Dúvida frequente', ic: 'info', fn: () => dialogo({ titulo: esc(f.pergunta), corpo: `<p style="margin:0">${esc(f.resposta)}</p>`, acoes: ['|', { rotulo: 'Fechar', cls: 'btn-primary' }] }) }))]);
    }
    resultados = grupos.flatMap(([, l]) => l);
    let n = 0;
    $('#cmdk-res').innerHTML = grupos.filter(([, l]) => l.length).map(([g, l]) => `<div class="cmdk-g">${g}</div>${l.map(r => `<button type="button" class="cmdk-i" data-r="${n++}">${icon(r.ic, 'ic-sm')}<div class="main">${esc(r.titulo)}<small>${esc(r.sub)}</small></div></button>`).join('')}`).join('')
      || `<div class="cmdk-vazio">Nada encontrado para “${esc(q)}”.</div>`;
    $('#cmdk-res').querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { $('#cmdk').hidden = true; resultados[+b.dataset.r].fn(); }));
    marcarSel();
  }
  function marcarSel() { document.querySelectorAll('#cmdk-res [data-r]').forEach(b => b.classList.toggle('on', +b.dataset.r === sel)); document.querySelector('#cmdk-res .on')?.scrollIntoView({ block: 'nearest' }); }

  Object.assign(C, { abrirBusca, montarBusca });
}
