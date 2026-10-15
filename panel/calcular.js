/* Calcular (2.3): simulação de férias e de rescisão em todas as modalidades, com o resultado ao lado.
 * Os números vêm de calculos.js (tabelas nas regras: config.tabelas). Nada é guardado nem enviado:
 * a simulação fica nesta tela; "Pedir o cálculo" abre a solicitação no portal já com as datas. */
import * as E from './engine.js';
import * as C from './calculos.js';

const ESTADO = { rescisao: { modalidade: 'semJustaCausa', aviso: 'indenizado', feriasVencidas: '0', feriasEmDobro: '0', dependentes: '0' }, ferias: { diasGozo: '30', diasAbono: '0', dependentes: '0', faltas: '0' } };

/** Abre a simulação já com o funcionário (atalho da lista de Funcionários). */
export function prepararSimulacao(qual, { quem = '', admissao = '' } = {}) {
  Object.assign(ESTADO[qual], { quem }, qual === 'rescisao' && admissao ? { admissao } : {});
}

/** ctx: { S, esc, icon, toast, empregados(): [{nome, admissao}], pedir(tipo, { empregado, valores }), maskInput } */
export function renderSimulacao(el, qual, ctx) {
  const { S, esc, icon } = ctx;
  const T = S.rules?.config?.tabelas;
  const V = ESTADO[qual];
  const emps = ctx.empregados();
  const campo = (k, rotulo, { tipo = 'texto', ph = '', dica = '', opcoes = null, lista = false } = {}) => {
    const id = `sim-${k}`;
    if (opcoes) return `<div class="field"><label for="${id}">${rotulo}</label><select class="input" id="${id}" data-k="${k}">${opcoes.map(([v, t]) => `<option value="${esc(v)}"${String(V[k] ?? '') === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>${dica ? `<span class="field-hint">${dica}</span>` : ''}</div>`;
    if (tipo === 'check') return `<label class="toggle sim-check"><input type="checkbox" id="${id}" data-k="${k}"${V[k] ? ' checked' : ''}><span>${rotulo}${dica ? `<small>${dica}</small>` : ''}</span></label>`;
    return `<div class="field"><label for="${id}">${rotulo}</label><input class="input" id="${id}" data-k="${k}" data-t="${tipo === 'data' ? 'data' : ''}" value="${esc(V[k] ?? '')}" placeholder="${esc(ph || (tipo === 'data' ? 'DD/MM/AAAA' : ''))}" ${tipo === 'data' || tipo === 'numero' || tipo === 'dinheiro' ? 'inputmode="decimal"' : ''} ${lista ? 'list="sim-emps"' : ''} autocomplete="off">${dica ? `<span class="field-hint">${dica}</span>` : ''}</div>`;
  };
  const M = C.MODALIDADES[V.modalidade] || C.MODALIDADES.semJustaCausa;
  const formRescisao = () => `
    ${campo('quem', 'Funcionário (opcional)', { ph: 'Escolha ou digite', lista: true, dica: 'Escolhendo da lista, a admissão vem do portal.' })}
    ${campo('modalidade', 'Modalidade', { opcoes: Object.entries(C.MODALIDADES).map(([k, m]) => [k, m.rot]) })}
    <div class="row2">${campo('admissao', 'Admissão', { tipo: 'data' })}${campo('desligamento', 'Último dia de trabalho', { tipo: 'data', dica: M.aviso.includes('trabalhado') ? 'Com aviso trabalhado: o último dia do aviso.' : '' })}</div>
    ${M.aviso.length ? campo('aviso', 'Aviso prévio', { opcoes: M.aviso.map(a => [a, C.ROTULO_AVISO[a]]) }) : ''}
    ${M.prazo ? `${campo('fimContrato', 'Fim previsto do contrato', { tipo: 'data' })}${M.art479 || M.art480 ? campo('clausulaAssecuratoria', 'O contrato tem cláusula de rescisão antecipada (art. 481)', { tipo: 'check', dica: 'Com ela, vale como dispensa sem justa causa ou pedido de demissão, com aviso prévio.' }) : ''}` : ''}
    <div class="row2">${campo('salario', 'Salário (R$)', { tipo: 'dinheiro', ph: '0,00' })}${campo('medias', 'Médias de variáveis (R$)', { tipo: 'dinheiro', ph: '0,00', dica: 'Horas extras, comissões e adicionais habituais.' })}</div>
    <div class="row2">${campo('feriasVencidas', 'Férias vencidas não tiradas', { opcoes: [['0', 'Nenhuma'], ['1', '1 período'], ['2', '2 períodos']] })}${campo('feriasEmDobro', 'Delas, fora do prazo de concessão', { opcoes: [['0', 'Nenhuma'], ['1', '1 (em dobro)'], ['2', '2 (em dobro)']] })}</div>
    <div class="row2">${campo('adiantamento13', '13º já adiantado (R$)', { tipo: 'dinheiro', ph: '0,00' })}${campo('saldoFgts', 'Saldo do FGTS (R$)', { tipo: 'dinheiro', ph: 'opcional', dica: 'Do extrato; sem ele a multa é estimada.' })}</div>
    ${campo('dependentes', 'Dependentes para o IR', { opcoes: [0, 1, 2, 3, 4, 5].map(n => [String(n), String(n)]) })}`;
  const formFerias = () => `
    ${campo('quem', 'Funcionário (opcional)', { ph: 'Escolha ou digite', lista: true })}
    <div class="row2">${campo('inicio', 'Início das férias', { tipo: 'data' })}${campo('diasGozo', 'Dias de gozo', { tipo: 'numero', ph: '30' })}</div>
    <div class="row2">${campo('salario', 'Salário (R$)', { tipo: 'dinheiro', ph: '0,00' })}${campo('medias', 'Médias de variáveis (R$)', { tipo: 'dinheiro', ph: '0,00' })}</div>
    <div class="row2">${campo('diasAbono', 'Vender dias (abono)', { opcoes: [0, 5, 10].map(n => [String(n), n ? `${n} dias` : 'Não'] ) })}${campo('faltas', 'Faltas sem justificativa no período', { tipo: 'numero', ph: '0', dica: 'Mais de 5 faltas reduzem os dias (CLT 130).' })}</div>
    ${campo('adiantar13', 'Adiantar a 1ª parcela do 13º', { tipo: 'check' })}
    ${campo('emDobro', 'Férias fora do prazo de concessão (pagas em dobro)', { tipo: 'check' })}
    ${campo('dependentes', 'Dependentes para o IR', { opcoes: [0, 1, 2, 3, 4, 5].map(n => [String(n), String(n)]) })}`;

  el.innerHTML = `<div class="sim-grid">
    <section class="sim-form">${qual === 'rescisao' ? formRescisao() : formFerias()}
      <datalist id="sim-emps">${emps.map(e => `<option value="${esc(e.nome)}">`).join('')}</datalist></section>
    <section class="sim-res" id="sim-res" aria-live="polite"></section></div>
    <p class="muted" style="font-size:11.5px;margin:8px 0 0">Simulação de apoio pela CLT, com as tabelas de INSS e IRRF ${esc(T?.vigencia || '')} das regras${T?.revisarComEscritorio ? ' (a conferir com o escritório)' : ''}. O cálculo oficial é feito pelo escritório. Nada desta tela é guardado nem enviado.</p>`;

  const desenhar = () => {
    const out = el.querySelector('#sim-res');
    if (!T) { out.innerHTML = `<div class="note warn">${icon('alert')}<div>As tabelas de INSS e IRRF não estão nas regras. Atualize as regras para simular.</div></div>`; return; }
    const r = qual === 'rescisao' ? C.simularRescisao(V, T) : C.simularFerias(V, T);
    if (r.erro) { out.innerHTML = `<div class="sim-vazio">${icon('calc', 'ic-lg')}<b>${esc(r.erro)}</b><small>O resultado aparece aqui enquanto você preenche.</small></div>`; return; }
    const lin = (x, sinal) => `<tr><td>${esc(x.rubrica)}${x.isento ? ' <span class="sim-tag" title="Sem INSS e sem IR">isento</span>' : ''}</td><td class="ref">${esc(x.ref || '')}</td><td class="v ${sinal}">${sinal === 'neg' ? '− ' : ''}${C.brl(x.valor)}</td></tr>`;
    const f = r.fgts;
    out.innerHTML = `
      <div class="sim-head"><small>${esc(qual === 'rescisao' ? r.rotulo : 'Férias')}${V.quem ? ` · ${esc(V.quem)}` : ''}</small>
        <div class="sim-liq"><span>Líquido estimado</span><b>${C.brl(r.liquido)}</b></div>
        <div class="sim-tot"><span>A receber <b>${C.brl(r.totalProventos)}</b></span><span>Descontos <b>${C.brl(r.totalDescontos)}</b></span></div></div>
      <table class="sim-tab"><thead><tr><th>Verba</th><th>Ref.</th><th>Valor</th></tr></thead><tbody>
        ${r.proventos.map(x => lin(x, 'pos')).join('')}${r.descontos.map(x => lin(x, 'neg')).join('')}</tbody></table>
      ${qual === 'rescisao' ? `<div class="sim-box">
        <div><span>Aviso prévio</span><b>${r.tipoAviso ? `${esc(C.ROTULO_AVISO[r.tipoAviso])} · ${r.diasAviso} dias` : 'Não se aplica'}</b></div>
        <div><span>Pagar até</span><b>${E.fmtDate(r.datas.pagarAte)}</b></div>
        <div><span>Multa do FGTS (por guia)</span><b>${f.multa ? `${C.brl(f.multa)} · ${Math.round(f.multaPct * 100)}%${f.estimado ? ' · estimada' : ''}` : 'Não há'}</b></div>
        <div><span>FGTS do mês da rescisão</span><b>${C.brl(f.depositoRescisao)}</b></div>
        <div><span>Saque do FGTS</span><b>${f.saque === 1 ? 'Sim, total' : f.saque ? `Sim, até ${Math.round(f.saque * 100)}%` : 'Não'}</b></div>
        <div><span>Seguro-desemprego</span><b>${r.seguroDesemprego ? 'Pode ter direito' : 'Não'}</b></div></div>`
      : r.datas ? `<div class="sim-box"><div><span>Dar o aviso até</span><b>${E.fmtDate(r.datas.avisoAte)}</b></div><div><span>Pagar até</span><b>${E.fmtDate(r.datas.pagarAte)}</b></div><div><span>Último dia</span><b>${E.fmtDate(r.datas.ultimoDia)}</b></div><div><span>Retorno</span><b>${E.fmtDate(r.datas.retorno)} (${E.weekday(r.datas.retorno)})</b></div></div>` : ''}
      ${r.avisos.map(a => `<div class="sim-aviso">${icon('info', 'ic-sm')}<span>${esc(a)}</span></div>`).join('')}
      <div class="actions sim-acoes"><button type="button" class="btn btn-sm" id="sim-copiar">${icon('copy', 'ic-sm')} Copiar resumo</button>
        <button type="button" class="btn btn-sm btn-primary" id="sim-pedir">${icon('fill', 'ic-sm')} Pedir o cálculo ao escritório</button></div>`;
    out.querySelector('#sim-copiar').addEventListener('click', async () => { try { await navigator.clipboard.writeText(C.textoSimulacao(r, V.quem)); ctx.toast('Resumo copiado.'); } catch { ctx.toast('Não consegui copiar.'); } });
    out.querySelector('#sim-pedir').addEventListener('click', () => pedir(r));
  };
  const pedir = (r) => {
    const quem = V.quem && emps.some(e => e.nome === V.quem) ? V.quem : '';
    if (qual === 'ferias') {
      ctx.pedir('calculoFerias', { empregado: quem, valores: { inicioGozo: V.inicio, diasGozo: V.diasGozo, abono: +V.diasAbono ? 'SIM' : 'NÃO', adiantar13: V.adiantar13 ? 'SIM' : 'NÃO' } });
    } else {
      const fim = E.parseDate(V.desligamento);
      const avisoEm = r.tipoAviso === 'trabalhado' && fim ? E.fmtDate(E.addDays(fim, -29)) : V.desligamento;
      ctx.pedir('calculoRescisao', { empregado: quem, valores: { dataDemissao: V.desligamento, ...(r.tipoAviso ? { dataAvisoPrevio: avisoEm } : {}), tipoAviso: r.tipoAviso === 'trabalhado' ? 'TRABALHADO' : r.tipoAviso === 'indenizado' ? 'INDENIZADO' : 'AUSÊNCIA/DISPENSA' } });
    }
  };
  el.querySelectorAll('[data-k]').forEach(i => {
    const ev = i.tagName === 'SELECT' || i.type === 'checkbox' ? 'change' : 'input';
    i.addEventListener(ev, () => {
      if (i.dataset.t === 'data') ctx.maskInput(i);
      V[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value;
      if (i.dataset.k === 'quem') { const e = emps.find(x => x.nome === i.value); const adm = e && E.parseDate(e.admissao); if (adm && qual === 'rescisao') { V.admissao = E.fmtDate(adm); const a = el.querySelector('#sim-admissao'); if (a) a.value = V.admissao; } }
      // a modalidade muda os campos (aviso, fim do contrato): redesenha o formulário mantendo o que foi digitado
      if (i.dataset.k === 'modalidade') { const m = C.MODALIDADES[V.modalidade]; if (!m.aviso.includes(V.aviso)) V.aviso = m.aviso[0] || ''; renderSimulacao(el, qual, ctx); el.querySelector('#sim-modalidade')?.focus(); return; }
      desenhar();
    });
  });
  desenhar();
}
