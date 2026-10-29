/* Plataforma — Tela Hoje e atalhos que abrem um pedido já com dados.
 * Recebe o contexto compartilhado (C) e registra nele o que outras partes usam. */
import * as E from '../engine.js';
import { anel, animarNumeros, ligarDicas, cor } from '../graficos.js';

export function montarHoje(C) {
  const { A, S, $, esc, icon, request, send, toast, viewEl } = C;
  const { P, ROT_EV, avisoLeitura, cap, continuarRascunho, dialogo, empregadosAtivos, estadoLeitura, eventosEntre, fazerAgora, fmt, hora, itensVisiveis, ligarSeletorEmpresa, nomeTipo, quando, relogio, rotEmpresa, seletorEmpresa, variasEmpresas } = C;   // definidos em partes que montam antes
  const abrirDetalhe = (...a) => C.abrirDetalhe(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const abrirDia = (...a) => C.abrirDia(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const abrirModelo = (...a) => C.abrirModelo(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const editarLembrete = (...a) => C.editarLembrete(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const tipoArquivo = (...a) => C.tipoArquivo(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  const reaproveitar = (...a) => C.reaproveitar(...a);   // definido numa parte que monta depois (chamado só em tempo de uso)
  /* =================== HOJE (2.1) =================== */
  /* No formato da tela Hoje do Control Onvio (repositório do escritório), na visão do cliente: rosca "% em dia",
     quantas esperam sua resposta, carrossel (um aviso por vez, com a bolinha da leitura do portal) e "Próximos passos".
     Embaixo: situações (filtros) e cartões agrupados por motivo. A classificação é uma só (E.motivoCliente /
     E.prioridadesCliente), para a rosca, as situações e os cartões baterem. */
  const MOT = Object.fromEntries(E.MOTIVOS_CLIENTE.map(m => [m.k, m]));
  const ICONE_MOT = { prescreve: 'clock', responder: 'chat', atrasada: 'alert', respondida: 'check', escritorio: 'briefcase', concluida: 'check' };
  const ROT_CASO = { anexo: 'Anexo não chegou', duplicada: 'Parece repetida', abaErrada: 'Aba certa' };
  const TAG_MOT = { prescreve: 'Prescreve', responder: 'Sua vez', atrasada: 'Passou da expectativa', respondida: 'Respondida', escritorio: 'Com o escritório', concluida: 'Concluída' };
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const lerPref = (k, p) => { try { return localStorage.getItem(`ct.${k}`) || p; } catch { return p; } };
  const gravarPref = (k, v) => { try { localStorage.setItem(`ct.${k}`, v); } catch { /* sem armazenamento: vale só nesta visita */ } };
  const empDe = (i) => (i.empregado && !E.norm(i.assunto).includes(E.norm(i.empregado)) ? i.empregado : '');   // sem repetir o nome que já está no assunto
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const lembretesDeHoje = () => { const h = E.today(); const cal = E.makeCalendar(S.rules.feriados); return S.plat.lembretes.filter(l => E.ocorrencias(l, h, h, cal).length); };

  /* ---------- Atalhos que abrem um pedido já com dados (20, 21, 40) ---------- */
  const admissaoDe = (nome) => A.admissaoDe?.(nome) || E.parseDate((S.plat.emp?.lista || []).find(e => E.norm(e.nome) === E.norm(nome))?.admissao) || null;
  /** "Pedir o cálculo" de um aviso que está no portal: início, dias e abono (ou a data do aviso) entram como sugestão "do aviso nº X". */
  async function pedirCalculoDoAviso(i, datas = null) {
    let item = datas ? { ...i, datas: { ...(i.datas || {}), ...datas } } : i;
    let vv = E.valoresDoAviso(item, S.rules);
    if (!Object.keys(vv.valores).length && i.id) {   // datas ainda não lidas: lê o detalhe na hora
      const r = await request({ type: 'datasAviso', lista: S.rules.tipos[i.tipo]?.apiDetalhe || S.rules.tipos[i.tipo]?.apiLista, solicitacao: i.id }, 15000);
      if (r?.datas) { item = { ...i, datas: { ...(i.datas || {}), ...Object.fromEntries(Object.entries(E.datasDoAviso(r.datas)).filter(([, v]) => v != null)) } }; vv = E.valoresDoAviso(item, S.rules); }
    }
    if (!vv.tipo || !S.rules.tipos[vv.tipo]) return;
    await P.novoPedido(vv.tipo, { empregado: i.empregado, sugeridos: vv.valores, fonte: vv.fonte });
    const W = A.w(vv.tipo); W.avisoUsado = true;
  }
  /** "Pedir de novo" no detalhe de uma solicitação do portal (feita aqui, direto no portal ou em outra máquina): um pedido do
   *  mesmo tipo, para a mesma empresa, com os valores lidos do detalhe (regras: campos.*.api) — sem datas, sem assunto e
   *  descrição, sem dados de saúde; num cadastro, só os campos da empresa. Tudo entra como sugestão "da solicitação nº X". */
  async function pedirDeNovo(i, bruto = null) {
    const t = S.rules.tipos[i.tipo]; if (!t) return;
    if (!bruto && i.id && (t.apiDetalhe || t.apiLista)) bruto = (await request({ type: 'detalheCompleto', lista: t.apiDetalhe || t.apiLista, solicitacao: i.id }, 20000))?.dados || null;
    const vals = E.valoresDoDetalhe(i.tipo, bruto || {}, S.rules);
    // o funcionário da lista, se o detalhe não trouxe (num cadastro, a pessoa é outra: nunca vai)
    if (!vals.empregado && i.empregado && E.resolveTipo(S.rules, i.tipo)?.campos?.empregado) vals.empregado = i.empregado;
    const { empregado, ...resto } = vals;
    await P.novoPedido(i.tipo, { empregado, sugeridos: resto, fonte: i.numero ? `da solicitação nº ${i.numero}` : 'da solicitação no portal', empresa: i.empresa || undefined });
  }
  /* Preparar a resposta (lote 6, regras: config.respostaPortal): o cliente escolhe uma das mensagens das regras (nunca texto
     livre, nunca CID) e os arquivos — os soltos, que ele arrastou na plataforma, já vêm marcados. O Assistente abre a solicitação
     certa no portal (procura o nº na lista), deixa a mensagem na caixa de resposta e anexa os arquivos. O clique em responder é
     sempre do cliente, no portal; nada vai pela API. A tela do detalhe do Onvio real ainda não foi mapeada: a calibrar. */
  function prepararResposta(i) {
    const t = S.rules.tipos[i.tipo]; const cfg = S.rules.config?.respostaPortal || {};
    const textos = (cfg.textos || []).filter(x => x?.id && x.texto);
    if (!t || !textos.length) return;
    const s = S.sugestao;
    const soltos = s?.item ? [s.item, ...(s.extras || [])].filter(x => x?.file) : [];
    const arquivos = soltos.map(x => ({ file: x.file, nome: x.file.name, levar: true, solto: true }));
    const comArquivo = () => arquivos.some(a => a.levar);
    const padrao = () => (comArquivo() ? textos.find(x => x.comAnexo) : null) || (i.veredito?.pede ? textos.find(x => x.id === (cfg.seEscritorioPede || 'informacao')) : null) || textos.find(x => !x.comAnexo) || textos[0];
    let escolhido = padrao().id, mexeu = false;
    const textoDe = (x) => String(x.texto).replace(/\{anexos\}/g, arquivos.filter(a => a.levar).map(a => a.nome).join(', ') || 'os arquivos').replace(/\{numero\}/g, i.numero || '');
    const botao = esc(cfg.botaoResponder || 'RESPONDER');
    const dlg = dialogo({
      titulo: `${icon('chat')} Preparar resposta${i.numero ? ` <span class="mono" style="font-size:13px;color:var(--ink-3)">nº ${esc(i.numero)}</span>` : ''}`,
      corpo: `<p class="muted" style="margin:0 0 10px">Eu abro esta solicitação no portal e deixo a mensagem e os arquivos na resposta. Você confere e clica em <b>${botao}</b> no próprio portal.</p>
        ${i.veredito?.pede && i.veredito.frase ? `<div class="note" style="margin:0 0 10px">${icon('info')}<div><b>O escritório pediu:</b> “${esc(i.veredito.frase)}”</div></div>` : ''}
        <div class="rp-lista rp-textos" role="radiogroup" aria-label="Mensagem">${textos.map(x => `<label class="ee-li"><input type="radio" name="rp-t" value="${esc(x.id)}"${x.id === escolhido ? ' checked' : ''}><span class="es-tx"><b>${esc(x.rotulo || x.id)}</b><small data-prev="${esc(x.id)}"></small></span></label>`).join('')}</div>
        <h4 class="rp-h">Arquivos da resposta</h4><div class="list rp-arqs" id="rp-arqs"></div>
        <div class="drop compact" id="rp-drop" role="button" tabindex="0">${icon('upload')}<div><b>Arraste os arquivos aqui</b><small>Ou clique para escolher. Eles vão anexados na resposta, no portal.</small></div></div>
        <input type="file" id="rp-file" multiple hidden>`,
      acoes: [{ rotulo: 'Cancelar' }, '|', { rotulo: `${icon('external', 'ic-sm')} Preparar no portal`, cls: 'btn-primary rp-ir', fn: () => { enviar(); } }]
    });
    const el = dlg.el;
    const desenhar = () => {
      if (!mexeu) { escolhido = padrao().id; el.querySelectorAll('input[name="rp-t"]').forEach(r => { r.checked = r.value === escolhido; }); }
      el.querySelectorAll('[data-prev]').forEach(x => { x.textContent = textoDe(textos.find(y => y.id === x.dataset.prev)); });
      el.querySelector('#rp-arqs').innerHTML = arquivos.length ? arquivos.map((a, n) => `<label class="li"><input type="checkbox" data-rp-arq="${n}"${a.levar ? ' checked' : ''}><div class="main"><b>${esc(a.nome)}</b><small>${a.solto ? 'arquivo que você arrastou na plataforma' : 'escolhido agora'}</small></div></label>`).join('') : '<p class="muted" style="margin:0">Nenhum arquivo (a resposta pode ir só com a mensagem).</p>';
      el.querySelectorAll('[data-rp-arq]').forEach(c => c.addEventListener('change', () => { arquivos[+c.dataset.rpArq].levar = c.checked; desenhar(); }));
    };
    const juntar = (fs) => { for (const f of fs || []) if (!arquivos.some(a => a.nome === f.name && a.file.size === f.size)) arquivos.push({ file: f, nome: f.name, levar: true }); desenhar(); };
    el.querySelectorAll('input[name="rp-t"]').forEach(r => r.addEventListener('change', () => { escolhido = r.value; mexeu = true; }));
    const drop = el.querySelector('#rp-drop'), inp = el.querySelector('#rp-file');
    drop.addEventListener('click', () => inp.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); juntar([...(e.dataTransfer?.files || [])]); });
    inp.addEventListener('change', () => { juntar([...inp.files]); inp.value = ''; });
    desenhar();
    async function enviar() {
      const x = textos.find(y => y.id === escolhido) || padrao();
      const levar = arquivos.filter(a => a.levar).map(a => a.file);
      const packed = await A.packFiles(levar);
      const r = await request({ type: 'prepararResposta', slug: t.slug, numero: i.numero || '', texto: textoDe(x), files: packed }, 45000, packed.map(p => p.buf));
      // os arquivos soltos foram para a resposta: o cartão do documento sai do Novo pedido
      if (r?.ok && s && S.sugestao === s && arquivos.some(a => a.solto && a.levar)) { S.sugestao = null; }
      if (!r?.ok) toast(`Não consegui preparar a resposta${r?.motivo ? ` (${r.motivo})` : ''}. Responda direto no portal.`);
      else if (r.recusados?.length) toast(`O portal não aceitou: ${r.recusados.join(', ')}. Confira os anexos antes de responder.`);
    }
  }
  /* Variáveis da folha do mês (regras: config.variaveisFolha): "Preparar" abre o Lançamento de Rubricas com o tipo e a
     competência como sugestão (com a planilha, se foi arrastada no cartão); "Usar o lançamento do mês passado" leva o tipo e as
     linhas do último lançamento (deste computador ou, lido na hora, do portal), sem a competência antiga; "Nada a lançar este mês"
     só esconde o aviso daquele mês (guardado neste computador). Quem envia é sempre o cliente. */
  async function prepararFolha(f, arquivos = null) {
    await P.novoPedido('rubricas', { sugeridos: { tipoLancamento: f.tipoLancamento, competencia: f.competencia }, fonte: 'sugestão: competência do mês', semResumo: true });
    if (arquivos?.length && S.ctx.route?.mode === 'form' && S.ctx.tipo === 'rubricas') A.handleFiles(arquivos, 'arrastar');
  }
  async function usarMesPassado(f) {
    const emp = S.ctx.empresa, t = S.rules.tipos.rubricas;
    const h = (S.historico || []).find(x => x.status === 'enviado' && x.tipo === 'rubricas' && x.empresa === emp);
    let vals = h ? E.valoresParaRepetir('rubricas', h.valores, S.rules) : {}, linhas = null;
    let fonte = h ? `do lançamento de ${new Date(h.quando).toLocaleDateString('pt-BR')}` : '';
    if (!h) {
      const ult = E.filtrarPorEmpresa(S.plat.sol?.itens || [], '', emp).filter(i => i.tipo === 'rubricas' && !['cancelada', 'prescrita'].includes(i.estado))
        .sort((a, b) => (b.criado?.getTime() || 0) - (a.criado?.getTime() || 0))[0];
      if (ult?.id && t) {
        const r = await request({ type: 'detalheCompleto', lista: t.apiDetalhe || t.apiLista, solicitacao: ult.id }, 20000);   // só na memória
        if (r?.dados) { vals = E.valoresDoDetalhe('rubricas', r.dados, S.rules); linhas = E.linhasDoLancamento(r.dados); }
        fonte = ult.numero ? `do lançamento nº ${ult.numero}` : 'do último lançamento no portal';
      }
    }
    const { tabelaRubricas, competencia: _velha, ...resto } = vals;
    if (!linhas?.length && tabelaRubricas) linhas = E.linhasDoTexto(tabelaRubricas);
    const texto = tabelaRubricas || (linhas?.length ? E.textoLinhasRubricas(linhas) : '');
    if (!Object.keys(resto).length && !texto) { toast('Não achei um lançamento anterior desta empresa. Use “Preparar” e arraste a planilha.'); return; }
    await P.novoPedido('rubricas', { sugeridos: { tipoLancamento: f.tipoLancamento, ...resto, competencia: f.competencia }, fonte, semResumo: true,
      extras: texto ? { tabelaRubricas: { valor: texto, conf: 0.6, fonte } } : null, linhas });
    toast('Usei o lançamento do mês passado, com a competência deste mês. Confira os valores antes de enviar.');
  }
  async function nadaALancar(f) {
    S.plat.folhaNada = [...new Set([...(S.plat.folhaNada || []), `${S.ctx.empresa}|${f.competencia}`])].slice(-60);
    try { await chrome.storage.local.set({ folhaNada: S.plat.folhaNada }); } catch { /* sem armazenamento: vale nesta visita */ }
    toast(`Combinado: sem variáveis da folha de ${f.competencia}. O aviso volta no mês que vem.`);
    if (S.view === 'inicio') renderPainel();
  }
  /** "Programar" férias a vencer: o aviso já com a 1ª data de início que vale (30 dias de antecedência, fora de sexta e véspera de feriado). */
  function programarFerias(nome) {
    const ini = E.primeiroInicioFerias(E.addDays(E.today(), +S.rules.config?.avisoFeriasDias || 30), S.rules);
    P.novoPedido('avisoFerias', { empregado: nome, sugeridos: { inicioGozo: E.fmtDate(ini) }, fonte: 'sugestão: 1ª data que vale' });
  }
  /* Experiência que vence: três saídas (regras: config.experienciaSaidas). Efetivar só dispensa o aviso (fica neste computador). */
  const chaveExp = (nome, n) => `${S.ctx.empresa}|${E.norm(nome)}|${n}`;
  const lerEfetivados = () => { try { return JSON.parse(localStorage.getItem('ct.expEfetivados') || '[]'); } catch { return []; } };
  const expEfetivado = (nome, n) => lerEfetivados().includes(chaveExp(nome, n));
  const textoCfg = (t, vals) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? '');
  function acoesExperiencia(nome, adm, n) {
    const cfg = S.rules.config?.experienciaSaidas || {};
    const sx = adm ? E.saidasExperiencia(E.iso(adm), n, S.rules) : null;
    const out = [];
    if (sx?.podeProrrogar && cfg.prorrogar !== false) out.push({ rotulo: cfg.prorrogar?.rotulo || 'Prorrogar', titulo: 'Termo de prorrogação pelo modelo e o pedido ao escritório', fn: () => prorrogarExperiencia(nome, adm, n) });
    if (S.rules.tipos.calculoRescisao && cfg.encerrar !== false) out.push({ rotulo: cfg.encerrar?.rotulo || 'Encerrar no fim', titulo: cfg.encerrar?.explicacao || '', fn: () => encerrarExperiencia(nome, adm, n) });
    out.push({ rotulo: cfg.efetivar?.rotulo || 'Efetivar', cls: 'btn-ghost', fn: () => efetivarExperiencia(nome, adm, n) });
    return out;
  }
  function prorrogarExperiencia(nome, adm, n) {
    const cfg = S.rules.config?.experienciaSaidas?.prorrogar || {};
    const sx = E.saidasExperiencia(E.iso(adm), n, S.rules); if (!sx) return;
    const vals = { empregado: nome, dataAdmissao: E.fmtDate(adm), diasProrrogacao: String(sx.diasProrrogacao), fimProrrogacao: E.fmtDate(sx.fimProrrogacao), max: sx.max, fim: E.fmtDate(sx.fim) };
    const md = (S.rules.modelosDocumento || []).find(m => m.id === (cfg.modelo || 'prorrogacaoExperiencia'));
    const pedido = cfg.pedido && S.rules.tipos[cfg.pedido] ? cfg.pedido : null;
    const abrirPedido = () => P.novoPedido(pedido, { valores: Object.fromEntries(Object.entries(cfg.valores || {}).map(([k, v]) => [k, textoCfg(v, vals)])) });
    if (md) abrirModelo(md, E.valoresDoModelo(md, vals), { nota: textoCfg(cfg.explicacao, vals), acao: pedido ? { rotulo: `${icon('fill', 'ic-sm')} Abrir o pedido ao escritório`, fn: abrirPedido } : null });
    else if (pedido) abrirPedido();
  }
  function encerrarExperiencia(nome, adm, n) {
    const cfg = S.rules.config?.experienciaSaidas || {};
    const sx = E.saidasExperiencia(E.iso(adm), n, S.rules); if (!sx) return;
    const motivo = cfg.motivos?.termino || 'Término de contrato de trabalho por tempo determinado';
    P.novoPedido(cfg.encerrar?.pedido && S.rules.tipos[cfg.encerrar.pedido] ? cfg.encerrar.pedido : 'calculoRescisao', { empregado: nome, valores: { motivo, dataDemissao: E.fmtDate(sx.fim) } });
    if (cfg.encerrar?.explicacao) toast(cfg.encerrar.explicacao);
  }
  function efetivarExperiencia(nome, adm, n) {
    const cfg = S.rules.config?.experienciaSaidas?.efetivar || {};
    const sx = adm ? E.saidasExperiencia(E.iso(adm), n, S.rules) : null;
    dialogo({ titulo: `Efetivar ${esc(A.nomeCurto(nome))}`,
      corpo: `<p style="margin:0">${esc(textoCfg(cfg.explicacao || 'Se {empregado} vai continuar, não precisa fazer nada: depois de {fim}, o contrato passa a ser por prazo indeterminado.', { empregado: A.nomeCurto(nome), fim: sx ? E.fmtDate(sx.fim) : 'o fim da experiência' }))}</p>`,
      acoes: ['|', { rotulo: 'Cancelar' }, { rotulo: 'Entendi, tirar o aviso', cls: 'btn-primary', fn: () => {
        try { localStorage.setItem('ct.expEfetivados', JSON.stringify([...lerEfetivados(), chaveExp(nome, n)].slice(-200))); } catch { /* sem armazenamento */ }
        if (S.view === 'inicio') renderPainel();
      } }] });
  }
  P.acoesExperiencia = acoesExperiencia;
  /** "Para terminar" no Hoje: preenchidas e não enviadas nos últimos 7 dias e os rascunhos da empresa, sem repetir. */
  function paraTerminar() {
    const emp = S.ctx.empresa, lim = Date.now() - 7 * 864e5, vistos = new Set(), out = [];
    const chave = (tipo, quem) => `${tipo}|${E.norm(quem)}`;
    const quando = (t) => { const d = E.diffDays(new Date(new Date(t).toDateString()), E.today()); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`; };
    for (const [k, r] of Object.entries(S.plat.rascunhos || {})) {
      const [e, tipo] = k.split('|'); if (e !== emp || !S.rules.tipos[tipo] || !r?.quando || r.quando < lim) continue;
      const quem = r.valores?.empregado?.valor || r.valores?.nome?.valor || '';
      vistos.add(chave(tipo, quem));
      out.push({ t: r.quando, titulo: nomeTipo(tipo), sub: [quem && A.nomeCurto(quem), 'rascunho guardado'].filter(Boolean).join(' · '), quando: quando(r.quando), fn: () => continuarRascunho(tipo, r) });
    }
    for (const h of S.historico || []) {
      if (h.status !== 'preenchido' || h.empresa !== emp || h.quando < lim || !S.rules.tipos[h.tipo]) continue;
      const quem = h.valores?.empregado || h.valores?.nome || '';
      if (vistos.has(chave(h.tipo, quem))) continue; vistos.add(chave(h.tipo, quem));
      out.push({ t: h.quando, titulo: h.resumo || nomeTipo(h.tipo), sub: [nomeTipo(h.tipo), 'preenchido e não enviado'].join(' · '), quando: quando(h.quando), fn: () => reaproveitar(h) });
    }
    return out.sort((a, b) => b.t - a.t).slice(0, 8);
  }

  function renderPainel() {
    const R = S.rules, sol = S.plat.sol, hoje = E.today();
    const lido = !!sol && !sol.semAcesso;
    const animar = lido && !viewEl.querySelector('.hj-hero[data-pronto]');
    const base = lido ? itensVisiveis() : [];
    const comEmpresa = variasEmpresas(base);   // mais de uma empresa na tela: cada item diz de qual é
    const prio = E.prioridadesCliente(base, hoje, R);
    const cont = Object.fromEntries(E.MOTIVOS_CLIENTE.map(m => [m.k, prio.filter(p => p.motivo === m.k).length]));
    const total = prio.length;
    const suaVez = cont.prescreve + cont.responder;
    const pctDia = total ? Math.round((total - suaVez) / total * 100) : 100;
    const fatias = E.MOTIVOS_CLIENTE.map(m => ({ k: m.k, rot: m.rot, n: cont[m.k], cor: m.cor }));
    const lems = lembretesDeHoje();
    const prazos = eventosEntre(hoje, E.addDays(hoje, 3)).filter(e => ['legal', 'exp', 'pedido'].includes(e.tipo));
    const atencao = prio.filter(p => ['prescreve', 'responder', 'atrasada'].includes(p.motivo));
    const avisos = lido ? E.avisosSemCalculo(base, hoje, R) : [];
    const casos = lido ? E.casosCliente(base, R) : [];
    const legais = lido ? E.prazosLegaisCliente(base, hoje, R) : [];
    const equipe = E.equipeVencendo(empregadosAtivos(), base, hoje, R);
    // variáveis da folha do mês da empresa aberta no portal (some quando o portal já tem o lançamento ou o cliente dispensou)
    const emp = S.ctx.empresa || '';
    const folha = lido && R.tipos?.rubricas ? E.variaveisDoMes(hoje, R, E.filtrarPorEmpresa(sol.itens, '', emp), (S.plat.folhaNada || []).filter(k => k.startsWith(`${emp}|`)).map(k => k.slice(emp.length + 1))) : null;
    const acoesEq = [];
    const quandoLido = sol?.quando ? new Date(sol.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

    const aviso = '';   // falha de leitura: aviso único no topo (avisoLeitura)
    const enviado = S.plat.enviado && Date.now() - S.plat.enviado.quando < 5 * 60e3
      ? `<div class="aviso-linha ok">${icon('check')}<span><b>Solicitação de ${esc(nomeTipo(S.plat.enviado.tipo))} enviada ao escritório.</b> Ela aparece aqui assim que o portal registrar.</span></div>` : '';

    viewEl.innerHTML = `
      <div id="avisos-esc"></div>
      <div id="lote"></div>
      ${enviado}${aviso}<div id="proximo"></div>
      <p class="hj-saud"><b>${saudacao()}!</b> · ${esc(cap(hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })))}</p>
      <div class="dp-toolbar hj-barra">
        ${seletorEmpresa()}
        <span class="dp-count">${lido ? plural(base.filter(i => ['aguardando', 'andamento'].includes(i.estado)).length, 'em aberto', 'em aberto') : ''}</span>
        <button type="button" class="btn btn-sm" data-ir="pendencias">${icon('list', 'ic-sm')} Ver as solicitações</button>
        <button type="button" class="btn btn-sm" id="hj-lembrete">${icon('plus', 'ic-sm')} Lembrete</button>
        <button type="button" class="btn btn-sm btn-primary" data-ir="preencher">${icon('plus', 'ic-sm')} Novo pedido</button>
      </div>
      ${heroHtml()}
      ${equipeHtml()}
      ${casosHtml()}`;

    function heroHtml() {
      const slides = slidesDoCarrossel();
      const estadoLeitura = !sol ? 'parado' : sol.semAcesso || sol.erros.length ? 'erro' : '';
      const dica = !sol ? 'Lendo o portal…' : sol.semAcesso ? 'Não consegui ler o portal agora' : `Portal lido às ${quandoLido}`;
      const titulo = !sol ? 'Lendo suas solicitações no portal…'
        : sol.semAcesso ? 'Não consegui ler suas solicitações agora'
        : suaVez ? `<em data-conta="${suaVez}" data-de="0">${suaVez}</em> ${suaVez === 1 ? 'solicitação espera' : 'solicitações esperam'} sua resposta`
        : total ? `Tudo em dia do seu lado ${icon('check')}` : 'Nenhuma solicitação em aberto';
      const abertas = base.filter(i => ['aguardando', 'andamento'].includes(i.estado));
      const resumo = lido ? [plural(abertas.length, 'em aberto', 'em aberto'), `${abertas.filter(i => i.lado === 'esc').length} com o escritório`, `${abertas.filter(i => i.lado === 'cli').length} com você`]
        .concat(cont.atrasada ? [`${cont.atrasada} ${cont.atrasada === 1 ? 'passou' : 'passaram'} da expectativa`] : []).join(' · ') : 'Os números vêm do próprio portal, com o seu acesso.';
      const passos = passosHtml();
      return `<section class="hj-hero" style="--i:0"${lido ? ' data-pronto' : ''}>
        <div class="hj-hero-g">
          <div class="hj-donut">${anel(fatias, { ativo: null, rotulo: 'em dia', anima: animar, centro: { n: lido ? pctDia : 0, de: animar ? 0 : pctDia, suf: '%' }, titulo: 'Solicitações por situação (clique numa parte para ver as solicitações)' })}</div>
          <div class="hj-hero-tx">
            <span class="hj-eyebrow">Suas solicitações no portal${quandoLido ? ` · lidas às ${quandoLido}` : ''}</span>
            <h2 id="hj-titulo">${titulo}</h2>
            <p>${resumo}</p>
            <div class="hj-tick ${estadoLeitura}${slides.length < 2 ? ' uno' : ''}" id="hj-tick" role="region" aria-label="Avisos, um por vez" aria-live="off">
              <span class="hj-bola" title="${esc(dica)}" aria-label="${esc(dica)}"></span>
              <div class="hj-tick-palco">${slides.length ? slides.map((s, n) => `<button type="button" class="hj-tk${n === 0 ? ' on' : ''}" data-slide="${n}"${n ? ' tabindex="-1" aria-hidden="true"' : ''} style="--c:${s.c}"><span class="hj-tk-tag">${esc(s.tag)}</span><b>${esc(s.txt)}</b><small>${esc(s.sub)}</small></button>`).join('')
                : `<span class="hj-tk on vazio"><b>${!sol ? 'Lendo o portal…' : 'Nada pedindo sua atenção agora.'}</b><small>${sol ? 'Quando o escritório responder, aparece aqui.' : ''}</small></span>`}</div>
              <i class="hj-tick-relogio"><i></i></i>
            </div>
            <div class="hj-legenda">${fatias.filter(f => f.n).map(f => `<span><i style="background:${cor(f.cor)}"></i>${esc(f.rot)} <b>${f.n}</b></span>`).join('')}</div>
          </div>
        </div>
        <div class="hj-passos"><h3>Próximos passos</h3>${passos.html}</div>
      </section>`;
    }
    function slidesDoCarrossel() {
      const out = [];
      for (const p of atencao.slice(0, 12)) {
        const i = p.item;
        out.push({ tag: TAG_MOT[p.motivo], txt: `${i.numero ? `nº ${i.numero} · ` : ''}${i.assunto || nomeTipo(i.tipo)}: ${E.acaoCliente(i, p.motivo).toLowerCase()}`, sub: [comEmpresa && rotEmpresa(i), nomeTipo(i.tipo), empDe(i), i.responsavel && `com ${i.responsavel}`].filter(Boolean).join(' · '), c: cor(MOT[p.motivo].cor), fn: () => abrirDetalhe(i) });
      }
      for (const l of lems) out.push({ tag: 'Lembrete de hoje', txt: l.texto, sub: [l.hora, l.obs].filter(Boolean).join(' · ') || 'Agenda', c: 'var(--blue-deep)', fn: () => editarLembrete(l, E.iso(hoje)) });
      for (const e of prazos) { const [, t] = quando(e.d); out.push({ tag: ROT_EV[e.tipo], txt: e.titulo, sub: [cap(t), e.detalhe].filter(Boolean).join(' · '), c: 'var(--hj-today)', fn: () => abrirDia(E.iso(e.d)) }); }
      slidesDoCarrossel.ultimo = out;
      return out;
    }
    function passosHtml() {
      const li = [], acoes = []; let n = 2;
      const passo = (cls, c, titulo, sub, fn, fim = icon('right', 'ic-sm')) => { acoes.push(fn); li.push(`<li style="--i:${n++}"><button type="button" class="hj-step${cls}" data-passo="${acoes.length - 1}" style="--c:${c}"><i></i><span><b>${esc(titulo)}</b><small>${esc(sub)}</small></span>${fim}</button></li>`); };
      for (const p of atencao.slice(0, 8)) { const i = p.item; passo('', cor(MOT[p.motivo].cor), E.acaoCliente(i, p.motivo), [comEmpresa && rotEmpresa(i), i.numero && `nº ${i.numero}`, i.assunto || nomeTipo(i.tipo), empDe(i)].filter(Boolean).join(' · '), () => abrirDetalhe(i)); }
      for (const x of avisos.filter(x => x.falta != null && x.falta <= 10)) passo('', 'var(--viz-crit)', `Pedir o cálculo ${x.tipo === 'ferias' ? 'de férias' : 'da rescisão'} · pagamento até ${fmt(x.pagamento)}`, [A.nomeCurto(x.item.empregado), x.enviarAte ? `envie até ${fmt(x.enviarAte)}` : ''].filter(Boolean).join(' · '), () => pedirCalculoDoAviso(x.item));
      for (const p of prio.filter(p => p.motivo === 'respondida').slice(0, 4)) { const i = p.item; passo('', cor(MOT.respondida.cor), E.acaoCliente(i, 'respondida'), [i.numero && `nº ${i.numero}`, i.assunto || nomeTipo(i.tipo)].filter(Boolean).join(' · '), () => abrirDetalhe(i)); }
      for (const x of legais.filter(x => x.falta <= 5)) passo('', 'var(--viz-crit)', `${x.titulo} até ${fmt(x.alvo)}`, [x.item.empregado, x.ref].filter(Boolean).join(' · '), () => abrirDetalhe(x.item, { aba: 'observar' }));
      if (folha && folha.falta <= 3) passo('', 'var(--hj-today)', `Enviar as variáveis da folha de ${folha.competencia} até ${fmt(folha.limite)}`, 'Preparar o Lançamento de Rubricas', () => prepararFolha(folha));
      for (const l of lems) passo(' n-lem', 'var(--blue-deep)', l.texto, `Lembrete de hoje${l.hora ? ` · ${l.hora}` : ''}`, () => editarLembrete(l, E.iso(hoje)));
      for (const e of prazos) { const [, t] = quando(e.d); passo('', 'var(--hj-today)', e.titulo, `${e.pedir ? 'Fazer agora · ' : ''}${cap(t)} · ${e.detalhe || ROT_EV[e.tipo]}`, e.pedir ? () => fazerAgora(e.pedir) : () => abrirDia(E.iso(e.d))); }
      passosHtml.acoes = acoes;
      return { html: li.length ? `<ol class="hj-passos-l" id="hj-passos">${li.join('')}</ol>` : `<div class="hj-zen">${icon('check')}<span>${sol ? 'Nada para fazer agora. Tudo em dia!' : 'Lendo o portal…'}</span></div>` };
    }
    // Equipe: experiência vencendo, férias a vencer e avisos sem o cálculo (com o atalho para pedir)
    function equipeHtml() {
      // acao: { rotulo, fn } ou uma lista delas (a experiência tem três saídas)
      const linha = (titulo, sub, pill, acao, abrir) => {
        const lista = [].concat(acao || []).filter(Boolean);
        acoesEq.push({ acao: lista[0]?.fn, abrir });
        const n = acoesEq.length - 1;
        const bts = lista.map((a, k) => { if (k) acoesEq.push({ acao: a.fn }); return `<button type="button" class="btn btn-sm${a.cls ? ' ' + a.cls : ''}" data-eq="${k ? acoesEq.length - 1 : n}"${a.titulo ? ` title="${esc(a.titulo)}"` : ''}>${esc(a.rotulo)}</button>`; }).join('');
        return `<div class="pn-li eq-li"${abrir ? ` data-eq-abrir="${n}"` : ''}><div class="main"><b>${esc(titulo)}</b><small>${esc(sub)}</small></div><div class="eq-acoes">${pill}${bts}</div></div>`;
      };
      const pillQ = (d) => { if (!d) return '<span class="pill">sem data</span>'; const [c, t] = quando(d); return `<span class="pill pill-${c}">${t}</span>`; };
      const vazio = (txt) => `<div class="pn-vazio">${icon('check', 'ic-sm')} ${esc(txt)}</div>`;
      const exp = equipe.experiencia.filter(x => !expEfetivado(x.nome, x.n)).map(x => linha(x.nome, `Fim dos ${x.n} dias em ${fmt(x.fim)} · prorrogar, encerrar no fim ou efetivar`, pillQ(x.fim), acoesExperiencia(x.nome, admissaoDe(x.nome), x.n)));
      const fer = equipe.ferias.map(x => linha(x.nome, `${x.falta < 0 ? 'Prazo para conceder passou em' : 'Conceder até'} ${fmt(x.limite)} · período ${x.aquisitivo}`, pillQ(x.limite), S.rules.tipos.avisoFerias ? { rotulo: 'Programar', fn: () => programarFerias(x.nome) } : null));
      const avs = avisos.map(x => linha(x.item.empregado,
        x.tipo === 'ferias'
          ? (x.pagamento ? `Férias${x.inicio ? ` em ${fmt(x.inicio).slice(0, 5)}` : ''} · pedir o cálculo até ${fmt(x.enviarAte).slice(0, 5)} · pagar até ${fmt(x.pagamento).slice(0, 5)}` : 'Aviso de férias sem o cálculo · confira as datas no aviso')
          : (x.pagamento ? `Rescisão · pedir o cálculo até ${fmt(x.enviarAte).slice(0, 5)} · pagar até ${fmt(x.pagamento).slice(0, 5)} (aviso indenizado)` : 'Aviso de rescisão sem o cálculo · confira as datas no aviso'),
        pillQ(x.enviarAte || x.pagamento), S.rules.tipos[x.calculo] ? { rotulo: 'Pedir o cálculo', fn: () => pedirCalculoDoAviso(x.item) } : null, () => abrirDetalhe(x.item)));
      const card = (id, titulo, sub, linhas, txtVazio) => `<section class="pn-card" id="${id}"><div class="pn-card-head"><h3>${titulo} <span class="eq-n">${linhas.length}</span></h3><small>${esc(sub)}</small></div><div class="pn-card-body eq-body">${linhas.length ? `<div class="eq-lista">${linhas.join('')}</div>` : vazio(txtVazio)}</div></section>`;
      const leg = legais.map(x => linha(x.item.empregado || x.item.assunto || nomeTipo(x.item.tipo), `${x.titulo} até ${fmt(x.alvo)} · ${x.ref}${x.retroativa ? ' · pedido depois do início' : ''}`, pillQ(x.alvo), null, () => abrirDetalhe(x.item, { aba: 'observar' })));
      // o que foi preenchido e não enviado nos últimos 7 dias e os rascunhos da empresa
      const term = paraTerminar().map(x => linha(x.titulo, x.sub, `<span class="pill pill-today">${x.quando}</span>`, { rotulo: 'Continuar', cls: 'btn-primary', fn: x.fn }));
      // variáveis da folha: Preparar, Usar o lançamento do mês passado, Nada a lançar este mês (e soltar a planilha no cartão)
      const folhaCard = () => {
        if (!folha) return '';
        const n = (fn) => { acoesEq.push({ acao: fn }); return acoesEq.length - 1; };
        return `<section class="pn-card hj-folha" id="eq-folha"><div class="pn-card-head"><h3>Variáveis da folha de ${esc(folha.competencia)}</h3><small>Ainda não enviadas · envie até ${fmt(folha.limite)}</small></div>
          <div class="pn-card-body eq-body"><div class="pn-li eq-li folha-drop"><div class="main"><b>Horas extras, faltas, comissões… do mês</b><small>Arraste a planilha aqui ou prepare o lançamento (${esc(folha.tipoLancamento)}, competência ${esc(folha.competencia)}, para você conferir).</small></div><div class="eq-acoes">${pillQ(folha.limite)}</div></div>
          <div class="eq-acoes folha-acoes"><button type="button" class="btn btn-sm btn-primary" data-eq="${n(() => prepararFolha(folha))}" data-folha="preparar">Preparar</button><button type="button" class="btn btn-sm" data-eq="${n(() => usarMesPassado(folha))}" data-folha="passado">Usar o lançamento do mês passado</button><button type="button" class="btn btn-sm btn-ghost" data-eq="${n(() => nadaALancar(folha))}" data-folha="nada">Nada a lançar este mês</button></div></div></section>`;
      };
      // documentos que o escritório publicou e o portal ainda mostra como não lidos (como a aba Não lidos do portal)
      const docsCard = () => {
        const D = S.plat.docs; S.plat.docsHojeLista = [];
        if (!D?.disponivel) return '';
        const nl = (D.itens || []).filter(x => x.lido === false);
        S.plat.docsHojeLista = nl.slice(0, 5);
        const linhas = S.plat.docsHojeLista.map((x, n) => { const [cls, rot] = tipoArquivo(x.arquivo || x.nome || 'x.pdf'); return `<div class="dn-li" data-dn-abrir="${n}"><span class="arq-ext ext-${cls}">${rot}</span><div class="main"><b title="${esc(x.nome)}">${esc(x.nome)}</b><small>${esc(x.pasta || x.categoria || 'Documento')}</small><small class="mono">${esc([x.data, x.vencimento && `vence ${x.vencimento}`].filter(Boolean).join(' · '))}</small></div><button type="button" class="btn btn-sm dn-bx" data-dn="${n}" title="${D.baixar === false ? 'Abrir no portal' : 'Baixar'}" aria-label="Baixar ${esc(x.nome)}">${icon(D.baixar === false ? 'external' : 'download', 'ic-sm')}</button></div>`; }).join('');
        return `<section class="pn-card hj-docs" id="eq-docs"><div class="pn-card-head"><h3>Documentos novos <span class="eq-n">${nl.length}</span></h3><small>Publicados pelo escritório e ainda não lidos no portal.</small></div><div class="pn-card-body eq-body">${linhas || `<div class="pn-vazio">${icon('check', 'ic-sm')} Nenhum documento novo.</div>`}${nl.length > S.plat.docsHojeLista.length ? `<button type="button" class="btn btn-sm btn-ghost dn-todos" id="dn-todos">Ver os ${nl.length} não lidos ${icon('right', 'ic-sm')}</button>` : ''}</div></section>`;
      };
      return `<div class="hj-equipe">
        ${docsCard()}
        ${folhaCard()}
        ${term.length ? card('eq-terminar', 'Para terminar', 'Pedidos começados e não enviados (7 dias, neste computador).', term, '') : ''}
        ${card('eq-legais', 'Prazos legais', 'Pagamento dos cálculos em aberto e eSocial das admissões.', leg, lido ? 'Nenhum prazo legal perto.' : 'Lendo o portal…')}
        ${card('eq-avisos', 'Aviso sem cálculo', 'Férias e rescisões perto do pagamento com só o aviso no portal.', avs, lido ? 'Nenhum aviso esperando o cálculo.' : 'Lendo o portal…')}
        ${card('eq-exp', 'Experiência vencendo', 'Próximos 30 dias, pela data de admissão.', exp, 'Nenhuma experiência vencendo.')}
        ${card('eq-ferias', 'Férias a vencer', 'Prazo para conceder em até 60 dias (estimativa: o portal não informa as férias já tiradas).', fer, 'Nenhuma férias a vencer.')}
      </div>`;
    }
    // Atenção nas suas solicitações (casos do Control Onvio na visão do cliente)
    function casosHtml() {
      if (!casos.length) return '';
      return `<section class="pn-card hj-casos"><div class="pn-card-head"><h3>Atenção nas suas solicitações <span class="eq-n">${casos.length}</span></h3><small>O que pode atrasar o atendimento, lido nas conversas e nos pedidos.</small></div>
        <div class="pn-card-body eq-body"><div class="eq-lista">${casos.map(c => {
          const i = c.item;
          const acao = c.tipo === 'abaErrada' ? { rotulo: `Pedir em ${S.rules.tipos[c.aba]?.nome || 'outra aba'}`, fn: () => P.novoPedido(c.aba) }
            : c.tipo === 'duplicada' ? { rotulo: `Ver a nº ${c.outra.numero}`, fn: () => abrirDetalhe(c.outra) }
            : { rotulo: 'Anexar no portal', fn: () => request({ type: 'abrirNoPortal', slug: S.rules.tipos[i.tipo]?.slug, numero: i.numero }, 30000) };
          acoesEq.push({ acao: acao.fn, abrir: () => abrirDetalhe(i) });
          const n = acoesEq.length - 1;
          return `<div class="pn-li eq-li caso-${c.tipo}" data-eq-abrir="${n}"><span class="pill pill-${c.tipo === 'anexo' ? 'late' : 'today'}">${ROT_CASO[c.tipo]}</span><div class="main"><b>${esc([i.numero && `nº ${i.numero}`, i.assunto || nomeTipo(i.tipo)].filter(Boolean).join(' · '))}</b><small>${esc(c.porque)}</small></div><div class="eq-acoes"><button type="button" class="btn btn-sm" data-eq="${n}">${esc(acao.rotulo)}</button></div></div>`;
        }).join('')}</div></div></section>`;
    }

    // ---------- interações ----------
    viewEl.querySelectorAll('[data-eq]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); acoesEq[+b.dataset.eq]?.acao?.(); }));
    const irDocsNovos = () => { S.plat.docAba = 'escritorio'; S.plat.filtroPub = { q: '', cat: '', nl: true }; A.setView('documentos'); };
    viewEl.querySelectorAll('[data-dn]').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const x = S.plat.docsHojeLista?.[+b.dataset.dn]; if (!x) return;
      if (S.plat.docs?.baixar === false) { request({ type: 'abrirNoPortal', area: 'documentos' }, 30000); return; }
      b.disabled = true; const r = await P.baixarDoEscritorio(x); b.disabled = false;
      if (!r.ok) { toast(`Não consegui baixar: ${r.motivo}. Você pode abrir no portal.`); return; }
      P.entregarArquivo(r.arquivo.buf, r.arquivo.name || x.nome, r.arquivo.type);
    }));
    viewEl.querySelectorAll('[data-dn-abrir]').forEach(b => b.addEventListener('click', irDocsNovos));
    $('#dn-todos')?.addEventListener('click', irDocsNovos);
    viewEl.querySelectorAll('[data-eq-abrir]').forEach(b => b.addEventListener('click', () => acoesEq[+b.dataset.eqAbrir]?.abrir?.()));
    viewEl.querySelectorAll('[data-passo]').forEach(b => b.addEventListener('click', () => passosHtml.acoes[+b.dataset.passo]?.()));
    viewEl.querySelectorAll('[data-slide]').forEach(b => b.addEventListener('click', () => slidesDoCarrossel.ultimo[+b.dataset.slide]?.fn()));
    // a rosca leva às Solicitações já filtradas por aquela situação (como no Control Onvio)
    viewEl.querySelectorAll('.an-f[data-motivo]').forEach(b => b.addEventListener('click', () => { Object.assign(S.plat.filtroSol, { motivo: b.dataset.motivo, tipo: '', q: '' }); A.setView('pendencias'); }));
    $('#hj-lembrete').addEventListener('click', () => editarLembrete(null, E.iso(E.today())));
    // a planilha solta no cartão da folha abre o lançamento já com ela
    const fd = $('#eq-folha');
    if (fd && folha) {
      fd.addEventListener('dragover', (e) => { e.preventDefault(); fd.classList.add('over'); });
      fd.addEventListener('dragleave', () => fd.classList.remove('over'));
      fd.addEventListener('drop', (e) => { e.preventDefault(); fd.classList.remove('over'); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) prepararFolha(folha, fs); });
    }
    $('#hj-tentar')?.addEventListener('click', () => { S.plat.sol = null; renderPainel(); P.carregarSolicitacoes(true); });
    ligarSeletorEmpresa(viewEl);
    ligarDicas(viewEl);
    if (animar) { viewEl.classList.remove('hj-anim'); void viewEl.offsetWidth; viewEl.classList.add('hj-anim'); setTimeout(() => viewEl.classList.remove('hj-anim'), 1600); animarNumeros(viewEl); }
    iniciarCarrossel($('#hj-tick'));
    P.renderProximo($('#proximo'));
    marcarRolagem($('#hj-passos'));
    viewEl.querySelectorAll('.eq-lista').forEach(l => { limitarCinco(l); marcarRolagem(l); });   // até 5 itens à vista; o resto rola

    ligarIr(viewEl);
    A.renderLote(); A.renderAvisosInicio();   // o cartão do documento/texto fica no Novo pedido (mostrarSugestao)
  }
  // Carrossel: um aviso por vez. A barra invisível é o relógio (5 s por volta); passar o mouse ou focar pausa.
  function iniciarCarrossel(raiz) {
    if (!raiz) return;
    const sl = [...raiz.querySelectorAll('.hj-tk')];
    if (sl.length < 2) return;
    const ir = () => {
      const at = sl.findIndex(x => x.classList.contains('on')), prox = (at + 1) % sl.length;
      sl.forEach((x, n) => { x.classList.toggle('on', n === prox); x.classList.toggle('sai', n === at); x.tabIndex = n === prox ? 0 : -1; x.setAttribute('aria-hidden', String(n !== prox)); });
    };
    raiz.querySelector('.hj-tick-relogio i').addEventListener('animationiteration', () => { if (!document.hidden && raiz.isConnected) ir(); });
  }
  // Listas da Equipe e dos casos: a altura vai até o fim do 5º item (as linhas mudam de altura conforme a largura do cartão).
  function limitarCinco(lst) {
    const ajusta = () => {
      const quinto = lst.children[4];
      lst.style.maxHeight = lst.children.length > 5 && quinto ? `${Math.ceil(quinto.getBoundingClientRect().bottom - lst.getBoundingClientRect().top + lst.scrollTop) + 2}px` : '';
    };
    ajusta();
    const ro = new ResizeObserver(() => { if (lst.isConnected) ajusta(); else ro.disconnect(); });
    ro.observe(lst.parentElement);
    new MutationObserver(ajusta).observe(lst, { childList: true });
  }
  // Próximos passos: o esmaecido embaixo só aparece quando a lista passa da caixa.
  function marcarRolagem(lst) {
    if (!lst) return;
    // medido pela própria lista (offsetTop contava a altura de tudo acima dela e esmaecia mesmo com um item só)
    const marca = () => {
      const passa = lst.scrollHeight - lst.clientHeight > 2;
      lst.classList.toggle('rola', passa);
      lst.classList.toggle('fim', !passa || lst.scrollTop + lst.clientHeight >= lst.scrollHeight - 2);
    };
    marca(); lst.addEventListener('scroll', marca, { passive: true });
    const ro = new ResizeObserver(() => { if (lst.isConnected) marca(); else ro.disconnect(); });
    ro.observe(lst);
  }
  function ligarIr(root) {
    root.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.sit) S.plat.filtroEmp.sit = b.dataset.sit;
      A.setView(b.dataset.ir);
    }));
  }
  Object.assign(C, { ICONE_MOT, MOT, acoesExperiencia, gravarPref, lerPref, ligarIr, pedirCalculoDoAviso, pedirDeNovo, plural, prepararResposta, programarFerias, renderPainel });
}
