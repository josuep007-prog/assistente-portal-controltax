// Motor de regras — Agenda em calendário do mês (puro, sem DOM; tudo calculado na hora e só na memória).
// Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md. A tela está em panel/plataforma/agenda.js.
import { addDays, diffDays, iso, makeCalendar, norm, parseDate, today, weekday } from './base.js';
import { pagamentoFerias, pagamentoRescisao } from './prazos.js';
import { prazoLegalDoItem, situacaoEmpregado } from './plataforma.js';

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** Colunas do calendário: semana de segunda a domingo. */
export const DIAS_SEMANA = [['Seg', 'segunda-feira'], ['Ter', 'terça-feira'], ['Qua', 'quarta-feira'], ['Qui', 'quinta-feira'], ['Sex', 'sexta-feira'], ['Sáb', 'sábado'], ['Dom', 'domingo']];
/** Tipos de evento, na ordem da legenda e dos pontinhos. (feriado não é tipo de ponto: marca o dia como não útil.) */
export const TIPOS_AGENDA = ['legal', 'pedido', 'prescricao', 'exp', 'lembrete'];
const ORDEM = Object.fromEntries(TIPOS_AGENDA.map((k, n) => [k, n]));

/* Textos da Agenda. Os do escritório ficam em regras.mensagens.agenda (chega aos clientes sem nova versão);
   estes valem quando as regras (remotas ou em cache) ainda não os trazem. */
export const MSG_AGENDA = {
  tipos: {
    legal: { rotulo: 'Prazo legal', legenda: 'Prazos legais', um: 'prazo legal', varios: 'prazos legais' },
    pedido: { rotulo: 'Das solicitações', legenda: 'Das solicitações', um: 'data de solicitação', varios: 'datas de solicitações' },
    prescricao: { rotulo: 'Prescrição', legenda: 'Prescrição', um: 'prazo de prescrição', varios: 'prazos de prescrição' },
    exp: { rotulo: 'Experiência', legenda: 'Experiência', um: 'fim de experiência', varios: 'fins de experiência' },
    lembrete: { rotulo: 'Lembrete', legenda: 'Lembretes', um: 'lembrete', varios: 'lembretes' }
  },
  titulo: 'Calendário de {mes}',
  hoje: 'hoje', feriado: 'feriado', feriadoGenerico: 'Feriado', naoUtil: 'dia não útil', semEventos: 'sem eventos', evento: 'evento', eventos: 'eventos',
  concluido: 'concluído', concluidos: 'concluídos',
  legendaAjuda: 'Clique num tipo para mostrá-lo ou escondê-lo no calendário.', legendaFeriado: 'Feriado ou dia não útil',
  teclado: 'Setas movem o dia · Enter abre o dia · Page Up e Page Down trocam o mês',
  diaVazio: 'Nada marcado neste dia.',
  diaNaoUtil: 'Dia não útil (fim de semana ou feriado). Cada prazo diz se antecipa para o dia útil anterior.',
  novoLembrete: 'Novo lembrete neste dia', proximos: 'Próximos 30 dias', proximosVazio: 'Nada nos próximos 30 dias.',
  feito: 'Feito', reabrir: 'Reabrir', adiarDia: 'Adiar +1 dia', amanha: 'Para amanhã', abrir: 'Abrir a solicitação', fazerAgora: 'Fazer agora',
  feitoToast: 'Lembrete marcado como feito.', adiadoToast: 'Lembrete adiado para {data}.', reabertoToast: 'Lembrete reaberto.',
  proximoPrazo: 'Próximo prazo: {titulo}', verAgenda: 'Ver na Agenda',
  quandoHoje: 'hoje', quandoAmanha: 'amanhã', quandoEm: 'em {n} dias'
};
/** As mensagens da Agenda: as das regras por cima das padrão (tipos mesclados um a um). */
export function msgAgenda(regras) {
  const r = regras?.mensagens?.agenda || {};
  const tipos = {}; for (const k of TIPOS_AGENDA) tipos[k] = { ...MSG_AGENDA.tipos[k], ...(r.tipos?.[k] || {}) };
  return { ...MSG_AGENDA, ...r, tipos };
}
const preencher = (t, vals) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? '');
export const textoAgenda = (t, vals = {}) => preencher(t, vals);

export const dataPorExtenso = (d) => `${weekday(d)}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
export const rotuloMes = (ano, mes) => `${MESES[mes]} de ${ano}`;

/* ---------- Feriados ----------
   regras.feriados (datas) mexem nos dias úteis de todas as contas; regras.feriadosNomes (data → nome) só dá o nome;
   regras.feriadosMunicipais.itens ({ data, nome, empresa? }) entram no calendário da Agenda — com `empresa`, só para
   a empresa cujo nome tem esse trecho. Quem quiser que o feriado municipal também mude as contas de prazo põe a data em `feriados`. */
export function feriadosDaAgenda(regras, empresa = '') {
  const datas = new Set((regras?.feriados || []).filter(f => parseDate(f)));
  const nomes = {};
  for (const [k, v] of Object.entries(regras?.feriadosNomes || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v) nomes[k] = String(v);
  const e = norm(empresa || '');
  for (const f of regras?.feriadosMunicipais?.itens || []) {
    if (!f || !parseDate(f.data)) continue;
    if (f.empresa && !e.includes(norm(f.empresa))) continue;
    datas.add(f.data); nomes[f.data] = f.nome ? String(f.nome) : 'Feriado municipal';
  }
  return { datas: [...datas].sort(), nomes };
}
/** Calendário (dias úteis) da Agenda: feriados das regras e os municipais da empresa. */
export const calendarioDaAgenda = (regras, empresa = '') => makeCalendar(feriadosDaAgenda(regras, empresa).datas);
export function eventosDosFeriados(de, ate, fer) {
  const out = [];
  for (const f of fer?.datas || []) { const d = parseDate(f); if (d && d >= de && d <= ate) out.push({ d, tipo: 'feriado', titulo: fer.nomes?.[f] || 'Feriado', detalhe: '' }); }
  return out;
}

/* ---------- Eventos que vêm das solicitações já lidas no portal ----------
   Início, retorno e pagamento das férias, pagamento da rescisão, admissão no eSocial e a prescrição (quando o portal
   encerra a solicitação que espera a resposta do cliente). Os títulos são os mesmos dos prazos que nascem do histórico
   deste computador, para a mesma data não aparecer duas vezes (mesclarEventos). Só leitura: nada é gravado. */
export function eventosDasSolicitacoes(itens, hoje = today(), regras = {}, cal = makeCalendar(regras?.feriados)) {
  const out = [];
  for (const i of itens || []) {
    if (!i || ['cancelada', 'prescrita'].includes(i.estado)) continue;
    const dt = i.datas || {}, quem = i.empregado || '', ref = i.numero ? `nº ${i.numero}` : '';
    const nomeTipo = regras?.tipos?.[i.tipo]?.nome || '';
    const aberta = ['aguardando', 'andamento'].includes(i.estado);
    const add = (d, tipo, titulo, extra = '') => {
      if (!d || (!aberta && diffDays(hoje, d) < -7)) return;   // concluída: só o que ainda vale
      out.push({ d, tipo, titulo, detalhe: [quem, ref, extra].filter(Boolean).join(' · '), item: i, origem: 'portal', quem });
    };
    if (i.estado === 'aguardando' && i.prescreveEm != null) add(addDays(hoje, i.prescreveEm), 'prescricao', `Prescrição: responder ${ref ? `a solicitação ${ref}` : 'a solicitação'}`, nomeTipo);
    if (i.tipo === 'avisoFerias' || i.tipo === 'calculoFerias') {
      const ini = dt.inicioFerias;
      if (ini) {
        if (i.tipo === 'avisoFerias') { add(ini, 'pedido', 'Início das férias'); if (dt.dias) add(addDays(ini, dt.dias), 'pedido', 'Retorno das férias'); }
        add(dt.pagamento && i.tipo === 'avisoFerias' ? dt.pagamento : pagamentoFerias(ini, regras, cal), 'pedido', 'Pagamento das férias (limite)');
      }
    } else if (i.tipo === 'avisoRescisao' || i.tipo === 'calculoRescisao') {
      const base = dt.desligamento || dt.avisoPrevio || (i.tipo === 'avisoRescisao' ? dt.aviso : null);
      if (base) add(pagamentoRescisao(base, regras, cal), 'pedido', 'Pagamento das verbas rescisórias (limite)', dt.desligamento || i.tipo === 'calculoRescisao' ? '' : 'estimativa');
    } else if (/^cadastro(Empregado|Estagiario)$/.test(i.tipo)) {
      const p = prazoLegalDoItem(i, regras, cal); if (p?.alvo) add(p.alvo, 'pedido', p.titulo);
    }
  }
  return out;
}

/** Fim da experiência dos funcionários ativos (45 e 90 dias, por padrão). `dispensado(nome, n)` tira os já efetivados. */
export function eventosDaEquipe(empregados, hoje = today(), regras = {}, { dispensado = () => false, nomeCurto = (n) => n } = {}) {
  const out = [];
  for (const e of empregados || []) {
    if (e.ativo === false) continue;
    for (const x of situacaoEmpregado(e, hoje, regras).experiencia) {
      if (dispensado(e.nome, x.n)) continue;
      out.push({ d: x.fim, tipo: 'exp', titulo: `Fim da experiência (${x.n} dias)`, detalhe: nomeCurto(e.nome), empregado: e.nome, n: x.n, quem: e.nome });
    }
  }
  return out;
}

/** Junta os eventos de várias origens sem repetir: a mesma data de solicitação (mesmo título, funcionário e dia) lida do
 *  portal e vinda do histórico deste computador vale uma vez — fica a do portal, que abre a solicitação. */
export function mesclarEventos(lista) {
  const vistos = new Set(), out = [];
  const ord = [...lista].sort((a, b) => (a.origem === 'portal' ? 0 : 1) - (b.origem === 'portal' ? 0 : 1));
  for (const e of ord) {
    if (e.tipo === 'pedido' && !e.pedir) {
      const k = `${norm(e.titulo)}|${norm(e.quem || '')}|${iso(e.d)}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
    }
    out.push(e);
  }
  return out;
}
export const ordenarEventos = (l) => [...l].sort((a, b) => a.d - b.d || (ORDEM[a.tipo] ?? 9) - (ORDEM[b.tipo] ?? 9) || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR'));

/* ---------- O mês ---------- */
/** Monta o mês: semanas de segunda a domingo (as pontas completam a semana) e, em cada dia, os eventos, os pontinhos
 *  (até 3, um por evento pendente, na ordem dos tipos) e o "+N" dos que não couberam. Dia útil = segunda a sexta fora
 *  dos feriados do calendário `cal`. `ocultos` são os tipos desligados na legenda. */
export function montarMes(ano, mes, eventos = [], { hoje = today(), cal = makeCalendar(), nomes = {}, ocultos = [], maxPontos = 3 } = {}) {
  const primeiro = new Date(ano, mes, 1), ultimo = new Date(ano, mes + 1, 0);
  const ini = addDays(primeiro, -((primeiro.getDay() + 6) % 7));
  const fim = addDays(ultimo, 6 - ((ultimo.getDay() + 6) % 7));
  const esconder = new Set(ocultos);
  const porDia = new Map();
  for (const e of eventos) {
    if (!e?.d || e.tipo === 'feriado' || esconder.has(e.tipo)) continue;
    const k = iso(e.d); if (!porDia.has(k)) porDia.set(k, []); porDia.get(k).push(e);
  }
  const hojeIso = iso(hoje);
  const semanas = []; let total = 0;
  for (let s = ini; s <= fim; s = addDays(s, 7)) {
    const sem = [];
    for (let n = 0; n < 7; n++) {
      const d = addDays(s, n), k = iso(d);
      const evs = ordenarEventos(porDia.get(k) || []);
      const pend = evs.filter(e => !e.feito);
      const pontos = pend.slice(0, maxPontos).map(e => e.tipo);
      const fer = cal.isHoliday(d) ? (nomes[k] || 'Feriado') : '';
      if (d.getMonth() === mes) total += pend.length;
      sem.push({ iso: k, d, numero: d.getDate(), doMes: d.getMonth() === mes, hoje: k === hojeIso, fimDeSemana: d.getDay() === 0 || d.getDay() === 6,
        util: cal.isBusiness(d), feriado: fer, eventos: evs, pendentes: pend.length, concluidos: evs.length - pend.length, pontos, mais: Math.max(0, pend.length - maxPontos) });
    }
    semanas.push(sem);
  }
  return { ano, mes, rotulo: rotuloMes(ano, mes), de: iso(ini), ate: iso(fim), semanas, total };
}
/** Frase completa do dia (para o aria-label da célula do calendário). */
export function descreverDia(dia, msg = MSG_AGENDA) {
  const m = { ...MSG_AGENDA, ...msg };
  const p = [dataPorExtenso(dia.d)];
  if (dia.hoje) p.push(m.hoje);
  if (dia.feriado) p.push(dia.feriado === 'Feriado' ? m.feriado : `${m.feriado}: ${dia.feriado}`);
  if (!dia.util) p.push(m.naoUtil);
  if (dia.pendentes) {
    const pend = dia.eventos.filter(e => !e.feito), partes = [];
    for (const k of TIPOS_AGENDA) { const n = pend.filter(e => e.tipo === k).length; if (n) partes.push(`${n} ${n === 1 ? m.tipos[k].um : m.tipos[k].varios}`); }
    p.push(`${dia.pendentes} ${dia.pendentes === 1 ? m.evento : m.eventos}: ${partes.join(', ')}`);
  } else p.push(m.semEventos);
  if (dia.concluidos) p.push(`${dia.concluidos} ${dia.concluidos === 1 ? m.concluido : m.concluidos}`);
  return p.join(', ');
}
/** Navegação por teclado: o dia `delta` dias depois (ou antes) de `isoDia`. */
export const moverDia = (isoDia, delta) => { const d = parseDate(isoDia); return d ? iso(addDays(d, delta)) : isoDia; };
/** `n` meses depois (ou antes), no mesmo dia do mês — ou no último dia, se o mês for mais curto (31/01 → 28/02). */
export function moverMes(isoDia, n) {
  const d = parseDate(isoDia); if (!d) return isoDia;
  const m = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return iso(new Date(m.getFullYear(), m.getMonth(), Math.min(d.getDate(), new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate())));
}
/** Início (segunda) e fim (domingo) da semana do dia — para Home e End. */
export function semanaDe(isoDia) {
  const d = parseDate(isoDia); if (!d) return [isoDia, isoDia];
  const seg = addDays(d, -((d.getDay() + 6) % 7));
  return [iso(seg), iso(addDays(seg, 6))];
}
/** O próximo prazo a partir de hoje (por padrão: legais, das solicitações e experiência), com quantos dias faltam. */
export function proximoPrazo(eventos, hoje = today(), tipos = ['legal', 'pedido', 'exp']) {
  const e = ordenarEventos(eventos || []).find(x => x.d >= hoje && tipos.includes(x.tipo) && !x.feito);
  return e ? { ...e, falta: diffDays(hoje, e.d) } : null;
}
export function quandoTexto(falta, msg = MSG_AGENDA) {
  const m = { ...MSG_AGENDA, ...msg };
  return falta <= 0 ? m.quandoHoje : falta === 1 ? m.quandoAmanha : preencher(m.quandoEm, { n: falta });
}

/* ---------- Ações nos lembretes (listas novas, sem mexer na original) ---------- */
/** "Feito" num dia: o lembrete segue na lista (repetições dos outros dias continuam), só aquele dia fica riscado. */
export const concluirLembrete = (lista, id, isoDia) => (lista || []).map(l => l.id === id && !(l.feitos || []).includes(isoDia) ? { ...l, feitos: [...(l.feitos || []), isoDia] } : l);
export const reabrirLembrete = (lista, id, isoDia) => (lista || []).map(l => l.id === id ? { ...l, feitos: (l.feitos || []).filter(x => x !== isoDia) } : l);
/** Adiar o lembrete daquele dia para `novoIso`: um lembrete de uma vez só muda de data; um que repete deixa de valer naquele
 *  dia (pular) e ganha uma cópia de uma vez só no dia novo (`novoId`). */
export function adiarLembrete(lista, id, isoDia, novoIso, novoId) {
  const l = (lista || []).find(x => x.id === id); if (!l) return lista || [];
  if ((l.rep || 'nao') === 'nao') return lista.map(x => x.id === id ? { ...x, data: novoIso, feitos: [] } : x);
  const copia = { ...l, id: novoId, data: novoIso, rep: 'nao', intervalo: 1, ate: '', pular: [], feitos: [] };
  return [...lista.map(x => x.id === id ? { ...x, pular: [...(x.pular || []), isoDia] } : x), copia];
}
