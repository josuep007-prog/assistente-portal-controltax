// Motor de regras — Endereço, UF, sim/não, experiência, endereço por blocos e documento pessoal.
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { CONECTORES, empregadoPorNome, nomeDepois } from './atestado.js';
import { dataValida, fmtCPF, fmtDate, norm, onlyDigits, parseDate, validCPF } from './base.js';
import { runPatterns } from './leitor.js';
import { similarity } from './nomes.js';
import { escR, findDates, plain } from './textolivre.js';

/* ---------- Endereço, UF junto do valor, sim/não e experiência ---------- */
export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
export const UF_SET = new Set(UFS);
/** "Vitória/ES", "São Paulo - SP", "SSP/SP", "Vila Velha ES" → { antes, uf }; sem UF no fim → null. */
export function separarUf(v) {
  const s = String(v ?? '').trim().replace(/[.;,]+$/, '');
  let m = s.match(/^(.*?\S)\s*[\/\-–,]\s*([A-Za-z]{2})$/);
  if (m && UF_SET.has(m[2].toUpperCase()) && /\p{L}/u.test(m[1])) return { antes: m[1].trim(), uf: m[2].toUpperCase() };
  m = s.match(/^(.*\S)\s+([A-Z]{2})$/);
  if (m && UF_SET.has(m[2]) && /\p{L}{2}/u.test(m[1])) return { antes: m[1].trim(), uf: m[2] };
  return null;
}
/** "1234567 SSP/ES", "MG-12.345.678 SSP MG" → { numero, orgao, uf } (RG com o órgão e a UF juntos). */
export function separarRg(v) {
  const s = String(v ?? '').trim();
  const m = s.match(/^(?:[A-Z]{2}[\s\-]?)?([\dXx][\d.\-\/Xx]{3,}[\dXx])\s*[\-\/]?\s*([A-Za-z]{2,8})?(?:\s*[\/\-–]?\s*([A-Za-z]{2}))?$/);
  if (!m || !m[2]) return null;
  const orgao = m[2].toUpperCase(); let uf = m[3] ? m[3].toUpperCase() : null;
  if (uf && !UF_SET.has(uf)) uf = null;
  return { numero: m[1], orgao, uf };
}
/** Rádio Sim/Não: "sim", "x", "não", "nenhum", um número (dependentes: 2 → Sim). */
export function simNao(v) {
  const s = norm(v); if (!s) return null;
  if (/^(SIM|S|X|YES|POSSUI|TEM)\b/.test(s)) return 'Sim';
  if (/^(NAO|N|NENHUM|NENHUMA|NO|0+)\b/.test(s)) return 'Não';
  const n = s.match(/^(\d+)/); if (n) return +n[1] > 0 ? 'Sim' : 'Não';
  return null;
}
/** "45 + 45 dias", "45 e 45" → [45, 45]; "90 dias" → [90]. */
export function diasExperiencia(v) {
  const s = String(v ?? '');
  const m = s.match(/(\d{1,3})\s*(?:dias?\s*)?(?:\+|\be\b|mais)\s*(\d{1,3})(?!\d)/i);
  if (m) return [+m[1], +m[2]];
  const n = s.match(/\d{1,3}/); return n ? [+n[0]] : [];
}
export const COMPL = /^(?:AP(?:TO?|ARTAMENTO)?|BL(?:OCO)?|CASA|SALA|LOJA|FUNDOS|LOTE|LT|QUADRA|QD|ANDAR|CONJ(?:UNTO)?|CJ|ED(?:IF[IÍ]CIO)?|TORRE|KM|CHAC(?:ARA)?|SOBRADO)\b/i;
export const RX_LOGRADOURO = /\b(?:RUA|R\.|AVENIDA|AV\.?|TRAVESSA|TV\.?|ALAMEDA|AL\.|ESTRADA|ESTR\.|RODOVIA|ROD\.|PRA[CÇ]A|P[CÇ]\.|LARGO|VIELA|BECO|VILA|QUADRA)\s+/i;
/** "Rua das Flores, 123, Apto 4 - Centro - Vitória/ES" → { endereco, numero, complemento, bairro, municipio, uf }. */
export function separarEndereco(linha) {
  const out = {}; const txt = String(linha || '').replace(/\s+/g, ' ').replace(/\bCEP\s*:?\s*\d{5}-?\d{3}\b/i, '').trim();
  const m = txt.match(/^(.*?)\s*(?:,\s*|\bn[º°o]?\.?\s*|\bn[úu]mero\s*:?\s*)(\d{1,6}[A-Za-z]?|S\/?N)\b(.*)$/i)
    || txt.match(/^(.*?[A-Za-zÀ-ú.])\s+(\d{1,6}[A-Za-z]?|S\/?N)\b(.*)$/i);
  if (!m) return out;
  out.endereco = m[1].replace(/[,\-–\s]+$/, '').trim(); out.numero = m[2].toUpperCase();
  const segs = m[3].split(/\s*[,;–]\s*|\s+-\s+|^\s*-\s*/).map(x => x.trim()).filter(x => x && !/^\d{5}-?\d{3}$/.test(x));
  const livres = [];
  for (const sg of segs) {
    if (COMPL.test(sg)) { out.complemento = out.complemento ? `${out.complemento} ${sg}` : sg; continue; }
    const b = sg.match(/^bairro\s*:?\s*(.+)$/i); if (b) { out.bairro = b[1]; continue; }
    if (UF_SET.has(sg.toUpperCase()) && sg.length === 2) { out.uf = sg.toUpperCase(); if (livres.length && !out.municipio) out.municipio = livres.pop(); continue; }
    const u = separarUf(sg); if (u && !out.uf) { out.municipio = u.antes; out.uf = u.uf; continue; }
    if (/\p{L}/u.test(sg) && !/\d{3,}/.test(sg)) livres.push(sg);
  }
  if (livres.length && !out.bairro) out.bairro = livres.shift();
  if (livres.length && !out.municipio && out.uf) out.municipio = livres.shift();
  return out;
}
/* ---------- Endereço por blocos (regras: config.leitorEndereco) ----------
   Uma conta de luz traz o endereço da distribuidora (com CNPJ, no topo) e o do cliente (embaixo de "Dados do cliente"
   ou do nome do titular). Cada endereço do texto vira um bloco (rua + bairro + CEP + cidade, linhas vizinhas);
   blocos com CNPJ/S.A./LTDA/SAC ou no topo perdem pontos, o bloco do titular ganha. Dois blocos parecidos = dúvida. */
export const END_PADRAO = {
  rotulosTitular: ['dados do cliente', 'unidade consumidora', 'dados do consumidor', 'dados do titular', 'local de instalacao', 'endereco de instalacao', 'endereco da instalacao', 'endereco do imovel', 'endereco de entrega', 'endereco de correspondencia', 'endereco do cliente', 'endereco do titular', 'cliente', 'titular', 'consumidor', 'destinatario'],
  rebaixar: ['cnpj', 'cnp\\)', 's\\.a\\.?', 's\\/a', 'ltda', 'eireli', 'sac', 'central de atendimento', 'atendimento ao cliente', 'ouvidoria', 'www', 'inscricao estadual', 'companhia', 'cia\\.'],
  palavrasDeConta: ['consumo', 'leitura', 'instalacao', 'matricula', 'hidrometro', 'medidor', 'vencimento', 'referencia', 'plano', 'periodo', 'telefone', 'fatura', 'nota fiscal', 'kwh', 'total', 'valor', 'conta', 'codigo', 'cliente', 'classe', 'tarifa', 'ligacao', 'rota', 'emissao']
};
export const cfgEnd = (rules) => ({ ...END_PADRAO, ...(rules?.config?.leitorEndereco || {}) });
export const RX_CEP = /\b(\d{5})\s?[-.]?\s?(\d{3})\b/;
/** Corta a linha no começo de outra coluna: 3+ espaços, "Rótulo:" (palavras com minúsculas antes de dois-pontos) ou palavra de conta. */
export const ROT_ENDERECO = /^(?:bairro|cep|cidade|municipio|uf|estado|complemento|numero|n[º°o]|endereco|logradouro|rua)$/;
export function cortarColuna(l, palavras) {
  let s = String(l || '').split(/\s{3,}|\s\|\s|\s·\s/)[0];
  // "… APTO 302 Consumo: 210 kWh": corta no começo do rótulo (palavras com minúsculas antes dos dois-pontos; em maiúsculas, a última);
  // rótulo no começo da linha ("CEP: …") ou de endereço ("Bairro: …") fica
  for (let dp = s.indexOf(':'); dp > 0; dp = s.indexOf(':', dp + 1)) {
    const ws = s.slice(0, dp).split(/\s+/).filter(Boolean); let k = ws.length;
    while (k > 0 && /\p{Ll}/u.test(ws[k - 1]) && k > ws.length - 3) k--;
    if (k === ws.length) k = ws.length - 1;
    if (k <= 0 || ROT_ENDERECO.test(plain(ws[ws.length - 1]))) continue;
    if (/^\d/.test(s.slice(dp + 1).trim()) && /^\d{1,2}$/.test(ws[ws.length - 1])) continue;   // hora "08:00"
    s = ws.slice(0, k).join(' '); break;
  }
  const p = plain(s); let corte = s.length;
  for (const w of palavras || []) { const m = p.match(new RegExp(`(?:^|\\s)${escR(plain(w))}(?![a-z])`)); if (m && m.index < corte) corte = m.index; }
  return s.slice(0, corte).replace(/[\s,;\-–]+$/, '').trim();
}
/** Cidade e UF na linha do CEP ("CEP 29101-450 VILA VELHA - ES", "Vila Velha/ES - CEP 29101-450"). */
export function cidadeDaLinha(l, palavras) {
  const s = cortarColuna(l, palavras).replace(/\bCEP\b\s*:?/i, ' ').replace(RX_CEP, ' ').replace(/\s+/g, ' ').trim().replace(/^[\s,;\-–·]+|[\s,;\-–·]+$/g, '');
  const u = separarUf(s.split(/\s{2,}|·/)[0]) || separarUf(s.replace(/^.*?[,;]\s*/, ''));
  if (u && /^[\p{L} .'-]{3,40}$/u.test(u.antes)) return { municipio: u.antes.trim(), uf: u.uf };
  return null;
}
/** Todos os endereços do texto, com a pontuação de cada um. */
export function blocosEndereco(text, rules, { titular = null, ignorar = null } = {}) {
  const C = cfgEnd(rules);
  const L = String(text || '').normalize('NFC').split(/\r?\n/).map(l => l.trim());
  const rxReb = new RegExp(`(?<![a-z])(?:${C.rebaixar.join('|')})(?![a-z])`);
  const rxTit = new RegExp(`(?:^|\\s{2,}|^\\W*)(?:${C.rotulosTitular.map(x => escR(plain(x))).join('|')})(?![a-z])`);
  const T = titular ? norm(titular) : '';
  const blocos = [];
  const usadas = new Set();
  for (let i = 0; i < L.length; i++) {
    const lp = plain(L[i]); const r = L[i].search(RX_LOGRADOURO);
    const cepAqui = RX_CEP.test(L[i]) && /\bcep\b|\d{5}-\d{3}/i.test(L[i]);
    if (r < 0 && !cepAqui) continue;
    if (usadas.has(i) || ignorar?.has(L[i])) continue;   // linha que já virou outro campo (naturalidade, "SSP/ES"…)
    const b = { linhas: [i], pontos: 0, motivos: [] };
    if (r >= 0) {
      const e = separarEndereco(cortarColuna(L[i].slice(r), C.palavrasDeConta));
      if (!e.endereco || !e.numero) { if (!cepAqui) continue; } else Object.assign(b, { endereco: e.endereco, numero: e.numero, complemento: e.complemento, bairro: e.bairro, municipio: e.municipio, uf: e.uf });
    }
    const cepM = L[i].match(RX_CEP); if (cepAqui && cepM) { b.cep = `${cepM[1]}-${cepM[2]}`; const c = cidadeDaLinha(L[i].slice(L[i].search(/\bcep\b/i) >= 0 ? L[i].search(/\bcep\b/i) : 0), C.palavrasDeConta); if (c && !b.municipio) Object.assign(b, c); }
    // rua sem CEP na linha: bairro e CEP nas linhas de baixo (até 4)
    if (b.endereco && !b.cep) {
      const meio = [];
      for (let j = i + 1; j < Math.min(L.length, i + 5); j++) {
        if (L[j].search(RX_LOGRADOURO) >= 0 && !RX_CEP.test(L[j])) break;
        if (RX_CEP.test(L[j]) && /\bcep\b|\d{5}-\d{3}/i.test(L[j])) {
          const m = L[j].match(RX_CEP); b.cep = `${m[1]}-${m[2]}`; b.linhas.push(j); usadas.add(j);
          const c = cidadeDaLinha(L[j], C.palavrasDeConta); if (c) { if (!b.municipio) b.municipio = c.municipio; if (!b.uf) b.uf = c.uf; }
          break;
        }
        meio.push(j);
      }
      if (b.cep && !b.bairro) {
        const cand = meio.map(j => ({ j, v: cortarColuna(L[j], C.palavrasDeConta) })).filter(x => x.v && /^[\p{L} .'’-]{3,40}$/u.test(x.v) && x.v.split(/\s+/).length <= 5 && !rxReb.test(plain(x.v)) && !(T && norm(x.v) === T));
        if (cand.length === 1) { b.bairro = cand[0].v; b.linhas.push(cand[0].j); }
        else if (cand.length > 1) { b.bairro = cand[0].v; b.bairroDuvida = true; b.linhas.push(cand[0].j); }
      }
    }
    // pontos: empresa (CNPJ, S.A., SAC) e topo da página perdem; o bloco do titular ganha
    const viz = [...b.linhas, i - 1].filter(x => x >= 0).map(x => plain(L[x]));
    if (viz.some(x => rxReb.test(x))) { b.pontos -= 3; b.motivos.push('empresa'); }
    if (i <= 1) { b.pontos -= 2; b.motivos.push('topo'); }
    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      const pj = plain(L[j]);
      if (rxTit.test(pj) || (T && norm(L[j]).includes(T))) { b.pontos += 3; b.titular = true; b.motivos.push('titular'); break; }
      if (j < i - 1 && RX_CEP.test(L[j])) break;
    }
    if (!b.endereco) { b.pontos -= 1; b.motivos.push('so cep'); }
    if (b.endereco && b.cep && b.municipio) b.pontos += 1;
    blocos.push(b);
  }
  return blocos.sort((a, b) => b.pontos - a.pontos);
}
/** Endereço do documento: { campos: { k: valor }, conf, fonte } ou null.
 *  Comprovante: só o bloco do titular (sem ele, abaixo do limiar). Dois blocos que empatam: abaixo do limiar. */
export function lerEndereco(text, rules, { docId = null, titular = null, ignorar = null } = {}) {
  const bl = blocosEndereco(text, rules, { titular, ignorar });
  const bom = bl.filter(b => b.pontos >= 0);
  const b = bom[0]; if (!b) return null;
  const empate = bom.length > 1 && bom[1].pontos >= b.pontos - 1 && (bom[1].cep !== b.cep || norm(bom[1].endereco) !== norm(b.endereco));
  let conf = docId === 'comprovanteEndereco' ? (b.titular ? 0.7 : 0.5) : 0.5;
  if (empate) conf = Math.min(conf, 0.45);
  const campos = {};
  for (const k of ['cep', 'endereco', 'numero', 'complemento', 'bairro', 'municipio', 'uf']) if (b[k]) campos[k] = String(b[k]).trim();
  return { campos, conf, bairroDuvida: !!b.bairroDuvida, fonte: b.titular ? 'endereço do titular no documento' : 'endereço no documento', blocos: bl.length };
}
/** Endereço em contas de consumo, comprovantes e fichas (as linhas que já viraram outros campos não entram). */
export function extractAddress(text, rules) {
  return lerEndereco(text, rules)?.campos || {};
}
/* ---------- Documento pessoal com o rótulo em cima do valor (RG, CNH, CIN, CTPS digital, título) ---------- */
/* Regras: config.leitorPessoal = { layouts: { id: { palavras, campos, maeLinha, rgIgualCpf, padroesTexto } },
   porDocumento: { docId: layout }, rotulos: { "campo" | "campoA+campoB": [rótulos] }, tipos: { campo: tipo }, padroes: { campo: regex } }.
   Campos que começam com "_" (ex.: "_data") são rótulos conhecidos cujo valor não interessa. */
export const LP_TIPOS = { nascimento: 'data', dataRg: 'data', cnhValidade: 'data', rg: 'numero', cnh: 'numero', cpf: 'cpf', titulo: 'numero', zona: 'numero', secao: 'numero', pis: 'numero', orgaoRg: 'sigla', ufRg: 'uf', ufNascimento: 'uf', cnhCategoria: 'categoria', nome: 'nome', mae: 'nome', pai: 'nome', nomeSocial: 'nome', municipioNascimento: 'texto', sexo: 'texto' };
export function lerDocumentoPessoal(text, cfg = {}, docId = null) {
  const src = String(text || '').normalize('NFC');
  const T = ' ' + norm(src) + ' ';
  let layout = null;
  for (const [id, l] of Object.entries(cfg?.layouts || {})) if ((l.palavras || []).some(p => norm(p) && T.includes(' ' + norm(p) + ' '))) { layout = id; break; }
  layout = layout || cfg?.porDocumento?.[docId] || null;
  const L = cfg?.layouts?.[layout] || {};
  const permitido = (k) => !L.campos || L.campos.includes(k);
  const tipos = { ...LP_TIPOS, ...(cfg?.tipos || {}) };
  const tipoDe = (k) => k.startsWith('_') ? (k.slice(1) || 'texto') : (tipos[k] || 'texto');
  const pad = cfg?.padroes || {};
  const rot = [];
  for (const [k, lst] of Object.entries(cfg?.rotulos || {})) for (const r of [].concat(lst)) { const P = norm(r); if (P) rot.push({ campos: k.split('+'), P }); }
  rot.sort((a, b) => b.P.length - a.P.length);
  const linhas = src.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
  const ehCodigo = (x) => /^\d{1,2}[A-D]?$|^[A-Z]$/.test(x);   // números de campo da CNH nova ("4a", "5") e letras soltas
  /** Rótulos de uma linha que só tem rótulos (null quando a linha tem outra coisa). */
  const rotulosDe = (l) => {
    let s = ' ' + norm(l) + ' '; const achados = [];
    for (const r of rot) {
      let i;
      while ((i = s.indexOf(' ' + r.P + ' ')) >= 0) { achados.push({ ...r, i }); s = s.slice(0, i + 1) + '#'.repeat(r.P.length) + s.slice(i + 1 + r.P.length); }
    }
    const resto = s.replace(/#+/g, ' ').trim().split(' ').filter(x => x && !ehCodigo(x));
    return !resto.length && achados.length ? achados.sort((a, b) => a.i - b.i) : null;
  };
  /** O valor serve para o campo? (data, número, sigla, UF, categoria, nome, texto + padrão das regras) */
  const serve = (k, v) => {
    const tp = tipoDe(k); const x = String(v || '').trim(); if (!x) return false;
    if (pad[k]) { try { if (!new RegExp(pad[k], 'i').test(x)) return false; } catch { /* regex inválida nas regras */ } }
    switch (tp) {
      case 'data': return !!parseDate(x);
      case 'cpf': return /^\d{3}[.,]?\d{3}[.,]?\d{3}-?\d{2}$/.test(x.replace(/\s+/g, ''));   // OCR: "000 .123.407-23"
      case 'numero': return /\d/.test(x) && /^[\d.\-\/ Xx]+$/.test(x);
      case 'uf': return x.length === 2 && UF_SET.has(x.toUpperCase());
      case 'sigla': return /^[A-Za-z]{2,8}(?:\/[A-Za-z]{2})?$/.test(x);   // "SSP/ES": órgão e UF juntos (o cadastro separa)
      case 'categoria': return /^(?:ACC|[A-E]{1,2})$/i.test(x);
      case 'nome': return !/\d/.test(x) && /\p{L}{2}/u.test(x);
      default: return /\p{L}/u.test(x);
    }
  };
  /** Casa os pedaços do valor com os campos, pelo tipo e na ordem: primeiro os que têm forma (data, número, sigla), depois os textos. */
  const casar = (campos, valor) => {
    const toks = String(valor).split(/[\s,;]+/).filter(x => x && !/^[\-–\/|]+$/.test(x));
    const pos = {}; const usado = new Set(); let p = 0;
    for (const k of campos) {
      const tp = tipoDe(k); if (tp === 'nome' || tp === 'texto') continue;
      let achou = -1, tam = 1;
      for (let q = p; q < toks.length && achou < 0; q++) for (const n of [3, 2, 1]) { if (q + n > toks.length) continue; if (serve(k, toks.slice(q, q + n).join(' '))) { achou = q; tam = n; break; } }
      if (achou >= 0) { pos[k] = [achou, achou + tam]; for (let z = achou; z < achou + tam; z++) usado.add(z); p = achou + tam; }
    }
    const res = {};
    campos.forEach((k, n) => {
      const tp = tipoDe(k);
      if (pos[k]) { res[k] = toks.slice(pos[k][0], pos[k][1]).join(' '); return; }
      if (tp !== 'nome' && tp !== 'texto') return;
      const antes = campos.slice(0, n).map(x => pos[x]?.[1] ?? -1); const depois = campos.slice(n + 1).map(x => pos[x]?.[0] ?? Infinity);
      const lo = Math.max(0, ...antes), hi = Math.min(toks.length, ...depois);
      const pegos = []; for (let z = lo; z < hi; z++) { if (usado.has(z) || /\d/.test(toks[z])) { if (pegos.length) break; continue; } pegos.push(toks[z]); usado.add(z); }
      if (pegos.length && serve(k, pegos.join(' '))) res[k] = pegos.join(' ');
    });
    return res;
  };
  const colunas = (l) => [...l.matchAll(/\S+(?: \S+)*/g)].map(m => ({ t: m[0], i: m.index }));
  /** O rótulo como está no documento (com acento), para mostrar de onde veio o valor. */
  const rotuloOriginal = (linha, P) => {
    const ws = linha.trim().split(/\s+/);
    for (let a = 0; a < ws.length; a++) for (let b = a + 1; b <= ws.length; b++) { const x = norm(ws.slice(a, b).join(' ')); if (x === P) return ws.slice(a, b).join(' '); if (x.length > P.length) break; }
    return P;
  };
  const out = {}; let filiacao = null;
  const put = (k, v, conf, fonte) => { if (!k || k.startsWith('_') || !permitido(k) || v == null || v === '' || out[k]) return; out[k] = { valor: String(v).replace(/\s+/g, ' ').trim(), conf, fonte }; };
  for (let i = 0; i < linhas.length; i++) {
    const labs = rotulosDe(linhas[i]); if (!labs) continue;
    const rotTxt = linhas[i].trim().replace(/\s{2,}/g, ' · ');
    // filiação: as duas linhas seguintes (o cliente confirma qual é a mãe)
    if (labs.length === 1 && labs[0].campos[0] === 'filiacao') {
      const nomes = [];
      for (let j = i + 1; j < linhas.length && nomes.length < 2 && !rotulosDe(linhas[j]); j++) { if (!serve('mae', linhas[j]) || linhas[j].trim().split(/\s+/).length < 2) break; nomes.push(linhas[j].trim().replace(/\s+/g, ' ')); }
      if (nomes.length) {
        filiacao = nomes;
        let im = nomes.length === 1 ? 0 : (L.maeLinha || cfg?.maeLinha || 2) - 1;
        const fem = nomes.map(n => /A$/i.test(norm(n).split(' ')[0]));
        if (nomes.length === 2 && fem[0] !== fem[1]) im = fem[0] ? 0 : 1;      // primeiro nome terminado em "a" costuma ser o da mãe
        put('mae', nomes[im], nomes.length === 2 && fem[0] !== fem[1] ? 0.55 : 0.45, `“${rotTxt}: ${nomes.join(' / ')}”`);
        if (nomes.length === 2) put('pai', nomes[1 - im], 0.45, `“${rotTxt}: ${nomes.join(' / ')}”`);
      }
      continue;
    }
    const j = i + 1; if (j >= linhas.length || rotulosDe(linhas[j])) continue;
    const vlin = linhas[j];
    const segL = colunas(linhas[i]), segV = colunas(vlin);
    const grupos = labs.map(() => []);
    if (labs.length > 1 && segL.length === labs.length && segV.length > 1) {
      // PDF: colunas separadas por espaços — cada pedaço vai para o rótulo mais perto
      for (const v of segV) { let best = 0; segL.forEach((c, n) => { if (Math.abs(c.i - v.i) < Math.abs(segL[best].i - v.i)) best = n; }); grupos[best].push(v.t); }
      labs.forEach((lab, n) => { if (!grupos[n].length) return; const r = casar(lab.campos, grupos[n].join(' ')); for (const [k, v] of Object.entries(r)) put(k, v, 0.7, `“${segL[n].t}: ${v}”`); });
    } else {
      // foto (OCR junta as colunas): casa pelo tipo, na ordem dos rótulos
      const r = casar(labs.flatMap(l => l.campos), vlin.trim());
      for (const [k, v] of Object.entries(r)) put(k, v, labs.length > 1 ? 0.6 : 0.7, `“${rotuloOriginal(linhas[i], (labs.find(l => l.campos.includes(k)) || labs[0]).P)}: ${v}”`);
    }
  }
  // padrões de texto do layout (título: zona e seção sem dois-pontos, inscrição de 12 dígitos)
  for (const [k, pats] of Object.entries(L.padroesTexto || {})) if (!out[k]) { const v = runPatterns(src, pats); if (v) put(k, v, 0.6, `“${v}” no documento`); }
  // ajustes finais: datas, CPF, números
  for (const [k, c] of Object.entries(out)) {
    const tp = tipoDe(k);
    if (tp === 'data') { const d = parseDate(c.valor); if (d) c.valor = fmtDate(d); else delete out[k]; }
    if (tp === 'cpf') { c.valor = fmtCPF(c.valor); if (!validCPF(c.valor)) c.conf = 0.45; }
    if (['titulo', 'zona', 'secao', 'cnh'].includes(k)) c.valor = onlyDigits(c.valor);
  }
  // CIN: o número da identidade é o CPF
  if (L.rgIgualCpf && out.cpf && !out.rg) out.rg = { valor: onlyDigits(out.cpf.valor), conf: out.cpf.conf, fonte: 'na CIN, o número é o CPF' };
  return { layout, campos: out, filiacao };
}
/** Titular de um comprovante de residência ("Nome:", "Cliente:", "Titular:"). */
export function titularComprovante(text) {
  const t = String(text || '').normalize('NFC');
  for (const m of t.matchAll(/\b(?:nome(?:\s+do\s+(?:cliente|titular))?|cliente|titular|destinat[aá]rio|consumidor)\s*:\s*/gi)) {
    const n = nomeDepois(t.slice(m.index + m[0].length, m.index + m[0].length + 90));
    if (n.split(' ').filter(x => !CONECTORES.has(norm(x))).length >= 2) return n;
  }
  return null;
}
/** Comprovante em nome de outra pessoa: aviso educativo (pode ser de um parente; o escritório pode pedir uma declaração). */
export function avisoComprovante(titular, nome, rules) {
  const pm = titular && nome ? empregadoPorNome(titular, [nome]) : null;
  if (!titular || !nome || (pm?.option && !pm.contradiz && pm.score > 0.55) || similarity(titular, nome) >= 0.85) return null;
  const msg = rules?.mensagens?.comprovanteOutraPessoa || 'O comprovante de residência está em nome de {titular}. Tudo bem se for de um parente (pai, mãe, cônjuge): nesse caso o escritório pode pedir uma declaração de residência assinada pelo titular.';
  return { nivel: 'info', id: 'comprovanteOutraPessoa', mensagem: msg.replace('{titular}', titular).replace('{nome}', nome) };
}
/** ASO: resultado, tipo de exame e data. */
/** Qual opção está marcada num formulário impresso ("( ) Apto (X) Inapto", "[x]", "☒").
 *  ASO e CAT trazem todas as opções escritas: procurar a palavra solta elegia a errada.
 *  Devolve null quando nenhuma ou mais de uma está marcada — aí o cliente confere. */
export function opcaoMarcada(text, opcoes, { exigeMarca = false } = {}) {
  const t = plain(text);
  const esc = (x) => plain(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const lista = (opcoes || []).filter(Boolean);
  if (!lista.length) return null;
  // onde cada opção aparece no texto
  const ondes = [];
  for (const o of lista) {
    const re = new RegExp(`\\b${esc(o)}\\b`, 'gi');
    for (let m; (m = re.exec(t));) ondes.push({ o, ini: m.index, fim: m.index + m[0].length });
  }
  if (!ondes.length) return null;
  // cada marca pertence à opção colada nela: a que começa logo depois, senão a que termina logo antes
  const marcas = /[(\[]\s*(?:x|☒|■|▣|✓|✔)\s*[)\]]|(?:^|\s)(?:☒|■|▣|✓|✔)(?=\s|$)/gi;
  const marcadas = new Set();
  for (let m; (m = marcas.exec(t));) {
    const ini = m.index, fim = m.index + m[0].length;
    const depois = ondes.filter(x => x.ini >= fim && x.ini - fim <= 2).sort((a, b) => a.ini - b.ini)[0];
    const antes = ondes.filter(x => x.fim <= ini && ini - x.fim <= 2).sort((a, b) => b.fim - a.fim)[0];
    // "(X) Opção" vem antes da opção; um símbolo solto ("Opção ☒") vem depois dela
    const dono = /[(\[]/.test(m[0]) ? (depois || antes) : (antes || depois);
    if (dono) marcadas.add(dono.o);
  }
  if (marcadas.size === 1) return [...marcadas][0];
  if (marcadas.size > 1 || exigeMarca) return null;
  // sem marca nenhuma: só vale quando o documento traz uma única opção (texto corrido)
  const presentes = [...new Set(ondes.map(x => x.o))];
  return presentes.length === 1 ? presentes[0] : null;
}
/** Regras de "opções por palavra" de um documento: documentos[].opcoesPorPalavra = [{ campo, opcoes: { valor: [expressões] },
 *  soMarcada? }]. O formato antigo da CAT (tipoCatPalavras) continua valendo para o campo tipoCat. */
export function regrasDeOpcoes(docRule) {
  const l = [...(docRule?.opcoesPorPalavra || [])];
  if (docRule?.tipoCatPalavras && !l.some(o => o.campo === 'tipoCat')) l.push({ campo: 'tipoCat', opcoes: docRule.tipoCatPalavras });
  return l;
}
/** Valor de uma opção pelas expressões do documento (sempre a expressão inteira: "dispensar" não casa "dispensa do aviso").
 *  Formulário impresso com todas as opções: só vale a marcada. soMarcada: só com marca ("( X ) Abono pecuniário"). */
export function opcaoPorPalavra(text, regra) {
  const T = ' ' + norm(text) + ' ';
  const tem = (w) => { const W = norm(w); return !!W && T.includes(' ' + W + ' '); };
  const cands = Object.entries(regra?.opcoes || {}).filter(([k, ws]) => !k.startsWith('_') && Array.isArray(ws) && ws.some(tem));
  if (!cands.length) return null;
  if (cands.length === 1 && !regra.soMarcada) return cands[0][0];
  const marcada = opcaoMarcada(text, cands.flatMap(([, ws]) => ws.filter(tem)), { exigeMarca: !!regra.soMarcada });
  const dono = marcada && cands.find(([, ws]) => ws.some(w => norm(w) === norm(marcada)));
  return dono ? dono[0] : null;
}
export const ASO_TIPOS = ['admissional', 'demissional', 'periodico', 'retorno ao trabalho', 'mudanca de funcao'];
export const ASO_PISTAS = ['data do exame', 'data de realização', 'data da realização', 'realizado em', 'data do aso', 'data de emissão', 'data:'];
/** ASO: resultado, tipo de exame marcado e data do exame — pela pista (documentos[].pistasData: "data do exame",
 *  "realizado em", "Data:"); sem pista, a da linha "Cidade/UF, dd/mm/aaaa"; senão a última do texto (nunca nascimento/admissão). */
export function readASO(text, docRule = null) {
  const t = plain(text);
  const resultado = opcaoMarcada(t, ['inapto', 'apto']);
  const tipo = opcaoMarcada(t, ASO_TIPOS);
  const T = String(text || '').normalize('NFC');
  const RXD = /(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4})/;
  let data = null;
  for (const p of docRule?.pistasData || ASO_PISTAS) {
    const P = plain(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    const m = plain(T).match(new RegExp(`(?<![a-z])${P}`)); if (!m) continue;
    const resto = T.slice(m.index + m[0].length, m.index + m[0].length + 40).split('\n')[0];
    const d = resto.match(RXD); const dt = d && dataValida(+d[3], +d[2] - 1, +d[1]);
    if (dt) { data = fmtDate(dt); break; }
  }
  if (!data) {
    const local = T.match(/[A-Za-zÀ-ú .'-]{3,}\/[A-Z]{2}\s*,\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (local && parseDate(local[1])) data = fmtDate(parseDate(local[1]));
  }
  if (!data) {
    // a última data que não é de nascimento nem de admissão
    const linhas = T.split(/\n/).filter(l => !/nasc|admiss/i.test(plain(l)));
    const datas = findDates(linhas.join('\n')); data = datas.length ? fmtDate(datas[datas.length - 1]) : null;
  }
  return { resultado: resultado ? resultado.toUpperCase() : null, tipo, data };
}
/** Uma linha que resume o que foi entendido do documento (aparece embaixo do arquivo). */
export function summarizeDocument(analise, text) {
  const id = analise?.documento?.id; const c = analise?.campos || {}; const v = (k) => c[k]?.valor;
  if (id === 'atestado') return [v('empregado') || (analise.paciente && `paciente: ${analise.paciente}`), v('dias') && `${v('dias')} ${+v('dias') === 1 ? 'dia' : 'dias'}`, v('dataAfastamento') && `a partir de ${v('dataAfastamento')}`].filter(Boolean).join(' · ');
  if (id === 'aso') { const a = readASO(text); return ['ASO', a.tipo, a.resultado, a.data].filter(Boolean).join(' · '); }
  if (id === 'cat') return ['CAT', v('numeroCat'), v('dataAfastamento') && `acidente em ${v('dataAfastamento')}`].filter(Boolean).join(' · ');
  if (id === 'pedidoDemissao') return ['Pedido de demissão', v('empregado'), v('dataAviso')].filter(Boolean).join(' · ');
  if (id === 'comprovanteEndereco') { const a = extractAddress(text); return [a.endereco && `${a.endereco}, ${a.numero || ''}`, a.cep].filter(Boolean).join(' · '); }
  if (id === 'fichaAdmissao') return [v('nome'), v('cpf')].filter(Boolean).join(' · ');
  return '';
}
