/* Assistente do Portal do Cliente — conteúdo: Canal privado com o painel (MessageChannel) e troca de modo.
 * Parte de content/ (dividido na 2.17.0; mapa em docs/arquitetura.md). Script comum: compartilha o escopo do mundo isolado
 * com os outros arquivos de content/ (a ordem de carga está no manifest e no simulador). */
/* ============ Canal privado com o painel ============ */
function connectPort() {
  const ch = new MessageChannel();
  port = ch.port1;
  port.onmessage = (e) => onPanelMessage(e.data);
  iframe.contentWindow.postMessage({ type: 'ct-hello' }, EXT_ORIGIN, [ch.port2]);
  setTimeout(sendContext, 50);
}
const post = (msg, transfer) => port && port.postMessage(msg, transfer || []);
// Arquivos atravessam o canal como bytes (mais robusto que File entre processos)
const packFiles = async (files) => Promise.all([...files].map(async f => ({ name: f.name, type: f.type, lastModified: f.lastModified, buf: await f.arrayBuffer() })));
const unpackFiles = (list) => (list || []).map(p => p instanceof File ? p : new File([p.buf], p.name, { type: p.type || 'application/octet-stream', lastModified: p.lastModified || Date.now() }));
const sendFiles = async (files, origem) => { const packed = await packFiles(files); post({ type: 'files', files: packed, origem }, packed.map(p => p.buf)); };

async function onPanelMessage(m) {
  try {
    switch (m.type) {
      case 'close': setModo('fechado'); break;
      case 'modo': setModo(m.modo); break;
      case 'verPortal': setModo('fechado'); break;   // todo "Ver no portal" do painel: só a bolinha fica no canto
      case 'getContext': sendContext(); break;
      case 'navigate': while (navInterna) await sleep(150); await navigate(m.slug, m.add !== false); post({ type: 'navigated', id: m.id }); sendContext(); break;
      case 'trocarEmpresa': { const r = await trocarEmpresa(m.nome); post({ type: 'empresaTrocada', id: m.id, ...r }); sendContext(); break; }
      case 'fill': {
        preenchendoAgora = true;
        let r; try { r = await comboLock(() => fillForm(m.tipo, m.values || {}, unpackFiles(m.files), { ...(m.opts || {}), reqId: m.id })); } finally { preenchendoAgora = false; }
        if (modo === 'plataforma') iframe?.focus();   // o preenchimento foca campos do portal: devolve o teclado à plataforma
        post({ type: 'fillResult', id: m.id, ...r });
        sendContext(); avisarDesfazer();
        if (m.opts?.avisoDesfazer !== false && !m.opts?.semDesfazer && r.mudou) toast('Preenchido pelo Assistente. Confira antes de enviar.', 9000, { rotulo: '↶ Desfazer', fn: () => desfazer() });
        break;
      }
      case 'undo': { const r = await desfazer(); post({ type: 'undoResult', id: m.id, ...r }); break; }
      // grade do Lançamento de Rubricas (lote 6; a grade real não foi mapeada — a calibrar). Nunca envia.
      case 'lerGrade': post({ type: 'grade', id: m.id, ...(await comboLock(() => lerGrade(!!m.adicionar))) }); break;
      case 'preencherGrade': {
        preenchendoAgora = true;
        let r; try { r = await comboLock(() => preencherGrade(m.celulas || [])); } finally { preenchendoAgora = false; }
        if (modo === 'plataforma') iframe?.focus();
        post({ type: 'gradePreenchida', id: m.id, ...r });
        sendContext(); avisarDesfazer();
        if (r.mudou && !m.silencioso) toast('Grade preenchida pelo Assistente. Confira antes de enviar.', 9000, { rotulo: '↶ Desfazer', fn: () => desfazer() });   // silencioso: a planilha da plataforma lança célula a célula
        break;
      }
      case 'attach': { const a = await attachFiles(unpackFiles(m.files)); post({ type: 'attachResult', id: m.id, n: a.n, anexos: a }); sendContext(); break; }
      case 'getOptions': {
        const opts = await comboLock(() => comboOptions(m.locator, m.force));
        if (modo === 'plataforma') iframe?.focus();
        post({ type: 'options', id: m.id, options: opts, virtual: !!opts.virtual });
        break;
      }
      case 'empregadoDetalhe': {   // ficha do funcionário: o registro que o portal já leu (nada é gravado)
        if (!employeesRaw.has(companyName())) { employeesCache.clear(); await employeeNames(); }
        const alvo = norm(m.nome);
        post({ type: 'empregadoDetalhe', id: m.id, dados: (employeesRaw.get(companyName()) || []).find(e => norm(e?.name) === alvo) || null });
        break;
      }
      case 'empregadoPorCpf': {   // de quem são estes CPFs? Só o nome volta: a lista com os CPFs não sai da aba
        if (!employeesRaw.has(companyName())) { employeesCache.clear(); await employeeNames(); }
        const raw = employeesRaw.get(companyName()) || [];
        // a calibrar no Onvio real: o nome e o formato (com ou sem máscara) do CPF na lista de empregados
        const cpfDe = (e) => String(e?.cpf ?? e?.cpfNumber ?? e?.nationalIdentity ?? e?.taxId ?? e?.personalIdentity ?? '').replace(/\D/g, '');
        const porCpf = new Map(raw.map(e => [cpfDe(e), String(e?.name || '').trim()]).filter(([c, n]) => c.length === 11 && n));
        post({ type: 'empregadoPorCpf', id: m.id, listaTemCpf: porCpf.size > 0, achados: (m.cpfs || []).map(c => String(c).replace(/\D/g, '')).filter(c => porCpf.has(c)).map(c => ({ cpf: c, nome: porCpf.get(c) })) });
        break;
      }
      case 'employees': {
        let names = await employeeNames();
        if (!names.length && m.aquecer && await aquecerEmpregados()) names = await employeeNames();
        post({ type: 'employees', id: m.id, names, detalhes: employeesInfo.get(companyName()) || [] });
        break;
      }
      case 'highlight': flash(findField(m.locator)); break;
      case 'markMissing': markMissing(m.campos || []); break;
      // "Conferir e enviar": nunca clica no portal — manda o resumo ao painel, aconteça o que
      // acontecer com as regras. Só o confirmSubmit (clique do cliente) aciona o botão do portal.
      case 'requestSubmit': {
        const b = submitButton();
        if (!b) { toast('Abra o formulário da solicitação para enviar.'); break; }
        const r = routeInfo();
        setPanel(true);
        post({ type: 'submitAttempt', pedido: true, tipo: tipoBySlug(r.slug), form: snapshot(tipoBySlug(r.slug)) });
        break;
      }
      case 'confirmSubmit': {
        bypassGuard = true;
        const btn = submitButton();
        if (btn) btn.click();
        setTimeout(() => { bypassGuard = false; }, 1500);
        vigiarEnvio();
        break;
      }
      case 'pendencias': post({ type: 'pendencias', id: m.id, data: await fetchPendencias(m.tipos) }); break;
      // plataforma: dados do portal lidos com a sessão do próprio cliente (nada sai do computador)
      case 'solicitacoes': post({ type: 'solicitacoes', id: m.id, data: await fetchSolicitacoes(m.tipos || [], m.maxPaginas) }); break;
      case 'tramites': post({ type: 'tramites', id: m.id, ...(await fetchTramites(m.base, m.solicitacao)) }); break;
      case 'datasAviso': post({ type: 'datasAviso', id: m.id, ...(await fetchDatasAviso(m.lista, m.solicitacao)) }); break;
      case 'detalheCompleto': post({ type: 'detalheCompleto', id: m.id, ...(await fetchDetalhe(m.lista, m.solicitacao)) }); break;
      case 'portalInfo': await estadoAcesso(); post({ type: 'portalInfo', id: m.id, empresa: companyName(), route: routeInfo(), temCliente: !!clientId(), documentos: !!plat.documentos, acesso: { visto: apiEstado.visto, nomes: apiEstado.nomes }, status: { ...ultimosStatus } }); break;
      case 'documentos': post({ type: 'documentos', id: m.id, ...(plat.documentos ? { disponivel: true, itens: await plat.documentos() } : await fetchDocumentos()) }); break;
      case 'baixarDocumento': {
        const real = plat.baixarDocumento ? { file: await plat.baixarDocumento(m.docId) } : await baixarDocumentoReal(m);
        const f = real.file;
        const packed = f ? (await packFiles([f]))[0] : null;
        post({ type: 'arquivo', id: m.id, arquivo: packed, motivo: real.motivo, forma: real.forma }, packed ? [packed.buf] : []);
        break;
      }
      case 'abrirNoPortal': { const ok = await abrirNoPortal(m); post({ type: 'abriuNoPortal', id: m.id, ok }); break; }
      case 'prepararResposta': post({ type: 'respostaPreparada', id: m.id, ...(await prepararResposta(m)) }); break;
      case 'respostaAbrir': post({ type: 'respostaAbriu', id: m.id, ...(await respostaAbrir(m)) }); break;
      case 'respostaTexto': post({ type: 'respostaEscrita', id: m.id, ...respostaTexto(m) }); break;
      case 'respostaArquivos': post({ type: 'respostaAnexada', id: m.id, ...(await respostaArquivos(m)) }); break;
      case 'respostaEnviar': post({ type: 'respostaEnviada', id: m.id, ...(await respostaEnviar(m)) }); break;
      case 'respostaLimpar': post({ type: 'respostaLimpa', id: m.id, ...respostaLimpar() }); break;
      case 'setBadge': setBadge(m.n); break;
      // "Ver no portal" no aviso: o portal fica coberto pela plataforma, o botão mostra a página com o painel ao lado
      case 'toast': toast(m.text, m.ms || 2600, m.acao === 'verPortal' ? { rotulo: 'Ver no portal', fn: () => setModo('fechado') } : null); break;
      default: break;
    }
  } catch (err) {
    post({ type: 'error', id: m.id, message: String(err?.message || err) });
  }
}
