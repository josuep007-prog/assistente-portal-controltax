/* Plataforma — Estado da plataforma e funções de apoio (empresa, tipo, data, carregando…).
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';

export function montarNucleo(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const badge = (...a) => C.badge(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const P = {};
  const hoje0 = E.today();
  S.plat = {
    sol: null, carregandoSol: null, emp: null, carregandoEmp: null, docs: null, lembretes: [],
    escolher: false, empresaFiltro: '', filtroSol: { motivo: null, q: '', tipo: '', vis: null }, filtroEmp: { q: '', sit: 'ativos' },
    agenda: { ano: hoje0.getFullYear(), mes: hoje0.getMonth(), filtro: '' }, docAba: 'solicitacoes', enviado: null
  };
  chrome.storage.local.get('lembretes').then(({ lembretes }) => { S.plat.lembretes = Array.isArray(lembretes) ? lembretes : []; }).catch(() => {});
  // "Nada a lançar este mês" (variáveis da folha): 'empresa|MM/AAAA', só neste computador
  S.plat.folhaNada = [];
  chrome.storage.local.get('folhaNada').then(({ folhaNada }) => { S.plat.folhaNada = Array.isArray(folhaNada) ? folhaNada : []; }).catch(() => {});

  const MODULOS = [
    ['inicio', 'Hoje', 'home'], ['pendencias', 'Solicitações', 'list'], ['preencher', 'Novo pedido', 'fill'],
    ['funcionarios', 'Funcionários', 'users'], ['historico', 'Agenda', 'calendar'], ['documentos', 'Documentos', 'folder'], ['ferramentas', 'Calcular', 'calc']
  ];
  const TITULOS = { ...Object.fromEntries(MODULOS.map(m => [m[0], m[1]])), config: 'Configurações' };
  const nomeTipo = (k) => S.rules?.tipos?.[k]?.nome || k;
  // ícone e cor por família (como no Control Onvio): o ícone vem do atalho do tipo nas regras
  const familiaTipo = (k) => /^cadastro/.test(k) ? 'cadastro' : /Ferias$/.test(k) ? 'ferias' : /Rescisao$/.test(k) ? 'rescisao' : k === 'afastamento' ? 'afastamento' : k === 'rubricas' ? 'rubricas' : 'geral';
  const icTipo = (k) => `<span class="tp-ic fam-${familiaTipo(k)}" aria-hidden="true">${icon(A.ICONS[(S.rules?.intencoes || []).find(x => x.tipo === k)?.icone] || 'file', 'ic-sm')}</span>`;
  const esperar = (ms) => new Promise(r => setTimeout(r, ms));
  const fmt = (d) => (d ? E.fmtDate(d) : '—');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const loading = (txt) => `<div class="empty"><div class="spin" style="margin:0 auto 10px"></div>${esc(txt)}</div>`;
  const quando = (d) => { const n = E.diffDays(E.today(), d); return n < 0 ? ['late', `há ${-n} dia(s)`] : n === 0 ? ['today', 'hoje'] : n <= 7 ? ['today', `em ${n} dia(s)`] : ['soon', `em ${n} dias`]; };
  /* várias empresas no mesmo login: por padrão, só a empresa aberta no portal; com mais de uma na tela, cada item mostra a sua */
  const itensVisiveis = () => E.filtrarPorEmpresa(S.plat.sol?.itens || [], S.plat.empresaFiltro, S.ctx.empresa);
  const variasEmpresas = (l) => new Set((l || []).map(i => i.empresa).filter(Boolean)).size > 1;
  const rotEmpresa = (i) => i.empresaApelido || i.empresa || '';
  /* Seletor de empresas (2.5): botão com o resumo da escolha e uma janelinha com caixas de marcar — uma, várias ou
     todas. Cada empresa mostra quantas solicitações tem em aberto e quantas esperam o cliente. A escolha fica só na
     memória (volta para a empresa do portal quando ela muda). */
  function seletorEmpresa() {
    const todas = S.plat.sol?.itens || [], emps = E.empresasDasSolicitacoes(todas);
    if (emps.length <= 1) return '';
    const sel = E.empresasSelecionadas(todas, S.plat.empresaFiltro, S.ctx.empresa);
    const doPortal = E.empresaDoFiltro(todas, '', S.ctx.empresa);
    sel.sort((a, b) => (b === doPortal) - (a === doPortal));   // o resumo começa pela empresa aberta no portal
    const apelido = (nome) => todas.find(i => i.empresa === nome)?.empresaApelido || nome;
    const rot = sel.length === emps.length ? `Todas as empresas (${emps.length})` : sel.length === 1 ? apelido(sel[0]) : `${apelido(sel[0])} + ${sel.length - 1}`;
    const linhas = [...emps].sort((a, b) => (b.nome === doPortal) - (a.nome === doPortal)).map(e => {
      const dela = todas.filter(i => i.empresa === e.nome);
      const abertas = dela.filter(i => ['aguardando', 'andamento'].includes(i.estado)).length, suas = dela.filter(i => i.aguardando).length;
      const ap = apelido(e.nome);
      return `<label class="es-li" data-nome="${esc(e.nome)}"><input type="checkbox" value="${esc(e.nome)}"${sel.includes(e.nome) ? ' checked' : ''}>
        <span class="es-tx"><b>${esc(ap)}${e.nome === doPortal ? ' <span class="es-tag">aberta no portal</span>' : ''}</b>${ap !== e.nome ? `<small>${esc(e.nome)}</small>` : ''}</span>
        <span class="es-n">${suas ? `<em>${suas} esperam você</em>` : ''}<span>${abertas} em aberto</span></span>
        <button type="button" class="es-so" data-so="${esc(e.nome)}" title="Mostrar só esta empresa">só esta</button></label>`;
    }).join('');
    return `<details class="emp-sel"><summary class="btn btn-sm" aria-label="Escolher as empresas">${icon('briefcase', 'ic-sm')}<span class="es-rot">${esc(rot)}</span><span class="es-seta" aria-hidden="true">▾</span></summary>
      <div class="es-pop" role="dialog" aria-label="Empresas">
        <div class="es-head"><b>Empresas</b><small>Escolha uma ou mais para ver as solicitações juntas.</small></div>
        ${emps.length > 6 ? '<input type="search" class="es-q" placeholder="Buscar empresa…" autocomplete="off">' : ''}
        <div class="es-rap"><button type="button" class="btn btn-sm btn-ghost" data-es="todas">Marcar todas</button><button type="button" class="btn btn-sm btn-ghost" data-es="portal">Só a aberta no portal</button></div>
        <div class="es-lista">${linhas}</div>
        <div class="es-pe"><span class="es-cont"></span><button type="button" class="btn btn-sm" data-es="cancelar">Cancelar</button><button type="button" class="btn btn-sm btn-primary" data-es="aplicar">Mostrar</button></div>
      </div></details>`;
  }
  function ligarSeletorEmpresa(root) {
    root.querySelectorAll('.emp-sel').forEach(d => {
      const todas = S.plat.sol?.itens || [], nomes = E.empresasDasSolicitacoes(todas).map(e => e.nome);
      const doPortal = E.empresaDoFiltro(todas, '', S.ctx.empresa);
      const caixas = () => [...d.querySelectorAll('.es-lista input[type=checkbox]')];
      const aplicar = (escolha) => {
        // a empresa do portal sozinha volta ao padrão (''): segue a empresa quando ela muda no portal
        S.plat.empresaFiltro = escolha.length === nomes.length ? '*' : escolha.length === 1 && escolha[0] === doPortal ? '' : escolha;
        d.open = false; atualizarBadge(); P.render(S.view);
      };
      const contar = () => {
        const n = caixas().filter(c => c.checked).length;
        d.querySelector('.es-cont').textContent = n ? `${n} de ${nomes.length} marcada(s)` : 'Marque ao menos uma';
        const ap = d.querySelector('[data-es="aplicar"]'); ap.disabled = !n; ap.textContent = n === nomes.length ? 'Mostrar todas' : n > 1 ? `Mostrar ${n} empresas` : 'Mostrar';
      };
      d.addEventListener('toggle', () => { if (d.open) { contar(); d.querySelector('.es-q, .es-lista input')?.focus(); } });
      d.querySelector('.es-lista').addEventListener('change', contar);
      d.querySelectorAll('[data-so]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); aplicar([b.dataset.so]); }));
      d.querySelector('[data-es="todas"]').addEventListener('click', () => { const tudo = caixas().every(c => c.checked); caixas().forEach(c => { c.checked = !tudo; }); contar(); });
      d.querySelector('[data-es="portal"]').addEventListener('click', () => aplicar([doPortal === '*' ? nomes[0] : doPortal]));
      d.querySelector('[data-es="cancelar"]').addEventListener('click', () => { d.open = false; });
      d.querySelector('[data-es="aplicar"]').addEventListener('click', () => aplicar(caixas().filter(c => c.checked).map(c => c.value)));
      d.querySelector('.es-q')?.addEventListener('input', (e) => { const q = E.norm(e.target.value); d.querySelectorAll('.es-li').forEach(l => { l.hidden = !!q && !E.norm(l.textContent).includes(q); }); });
      d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); d.open = false; d.querySelector('summary').focus(); } });
      // clicar fora fecha (sem aplicar)
      const fora = (e) => { if (!d.isConnected) { document.removeEventListener('pointerdown', fora, true); return; } if (d.open && !d.contains(e.target)) d.open = false; };
      document.addEventListener('pointerdown', fora, true);
    });
  }
  function atualizarBadge() { const n = itensVisiveis().filter(i => i.aguardando).length; send({ type: 'setBadge', n }); badge('pendencias', n); }
  const editavel = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  Object.assign(C, { MODULOS, P, TITULOS, atualizarBadge, cap, editavel, esperar, familiaTipo, fmt, icTipo, itensVisiveis, ligarSeletorEmpresa, loading, nomeTipo, quando, rotEmpresa, seletorEmpresa, variasEmpresas });
}
