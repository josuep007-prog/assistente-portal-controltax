/* Plataforma — Documentos (das solicitações, do escritório, modelos e listas).
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';
import * as D from '../dados.js';
import { criarZip, nomeNoZip } from '../zip.js';

export function montarDocumentos(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { P, abrirDetalhe, badge, cap, dialogo, empregadosAtivos, fmt, hora, iniciais, itensVisiveis, ligarSeletorEmpresa, loading, nomeTipo, quando, rotEmpresa, seletorEmpresa, variasEmpresas } = C;   // definidos em partes que montam antes
  /* =================== DOCUMENTOS =================== */
  /* =================== Documentos (2.5) ===================
     Nas solicitações: os arquivos trocados nos trâmites (do escritório e os seus), lidos do portal na hora e
     guardados só na memória, como a conversa do detalhe. Publicados: guias, holerites e recibos da área de
     Documentos do Onvio (no simulador; no Onvio real ainda "a calibrar"). Depois, os enviados pelo Assistente, os
     modelos para assinar e as listas de documentos por tipo. */
  const ABAS_DOC = [['solicitacoes', 'Nas solicitações'], ['escritorio', 'Publicados pelo escritório'], ['anexos', 'Enviados pelo Assistente'], ['modelos', 'Modelos para assinar'], ['listas', 'Listas de documentos']];
  const arquivosLidos = new Map();   // id da solicitação → { em, lista: [{ nome, lado, em, autor }] } (só memória)
  let lendoArquivos = null;
  const LOTE_ARQ = 40;
  function tipoArquivo(nome) {
    const x = (/\.([a-z0-9]{2,5})$/i.exec(nome || '') || [])[1]?.toLowerCase() || '';
    if (x === 'pdf') return ['pdf', 'PDF'];
    if (/^(jpe?g|png|gif|webp|heic|bmp|tiff?)$/.test(x)) return ['img', 'IMG'];
    if (/^(xlsx?|xlsm|csv|ods)$/.test(x)) return ['xls', 'PLAN'];
    if (/^(docx?|odt|rtf|txt)$/.test(x)) return ['doc', 'DOC'];
    if (/^(zip|rar|7z)$/.test(x)) return ['zip', 'ZIP'];
    return ['outro', (x || 'arq').toUpperCase().slice(0, 4)];
  }
  const alvoArquivos = () => itensVisiveis().filter(i => i.id && S.rules.tipos[i.tipo]?.apiTramites)
    .sort((a, b) => (b.atualizado?.getTime() || 0) - (a.atualizado?.getTime() || 0));
  function carregarArquivos(limite, aoAvancar) {
    if (lendoArquivos) return lendoArquivos;
    const alvo = alvoArquivos().slice(0, limite).filter(i => arquivosLidos.get(i.id)?.em !== (i.atualizado?.getTime() || 0));
    if (!alvo.length) return Promise.resolve();
    lendoArquivos = (async () => {
      let n = 0, feitos = 0;
      const trabalhador = async () => { while (n < alvo.length) { const i = alvo[n++];
        const r = await request({ type: 'tramites', base: S.rules.tipos[i.tipo].apiTramites, solicitacao: i.id }, 15000);
        if (r && !r.erro) arquivosLidos.set(i.id, { em: i.atualizado?.getTime() || 0,
          lista: E.tramitesDe(r.itens, i.tipo, S.rules).flatMap(t => t.anexos.map(nome => ({ nome, lado: t.lado, em: E.parseDate(t.em), autor: t.autor }))) });
        aoAvancar?.(++feitos, alvo.length); } };
      await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    })().finally(() => { lendoArquivos = null; });
    return lendoArquivos;
  }
  function renderDocumentos() {
    const aba = ABAS_DOC.some(([k]) => k === S.plat.docAba) ? S.plat.docAba : 'solicitacoes';
    const nArq = alvoArquivos().reduce((t, i) => t + (arquivosLidos.get(i.id)?.lista.length || 0), 0);
    const contas = { solicitacoes: arquivosLidos.size ? nArq : null, escritorio: S.plat.docs?.disponivel ? (S.plat.docs.itens || []).length : null,
      modelos: (S.rules.modelosDocumento || []).length, listas: Object.values(S.rules.tipos).filter(t => (t.anexos || []).length).length };
    viewEl.innerHTML = `<div class="dp-tabs" role="tablist">${ABAS_DOC.map(([k, t]) => `<button type="button" role="tab" class="dp-tab${aba === k ? ' active' : ''}" data-doc-aba="${k}" aria-selected="${aba === k}">${t}${contas[k] != null ? ` <span class="tab-n">${contas[k]}</span>` : ''}</button>`).join('')}</div><div id="doc-body"></div>`;
    viewEl.querySelectorAll('[data-doc-aba]').forEach(b => b.addEventListener('click', () => { S.plat.docAba = b.dataset.docAba; renderDocumentos(); }));
    ({ solicitacoes: docsSolicitacoes, escritorio: docsEscritorio, anexos: docsAnexos, modelos: docsModelos, listas: docsListas }[aba])($('#doc-body'));
  }
  function docsSolicitacoes(el) {
    const F = S.plat.filtroDoc || (S.plat.filtroDoc = { q: '', lado: '', limite: LOTE_ARQ });
    if (!S.plat.sol) { el.innerHTML = loading('Lendo as solicitações no portal…'); P.carregarSolicitacoes().then(() => el.isConnected && docsSolicitacoes(el)); return; }
    el.innerHTML = `<div class="dp-toolbar arq-barra">
        <input type="search" id="arq-q" placeholder="Buscar arquivo, funcionário ou nº da solicitação…" value="${esc(F.q)}" autocomplete="off">
        ${seletorEmpresa()}
        <div class="seg" role="group" aria-label="De quem">${[['', 'Todos'], ['esc', 'Do escritório'], ['cli', 'Enviados por você']].map(([k, r]) => `<button type="button" data-arq-lado="${k}" aria-pressed="${F.lado === k}">${r} <span class="mono arq-n" data-arq-n="${k}"></span></button>`).join('')}</div>
      </div>
      <div id="arq-prog"></div><div id="arq-lista"></div>`;
    ligarSeletorEmpresa(el);
    let vis = [];
    const desenhar = () => {
      if (!el.isConnected) return;
      const alvo = alvoArquivos(), lidas = alvo.slice(0, F.limite);
      const q = E.norm(F.q);
      const todos = lidas.flatMap(i => (arquivosLidos.get(i.id)?.lista || []).map(a => ({ ...a, item: i })))
        .filter(a => !q || E.norm(`${a.nome} ${a.item.numero} ${a.item.empregado} ${a.item.assunto} ${nomeTipo(a.item.tipo)} ${a.item.empresa}`).includes(q));
      const conta = { '': todos.length, esc: todos.filter(a => a.lado === 'esc').length, cli: todos.filter(a => a.lado === 'cli').length };
      el.querySelectorAll('[data-arq-n]').forEach(x => { x.textContent = conta[x.dataset.arqN]; });
      vis = todos.filter(a => !F.lado || a.lado === F.lado).sort((a, b) => (b.em?.getTime() || 0) - (a.em?.getTime() || 0));
      const comEmpresa = variasEmpresas(lidas);
      const grupos = [];
      vis.forEach((a, n) => {
        const k = a.em ? cap(a.em.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })) : 'Sem data';
        if (grupos.at(-1)?.k !== k) grupos.push({ k, linhas: [] });
        const [cls, rot] = tipoArquivo(a.nome), i = a.item;
        grupos.at(-1).linhas.push(`<div class="dp-row arq-cols hov" data-arq="${n}" tabindex="0" role="button" aria-label="${esc(`${a.nome}: abrir a solicitação`)}">
          <span class="arq-nome"><span class="arq-ext ext-${cls}">${rot}</span><span class="arq-tx"><b class="ell" title="${esc(a.nome)}">${esc(a.nome)}</b><span class="sub ell">${esc([comEmpresa && rotEmpresa(i), i.numero && `nº ${i.numero}`, i.assunto || nomeTipo(i.tipo)].filter(Boolean).join(' · '))}</span></span></span>
          <span class="ell">${esc(i.empregado || '—')}</span>
          <span><span class="pill ${a.lado === 'esc' ? 'pill-soon' : 'pill-muted'}">${a.lado === 'esc' ? 'Do escritório' : 'Você enviou'}</span></span>
          <span class="mono">${fmt(a.em)}</span>
          <span class="row-acts"><button type="button" class="btn btn-sm btn-ghost" data-arq-portal="${n}" title="Abrir a solicitação no portal para baixar">${icon('external', 'ic-sm')} No portal</button></span></div>`);
      });
      const lendo = !!lendoArquivos;
      const lista = el.querySelector('#arq-lista');
      lista.innerHTML = `<div class="list-card"><div class="dp-listhead arq-cols"><span>Arquivo</span><span>Funcionário</span><span>De quem</span><span>Data</span><span></span></div>
        ${grupos.map(g => `<div class="arq-mes">${esc(g.k)}</div>${g.linhas.join('')}`).join('')
          || (lendo ? loading('Procurando arquivos nos trâmites…') : `<div class="list-vazio">${F.q || F.lado ? 'Nenhum arquivo com esse filtro.' : 'Nenhum arquivo nas solicitações lidas.'}</div>`)}
        <div class="list-foot">Lidas as ${Math.min(F.limite, alvo.length)} solicitações mais recentes de ${alvo.length}.${alvo.length > F.limite ? ` <button type="button" class="btn btn-sm btn-ghost" id="arq-mais">Ler mais ${Math.min(LOTE_ARQ, alvo.length - F.limite)}</button>` : ''} Os arquivos são lidos do portal na hora e não ficam guardados; para baixar, abra a solicitação no portal.</div></div>`;
      lista.querySelectorAll('[data-arq]').forEach(r => {
        const abrir = (e) => { if (e.target.closest('button')) return; abrirDetalhe(vis[+r.dataset.arq].item, { aba: 'conversa' }); };
        r.addEventListener('click', abrir); r.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(e); });
      });
      lista.querySelectorAll('[data-arq-portal]').forEach(b => b.addEventListener('click', () => { const i = vis[+b.dataset.arqPortal].item; request({ type: 'abrirNoPortal', slug: S.rules.tipos[i.tipo]?.slug, numero: i.numero }, 30000); }));
      lista.querySelector('#arq-mais')?.addEventListener('click', () => { F.limite += LOTE_ARQ; ler(); });
      const n = viewEl.querySelector('[data-doc-aba="solicitacoes"]');
      if (n && arquivosLidos.size) { const t = n.querySelector('.tab-n') || n.appendChild(Object.assign(document.createElement('span'), { className: 'tab-n' })); t.textContent = todos.length; }
    };
    const prog = el.querySelector('#arq-prog');
    let ultimo = 0;
    const ler = () => {
      const p = carregarArquivos(F.limite, (f, t) => {
        prog.innerHTML = `<div class="arq-prog"><span>Lendo os trâmites… ${f} de ${t}</span><i style="width:${Math.round(f / t * 100)}%"></i></div>`;
        if (Date.now() - ultimo > 600) { ultimo = Date.now(); desenhar(); }
      });
      desenhar();
      p.then(() => { prog.innerHTML = ''; desenhar(); });
    };
    let t0;
    el.querySelector('#arq-q').addEventListener('input', (e) => { F.q = e.target.value; clearTimeout(t0); t0 = setTimeout(desenhar, 150); });
    el.querySelectorAll('[data-arq-lado]').forEach(b => b.addEventListener('click', () => { F.lado = b.dataset.arqLado; el.querySelectorAll('[data-arq-lado]').forEach(x => x.setAttribute('aria-pressed', x === b)); desenhar(); }));
    ler();
  }
  /** O que dizer quando a lista de documentos do escritório não veio (sem culpar o cliente). */
  const motivoDocs = (D) => ({
    'sem acesso': 'O portal não deixou a extensão ler essa lista agora. Abra Documentos no portal uma vez e tente de novo.',
    'sem cliente': 'Abra a tela Documentos do portal uma vez e volte aqui: é dela que a extensão pega o código da empresa.',
    'forma': 'Consegui ler a lista do portal, mas ainda não reconheci os campos. Em Configurações, “Copiar diagnóstico” traz o que foi visto (só os nomes dos campos): mande ao escritório.',
    'resposta ilegível': 'O portal respondeu algo que não consegui ler. Tente de novo mais tarde.'
  }[D?.motivo] || S.rules.mensagens?.plataformaCalibrar || '');
  /** Lê (e normaliza) os documentos que o escritório publica; guarda só na memória. Também alimenta o número do menu e o aviso de novos. */
  P.carregarDocumentos = async (force = false, { silencioso = false } = {}) => {
    if (S.plat.docs && !force) return S.plat.docs;
    if (S.plat.carregandoDocs) return S.plat.carregandoDocs;
    S.plat.carregandoDocs = (async () => {
      let r = await request({ type: 'documentos' }, 30000) || { disponivel: false };
      if (r.disponivel && r.bruto !== undefined) {   // área Documentos do Onvio real: resposta crua da API, normalizada aqui (nada é guardado)
        const n = E.documentosDoPortal(r.bruto, S.rules);
        S.plat.docsDiag = { itens: n.itens.length, total: n.total, campos: n.campos, reconhecido: n.reconhecido, forma: n.forma };
        r = n.reconhecido ? { disponivel: true, itens: n.itens.sort((x, y) => y.criado - x.criado), total: n.total, baixar: r.baixar } : { disponivel: false, motivo: 'forma' };
      } else S.plat.docsDiag = { codigo: r.codigo, motivo: r.motivo };
      // novos: documentos não lidos que ainda não vi nesta sessão (a primeira leitura só conta, não avisa)
      if (r.disponivel) {
        const nl = r.itens.filter(x => x.lido === false);
        const vistos = S.plat.docsVistos;
        if (vistos && silencioso) { const novos = nl.filter(x => !vistos.has(x.id)); if (novos.length) toast(novos.length === 1 ? 'O escritório publicou um documento novo.' : `O escritório publicou ${novos.length} documentos novos.`); }
        S.plat.docsVistos = new Set(r.itens.map(x => x.id));
      }
      S.plat.docs = r; S.plat.carregandoDocs = null;
      atualizarBadgeDocs();
      return r;
    })();
    return S.plat.carregandoDocs;
  };
  const atualizarBadgeDocs = () => {
    const b = document.querySelector('[data-badge="documentos"]'); if (!b) return;
    const n = S.plat.docs?.disponivel ? S.plat.docs.itens.filter(x => x.lido === false).length : 0;
    b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n);
  };
  async function docsEscritorio(el) {
    if (!S.plat.docs) {
      el.innerHTML = loading('Procurando os documentos no portal…');
      await P.carregarDocumentos();
      if (S.view !== 'documentos' || S.plat.docAba !== 'escritorio') return;
    }
    const D = S.plat.docs;
    if (!D.disponivel) {
      el.innerHTML = `<div class="note">${icon('info')}<div><b>Guias, holerites e recibos que o escritório publica.</b> ${esc(motivoDocs(D))} Enquanto isso, os arquivos que o escritório manda nas solicitações estão em <a href="#" id="doc-ir-sol">Nas solicitações</a>.<div class="actions" style="margin-top:8px"><button class="btn btn-sm btn-primary" id="doc-portal">${icon('external', 'ic-sm')} Abrir Documentos no portal</button></div></div></div>`;
      $('#doc-portal').addEventListener('click', () => request({ type: 'abrirNoPortal', area: 'documentos' }));
      $('#doc-ir-sol').addEventListener('click', (e) => { e.preventDefault(); S.plat.docAba = 'solicitacoes'; renderDocumentos(); });
      return;
    }
    const F = S.plat.filtroPub || (S.plat.filtroPub = { q: '', cat: '', nl: false });
    const itens = D.itens || [];
    const cats = [...new Set(itens.map(x => x.categoria || 'Outros'))];
    el.innerHTML = `<div class="dp-toolbar">
        <input type="search" id="pub-q" placeholder="Buscar documento ou competência…" value="${esc(F.q)}" autocomplete="off">
        <div class="seg" role="group" aria-label="Situação"><button type="button" data-pub-nl="0" aria-pressed="${!F.nl}">Todos <span class="mono arq-n">${itens.length}</span></button><button type="button" data-pub-nl="1" aria-pressed="${F.nl}">Não lidos <span class="mono arq-n">${itens.filter(x => x.lido === false).length}</span></button></div>
        ${cats.length > 6 ? `<select id="pub-cat" aria-label="Pasta"><option value="">Todas as pastas (${itens.length})</option>${cats.map(c => `<option value="${esc(c)}"${F.cat === c ? ' selected' : ''}>${esc(c)} (${itens.filter(x => (x.categoria || 'Outros') === c).length})</option>`).join('')}</select>` : `<div class="seg" role="group" aria-label="Categoria">${[['', 'Todas']].concat(cats.map(c => [c, c])).map(([k, r]) => `<button type="button" data-pub-cat="${esc(k)}" aria-pressed="${F.cat === k}">${esc(r)} <span class="mono arq-n">${k ? itens.filter(x => (x.categoria || 'Outros') === k).length : itens.length}</span></button>`).join('')}</div>`}
        <span class="spacer"></span>
        ${D.total && D.total > itens.length ? `<span class="muted">Mostrando os ${itens.length} mais recentes de ${D.total}</span>` : ''}
        <button class="btn btn-sm btn-ghost" id="pub-ref">${icon('refresh', 'ic-sm')} Atualizar</button>
        <button class="btn btn-sm" id="doc-portal">${icon('external', 'ic-sm')} Ver no portal</button>
      </div><div id="pub-lista"></div>`;
    $('#pub-ref')?.addEventListener('click', () => { S.plat.docs = null; docsEscritorio(el); });
    const desenhar = () => {
      const q = E.norm(F.q);
      const vis = itens.map((x, n) => ({ x, n })).filter(({ x }) => (!F.cat || (x.categoria || 'Outros') === F.cat) && (!F.nl || x.lido === false) && (!q || E.norm(`${x.nome} ${x.categoria} ${x.competencia}`).includes(q)));
      // agrupados pela competência, a mais recente primeiro
      const chave = (c) => { const m = /^(\d{2})\/(\d{4})$/.exec(c || '') || /^pub:(\d{4})-(\d{2})$/.exec(c || ''); return m ? (c.startsWith('pub:') ? `${m[1]}${m[2]}` : `${m[2]}${m[1]}`) : '0'; };
      const grupos = new Map();
      vis.sort((a, b) => chave(b.x.competencia || (b.x.criado ? `pub:${new Date(b.x.criado).toISOString().slice(0, 7)}` : '')).localeCompare(chave(a.x.competencia || (a.x.criado ? `pub:${new Date(a.x.criado).toISOString().slice(0, 7)}` : '')))).forEach(v => { const k = v.x.competencia || (v.x.criado ? `pub:${new Date(v.x.criado).toISOString().slice(0, 7)}` : ''); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(v); });
      const rotComp = (c) => { const m = /^(\d{2})\/(\d{4})$/.exec(c || ''); const p = /^pub:(\d{4})-(\d{2})$/.exec(c || ''); const mes = (a, mm) => cap(new Date(+a, +mm - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })); return m ? mes(m[2], m[1]) : p ? `Publicados em ${mes(p[1], p[2])}` : 'Sem data'; };
      $('#pub-lista').innerHTML = `<div class="list-card"><div class="dp-listhead doc-cols"><span>Documento</span><span>Categoria</span><span>Competência</span><span>Publicado</span><span></span></div>
        ${[...grupos].map(([k, vs]) => `<div class="arq-mes"><span>${esc(rotComp(k))}</span>${D.baixar === false ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-zip="${esc(k)}" title="Baixa todos os documentos deste grupo num arquivo ZIP">${icon('download', 'ic-sm')} Baixar tudo (ZIP)</button>`}</div>${vs.map(({ x, n }) => { const [cls, rot] = tipoArquivo(x.arquivo || 'x.pdf'); return `<div class="dp-row doc-cols hov"><span class="arq-nome"><span class="arq-ext ext-${cls}">${rot}</span><span class="arq-tx"><b class="ell">${esc(x.nome)}</b>${x.lido === false ? ' <span class="pill pill-soon">Novo</span>' : ''}</span></span><span>${esc(x.categoria || '—')}</span><span class="mono">${esc(x.competencia || '—')}</span><span class="mono">${esc(x.data || '—')}</span><span class="row-acts"><button type="button" class="btn btn-sm" data-baixar="${n}">${D.baixar === false ? `${icon('external', 'ic-sm')} No portal` : `${icon('download', 'ic-sm')} Baixar`}</button></span></div>`; }).join('')}`).join('')
          || `<div class="list-vazio">${itens.length ? 'Nenhum documento com esse filtro.' : 'Nenhum documento publicado.'}</div>`}</div>`;
      const motivos = { 'sem acesso': 'o portal não deixou ler o arquivo', 'sem projeto': 'não achei o código do projeto', 'arquivo grande demais': 'o arquivo é grande demais', 'sem endereço de download': 'o portal não trouxe o endereço do arquivo', 'sem regra': 'download não configurado' };
      const baixarUm = async (x) => {
        const r = await request({ type: 'baixarDocumento', docId: x.id, projeto: x.projeto, nome: x.nome }, 90000);
        if (!r?.arquivo) return { ok: false, motivo: motivos[r?.motivo] || r?.motivo || 'sem resposta do portal' };
        return { ok: true, arquivo: r.arquivo };
      };
      const entregar = (bytes, nome, tipo) => {
        const url = URL.createObjectURL(new Blob([bytes], { type: tipo || 'application/octet-stream' }));
        const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      };
      $('#pub-lista').querySelectorAll('[data-baixar]').forEach(b => b.addEventListener('click', async () => {
        if (D.baixar === false) { request({ type: 'abrirNoPortal', area: 'documentos' }, 30000); return; }   // download não configurado nas regras
        const x = itens[+b.dataset.baixar]; b.disabled = true;
        const r = await baixarUm(x); b.disabled = false;
        if (!r.ok) { toast(`Não consegui baixar: ${r.motivo}. Você pode abrir no portal.`); return; }
        entregar(r.arquivo.buf, r.arquivo.name || x.nome, r.arquivo.type);
      }));
      // todos os documentos de um grupo (competência) num ZIP, montado no computador do cliente; um por vez, os que falharem são listados
      $('#pub-lista').querySelectorAll('[data-zip]').forEach(b => b.addEventListener('click', async () => {
        const lista = (grupos.get(b.dataset.zip) || []).map(v => v.x); if (!lista.length) return;
        b.disabled = true; const falhas = []; const arqs = [];
        for (let n = 0; n < lista.length; n++) {
          b.textContent = `Baixando ${n + 1} de ${lista.length}…`;
          const r = await baixarUm(lista[n]);
          if (r.ok) arqs.push({ nome: r.arquivo.name || lista[n].nome, bytes: new Uint8Array(r.arquivo.buf) }); else falhas.push(`${lista[n].nome} (${r.motivo})`);
        }
        b.disabled = false; b.innerHTML = `${icon('download', 'ic-sm')} Baixar tudo (ZIP)`;
        if (!arqs.length) { toast(`Não consegui baixar: ${falhas[0] || 'sem resposta do portal'}.`); return; }
        entregar(criarZip(arqs), `Documentos ${nomeNoZip(rotComp(b.dataset.zip)).replace(/\s+/g, ' ')}.zip`, 'application/zip');
        toast(falhas.length ? `ZIP com ${arqs.length} arquivo(s). Não baixei ${falhas.length}: ${falhas.slice(0, 3).join('; ')}${falhas.length > 3 ? '…' : ''}.` : `ZIP com ${arqs.length} arquivo(s) baixado.`);
      }));
    };
    let t0;
    $('#pub-q').addEventListener('input', (e) => { F.q = e.target.value; clearTimeout(t0); t0 = setTimeout(desenhar, 150); });
    el.querySelectorAll('[data-pub-nl]').forEach(b => b.addEventListener('click', () => { F.nl = b.dataset.pubNl === '1'; el.querySelectorAll('[data-pub-nl]').forEach(x => x.setAttribute('aria-pressed', x === b)); desenhar(); }));
    $('#pub-cat')?.addEventListener('change', (ev) => { F.cat = ev.target.value; desenhar(); });
    el.querySelectorAll('[data-pub-cat]').forEach(b => b.addEventListener('click', () => { F.cat = b.dataset.pubCat; el.querySelectorAll('[data-pub-cat]').forEach(x => x.setAttribute('aria-pressed', x === b)); desenhar(); }));
    $('#doc-portal').addEventListener('click', () => request({ type: 'abrirNoPortal', area: 'documentos' }));
    desenhar();
  }
  function docsAnexos(el) {
    const linhas = [];
    for (const [tipo, W] of Object.entries(S.work)) for (const a of W?.arquivos || []) if (!a.removido) linhas.push({ nome: a.nome, doc: a.analise?.documento?.nome || '—', tipo, quando: 'agora', st: a.jaAnexado || a.anexado ? ['ok', 'no portal'] : a.recusado ? ['late', 'recusado pelo portal'] : ['soon', 'só no Assistente'] });
    for (const h of (S.historico || []).filter(h => !S.ctx.empresa || h.empresa === S.ctx.empresa)) for (const n of h.anexos || []) linhas.push({ nome: n, doc: h.valores?.empregado || h.valores?.nome || '—', tipo: h.tipo, quando: new Date(h.quando).toLocaleDateString('pt-BR'), st: h.status === 'enviado' ? ['ok', 'enviado'] : ['today', 'não enviado'] });
    el.innerHTML = `<div class="list-card"><div class="dp-listhead anx-cols"><span>Arquivo</span><span>Documento / funcionário</span><span>Solicitação</span><span>Quando</span></div>
      ${linhas.map(l => `<div class="dp-row anx-cols hov"><span class="ell"><b>${esc(l.nome)}</b></span><span class="ell">${esc(l.doc)}</span><span><span class="ell">${esc(nomeTipo(l.tipo))}</span></span><span><span class="pill pill-${l.st[0]}">${esc(l.st[1])}</span> <span class="sub">${esc(l.quando)}</span></span></div>`).join('') || '<div class="list-vazio">Os arquivos que você anexar com o Assistente aparecem aqui.</div>'}
      <div class="list-foot">Só os nomes dos arquivos ficam guardados neste computador, nunca o conteúdo.</div></div>`;
  }
  function docsModelos(el) {
    const M = S.rules.modelosDocumento || [];
    el.innerHTML = `<div class="pn-grid">${M.map((md, n) => `<section class="pn-card"><div class="pn-card-head"><h3>${esc(md.titulo)}</h3></div><div class="pn-card-body mdl-card"><p>${esc(md.descricao || '')}</p>${md.revisarComEscritorio ? '<span class="pill pill-today" style="justify-self:start">Modelo sugerido — confirme com o escritório</span>' : ''}<button type="button" class="btn btn-primary btn-sm" data-mdl="${n}" style="justify-self:start">${icon('fill', 'ic-sm')} Preencher</button></div></section>`).join('') || '<p class="muted">Nenhum modelo cadastrado pelo escritório.</p>'}</div>`;
    el.querySelectorAll('[data-mdl]').forEach(b => b.addEventListener('click', () => abrirModelo(M[+b.dataset.mdl], { empresa: S.ctx.empresa })));
  }
  const textoModelo = (md, vals) => (md.texto || []).map(l => String(l).replace(/\{(\w+)(?:\|([^}]*))?\}/g, (_, k, fb) => (vals[k] != null && String(vals[k]).trim() !== '' ? String(vals[k]) : (fb ?? '')))).join('\n');
  /** Modelo para assinar. iniciais: valores do pedido (funcionário, datas, admissão…); opts.nota: explicação; opts.acao: botão extra. */
  function abrirModelo(md, iniciais = {}, opts = {}) {
    const vals = { ...iniciais };
    const nomes = empregadosAtivos().map(e => e.nome);
    const campo = (c) => {
      const id = `md-${c.k}`;
      if (c.tipo === 'opcoes') return `<div class="field"><label for="${id}">${esc(c.rotulo)}</label><select class="input" id="${id}" data-k="${c.k}"><option value="">—</option>${(c.opcoes || []).map(o => `<option>${esc(o)}</option>`).join('')}</select></div>`;
      return `<div class="field"><label for="${id}">${esc(c.rotulo)}</label><input class="input" id="${id}" data-k="${c.k}" data-t="${c.tipo === 'data' ? 'data' : ''}" ${c.tipo === 'empregado' ? 'list="md-emps"' : ''} placeholder="${c.tipo === 'data' ? 'DD/MM/AAAA' : esc(c.dica || '')}" ${['data', 'numero'].includes(c.tipo) ? 'inputmode="numeric"' : ''} autocomplete="off">${c.dica && c.tipo !== 'data' ? `<span class="field-hint">${esc(c.dica)}</span>` : ''}</div>`;
    };
    const base = () => ({ ...vals, empresa: S.ctx.empresa, hoje: E.today().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) });
    const dlg = dialogo({
      titulo: esc(md.titulo), largo: true,
      corpo: `${opts.nota ? `<div class="note" style="margin:0 0 10px">${icon('info')}<div>${esc(opts.nota)}</div></div>` : ''}<div class="mdl-grid"><div style="display:grid;gap:10px;align-content:start">${(md.campos || []).map(campo).join('')}<datalist id="md-emps">${nomes.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        ${md.revisarComEscritorio ? `<div class="note warn" style="margin:0">${icon('alert')}<div>Modelo sugerido. Confirme o texto com o seu analista antes de usar.</div></div>` : ''}</div>
        <div class="mdl-prev" id="md-prev"></div></div>`,
      acoes: [{ rotulo: `${icon('copy', 'ic-sm')} Copiar texto`, fn: async () => { try { await navigator.clipboard.writeText(textoModelo(md, base())); toast('Texto copiado.'); } catch { toast('Não consegui copiar. Selecione o texto e use Ctrl+C.'); } return false; } },
        ...(opts.acao ? [{ rotulo: opts.acao.rotulo, fn: () => { setTimeout(() => opts.acao.fn(), 0); } }] : []),
        '|', { rotulo: 'Fechar' },
        { rotulo: `${icon('print', 'ic-sm')} Imprimir ou salvar em PDF`, cls: 'btn-primary', fn: () => { imprimir(textoModelo(md, base())); return false; } }]
    });
    // já preenchido com o que o pedido tem
    dlg.el.querySelectorAll('[data-k]').forEach(i => { const v = vals[i.dataset.k]; if (v == null || v === '') return; if (i.tagName === 'SELECT') { const o = [...i.options].find(x => E.norm(x.value) === E.norm(v)); if (o) i.value = o.value; } else i.value = v; });
    const prev = () => { dlg.el.querySelector('#md-prev').textContent = textoModelo(md, base()); };
    dlg.el.querySelectorAll('[data-k]').forEach(i => i.addEventListener('input', () => { if (i.dataset.t === 'data') A.maskInput(i); vals[i.dataset.k] = i.value; prev(); }));
    prev();
  }
  P.abrirModelo = abrirModelo;
  function imprimir(texto) {
    const area = $('#print-area'); area.innerHTML = `<pre>${esc(texto)}</pre>`;
    document.body.classList.add('imprimindo');
    const fim = () => { document.body.classList.remove('imprimindo'); area.innerHTML = ''; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    setTimeout(() => { window.print(); setTimeout(fim, 500); }, 50);
  }
  function docsListas(el) {
    const tipos = Object.entries(S.rules.tipos).filter(([, t]) => (t.anexos || []).length);
    el.innerHTML = `<div class="pn-grid">${tipos.map(([k, t]) => `<section class="pn-card"><div class="pn-card-head"><h3>${esc(t.nome)}</h3></div><div class="pn-card-body"><div class="doclist">${t.anexos.map(a => `<div class="dl-i"><span class="st">${icon(a.obrigatorio ? 'check' : 'minus', 'ic-sm')}</span><span>${esc(a.rotulo)}${a.obrigatorio ? '' : ' <small class="muted">(se houver)</small>'}</span></div>`).join('')}</div>
      ${k === 'cadastroEmpregado' ? `<button type="button" class="btn btn-sm" id="doc-msg" style="justify-self:start">${icon('copy', 'ic-sm')} Copiar mensagem para o novo funcionário</button>` : ''}</div></section>`).join('')}</div>`;
    $('#doc-msg')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(A.mensagemAdmissao()); toast('Mensagem copiada. Cole no WhatsApp ou no e-mail.'); } catch { toast('Não consegui copiar.'); } });
  }

  Object.assign(C, { abrirModelo, renderDocumentos });
}
