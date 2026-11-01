/* Plataforma — Diálogo genérico.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */

export function montarDialogos(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { P } = C;   // definidos em partes que montam antes
  /* =================== Diálogo genérico =================== */
  let fecharAnterior = null;
  function dialogo({ titulo, corpo, acoes = [], largo = false, aoFechar = null }) {
    fecharAnterior?.();
    const m = $('#modal'); m.hidden = false;
    const quemAbriu = document.activeElement && document.activeElement !== document.body && !m.contains(document.activeElement) ? document.activeElement : null;
    m.innerHTML = `<div class="sheet dlg${largo ? ' dlg-lg' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlg-t" tabindex="-1">
      <div class="dlg-head"><h3 id="dlg-t">${titulo}</h3><button type="button" class="icon-btn dlg-x" aria-label="Fechar">${icon('x')}</button></div>
      <div class="dlg-body">${corpo}</div>
      ${acoes.length ? `<div class="dlg-actions">${acoes.map((a, i) => a === '|' ? '<span class="sp"></span>' : `<button type="button" class="btn ${a.cls || ''}" data-acao="${i}">${a.rotulo}</button>`).join('')}</div>` : ''}</div>`;
    // o foco fica preso na janela (Tab e Shift+Tab dão a volta) e Esc fecha; ao fechar, o foco volta para quem abriu
    const FOCAVEL = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
    const tecla = (e) => {
      if (e.key === 'Escape') { fechar(); return; }
      if (e.key !== 'Tab') return;
      const sheet = m.querySelector('.sheet'); if (!sheet) return;
      const fs = [...sheet.querySelectorAll(FOCAVEL)].filter(x => !x.hidden && x.getClientRects().length);
      if (!fs.length) { e.preventDefault(); sheet.focus(); return; }
      const ativo = document.activeElement;
      if (!sheet.contains(ativo)) { e.preventDefault(); fs[e.shiftKey ? fs.length - 1 : 0].focus(); }
      else if (e.shiftKey && (ativo === fs[0] || ativo === sheet)) { e.preventDefault(); fs[fs.length - 1].focus(); }
      else if (!e.shiftKey && ativo === fs[fs.length - 1]) { e.preventDefault(); fs[0].focus(); }
    };
    let fechado = false;
    const fechar = () => {
      if (fechado) return; fechado = true; if (fecharAnterior === fechar) fecharAnterior = null;
      m.hidden = true; m.innerHTML = ''; m.onclick = null; document.removeEventListener('keydown', tecla);
      try { aoFechar?.(); } catch { /* o aviso de fechar não derruba nada */ }
      if (!m.querySelector('.sheet') && quemAbriu?.isConnected) { try { quemAbriu.focus({ preventScroll: true }); } catch { /* sem foco para devolver */ } }
    };
    fecharAnterior = fechar;
    m.querySelector('.dlg-x').addEventListener('click', fechar);
    m.onclick = (e) => { if (e.target === m) fechar(); };
    document.addEventListener('keydown', tecla);
    m.querySelector('.sheet').focus({ preventScroll: true });   // o teclado já age na janela (setas, Tab, Esc)
    acoes.forEach((a, i) => a !== '|' && m.querySelector(`[data-acao="${i}"]`)?.addEventListener('click', async () => { if (await a.fn?.(m) !== false) fechar(); }));
    return { el: m.querySelector('.sheet'), fechar };
  }
  P.dialogo = dialogo;

  Object.assign(C, { dialogo });
}
