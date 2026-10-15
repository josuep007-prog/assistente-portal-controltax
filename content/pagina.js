/* Assistente do Portal do Cliente — ajudante no mundo da própria página (world: MAIN).
 *
 * A API do portal (/api/br-payroll-sr/…) não aceita só o cookie: o próprio portal manda um
 * cabeçalho de acesso em cada chamada. Este ajudante observa as chamadas que o PORTAL faz,
 * guarda esses cabeçalhos só na memória desta página e faz as leituras que o Assistente pede
 * (só GET, só no mesmo site, só /api/br-payroll-sr/) com o mesmo acesso.
 * O valor do acesso nunca sai daqui: não vai para a extensão, para o armazenamento nem para logs.
 * Para o diagnóstico, informa apenas os NOMES dos cabeçalhos. */
(() => {
  if (window.__ctPagina) return;
  window.__ctPagina = true;

  const PREFIXO = '/api/br-payroll-sr/';
  const acesso = new Map();          // nome do cabeçalho → valor (memória da página)
  let clienteId = '';
  const ignorar = /^(content-type|content-length|accept|accept-language|cache-control|pragma)$/i;
  const deAcesso = (nome) => /^authorization$/i.test(nome) || /^x-/i.test(nome);
  const ehApi = (url) => { try { const u = new URL(url, location.href); return u.origin === location.origin && u.pathname.includes('/api/'); } catch { return false; } };
  function notarUrl(url) {
    try { const m = new URL(url, location.href).pathname.match(/\/api\/br-payroll-sr\/v\d+\/clients\/([^/?#]+)/); if (m) clienteId = decodeURIComponent(m[1]); } catch { /* url estranha */ }
  }
  function notarCabecalho(nome, valor) {
    if (!nome || ignorar.test(nome) || !deAcesso(nome) || valor == null || valor === '') return;
    acesso.set(String(nome).toLowerCase(), String(valor));
  }

  /* XHR (o Angular usa) */
  const abrir = XMLHttpRequest.prototype.open;
  const cabecalho = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.__ctApi = ehApi(url); if (this.__ctApi) notarUrl(url);
    return abrir.call(this, metodo, url, ...resto);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
    if (this.__ctApi && !this.__ctNosso) notarCabecalho(nome, valor);
    return cabecalho.call(this, nome, valor);
  };

  /* fetch */
  const buscar = window.fetch;
  window.fetch = function (entrada, opcoes) {
    try {
      const url = typeof entrada === 'string' ? entrada : entrada?.url;
      if (url && ehApi(url) && !opcoes?.__ctNosso) {
        notarUrl(url);
        const h = new Headers(opcoes?.headers || (entrada instanceof Request ? entrada.headers : undefined));
        h.forEach((v, k) => notarCabecalho(k, v));
      }
    } catch { /* nunca atrapalhar o portal */ }
    return buscar.apply(this, arguments);
  };

  const estado = () => ({ visto: acesso.size > 0, nomes: [...acesso.keys()], clienteId });
  const responder = (detalhe) => document.dispatchEvent(new CustomEvent('ct-api-resposta', { detail: JSON.stringify(detalhe) }));

  document.addEventListener('ct-api-pedido', async (e) => {
    let p; try { p = JSON.parse(e.detail); } catch { return; }
    if (p.tipo === 'estado') { responder({ id: p.id, ...estado() }); return; }
    if (p.tipo !== 'get') return;
    let u; try { u = new URL(p.url, location.href); } catch { responder({ id: p.id, status: 0, erro: 'url' }); return; }
    if (u.origin !== location.origin || !u.pathname.startsWith(PREFIXO)) { responder({ id: p.id, status: 0, erro: 'recusado' }); return; }
    try {
      const headers = { accept: 'application/json, text/plain, */*' };
      acesso.forEach((v, k) => { headers[k] = v; });
      const r = await buscar.call(window, u.href, { method: 'GET', credentials: 'include', headers, __ctNosso: true });
      responder({ id: p.id, status: r.status, texto: r.ok ? await r.text() : '', comAcesso: acesso.size > 0 });
    } catch (err) { responder({ id: p.id, status: 0, erro: String(err?.message || err) }); }
  });
})();
