/* Plataforma — Casca: trilho, cabeçalho, indicador de leitura e busca.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';
import { anel } from '../graficos.js';

export function montarCasca(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { MODULOS, P, TITULOS, editavel, nomeTipo, quando } = C;   // definidos em partes que montam antes
  const abrirBusca = (...a) => C.abrirBusca(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const montarBusca = (...a) => C.montarBusca(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  /* =================== Casca: trilho, cabeçalho, busca =================== */
  let montada = false;
  function montarCasca() {
    if (montada) return; montada = true;
    $('#rail-mods').innerHTML = MODULOS.map(([v, t, ic]) => `<button type="button" class="rail-i" data-mod="${v}" title="${t}"><span class="rail-ico">${icon(ic)}</span><span class="rail-t">${t}</span><span class="rail-badge" data-badge="${v}" hidden></span></button>`).join('');
    $('#rail-bottom').innerHTML = [['portal', 'Ver no portal', 'external'], ['tema', 'Tema claro/escuro', 'moon'], ['config', 'Configurações', 'gear'], ['minimizar', 'Minimizar', 'minus']]
      .map(([a, t, ic]) => `<button type="button" class="rail-i" data-acao="${a}" title="${t}"><span class="rail-ico">${icon(ic)}</span><span class="rail-t">${t}</span></button>`).join('');
    document.querySelectorAll('#rail [data-mod]').forEach(b => b.addEventListener('click', () => {
      // "Novo pedido" de novo, com o formulário na tela: volta para a escolha do tipo (o pedido aberto pode ser retomado)
      if (b.dataset.mod === 'preencher' && S.view === 'preencher' && S.ctx.route?.mode === 'form' && !S.plat.escolher) { S.plat.escolher = true; P.render('preencher'); return; }
      A.setView(b.dataset.mod);
    }));
    document.querySelectorAll('#rail [data-acao]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.acao;
      if (a === 'portal') send({ type: 'verPortal' });
      else if (a === 'minimizar') send({ type: 'modo', modo: 'fechado' });
      else if (a === 'tema') A.alternarTema();
      else if (a === 'config') A.setView('config');
    }));
    $('#plat-busca').addEventListener('click', abrirBusca);
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
  function atualizarCabecalho() { const e = $('#plat-empresa'); if (e) e.textContent = S.ctx.empresa || 'Portal do Cliente'; }

  Object.assign(C, { atualizarCabecalho, atualizarSync, badge, estadoLeitura, hora, marcarModulo, montarCasca });
}
