/* Gráficos em SVG do "Hoje" (sem bibliotecas), trazidos do Control Onvio (repositório do escritório).
 * Marcas finas, 2 px de espaço entre as fatias, valores com a tinta de texto (nunca a cor da série),
 * dica ao passar o mouse. Cores: --viz-* em plataforma.css (paleta validada, claro e escuro). */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const COR = { s1: 'var(--viz-s1)', s2: 'var(--viz-s2)', s3: 'var(--viz-s3)', ok: 'var(--viz-ok)', warn: 'var(--viz-warn)', serious: 'var(--viz-serious)', crit: 'var(--viz-crit)' };
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

/** Dica (tooltip) compartilhada: qualquer elemento com data-tip dentro da raiz. Os botões ⓘ (.dica-i) também abrem a dica
 *  pelo teclado (foco) e todas fecham com Esc. */
export function ligarDicas(raiz) {
  const dica = document.getElementById('dica'); if (!dica || raiz.__dicas) return;
  raiz.__dicas = true;
  const esconde = () => { dica.hidden = true; };
  const sobre = (el) => {   // dica ao lado do elemento (foco/toque), dentro da tela
    dica.textContent = el.getAttribute('data-tip'); dica.hidden = false;
    const r = el.getBoundingClientRect(), w = dica.offsetWidth, h = dica.offsetHeight;
    dica.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left))}px`;
    dica.style.top = `${r.bottom + h + 12 > innerHeight ? Math.max(8, r.top - h - 8) : r.bottom + 8}px`;
  };
  raiz.addEventListener('mousemove', (e) => {
    const alvo = e.target.closest?.('[data-tip]');
    if (!alvo) { esconde(); return; }
    dica.textContent = alvo.getAttribute('data-tip');
    dica.hidden = false;
    const w = dica.offsetWidth, h = dica.offsetHeight;
    dica.style.left = `${Math.min(innerWidth - w - 8, e.clientX + 14)}px`;
    dica.style.top = `${Math.max(8, e.clientY - h - 10)}px`;
  });
  raiz.addEventListener('mouseleave', esconde);
  raiz.addEventListener('focusin', (e) => { const a = e.target.closest?.('.dica-i[data-tip]'); if (a) sobre(a); });
  raiz.addEventListener('focusout', (e) => { if (e.target.closest?.('.dica-i')) esconde(); });
  raiz.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dica.hidden) esconde(); });
}

/* ---------- Gráficos do cartão "Movimento das suas solicitações" ----------
   Barras empilhadas por semana, linha simples e mini barras. Todos devolvem HTML com <svg role="img"> cujo aria-label traz os
   números (quem usa leitor de tela ouve a mesma informação), dica ao passar o mouse (data-tip, ligada por ligarDicas) e
   cores --viz-* (a legenda diz o que cada cor é; os valores usam a tinta de texto, nunca a cor da série). */
const nd = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
/** Escala "bonita" do eixo: 0..topo com 3 a 5 marcas. */
export function escala(max) {
  if (!(max > 0)) return { topo: 1, passo: 1 };
  const bruto = max / 4, mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((p) => p >= bruto) || mag * 10);
  return { topo: Math.ceil(max / passo) * passo, passo };
}
export function legenda(series) {
  if (series.length < 2) return '';
  return `<div class="legenda-viz">${series.map((s) => `<span><i style="background:${cor(s.cor)}"></i>${esc(s.nome)}</span>`).join('')}</div>`;
}
/** Barras verticais empilhadas, uma coluna por categoria (ex.: semana), um segmento por série (2 px de espaço entre eles).
 *  dados: [{ rotulo, valores: { chave: n } }]  series: [{ chave, nome, cor }]
 *  o: { largura, altura, titulo, unidade ('solicitação'|'solicitações' em o.unidade = [um, varios]) } */
export function barrasEmpilhadas(dados, series, o = {}) {
  o = { largura: 520, altura: 176, esq: 30, base: 22, ...o };
  if (!dados.length) return '<div class="vazio">Sem dados.</div>';
  const soma = (d) => series.reduce((a, s) => a + (d.valores[s.chave] || 0), 0);
  const { topo, passo } = escala(Math.max(1, ...dados.map(soma)));
  const area = o.altura - o.base - 8, larg = o.largura - o.esq - 4, grupo = larg / dados.length, bw = Math.max(8, Math.min(34, grupo - 14));
  const resumo = dados.map((d) => `${d.rotulo}: ${series.map((s) => `${nd(d.valores[s.chave])} ${s.nome.toLowerCase()}`).join(', ')}`).join('; ');
  let svg = `<svg class="viz bv-svg" viewBox="0 0 ${o.largura} ${o.altura}" width="100%" role="img" aria-label="${esc(`${o.titulo || 'Barras empilhadas'}. ${resumo}`)}">`;
  for (let v = 0; v <= topo; v += passo) {
    const y = 8 + area - v / topo * area;
    svg += `<line class="${v === 0 ? 'base' : 'grid'}" x1="${o.esq}" x2="${o.largura - 4}" y1="${y}" y2="${y}"/><text x="${o.esq - 6}" y="${y + 4}" text-anchor="end">${num(v)}</text>`;
  }
  dados.forEach((d, i) => {
    const x = o.esq + i * grupo + (grupo - bw) / 2;
    let y = 8 + area;
    const segs = series.filter((s) => (d.valores[s.chave] || 0) > 0);
    segs.forEach((s, j) => {
      const h = Math.max(2, (d.valores[s.chave] || 0) / topo * area - (j < segs.length - 1 ? 2 : 0)); y -= h;
      svg += `<rect class="seg" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${j === segs.length - 1 ? 2 : 0}" fill="${cor(s.cor)}"/>`;
      y -= j < segs.length - 1 ? 2 : 0;
    });
    svg += `<rect class="alvo" x="${(o.esq + i * grupo).toFixed(1)}" y="8" width="${grupo.toFixed(1)}" height="${area}" data-tip="${esc(`Semana de ${d.rotulo}\n${series.map((s) => `${s.nome}: ${nd(d.valores[s.chave])}`).join('\n')}`)}"/>`;
    svg += `<text x="${(o.esq + i * grupo + grupo / 2).toFixed(1)}" y="${o.altura - 6}" text-anchor="middle">${esc(d.rotulo)}</text>`;
  });
  return `${legenda(series)}${svg}</svg>`;
}
/** Linha de uma série ao longo de categorias (ex.: dias até a 1ª resposta por semana). pontos: [{ rot, y (null = sem dado) }]
 *  o: { largura, altura, cor, nome, sufixo, titulo } */
export function linhaSimples(pontos, o = {}) {
  o = { largura: 520, altura: 150, esq: 30, base: 22, cor: 's1', nome: 'Valor', sufixo: '', ...o };
  const com = pontos.filter((p) => p.y != null);
  if (!com.length) return '<div class="vazio">Sem dados ainda.</div>';
  const { topo, passo } = escala(Math.max(1, ...com.map((p) => p.y)));
  const area = o.altura - o.base - 8, larg = o.largura - o.esq - 10, n = pontos.length;
  const X = (i) => o.esq + 16 + (n < 2 ? (larg - 32) / 2 : i / (n - 1) * (larg - 32)), Y = (v) => 8 + area - v / topo * area;
  const resumo = pontos.map((p) => `${p.rot}: ${p.y == null ? 'sem dado' : nd(p.y) + o.sufixo}`).join('; ');
  let svg = `<svg class="viz ls-svg" viewBox="0 0 ${o.largura} ${o.altura}" width="100%" role="img" aria-label="${esc(`${o.titulo || o.nome}. ${resumo}`)}">`;
  for (let v = 0; v <= topo; v += passo) svg += `<line class="${v === 0 ? 'base' : 'grid'}" x1="${o.esq}" x2="${o.largura - 4}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${o.esq - 6}" y="${Y(v) + 4}" text-anchor="end">${num(v)}</text>`;
  pontos.forEach((p, i) => { svg += `<text x="${X(i).toFixed(1)}" y="${o.altura - 6}" text-anchor="middle">${esc(p.rot)}</text>`; });
  // a linha quebra onde falta dado (nada de ligar semanas sem informação)
  let trecho = [];
  const fecha = () => { if (trecho.length > 1) svg += `<polyline fill="none" stroke="${cor(o.cor)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${trecho.join(' ')}"/>`; trecho = []; };
  pontos.forEach((p, i) => { if (p.y == null) fecha(); else trecho.push(`${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`); });
  fecha();
  pontos.forEach((p, i) => {
    if (p.y != null) svg += `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4" fill="${cor(o.cor)}" stroke="var(--surface)" stroke-width="2"/>`;
    svg += `<rect class="alvo" x="${(X(i) - larg / n / 2).toFixed(1)}" y="8" width="${(larg / n).toFixed(1)}" height="${area}" data-tip="${esc(`Semana de ${p.rot}\n${p.y == null ? 'sem dado' : `${o.nome}: ${nd(p.y)}${o.sufixo}`}`)}"/>`;
  });
  return `${svg}</svg>`;
}
/** Mini barras (uma por semana ou dia), para cabeçalhos e cartões pequenos. valores: [{ rot, n }] */
export function miniBarras(valores, o = {}) {
  o = { largura: 64, altura: 20, cor: 's1', ...o };
  const n = valores.length || 1, max = Math.max(1, ...valores.map((v) => v.n)), gap = 2, w = (o.largura - gap * (n - 1)) / n;
  return `<svg class="viz mb-svg" viewBox="0 0 ${o.largura} ${o.altura}" width="${o.largura}" height="${o.altura}" role="img" aria-label="${esc(`${o.titulo || 'Por período'}: ${valores.map((v) => `${v.rot} ${nd(v.n)}`).join(', ')}`)}">`
    + valores.map((v, i) => { const h = v.n ? Math.max(3, v.n / max * (o.altura - 2)) : 2; return `<rect x="${(i * (w + gap)).toFixed(1)}" y="${(o.altura - h).toFixed(1)}" width="${Math.max(1, w).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${v.n ? cor(o.cor) : 'var(--viz-grid, var(--rule-strong))'}" data-tip="${esc(`${v.rot}: ${nd(v.n)}`)}"/>`; }).join('') + '</svg>';
}
