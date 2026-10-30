/* Painel — Facilidades: rascunho, repetir, colar, diagnóstico. (parte de panel/panel.js, dividido na 2.16.4; mapa em docs/arquitetura.md). */
import * as E from '../engine.js';
import { libsPresentes } from '../extract.js';
import { $, P, S, debounce, esc, icon, request, standalone, toast } from './base.js';
import { empresaDoPedido, handleFiles, openTipo } from './inicio.js';
import { esperar } from './lote.js';
import { fillPortal } from './formulario.js';
import { gerarTextos, guardarAdmissoes, portalValores } from './valores.js';
import { render, tipoDef, w } from './modo.js';
import { savePrefs } from './conexao.js';

export async function carregarHistorico() { const { historico = [] } = await chrome.storage.local.get('historico'); S.historico = historico; return historico; }

export const nomeCurto = (n) => { const p = String(n).trim().split(/\s+/); const t = (x) => x.charAt(0) + x.slice(1).toLowerCase(); return p.length > 1 ? `${t(p[0])} ${t(p[p.length - 1])}` : t(p[0] || ''); };

/** Mesmo pedido já enviado por este computador (mesmo funcionário e mesma data). */
export const CHAVE_REPETIDO = { afastamento: 'dataAfastamento', avisoFerias: 'inicioGozo', calculoFerias: 'inicioGozo', avisoRescisao: 'dataAviso', calculoRescisao: 'dataDemissao', rubricas: 'competencia' };

export function duplicado(tipo, vals) {
  const k = CHAVE_REPETIDO[tipo]; const quem = vals.empregado || '';
  if (!k || !vals[k] || (tipo !== 'rubricas' && !quem)) return null;
  const h = S.historico.find(x => x.status === 'enviado' && x.empresa === S.ctx.empresa && x.tipo === tipo && (x.valores?.empregado || '') === quem && x.valores?.[k] === vals[k] && Date.now() - x.quando < 180 * 864e5);
  return h ? `Uma solicitação igual já foi enviada em ${new Date(h.quando).toLocaleDateString('pt-BR')} (“${h.resumo}”). Confira se esta não é repetida.` : null;
}

/* ---------- Rascunho: o que foi preenchido fica guardado neste computador por 7 dias ---------- */
export const RASCUNHO_DIAS = 7;

export const chaveRascunho = (tipo) => `${S.ctx.empresa}|${tipo}`;

/** O que vale guardar de um formulário (sem CID e sem os textos gerados). */
export function rascunhoDe(W) {
  const valores = Object.fromEntries(Object.entries(W.valores).filter(([k, v]) => v?.valor && v.fonte !== 'gerado' && !v.calculado && k !== 'cid').map(([k, v]) => [k, { valor: v.valor, conf: v.conf, fonte: v.fonte }]));
  if (!Object.keys(valores).length) return null;
  return { quando: Date.now(), valores, editados: [...W.editados], anexos: W.arquivos.filter(a => !a.removido).map(a => a.nome) };
}

/** Grava já (sem esperar o debounce), numa só leitura e escrita — usado ao trocar de empresa. */
export async function gravarRascunhos(pares) {
  if (standalone || !pares.length) return;
  const { rascunhos = {} } = await chrome.storage.local.get('rascunhos');
  for (const { tipo, empresa, dados } of pares) {
    if (!tipo || !empresa) continue;
    if (dados) rascunhos[`${empresa}|${tipo}`] = dados; else delete rascunhos[`${empresa}|${tipo}`];
  }
  for (const [k, r] of Object.entries(rascunhos)) if (Date.now() - r.quando > RASCUNHO_DIAS * 864e5) delete rascunhos[k];
  await chrome.storage.local.set({ rascunhos });
}

export const salvarRascunho = debounce(async (tipo, empresa) => {
  if (!empresa || !tipo || standalone) return;
  const W = S.work[tipo]; if (!W) return;
  await gravarRascunhos([{ tipo, empresa, dados: rascunhoDe(W) }]);
}, 900);

export async function apagarRascunho(tipo, empresa = S.ctx.empresa) {
  const { rascunhos = {} } = await chrome.storage.local.get('rascunhos');
  if (rascunhos[`${empresa}|${tipo}`]) { delete rascunhos[`${empresa}|${tipo}`]; await chrome.storage.local.set({ rascunhos }); }
}

/** Formulário novo com dados de uma tentativa abandonada: se o cliente já começou outra coisa
 *  (arrastou um documento ou escreveu), os dados antigos não se misturam com os novos. */
export function comecarDoZeroSeAbandonado(tipo) {
  const W = S.work[tipo];
  if (!W || !((W.entrouComDados && !W.rascunhoVisto) || W.abandonado)) return;
  const empregados = W.empregados, opcoes = W.opcoes;
  S.work[tipo] = null;
  const N = w(tipo); N.rascunhoVisto = true; N.empregados = empregados; N.opcoes = opcoes;
  const el = $('#rascunho'); if (el) el.innerHTML = '';
}

export async function ofertaRascunho(tipo) {
  const el = $('#rascunho'); if (!el) return;
  const W = w(tipo);
  if (W.rascunhoVisto || (S.lote && !S.lote.concluido)) { el.innerHTML = ''; return; }
  const temAlgo = Object.values(W.valores).some(v => v?.valor && v.fonte !== 'gerado') || W.arquivos.some(a => !a.removido);
  const portalVazio = !Object.entries(portalValores(tipo)).some(([k, v]) => v && k !== 'conclusao');
  if (temAlgo && W.entrouComDados && portalVazio) {
    // saiu do formulário sem enviar e abriu de novo: os dados continuam aqui, o portal está vazio
    const quem = W.valores.empregado?.valor || W.valores.nome?.valor || '';
    el.innerHTML = `<div class="note">${icon('info')}<div><b>Você já tinha começado esta solicitação${quem ? ` (${esc(nomeCurto(quem))})` : ''}.</b> Quer continuar de onde parou?
      <div class="actions" style="margin-top:6px"><button class="btn btn-primary btn-sm" id="rasc-sim">Continuar</button><button class="btn btn-ghost btn-sm" id="rasc-nao">Começar do zero</button></div></div></div>`;
    $('#rasc-sim').addEventListener('click', () => { W.rascunhoVisto = true; W.entrouComDados = false; W.abandonado = false; W.arquivos.forEach(a => { a.anexado = false; }); el.innerHTML = ''; fillPortal(tipo); });
    $('#rasc-nao').addEventListener('click', () => { S.work[tipo] = null; w(tipo).rascunhoVisto = true; apagarRascunho(tipo); render(); });
    return;
  }
  if (temAlgo) { el.innerHTML = ''; return; }
  const { rascunhos = {} } = await chrome.storage.local.get('rascunhos');
  const r = rascunhos[chaveRascunho(tipo)];
  if (!r || Date.now() - r.quando > RASCUNHO_DIAS * 864e5) { el.innerHTML = ''; return; }
  const quem = r.valores.empregado?.valor || r.valores.nome?.valor || '';
  el.innerHTML = `<div class="note">${icon('info')}<div><b>Você começou esta solicitação ${new Date(r.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${quem ? ` (${esc(nomeCurto(quem))})` : ''}.</b> Quer continuar de onde parou?${r.anexos?.length ? ` <small class="muted">Os anexos (${esc(r.anexos.join(', '))}) precisam ser arrastados de novo.</small>` : ''}
    <div class="actions" style="margin-top:6px"><button class="btn btn-primary btn-sm" id="rasc-sim">Continuar</button><button class="btn btn-ghost btn-sm" id="rasc-nao">Começar do zero</button></div></div></div>`;
  $('#rasc-sim').addEventListener('click', () => {
    W.rascunhoVisto = true;
    for (const [k, v] of Object.entries(r.valores)) W.valores[k] = v;
    (r.editados || []).forEach(k => W.editados.add(k));
    gerarTextos(tipo); render();
    if (S.prefs.preencherAoLer && S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo, { silencioso: true });
  });
  $('#rasc-nao').addEventListener('click', () => { W.rascunhoVisto = true; apagarRascunho(tipo); el.innerHTML = ''; });
}

/* ---------- Avisos do escritório (regras.avisosEscritorio) ---------- */
export function renderAvisosInicio() {
  const el = $('#avisos-esc'); if (!el) return;
  const hoje = E.iso(E.today());
  const lidos = new Set(S.prefs.avisosLidos || []);
  const lista = (S.rules.avisosEscritorio || []).filter(a => a?.texto && (!a.ate || a.ate >= hoje) && (!a.desde || a.desde <= hoje) && !lidos.has(a.id || a.texto));
  el.innerHTML = lista.map(a => `<div class="note ${a.nivel === 'importante' ? 'warn' : ''} aviso-esc">${icon(a.nivel === 'importante' ? 'alert' : 'info')}<div>${a.titulo ? `<b>${esc(a.titulo)}</b> ` : ''}${esc(a.texto)}${a.link ? ` <a href="${esc(a.link)}" target="_blank" rel="noopener">Saiba mais</a>` : ''}</div>
    <button class="icon-btn" data-lido="${esc(a.id || a.texto)}" aria-label="Dispensar aviso">${icon('x', 'ic-sm')}</button></div>`).join('');
  el.querySelectorAll('[data-lido]').forEach(b => b.addEventListener('click', () => { S.prefs.avisosLidos = [...(S.prefs.avisosLidos || []), b.dataset.lido].slice(-50); savePrefs(); renderAvisosInicio(); }));
}

/* ---------- Contratos de experiência (data de admissão da lista de empregados do portal) ---------- */
export async function guardarEquipe(empresa, detalhes) {
  guardarAdmissoes(empresa, detalhes);
  const recentes = detalhes.filter(d => { const a = E.parseDate(d.admissao); return d.ativo !== false && a && E.diffDays(a, E.today()) <= 120; }).map(d => ({ nome: d.nome, admissao: d.admissao }));
  S.equipe.set(empresa, recentes);
  const { equipe = {} } = await chrome.storage.local.get('equipe');
  equipe[empresa] = { quando: Date.now(), recentes };
  await chrome.storage.local.set({ equipe });
  if (S.view === 'inicio') renderExperiencia();
}

export async function renderExperiencia() {
  const el = $('#experiencia'); if (!el || standalone) return;
  const emp = S.ctx.empresa; if (!emp) { el.innerHTML = ''; return; }
  let lista = S.equipe.get(emp);
  if (!lista) {
    const { equipe = {} } = await chrome.storage.local.get('equipe');
    if (equipe[emp] && Date.now() - equipe[emp].quando < 7 * 864e5) { lista = equipe[emp].recentes; S.equipe.set(emp, lista); }
    else { S.equipe.set(emp, []); request({ type: 'employees' }, 8000).then(r => { if (r?.detalhes?.length) guardarEquipe(emp, r.detalhes); }); return; }
  }
  const marcos = (S.rules.config?.experienciaDias || [45, 90]).map(Number).filter(Boolean);
  const hoje = E.today(); const itens = [];
  for (const p of lista || []) {
    const adm = E.parseDate(p.admissao); if (!adm) continue;
    for (const [i, n] of marcos.entries()) {
      const fim = E.addDays(adm, n - 1); const falta = E.diffDays(hoje, fim);
      if (falta >= -2 && falta <= 10) itens.push({ nome: p.nome, fim, falta, n, ultimo: i === marcos.length - 1 });
    }
  }
  if (!itens.length) { el.innerHTML = ''; return; }
  itens.sort((a, b) => a.fim - b.fim);
  el.innerHTML = `<div class="card pad exp">${icon('calc', 'ic-sm')} <b>Contratos de experiência</b>
    <ul>${itens.map(x => `<li><b>${esc(nomeCurto(x.nome))}</b> completa ${x.n} dias em <span class="mono">${E.fmtDate(x.fim)}</span> <span class="chip ${x.falta <= 3 ? 'warn' : 'info'}">${x.falta < 0 ? `há ${-x.falta} dia(s)` : x.falta === 0 ? 'hoje' : `em ${x.falta} dia(s)`}</span></li>`).join('')}</ul>
    <small class="muted">Contado pela data de admissão no portal (${marcos.join(' e ')} dias). Se for contrato de experiência, avise o escritório se vai ${itens.some(x => !x.ultimo) ? 'prorrogar, efetivar ou desligar' : 'efetivar ou desligar'} — antes da data.</small></div>`;
}

/* ---------- Repetir a última solicitação ---------- */
export function renderRepetir() {
  const el = $('#repetir'); if (!el || standalone) return;
  const h = S.historico.find(x => x.status === 'enviado' && x.empresa === S.ctx.empresa && S.rules.tipos[x.tipo]);
  if (!h) { el.innerHTML = ''; return; }
  el.innerHTML = `<button class="li repetir" type="button" id="rep-go">${icon('refresh')}<div class="main"><b>Repetir a última solicitação</b><small>${esc(h.resumo)} · ${new Date(h.quando).toLocaleDateString('pt-BR')}</small></div>${icon('arrow', 'ic-sm')}</button>`;
  $('#rep-go').addEventListener('click', async () => {
    if (!(await empresaDoPedido(h.tipo, { sugerida: h.empresa }))) return;
    // cadastro: só as escolhas da empresa (cargo, departamento…); os dados da pessoa anterior ficam de fora,
    // inclusive o que tinha ficado guardado de um cadastro começado
    const cadastro = !!E.camposDaEmpresa(h.tipo, S.rules);
    if (cadastro && S.work[h.tipo]) { const { empregados, opcoes } = S.work[h.tipo]; S.work[h.tipo] = null; Object.assign(w(h.tipo), { empregados, opcoes }); }
    const W = w(h.tipo);
    for (const [k, v] of Object.entries(E.valoresParaRepetir(h.tipo, h.valores, S.rules))) W.valores[k] = { valor: v, conf: 1, fonte: 'última solicitação' };
    W.rascunhoVisto = true;
    gerarTextos(h.tipo, true);
    await openTipo(h.tipo, { manter: true, semEmpresa: true });
    if (S.prefs.preencherAoLer) setTimeout(() => fillPortal(h.tipo, { silencioso: true }), 900);
    toast(cadastro ? 'Repeti só as escolhas da empresa (cargo, departamento, jornada…). Os dados da pessoa ficam de fora: complete com os do novo funcionário.' : 'Repeti os dados da última solicitação, menos as datas. Confira e complete.');
  });
}

/* ---------- Perguntas frequentes (regras.faq) ---------- */
export function renderFaq(q) {
  const el = $('#faq'); if (!el) return;
  // casa pelo radical das palavras (o plural acha o singular)
  const achadas = E.buscarFaq(q, S.rules, 4).map(f => ({ f }));
  el.innerHTML = achadas.length ? `<h2 class="sec">Dúvidas frequentes</h2>${achadas.map(({ f }) => `<details class="faq-i card"><summary>${esc(f.pergunta)}</summary><p>${esc(f.resposta)}</p></details>`).join('')}` : '';
}

/* ---------- Colar print/arquivo (Ctrl+V) no painel ---------- */
export function renomearColados(files) {
  const d = new Date(); const p2 = (n) => String(n).padStart(2, '0');
  const hora = `${p2(d.getHours())}h${p2(d.getMinutes())}m${p2(d.getSeconds())}s`;
  return files.map(f => /^image\.(png|jpe?g)$/i.test(f.name) || !f.name ? new File([f], `print-colado-${hora}-${++S.pv.printSeq}.${/jpe?g/i.test(f.type || '') ? 'jpg' : 'png'}`, { type: f.type || 'image/png' }) : f);
}

/* ---------- Tela do portal diferente do esperado: não preenche sozinho ---------- */
export function telaDiferente(tipo) {
  const t = tipoDef(tipo); const f = S.ctx.form?.campos;
  if (!t || !f || S.ctx.tipo !== tipo) return false;
  const obr = Object.entries(t.campos).filter(([, c]) => c.obrigatorio && c.fc && !c.somenteAssistente).map(([k]) => k);
  if (obr.length < 2) return false;
  const carregou = S.ctx.form.temArquivo || Object.values(f).some(v => v.existe);
  return carregou && obr.filter(k => f[k]?.existe).length / obr.length < 0.34;
}

export function renderModoSeguro(tipo) {
  const el = $('#modo-seguro'); if (!el) return;
  if (!telaDiferente(tipo) || w(tipo).forcarPreenchimento) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="note warn">${icon('alert')}<div><b>Esta tela do portal está diferente do que eu conheço.</b> Por segurança, não vou preencher sozinho. Você pode preencher assim mesmo ou mandar o diagnóstico para o escritório.
    <div class="actions" style="margin-top:6px"><button class="btn btn-sm" id="ms-forcar">Preencher assim mesmo</button><button class="btn btn-ghost btn-sm" id="ms-diag">Copiar diagnóstico</button></div></div></div>`;
  $('#ms-forcar').addEventListener('click', () => { w(tipo).forcarPreenchimento = true; el.innerHTML = ''; fillPortal(tipo); });
  $('#ms-diag').addEventListener('click', copiarDiagnostico);
}

/* ---------- Diagnóstico (sem dados pessoais): para o escritório entender um problema ---------- */
export async function textoDiagnostico() {
  const info = await chrome.runtime.sendMessage({ type: 'getSettings' }).catch(() => null);
  const tipo = S.ctx.tipo; const W = tipo ? w(tipo) : null; const f = S.ctx.form?.campos || {};
  const semValores = (m) => String(m || '').replace(/"[^"]*"|“[^”]*”/g, '"…"');
  return [
    'Diagnóstico do Assistente ControlTax (sem dados pessoais)',
    `Quando: ${new Date().toLocaleString('pt-BR')}`,
    `Extensão: v${info?.versaoExtensao || chrome.runtime.getManifest?.().version || '?'} · ${info?.unpacked ? 'instalada como pasta' : 'pacote'}${info?.simulador ? ' · simulador' : ''}`,
    `Regras: ${S.meta.versao} (${S.meta.origem})${S.rules?.empresaAjustada ? ' · com ajustes da empresa' : ''}${S.meta.erro ? ' · aviso: ' + S.meta.erro : ''}`,
    `Navegador: ${(navigator.userAgent.match(/Chrome\/[\d.]+/) || ['?'])[0]} · tela ${screen.width}x${screen.height} · texto ${S.prefs.tamanhoTexto}`,
    `Página: ${S.ctx.route?.mode || '?'} · ${S.ctx.route?.slug || '-'} · solicitação ${tipo || '-'}`,
    `Leitura de arquivos: ${await libsPresentes() ? 'bibliotecas ok' : 'pasta lib faltando'}`,
    await (async () => { const pi = await request({ type: 'portalInfo' }, 3000); if (!pi) return ''; return `Acesso à API do portal: ${pi.acesso?.visto ? 'visto (' + (pi.acesso.nomes || []).join(',') + ')' : 'não visto'} · respostas: ${Object.entries(pi.status || {}).map(([k, v]) => `${k.replace('/api/br-payroll-sr/', '')}=${v}`).join(' ') || '-'}`; })(),
    S.plat?.downDiag ? `Download sem endereço — forma da resposta: ${S.plat.downDiag}` : '',
    S.plat?.docsDiag ? `Documentos do escritório: ${S.plat.docsDiag.motivo ? `não lidos (${S.plat.docsDiag.motivo}${S.plat.docsDiag.codigo ? ' ' + S.plat.docsDiag.codigo : ''})` : `${S.plat.docsDiag.itens} itens reconhecidos${S.plat.docsDiag.total != null ? ` de ${S.plat.docsDiag.total}` : ''} · campos vistos: ${(S.plat.docsDiag.campos || []).join(',') || '-'}${S.plat.docsDiag.reconhecido === false ? ' · forma não reconhecida' : ''}${S.plat.docsDiag.forma ? ' · forma: ' + S.plat.docsDiag.forma : ''}${S.plat.docsDiag.padroes?.length ? ' · padrões: ' + S.plat.docsDiag.padroes.join('; ') : ''}`}` : '',
    `Tela: ${S.modo || '?'}${S.plat?.sol ? ` · solicitações lidas: ${S.plat.sol.itens.length}${S.plat.sol.erros.length ? ` (falharam: ${S.plat.sol.erros.map(t => `${t}=${S.plat.sol.codigos?.[t] ?? '?'}`).join(',')})` : ''} · situações: ${[...new Set(S.plat.sol.itens.map(i => i.estado))].join(',') || '-'} · campos dos itens: ${S.plat.sol.chaves.join(',') || '-'}` : ''}${S.plat?.emp ? ` · funcionários: ${S.plat.emp.lista.length}` : ''}`,
    S.ctx?.grade ? `Planilha de rubricas: ${S.ctx.grade.achou ? `achada (${S.ctx.grade.onde})` : 'não achada'}${S.ctx.grade.cheia ? ` · tela cheia (${S.ctx.grade.cheia})` : ''}` : '',
    tipo ? `Campos do portal (S=existe, B=bloqueado, P=preenchido): ${Object.entries(f).map(([k, v]) => `${k}:${v.existe ? 'S' : 'N'}${v.disabled ? 'B' : ''}${v.valor ? 'P' : ''}`).join(' ')}` : '',
    tipo ? `Campos do portal fora das regras: ${Object.values(S.ctx.form?.extras || {}).map(x => `${x.fc} (${x.rotulo})`).join(', ') || 'nenhum'}` : '',
    tipo && S.ctx.form?.erros?.length ? `Recusados pelo portal: ${S.ctx.form.erros.map(e => e.fc || e.k || '?').join(', ')}` : '',
    tipo ? `Listas carregadas: ${Object.entries(W.opcoes).map(([k, o]) => `${k}=${o.length}`).join(' ') || 'nenhuma'} · empregados=${W.empregados.length} · tela diferente: ${telaDiferente(tipo) ? 'sim' : 'não'}` : '',
    tipo && W.resultados?.resultados ? `Último preenchimento: ${W.resultados.resultados.filter(x => x.ok).length} ok; falhas: ${W.resultados.resultados.filter(x => !x.ok).map(x => `${x.campo} (${semValores(x.motivo)})`).join('; ') || 'nenhuma'}` : '',
    tipo ? `Arquivos: ${W.arquivos.map((a, i) => `#${i + 1} ${a.metodo || '?'}${a.confianca != null ? ' conf ' + a.confianca : ''}${a.rotacao ? ' girado ' + a.rotacao + '°' : ''} → ${a.documento || 'não reconhecido'}`).join(' · ') || 'nenhum'}` : '',
    tipo ? `Verificações: ${S.pv.lastChecks.filter(i => i.nivel === 'erro' || i.nivel === 'atencao').map(i => `${i.nivel}:${i.campo || i.grupo}`).join(' ') || 'nenhuma pendência'}` : ''
  ].filter(Boolean).join('\n');
}

export async function copiarDiagnostico() {
  const txt = await textoDiagnostico();
  try { await navigator.clipboard.writeText(txt); toast('Diagnóstico copiado. Cole na conversa com o escritório.'); }
  catch { const m = $('#modal'); m.hidden = false; m.innerHTML = `<div class="sheet"><h3>Diagnóstico</h3><textarea class="input mono" rows="12" id="m-txt">${esc(txt)}</textarea><div class="actions" style="margin-top:10px"><button class="btn btn-primary" id="m-ok">Fechar</button></div></div>`; $('#m-txt').select(); $('#m-ok').addEventListener('click', () => { m.hidden = true; m.innerHTML = ''; }); }
}

/** Liga os ouvintes deste módulo (chamado uma vez por panel.js, na ordem de antes). */
export function ligar() {
  document.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    handleFiles(renomearColados(files), 'colado');
  });
}
