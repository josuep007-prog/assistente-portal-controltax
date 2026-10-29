/* Assistente do Portal do Cliente — conteúdo: Trocar de empresa, pendências e adaptador do portal (plataforma).
 * Parte de content/ (dividido na 2.17.0; mapa em docs/arquitetura.md). Script comum: compartilha o escopo do mundo isolado
 * com os outros arquivos de content/ (a ordem de carga está no manifest e no simulador). */
/* ============ Trocar de empresa ============ */
const mesmoNome = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
async function esperarEmpresa(nome, ms) {
  for (let t = 0; t < ms; t += 250) { if (mesmoNome(companyName(), nome)) return true; await sleep(250); }
  return mesmoNome(companyName(), nome);
}
/** Troca a empresa pelo seletor do próprio portal e só diz "ok" depois de ver o nome novo na tela. Se a troca não
 *  puder ser confirmada, o painel não preenche nada (para não montar o pedido na empresa errada).
 *  O seletor do Onvio real ainda não foi mapeado: a busca abaixo é um palpite — **a calibrar no Chrome do Josué**. */
async function trocarEmpresa(nome) {
  if (!norm(nome)) return { ok: false, motivo: 'sem nome de empresa' };
  if (mesmoNome(companyName(), nome)) return { ok: true, empresa: companyName() };
  if (plat.trocarEmpresa) {   // simulador
    const r = await plat.trocarEmpresa(nome);
    if (!r?.ok) return { ok: false, motivo: 'esta empresa não está neste acesso' };
    return (await esperarEmpresa(nome, 4000)) ? { ok: true, empresa: companyName() } : { ok: false, motivo: 'o portal não mostrou a empresa nova' };
  }
  // 1) o gatilho: o bloco do cabeçalho com o rótulo "EMPRESA" e o nome da empresa aberta
  const rotulo = [...document.querySelectorAll('body *')].find(e => !e.children.length && /^empresa$/i.test((e.textContent || '').trim()));
  const gatilho = rotulo?.closest('button,[role=button],[role=combobox],a,bento-combobox,[tabindex]') || rotulo?.parentElement;
  if (!gatilho) return { ok: false, motivo: 'não achei o seletor de empresas do portal' };
  gatilho.click();
  // 2) a lista (pode ter busca): escolhe a opção cujo texto é o da empresa
  const opcao = async () => {
    for (let t = 0; t < 3000; t += 250) {
      const o = [...document.querySelectorAll('[role=option],[role=menuitem],[role=listbox] li,bento-list-row,.bento-list-row')].find(e => mesmoNome(e.innerText, nome));
      if (o) return o;
      const busca = [...document.querySelectorAll('[role=dialog] input,[role=listbox] input,bento-combobox input,input[type=search]')].find(i => i.offsetParent && i.type !== 'file' && !i.disabled);
      if (busca && t === 500) setNative(busca, nome);
      await sleep(250);
    }
    return null;
  };
  const o = await opcao();
  if (!o) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, motivo: 'a empresa não apareceu na lista do portal' }; }
  o.click();
  return (await esperarEmpresa(nome, 12000)) ? { ok: true, empresa: companyName() } : { ok: false, motivo: 'o portal não confirmou a troca de empresa' };
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
