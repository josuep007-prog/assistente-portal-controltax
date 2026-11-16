/* Plataforma — Enviar documentos por competência (2.40): a lista do que o cliente envia ao setor (Fiscal, Contábil…) em cada mês.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam.
 * As listas, textos e prazos vêm das regras (config.setores e config.documentosCliente; motor em panel/engine/setores.js).
 * Os arquivos ficam só na memória até o envio; no computador fica guardado apenas o que foi marcado (empresa, competência, id do item,
 * quantidade e data) — nunca nomes de arquivos. Quem envia é sempre o cliente, pelo resumo "Conferir e enviar". */
import * as E from '../engine.js';
import { readFile, carregarXlsx, cancelarLeituraAtual } from '../extract.js';

export function montarEnviardocs(C) {
  const { A, S, $, esc, icon, toast, viewEl } = C;
  const { P, setorAtual } = C;   // definidos em partes que montam antes
  const MAX_CHAVES = 400;
  // cópias da Solicitação Geral para outros setores (2.41): a fila fica só na memória (os arquivos também)
  const copias = S.plat.copias = { fila: [], atual: null };
  const rot = (s) => E.setorDef(S.rules, s).rotulo || s;
  const setorDoDepartamento = (dep) => E.setorDaSolicitacao({ departamento: dep }, S.rules) || '';

  // leituras (2.46): File → { estado: 'lendo'|'ok'|'semTexto', analise, hash, auto, ok } — só na memória, some com o arquivo
  const env = S.plat.env = { competencia: '', arquivos: new Map(), enviados: {}, naoAplica: [], pronto: false, leituras: new Map(), semItem: new Map(), lendo: null, descartados: [] };
  chrome.storage.local.get(['enviosDocs', 'docsNaoSeAplica']).then(({ enviosDocs, docsNaoSeAplica }) => {
    env.enviados = enviosDocs && typeof enviosDocs === 'object' ? enviosDocs : {};
    env.naoAplica = Array.isArray(docsNaoSeAplica) ? docsNaoSeAplica : [];
    env.pronto = true;
    if (S.view === 'enviar') renderEnviar();
  }).catch(() => { env.pronto = true; });

  const empresa = () => S.ctx.empresa || '';
  const cfg = () => S.rules?.config?.documentosCliente || {};
  const chaveMes = (comp) => `${empresa()}|${comp}`;
  const chaveArq = (comp, id) => `${empresa()}|${comp}|${id}`;
  const arquivosDe = (comp, id) => env.arquivos.get(chaveArq(comp, id)) || [];
  const fixaDe = (id) => env.naoAplica.includes(`${empresa()}|${id}`);
  const doMesDe = (comp, id) => env.naoAplica.includes(`${empresa()}|${comp}|${id}`);
  const fixas = () => (cfg().itens || []).map(i => i.id).filter(fixaDe);
  /* ---------- leitura dos arquivos (2.46, fase 1: XML de nota, ZIP de XMLs e PDF/planilha com texto; sem OCR) ---------- */
  const leituraAtiva = () => !!cfg().leitura && cfg().leitura.ativo !== false;
  const TL = () => cfg().leitura?.textos || {};
  const chaveSem = (setor, comp) => `${empresa()}|${setor}|${comp}`;
  const semItemDe = (setor, comp) => env.semItem.get(chaveSem(setor, comp)) || [];
  const extDe = (n) => (/\.([a-z0-9]{1,5})$/i.exec(n || '') || [])[1]?.toLowerCase() || '';
  const mesmo = (a, b) => a === b || (a.name === b.name && a.size === b.size && a.lastModified === b.lastModified);
  async function hashDe(buf) { try { const h = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(h)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(''); } catch { return ''; } }
  /** Lê um arquivo no computador do cliente e diz em que item ele cai (nada sai daqui nem fica guardado). */
  const OCR = () => ({ ativo: true, maxPaginas: 2, confiancaMinima: 70, tempoMaxSeg: 40, ...(cfg().leitura?.ocr || {}) });
  const idDe = (() => { const m = new WeakMap(); let n = 0; return (f) => { if (!m.has(f)) m.set(f, ++n); return m.get(f); }; })();
  /** Fase 2 (2.47): foto ou PDF escaneado — OCR das primeiras páginas, no computador do cliente (Tesseract de lib/). */
  async function lerPorOcr(f, ctx, hash) {
    const O = OCR(); if (O.ativo === false) return { hash, semTexto: true };
    const info = env.leituras.get(f); if (info) info.ocrEmCurso = true;
    const prog = (p) => { const el = viewEl.querySelector(`[data-lendo="${idDe(f)}"]`); if (el) el.textContent = `${TL().lendoImagem || 'lendo a imagem'} ${Math.round((p || 0) * 100)}%`; };
    const r = await readFile(f, prog, { ocr: true, ocrMaxPaginas: +O.maxPaginas || 2, ocrTempoMaxSeg: +O.tempoMaxSeg || 40 });
    if (info) info.ocrEmCurso = false;
    const texto = String(r?.texto || '').trim();
    if (texto.length < 30) return { hash, semTexto: true, ocr: true };
    const analise = E.analisarDocumentoCliente({ nome: f.name, texto }, S.rules, ctx);
    const confianca = r?.confianca ?? 0;
    // leitura fraca: os avisos (mês, empresa) não são confiáveis; o item fica só como sugestão
    if (confianca < (+O.confiancaMinima || 70)) analise.avisos = analise.avisos.filter(a => a.tipo === 'outroSetor');
    return { hash, analise, ocr: true, confianca };
  }
  async function analisarArquivo(f, ctx) {
    const x = extDe(f.name), buf = await f.arrayBuffer(), hash = await hashDe(buf);
    if (/^(jpe?g|png|webp|bmp|gif)$/.test(x)) return lerPorOcr(f, ctx, hash);
    const dec = (u8) => new TextDecoder('utf-8').decode(u8);
    if (x === 'xml') return { hash, analise: E.analisarDocumentoCliente({ nome: f.name, xml: dec(buf) }, S.rules, ctx) };
    if (x === 'ofx') {   // extrato OFX (texto; bancos antigos mandam em windows-1252)
      let t = dec(buf); if ((t.match(/\uFFFD/g) || []).length > 3) t = new TextDecoder('windows-1252').decode(buf);
      return { hash, analise: E.analisarDocumentoCliente({ nome: f.name, texto: t }, S.rules, ctx) };
    }
    if (x === 'zip') {   // ZIP de notas (XML): lê cada nota de dentro; o ZIP vai inteiro para o escritório
      const XLSX = await carregarXlsx();
      const cfb = XLSX.CFB.read(new Uint8Array(buf), { type: 'array' });
      const xs = cfb.FileIndex.filter(e => /\.xml$/i.test(e.name) && e.content?.length).slice(0, 1000)
        .map(e => E.analisarDocumentoCliente({ nome: e.name, xml: dec(e.content instanceof Uint8Array ? e.content : new Uint8Array(e.content)) }, S.rules, ctx));
      const r = E.resumirVarias(xs);
      return r ? { hash, analise: r } : { hash, semTexto: true };
    }
    if (/^(pdf|xlsx|xls|csv|ods|txt|docx|odt)$/.test(x)) {
      const r = await readFile(f, null, { ocr: false });
      const texto = String(r?.texto || '').trim();
      if (texto.length < 40) return x === 'pdf' ? lerPorOcr(f, ctx, hash) : { hash, semTexto: true };   // PDF escaneado (imagem): OCR
      return { hash, analise: E.analisarDocumentoCliente({ nome: f.name, texto }, S.rules, ctx) };
    }
    return { hash, semTexto: true };
  }
  function ctxAnalise(setor, comp, itens) {
    const outras = (P.empresasDoLogin?.() || []).map(e => e.nome).filter(n => n && n !== empresa());
    const cnpj = (S.plat.sol?.itens || []).find(i => i.empresa === empresa() && i.empresaCnpj)?.empresaCnpj || '';
    return { empresa: empresa(), empresaCnpj: cnpj, outrasEmpresas: outras, competencia: comp, itensDoSetor: itens, setor };
  }
  /** Tira o arquivo de onde ele estiver (itens e "não reconhecidos", de qualquer competência). */
  function tirarDeTudo(f) {
    for (const [k, l] of [...env.arquivos]) if (l.includes(f)) { const n = l.filter(x => x !== f); if (n.length) env.arquivos.set(k, n); else env.arquivos.delete(k); }
    for (const [k, l] of [...env.semItem]) if (l.includes(f)) { const n = l.filter(x => x !== f); if (n.length) env.semItem.set(k, n); else env.semItem.delete(k); }
  }
  const porNoItem = (comp, id, f) => { tirarDeTudo(f); const k = chaveArq(comp, id); env.arquivos.set(k, [...(env.arquivos.get(k) || []), f]); };
  const porSemItem = (setor, comp, f) => { tirarDeTudo(f); const k = chaveSem(setor, comp); env.semItem.set(k, [...(env.semItem.get(k) || []), f]); };
  const tirarArquivo = (f) => { tirarDeTudo(f); env.leituras.delete(f); };
  /** Um arquivo igual a este que já está no envio (mesmo conteúdo, ou as mesmas notas): o primeiro fica, este sai. */
  function repetidoDe(f) {
    const info = env.leituras.get(f); if (!info) return null;
    const chaves = (a) => (a?.chaves || (a?.chave ? [a.chave] : [])).filter(Boolean);
    const minhas = chaves(info.analise);
    for (const g of [...env.arquivos.values(), ...env.semItem.values()].flat()) {
      if (g === f) continue;
      const outra = env.leituras.get(g); if (!outra || outra.estado === 'lendo') continue;
      if (info.hash && outra.hash === info.hash) return g;
      const delas = new Set(chaves(outra.analise));
      if (minhas.length && minhas.every(c => delas.has(c))) return g;   // a mesma nota (ou todas as notas do ZIP) já está no envio
    }
    return null;
  }
  /** Onde está um arquivo: { comp, item } (item null = "não reconhecidos"). */
  function ondeEsta(f) {
    for (const [k, l] of env.arquivos) if (l.includes(f)) { const p = k.split('|'); return { comp: p[p.length - 2], item: p[p.length - 1] }; }
    for (const [k, l] of env.semItem) if (l.includes(f)) { const p = k.split('|'); return { comp: p[p.length - 1], item: null }; }
    return null;
  }
  /** Junta arquivos ao envio. Sem item (soltos na área geral): a leitura escolhe o item; com item: vai para ele e a leitura só confere. */
  async function lerParaEnvio(files, setor, comp, itemFixo = null) {
    const ja = [...env.arquivos.values(), ...env.semItem.values()].flat();
    const novos = [...files].filter(f => f && f.size && !ja.some(x => mesmo(x, f)));
    if (!novos.length) return;
    for (const f of novos) {
      if (itemFixo) porNoItem(comp, itemFixo, f); else porSemItem(setor, comp, f);
      env.leituras.set(f, { estado: leituraAtiva() ? 'lendo' : 'ok', auto: false });
    }
    if (!leituraAtiva()) { renderEnviar(); return; }
    const itens = E.itensDoSetor(S.rules, setor, comp, { naoSeAplica: fixas() });
    const ctx = ctxAnalise(setor, comp, itens);
    env.lendo = { n: 0, m: novos.length + (env.lendo ? env.lendo.m - env.lendo.n : 0) };
    renderEnviar();
    let duvidasNovas = 0;
    for (const f of novos) {
      let r; try { r = env.leituras.get(f)?.pulado ? { semTexto: true } : await analisarArquivo(f, ctx); } catch { r = { semTexto: true }; }
      const info = env.leituras.get(f);
      if (info) {   // pode ter sido tirado enquanto lia
        Object.assign(info, { estado: r.semTexto || info.pulado ? 'semTexto' : 'ok', analise: info.pulado ? null : (r.analise || null), hash: r.hash || '', ocr: !!r.ocr, confianca: r.confianca });
        // 2.49: repetido (mesmo conteúdo ou as mesmas notas de outro arquivo do envio): fica só o primeiro; este sai e o cliente é avisado
        const igual = repetidoDe(f);
        if (igual) {
          const onde = ondeEsta(f);
          tirarDeTudo(f);
          env.descartados.push({ f, igual, empresa: empresa(), comp: onde?.comp || comp, setor });
          if (env.lendo) env.lendo.n++;
          if (S.view === 'enviar') renderEnviar();
          continue;
        }
        const alvo = info.analise?.item;
        // lido por OCR: só entra sozinho no item com leitura boa e muitas palavras do item; senão fica como sugestão ("Colocar em …")
        const seguro = !r.ocr || ((r.confianca || 0) >= (+OCR().confiancaMinima || 70) && (info.analise?.conf || 0) >= 0.7);
        // 2.50: com certeza, entra sozinho; na dúvida (poucas palavras, empate ou leitura de imagem fraca), entra no item mais provável
        // marcado "confira" e o cliente confirma ou muda no quadro "Está certo?"
        if (!itemFixo && alvo && itens.some(i => i.id === alvo) && !doMesDe(comp, alvo) && semItemDe(setor, comp).includes(f)) {
          const duvida = !!info.analise?.duvida || !seguro;
          porNoItem(comp, alvo, f); info.auto = !duvida; info.duvida = duvida;
          if (duvida) duvidasNovas++;
        }
      }
      if (env.lendo) env.lendo.n++;
      if (S.view === 'enviar') renderEnviar();
    }
    if (env.lendo && env.lendo.n >= env.lendo.m) env.lendo = null;
    if (duvidasNovas) toast((TL().duvidaToast || 'Coloquei {n} arquivo(s) com dúvida: confira.').replace('{n}', duvidasNovas));
    if (S.view === 'enviar') renderEnviar();
  }
  // soltar em qualquer lugar da tela Enviar documentos = soltar na área geral (só com a leitura ligada nas regras)
  P.soltarNoEnvio = (files) => { if (leituraAtiva() && files?.length) lerParaEnvio(files, setorAtual(), env.competencia); };
  /** Avisos dos arquivos desta competência: outro mês, outra empresa, outro setor e repetidos (mesmo conteúdo ou mesma nota). */
  function avisosDoMes(setor, comp, itens) {
    const lista = [...itens.flatMap(it => arquivosDe(comp, it.id).map(f => ({ f, item: it.id }))), ...semItemDe(setor, comp).map(f => ({ f, item: null }))];
    const out = [];
    const rep = E.notasRepetidas(lista.map(({ f }) => { const a = env.leituras.get(f)?.analise; return { id: f, chaves: [env.leituras.get(f)?.hash, ...(a?.chaves || (a?.chave ? [a.chave] : []))].filter(Boolean) }; }));
    for (const { f, item } of lista) {
      const info = env.leituras.get(f); if (!info || info.ok) continue;
      for (const av of info.analise?.avisos || []) if (av.tipo !== 'outroSetor' || item) out.push({ f, item, av });
      if (rep.has(f)) out.push({ f, item, av: { tipo: 'repetido', texto: (TL().repetido || 'Este arquivo repete {outro}.').replace('{outro}', `“${rep.get(f).name}”`) } });
    }
    // 2.48: buracos na numeração das notas que a empresa emitiu (pode ser nota cancelada: o cliente marca "Está certo")
    const idSaida = cfg().leitura?.nf?.saida || 'nf-saida';
    const notas = arquivosDe(comp, idSaida).flatMap(f => { const a = env.leituras.get(f)?.analise; return a?.notas || (a?.nota ? [a.nota] : []); });
    for (const g of E.faltasNaSequencia(notas, +cfg().leitura?.sequenciaMax || 30)) {
      const chave = `${empresa()}|${comp}|${g.tipo}|${g.serie}|${g.faltam.join(',')}`;
      if (env.avisosOk?.has(chave)) continue;
      const nums = g.faltam.length > 8 ? `${g.faltam.slice(0, 8).join(', ')}…` : g.faltam.join(', ');
      out.push({ f: null, item: idSaida, av: { tipo: 'sequencia', chave, texto: (TL().sequencia || 'Entre as notas nº {de} e {ate} faltam: {faltam}. Se foram canceladas, está tudo certo; senão, anexe-as.').replace('{de}', g.de).replace('{ate}', g.ate).replace('{faltam}', nums) } });
    }
    return out;
  }
  const gravarNaoAplica = () => chrome.storage.local.set({ docsNaoSeAplica: env.naoAplica = env.naoAplica.slice(-MAX_CHAVES) });
  /** O que já foi enviado desta competência para o setor (deste computador). */
  function enviadosDoSetor(comp, setor) {
    const mes = env.enviados[chaveMes(comp)] || {};
    return Object.fromEntries(Object.entries(mes).filter(([, v]) => (v?.setores || []).includes(setor)));
  }
  /** Envios reconhecidos no portal pelo assunto padronizado (vale também para o que foi enviado em outro computador). */
  function noPortal(setor) {
    const itens = S.plat.sol?.itens ? E.filtrarPorEmpresa(S.plat.sol.itens, '', empresa()) : [];
    return E.enviosNoPortal(itens, S.rules).filter(x => x.setor === setor);
  }
  const ROT = { enviado: 'Enviado', parcial: 'Em parte', atrasado: 'Atrasado', pendente: 'A enviar', aberto: 'Mês em curso', semregistro: 'Sem registro' };
  const nomeMes = (ano, mes) => new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  function situacao(setor, c, portal) {
    const itens = E.itensDoSetor(S.rules, setor, c.competencia, { naoSeAplica: fixas() });
    const disp = itens.filter(it => doMesDe(c.competencia, it.id)).map(it => it.id);
    const sit = E.situacaoCompetencia(itens, enviadosDoSetor(c.competencia, setor), { dispensados: disp, limite: c.limite, hoje: E.today(), noPortal: portal.some(x => x.competencia === c.competencia) });
    // o mês corrente ainda está acontecendo: nada a cobrar
    if (c.corrente && sit.estado === 'pendente') sit.estado = 'aberto';
    // meses antigos sem nada registrado neste computador: não dá para dizer que estão atrasados (a extensão pode ter sido instalada depois)
    if (sit.estado === 'atrasado' && !sit.parcial && c.competencia !== E.competenciaSugerida(S.rules, E.today())) sit.estado = 'semregistro';
    return { itens, sit };
  }

  function renderEnviar() {
    const setor = setorAtual();
    const def = E.setorDef(S.rules, setor);
    if (!setor || !(cfg().itens || []).some(i => (i.setores || []).includes(setor))) {
      viewEl.innerHTML = `<div class="pn-card"><div class="pn-card-body"><p class="muted" style="margin:0">Ainda não há lista de documentos para este setor. O escritório define a lista nas regras do Assistente.</p></div></div>`;
      return;
    }
    const comps = E.competenciasDoSetor(S.rules, E.today());
    if (!comps.some(c => c.competencia === env.competencia)) env.competencia = E.competenciaSugerida(S.rules, E.today());
    const portal = noPortal(setor);
    const meses = comps.map(c => ({ c, ...situacao(setor, c, portal) }));
    const atual = meses.find(m => m.c.competencia === env.competencia) || meses[0];
    const comp = atual.c.competencia;
    const enviados = enviadosDoSetor(comp, setor);
    const doPortal = portal.filter(x => x.competencia === comp);
    const emps = P.empresasDoLogin?.() || [];
    const T = cfg().textos || {};

    // opções para mudar o arquivo de item (só os itens desta competência que não foram dispensados)
    const opcoesItens = (atualId) => atual.itens.filter(i => !doMesDe(comp, i.id)).map(i => `<option value="${esc(i.id)}"${i.id === atualId ? ' selected' : ''}>${esc(i.rotulo)}</option>`).join('');
    // arquivos que dá para abrir no visualizador (clicar no nome): índice → File, só nesta tela
    const naTela = []; const reg = (f) => { naTela.push(f); return naTela.length - 1; };
    const nomeArq = (f) => `<button type="button" class="env-arq-n" data-ver-arq="${reg(f)}" title="Abrir ${esc(f.name)} aqui para conferir">${esc(f.name)}</button>`;
    const rotLeitura = (f) => {
      const info = env.leituras.get(f); if (!info) return '';
      if (info.estado === 'lendo') return `<small class="env-lido lendo">${icon('refresh', 'ic-sm')} <span data-lendo="${idDe(f)}">lendo…</span></small><button type="button" class="btn btn-sm btn-ghost env-pular" data-pular-leitura="${idDe(f)}" title="Não esperar a leitura: você escolhe o item">${esc(TL().pular || 'Pular a leitura')}</button>`;
      if (info.estado === 'semTexto') return `<small class="env-lido">${esc(info.pulado ? (TL().pulado || 'leitura pulada: escolha o item') : (TL().semTexto || 'imagem ou PDF escaneado (sem texto)'))}</small>`;
      const a = info.analise; if (!a) return '';
      return `<small class="env-lido">${info.duvida ? '<span class="chip warn" title="Coloquei aqui por ser o mais provável: confira">confira</span>' : info.auto ? '<span class="chip ok">reconhecido</span>' : ''}${info.ocr ? `<span class="chip" title="Lido de uma imagem (OCR): confira">imagem${info.confianca != null ? ` · ${info.confianca}%` : ''}</span>` : ''}${esc(a.resumo || '')}</small>`;
    };
    const chipArquivo = (f, i, itemId) => `<div class="env-arq">${icon('clip', 'ic-sm')}${nomeArq(f)}${rotLeitura(f)}
      ${leituraAtiva() ? `<select class="env-mover" data-mover-de="${esc(itemId || '')}" data-i="${i}" aria-label="Mudar ${esc(f.name)} de item"><option value="" disabled>Mudar para…</option>${opcoesItens(itemId)}</select>` : ''}
      <button type="button" class="icon-btn" data-tirar="${i}" aria-label="Tirar ${esc(f.name)}">${icon('x', 'ic-sm')}</button></div>`;
    const linha = (it) => {
      const arqs = arquivosDe(comp, it.id), env1 = enviados[it.id], disp = doMesDe(comp, it.id);
      const estado = disp ? 'disp' : arqs.length ? 'pronto' : env1 ? 'ok' : '';
      const outros = (it.setores || []).filter(s => s !== setor).map(s => E.setorDef(S.rules, s).rotulo || s);
      return `<div class="env-i ${estado}" data-item="${esc(it.id)}">
        <span class="env-i-st" aria-hidden="true">${disp ? '' : env1 || arqs.length ? icon('check', 'ic-sm') : ''}</span>
        <div class="env-i-tx">
          <div class="env-i-t"><b>${esc(it.rotulo)}</b>${it.dica ? `<button type="button" class="dica-i" data-tip="${esc(it.dica)}" title="${esc(it.dica)}" aria-label="${esc(`O que enviar: ${it.dica}`)}">${icon('info', 'ic-sm')}</button>` : ''}${outros.length && !disp ? `<span class="env-tb" title="Este documento também serve ao ${esc(outros.join(' e '))}">também ${esc(outros.join(' e '))}</span>` : ''}${disp ? `<span class="env-tb">não tenho neste mês</span><button type="button" class="env-desfazer" data-na-desfazer>desfazer</button>` : ''}</div>
          ${env1 && !disp ? `<small class="env-ok">${icon('check', 'ic-sm')} Enviado em ${esc(E.fmtDate(new Date(env1.quando)))} (${plural(env1.n || 1, 'arquivo', 'arquivos')}). Pode anexar mais e enviar um complemento.</small>` : ''}
          ${arqs.length ? `<div class="env-arqs">${arqs.map((f, i) => chipArquivo(f, i, it.id)).join('')}</div>` : ''}
        </div>
        <div class="env-i-ac">
          ${disp ? '' : `<button type="button" class="btn btn-sm" data-anexar>${icon('plus', 'ic-sm')} ${arqs.length ? 'Anexar mais' : 'Anexar'}</button><input type="file" multiple hidden>`}
          <details class="env-mais"><summary class="icon-btn" aria-label="Mais opções de ${esc(it.rotulo)}" title="Mais opções">${icon('more', 'ic-sm')}</summary>
            <div class="env-menu" role="menu">
              <label class="env-na" title="Este documento não existe neste mês (ex.: não houve compra)"><input type="checkbox" data-na ${disp ? 'checked' : ''}> Não tenho neste mês</label>
              <button type="button" class="env-nunca" data-nunca title="Tira este item da lista desta empresa em todos os meses (dá para voltar atrás no fim da página)">Esta empresa nunca tem</button>
              ${it.dica ? `<div class="env-menu-dica"><b>O que enviar aqui</b>${esc(it.dica)}</div>` : ''}
            </div></details>
        </div>
      </div>`;
    };
    const comArq = atual.itens.filter(it => arquivosDe(comp, it.id).length);
    const nArq = comArq.reduce((n, it) => n + arquivosDe(comp, it.id).length, 0);
    const faltam = atual.itens.filter(it => it.obrigatorio && !comArq.includes(it) && !enviados[it.id] && !doMesDe(comp, it.id));
    // "Enviar também para": os setores dos itens anexados que servem a mais de um já vêm marcados (o cliente decide)
    const outrosSetores = E.setoresAtivos(S.rules).filter(s => s !== setor);
    const sugeridos = E.setoresSugeridos(S.rules, comArq, setor);
    const chaveTambem = `${empresa()}|${setor}|${comp}`;
    const tambem = (env.tambem?.chave === chaveTambem ? env.tambem.setores : sugeridos).filter(s => outrosSetores.includes(s));
    const dispensadosFixos = (cfg().itens || []).filter(i => (i.setores || []).includes(setor) && fixaDe(i.id));
    const semItem = semItemDe(setor, comp);
    const descartados = env.descartados.filter(d => d.empresa === empresa() && d.comp === comp);
    const duvidas = atual.itens.flatMap(it => arquivosDe(comp, it.id).filter(f => env.leituras.get(f)?.duvida && env.leituras.get(f)?.estado !== 'lendo').map(f => ({ f, item: it })));
    const avisos = leituraAtiva() ? avisosDoMes(setor, comp, atual.itens) : [];
    const lendoAgora = [...atual.itens.flatMap(it => arquivosDe(comp, it.id)), ...semItem].some(f => env.leituras.get(f)?.estado === 'lendo');
    const guardarRolagem = viewEl.scrollTop;

    const idx = meses.indexOf(atual);
    const maisNovo = meses[idx - 1], maisVelho = meses[idx + 1];   // a lista vem do mês mais recente para o mais antigo
    const obrig = atual.itens.filter(i => i.obrigatorio), opc = atual.itens.filter(i => !i.obrigatorio);
    const pct = atual.sit.total ? Math.round(100 * atual.sit.feitos / atual.sit.total) : 0;
    const nomeLongo = (c) => { const t = new Date(c.ano, c.mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' '); return t[0].toUpperCase() + t.slice(1); };
    viewEl.innerHTML = `
      <section class="env-card">
        <div class="env-cab" id="env-cab">
          <div class="env-nav" role="group" aria-label="Competência">
            <button type="button" class="env-nav-bt" ${maisVelho ? `data-comp-ir="${maisVelho.c.competencia}"` : 'disabled'} aria-label="Mês anterior">${icon('left', 'ic-sm')}</button>
            <span class="env-mes on st-${atual.sit.estado}" data-comp="${comp}"><b>${esc(nomeLongo(atual.c))}</b></span>
            <button type="button" class="env-nav-bt" ${maisNovo ? `data-comp-ir="${maisNovo.c.competencia}"` : 'disabled'} aria-label="Mês seguinte">${icon('right', 'ic-sm')}</button>
          </div>
          <span class="pill env-pill st-${atual.sit.estado}">${esc(ROT[atual.sit.estado] || 'Em andamento')}</span>
          <small class="env-cab-i">${atual.c.limite ? `enviar até ${esc(E.fmtDate(atual.c.limite))}` : ''}${atual.sit.total ? ` · ${atual.sit.feitos} de ${atual.sit.total} ${atual.sit.total === 1 ? 'obrigatório enviado' : 'obrigatórios enviados'}` : ''}${doPortal.length ? ` · no portal: nº ${esc(doPortal.map(x => x.numero).filter(Boolean).join(', ') || '—')}` : ''}</small>
          <span class="spacer"></span>
          <details class="env-outros"><summary class="btn btn-sm btn-ghost">Outros meses ▾</summary>
            <div class="env-outros-l" role="menu">${meses.map(m => `<button type="button" class="env-op st-${m.sit.estado}${m.c.competencia === comp ? ' on' : ''}" data-comp-ir="${m.c.competencia}"><b>${esc(nomeMes(m.c.ano, m.c.mes))} ${m.c.ano}</b><span>${esc(ROT[m.sit.estado] || 'Em andamento')}</span></button>`).join('')}</div></details>
          <span class="env-emp" title="Empresa">${icon('briefcase', 'ic-sm')}<span>${esc(P.apelidoDe?.(empresa()) || empresa() || 'Empresa')}</span>${emps.length > 1 ? '<button type="button" class="btn btn-sm btn-ghost" id="env-trocar">Trocar</button>' : ''}</span>
        </div>
        ${atual.sit.total ? `<div class="env-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Obrigatórios enviados"><i style="width:${pct}%"></i></div>` : ''}
        ${atual.sit.semDetalhe ? `<div class="aviso-linha">${icon('info')}<span>Esta competência já foi enviada (solicitação nº ${esc(doPortal[0]?.numero || '')} no portal), provavelmente em outro computador. Aqui não tenho o detalhe de quais documentos foram.</span></div>` : ''}
        ${leituraAtiva() ? `<div class="env-solta" id="env-solta" role="button" tabindex="0"><span class="env-solta-ic">${icon('upload')}</span><div><b>${esc(TL().solteCurto || 'Solte aqui os documentos do mês')}</b><small>${esc(TL().solteDica || 'Eu leio no seu computador e separo por item. Ou clique para escolher os arquivos.')}</small></div><input type="file" multiple hidden id="env-solta-inp"></div>
          ${env.lendo ? `<div class="env-lendo" role="status">${icon('refresh', 'ic-sm')} Lendo os arquivos… ${env.lendo.n} de ${env.lendo.m}</div>` : ''}` : ''}
        ${semItem.length ? `<div class="env-sem"><h4>${esc(TL().naoReconheci || 'Não reconheci estes arquivos: escolha o item de cada um.')}</h4>${semItem.map((f, i) => {
          const info = env.leituras.get(f), os = info?.analise?.outroSetor;
          return `<div class="env-arq env-sem-i">${icon('clip', 'ic-sm')}${nomeArq(f)}${info?.estado === 'lendo' ? rotLeitura(f) : `<small class="env-lido">${esc(os ? `Parece ser “${os.rotulo}” (${os.setores.join(' e ')})` : info?.estado === 'semTexto' ? (info.pulado ? (TL().pulado || 'leitura pulada') : (TL().semTexto || 'sem texto')) : info?.sugestao ? (TL().sugestaoOcr || 'Lido em imagem: confira o item.') : (info?.analise?.resumo || 'não reconhecido'))}</small>`}
            ${info?.sugestao && atual.itens.some(x => x.id === info.sugestao) ? `<button type="button" class="btn btn-sm btn-primary" data-sug-item="${i}">${esc((TL().colocarEm || 'Colocar em “{rotulo}”').replace('{rotulo}', atual.itens.find(x => x.id === info.sugestao).rotulo))}</button>` : ''}
            <select class="env-mover" data-sem="${i}" aria-label="Escolher o item de ${esc(f.name)}"><option value="" selected disabled>Escolha o item…</option>${opcoesItens('')}</select>
            <button type="button" class="icon-btn" data-sem-tirar="${i}" aria-label="Tirar ${esc(f.name)}">${icon('x', 'ic-sm')}</button></div>`;
        }).join('')}</div>` : ''}
        ${duvidas.length ? `<div class="env-duv" id="env-duv" role="status"><h4>${icon('alert', 'ic-sm')} ${esc((TL().duvidas || 'Coloquei {n} arquivo(s) onde acho que vão. Está certo?').replace('{n}', duvidas.length))}${duvidas.length > 1 ? `<span class="spacer"></span><button type="button" class="btn btn-sm" id="env-duv-todos">Está tudo certo</button>` : ''}</h4>${duvidas.map((d, n) => `<div class="env-duv-i">${nomeArq(d.f)}<small class="env-lido">em <b>${esc(d.item.rotulo)}</b></small><span class="spacer"></span>
            <button type="button" class="btn btn-sm btn-primary" data-duv-ok="${n}">Está certo</button>
            <select class="env-mover" data-duv-mover="${n}" aria-label="Mudar ${esc(d.f.name)} de item"><option value="" selected disabled>Mudar para…</option>${opcoesItens('')}</select></div>`).join('')}</div>` : ''}
        ${descartados.length ? `<div class="env-desc" id="env-desc" role="status"><h4>${icon('copy', 'ic-sm')} ${esc((TL().descartados || 'Não incluí {n} arquivo(s) repetido(s): já há um igual no envio.').replace('{n}', descartados.length))}<span class="spacer"></span><button type="button" class="btn btn-sm" id="env-desc-ok">Entendi</button></h4>${descartados.map((d, n) => `<div class="env-arq env-desc-i">${icon('clip', 'ic-sm')}${nomeArq(d.f)}<small class="env-lido">igual a “${esc(d.igual.name)}”</small><button type="button" class="btn btn-sm btn-ghost" data-desc-incluir="${n}">Incluir mesmo assim</button></div>`).join('')}</div>` : ''}
        ${avisos.length ? `<div class="env-avisos" id="env-avisos"><h4>${icon('alert', 'ic-sm')} Confira antes de enviar</h4>${avisos.map((a, n) => `<div class="env-av env-av-${esc(a.av.tipo)}"><div><b>${esc(a.f ? a.f.name : (atual.itens.find(i => i.id === a.item)?.rotulo || ''))}</b><span>${esc(a.av.texto)}</span></div><div class="env-av-ac">
            ${a.av.tipo === 'competencia' && comps.some(c => c.competencia === a.av.competencia) ? `<button type="button" class="btn btn-sm" data-av-mover="${n}">Mover para ${esc(a.av.competencia)}</button>` : ''}
            ${['empresa', 'repetido'].includes(a.av.tipo) ? `<button type="button" class="btn btn-sm" data-av-tirar="${n}">Tirar</button>` : ''}
            <button type="button" class="btn btn-sm btn-ghost" data-av-ok="${n}">Está certo</button></div></div>`).join('')}</div>` : ''}
        ${obrig.length ? `<h4 class="env-grupo">Obrigatório</h4><div class="env-lista">${obrig.map(linha).join('')}</div>` : ''}
        ${opc.length ? `<h4 class="env-grupo">Se houver no mês</h4><div class="env-lista">${opc.map(linha).join('')}</div>` : ''}
        ${atual.itens.length ? '' : '<p class="muted" style="margin:12px 0">Nenhum documento nesta competência.</p>'}
      </section>
      <div id="copias-pend"></div>
      ${dispensadosFixos.length ? `<details class="env-fixos"><summary>${plural(dispensadosFixos.length, 'documento que não se aplica', 'documentos que não se aplicam')} a esta empresa</summary>
        ${dispensadosFixos.map(i => `<div class="env-fixo"><span>${esc(i.rotulo)}</span><button type="button" class="btn btn-sm" data-voltar="${esc(i.id)}">Voltar para a lista</button></div>`).join('')}</details>` : ''}
      <div class="env-rodape">
        <span class="env-resumo" id="env-resumo">${nArq ? `<b>${plural(nArq, 'arquivo', 'arquivos')}</b> em ${plural(comArq.length, 'item', 'itens')}${faltam.length ? ` · ainda falta: ${esc(faltam.map(f => f.rotulo).join('; '))}` : ' · nenhum obrigatório faltando'}` : 'Anexe os documentos e envie tudo de uma vez (ou em partes).'}${semItem.length ? ` · ${plural(semItem.length, 'arquivo sem item não vai', 'arquivos sem item não vão')} junto` : ''}${duvidas.length ? ` · ${plural(duvidas.length, 'arquivo para confirmar o item', 'arquivos para confirmar o item')}` : ''}${lendoAgora ? ' · esperando a leitura terminar' : ''}</span>
        ${outrosSetores.length ? `<span class="env-tambem" title="Depois que o portal salvar a solicitação do ${esc(def.rotulo || setor)}, eu abro uma cópia para cada setor marcado, com o mesmo assunto, a mesma lista e os mesmos anexos. Você confere e envia cada uma.">Enviar também ao${outrosSetores.map(s => `<label><input type="checkbox" data-tambem="${esc(s)}" ${tambem.includes(s) ? 'checked' : ''}> ${esc(rot(s))}</label>`).join('')}</span>` : ''}
        <button type="button" class="btn btn-primary" id="env-enviar" ${nArq && !lendoAgora ? '' : 'disabled'}>${icon('fill', 'ic-sm')} Conferir e enviar ao escritório</button>
      </div>`;

    // ---- ligações
    viewEl.querySelectorAll('[data-comp-ir]').forEach(b => b.addEventListener('click', () => { env.competencia = b.dataset.compIr; renderEnviar(); }));
    // menus "⋯" e "Outros meses": um aberto por vez; fecha ao clicar fora
    const menus = [...viewEl.querySelectorAll('details.env-mais, details.env-outros')];
    menus.forEach(d => d.addEventListener('toggle', () => { if (d.open) menus.forEach(o => { if (o !== d) o.open = false; }); }));
    viewEl.addEventListener('click', (e) => menus.forEach(d => { if (d.open && !d.contains(e.target)) d.open = false; }));
    $('#env-trocar')?.addEventListener('click', async () => { await P.escolherEmpresa?.({ tipo: null }); renderEnviar(); });
    viewEl.querySelectorAll('.env-i').forEach(el => {
      const id = el.dataset.item, k = chaveArq(comp, id);
      const juntar = (files) => lerParaEnvio(files, setor, comp, id);   // vai para este item; a leitura só confere (mês, empresa, repetido)
      const inp = el.querySelector('input[type=file]');
      el.querySelector('[data-anexar]')?.addEventListener('click', () => inp.click());
      inp?.addEventListener('change', () => { juntar(inp.files); inp.value = ''; });
      el.addEventListener('dragover', (e) => { if (![...(e.dataTransfer?.types || [])].includes('Files') || doMesDe(comp, id)) return; e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', (e) => { if (doMesDe(comp, id)) return; e.preventDefault(); el.classList.remove('over'); juntar(e.dataTransfer?.files || []); });
      el.querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', () => { const f = arquivosDe(comp, id)[+b.dataset.tirar]; if (f) tirarArquivo(f); renderEnviar(); }));
      el.querySelectorAll('select[data-mover-de]').forEach(sel => sel.addEventListener('change', () => { const f = arquivosDe(comp, id)[+sel.dataset.i]; if (f && sel.value && sel.value !== id) { porNoItem(comp, sel.value, f); const info = env.leituras.get(f); if (info) { info.auto = false; info.duvida = false; } } renderEnviar(); }));
      el.querySelector('[data-na]')?.addEventListener('change', (e) => {
        const chave = `${empresa()}|${comp}|${id}`;
        env.naoAplica = e.target.checked ? [...new Set([...env.naoAplica, chave])] : env.naoAplica.filter(x => x !== chave);
        if (e.target.checked) env.arquivos.delete(k);
        gravarNaoAplica(); renderEnviar();
      });
      el.querySelector('[data-na-desfazer]')?.addEventListener('click', () => {
        env.naoAplica = env.naoAplica.filter(x => x !== `${empresa()}|${comp}|${id}`); gravarNaoAplica(); renderEnviar();
      });
      el.querySelector('[data-nunca]')?.addEventListener('click', () => {
        env.naoAplica = [...new Set([...env.naoAplica, `${empresa()}|${id}`])]; env.arquivos.delete(k);
        gravarNaoAplica(); renderEnviar(); toast('Tirei este documento da lista desta empresa. Para voltar, veja no fim da página.');
      });
    });
    // área geral: solta tudo e a leitura separa por item
    const solta = $('#env-solta');
    if (solta) {
      const inp = $('#env-solta-inp');
      solta.addEventListener('click', (e) => { if (e.target !== inp) inp.click(); });
      solta.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
      inp.addEventListener('change', () => { lerParaEnvio(inp.files, setor, comp); inp.value = ''; });
      solta.addEventListener('dragover', (e) => { if (![...(e.dataTransfer?.types || [])].includes('Files')) return; e.preventDefault(); solta.classList.add('over'); });
      solta.addEventListener('dragleave', () => solta.classList.remove('over'));
      solta.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); solta.classList.remove('over'); lerParaEnvio(e.dataTransfer?.files || [], setor, comp); });
    }
    viewEl.querySelectorAll('[data-ver-arq]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); const f = naTela[+b.dataset.verArq]; if (f) P.verArquivoLocal?.(f); }));
    const confirmar = (d) => { const info = env.leituras.get(d.f); if (info) { info.duvida = false; info.auto = true; } };
    viewEl.querySelectorAll('[data-duv-ok]').forEach(b => b.addEventListener('click', () => { const d = duvidas[+b.dataset.duvOk]; if (d) confirmar(d); renderEnviar(); }));
    $('#env-duv-todos')?.addEventListener('click', () => { duvidas.forEach(confirmar); renderEnviar(); });
    viewEl.querySelectorAll('select[data-duv-mover]').forEach(sel => sel.addEventListener('change', () => {
      const d = duvidas[+sel.dataset.duvMover]; if (!d || !sel.value) return;
      if (sel.value !== d.item.id) porNoItem(comp, sel.value, d.f);
      const info = env.leituras.get(d.f); if (info) { info.duvida = false; info.auto = false; }
      renderEnviar();
    }));
    viewEl.querySelectorAll('[data-desc-incluir]').forEach(b => b.addEventListener('click', () => {
      const d = descartados[+b.dataset.descIncluir]; if (!d) return;
      env.descartados = env.descartados.filter(x => x !== d);
      const onde = ondeEsta(d.igual);   // vai para o mesmo lugar do que ficou
      if (onde?.item) porNoItem(onde.comp, onde.item, d.f); else porSemItem(setor, onde?.comp || comp, d.f);
      const info = env.leituras.get(d.f); if (info) info.ok = true;   // o cliente quis os dois: sem o aviso de repetido
      renderEnviar();
    }));
    $('#env-desc-ok')?.addEventListener('click', () => { env.descartados = env.descartados.filter(d => !descartados.includes(d)); descartados.forEach(d => env.leituras.delete(d.f)); renderEnviar(); });
    viewEl.querySelectorAll('[data-sug-item]').forEach(b => b.addEventListener('click', () => { const f = semItem[+b.dataset.sugItem]; const info = f && env.leituras.get(f); if (info?.sugestao) porNoItem(comp, info.sugestao, f); renderEnviar(); }));
    viewEl.querySelectorAll('[data-pular-leitura]').forEach(b => b.addEventListener('click', () => {
      const f = [...env.leituras.keys()].find(x => idDe(x) === +b.dataset.pularLeitura); const info = f && env.leituras.get(f); if (!info) return;
      info.pulado = true; if (info.ocrEmCurso) cancelarLeituraAtual();   // OCR em andamento: para agora
    }));
    viewEl.querySelectorAll('select[data-sem]').forEach(sel => sel.addEventListener('change', () => { const f = semItem[+sel.dataset.sem]; if (f && sel.value) porNoItem(comp, sel.value, f); renderEnviar(); }));
    viewEl.querySelectorAll('[data-sem-tirar]').forEach(b => b.addEventListener('click', () => { const f = semItem[+b.dataset.semTirar]; if (f) tirarArquivo(f); renderEnviar(); }));
    viewEl.querySelectorAll('[data-av-mover]').forEach(b => b.addEventListener('click', () => {
      const a = avisos[+b.dataset.avMover]; if (!a) return;
      if (a.item) porNoItem(a.av.competencia, a.item, a.f); else porSemItem(setor, a.av.competencia, a.f);
      toast(`Movi “${a.f.name}” para a competência ${a.av.competencia}.`); renderEnviar();
    }));
    viewEl.querySelectorAll('[data-av-tirar]').forEach(b => b.addEventListener('click', () => { const a = avisos[+b.dataset.avTirar]; if (a) tirarArquivo(a.f); renderEnviar(); }));
    viewEl.querySelectorAll('[data-av-ok]').forEach(b => b.addEventListener('click', () => {
      const a = avisos[+b.dataset.avOk]; if (!a) return;
      if (!a.f) (env.avisosOk || (env.avisosOk = new Set())).add(a.av.chave);   // aviso do item (sequência): só nesta visita, na memória
      else { const info = env.leituras.get(a.f); if (info) info.ok = true; }
      renderEnviar();
    }));
    if (guardarRolagem) viewEl.scrollTop = guardarRolagem;
    viewEl.querySelectorAll('[data-voltar]').forEach(b => b.addEventListener('click', () => { env.naoAplica = env.naoAplica.filter(x => x !== `${empresa()}|${b.dataset.voltar}`); gravarNaoAplica(); renderEnviar(); }));
    viewEl.querySelectorAll('[data-tambem]').forEach(c => c.addEventListener('change', () => { env.tambem = { chave: chaveTambem, setores: [...viewEl.querySelectorAll('[data-tambem]:checked')].map(x => x.dataset.tambem) }; }));
    $('#env-enviar')?.addEventListener('click', () => enviarCompetencia(setor, comp, [...viewEl.querySelectorAll('[data-tambem]:checked')].map(x => x.dataset.tambem)));
    renderCopiasPend();
  }

  /** Abre a Solicitação Geral do setor já preenchida (departamento, assunto com a competência, descrição com a lista) e com os
   *  arquivos anexados, e mostra o resumo. Nada é enviado aqui: o cliente confere e clica em enviar. */
  async function enviarCompetencia(setor, comp, tambemPara = []) {
    const itens = E.itensDoSetor(S.rules, setor, comp, { naoSeAplica: fixas() });
    const comArq = itens.filter(it => arquivosDe(comp, it.id).length);
    if (!comArq.length) { toast('Anexe pelo menos um documento antes de enviar.'); return; }
    const ja = enviadosDoSetor(comp, setor);
    const dispMes = itens.filter(it => doMesDe(comp, it.id));
    const faltam = itens.filter(it => it.obrigatorio && !comArq.includes(it) && !ja[it.id] && !dispMes.includes(it));
    const complemento = !!Object.keys(ja).length || noPortal(setor).some(x => x.competencia === comp);
    const [pedido] = E.pedidosDoEnvio(S.rules, {
      setor, competencia: comp, complemento,
      enviados: comArq.map(it => ({ rotulo: it.rotulo, n: arquivosDe(comp, it.id).length, detalhe: E.detalheDoItem(arquivosDe(comp, it.id).map(f => env.leituras.get(f)?.analise)) })),
      faltam: faltam.map(it => it.rotulo), dispensados: dispMes.map(it => it.rotulo)
    });
    const bt = $('#env-enviar'); if (bt) { bt.disabled = true; bt.textContent = 'Abrindo a solicitação…'; }
    // o pedido começa limpo: só os arquivos deste envio, sem leitura (documento fiscal não precisa ser lido)
    S.work.geral = null;
    const W = A.w('geral');
    const arquivos = comArq.flatMap(it => arquivosDe(comp, it.id)).map(f => { const x = A.novoItem(f, 'painel'); x.status = 'nao-lido'; x.etapa = 'Documento do envio por competência'; x.progresso = 1; return x; });
    A.juntarArquivos(W, arquivos);
    W.copiarPara = tambemPara.filter(s => s !== setor);   // as cópias saem depois que o portal salvar esta
    S.plat.envioDocs = { empresa: empresa(), setor, competencia: comp, assunto: pedido.assunto, quando: Date.now(), itens: Object.fromEntries(comArq.map(it => [it.id, arquivosDe(comp, it.id).length])) };
    S.plat.escolher = false;
    A.setView('preencher');
    await P.novoPedido('geral', { valores: { assunto: pedido.assunto, descricao: pedido.descricao }, sugeridos: { departamento: pedido.departamento }, fonte: 'Enviar documentos', empresa: empresa() });
  }

  /** O portal salvou a solicitação do envio: marca os itens como enviados (só empresa, competência, id, quantidade e data). */
  function marcarEnvioDocs(tipo, valores) {
    const p = S.plat.envioDocs; if (!p || tipo !== 'geral') return;
    if (Date.now() - p.quando > 2 * 3600e3) { S.plat.envioDocs = null; return; }
    if (E.norm(valores?.assunto || '') !== E.norm(p.assunto)) return;   // outra Solicitação Geral, não a deste envio
    const k = `${p.empresa}|${p.competencia}`;
    const mes = { ...(env.enviados[k] || {}) };
    for (const [id, n] of Object.entries(p.itens)) {
      const a = mes[id];
      mes[id] = { quando: Date.now(), n: (a?.n || 0) + n, setores: [...new Set([...(a?.setores || []), p.setor])] };
      env.arquivos.delete(`${p.empresa}|${p.competencia}|${id}`);
    }
    env.enviados[k] = mes;
    const chaves = Object.keys(env.enviados);
    for (const velha of chaves.slice(0, Math.max(0, chaves.length - MAX_CHAVES))) delete env.enviados[velha];
    chrome.storage.local.set({ enviosDocs: env.enviados });
    S.plat.envioDocs = null;
    toast(`Documentos de ${p.competencia} enviados ao ${E.setorDef(S.rules, p.setor).rotulo || p.setor}: marquei na lista.`);
  }

  /* ---------- Cópias para outros setores (2.41) ----------
     A Solicitação Geral tem um só Departamento: "enviar também para" vira uma solicitação por setor. Depois que o portal salva a
     primeira, a extensão abre sozinha a próxima, já com o departamento do outro setor, o mesmo assunto, a mesma descrição (mais a
     linha "Cópia da solicitação enviada ao …") e os mesmos anexos. Quem envia cada uma é o cliente. */
  const linhaCopia = (origem) => E.renderTemplate(cfg().copiaParaOutroSetor || 'Cópia da solicitação enviada ao {setor}.', { setor: rot(origem) });
  /** Chamado por P.aoEnviar ANTES de marcarEnvioDocs: põe as cópias na fila (ou fecha a cópia que acabou de ser enviada). */
  function copiasAoEnviar(tipo, valores = {}, { arquivos = [], copiarPara = [] } = {}) {
    if (tipo !== 'geral') return;
    const igual = (a, b) => E.norm(a || '') === E.norm(b || '');
    if (copias.atual && igual(valores.assunto, copias.atual.assunto)) copias.atual = null;   // a cópia foi enviada
    else {
      copias.atual = null;
      const origem = setorDoDepartamento(valores.departamento) || setorAtual();
      const envio = S.plat.envioDocs && igual(S.plat.envioDocs.assunto, valores.assunto) ? { ...S.plat.envioDocs } : null;
      const alvos = [...new Set(copiarPara)].filter(s => s && s !== origem && E.setoresAtivos(S.rules).includes(s));
      if (alvos.length) {
        const descricao = String(valores.descricao || '').includes(linhaCopia(origem)) ? valores.descricao : `${valores.descricao || ''}\n\n${linhaCopia(origem)}`.trim();
        alvos.forEach((s, i) => copias.fila.push({ setor: s, origem, departamento: E.setorDef(S.rules, s).departamento || s, assunto: valores.assunto || '', descricao,
          arquivos: arquivos.slice(), empresa: S.ctx.empresa, envio, n: i + 2, total: alvos.length + 1 }));
      }
    }
    if (copias.fila.length) setTimeout(() => { if (!copias.atual) abrirProximaCopia(); }, 1500);
  }
  /** Abre a próxima cópia da fila: Solicitação Geral limpa, preenchida e com os mesmos arquivos (sem leitura). */
  async function abrirProximaCopia() {
    const c = copias.fila.shift(); if (!c) return;
    copias.atual = c;
    S.work.geral = null;
    const W = A.w('geral');
    A.juntarArquivos(W, c.arquivos.map(f => { const x = A.novoItem(f, 'painel'); x.status = 'nao-lido'; x.etapa = `Cópia para o ${rot(c.setor)}`; x.progresso = 1; return x; }));
    if (c.envio) S.plat.envioDocs = { ...c.envio, setor: c.setor, quando: Date.now() };   // a cópia também marca a lista do outro setor
    S.plat.escolher = false;
    A.setView('preencher');
    toast(`Abrindo a cópia para o ${rot(c.setor)} (${c.n} de ${c.total}), com os mesmos textos e anexos…`);
    await P.novoPedido('geral', { valores: { assunto: c.assunto, descricao: c.descricao }, sugeridos: { departamento: c.departamento }, fonte: `Cópia para o ${rot(c.setor)}`, empresa: c.empresa });
  }
  /** Cópias que ainda não foram abertas ou que ficaram sem enviar (o cliente saiu do formulário). */
  function pendentes() {
    const noForm = S.ctx.route?.mode === 'form' && S.ctx.tipo === 'geral';
    return [...(copias.atual && !noForm ? [copias.atual] : []), ...copias.fila];
  }
  function renderCopiasPend() {
    const el = $('#copias-pend'); if (!el) return;
    const l = pendentes();
    el.innerHTML = l.length ? `<div class="aviso-linha copias-pend">${icon('copy')}<span><b>${l.length === 1 ? `Falta enviar a cópia para o ${esc(rot(l[0].setor))}` : `Faltam ${l.length} cópias: ${esc(l.map(x => rot(x.setor)).join(', '))}`}</b> — ${esc(l[0].assunto)}.</span>
      <button type="button" class="btn btn-sm btn-primary" id="copia-abrir">Abrir agora</button><button type="button" class="btn btn-sm" id="copia-descartar">Descartar</button></div>` : '';
    $('#copia-abrir')?.addEventListener('click', () => { if (copias.atual) { copias.fila.unshift(copias.atual); copias.atual = null; } abrirProximaCopia(); });
    $('#copia-descartar')?.addEventListener('click', () => { copias.fila = []; copias.atual = null; S.plat.envioDocs = null; renderCopiasPend(); toast('Cópias descartadas: nada foi enviado aos outros setores.'); });
  }
  /** No formulário da Solicitação Geral: "Enviar também para" (Novo pedido > Outro assunto e o envio de documentos) ou a faixa da cópia em andamento. */
  P.renderCopiaSetores = (tipo) => {
    const el = $('#copia-setores'); if (!el) return;
    const ativos = E.setoresAtivos(S.rules);
    if (tipo !== 'geral' || ativos.length < 2) { el.innerHTML = ''; return; }
    const W = A.w('geral');
    if (copias.atual) {
      el.innerHTML = `<div class="aviso-linha copia-atual">${icon('copy')}<span><b>Cópia para o ${esc(rot(copias.atual.setor))} (${copias.atual.n} de ${copias.atual.total})</b> — mesmo assunto, mesma descrição e mesmos anexos da solicitação enviada ao ${esc(rot(copias.atual.origem))}. Confira e envie.</span><button type="button" class="btn btn-sm" id="copia-pular">Não enviar esta cópia</button></div>`;
      $('#copia-pular')?.addEventListener('click', async () => { copias.atual = null; S.plat.envioDocs = null; await P.voltarEscolha?.(); if (copias.fila.length) abrirProximaCopia(); else toast('Cópia não enviada.'); });
      return;
    }
    const origem = setorDoDepartamento(W.valores?.departamento?.valor) || setorAtual();
    const outros = ativos.filter(s => s !== origem);
    W.copiarPara = (W.copiarPara || []).filter(s => outros.includes(s));
    el.innerHTML = `<div class="copia-setores"><span>${icon('copy', 'ic-sm')} Enviar também para:</span>${outros.map(s => `<label><input type="checkbox" data-copia="${esc(s)}" ${W.copiarPara.includes(s) ? 'checked' : ''}> ${esc(rot(s))}</label>`).join('')}<small class="muted">Depois que o portal salvar esta solicitação, eu abro uma cópia para cada setor marcado, com o mesmo assunto, a mesma descrição e os mesmos anexos.</small></div>`;
    el.querySelectorAll('[data-copia]').forEach(c => c.addEventListener('change', () => { W.copiarPara = [...el.querySelectorAll('[data-copia]:checked')].map(x => x.dataset.copia); }));
  };
  P.renderCopiasPend = renderCopiasPend;

  /** Situação da competência sugerida para o Hoje do setor: { competencia, estado, rotulo, feitos, total, limite, faltam }. */
  function resumoEnvio(setor) {
    const comp = E.competenciaSugerida(S.rules, E.today());
    const c = E.competenciasDoSetor(S.rules, E.today()).find(x => x.competencia === comp);
    if (!c) return null;
    const { itens, sit } = situacao(setor, c, noPortal(setor));
    return { competencia: comp, estado: sit.estado, rotulo: ROT[sit.estado] || 'Em andamento', feitos: sit.feitos, total: sit.total, limite: c.limite, faltam: sit.faltam, temItens: itens.length > 0, semDetalhe: sit.semDetalhe };
  }
  const irEnviar = (comp) => { env.competencia = comp || env.competencia; A.setView('enviar'); };
  Object.assign(C, { irEnviar, resumoEnvio, abrirProximaCopia, copiasAoEnviar, enviarCompetencia, marcarEnvioDocs, renderEnviar });
}
