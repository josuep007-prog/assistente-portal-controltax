/* Assistente do Portal do Cliente — conteúdo: Leituras da API com o acesso do portal e preparar a resposta.
 * Parte de content/ (dividido na 2.17.0; mapa em docs/arquitetura.md). Script comum: compartilha o escopo do mundo isolado
 * com os outros arquivos de content/ (a ordem de carga está no manifest e no simulador). */
/* ============ Leituras da API com o mesmo acesso que o portal usa (ajudante content/pagina.js) ============ */
/* O cookie sozinho recebe 401 no Onvio real: o portal manda um cabeçalho de acesso em cada chamada.
   O ajudante (mundo da página) faz a leitura com esse acesso; o valor nunca chega até aqui. */
let apiSeq = 0, apiEsperou = false;
const apiEspera = new Map();
let apiEstado = { visto: false, nomes: [], clienteId: '' };
const ultimosStatus = {};
document.addEventListener('ct-api-resposta', (e) => {
  let d; try { d = JSON.parse(e.detail); } catch { return; }
  const f = apiEspera.get(d.id); if (f) { apiEspera.delete(d.id); f(d); }
});
function pedirPagina(p, ms = 30000) {
  return new Promise((res) => {
    const id = `ct${++apiSeq}`;
    const t = setTimeout(() => { apiEspera.delete(id); res(null); }, ms);
    apiEspera.set(id, (d) => { clearTimeout(t); res(d); });
    document.dispatchEvent(new CustomEvent('ct-api-pedido', { detail: JSON.stringify({ ...p, id }) }));
  });
}
let ajudante = null;   // o ajudante da página respondeu? (no simulador ele não existe: as listas vêm de __ctPlatform)
async function estadoAcesso() {
  if (ajudante === false) return null;
  const d = await pedirPagina({ tipo: 'estado' }, 800);
  ajudante = !!d;
  if (d) apiEstado = { visto: !!d.visto, nomes: d.nomes || [], clienteId: d.clienteId || '' };
  return d ? apiEstado : null;
}
const resposta = (status, texto) => ({ ok: status >= 200 && status < 300, status, text: async () => texto || '', json: async () => JSON.parse(texto || 'null') });
const chaveStatus = (url) => String(url).replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '').replace(/\/clients\/[^/]+/, '/clients/…');
async function apiGet(url) {
  let st = await estadoAcesso();
  // o portal ainda não fez nenhuma chamada nesta página: espera um pouco pela primeira (é dela que vem o acesso)
  for (let i = 0; st && !st.visto && !apiEsperou && i < 8; i++) { await sleep(500); st = await estadoAcesso(); }
  if (st && !st.visto) apiEsperou = true;
  let r;
  if (st) { const d = await pedirPagina({ tipo: 'get', url }); if (d?.status) r = resposta(d.status, d.texto); }
  // sem o ajudante: só com o cookie, como antes
  if (!r) r = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } });
  ultimosStatus[chaveStatus(url)] = r.status;
  return r;
}
// 401/403 aqui quer dizer "leitura sem acesso", não sessão expirada: quem avisa a sessão é a janela do próprio portal (verAtencao)
const getJson = (url) => apiGet(url);
/* Listas como o próprio portal pede (mapa do Onvio real, 15/10/2026): pageIndex começa em 1, até 200 por
   página, mais recentes primeiro e com o funcionário e o responsável junto (expand). */
const POR_PAGINA = 200;
const chaveSim = (lista) => String(lista || '').replace(/^.*?\/v\d+\//, '');
function listaPagina(t, pagina) {
  if (plat.fetchList) return plat.fetchList(chaveSim(t.lista) || t.api, { pageIndex: pagina, itemsPerPage: POR_PAGINA });
  const q = new URLSearchParams({ itemsPerPage: POR_PAGINA, pageIndex: pagina, startIndex: (pagina - 1) * POR_PAGINA, orderBy: 'lastUpdated desc' });
  if (t.expand) q.set('expand', t.expand);
  if (!/payroll-entries/.test(t.lista)) q.set('assignedtome', 'false');   // em Rubricas o portal omite quando é falso
  return getJson(`/api/${t.lista}?${q.toString().replace(/\+/g, '%20')}`);
}
/** As solicitações de cada tipo (até maxPaginas páginas), 3 tipos por vez. Itens crus: o painel normaliza. */
async function fetchSolicitacoes(tipos, maxPaginas = 2) {
  const out = []; const fila = [...tipos];
  const umTipo = async (t) => {
    t = { ...t, lista: t.lista || (t.api ? `br-payroll-sr/v1/${t.api}` : '') };
    if (!t.lista) return { tipo: t.key, calibrar: true, itens: [] };
    const itens = []; let total = 0;
    try {
      for (let p = 1; p <= Math.max(1, maxPaginas); p++) {
        const r = await listaPagina(t, p);
        if (!r.ok) return { tipo: t.key, erro: r.status, itens };
        const j = await r.json();
        const arr = Array.isArray(j) ? j : (j.items || j.data || []);
        total = j.totalItems ?? j.total ?? (itens.length + arr.length);
        itens.push(...arr);
        if (itens.length >= total || arr.length < POR_PAGINA) break;
      }
    } catch (e) { return { tipo: t.key, erro: String(e.message || e), itens }; }
    return { tipo: t.key, total, itens, truncado: itens.length < total, chaves: Object.keys(itens[0] || {}) };
  };
  const trabalhador = async () => { while (fila.length) { const t = fila.shift(); out.push(await umTipo(t)); } };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  return out;
}
/** Trâmites (a conversa) de uma solicitação: {base}/{id}/topics, com o id GUID do item (mapa do Onvio real). Só leitura; nada é guardado. */
async function fetchTramites(base, id) {
  if (!base || !id) return { erro: 'sem-id', itens: [] };
  try {
    if (plat.tramites) return { itens: await plat.tramites(base, id) };
    const r = await getJson(`/api/${base}/${encodeURIComponent(id)}/topics?expand=all&itemsPerPage=1000&orderBy=created%20asc&pageIndex=0`);
    if (!r.ok) return { erro: r.status, itens: [] };
    const j = await r.json();
    return { itens: Array.isArray(j) ? j : (j.items || []) };
  } catch (e) { return { erro: String(e.message || e), itens: [] }; }
}
/** Datas de um aviso (detalhe da solicitação: {lista}/{id}?expand=all). Só os campos de data voltam ao painel; nada é guardado. */
// bonusDays e priorNoticeDate: para "Pedir o cálculo" com os dados do aviso (a calibrar no Onvio real)
const CAMPOS_AVISO = ['vacationStartDate', 'paymentDate', 'adviceDate', 'noticeDate', 'priorNoticeDate', 'vacationDays', 'bonusDays', 'resignationDate', 'priorNoticeAdviceDate', 'admissionDate', 'startDate', 'leaveDate', 'effectiveDate'];
/** A solicitação completa ({lista}/{id}?expand=all): lida na hora para a aba Dados do detalhe; nada é guardado. */
async function fetchDetalhe(lista, id) {
  if (!lista || !id) return { erro: 'sem-id' };
  try {
    if (plat.detalheItem) return { dados: await plat.detalheItem(chaveSim(lista), id) };
    const r = await getJson(`/api/${lista}/${encodeURIComponent(id)}?expand=all`);
    if (!r.ok) return { erro: r.status };
    return { dados: await r.json() };
  } catch (e) { return { erro: String(e.message || e) }; }
}
async function fetchDatasAviso(lista, id) {
  const r = await fetchDetalhe(lista, id);
  if (!r.dados) return { erro: r.erro || 'vazio' };
  return { datas: Object.fromEntries(CAMPOS_AVISO.filter(k => r.dados[k] != null).map(k => [k, r.dados[k]])) };
}
/** Sem a lista de empregados (o portal ainda não abriu nenhuma tela que a carrega): abre por
 *  baixo uma solicitação que tem o campo Empregado, espera o portal pedir a lista e volta.
 *  Nunca com um formulário aberto (perderia o que está nele). */
async function aquecerEmpregados() {
  if (routeInfo().mode === 'form' || navInterna) return false;
  const volta = currentPath();
  navInterna = true;
  try {
    await navigate(rules?.config?.solicitacaoComEmpregados || 'employee-leave', true);
    for (let i = 0; i < 15; i++) { if (performance.getEntriesByType('resource').some(e => e.startTime >= empresaDesde - 2000 && /\/clients\/[^/]+\/employees/.test(e.name))) break; await sleep(300); }
  } finally {
    if (plat.navigate) plat.navigate(volta); else history.back();
    await sleep(700);
    lastHref = currentPath(); ultimoForm = '';
    navInterna = false;
    sendContext();
  }
  return true;
}
/** "Ver no portal" / "Responder no portal" / "Anexar no portal": leva o portal à solicitação certa (procura o nº na lista, como o
 *  Control Onvio) e mostra o portal com o painel encaixado. Sem achar o nº, fica na lista e avisa. */
async function abrirNoPortal(m) {
  let aberta = false;
  if (m.area === 'documentos') {
    if (plat.navigate && plat.rotaDocumentos) plat.navigate(plat.rotaDocumentos);
    else [...document.querySelectorAll('a, button')].find(e => /^\s*documentos\s*$/i.test(e.innerText || '') && !e.closest('form'))?.click();   // a calibrar
  } else if (m.slug) {
    // m.id é o número do pedido no canal: o nº da solicitação vem em m.numero
    const numero = String(m.numero || '').trim();
    aberta = !!numero && await abrirSolicitacao(m.slug, numero);
    if (!aberta) {
      const rota = numero && (plat.detalhe || rules?.config?.rotaDetalheSolicitacao);
      await navigate(rota ? `${m.slug}/${numero}` : m.slug, false);
      aberta = !!rota;
      if (!rota && numero) toast(`Abri a lista: procure a solicitação nº ${numero}.`, 6000);
    }
  }
  if (!m.semModo) setModo('fechado');   // "ver no portal": a extensão se recolhe na bolinha (semModo: a plataforma segue na frente, resposta ao vivo)
  return aberta;
}
/** Abre a solicitação pelo nº: abre a lista do tipo e clica na célula com o número (nunca em botões da linha).
 *  A calibrar no Onvio real: lista paginada, se o clique é na linha ou num link, e a rota do detalhe. */
async function abrirSolicitacao(slug, numero) {
  const alvo = String(numero || '').trim(); if (!alvo) return false;
  await navigate(slug, false);
  const lista = currentPath();
  const celula = () => [...mainEl().querySelectorAll('tbody td, [role=gridcell]')].find(c => (c.innerText || '').trim() === alvo && !c.closest('form'));
  let c = null;
  for (let i = 0; i < 24 && !(c = celula()); i++) await sleep(250);
  if (!c) return false;
  (c.querySelector('a, [role=link]') || c).click();
  for (let i = 0; i < 24; i++) { await sleep(250); if (currentPath() !== lista || !celula()) return true; }
  return false;
}
/* ============ Preparar a resposta (lote 6) ============ */
/* Abre a solicitação certa e deixa um texto sugerido (das regras, escolhido pelo cliente no painel — nunca o texto livre, nunca
   CID) na caixa de resposta, com os arquivos anexados. NUNCA clica em responder/enviar: isso é sempre do cliente, no portal.
   Não escreve nada pela API. A tela do detalhe e a caixa de resposta do Onvio real não foram mapeadas: a calibrar (regras:
   config.respostaPortal). */
function caixaResposta() {
  const sels = [].concat(rules?.config?.respostaPortal?.caixa || ['[data-resposta] textarea', 'textarea[formcontrolname=topicDescription]']);
  for (const s of sels) { try { const el = [...mainEl().querySelectorAll(s)].find(e => !e.disabled && !e.closest('#ct-assistente-host')); if (el) return el; } catch { /* seletor inválido nas regras */ } }
  return null;
}
async function prepararResposta(m) {
  const files = unpackFiles(m.files);
  const aberta = await abrirNoPortal({ slug: m.slug, numero: m.numero });
  if (!aberta) return { ok: false, motivo: 'não achei a solicitação na lista do portal' };
  let caixa = null;
  for (let i = 0; i < 24 && !(caixa = caixaResposta()); i++) await sleep(250);
  if (!caixa) return { ok: false, motivo: 'não achei a caixa de resposta' };
  await reveal(caixa);
  const atual = (caixa.value || '').trim();
  if (!atual && m.texto) setNative(caixa, String(m.texto));   // o que o cliente já escreveu fica como está
  let anexos = null;
  if (files.length) anexos = await attachFiles(files);
  caixa.scrollIntoView({ block: 'center', behavior: 'instant' }); mark(caixa); caixa.focus?.();
  sendContext();
  toast(`Resposta preparada: confira e clique em ${rules?.config?.respostaPortal?.botaoResponder || 'RESPONDER'} no portal.`, 9000);
  return { ok: true, textoPosto: !atual && !!m.texto, anexados: anexos?.aceitos || [], recusados: anexos?.recusados || [] };
}
/* Resposta ao vivo (2.12): o cliente escreve a resposta na plataforma (aba Conversa) e o texto aparece na caixa de resposta do
   portal por baixo, enquanto ele digita. Nada é enviado até o painel mandar `respostaEnviar`, que o painel só manda depois do
   "Confirmar e enviar" do cliente (é o único clique em RESPONDER do Assistente). O texto só passa pela memória: nada vai pela API.
   Regra de ouro: texto que o cliente escreveu direto no portal nunca é sobrescrito (só mexe no que ele mesmo pôs ali).
   A tela do detalhe do Onvio real não foi mapeada: a calibrar (regras: config.respostaPortal). */
let respostaEscrita = '';   // o último texto que o Assistente pôs na caixa
async function respostaAbrir(m) {
  const aberta = await abrirNoPortal({ slug: m.slug, numero: m.numero, semModo: true });
  if (!aberta) return { ok: false, motivo: 'não achei a solicitação na lista do portal' };
  let caixa = null;
  for (let i = 0; i < 24 && !(caixa = caixaResposta()); i++) await sleep(250);
  if (!caixa) return { ok: false, motivo: 'não achei a caixa de resposta' };
  respostaEscrita = '';
  return { ok: true, portalTem: !!(caixa.value || '').trim() };
}
function respostaTexto(m) {
  const caixa = caixaResposta();
  if (!caixa) return { ok: false, motivo: 'a caixa de resposta sumiu do portal' };
  const atual = caixa.value || '';
  if (atual.trim() && atual !== respostaEscrita) return { ok: false, portalTem: true, motivo: 'o portal já tem outro texto na resposta' };
  const novo = String(m.texto || '');
  if (atual !== novo) setNative(caixa, novo);
  respostaEscrita = novo;
  return { ok: true };
}
async function respostaArquivos(m) {
  const caixa = caixaResposta();
  if (!caixa) return { ok: false, motivo: 'a caixa de resposta sumiu do portal' };
  const r = await attachFiles(unpackFiles(m.files));
  return { ok: true, anexados: r?.aceitos || [], recusados: r?.recusados || [] };
}
async function respostaEnviar(m) {
  const caixa = caixaResposta();
  if (!caixa) return { ok: false, motivo: 'a caixa de resposta sumiu do portal' };
  if ((caixa.value || '').trim() !== String(m.texto || '').trim()) return { ok: false, motivo: 'o texto no portal é diferente do que você confirmou' };
  const nome = String(rules?.config?.respostaPortal?.botaoResponder || 'RESPONDER');
  const re = new RegExp('^\\s*' + nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i');
  let btn = null;
  for (let cont = caixa.parentElement, n = 0; cont && !btn && n < 8; cont = cont.parentElement, n++) {
    btn = [...cont.querySelectorAll('button')].find(b => re.test(b.innerText || '') && !b.disabled && !b.closest('#ct-assistente-host')) || null;
  }
  if (!btn) return { ok: false, motivo: `não achei o botão ${nome}` };
  const onde = currentPath();
  btn.click();
  respostaEscrita = '';
  for (let i = 0; i < 24; i++) {
    await sleep(250);
    const c = caixaResposta();
    if (!c || !(c.value || '').trim() || currentPath() !== onde) return { ok: true };
  }
  return { ok: false, motivo: 'o portal não concluiu o envio' };
}
/** O cliente fechou sem enviar: tira da caixa o que o Assistente pôs (e só isso). */
function respostaLimpar() {
  const caixa = caixaResposta();
  if (caixa && respostaEscrita && caixa.value === respostaEscrita) setNative(caixa, '');
  respostaEscrita = '';
  return { ok: true };
}
/* O portal abriu uma janela (ou a sessão expirou) enquanto está coberto pela plataforma */
let atencaoVista = '';
function verAtencao() {
  if (modo !== 'plataforma' || preenchendoAgora || navInterna) return;
  const d = [...document.querySelectorAll('[role=dialog], [role=alertdialog], .modal.show')].find(e => visible(e) && (e.innerText || '').trim());
  const txt = d ? d.innerText.trim().replace(/\s+/g, ' ').slice(0, 400) : '';
  if (txt === atencaoVista) return;
  atencaoVista = txt;
  post({ type: 'portalAtencao', texto: txt, ativo: !!d });
}

function setBadge(n) {
  badge.hidden = !n; badge.textContent = n > 99 ? '99+' : String(n || '');
  chrome.runtime.sendMessage({ type: 'badge', n }).catch(() => {});
}
