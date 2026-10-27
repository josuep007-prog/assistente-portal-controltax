/* ZIP simples (sem compressão), feito no computador do cliente — nada sai dele. Puro e testável em Node.
 * criarZip([{ nome, bytes: Uint8Array }]) → Uint8Array. Nomes em UTF-8; nomes repetidos ganham " (2)", " (3)"… */
const TABELA = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = TABELA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
/** Nome seguro para dentro do ZIP: sem pasta nem caracteres que o Windows recusa. */
export function nomeNoZip(nome) { return String(nome || 'arquivo').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim().slice(0, 150) || 'arquivo'; }
export function criarZip(arquivos, agora = new Date()) {
  const enc = new TextEncoder(); const usados = new Map(); const partes = []; const central = []; let pos = 0;
  const dosHora = ((agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1)) & 0xFFFF;
  const dosData = ((((agora.getFullYear() - 1980) & 0x7F) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate()) & 0xFFFF;
  const u16 = (v) => [v & 0xFF, (v >>> 8) & 0xFF], u32 = (v) => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
  for (const a of arquivos) {
    let nome = nomeNoZip(a.nome); const k = nome.toLowerCase();
    if (usados.has(k)) { const n = usados.get(k) + 1; usados.set(k, n); const i = nome.lastIndexOf('.'); nome = i > 0 ? `${nome.slice(0, i)} (${n})${nome.slice(i)}` : `${nome} (${n})`; usados.set(nome.toLowerCase(), 1); } else usados.set(k, 1);
    const nb = enc.encode(nome), dados = a.bytes, crc = crc32(dados);
    const local = Uint8Array.from([0x50, 0x4B, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosHora), ...u16(dosData), ...u32(crc), ...u32(dados.length), ...u32(dados.length), ...u16(nb.length), ...u16(0)]);
    partes.push(local, nb, dados);
    central.push(Uint8Array.from([0x50, 0x4B, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosHora), ...u16(dosData), ...u32(crc), ...u32(dados.length), ...u32(dados.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(pos)]), nb);
    pos += local.length + nb.length + dados.length;
  }
  const tamCentral = central.reduce((t, x) => t + x.length, 0);
  const fim = Uint8Array.from([0x50, 0x4B, 5, 6, ...u16(0), ...u16(0), ...u16(arquivos.length), ...u16(arquivos.length), ...u32(tamCentral), ...u32(pos), ...u16(0)]);
  const todos = [...partes, ...central, fim]; const out = new Uint8Array(todos.reduce((t, x) => t + x.length, 0)); let o = 0;
  for (const x of todos) { out.set(x, o); o += x.length; }
  return out;
}
