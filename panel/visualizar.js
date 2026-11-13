/* Visualizador de documentos (2.45): abre o arquivo dentro da extensão, sem baixar.
 * Tudo no computador do cliente e só na memória: PDF pelo pdf.js de lib/ (páginas desenhadas conforme aparecem),
 * imagens, texto/XML, planilhas (SheetJS de lib/) e Word/ODT (só o texto). O que não dá para mostrar oferece Baixar.
 * Nada é guardado (nem o arquivo, nem o nome) e o endereço temporário é liberado ao fechar. */
import { carregarPdfjs, carregarXlsx, textoDoWord } from './extract.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const extensao = (nome) => (/\.([a-z0-9]{1,5})$/i.exec(nome || '') || [])[1]?.toLowerCase() || '';
const ICO = {
  x: '<path d="M18 6 6 18M6 6l12 12"/>', menos: '<path d="M5 12h14"/>', mais: '<path d="M12 5v14M5 12h14"/>',
  baixar: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/>', ajustar: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  portal: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
};
const ic = (k) => `<svg class="ic ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;

/** O tipo pelos primeiros bytes do arquivo ('pdf', 'imagem', 'zip', 'html', 'texto' ou ''). */
export function formaDosBytes(buf) {
  const b = new Uint8Array(buf, 0, Math.min(1024, buf.byteLength));
  const ini = String.fromCharCode(...b.subarray(0, 16));
  if (String.fromCharCode(...b).includes('%PDF-')) return 'pdf';
  if ((b[0] === 0x89 && ini.slice(1, 4) === 'PNG') || (b[0] === 0xFF && b[1] === 0xD8) || ini.startsWith('GIF8') || (ini.startsWith('RIFF') && ini.slice(8, 12) === 'WEBP') || ini.startsWith('BM')) return 'imagem';
  if (ini.startsWith('PK')) return 'zip';
  const tx = new TextDecoder('utf-8').decode(b.subarray(0, 300)).trim().toLowerCase();
  if (tx.startsWith('<!doctype html') || tx.startsWith('<html')) return 'html';
  if (tx.startsWith('<?xml') || tx.startsWith('{') || tx.startsWith('[')) return 'texto';
  return '';
}
/** Os primeiros caracteres legíveis (para o detalhe técnico; nenhum dado do documento além do formato). */
const inicioLegivel = (buf) => String.fromCharCode(...new Uint8Array(buf, 0, Math.min(5, buf.byteLength))).replace(/[^\x20-\x7e]/g, '·');

/** Qual visualização serve para o arquivo (pelo tipo informado ou pela extensão). */
export function formaDeVer(nome, tipo = '') {
  const x = extensao(nome), t = String(tipo || '').toLowerCase();
  if (x === 'pdf' || t === 'application/pdf') return 'pdf';
  if (/^(jpe?g|png|gif|webp|bmp|svg)$/.test(x) || /^image\/(jpe?g|png|gif|webp|bmp)$/.test(t)) return 'imagem';
  if (/^(xlsx|xlsm|xls|ods|csv)$/.test(x)) return 'planilha';
  if (/^(docx|odt)$/.test(x)) return 'word';
  if (/^(txt|xml|json|ofx|ret|rem|log)$/.test(x) || /^text\//.test(t) || /xml|json/.test(t)) return 'texto';
  return '';
}

/**
 * Abre o visualizador na hora (com "Abrindo…") e mostra o arquivo quando `obter()` devolver { buf, nome, tipo }.
 * opts: { nome, subtitulo, obter: async () => ({ ok, arquivo: { buf, name, type }, motivo }), aoBaixar(arquivo), aoPortal() }
 */
export function abrirVisualizador({ nome, subtitulo = '', obter, aoBaixar, aoPortal }) {
  document.querySelector('.vis')?._fechar?.();
  const quemAbriu = document.activeElement;
  const raiz = document.createElement('div');
  raiz.className = 'vis';
  raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-modal', 'true'); raiz.setAttribute('aria-label', `Visualizar: ${nome}`);
  raiz.innerHTML = `<div class="vis-bar">
      <div class="vis-tit"><b class="vis-nome" title="${esc(nome)}">${esc(nome)}</b><small class="vis-sub">${esc(subtitulo)}</small></div>
      <span class="vis-pag mono" aria-live="polite"></span>
      <div class="vis-zoom" hidden><button type="button" class="icon-btn" data-z="-1" aria-label="Diminuir" title="Diminuir (−)">${ic('menos')}</button><button type="button" class="btn btn-sm btn-ghost mono" data-z="0" title="Ajustar à largura">100%</button><button type="button" class="icon-btn" data-z="1" aria-label="Aumentar" title="Aumentar (+)">${ic('mais')}</button></div>
      ${aoPortal ? `<button type="button" class="btn btn-sm btn-ghost" data-vis="portal">${ic('portal')} No portal</button>` : ''}
      <button type="button" class="btn btn-sm" data-vis="baixar" disabled>${ic('baixar')} Baixar</button>
      <button type="button" class="icon-btn vis-x" data-vis="fechar" aria-label="Fechar (Esc)" title="Fechar (Esc)">${ic('x')}</button>
    </div>
    <div class="vis-corpo" tabindex="-1"><div class="vis-msg"><span class="vis-gira" aria-hidden="true"></span>Abrindo o documento…</div></div>`;
  document.body.appendChild(raiz);
  const corpo = raiz.querySelector('.vis-corpo'), pag = raiz.querySelector('.vis-pag'), zoomBox = raiz.querySelector('.vis-zoom'), zoomRot = raiz.querySelector('[data-z="0"]');
  const btBaixar = raiz.querySelector('[data-vis="baixar"]');
  let arquivo = null, url = null, pdf = null, observador = null, fechado = false, zoom = 1, redesenhar = null;

  const fechar = () => {
    if (fechado) return; fechado = true;
    document.removeEventListener('keydown', tecla, true);
    observador?.disconnect(); try { pdf?.destroy(); } catch { /* já liberado */ }
    if (url) URL.revokeObjectURL(url);
    raiz.remove(); arquivo = null;
    try { quemAbriu?.focus?.(); } catch { /* quem abriu já saiu da tela */ }
  };
  raiz._fechar = fechar;
  const mudarZoom = (d) => { if (!redesenhar) return; zoom = d === 0 ? 1 : Math.min(4, Math.max(0.4, +(zoom + d * 0.25).toFixed(2))); zoomRot.textContent = `${Math.round(zoom * 100)}%`; redesenhar(); };
  const tecla = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); return; }
    if ((e.key === '+' || e.key === '=') && !e.target.closest?.('input,textarea')) { e.preventDefault(); mudarZoom(1); }
    else if (e.key === '-' && !e.target.closest?.('input,textarea')) { e.preventDefault(); mudarZoom(-1); }
    else if (e.key === 'Tab') {   // o foco fica no visualizador
      const fs = [...raiz.querySelectorAll('button:not([disabled]), [tabindex="0"]')].filter(b => b.getClientRects().length);
      if (!fs.length) return;
      const i = fs.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); fs.at(-1).focus(); } else if (!e.shiftKey && i === fs.length - 1) { e.preventDefault(); fs[0].focus(); }
    }
  };
  document.addEventListener('keydown', tecla, true);
  raiz.querySelector('[data-vis="fechar"]').addEventListener('click', fechar);
  raiz.querySelector('[data-vis="portal"]')?.addEventListener('click', () => { fechar(); aoPortal(); });
  btBaixar.addEventListener('click', () => arquivo && aoBaixar?.(arquivo));
  raiz.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => mudarZoom(+b.dataset.z)));
  raiz.querySelector('[data-vis="fechar"]').focus();

  const mensagem = (txt, comBaixar = true, detalhe = '') => {
    corpo.innerHTML = `<div class="vis-msg vis-aviso"><b>${esc(txt)}</b>${comBaixar && arquivo ? `<span>Baixe o arquivo para abrir com um programa do seu computador.</span><button type="button" class="btn btn-primary btn-sm" data-vis-baixar>${ic('baixar')} Baixar</button>` : ''}${detalhe ? `<small class="vis-det">${esc(detalhe)}</small>` : ''}</div>`;
    corpo.querySelector('[data-vis-baixar]')?.addEventListener('click', () => aoBaixar?.(arquivo));
  };

  (async () => {
    let r;
    try { r = await obter(); } catch (e) { r = { ok: false, motivo: e?.message }; }
    if (fechado) return;
    if (!r?.ok || !r.arquivo?.buf) { mensagem(`Não consegui abrir o documento: ${r?.motivo || 'sem resposta do portal'}.`, false); return; }
    arquivo = r.arquivo;
    if (!(arquivo.buf instanceof ArrayBuffer)) arquivo.buf = arquivo.buf?.buffer instanceof ArrayBuffer ? arquivo.buf.buffer.slice(arquivo.buf.byteOffset, arquivo.buf.byteOffset + arquivo.buf.byteLength) : await new Blob([arquivo.buf]).arrayBuffer();
    // arquivo que chegou como texto base64 (ex.: "JVBERi0…" é um PDF): volta a ser binário
    try { const ini = new TextDecoder('ascii').decode(new Uint8Array(arquivo.buf, 0, Math.min(8, arquivo.buf.byteLength))); if (/^(JVBERi|iVBORw|\/9j\/)/.test(ini)) { const bin = atob(new TextDecoder('ascii').decode(arquivo.buf).replace(/\s+/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); arquivo = { ...arquivo, buf: u.buffer }; } } catch { /* não era base64 */ }
    btBaixar.disabled = false;
    // o tipo vem dos primeiros bytes (o nome do Onvio nem sempre traz a extensão); o nome só decide quando os bytes não dizem
    const nomeArq = arquivo.name || nome, pelosBytes = formaDosBytes(arquivo.buf), forma = pelosBytes === 'pdf' || pelosBytes === 'imagem' ? pelosBytes : (formaDeVer(nomeArq, arquivo.type) || pelosBytes);
    const detalhe = (e) => `Detalhe técnico: ${String(e?.message || e || 'erro').slice(0, 140)} · ${forma || 'tipo desconhecido'} · ${arquivo.buf.byteLength} bytes · começa com “${inicioLegivel(arquivo.buf)}”`;
    try {
      if (forma === 'pdf') await verPdf().catch(e => verPdfNativo(e));
      else if (forma === 'imagem') verImagem();
      else if (forma === 'planilha') await verPlanilha(nomeArq);
      else if (forma === 'word') await verWord(nomeArq);
      else if (forma === 'texto') verTexto();
      else if (forma === 'html') mensagem('O portal devolveu uma página em vez do arquivo.', true, detalhe('página HTML'));
      else mensagem('Este tipo de arquivo não abre aqui na extensão.');
    } catch (e) { if (!fechado) mensagem('Não consegui mostrar este arquivo aqui.', true, detalhe(e)); }
  })();

  /* Se o pdf.js não conseguir (PDF com algo que ele não desenha), o leitor de PDF do próprio Chrome mostra o arquivo. */
  function verPdfNativo(erro) {
    if (fechado) return;
    observador?.disconnect(); try { pdf?.destroy(); } catch { /* já liberado */ } pdf = null; redesenhar = null;
    if (!url) url = URL.createObjectURL(new Blob([arquivo.buf], { type: 'application/pdf' }));
    zoomBox.hidden = true; pag.textContent = '';
    corpo.innerHTML = `<iframe class="vis-nativo" title="${esc(nome)}" src="${url}#view=FitH"></iframe>`;
    // o foco fica fora do leitor do Chrome (ele pega o foco ao carregar), senão o Esc não chega aqui
    const fx = raiz.querySelector('[data-vis="fechar"]'); fx.focus();
    corpo.querySelector('iframe').addEventListener('load', () => setTimeout(() => { if (!fechado) fx.focus(); }, 300));
    corpo.dataset.nativo = String(erro?.message || erro || '').slice(0, 140);   // só para o diagnóstico
  }

  async function verPdf() {
    const pdfjs = await carregarPdfjs();
    pdf = await pdfjs.getDocument({ data: new Uint8Array(arquivo.buf).slice(), isEvalSupported: false }).promise;   // cópia: o original continua para o Baixar
    if (fechado) return;
    const n = pdf.numPages, p1 = await pdf.getPage(1), base = p1.getViewport({ scale: 1 });
    corpo.innerHTML = `<div class="vis-pdf">${Array.from({ length: n }, (_, i) => `<div class="vis-pg" data-pg="${i + 1}" aria-label="Página ${i + 1} de ${n}"><canvas></canvas></div>`).join('')}</div>`;
    zoomBox.hidden = false;
    const desenhados = new Map();   // página → zoom com que foi desenhada
    const largura = () => Math.max(200, Math.min(900, corpo.clientWidth - 48));   // "largura da página" como nos leitores de PDF (até 900 px)
    const ajustarCaixas = () => corpo.querySelectorAll('.vis-pg').forEach(d => { const w = largura() * zoom; d.style.width = `${w}px`; d.style.height = `${w * base.height / base.width}px`; });
    const desenhar = async (div) => {
      const i = +div.dataset.pg; if (desenhados.get(i) === zoom || fechado) return;
      desenhados.set(i, zoom);
      const pg = i === 1 ? p1 : await pdf.getPage(i);
      const vp1 = pg.getViewport({ scale: 1 }), escala = largura() * zoom / vp1.width, dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = pg.getViewport({ scale: escala * dpr }), cv = document.createElement('canvas');
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      div.style.height = `${vp.height / dpr}px`;
      await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      if (!fechado && desenhados.get(i) === zoom) div.replaceChildren(cv);
    };
    ajustarCaixas();
    // a 1ª página desenha antes de mostrar: se ela falhar, vai para o leitor do Chrome (catch do chamador)
    await desenhar(corpo.querySelector('.vis-pg'));
    observador = new IntersectionObserver((ents) => ents.forEach(e => { if (e.isIntersecting) desenhar(e.target).catch(() => {}); }), { root: corpo, rootMargin: '600px 0px' });
    corpo.querySelectorAll('.vis-pg').forEach(d => observador.observe(d));
    const atual = () => { const topo = corpo.getBoundingClientRect().top; let k = 1; corpo.querySelectorAll('.vis-pg').forEach(d => { if (d.getBoundingClientRect().top - topo < corpo.clientHeight / 2) k = +d.dataset.pg; }); pag.textContent = n > 1 ? `Página ${k} de ${n}` : '1 página'; };
    corpo.addEventListener('scroll', atual, { passive: true }); atual();
    redesenhar = () => { ajustarCaixas(); corpo.querySelectorAll('.vis-pg').forEach(d => { const r = d.getBoundingClientRect(), c = corpo.getBoundingClientRect(); if (r.bottom > c.top - 600 && r.top < c.bottom + 600) desenhar(d).catch(() => {}); }); };
    corpo.focus();
  }
  function verImagem() {
    url = URL.createObjectURL(new Blob([arquivo.buf], { type: arquivo.type || 'image/*' }));
    corpo.innerHTML = `<div class="vis-img"><img alt="${esc(nome)}"></div>`;
    const img = corpo.querySelector('img');
    img.onerror = () => mensagem('Não consegui mostrar esta imagem aqui.');
    img.src = url; zoomBox.hidden = false;
    redesenhar = () => { img.style.width = zoom === 1 ? '' : `${zoom * 100}%`; img.style.maxWidth = zoom === 1 ? '100%' : 'none'; };
    pag.textContent = 'Imagem'; corpo.focus();
  }
  function textoDecodificado() {
    const b = new Uint8Array(arquivo.buf).slice(0, 2_000_000);
    let t = new TextDecoder('utf-8').decode(b);
    if ((t.match(/�/g) || []).length > 3) t = new TextDecoder('windows-1252').decode(b);   // arquivos antigos (bancos, sistemas)
    return t;
  }
  function verTexto() {
    corpo.innerHTML = `<pre class="vis-texto"></pre>`;
    corpo.querySelector('pre').textContent = textoDecodificado();
    pag.textContent = arquivo.buf.byteLength > 2_000_000 ? 'Mostrando o começo do arquivo' : ''; corpo.focus();
  }
  async function verWord(nomeArq) {
    const r = await textoDoWord(new File([arquivo.buf], nomeArq));
    if (fechado) return;
    corpo.innerHTML = `<div class="vis-doc"><p class="vis-nota">Só o texto do documento (sem a formatação). Para ver como foi feito, baixe o arquivo.</p><div class="vis-doc-tx"></div></div>`;
    corpo.querySelector('.vis-doc-tx').textContent = r.texto || '(documento sem texto)';
    corpo.focus();
  }
  async function verPlanilha(nomeArq) {
    const XLSX = await carregarXlsx();
    if (fechado) return;
    const wb = extensao(nomeArq) === 'csv' ? XLSX.read(textoDecodificado().replace(/^﻿/, ''), { type: 'string', raw: true }) : XLSX.read(new Uint8Array(arquivo.buf), { type: 'array', cellDates: true });
    const MAXL = 500, MAXC = 40;
    const tabela = (aba) => {
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: false, defval: '' });
      const cols = Math.min(MAXC, Math.max(0, ...linhas.slice(0, MAXL).map(l => l.length)));
      const letra = (i) => { let s = ''; for (let k = i + 1; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + (k - 1) % 26) + s; return s; };
      const corte = linhas.length > MAXL || linhas.some(l => l.length > MAXC);
      return `<div class="vis-tab-w"><table class="vis-tab"><thead><tr><th></th>${Array.from({ length: cols }, (_, i) => `<th>${letra(i)}</th>`).join('')}</tr></thead><tbody>${linhas.slice(0, MAXL).map((l, i) => `<tr><th>${i + 1}</th>${Array.from({ length: cols }, (_, c) => `<td>${esc(l[c] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${corte ? `<p class="vis-nota">Mostrando até ${MAXL} linhas e ${MAXC} colunas. Baixe para ver tudo.</p>` : ''}`;
    };
    const abas = wb.SheetNames;
    corpo.innerHTML = `${abas.length > 1 ? `<div class="vis-abas" role="tablist">${abas.map((a, i) => `<button type="button" role="tab" class="dp-tab${i ? '' : ' active'}" aria-selected="${!i}" data-aba="${i}">${esc(a)}</button>`).join('')}</div>` : ''}<div class="vis-planilha">${tabela(abas[0])}</div>`;
    corpo.querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => {
      corpo.querySelectorAll('[data-aba]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', String(x === b)); });
      corpo.querySelector('.vis-planilha').innerHTML = tabela(abas[+b.dataset.aba]);
    }));
    pag.textContent = abas.length > 1 ? `${abas.length} abas` : ''; corpo.focus();
  }
  return { fechar };
}
