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
    m.innerHTML = `<div class="sheet dlg${largo ? ' dlg-lg' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
      <div class="dlg-head"><h3 id="dlg-t">${titulo}</h3><button type="button" class="icon-btn dlg-x" aria-label="Fechar">${icon('x')}</button></div>
      <div class="dlg-body">${corpo}</div>
      ${acoes.length ? `<div class="dlg-actions">${acoes.map((a, i) => a === '|' ? '<span class="sp"></span>' : `<button type="button" class="btn ${a.cls || ''}" data-acao="${i}">${a.rotulo}</button>`).join('')}</div>` : ''}</div>`;
    const tecla = (e) => { if (e.key === 'Escape') fechar(); };
    let fechado = false;
    const fechar = () => {
      if (fechado) return; fechado = true; if (fecharAnterior === fechar) fecharAnterior = null;
      m.hidden = true; m.innerHTML = ''; m.onclick = null; document.removeEventListener('keydown', tecla);
      try { aoFechar?.(); } catch { /* o aviso de fechar não derruba nada */ }
    };
    fecharAnterior = fechar;
    m.querySelector('.dlg-x').addEventListener('click', fechar);
    m.onclick = (e) => { if (e.target === m) fechar(); };
    document.addEventListener('keydown', tecla);
    acoes.forEach((a, i) => a !== '|' && m.querySelector(`[data-acao="${i}"]`)?.addEventListener('click', async () => { if (await a.fn?.(m) !== false) fechar(); }));
    return { el: m.querySelector('.sheet'), fechar };
  }
  P.dialogo = dialogo;

  Object.assign(C, { dialogo });
}
