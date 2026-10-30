/* Assistente do Portal do Cliente — conteúdo: Conferência antes de enviar, arrastar e soltar, mudanças de rota, regras e partida.
 * Parte de content/ (dividido na 2.17.0; mapa em docs/arquitetura.md). Script comum: compartilha o escopo do mundo isolado
 * com os outros arquivos de content/ (a ordem de carga está no manifest e no simulador). */
/* ============ Conferência antes de enviar ============ */
function submitButton() {
  const r = routeInfo(); if (r.mode !== 'form') return null;
  // as telas usam classes diferentes (form__buttons--add, btn-primary…): o texto é o que é estável
  return [...mainEl().querySelectorAll('button')].find(b => /^(ADICIONAR|SALVAR E ENVIAR(\s+PARA\s+(O\s+)?ESCRIT[ÓO]RIO)?)$/i.test(b.innerText.trim()) && !b.closest('bento-toolbar'));
}
/** Depois de confirmar: se o portal recusou, a tela continua no mesmo formulário. */
let envioVigiado = null;
function vigiarEnvio() {
  const onde = currentPath();
  clearTimeout(envioVigiado);
  envioVigiado = setTimeout(() => {
    // o portal recusou: leva junto o que ele marcou como inválido (só rótulo e mensagem curta)
    if (currentPath() === onde && submitButton()) post({ type: 'envioNaoConcluido', erros: errosDoPortal(tipoBySlug(routeInfo().slug)) });
  }, 4500);
}

// A conferência é a trava principal do projeto: só sai do caminho se a regra disser
// explicitamente que não quer (sem regra carregada, ela continua valendo).
document.addEventListener('click', (ev) => {
  if (bypassGuard || rules?.config?.confirmarAntesDeEnviar === false) return;
  const btn = ev.target.closest?.('button');
  if (!btn || btn !== submitButton()) return;
  if (!port) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  setPanel(true);
  const r = routeInfo();
  post({ type: 'submitAttempt', tipo: tipoBySlug(r.slug), form: snapshot(tipoBySlug(r.slug)) });
}, true);

// Enter dentro do formulário também envia: passa pela mesma conferência
document.addEventListener('submit', (ev) => {
  if (bypassGuard || rules?.config?.confirmarAntesDeEnviar === false || !port) return;
  const form = ev.target; const btn = submitButton();
  if (!btn || !mainEl().contains(form) || !form.contains(btn)) return;
  if (ev.submitter && ev.submitter !== btn) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  setPanel(true);
  const r = routeInfo();
  post({ type: 'submitAttempt', tipo: tipoBySlug(r.slug), form: snapshot(tipoBySlug(r.slug)) });
}, true);

/* ============ Arrastar e soltar em qualquer lugar ============ */
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
const overNativeZone = (e) => !!e.target?.closest?.('bento-file-selector, cc-sr-file-selector');
window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; dragDepth++; if (!overNativeZone(e)) dropEl.classList.add('on'); }, true);
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropEl.classList.remove('on'); }, true);
dropEl.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
dropEl.addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; dropEl.classList.remove('on');
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  setPanel(true);
  const send = () => sendFiles(files, 'arrastar');
  if (port) send(); else setTimeout(send, 700);
});
window.addEventListener('drop', () => { dragDepth = 0; dropEl.classList.remove('on'); }, true);

// arquivos anexados direto no portal → o assistente também lê (para checar e sugerir)
document.addEventListener('change', (e) => {
  const inp = e.target;
  if (!(inp instanceof HTMLInputElement) || inp.type !== 'file' || inp.__ctOwn || !inp.files?.length) return;
  if (!mainEl().contains(inp)) return;
  sendFiles([...inp.files], 'portal');
}, true);

// o cliente mexeu num campo do portal → o painel acompanha (assunto/descrição se atualizam)
let editTimer = null;
const aoEditar = (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || el.type === 'file' || !mainEl().contains(el)) return;
  clearTimeout(editTimer); editTimer = setTimeout(sendContext, 450);
};
document.addEventListener('change', aoEditar, true);
document.addEventListener('focusout', aoEditar, true);

/* ============ Mudanças de rota ============ */
let routeTimer = null;
let ultimoForm = '';   // último /add visto (prev se perde quando há rota intermediária)
const routeChanged = () => {
  const href = currentPath();
  if (href === lastHref) return;
  if (navInterna) { lastHref = href; return; }
  const prev = lastHref; lastHref = href;
  // saiu do formulário: o desfazer daquela tela não vale mais (cancelar, enviar, lote)
  if (prev.includes('/add') && !href.includes('/add')) {
    for (let i = desfazerPilha.length - 1; i >= 0; i--) if (desfazerPilha[i].path === prev) desfazerPilha.splice(i, 1);
  }
  if (prev.includes('/add')) ultimoForm = prev;
  clearTimeout(routeTimer);
  routeTimer = setTimeout(() => {
    const r = routeInfo();
    // formulário fechou e voltou à lista → provável envio concluído
    if (ultimoForm && !href.includes('/add') && r.mode === 'list') { post({ type: 'formClosed', from: ultimoForm, to: href }); ultimoForm = ''; }
    sendContext(); atualizarLauncher(); avisarDesfazer(); atualizarGrade();
  }, 600);
};
setInterval(routeChanged, 500);
let formTimer = null;
new MutationObserver(() => { clearTimeout(formTimer); formTimer = setTimeout(() => { sendContext(); verAtencao(); atualizarGrade(); }, 700); })
  .observe(document.documentElement, { childList: true, subtree: true });

/* ============ Regras e mensagens do service worker ============ */
async function loadRules() {
  try { const r = await chrome.runtime.sendMessage({ type: 'getRules' }); rules = r?.rules || rules; } catch { /* extensão recarregada */ }
}
chrome.runtime.onMessage.addListener((m) => {
  if (m.type === 'togglePanel') setPanel(modo === 'fechado');
  if (m.type === 'rulesUpdated') { rules = m.rules; post({ type: 'rulesUpdated' }); sendContext(); }
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dropEl.classList.contains('on')) { dropEl.classList.remove('on'); dragDepth = 0; } });
window.addEventListener('resize', () => document.documentElement.classList.toggle('ct-docked', modo === 'painel' && innerWidth >= 1000));

/** Modo ao abrir o portal: plataforma (padrão) ou só o botão, se o cliente preferir o painel encaixado. */
async function modoInicial() {
  if (plat.modoInicial) return plat.modoInicial();
  try { const { prefs } = await chrome.storage.local.get('prefs'); return prefs?.abrirComo === 'painel' ? 'painel' : 'plataforma'; } catch { return 'plataforma'; }
}
estadoAcesso();
Promise.all([loadRules(), modoInicial()]).then(([, inicial]) => {
  lastHref = currentPath(); ensureFrame(); atualizarLauncher();
  modoAberto = inicial;
  if (inicial === 'plataforma') setModo('plataforma');
  // ganchos para o simulador (soltar exemplos, abrir o painel, trocar o modo)
  plat.expose?.({ openPanel: () => setPanel(true), modo: (m) => setModo(m), modoAtual: () => modo, sendFiles: async (files) => { setPanel(true); const go = () => sendFiles(files, 'arrastar'); if (port) go(); else setTimeout(go, 800); },
    // testes do simulador: o mesmo preenchimento que o painel pede (nunca envia)
    preencher: (tipo, values, opts) => comboLock(() => fillForm(tipo, values || {}, [], opts || {})),
    // testes do simulador: a grade lida pela posição na tela (grade em blocos, como a do portal real)
    grade: { ler: () => { atualizarGrade(); const g = lerGradeDiv(); return g && { titulos: g.titulos, empregados: g.empregados }; }, escrever: (c) => preencherGrade(c) } });
});
