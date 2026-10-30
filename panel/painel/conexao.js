/* Painel — Conexão com a página, regras, preferências e contexto. (parte de panel/panel.js, dividido na 2.16.4; mapa em docs/arquitetura.md). */
import * as E from '../engine.js';
import { $, DEFAULT_PREFS, P, S, progresso, send, waiters } from './base.js';
import { aoDesfazer, atualizarBotaoDesfazer, onEnvioNaoConcluido, onFormClosed, onSubmitAttempt, sincronizarDoPortal } from './portal.js';
import { aplicarModo, avisoVersao, loadEmpregados, render, setView, trocouDeEmpresa, w } from './modo.js';
import { avisarAtualizacao } from './config.js';
import { handleFiles, renderContextBanner } from './inicio.js';
import { renderAvisosInicio } from './facilidades.js';
import { renderFieldsOnlySeMudou } from './preencher.js';
import { renderFillResult, updateChecks } from './formulario.js';

export function onPage(m) {
  if (m.type === 'fillProgress') { progresso.get(m.id)?.(m); return; }
  if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); w(m); return; }
  switch (m.type) {
    case 'context': onContext(m); break;
    case 'files': handleFiles((m.files || []).map(p => p instanceof File ? p : new File([p.buf], p.name, { type: p.type || 'application/octet-stream', lastModified: p.lastModified })), m.origem); break;
    case 'submitAttempt': onSubmitAttempt(m); break;
    case 'formClosed': onFormClosed(m); break;
    case 'envioNaoConcluido': onEnvioNaoConcluido(m); break;
    case 'undoState': S.desfazerN = m.n || 0; atualizarBotaoDesfazer(); break;
    case 'undoStart': S.preenchendo = true; break;
    case 'undone': aoDesfazer(m); break;
    case 'rulesUpdated': loadRules().then(render); break;
    case 'modo': aplicarModo(m.modo); break;
    case 'portalAtencao': P?.atencao(m); break;
    default: break;
  }
}

export async function loadRules() {
  const pack = await chrome.runtime.sendMessage({ type: 'getRules' });
  S.rulesBase = pack.rules; S.meta = pack;
  S.rules = regrasDaEmpresa(S.rulesBase, S.ctx.empresa);
  $('#rules-ver').textContent = `regras ${pack.versao}${pack.origem === 'dev' ? ' · dev' : ''}`;
}

export async function loadPrefs() {
  const { prefs } = await chrome.storage.local.get('prefs');
  S.prefs = { ...DEFAULT_PREFS, ...(prefs || {}) };
  chrome.runtime.sendMessage({ type: 'manutencao' }).then(avisarAtualizacao).catch(() => {});   // versão nova da extensão? (aviso único por versão)
}

export const savePrefs = () => chrome.storage.local.set({ prefs: S.prefs });

/** Ajustes por empresa (regras.empresas: { "trecho do nome": { config: {…}, avisos: […] } }). */
export function regrasDaEmpresa(base, empresa) {
  if (!base) return base;
  const E1 = E.norm(empresa);
  const ent = E1 && Object.entries(base.empresas || {}).find(([k]) => k && E1.includes(E.norm(k)));
  if (!ent) return base;
  const aj = ent[1] || {};
  return { ...base, config: { ...(base.config || {}), ...(aj.config || {}) }, avisosEscritorio: [...(base.avisosEscritorio || []), ...(aj.avisos || [])], empresaAjustada: ent[0] };
}

export function aplicarTamanhoTexto() {
  const z = { normal: '', grande: '1.12', maior: '1.25' }[S.prefs.tamanhoTexto] || '';
  document.documentElement.style.zoom = z;
}

export function onContext(m) {
  avisoVersao(m.versao);
  aplicarModo(m.modo);
  const prevTipo = S.ctx.tipo, prevMode = S.ctx.route?.mode;
  const empresaAntes = S.ctx.empresa;
  S.ctx = { route: m.route || {}, tipo: m.tipo, empresa: m.empresa || '', form: m.form, grade: m.grade || null };
  $('#empresa').textContent = S.ctx.empresa || 'Portal do Cliente';
  if (S.ctx.empresa !== empresaAntes && S.rulesBase) { S.rules = regrasDaEmpresa(S.rulesBase, S.ctx.empresa); if (S.view === 'inicio') renderAvisosInicio(); }
  // trocou de empresa sem recarregar: o que estava em andamento é da empresa anterior
  if (empresaAntes && S.ctx.empresa && S.ctx.empresa !== empresaAntes) trocouDeEmpresa(empresaAntes);
  P?.aoContexto(!!(S.ctx.empresa && S.ctx.empresa !== empresaAntes));
  const key = `${m.route?.path}|${m.tipo}`;
  if (m.route?.mode === 'form' && m.tipo) {
    const W0 = w(m.tipo);
    if (key !== S.pv.lastKey) {
      // entrou num formulário novo com dados de uma tentativa anterior (saiu sem enviar)? oferece continuar
      const peloAssistente = S.abrindo === m.tipo; S.abrindo = null;
      W0.entrouComDados = !peloAssistente && (Object.values(W0.valores).some(v => v?.valor && v.fonte !== 'gerado') || W0.arquivos.some(a => !a.removido));
      if (!peloAssistente) W0.rascunhoVisto = false;
      W0.ultimoPreenchido = {}; W0.portalVisto = null;     // formulário novo: nada dele foi preenchido ainda
      loadEmpregados(m.tipo); if (S.view === 'inicio' && !S.sugestao) setView('preencher');
    }
  }
  S.pv.lastKey = key;
  $('#dot-preencher').hidden = !(m.route?.mode === 'form');
  if (m.route?.mode === 'form' && m.tipo && !S.preenchendo) sincronizarDoPortal(m.tipo);
  if (S.view === 'preencher' && (prevTipo !== m.tipo || prevMode !== m.route?.mode)) render();
  else if (S.view === 'preencher') { updateChecks(); renderFieldsOnlySeMudou(); renderFillResult(); }
  else if (S.view === 'inicio') renderContextBanner();
}

/** Liga os ouvintes deste módulo (chamado uma vez por panel.js, na ordem de antes). */
export function ligar() {
  window.addEventListener('message', (e) => {
    // origem do portal (extensão) ou do próprio simulador (mesma origem do painel)
    if (!['https://onvio.com.br', location.origin].includes(e.origin) || e.data?.type !== 'ct-hello' || !e.ports?.[0]) return;
    S.port = e.ports[0];
    S.port.onmessage = (ev) => onPage(ev.data);
    send({ type: 'getContext' });
  });
  chrome.runtime.onMessage.addListener((m) => { if (m.type === 'rulesUpdated') { loadRules().then(render); } if (m.type === 'manutencao') avisarAtualizacao(m.info); });
}
