// Motor de regras — Documentos que o escritório publica (resposta da API do portal) e a forma da resposta para o diagnóstico.
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.

/** Documentos que o escritório publica (área Documentos do Onvio): resposta crua da API → itens do painel.
 *  A forma real da resposta ainda está sendo calibrada: os nomes dos campos vêm de config.documentosPortal (vale o primeiro
 *  que existir) e a competência também é procurada em customFields. Só os NOMES dos campos vão para o diagnóstico. */
export function documentosDoPortal(json, rules) {
  const cfg = rules?.config?.documentosPortal || {};
  const caminho = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const primeiro = (o, lista) => { for (const p of lista || []) { const v = caminho(o, p); if (v != null && v !== '' && typeof v !== 'object') return v; } return undefined; };
  // a lista pode estar na raiz, numa chave conhecida ou mais adentro (até 3 níveis): vale a primeira de objetos
  const acharLista = (o, prof = 0) => {
    if (Array.isArray(o)) return o;
    if (!o || typeof o !== 'object' || prof > 3) return null;
    for (const k of cfg.listaEm || []) if (Array.isArray(o[k])) return o[k];
    const arr = Object.values(o).find(v => Array.isArray(v) && (!v.length || (v[0] && typeof v[0] === 'object')));
    if (arr) return arr;
    for (const v of Object.values(o)) { const r = acharLista(v, prof + 1); if (r) return r; }
    return null;
  };
  const lista = acharLista(json);
  const forma = formaDaResposta(json);
  if (!lista) return { itens: [], total: null, campos: [], reconhecido: false, forma };
  const total = (() => { const v = json && !Array.isArray(json) ? primeiro(json, cfg.total || ['totalItems', 'total']) : undefined; return Number.isFinite(+v) ? +v : null; })();
  const maisPaginas = json && !Array.isArray(json) ? primeiro(json, cfg.maisPaginas || ['hasMore']) === true : false;
  const dataBr = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const competenciaDe = (v) => {
    const t = String(v ?? '').trim(); let m;
    if ((m = /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(t))) return `${m[2]}/${m[1]}`;
    if ((m = /^(\d{2})[/-](\d{4})$/.exec(t))) return `${m[1]}/${m[2]}`;
    if ((m = /^(\d{4})(\d{2})$/.exec(t))) return `${m[2]}/${m[1]}`;
    return '';
  };
  const reComp = new RegExp(`^(${(cfg.competencia || ['competence']).map(x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`, 'i');
  const doCustom = (raw) => {
    const cf = raw?.customFields ?? raw?.CustomFields;
    if (Array.isArray(cf)) { const c = cf.find(x => reComp.test(String(x?.Name ?? x?.name ?? ''))); return c ? competenciaDe(c.Value ?? c.value) : ''; }
    if (cf && typeof cf === 'object') { const k = Object.keys(cf).find(x => reComp.test(x)); return k ? competenciaDe(cf[k]) : ''; }
    return '';
  };
  const itens = [];
  for (const raw of lista) {
    if (!raw || typeof raw !== 'object' || raw.isFolder === true) continue;
    if (/^(folder|pasta|directory|container)$/i.test(String(primeiro(raw, cfg.campos?.tipoItem) ?? ''))) continue;
    const id = primeiro(raw, cfg.campos?.id), nome = primeiro(raw, cfg.campos?.nome);
    if (id == null || !nome) continue;
    const c = primeiro(raw, cfg.campos?.criado); const d = c ? new Date(c) : null;
    const diretaComp = primeiro(raw, cfg.competencia);
    itens.push({
      lido: (() => { const v = primeiro(raw, cfg.campos?.lido); return typeof v === 'boolean' ? v : null; })(),
      id: String(id), nome: String(nome), arquivo: String(nome), projeto: String(primeiro(raw, cfg.campos?.projeto) ?? ''), categoria: String(primeiro(raw, cfg.campos?.pasta) || ''),
      competencia: doCustom(raw) || competenciaDe(diretaComp), data: d && !isNaN(d) ? dataBr(d) : '', criado: d && !isNaN(d) ? d.getTime() : 0
    });
  }
  const campos = Object.keys(lista.find(x => x && typeof x === 'object') || {}).slice(0, 40);
  return { itens, total, campos, forma, maisPaginas, padroes: padroesDosItens(lista), reconhecido: itens.length > 0 || lista.length === 0 };
}

/** Para o diagnóstico: como são os campos personalizados dos itens (nome do campo e o PADRÃO do valor: dígitos viram 9, letras
 *  viram a, códigos de 32 letras/números viram <id>; nenhum valor real), mais tipo/situação quando são só uma palavra.
 *  Serve para achar de onde vem a competência. Ex.: ['competence=99/9999 (x12)', 'tipo=Document (x45)']. */
export function padroesDosItens(lista) {
  const forma = (v) => {
    const t = String(v ?? '');
    if (/^[0-9a-f]{32}$/i.test(t)) return '<id>';
    return t.slice(0, 24).replace(/\d/g, '9').replace(/[A-Za-zÀ-ÿ]/g, 'a').replace(/a+/g, 'a');
  };
  const cont = new Map(); const marca = (k) => cont.set(k, (cont.get(k) || 0) + 1);
  for (const raw of Array.isArray(lista) ? lista : []) {
    if (!raw || typeof raw !== 'object') continue;
    const cf = raw.customFields ?? raw.CustomFields;
    if (Array.isArray(cf)) { if (!cf.length) marca('customFields=[]'); for (const c of cf.slice(0, 8)) marca(`customFields.${String(c?.Name ?? c?.name ?? '?').slice(0, 30)}=${forma(c?.Value ?? c?.value)}`); }
    else if (cf && typeof cf === 'object') { const ks = Object.keys(cf); if (!ks.length) marca('customFields={}'); for (const k of ks.slice(0, 8)) marca(`customFields.${k.slice(0, 30)}=${forma(cf[k])}`); }
    else marca(`customFields=${cf == null ? 'null' : typeof cf}`);
    for (const k of ['customItemMetaData', 'userTags']) { const v = raw[k]; marca(`${k}=${v == null ? 'null' : Array.isArray(v) ? (v.length ? `[${v.length}]` : '[]') : typeof v === 'object' ? `{${Object.keys(v).slice(0, 6).join(',')}}` : typeof v}`); }
    for (const k of ['documentType', 'itemType', 'status']) { const v = raw[k]; if (v != null) marca(`${k}=${/^[A-Za-z]{1,20}$/.test(String(v)) ? v : forma(v)}`); }
    const pi = raw.parentItem; marca(`parentItem=${pi == null ? 'null' : typeof pi === 'object' ? `{${Object.keys(pi).slice(0, 6).join(',')}}` : typeof pi}`);
  }
  return [...cont].slice(0, 30).map(([k, n]) => `${k} (x${n})`);
}

/** Só a FORMA de uma resposta (nomes das chaves e tipos, até 3 níveis; nenhum valor): para o diagnóstico. Chaves que parecem
 *  código (32 letras/números) viram <id>. Ex.: {data:{items:[{id,name}],total}}. */
export function formaDaResposta(o, prof = 0) {
  if (o == null) return 'null';
  if (Array.isArray(o)) return o.length ? `[${prof >= 4 ? '…' : formaDaResposta(o[0], prof + 1)}]` : '[]';
  if (typeof o !== 'object') return typeof o;
  if (prof >= 4) return '{…}';
  const chave = (k) => (/^[0-9a-f]{32}$/i.test(k) ? '<id>' : String(k).slice(0, 40));
  const ks = Object.keys(o).slice(0, 25);
  return `{${ks.map(k => `${chave(k)}${prof >= 3 || o[k] == null || typeof o[k] !== 'object' ? '' : ':' + formaDaResposta(o[k], prof + 1)}`).join(',')}${Object.keys(o).length > 25 ? ',…' : ''}}`.slice(0, 600);
}
