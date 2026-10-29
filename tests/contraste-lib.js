/* Medidor de contraste (WCAG, 4,5:1). Copiado de josuep007-prog/assistente-interno-portal-do-cliente- (Control Onvio, do escritorio;
 * mesmo dono), arquivo testes/contraste-lib.js. Roda dentro da pagina (iframe do painel) via tests/sim_test.py::teste_contraste. */
/* Medidor de contraste do app (usado por testes/navegador.js e pela auditoria manual).
 * medir(): roda dentro da página e devolve os textos visíveis com contraste abaixo de `minimo` (WCAG, 4,5:1 por padrão).
 * Compõe as cores de fundo dos ancestrais (com transparência) e as opacidades; ignora o que está desabilitado, escondido
 * ou sem texto. Fundos com imagem/gradiente são medidos pela cor sólida por baixo (aproximação, marcada em `grad`). */
module.exports = function medirContraste(minimo) {
  const parse = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] == null || isNaN(p[3]) ? 1 : p[3] }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const mix = (top, base, a) => ({ r: top.r * a + base.r * (1 - a), g: top.g * a + base.g * (1 - a), b: top.b * a + base.b * (1 - a) });
  if (false) {}
  const razao = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
  const hex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const visivel = e => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return false; } return true; };
  const saida = [], vistos = new Set();
  const alvos = document.querySelectorAll('body *');
  for (const e of alvos) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(e.tagName)) continue;
    const proprio = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim().length).map(n => n.textContent.trim()).join(' ');
    const ehInput = (e.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'hidden'].includes(e.type) && e.value) || (e.tagName === 'TEXTAREA' && e.value);
    const ehPlaceholder = (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') && !e.value && e.placeholder;
    const texto = proprio || (ehInput && e.value) || (ehPlaceholder && e.placeholder) || '';
    if (!texto || !visivel(e)) continue;
    if (e.closest('[disabled], [aria-disabled="true"], button:disabled, [inert]')) continue;
    if (e.closest('.sr-only, [hidden]')) continue;
    // o que está fora da janela (rolagem interna) conta igual: só ignoramos o que não tem caixa
    const cs = getComputedStyle(e);
    let cor = parse(ehPlaceholder ? getComputedStyle(e, '::placeholder').color : (e instanceof SVGElement ? cs.fill : cs.color));
    if (!cor) continue;
    // fundo: do ancestral mais alto até o elemento, compondo
    const cadeia = []; let grad = false;
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) cadeia.push(n);
    let fundo = { r: 255, g: 255, b: 255 }, opac = 1;
    for (const n of cadeia.reverse()) {
      const s = getComputedStyle(n), bg = parse(s.backgroundColor);
      if (s.backgroundImage && s.backgroundImage !== 'none' && /gradient|url/.test(s.backgroundImage) && !(bg && bg.a === 1)) { if (/gradient/.test(s.backgroundImage)) grad = true; }
      if (bg && bg.a > 0) fundo = mix(bg, fundo, bg.a);
      const o = parseFloat(s.opacity); if (!isNaN(o) && o < 1) opac *= o;
    }
    let texto_cor = { r: cor.r, g: cor.g, b: cor.b };
    const a = cor.a * opac;
    if (a < 1) texto_cor = mix(texto_cor, fundo, a);
    if (opac < 0.05) continue;                                   // invisível de propósito (rótulo que só aparece ao passar o mouse)
    const r = razao(texto_cor, fundo);
    const px = parseFloat(cs.fontSize), peso = parseInt(cs.fontWeight) || 400;
    const grande = px >= 24 || (px >= 18.66 && peso >= 700);
    const meta = grande ? Math.min(minimo, 3) : minimo;
    if (r >= meta) continue;
    const chave = (e.className && e.className.baseVal != null ? e.className.baseVal : e.className) + '|' + hex(texto_cor) + '|' + hex(fundo);
    if (vistos.has(chave)) continue; vistos.add(chave);
    const caminho = n => (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    saida.push({ r: +r.toFixed(2), texto: texto.slice(0, 40), fg: hex(texto_cor), bg: hex(fundo), px, peso, op: +opac.toFixed(2), grad, no: e.tagName.toLowerCase() + caminho(e) + (e.parentElement ? ' < ' + e.parentElement.tagName.toLowerCase() + caminho(e.parentElement) : '') });
  }
  return saida.sort((x, y) => x.r - y.r);
};
