/* Motor — leitura dos documentos do envio por competência (2.46, fase 1: XML e PDF com texto, sem OCR).
 * Puro (testado no engine.test.mjs). Recebe o texto do arquivo (o painel lê com o pdf.js ou decodifica o XML) e devolve:
 * em qual item da lista ele cai, de que mês ele é, se cita a empresa aberta e um resumo curto ("NF-e nº 123 · 05/10/2026").
 * Nada aqui é guardado: o painel mantém o resultado só na memória, junto do arquivo.
 * As palavras que reconhecem cada item ficam nas regras (documentosCliente.itens[].reconhecer), a ligação das notas com os
 * itens em documentosCliente.leitura.nf. */
import { norm as normBase, onlyDigits } from './base.js';

// minúsculas, sem acento e sem pontuação (o norm da base devolve MAIÚSCULAS)
const norm = (s) => normBase(s).toLowerCase();

const cfgLeitura = (regras) => regras?.config?.documentosCliente?.leitura || {};
const pad = (n) => String(n).padStart(2, '0');
const compDeData = (d) => (d ? `${pad(d.getMonth() + 1)}/${d.getFullYear()}` : null);

/* ---------- empresa: o nome (razão social) do portal × o que está no documento ---------- */
const SUFIXOS = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'cia', 'mei', 'slu', 'ss', 'de', 'da', 'do', 'das', 'dos', 'e']);
const tokensEmpresa = (nome) => norm(nome).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length >= 3 && !SUFIXOS.has(t));
/** O nome lido no documento é o da empresa? (tolera a falta de LTDA/ME, abreviações e o nome cortado no documento) */
export function mesmaEmpresa(nomeDoc, nomeEmpresa) {
  const a = tokensEmpresa(nomeDoc), b = tokensEmpresa(nomeEmpresa);
  if (!a.length || !b.length) return false;
  const [menor, maior] = a.length <= b.length ? [a, b] : [b, a];
  const comuns = menor.filter(t => maior.includes(t)).length;
  return menor.length === 1 ? comuns === 1 && maior.length <= 2 : comuns / menor.length >= 0.75;
}
/** O texto cita a empresa? (todas as palavras do nome, menos sufixos, aparecem perto umas das outras) */
export function textoCitaEmpresa(texto, nomeEmpresa) {
  const b = tokensEmpresa(nomeEmpresa); if (!b.length) return false;
  const t = ` ${norm(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  const primeiro = t.indexOf(` ${b[0]} `);
  if (primeiro < 0) return false;
  const trecho = t.slice(primeiro, primeiro + 160);
  return b.filter(x => trecho.includes(` ${x} `)).length / b.length >= 0.75;
}
const posicaoDaEmpresa = (texto, nomeEmpresa) => {
  const b = tokensEmpresa(nomeEmpresa); if (!b.length) return -1;
  const t = ` ${norm(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  for (let i = t.indexOf(` ${b[0]} `); i >= 0; i = t.indexOf(` ${b[0]} `, i + 1)) {
    const trecho = t.slice(i, i + 160);
    if (b.filter(x => trecho.includes(` ${x} `)).length / b.length >= 0.75) return i;
  }
  return -1;
};

/* ---------- XML de nota fiscal (NF-e/NFC-e e NFS-e nos formatos mais comuns) ---------- */
const tag = (xml, nomes) => { for (const n of [].concat(nomes)) { const m = new RegExp(`<(?:\\w+:)?${n}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${n}>`, 'i').exec(xml); if (m) return m[1].trim(); } return ''; };
const bloco = (xml, nomes) => { for (const n of [].concat(nomes)) { const m = new RegExp(`<(?:\\w+:)?${n}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${n}>`, 'i').exec(xml); if (m) return m[1]; } return ''; };
const dataIso = (s) => { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const parte = (b) => ({ cnpj: onlyDigits(tag(b, ['CNPJ', 'Cnpj', 'CPF', 'Cpf'])), nome: tag(b, ['xNome', 'RazaoSocial', 'Nome', 'xFant']) });
/** Lê um XML de nota. Devolve null quando não é uma nota que a extensão conhece. */
export function lerNotaXml(xml) {
  const x = String(xml || '');
  if (!/<\?xml|<(?:\w+:)?(?:nfeProc|NFe|CompNfse|Nfse|NFSe|ConsultarNfse|infNFSe)/i.test(x)) return null;
  const infNFe = bloco(x, 'infNFe');
  if (infNFe) {   // NF-e (mod 55) e NFC-e (mod 65)
    const ide = bloco(infNFe, 'ide');
    const chave = onlyDigits((/<(?:\w+:)?infNFe[^>]*Id="NFe(\d{44})"/i.exec(x) || [])[1] || tag(x, 'chNFe'));
    const total = bloco(infNFe, 'ICMSTot');
    return { tipo: tag(ide, 'mod') === '65' ? 'nfce' : 'nfe', numero: tag(ide, 'nNF'), serie: tag(ide, 'serie'), data: dataIso(tag(ide, ['dhEmi', 'dEmi'])),
      tpNF: tag(ide, 'tpNF'), emitente: parte(bloco(infNFe, 'emit')), destinatario: parte(bloco(infNFe, 'dest')), valor: +tag(total, 'vNF') || null, chave: chave.length === 44 ? chave : '' };
  }
  // NFS-e: ABRASF (PrestadorServico/TomadorServico) e o padrão nacional (emit/toma)
  const prest = bloco(x, ['PrestadorServico', 'Prestador', 'prest', 'emit']);
  const toma = bloco(x, ['TomadorServico', 'Tomador', 'toma']);
  if (prest || toma) {
    return { tipo: 'nfse', numero: tag(x, ['Numero', 'nNFSe', 'nDFSe']), serie: '', data: dataIso(tag(x, ['DataEmissao', 'dhEmi', 'dhProc', 'Competencia', 'dCompet'])),
      prestador: parte(prest), tomador: parte(toma), valor: +(tag(x, ['ValorServicos', 'vServ', 'vLiq']).replace(',', '.')) || null,
      chave: onlyDigits(tag(x, ['CodigoVerificacao', 'chNFSe'])) || '' };
  }
  return null;
}

/** Em qual item a nota cai, pela posição da empresa nela (emitente → saída; destinatário → entrada; prestador/tomador nas de serviço). */
function itemDaNota(nota, empresa, empresaCnpj, regras) {
  const nf = { saida: 'nf-saida', entrada: 'nf-entrada', servicoPrestado: 'nf-saida', servicoTomado: 'nf-servicos-tomados', ...(cfgLeitura(regras).nf || {}) };
  const eDela = (p) => !!p && ((empresaCnpj && p.cnpj && onlyDigits(empresaCnpj) === p.cnpj) || (p.nome && mesmaEmpresa(p.nome, empresa)));
  if (nota.tipo === 'nfse') {
    if (eDela(nota.prestador)) return { item: nf.servicoPrestado, papel: 'prestador' };
    if (eDela(nota.tomador)) return { item: nf.servicoTomado, papel: 'tomador' };
    return { item: null, papel: '' };
  }
  if (eDela(nota.emitente)) return { item: nf.saida, papel: 'emitente' };
  if (eDela(nota.destinatario)) return { item: nf.entrada, papel: 'destinatario' };
  return { item: null, papel: '' };
}

/* ---------- PDF com texto: palavras das regras ---------- */
/** Pontua cada item pelas palavras de `reconhecer` (fortes valem 3, comuns 1; `excluir` zera). Devolve [{ id, pontos }] do maior para o menor. */
export function pontuarItens(texto, regras, nomeArquivo = '') {
  const t = ` ${norm(texto).replace(/\s+/g, ' ')} `;
  const n = ` ${norm(String(nomeArquivo).replace(/\.[a-z0-9]{1,5}$/i, '')).replace(/\s+/g, ' ')} `;   // "06_controle_caixa_10-2026.csv" → "06 controle caixa 10 2026"
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const em = (alvo) => (p) => new RegExp(`(^|[^a-z0-9])${esc(norm(p))}(?![a-z0-9])`).test(alvo);   // palavra inteira ("dam" não acha "damasco")
  const tem = em(t), noNome = em(n);
  return (regras?.config?.documentosCliente?.itens || []).map(it => {
    const r = it.reconhecer || {};
    if ((r.excluir || []).some(tem)) return { id: it.id, pontos: 0 };
    // palavras do nome do arquivo (o cliente costuma nomear: "extrato", "controle caixa", "notas saida") valem 2
    const pontos = (r.fortes || []).filter(tem).length * 3 + (r.palavras || []).filter(tem).length + (r.nomes || []).filter(noNome).length * 2;
    return { id: it.id, pontos };
  }).filter(x => x.pontos > 0).sort((a, b) => b.pontos - a.pontos);
}
/** Tira do texto os nomes das empresas (inteiros e sem LTDA/ME…), para as palavras do próprio nome não contarem na classificação. */
export function semNomesDeEmpresas(texto, nomes) {
  let t = ` ${norm(texto).replace(/\s+/g, ' ')} `;
  for (const n of (nomes || []).filter(Boolean)) {
    for (const frase of [norm(n), tokensEmpresa(n).join(' ')]) if (frase && frase.split(' ').length >= 2) t = t.split(` ${frase} `).join(' ');
  }
  return t.trim();
}
/** Lê um extrato OFX (o arquivo de extrato que os bancos exportam): banco, conta (4 últimos dígitos), período e as datas dos lançamentos. */
export function lerOfx(texto, regras) {
  const t = String(texto || '');
  if (!/OFXHEADER|<OFX>/i.test(t)) return null;
  const v = (k) => (new RegExp(`<${k}>\\s*([^<\\r\\n]+)`, 'i').exec(t) || [])[1]?.trim() || '';
  const data = (s) => { const m = /^(\d{4})(\d{2})(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const codigos = cfgLeitura(regras).codigosBanco || {};
  const bankId = v('BANKID').replace(/^0+(?=\d{3}$)/, '');
  const banco = v('ORG') || codigos[bankId] || codigos[bankId.padStart(3, '0')] || (bankId ? `banco ${bankId}` : '');
  const acct = v('ACCTID').replace(/\D/g, '');
  const lanc = [...t.matchAll(/<DTPOSTED>\s*(\d{8})/gi)].map(m => data(m[1])).filter(Boolean);
  return { banco, conta: acct.length >= 4 ? acct.slice(-4) : '', de: data(v('DTSTART')), ate: data(v('DTEND')), lancamentos: lanc };
}
/** Os meses (MM/AAAA) das datas do texto, com quantas vezes aparecem. */
export function mesesDoTexto(texto) {
  const conta = new Map();
  const add = (mes, ano) => { if (mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100) { const k = `${pad(mes)}/${ano}`; conta.set(k, (conta.get(k) || 0) + 1); } };
  for (const m of String(texto || '').matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g)) add(+m[2], m[3].length === 2 ? 2000 + +m[3] : +m[3]);
  for (const m of String(texto || '').matchAll(/(?<![\d/])(\d{2})\/(\d{4})(?![\d/])/g)) add(+m[1], +m[2]);
  return [...conta].sort((a, b) => b[1] - a[1]).map(([competencia, n]) => ({ competencia, n }));
}

/** As datas do texto (dd/mm/aaaa ou dd/mm/aa), na ordem em que aparecem. */
export function datasDoTexto(texto) {
  const out = [];
  for (const m of String(texto || '').matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g)) {
    const d = +m[1], mes = +m[2], ano = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100) { const dt = new Date(ano, mes - 1, d); if (dt.getMonth() === mes - 1) out.push(dt); }
  }
  return out;
}
/** Banco e conta (só os 4 últimos dígitos) de um extrato, para o resumo. */
export function contaDoExtrato(texto, regras) {
  const t = String(texto || '');
  const bancos = cfgLeitura(regras).bancos || ['Banco do Brasil', 'Itaú', 'Bradesco', 'Santander', 'Caixa Econômica', 'Nubank', 'Inter', 'Sicoob', 'Sicredi', 'C6 Bank', 'BTG', 'Safra', 'Banrisul', 'Mercado Pago', 'PagBank', 'Stone'];
  const nt = ` ${norm(t)} `;
  const banco = bancos.find(b => nt.includes(` ${norm(b)} `)) || '';
  const m = /\bconta(?:\s+corrente)?\s*(?:n[º°o.]*)?\s*[:\-]?\s*([\d][\d.\- ]{2,18}\d)/i.exec(t);
  const dig = m ? m[1].replace(/\D/g, '') : '';
  return { banco, conta: dig.length >= 4 ? dig.slice(-4) : '' };
}
/** Buracos na numeração das notas emitidas (por tipo e série). Só avisa até `max` números faltando (mais que isso, é outra série/sistema). */
export function faltasNaSequencia(notas, max = 30) {
  const grupos = new Map();
  for (const n of notas || []) { const num = +n.numero; if (!(num > 0)) continue; const k = `${n.tipo}|${n.serie || ''}`; if (!grupos.has(k)) grupos.set(k, new Set()); grupos.get(k).add(num); }
  const out = [];
  for (const [k, set] of grupos) {
    const nums = [...set].sort((a, b) => a - b); if (nums.length < 2) continue;
    const faltam = []; for (let x = nums[0] + 1; x < nums.at(-1) && faltam.length <= max; x++) if (!set.has(x)) faltam.push(x);
    if (faltam.length && faltam.length <= max) { const [tipo, serie] = k.split('|'); out.push({ tipo, serie, de: nums[0], ate: nums.at(-1), faltam }); }
  }
  return out;
}
/** Uma linha curta para a descrição da solicitação, a partir do que foi lido nos arquivos de um item. */
export function detalheDoItem(analises) {
  const lista = (analises || []).filter(Boolean);
  const notas = lista.flatMap(a => a.notas || (a.nota ? [a.nota] : []));
  if (notas.length) {
    const nums = notas.map(n => +n.numero).filter(n => n > 0).sort((a, b) => a - b);
    const tipos = [...new Set(notas.map(n => ({ nfe: 'NF-e', nfce: 'NFC-e', nfse: 'NFS-e' }[n.tipo])))].join('/');
    return `${notas.length} ${tipos}${nums.length ? `, nº ${nums[0]}${nums.length > 1 ? ` a ${nums.at(-1)}` : ''}` : ''}`;
  }
  const contas = lista.filter(a => a.conta && (a.conta.banco || a.conta.conta)).map(a => [a.conta.banco, a.conta.conta && `conta final ${a.conta.conta}`, a.periodo && `${a.periodo.de} a ${a.periodo.ate}`].filter(Boolean).join(' '));
  return [...new Set(contas)].join('; ');
}

/**
 * Analisa um documento do envio. doc = { nome, texto, xml? }; ctx = { empresa, empresaCnpj?, outrasEmpresas?, competencia, itensDoSetor: [{ id, rotulo }], setor }.
 * Devolve { item, conf, resumo, competenciaDoc, avisos: [{ tipo, texto, ... }], nota?, chave?, outroSetor? }.
 */
export function analisarDocumentoCliente(doc, regras, ctx = {}) {
  const L = cfgLeitura(regras), T = L.textos || {};
  const itens = regras?.config?.documentosCliente?.itens || [];
  const rotuloDe = (id) => itens.find(i => i.id === id)?.rotulo || id;
  const doSetor = new Set((ctx.itensDoSetor || []).map(i => i.id));
  const avisos = [];
  const out = { item: null, conf: 0, resumo: '', competenciaDoc: null, avisos, outroSetor: null };
  const fmt = (d) => (d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '');

  const nota = doc.xml != null ? lerNotaXml(doc.xml) : null;
  if (nota) {
    out.nota = nota; out.chave = nota.chave || '';
    const r = itemDaNota(nota, ctx.empresa, ctx.empresaCnpj, regras);
    const nome = { nfe: 'NF-e', nfce: 'NFC-e', nfse: 'NFS-e' }[nota.tipo];
    out.resumo = [nota.numero ? `${nome} nº ${nota.numero}` : nome, nota.data && fmt(nota.data)].filter(Boolean).join(' · ');
    out.competenciaDoc = compDeData(nota.data);
    if (r.item) { out.item = r.item; out.conf = 0.95; }
    else {
      const partes = nota.tipo === 'nfse' ? [nota.prestador, nota.tomador] : [nota.emitente, nota.destinatario];
      const outra = (ctx.outrasEmpresas || []).find(e => partes.some(p => p?.nome && mesmaEmpresa(p.nome, e)));
      avisos.push({ tipo: 'empresa', texto: outra ? (T.outraEmpresa || 'Esta nota é da empresa {outra}, não da {empresa}.').replace('{outra}', outra).replace('{empresa}', ctx.empresa || '')
        : (T.empresaNaoCitada || 'Não achei a {empresa} nesta nota ({partes}). Confira se ela é desta empresa.').replace('{empresa}', ctx.empresa || 'empresa aberta').replace('{partes}', partes.map(p => p?.nome).filter(Boolean).join(' / ') || 'sem nomes') });
    }
  } else {
    const texto = String(doc.texto || '');
    const ofx = lerOfx(texto, regras);
    // o nome da empresa não conta como palavra do item ("… SIMPLES NACIONAL LTDA" não é guia do Simples)
    const pts = ofx ? [{ id: L.ofxItem || 'extratos', pontos: 99 }] : pontuarItens(semNomesDeEmpresas(texto, [ctx.empresa, ...(ctx.outrasEmpresas || [])]), regras, doc.nome || '');
    const melhor = pts[0];
    const minimo = +L.pontosMinimos || 3;
    const certo = melhor && melhor.pontos >= minimo && (!pts[1] || melhor.pontos > pts[1].pontos);
    // 2.50: sem certeza (poucas palavras ou empate), ainda assim aponta o mais provável — o cliente confirma ou muda
    if (melhor && !certo) { out.duvida = true; out.alternativas = pts.slice(0, 3).map(p => p.id); }
    if (melhor) {
      out.item = melhor.id; out.conf = certo ? Math.min(0.9, 0.5 + melhor.pontos / 12) : 0.4;
      // nota em PDF (DANFE / NFS-e impressa): a posição da empresa no papel diz se ela emitiu ou recebeu
      const nf = { saida: 'nf-saida', entrada: 'nf-entrada', servicoTomado: 'nf-servicos-tomados', ...(L.nf || {}) };
      if ([nf.saida, nf.entrada, nf.servicoTomado].includes(melhor.id) && ctx.empresa) {
        const nt = norm(texto), pos = posicaoDaEmpresa(texto, ctx.empresa);
        const ehServico = /\bnfs ?e\b|nota fiscal de servico|prestador de servico/.test(nt);
        const iTomador = nt.search(/tomador/);
        if (pos >= 0) out.item = ehServico ? (iTomador >= 0 && pos > iTomador ? nf.servicoTomado : nf.saida) : (pos < 600 ? nf.saida : nf.entrada);
        else { out.item = null; avisos.push({ tipo: 'empresa', texto: (T.empresaNaoCitadaPdf || 'Parece uma nota fiscal, mas não achei a {empresa} nela. Confira se é desta empresa e escolha o item.').replace('{empresa}', ctx.empresa) }); }
      }
      out.resumo = rotuloDe(out.item || melhor.id);
    }
    // extrato (e o que mais as regras pedirem): de qual a qual dia do mês ele vai, banco e conta (4 últimos dígitos)
    const P = { itens: ['extratos'], folgaInicio: 5, folgaFim: 5, ...(L.periodo || {}) };
    if (out.item && P.itens.includes(out.item)) {
      out.conta = ofx ? { banco: ofx.banco, conta: ofx.conta } : contaDoExtrato(texto, regras);
      const cp = /^(\d{2})\/(\d{4})$/.exec(ctx.competencia || '');
      const datasDoc = ofx ? [ofx.de, ofx.ate, ...ofx.lancamentos].filter(Boolean) : datasDoTexto(texto);
      if (ofx) { const c = new Map(); datasDoc.forEach(d => { const k = compDeData(d); c.set(k, (c.get(k) || 0) + 1); }); out.mesesCitadosOfx = [...c].sort((a, b) => b[1] - a[1]).map(x => x[0]); }
      const doMes = cp ? datasDoc.filter(d => d.getMonth() + 1 === +cp[1] && d.getFullYear() === +cp[2]).sort((a, b) => a - b) : [];
      if (doMes.length) {
        const de = doMes[0], ate = doMes.at(-1), ultimo = new Date(de.getFullYear(), de.getMonth() + 1, 0).getDate();
        const dm = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
        out.periodo = { de: dm(de), ate: dm(ate) };
        if (doMes.length >= 2 && (de.getDate() > 1 + (+P.folgaInicio) || ate.getDate() < ultimo - (+P.folgaFim))) avisos.push({ tipo: 'periodo', texto: (T.periodoIncompleto || 'Este extrato vai de {de} a {ate}: confira se falta o começo ou o fim do mês.').replace('{de}', out.periodo.de).replace('{ate}', out.periodo.ate) });
      }
      out.resumo = [rotuloDe(out.item).split(' ')[0], out.conta.banco, out.conta.conta && `conta final ${out.conta.conta}`, out.periodo && `${out.periodo.de} a ${out.periodo.ate}`].filter(Boolean).join(' · ');
    }
    // de que mês é: o mês que mais aparece; se nenhuma data cair na competência escolhida, avisa
    const meses = out.mesesCitadosOfx ? out.mesesCitadosOfx.map(c => ({ competencia: c })) : mesesDoTexto(texto);
    out.competenciaDoc = meses[0]?.competencia || null;
    out.mesesCitados = meses.map(m => m.competencia);
    // outra empresa do mesmo acesso citada e a aberta não
    const outra = (ctx.outrasEmpresas || []).find(e => textoCitaEmpresa(texto, e));
    if (outra && !(ctx.empresa && textoCitaEmpresa(texto, ctx.empresa))) avisos.push({ tipo: 'empresa', texto: (T.outraEmpresaPdf || 'Este documento cita a empresa {outra}, não a {empresa}.').replace('{outra}', outra).replace('{empresa}', ctx.empresa || '') });
  }
  // na dúvida, prefere a alternativa que é deste setor
  if (out.duvida && out.item && doSetor.size && !doSetor.has(out.item)) { const alt = (out.alternativas || []).find(id => doSetor.has(id)); if (alt) out.item = alt; }
  if (out.duvida && out.item) out.resumo = rotuloDe(out.item);
  // item de outro setor (ex.: nota no envio do Contábil): não entra na lista deste, mas diz onde vai
  if (out.item && doSetor.size && !doSetor.has(out.item)) {
    const it = itens.find(i => i.id === out.item);
    out.outroSetor = { item: out.item, rotulo: it?.rotulo || out.item, setores: it?.setores || [] };
    for (let i = avisos.length - 1; i >= 0; i--) if (avisos[i].tipo === 'periodo') avisos.splice(i, 1);   // o período é conferido no envio do setor certo
    avisos.push({ tipo: 'outroSetor', texto: (T.outroSetor || 'Parece ser “{rotulo}”, que vai para o {setores}.').replace('{rotulo}', out.outroSetor.rotulo).replace('{setores}', out.outroSetor.setores.join(' e ')) });
    out.item = null;
  }
  // competência: nota pela data de emissão; PDF só quando nenhuma data do documento cai no mês escolhido (fatura, extrato e relatório trazem datas vizinhas)
  if (ctx.competencia && out.competenciaDoc && out.competenciaDoc !== ctx.competencia && !(out.mesesCitados || []).includes(ctx.competencia)) {
    avisos.push({ tipo: 'competencia', competencia: out.competenciaDoc, texto: (T.outraCompetencia || 'Este documento parece ser de {doc}, e você está enviando a competência {comp}.').replace('{doc}', out.competenciaDoc).replace('{comp}', ctx.competencia) });
  }
  return out;
}

/** Junta as análises das notas de um ZIP: o item que mais aparece, o resumo ("23 NF-e, nº 101 a 123") e os avisos sem repetir. */
export function resumirVarias(analises) {
  const lista = analises.filter(Boolean);
  if (!lista.length) return null;
  const conta = new Map(); lista.forEach(a => { if (a.item) conta.set(a.item, (conta.get(a.item) || 0) + 1); });
  const item = [...conta].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const notas = lista.map(a => a.nota).filter(Boolean);
  const nums = notas.map(n => +n.numero).filter(n => n > 0).sort((a, b) => a - b);
  const tipos = [...new Set(notas.map(n => ({ nfe: 'NF-e', nfce: 'NFC-e', nfse: 'NFS-e' }[n.tipo])))];
  const resumo = notas.length ? `${notas.length} ${tipos.join('/') || 'notas'}${nums.length ? `, nº ${nums[0]}${nums.length > 1 ? ` a ${nums.at(-1)}` : ''}` : ''}` : `${lista.length} arquivos`;
  const vistos = new Set(); const avisos = [];
  for (const a of lista) for (const av of a.avisos) { const k = `${av.tipo}|${av.competencia || ''}|${av.texto}`; if (!vistos.has(k)) { vistos.add(k); avisos.push(av); } }
  const comps = new Map(); lista.forEach(a => { if (a.competenciaDoc) comps.set(a.competenciaDoc, (comps.get(a.competenciaDoc) || 0) + 1); });
  return { item, conf: item ? Math.min(...lista.filter(a => a.item === item).map(a => a.conf)) : 0, resumo, avisos, competenciaDoc: [...comps].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    chaves: notas.map(n => n.chave).filter(Boolean), varias: lista.length, notas };
}

/** Notas repetidas entre os arquivos (mesma chave de acesso), para avisar. Recebe [{ id, chaves: [] }] e devolve Map(id → id do repetido). */
export function notasRepetidas(arquivos) {
  const visto = new Map(), rep = new Map();
  for (const a of arquivos) for (const c of a.chaves || []) { if (!c) continue; if (visto.has(c) && visto.get(c) !== a.id) rep.set(a.id, visto.get(c)); else visto.set(c, a.id); }
  return rep;
}
