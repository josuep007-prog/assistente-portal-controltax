// Leitura de arquivos 100% local: PDF (texto), OCR (imagens/PDF escaneado), planilhas e texto.
// pdf.js é carregado só quando um PDF é lido: se a pasta lib/ faltar, o painel continua funcionando.
import { xmlParaTexto } from './engine.js';
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
// HEIC e TIFF o navegador não abre: a leitura devolve motivo 'heic'/'tiff' e a tela explica o que fazer (regras.mensagens.leitura*)
const isHeic = (f) => /heic|heif/.test(f.type) || ['heic', 'heif'].includes(ext(f.name));
const isTiff = (f) => /tiff?$/.test(f.type) || ['tif', 'tiff'].includes(ext(f.name));
const isImage = (f) => !isHeic(f) && !isTiff(f) && (/^image\//.test(f.type) || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(ext(f.name)));
const isPdf = (f) => f.type === 'application/pdf' || ext(f.name) === 'pdf';
const isSheet = (f) => ['xlsx', 'xls', 'csv', 'ods'].includes(ext(f.name));
const isDoc = (f) => ['docx', 'odt'].includes(ext(f.name));
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
/** Fotos de celular: gira (0/90/180/270), aumenta se for pequena, passa para tons de cinza e estica o contraste.
 *  binarizar = limiar adaptativo (ajuda em fotos com sombra e papel amarelado). */
async function prepImage(source, { rot = 0, binarizar = false } = {}) {
  try {
    const bmp = source instanceof ImageBitmap ? source : await createImageBitmap(source);
    const alvo = 2000;
    const scale = Math.max(1, Math.min(3, alvo / Math.max(bmp.width, bmp.height)));
    const bw = Math.round(bmp.width * scale), bh = Math.round(bmp.height * scale);
    const deitado = rot === 90 || rot === 270;
    const w = deitado ? bh : bw, h = deitado ? bw : bh;
    const cv = new OffscreenCanvas(w, h); const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(w / 2, h / 2); ctx.rotate(rot * Math.PI / 180); ctx.drawImage(bmp, -bw / 2, -bh / 2, bw, bh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const img = ctx.getImageData(0, 0, w, h); const d = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = g; hist[g]++; }
    const total = w * h; let lo = 0, hi = 255, acc = 0;
    for (; lo < 255; lo++) { acc += hist[lo]; if (acc > total * 0.01) break; }
    acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > total * 0.01) break; }
    const range = Math.max(1, hi - lo);
    const g = new Uint8ClampedArray(total);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range));
    if (binarizar) {
      // limiar adaptativo (média local por imagem integral, janela ~1/40 da largura)
      const r = Math.max(8, Math.round(Math.max(w, h) / 80));
      const ii = new Float64Array((w + 1) * (h + 1));
      for (let y = 1; y <= h; y++) { let row = 0; for (let x = 1; x <= w; x++) { row += g[(y - 1) * w + x - 1]; ii[y * (w + 1) + x] = ii[(y - 1) * (w + 1) + x] + row; } }
      for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
        for (let x = 0; x < w; x++) {
          const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
          const soma = ii[y1 * (w + 1) + x1] - ii[y0 * (w + 1) + x1] - ii[y1 * (w + 1) + x0] + ii[y0 * (w + 1) + x0];
          const media = soma / ((x1 - x0) * (y1 - y0));
          g[y * w + x] = g[y * w + x] < media * 0.86 ? 0 : 255;
        }
      }
    }
    for (let i = 0, j = 0; i < d.length; i += 4, j++) { d[i] = d[i + 1] = d[i + 2] = g[j]; d[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    return await cv.convertToBlob({ type: 'image/png' });
  } catch { return source; }
}

async function ocrImage(source, onProgress) {
  ocrProgress = onProgress || (() => {});
  const w = await getOcr();
  const { data } = await w.recognize(source, { rotateAuto: true });
  // palavras com a posição e a confiança de cada uma: só na memória (recorte da foto nos campos com dúvida)
  // com a imagem girada pelo próprio OCR (rotateAuto) as coordenadas são de outra imagem: sem posição, sem recorte
  const palavras = Math.abs(data.rotateRadians || 0) > 0.02 ? [] : (data.words || []).filter(x => x?.text && x.bbox).map(x => ({ t: x.text, conf: Math.round(x.confidence || 0), bbox: { x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 } }));
  return { texto: data.text || '', conf: data.confidence || 0, palavras };
}

/** Nota de uma leitura: palavras de documento reconhecidas + confiança do OCR. */
const PALAVRAS_DOC = /\b(atest|declar|paciente|afastamento|afastad|dias?|data|necessit|trabalho|atividades|medic|consulta|crm|cid|repouso|portador|cpf|nome|assinatura|unidade|sa[uú]de)/gi;
const palavrasDoc = (texto, rx = PALAVRAS_DOC) => new Set((String(texto || '').match(rx) || []).map(x => x.toLowerCase().slice(0, 6))).size;
/** Palavras de qualquer documento trabalhista (para decidir se o texto de um PDF é o documento ou só um rodapé). */
const PALAVRAS_GERAIS = /\b(atest|declar|paciente|afastament|dias?|data|necessit|trabalho|medic|consulta|crm|cid|repouso|cpf|nome|assinatura|cep|endere[cç]|rua|avenida|venciment|fatura|conta|total|valor|cnpj|nasciment|identidade|registro|admiss|sal[aá]ri|empresa|cliente|recibo|f[eé]rias|aviso|rescis|demiss|contrato|cargo|fun[cç][aã]o|habilita|filia[cç]|eleitor)/gi;
export function notaLeitura(r) {
  return palavrasDoc(r.texto) * 6 + (r.conf || 0) * 0.6;
}

/** OCR com segunda chance: se a leitura sai fraca, tenta a imagem girada e/ou com limiar adaptativo. */
async function ocrMelhor(source, onProgress, faixa = [0, 1]) {
  let bmp; try { bmp = await createImageBitmap(source); } catch { const e = new Error('imagem'); e.motivo = 'imagem'; throw e; }
  const deitada = bmp.width > bmp.height * 1.1;
  const tentativas = [{ rot: 0 }, ...(deitada ? [{ rot: 90 }, { rot: 270 }] : []), { rot: 0, binarizar: true }, ...(deitada ? [] : [{ rot: 90 }, { rot: 270 }]), { rot: 180 }];
  const [a, b] = faixa; const n = tentativas.length;
  let melhor = null;
  for (let i = 0; i < n; i++) {
    const t = tentativas[i];
    const etapa = i === 0 ? 'Reconhecendo texto (OCR)' : t.rot ? 'Tentando a imagem em outra posição' : 'Tentando melhorar a imagem';
    const prep = await prepImage(bmp, t);
    const r = await ocrImage(prep, (p) => onProgress?.(a + (b - a) * Math.min(0.95, (i + p) / Math.min(n, i + 2)), etapa));
    r.rot = t.rot; r.binarizar = !!t.binarizar; r.nota = notaLeitura(r); r.imagem = prep;   // a imagem em que as palavras foram achadas (coordenadas do recorte)
    self.__ctOcrLog?.push({ rot: t.rot, bin: !!t.binarizar, nota: Math.round(r.nota), conf: Math.round(r.conf) });
    if (!melhor || r.nota > melhor.nota) melhor = r;
    if (melhor.nota >= 75) break;                 // leitura boa: para aqui
    if (i >= 1 && melhor.nota >= 55 && !deitada) break;
  }
  return melhor;
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

/** PDF: o texto de cada página; o OCR é decidido página por página (uma digital e outra escaneada: só a escaneada vai ao OCR),
 *  até opts.ocrMaxPaginas (regras: config.ocrMaxPaginas). Devolve também paginasTexto (para separar os documentos), paginasLidas
 *  (quantas foram lidas de verdade), ocrCortado (páginas que precisavam de OCR e ficaram de fora) e, das páginas lidas por OCR,
 *  as palavras com posição e a imagem (só na memória). A memória do PDF é liberada ao terminar. */
async function readPdf(file, onProgress, { ocr = true, ocrMaxPaginas = 8 } = {}) {
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf;
  try { pdf = await (await getPdfjs()).getDocument({ data, isEvalSupported: false }).promise; }
  catch (e) { if (e?.name === 'PasswordException') { const er = new Error('senha'); er.motivo = 'senha'; throw er; } throw e; }
  try {
    const pages = [];
    const maxPages = Math.min(pdf.numPages, 15);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      pages.push(pageTextToLines(await page.getTextContent()));
      onProgress?.(i / maxPages * 0.3, 'Lendo PDF');
    }
    const confs = [], rots = []; const imagens = {}; let palavras = [];
    const ocrPages = pages.slice();
    // a página precisa de OCR quando quase não tem texto, ou só um rodapé ("Digitalizado com o aplicativo…") sem palavra de documento
    // (o rodapé de aplicativo de digitalização conta sozinho; um texto curto sem palavra de documento só conta quando o arquivo todo não tem nenhuma)
    const semPalavrasNoArquivo = palavrasDoc(pages.join('\n'), PALAVRAS_GERAIS) < 2;
    const precisa = pages.map(t => { const n = t.replace(/\s+/g, '').length; return n < 40 || (palavrasDoc(t, PALAVRAS_GERAIS) < 2 && n < 400 && (semPalavrasNoArquivo || /digitalizad|camscanner|adobe scan|scanned|escaneado/i.test(t))); });
    const alvo = ocr ? precisa.map((p, i) => p ? i : -1).filter(i => i >= 0) : [];
    const lista = alvo.slice(0, Math.max(1, ocrMaxPaginas));
    const ocrCortado = alvo.length - lista.length;
    let metodo = 'pdf-texto';
    for (let k = 0; k < lista.length; k++) {
      const i = lista[k];
      const page = await pdf.getPage(i + 1);
      const vp = page.getViewport({ scale: 2.2 });
      const canvas = new OffscreenCanvas(vp.width, vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const r = await ocrMelhor(blob, onProgress, [0.3 + (k / lista.length) * 0.7, 0.3 + ((k + 1) / lista.length) * 0.7]);
      // fica com o OCR quando a página não tinha texto ou quando ele lê mais palavras de documento
      const poor = pages[i].replace(/\s+/g, '').length < 40;
      if (poor || palavrasDoc(r.texto, PALAVRAS_GERAIS) > palavrasDoc(pages[i], PALAVRAS_GERAIS)) {
        ocrPages[i] = r.texto; metodo = 'ocr'; confs.push(r.conf); rots.push(r.rot);
        if (r.imagem) imagens[i] = r.imagem;
        palavras = palavras.concat((r.palavras || []).map(w => ({ ...w, pagina: i })));
      }
    }
    return { texto: ocrPages.join('\n\n'), paginasTexto: ocrPages, paginas: pdf.numPages, paginasLidas: Math.min(pdf.numPages, maxPages) - ocrCortado, ocrCortado, limitePaginas: maxPages < pdf.numPages ? maxPages : null,
      metodo, confianca: confs.length ? Math.round(Math.min(...confs)) : 100, rotacao: metodo === 'ocr' ? rots.find(Boolean) || 0 : 0, palavras: metodo === 'ocr' ? palavras : null, imagens: metodo === 'ocr' ? imagens : null };
  } finally { try { await pdf.destroy(); } catch { /* já liberado */ } }
}

/* ---------- Word e LibreOffice (.docx, .odt): o texto vem do XML do arquivo (SheetJS lê o zip; sem biblioteca nova) ---------- */
async function readDoc(file) {
  await loadScript(chrome.runtime.getURL('lib/xlsx/xlsx.full.min.js'));
  const XLSX = self.XLSX;
  const cfb = XLSX.CFB.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const docx = ext(file.name) === 'docx';
  const entrada = XLSX.CFB.find(cfb, docx ? 'word/document.xml' : 'content.xml') || XLSX.CFB.find(cfb, docx ? '/word/document.xml' : '/content.xml');
  if (!entrada?.content) { const er = new Error('doc'); er.motivo = 'doc'; throw er; }
  const xml = new TextDecoder('utf-8').decode(entrada.content instanceof Uint8Array ? entrada.content : new Uint8Array(entrada.content));
  return { texto: xmlParaTexto(xml, docx ? 'docx' : 'odt'), metodo: 'texto', paginas: 1 };
}

/* ---------- Planilhas ---------- */
async function readSheet(file) {
  await loadScript(chrome.runtime.getURL('lib/xlsx/xlsx.full.min.js'));
  const XLSX = self.XLSX;
  let wb;
  if (ext(file.name) === 'csv') {
    // CSV salvo pelo Excel em português vem em windows-1252 (acentos quebrados em UTF-8): tenta UTF-8 e, se não serve, windows-1252
    const bytes = new Uint8Array(await file.arrayBuffer());
    let texto; try { texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { texto = new TextDecoder('windows-1252').decode(bytes); }
    wb = XLSX.read(texto.replace(/^\uFEFF/, ''), { type: 'string', raw: false });
  } else wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
  // todas as abas (a certa é a que tem o cabeçalho de rubricas); tabela/texto são os da primeira aba com dados
  const abas = wb.SheetNames.map(nome => ({ nome, linhas: XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: false, defval: '' }).filter(r => r.some(c => String(c).trim())) })).filter(a => a.linhas.length);
  const rows = abas[0]?.linhas || [];
  return { texto: rows.map(r => r.join(' | ')).join('\n'), tabela: rows, abas, metodo: 'planilha', paginas: 1 };
}

export async function readFile(file, onProgress, opts = {}) {
  if (isPdf(file)) return readPdf(file, onProgress, opts);
  if (isHeic(file)) return { texto: '', metodo: 'nao-suportado', motivo: 'heic', paginas: 0 };
  if (isTiff(file)) return { texto: '', metodo: 'nao-suportado', motivo: 'tiff', paginas: 0 };
  if (isImage(file)) {
    if (opts.ocr === false) return { texto: '', metodo: 'imagem', paginas: 1 };
    onProgress?.(0.05, 'Melhorando a imagem');
    const r = await ocrMelhor(file, onProgress);
    return { texto: r.texto, metodo: 'ocr', paginas: 1, confianca: Math.round(r.conf), rotacao: r.rot, palavras: (r.palavras || []).map(w => ({ ...w, pagina: 0 })), imagens: r.imagem ? { 0: r.imagem } : null };
  }
  if (isSheet(file)) return readSheet(file);
  if (isDoc(file)) return readDoc(file);
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
