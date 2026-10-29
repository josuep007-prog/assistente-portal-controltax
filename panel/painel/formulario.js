/* Painel — Formulário próprio da plataforma. (parte de panel/panel.js, dividido na 2.16.4; mapa em docs/arquitetura.md). */
import * as E from '../engine.js';
import { $, P, S, cidAtivo, debounce, esc, icon, packFiles, request, requestFill, send, toast } from './base.js';
import { TEXTOS, atualizarTextoNoPortal } from './portal.js';
import { admissaoDe, anexosAtuais, gerarTextos, portalValores, valoresParaChecar } from './valores.js';
import { ajustarDepartamento } from './inicio.js';
import { campoDef, campoPortal, msgAproximada, render, rotuloDe, tipoDef, w } from './modo.js';
import { duplicado, nomeCurto, renderModoSeguro, telaDiferente } from './facilidades.js';
import { ehSugestao, htmlSugestao, usarSugestao } from './lote.js';
import { fieldInput, renderDocChecklist, renderFieldsOnly, renderFieldsOnlySeMudou, renderFilesOnly, renderStepper } from './preencher.js';
import { salvarHistorico } from './historico.js';
import { savePrefs } from './conexao.js';

/* Com a plataforma em tela cheia, o formulário é daqui: cada campo do portal aparece aqui, e o que o
   cliente escreve vai para o portal por baixo (ao sair do campo, em lote). Assim que o portal confirma,
   o estado do campo mostra se ficou igual lá. O resumo antes de enviar continua lendo o próprio portal. */
export const envioPendente = new Map();   // tipo → { t, campos: Set } (só os campos que o cliente mudou vão ao portal)

export function agendarEnvioPortal(tipo, k) {
  const p = envioPendente.get(tipo) || { campos: new Set() };
  clearTimeout(p.t); if (k) p.campos.add(k);
  const esperaMs = Math.max(150, S.rules.config?.escritaAoVivo?.esperaMs || 500);
  p.t = setTimeout(() => { envioPendente.delete(tipo); if (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo, { daPlataforma: true, so: [...p.campos] }); }, esperaMs);
  envioPendente.set(tipo, p);
}

export async function enviarPendenteAgora(tipo) {
  const p = envioPendente.get(tipo); if (!p) return;
  clearTimeout(p.t); envioPendente.delete(tipo);
  await fillPortal(tipo, { daPlataforma: true, so: [...p.campos] });
}

/** Valor que o formulário da plataforma mostra: o que o cliente escreveu aqui; senão o do portal. Depois de um
 *  Desfazer, o mesmo que o portal (o que foi desfeito não aparece aqui como se ainda estivesse lá). */
export function valorPlat(tipo, k) {
  const W = w(tipo); const p = campoPortal(k); const cur = W.valores[k];
  if (W.fonteVerdade?.[k] === 'plataforma') return cur?.valor ?? '';
  if (W.pausarAuto && p.existe) return p.valor || '';
  if (ehSugestao(cur)) return p.valor || '';          // lido com dúvida: aparece embaixo, com "Usar"
  return p.valor || cur?.valor || '';
}

export const erroDoPortal = (k) => (S.ctx.form?.erros || []).find(e => e.k === k) || null;

/** Estado de um campo do formulário próprio: o que está no portal comparado com o que o cliente escreveu aqui. */
export function estadoCampoPlat(tipo, k, obrigatorio) {
  const W = w(tipo); const p = campoPortal(k); const cur = W.valores[k];
  const valor = valorPlat(tipo, k);
  if (p.disabled) return ['muted', 'bloqueado'];
  if (erroDoPortal(k)) return ['err', 'o portal recusou'];
  if (valor && E.norm(valor) !== E.norm(p.valor || '')) return ['warn', 'ainda não está no portal'];
  if (p.valor && W.aproximadas?.[k] && E.norm(W.aproximadas[k].escolhida) === E.norm(p.valor)) return ['warn', 'confira'];
  if (p.valor) return W.ultimoPreenchido?.[k] === p.valor && cur?.fonte && cur.fonte !== 'você' ? ['ok', 'lido pelo Assistente'] : ['info', 'no portal'];
  if (ehSugestao(cur)) return ['warn', 'sugestão'];
  return obrigatorio ? ['err', 'obrigatório'] : ['', ''];
}

/** Enquanto o cliente digita no formulário, não redesenha os campos (perderia o cursor): só os estados. */
export function atualizarEstadosPlat(tipo) {
  const t = tipoDef(tipo); if (!t) return;
  document.querySelectorAll('#fields .field.pf[data-campo]').forEach(f => {
    const k = f.dataset.campo; const lbl = f.querySelector('label'); if (!lbl) return;
    const [cls, txt] = estadoCampoPlat(tipo, k, !!(t.campos[k]?.obrigatorio && !campoPortal(k).disabled));
    f.classList.toggle('pf-err', !!erroDoPortal(k));
    let chip = lbl.querySelector('.pf-st');
    if (!txt) { chip?.remove(); return; }
    if (!chip) { chip = document.createElement('span'); lbl.insertBefore(chip, lbl.querySelector('.src')); }
    chip.className = `chip ${cls} pf-st`; chip.textContent = txt;
  });
}

export const chaveCampos = (tipo) => { const W = w(tipo); return JSON.stringify([S.ctx.form?.campos, S.ctx.form?.extras, S.ctx.form?.erros, Object.entries(W.valores).map(([a, b]) => [a, b?.valor]), W.ultimoPreenchido, W.aproximadas, W.sugestoes, W.pausarAuto]); };

export function renderFormularioProprio(el, tipo) {
  const t = tipoDef(tipo); const W = w(tipo);
  S.pv.lastFieldsKey = chaveCampos(tipo);
  const pf = S.ctx.form?.campos || {};
  const cond = E.activeConditionals(t, valoresParaChecar(tipo));
  const reqCond = new Set(cond.flatMap(c => c.obrigatorios || []));
  const obrig = (k, c) => (c.obrigatorio || reqCond.has(k)) && !campoPortal(k).disabled;
  const doPortal = Object.entries(t.campos).filter(([k, c]) => !c.somenteAssistente && !TEXTOS.includes(k) && pf[k]?.existe !== false);
  // campos do portal que as regras não conhecem: aparecem num grupo próprio e também são preenchidos
  const foraDasRegras = Object.keys(S.ctx.form?.extras || {}).map(k => [k, campoDef(tipo, k)]);
  const grupos = new Map();
  for (const par of [...doPortal, ...foraDasRegras]) { const g = par[1].grupo || ''; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(par); }
  const fv = W.fonteVerdade || (W.fonteVerdade = {});
  const M = S.rules.mensagens || {};
  const campo = ([k, c]) => {
    const p = campoPortal(k); const cur = W.valores[k];
    const daqui = fv[k] === 'plataforma';
    const valor = valorPlat(tipo, k);
    const estado = estadoCampoPlat(tipo, k, obrig(k, c));
    const fonte = cur?.fonte && !['você', 'gerado'].includes(cur.fonte) && !daqui ? cur.fonte : '';
    const sugDoc = !p.valor && !daqui && ehSugestao(cur);
    const baixa = cur?.conf != null && cur.conf < 0.6 && !W.editados.has(k) && !daqui && !sugDoc;
    const erro = erroDoPortal(k);
    const apx = W.aproximadas?.[k] && E.norm(W.aproximadas[k].escolhida) === E.norm(p.valor || '') ? W.aproximadas[k] : null;
    const sug = !p.valor && W.sugestoes?.[k]?.length ? W.sugestoes[k] : null;
    return `<div class="field pf${c.tipo === 'textarea' ? ' wide' : ''}${baixa ? ' low' : ''}${erro ? ' pf-err' : ''}" data-campo="${esc(k)}">
      <label for="f-${esc(k)}">${esc(c.rotulo)}${obrig(k, c) ? '<span class="req">*</span>' : ''}${estado[1] ? ` <span class="chip ${estado[0]} pf-st">${estado[1]}</span>` : ''}${fonte ? `<span class="src" title="${esc('De: ' + fonte)}">${esc(fonte)}</span>` : ''}</label>
      ${fieldInput(k, c, { ...(cur || {}), valor }, W)}
      ${erro ? `<small class="portal-erro">${esc((M.portalAcusa || 'O portal acusa: {mensagem}').replace('{mensagem}', erro.mensagem))}</small>` : ''}
      ${p.disabled ? '<small class="hint">O portal libera este campo depois de outro (por exemplo, depois de escolher o funcionário).</small>' : ''}
      ${baixa ? '<small class="hint">Leitura com dúvida: confira.</small>' : ''}
      ${sugDoc ? htmlSugestao(k, cur) : ''}
      ${cur?.calculado && !daqui && !W.editados.has(k) && cur.explicacao ? `<small class="hint calc-hint">Calculado pelo Assistente: ${esc(cur.explicacao)} Confira.</small>` : ''}
      ${apx ? `<small class="aprox">${esc(msgAproximada(apx))}</small>` : ''}
      ${sug ? `<div class="cands"><small>Você quis dizer:</small>${sug.map(s => `<button type="button" class="btn btn-sm" data-sug-k="${esc(k)}" data-sug-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
      ${k === 'empregado' && W.candidatos?.length && !p.valor ? `<div class="cands"><small>Qual deles?</small>${W.candidatos.map(n => `<button type="button" class="btn btn-sm" data-cand="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
      ${k === 'empregado' && W.pacienteLido && !valor && !W.candidatos?.length ? `<small class="hint">No documento: “${esc(W.pacienteLido)}” — não achei esse nome na lista. Escolha o funcionário.</small>` : ''}
    </div>`;
  };
  const extras = Object.entries(t.campos).filter(([, c]) => c.somenteAssistente);
  const textos = TEXTOS.filter(k => t.campos[k] && pf[k]?.existe !== false);
  const OUTROS = 'Outros campos do portal';
  el.innerHTML = `
    ${[...grupos].map(([g, lista], i) => g ? `<details class="pf-grupo" ${i === 0 || lista.some(([k, c]) => (obrig(k, c) && !(campoPortal(k).valor || W.valores[k]?.valor)) || erroDoPortal(k)) ? 'open' : ''}><summary>${esc(g)}</summary>${g === OUTROS ? '<small class="hint" style="margin:0 0 8px">Campos do portal que o escritório ainda não incluiu nas regras do Assistente. O que você preencher aqui também vai para o portal.</small>' : ''}<div class="pf-grid">${lista.map(campo).join('')}</div></details>` : `<div class="pf-grid">${lista.map(campo).join('')}</div>`).join('')
      || '<p class="muted">Abrindo o formulário no portal…</p>'}
    ${extras.length || t.descricao?.length ? `<div class="pf-sec">Só para a descrição</div><div class="pf-grid">${extras.map(([k, c]) => {
      const cur0 = W.valores[k]; const sg = ehSugestao(cur0); const cur = sg ? undefined : cur0;
      return `<div class="field"><label for="f-${k}">${esc(c.rotulo)}${c.sensivel ? ` <span class="chip warn" title="Dado sensível">sensível</span>` : ''}${cur?.fonte ? `<span class="src" title="${esc(cur.fonte)}">${esc(cur.fonte)}</span>` : ''}</label>${fieldInput(k, c, cur, W)}${sg ? htmlSugestao(k, cur0) : ''}</div>`;
    }).join('')}
      ${t.descricao?.length ? `<div class="field wide"><label for="f-obs">Observações para o analista</label><textarea id="f-obs" class="input" rows="2" data-obs="1" placeholder="Algo mais que o escritório precisa saber?">${esc(W.valores.observacoes?.valor || '')}</textarea></div>` : ''}</div>
      ${t.campos.cid ? `<label class="toggle"><input type="checkbox" id="tg-cid" ${cidAtivo() ? 'checked' : ''}><span>Incluir CID na descrição<small>${cidAtivo() && !S.prefs.incluirCid ? 'Ligado pelo escritório para esta empresa — você pode desligar.' : 'Dado de saúde (LGPD). Deixe desligado se não for necessário.'}</small></span></label>` : ''}` : ''}
    ${textos.length ? `<div class="pf-sec">Assunto e descrição ${textos.some(k => W.editados.has(k)) ? '<small class="chip info">editados por você</small>' : '<small class="chip ok">gerados</small>'}</div>
      <div class="pf-grid">${textos.map(k => campo([k, t.campos[k]])).join('')}</div>` : ''}
    ${calcBox(tipo)}`;
  // campos bloqueados pelo portal
  for (const [k] of [...doPortal, ...foraDasRegras]) if (campoPortal(k).disabled) el.querySelectorAll(`[data-k="${CSS.escape(k)}"]`).forEach(i => { i.disabled = true; });
  const aoDigitar = debounce(() => { gerarTextos(tipo); syncGenerated(); updateChecks(); refreshCalc(); }, 400);
  const marcar = (k, valor) => {
    W.valores[k] = { valor, conf: 1, fonte: 'você' }; W.editados.add(k);
    delete W.aproximadas?.[k]; delete W.sugestoes?.[k];
    if (!campoDef(tipo, k)?.somenteAssistente) fv[k] = 'plataforma';
  };
  el.querySelectorAll('input[data-k], textarea[data-k]').forEach(inp => {
    const k = inp.dataset.k; const c = campoDef(tipo, k);
    const vivo = S.rules.config?.escritaAoVivo || {};
    const aoVivo = vivo.ativo !== false && !c?.somenteAssistente && (vivo.tipos || ['texto', 'textarea']).includes(c?.tipo);   // vai ao portal enquanto escreve
    inp.addEventListener('input', () => { maskInput(inp); marcar(k, inp.value); inp.classList.remove('found', 'low'); aoDigitar(); if (aoVivo) agendarEnvioPortal(tipo, k); });
    inp.addEventListener('change', () => { if (c?.somenteAssistente) atualizarTextoNoPortal(tipo); else agendarEnvioPortal(tipo, k); });
    // listas do portal (motivos, cargos…): busca as opções quando o campo ganha o foco; se a busca falhou, tenta de novo na próxima vez
    if (c?.tipo === 'combo' && c.fc) inp.addEventListener('focus', async () => {
      if (W.opcoes[k]?.length || inp.dataset.buscando) return;
      inp.dataset.buscando = '1';
      let r; try { r = await request({ type: 'getOptions', locator: { fc: c.fc } }, 8000); } finally { delete inp.dataset.buscando; }
      if (r?.options?.length) { W.opcoes[k] = r.options; const dl = document.getElementById(`dl-${k}`); if (dl) dl.innerHTML = r.options.map(o => `<option value="${esc(o)}">`).join(''); }
      if (!document.activeElement || document.activeElement === document.body) inp.focus();
    });
  });
  el.querySelectorAll('.seg [data-k]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k; marcar(k, b.dataset.v);
    b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    gerarTextos(tipo); updateChecks(); agendarEnvioPortal(tipo, k);
  }));
  $('#f-obs')?.addEventListener('input', (e) => { W.valores.observacoes = { valor: e.target.value, conf: 1, fonte: 'você' }; aoDigitar(); });
  $('#f-obs')?.addEventListener('change', () => atualizarTextoNoPortal(tipo));
  el.querySelectorAll('[data-cand]').forEach(b => b.addEventListener('click', () => {
    marcar('empregado', b.dataset.cand); W.candidatos = null;
    gerarTextos(tipo); renderFieldsOnly(); updateChecks(); fillPortal(tipo, { daPlataforma: true, so: ['empregado'] });
  }));
  el.querySelectorAll('[data-sug-k]').forEach(b => b.addEventListener('click', () => escolherSugestao(tipo, b.dataset.sugK, b.dataset.sugV)));
  el.querySelectorAll('[data-usar-k]').forEach(b => b.addEventListener('click', () => usarSugestao(tipo, b.dataset.usarK)));
  $('#tg-cid')?.addEventListener('change', (e) => { S.prefs.incluirCid = e.target.checked; S.prefs.cidEscolhido = true; savePrefs(); gerarTextos(tipo); atualizarTextoNoPortal(tipo); renderFieldsOnly(); });
}

export function syncGenerated() {
  const W = w(S.ctx.tipo);
  for (const k of ['assunto', 'descricao']) { const el = $(`#f-${k}`); if (el && document.activeElement !== el && W.valores[k]) el.value = W.valores[k].valor; }
}

export function maskInput(inp) {
  const t = inp.dataset.t; const d = inp.value.replace(/\D/g, '');
  if (t === 'data') inp.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  else if (t === 'competencia') inp.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2, 6)}` : d;
  else if (t === 'cpf' && d.length === 11) inp.value = E.fmtCPF(d);
  else if (t === 'cep' && d.length === 8) inp.value = E.fmtCEP(d);
}

export function calcBox(tipo) {
  const v = valoresParaChecar(tipo); const d = E.derived(tipo, v, S.rules);
  const items = [];
  if (d.retorno) items.push(['Último dia de gozo', d.fimGozo], ['Retorno ao trabalho', d.retorno], ['Pagar até', d.pagamentoAte]);
  if (tipo === 'avisoFerias' && d.avisoAte) items.push(['Avisar até', d.avisoAte]);
  if (d.dataRetorno) items.push(['Retorno previsto', d.dataRetorno]);
  if (d.inicioInss) items.push(['A partir do 16º dia (INSS)', d.inicioInss]);
  if (tipo === 'calculoRescisao' && d.pagamentoAte) items.push(['Pagamento das verbas até', d.pagamentoAte]);
  if (d.diasAviso) items.push(['Aviso prévio', `${d.diasAviso} dias`]);
  return `<div id="calc">${items.length ? `<div class="calc">${items.map(([a, b]) => `<div>${esc(a)}: <b>${esc(b)}</b></div>`).join('')}</div>` : ''}</div>`;
}

export function refreshCalc() { const el = $('#calc'); if (el) el.outerHTML = calcBox(S.ctx.tipo); }

/** Avisos que não vêm das regras do pedido: o que o leitor viu nos documentos, leitura difícil, pedido repetido. */
export function avisosExtras(tipo, vals) {
  const W = w(tipo); const out = [];
  const docs = W.arquivos.filter(a => !a.removido && !a.outroTipo && a.status === 'ok');
  for (const a of docs) {
    for (const av of a.analise?.avisos || []) out.push({ nivel: av.nivel, grupo: 'Documento', mensagem: docs.length > 1 ? `${a.nome}: ${av.mensagem}` : av.mensagem });
    // comprovante em nome de outra pessoa (pode ser de um parente): compara com o nome do cadastro
    const avc = a.analise?.titular && !(a.analise.avisos || []).some(x => x.id === 'comprovanteOutraPessoa') ? E.avisoComprovante(a.analise.titular, vals.nome, S.rules) : null;
    if (avc) out.push({ nivel: avc.nivel, grupo: 'Documento', mensagem: avc.mensagem });
    // páginas que o limite deixou de fora e planilha de rubricas conferida com a lista de funcionários
    if (a.avisoPaginas) out.push({ nivel: 'info', grupo: 'Documento', mensagem: a.avisoPaginas });
    const cf = a.rubricas?.conferencia; const M = S.rules.mensagens || {};
    if (cf?.naoAchados.length) out.push({ nivel: 'atencao', grupo: 'Planilha', mensagem: (M.planilhaNaoAchei || 'Na planilha, não achei na lista de funcionários: {nomes}.').replace('{nomes}', cf.naoAchados.join(', ')) });
    if (cf?.desligados.length) out.push({ nivel: 'atencao', grupo: 'Planilha', mensagem: (M.planilhaDesligados || 'Na planilha há funcionário(s) desligado(s): {nomes}.').replace('{nomes}', cf.desligados.join(', ')) });
    if (cf?.repetidas.length) out.push({ nivel: 'atencao', grupo: 'Planilha', mensagem: (M.planilhaRepetidas || 'Linhas repetidas na planilha: {linhas}.').replace('{linhas}', cf.repetidas.map(r => `${r.empregado} (${r.rubrica})`).join(', ')) });
    if (a.metodo === 'ocr' && a.confianca != null && a.confianca < 60) out.push({ nivel: 'info', grupo: 'Documento', mensagem: `A leitura de “${a.nome}” foi difícil (letra à mão ou foto). Confira os campos — os duvidosos ficam em amarelo.` });
  }
  const dup = duplicado(tipo, vals);
  if (dup) out.push({ nivel: 'atencao', grupo: 'Pedido repetido?', mensagem: dup });
  return out;
}

/** Campos que não existem nesta tela ou estão bloqueados pelo portal não contam como obrigatórios. */
export function camposAusentes(form) {
  return Object.entries(form?.campos || {}).filter(([, v]) => !v.existe || v.disabled).map(([k]) => k);
}

/* Campos que o leitor não encontrou: aviso no painel e no próprio portal */
export function camposFaltando(tipo, list) {
  const t = tipoDef(tipo); const W = w(tipo);
  const leuDocumento = W.arquivos.some(a => a.status === 'ok' && !a.removido && !a.outroTipo);
  const vals = valoresParaChecar(tipo);
  const out = new Map();
  for (const i of list) if (i.nivel === 'erro' && i.grupo === 'Campos obrigatórios' && i.campo && !['assunto', 'descricao'].includes(i.campo)) out.set(i.campo, true);
  if (leuDocumento) for (const k of t.esperadoDoDocumento || []) {
    if (!t.campos[k] || (vals[k] != null && String(vals[k]).trim() !== '')) continue;
    if (S.ctx.form?.campos?.[k]?.disabled) continue;
    out.set(k, true);
  }
  return [...out.keys()].map(k => ({ k, def: t.campos[k], texto: ehSugestao(W.valores[k]) ? 'Li com dúvida no documento — confira a sugestão' : leuDocumento ? 'Não encontrado no documento — preencha aqui' : 'Preencha este campo' }));
}

export function marcarFaltando(tipo, list) {
  const falt = camposFaltando(tipo, list);
  const set = new Set(falt.map(f => f.k));
  // no painel
  document.querySelectorAll('#fields .field').forEach(f => {
    const k = f.querySelector('[data-k]')?.dataset.k; if (!k) return;
    const on = set.has(k);
    f.classList.toggle('missing', on);
    let hint = f.querySelector('.miss');
    if (on && !hint) { hint = document.createElement('small'); hint.className = 'miss'; f.appendChild(hint); }
    if (on) hint.textContent = falt.find(x => x.k === k).texto.replace(' — preencha aqui', '');
    else hint?.remove();
  });
  // no portal (só campos que existem lá)
  const campos = falt.filter(f => !f.def.somenteAssistente).map(f => ({ k: f.k, texto: f.texto, locator: f.def }));
  const key = JSON.stringify(campos.map(c => [c.k, c.texto]));
  if (key !== S.pv.lastMissingKey) { S.pv.lastMissingKey = key; send({ type: 'markMissing', campos }); }
}

export function updateChecks() {
  const el = $('#checks'); if (!el || !S.ctx.tipo) return;
  const tipo = S.ctx.tipo;
  const vals = valoresParaChecar(tipo);
  const list = [...E.runChecks(tipo, vals, anexosAtuais(tipo), S.rules, E.today(), { ausentes: camposAusentes(S.ctx.form) }), ...avisosExtras(tipo, vals)];
  S.pv.lastChecks = list;
  marcarFaltando(tipo, list);
  const c = E.summarizeChecks(list);
  const total = list.filter(i => i.nivel !== 'info').length || 1;
  const bar = $('#bar'); if (bar) { bar.querySelector('i').style.width = `${Math.round(c.ok / total * 100)}%`; bar.classList.toggle('has-err', c.erro > 0); }
  const bt = $('#bar-txt'); if (bt) bt.textContent = `${c.ok}/${total} ok`;
  const groups = {};
  list.forEach(i => (groups[i.grupo] = groups[i.grupo] || []).push(i));
  const ico = { ok: 'check', erro: 'x', atencao: 'alert', info: 'info' };
  const order = { erro: 0, atencao: 1, info: 2, ok: 3 };
  el.innerHTML = Object.entries(groups).map(([g, items]) => `<div class="grp">${esc(g)}</div>` + items.sort((a, b) => order[a.nivel] - order[b.nivel]).map(i => `
    <button type="button" class="chk ${i.nivel}" ${i.campo ? `data-campo="${esc(i.campo)}"` : ''}><span class="st">${icon(ico[i.nivel], 'ic-sm')}</span><span>${esc(i.mensagem)}</span></button>${i.modelo ? botaoModelo(i.modelo) : ''}`).join('')).join('') || '<p class="muted">Sem verificações para esta solicitação.</p>';
  ligarModelos(el, tipo);
  el.querySelectorAll('[data-campo]').forEach(b => b.addEventListener('click', () => {
    const def = tipoDef(tipo).campos[b.dataset.campo];
    if (def && !def.somenteAssistente) send({ type: 'highlight', locator: def });
    $(`#f-${b.dataset.campo}`)?.focus();
  }));
  const dot = $('#dot-preencher'); if (dot) { dot.hidden = !c.erro; dot.textContent = c.erro || ''; }
  renderStepper(list); renderDocChecklist(); renderDicaPedido(tipo); renderConfiraLeituras(tipo);
}

/* "Gerar pelo modelo" (anexos[].modelo): o modelo da carta já preenchido com o funcionário, as datas, a empresa e a admissão. */
export const botaoModelo = (id) => (S.rules.modelosDocumento || []).some(m => m.id === id) ? `<button type="button" class="btn btn-sm btn-ghost chk-modelo" data-modelo="${esc(id)}">${icon('fill', 'ic-sm')} Gerar pelo modelo</button>` : '';

export function ligarModelos(root, tipo) { root.querySelectorAll('[data-modelo]').forEach(b => b.addEventListener('click', () => gerarPeloModelo(b.dataset.modelo, tipo))); }

export function contextoModelo(tipo) {
  const v = tipo ? valoresParaChecar(tipo) : {};
  const adm = admissaoDe(v.empregado);
  const sit = adm ? E.situacaoEmpregado({ nome: v.empregado, admissao: E.iso(adm) }, E.today(), S.rules) : null;
  return { ...v, empresa: S.ctx.empresa, admissao: adm ? E.fmtDate(adm) : '', dataAdmissao: adm ? E.fmtDate(adm) : '', periodoAquisitivo: sit?.ferias?.aquisitivo || '' };
}

export function gerarPeloModelo(id, tipo, extra = {}) {
  const md = (S.rules.modelosDocumento || []).find(m => m.id === id); if (!md || !P?.abrirModelo) return;
  P.abrirModelo(md, E.valoresDoModelo(md, { ...contextoModelo(tipo), ...extra }));
}

/* Dicas do pedido aberto: o funcionário ainda está na experiência (motivo certo, sem escolher sozinho) e o aviso
   desse funcionário que já está no portal ("Usar os dados do aviso de dd/mm"). */
export const PAR_AVISO = { calculoFerias: 'avisoFerias', calculoRescisao: 'avisoRescisao' };

export const lendoDatasAviso = new Set();

export function renderDicaPedido(tipo) {
  const el = $('#dica-pedido'); if (!el || !tipo) return;
  const W = w(tipo); const t = tipoDef(tipo); const v = valoresParaChecar(tipo);
  const partes = [];
  // rescisão de quem ainda está na experiência
  if (t?.campos?.motivo && /Rescisao$/.test(tipo) && v.empregado && !W.expNao) {
    const sug = E.sugestaoMotivoExperiencia(v, admissaoDe(v.empregado), S.rules);
    if (sug) partes.push({ k: `exp|${sug.valor}`, html: `<div class="note warn">${icon('info')}<div><b>${esc(nomeCurto(v.empregado))} foi admitido(a) em ${E.fmtDate(sug.admissao)} — está no ${sug.dia}º dia, dentro do prazo de experiência.</b> É contrato de experiência? Se for, o motivo certo é <b>“${esc(sug.valor)}”</b>: ${sug.noFim ? 'no fim da experiência não há aviso prévio' : 'na saída antes do fim da experiência não há aviso prévio (vale a indenização dos arts. 479 e 480 da CLT)'}.
      <div class="actions" style="margin-top:6px"><button type="button" class="btn btn-sm btn-primary" id="dp-exp-sim" data-motivo="${esc(sug.valor)}">Sim, usar este motivo</button><button type="button" class="btn btn-sm btn-ghost" id="dp-exp-nao">Não é experiência</button></div></div></div>` });
  }
  // cálculo: o aviso desse funcionário já está no portal
  const tAviso = PAR_AVISO[tipo];
  const av = tAviso && v.empregado && !W.avisoUsado ? E.avisoDoFuncionario(S.plat?.sol?.itens, v.empregado, tAviso) : null;
  if (av) {
    const vv = E.valoresDoAviso(av, S.rules);
    const novos = Object.entries(vv.valores).filter(([k, x]) => t.campos[k] && !W.editados.has(k) && E.norm(v[k] || '') !== E.norm(x));
    if (!Object.keys(vv.valores).length && !av.datasLidas && !lendoDatasAviso.has(av.id)) {
      lendoDatasAviso.add(av.id);
      request({ type: 'datasAviso', lista: S.rules.tipos[av.tipo]?.apiDetalhe || S.rules.tipos[av.tipo]?.apiLista, solicitacao: av.id }, 15000).then(r => {
        av.datasLidas = true;
        if (r?.datas) { const d = E.datasDoAviso(r.datas); av.datas = Object.fromEntries(Object.entries({ ...(av.datas || {}), ...d }).map(([k, x]) => [k, x ?? av.datas?.[k] ?? null])); }
        if (S.ctx.tipo === tipo) renderDicaPedido(tipo);
      });
    }
    const quando = vv.em ? E.fmtDate(vv.em).slice(0, 5) : '';
    if (novos.length) partes.push({ k: `av|${av.id}|${novos.map(x => x.join('=')).join(',')}`, html: `<div class="note">${icon('info')}<div>O aviso ${tAviso === 'avisoFerias' ? 'de férias' : 'de rescisão'} de <b>${esc(nomeCurto(v.empregado))}</b>${av.numero ? ` (nº ${esc(av.numero)})` : ''} já está no portal: ${esc(novos.map(([k, x]) => `${rotuloDe(tipo, k)} ${x}`).join(' · '))}.
      <div class="actions" style="margin-top:6px"><button type="button" class="btn btn-sm btn-primary" id="dp-aviso">Usar os dados do aviso${quando ? ` de ${quando}` : ''}</button><button type="button" class="btn btn-sm btn-ghost" id="dp-aviso-nao">Agora não</button></div></div></div>` });
  }
  // atestados do mesmo funcionário que se somam (regra dos 60 dias): "É a mesma doença?"
  const q60 = tipo === 'afastamento' ? pergunta60(tipo) : null;
  if (q60) partes.push(q60);
  const chave = partes.map(x => x.k).join('#');
  if (el.dataset.chave === chave) return;
  el.dataset.chave = chave;
  el.innerHTML = partes.map(x => x.html).join('');
  $('#dp-exp-sim')?.addEventListener('click', (e) => {
    W.valores.motivo = { valor: e.currentTarget.dataset.motivo, conf: 1, fonte: 'você' }; W.editados.add('motivo'); W.fonteVerdade.motivo = 'plataforma';
    W.expNao = true; gerarTextos(tipo); render();
    if (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo, { daPlataforma: true, so: ['motivo'] });
  });
  $('#dp-exp-nao')?.addEventListener('click', () => { W.expNao = true; renderDicaPedido(tipo); });
  $('#dp-aviso')?.addEventListener('click', () => {
    W.avisoUsado = true; const vv = E.valoresDoAviso(av, S.rules);
    aplicarSugestoes(tipo, vv.valores, vv.fonte, { trocar: true });
    gerarTextos(tipo); render();
    if (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo, { daPlataforma: true, so: Object.keys(vv.valores) });
  });
  $('#dp-aviso-nao')?.addEventListener('click', () => { W.avisoUsado = true; renderDicaPedido(tipo); });
  $('#r60-sim')?.addEventListener('click', () => {
    const r = q60.r; W.regra60 = { sim: true, chave: q60.k, texto: r.texto };
    W.valores.tipoAfastamento = { valor: r.tipoSugerido, conf: 1, fonte: 'regra dos 60 dias (você confirmou)' }; W.editados.add('tipoAfastamento'); W.fonteVerdade.tipoAfastamento = 'plataforma';
    gerarTextos(tipo); render();
    if (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo, { daPlataforma: true, so: ['tipoAfastamento'] });
  });
  $('#r60-nao')?.addEventListener('click', () => { W.regra60 = { sim: false, chave: q60.k }; renderDicaPedido(tipo); });
}

/* Foto com dúvida: o recorte da imagem de onde o valor saiu, ao lado do campo (nunca para CID e médico). Tudo só na memória do painel. */
export async function recorteDa(item, leitura) {
  const img = item.imagens?.[leitura.pagina]; if (!img) return null;
  const chave = `${leitura.pagina}|${leitura.bbox.x0},${leitura.bbox.y0},${leitura.bbox.x1},${leitura.bbox.y1}`;
  item.recortes = item.recortes || {};
  if (item.recortes[chave] !== undefined) return item.recortes[chave];
  try {
    const bmp = await createImageBitmap(img);
    const m = S.rules.config?.recorteLeitura?.margem ?? 12;
    const x0 = Math.max(0, leitura.bbox.x0 - m), y0 = Math.max(0, leitura.bbox.y0 - m), x1 = Math.min(bmp.width, leitura.bbox.x1 + m), y1 = Math.min(bmp.height, leitura.bbox.y1 + m);
    const larg = x1 - x0, alt = y1 - y0; if (larg < 4 || alt < 4) return (item.recortes[chave] = null);
    const esc_ = Math.max(1, Math.min(3, 320 / larg));
    const cv = document.createElement('canvas'); cv.width = Math.round(larg * esc_); cv.height = Math.round(alt * esc_);
    cv.getContext('2d').drawImage(bmp, x0, y0, larg, alt, 0, 0, cv.width, cv.height);
    return (item.recortes[chave] = cv.toDataURL('image/png'));
  } catch { return (item.recortes[chave] = null); }
}

/** Campos lidos de foto com palavras mal lidas (sugestão com `confira: 'leitura'`): precisam de uma conferência do cliente. */
export function leiturasParaConferir(tipo) {
  const W = w(tipo); const out = [];
  for (const [k, v] of Object.entries(W.valores)) {
    if (!ehSugestao(v) || v.confira !== 'leitura' || !v.leitura || ['cid', 'medico'].includes(k) || campoDef(tipo, k)?.sensivel || campoDef(tipo, k)?.somenteAssistente) continue;
    const item = W.arquivos.find(a => a.id === v.origem && !a.removido && a.imagens);
    if (item) out.push({ k, v, item });
  }
  return out;
}

export function renderConfiraLeituras(tipo) {
  const el = $('#confira-leituras'); if (!el) return;
  const lista = leiturasParaConferir(tipo);
  const chave = JSON.stringify(lista.map(x => [x.k, x.v.valor]));
  if (el.dataset.chave === chave) return;
  el.dataset.chave = chave;
  if (!lista.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="note warn confira-box">${icon('alert')}<div style="flex:1;min-width:0"><b>Confira estas leituras</b> <small class="muted">— ${esc(S.rules.mensagens?.confiraLeituras || 'A foto estava difícil nestes campos. Compare com o recorte e confirme.')}</small>
    <div class="list" style="margin-top:6px">${lista.map(({ k, v }) => `<div class="li" data-confira="${esc(k)}"><div class="main"><b>${esc(rotuloDe(tipo, k))}: ${esc(v.valor)}</b><img class="recorte" alt="Trecho da foto de onde li ${esc(rotuloDe(tipo, k))}" hidden style="display:block;max-width:100%;max-height:70px;margin-top:4px;border:1px solid var(--line,#ccc);border-radius:4px"></div>
      <button type="button" class="btn btn-sm btn-primary" data-conf-k="${esc(k)}">Confirmar</button><button type="button" class="btn btn-sm btn-ghost" data-corr-k="${esc(k)}">Corrigir</button></div>`).join('')}</div>
    ${lista.length > 1 ? '<div class="actions" style="margin-top:6px"><button type="button" class="btn btn-sm" id="conf-todas">Confirmar todas</button></div>' : ''}</div></div>`;
  lista.forEach(async ({ k, v, item }) => {
    const url = await recorteDa(item, v.leitura); const img = el.querySelector(`[data-confira="${CSS.escape(k)}"] img.recorte`);
    if (url && img) { img.src = url; img.hidden = false; }
  });
  el.querySelectorAll('[data-conf-k]').forEach(b => b.addEventListener('click', () => usarSugestao(tipo, b.dataset.confK)));
  el.querySelectorAll('[data-corr-k]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.corrK; const inp = $(`#f-${CSS.escape(k)}`);
    if (inp) inp.focus(); else { const def = campoDef(tipo, k); if (def) send({ type: 'highlight', locator: def }); }
  }));
  $('#conf-todas')?.addEventListener('click', async () => { for (const { k } of lista) await usarSugestao(tipo, k); });
}

/** Os atestados já enviados por este computador (histórico, sem CID) e os do lote em andamento (CID só na memória). */
export function atestadosAnteriores() {
  const out = []; const limiar = E.limiarPortal(S.rules);
  for (const h of S.historico || []) if (h.status === 'enviado' && h.empresa === S.ctx.empresa && h.tipo === 'afastamento' && h.valores?.empregado && h.valores.dataAfastamento && +h.valores.dias > 0) out.push({ empregado: h.valores.empregado, data: h.valores.dataAfastamento, dias: h.valores.dias, origem: 'histórico' });
  for (const p of S.lote?.pedidos || []) for (const it of p.itens) {
    const c = it.analise?.campos || {}; const nome = c.empregado?.valor || it.analise?.paciente;
    if (it.documento === 'atestado' && nome && c.dataAfastamento?.conf >= limiar && c.dias?.conf >= limiar) out.push({ empregado: nome, data: c.dataAfastamento.valor, dias: c.dias.valor, origem: 'lote', cid: c.cid?.valor || null });
  }
  return out;
}

/** A pergunta "É a mesma doença?" quando a soma passa de 15 dias (regras: config.regra60dias; decisão do escritório). */
export function pergunta60(tipo) {
  const R = E.regra60(S.rules); if (R.ativo === false || R.perguntar === false) return null;
  const W = w(tipo); const v = valoresParaChecar(tipo);
  if (!v.empregado || !v.dataAfastamento || !(+v.dias > 0)) return null;
  const lista = atestadosAnteriores();
  const r = E.somaAtestados({ empregado: v.empregado, data: v.dataAfastamento, dias: v.dias }, lista, S.rules);
  if (!r?.passa) return null;
  const k = `r60|${v.empregado}|${v.dataAfastamento}|${r.soma}`;
  if (W.regra60?.chave === k) return null;
  const conta = `${r.anteriores.map(a => `${a.dias} ${a.dias === 1 ? 'dia' : 'dias'} em ${a.data.slice(0, 5)}`).join(' + ')} + ${+v.dias} ${+v.dias === 1 ? 'dia' : 'dias'} agora = ${r.soma} dias`;
  // dentro do lote, o CID lido sugere a resposta (só em memória: nunca é guardado nem mostrado, só o "parecem da mesma doença")
  const cidAtual = W.valores.cid?.valor;
  const doLote = r.anteriores.map(a => lista.find(x => x.origem === 'lote' && x.data === a.data && E.mesmaPessoa({ nome: x.empregado }, { nome: v.empregado }) === true));
  const mesma = cidAtual && doLote.length && doLote.every(x => x?.cid && E.mesmaDoencaPeloCid(x.cid, cidAtual) === true);
  const pergunta = (R.pergunta || '{funcionario} tem outro atestado há pouco tempo: {conta}. Juntos passam de {limite} dias. É a mesma doença?').replace('{funcionario}', nomeCurto(v.empregado)).replace('{conta}', conta).replace('{limite}', R.limiteDias);
  const html = `<div class="note warn" id="r60">${icon('alert')}<div><b>${esc(pergunta)}</b>${mesma ? '<br><small>Pelos documentos do lote, parecem ser da mesma doença.</small>' : ''}<br><small class="muted">Pela regra dos 60 dias (Decreto 3.048/99, art. 75), afastamentos pela mesma doença se somam e o INSS paga a partir do 16º dia.</small>
    <div class="actions" style="margin-top:6px"><button type="button" class="btn btn-sm${mesma ? ' btn-primary' : ''}" id="r60-sim">Sim, é a mesma doença</button><button type="button" class="btn btn-sm btn-ghost" id="r60-nao">Não é</button></div></div></div>`;
  return { k, html, r };
}

/** Valores sugeridos por outra tela (dados do aviso, 1ª data de férias): entram para conferir, não como digitados pelo cliente —
 *  um documento arrastado depois ainda pode corrigi-los. Não passam por cima do que o cliente digitou. */
export function aplicarSugestoes(tipo, valores, fonte, { trocar = false } = {}) {
  const W = w(tipo); const t = tipoDef(tipo);
  for (const [k, x] of Object.entries(valores || {})) {
    if (!t?.campos?.[k] || x == null || x === '' || W.editados.has(k)) continue;
    const cur = W.valores[k];
    if (cur?.valor && !cur.calculado && !cur.sugestao && !trocar) continue;
    W.valores[k] = { valor: String(x), conf: 0.6, fonte, sugestao: true };
  }
}

/** Listas em que o Assistente escolhe sozinho quando o portal tem uma opção só (regras: config.escolherUnicaOpcao). */
export function camposUnicaOpcao(tipo) {
  const u = S.rules.config?.escolherUnicaOpcao; if (!u || u.ativo === false) return [];
  if (Array.isArray(u.tipos) && !u.tipos.includes(tipo)) return [];
  const t = tipoDef(tipo); const W = w(tipo);
  return (u.campos || []).filter(k => t.campos[k]?.tipo === 'combo' && !W.editados.has(k) && !W.valores[k]?.valor);
}

/**
 * Manda os valores ao portal. Sem `so`, manda tudo (botão "Preencher no portal", documento, modelo, lote).
 * Com `so` (lista de campos), manda só esses — é o ajuste feito no formulário da plataforma — e o assunto e a
 * descrição quando o texto gerado mudou e o portal ainda está com o texto do Assistente.
 */
export async function fillPortal(tipo, { silencioso = false, daPlataforma = false, so = null } = {}) {
  const W = w(tipo); const t = tipoDef(tipo);
  const parcial = Array.isArray(so);
  if (!silencioso && !parcial) {
    W.pausarAuto = false;
    // "Preencher no portal" depois de um Desfazer: o que tinha sido lido volta
    for (const [k, v] of Object.entries(W.desfeitos || {})) if (!W.valores[k]?.valor && !W.editados.has(k)) W.valores[k] = v;
    W.desfeitos = null;
  } else if (silencioso && W.pausarAuto) return;       // o cliente desfez: só preenche de novo se ele pedir
  ajustarDepartamento(tipo);
  gerarTextos(tipo);
  if (silencioso && telaDiferente(tipo) && !W.forcarPreenchimento) { renderModoSeguro(tipo); return; }
  const values = {};
  const noPortal = (k) => campoPortal(k).valor || '';
  for (const [k, v] of Object.entries(W.valores)) {
    const def = campoDef(tipo, k);
    if (!def || def.somenteAssistente || !v?.valor) continue;
    if (ehSugestao(v)) continue;          // P1: lido com dúvida só vai quando o cliente toca em "Usar"
    if (parcial && !so.includes(k) && !TEXTOS.includes(k) && !(v.calculado && noPortal(k) !== v.valor)) continue;
    // o que o cliente escreveu direto no portal fica como está
    if (noPortal(k) && noPortal(k) !== (W.ultimoPreenchido?.[k] ?? null) && noPortal(k) !== v.valor && W.fonteVerdade?.[k] !== 'plataforma') continue;
    // ajuste de um campo: o texto gerado só vai se mudou e se o portal ainda está com o texto do Assistente
    if (parcial && TEXTOS.includes(k) && !so.includes(k) && (W.pausarAuto || W.editados.has(k) || noPortal(k) !== (W.ultimoPreenchido?.[k] || '') || noPortal(k) === v.valor)) continue;
    values[k] = v.valor;
  }
  if (!parcial) {
    // padrões das regras (ex.: país Brasil) só se vazio no portal
    for (const [k, c] of Object.entries(t.campos)) if (c.padrao && !values[k] && !portalValores(tipo)[k]) values[k] = c.padrao;
    // condicionais que definem valores (ex.: pedido de demissão → aviso dado pelo empregado)
    for (const c of E.activeConditionals(t, { ...portalValores(tipo), ...values })) for (const [k, v] of Object.entries(c.valores || {})) if (!values[k] && !W.editados.has(k)) values[k] = v;
  }
  if (parcial && !Object.keys(values).length) return;
  // anexos: recusados pelo portal ou tirados pelo cliente lá só voltam quando ele pede ("Preencher no portal")
  const files = parcial ? [] : W.arquivos.filter(a => !a.removido && !a.jaAnexado && !a.anexado && !a.outroTipo && a.status !== 'lendo' && !(silencioso && (a.recusado || a.tiradoNoPortal))).map(a => a.file);
  const btn = parcial ? null : $('#btn-fill');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Preenchendo…'; }
  const aoAvancar = (p) => { if (btn?.isConnected && p.m) btn.innerHTML = `<div class="spin"></div> Preenchendo… ${Math.min(p.n + 1, p.m)} de ${p.m}`; };
  const packed = await packFiles(files);
  S.preenchendo = true;
  let r;
  // o preenchimento foca campos do portal: guarda onde o cliente estava digitando na plataforma
  const foco = document.activeElement?.id;
  // o que o cliente digita na plataforma não entra no Desfazer (para corrigir, basta editar o campo)
  const opts = { naoSobrescrever: false, avisoDesfazer: !daPlataforma, semDesfazer: daPlataforma, voltarInicio: !parcial, unicaOpcao: parcial ? [] : camposUnicaOpcao(tipo) };
  try { r = await requestFill({ type: 'fill', tipo, values, files: packed, opts }, packed.map(p => p.buf), aoAvancar); }
  finally { S.preenchendo = false; }
  if (S.modo === 'plataforma' && foco && document.activeElement?.id !== foco) document.getElementById(foco)?.focus();
  const btn2 = $('#btn-fill'); if (btn2 && !parcial) { btn2.disabled = false; btn2.innerHTML = `${icon('fill', 'ic-sm')} Preencher no portal`; }
  if (r?.depois) W.ultimoPreenchido = { ...(W.ultimoPreenchido || {}), ...Object.fromEntries(Object.entries(r.depois).filter(([, v]) => v)) };
  W.portalVisto = { ...portalValores(tipo), ...(r?.depois || {}) };
  aplicarResultados(tipo, r, files);
  // ajuste de um campo: junta ao resultado do último preenchimento completo
  if (parcial && r && W.resultados?.resultados) {
    const novos = new Set(r.resultados.map(x => x.campo));
    W.resultados = { ...W.resultados, resultados: [...W.resultados.resultados.filter(x => !novos.has(x.campo)), ...r.resultados] };
  } else if (r || !parcial) W.resultados = r;
  // sem resposta (o preenchimento não terminou): não grava como "preenchido", para a Agenda
  // não criar prazos de um pedido que não existe
  if (r) await salvarHistorico(tipo, 'preenchido');
  if (S.view === 'preencher') { renderFilesOnly(); if (S.modo === 'plataforma') renderFieldsOnlySeMudou(); else renderFieldsOnly(); renderFillResult(); updateChecks(); }
  if (!r) toast('O preenchimento não terminou. Confira o portal — o botão “Desfazer” volta tudo.');
  else if (daPlataforma) { /* ajuste de um campo: o estado aparece no próprio formulário, sem aviso */ }
  // quando a página já mostrou o aviso com "↶ Desfazer", não sobrescreve (apagaria o botão)
  else if (r.resultados && !r.mudou) toast(`${r.resultados.filter(x => x.ok).length} campo(s) preenchido(s)${r.anexados ? ` · ${r.anexados} anexo(s)` : ''}. Confira antes de enviar.`);
}

/** O que o portal respondeu, campo a campo: opção aproximada, sugestões, única opção e anexo por anexo. */
export function aplicarResultados(tipo, r, files) {
  if (!r) return;
  const W = w(tipo);
  W.aproximadas = W.aproximadas || {}; W.sugestoes = W.sugestoes || {};
  for (const x of r.resultados || []) {
    const k = x.campo;
    if (x.ok) {
      delete W.sugestoes[k];
      if (x.aproximada) { W.aproximadas[k] = { escolhida: x.valor, pedido: x.pedido }; if (W.valores[k]) W.valores[k] = { ...W.valores[k], valor: x.valor }; }
      else if (!x.igual) delete W.aproximadas[k];
      if (x.unica) W.valores[k] = { valor: x.valor, conf: 0.9, fonte: S.rules.mensagens?.unicaOpcao || 'única opção do portal' };
    } else if (x.sugestoes?.length) {
      // funcionário: "Qual deles?"; outras listas: "Você quis dizer"
      if (campoDef(tipo, k)?.fonte === 'empregado') W.candidatos = x.sugestoes; else W.sugestoes[k] = x.sugestoes;
    }
  }
  const an = r.anexos;
  for (const a of W.arquivos) {
    if (!files.includes(a.file)) continue;
    if (!an) { if (r.anexados) a.anexado = true; continue; }
    if (an.aceitos?.includes(a.nome) || an.jaEstavam?.includes(a.nome)) { a.anexado = true; a.recusado = false; a.tiradoNoPortal = false; }
    else if (an.recusados?.includes(a.nome)) { a.anexado = false; a.recusado = true; }
  }
}

export function renderFillResult() {
  const el = $('#fill-res'); if (!el) return;
  const tipo = S.ctx.tipo; if (!tipo) { el.innerHTML = ''; return; }
  const W = w(tipo); const t = tipoDef(tipo); const r = W.resultados;
  const erros = S.ctx.form?.erros || [];
  const aprox = Object.entries(W.aproximadas || {}).filter(([k, a]) => E.norm(campoPortal(k).valor || '') === E.norm(a.escolhida));
  const sug = Object.entries(W.sugestoes || {}).filter(([, l]) => l?.length);
  const recusados = W.arquivos.filter(a => a.recusado && !a.removido);
  const chave = JSON.stringify([r?.resultados?.map(x => [x.campo, x.ok, x.motivo]), erros, aprox, sug, recusados.map(a => a.nome), S.modo]);
  if (chave === el.dataset.chave) return;
  el.dataset.chave = chave;
  const M = S.rules.mensagens || {};
  const partes = [];
  // o portal recusou o envio: o que ele acusa (só rótulo e mensagem) e o caminho para ver a página
  if (erros.length) partes.push(`<div class="note err" style="margin-top:10px">${icon('alert')}<div><b>O portal não aceitou estes campos:</b>
    <ul class="tips" style="margin-top:6px">${erros.map(e => `<li>${esc(e.rotulo)}: ${esc(e.mensagem)}</li>`).join('')}</ul>
    ${S.modo === 'plataforma' ? `<button type="button" class="btn btn-sm" id="fr-ver-portal">${icon('external', 'ic-sm')} Ver no portal</button>` : ''}</div></div>`);
  if (r?.resultados) {
    const falhas = r.resultados.filter(x => !x.ok);
    const ok = r.resultados.filter(x => x.ok).length;
    const unicas = r.resultados.filter(x => x.ok && x.unica);
    const linhas = [
      ...falhas.map(f => `<li>${esc(rotuloDe(tipo, f.campo))}: ${esc(f.motivo)}${W.sugestoes?.[f.campo]?.length ? ` <span class="cands"><small>Você quis dizer:</small>${W.sugestoes[f.campo].map(s => `<button type="button" class="btn btn-sm" data-sug-k="${esc(f.campo)}" data-sug-v="${esc(s)}">${esc(s)}</button>`).join('')}</span>` : ''}</li>`),
      ...aprox.map(([k, a]) => `<li>${esc(rotuloDe(tipo, k))}: ${esc(msgAproximada(a))}</li>`),
      ...unicas.map(x => `<li>${esc(rotuloDe(tipo, x.campo))}: ${esc(x.valor)} (${esc(M.unicaOpcao || 'única opção do portal')})</li>`),
      ...recusados.map(a => `<li>${esc(a.nome)}: ${esc(M.anexoRecusado || 'O portal não aceitou este arquivo (formato ou tamanho?)')}</li>`)
    ];
    const atencao = falhas.length || aprox.length || recusados.length;
    partes.push(`<div class="note ${atencao ? 'warn' : 'ok'}" style="margin-top:10px">${icon(atencao ? 'alert' : 'check')}<div>
      <b>${ok} campo(s) preenchido(s)${r.anexados ? ` e ${r.anexados} anexo(s)` : ''}.</b> Revise na tela e clique em ${esc((t.botaoEnviar || 'ADICIONAR'))} quando estiver tudo certo.
      ${linhas.length ? `<ul class="tips" style="margin-top:6px">${linhas.join('')}</ul>` : ''}</div></div>`);
  }
  el.innerHTML = partes.join('');
  $('#fr-ver-portal')?.addEventListener('click', () => send({ type: 'verPortal' }));
  el.querySelectorAll('[data-sug-k]').forEach(b => b.addEventListener('click', () => escolherSugestao(tipo, b.dataset.sugK, b.dataset.sugV)));
}

/** "Você quis dizer": o cliente escolheu uma das opções parecidas da lista do portal. */
export function escolherSugestao(tipo, k, v) {
  const W = w(tipo);
  W.valores[k] = { valor: v, conf: 1, fonte: 'você' }; W.editados.add(k); W.fonteVerdade[k] = 'plataforma';
  delete W.sugestoes[k]; delete W.aproximadas[k];
  gerarTextos(tipo); renderFieldsOnly(); renderFillResult(); updateChecks();
  if (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo, { daPlataforma: true, so: [k] });
}
