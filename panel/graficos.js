/* Gráficos em SVG do "Hoje" (sem bibliotecas), trazidos do Control Onvio (repositório do escritório).
 * Marcas finas, 2 px de espaço entre as fatias, valores com a tinta de texto (nunca a cor da série),
 * dica ao passar o mouse. Cores: --viz-* em plataforma.css (paleta validada, claro e escuro). */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const COR = { s1: 'var(--viz-s1)', s2: 'var(--viz-s2)', ok: 'var(--viz-ok)', warn: 'var(--viz-warn)', serious: 'var(--viz-serious)', crit: 'var(--viz-crit)' };
export const cor = (k) => COR[k] || k;
const calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Números que sobem do valor anterior ao novo: <b data-conta="42" data-de="38">42</b> */
export function animarNumeros(raiz) {
  if (calmo()) return;
  raiz.querySelectorAll('[data-conta]').forEach((el) => {
    const ate = Number(el.dataset.conta), de = Number(el.dataset.de || 0);
    if (!isFinite(ate) || de === ate) return;
    const t0 = performance.now(), dur = 700;
    const passo = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = num(Math.round(de + (ate - de) * e)) + (el.dataset.suf || ''); if (p < 1) requestAnimationFrame(passo); };
    requestAnimationFrame(passo);
  });
}

/** Rosca de partes de um todo. fatias: [{ k, rot, n, cor }]
 *  o: { ativo, rotulo, anima, titulo, centro: { n, de, suf }, tam, esp } */
export function anel(fatias, o = {}) {
  o = { tam: 150, esp: 11, ...o };
  const total = fatias.reduce((a, f) => a + f.n, 0);
  const r = (o.tam - o.esp) / 2 - 4, c = 2 * Math.PI * r, cx = o.tam / 2;
  const usadas = fatias.filter((f) => f.n > 0);
  let acum = 0, svg = '';
  for (const f of usadas) {
    const comp = f.n / total * c, d = Math.max(0.5, comp - (usadas.length > 1 ? 2 : 0));
    svg += `<circle class="an-f${o.ativo === f.k ? ' ativo' : o.ativo ? ' apagado' : ''}${o.anima ? ' entra' : ''}" data-motivo="${esc(f.k)}" data-tip="${esc(`${f.rot}: ${num(f.n)} (${Math.round(f.n / total * 100)}%)`)}" cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="${cor(f.cor)}" stroke-width="${o.esp}" stroke-dasharray="${d.toFixed(2)} ${(c - d).toFixed(2)}" stroke-dashoffset="${(-acum).toFixed(2)}" style="--c:${c.toFixed(2)}" transform="rotate(-90 ${cx} ${cx})"/>`;
    acum += comp;
  }
  if (!usadas.length) svg += `<circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="var(--rule)" stroke-width="${o.esp}"/>`;
  const cv = o.centro || { n: total, de: total, suf: '' };
  return `<div class="anel"><svg class="viz an-svg" viewBox="0 0 ${o.tam} ${o.tam}" width="${o.tam}" height="${o.tam}" role="img" aria-label="${esc(o.titulo || 'solicitações por situação')}">${svg}`
    + `<text x="${cx}" y="${cx + 4}" text-anchor="middle" class="an-total"><tspan data-conta="${cv.n}" data-de="${cv.de ?? cv.n}"${cv.suf ? ` data-suf="${cv.suf}"` : ''}>${num(cv.n)}${cv.suf || ''}</tspan></text>`
    + `<text x="${cx}" y="${cx + 24}" text-anchor="middle" class="an-rot">${esc(o.rotulo || '')}</text></svg></div>`;
}

/** Anel pequeno de progresso (cartões): pct 0..100 e o conteúdo do centro em HTML. */
export function anelProgresso(pct, centro, o = {}) {
  const tam = o.tam || 58;
  return `<span class="ap" style="--sz:${tam}px"><svg class="ap-svg" viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15.9" pathLength="100"/>`
    + (pct == null ? '' : `<circle class="fg" cx="18" cy="18" r="15.9" pathLength="100" style="stroke-dasharray:${Math.max(0.01, pct).toFixed(1)} 100"/>`)
    + `</svg><span class="ap-c">${centro}</span></span>`;
}

/** Dica (tooltip) compartilhada: qualquer elemento com data-tip dentro da raiz. */
export function ligarDicas(raiz) {
  const dica = document.getElementById('dica'); if (!dica || raiz.__dicas) return;
  raiz.__dicas = true;
  raiz.addEventListener('mousemove', (e) => {
    const alvo = e.target.closest?.('[data-tip]');
    if (!alvo) { dica.hidden = true; return; }
    dica.textContent = alvo.getAttribute('data-tip');
    dica.hidden = false;
    const w = dica.offsetWidth, h = dica.offsetHeight;
    dica.style.left = `${Math.min(innerWidth - w - 8, e.clientX + 14)}px`;
    dica.style.top = `${Math.max(8, e.clientY - h - 10)}px`;
  });
  raiz.addEventListener('mouseleave', () => { dica.hidden = true; });
}
