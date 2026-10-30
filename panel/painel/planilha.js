/* Painel — Planilha de rubricas dentro da plataforma (2.20.0).
 * A grade do Lançamento de Rubricas do portal (funcionários nas linhas, um evento por coluna) numa planilha própria, grande,
 * com o nome e os títulos fixos: o cliente digita aqui e eu lanço célula a célula na grade do portal (por baixo, como no
 * formulário próprio). Nada é enviado: o envio é só pelo botão do portal, depois do resumo. Os valores ficam só na memória. */
import * as E from '../engine.js';
import { $, S, esc, icon, request } from './base.js';
import { tipoDef, w } from './modo.js';
import { enviarPendenteAgora, fillPortal, valorPlat } from './formulario.js';

const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const chave = (i, j) => `${i}|${j}`;
const estado = (tipo) => (w(tipo).planilha ||= { carregada: false, lendo: false, erro: '', eventos: [], empregados: [], valores: {}, pend: new Set(), filtro: '', status: '', timer: null, comando: '', cmdMsg: '', cmdBusy: false });

/** Só na plataforma (no painel encaixado o portal é a própria planilha) e só no Lançamento de Rubricas. */
const ativa = (tipo) => tipo === 'rubricas' && S.modo === 'plataforma' && tipoDef(tipo)?.grade?.ativo !== false;

function contarValores(P) { return Object.values(P.valores).filter(v => String(v).trim()).length; }

function statusHtml(P) {
  const t = P.status || (P.pend.size ? 'Lançando na grade do portal…' : '');
  return t ? esc(t) : '';
}

/** O bloco "Comando": o cliente escreve o que quer lançar e a planilha é preenchida sozinha (abre a grade do portal, se preciso). */
function blocoComando(P, noForm) {
  return `<div class="plan-cmd">
    <label for="plan-cmd-txt"><b>${icon('spark', 'ic-sm')} Comando</b> <span class="muted">— escreva o que lançar e eu preencho a planilha</span></label>
    <div class="plan-cmd-linha"><textarea id="plan-cmd-txt" rows="2" placeholder="Ex.: Agnaldo 10 horas extras, Ana Carolina prêmio 200, Artur 2 faltas, mês passado" autocomplete="off"${P.cmdBusy ? ' disabled' : ''}>${esc(P.comando)}</textarea>
      <button type="button" class="btn btn-primary" id="plan-cmd-go"${P.cmdBusy || !noForm ? ' disabled' : ''}>${P.cmdBusy ? 'Preenchendo…' : 'Preencher a planilha'}</button></div>
    <div class="plan-cmd-res" id="plan-cmd-res" role="status">${P.cmdMsg || (noForm ? '<span class="muted">Se a planilha do portal ainda não estiver aberta, eu abro e carrego sozinha. Nada é enviado: o envio é pelo botão do portal, depois do resumo.</span>' : '<span class="muted">Abra o Lançamento de Rubricas para usar o comando.</span>')}</div></div>`;
}
function ligarComando(tipo) {
  $('#plan-cmd-go')?.addEventListener('click', () => executarComando(tipo));
  $('#plan-cmd-txt')?.addEventListener('input', (e) => { estado(tipo).comando = e.target.value; });
  $('#plan-cmd-txt')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); executarComando(tipo); } });
}
const resumoComando = (r, nCelulas) => {
  const li = [];
  if (nCelulas) li.push(`<li><b>Preenchi ${nCelulas} valor(es)</b> na planilha${r.celulas.length > nCelulas ? '' : ''}: ${r.celulas.slice(0, 8).map(c => `${esc(c.empregado)} — ${esc(c.rubrica || c.evento)}: ${esc(c.valor)}`).join('; ')}${r.celulas.length > 8 ? ` e mais ${r.celulas.length - 8}` : ''}. Confira e ajuste na planilha se precisar.</li>`);
  if (r.naoEntendidas.length) li.push(`<li>Não entendi: ${r.naoEntendidas.map(x => `«${esc(x)}»`).join(', ')}. Escreva com o nome do funcionário, a rubrica e o valor.</li>`);
  if (r.semEvento.length) li.push(`<li>Esta rubrica não existe na grade desta empresa: ${r.semEvento.map(esc).join(', ')}. Lance direto no portal, se for o caso.</li>`);
  if (r.semEmpregado.length) li.push(`<li>Não achei o funcionário em: ${r.semEmpregado.map(x => x === '?' ? 'uma frase sem nome' : esc(x)).join(', ')}. Escreva o nome como aparece na planilha.</li>`);
  if (!li.length) li.push('<li>Não entendi nenhum lançamento. Escreva, por exemplo: «Agnaldo 10 horas extras, Artur 2 faltas».</li>');
  return `<ul class="tips">${li.join('')}</ul>`;
};

export async function executarComando(tipo) {
  const P = estado(tipo), W = w(tipo);
  const texto = ($('#plan-cmd-txt')?.value ?? P.comando).trim(); P.comando = texto;
  if (!texto || P.cmdBusy) return;
  if (!(S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo)) return;
  P.cmdBusy = true; P.cmdMsg = '<span class="muted">Entendendo o comando…</span>'; renderPlanilhaRubricas(tipo);
  try {
    // a competência dita no comando ("mês passado") vai ao portal antes de abrir a grade: ele a exige para adicionar os funcionários
    const comp = E.competenciaDoTexto(texto, undefined, S.rules);
    if (comp && !P.carregada) {
      W.valores.competencia = { valor: comp, conf: 1, fonte: 'você' }; W.editados.add('competencia'); W.fonteVerdade.competencia = 'plataforma';
      await fillPortal(tipo, { daPlataforma: true, silencioso: true, so: ['competencia'] });
    }
    if (!P.carregada && !comp && !String(valorPlat(tipo, 'competencia') || '').trim()) {   // o portal só adiciona os funcionários com a competência preenchida
      P.cmdMsg = `<div class="note warn">${icon('alert')}<div>Falta a competência. Escreva no comando, por exemplo: «mês passado», «outubro de 2026» ou «10/2026».</div></div>`; return;
    }
    if (!P.carregada) {
      P.cmdMsg = '<span class="muted">Abrindo a planilha do portal e lendo os funcionários…</span>'; renderPlanilhaRubricas(tipo);
      await carregar(tipo);
      if (!P.carregada) { P.cmdMsg = `<div class="note warn">${icon('alert')}<div>${esc(P.erro || 'Não consegui abrir a planilha do portal.')}</div></div>`; return; }
    }
    const r = E.comandoRubricas(texto, P.eventos, P.empregados, S.rules);
    let n = 0;
    for (const c of r.celulas) {
      const i = P.empregados.indexOf(c.empregado), j = P.eventos.indexOf(c.evento); if (i < 0 || j < 0) continue;
      const k = chave(i, j); if ((P.valores[k] || '') === c.valor) continue;
      P.valores[k] = c.valor; P.pend.add(k); n++;
    }
    P.cmdMsg = resumoComando(r, n);
    if (n) agendar(tipo);
  } catch (e) {
    P.cmdMsg = `<div class="note warn">${icon('alert')}<div>Não consegui preencher agora: ${esc(String(e?.message || e).slice(0, 160))}</div></div>`;
  } finally { P.cmdBusy = false; renderPlanilhaRubricas(tipo); }
}

export function renderPlanilhaRubricas(tipo) {
  const el = $('#planilha-rub'); if (!el) return;
  if (!ativa(tipo)) { el.innerHTML = ''; return; }
  const P = estado(tipo);
  const noForm = S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo;
  const cab = `<div class="pn-card-head"><h3>${icon('sheet', 'ic-sm')} Planilha de rubricas</h3><small>Digite os valores aqui: eu lanço na grade do portal. Nada é enviado — o envio é pelo botão do portal, depois do resumo.</small></div>`;
  if (!P.carregada) {
    el.innerHTML = `<section class="pn-card plan-rub">${cab}<div class="pn-card-body">
      ${blocoComando(P, noForm)}
      <p class="muted" style="margin:0 0 8px">${P.erro ? esc(P.erro) : noForm ? 'Preencha a competência acima e carregue os funcionários e as rubricas da empresa.' : 'Abra o Lançamento de Rubricas para carregar a planilha.'}</p>
      <button type="button" class="btn btn-primary" id="plan-carregar"${P.lendo || !noForm ? ' disabled' : ''}>${P.lendo ? 'Abrindo a planilha do portal e lendo…' : 'Carregar funcionários e rubricas'}</button></div></section>`;
    $('#plan-carregar')?.addEventListener('click', () => carregar(tipo));
    ligarComando(tipo);
    return;
  }
  const f = E.norm(P.filtro);
  const linhas = P.empregados.map((emp, i) => `<tr data-i="${i}"${f && !E.norm(emp).includes(f) ? ' hidden' : ''}><th scope="row" class="plan-nome" title="${esc(emp)}">${esc(emp)}</th>${P.eventos.map((ev, j) => `<td><input type="text" inputmode="decimal" autocomplete="off" data-i="${i}" data-j="${j}" value="${esc(P.valores[chave(i, j)] || '')}" aria-label="${esc(ev)} — ${esc(emp)}"></td>`).join('')}</tr>`).join('');
  el.innerHTML = `<section class="pn-card plan-rub">${cab}<div class="pn-card-body">
    ${blocoComando(P, noForm)}
    <div class="plan-barra"><input type="search" id="plan-q" placeholder="Buscar funcionário…" value="${esc(P.filtro)}" autocomplete="off">
      <span class="muted" id="plan-n">${contarValores(P)} valor(es) · ${P.empregados.length} funcionário(s) · ${P.eventos.length} rubrica(s)</span><span class="spacer"></span>
      <span class="muted" id="plan-status" role="status">${statusHtml(P)}</span>
      <button type="button" class="btn btn-sm btn-ghost" id="plan-recarregar"${P.lendo || !noForm ? ' disabled' : ''}>${icon('refresh', 'ic-sm')} Recarregar do portal</button></div>
    <div class="plan-rolagem"><table class="plan-tabela"><thead><tr><th class="plan-nome">Funcionário</th>${P.eventos.map(ev => `<th title="${esc(ev)}">${esc(ev)}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>
    <p class="muted" style="margin:8px 0 0">Enter e as setas descem e sobem na coluna; você pode colar um bloco copiado do Excel. Os nomes e as rubricas são os do portal.</p></div></section>`;
  ligarComando(tipo);
  ligar(tipo, el);
}

function ligar(tipo, el) {
  const P = estado(tipo);
  $('#plan-recarregar')?.addEventListener('click', () => carregar(tipo));
  $('#plan-q')?.addEventListener('input', (e) => {
    P.filtro = e.target.value; const f = E.norm(P.filtro);
    el.querySelectorAll('tbody tr').forEach(tr => { tr.hidden = !!f && !E.norm(P.empregados[+tr.dataset.i]).includes(f); });
  });
  const tabela = el.querySelector('.plan-tabela'); if (!tabela) return;
  const celula = (i, j) => tabela.querySelector(`input[data-i="${i}"][data-j="${j}"]`);
  const gravar = (i, j, v) => {
    const k = chave(i, j), antes = P.valores[k] || '';
    const novo = String(v).trim();
    if (novo === antes) return;
    if (novo) P.valores[k] = novo; else delete P.valores[k];
    P.pend.add(k);
  };
  tabela.addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-i]'); if (!inp) return;
    gravar(+inp.dataset.i, +inp.dataset.j, inp.value);
    const n = $('#plan-n'); if (n) n.textContent = `${contarValores(P)} valor(es) · ${P.empregados.length} funcionário(s) · ${P.eventos.length} rubrica(s)`;
    agendar(tipo);
  });
  tabela.addEventListener('keydown', (e) => {
    const inp = e.target.closest('input[data-i]'); if (!inp || e.isComposing) return;
    const passo = e.key === 'Enter' ? (e.shiftKey ? -1 : 1) : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    let i = +inp.dataset.i + passo; const j = +inp.dataset.j;
    while (i >= 0 && i < P.empregados.length) { const alvo = celula(i, j); if (alvo && !alvo.closest('tr').hidden) { alvo.focus(); alvo.select(); return; } i += passo; }
  });
  tabela.addEventListener('paste', (e) => {
    const inp = e.target.closest('input[data-i]'); if (!inp) return;
    const t = e.clipboardData?.getData('text') || '';
    if (!/[\t\n]/.test(t.trim())) return;   // um valor só: cola normal
    e.preventDefault();
    const linhas = t.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(l => l.split('\t'));
    let i0 = +inp.dataset.i; const j0 = +inp.dataset.j;
    for (const cols of linhas) {
      while (i0 < P.empregados.length && celula(i0, j0)?.closest('tr').hidden) i0++;   // pula quem o filtro esconde
      if (i0 >= P.empregados.length) break;
      cols.forEach((v, d) => { const c = celula(i0, j0 + d); if (c) { c.value = v.trim(); gravar(i0, j0 + d, v); } });
      i0++;
    }
    const n = $('#plan-n'); if (n) n.textContent = `${contarValores(P)} valor(es) · ${P.empregados.length} funcionário(s) · ${P.eventos.length} rubrica(s)`;
    agendar(tipo);
  });
}

const agendar = (tipo) => { const P = estado(tipo); clearTimeout(P.timer); P.status = ''; marcar(tipo); P.timer = setTimeout(() => enviarCelulas(tipo), 700); };
function marcar(tipo) { const s = $('#plan-status'); if (s) s.textContent = statusHtml(estado(tipo)); }

/** As células digitadas desde a última vez vão para a grade do portal (só elas; nada que o cliente escreveu direto no portal é apagado). */
async function enviarCelulas(tipo) {
  const P = estado(tipo); if (!P.pend.size) return;
  if (!(S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo)) { P.status = 'Volte ao Lançamento de Rubricas no portal para lançar os valores.'; marcar(tipo); return; }
  for (let k = 0; k < 150 && S.preenchendo; k++) await esperar(200);   // um preenchimento em andamento termina antes
  const chaves = [...P.pend]; P.pend.clear();
  const celulas = chaves.map(k => { const [i, j] = k.split('|').map(Number); return { empregado: P.empregados[i], evento: P.eventos[j], valor: P.valores[k] ?? '' }; });
  S.preenchendo = true; let r = null;
  try { r = await request({ type: 'preencherGrade', celulas, silencioso: true }, 120000); } finally { S.preenchendo = false; }
  const falhas = r?.faltaram?.length || 0;
  P.status = !r ? 'O portal não respondeu. Tente de novo.' : falhas ? `${falhas} célula(s) não aceitaram o valor no portal.` : `Lançado na grade do portal às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
  if (!r) chaves.forEach(k => P.pend.add(k));
  marcar(tipo);
}

/** Lê funcionários e rubricas da grade do portal (clica em "Adicionar todos os funcionários" se preciso) e monta a planilha. */
export async function carregar(tipo) {
  const P = estado(tipo), W = w(tipo);
  if (!(S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo)) return;
  P.lendo = true; P.erro = ''; renderPlanilhaRubricas(tipo);
  for (let k = 0; k < 150 && S.preenchendo; k++) await esperar(200);
  await enviarPendenteAgora(tipo);   // a competência digitada aqui vai antes (o portal pede antes de adicionar os funcionários)
  S.preenchendo = true; let g = null;
  try { g = await request({ type: 'lerGrade', adicionar: true }, 60000); } finally { S.preenchendo = false; }
  P.lendo = false;
  if (!g?.ok) { P.erro = `Não consegui ler a grade do portal: ${g?.motivo || 'o portal não respondeu'}.`; renderPlanilhaRubricas(tipo); return; }
  const antes = { ...P.valores }, empAntes = P.empregados, evAntes = P.eventos;
  P.eventos = g.eventos || []; P.empregados = g.empregados || []; P.carregada = true; P.valores = {};
  // o que já estava digitado continua (pelo nome do funcionário e da rubrica); depois, o que veio de planilha, texto ou mês passado
  for (const [k, v] of Object.entries(antes)) {
    const [i, j] = k.split('|').map(Number);
    const a = P.empregados.findIndex(e => E.norm(e) === E.norm(empAntes[i])), b = P.eventos.findIndex(e => E.norm(e) === E.norm(evAntes[j]));
    if (a >= 0 && b >= 0) P.valores[chave(a, b)] = v;
  }
  if (W.linhasRubricas?.length) {
    const plano = E.montarGrade(W.linhasRubricas, P.eventos, P.empregados, S.rules);
    for (const c of plano.celulas) {
      const i = P.empregados.findIndex(e => E.norm(e) === E.norm(c.empregado)), j = P.eventos.findIndex(e => E.norm(e) === E.norm(c.evento));
      if (i >= 0 && j >= 0) { P.valores[chave(i, j)] = String(c.valor); P.pend.add(chave(i, j)); }
    }
    if (P.pend.size) agendar(tipo);
  }
  renderPlanilhaRubricas(tipo);
}
