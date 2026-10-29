import { montarPlataforma } from './plataforma.js';
import { libsPresentes } from './extract.js';
import { $, P, S, debounce, definirPlat, esc, icon, packFiles, request, send, standalone, toast, viewEl } from './painel/base.js';
import { aplicarTamanhoTexto, loadPrefs, loadRules, ligar as ligarConexao } from './painel/conexao.js';
import { alternarTema, loadEmpregados, render, setView, syncThemeIcon, tipoDef, w, ligar as ligarModo } from './painel/modo.js';
import { ICONS, bindDrop, entenderTexto, handleFiles, openTipo, ligar as ligarInicio } from './painel/inicio.js';
import { abrirResumoSePronto, renderLote, renderSugestao } from './painel/lote.js';
import { admissaoDe, gerarTextos, valoresParaChecar } from './painel/valores.js';
import { renderFieldsOnly, renderPreencher } from './painel/preencher.js';
import { aplicarSugestoes, contextoModelo, fillPortal, gerarPeloModelo, maskInput } from './painel/formulario.js';
import { renderModelosInicio } from './painel/portal.js';
import { carregarHistorico, comecarDoZeroSeAbandonado, copiarDiagnostico, guardarEquipe, nomeCurto, renderAvisosInicio, renderFaq, renderRepetir, ligar as ligarFacilidades } from './painel/facilidades.js';
import { prazosDoHistorico } from './painel/historico.js';
import { mensagemAdmissao, renderConfig, renderFerramentas } from './painel/config.js';

/* Painel — orquestração. O código das telas fica em panel/painel/*.js (dividido na 2.16.4). */
ligarConexao();
ligarModo();
ligarInicio();
ligarFacilidades();

/* =================== Plataforma (2.0) =================== */
definirPlat(montarPlataforma({
  S, $, esc, icon, request, send, toast, viewEl, debounce, ICONS,
  setView, w, tipoDef, openTipo, entenderTexto, handleFiles, bindDrop, gerarTextos, loadEmpregados, fillPortal,
  renderPreencher, renderFerramentas, renderConfig, renderSugestao, renderLote, renderAvisosInicio, renderRepetir, renderModelosInicio, renderFaq,
  prazosDoHistorico, guardarEquipe, mensagemAdmissao, nomeCurto, alternarTema, maskInput, comecarDoZeroSeAbandonado, copiarDiagnostico,
  abrirResumoSePronto, aplicarSugestoes, admissaoDe, gerarPeloModelo, contextoModelo, valoresParaChecar, renderFieldsOnly, packFiles
}));

/* =================== Início =================== */
(async () => {
  syncThemeIcon();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeIcon);
  if (standalone) { $('#btn-close').hidden = true; document.body.style.maxWidth = '520px'; document.body.style.margin = '0 auto'; }
  await Promise.all([loadRules(), loadPrefs(), carregarHistorico()]);
  aplicarTamanhoTexto();
  if (!(await libsPresentes())) {
    const el = document.createElement('div'); el.className = 'note warn'; el.setAttribute('role', 'alert'); el.style.cssText = 'margin:8px 12px 0';
    el.innerHTML = `${icon('alert')}<div><b>Esta cópia da extensão está incompleta</b> (falta a pasta <code>lib</code>). O preenchimento funciona, mas PDFs, fotos e planilhas não serão lidos. Instale pelo .zip completo.</div>`;
    viewEl.parentElement.insertBefore(el, viewEl);
  }
  const hash = location.hash.slice(1);
  if (hash && ['config', 'ferramentas', 'historico'].includes(hash)) setView(hash); else render();
  if (S.modo === 'plataforma') P.entrou();
  if (!standalone) setTimeout(async () => {
    if (S.modo === 'plataforma') return;   /* a plataforma lê as solicitações por conta própria */
    const tipos = Object.entries(S.rules.tipos).filter(([, t]) => t.api).map(([key, t]) => ({ key, api: t.api })); const r = await request({ type: 'pendencias', tipos }, 30000); if (r?.data) { S.pend = r.data; const n = r.data.reduce((a, p) => a + (p.itens || []).filter(i => i.aguardando).length, 0); send({ type: 'setBadge', n }); const d = $('#dot-pend'); d.hidden = !n; d.textContent = n; } }, 2500);
})();
