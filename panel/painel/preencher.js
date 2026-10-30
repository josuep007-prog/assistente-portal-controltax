/* Painel — Aba Preencher. (parte de panel/panel.js, dividido na 2.16.4; mapa em docs/arquitetura.md). */
import * as E from '../engine.js';
import { $, P, S, cidAtivo, debounce, esc, icon, request, send, standalone, viewEl } from './base.js';
import { TEXTOS, atualizarBotaoDesfazer, atualizarTextoNoPortal, copiarResumo, desfazerPreenchimento, salvarModeloUI } from './portal.js';
import { analisarItem, applyAnalysis, ehSugestao, esperar, htmlSugestao, renderLote, usarDocumentoNoLugar, usarSugestao } from './lote.js';
import { anexosAtuais, gerarTextos, portalValores, valoresParaChecar } from './valores.js';
import { apagarRascunho, ofertaRascunho, renderModoSeguro } from './facilidades.js';
import { atualizarEstadosPlat, botaoModelo, calcBox, chaveCampos, enviarPendenteAgora, erroDoPortal, fillPortal, ligarModelos, maskInput, refreshCalc, renderFillResult, renderFormularioProprio, updateChecks } from './formulario.js';
import { bindDrop, entenderTexto, openTipo } from './inicio.js';
import { loadEmpregados, msgAproximada, render, rotuloDe, setView, tipoDef, w } from './modo.js';
import { savePrefs } from './conexao.js';
import { renderPlanilhaRubricas } from './planilha.js';

export function renderPreencher() {
  const { route, tipo } = S.ctx;
  if (standalone || route.mode !== 'form' || !tipo) {
    viewEl.innerHTML = `<div id="lote"></div><div id="proximo"></div>
      <div class="empty">${icon('fill', 'ic-lg')}<p><b>Nenhuma solicitação aberta</b></p><p>Escolha no Início o que você precisa fazer, escreva com suas palavras ou arraste um documento — eu abro a solicitação certa.</p>
      <button class="btn btn-primary" id="go-home">Ir para o Início</button></div>`;
    $('#go-home').addEventListener('click', () => setView('inicio'));
    renderLote(); P?.renderProximo($('#proximo'));
    return;
  }
  const t = tipoDef(tipo);
  const plat = S.modo === 'plataforma';
  // com mais de uma empresa no acesso, a empresa do pedido é um botão: abre a caixa para trocar sem perder o que foi preenchido
  const variasEmp = plat && (P?.empresasDoLogin?.().length || 0) > 1;
  const empresaCab = variasEmp
    ? `<button type="button" class="btn btn-sm pd-emp" id="pd-emp" title="Trocar a empresa deste pedido (o que você preencheu fica; o funcionário você escolhe de novo)" aria-haspopup="dialog">${icon('briefcase', 'ic-sm')}<span>${esc(P.apelidoDe(S.ctx.empresa))}</span><span aria-hidden="true">▾</span></button>`
    : `<small class="muted">${esc(S.ctx.empresa)}</small>`;
  const cab = `<div class="card${plat ? ' pd-head' : ''}">
      ${plat ? `<button type="button" class="btn btn-sm pd-voltar" id="pd-voltar" title="Voltar para a escolha do tipo de solicitação (o pedido aberto continua no portal)">${icon('left', 'ic-sm')} Outro tipo</button><div class="pd-t"><h3>${esc(t.nome)}</h3>${empresaCab} <span class="chip sector">${esc(t.setor)}</span></div><ol class="stepper" id="stepper" aria-label="Etapas do pedido"></ol>
        <button type="button" class="btn btn-ghost btn-sm" id="ver-portal" title="Mostra o formulário original do portal">${icon('external', 'ic-sm')} Ver no portal</button>
        <div class="progress"><div class="bar" id="bar"><i style="width:0"></i></div><small class="mono" id="bar-txt"></small></div>` : `
      <div class="card-h">
        <div style="flex:1;min-width:0"><h3>${esc(t.nome)}</h3><small class="muted">${esc(S.ctx.empresa)}</small></div>
        <span class="chip sector">${esc(t.setor)}</span>
      </div>
      <div class="card-b">
        <ol class="stepper" id="stepper" aria-label="Etapas do pedido"></ol>
        <div class="progress" style="margin-top:10px"><div class="bar" id="bar"><i style="width:0"></i></div><small class="mono" id="bar-txt"></small></div>
      </div>`}
    </div>`;
  const drop = `<div class="drop compact" id="drop-form" role="button" tabindex="0">${icon('upload', 'ic-lg')}<div><b>Arraste documentos aqui</b><small>Ou cole um print (Ctrl+V). Eu leio, preencho e anexo.</small></div></div>`;
  const livre = `<div class="free mini">
      <label for="free-form" class="sr">Escreva o pedido com suas palavras</label>
      <textarea id="free-form" class="input" rows="2" placeholder="Ou escreva (ou cole a ficha do funcionário): ex. ${esc(exemploTexto(tipo))}" autocomplete="off" title="Enter envia; Shift+Enter quebra a linha"></textarea>
      <button class="btn btn-sm" id="free-form-go">Preencher</button>
    </div>
    <div id="free-sug"></div>`;
  const arquivos = `<div class="files" id="files"></div><div id="outro-tipo"></div><div id="doc-checklist"></div>`;
  const modeloPlanilha = tipo === 'rubricas' ? `<a class="btn btn-sm btn-ghost" id="baixar-modelo" href="../modelos/modelo-rubricas.csv" download="modelo-rubricas.csv">${icon('sheet', 'ic-sm')} Baixar planilha modelo</a>` : '';
  const dicas = (t.dicas || []).length ? `<h2 class="sec">Dicas</h2><ul class="tips">${t.dicas.map(d => `<li>${esc(d)}</li>`).join('')}</ul>${modeloPlanilha}` : modeloPlanilha;
  const dock = `<div class="dock" id="dock">
      <button class="btn btn-primary" id="btn-fill">${icon('fill', 'ic-sm')} Preencher no portal</button>
      <button class="btn btn-undo" id="btn-undo" hidden>${icon('undo', 'ic-sm')} Desfazer o preenchimento</button>
      <button class="btn" id="btn-send" title="Mostra o resumo e envia pelo botão do portal">${icon('check', 'ic-sm')} Conferir e enviar</button>
      <details class="more-menu"><summary class="btn btn-ghost" aria-label="Mais ações">${icon('more')}</summary>
        <div class="menu">
          <button type="button" id="btn-copy">${icon('copy', 'ic-sm')} Copiar resumo</button>
          <button type="button" id="btn-model">${icon('star', 'ic-sm')} Salvar como modelo</button>
          <button type="button" id="btn-regen">${icon('refresh', 'ic-sm')} Gerar assunto e descrição de novo</button>
          <button type="button" id="btn-clear">${icon('trash', 'ic-sm')} Limpar o que o assistente guardou</button>
        </div></details>
    </div>`;
  // plataforma: o formulário é daqui (o portal fica por baixo); encaixado: o portal é o formulário e aqui fica o resumo
  viewEl.innerHTML = plat ? `
    <div id="lote"></div>${cab}<div id="modo-seguro"></div><div id="rascunho"></div><div id="sug-cad"></div><div id="dica-pedido"></div><div id="confira-leituras"></div><div id="grade-rub"></div><div id="planilha-rub"></div>
    <div class="pd-grid">
      <div class="pd-main"><section class="pn-card"><div class="pn-card-head"><h3>Dados do pedido</h3><small>O que você preencher aqui vai para o portal. Antes de enviar, você confere o resumo.</small></div>
        <div class="pn-card-body"><div id="fields"></div><div id="fill-res"></div></div>${dock}</section></div>
      <aside class="pd-side">${drop}${livre}${arquivos}
        <section class="pn-card"><div class="pn-card-head"><h3>Conferência</h3></div><div class="pn-card-body"><div class="checks" id="checks"></div></div></section>
        ${dicas}</aside>
    </div>` : `
    <div id="lote"></div>
    ${cab}
    <div id="modo-seguro"></div>
    <div id="rascunho"></div>
    <div id="sug-cad"></div>
    <div id="dica-pedido"></div>
    <div id="confira-leituras"></div>
    <div id="grade-rub"></div>
    <div id="planilha-rub"></div>
    ${drop}
    ${livre}
    ${arquivos}
    <h2 class="sec">No portal</h2>
    <div id="fields"></div>
    <div id="fill-res"></div>
    <h2 class="sec">Conferência</h2>
    <div class="checks" id="checks"></div>
    ${dicas}
    ${dock}
  `;
  $('#ver-portal')?.addEventListener('click', () => send({ type: 'verPortal' }));
  $('#pd-voltar')?.addEventListener('click', () => P.voltarEscolha());
  $('#pd-emp')?.addEventListener('click', () => P.trocarEmpresaDoPedido());
  bindDrop($('#drop-form'));
  $('#btn-fill').addEventListener('click', () => fillPortal(tipo));
  $('#btn-undo').addEventListener('click', desfazerPreenchimento);
  $('#btn-send').addEventListener('click', async () => { await enviarPendenteAgora(tipo); S.pedirResumo = true; send({ type: 'requestSubmit' }); });
  $('#btn-copy').addEventListener('click', () => copiarResumo(tipo));
  $('#btn-model').addEventListener('click', () => salvarModeloUI(tipo));
  $('#btn-regen').addEventListener('click', () => { const W = w(tipo); W.editados.delete('assunto'); W.editados.delete('descricao'); gerarTextos(tipo, true); renderFieldsOnly(); updateChecks(); });
  $('#btn-clear').addEventListener('click', () => { S.work[tipo] = null; w(tipo).rascunhoVisto = true; apagarRascunho(tipo); loadEmpregados(tipo); render(); });
  const ff = () => { const v = $('#free-form').value.trim(); if (v) { entenderTexto(v, { origem: 'preencher' }); } };
  $('#free-form-go').addEventListener('click', ff);
  // Enter envia; Shift+Enter quebra a linha (uma ficha colada chega com as linhas intactas)
  $('#free-form').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ff(); } });
  document.querySelectorAll('.more-menu .menu button').forEach(b => b.addEventListener('click', () => b.closest('details').removeAttribute('open')));
  renderFilesOnly(); renderFieldsOnly(); updateChecks(); renderFillResult(); renderLote();
  renderModoSeguro(tipo); ofertaRascunho(tipo); atualizarBotaoDesfazer(); renderSugestoesCadastro(tipo); renderGradeRubricas(tipo); renderPlanilhaRubricas(tipo);
}

/* Rubricas (lote 6): as linhas da planilha, do texto ou do mês passado vão para a grade do portal quando o cliente pede
   ("Lançar na grade"): o nome da rubrica casa com o evento da empresa pelos apelidos das regras; o que não casar fica para ele.
   A grade real ainda não foi mapeada (a calibrar); o Desfazer volta as células e o envio é sempre pelo botão do portal. */
export function renderGradeRubricas(tipo) {
  const el = $('#grade-rub'); if (!el) return;
  const W = w(tipo); const l = W.linhasRubricas || [];
  if (tipo !== 'rubricas' || !l.length || tipoDef(tipo)?.grade?.ativo === false) { el.innerHTML = ''; return; }
  const g = W.grade;
  const pessoas = new Set(l.map(x => E.norm(x.empregado)).filter(Boolean)).size;
  const res = g?.lendo ? `<p class="muted" style="margin:6px 0 0">Lançando na grade do portal…</p>`
    : g?.erro ? `<p class="muted" style="margin:6px 0 0">${esc(g.erro)}</p>`
    : g?.resultado ? `<ul class="tips" style="margin-top:6px"><li>${g.resultado.n} valor(es) lançado(s) na grade. Confira no portal antes de enviar.</li>
        ${g.semEvento?.length ? `<li>Sem evento da empresa para: ${esc(g.semEvento.join(', '))} — lance na grade ou fale com o escritório.</li>` : ''}
        ${g.semEmpregado?.length ? `<li>Não achei na grade: ${esc(g.semEmpregado.join(', '))}.</li>` : ''}
        ${g.resultado.faltaram?.length ? `<li>${g.resultado.faltaram.length} célula(s) não aceitaram o valor.</li>` : ''}</ul>` : '';
  el.innerHTML = `<div class="note grade-rub">${icon('sheet')}<div style="flex:1;min-width:0"><b>Lançar na grade do portal</b> <small class="muted">— ${l.length} valor(es)${pessoas ? ` de ${pessoas} funcionário(s)` : ''}; os nomes das rubricas são casados com os eventos da empresa.</small>${res}
    <div class="actions" style="margin-top:6px"><button type="button" class="btn btn-sm btn-primary" id="grade-lancar"${g?.lendo ? ' disabled' : ''}>${g?.resultado ? 'Lançar de novo' : 'Lançar na grade'}</button></div></div></div>`;
  $('#grade-lancar').addEventListener('click', () => lancarNaGrade(tipo));
}

export async function lancarNaGrade(tipo) {
  const W = w(tipo);
  if (!W.linhasRubricas?.length || S.ctx.route?.mode !== 'form' || S.ctx.tipo !== tipo) return;
  W.grade = { lendo: true }; renderGradeRubricas(tipo);
  for (let k = 0; k < 150 && S.preenchendo; k++) await esperar(200);   // um preenchimento em andamento termina antes
  await enviarPendenteAgora(tipo);   // a competência digitada aqui vai antes (o portal pede antes de adicionar os funcionários)
  let g = null, r = null, plano = null;
  S.preenchendo = true;
  try {
    g = await request({ type: 'lerGrade', adicionar: true }, 20000);
    if (g?.ok) {
      plano = E.montarGrade(W.linhasRubricas, g.eventos, g.empregados, S.rules);
      r = plano.celulas.length ? await request({ type: 'preencherGrade', celulas: plano.celulas }, 30000) : { ok: true, n: 0, faltaram: [] };
    }
  } finally { S.preenchendo = false; }
  W.grade = g?.ok ? { ...plano, resultado: r || { n: 0, faltaram: plano.celulas } }
    : { erro: `Não consegui lançar na grade: ${g?.motivo || 'o portal não respondeu'}. Os valores continuam na descrição para o escritório.` };
  renderGradeRubricas(tipo);
}

/* Cadastro: "Como na última admissão", padrões da empresa e experiência 45 + 45 — sugestões que o cliente usa ou não.
   Só campos da empresa (config.camposDaEmpresa); só aparece o que ainda está vazio aqui e no portal. */
export function renderSugestoesCadastro(tipo) {
  const el = $('#sug-cad'); if (!el) return;
  const W = w(tipo); const pv = portalValores(tipo);
  const sug = Object.entries(E.sugestoesCadastro(tipo, S.rules, { empresa: S.ctx.empresa, historico: S.historico }))
    .filter(([k]) => !W.valores[k]?.valor && !pv[k] && !W.editados.has(k) && !(W.sugestoesDispensadas || []).includes(k) && (S.ctx.form?.campos?.[k]?.existe !== false));
  if (!sug.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="note sug-cad">${icon('info')}<div style="flex:1;min-width:0"><b>Sugestões para este cadastro</b> <small class="muted">— escolhas da empresa, para você conferir. Os dados da pessoa não são copiados.</small>
    <div class="list" style="margin-top:6px">${sug.map(([k, c]) => `<div class="li"><div class="main"><b>${esc(rotuloDe(tipo, k))}: ${esc(c.valor)}</b><small>${esc(c.fonte.charAt(0).toUpperCase() + c.fonte.slice(1))}</small></div><button type="button" class="btn btn-sm" data-sug="${esc(k)}">Usar</button></div>`).join('')}</div>
    <div class="actions" style="margin-top:6px">${sug.length > 1 ? '<button type="button" class="btn btn-primary btn-sm" id="sug-todas">Usar todas</button>' : ''}<button type="button" class="btn btn-ghost btn-sm" id="sug-nao">Agora não</button></div></div></div>`;
  const usar = async (keys) => {
    const mapa = Object.fromEntries(sug);
    for (const k of keys) { W.valores[k] = { ...mapa[k] }; if (S.modo === 'plataforma') W.fonteVerdade[k] = 'plataforma'; }
    gerarTextos(tipo);
    renderSugestoesCadastro(tipo);
    if (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) await fillPortal(tipo, { so: keys, daPlataforma: S.modo === 'plataforma' });
    if (S.view === 'preencher') { renderFieldsOnly(); updateChecks(); }
  };
  el.querySelectorAll('[data-sug]').forEach(b => b.addEventListener('click', () => usar([b.dataset.sug])));
  $('#sug-todas')?.addEventListener('click', () => usar(sug.map(([k]) => k)));
  $('#sug-nao').addEventListener('click', () => { W.sugestoesDispensadas = sug.map(([k]) => k); el.innerHTML = ''; });
}

export function exemploTexto(tipo) {
  return tipoDef(tipo)?.exemploTexto || ({ afastamento: 'atestado de 20 dias a partir de ontem', avisoFerias: 'férias dia 10/11 por 30 dias', calculoFerias: 'férias a partir de 03/11, 30 dias, adiantar 13º', avisoRescisao: 'pediu demissão hoje', calculoRescisao: 'último dia 20/10, aviso indenizado', cadastroEmpregado: 'admitir a Maria Souza, começa 03/11, salário 2500, experiência 45+45', rubricas: 'horas extras de outubro', geral: 'preciso da segunda via da guia do FGTS' }[tipo]) || 'descreva o pedido';
}

/* Etapas: documento/descrição → dados → conferência → envio */
export function renderStepper(list) {
  const el = $('#stepper'); if (!el) return;
  const W = w(S.ctx.tipo);
  const temBase = W.arquivos.some(a => a.status === 'ok' && !a.removido) || Object.values(W.valores).some(v => v?.fonte && v.fonte !== 'gerado') || Object.keys(portalValores(S.ctx.tipo)).length > 1;
  const faltaDado = list.some(i => i.grupo === 'Campos obrigatórios' && i.nivel === 'erro');
  const pend = list.some(i => i.nivel === 'erro' || i.nivel === 'atencao');
  const steps = [['Documento', temBase], ['Dados', temBase && !faltaDado], ['Conferência', temBase && !faltaDado && !pend], ['Envio', false]];
  const atual = steps.findIndex(x => !x[1]);
  el.innerHTML = steps.map(([n, ok], i) => `<li class="${ok ? 'done' : i === atual ? 'cur' : ''}"><span class="dot">${ok ? icon('check', 'ic-sm') : i + 1}</span>${n}</li>`).join('');
  const send = $('#btn-send'), fill = $('#btn-fill');
  if (send && fill) { const pronto = temBase && !faltaDado; send.classList.toggle('btn-primary', pronto); fill.classList.toggle('btn-primary', !pronto); }
}

/* Checklist de documentos (cadastros e pedidos com vários anexos) */
export function renderDocChecklist() {
  const el = $('#doc-checklist'); if (!el) return;
  const t = tipoDef(S.ctx.tipo); const anexos = t.anexos || [];
  if (anexos.length < 3) { el.innerHTML = ''; return; }
  const atuais = anexosAtuais(S.ctx.tipo);
  el.innerHTML = `<div class="card pad doclist"><b class="dl-t">Documentos para enviar</b>
    ${anexos.map(a => { const ok = atuais.some(x => E.anexoCasa(a, x)); const md = !ok && a.modelo && (!a.modeloSe || E.condicaoVale(a.modeloSe, valoresParaChecar(S.ctx.tipo))) ? botaoModelo(a.modelo) : ''; return `<div class="dl-i ${ok ? 'ok' : ''}"><span class="st">${icon(ok ? 'check' : 'minus', 'ic-sm')}</span><span>${esc(a.rotulo)}${a.obrigatorio ? '' : ' <small class="muted">(se houver)</small>'}</span>${md}</div>`; }).join('')}
  </div>`;
  ligarModelos(el, S.ctx.tipo);
}

export function renderFilesOnly() {
  const el = $('#files'); if (!el) return;
  const W = w(S.ctx.tipo);
  el.innerHTML = W.arquivos.filter(a => !a.removido).map(a => `
    <div class="file" data-file="${a.id}">
      ${a.status === 'lendo' ? '<div class="spin"></div>' : icon(a.tabela ? 'sheet' : 'file')}
      <div class="nm"><div>${esc(a.nome)}</div><small title="${esc(a.etapa || '')}">${esc(a.recusado ? (S.rules.mensagens?.anexoRecusado || 'O portal não aceitou este arquivo (formato ou tamanho?)') : a.tiradoNoPortal && !a.anexado ? 'Tirado do portal — clique em “Preencher no portal” para anexar de novo' : (a.etapa || ''))}</small>${a.status === 'lendo' ? `<div class="prog"><i style="width:${Math.round(a.progresso * 100)}%"></i></div>` : ''}</div>
      ${a.status === 'ok' || a.status === 'nao-lido' ? `<span class="chip ${a.jaAnexado || a.anexado ? 'ok' : a.recusado ? 'warn' : 'info'}">${a.jaAnexado || a.anexado ? 'anexado' : 'a anexar'}</span>` : a.status === 'erro' ? '<span class="chip err">erro</span>' : ''}
      <button class="icon-btn" data-rm="${a.id}" aria-label="Remover da lista">${icon('x', 'ic-sm')}</button>
    </div>`).join('');
  el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { const a = W.arquivos.find(x => x.id === b.dataset.rm); if (a) a.removido = true; renderFilesOnly(); updateChecks(); }));
  const outro = W.arquivos.find(a => a.outroTipo && !a.removido);
  const o = $('#outro-tipo');
  // P5: documento de outra pessoa ficou de fora deste pedido — o cliente decide
  const outraP = W.arquivos.find(a => a.outraPessoa && !a.removido);
  if (o) {
    o.innerHTML = (outro ? `<div class="note warn">${icon('alert')}<div>“${esc(outro.nome)}” combina mais com <b>${esc(S.rules.tipos[outro.outroTipo]?.nome)}</b>. <button class="btn btn-ghost btn-sm" id="switch-tipo">Mudar para lá</button></div></div>` : '')
      + (outraP ? `<div class="note warn" id="outra-pessoa">${icon('alert')}<div>${esc((S.rules.mensagens?.documentoOutraPessoa || '“{arquivo}” é de outra pessoa ({nome}). Para não misturar dados de duas pessoas, não usei nada dele neste pedido.').replace('{arquivo}', outraP.nome).replace('{nome}', outraP.outraPessoa))}
        <div class="actions" style="margin-top:6px"><button class="btn btn-sm" id="op-usar">Usar este no lugar</button><button class="btn btn-ghost btn-sm" id="op-tirar">Tirar da lista</button></div></div></div>` : '');
    $('#op-usar')?.addEventListener('click', () => { usarDocumentoNoLugar(S.ctx.tipo, outraP); renderFilesOnly(); });
    $('#op-tirar')?.addEventListener('click', () => { outraP.removido = true; renderFilesOnly(); updateChecks(); });
    $('#switch-tipo')?.addEventListener('click', async () => {
      const destino = outro.outroTipo;
      const W2 = w(destino); W2.arquivos.push(outro); W.arquivos = W.arquivos.filter(a => a !== outro);
      outro.outroTipo = null;
      await openTipo(destino, { manter: true, semEmpresa: true });
      setTimeout(async () => { await loadEmpregados(destino); outro.analise = analisarItem(outro, destino, w(destino).empregados); applyAnalysis(destino, outro); }, 900);
    });
  }
}

export function fieldInput(k, c, cur, W) {
  const v = cur?.valor ?? '';
  const cls = `input ${cur && !W.editados.has(k) && cur.fonte !== 'gerado' ? (cur.conf >= 0.6 ? 'found' : 'low') : ''}`;
  const id = `f-${k}`;
  if (c.tipo === 'radio') {
    const opts = Object.keys(c.seletores || {});
    return `<div class="seg" role="group" aria-label="${esc(c.rotulo)}">${opts.map(o => `<button type="button" data-k="${k}" data-v="${esc(o)}" aria-pressed="${E.norm(o) === E.norm(v)}">${esc(o)}</button>`).join('')}</div>`;
  }
  if (c.tipo === 'textarea') return `<textarea id="${id}" data-k="${k}" class="${cls}" rows="${k === 'descricao' ? 8 : 3}">${esc(v)}</textarea>`;
  const temLista = W.opcoes[k]?.length || c.tipo === 'combo';
  const list = temLista ? `list="dl-${k}"` : '';
  const dl = temLista ? `<datalist id="dl-${k}">${(W.opcoes[k] || []).map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '';
  const ph = { data: 'DD/MM/AAAA', competencia: 'MM/AAAA', cpf: '000.000.000-00', cep: '00000-000', moeda: '0,00' }[c.tipo] || (c.tipo === 'combo' ? 'Digite ou escolha' : '');
  const im = ['data', 'competencia', 'numero', 'cpf', 'cep', 'pis', 'moeda', 'telefone'].includes(c.tipo) ? 'inputmode="numeric"' : '';
  return `<input id="${id}" data-k="${k}" data-t="${c.tipo}" class="${cls}" value="${esc(v)}" placeholder="${ph}" ${im} ${list} autocomplete="off">${dl}`;
}

/* "No portal": o que está (ou vai) em cada campo do formulário, sem duplicar os campos do portal.
   Só o que o portal não tem (dias, CID, médico, observações) é editável aqui: alimenta a descrição. */
export function renderFieldsOnlySeMudou() {
  const tipo = S.ctx.tipo; if (!tipo) return;
  const k = chaveCampos(tipo);
  if (k === S.pv.lastFieldsKey) return;
  if (!document.activeElement?.closest?.('#fields')) renderFieldsOnly();
  else if (S.modo === 'plataforma') atualizarEstadosPlat(tipo);
}

export function renderFieldsOnly() {
  const el = $('#fields'); if (!el) return;
  if (S.modo === 'plataforma') return renderFormularioProprio(el, S.ctx.tipo);
  const tipo = S.ctx.tipo; const t = tipoDef(tipo); const W = w(tipo);
  S.pv.lastFieldsKey = chaveCampos(tipo);
  const pf = S.ctx.form?.campos || {};
  const cond = E.activeConditionals(t, valoresParaChecar(tipo));
  const reqCond = new Set(cond.flatMap(c => c.obrigatorios || []));
  const obrig = (k, c) => c.obrigatorio || reqCond.has(k);
  // campos do portal: obrigatórios ou com algum valor (no portal ou lido pelo Assistente)
  const doPortal = Object.entries(t.campos).filter(([k, c]) => !c.somenteAssistente && !TEXTOS.includes(k) && pf[k]?.existe !== false
    && (obrig(k, c) || pf[k]?.valor || W.valores[k]?.valor));
  const linha = ([k, c]) => {
    const p = pf[k] || {}; const v = W.valores[k];
    const noPortal = p.valor || '';
    const nosso = noPortal && W.ultimoPreenchido?.[k] === noPortal;
    const sugDoc = !noPortal && ehSugestao(v);      // lido com dúvida: o cliente usa ou não
    const pendente = !noPortal && v?.valor && !sugDoc;
    const apx = noPortal && W.aproximadas?.[k] && E.norm(W.aproximadas[k].escolhida) === E.norm(noPortal) ? W.aproximadas[k] : null;
    const erro = erroDoPortal(k);
    const estado = p.disabled ? ['muted', 'bloqueado'] : erro ? ['err', 'recusado'] : apx ? ['warn', 'confira'] : noPortal ? (nosso ? ['ok', 'Assistente'] : ['info', 'você']) : pendente ? ['warn', 'a preencher'] : sugDoc ? ['warn', 'sugestão'] : obrig(k, c) ? ['err', 'vazio'] : ['muted', '—'];
    const fonte = nosso && v?.fonte ? v.fonte : '';
    const baixa = nosso && v?.conf != null && v.conf < 0.6;
    return `<div class="field frow${baixa ? ' low' : ''}">
      <button type="button" class="frow-b" data-k="${k}" title="${esc(fonte ? 'De: ' + fonte : 'Mostrar no portal')}">
        <span class="frow-l">${esc(c.rotulo)}${obrig(k, c) ? '<span class="req">*</span>' : ''}</span>
        <span class="frow-v">${esc(noPortal || (sugDoc ? '' : v?.valor) || '')}${baixa ? ' <small class="chip warn">confira</small>' : ''}</span>
        <span class="chip ${estado[0]}">${estado[1]}</span>
      </button>
      ${sugDoc ? htmlSugestao(k, v) : ''}
      ${k === 'empregado' && W.candidatos?.length && !noPortal ? `<div class="cands"><small>Qual deles?</small>${W.candidatos.map(n => `<button type="button" class="btn btn-sm" data-cand="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
      ${k === 'empregado' && W.pacienteLido && !noPortal && !W.candidatos?.length ? `<small class="hint">No documento: “${esc(W.pacienteLido)}” — não achei esse nome na lista. Escolha o funcionário no portal.</small>` : ''}
      ${apx ? `<small class="aprox">${esc(msgAproximada(apx))}</small>` : ''}
      ${erro ? `<small class="portal-erro">${esc((S.rules.mensagens?.portalAcusa || 'O portal acusa: {mensagem}').replace('{mensagem}', erro.mensagem))}</small>` : ''}
    </div>`;
  };
  const extras = Object.entries(t.campos).filter(([, c]) => c.somenteAssistente);
  const texto = (k) => pf[k]?.valor || W.valores[k]?.valor || '';
  const editadoNoPortal = TEXTOS.some(k => W.editados.has(k));
  el.innerHTML = `
    <div class="card frows">${doPortal.map(linha).join('') || '<p class="muted" style="margin:8px 12px">Nada preenchido ainda. Arraste um documento ou escreva o pedido acima.</p>'}</div>
    <small class="muted frows-nota">Para corrigir, mude direto no portal — eu acompanho e atualizo o assunto e a descrição.</small>
    ${extras.length || t.descricao?.length ? `<h2 class="sec">Só para a descrição</h2>
    <div class="fields">${extras.map(([k, c]) => {
      const cur0 = W.valores[k]; const sg = ehSugestao(cur0); const cur = sg ? undefined : cur0;
      return `<div class="field"><label for="f-${k}">${esc(c.rotulo)}${c.sensivel ? ` <span class="chip warn" title="Dado sensível">sensível</span>` : ''}${cur?.fonte ? `<span class="src" title="${esc(cur.fonte)}">${esc(cur.fonte)}</span>` : ''}</label>${fieldInput(k, c, cur, W)}${sg ? htmlSugestao(k, cur0) : ''}</div>`;
    }).join('')}
    ${t.descricao?.length ? `<div class="field"><label for="f-obs">Observações para o analista</label><textarea id="f-obs" class="input" rows="2" data-obs="1" placeholder="Algo mais que o escritório precisa saber?">${esc(W.valores.observacoes?.valor || '')}</textarea></div>` : ''}
    ${t.campos.cid ? `<label class="toggle"><input type="checkbox" id="tg-cid" ${cidAtivo() ? 'checked' : ''}><span>Incluir CID na descrição<small>${cidAtivo() && !S.prefs.incluirCid ? 'Ligado pelo escritório para esta empresa — você pode desligar.' : 'Dado de saúde (LGPD). Deixe desligado se não for necessário.'}</small></span></label>` : ''}
    </div>` : ''}
    ${t.campos.assunto || t.campos.descricao ? `<details class="more texto-prev"${texto('descricao') ? '' : ' open'}><summary>Assunto e descrição ${editadoNoPortal ? '<small class="chip info">editados por você no portal</small>' : '<small class="chip ok">gerados</small>'}</summary>
      ${texto('assunto') ? `<p class="tp-a">${esc(texto('assunto'))}</p>` : ''}
      ${texto('descricao') ? `<pre class="tp-d">${esc(texto('descricao'))}</pre>` : '<p class="muted">Aparecem quando houver dados.</p>'}</details>` : ''}
    ${calcBox(tipo)}`;

  const onInput = debounce(() => { gerarTextos(tipo); updateChecks(); refreshCalc(); atualizarTextoNoPortal(tipo); }, 400);
  el.querySelectorAll('input[data-k], textarea[data-k]').forEach(inp => {
    inp.addEventListener('input', () => {
      maskInput(inp);
      const k = inp.dataset.k;
      W.valores[k] = { valor: inp.value, conf: 1, fonte: 'você' }; W.editados.add(k);
      inp.classList.remove('found', 'low');
      onInput();
    });
  });
  el.querySelectorAll('.frow-b').forEach(b => b.addEventListener('click', () => { const def = t.campos[b.dataset.k]; if (def) send({ type: 'highlight', locator: def }); }));
  el.querySelectorAll('[data-usar-k]').forEach(b => b.addEventListener('click', () => usarSugestao(tipo, b.dataset.usarK)));
  $('#f-obs')?.addEventListener('input', (e) => { W.valores.observacoes = { valor: e.target.value, conf: 1, fonte: 'você' }; onInput(); });
  el.querySelectorAll('[data-cand]').forEach(b => b.addEventListener('click', () => {
    W.valores.empregado = { valor: b.dataset.cand, conf: 1, fonte: 'você' }; W.candidatos = null;
    gerarTextos(tipo); renderFieldsOnly(); updateChecks();
    if (S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo) fillPortal(tipo);
  }));
  $('#tg-cid')?.addEventListener('change', (e) => { S.prefs.incluirCid = e.target.checked; S.prefs.cidEscolhido = true; savePrefs(); gerarTextos(tipo); atualizarTextoNoPortal(tipo); renderFieldsOnly(); });
}
