/* Painel — Modo da tela (plataforma ou painel) e navegação entre abas. (parte de panel/panel.js, dividido na 2.16.4; mapa em docs/arquitetura.md). */
import * as E from '../engine.js';
import { $, P, S, icon, request, send, standalone, viewEl } from './base.js';
import { gravarRascunhos, guardarEquipe, rascunhoDe } from './facilidades.js';
import { renderConfig, renderFerramentas } from './config.js';
import { renderFieldsOnly, renderPreencher } from './preencher.js';
import { renderHistorico, renderPendencias } from './historico.js';
import { renderInicio } from './inicio.js';
import { renderLote } from './lote.js';

export const VIEWS_PAINEL = ['inicio', 'preencher', 'pendencias', 'ferramentas', 'historico', 'config'];

export function aplicarModo(modo) {
  if (!['plataforma', 'painel'].includes(modo) || modo === S.modo) return;   // 'fechado' mantém o último desenho
  S.modo = modo;
  const plat = modo === 'plataforma';
  document.body.classList.toggle('plat', plat);
  $('#plat').hidden = !plat;
  const app = $('.app');
  if (plat) $('#plat-body').appendChild(viewEl);
  else { app.insertBefore(viewEl, $('.foot')); viewEl.className = 'view'; }
  if (!plat && !VIEWS_PAINEL.includes(S.view)) S.view = 'inicio';
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === S.view)));
  if (plat) P?.entrou();
  render();
}

/** Guarda o que estava em andamento com o nome da empresa anterior e começa limpo: listas de
 *  empregados, valores lidos e lote não valem para outra empresa. */
export function trocouDeEmpresa(empresaAntes) {
  const troca = S.trocaPedida;          // troca pedida por nós (caixa "Para qual empresa?" ou botão da empresa no pedido)
  const manter = troca?.manter || null; // o pedido (tipo) que segue com o cliente para a empresa nova
  const pares = Object.entries(S.work).filter(([tipo, W]) => W && tipo !== manter).map(([tipo, W]) => ({ tipo, empresa: empresaAntes, dados: rascunhoDe(W) })).filter(x => x.dados);
  if (pares.length) gravarRascunhos(pares);
  const levado = manter ? S.work[manter] : null;
  S.work = {}; cargasEmpregados.clear(); S.sugestao = null; S.ultimoEnvio = null;
  if (levado) { S.work[manter] = levado; semDadosDaEmpresa(levado, troca); }
  if (S.lote && !S.lote.concluido) { S.lote.pausado = true; renderLote(); }
  S.pv.lastKey = '';
}

/** O que é de uma empresa não vale na outra: funcionário e listas (departamento, motivos…). O resto do pedido fica. */
export function semDadosDaEmpresa(W, troca) {
  W.empregados = []; W.opcoes = {}; W.candidatos = null; W.pacienteLido = null;
  if (!troca?.conservarEmpregado) { delete W.valores.empregado; W.editados.delete('empregado'); delete W.fonteVerdade?.empregado; }
  W.ultimoPreenchido = {}; W.portalVisto = null; W.desfeitos = null; W.resultados = null;
  for (const a of W.arquivos || []) a.anexado = false;   // o formulário da empresa nova está vazio: anexa de novo
  // com o foco num campo o formulário da plataforma não é redesenhado: o funcionário antigo ficaria na tela
  if (document.activeElement?.closest?.('#fields')) document.activeElement.blur();
}

/* A página continua com o script antigo quando a extensão é atualizada sem recarregar o portal:
   o painel novo conversa com "mãos" velhas e várias coisas falham. Avisa para recarregar. */
export function avisoVersao(versaoPagina) {
  if (standalone) return;
  const minha = chrome.runtime.getManifest?.().version;
  const velho = !!minha && versaoPagina !== minha && !String(versaoPagina || '').endsWith('-sim') && !location.search.includes('sim');
  let el = document.getElementById('aviso-versao');
  if (!velho) { el?.remove(); return; }
  if (el) return;
  el = document.createElement('div');
  el.id = 'aviso-versao'; el.className = 'note warn'; el.setAttribute('role', 'alert');
  el.style.cssText = 'margin:8px 12px 0';
  el.innerHTML = `${icon('alert')}<div><b>O Assistente foi atualizado.</b> Recarregue a página do portal (tecla F5) para usar a versão nova — sem isso, algumas funções podem não preencher.</div>`;
  viewEl.parentElement.insertBefore(el, viewEl);
}

export function w(tipo) {
  // fonteVerdade[k] = 'plataforma': o cliente escreveu no formulário da plataforma; vale mais que o portal até ser enviado
  // aproximadas[k] = { escolhida, pedido }: opção parecida escolhida na lista do portal (o cliente confere);
  // sugestoes[k] = opções para "Você quis dizer"; desfeitos[k] = o que o Desfazer tirou (volta no "Preencher no portal")
  if (!S.work[tipo]) S.work[tipo] = { valores: {}, arquivos: [], editados: new Set(), empregados: [], opcoes: {}, resultados: null, fonteVerdade: {}, aproximadas: {}, sugestoes: {}, desfeitos: null };
  return S.work[tipo];
}

export const tipoDef = (k) => E.resolveTipo(S.rules, k);

/** Definição de um campo: o das regras ou um campo do portal que as regras não conhecem ("extra:<formcontrolname>"). */
export function campoDef(tipo, k) {
  const t = tipoDef(tipo); if (t?.campos?.[k]) return t.campos[k];
  if (!String(k).startsWith('extra:')) return null;
  const x = S.ctx.tipo === tipo ? S.ctx.form?.extras?.[k] : null;
  return { fc: x?.fc || k.slice(6), tipo: x?.tipo || 'texto', rotulo: x?.rotulo || k.slice(6), grupo: 'Outros campos do portal', extra: true };
}

/** O que o portal mostra num campo (das regras ou fora delas). */
export const campoPortal = (k) => S.ctx.form?.campos?.[k] || S.ctx.form?.extras?.[k] || {};

export const rotuloDe = (tipo, k) => campoDef(tipo, k)?.rotulo || k;

export const msgAproximada = (a) => (S.rules.mensagens?.opcaoAproximada || 'Escolhi a mais parecida: {escolhida} (no documento: {pedido}) — confira').replace('{escolhida}', a.escolhida).replace('{pedido}', a.pedido);

/* Empregados: lista do combobox desta tela; se vier vazia, a lista completa da empresa (API do portal).
   Uma carga por vez por tipo, com novas tentativas enquanto o portal ainda carrega a lista. */
export const cargasEmpregados = new Map();

export const empregadosEmpresa = new Map();   // empresa → nomes (só na memória desta aba)

export const desligadosEmpresa = new Map();   // empresa → nomes dos desligados (só na memória; para conferir a planilha de rubricas)

export function loadEmpregados(tipo) {
  if (!cargasEmpregados.has(tipo)) cargasEmpregados.set(tipo, carregarEmpregados(tipo).finally(() => cargasEmpregados.delete(tipo)));
  return cargasEmpregados.get(tipo);
}

export async function carregarEmpregados(tipo) {
  const t = tipoDef(tipo); if (!t) return;
  const W = w(tipo);
  const combos = Object.entries(t.campos).filter(([, c]) => c.tipo === 'combo' && c.fc);
  const simples = !t.assistente;
  const naTela = S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo;
  for (const [k, c] of combos) {
    if (!simples && c.fonte !== 'empregado') continue;
    if (W.opcoes[k]?.length || !naTela) continue;
    for (let tent = 0; tent < 3; tent++) {
      const r = await request({ type: 'getOptions', locator: { fc: c.fc }, force: tent > 0 }, 6000);
      if (r?.options?.length) {
        W.opcoes[k] = r.options;
        if (c.fonte === 'empregado') {
          W.empregados = r.options;
          // lista da tela incompleta (virtualizada): completa com a lista da empresa
          if (r.virtual) { const todos = await empregadosDaEmpresa(); W.empregados = [...new Set([...r.options, ...todos])]; }
        }
        break;
      }
      if (c.fonte !== 'empregado') break;
      await new Promise(res => setTimeout(res, 700));
    }
  }
  if (t.campos.empregado && !W.empregados.length) W.empregados = await empregadosDaEmpresa();
  if (W.empregados.length && S.ctx.empresa) empregadosEmpresa.set(S.ctx.empresa, [...new Set([...(empregadosEmpresa.get(S.ctx.empresa) || []), ...W.empregados])]);
  if (S.view === 'preencher') renderFieldsOnly();
}

export async function empregadosDaEmpresa() {
  const conhecidos = empregadosEmpresa.get(S.ctx.empresa);
  if (conhecidos?.length) return conhecidos;
  const r = await request({ type: 'employees' }, 8000);
  if (r?.names?.length && S.ctx.empresa) empregadosEmpresa.set(S.ctx.empresa, r.names);
  if (r?.detalhes?.length && S.ctx.empresa) desligadosEmpresa.set(S.ctx.empresa, r.detalhes.filter(d => d.ativo === false).map(d => d.nome));
  if (r?.detalhes?.length && S.ctx.empresa) guardarEquipe(S.ctx.empresa, r.detalhes);
  return r?.names || [];
}

/** Lista para entender um texto: a da solicitação, se já carregada; senão, a da empresa. */
export async function empregadosPara(tipo) {
  const W = w(tipo);
  if (W.empregados.length) return W.empregados;
  return empregadosDaEmpresa();
}

export function setView(v) {
  if (S.modo !== 'plataforma' && !VIEWS_PAINEL.includes(v)) v = 'inicio';
  S.view = v;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  render();
  viewEl.scrollTop = 0;
}

export function alternarTema() {
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('ct-tema', next); } catch { /* sem armazenamento */ }
  syncThemeIcon();
}

export function syncThemeIcon() {
  const dark = (document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  $('#btn-theme').innerHTML = icon(dark ? 'sun' : 'moon');
}

export function render() {
  if (!S.rules) { viewEl.innerHTML = `<div class="empty"><div class="spin" style="margin:auto"></div><p>Carregando…</p></div>`; return; }
  if (S.modo === 'plataforma' && P) return P.render(S.view);
  ({ inicio: renderInicio, preencher: renderPreencher, pendencias: renderPendencias, ferramentas: renderFerramentas, historico: renderHistorico, config: renderConfig }[S.view] || renderInicio)();
}

/** Liga os ouvintes deste módulo (chamado uma vez por panel.js, na ordem de antes). */
export function ligar() {
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#btn-close').addEventListener('click', () => send({ type: 'close' }));
  $('#btn-config').addEventListener('click', () => setView('config'));
  $('#btn-theme').addEventListener('click', alternarTema);
  $('#btn-plat').addEventListener('click', () => send({ type: 'modo', modo: 'plataforma' }));
}
