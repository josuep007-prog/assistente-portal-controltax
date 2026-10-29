/* Painel — Histórico e Pendências. (parte de panel/panel.js, dividido na 2.16.4; mapa em docs/arquitetura.md). */
import * as E from '../engine.js';
import { $, P, S, esc, icon, request, send, standalone, viewEl } from './base.js';
import { RASCUNHO_DIAS } from './facilidades.js';
import { empresaDoPedido, openTipo } from './inicio.js';
import { gerarTextos, portalValores, valoresAssistente } from './valores.js';
import { w } from './modo.js';

export async function salvarHistorico(tipo, status) {
  const W = w(tipo);
  const valores = { ...valoresAssistente(tipo), ...portalValores(tipo) };
  if (!Object.keys(valores).length) return;
  const { historico = [] } = await chrome.storage.local.get('historico');
  const chave = `${S.ctx.empresa}|${tipo}|${valores.empregado || valores.nome || ''}`;
  const prev = status === 'enviado'
    ? historico.findIndex(h => h.chave === chave && h.status === 'preenchido')
    : historico.findIndex(h => h.chave === chave && h.status === 'preenchido' && Date.now() - h.quando < 6 * 3600e3);
  // a descrição pode trazer o CID; um cadastro enviado fica só com o nome, as datas da Agenda e os campos da empresa
  const item = { chave, quando: Date.now(), empresa: S.ctx.empresa, tipo, status, resumo: valores.assunto || S.rules.tipos[tipo]?.nome, valores: E.valoresParaHistorico(tipo, valores, status, S.rules), anexos: W.arquivos.filter(a => !a.removido).map(a => a.nome) };
  if (prev >= 0) historico.splice(prev, 1);
  historico.unshift(item);
  // cadastro começado e não enviado: depois do prazo do rascunho, os dados da pessoa saem do histórico
  for (const h of historico) if (h.status !== 'enviado' && Date.now() - h.quando > RASCUNHO_DIAS * 864e5 && E.camposDaEmpresa(h.tipo, S.rules)) h.valores = E.valoresParaHistorico(h.tipo, h.valores, 'enviado', S.rules);
  S.historico = historico.slice(0, 200);
  await chrome.storage.local.set({ historico: S.historico });
}

/* Prazos que nascem das solicitações já preenchidas/enviadas */
export function prazosDoHistorico(historico) {
  const cal = E.makeCalendar(S.rules.feriados); const hoje = E.today(); const out = [];
  const dd = (x) => E.parseDate(x);
  const add = (d, titulo, h, detalhe, pedir = null) => { if (d && E.diffDays(hoje, d) >= -7 && E.diffDays(hoje, d) <= 120) out.push({ d, titulo, h, detalhe, pedir }); };
  for (const h of historico) {
    const v = h.valores || {}; const quem = v.empregado || v.nome || '';
    // o passo seguinte de cada pedido (regras: tipos.*.depoisDeEnviar), com "Fazer agora"; some quando o portal (ou este
    // computador) já tem o pedido desse funcionário
    for (const p of E.proximosPassos(h.tipo, v, S.rules, cal)) {
      if (!p.ate) continue;
      if (p.tipo && (E.temPedidoDe(S.plat?.sol?.itens, p.tipo, p.empregado, new Date(h.quando))
        || historico.some(x => x.status === 'enviado' && x.tipo === p.tipo && E.norm(x.valores?.empregado) === E.norm(p.empregado) && x.quando >= h.quando))) continue;
      add(p.ate, p.titulo, h, p.tipo ? '' : quem, p.tipo ? { tipo: p.tipo, empregado: p.empregado, valores: p.valores, fonte: 'do pedido enviado' } : null);
    }
    switch (h.tipo) {
      case 'avisoFerias': { const i = dd(v.inicioGozo); if (!i) break;
        add(E.pagamentoFerias(i, S.rules, cal), 'Pagamento das férias (limite)', h, quem); add(i, 'Início das férias', h, quem);
        if (+v.diasGozo) add(E.addDays(i, +v.diasGozo), 'Retorno das férias', h, quem); break; }
      case 'calculoFerias': { const i = dd(v.inicioGozo); if (!i) break; add(E.pagamentoFerias(i, S.rules, cal), 'Pagamento das férias (limite)', h, quem); if (+v.diasGozo) add(E.addDays(i, +v.diasGozo), 'Retorno das férias', h, quem); break; }
      case 'afastamento': { const i = dd(v.dataAfastamento); if (!i || !+v.dias) break; add(E.addDays(i, +v.dias), 'Retorno do afastamento', h, quem); if (+v.dias > 15 && E.vaiAoInss(v.tipoAfastamento, S.rules)) add(E.addDays(i, 15), 'Encaminhamento ao INSS (16º dia)', h, quem); break; }
      case 'avisoRescisao': { const i = dd(v.dataAviso); if (!i || !E.temAviso(v, S.rules)) break;
        const dias = +v.diasAviso || 30;
        add(E.fimDoAviso(i, dias), `Fim do aviso, se trabalhado (${dias} dias)`, h, quem); break; }
      case 'calculoRescisao': { const i = dd(v.dataDemissao); if (!i) break; add(E.pagamentoRescisao(i, S.rules, cal), 'Pagamento das verbas rescisórias (limite)', h, quem); break; }
      case 'cadastroEmpregado': { const i = dd(v.dataAdmissao); const e1 = +v.contratoExperiencia; if (!i || !e1) break;
        add(E.addDays(i, e1 - 1), 'Fim do 1º período de experiência', h, quem);
        if (+v.prorrogacao) add(E.addDays(i, e1 + +v.prorrogacao - 1), 'Fim da prorrogação da experiência', h, quem); break; }
      default: break;
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

export async function renderHistorico() {
  const { historico = [] } = await chrome.storage.local.get('historico');
  const prazos = prazosDoHistorico(historico.filter(h => h.status === 'enviado'));
  const inacabados = historico.filter(h => h.status === 'preenchido' && Date.now() - h.quando < RASCUNHO_DIAS * 864e5);
  const hoje = E.today();
  const quando = (d) => { const n = E.diffDays(hoje, d); return n < 0 ? ['err', `há ${-n} dia(s)`] : n === 0 ? ['warn', 'hoje'] : n <= 7 ? ['warn', `em ${n} dia(s)`] : ['info', `em ${n} dias`]; };
  viewEl.innerHTML = `
    <p class="hello">Agenda</p>
    <p class="lead">Prazos que vêm das solicitações feitas com o Assistente neste computador.</p>
    ${prazos.length ? `<div class="agenda">${prazos.map(p => { const [c, txt] = quando(p.d); return `
      <div class="ag-i"><div class="ag-d"><b>${String(p.d.getDate()).padStart(2, '0')}</b><small>${p.d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></div>
        <div class="main"><b>${esc(p.titulo)}</b><small>${esc(p.detalhe || '')}${p.detalhe ? ' · ' : ''}${esc(S.rules.tipos[p.h.tipo]?.nome || '')}</small></div>
        ${p.pedir ? `<button type="button" class="btn btn-sm" data-fazer="${prazos.indexOf(p)}">Fazer agora</button>` : ''}<span class="chip ${c}">${txt}</span></div>`; }).join('')}</div>` : `<div class="empty" style="padding:16px">${icon('calc', 'ic-lg')}<p>Sem prazos por enquanto. Eles aparecem quando você preenche férias, afastamentos, rescisões ou admissões.</p></div>`}
    ${inacabados.length ? `<h2 class="sec">Começou e não enviou</h2>
    <p class="muted" style="margin:0 0 8px;font-size:12px">Preenchidas no portal, mas o envio não foi confirmado. Clique para continuar.</p>
    <div class="list">${inacabados.map(h => `
      <button class="li" type="button" data-cont="${esc(String(historico.indexOf(h)))}" style="text-align:left;cursor:pointer">
        <div class="main"><b>${esc(h.resumo)}</b><small>${esc(S.rules.tipos[h.tipo]?.nome || h.tipo)} · ${new Date(h.quando).toLocaleDateString('pt-BR')}</small></div>
        <span class="chip warn">continuar</span></button>`).join('')}</div>` : ''}
    <h2 class="sec">Histórico</h2>
    ${historico.length ? `<p class="muted" style="margin:0 0 8px;font-size:12px">Clique para reaproveitar os dados em uma nova solicitação.</p><div class="list">${historico.map((h, i) => `
      <button class="li" type="button" data-i="${i}" style="text-align:left;cursor:pointer">
        <div class="main"><b>${esc(h.resumo)}</b><small>${esc(S.rules.tipos[h.tipo]?.nome || h.tipo)} · ${esc(h.empresa)} · ${new Date(h.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></div>
        <span class="chip ${h.status === 'enviado' ? 'ok' : 'info'}">${h.status}</span>
      </button>`).join('')}</div>
    <div class="actions" style="margin-top:12px"><button class="btn btn-ghost" id="h-clear">${icon('trash', 'ic-sm')} Limpar histórico</button></div>` : '<p class="muted">As solicitações que você preencher com o Assistente aparecem aqui.</p>'}`;
  viewEl.querySelectorAll('[data-fazer]').forEach(b => b.addEventListener('click', () => { const x = prazos[+b.dataset.fazer]?.pedir; if (x) P.novoPedido(x.tipo, { empregado: x.empregado, sugeridos: x.valores, fonte: x.fonte }); }));
  viewEl.querySelectorAll('[data-cont]').forEach(b => b.addEventListener('click', async () => {
    const h = historico[+b.dataset.cont];
    if (!(await empresaDoPedido(h.tipo, { sugerida: h.empresa }))) return;
    const W = w(h.tipo);
    for (const [k, v] of Object.entries(E.valoresReaproveitaveis(h.tipo, h.valores, S.rules))) W.valores[k] = { valor: v, conf: 1, fonte: 'histórico' };
    gerarTextos(h.tipo, true);
    await openTipo(h.tipo, { manter: true, semEmpresa: true });
  }));
  viewEl.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', async () => {
    const h = historico[+b.dataset.i];
    if (!(await empresaDoPedido(h.tipo, { sugerida: h.empresa }))) return;
    const W = w(h.tipo);
    // outro pedido a partir do histórico: a regra do Repetir (sem datas; num cadastro, só os campos da empresa)
    for (const [k, v] of Object.entries(E.valoresParaRepetir(h.tipo, h.valores, S.rules))) W.valores[k] = { valor: v, conf: 1, fonte: 'histórico' };
    gerarTextos(h.tipo, true);
    await openTipo(h.tipo, { manter: true, semEmpresa: true });
  }));
  $('#h-clear')?.addEventListener('click', async () => {
    const b = $('#h-clear');
    if (b.dataset.confirm) { await chrome.storage.local.set({ historico: [], rascunhos: {}, equipe: {} }); S.historico = []; S.equipe.clear(); renderHistorico(); }
    else { b.dataset.confirm = '1'; b.innerHTML = `${icon('alert', 'ic-sm')} Clique de novo para confirmar`; setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.innerHTML = `${icon('trash', 'ic-sm')} Limpar histórico`; } }, 4000); }
  });
}

export async function renderPendencias(force = false) {
  if (standalone) { viewEl.innerHTML = `<div class="empty">${icon('bell', 'ic-lg')}<p>Abra o Portal do Cliente para ver suas solicitações.</p></div>`; return; }
  const tipos = Object.entries(S.rules.tipos).filter(([, t]) => t.api).map(([key, t]) => ({ key, api: t.api }));
  if (!S.pend || force) {
    viewEl.innerHTML = `<div class="empty"><div class="spin" style="margin:0 auto 8px"></div>Consultando suas solicitações…</div>`;
    const r = await request({ type: 'pendencias', tipos }, 30000);
    S.pend = r?.data || [];
  }
  const rows = S.pend.filter(p => !p.erro);
  const aguardando = rows.reduce((a, p) => a + (p.itens || []).filter(i => i.aguardando).length, 0);
  const abertas = rows.reduce((a, p) => a + (p.itens || []).filter(i => i.pendente).length, 0);
  send({ type: 'setBadge', n: aguardando });
  const dot = $('#dot-pend'); dot.hidden = !aguardando; dot.textContent = aguardando;
  viewEl.innerHTML = `
    <div class="row2">
      <div class="card pad"><div class="num" style="text-align:left;color:var(--brand-red)">${aguardando}</div><small class="muted">aguardando você</small></div>
      <div class="card pad"><div class="num" style="text-align:left">${abertas}</div><small class="muted">em andamento</small></div>
    </div>
    ${aguardando ? `<div class="note warn">${icon('alert')}<div>Há solicitação esperando sua resposta. Abra, leia o último trâmite e responda — e lembre: quem conclui a solicitação é você.</div></div>` : ''}
    <h2 class="sec">Por tipo</h2>
    <div class="list">${rows.map(p => {
      const t = S.rules.tipos[p.tipo];
      const ag = (p.itens || []).filter(i => i.aguardando).length;
      const ab = (p.itens || []).filter(i => i.pendente).length;
      return `<button class="li" type="button" data-slug="${esc(t.slug)}" style="cursor:pointer;text-align:left">
        <div class="main"><b>${esc(t.nome)}</b><small>${p.total || 0} no total${ab ? ` · ${ab} em andamento` : ''}</small></div>
        ${ag ? `<span class="chip err">${ag} aguardando</span>` : ''}${icon('arrow', 'ic-sm')}</button>`;
    }).join('')}</div>
    <p class="muted" style="font-size:11.5px">Leitura feita com o seu próprio acesso ao portal. ${S.pend.some(p => p.erro) ? 'Alguns tipos não puderam ser consultados.' : ''}</p>
    <button class="btn btn-ghost" id="p-ref">${icon('refresh', 'ic-sm')} Atualizar</button>`;
  viewEl.querySelectorAll('[data-slug]').forEach(b => b.addEventListener('click', () => request({ type: 'navigate', slug: b.dataset.slug, add: false })));
  $('#p-ref').addEventListener('click', () => renderPendencias(true));
}
