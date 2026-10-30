/* Painel — Calculadoras e Configurações. (parte de panel/panel.js, dividido na 2.16.4; mapa em docs/arquitetura.md). */
import * as E from '../engine.js';
import { aiAvailable } from '../extract.js';
import { renderSimulacao } from '../calcular.js';
import { $, P, S, cidAtivo, esc, icon, toast, viewEl } from './base.js';
import { aplicarTamanhoTexto, loadRules, savePrefs } from './conexao.js';
import { copiarDiagnostico } from './facilidades.js';
import { maskInput } from './formulario.js';
import { setView, tipoDef } from './modo.js';

export const TOOLS = { simRescisao: 'Simular rescisão', simFerias: 'Simular férias', ferias: 'Prazos das férias', aviso: 'Aviso prévio', rescisao: 'Prazo da rescisão', afast: 'Afastamento', exp: 'Experiência', uteis: 'Dias úteis', admissao: 'Docs. admissão' };

/** Mensagem pronta (WhatsApp/e-mail) com os documentos que o novo funcionário precisa mandar. */
export function mensagemAdmissao() {
  const M = S.rules.mensagens || {};
  const docs = tipoDef('cadastroEmpregado')?.anexos || [];
  return [M.admissaoInicio || 'Olá! Para fazermos a sua admissão, envie por favor:', ...docs.map(a => `• ${a.rotulo}${a.obrigatorio ? '' : ' (se tiver)'}`), M.admissaoFim || 'Pode mandar foto bem legível ou PDF. Obrigado!'].join('\n');
}

export function renderFerramentas() {
  viewEl.innerHTML = `<div class="tool-tabs" role="group" aria-label="Calculadoras">${Object.entries(TOOLS).map(([k, l]) => `<button type="button" data-t="${k}" aria-pressed="${S.ferramenta === k}">${l}</button>`).join('')}</div>
    <div class="card pad" id="tool"></div>
    <p class="muted" style="font-size:11.5px">Cálculos de apoio com base na CLT e nos feriados nacionais cadastrados nas regras. O cálculo oficial é feito pelo escritório.</p>`;
  viewEl.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { S.ferramenta = b.dataset.t; renderFerramentas(); }));
  const tool = $('#tool');
  // simulações de férias e rescisão (2.3): a função principal do Calcular
  if (S.ferramenta === 'simRescisao' || S.ferramenta === 'simFerias') {
    viewEl.querySelector('.muted:last-child')?.remove();
    renderSimulacao(tool, S.ferramenta === 'simRescisao' ? 'rescisao' : 'ferias', {
      S, esc, icon, toast, maskInput,
      empregados: () => (S.plat?.emp?.lista?.length ? S.plat.emp.lista : (S.equipe.get(S.ctx.empresa) || [])).filter(e => e.ativo !== false),
      pedir: (tipo, o) => P.novoPedido(tipo, o)
    });
    return;
  }
  const cal = E.makeCalendar(S.rules.feriados);
  const F = (id, label, ph = 'DD/MM/AAAA', t = 'data') => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" data-t="${t}" placeholder="${ph}" inputmode="numeric"></div>`;
  const out = '<div class="calc" id="out" style="margin-top:12px"><span class="muted">Preencha os campos acima.</span></div>';
  const forms = {
    ferias: `<div class="row2">${F('a', 'Início do gozo')}${F('b', 'Dias de gozo', '30', 'numero')}</div>${F('c', 'Dias de abono (opcional)', '0', 'numero')}${out}`,
    aviso: `<div class="row2">${F('a', 'Data de admissão')}${F('b', 'Data do aviso')}</div>${out}`,
    rescisao: F('a', 'Último dia de trabalho') + out,
    afast: `<div class="row2">${F('a', 'Início do afastamento')}${F('b', 'Dias de atestado', '15', 'numero')}</div>${out}`,
    exp: `<div class="row2">${F('a', 'Data de admissão')}${F('b', '1º período (dias)', '45', 'numero')}</div>${F('c', 'Prorrogação (dias)', '45', 'numero')}${out}`,
    uteis: `<div class="row2">${F('a', 'De')}${F('b', 'Até')}</div>${out}`,
    admissao: `<p class="muted" style="margin:0 0 8px">Mensagem pronta para mandar ao novo funcionário pelo WhatsApp ou e-mail, com os documentos que o escritório pede.</p>
      <textarea class="input" id="adm-msg" rows="11">${esc(mensagemAdmissao())}</textarea>
      <div class="actions" style="margin-top:8px"><button class="btn btn-primary" id="adm-copy">${icon('copy', 'ic-sm')} Copiar mensagem</button></div>`
  };
  tool.innerHTML = forms[S.ferramenta];
  const g = (id) => $('#' + id)?.value || '';
  const show = (rows, notes = []) => { $('#out').innerHTML = rows.map(([l, v]) => `<div>${esc(l)}: <b>${esc(v)}</b></div>`).join('') + notes.map(n => `<div style="margin-top:6px;color:var(--warn)">${icon('alert', 'ic-sm')} ${esc(n)}</div>`).join(''); };
  const calc = () => {
    const a = E.parseDate(g('a')), b = E.parseDate(g('b')), nb = parseInt(g('b'), 10), nc = parseInt(g('c'), 10) || 0;
    switch (S.ferramenta) {
      case 'ferias': {
        if (!a || !nb) return;
        const notes = [];
        if ([1, 2].some(n => { const x = E.addDays(a, n); return x.getDay() === 0 || cal.isHoliday(x); })) notes.push(`Início em ${E.weekday(a)}: não pode ser nos 2 dias antes de feriado ou domingo (CLT 134 §3º).`);
        if (nb < 5 || nb > 30) notes.push('Cada período deve ter de 5 a 30 dias.');
        if (nc > 10 || nb + nc > 30) notes.push('Abono de no máximo 10 dias e gozo + abono até 30.');
        if (E.diffDays(E.today(), a) < 30) notes.push('Faltam menos de 30 dias: o aviso deveria ter sido dado com 30 dias de antecedência.');
        show([['Último dia de gozo', E.fmtDate(E.addDays(a, nb - 1))], ['Retorno', `${E.fmtDate(E.addDays(a, nb))} (${E.weekday(E.addDays(a, nb))})`], ['Dar o aviso até', E.fmtDate(E.addDays(a, -30))], ['Pagar até', E.fmtDate(E.addDays(a, -2))], ['Enviar cálculo ao escritório até', E.fmtDate(cal.addBusinessDays(E.addDays(a, -2), -(S.rules.config?.prazoInternoDiasUteis?.calculo || 5)))]], notes);
        break;
      }
      case 'aviso': {
        if (!a || !b) return;
        let anos = b.getFullYear() - a.getFullYear(); const m = new Date(a); m.setFullYear(b.getFullYear()); if (m > b) anos--;
        anos = Math.max(0, anos);
        const dias = Math.min(90, 30 + 3 * anos);
        show([['Anos completos', String(anos)], ['Dias de aviso prévio', `${dias} dias (Lei 12.506/2011)`], ['Fim do aviso (se trabalhado 30 dias)', E.fmtDate(E.fimDoAviso(b, 30))], ['Projeção total do aviso', E.fmtDate(E.fimDoAviso(b, dias))]], dias > 30 ? ['O aviso trabalhado é de 30 dias; os dias adicionais são indenizados.', 'A contagem exclui o dia do aviso e inclui o último (Súmula 380 do TST).'] : ['A contagem exclui o dia do aviso e inclui o último (Súmula 380 do TST).']);
        break;
      }
      case 'rescisao': {
        if (!a) return;
        const pg = E.addDays(a, 10);
        const env = cal.addBusinessDays(pg, -(S.rules.config?.prazoInternoDiasUteis?.calculo || 5));
        show([['Pagar as verbas até', `${E.fmtDate(pg)} (${E.weekday(pg)})`], ['Enviar ao escritório até', E.fmtDate(env)]], env < E.today() ? ['O prazo ideal de envio já passou — envie o quanto antes e avise seu analista.'] : []);
        break;
      }
      case 'afast': {
        if (!a || !nb) return;
        const rows = [['Retorno previsto', E.fmtDate(E.addDays(a, nb))], ['Dias pagos pela empresa', String(Math.min(15, nb))]];
        if (nb > 15) rows.push(['Encaminhar ao INSS a partir de', E.fmtDate(E.addDays(a, 15))], ['Dias a cargo do INSS', String(nb - 15)]);
        show(rows);
        break;
      }
      case 'exp': {
        if (!a || !nb) return;
        const f1 = E.addDays(a, nb - 1); const rows = [['Fim do 1º período', E.fmtDate(f1)]];
        if (nc) rows.push(['Fim da prorrogação', E.fmtDate(E.addDays(a, nb + nc - 1))]);
        show(rows, nb + nc > 90 ? ['O contrato de experiência não pode passar de 90 dias no total.'] : []);
        break;
      }
      case 'uteis': {
        if (!a || !b) return;
        show([['Dias corridos', String(E.diffDays(a, b))], ['Dias úteis', String(cal.businessDaysBetween(a, b))]]);
        break;
      }
      default: break;
    }
  };
  tool.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { maskInput(i); calc(); }));
  $('#adm-copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#adm-msg').value); toast('Mensagem copiada.'); } catch { $('#adm-msg').select(); toast('Selecionei o texto: use Ctrl+C.'); } });
}

/** Dois em dois dias o service worker guarda um retrato das regras (backup) e vê se há versão nova da extensão. */
export async function desenharManutencao() {
  const el = $('#man-card'); if (!el) return;
  const info = await chrome.runtime.sendMessage({ type: 'manutencao' }).catch(() => null);
  if (!el.isConnected) return;
  if (!info) { el.innerHTML = '<div class="muted">Indisponível neste modo.</div>'; return; }
  const dt = (x) => x ? new Date(x).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const a = info.atualizacao;
  el.innerHTML = `${a ? `<div class="note warn">${icon('info')}<div><b>Há uma versão nova da extensão: ${esc(a.versao)}.</b> ${esc(a.mensagem || 'Baixe o ZIP, troque a pasta e recarregue a extensão em chrome://extensions.')}${a.url ? ` <a href="${esc(a.url)}" target="_blank" rel="noopener">Baixar</a>` : ''}</div></div>` : `<p class="muted" style="margin:0 0 8px">A extensão confere, a cada 2 dias, se há versão nova e guarda um retrato das regras (backup).</p>`}
    <dl class="kv"><dt>Instalada</dt><dd>${esc(chrome.runtime.getManifest?.().version || '?')}</dd><dt>Última conferência</dt><dd>${dt(info.em)}</dd>
      <dt>Backups das regras</dt><dd>${info.backups.length ? info.backups.map(b => `${esc(b.versao)} (${dt(b.quando)})`).join(' · ') : 'ainda não há'}</dd></dl>
    <div class="actions" style="margin-top:10px"><button class="btn" id="man-agora">${icon('refresh', 'ic-sm')} Conferir agora</button></div>`;
  $('#man-agora').addEventListener('click', async () => { $('#man-agora').disabled = true; await chrome.runtime.sendMessage({ type: 'manutencao', agora: true }).catch(() => null); desenharManutencao(); });
}

/** Aviso único por versão: o cliente fica sabendo sem repetir a mensagem a cada abertura. */
export function avisarAtualizacao(info) {
  const a = info?.atualizacao; if (!a || S.prefs.avisoVersao === a.versao) return;
  S.prefs.avisoVersao = a.versao; savePrefs();
  toast(`Há uma versão nova da extensão (${a.versao}). Veja em Configurações → Atualizações e backup.`);
}

export async function renderConfig() {
  viewEl.innerHTML = `<div class="empty"><div class="spin" style="margin:auto"></div><p>Carregando…</p></div>`;   // a tela troca já; os dados chegam em seguida
  const doServico = (m) => Promise.race([chrome.runtime.sendMessage(m), new Promise((_, no) => setTimeout(() => no(new Error('a extensão não respondeu (recarregue o portal com F5)')), 6000))]);
  const [info, pack] = await Promise.all([doServico({ type: 'getSettings' }), doServico({ type: 'getRules' })]);
  const s = info?.settings || {};
  const origemTxt = { dev: 'servidor de desenvolvimento (sua pasta)', remota: 'arquivo remoto', cache: 'cópia salva do arquivo remoto', embutida: 'regras que vieram com a extensão' }[pack.origem] || pack.origem;
  viewEl.innerHTML = `
    <p class="hello">Configurações</p>
    <h2 class="sec">Preferências</h2>
    <div class="card pad">
      <label class="toggle"><input type="checkbox" data-p="preencherAoLer" ${S.prefs.preencherAoLer ? 'checked' : ''}><span>Preencher o portal assim que ler um documento<small>Você sempre revisa antes de enviar.</small></span></label>
      <label class="toggle"><input type="checkbox" data-p="ocrAutomatico" ${S.prefs.ocrAutomatico ? 'checked' : ''}><span>Ler fotos e PDFs escaneados (OCR)<small>Pode levar alguns segundos por página.</small></span></label>
      <label class="toggle"><input type="checkbox" data-p="incluirCid" ${cidAtivo() ? 'checked' : ''}><span>Incluir CID nas descrições<small>Dado de saúde — mantenha desligado se não for exigido.</small></span></label>
      <label class="toggle"><input type="checkbox" data-p="usarIa" ${S.prefs.usarIa ? 'checked' : ''}><span>Usar a IA do próprio Chrome quando disponível<small>${await aiAvailable() ? 'Disponível neste computador. Roda localmente.' : 'Não disponível neste Chrome — sem efeito.'}</small></span></label>
      <div class="field" style="margin-top:10px"><label>Ao abrir o portal</label>
        <div class="seg" role="group" aria-label="Ao abrir o portal">${[['plataforma', 'Abrir a plataforma (tela cheia)'], ['painel', 'Só o botão Assistente']].map(([v, l]) => `<button type="button" data-abrir="${v}" aria-pressed="${(S.prefs.abrirComo || 'plataforma') === v}">${l}</button>`).join('')}</div>
        <small class="muted">A plataforma cobre o portal e preenche por trás. Você pode ver o portal a qualquer momento.</small></div>
      <div class="field" style="margin-top:10px"><label>Tamanho do texto do painel</label>
        <div class="seg" role="group" aria-label="Tamanho do texto">${[['normal', 'Normal'], ['grande', 'Grande'], ['maior', 'Maior']].map(([v, l]) => `<button type="button" data-tam="${v}" aria-pressed="${S.prefs.tamanhoTexto === v}">${l}</button>`).join('')}</div></div>
    </div>
    <h2 class="sec">Ajuda</h2>
    <div class="card pad">
      <p class="muted" style="margin:0 0 8px">Algo não funcionou? Copie o diagnóstico e cole na conversa com o escritório. Ele não leva nomes, valores nem documentos — só versões e o que o Assistente encontrou na tela.</p>
      <button class="btn" id="diag">${icon('copy', 'ic-sm')} Copiar diagnóstico</button>
    </div>
    <h2 class="sec">Regras</h2>
    <div class="card pad">
      <dl class="kv"><dt>Versão</dt><dd>${esc(pack.versao)}</dd><dt>Origem</dt><dd>${esc(origemTxt)}</dd><dt>Atualizado</dt><dd>${new Date(pack.atualizadoEm).toLocaleString('pt-BR')}</dd></dl>
      ${pack.erro ? `<div class="note warn" style="margin-top:10px">${icon('alert')}<div>${esc(pack.erro)}</div></div>` : ''}
      <div class="field" style="margin-top:12px"><label for="rules-url">Endereço do arquivo de regras (GitHub)</label>
        <input class="input mono" id="rules-url" placeholder="https://raw.githubusercontent.com/usuario/repo/main/rules/regras.json" value="${esc(s.rulesUrl)}"></div>
      <div class="actions" style="margin-top:10px">
        <button class="btn btn-primary" id="save-url">Salvar endereço</button>
        <button class="btn" id="refresh-rules">${icon('refresh', 'ic-sm')} Atualizar agora</button>
      </div>
    </div>
    <h2 class="sec">Atualizações e backup</h2>
    <div class="card" id="man-card"><div class="muted">Lendo…</div></div>
    <h2 class="sec dev-only">Desenvolvimento</h2>
    <div class="card pad dev-only">
      <dl class="kv"><dt>Instalada como</dt><dd>${info.unpacked ? 'pasta (modo desenvolvedor)' : 'loja / pacote'}</dd>
      <dt>Recarga automática</dt><dd>${info.dev ? (info.devConectado ? 'ligada e conectada' : 'ligada — servidor dev não está rodando') : 'desligada'}</dd>
      <dt>Extensão</dt><dd>v${esc(info.versaoExtensao)}</dd></dl>
      <div class="field" style="margin-top:10px"><label>Recarga automática</label>
        <div class="seg" role="group">${['auto', 'on', 'off'].map(v => `<button type="button" data-dev="${v}" aria-pressed="${s.devMode === v}">${{ auto: 'Automática', on: 'Sempre', off: 'Desligada' }[v]}</button>`).join('')}</div></div>
      <div class="actions" style="margin-top:10px"><button class="btn" id="reload-ext">${icon('refresh', 'ic-sm')} Recarregar extensão</button></div>
    </div>
    <div class="actions" style="margin-top:14px"><button class="btn" id="intro-again">${icon('info', 'ic-sm')} Ver a introdução de novo</button></div>
    <div class="note" style="margin-top:14px">${icon('lock')}<div>${esc(S.rules.mensagens?.privacidade || '')}</div></div>`;
  viewEl.querySelectorAll('[data-p]').forEach(i => i.addEventListener('change', () => { S.prefs[i.dataset.p] = i.checked; if (i.dataset.p === 'incluirCid') S.prefs.cidEscolhido = true; savePrefs(); }));
  viewEl.querySelectorAll('[data-tam]').forEach(b => b.addEventListener('click', () => { S.prefs.tamanhoTexto = b.dataset.tam; savePrefs(); aplicarTamanhoTexto(); renderConfig(); }));
  viewEl.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => { S.prefs.abrirComo = b.dataset.abrir; savePrefs(); renderConfig(); }));
  $('#diag').addEventListener('click', copiarDiagnostico);
  $('#save-url').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'setSettings', settings: { rulesUrl: $('#rules-url').value.trim() } }); await loadRules(); renderConfig(); });
  desenharManutencao();
  $('#refresh-rules').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'refreshRules' }); await loadRules(); renderConfig(); });
  viewEl.querySelectorAll('[data-dev]').forEach(b => b.addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'setSettings', settings: { devMode: b.dataset.dev } }); renderConfig(); }));
  $('#reload-ext')?.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'reloadExtension' }));
  $('#intro-again').addEventListener('click', () => { S.prefs.introVista = false; savePrefs(); setView('inicio'); });
  if (info.simulador) viewEl.querySelectorAll('.dev-only').forEach(e => e.remove());
}
