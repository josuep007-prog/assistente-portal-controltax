// Leitura de arquivos 100% local: PDF (texto), OCR (imagens/PDF escaneado), planilhas e texto.
// pdf.js é carregado só quando um PDF é lido: se a pasta lib/ faltar, o painel continua funcionando.
let pdfjsLib = null;
async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  try { pdfjsLib = await import(chrome.runtime.getURL('lib/pdfjs/pdf.min.mjs')); }
  catch { throw new Error('A pasta lib/ da extensão está faltando: não consigo ler PDFs. Instale a extensão pelo .zip completo.'); }
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdfjs/pdf.worker.min.mjs');
  return pdfjsLib;
}
/** true quando as bibliotecas de leitura (lib/) estão na extensão */
export async function libsPresentes() {
  try { const r = await fetch(chrome.runtime.getURL('lib/pdfjs/pdf.min.mjs'), { method: 'HEAD' }); return r.ok; } catch { return false; }
}

const ext = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
const isImage = (f) => /^image\//.test(f.type) || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'].includes(ext(f.name));
const isPdf = (f) => f.type === 'application/pdf' || ext(f.name) === 'pdf';
const isSheet = (f) => ['xlsx', 'xls', 'csv', 'ods'].includes(ext(f.name));
const isText = (f) => /^text\//.test(f.type) || ['txt', 'md'].includes(ext(f.name));

function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some(s => s.src === src)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
}

/* ---------- OCR ---------- */
let ocrWorker = null;
let ocrProgress = () => {};
async function getOcr() {
  if (ocrWorker) return ocrWorker;
  await loadScript(chrome.runtime.getURL('lib/tesseract/tesseract.min.js'));
  ocrWorker = await self.Tesseract.createWorker('por', 1, {
    workerPath: chrome.runtime.getURL('lib/tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('lib/tesseract/core'),
    langPath: chrome.runtime.getURL('lib/tesseract/lang'),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: 'none',
    logger: (m) => { if (m.status === 'recognizing text') ocrProgress(m.progress); }
  });
  return ocrWorker;
}
/** Fotos de celular: aumenta se for pequena, passa para tons de cinza e estica o contraste. */
async function prepImage(source) {
  try {
    const bmp = await createImageBitmap(source);
    const alvo = 2000;
    const scale = Math.max(1, Math.min(3, alvo / Math.max(bmp.width, bmp.height)));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const cv = new OffscreenCanvas(w, h); const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h); const d = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = g; hist[g]++; }
    const total = w * h; let lo = 0, hi = 255, acc = 0;
    for (; lo < 255; lo++) { acc += hist[lo]; if (acc > total * 0.01) break; }
    acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > total * 0.01) break; }
    const range = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range)); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    return await cv.convertToBlob({ type: 'image/png' });
  } catch { return source; }
}

async function ocrImage(source, onProgress) {
  ocrProgress = onProgress || (() => {});
  const w = await getOcr();
  const { data } = await w.recognize(source);
  return data.text || '';
}

/* ---------- PDF ---------- */
function pageTextToLines(content) {
  const rows = new Map();
  for (const it of content.items) {
    if (!it.str) continue;
    const y = Math.round(it.transform[5] / 3) * 3;
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x: it.transform[4], w: it.width || 0, s: it.str });
  }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) => {
    items.sort((a, b) => a.x - b.x);
    let line = '', lastEnd = null;
    for (const it of items) {
      if (lastEnd != null) { const gap = it.x - lastEnd; line += gap > 18 ? '   ' : (gap > 1.5 ? ' ' : ''); }
      line += it.s; lastEnd = it.x + it.w;
    }
    return line.trim();
  }).filter(Boolean).join('\n');
}

async function readPdf(file, onProgress, { ocr = true } = {}) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await (await getPdfjs()).getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  const maxPages = Math.min(pdf.numPages, 15);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    pages.push(pageTextToLines(await page.getTextContent()));
    onProgress?.(i / maxPages * 0.3, 'Lendo PDF');
  }
  let text = pages.join('\n\n');
  let metodo = 'pdf-texto';
  const poor = text.replace(/\s+/g, '').length < 40 * maxPages;
  if (poor && ocr) {
    metodo = 'ocr';
    const ocrPages = [];
    const n = Math.min(maxPages, 5);
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 2.2 });
      const canvas = new OffscreenCanvas(vp.width, vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      ocrPages.push(await ocrImage(blob, (p) => onProgress?.(0.3 + ((i - 1 + p) / n) * 0.7, 'Reconhecendo texto (OCR)')));
    }
    text = ocrPages.join('\n\n');
  }
  return { texto: text, paginas: pdf.numPages, metodo };
}

/* ---------- Planilhas ---------- */
async function readSheet(file) {
  await loadScript(chrome.runtime.getURL('lib/xlsx/xlsx.full.min.js'));
  const XLSX = self.XLSX;
  const wb = ext(file.name) === 'csv'
    ? XLSX.read(await file.text(), { type: 'string', raw: false })
    : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).filter(r => r.some(c => String(c).trim()));
  return { texto: rows.map(r => r.join(' | ')).join('\n'), tabela: rows, metodo: 'planilha', paginas: 1 };
}

export async function readFile(file, onProgress, opts = {}) {
  if (isPdf(file)) return readPdf(file, onProgress, opts);
  if (isImage(file)) {
    if (opts.ocr === false) return { texto: '', metodo: 'imagem', paginas: 1 };
    onProgress?.(0.05, 'Melhorando a imagem');
    const texto = await ocrImage(await prepImage(file), (p) => onProgress?.(p, 'Reconhecendo texto (OCR)'));
    return { texto, metodo: 'ocr', paginas: 1 };
  }
  if (isSheet(file)) return readSheet(file);
  if (isText(file)) return { texto: await file.text(), metodo: 'texto', paginas: 1 };
  return { texto: '', metodo: 'nao-suportado', paginas: 0 };
}

/* ---------- IA do próprio Chrome (opcional, local) ---------- */
export async function aiAvailable() {
  try { return 'LanguageModel' in self && (await self.LanguageModel.availability()) === 'available'; } catch { return false; }
}
export async function aiExtract(texto, campos) {
  if (!(await aiAvailable())) return {};
  const keys = Object.entries(campos).filter(([, c]) => !c.sensivel).slice(0, 30);
  const schema = { type: 'object', properties: Object.fromEntries(keys.map(([k]) => [k, { type: 'string' }])), additionalProperties: false };
  const session = await self.LanguageModel.create({ initialPrompts: [{ role: 'system', content: 'Você extrai dados de documentos trabalhistas brasileiros. Responda só com JSON. Datas no formato DD/MM/AAAA. Deixe vazio o que não estiver no texto. Nunca invente.' }] });
  try {
    const lista = keys.map(([k, c]) => `${k}: ${c.rotulo}`).join('\n');
    const out = await session.prompt(`Campos:\n${lista}\n\nTexto do documento:\n${texto.slice(0, 6000)}`, { responseConstraint: schema });
    const j = JSON.parse(out);
    return Object.fromEntries(Object.entries(j).filter(([, v]) => v && String(v).trim()));
  } catch { return {}; } finally { session.destroy?.(); }
}
