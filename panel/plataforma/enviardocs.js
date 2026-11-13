/* Plataforma — Enviar documentos por competência (2.40): a lista do que o cliente envia ao setor (Fiscal, Contábil…) em cada mês.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam.
 * As listas, textos e prazos vêm das regras (config.setores e config.documentosCliente; motor em panel/engine/setores.js).
 * Os arquivos ficam só na memória até o envio; no computador fica guardado apenas o que foi marcado (empresa, competência, id do item,
 * quantidade e data) — nunca nomes de arquivos. Quem envia é sempre o cliente, pelo resumo "Conferir e enviar". */
import * as E from '../engine.js';

export function montarEnviardocs(C) {
  const { A, S, $, esc, icon, toast, viewEl } = C;
  const { P, setorAtual } = C;   // definidos em partes que montam antes
  const MAX_CHAVES = 400;
  // cópias da Solicitação Geral para outros setores (2.41): a fila fica só na memória (os arquivos também)
  const copias = S.plat.copias = { fila: [], atual: null };
  const rot = (s) => E.setorDef(S.rules, s).rotulo || s;
  const setorDoDepartamento = (dep) => E.setorDaSolicitacao({ departamento: dep }, S.rules) || '';

  const env = S.plat.env = { competencia: '', arquivos: new Map(), enviados: {}, naoAplica: [], pronto: false };
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

    const linha = (it) => {
      const arqs = arquivosDe(comp, it.id), env1 = enviados[it.id], disp = doMesDe(comp, it.id);
      const estado = disp ? 'disp' : arqs.length ? 'pronto' : env1 ? 'ok' : '';
      return `<div class="env-i ${estado}" data-item="${esc(it.id)}">
        <span class="env-i-st" aria-hidden="true">${icon(disp ? 'minus' : env1 || arqs.length ? 'check' : 'file', 'ic-sm')}</span>
        <div class="env-i-tx">
          <div class="env-i-t"><b>${esc(it.rotulo)}</b>${it.obrigatorio ? '' : '<span class="chip">opcional</span>'}${(it.setores || []).filter(s => s !== setor).map(s => `<span class="chip info" title="Este documento também serve ao ${esc(s)}">também ${esc(E.setorDef(S.rules, s).rotulo || s)}</span>`).join('')}</div>
          ${it.dica ? `<small class="env-dica">${esc(it.dica)}</small>` : ''}
          ${env1 ? `<small class="env-ok">${icon('check', 'ic-sm')} Enviado em ${esc(E.fmtDate(new Date(env1.quando)))} (${plural(env1.n || 1, 'arquivo', 'arquivos')}). Pode anexar mais e enviar um complemento.</small>` : ''}
          ${arqs.length ? `<div class="env-arqs">${arqs.map((f, i) => `<span class="env-arq" title="${esc(f.name)}">${icon('clip', 'ic-sm')}<span>${esc(f.name)}</span><button type="button" class="icon-btn" data-tirar="${i}" aria-label="Tirar ${esc(f.name)}">${icon('x', 'ic-sm')}</button></span>`).join('')}</div>` : ''}
        </div>
        <div class="env-i-ac">
          ${disp ? '' : `<button type="button" class="btn btn-sm" data-anexar>${icon('upload', 'ic-sm')} ${arqs.length ? 'Anexar mais' : 'Anexar'}</button><input type="file" multiple hidden>`}
          <label class="env-na" title="Este documento não existe neste mês (ex.: não houve compra)"><input type="checkbox" data-na ${disp ? 'checked' : ''}> Não se aplica neste mês</label>
          <button type="button" class="env-nunca" data-nunca title="Tira este item da lista desta empresa em todos os meses (dá para voltar atrás no fim da página)">Nunca se aplica a esta empresa</button>
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

    viewEl.innerHTML = `
      <div class="env-topo">
        <div class="env-intro"><h3>Documentos para o ${esc(def.rotulo || setor)}</h3><p class="muted">${esc(T.explica || 'Anexe os documentos de cada item e clique em Enviar ao escritório.')}</p></div>
        <div class="env-emp">${icon('briefcase', 'ic-sm')}<span>${esc(P.apelidoDe?.(empresa()) || empresa() || 'Empresa')}</span>${emps.length > 1 ? '<button type="button" class="btn btn-sm" id="env-trocar">Trocar empresa</button>' : ''}</div>
      </div>
      <div class="env-meses" role="tablist" aria-label="Competência">
        ${meses.map(m => `<button type="button" role="tab" class="env-mes st-${m.sit.estado}${m.c.competencia === comp ? ' on' : ''}" data-comp="${m.c.competencia}" aria-selected="${m.c.competencia === comp}" title="${esc(`Competência ${m.c.competencia} — ${ROT[m.sit.estado] || 'Em andamento'}`)}">
          <b>${esc(nomeMes(m.c.ano, m.c.mes))}</b><small>${m.c.ano}</small><span class="env-mes-st">${esc(ROT[m.sit.estado] || 'Em andamento')}</span></button>`).join('')}
      </div>
      <section class="pn-card env-card">
        <div class="pn-card-head"><h3>Competência ${esc(comp)}</h3><span class="pill env-pill st-${atual.sit.estado}">${esc(ROT[atual.sit.estado] || 'Em andamento')}</span>
          <small>${atual.c.limite ? `Enviar até ${esc(E.fmtDate(atual.c.limite))}` : ''}${atual.sit.total ? ` · ${atual.sit.feitos} de ${atual.sit.total} ${atual.sit.total === 1 ? 'documento obrigatório enviado' : 'documentos obrigatórios enviados'}` : ''}${doPortal.length ? ` · no portal: solicitação nº ${esc(doPortal.map(x => x.numero).filter(Boolean).join(', ') || '—')}` : ''}</small></div>
        ${atual.sit.semDetalhe ? `<div class="aviso-linha">${icon('info')}<span>Esta competência já foi enviada (solicitação nº ${esc(doPortal[0]?.numero || '')} no portal), provavelmente em outro computador. Aqui não tenho o detalhe de quais documentos foram.</span></div>` : ''}
        <div class="env-lista">${atual.itens.map(linha).join('') || '<p class="muted" style="margin:12px 14px">Nenhum documento nesta competência.</p>'}</div>
        ${outrosSetores.length ? `<div class="copia-setores env-tambem"><span>${icon('copy', 'ic-sm')} Enviar também para:</span>${outrosSetores.map(s => `<label><input type="checkbox" data-tambem="${esc(s)}" ${tambem.includes(s) ? 'checked' : ''}> ${esc(rot(s))}</label>`).join('')}<small class="muted">Depois que o portal salvar a solicitação do ${esc(def.rotulo || setor)}, eu abro uma cópia para cada setor marcado, com o mesmo assunto, a mesma lista e os mesmos anexos. Você confere e envia cada uma.</small></div>` : ''}
        <div class="env-rodape">
          <span class="muted" id="env-resumo">${nArq ? `${plural(nArq, 'arquivo', 'arquivos')} em ${plural(comArq.length, 'item', 'itens')}${faltam.length ? ` · ainda falta: ${esc(faltam.map(f => f.rotulo).join('; '))}` : ''}` : 'Anexe os documentos e envie tudo de uma vez (ou em partes).'}</span>
          <button type="button" class="btn btn-primary" id="env-enviar" ${nArq ? '' : 'disabled'}>${icon('fill', 'ic-sm')} Enviar ao escritório</button>
        </div>
      </section>
      <div id="copias-pend"></div>
      ${dispensadosFixos.length ? `<details class="env-fixos"><summary>${plural(dispensadosFixos.length, 'documento que não se aplica', 'documentos que não se aplicam')} a esta empresa</summary>
        ${dispensadosFixos.map(i => `<div class="env-fixo"><span>${esc(i.rotulo)}</span><button type="button" class="btn btn-sm" data-voltar="${esc(i.id)}">Voltar para a lista</button></div>`).join('')}</details>` : ''}`;

    // ---- ligações
    viewEl.querySelectorAll('[data-comp]').forEach(b => b.addEventListener('click', () => { env.competencia = b.dataset.comp; renderEnviar(); }));
    $('#env-trocar')?.addEventListener('click', async () => { await P.escolherEmpresa?.({ tipo: null }); renderEnviar(); });
    viewEl.querySelectorAll('.env-i').forEach(el => {
      const id = el.dataset.item, k = chaveArq(comp, id);
      const juntar = (files) => {
        const novos = [...files].filter(f => f && f.size); if (!novos.length) return;
        const ja = arquivosDe(comp, id);
        env.arquivos.set(k, [...ja, ...novos.filter(f => !ja.some(x => x.name === f.name && x.size === f.size))]);
        renderEnviar();
      };
      const inp = el.querySelector('input[type=file]');
      el.querySelector('[data-anexar]')?.addEventListener('click', () => inp.click());
      inp?.addEventListener('change', () => { juntar(inp.files); inp.value = ''; });
      el.addEventListener('dragover', (e) => { if (![...(e.dataTransfer?.types || [])].includes('Files') || doMesDe(comp, id)) return; e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', (e) => { if (doMesDe(comp, id)) return; e.preventDefault(); el.classList.remove('over'); juntar(e.dataTransfer?.files || []); });
      el.querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', () => { const l = arquivosDe(comp, id).slice(); l.splice(+b.dataset.tirar, 1); if (l.length) env.arquivos.set(k, l); else env.arquivos.delete(k); renderEnviar(); }));
      el.querySelector('[data-na]')?.addEventListener('change', (e) => {
        const chave = `${empresa()}|${comp}|${id}`;
        env.naoAplica = e.target.checked ? [...new Set([...env.naoAplica, chave])] : env.naoAplica.filter(x => x !== chave);
        if (e.target.checked) env.arquivos.delete(k);
        gravarNaoAplica(); renderEnviar();
      });
      el.querySelector('[data-nunca]')?.addEventListener('click', () => {
        env.naoAplica = [...new Set([...env.naoAplica, `${empresa()}|${id}`])]; env.arquivos.delete(k);
        gravarNaoAplica(); renderEnviar(); toast('Tirei este documento da lista desta empresa. Para voltar, veja no fim da página.');
      });
    });
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
      enviados: comArq.map(it => ({ rotulo: it.rotulo, n: arquivosDe(comp, it.id).length })),
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
