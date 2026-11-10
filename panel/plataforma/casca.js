/* Plataforma — Casca: trilho, cabeçalho, indicador de leitura e busca.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';
import { anel } from '../graficos.js';

export function montarCasca(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { MODULOS, P, TITULOS, editavel, icTipo, itensVisiveis, nomeTipo, quando } = C;   // definidos em partes que montam antes
  const abrirBusca = (...a) => C.abrirBusca(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const montarBusca = (...a) => C.montarBusca(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  /* =================== Casca: trilho, cabeçalho, busca =================== */
  let montada = false;
  function montarCasca() {
    if (montada) return; montada = true;
    // rede de segurança: se algo (foco, scrollIntoView, extensão do navegador) rolar a casca, volta ao topo — o cabeçalho nunca fica cortado
    for (const el of [document.documentElement, document.body, $('#plat'), document.querySelector('.plat-main')]) el?.addEventListener('scroll', () => { if (el.scrollTop) el.scrollTop = 0; });
    $('#rail-mods').innerHTML = MODULOS.map(([v, t, ic]) => `<button type="button" class="rail-i" data-mod="${v}" aria-label="${t}"><span class="rail-ico">${icon(ic)}</span><span class="rail-t"><b>${t}</b><small data-resumo="${v}" hidden></small></span><span class="rail-badge" data-badge="${v}" hidden></span></button>${['pendencias', 'ferramentas'].includes(v) ? '<div class="rail-sep rail-sep-mod" role="separator"></div>' : ''}`).join('');
    $('#rail-bottom').innerHTML = [['tema', 'Tema claro/escuro', 'moon'], ['config', 'Configurações', 'gear'], ['minimizar', 'Minimizar', 'minus']]
      .map(([a, t, ic]) => `<button type="button" class="rail-i" data-acao="${a}" aria-label="${t}"><span class="rail-ico">${icon(ic)}</span><span class="rail-t"><b>${t}</b></span></button>`).join('');
    document.querySelectorAll('#rail [data-mod]').forEach(b => b.addEventListener('click', async () => {
      const noPedido = S.view === 'preencher' && S.ctx.route?.mode === 'form' && !S.plat.escolher;
      // "Novo pedido" de novo, com o formulário na tela: volta para a escolha do tipo; o portal sai do formulário junto e o pedido pode ser retomado
      if (b.dataset.mod === 'preencher' && noPedido) { await P.sairDoFormulario(); S.plat.escolher = true; P.render('preencher'); return; }
      if (b.dataset.mod !== 'preencher' && noPedido) await P.sairDoFormulario();   // outra aba da extensão: o portal também sai do formulário
      A.setView(b.dataset.mod);
    }));
    document.querySelectorAll('#rail [data-acao]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.acao;
      if (a === 'minimizar') send({ type: 'modo', modo: 'fechado' });
      else if (a === 'tema') A.alternarTema();
      else if (a === 'config') A.setView('config');   // Configurações não tira o portal do formulário: o diagnóstico copiado de lá descreve o formulário aberto
    }));
    $('#plat-busca').addEventListener('click', abrirBusca);
    $('#plat-ver-portal').addEventListener('click', () => send({ type: 'verPortal' }));   // antes um ícone na barra lateral; agora "Ver Onvio" no canto do cabeçalho
    document.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('plat')) return;
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !editavel(e.target))) { e.preventDefault(); abrirBusca(); }
    });
    // soltar arquivos em qualquer lugar da plataforma
    let fundo = 0; const temArq = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    document.addEventListener('dragenter', (e) => { if (!document.body.classList.contains('plat') || !temArq(e)) return; fundo++; $('#plat-drop').hidden = false; });
    document.addEventListener('dragleave', () => { fundo = Math.max(0, fundo - 1); if (!fundo) $('#plat-drop').hidden = true; });
    document.addEventListener('dragover', (e) => { if (document.body.classList.contains('plat') && temArq(e)) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      fundo = 0; $('#plat-drop').hidden = true;
      if (!document.body.classList.contains('plat') || e.defaultPrevented) return;   // as áreas de soltar já trataram
      const files = [...(e.dataTransfer?.files || [])]; if (!files.length) return;
      e.preventDefault(); S.plat.escolher = false; A.handleFiles(files, 'arrastar');
    });
    montarSino();
    atualizarResumos(); setInterval(atualizarResumos, 2000);
    montarBusca();
  }
  function marcarModulo(v) {
    document.querySelectorAll('#rail [data-mod]').forEach(b => b.classList.toggle('on', b.dataset.mod === v));
    $('#plat-titulo').textContent = TITULOS[v] || 'Hoje';
  }
  function badge(v, n) { const b = document.querySelector(`[data-badge="${v}"]`); if (!b) return; b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n || ''); }
  /* Indicador da leitura (2.5.2): estado (conectado, lendo, em parte, sem leitura), há quanto tempo leu, um anel até a
     próxima leitura automática e, ao abrir, o que foi lido e a garantia de que nada sai do computador. */
  const segLeitura = () => Math.max(15, +S.rules?.config?.leituraAutomaticaSegundos || 30);
  const haQuanto = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 5 ? 'agora' : s < 60 ? `há ${s} s` : s < 3600 ? `há ${Math.round(s / 60)} min` : `há ${Math.round(s / 3600)} h`; };
  const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let tiqueSync = null;
  function estadoLeitura() {
    const sol = S.plat.sol;
    if (!sol) return 'lendo';
    if (!sol.ok || sol.semAcesso || (S.plat.falhaLeitura || 0) > sol.quando) return 'erro';
    if (sol.erros.length) return 'parcial';
    return 'ok';
  }
  function atualizarSync(txt) {
    const el = $('#plat-sync'); if (!el) return;
    const sol = S.plat.sol, st = txt ? 'lendo' : estadoLeitura();
    const rot = { ok: 'Portal conectado', lendo: txt || 'Lendo o portal…', parcial: 'Portal lido em parte', erro: 'Sem leitura do portal' }[st];
    const aberto = el.querySelector('details')?.open;
    const empresas = E.empresasDasSolicitacoes(sol?.itens || []).length;
    const linha = (k, v) => `<div class="sy-l"><span>${k}</span><b>${v}</b></div>`;
    el.innerHTML = `<details class="sync-d st-${st}"${aberto ? ' open' : ''}><summary title="Situação da leitura do portal">
        <span class="sync-dot" aria-hidden="true"></span>
        <span class="sync-t"><b>${esc(rot)}</b><small data-sync-rel>${sol?.quando && st !== 'lendo' ? `lido ${haQuanto(Date.now() - sol.quando)}` : st === 'lendo' ? 'consultando as suas listas' : ''}</small></span>
        ${st === 'lendo' ? '<span class="spin sync-spin"></span>' : `<span class="sync-anel" data-sync-anel title="Próxima leitura automática"></span>`}
      </summary>
      <div class="sync-pop" role="dialog" aria-label="Leitura do portal">
        <div class="sy-head"><span class="sync-dot"></span><b>${esc(rot)}</b></div>
        ${sol ? `${linha('Última leitura', `${hora(sol.quando)} · <span data-sync-rel2>${haQuanto(Date.now() - sol.quando)}</span>`)}
        ${linha('Próxima leitura', `<span data-sync-prox>—</span>`)}
        ${linha('Solicitações lidas', `${sol.itens.length}${empresas > 1 ? ` · ${empresas} empresas` : ''}`)}
        ${S.plat.emp ? linha('Funcionários', `${S.plat.emp.lista.filter(e => e.ativo !== false).length} ativos`) : ''}
        ${sol.erros.length ? `${linha('Não lidas', esc(sol.erros.map(nomeTipo).join(', ')))}<ul class="sy-causas">${(S.rules?.mensagens?.leituraPortal?.causasParcial || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}` : ''}
        <p class="sy-conf">${icon('lock', 'ic-sm')}<span>O Assistente lê o portal com o seu próprio acesso, a cada ${segLeitura()} segundos, e só mostra aqui. Nada é enviado a outro lugar.</span></p>
        <button type="button" class="btn btn-sm" id="plat-ref">${icon('refresh', 'ic-sm')} Ler agora</button>
      </div></details>`;
    $('#plat-ref')?.addEventListener('click', () => { el.querySelector('details').open = false; P.carregarSolicitacoes(true); P.carregarEmpregados(true).then(() => P.render(S.view)); });
    tiqueRelogio();
    if (!tiqueSync) tiqueSync = setInterval(tiqueRelogio, 1000);
  }
  // só os textos que mudam com o tempo (sem redesenhar o indicador)
  function tiqueRelogio() {
    const el = $('#plat-sync'), sol = S.plat.sol; if (!el || !sol?.quando) return;
    const rel = haQuanto(Date.now() - sol.quando);
    el.querySelectorAll('[data-sync-rel]').forEach(x => { x.textContent = `lido ${rel}`; });
    el.querySelectorAll('[data-sync-rel2]').forEach(x => { x.textContent = rel; });
    const prox = S.plat.proximaLeitura, total = segLeitura() * 1000;
    const falta = prox ? Math.max(0, prox - Date.now()) : null;
    el.querySelectorAll('[data-sync-anel]').forEach(x => { x.style.setProperty('--p', falta == null ? '0%' : `${Math.round((1 - falta / total) * 100)}%`); });
    el.querySelectorAll('[data-sync-prox]').forEach(x => { x.textContent = falta == null ? 'automática' : falta < 1000 ? 'agora' : `em ${Math.ceil(falta / 1000)} s`; });
  }
  /* Resumo de uma linha na etiqueta do trilho (ao passar o mouse ou focar): o que importa em cada seção, só quando há algo. */
  function atualizarResumos() {
    const m = S.rules?.mensagens?.trilhoResumo || {};
    const frase = (k, n) => n ? ((m[k] || [])[n === 1 ? 0 : 1] || '').replace('{n}', n) : '';
    const itens = itensVisiveis();
    const hoje = E.today();
    const resumos = {
      pendencias: frase('esperam', itens.filter(i => i.aguardando).length),
      inicio: frase('prescrevem', itens.filter(i => E.motivoCliente(i, hoje, S.rules) === 'prescreve').length),
      documentos: frase('novos', S.plat.docs?.disponivel ? S.plat.docs.itens.filter(x => x.lido === false).length : 0)
    };
    document.querySelectorAll('[data-resumo]').forEach(el => {
      const t = resumos[el.dataset.resumo] || '';
      if (el.textContent !== t) el.textContent = t;
      el.hidden = !t;
    });
  }

  /* Sino de novidades (lógica em engine/sino.js): solicitações cujo estado mudou desde a última leitura do cliente.
     No navegador fica só uma foto mínima (ids, situação, data) em localStorage ('ct.sinoVisto'); nada de nomes nem assuntos.
     A primeira leitura só marca o ponto de partida. As novidades ficam até serem lidas (clicar em uma ou "Marcar como lidas"). */
  const CHAVE_SINO = 'ct.sinoVisto';
  const lerSino = () => { try { const v = JSON.parse(localStorage.getItem(CHAVE_SINO)); return v && v.v === 1 && v.itens ? v : null; } catch { return null; } };
  const gravarSino = (f) => { try { localStorage.setItem(CHAVE_SINO, JSON.stringify(f)); } catch { /* sem armazenamento */ } };
  const msgSino = (k) => S.rules?.mensagens?.sino?.[k] || '';
  let novidades = [], pontoDePartida = false;
  function montarSino() {
    const el = $('#plat-sino'); if (!el || el.firstElementChild) return;
    el.innerHTML = `<button type="button" class="sino-b" id="sino-b" aria-haspopup="dialog" aria-expanded="false" aria-controls="sino-pop">${icon('bell')}<span class="sino-n" id="sino-n" hidden></span></button>
      <div class="sino-pop" id="sino-pop" role="dialog" aria-label="${esc(msgSino('titulo') || 'Novidades')}" hidden></div>`;
    const b = $('#sino-b'), pop = $('#sino-pop');
    const abrir = (sim) => { pop.hidden = !sim; b.setAttribute('aria-expanded', String(sim)); if (sim) { desenharSino(); pop.querySelector('button')?.focus(); } };
    b.addEventListener('click', () => abrir(pop.hidden));
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { e.stopPropagation(); abrir(false); b.focus(); } });
    el.addEventListener('focusout', (e) => { if (!pop.hidden && e.relatedTarget && !el.contains(e.relatedTarget)) abrir(false); });
    document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !el.contains(e.target)) abrir(false); }, true);
    pop.addEventListener('click', (e) => {
      const li = e.target.closest('[data-sino]'), todas = e.target.closest('#sino-lidas');
      if (todas) { gravarSino(E.marcarVistas(lerSino(), S.plat.sol?.itens || [], null, S.rules)); atualizarSino(); return; }
      if (!li) return;
      const n = novidades[+li.dataset.sino]; if (!n) return;
      gravarSino(E.marcarVistas(lerSino(), S.plat.sol?.itens || [], [n.chave], S.rules));
      abrir(false); atualizarSino();
      C.abrirDetalhe?.(n.item);
    });
  }
  function desenharSino() {
    const pop = $('#sino-pop'); if (!pop || pop.hidden) return;
    const max = +S.rules?.config?.sino?.maxLinhas || 8;
    const linhas = novidades.slice(0, max);
    const dia = (i) => { if (!i.atualizado) return ''; const d = E.diffDays(new Date(i.atualizado.toDateString()), E.today()); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`; };
    pop.innerHTML = `<div class="sino-head"><b>${esc(msgSino('titulo') || 'Novidades')}</b>${novidades.length ? `<button type="button" class="btn btn-sm btn-ghost" id="sino-lidas">${esc(msgSino('marcarLidas') || 'Marcar como lidas')}</button>` : ''}</div>
      ${linhas.length ? `<ul class="sino-lista">${linhas.map((n, k) => `<li><button type="button" class="sino-li sino-${n.tipo}" data-sino="${k}">${icTipo(n.item.tipo)}<span class="sino-tx">${esc(n.texto)}<small>${esc([dia(n.item), n.item.empresa && C.variasEmpresas?.(S.plat.sol?.itens) ? n.item.empresa : ''].filter(Boolean).join(' · '))}</small></span></button></li>`).join('')}</ul>
        ${novidades.length > max ? `<p class="sino-mais">${esc(msgSino('maisN').replace('{n}', novidades.length - max))}</p>` : ''}`
      : `<div class="sino-vazio"><b>${esc(msgSino('vazio') || 'Nenhuma novidade')}</b><span>${esc(pontoDePartida ? msgSino('primeira') : msgSino('vazioSub'))}</span></div>`}`;
  }
  function atualizarSino() {
    atualizarResumos();
    const sol = S.plat.sol; if (!sol?.ok || sol.semAcesso) return;
    let visto = lerSino();
    if (!visto) {   // primeira leitura: só o ponto de partida (e só com a leitura completa)
      if (sol.erros.length) return;
      visto = E.fotoSino(sol.itens, S.rules); gravarSino(visto); pontoDePartida = true;
    }
    novidades = E.novidadesSino(sol.itens, visto, S.rules);
    const n = novidades.length, c = $('#sino-n'), b = $('#sino-b'); if (!c || !b) return;
    c.hidden = !n; c.textContent = n > 99 ? '99+' : String(n);
    b.setAttribute('aria-label', n ? `${msgSino('botao') || 'Novidades'}: ${n} ${n === 1 ? 'nova' : 'novas'}` : (msgSino('botao') || 'Novidades'));
    desenharSino();
  }
  function atualizarCabecalho() { const e = $('#plat-empresa'); if (e) e.textContent = S.ctx.empresa || 'Portal do Cliente'; }

  Object.assign(C, { atualizarCabecalho, atualizarSino, atualizarSync, badge, estadoLeitura, hora, marcarModulo, montarCasca });
}
