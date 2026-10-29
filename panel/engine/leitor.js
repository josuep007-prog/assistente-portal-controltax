// Motor de regras — Leitor de documentos: classificação, extração por rótulos, confiança, certidões e uma pessoa por documento.
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { NAO_NOME, avisosDoDocumento, empregadoPorNome, lerAtestado, semOutrasPessoas } from './atestado.js';
import { diffDays, fmtCEP, fmtCPF, fmtDate, norm, onlyDigits, parseDate, today, validCPF, validEmail, validPIS } from './base.js';
import { docsNeutros } from './lote.js';
import { inferTipoAfastamento, renderFirst, renderTemplate } from './modelos.js';
import { bestMatch, findEmployeeInText, similarity } from './nomes.js';
import { avisoComprovante, diasExperiencia, lerDocumentoPessoal, lerEndereco, opcaoPorPalavra, readASO, regrasDeOpcoes, separarEndereco, separarRg, separarUf, simNao, titularComprovante } from './pessoal.js';
import { assuntoGeral } from './planilhas.js';
import { temAviso } from './prazos.js';
import { casaRadical, motivoRescisao, plain } from './textolivre.js';
import { resolveTipo } from './tipos.js';

/* ---------------- Documentos ---------------- */
export function classifyDocument(text, rules) {
  const T = norm(text);
  const out = [];
  for (const d of rules.documentos || []) {
    let hits = 0; const found = [];
    for (const p of d.palavras || []) { const P = norm(p); if (P && (' ' + T + ' ').includes(' ' + P + ' ')) { hits++; found.push(p); } }
    let strong = 0; for (const f of d.forte || []) if (T.includes(norm(f))) strong++;
    if (hits >= (d.minPalavras || 1) || strong) {
      const bruto = (hits / Math.max(3, (d.palavras || []).length * 0.6)) + strong * 0.5;
      // palavras que derrubam a nota (ex.: "TRCT" num aviso de rescisão)
      const contra = (d.negativas || []).filter(x => T.includes(norm(x))).length;
      out.push({ id: d.id, nome: d.nome, tipoSolicitacao: d.tipoSolicitacao, score: Math.min(1, Math.max(0, bruto - contra * 0.5)), bruto: bruto - contra * 0.5, found });
    }
  }
  return out.sort((a, b) => b.bruto - a.bruto);
}

/* ---------------- Leitor: confiança, âncoras e formatos (regras: config.leitor) ---------------- */
/* Precisão acima de tudo: valor com confiança abaixo do limiar não vai ao portal sozinho (vira sugestão de um clique);
   valor sem âncora (1º CPF/CEP/e-mail do texto, "Data:" genérico) fica abaixo do limiar; a qualidade do OCR põe um teto. */
export const LEITOR_PADRAO = {
  confiancaMinimaPortal: 0.6, semAncora: 0.5,
  ocrBaixo: 75, ocrTetoBaixo: 0.55, ocrTetoNomes: 85, ocrRuim: 45,
  contextoCpfDescarta: ['registro', 'renach', 'inscri[cç][aã]o', 'pis', 'pasep', 'nis', 'nit', 'cns', 'cart[aã]o sus', 'matr[ií]cula', 'protocolo', 'espelho', 'c[oó]digo', 'c[oô]njuge', 'dependente', 'respons[aá]vel', 'genitor', 'm[aã]e', 'pai', 'cnpj', 'empregador', 'empresa'],
  formatos: {
    cpf: '^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$', cep: '^\\d{5}-?\\d{3}$', pis: '^[\\d.\\-]{11,14}$',
    rg: '^(?:[A-Z]{2}[\\s\\-]?)?(?:\\d{1,2}\\.?\\d{3}\\.?\\d{3}(?:-?[\\dXx])?|\\d{5,14}(?:-?[\\dXx])?)$',
    agencia: '^\\d{3,5}(?:-?[\\dXx])?$', conta: '^\\d{1,13}(?:-?[\\dXx]{1,2})?$',
    telefone: '^\\(?\\d{2}\\)?\\s?\\d{4,5}-?\\d{4}$', numero: '^(?:\\d{1,6}[A-Za-z]?|S\\/?N)$',
    ctpsNumero: '^\\d{4,8}$', ctpsSerie: '^\\d{3,5}(?:-?[A-Z]{2})?$', titulo: '^\\d{12}$', zona: '^\\d{1,4}$', secao: '^\\d{1,4}$', cnh: '^\\d{9,11}$'
  },
  tiposComNome: ['nome', 'mae', 'pai', 'conjuge', 'nomeSocial']
};
export const cfgLeitor = (rules) => ({ ...LEITOR_PADRAO, ...(rules?.config?.leitor || {}), formatos: { ...LEITOR_PADRAO.formatos, ...(rules?.config?.leitor?.formatos || {}) } });
/** Confiança mínima para um valor lido ir ao portal sem o cliente confirmar. */
export const limiarPortal = (rules) => cfgLeitor(rules).confiancaMinimaPortal;

/** O valor tem o formato do campo? (e-mail, CEP, CPF, PIS, RG, agência, conta, telefone, número, datas, nomes e listas
 *  com valoresAceitos). Devolve { ok, valor } — valor corrigido quando a lista das regras tem uma opção quase igual. */
export function validarValor(k, def, valor, rules) {
  const v = String(valor ?? '').trim(); if (!v) return { ok: false };
  const L = cfgLeitor(rules); const tp = def?.tipo;
  const casa = (rx) => { try { return new RegExp(rx, 'i').test(v); } catch { return true; } };
  if (tp === 'email' || k === 'email') return { ok: validEmail(v) };
  if (tp === 'cpf' || k === 'cpf') return { ok: validCPF(v) };
  if (tp === 'pis' || k === 'pis') return { ok: validPIS(v) };
  if (tp === 'cep' || k === 'cep') return { ok: onlyDigits(v).length === 8 && casa(L.formatos.cep) };
  if (tp === 'data') return { ok: !!parseDate(v) };
  if (tp === 'telefone' || k === 'telefone') { const d = onlyDigits(v).length; return { ok: d >= 10 && d <= 11 }; }
  if (L.formatos[k]) return { ok: casa(L.formatos[k]) };
  if (L.tiposComNome.includes(k)) return { ok: !/\d/.test(v) && /\p{L}{2}/u.test(v) && !/[=:;|@#$%&*_<>]/.test(v) };
  if (def?.seletores && Object.keys(def.seletores).length) return { ok: Object.keys(def.seletores).some(o => norm(o) === norm(v)) };
  const aceitos = def?.valoresAceitos;
  if (Array.isArray(aceitos) && aceitos.length) {
    const N = norm(v);
    const exato = aceitos.find(o => norm(o) === N || norm(o).replace(/\s*\(.*?\)/g, '') === N || casaRadical(N.toLowerCase(), norm(o).toLowerCase().split(' ')[0]));
    if (exato) return { ok: true };
    const quase = bestMatch(v, aceitos, 0.72);
    return quase ? { ok: false, valor: quase.option } : { ok: false };
  }
  // lista sem opções conhecidas: texto com sobra de OCR ("Sotteira =") não serve
  if (tp === 'combo' || tp === 'radio') return { ok: !/[=|_<>{}\[\]#]/.test(v) && /\p{L}/u.test(v) };
  return { ok: true };
}

/** Extração genérica "Rótulo: valor" usando os sinônimos dos campos.
 *  O valor vai até: 2+ espaços, " | ", " = ", fim da linha ou o início de outro rótulo conhecido ("… Bairro: …",
 *  também sem acento, como o OCR lê). Sinônimos genéricos só valem nos documentos de campos[].sinonimosSoEm
 *  ({ "sinônimo": ["docId", …, "texto" = texto colado sem documento] }). */
export function extractByLabels(text, campos, opts = {}) {
  const docId = opts.docId ?? null;
  const lines = String(text || '').normalize('NFC').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const escRx = (x) => plain(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const synsDe = (def) => [...(def.sinonimos || []), ...Object.entries(def.sinonimosSoEm || {}).filter(([, docs]) => [].concat(docs || []).includes(docId || 'texto')).map(([s]) => s)];
  const allSyns = [...new Set(Object.values(campos || {}).flatMap(d => [...(d.sinonimos || []), ...Object.keys(d.sinonimosSoEm || {})]))].sort((a, b) => b.length - a.length);
  const nextLabel = allSyns.length ? new RegExp(`\\s+(?:${allSyns.map(escRx).join('|')})\\s*[:\\-–=]\\s`) : null;
  const out = {};
  for (const [key, def] of Object.entries(campos || {})) {
    const syns = synsDe(def).slice().sort((a, b) => b.length - a.length);
    for (const syn of syns) {
      // ":" "-" "=" separam rótulo e valor; "." (o OCR troca ":" por ".") só com o rótulo no começo da linha ou de uma coluna
      const re = new RegExp(`(?:(?:^|\\s{2,}|\\|\\s*)${escRx(syn)}\\s*[:\\-–=.]|(?:^|\\s|\\|)${escRx(syn)}\\s*[:\\-–=])\\s*(.{1,160}?)(?=\\s{2,}|\\s\\|\\s|$)`);
      for (const l of lines) {
        const lp = plain(l);                 // mesma posição de cada letra (texto em NFC), sem acentos e em minúsculas
        const m = lp.match(re);
        if (!m || !m[1]) continue;
        const ini = m.index + m[0].length - m[1].length;
        let v = l.slice(ini, ini + m[1].length).trim(); let vp = lp.slice(ini, ini + m[1].length).trim();
        if (nextLabel) { const cut = (' ' + vp).search(nextLabel); if (cut > 0) { v = v.slice(0, cut - 1).trim(); vp = vp.slice(0, cut - 1).trim(); } }
        // " = " e "—" separam colunas no OCR; aspas e símbolos soltos no fim são sobra da leitura
        v = v.split(/\s+[=—]\s*|\s*=\s+/)[0].replace(/(?<=\d)["“”'`´|=]+\S*$/, '').replace(/[;,]$/, '').trim();
        if (v) { out[key] = { valor: v, fonte: syn, conf: 0.75, linha: l, ancora: true }; break; }
      }
      if (out[key]) break;
    }
  }
  return out;
}
export const RX = {
  // CPF com os grupos separados por espaço ou vírgula (OCR: "000 .123.407-23", "000,123.407-23")
  cpf: /(?<![\d.,])(\d{3}(?:\s?[.,]\s?)?\d{3}(?:\s?[.,]\s?)?\d{3}(?:\s?[-–]\s?)?\d{2})(?![\d])/g,
  pis: /\b(\d{3}\.?\d{5}\.?\d{2}-?\d)\b/g,
  cep: /\b(\d{5}-?\d{3})\b/,
  email: /\b([\w.+-]+@[\w-]+\.[\w.-]+)\b/,
  tel: /(\(?\d{2}\)?\s?9?\d{4}-?\d{4})/,
  data: /\b(\d{2}\/\d{2}\/\d{4})\b/g
};
/** O número está junto de qual rótulo? 'sim' (o rótulo do campo é o mais perto, na linha ou na de cima),
 *  'outro' (o mais perto é registro/RENACH/inscrição/PIS/CNS…), null (nenhum rótulo). */
export function rotuloPerto(text, idx, rotulo, descarta) {
  const ini = text.lastIndexOf('\n', idx - 1) + 1;
  const antes = plain(text.slice(Math.max(ini, idx - 60), idx));
  const ultimo = (rx) => { let p = -1; for (const m of antes.matchAll(new RegExp(`(?<![a-z])(?:${rx})(?![a-z])`, 'g'))) p = m.index; return p; };
  const pR = ultimo(rotulo), pD = descarta.length ? ultimo(descarta.join('|')) : -1;
  if (pR >= 0 || pD >= 0) return pR > pD ? 'sim' : 'outro';
  // rótulo na linha de cima (RG, CNH, CIN: "CPF   DATA NASCIMENTO" e o valor embaixo)
  if (antes.trim()) return null;
  const fimAnt = ini - 1; if (fimAnt <= 0) return null;
  const linhaAnt = plain(text.slice(text.lastIndexOf('\n', fimAnt - 1) + 1, fimAnt));
  const temR = new RegExp(`(?<![a-z])(?:${rotulo})(?![a-z])`).test(linhaAnt);
  const temD = descarta.length && new RegExp(`(?<![a-z])(?:${descarta.join('|')})(?![a-z])`).test(linhaAnt);
  return temR && !temD ? 'sim' : temD && !temR ? 'outro' : null;
}
export function extractGeneric(text, rules) {
  const out = {}; const T = String(text || '').normalize('NFC');
  const L = cfgLeitor(rules);
  // CPF: o que está junto do rótulo "CPF" vale; perto de registro/RENACH/inscrição/PIS/CNS é outro número; sem rótulo fica para conferir
  const cpfs = [];
  for (const m of T.matchAll(RX.cpf)) {
    const d = onlyDigits(m[1]); if (d.length !== 11 || !validCPF(d)) continue;
    const r = rotuloPerto(T, m.index, 'cpf|c\\.p\\.f\\.?', L.contextoCpfDescarta);
    if (r !== 'outro') cpfs.push({ d, ancora: r === 'sim' });
  }
  const cpf = cpfs.find(c => c.ancora) || cpfs[0];
  if (cpf) out.cpf = cpf.ancora ? { valor: fmtCPF(cpf.d), conf: 0.95, fonte: 'CPF junto do rótulo', ancora: true, validado: true } : { valor: fmtCPF(cpf.d), conf: Math.min(0.5, L.semAncora), fonte: 'CPF no texto (sem rótulo)' };
  const pis = [];
  for (const m of T.matchAll(RX.pis)) {
    if (!validPIS(m[1]) || cpfs.some(c => c.d === onlyDigits(m[1]))) continue;
    pis.push({ v: m[1], ancora: rotuloPerto(T, m.index, 'pis|pasep|nis|nit|pis\\/pasep', []) === 'sim' });
  }
  const p1 = pis.find(p => p.ancora) || pis[0];
  if (p1) out.pis = p1.ancora ? { valor: p1.v, conf: 0.8, fonte: 'PIS junto do rótulo', ancora: true, validado: true } : { valor: p1.v, conf: L.semAncora, fonte: 'PIS no texto (sem rótulo)' };
  // CEP sem o bloco do endereço não diz de quem é (pode ser da empresa ou da clínica): fica baixo, o leitor de endereço decide
  const cep = T.match(RX.cep); if (cep) out.cep = { valor: fmtCEP(cep[1]), conf: 0.4, fonte: 'CEP no texto' };
  const em = T.match(RX.email);
  if (em) { const ancora = /e-?mail\s*:?\s*$/i.test(T.slice(Math.max(0, em.index - 20), em.index)); out.email = { valor: em[1], conf: ancora ? 0.8 : L.semAncora, fonte: ancora ? 'e-mail junto do rótulo' : 'e-mail no texto (sem rótulo)', ancora, validado: true }; }
  return out;
}
export function runPatterns(text, patterns) {
  for (const p of patterns || []) {
    try { const m = String(text).match(new RegExp(p, 'i')); if (m) return (m[1] ?? m[0]).trim(); } catch { /* regex inválida nas regras */ }
  }
  return null;
}

/**
 * Lê um texto e devolve: documento provável, tipo de solicitação sugerido e campos.
 * ctx = { employees: [...], tipoAtual: 'afastamento' | null, hoje, confiancaOcr: 0–100 | null, metodo: 'ocr' | 'pdf-texto' | … }
 * Cada campo traz { valor, conf, fonte } e, quando vale, ancora (junto do rótulo/frase) e validado (formato conferido).
 * Abaixo de config.leitor.confiancaMinimaPortal o valor é só sugestão: o painel não o manda ao portal sem o cliente usar.
 */
export function analyzeText(text, rules, ctx = {}) {
  const docs = classifyDocument(text, rules);
  const doc = docs[0] || null;
  const docRule = doc ? rules.documentos.find(d => d.id === doc.id) : null;
  let tipoKey = ctx.tipoAtual || doc?.tipoSolicitacao || null;
  if (!ctx.tipoAtual && doc?.id === 'atestado') tipoKey = rules.config?.atestadoAte15DiasVaiPara || 'afastamento';
  // ASO sozinho: o tipo de exame marcado diz o pedido (documentos[].tipoPorExame: admissional → cadastro, demissional → cálculo da rescisão)
  const exameAso = docRule?.tipoPorExame ? readASO(text, docRule).tipo : null;
  if (!ctx.tipoAtual && exameAso && typeof docRule.tipoPorExame[exameAso] === 'string') tipoKey = docRule.tipoPorExame[exameAso];
  const tipo = tipoKey ? resolveTipo(rules, tipoKey) : null;
  const LC = cfgLeitor(rules);
  const campos = {};
  const put = (k, v, conf, fonte, extra = {}) => { if (v == null || v === '') return; if (!campos[k] || campos[k].conf < conf) campos[k] = { valor: v, conf, fonte, ...extra }; };
  // documento de outro pedido (ex.: pedido de demissão aberto num afastamento): os rótulos do tipo não valem nele
  const outraFamilia = !!(ctx.tipoAtual && docRule?.tipoSolicitacao && docRule.tipoSolicitacao !== ctx.tipoAtual && !FAMILIAS_PEDIDO.some(f => f.includes(docRule.tipoSolicitacao) && f.includes(ctx.tipoAtual)));

  const rotulados = tipo && !outraFamilia ? extractByLabels(text, tipo.campos, { docId: docRule?.id || null }) : {};
  for (const [k, v] of Object.entries(rotulados)) put(k, v.valor, v.conf, v.fonte, { ancora: true });
  for (const [k, v] of Object.entries(extractGeneric(text, rules))) if (!tipo || tipo.campos[k]) put(k, v.valor, v.conf, v.fonte, { ancora: !!v.ancora, validado: !!v.validado });
  // documento pessoal (RG, CNH, CIN, CTPS digital, título): rótulo numa linha, valor na de baixo
  const pessoal = docRule?.leitor === 'pessoal' && tipo ? lerDocumentoPessoal(text, rules.config?.leitorPessoal, docRule.id) : null;
  if (pessoal) for (const [k, v] of Object.entries(pessoal.campos)) if (tipo.campos[k]) put(k, v.valor, v.conf, v.fonte, { ancora: true });
  // leitor próprio do documento (atestado): lê dias, data, CID, médico e paciente com mais cuidado
  const usaLeitor = docRule ? (docRule.leitor || (docRule.id === 'atestado' ? 'atestado' : null)) === 'atestado' : tipoKey === 'afastamento';
  const leitor = usaLeitor ? lerAtestado(text, ctx.hoje || today()) : null;
  if (leitor) {
    const cite = (x) => x?.trecho ? `“${x.trecho}”` : (docRule?.nome || 'documento');
    if (leitor.dias) put('dias', String(leitor.dias.n), leitor.dias.conf, cite(leitor.dias), { ancora: true, validado: leitor.dias.conf >= 0.9 });
    if (leitor.data) put('dataAfastamento', leitor.data.data, leitor.data.conf, cite(leitor.data), { ancora: leitor.data.conf >= 0.75, validado: leitor.data.conf >= 0.75 });
    if (leitor.cid) put('cid', leitor.cid, 0.7, docRule?.nome || 'documento', { ancora: true });
    if (leitor.medico) put('medico', leitor.medico, 0.7, docRule?.nome || 'documento', { ancora: true });
  } else if (docRule?.extrair) for (const [k, pats] of Object.entries(docRule.extrair)) { const v = runPatterns(text, pats); if (v) put(k, v.replace(/\s+/g, ' '), 0.7, docRule.nome, { ancora: true }); }
  if (docRule?.valores) for (const [k, v] of Object.entries(docRule.valores)) if (!k.startsWith('tipoAfastamentoSe') && !(k === 'tipoAfastamento' && tipo?.tipoAfastamentoAuto)) put(k, v, 0.65, docRule.nome);
  // Solicitação Geral (alvará, CND…): departamento e assunto pelo catálogo; a descrição só do modelo do item
  if (tipoKey === 'geral' && docRule) {
    const g = assuntoGeral(text, rules, { docId: docRule.id, hoje: ctx.hoje || today() });
    if (g) { put('departamento', g.departamento, 0.65, docRule.nome); put('assunto', g.assunto, 0.65, docRule.nome); if (g.descricao) put('descricao', g.descricao, 0.5, 'modelo do escritório'); }
  }
  // opções escolhidas por palavras do documento (documentos[].opcoesPorPalavra; tipoCatPalavras é o formato antigo da CAT)
  for (const o of regrasDeOpcoes(docRule)) { const v = opcaoPorPalavra(text, o); if (v) put(o.campo, v, 0.6, docRule.nome); }
  // motivo da rescisão pela tabela das regras (config.motivoAuto): "término do contrato de experiência" no documento
  const avisosMotivo = [];
  if (tipo?.campos?.motivo && rules.config?.motivoAuto && docRule) {
    const m = motivoRescisao(text, rules, { docId: docRule.id, soAuto: true });
    if (m?.nenhum) { delete campos.motivo; if (m.dica) avisosMotivo.push({ nivel: 'atencao', id: 'motivo', mensagem: m.dica }); }
    else if (m?.valor) { put('motivo', m.valor, 0.7, docRule.nome); if (m.dadoPor) put('avisoDadoPor', m.dadoPor, 0.7, docRule.nome); }
  }
  // campos do pedido irmão: "dataAviso" lido vale como "Data do aviso prévio" no cálculo (campos[].tambem);
  // dias de abono → abono SIM/NÃO (campos[].porNumero); fim do gozo → dias de gozo
  if (tipo) {
    for (const [k, def] of Object.entries(tipo.campos)) {
      if (!campos[k]) for (const a of def.tambem || []) if (campos[a]) { campos[k] = { ...campos[a] }; break; }
      const pn = def.porNumero;
      if (pn && campos[pn.campo]) { const n = parseInt(onlyDigits(campos[pn.campo].valor), 10); if (!isNaN(n)) put(k, n > 0 ? pn.maiorQueZero : pn.zero, 0.65, campos[pn.campo].fonte); }
    }
    if (tipo.campos.diasGozo && !campos.diasGozo && campos.inicioGozo && campos.fimGozo) {
      const a = parseDate(campos.inicioGozo.valor), b = parseDate(campos.fimGozo.valor);
      if (a && b && b >= a && diffDays(a, b) < 31) put('diasGozo', String(diffDays(a, b) + 1), 0.65, campos.fimGozo.fonte);
    }
  }
  // endereço: só de documentos que podem trazê-lo (documentos[].endereco: comprovante e ficha) ou de um texto sem documento;
  // no comprovante, só o bloco do titular (o da empresa emissora fica de fora); as linhas que já viraram outros campos não entram
  const titular = doc?.id === 'comprovanteEndereco' ? titularComprovante(text) : null;
  let bairroDuvida = false;
  if (tipo?.campos?.cep) {
    const ADDR = ['cep', 'endereco', 'numero', 'complemento', 'bairro', 'municipio', 'uf'];
    if (!docRule || docRule.endereco) {
      const ender = rotulados.endereco ? separarEndereco(rotulados.endereco.valor) : {};
      if (ender.endereco) { campos.endereco.valor = ender.endereco; for (const k of ['numero', 'complemento', 'bairro', 'municipio', 'uf']) if (ender[k] && tipo.campos[k] && !rotulados[k]) put(k, ender[k], 0.7, rotulados.endereco.fonte, { ancora: true }); }
      if (campos.cep && !rotulados.cep) delete campos.cep;     // o 1º CEP do texto pode ser da empresa: vale o do bloco escolhido
      const le = lerEndereco(text, rules, { docId: docRule?.id || null, titular });
      if (le) {
        bairroDuvida = le.bairroDuvida;
        // com rótulos (ficha), o leitor de blocos só completa; sem o bloco do titular, nada passa do limiar
        const conf = docRule?.id === 'comprovanteEndereco' ? le.conf : Math.min(le.conf, 0.45);
        for (const [k, v] of Object.entries(le.campos)) if (tipo.campos[k] && !rotulados[k]) put(k, v, k === 'bairro' && le.bairroDuvida ? Math.min(conf, 0.45) : conf, le.fonte, { ancora: conf >= 0.6 });
      }
    } else for (const k of ADDR) if (campos[k] && !rotulados[k]) delete campos[k];
  }
  for (const k of docRule?.naoPreenche || []) delete campos[k];
  // datas extraídas: normaliza
  for (const [k, c] of Object.entries(campos)) {
    const def = tipo?.campos?.[k];
    const junto = (alvo, v) => { if (v && tipo.campos[alvo] && (!campos[alvo] || campos[alvo].conf < c.conf)) campos[alvo] = { valor: v, conf: c.conf, fonte: c.fonte, ancora: c.ancora }; };
    // "Vitória/ES" → município e UF; "1234567 SSP/ES" → RG, órgão e UF; "45 + 45" → experiência e prorrogação (regras: separaUf, separaOrgaoUf, prorrogacaoEm)
    if (def?.separaOrgaoUf) { const r = separarRg(c.valor); if (r) { c.valor = r.numero; junto(def.separaOrgaoUf[0], r.orgao); junto(def.separaOrgaoUf[1], r.uf); } }
    if (def?.separaUf) { const u = separarUf(c.valor); if (u) { c.valor = u.antes; junto(def.separaUf, u.uf); } }
    if (def?.prorrogacaoEm) { const d = diasExperiencia(c.valor); if (d[1] != null) junto(def.prorrogacaoEm, String(d[1])); }
    if (def?.tipo === 'data') {
      // "01/11/2026 a 31/10/2027" (vigência do estágio), "03/11/2026 por 30 dias": vale a primeira data
      const d = parseDate(c.valor) || parseDate(String(c.valor).match(/\d{1,2}\s?[\/.\-]\s?\d{1,2}\s?[\/.\-]\s?\d{2,4}/)?.[0]?.replace(/\s/g, ''));
      if (d) c.valor = fmtDate(d); else delete campos[k];
    }
    if (def?.tipo === 'numero') { const m = String(c.valor).match(/\d[\d.]*/); const n = m ? parseInt(onlyDigits(m[0]), 10) : NaN; if (isNaN(n)) delete campos[k]; else c.valor = String(n); }
    if (def?.tipo === 'cpf' && c.valor) c.valor = fmtCPF(c.valor);
    // nome com sobra do OCR no fim ("MARTA LUCIA PRADO í", "ANA SOUZA |"): tira a sobra
    if (LC.tiposComNome.includes(k)) c.valor = String(c.valor).replace(/(?:\s+(?:\p{Ll}|[^\p{L}\s]+))+$/u, '').trim();
    if (def?.tipo === 'radio' && def.seletores?.['Sim'] && def.seletores?.['Não']) { const v = simNao(c.valor) || def.outroTextoVira || null; if (v) c.valor = v; else delete campos[k]; }
    else if (def?.tipo === 'radio' && def.seletores) { const ops = Object.keys(def.seletores).filter(o => norm(o).startsWith(norm(c.valor)) && norm(c.valor)); if (ops.length === 1) c.valor = ops[0]; }
  }
  // afastamento: o tipo do portal sai do conteúdo do documento e da quantidade de dias
  if (tipo?.campos?.tipoAfastamento && tipo.tipoAfastamentoAuto) {
    const ta = inferTipoAfastamento(text, campos.dias?.valor, doc?.id, tipo.tipoAfastamentoAuto);
    if (ta) put('tipoAfastamento', ta.valor, 0.7, ta.motivo);
  }
  // certidão (documentos[].leitor = "certidao"): só o que ela diz sobre o funcionário — casamento marca o estado civil e o cônjuge;
  // nascimento sugere dependentes (cadastro) ou a data como início para conferir (afastamento). Os dados do registrado não entram.
  const avisosExtra = [];
  const certidao = docRule?.leitor === 'certidao' && tipo ? lerCertidao(text) : null;
  if (certidao) {
    for (const k of Object.keys(campos)) delete campos[k];
    const fonteC = certidao.tipo === 'casamento' ? 'certidão de casamento' : 'certidão de nascimento';
    if (certidao.tipo === 'casamento') {
      if (tipo.campos.estadoCivil) put('estadoCivil', docRule.estadoCivilCasamento || 'Casado', 0.65, fonteC);
      const nomes = certidao.nomes || [];
      const i = ctx.nome && nomes.length === 2 ? nomes.findIndex(n => mesmaPessoa({ nome: n }, { nome: ctx.nome }) === true) : -1;
      if (tipo.campos.conjuge && i >= 0) put('conjuge', nomes[1 - i], 0.7, fonteC, { ancora: true });
      else if (tipo.campos.conjuge && nomes.length === 2) avisosExtra.push({ nivel: 'info', id: 'conjuge', mensagem: (rules.mensagens?.certidaoConjuge || 'Na certidão de casamento li {a} e {b}. Quando o nome do funcionário estiver no cadastro, eu marco o outro como cônjuge — ou escreva o nome do cônjuge.').replace('{a}', nomes[0]).replace('{b}', nomes[1]) });
    } else if (certidao.tipo === 'nascimento') {
      if (tipo.campos.possuiDependentes) {
        put('possuiDependentes', 'Sim', 0.5, `${fonteC} (confira)`);
        if (certidao.registrado) avisosExtra.push({ nivel: 'info', id: 'dependente', mensagem: (rules.mensagens?.certidaoDependente || 'Certidão de nascimento de {nome}{data}: se for filho(a) do funcionário, marque “Possui dependentes” — o escritório cadastra o dependente.').replace('{nome}', certidao.registrado).replace('{data}', certidao.data ? ` (nascido em ${certidao.data})` : '') });
      }
      if (tipo.campos.dataAfastamento && certidao.data) put('dataAfastamento', certidao.data, 0.5, `data de nascimento na ${fonteC} (confira)`);
    }
  }
  // funcionário
  let candidatos = null; let pacienteOutro = false;
  if (tipo?.campos?.empregado && ctx.employees?.length) {
    const pac = leitor?.paciente;
    const pm = pac ? empregadoPorNome(pac.nome, ctx.employees) : null;
    if (pm?.option && pm.contradiz) {
      // "MARIA EDUARDA" no atestado e "MARIA APARECIDA" na lista: pode ser de uma filha — o cliente confere
      put('empregado', pm.option, 0.45, `“${pac.trecho}”`);
      pacienteOutro = true;
      avisosExtra.push({ nivel: 'atencao', id: 'outroNome', mensagem: (rules.mensagens?.documentoOutroNome || 'O documento está em nome de {nome}, que não é exatamente {funcionario}. Confira se é do funcionário (pode ser de um dependente).').replaceAll('{nome}', pac.nome).replaceAll('{funcionario}', pm.option) });
    } else if (pm?.option) put('empregado', pm.option, Math.min(pm.score, pac.conf + 0.15), `“${pac.trecho}”`, { ancora: true, validado: pm.score >= 0.9 });
    else if (pm?.candidatos) candidatos = pm.candidatos;
    else {
      const m = findEmployeeInText(leitor ? semOutrasPessoas(text) : text, ctx.employees, { soPrimeiroNome: !leitor && !doc });
      const outroNome = pac && pac.nome.split(' ').length >= 2;
      if (m?.candidatos) candidatos = m.candidatos;       // empate: o cliente escolhe
      else if (m && outroNome) {
        put('empregado', m.option, Math.min(m.score, 0.45), `sobrenome igual ao de “${pac.nome}”`);
        pacienteOutro = true;
        avisosExtra.push({ nivel: 'atencao', id: 'outroNome', mensagem: `O atestado está em nome de ${pac.nome}, que não é exatamente ${m.option}. Confira se é do funcionário (pode ser de um dependente).` });
      } else if (m) put('empregado', m.option, m.score, 'nome encontrado no documento', { validado: m.score >= 0.95 });
    }
  }
  // funcionário pelo CPF do documento: o painel perguntou à aba do portal de quem é cada CPF (ctx.cpfNomes = { cpf: nome | null };
  // ctx.cpfListaTemCpf: a lista traz CPF). O nome achado pelo CPF vale mais que o nome lido e resolve o "Qual deles?".
  if (tipo?.campos?.empregado && ctx.cpfNomes && ctx.employees?.length) {
    const doc_ = cpfsDoTexto(text, rules);
    const achados = doc_.map(c => ({ ...c, nome: ctx.cpfNomes[c.cpf] })).filter(c => c.nome && ctx.employees.some(e => norm(e) === norm(c.nome)));
    const nomes = [...new Set(achados.map(c => norm(c.nome)))];
    if (nomes.length === 1) {
      const c = achados.find(x => x.ancora) || achados[0];
      campos.empregado = { valor: ctx.employees.find(e => norm(e) === norm(c.nome)), conf: c.ancora ? 0.97 : Math.min(0.55, LC.semAncora), fonte: 'CPF do documento', ancora: c.ancora, validado: true };
      candidatos = null;
    } else if (!nomes.length && ctx.cpfListaTemCpf && doc_.length && pacienteOutro) {
      avisosExtra.push({ nivel: 'atencao', id: 'cpfOutraPessoa', mensagem: (rules.mensagens?.cpfDeOutraPessoa || 'O CPF do documento ({cpf}) não é de nenhum funcionário da lista — pode ser de um dependente. Confira de quem é o documento.').replace('{cpf}', fmtCPF(doc_[0].cpf)) });
    }
  }
  // atestado de outra pessoa (dependente): o tipo de afastamento fica com o cliente
  if (pacienteOutro && campos.tipoAfastamento) delete campos.tipoAfastamento;
  if (tipo?.campos?.nome && !campos.nome && !(docRule?.naoPreenche || []).includes('nome')) {
    // na mesma linha do rótulo (o nome da linha de baixo é do leitor de documento pessoal)
    const m = String(text).match(/(?:nome|paciente|portador|titular)[ \t]*[:\-]?[ \t]*([A-ZÀ-Ú][A-ZÀ-Ú \t]{8,60})(?=\n|\s{2,}|$)/);
    if (m) put('nome', m[1].trim(), 0.5, 'nome em maiúsculas');
  }
  // motivo sem aviso prévio (término da experiência, justa causa): o cálculo não leva data nem tipo de aviso
  if (tipo?.campos?.tipoAviso && campos.motivo && !temAviso({ motivo: campos.motivo.valor }, rules)) { delete campos.tipoAviso; delete campos.dataAvisoPrevio; }
  // comprovante em nome de outra pessoa (a tela compara com o nome do cadastro) e filiação para confirmar
  const avComp = avisoComprovante(titular, ctx.nome, rules);
  if (avComp) avisosExtra.push(avComp);
  if (pessoal?.filiacao?.length === 2 && tipo?.campos?.mae && campos.mae) {
    const outro = pessoal.filiacao.find(x => x !== campos.mae.valor) || '';
    avisosExtra.push({ nivel: 'atencao', id: 'filiacao', mensagem: (rules.mensagens?.filiacaoConfira || 'Na filiação do documento li “{mae}” e “{outro}”. Coloquei “{mae}” como mãe — confira.').replaceAll('{mae}', campos.mae.valor).replaceAll('{outro}', outro) });
  }
  // documento que só pode trazer alguns campos (documentos[].preencheSo: a certidão não traz CPF nem nome do funcionário)
  if (Array.isArray(docRule?.preencheSo)) for (const k of Object.keys(campos)) if (!docRule.preencheSo.includes(k)) delete campos[k];
  // notas para a descrição (DIB/DCB da carta do INSS, totais do espelho de ponto): o que o portal não tem campo
  let notas = notasDoDocumento(text, docRule);
  // CPFs válidos do documento (sem os de registro/PIS/CNS/responsável): o painel pergunta à aba do portal de quem são
  const cpfs = tipo?.campos?.empregado ? cpfsDoTexto(text, rules).map(c => c.cpf) : [];
  // P6 — formato: e-mail, CPF, CEP, RG, agência, conta, telefone, nomes e listas; o que não serve fica para conferir
  for (const [k, c] of Object.entries(campos)) {
    const def = tipo?.campos?.[k]; if (!def || k === 'empregado') continue;
    const v = validarValor(k, def, c.valor, rules);
    if (v.ok) { if (['cpf', 'pis', 'email', 'cep', 'data', 'telefone'].includes(def.tipo) || ['cpf', 'pis', 'email', 'cep'].includes(k) || LC.formatos[k]) c.validado = c.validado ?? true; continue; }
    if (v.valor) { c.fonte = `${c.fonte} — li “${c.valor}”, parece “${v.valor}”`; c.valor = v.valor; }
    c.conf = Math.min(c.conf, v.valor ? 0.5 : 0.4); c.confira = 'formato'; c.validado = false;
  }
  if (bairroDuvida && campos.bairro && campos.bairro.conf > 0.45 && !rotulados.bairro) campos.bairro.conf = 0.45;
  // P2 — qualidade do OCR: leitura ruim não preenche nada (pede outra foto); leitura fraca, só sugestão (menos o validado e ancorado)
  const ocrConf = ctx.metodo === 'ocr' || (ctx.metodo == null && ctx.confiancaOcr != null) ? ctx.confiancaOcr : null;
  let fotoRuim = false;
  if (ocrConf != null && ocrConf < LC.ocrRuim && Object.keys(campos).length) {
    fotoRuim = true;
    for (const k of Object.keys(campos)) delete campos[k];
    candidatos = null; notas = []; cpfs.length = 0;
  } else if (ocrConf != null && ocrConf < LC.ocrBaixo) {
    for (const c of [...Object.values(campos), ...notas]) if (!(c.ancora && c.validado) && c.conf > LC.ocrTetoBaixo) { c.conf = LC.ocrTetoBaixo; c.confira = c.confira || 'leitura'; }
  }
  // nomes não têm dígito verificador: de foto, o OCR troca ou junta palavras ("EMMA THIAGO…") — ficam para o cliente confirmar
  if (ocrConf != null && ocrConf < LC.ocrTetoNomes) for (const k of LC.tiposComNome) if (campos[k] && campos[k].conf > LC.ocrTetoBaixo) { campos[k].conf = LC.ocrTetoBaixo; campos[k].confira = campos[k].confira || 'leitura'; }
  if (fotoRuim || (ocrConf != null && ocrConf < LC.ocrRuim)) avisosExtra.push({ nivel: 'atencao', id: 'fotoRuim', mensagem: rules.mensagens?.leituraRuimOutraFoto || 'Não consegui ler este arquivo com segurança (foto tremida, escura ou cortada). Para não preencher nada errado, deixei os campos em branco. Se puder, mande outra foto: o documento inteiro, de frente, com boa luz e sem reflexo.' });
  // quem é a pessoa do documento (um documento, uma pessoa: o painel não mistura documentos de pessoas diferentes)
  const pessoa = pessoaDaAnalise({ campos, paciente: leitor?.paciente?.nome || null });
  const avisos = [...avisosDoDocumento(text, docRule || (leitor ? (rules.documentos || []).find(d => d.id === 'atestado') : null), campos), ...avisosExtra, ...avisosMotivo];
  return { documento: doc, alternativas: docs.slice(1, 4), tipoSugerido: tipoKey, campos, avisos, paciente: leitor?.paciente?.nome || null, candidatos, titular, filiacao: pessoal?.filiacao || null, layout: pessoal?.layout || null, pessoa, fotoRuim, confiancaOcr: ocrConf, notas, cpfs, exameAso, certidao: certidao ? { tipo: certidao.tipo } : null };
}

/**
 * PDF com vários documentos (RG + comprovante + ASO): cada trecho é lido com o que o SEU documento pode trazer (o endereço só
 * sai do comprovante, nunca da clínica do ASO) e os resultados se juntam — o campo de maior confiança fica (empate: o do
 * trecho mais antigo). partes: [{ documento, texto }]. Devolve a análise do 1º trecho com os campos, avisos e notas de todos,
 * mais `documentos` (ids reconhecidos) e `partes` (análise de cada um).
 */
export function analisarPartes(partes, rules, ctx = {}) {
  const lista = (partes || []).map(p => ({ p, a: analyzeText(p.texto, rules, ctx) }));
  if (!lista.length) return analyzeText('', rules, ctx);
  const principal = lista.find(x => x.a.tipoSugerido && x.a.documento && !docsNeutros(rules).includes(x.a.documento.id)) || lista.find(x => x.a.tipoSugerido) || lista[0];
  const base = principal.a;
  const campos = {};
  for (const { a } of lista) for (const [k, c] of Object.entries(a.campos)) if (!campos[k] || campos[k].conf < c.conf) campos[k] = c;
  const tipoKey = ctx.tipoAtual || base.tipoSugerido;
  const ids = [...new Set(lista.map(x => x.a.documento?.id).filter(Boolean))];
  const cpfs = [...new Set(lista.flatMap(x => x.a.cpfs || []))];
  const pessoa = pessoaDaAnalise({ campos, paciente: base.paciente });
  return { ...base, tipoSugerido: tipoKey, campos, avisos: lista.flatMap(x => x.a.avisos), notas: lista.flatMap(x => x.a.notas || []), cpfs, pessoa,
    candidatos: base.candidatos || lista.find(x => x.a.candidatos)?.a.candidatos || null, titular: base.titular || lista.find(x => x.a.titular)?.a.titular || null,
    documentos: ids, partes: lista.map(x => ({ documento: x.a.documento?.id || null, paginas: x.p.paginas || null })) };
}

/* ---------------- Notas, certidão e CPFs do documento ---------------- */
/** Linhas para a descrição com o que o documento traz e o portal não tem campo (documentos[].notas, com os valores de
 *  documentos[].extrairNotas): DIB e DCB da carta do INSS, totais do espelho de ponto. Cada nota: { texto: "…{dib}…" ou
 *  [alternativas, a 1ª completa vale] } ou { titulo, linhas: [...] } (só as linhas com valor). Datas normalizadas. */
export function notasDoDocumento(text, docRule) {
  if (!docRule?.notas?.length) return [];
  const vals = {};
  for (const [k, pats] of Object.entries(docRule.extrairNotas || {})) {
    let v = runPatterns(text, pats); if (!v) continue;
    v = v.replace(/\s+/g, ' ').trim();
    if (/^\d{1,2}\s?[/.-]\s?\d{1,2}\s?[/.-]\s?\d{2,4}$/.test(v)) { const d = parseDate(v.replace(/\s/g, '')); if (!d) continue; v = fmtDate(d); }
    if (v) vals[k] = v;
  }
  const out = [];
  for (const n of docRule.notas) {
    let s = '';
    if (Array.isArray(n?.linhas)) {
      const ls = n.linhas.map(l => renderTemplate(l, vals)).filter(Boolean);
      if (ls.length) s = `${renderFirst(n.titulo || '', vals)} ${ls.join('; ')}`.trim();
    } else s = renderFirst(n?.texto ?? n, vals);
    if (s) out.push({ id: n?.id || docRule.id, texto: s, conf: n?.conf ?? 0.7, fonte: docRule.nome });
  }
  return out;
}
export const CERT_ROTULOS_CONJUGE = /c[oô]njuges?|contraentes?|nubentes?|noivos?/i;
export const nomeDeLinha = (s) => {
  const n = String(s || '').replace(/[^\p{L}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const ws = n.split(' ').filter(Boolean);
  return ws.length >= 2 && ws.length <= 8 && n === n.toUpperCase() && !ws.some(w => NAO_NOME.has(norm(w))) ? n : null;
};
/** Certidão de casamento ou de nascimento (civil): { tipo: 'casamento'|'nascimento'|null, nomes: [cônjuges], registrado, data }. */
export function lerCertidao(text) {
  const T = String(text || '').normalize('NFC'); const t = plain(T);
  const tipo = /certidao\s+de\s+casamento/.test(t) ? 'casamento' : /certidao\s+de\s+nascimento/.test(t) ? 'nascimento'
    : /\bcasamento\b/.test(t) && !/\bnascid[oa]\b/.test(t) ? 'casamento' : /\bnascimento\b/.test(t) ? 'nascimento' : null;
  const linhas = T.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // data junto da pista: na mesma linha (depois do rótulo) ou na linha de baixo, na mesma coluna aproximada
  const dataPerto = (rx) => {
    for (let i = 0; i < linhas.length; i++) {
      const m = plain(linhas[i]).match(rx); if (!m) continue;
      const resto = linhas[i].slice(m.index + m[0].length);
      const d1 = resto.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/); if (d1 && parseDate(d1[1])) return fmtDate(parseDate(d1[1]));
      const prox = linhas[i + 1] || ''; const ds = [...prox.matchAll(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g)];
      if (ds.length === 1 && parseDate(ds[0][1])) return fmtDate(parseDate(ds[0][1]));
    }
    return null;
  };
  const out = { tipo, nomes: [], registrado: null, data: null };
  if (tipo === 'casamento') {
    for (let i = 0; i < linhas.length && out.nomes.length < 2; i++) {
      if (!CERT_ROTULOS_CONJUGE.test(linhas[i])) continue;
      const depois = linhas[i].replace(/^.*?(?:c[oô]njuges?|contraentes?|nubentes?|noivos?)[^:]*:?/i, '');
      for (const l of [depois, linhas[i + 1], linhas[i + 2], linhas[i + 3]]) {
        for (const parte of String(l || '').split(/\s+E\s+|;|\s{3,}|\s+e\s+(?=[A-ZÀ-Ú])/)) { const n = nomeDeLinha(parte); if (n && !out.nomes.includes(n) && out.nomes.length < 2) out.nomes.push(n); }
        if (out.nomes.length >= 2) break;
      }
    }
    out.data = dataPerto(/data\s+do\s+(?:registro\s+do\s+)?casamento|celebrad[oa]\s+em|casaram-se\s+em/);
  } else if (tipo === 'nascimento') {
    for (let i = 0; i < linhas.length && !out.registrado; i++) {
      const m = linhas[i].match(/^\s*nome(?:\s+do\s+registrado)?\s*:?\s*(.*)$/i); if (!m) continue;
      out.registrado = nomeDeLinha(m[1]) || nomeDeLinha(linhas[i + 1]);
    }
    out.data = dataPerto(/data\s+de\s+nascimento|nascid[oa]\s+em|nasceu\s+em/);
  }
  return out;
}

/**
 * PDF com vários documentos: separa as páginas por documento (RG + comprovante + ASO num arquivo só). Uma página fraca
 * (sem documento reconhecido com segurança) fica com a anterior, para não partir o verso de um RG. paginas: [texto].
 * Devolve [{ documento, paginas: [índices], texto }] — mais de um só quando há documentos diferentes.
 */
export function separarDocumentos(paginas, rules, { minimo = 0.4 } = {}) {
  const partes = [];
  (paginas || []).forEach((tx, i) => {
    const d = classifyDocument(tx || '', rules)[0];
    const forte = d && d.bruto >= minimo ? d.id : null;
    const ult = partes[partes.length - 1];
    if (!ult || (forte && ult.documento && forte !== ult.documento)) partes.push({ documento: forte, paginas: [i], textos: [tx || ''] });
    else { ult.paginas.push(i); ult.textos.push(tx || ''); if (!ult.documento && forte) ult.documento = forte; }
  });
  return partes.map(p => ({ documento: p.documento, paginas: p.paginas, texto: p.textos.join('\n\n') }));
}

/**
 * Onde o valor está na foto: as palavras do OCR (só na memória: [{ t, conf 0–100, bbox: { x0, y0, x1, y1 }, pagina }]) que
 * formam o valor, juntas (sem espaço e sem pontuação). Valores com menos de 3 letras/dígitos não são procurados (casariam
 * em qualquer lugar). Achado mais de uma vez, vale a leitura melhor. Devolve { conf (média), min, bbox, pagina } ou null.
 */
export function localizarValor(valor, palavras) {
  const alvo = norm(valor).replace(/ /g, '');
  if (alvo.length < 3 || !palavras?.length) return null;
  const P = palavras.map(p => ({ ...p, n: norm(p.t).replace(/ /g, '') }));
  let melhor = null;
  for (let i = 0; i < P.length; i++) {
    if (!P[i].n || !alvo.startsWith(P[i].n)) continue;
    let acc = ''; const usados = [];
    for (let j = i; j < P.length; j++) {
      if (!P[j].n) continue;
      if ((P[j].pagina ?? 0) !== (P[i].pagina ?? 0)) break;
      acc += P[j].n; usados.push(P[j]);
      if (acc === alvo) {
        const confs = usados.map(u => +u.conf || 0);
        const r = { conf: Math.round(confs.reduce((a, b) => a + b, 0) / confs.length), min: Math.round(Math.min(...confs)), pagina: P[i].pagina ?? 0,
          bbox: { x0: Math.min(...usados.map(u => u.bbox.x0)), y0: Math.min(...usados.map(u => u.bbox.y0)), x1: Math.max(...usados.map(u => u.bbox.x1)), y1: Math.max(...usados.map(u => u.bbox.y1)) } };
        if (!melhor || r.conf > melhor.conf) melhor = r;
        break;
      }
      if (!alvo.startsWith(acc)) break;
    }
  }
  return melhor;
}
/** Confiança de cada valor pela leitura das palavras da foto (config.recorteLeitura): abaixo do limite, fica como sugestão
 *  (não vai ao portal sem o cliente confirmar). Dados de saúde (sensivel, CID, médico) nunca ganham recorte. Muda `campos`. */
export function aplicarLeituraDasPalavras(campos, palavras, tipoDef, rules) {
  const R = { confiancaPalavraMinima: 70, ...(rules?.config?.recorteLeitura || {}) };
  if (R.ativo === false || !palavras?.length) return campos;
  for (const [k, c] of Object.entries(campos || {})) {
    const def = tipoDef?.campos?.[k];
    if (!def || def.sensivel || ['cid', 'medico'].includes(k) || c.confira === 'formato') continue;
    if (c.ancora && c.validado && ['cpf', 'pis'].includes(k)) continue;   // o dígito verificador já confere o valor (mesma exceção do P2)
    const loc = localizarValor(c.valor, palavras); if (!loc) continue;
    c.leitura = loc;
    if (loc.conf < R.confiancaPalavraMinima && c.conf > Math.min(0.55, limiarPortal(rules) - 0.05)) { c.conf = Math.min(0.55, limiarPortal(rules) - 0.05); c.confira = c.confira || 'leitura'; c.validado = false; }
  }
  return campos;
}

/** Texto de um documento do Word (document.xml) ou do LibreOffice (content.xml): um parágrafo por linha; as células de uma
 *  tabela ficam na mesma linha, separadas por espaços (rótulo e valor como num formulário). Sem biblioteca: só o XML. */
export function xmlParaTexto(xml, tipo = 'docx') {
  const dec = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
  let x = String(xml || '');
  if (tipo === 'docx') x = x.replace(/<\/w:p>(?=\s*<\/w:tc>)/g, '').replace(/<w:tab\s*\/>/g, '\t').replace(/<w:(?:br|cr)\s*\/>/g, '\n').replace(/<\/w:tc>/g, '   ').replace(/<\/w:p>/g, '\n').replace(/<\/w:tr>/g, '\n');
  else x = x.replace(/<\/text:p>(?=\s*<\/table:table-cell>)/g, '').replace(/<text:tab\s*\/>/g, '\t').replace(/<text:line-break\s*\/>/g, '\n').replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n) => ' '.repeat(+n || 1)).replace(/<\/table:table-cell>/g, '   ').replace(/<\/text:(?:p|h)>/g, '\n').replace(/<\/table:table-row>/g, '\n');
  return dec(x.replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n').trim();
}

/** CPFs válidos do texto que não estão junto de outro rótulo (registro, PIS, CNS, responsável, mãe…): [{ cpf, ancora }]. */
export function cpfsDoTexto(text, rules) {
  const T = String(text || '').normalize('NFC'); const L = cfgLeitor(rules); const out = [];
  for (const m of T.matchAll(RX.cpf)) {
    const d = onlyDigits(m[1]); if (d.length !== 11 || !validCPF(d) || out.some(c => c.cpf === d)) continue;
    const r = rotuloPerto(T, m.index, 'cpf|c\\.p\\.f\\.?', L.contextoCpfDescarta);
    if (r !== 'outro') out.push({ cpf: d, ancora: r === 'sim' });
  }
  return out;
}

/* ---------------- Um documento, uma pessoa ---------------- */
export const FAMILIAS_PEDIDO = [['avisoFerias', 'calculoFerias'], ['avisoRescisao', 'calculoRescisao'], ['cadastroEmpregado', 'cadastroEstagiario', 'cadastroContribuinte']];
/** De quem é o documento: { nome, cpf } (nome do cadastro, funcionário escolhido ou paciente; CPF válido). null = não diz. */
export function pessoaDaAnalise(a) {
  const c = a?.campos || {};
  const cpf = c.cpf?.valor && validCPF(c.cpf.valor) && (c.cpf.conf ?? 0) >= 0.6 ? onlyDigits(c.cpf.valor) : null;
  const nome = (c.nome?.valor && (c.nome.conf ?? 0) >= 0.6 ? c.nome.valor : null) || (c.empregado?.valor && (c.empregado.conf ?? 0) >= 0.6 ? c.empregado.valor : null) || null;
  return cpf || nome ? { nome, cpf } : null;
}
/** Duas pessoas são a mesma? true / false / null (não dá para dizer). CPF manda; sem CPF, o nome inteiro. */
export function mesmaPessoa(a, b) {
  if (!a || !b) return null;
  if (a.cpf && b.cpf) return a.cpf === b.cpf;
  if (a.nome && b.nome) {
    if (norm(a.nome) === norm(b.nome)) return true;
    const pm = empregadoPorNome(a.nome, [b.nome]);
    if (pm?.option && !pm.contradiz && pm.score >= 0.8) return true;
    return similarity(a.nome, b.nome) >= 0.9;
  }
  return null;
}
