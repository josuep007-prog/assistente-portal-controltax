/* Painel — Planilha de rubricas dentro da plataforma (2.20.0).
 * A grade do Lançamento de Rubricas do portal (funcionários nas linhas, um evento por coluna) numa planilha própria, grande,
 * com o nome e os títulos fixos: o cliente digita aqui e eu lanço célula a célula na grade do portal (por baixo, como no
 * formulário próprio). Nada é enviado: o envio é só pelo botão do portal, depois do resumo. Os valores ficam só na memória. */
import * as E from '../engine.js';
import { criarXlsx, readFile } from '../extract.js';
import { $, S, esc, icon, request } from './base.js';
import { tipoDef, w } from './modo.js';
import { enviarPendenteAgora, fillPortal, valorPlat } from './formulario.js';
import { salvarRascunho, salvarRascunhoAgora } from './facilidades.js';

const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const chave = (i, j) => `${i}|${j}`;
const estado = (tipo) => (w(tipo).planilha ||= { carregada: false, lendo: false, erro: '', eventos: [], empregados: [], valores: {}, pend: new Set(), filtro: '', status: '', timer: null, comando: '', cmdMsg: '', cmdBusy: false, falhas: new Set(), ultimo: null, arqMsg: '', arqBusy: false, bloqueadas: new Set(), meta: [] });

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
/** Excel: exportar a planilha que a extensão lê e fixar (importar) uma já preenchida; a extensão abre a grade do portal e lança sozinha. */
function blocoArquivo(P, noForm) {
  const des = P.arqBusy || P.cmdBusy || !noForm ? ' disabled' : '';
  return `<div class="plan-arq">
    <div class="plan-arq-linha">
      <button type="button" class="btn btn-sm" id="plan-exportar"${des} title="Gera um arquivo do Excel com os funcionários e as rubricas desta empresa">${icon('download', 'ic-sm')} Exportar para Excel</button>
      <button type="button" class="btn btn-sm" id="plan-importar"${des} title="Escolha a planilha já preenchida: eu abro a grade do portal e lanço os valores">${icon('upload', 'ic-sm')} Importar planilha preenchida</button>
      <input type="file" id="plan-arquivo" accept=".xlsx,.xls,.ods,.csv" hidden>
      <span class="muted">Prefere preencher no Excel? Exporte, preencha e fixe aqui (ou arraste o arquivo para este cartão).</span></div>
    <div class="plan-cmd-res" id="plan-arq-res" role="status">${P.arqMsg || ''}</div></div>`;
}
const baixarArquivo = (bytes, nome, tipoMime) => {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipoMime }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
/** Garante a planilha do portal carregada (pede a competência quando falta); devolve false com a mensagem já no cartão. */
async function garantirCarregada(tipo, mensagem) {
  const P = estado(tipo);
  if (P.carregada) return true;
  if (!String(valorPlat(tipo, 'competencia') || '').trim()) { P[mensagem] = `<div class="note warn">${icon('alert')}<div>Falta a competência. Preencha a Competência no formulário (ou escreva no comando, por exemplo «mês passado») e tente de novo.</div></div>`; return false; }
  P[mensagem] = '<span class="muted">Abrindo a planilha do portal e lendo os funcionários…</span>'; renderPlanilhaRubricas(tipo);
  await carregar(tipo);
  if (!P.carregada) { P[mensagem] = `<div class="note warn">${icon('alert')}<div>${esc(P.erro || 'Não consegui abrir a planilha do portal.')}</div></div>`; return false; }
  return true;
}

export async function exportarExcel(tipo) {
  const P = estado(tipo);
  if (P.arqBusy || !(S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo)) return;
  P.arqBusy = true; P.arqMsg = ''; renderPlanilhaRubricas(tipo);
  try {
    if (!(await garantirCarregada(tipo, 'arqMsg'))) return;
    const num = (v) => (/^\d+([.,]\d+)?$/.test(String(v).trim()) ? Number(String(v).replace(',', '.')) : String(v));   // número no Excel quando é número (10:30 continua texto)
    const linhas = [['Funcionário', ...P.eventos], ...P.empregados.map((e, i) => [e, ...P.eventos.map((_, j) => { const v = P.valores[chave(i, j)]; return v ? num(v) : ''; })])];
    const como = [['Como usar esta planilha'], [''], ['1. Preencha os valores na aba «Rubricas»: uma linha por funcionário, uma coluna por rubrica.'], ['2. Não mude os nomes dos funcionários nem os títulos das colunas.'], ['3. Use o mesmo formato que você usaria no portal (ex.: horas 10:30, valores 350,00).'], ['4. No Assistente, em Lançamento de Rubricas, clique em «Importar planilha preenchida» e escolha este arquivo.'], ['5. O envio continua sendo feito pelo botão do portal, depois do resumo.'], ...(P.bloqueadas.size ? [[''], ['Rubricas que o portal NÃO deixa lançar (não preencha; se preencher, ficam de fora):'], ...[...P.bloqueadas].map(x => [x])] : [])];
    const comp = String(valorPlat(tipo, 'competencia') || '').match(/(\d{2})\/(\d{4})/);
    const nome = `lancamento-de-rubricas${comp ? `-${comp[2]}-${comp[1]}` : ''}.xlsx`;
    const bytes = await criarXlsx([{ nome: 'Rubricas', linhas, larguras: [38, ...P.eventos.map(() => 20)] }, { nome: 'Como usar', linhas: como, larguras: [100] }]);
    baixarArquivo(bytes, nome, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    P.arqMsg = `<span class="ok-txt">${icon('check', 'ic-sm')} Arquivo <b>${esc(nome)}</b> gerado com ${P.empregados.length} funcionário(s) e ${P.eventos.length} rubrica(s)${contarValores(P) ? `, já com os ${contarValores(P)} valor(es) da planilha` : ''}.</span>`;
  } catch (e) {
    P.arqMsg = `<div class="note warn">${icon('alert')}<div>Não consegui gerar o arquivo: ${esc(String(e?.message || e).slice(0, 140))}</div></div>`;
  } finally { P.arqBusy = false; renderPlanilhaRubricas(tipo); }
}

/** "Fixar" uma planilha preenchida: lê o arquivo, abre a grade do portal se preciso e lança os valores (nada é enviado). */
export async function importarExcel(tipo, arquivo) {
  const P = estado(tipo);
  if (!arquivo || P.arqBusy || !(S.ctx.route?.mode === 'form' && S.ctx.tipo === tipo)) return;
  P.arqBusy = true; P.arqMsg = '<span class="muted">Lendo a planilha…</span>'; renderPlanilhaRubricas(tipo);
  try {
    const r = await readFile(arquivo, null, { ocr: false });
    if (!r?.abas?.length) { P.arqMsg = `<div class="note warn">${icon('alert')}<div>Não consegui ler «${esc(arquivo.name)}». Use um arquivo do Excel (.xlsx, .xls), do LibreOffice (.ods) ou .csv.</div></div>`; return; }
    if (!(await garantirCarregada(tipo, 'arqMsg'))) return;
    let l = E.lerPlanilhaDaGrade(r.abas, P.eventos, P.empregados), origem = 'planilha da grade';
    if (!l) {   // outro formato: Funcionário / Rubrica / Valor (ou uma coluna por rubrica pelo dicionário das regras)
      const linhas = E.linhasDaPlanilha(r.tabela || r.abas[0].linhas, S.rules);
      const g = E.montarGrade(linhas, P.eventos, P.empregados, S.rules);
      l = { celulas: g.celulas, semEmpregado: g.semEmpregado, semEvento: g.semEvento }; origem = 'Empregado/Rubrica/Valor';
    }
    let n = 0;
    const bloqueadas = [...new Set(l.celulas.filter(c => P.bloqueadas.has(c.evento)).map(c => c.evento))];
    l.celulas = l.celulas.filter(c => !P.bloqueadas.has(c.evento));
    for (const c of l.celulas) {
      const i = P.empregados.indexOf(c.empregado), j = P.eventos.indexOf(c.evento); if (i < 0 || j < 0) continue;
      const k = chave(i, j); if ((P.valores[k] || '') === String(c.valor)) continue;
      P.valores[k] = String(c.valor); P.pend.add(k); n++;
    }
    const li = [];
    li.push(n ? `<li><b>Fixei a planilha «${esc(arquivo.name)}»: ${n} valor(es) lançados</b> para ${new Set(l.celulas.map(c => c.empregado)).size} funcionário(s). Confira e ajuste na planilha se precisar.</li>` : `<li>Li «${esc(arquivo.name)}», mas não achei valores novos para lançar (${origem}).</li>`);
    if (l.semEmpregado?.length) li.push(`<li>Não achei na grade do portal: ${l.semEmpregado.slice(0, 8).map(esc).join(', ')}${l.semEmpregado.length > 8 ? ` e mais ${l.semEmpregado.length - 8}` : ''}. Confira o nome do funcionário.</li>`);
    if (bloqueadas.length) li.push(`<li>O portal não deixa lançar nestas rubricas (bloqueadas na grade): ${bloqueadas.map(esc).join(', ')}. Elas ficaram de fora.</li>`);
    if (l.semEvento?.length) li.push(`<li>Estas colunas não são rubricas da grade desta empresa e ficaram de fora: ${l.semEvento.slice(0, 8).map(x => esc(String(x))).join(', ')}.</li>`);
    P.arqMsg = `<ul class="tips">${li.join('')}</ul>`;
    if (n) { agendar(tipo); salvarRascunho(tipo, S.ctx.empresa); }
  } catch (e) {
    P.arqMsg = `<div class="note warn">${icon('alert')}<div>Não consegui ler a planilha: ${esc(String(e?.message || e).slice(0, 140))}</div></div>`;
  } finally { P.arqBusy = false; renderPlanilhaRubricas(tipo); }
}
function ligarArquivo(tipo, el) {
  $('#plan-exportar')?.addEventListener('click', () => exportarExcel(tipo));
  const inp = $('#plan-arquivo');
  $('#plan-importar')?.addEventListener('click', () => inp?.click());
  inp?.addEventListener('change', () => { const f = inp.files?.[0]; inp.value = ''; if (f) importarExcel(tipo, f); });
  const card = el.querySelector('.plan-rub'); if (!card || card.dataset.arrasto) return; card.dataset.arrasto = '1';
  // arrastar a planilha para este cartão: vale para ele (a área de soltar geral da plataforma não a trata como documento)
  card.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); card.classList.add('plan-solta'); } });
  card.addEventListener('dragleave', () => card.classList.remove('plan-solta'));
  card.addEventListener('drop', (e) => {
    card.classList.remove('plan-solta');
    const f = [...(e.dataTransfer?.files || [])][0]; if (!f) return;
    e.preventDefault(); e.stopPropagation(); importarExcel(tipo, f);
  });
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
  if (r.bloqueadas?.length) li.push(`<li>O portal não deixa lançar nestas rubricas (bloqueadas na grade): ${r.bloqueadas.map(esc).join(', ')}. Elas ficaram de fora.</li>`);
  if (r.semEmpregado.length) li.push(`<li>Não achei o funcionário em: ${r.semEmpregado.map(x => x === '?' ? 'uma frase sem nome' : esc(x)).join(', ')}. Escreva o nome como aparece na planilha.</li>`);
  if (!li.length && !r.bloqueadas?.length) li.push('<li>Não entendi nenhum lançamento. Escreva, por exemplo: «Agnaldo 10 horas extras, Artur 2 faltas».</li>');
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
    r.bloqueadas = [...new Set(r.celulas.filter(c => P.bloqueadas.has(c.evento)).map(c => c.evento))];
    r.celulas = r.celulas.filter(c => !P.bloqueadas.has(c.evento));   // o portal não deixa lançar nessas rubricas
    let n = 0;
    for (const c of r.celulas) {
      const i = P.empregados.indexOf(c.empregado), j = P.eventos.indexOf(c.evento); if (i < 0 || j < 0) continue;
      const k = chave(i, j); if ((P.valores[k] || '') === c.valor) continue;
      P.valores[k] = c.valor; P.pend.add(k); n++;
    }
    P.cmdMsg = resumoComando(r, n);
    if (n) { agendar(tipo); salvarRascunho(tipo, S.ctx.empresa); }
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
      ${blocoArquivo(P, noForm)}
      <p class="muted" style="margin:0 0 8px">${P.erro ? esc(P.erro) : noForm ? 'Preencha a competência acima e carregue os funcionários e as rubricas da empresa.' : 'Abra o Lançamento de Rubricas para carregar a planilha.'}</p>
      <button type="button" class="btn btn-primary" id="plan-carregar"${P.lendo || !noForm ? ' disabled' : ''}>${P.lendo ? 'Abrindo a planilha do portal e lendo…' : 'Carregar funcionários e rubricas'}</button></div></section>`;
    $('#plan-carregar')?.addEventListener('click', () => carregar(tipo));
    ligarComando(tipo); ligarArquivo(tipo, el);
    return;
  }
  const f = E.norm(P.filtro);
  const linhas = P.empregados.map((emp, i) => `<tr data-i="${i}"${f && !E.norm(emp).includes(f) ? ' hidden' : ''}><th scope="row" class="plan-nome" title="${esc(emp)}">${esc(emp)}</th>${P.eventos.map((ev, j) => `<td${P.bloqueadas.has(ev) ? ' class="plan-bloq" title="O portal não deixa lançar nesta rubrica"' : P.falhas.has(chave(i, j)) ? ' class="plan-falhou" title="O portal não aceitou este valor"' : ''}><input type="text" inputmode="decimal" autocomplete="off" data-i="${i}" data-j="${j}" value="${esc(P.valores[chave(i, j)] || '')}" aria-label="${esc(ev)} — ${esc(emp)}"${P.bloqueadas.has(ev) ? ' disabled' : ''}></td>`).join('')}</tr>`).join('');
  el.innerHTML = `<section class="pn-card plan-rub">${cab}<div class="pn-card-body">
    ${blocoComando(P, noForm)}
    ${blocoArquivo(P, noForm)}
    <div class="plan-barra"><input type="search" id="plan-q" placeholder="Buscar funcionário…" value="${esc(P.filtro)}" autocomplete="off">
      <span class="muted" id="plan-n">${contarValores(P)} valor(es) · ${P.empregados.length} funcionário(s) · ${P.eventos.length} rubrica(s)${P.bloqueadas.size ? ` · ${P.bloqueadas.size} bloqueada(s) pelo portal` : ''}</span><span class="spacer"></span>
      <span class="muted" id="plan-status" role="status">${statusHtml(P)}</span>
      <button type="button" class="btn btn-sm btn-ghost" id="plan-rascunho" title="Guarda a planilha neste computador por 7 dias">${icon('file', 'ic-sm')} Salvar rascunho</button>
      <button type="button" class="btn btn-sm btn-ghost" id="plan-recarregar"${P.lendo || !noForm ? ' disabled' : ''}>${icon('refresh', 'ic-sm')} Recarregar do portal</button></div>
    <div class="plan-rolagem"><table class="plan-tabela"><thead><tr><th class="plan-nome">Funcionário</th>${P.eventos.map(ev => `<th title="${esc(ev)}${P.bloqueadas.has(ev) ? ' — o portal não deixa lançar nesta rubrica' : ''}"${P.bloqueadas.has(ev) ? ' class="plan-bloq-th"' : ''}>${P.bloqueadas.has(ev) ? icon('lock', 'ic-sm') + ' ' : ''}${esc(ev)}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>
    <p class="muted" style="margin:8px 0 0">Enter e as setas descem e sobem na coluna; você pode colar um bloco copiado do Excel. Os nomes e as rubricas são os do portal.</p></div></section>`;
  ligarComando(tipo); ligarArquivo(tipo, el);
  ligar(tipo, el);
}

function ligar(tipo, el) {
  const P = estado(tipo);
  $('#plan-recarregar')?.addEventListener('click', () => carregar(tipo));
  $('#plan-rascunho')?.addEventListener('click', async () => {
    const q = await salvarRascunhoAgora(tipo);
    P.status = q ? `Rascunho salvo às ${new Date(q).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Se sair daqui, é só voltar ao Lançamento de Rubricas e clicar em Continuar (vale por 7 dias).` : 'Ainda não há nada para guardar.';
    marcar(tipo);
  });
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
    salvarRascunho(tipo, S.ctx.empresa);   // rascunho automático: se sair das rubricas, a planilha continua guardada (7 dias)
  };
  tabela.addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-i]'); if (!inp) return;
    P.falhas.delete(chave(+inp.dataset.i, +inp.dataset.j)); inp.closest('td')?.classList.remove('plan-falhou');
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
      cols.forEach((v, d) => { const c = celula(i0, j0 + d); if (c && !c.disabled) { c.value = v.trim(); gravar(i0, j0 + d, v); } });
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
  const motivos = {};
  for (const k of chaves) P.falhas.delete(k);   // o que foi reenviado vale de novo: a marca vermelha antiga sai e só volta se o portal recusar outra vez
  for (const f of r?.faltaram || []) {
    motivos[f.motivo || 'motivo não informado'] = (motivos[f.motivo || 'motivo não informado'] || 0) + 1;
    const i = P.empregados.indexOf(f.empregado), j = P.eventos.indexOf(f.evento); if (i >= 0 && j >= 0) P.falhas.add(chave(i, j));
  }
  P.ultimo = r ? { total: celulas.length, falhas, motivos, formas: r.formas || {}, recusas: r.recusas || [] } : { total: celulas.length, falhas: celulas.length, motivos: { 'o portal não respondeu': celulas.length } };
  P.status = !r ? 'O portal não respondeu. Tente de novo.' : falhas ? `${falhas} célula(s) não aceitaram o valor no portal (marcadas em vermelho): ${Object.entries(motivos).map(([m, n]) => `${m}${n > 1 ? ' ×' + n : ''}`).join('; ')}.` : `Lançado na grade do portal às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
  if (!r) chaves.forEach(k => P.pend.add(k));
  document.querySelectorAll('.plan-tabela td:not(.plan-bloq)').forEach(td => {
    const i = td.querySelector('input')?.dataset; if (!i) return;
    const falhou = P.falhas.has(chave(+i.i, +i.j));
    td.classList.toggle('plan-falhou', falhou); td.title = falhou ? 'O portal não aceitou este valor' : '';
  });
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
  P.fonte = g.fonte || ''; P.api = g.api || null; P.bloqueadas = new Set(g.bloqueadas || []); P.meta = g.meta || [];
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
      if (i >= 0 && j >= 0 && !P.bloqueadas.has(P.eventos[j])) { P.valores[chave(i, j)] = String(c.valor); P.pend.add(chave(i, j)); }
    }
    if (P.pend.size) agendar(tipo);
  }
  if (P.rascunho?.length) {   // rascunho: os valores guardados voltam pelo nome do funcionário e da rubrica
    let n = 0, fora = 0;
    for (const c of P.rascunho) {
      const i = P.empregados.findIndex(e => E.norm(e) === E.norm(c.e)), j = P.eventos.findIndex(e => E.norm(e) === E.norm(c.r));
      if (i >= 0 && j >= 0 && !P.bloqueadas.has(P.eventos[j])) { P.valores[chave(i, j)] = String(c.v); P.pend.add(chave(i, j)); n++; } else fora++;
    }
    P.rascunho = null;
    P.status = `Rascunho retomado: ${n} valor(es) voltaram à planilha${fora ? `; ${fora} não existem mais na grade (funcionário ou rubrica mudou)` : ''}.`;
    if (P.pend.size) agendar(tipo);
  }
  renderPlanilhaRubricas(tipo);
}

/** "Continuar" de um rascunho: abre a grade do portal e devolve os valores guardados à planilha e à grade. */
export async function restaurarPlanilha(tipo, celulas) {
  const P = estado(tipo);
  P.rascunho = celulas; P.carregada = false; P.erro = '';
  await carregar(tipo);
}
