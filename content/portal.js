/* Assistente do Portal do Cliente — conteúdo: Trocar de empresa, pendências e adaptador do portal (plataforma).
 * Parte de content/ (dividido na 2.17.0; mapa em docs/arquitetura.md). Script comum: compartilha o escopo do mundo isolado
 * com os outros arquivos de content/ (a ordem de carga está no manifest e no simulador). */
/* ============ Trocar de empresa ============ */
const mesmoNome = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
/** Os nomes pelos quais uma empresa aparece no portal: o nome por extenso, o apelido ("ATACAPET | 0001-91") e as partes do apelido (nome curto e código). */
function nomesDaEmpresa(nome, apelido) {
  const partes = String(apelido || '').split('|').map(x => x.trim()).filter(Boolean);
  return { exatos: [nome, apelido].filter(x => norm(x)), apelidoNome: partes[0] || '', codigo: partes.find(x => /\d/.test(x)) || '' };
}
/** Este texto da tela é a empresa? Nome ou apelido iguais ou contidos, ou o nome curto do apelido junto do código. */
function eEmpresa(texto, cand) {
  const t = norm(texto); if (!t) return false;
  for (const x of cand.exatos) { const n = norm(x); if (n && (t === n || t.includes(n) || (t.length >= 8 && n.includes(t)))) return true; }
  if (cand.apelidoNome && cand.codigo && t.includes(norm(cand.apelidoNome)) && t.includes(norm(cand.codigo))) return true;
  return false;
}
/** O bloco "EMPRESA" do portal (rótulo, nome e apelido da empresa aberta). */
const rotuloEmpresa = () => [...document.querySelectorAll('body *')].find(e => !e.children.length && /^empresa$/i.test((e.textContent || '').trim()));
const blocoDaEmpresa = () => { const r = rotuloEmpresa(); return r?.parentElement?.parentElement?.innerText || r?.parentElement?.innerText || ''; };
const empresaAberta = (cand) => eEmpresa(companyName(), cand) || eEmpresa(blocoDaEmpresa(), cand);
async function esperarEmpresa(cand, ms) {
  for (let t = 0; t < ms; t += 250) { if (empresaAberta(cand)) return true; await sleep(250); }
  return empresaAberta(cand);
}
const visivelEl = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
const descreveEl = (e) => `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}${e.getAttribute?.('role') ? `[role=${e.getAttribute('role')}]` : ''}`;
/** A linha da lista que contém este texto: sobe enquanto o pai ainda é só a linha (texto curto) e para antes da janela (dialog/modal), que também tem
 *  tabindex e engoliria o clique. */
const linhaDaOpcao = (e) => {
  const janela = (x) => x.matches?.('[role=dialog],[role=alertdialog],bento-modal,ngb-modal-window,.modal,.cdk-overlay-pane,.modal-body,.modal-content');
  const base = e.closest('button,a,li,[role=option],[role=menuitem],[role=button],bento-list-row,.bento-list-row');
  if (base && !janela(base)) return base;
  let x = e;
  while (x.parentElement && !janela(x.parentElement) && x.parentElement !== document.body && x.parentElement.getBoundingClientRect().height <= 80 && (x.parentElement.innerText || '').trim().length <= 160) x = x.parentElement;   // uma linha tem uns 45 px; a lista inteira, não
  return x;
};
const clicavel = (e) => e.closest('button,a,li,[role=option],[role=menuitem],[role=button],[role=combobox],bento-combobox,bento-list-row,.bento-list-row,[tabindex]') || e;
/** Os lugares onde o seletor de empresas pode estar, do mais provável ao menos: o bloco do rótulo "EMPRESA", o nome da empresa aberta, elementos
 *  com "empresa"/"company" no nome. O seletor do Onvio real não foi mapeado; cada um é tentado e o que abrir (ou não) vai para o diagnóstico. */
function gatilhosDeEmpresa() {
  const out = [], poe = (e) => { if (e && e !== document.body && !out.includes(e) && visivelEl(e)) out.push(e); };
  const rot = rotuloEmpresa();
  if (rot) { poe(clicavel(rot)); poe(rot.parentElement); poe(rot.parentElement?.parentElement); }
  const nomeAberto = norm(companyName());
  if (nomeAberto) for (const e of document.querySelectorAll('body *')) if (!e.children.length && norm(e.textContent) === nomeAberto && visivelEl(e)) { poe(clicavel(e)); poe(e.parentElement); break; }
  for (const e of document.querySelectorAll('[class*=company i],[class*=empresa i],[class*=client-select i],[aria-label*=empresa i],[aria-label*=company i],[title*=empresa i]')) if (e.getBoundingClientRect().top < 400) poe(clicavel(e));
  return out.slice(0, 5);
}
/** Clica no gatilho e procura, só no que apareceu depois do clique, a opção da empresa; digita na busca se houver. Devolve o elemento a clicar ou null. */
async function abrirListaDeEmpresas(g, cand, diag) {
  const antes = new Set([...document.querySelectorAll('body *')].filter(visivelEl));
  await reveal(g).catch?.(() => {}); cliqueCompleto(g);
  const novosVisiveis = () => [...document.querySelectorAll('body *')].filter(e => visivelEl(e) && !antes.has(e));
  let digitou = false, busca = null, novos = [];
  for (let t = 0; t < 3500; t += 250) {
    await sleep(250);
    novos = novosVisiveis();
    const achados = novos.filter(e => !e.children.length || e.children.length < 4).filter(e => { const x = (e.innerText || e.textContent || '').trim(); return x && x.length <= 160 && eEmpresa(x, cand); });
    if (achados.length) {
      // o mais fundo (o menor) é o texto da opção; o igual ao nome ganha do que só o contém
      achados.sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height) - (b.getBoundingClientRect().width * b.getBoundingClientRect().height));
      const exato = achados.find(e => cand.exatos.some(x => norm(e.innerText) === norm(x)));
      return linhaDaOpcao(exato || achados[0]);
    }
    busca = novos.find(e => e.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file])') && !e.disabled);
    if (busca && !digitou) { digitou = true; await digitar(busca, cand.apelidoNome || String(cand.exatos[0] || '').split(/\s+/)[0]); }
  }
  diag.gatilhos.push({ gatilho: descreveEl(g), novos: novos.length, itens: novos.filter(e => e.matches?.('[role=option],[role=menuitem],li,bento-list-row,.bento-list-row')).length, busca: !!busca, formas: [...new Set(novos.slice(0, 40).map(descreveEl))].slice(0, 6) });
  return null;
}
/** Troca a empresa pelo seletor do próprio portal e só diz "ok" depois de ver a empresa nova na tela. Se a troca não puder ser confirmada, o painel
 *  não preenche nada (para não montar o pedido na empresa errada). O seletor do Onvio real ainda não foi mapeado: o que a busca não achar vai
 *  para o diagnóstico (`detalhe`, só estrutura). */
async function trocarEmpresa(nome, apelido = '') {
  if (!norm(nome)) return { ok: false, motivo: 'sem nome de empresa' };
  const cand = nomesDaEmpresa(nome, apelido);
  if (empresaAberta(cand)) return { ok: true, empresa: companyName() };
  if (plat.trocarEmpresa) {   // simulador
    const r = await plat.trocarEmpresa(nome);
    if (!r?.ok) return { ok: false, motivo: 'esta empresa não está neste acesso' };
    return (await esperarEmpresa(cand, 4000)) ? { ok: true, empresa: companyName() } : { ok: false, motivo: 'o portal não mostrou a empresa nova' };
  }
  const diag = { gatilhos: [], semGatilho: false };
  const gatilhos = gatilhosDeEmpresa();
  if (!gatilhos.length) { diag.semGatilho = true; return { ok: false, motivo: 'não achei o seletor de empresas do portal', detalhe: 'nenhum elemento com o rótulo EMPRESA, o nome da empresa aberta ou "empresa/company" no nome' }; }
  for (const g of gatilhos) {
    const o = await abrirListaDeEmpresas(g, cand, diag);
    if (!o) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300); continue; }
    cliqueCompleto(o);
    // a janela "Selecione uma empresa" só marca a linha: o botão SELECIONAR EMPRESA (ligado depois da marca) é que troca
    const botaoConfirmar = () => [...document.querySelectorAll('[role=dialog] button,.modal button,bento-modal button,.cdk-overlay-pane button')].find(x => visivelEl(x) && !x.disabled && /^(selecionar( a)?( empresa)?|confirmar|trocar|continuar|ok|entrar)$/i.test(norm(x.innerText)));
    let confirmou = false;
    for (let t = 0; t < 4000 && !empresaAberta(cand); t += 150) {
      await sleep(150);
      if (!confirmou) { const c = botaoConfirmar(); if (c) { confirmou = true; cliqueCompleto(c); } }
    }
    return (await esperarEmpresa(cand, 12000)) ? { ok: true, empresa: companyName() } : { ok: false, motivo: 'o portal não confirmou a troca de empresa', detalhe: `cliquei na opção (${descreveEl(o)}), mas a empresa aberta não mudou` };
  }
  const resumo = diag.gatilhos.map(x => `${x.gatilho} → ${x.novos} elemento(s) novo(s), ${x.itens} item(ns) de lista, busca ${x.busca ? 'sim' : 'não'} [${x.formas.join(', ')}]`).join(' || ');
  return { ok: false, motivo: 'a empresa não apareceu na lista do portal', detalhe: `tentei ${diag.gatilhos.length} lugar(es): ${resumo}` };
}

/** CANCELAR do formulário do portal (o mesmo botão que a pessoa clicaria), para sair do Lançamento de Rubricas sem sair da extensão. Nunca clica em
 *  ADICIONAR/enviar: só em CANCELAR e, se o portal perguntar se quer sair/descartar, no botão que confirma a saída. Sem o botão, volta à lista do tipo. */
async function cancelarFormulario() {
  const r0 = routeInfo(); if (r0.mode !== 'form') return { ok: true, ja: true };
  const emJanela = (x) => !!x.closest('[role=dialog],[role=alertdialog],bento-modal,ngb-modal-window,.modal,.cdk-overlay-pane');
  const botao = () => [...mainEl().querySelectorAll('button,a')].find(x => visivelEl(x) && !x.disabled && norm(x.innerText) === 'CANCELAR' && !emJanela(x));
  const b = botao();
  if (b) { await reveal(b); cliqueCompleto(b); } else if (r0.slug) await navigate(r0.slug, false);
  let confirmou = false;
  for (let t = 0; t < 5000; t += 150) {
    if (routeInfo().mode !== 'form') return { ok: true, via: b ? 'botão CANCELAR do portal' : 'voltar à lista' };
    await sleep(150);
    if (!confirmou) {   // "sair sem salvar?": só botões de sair/descartar, e só numa janela que não fala em enviar
      const j = [...document.querySelectorAll('[role=dialog],[role=alertdialog],bento-modal,ngb-modal-window,.modal')].find(visivelEl);
      if (j && !/enviar|adicionar/i.test(norm(j.innerText).replace(/\s+/g, ' ').toLowerCase())) {
        const c = [...j.querySelectorAll('button')].find(x => visivelEl(x) && !x.disabled && /^(SIM|SAIR|SAIR SEM SALVAR|DESCARTAR|DESCARTAR ALTERACOES|CONFIRMAR|OK)$/.test(norm(x.innerText)));
        if (c) { confirmou = true; cliqueCompleto(c); }
      }
    }
  }
  return routeInfo().mode !== 'form' ? { ok: true } : { ok: false, motivo: 'o portal não saiu do formulário' };
}

/* ============ Pendências (lê as listas com a sessão do próprio usuário) ============ */
async function fetchPendencias(tipos) {
  const out = [];
  for (const t of tipos) {
    try {
      const r = plat.fetchList ? await plat.fetchList(t.api) : await apiGet(`/api/br-payroll-sr/v1/${t.api}?pageIndex=0&itemsPerPage=50&assignedtome=false`);
      if (!r.ok) { out.push({ tipo: t.key, erro: r.status }); continue; }
      const j = await r.json();
      const itens = (j.items || []).map(it => {
        const s = JSON.stringify(it);
        const status = it.status?.description || it.status?.name || it.situation?.description || it.statusDescription || it.status || '';
        return {
          id: it.id || it.requestNumber || it.number || '',
          status: typeof status === 'string' ? status : JSON.stringify(status),
          aguardando: /aguardando[^"]{0,20}cliente|waiting[_ ]?(for[_ ]?)?(client|customer)|awaiting/i.test(s),
          pendente: !/conclu|finaliz|complet|cancel/i.test(typeof status === 'string' ? status : s),
          empregado: it.employee?.name || it.employeeName || it.selectedEmployee?.name || '',
          assunto: it.subject || '',
          atualizado: it.lastUpdate || it.updatedAt || it.lastProceedingDate || it.createdAt || ''
        };
      });
      out.push({ tipo: t.key, total: j.totalItems ?? itens.length, itens });
    } catch (e) { out.push({ tipo: t.key, erro: String(e.message || e) }); }
  }
  return out;
}
/* ============ Adaptador do portal (plataforma) ============ */
let navInterna = false;        // navegação feita pelo Assistente (não é o cliente mudando de tela)
let preenchendoAgora = false;
/** Id da empresa no portal, tirado de uma chamada que o próprio portal fez depois da troca de empresa (só na memória). */
function clientId() {
  if (plat.clientId) return plat.clientId();
  if (apiEstado.clienteId) return apiEstado.clienteId;
  const e = performance.getEntriesByType('resource').filter(x => x.startTime >= empresaDesde - 2000).map(x => x.name.match(/\/api\/br-payroll-sr\/v1\/clients\/([^/?#]+)/)).filter(Boolean).pop();
  return e ? decodeURIComponent(e[1]) : '';
}
/* Documentos que o escritório publica (área Documentos do Onvio; endereço visto em 26/10/2026, regras: config.documentosPortal).
   Só leitura (GET) com o acesso do próprio portal. Devolve a resposta crua: o painel normaliza (E.documentosDoPortal) e não guarda nada.
   O id da empresa vem da chamada que o próprio portal fez ao abrir Documentos; senão, do id das outras listas. */
function clienteDosDocumentos() {
  const n = performance.getEntriesByType('resource').map(x => x.name).filter(u => /\/containers\/documents\?/.test(u)).pop();
  if (n) { try { const v = JSON.parse(new URL(n).searchParams.get('customFields') || '[]').find(c => /^clientid$/i.test(c?.Name || ''))?.Value; if (v) return String(v); } catch { /* endereço estranho */ } }
  return clientId();
}
/** Baixa um documento do escritório (só leitura, com o acesso do próprio portal). Dois passos, como o portal faz:
 *  1) GET {download.api} (…/projects/<projeto>/documents/<id>?includeDownloadUrl=true) → endereço de download (com um token
 *  temporário, que só passa pela memória: nunca é guardado nem mostrado); 2) GET desse endereço → bytes. Só /api/storage/. */
function projetoDosDocumentos() {
  const n = performance.getEntriesByType('resource').map(x => x.name).map(u => /\/api\/storage\/v1\/projects\/([^/?#]+)\//.exec(u)).filter(Boolean).pop();
  return n ? decodeURIComponent(n[1]) : '';
}
async function apiGetBinario(url, maxBytes) {
  const st = await estadoAcesso();
  if (st) { const d = await pedirPagina({ tipo: 'get', url, binario: true, maxBytes }, 60000); if (d) return d; }
  return { status: 0, erro: 'sem ajudante' };
}
async function baixarDocumentoReal(m) {
  const cfg = rules?.config?.documentosPortal?.download;
  if (!cfg?.api) return { motivo: 'sem regra' };
  // o código do projeto: o do item (containerId) e, se esse não servir, o que o próprio portal usou nas chamadas dele
  const projetos = [...new Set([m.projeto, projetoDosDocumentos()].filter(Boolean))];
  if (!projetos.length || !m.docId) return { motivo: 'sem projeto' };
  const caminho = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  let r = null;
  for (const projeto of projetos) {
    r = await apiGet(String(cfg.api).replace('{projeto}', encodeURIComponent(projeto)).replace('{id}', encodeURIComponent(m.docId)));
    if (r.ok) break;
  }
  if (!r.ok) return { motivo: r.status === 401 || r.status === 403 ? 'sem acesso' : `erro ${r.status}` };
  let j = null; try { j = await r.json(); } catch { return { motivo: 'resposta ilegível' }; }
  let url = ''; for (const k of cfg.url || ['downloadUrl']) { const v = caminho(j, k); if (typeof v === 'string' && v) { url = v; break; } }
  // não achou pelos nomes das regras: procura em qualquer nível um texto que seja endereço do armazenamento (ou com token)
  if (!url) {
    const acha = (o, prof = 0) => {
      if (typeof o === 'string') return /^(https?:\/\/|\/)/.test(o) && (/\/api\/storage\//.test(o) || /[?&]token=/i.test(o)) ? o : '';
      if (!o || typeof o !== 'object' || prof > 4) return '';
      for (const v of Object.values(o)) { const r = acha(v, prof + 1); if (r) return r; }
      return '';
    };
    url = acha(j);
  }
  // só a FORMA da resposta (chaves e tipos; texto que parece endereço vira str:endereço), para o diagnóstico
  const forma = (o, prof = 0) => {
    if (o == null) return 'null';
    if (typeof o === 'string') return /^(https?:\/\/|\/)/.test(o) ? 'str:endereço' : 'str';
    if (typeof o !== 'object') return typeof o;
    if (Array.isArray(o)) return o.length ? `[${prof >= 3 ? '…' : forma(o[0], prof + 1)}]` : '[]';
    if (prof >= 3) return '{…}';
    return `{${Object.keys(o).slice(0, 20).map(k => `${/^[0-9a-f]{32}$/i.test(k) ? '<id>' : k.slice(0, 30)}:${forma(o[k], prof + 1)}`).join(',')}}`;
  };
  if (!url) return { motivo: 'sem endereço de download', campos: Object.keys(j || {}).slice(0, 30), forma: forma(j).slice(0, 700) };
  let u; try { u = new URL(url, location.href); } catch { return { motivo: 'endereço inválido' }; }
  if (u.origin !== location.origin || !u.pathname.startsWith('/api/storage/')) return { motivo: 'endereço fora do portal' };
  const max = (+cfg.maxMB || 25) * 1048576;
  const d = await apiGetBinario(u.pathname + u.search, max);
  if (d.erro === 'grande') return { motivo: 'arquivo grande demais' };
  if (!d.status || d.status >= 400 || !d.texto64) return { motivo: d.status === 401 || d.status === 403 ? 'sem acesso' : `erro ${d.status || 'de rede'}` };
  const bin = atob(d.texto64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const tipo = (d.tipoConteudo || '').split(';')[0] || 'application/octet-stream';
  return { file: new File([bytes], String(m.nome || j?.name || 'documento'), { type: tipo }) };
}
async function fetchDocumentos() {
  const cfg = rules?.config?.documentosPortal;
  if (!cfg?.api) return { disponivel: false, motivo: 'sem regra' };
  const id = clienteDosDocumentos();
  if (!id) return { disponivel: false, motivo: 'sem cliente' };
  const cf = encodeURIComponent(JSON.stringify([{ Name: 'clientId', Value: id, IgnoreCase: true }])).replace(/%3A/g, ':').replace(/%2C/g, ',');
  const q = [`from=1`, `pageSize=${+cfg.pageSize || 100}`, 'loadParent=true', `sort=${cfg.ordem || 'createdDate:desc'}`, 'loadMetadata=false', 'loadLock=false', `customFields=${cf}`].join('&');
  const r = await apiGet(`${cfg.api}?${q}`);
  if (!r.ok) return { disponivel: false, motivo: r.status === 401 || r.status === 403 ? 'sem acesso' : `erro ${r.status}`, codigo: r.status };
  let bruto = null; try { bruto = await r.json(); } catch { return { disponivel: false, motivo: 'resposta ilegível', codigo: r.status }; }
  // mais páginas (config.documentosPortal.paginacao): junta as listas na primeira resposta; para se uma página não traz nada novo
  const pg = cfg.paginacao;
  if (pg?.lista) {
    const caminho = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
    const pai = (o, p) => { const ks = String(p).split('.'); const ult = ks.pop(); return [ks.reduce((a, k) => (a == null ? undefined : a[k]), o), ult]; };
    const [dono, chave] = pai(bruto, pg.lista);
    const todos = Array.isArray(dono?.[chave]) ? dono[chave] : null;
    let atual = +caminho(bruto, pg.pagina) || 1, mais = caminho(bruto, pg.mais) === true;
    for (let n = 1; todos && mais && n < (+pg.max || 5); n++) {
      const rr = await apiGet(`${cfg.api}?${q.replace(/^from=\d+/, `from=${atual + 1}`)}`);
      if (!rr.ok) break;
      let j; try { j = await rr.json(); } catch { break; }
      const novos = (caminho(j, pg.lista) || []).filter(x => x && !todos.some(y => y?.id === x.id));
      if (!novos.length) break;
      todos.push(...novos); atual = +caminho(j, pg.pagina) || atual + 1; mais = caminho(j, pg.mais) === true;
    }
  }
  return { disponivel: true, bruto, baixar: !!cfg.download?.api };
}
