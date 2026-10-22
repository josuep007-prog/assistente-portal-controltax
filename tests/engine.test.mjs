// Testes do motor de regras (sem navegador).  Rodar:  node tests/engine.test.mjs
import * as E from '../panel/engine.js';
import * as C from '../panel/calculos.js';
import * as D from '../panel/dados.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import '../content/opcoes.js';   // define globalThis.CtOpcoes (escolha de opção nas listas do portal)

const rules = JSON.parse(fs.readFileSync(new URL('../rules/regras.json', import.meta.url), 'utf8'));
const hoje = new Date(2026, 9, 9);
let n = 0;
const t = (nome, fn) => { fn(); n++; console.log('  OK ', nome); };

t('regras.json tem os 10 tipos', () => assert.equal(Object.keys(rules.tipos).length, 10));

t('atestado: documento, empregado, dias e tipo', () => {
  const txt = 'ATESTADO MÉDICO\nAtesto que o Sr. João da Silva necessita de 20 (vinte) dias de repouso a partir de 05/10/2026.\nCID: M54.5\nCRM/SP 123456';
  const r = E.analyzeText(txt, rules, { employees: ['JOAO DA SILVA', 'JOANA FONSECA'] });
  assert.equal(r.documento.id, 'atestado');
  assert.equal(r.tipoSugerido, 'afastamento');
  assert.equal(r.campos.empregado.valor, 'JOAO DA SILVA');
  assert.equal(r.campos.dias.valor, '20');
  assert.equal(r.campos.dataAfastamento.valor, '05/10/2026');
  assert.equal(r.campos.tipoAfastamento.valor, 'Doença período superior a 15 dias');
});

t('pedido de demissão → aviso de rescisão pelo empregado', () => {
  const r = E.analyzeText('Venho por meio desta formalizar meu PEDIDO DE DEMISSÃO. 08/10/2026 JORGE OLIVEIRA ALVES', rules, { employees: ['JORGE OLIVEIRA ALVES'] });
  assert.equal(r.tipoSugerido, 'avisoRescisao');
  assert.equal(r.campos.avisoDadoPor.valor, 'EMPREGADO');
});

t('ficha de admissão: rótulos → campos', () => {
  const r = E.analyzeText('FICHA DE ADMISSÃO\nNome completo: Maria Souza\nCPF: 111.444.777-35\nData de nascimento: 12/03/1995\nNome da mãe: Ana Souza\nCEP: 01310-100   Bairro: Bela Vista', rules, {});
  assert.equal(r.tipoSugerido, 'cadastroEmpregado');
  assert.equal(r.campos.cpf.valor, '111.444.777-35');
  assert.equal(r.campos.mae.valor, 'Ana Souza');
  assert.equal(r.campos.bairro.valor, 'Bela Vista');
});

t('férias: prazos da CLT', () => {
  const m = E.runChecks('avisoFerias', { empregado: 'X', inicioGozo: '16/10/2026', diasGozo: '30', diasAbono: '12', dataPagamento: '15/10/2026' }, [], rules, hoje).map(i => i.mensagem).join('\n');
  assert.match(m, /30 dias de antecedência/);
  assert.match(m, /abono pecuniário/);
  assert.match(m, /sexta-feira/);
  assert.match(m, /2 dias antes do início/);
});

t('CPF e PIS', () => { assert.ok(E.validCPF('529.982.247-25')); assert.ok(!E.validCPF('111.111.111-11')); });

t('dias úteis com feriado (12/10/2026)', () => {
  const cal = E.makeCalendar(rules.feriados);
  assert.equal(cal.businessDaysBetween(new Date(2026, 9, 9), new Date(2026, 9, 16)), 4);
});

t('aba errada: férias escrita em Solicitação Geral', () => {
  assert.equal(E.suggestTipoByText('Preciso das férias do João em novembro', rules, 'geral').tipo, 'avisoFerias');
});

const EMPS = ['FRANCISCO DE MOURA', 'JOANA FONSECA', 'JOAO DA SILVA', 'JORGE OLIVEIRA ALVES', 'RONALDO DE SOUZA'];
t('atestado de até 15 dias → Doença período igual ou inferior a 15 dias', () => {
  const r = E.analyzeText('ATESTADO MÉDICO\nAtesto que o(a) Sr(a). Ronaldo de Souza deverá permanecer afastado por 3 (três) dias a partir de 08/10/2026.\nCRM/SP 654321', rules, { employees: EMPS, tipoAtual: 'afastamento' });
  assert.equal(r.campos.empregado.valor, 'RONALDO DE SOUZA');
  assert.equal(r.campos.dias.valor, '3');
  assert.equal(r.campos.tipoAfastamento.valor, 'Doença período igual ou inferior a 15 dias');
});

t('atestado sem quantidade de dias → tipo fica em aberto (aviso)', () => {
  const r = E.analyzeText('ATESTADO MÉDICO\nAtesto que a paciente Joana Fonseca foi atendida em 09/10/2026, necessitando de afastamento de suas atividades.\nCRM/SP 112233', rules, { employees: EMPS, tipoAtual: 'afastamento' });
  assert.equal(r.campos.empregado.valor, 'JOANA FONSECA');
  assert.equal(r.campos.tipoAfastamento, undefined);
  assert.equal(r.campos.dias, undefined);
});

t('tipo de afastamento por conteúdo: maternidade, CAT e doença profissional', () => {
  const auto = rules.tipos.afastamento.tipoAfastamentoAuto;
  assert.equal(E.inferTipoAfastamento('atestado para licença maternidade de 120 dias', 120, 'atestado', auto).valor, 'Licença maternidade');
  assert.equal(E.inferTipoAfastamento('Comunicação de Acidente de Trabalho', 10, 'cat', auto).valor, 'Acid. Trabalho período igual ou inferior a 15 dias');
  assert.equal(E.inferTipoAfastamento('Comunicação de Acidente de Trabalho', 40, 'cat', auto).valor, 'Acid. Trabalho período superior a 15 dias');
  assert.equal(E.inferTipoAfastamento('afastamento por doença ocupacional', 5, 'atestado', auto).valor, 'Doença profissional período igual ou inferior a 15 dias');
  assert.equal(E.inferTipoAfastamento('atestado', 16, 'atestado', auto).valor, 'Doença período superior a 15 dias');
  assert.equal(E.inferTipoAfastamento('atestado', 15, 'atestado', auto).valor, 'Doença período igual ou inferior a 15 dias');
});

t('todos os tipos sugeridos existem no portal', () => {
  const portal = fs.readFileSync(new URL('../simulador/portal.js', import.meta.url), 'utf8');
  for (const r of rules.tipos.afastamento.tipoAfastamentoAuto) for (const v of [r.valor, r.ate15, r.acima15].filter(Boolean)) assert.ok(portal.includes(`'${v}'`), v);
});

t('assunto do afastamento: Atestado – Nome – data (dias), com alternativas', () => {
  const a = rules.tipos.afastamento.assuntos;
  const v = { documentoPrincipal: 'Atestado médico', empregado: 'RONALDO DE SOUZA', dataAfastamento: '08/10/2026', ...E.derived('afastamento', { dataAfastamento: '08/10/2026', dias: '3' }, rules) };
  assert.equal(E.renderFirst(a, v), 'Atestado médico – RONALDO DE SOUZA – 08/10/2026 (3 dias)');
  assert.equal(E.renderFirst(a, { documentoPrincipal: 'Atestado médico', empregado: 'JOANA FONSECA', dataAfastamento: '09/10/2026' }), 'Atestado médico – JOANA FONSECA – 09/10/2026');
  assert.equal(E.renderFirst(a, { ...v, diasTexto: '1 dia' }), 'Atestado médico – RONALDO DE SOUZA – 08/10/2026 (1 dia)');
});

t('primeiro nome: único → preenche; repetido → pergunta', () => {
  const lista = ['JOAO DA SILVA', 'JOAO PEREIRA', 'RONALDO DE SOUZA'];
  assert.equal(E.parseFreeText('férias do Ronaldo dia 16/11 por 20 dias', rules, { employees: lista, hoje }).campos.empregado.valor, 'RONALDO DE SOUZA');
  assert.equal(E.parseFreeText('o João pediu demissão', rules, { employees: lista, hoje }).campos.empregado, undefined);
  assert.deepEqual(E.employeeCandidates('o João pediu demissão', lista), ['JOAO DA SILVA', 'JOAO PEREIRA']);
  assert.equal(E.parseFreeText('o João Pereira pediu demissão', rules, { employees: lista, hoje }).campos.empregado.valor, 'JOAO PEREIRA');
});

t('texto livre não vai literalmente para a descrição', () => {
  const r = E.parseFreeText('o Ronaldo vai sair de férias dia 16/11 por 20 dias, avisa ele por favor', rules, { employees: ['RONALDO DE SOUZA'], hoje, tipoAtual: 'avisoFerias' });
  assert.equal(r.campos.observacoes, undefined);
  assert.ok(!Object.values(r.campos).some(c => String(c.valor).includes('avisa ele')));
});

/* ---- Leitor de atestados: layouts reais com dados inventados (nomes, CPFs e médicos fictícios) ---- */
const H = new Date(2026, 9, 13);
const EMP = ['CARLA MENDES FARIAS', 'BRUNO TEIXEIRA LOPES', 'RENATA DOS ANJOS PRADO', 'OTAVIO LUZ CAMPOS', 'PRISCILA NOVAES REIS', 'HUGO MARTINS VALE', 'SAMANTA RIOS DUARTE'];
const A = (txt) => E.analyzeText(txt, rules, { employees: EMP, hoje: H });
const val = (r, k) => r.campos[k]?.valor;

t('atestado UPA: "02 dia(s)", "a partir desta data", data por extenso', () => {
  const r = A(`UNIDADE DE PRONTO ATENDIMENTO\nATESTADO MÉDICO\nAtesto que o(a) CARLA MENDES FARIAS, Portador do CPF: 111.222.333-96 e\nnecessita de 02 dia(s) de afastamento do trabalho a partir desta data por motivo de doença.\nSerra-ES, 17 de Setembro de 2026\nANA PAULA FICTICIA - C.R.M. 99999\nNota 1) Este atestado será expedido para justificativa de 1 a 15 dias de afastamento do trabalho.\nNota 2) De acordo com a Portaria MPAS 1722 de 25/07/79`);
  assert.equal(val(r, 'empregado'), 'CARLA MENDES FARIAS');
  assert.equal(val(r, 'dias'), '2');
  assert.equal(val(r, 'dataAfastamento'), '17/09/2026');
  assert.equal(val(r, 'tipoAfastamento'), 'Doença período igual ou inferior a 15 dias');
});

t('atestado de posto: CID10 colado, "1 (um) dia", data com hora', () => {
  const r = A(`ATESTADO\nAtesto, para os devidos fins, que BRUNO TEIXEIRA LOPES, portador(a) do CPF 000.111.222-33,\nrecebeu atendimento na Unidade de Saude no dia 15/09/2026 às\n11:40, com o diagnóstico segundo CID10 N390. Em decorrência, deverá permanecer em afastamento de\nsuas atividades laborativas por um período de 1 (um) dia a partir desta data.\nJOANA EXEMPLO - CRM - ES 12345`);
  assert.equal(val(r, 'empregado'), 'BRUNO TEIXEIRA LOPES');
  assert.equal(val(r, 'dias'), '1');
  assert.equal(val(r, 'dataAfastamento'), '15/09/2026');
  assert.equal(val(r, 'cid'), 'N39.0');
  assert.match(r.campos.dias.fonte, /1 \(um\) dia/);   // trecho do documento aparece como fonte
});

t('atestado digital: "Paciente:" e "3 (TRÊS) DIAS"', () => {
  const r = A(`ATESTADO MÉDICO\nConsultório   Data de emissão: 16/09/2026\nDr(a). MARIA FICTICIA SOUZA   CRM: 52-1234567 - RJ\nPaciente:   Renata dos Anjos Prado    Sexo: Não Informado\nDECLARO PARA OS DEVIDOS FINS QUE A PACIENTE ACIMA NECESSITA FICAR 3 (TRÊS) DIAS AFASTADA DE SUAS ATIVIDADES.\nAtestado Médico assinado digitalmente por MARIA FICTICIA SOUZA em 16/09/2026`);
  assert.equal(val(r, 'empregado'), 'RENATA DOS ANJOS PRADO');
  assert.equal(val(r, 'dias'), '3');
  assert.equal(val(r, 'dataAfastamento'), '16/09/2026');
});

t('ficha de pronto-socorro: ignora nascimento e nome da mãe; "012 dias" do OCR vira 1', () => {
  const r = A(`Paciente........: OTAVIO LUZ CAMPOS o MEsoUNO\nNome da Mãe...: SAMANTA RIOS DUARTE\nNascimento......: 04/02/2005\nProfissional, LIGIA EXEMPLO - CRM/18997  Data e Hora Atual......: 25/09/2026 16:29\natestamos que o Sr(a): OTAVIO LUZ CAMPOS\ndeverá ficar afastado de suas atividades diárias durante\n= 012 dias. a parti de [25/09/2026\ncio: A09-DIARRÉIA`);
  assert.equal(val(r, 'empregado'), 'OTAVIO LUZ CAMPOS');
  assert.equal(val(r, 'dataAfastamento'), '25/09/2026');
  assert.equal(val(r, 'dias'), '1');
  assert.ok(r.campos.dias.conf < 0.6, 'número duvidoso fica marcado para conferir');
  assert.equal(val(r, 'cid'), 'A09');
});

t('atestado de acompanhante: aviso e tipo em aberto; CID com 2 no lugar de Z', () => {
  const r = A(`ATESTADO\nAtesto que PRISCILA NOVAES REIS\ninscrito no CPF Nº 123.456.789-09, necessita de 1 ( hum* ) dia(s) de afastamento do trabalho a\npartir de 22 de setembro de 2026, por estar acompanhando LUCAS NOVAES para o fim de: CONSULTA MÉDICA.\nCID : 2763\nLIGIA FICTICIA\nMédico da estratégia de saúde da família\nConselho: CRM - ES Nº 7076`);
  assert.equal(val(r, 'empregado'), 'PRISCILA NOVAES REIS');
  assert.equal(val(r, 'dias'), '1');
  assert.equal(val(r, 'dataAfastamento'), '22/09/2026');
  assert.equal(val(r, 'cid'), 'Z76.3');
  assert.equal(val(r, 'tipoAfastamento'), undefined);
  assert.ok(r.avisos.some(a => a.id === 'acompanhante'));
});

t('nome do médico não vira funcionário; OCR que corta "Atesto"', () => {
  const r = A(`to que HUGO MARTINS VALE '\nCPF Nº 123.456.789-09, necessita de 1 ( um ) dia(s) de afastamento do trabalho a\npartir de 3 de setembro de 2026.\n03/09/2026\nSAMANTA RIOS DUARTE\nMédico dermatologista\nConselho: CRM - ES Nº 18263`);
  assert.equal(val(r, 'empregado'), 'HUGO MARTINS VALE');
  const r2 = A(`ATESTADO MÉDICO\nAtesto para os devidos fins que ___ necessita de 02 dias de afastamento.\nSAMANTA RIOS DUARTE\nMédica CRM 1234-ES`);
  assert.equal(val(r2, 'empregado'), undefined);
});

t('atestado escolar de dependente: sobrenome igual fica para conferir', () => {
  const r = A(`ATESTADO MÉDICO\nAtesto que Sr(a) TOMAS RIOS DUARTE, portador(a) do CPF: 229.000.111-22,\nnecessita de 1 (Um) dia(s) de afastamento da Escola a partir desta data por motivo de doença.\nData/Hora Entrada: 23/09/2026 08:05:41`);
  assert.equal(val(r, 'empregado'), 'SAMANTA RIOS DUARTE');
  assert.ok(r.campos.empregado.conf < 0.6);
  assert.ok(r.avisos.some(a => a.id === 'escola'));
  assert.ok(r.avisos.some(a => a.id === 'outroNome'));
  assert.equal(val(r, 'dataAfastamento'), '23/09/2026');
});

t('manuscrito lido pelo OCR: "( OL ) um dias", "(03) dias"; nota "01 a 15 dias" ignorada', () => {
  const r = A(`ATESTADO MEDICO\nAtesto para os devidos fins, que = MrouQgR JuUtaQ\nNecessitade( OL ) Zum =Z diasdeafastamentode\nTrabalho a partir desta data.\nNOTA: ESTE ATESTADO SERÁ EXPEDIDO PARA JUSTIFICATIVA DE 01 À 15 DIAS DE AFASTAMENTO. DECRETO Nº 89.312 DE 23/01/1984`);
  assert.equal(val(r, 'dias'), '1');
  assert.equal(val(r, 'dataAfastamento'), undefined);   // decreto antigo não é a data
  assert.equal(val(r, 'empregado'), undefined);
  const r2 = A('ATESTADO\nAtesto para os devidos fins que\nnecessitade (03) WI  (---diasde\nafastamento do trabalho a partir desta data.');
  assert.equal(val(r2, 'dias'), '3');
});

t('receita de remédio não conta como dias; data com ano de 2 dígitos e "dd de mm de aa"', () => {
  assert.equal(E.lerDiasAtestado('SORO FISIOLOGICO 12/12 HORAS POR 5 DIAS'), null);
  assert.equal(E.lerDataAtestado('Data: 04/09/26', H).data, '04/09/2026');
  assert.equal(E.lerDataAtestado('Local e data: Vitória, 02 de 09 de 26', H).data, '02/09/2026');
  assert.equal(E.lerDataAtestado('Nasc: 30/10/2000  atendido em 02/09/2026 às 10:58', H).data, '02/09/2026');
});

t('opção de formulário "( ) acidente do trabalho" não escolhe acidente', () => {
  const r = A('Atestado\nO (A) SR. (A) HUGO MARTINS VALE\nesteve em consulta\nORIENTAÇÃO\nem repouso por 02 dias, contados a partir desta data por\nU doença\nÚ acidente do trabalho');
  assert.equal(val(r, 'tipoAfastamento'), 'Doença período igual ou inferior a 15 dias');
  assert.equal(val(r, 'dias'), '2');
  assert.equal(val(r, 'empregado'), 'HUGO MARTINS VALE');
});

t('declaração de comparecimento sem dias: aviso', () => {
  const r = A('DECLARAÇÃO DE COMPARECIMENTO\nDeclaro que BRUNO TEIXEIRA LOPES compareceu a esta unidade para consulta médica no dia 10/10/2026 das 08:00 às 10:30. CRM 1234-ES');
  assert.ok(r.avisos.some(a => a.id === 'comparecimento'));
  assert.equal(val(r, 'dias'), undefined);
});

t('CID: variações', () => {
  assert.equal(E.lerCid('CID 10: B349'), 'B34.9');
  assert.equal(E.lerCid('CID: JO3'), 'J03');
  assert.equal(E.lerCid('C.I.D. F419'), 'F41.9');
  assert.equal(E.lerCid('sem diagnóstico'), null);
});

/* ---- 1.3.2: correções de envio, datas e prazos ---- */

t('data que não existe não vira outra data', () => {
  assert.equal(E.parseDate('2026-02-30'), null);
  assert.equal(E.parseDate('31 de fevereiro de 2026'), null);
  assert.equal(E.parseDate('30/02/2026'), null);
  assert.equal(E.fmtDate(E.parseDate('29/02/2028')), '29/02/2028');   // ano bissexto continua valendo
  // "dia 31" num mês de 30 dias não pode virar o dia 1 do mês seguinte
  assert.deepEqual(E.findDates('ferias dia 31', new Date(2026, 10, 10)), []);
  assert.equal(E.fmtDate(E.findDates('ferias dia 20', new Date(2026, 10, 10))[0]), '20/11/2026');
  assert.deepEqual(E.findDates('31 de setembro de 2026', hoje), []);
});

t('dia pedido já passou: vai para o mês seguinte, inclusive na virada do ano', () => {
  assert.equal(E.fmtDate(E.findDates('dia 5', new Date(2026, 11, 20))[0]), '05/01/2027');
});

t('fim do aviso prévio inclui o último dia (Súmula 380 do TST)', () => {
  assert.equal(E.fmtDate(E.fimDoAviso(new Date(2026, 8, 15), 30)), '15/10/2026');
  assert.equal(E.fmtDate(E.fimDoAviso(new Date(2026, 8, 15), 45)), '30/10/2026');
});

t('aviso proporcional só quando a empresa demite', () => {
  const base = { anosEmpresa: '5', motivo: 'Dispensa SEM justa causa' };
  assert.equal(E.derived('avisoRescisao', { ...base, avisoDadoPor: 'EMPREGADOR' }, rules).diasAviso, '45');
  assert.equal(E.derived('avisoRescisao', { ...base, motivo: 'Pedido de demissão SEM justa causa', avisoDadoPor: 'EMPREGADO' }, rules).diasAviso, '30');
  // "EMPREGADOR" contém "EMPREGADO": a comparação não pode ser por trecho
  assert.equal(E.derived('avisoRescisao', { ...base, avisoDadoPor: 'EMPREGADOR' }, rules).diasAviso, '45');
});

t('justa causa não gera aviso prévio', () => {
  const r = E.derived('avisoRescisao', { anosEmpresa: '5', motivo: 'Dispensa COM justa causa', avisoDadoPor: 'EMPREGADOR', dataAviso: '15/09/2026' }, rules);
  assert.equal(r.diasAviso, undefined);
  assert.equal(r.fimAviso, undefined);
});

t('INSS a partir do 16º dia só em doença e acidente', () => {
  const com = E.derived('afastamento', { dataAfastamento: '05/10/2026', dias: '20', tipoAfastamento: 'Doença período superior a 15 dias' }, rules);
  assert.equal(com.inicioInss, '20/10/2026');
  const sem = E.derived('afastamento', { dataAfastamento: '05/10/2026', dias: '120', tipoAfastamento: 'Licença maternidade' }, rules);
  assert.equal(sem.inicioInss, undefined);
  // sem tipo escolhido, mantém o aviso geral
  assert.equal(E.derived('afastamento', { dataAfastamento: '05/10/2026', dias: '20' }, rules).inicioInss, '20/10/2026');
});

t('anexo que está só no Assistente não conta como anexado', () => {
  const vals = { empregado: 'JOAO DA SILVA', dataAfastamento: '05/10/2026', dias: '3' };
  const soNoPainel = E.runChecks('afastamento', vals, [{ nome: 'atestado.pdf', documento: 'atestado', pendente: true }], rules, hoje);
  assert.ok(!soNoPainel.some(i => i.nivel === 'ok' && /anexado/.test(i.mensagem)), 'não pode dar "anexado"');
  assert.ok(soNoPainel.some(i => i.nivel === 'erro' && /atestado\.pdf/.test(i.mensagem)), 'avisa que falta anexar no portal');
  const noPortal = E.runChecks('afastamento', vals, [{ nome: 'atestado.pdf', documento: 'atestado' }], rules, hoje);
  assert.ok(noPortal.some(i => i.nivel === 'ok' && /anexado/.test(i.mensagem)));
});

t('recados do escritório têm datas em AAAA-MM-DD', () => {
  for (const a of rules.avisosEscritorio || []) {
    assert.ok(a.id && a.titulo && a.texto, `recado sem id/título/texto: ${JSON.stringify(a)}`);
    for (const k of ['desde', 'ate']) if (a[k]) assert.match(a[k], /^\d{4}-\d{2}-\d{2}$/, `${a.id}.${k} fora do formato`);
  }
});

/* ---- 1.3.3: leitura de documentos ---- */

t('ASO: opção impressa não conta como marcada', () => {
  const aso = 'ATESTADO DE SAÚDE OCUPACIONAL\nTipo de exame: ( ) Admissional (X) Demissional ( ) Periódico\nParecer: (X) Apto ( ) Inapto\nData: 05/10/2026';
  const r = E.readASO(aso);
  assert.equal(r.resultado, 'APTO', 'ASO apto não pode sair como INAPTO');
  assert.equal(r.tipo, 'demissional', 'o tipo é o marcado, não o primeiro da lista');
  // sem nenhuma marca visível, não chuta
  assert.equal(E.readASO('Parecer: ( ) Apto ( ) Inapto').resultado, null);
  // texto corrido continua funcionando
  assert.equal(E.readASO('O trabalhador foi considerado inapto para a função.').resultado, 'INAPTO');
});

t('opcaoMarcada entende (X), [x], ☒ e a marca depois da opção', () => {
  assert.equal(E.opcaoMarcada('( ) Típico (X) Trajeto', ['Típico', 'Trajeto']), 'Trajeto');
  assert.equal(E.opcaoMarcada('[x] Típico [ ] Trajeto', ['Típico', 'Trajeto']), 'Típico');
  assert.equal(E.opcaoMarcada('Típico ☒  Trajeto ☐', ['Típico', 'Trajeto']), 'Típico');
  assert.equal(E.opcaoMarcada('(X) Típico (X) Trajeto', ['Típico', 'Trajeto']), null, 'duas marcadas: não escolhe');
});

t('empate de nome: pergunta em vez de decidir pela ordem da lista', () => {
  const txt = 'Eu, JOSE CARLOS, venho pedir demissão.';
  const lista = ['JOSE CARLOS DA SILVA', 'JOSE CARLOS DA COSTA'];
  const r = E.findEmployeeInText(txt, lista);
  assert.equal(r.option, null);
  assert.deepEqual(r.candidatos.slice().sort(), lista.slice().sort());
  // invertendo a lista, o resultado é o mesmo (antes vencia o último)
  const r2 = E.findEmployeeInText(txt, lista.slice().reverse());
  assert.equal(r2.option, null);
  // nome completo e único continua sendo escolhido
  assert.equal(E.findEmployeeInText(txt, ['JOSE CARLOS DA SILVA', 'ANA PAULA REIS']).option, 'JOSE CARLOS DA SILVA');
  // um nome melhor depois do empate desfaz o empate
  const r3 = E.findEmployeeInText('JOSE CARLOS pediu. Assinado: MARIA SOUZA APARECIDA LIMA',
    ['JOSE CARLOS SILVA', 'JOSE CARLOS COSTA', 'MARIA APARECIDA LIMA']);
  assert.equal(r3.option, 'MARIA APARECIDA LIMA', `saiu ${JSON.stringify(r3)}`);
});

t('classificação: empate não é decidido pela ordem do regras.json', () => {
  const aviso = 'AVISO DE FÉRIAS\nParticipamos-lhe que suas férias serão concedidas.\nPeríodo aquisitivo: 01/03/2025 a 29/02/2026\nPeríodo de gozo: 03/11/2026 a 22/11/2026\nCiente: ______';
  const docs = E.classifyDocument(aviso, rules);
  assert.equal(docs[0].id, 'avisoFeriasAssinado', `saiu ${docs[0].id}`);
});

t('pedido de demissão: a data do aviso não é a da admissão', () => {
  const txt = 'PEDIDO DE DEMISSÃO\nEu, MARIA APARECIDA LIMA, admitida em 10/01/2024, solicito meu desligamento a partir de 20/10/2026.\nSerra-ES, 05 de outubro de 2026.';
  const r = E.analyzeText(txt, rules, { employees: ['MARIA APARECIDA LIMA'] });
  assert.equal(r.campos.dataAviso?.valor, '20/10/2026', `saiu ${r.campos.dataAviso?.valor}`);
});

t('férias: início do gozo não é o do período aquisitivo', () => {
  const txt = 'AVISO DE FÉRIAS\nPeríodo aquisitivo de 01/03/2025 a 29/02/2026\nPeríodo de gozo: 03/11/2026\n20 dias de gozo';
  const r = E.analyzeText(txt, rules, { tipoAtual: 'avisoFerias' });
  assert.equal(r.campos.inicioGozo?.valor, '03/11/2026', `saiu ${r.campos.inicioGozo?.valor}`);
});

t('documentos novos: título de eleitor, TRCT e holerite', () => {
  const ids = new Set((rules.documentos || []).map(d => d.id));
  for (const id of ['titulo', 'trct', 'holerite']) assert.ok(ids.has(id), `falta o documento ${id}`);
  assert.equal(E.classifyDocument('JUSTIÇA ELEITORAL\nTÍTULO DE ELEITOR\nZona 015  Seção 0123', rules)[0].id, 'titulo');
  // todo anexo exigido precisa de um documento que o reconheça
  for (const [k, t] of Object.entries(rules.tipos)) {
    for (const a of t.anexos || []) if (a.documento) assert.ok(ids.has(a.documento), `${k}: anexo aponta para documento inexistente "${a.documento}"`);
  }
});

t('comprovante do CPF não vira título de eleitor no cadastro', () => {
  const txt = 'COMPROVANTE DE SITUAÇÃO CADASTRAL NO CPF\nNome: MARIA APARECIDA LIMA\nCPF: 529.982.247-25\nData da Inscrição: 03/02/2010';
  const r = E.analyzeText(txt, rules, { tipoAtual: 'cadastroEmpregado' });
  assert.equal(r.campos.titulo, undefined, `saiu ${JSON.stringify(r.campos.titulo)}`);
});

/* ---------- Plataforma (2.0) ---------- */
t('solicitações: situação e "aguardando você" pelas regras', () => {
  const a = E.normalizarSolicitacao({ id: 7, status: { description: 'Aguardando o cliente' }, employee: { name: 'JOAO' }, subject: 'Férias', lastUpdate: '2026-10-08T10:00:00' }, 'avisoFerias', rules);
  assert.equal(a.estado, 'aguardando'); assert.ok(a.aguardando); assert.equal(a.empregado, 'JOAO'); assert.equal(E.iso(a.atualizado), '2026-10-08');
  assert.equal(E.normalizarSolicitacao({ status: 'Concluída' }, 'geral', rules).estado, 'concluida');
  assert.equal(E.normalizarSolicitacao({ status: 'Cancelada pelo escritório' }, 'geral', rules).estado, 'cancelada');
  assert.equal(E.normalizarSolicitacao({ status: { name: 'Em andamento' } }, 'geral', rules).estado, 'andamento');
  // formato desconhecido: não quebra
  const v = E.normalizarSolicitacao({}, 'geral', rules); assert.equal(v.estado, 'andamento'); assert.equal(v.atualizado, null);
});

t('lembretes: mensal no dia 31 cai no último dia dos meses curtos; "excluir só este dia"', () => {
  const l = { data: '2026-01-31', rep: 'mensal' };
  const oc = E.ocorrencias(l, new Date(2026, 1, 1), new Date(2026, 3, 30)).map(E.iso);
  assert.deepEqual(oc, ['2026-02-28', '2026-03-31', '2026-04-30']);
  const sem = E.ocorrencias({ ...l, pular: ['2026-03-31'] }, new Date(2026, 1, 1), new Date(2026, 3, 30)).map(E.iso);
  assert.deepEqual(sem, ['2026-02-28', '2026-04-30']);
  assert.equal(E.ocorrencias({ data: '2026-10-05', rep: 'semanal', intervalo: 2, ate: '2026-11-01' }, new Date(2026, 9, 1), new Date(2026, 11, 31)).length, 2);
  const cal = E.makeCalendar(rules.feriados);
  // dia útil: pula fim de semana e o feriado de 12/10
  assert.deepEqual(E.ocorrencias({ data: '2026-10-09', rep: 'util' }, new Date(2026, 9, 9), new Date(2026, 9, 13), cal).map(E.iso), ['2026-10-09', '2026-10-13']);
  assert.equal(E.ocorrencias({ data: '2026-10-09' }, new Date(2026, 9, 1), new Date(2026, 9, 31)).length, 1);
  assert.match(E.resumoRepeticao({ data: '2026-10-10', rep: 'mensal', ate: '2026-12-31' }), /Todo mês, dia 10, até 31\/12\/2026/);
});

t('agenda fixa: 5º dia útil, FGTS antecipado e 13º só em novembro/dezembro', () => {
  const ids = (ano, mes) => Object.fromEntries(E.prazosFixos(rules, ano, mes).map(p => [p.id, E.iso(p.d)]));
  const nov = ids(2026, 10);
  assert.equal(nov.salario, '2026-11-09');   // 02/11 é feriado: 3, 4, 5, 6 e 9
  assert.equal(nov.fgts, '2026-11-19');      // 20/11 é feriado → dia útil anterior
  assert.equal(nov.decimo1, '2026-11-30');
  assert.equal(nov.decimo2, undefined);
  assert.equal(ids(2026, 11).decimo2, '2026-12-18');   // 20/12 é domingo
  assert.equal(ids(2026, 9).decimo1, undefined);
});

t('funcionário: experiência, tempo de casa e férias (estimativa)', () => {
  const novo = E.situacaoEmpregado({ nome: 'VANESSA', admissao: '2026-09-01', ativo: true }, hoje, rules);
  assert.equal(E.iso(novo.experiencia[0].fim), '2026-10-15');
  assert.equal(novo.proxima.titulo, 'Fim da experiência (45 dias)');
  assert.equal(novo.ferias, null);
  const antigo = E.situacaoEmpregado({ nome: 'ANA', admissao: '2024-12-01', ativo: true }, hoje, rules);
  assert.equal(antigo.tempoCasa, '1 ano e 10 meses');
  assert.equal(antigo.ferias.aquisitivo, '01/12/2024 a 30/11/2025');
  assert.equal(E.iso(antigo.ferias.limite), '2026-11-30');
  assert.match(antigo.proxima.titulo, /Conceder férias/);
  assert.equal(E.situacaoEmpregado({ nome: 'X', admissao: '2020-01-01', ativo: false }, hoje, rules).proxima, null);
});

t('solicitações do Onvio: genericStatus por família, vez do cliente e prescrição (mapa do Control Onvio)', () => {
  const h = new Date(2026, 9, 15);
  const f = E.normalizarSolicitacao({ id: 'a1b2', identifier: 1041, genericStatus: 4, lastUpdated: '2026-09-25T10:00:00', clientEmployeeExpanded: { name: 'JOAO DA SILVA' }, staffResponsibleExpanded: { name: 'ANA ANALISTA' }, subject: 'Férias' }, 'avisoFerias', rules, h);
  assert.equal(f.estado, 'aguardando'); assert.equal(f.lado, 'cli'); assert.equal(f.numero, '1041'); assert.equal(f.empregado, 'JOAO DA SILVA'); assert.equal(f.responsavel, 'ANA ANALISTA');
  assert.equal(f.parado, 20); assert.equal(f.prescreveEm, 10);
  assert.equal(E.motivoCliente(f, h, rules), 'prescreve');
  // "Aguardando resposta" (3) é a vez do escritório; em Cadastro, 3 é "Aguardando o cliente"
  assert.equal(E.normalizarSolicitacao({ genericStatus: 3 }, 'afastamento', rules, h).estado, 'andamento');
  const c = E.normalizarSolicitacao({ genericStatus: 3, name: 'MARIA' }, 'cadastroEmpregado', rules, h);
  assert.equal(c.estado, 'aguardando'); assert.equal(c.prescreveEm, null); assert.equal(c.empregado, 'MARIA');
  assert.equal(E.normalizarSolicitacao({ genericStatus: 8 }, 'rubricas', rules, h).estado, 'concluida');
  assert.equal(E.normalizarSolicitacao({ genericStatus: 6 }, 'geral', rules, h).estado, 'prescrita');
  assert.match(E.normalizarSolicitacao({ genericStatus: 42 }, 'geral', rules, h).status, /desconhecida \(código 42\)/);
  // expectativa vencida com o escritório
  const atr = E.normalizarSolicitacao({ genericStatus: 2, dueDate: '2026-10-10T00:00:00', lastUpdated: '2026-10-09' }, 'calculoFerias', rules, h);
  assert.equal(E.motivoCliente(atr, h, rules), 'atrasada');
  const pri = E.prioridadesCliente([atr, f, c], h, rules).map(p => p.motivo);
  assert.deepEqual(pri, ['prescreve', 'responder', 'atrasada']);
  assert.equal(E.progressoCliente(f, rules).limite, 30);
  // todos os tipos com lista têm caminho e família
  for (const [k, t] of Object.entries(rules.tipos)) assert.ok(t.apiLista && t.apiTramites && t.familiaStatus, `${k} sem apiLista/apiTramites/familiaStatus`);
});

t('trâmites do Onvio: ordem, situação pela família, autor e anexos', () => {
  const tr = E.tramitesDe({ items: [
    { created: '2026-10-10T09:00:00', status: 4, description: '<p>Falta a data.</p>', createdByExpanded: { name: 'ANA' }, attachmentsExpanded: [{ name: 'a.pdf' }, null] },
    { created: '2026-10-01T09:00:00', status: 1, description: 'Incluída', createdByContactExpanded: { name: 'Cliente' } },
    { status: 2 }
  ] }, 'avisoFerias', rules);
  assert.equal(tr.length, 2);
  assert.equal(tr[0].autor, 'Cliente'); assert.equal(tr[1].n, 2);
  assert.match(tr[1].situacao, /\S/); assert.deepEqual(tr[1].anexos, ['a.pdf']);
  assert.deepEqual(E.tramitesDe(null, 'geral', rules), []);
});

t('Hoje: avisos sem cálculo e equipe vencendo', () => {
  const h = new Date(2026, 9, 15);
  const N = (it, tipo) => E.normalizarSolicitacao(it, tipo, rules, h);
  const avF = N({ id: 'f1', genericStatus: 4, created: '2026-10-01', lastUpdated: '2026-10-10', clientEmployeeExpanded: { name: 'JOAO DA SILVA' }, vacationStartDate: '2026-11-03' }, 'avisoFerias');
  assert.equal(E.fmtDate(avF.datas.inicioFerias), '03/11/2026');
  const avR = N({ id: 'r1', genericStatus: 2, created: '2026-10-11', clientEmployeeExpanded: { name: 'MARIA SOUZA' }, adviceDate: '2026-10-12' }, 'avisoRescisao');
  let l = E.avisosSemCalculo([avF, avR], h, rules);
  assert.deepEqual(l.map(x => x.tipo), ['rescisao', 'ferias']);   // a rescisão paga antes (12/10 + 10)
  assert.equal(E.fmtDate(l[1].pagamento), '30/10/2026');           // 2 dias antes do início (01/11 é domingo: recua para o dia útil, como nos prazos legais)
  assert.ok(l[1].enviarAte < l[1].pagamento);
  // com o cálculo criado, o aviso sai da lista
  const calc = N({ id: 'c1', genericStatus: 2, created: '2026-10-12', clientEmployeeExpanded: { name: 'João da Silva' } }, 'calculoFerias');
  l = E.avisosSemCalculo([avF, avR, calc], h, rules);
  assert.deepEqual(l.map(x => x.tipo), ['rescisao']);
  // aviso antigo, pagamento muito para trás: fora
  const velho = N({ id: 'f2', genericStatus: 5, created: '2026-05-01', clientEmployeeExpanded: { name: 'ANA' }, paymentDate: '2026-05-20' }, 'avisoFerias');
  assert.equal(E.avisosSemCalculo([velho], h, rules).length, 0);
  // equipe: experiência em 30 dias e férias a vencer em 60
  const eq = E.equipeVencendo([{ nome: 'NOVO', admissao: '2026-09-04', ativo: true }, { nome: 'ANTIGO', admissao: '2024-11-20', ativo: true }, { nome: 'SAIU', admissao: '2026-09-04', ativo: false }], [], h, rules);
  assert.deepEqual(eq.experiencia.map(x => x.nome), ['NOVO']);
  assert.deepEqual(eq.ferias.map(x => x.nome), ['ANTIGO']);
  // com aviso de férias recente, não pede de novo
  const comAviso = N({ genericStatus: 2, created: '2026-10-01', clientEmployeeExpanded: { name: 'ANTIGO' } }, 'avisoFerias');
  assert.equal(E.equipeVencendo([{ nome: 'ANTIGO', admissao: '2024-11-20', ativo: true }], [comAviso], h, rules).ferias.length, 0);
});

t('várias empresas no mesmo login: filtra pela empresa aberta no portal', () => {
  const N = (emp, id) => E.normalizarSolicitacao({ id, genericStatus: 4, clientExpanded: { name: emp, nickname: emp.split(' ')[0] } }, 'geral', rules);
  const l = [N('EMPRESA EXEMPLO SIMPLES NACIONAL LTDA', 'a'), N('OUTRA COMERCIO LTDA', 'b'), N('OUTRA COMERCIO LTDA', 'c')];
  assert.equal(l[0].empresa, 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA'); assert.equal(l[0].empresaApelido, 'EMPRESA');
  assert.deepEqual(E.filtrarPorEmpresa(l, '', 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA').map(i => i.id), ['a']);
  assert.equal(E.filtrarPorEmpresa(l, '*', 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA').length, 3);
  assert.deepEqual(E.filtrarPorEmpresa(l, 'OUTRA COMERCIO LTDA', 'X').map(i => i.id), ['b', 'c']);
  assert.equal(E.filtrarPorEmpresa(l, '', 'NOME QUE NAO BATE').length, 3);   // não achou a empresa do portal: mostra tudo
  assert.equal(E.empresaDoFiltro(l, '', 'empresa exemplo simples nacional ltda'), 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA');
  assert.deepEqual(E.empresasDasSolicitacoes(l).map(e => e.n), [1, 2]);
  assert.equal(E.filtrarPorEmpresa([l[0]], '', 'OUTRA').length, 1);   // uma empresa só: sem filtro
  // várias empresas escolhidas (2.5)
  assert.equal(E.filtrarPorEmpresa(l, ['EMPRESA EXEMPLO SIMPLES NACIONAL LTDA', 'OUTRA COMERCIO LTDA'], 'X').length, 3);
  assert.deepEqual(E.filtrarPorEmpresa(l, ['OUTRA COMERCIO LTDA'], 'X').map(i => i.id), ['b', 'c']);
  assert.deepEqual(E.empresasSelecionadas(l, '', 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA'), ['EMPRESA EXEMPLO SIMPLES NACIONAL LTDA']);
  assert.equal(E.empresasSelecionadas(l, '*', 'X').length, 2);
});

const T = rules.config.tabelas;
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) <= 0.02, `${msg}: ${a} ≠ ${b}`);
const linha = (r, re) => r.proventos.concat(r.descontos).find(x => re.test(x.rubrica))?.valor;

t('Calcular: INSS progressivo, IRRF com desconto simplificado e redutor 2026', () => {
  perto(C.inss(1500, T), 112.5, 'INSS 1.500');
  perto(C.inss(10000, T), 988.10, 'INSS acima do teto');
  perto(C.irrf(10000, C.inss(10000, T), 0, T).imposto, 1569.55, 'IRRF 10.000');
  assert.equal(C.irrf(5000, C.inss(5000, T), 0, T).imposto, 0);          // isento até 5.000 (Lei 15.270)
  perto(C.irrf(6000, C.inss(6000, T), 0, T).imposto, 385.10, 'IRRF 6.000 com redução');
  assert.equal(C.numeroBR('R$ 3.000,50'), 3000.5); assert.equal(C.numeroBR('3.000'), 3000); assert.equal(C.numeroBR('2500.75'), 2500.75);
  assert.equal(C.diasDeDireito(10), 24); assert.equal(C.diasDeDireito(40), 0);
});

t('Calcular: rescisão sem justa causa com aviso indenizado (projeção, avos, descontos)', () => {
  const r = C.simularRescisao({ modalidade: 'semJustaCausa', aviso: 'indenizado', salario: '3.000,00', admissao: '10/03/2024', desligamento: '15/10/2026' }, T);
  assert.equal(r.diasAviso, 36);
  assert.equal(E.fmtDate(r.projecao), '20/11/2026');
  perto(linha(r, /^Saldo de salário/), 1500, 'saldo');
  perto(linha(r, /^Aviso prévio indenizado/), 3600, 'aviso');
  perto(linha(r, /^13º salário proporcional/), 2750, '13º 11/12');
  perto(linha(r, /^Férias proporcionais/), 2000, 'férias 8/12');
  perto(linha(r, /^INSS sobre o 13º/), 223.19, 'INSS 13º');
  perto(r.liquido, 10180.98, 'líquido');
  assert.equal(r.fgts.multaPct, 0.4); assert.ok(r.seguroDesemprego); assert.equal(E.fmtDate(r.datas.pagarAte), '25/10/2026');
});

t('Calcular: pedido de demissão sem cumprir o aviso, justa causa, acordo e contrato a prazo', () => {
  const p = C.simularRescisao({ modalidade: 'pedidoDemissao', aviso: 'naoCumprido', salario: 2000, admissao: '01/02/2026', desligamento: '31/07/2026' }, T);
  perto(linha(p, /^Saldo de salário/), 2000, 'mês cheio = 30 dias');
  perto(linha(p, /^Aviso prévio não cumprido/), 2000, 'desconto do aviso');
  perto(linha(p, /^13º salário proporcional/), 1000, '13º 6/12');
  perto(p.liquido, 2102.64, 'líquido do pedido');
  assert.equal(p.fgts.multa, 0); assert.equal(p.fgts.saque, 0); assert.ok(!p.seguroDesemprego);
  const j = C.simularRescisao({ modalidade: 'justaCausa', salario: 2000, admissao: '01/02/2024', desligamento: '10/07/2026', feriasVencidas: 1 }, T);
  assert.ok(!linha(j, /^13º/) && !linha(j, /^Férias proporcionais/));
  perto(linha(j, /^Férias vencidas/), 2000, 'vencidas na justa causa');
  const a = C.simularRescisao({ modalidade: 'acordo', aviso: 'indenizado', salario: 3000, admissao: '10/03/2024', desligamento: '15/10/2026' }, T);
  perto(linha(a, /^Aviso prévio indenizado/), 1800, 'metade do aviso no acordo');
  assert.equal(a.fgts.multaPct, 0.2); assert.equal(a.fgts.saque, 0.8);
  const c = C.simularRescisao({ modalidade: 'antecipadaEmpregador', salario: 3000, admissao: '01/09/2026', desligamento: '30/09/2026', fimContrato: '15/10/2026' }, T);
  perto(linha(c, /art\. 479/), 750, 'art. 479');
  const e = C.simularRescisao({ modalidade: 'antecipadaEmpregado', salario: 3000, admissao: '01/09/2026', desligamento: '30/09/2026', fimContrato: '15/10/2026' }, T);
  perto(e.descontos.find(x => /art\. 480/.test(x.rubrica)).valor, 750, 'art. 480');
  const x = C.simularRescisao({ modalidade: 'antecipadaEmpregador', clausulaAssecuratoria: true, aviso: 'indenizado', salario: 3000, admissao: '01/09/2026', desligamento: '30/09/2026', fimContrato: '15/10/2026' }, T);
  assert.ok(!linha(x, /art\. 479/) && linha(x, /^Aviso prévio indenizado/));   // cláusula do art. 481: vale como sem justa causa
  const cr = C.simularRescisao({ modalidade: 'culpaReciproca', salario: 3000, admissao: '10/03/2024', desligamento: '15/10/2026' }, T);
  perto(linha(cr, /^13º/), 1375, '13º pela metade na culpa recíproca');
  for (const k of Object.keys(C.MODALIDADES)) assert.ok(!C.simularRescisao({ modalidade: k, salario: 2500, admissao: '01/01/2025', desligamento: '15/10/2026', fimContrato: '30/10/2026' }, T).erro, k);
  assert.ok(C.simularRescisao({ modalidade: 'semJustaCausa', salario: 0, admissao: '01/01/2025', desligamento: '15/10/2026' }, T).erro);
});

t('Calcular: férias com abono, adiantamento do 13º e faltas', () => {
  const f = C.simularFerias({ salario: 3000, diasGozo: 20, diasAbono: 10, adiantar13: true, inicio: '03/11/2026' }, T);
  perto(linha(f, /^Férias$/), 2000, 'férias 20 dias'); perto(linha(f, /^1\/3 constitucional/), 666.67, '1/3');
  perto(linha(f, /^Abono pecuniário/), 1000, 'abono'); perto(linha(f, /^1ª parcela do 13º/), 1500, '13º');
  perto(linha(f, /^INSS sobre as férias/), 215.69, 'INSS das férias');
  assert.equal(E.fmtDate(f.datas.pagarAte), '01/11/2026'); assert.equal(E.fmtDate(f.datas.retorno), '23/11/2026');
  const g = C.simularFerias({ salario: 3000, diasGozo: 20, diasAbono: 10, faltas: 10 }, T);
  assert.ok(g.avisos.some(a => /24 dias/.test(a)));
  perto(linha(C.simularFerias({ salario: 3000, diasGozo: 30, emDobro: true }, T), /^Férias em dobro/), 6000, 'em dobro');
  assert.match(C.textoSimulacao(f, 'JOAO'), /Líquido estimado/);
});

/* ---------- Lote 4: rescisão, férias e fluxo de pedidos (dados inventados) ---------- */
t('documento no pedido irmão: aviso de férias assinado → Cálculo de Férias (início, dias e abono só marcado ou com dias)', () => {
  const base = 'AVISO DE FÉRIAS\nParticipamos que, conforme a lei, V.Sa. gozará suas férias.\nPeríodo de gozo: 03/11/2026 a 02/12/2026\n';
  let r = E.analyzeText(base + '( X ) Abono pecuniário\nCiente: JOAO DA SILVA', rules, { employees: ['JOAO DA SILVA'], tipoAtual: 'calculoFerias' });
  assert.equal(r.documento.id, 'avisoFeriasAssinado');
  assert.equal(r.campos.inicioGozo.valor, '03/11/2026');
  assert.equal(r.campos.diasGozo.valor, '30');            // pelo período (fim − início + 1)
  assert.equal(r.campos.abono.valor, 'SIM');              // opção marcada
  r = E.analyzeText(base + '( ) Abono pecuniário\nCiente', rules, { tipoAtual: 'calculoFerias' });
  assert.equal(r.campos.abono, undefined);                // impresso sem marca: não vira SIM
  r = E.analyzeText(base + 'Dias de abono: 0\nCiente', rules, { tipoAtual: 'calculoFerias' });
  assert.equal(r.campos.abono.valor, 'NÃO');
  r = E.analyzeText(base + 'Abono pecuniário de 10 dias\n20 (vinte) dias de férias\nCiente', rules, { tipoAtual: 'calculoFerias' });
  assert.equal(r.campos.abono.valor, 'SIM'); assert.equal(r.campos.diasGozo.valor, '20');
});

t('documento no pedido irmão: pedido de demissão e aviso do empregador → data e tipo do aviso no Cálculo de Rescisão', () => {
  const carta = 'PEDIDO DE DEMISSÃO\nEu, JORGE OLIVEIRA ALVES, venho por meio desta pedir demissão a partir de 05/10/2026.\nCumprirei o aviso prévio de 30 dias.';
  let r = E.analyzeText(carta, rules, { employees: ['JORGE OLIVEIRA ALVES'], tipoAtual: 'calculoRescisao' });
  assert.equal(r.campos.dataAvisoPrevio.valor, '05/10/2026');   // a chave dataAviso do documento vale no cálculo
  assert.equal(r.campos.tipoAviso.valor, 'TRABALHADO');
  assert.equal(r.campos.motivo.valor, 'Pedido de demissão SEM justa causa');
  r = E.analyzeText('PEDIDO DE DEMISSÃO\nVenho por meio desta pedir demissão. Solicito a dispensa do cumprimento do aviso prévio.\n05/10/2026', rules, { tipoAtual: 'calculoRescisao' });
  assert.equal(r.campos.tipoAviso.valor, 'AUSÊNCIA/DISPENSA');
  const emp = 'AVISO PRÉVIO DO EMPREGADOR\nComunicamos que a partir de 01/10/2026 seu contrato será rescindido sem justa causa.\n( ) Aviso prévio trabalhado   (X) Aviso prévio indenizado';
  r = E.analyzeText(emp, rules, { tipoAtual: 'calculoRescisao' });
  assert.equal(r.documento.id, 'avisoEmpregador');
  assert.equal(r.campos.tipoAviso.valor, 'INDENIZADO');   // impresso com as duas opções: vale a marcada
  assert.equal(r.campos.dataAvisoPrevio.valor, '01/10/2026');
  // o anexo "Aviso prévio ou pedido de demissão assinado" aceita os dois documentos
  const chk = E.runChecks('calculoRescisao', { empregado: 'X', dataDemissao: '10/10/2026', motivo: 'Demitido SEM justa causa' }, [{ nome: 'aviso.pdf', documento: 'avisoEmpregador' }], rules, hoje);
  assert.ok(chk.some(c => c.nivel === 'ok' && /Aviso prévio ou pedido de demissão assinado anexado/.test(c.mensagem)));
  // regra geral de opções por palavra: a CAT antiga (tipoCatPalavras) continua valendo
  assert.equal(E.opcaoPorPalavra('Tipo de CAT: trajeto', E.regrasDeOpcoes(rules.documentos.find(d => d.id === 'cat'))[0]), 'Trajeto');
});

t('motivo da rescisão pelas regras (motivoAuto): experiência, acordo, culpa recíproca, extinção e o tipo de aviso por expressão inteira', () => {
  const emps = ['JOAO DA SILVA', 'RONALDO DE SOUZA'];
  const P = (s, tipoAtual = 'calculoRescisao') => E.parseFreeText(s, rules, { employees: emps, tipoAtual, hoje });
  let r = P('fim do contrato de experiência do João dia 20/10');
  assert.equal(r.campos.motivo.valor, 'Término de contrato de trabalho por tempo determinado');
  assert.equal(r.campos.tipoAviso, undefined); assert.equal(r.campos.dataAvisoPrevio, undefined);   // sem aviso prévio
  assert.equal(P('o João pediu demissão no meio da experiência').campos.motivo.valor, 'Rescisão contrato experiência antecipado pelo empregado');
  assert.equal(P('vamos demitir o Ronaldo antes do fim da experiência').campos.motivo.valor, 'Rescisão contrato experiência antecipado pelo empregador');
  r = P('acordo com o João, último dia 20/10');
  assert.equal(r.campos.motivo, undefined); assert.equal(r.dicas.length, 1);   // acordo: vazio com dica
  assert.equal(P('culpa recíproca, saída dia 20/10').campos.motivo.valor, 'Culpa recíproca');
  assert.equal(P('a empresa vai fechar, desligar o João dia 30/10').campos.motivo.valor, 'Extinção da empresa');
  assert.equal(P('vamos dispensar o João dia 20/10').campos.tipoAviso, undefined);   // "dispensar" sozinho não é tipo de aviso
  assert.equal(P('demitir o João dia 20/10, aviso dispensado').campos.tipoAviso.valor, 'AUSÊNCIA/DISPENSA');
  assert.equal(P('demitir o João, aviso indenizado, dia 20/10').campos.tipoAviso.valor, 'INDENIZADO');
  assert.equal(P('pediu demissão hoje', 'avisoRescisao').campos.avisoDadoPor.valor, 'EMPREGADO');
  // modalidades do Calcular → motivo; aviso da modalidade → rádio do portal
  assert.equal(E.motivoRescisao('', rules, { modalidade: 'fimContrato' }).valor, 'Término de contrato de trabalho por tempo determinado');
  assert.equal(E.motivoRescisao('', rules, { modalidade: 'semJustaCausa' }).valor, 'Demitido SEM justa causa');
  assert.ok(E.motivoRescisao('', rules, { modalidade: 'acordo' }).nenhum);
  assert.equal(E.tipoAvisoDaModalidade('naoCumprido', rules), 'AUSÊNCIA/DISPENSA');
  // documento: "término do contrato de experiência" no aviso do empregador
  const doc = E.analyzeText('AVISO PRÉVIO DO EMPREGADOR\nComunicamos que o seu contrato de experiência termina em 20/10/2026 e não será renovado.', rules, { tipoAtual: 'calculoRescisao' });
  assert.equal(doc.campos.motivo.valor, 'Término de contrato de trabalho por tempo determinado');
  // a simulação vai para as observações sem salário
  const sim = C.simularRescisao({ modalidade: 'semJustaCausa', aviso: 'indenizado', salario: '3000', admissao: '01/02/2024', desligamento: '15/10/2026', feriasVencidas: '1', adiantamento13: '500' }, rules.config.tabelas);
  const lin = C.linhaSimulacao({ feriasVencidas: '1', adiantamento13: '500' }, sim);
  assert.ok(/Dispensa sem justa causa/.test(lin) && /férias vencidas: 1 período/.test(lin) && /13º já adiantado/.test(lin) && !/R\$|3000|3\.000/.test(lin));
});

t('datas que dá para calcular: pagamento das férias, data do aviso, demissão pelo aviso e expectativa de conclusão', () => {
  let s = E.sugeridos('avisoFerias', { inicioGozo: '03/11/2026', diasGozo: '30' }, rules, hoje);
  assert.equal(s.dataPagamento.valor, '30/10/2026');      // 01/11 é domingo: recua para o dia útil anterior
  assert.equal(s.dataAviso.valor, '09/10/2026');           // hoje
  assert.ok(s.conclusao?.valor);                           // prazo do pedido (dias úteis do escritório)
  assert.equal(E.derived('avisoFerias', { inicioGozo: '03/11/2026', diasGozo: '30' }, rules).pagamentoAte, '30/10/2026');   // o mesmo do Hoje
  s = E.sugeridos('calculoRescisao', { dataAvisoPrevio: '01/10/2026', tipoAviso: 'TRABALHADO', motivo: 'Demitido SEM justa causa' }, rules, hoje);
  assert.equal(s.dataDemissao.valor, '31/10/2026');        // fim do aviso (Súmula 380)
  assert.equal(E.sugeridos('calculoRescisao', { dataAvisoPrevio: '01/10/2026', tipoAviso: 'INDENIZADO' }, rules, hoje).dataDemissao.valor, '01/10/2026');
  assert.equal(E.sugeridos('calculoRescisao', { dataDemissao: '31/10/2026', tipoAviso: 'TRABALHADO' }, rules, hoje).dataAvisoPrevio.valor, '01/10/2026');
  assert.equal(E.sugeridos('calculoRescisao', { dataDemissao: '31/10/2026' }, rules, hoje).dataAvisoPrevio, undefined);   // sem tipo de aviso, não sugere
  assert.equal(E.sugeridos('calculoRescisao', { dataAvisoPrevio: '01/10/2026', tipoAviso: 'TRABALHADO', motivo: 'Término de contrato de trabalho por tempo determinado' }, rules, hoje).dataDemissao, undefined);
  // a mesma conta do aviso trabalhado no Calcular e no formulário
  assert.equal(E.fmtDate(E.inicioDoAviso(E.parseDate('31/10/2026'), 30)), '01/10/2026');
  assert.equal(E.fmtDate(E.fimDoAviso(E.parseDate('01/10/2026'), 30)), '31/10/2026');
  // "Programar" férias: 1ª data de início que vale (dia útil fora dos 2 dias antes de domingo/feriado)
  assert.equal(E.fmtDate(E.primeiroInicioFerias(E.parseDate('06/11/2026'), rules)), '09/11/2026');   // sexta não pode, fim de semana não é dia útil
  assert.equal(E.fmtDate(E.primeiroInicioFerias(E.parseDate('10/11/2026'), rules)), '10/11/2026');
});

t('pedir o cálculo com os dados do aviso e o passo seguinte depois do envio', () => {
  const h = new Date(2026, 9, 15);
  const N = (it, tipo) => E.normalizarSolicitacao(it, tipo, rules, h);
  const avF = N({ id: 'f1', identifier: 77, genericStatus: 2, created: '2026-10-01', clientEmployeeExpanded: { name: 'JOAO DA SILVA' }, vacationStartDate: '2026-11-03', vacationDays: 20, bonusDays: 10 }, 'avisoFerias');
  const v = E.valoresDoAviso(avF, rules);
  assert.equal(v.tipo, 'calculoFerias'); assert.equal(v.fonte, 'do aviso nº 77');
  assert.deepEqual(v.valores, { inicioGozo: '03/11/2026', diasGozo: '20', abono: 'SIM' });
  const avR = N({ id: 'r1', genericStatus: 2, created: '2026-10-11', clientEmployeeExpanded: { name: 'MARIA SOUZA' }, adviceDate: '2026-10-12' }, 'avisoRescisao');
  assert.deepEqual(E.valoresDoAviso(avR, rules).valores, { dataAvisoPrevio: '12/10/2026' });
  assert.equal(E.avisoDoFuncionario([avF, avR], 'João da Silva', 'avisoFerias', h), avF);
  assert.equal(E.avisoDoFuncionario([avF], 'MARIA SOUZA', 'avisoFerias', h), null);
  const calc = N({ id: 'c1', genericStatus: 2, created: '2026-10-12', clientEmployeeExpanded: { name: 'JOAO DA SILVA' } }, 'calculoFerias');
  assert.ok(E.temPedidoDe([calc], 'calculoFerias', 'joão da silva', new Date(2026, 9, 10)));
  assert.ok(!E.temPedidoDe([calc], 'calculoFerias', 'joão da silva', new Date(2026, 9, 14)));
  // depois de enviar: aviso de férias → cálculo de férias até (pagamento − prazo do escritório), com os dados do aviso
  let p = E.proximosPassos('avisoFerias', { empregado: 'JOAO DA SILVA', inicioGozo: '03/11/2026', diasGozo: '20', diasAbono: '10' }, rules);
  assert.equal(p.length, 1); assert.equal(p[0].tipo, 'calculoFerias');
  assert.ok(/Cálculo de Férias de JOAO DA SILVA/.test(p[0].titulo));
  assert.ok(p[0].ate < E.parseDate('30/10/2026'));
  assert.deepEqual(p[0].valores, { empregado: 'JOAO DA SILVA', inicioGozo: '03/11/2026', diasGozo: '20', abono: 'SIM' });
  assert.equal(E.proximosPassos('avisoFerias', { empregado: 'X', inicioGozo: '03/11/2026', diasGozo: '30' }, rules)[0].valores.abono, undefined);   // sem dias de abono, sem SIM
  p = E.proximosPassos('avisoRescisao', { empregado: 'MARIA SOUZA', dataAviso: '12/10/2026', motivo: 'Demitido SEM justa causa' }, rules);
  assert.deepEqual(p.map(x => x.tipo), ['calculoRescisao', null]);   // e o exame demissional como lembrete
  assert.equal(p[0].valores.dataAvisoPrevio, '12/10/2026'); assert.equal(p[0].valores.motivo, 'Demitido SEM justa causa');
  assert.ok(p[1].lembrete && /exame demissional/i.test(p[1].titulo));
});

t('experiência: três saídas, motivo certo no aviso de rescisão, tempo de casa, modelos e "Gerar pelo modelo"', () => {
  const s = E.saidasExperiencia('2026-09-01', 45, rules);
  assert.equal(E.fmtDate(s.fim), '15/10/2026'); assert.ok(s.podeProrrogar); assert.equal(s.diasProrrogacao, 45); assert.equal(E.fmtDate(s.fimProrrogacao), '29/11/2026');
  assert.ok(!E.saidasExperiencia('2026-09-01', 90, rules).podeProrrogar);
  assert.ok(rules.config.experienciaSaidas.revisarComEscritorio);
  // aviso de rescisão dentro da experiência: sugere (não escolhe) o motivo de contrato de experiência
  let m = E.sugestaoMotivoExperiencia({ dataAviso: '09/10/2026', motivo: 'Demitido SEM justa causa' }, '2026-09-01', rules, hoje);
  assert.equal(m.valor, 'Rescisão contrato experiência antecipado pelo empregador');
  m = E.sugestaoMotivoExperiencia({ dataDemissao: '15/10/2026' }, '2026-09-01', rules, hoje);
  assert.ok(m.noFim); assert.equal(m.valor, 'Término de contrato de trabalho por tempo determinado');
  assert.equal(E.sugestaoMotivoExperiencia({ avisoDadoPor: 'EMPREGADO' }, '2026-09-01', rules, hoje).valor, 'Rescisão contrato experiência antecipado pelo empregado');
  assert.equal(E.sugestaoMotivoExperiencia({ dataAviso: '09/10/2026' }, '2024-01-10', rules, hoje), null);   // fora da experiência
  assert.equal(E.anosCompletos(E.parseDate('10/10/2020'), hoje), 5);
  // modelo já preenchido pelo pedido (tipo de aviso → frase da carta)
  const md = rules.modelosDocumento.find(x => x.id === 'pedidoDemissao');
  const vals = E.valoresDoModelo(md, { empregado: 'JOAO DA SILVA', tipoAviso: 'AUSÊNCIA/DISPENSA' });
  assert.equal(vals.empregado, 'JOAO DA SILVA'); assert.ok(/dispensa do cumprimento/.test(vals.aviso));
  // conferência: falta a carta de pedido de demissão → "Gerar pelo modelo"
  let chk = E.runChecks('avisoRescisao', { empregado: 'X', motivo: 'Pedido de demissão SEM justa causa', avisoDadoPor: 'EMPREGADO', dataAviso: '09/10/2026' }, [], rules, hoje);
  assert.equal(chk.find(c => c.grupo === 'Anexos').modelo, 'pedidoDemissao');
  // abono de férias: o requerimento passa a ser pedido (com o modelo); sem abono, não
  chk = E.runChecks('avisoFerias', { empregado: 'X', inicioGozo: '10/11/2026', diasGozo: '20', diasAbono: '10' }, [], rules, hoje);
  const req = chk.find(c => /Requerimento de abono/.test(c.mensagem));
  assert.equal(req.nivel, 'erro'); assert.equal(req.modelo, 'abonoFerias');
  chk = E.runChecks('avisoFerias', { empregado: 'X', inicioGozo: '10/11/2026', diasGozo: '30', diasAbono: '0' }, [], rules, hoje);
  assert.equal(chk.find(c => /Requerimento de abono/.test(c.mensagem)).nivel, 'info');
  assert.equal(E.analyzeText('REQUERIMENTO DE ABONO PECUNIÁRIO DE FÉRIAS\nEu requeiro a conversão de 1/3 das férias do período aquisitivo', rules, {}).documento.id, 'requerimentoAbono');
});

t('Conversa (Control Onvio): lado de cada trâmite, o escritório pede algo?, anexo citado sem arquivo', () => {
  const tr = E.tramitesDe([
    { created: '2026-10-01T09:00', status: 1, description: 'Segue em anexo a certidão.', createdByContactExpanded: { name: 'Cliente' } },
    { created: '2026-10-02T09:00', status: 4, description: '<p>Olá! Falta informar a data do pagamento. Qualquer dúvida, estamos à disposição.</p>', createdByExpanded: { name: 'ANA' } }
  ], 'avisoFerias', rules);
  assert.deepEqual(tr.map(x => x.lado), ['cli', 'esc']);
  const v = E.vereditoConversa(tr, rules);
  assert.equal(v.ultimoLado, 'esc'); assert.ok(v.pede); assert.equal(v.frase, 'Falta informar a data do pagamento.');
  assert.ok(!v.anexoSemArquivo);   // depois da resposta do escritório, o cliente não falou em anexo
  // resposta sem pedido (cortesia não conta) → respondida
  assert.ok(!E.pedeAlgo('Segue o recibo de férias. Qualquer dúvida, estamos à disposição.', rules).pede);
  assert.ok(E.pedeAlgo('Pode confirmar o último dia?', rules).pede);
  // cliente cita anexo e nenhum arquivo chegou
  const tr2 = E.tramitesDe([{ created: '2026-10-01', status: 1, description: 'Bom dia, segue anexo o atestado.' }], 'afastamento', rules);
  assert.ok(E.vereditoConversa(tr2, rules).anexoSemArquivo);
  const tr3 = E.tramitesDe([{ created: '2026-10-01', status: 1, description: 'Segue anexo.', attachmentsExpanded: [{ name: 'a.pdf' }] }], 'afastamento', rules);
  assert.ok(!E.vereditoConversa(tr3, rules).anexoSemArquivo);
  // em Cadastro, 3 é o cliente? não: 2 e 4 são do cliente, 3 é "Aguardando você" (escritório)
  assert.deepEqual(E.tramitesDe([{ created: '1', status: 1 }, { created: '2', status: 3 }, { created: '3', status: 4 }], 'cadastroEmpregado', rules).map(x => x.lado), ['cli', 'esc', 'cli']);
});

t('Hoje: respondida sem pedido, casos (duplicada, aba errada, anexo), prazos legais e observações', () => {
  const h = new Date(2026, 9, 16);
  const N = (it, tipo) => E.normalizarSolicitacao(it, tipo, rules, h);
  const a = N({ id: 'a', identifier: 10, genericStatus: 4, lastUpdated: '2026-10-14', created: '2026-10-01', clientEmployeeExpanded: { name: 'JOAO' } }, 'avisoFerias');
  a.veredito = { ultimoLado: 'esc', pede: false };
  assert.equal(E.motivoCliente(a, h, rules), 'respondida');
  a.veredito = { ultimoLado: 'esc', pede: true, frase: 'Falta a data.' };
  assert.equal(E.motivoCliente(a, h, rules), 'responder');
  assert.match(E.porqueMotivo(a, 'responder', rules), /Falta a data/);
  const b = N({ id: 'b', identifier: 11, genericStatus: 2, lastUpdated: '2026-10-15', created: '2026-10-15', clientEmployeeExpanded: { name: 'João' } }, 'avisoFerias');
  const g = N({ id: 'g', identifier: 12, genericStatus: 1, subject: 'Atestado médico da Maria', created: '2026-10-15' }, 'geral');
  const casos = E.casosCliente([a, b, g], rules);
  assert.deepEqual(casos.map(c => c.tipo).sort(), ['abaErrada', 'duplicada']);
  assert.equal(casos.find(c => c.tipo === 'abaErrada').aba, 'afastamento');
  // prazos legais: cálculo de férias com início em 30/10 → pagar até 28/10; admissão em 20/10 → eSocial até 19/10
  const cf = N({ id: 'c', genericStatus: 2, created: '2026-10-10', vacationStartDate: '2026-10-30T00:00:00' }, 'calculoFerias');
  const ad = N({ id: 'd', genericStatus: 2, created: '2026-10-21', name: 'NOVA', admissionDate: '2026-10-20T00:00:00' }, 'cadastroEmpregado');
  const pz = E.prazosLegaisCliente([cf, ad], h, rules);
  assert.deepEqual(pz.map(p => [p.titulo, E.fmtDate(p.alvo)]), [['Admissão no eSocial', '19/10/2026'], ['Pagamento das férias', '28/10/2026']]);
  assert.ok(pz[0].retroativa);
  const obs = E.observacoesCliente(N({ genericStatus: 2, created: '2026-10-10' }, 'avisoFerias'), { inicioFerias: new Date(2026, 10, 3) }, rules, h);
  assert.ok(obs[0].alerta && /18 dias/.test(obs[0].texto));        // aviso com menos de 30 dias
  assert.ok(obs.some(o => /02\/11\/2026|30\/10\/2026/.test(o.texto)));   // pagamento antecipado para dia útil
});

t('Dados (Control Onvio): campos em português, destaques e sem dado de saúde', () => {
  const r = D.camposDetalhe({ id: 'x', subject: 'Férias', vacationStartDate: '2026-11-03T00:00:00', grantedBy: 'EMPLOYER', cid: 'M54', clientEmployeeExpanded: { name: 'JOAO', maritalStatus: 'MARRIED', hireDate: '2024-01-02T00:00:00' }, attachmentsExpanded: [{ id: '1', name: 'a.pdf' }] });
  const todos = r.grupos.flatMap(g => g.campos);
  assert.ok(todos.some(c => c.k === 'Início das férias' && c.v === '03/11/2026' && c.destaque));
  assert.ok(todos.some(c => c.v === 'Empregador') && todos.some(c => c.v === 'Casado(a)'));
  assert.ok(!todos.some(c => /M54/.test(c.v)));
  assert.deepEqual(r.anexos, ['a.pdf']);
  // valores que o Onvio manda em PascalCase e palavras soltas em inglês também saem em português
  const pc = D.camposDetalhe({ reason: 'ApprenticeContractTermination', terminationType: 'EarlyTerminationByEmployee', situacao: 'Active', nome: 'Maria', codigo: 'XyzAbc' }).grupos.flatMap(g => g.campos);
  assert.ok(pc.some(c => c.k === 'Motivo' && c.v === 'Término do contrato de aprendizagem'));
  assert.ok(pc.some(c => c.v === 'Rescisão antecipada pelo empregado') && pc.some(c => c.v === 'Ativo') && pc.some(c => c.v === 'Maria') && pc.some(c => c.v === 'XyzAbc'));
});

/* ---- Texto livre: datas, quantidades, pedido, funcionário, correção, folha, vários pedidos e dúvidas (nomes inventados) ---- */
const SAB = new Date(2026, 9, 17), QUA = new Date(2026, 9, 14), JAN = new Date(2027, 0, 8);
const FUNC = ['RONALDO DE SOUZA', 'CARLA MENDES FARIAS', 'MARIA APARECIDA LIMA', 'JOAO DA SILVA', 'JOSE CARLOS PEREIRA', 'JOSE ANTUNES', 'FRANCISCO DE MOURA'];
const L = (txt, ctx = {}) => E.parseFreeText(txt, rules, { employees: FUNC, hoje: SAB, ...ctx });
const V = (r) => Object.fromEntries(Object.entries(r.campos).map(([k, c]) => [k, c.valor]));
const FD = (txt, h = SAB, sentido) => E.findDates(txt, h, { sentido, rules }).map(E.fmtDate);

t('datas: passada, que vem, próxima, 1º e "segunda via" não é data', () => {
  assert.deepEqual(FD('segunda passada'), ['12/10/2026']);
  assert.deepEqual(FD('sexta que vem'), ['23/10/2026']);
  assert.deepEqual(FD('próxima segunda'), ['19/10/2026']);
  assert.deepEqual(FD('segunda via da guia'), []);
  assert.deepEqual(FD('segunda parcela do 13'), []);
  assert.deepEqual(FD('1º de novembro'), ['01/11/2026']);
  assert.deepEqual(FD('dia 1º'), ['01/11/2026']);
  assert.deepEqual(FD('3 de nov'), ['03/11/2026']);
  assert.deepEqual(FD('daqui a 15 dias'), ['01/11/2026']);
  assert.deepEqual(FD('semana que vem'), ['19/10/2026']);
  assert.deepEqual(FD('dia 5 do mês que vem'), ['05/11/2026']);
  assert.deepEqual(FD('quer vender 1/3'), []);
  assert.deepEqual(FD('10 mais'), []);
});

t('datas: sentido por tipo (afastamento olha para trás, rescisão fica perto de hoje)', () => {
  assert.equal(rules.tipos.afastamento.sentidoDatas, 'passado');
  assert.equal(rules.tipos.avisoRescisao.sentidoDatas, 'perto');
  // em janeiro, "28/12" do atestado é do ano anterior; nas férias continua indo para a frente
  assert.deepEqual(FD('atestado a partir de 28/12', JAN, 'passado'), ['28/12/2026']);
  assert.deepEqual(FD('a partir de 28/12', JAN), ['28/12/2027']);
  assert.deepEqual(FD('desde o dia 13', SAB, 'passado'), ['13/10/2026']);
  assert.deepEqual(FD('segunda', QUA, 'passado'), ['12/10/2026']);
  assert.deepEqual(FD('segunda', QUA, 'perto'), ['12/10/2026']);
  assert.deepEqual(FD('sexta', QUA, 'perto'), ['16/10/2026']);
  assert.equal(V(L('atestado do Ronaldo segunda passada, 2 dias')).dataAfastamento, '12/10/2026');
  assert.equal(V(L('atestado do Ronaldo desde o dia 13')).dataAfastamento, '13/10/2026');
  assert.equal(V(L('atestado do Ronaldo a partir de 28/12', { hoje: JAN })).dataAfastamento, '28/12/2026');
  assert.equal(V(L('o Ronaldo foi demitido dia 15', { tipoAtual: 'avisoRescisao' })).dataAviso, '15/10/2026');
  assert.equal(V(L('férias do Ronaldo dia 13')).inicioGozo, '13/11/2026');   // férias: como antes
});

t('quantidades: por extenso, abono, gozo, "daqui a" e 13º só com décimo', () => {
  assert.equal(E.numeroPorExtenso('vinte e cinco'), 25);
  assert.equal(E.numeroPorExtenso('quarenta'), 40);
  assert.equal(V(L('trinta dias de férias a partir do dia 10 para a Carla')).diasGozo, '30');
  const vt = V(L('férias da Carla: vai vender 10 dias e tirar 20, a partir de 03/11'));
  assert.equal(vt.diasGozo, '20'); assert.equal(vt.diasAbono, '10');
  const ab = L('aviso de férias da Carla 03/11 com abono');
  assert.equal(ab.campos.diasAbono.valor, '10'); assert.ok(ab.campos.diasAbono.conf < 0.6);   // sugestão para conferir
  assert.equal(V(L('aviso de férias da Carla 03/11 por 20 dias com abono')).diasAbono, '10');
  const c1 = V(L('cálculo de férias da Carla a partir do dia 13, 30 dias'));
  assert.equal(c1.adiantar13, undefined); assert.equal(c1.diasGozo, '30');
  const c2 = V(L('cálculo de férias da Carla, quer vender 1/3, a partir de 3/11'));
  assert.equal(c2.abono, 'SIM'); assert.equal(c2.inicioGozo, '03/11/2026');
  const c3 = V(L('calcular férias da Carla 03/11 vinte dias sem adiantar o 13º, sem abono'));
  assert.equal(c3.diasGozo, '20'); assert.equal(c3.adiantar13, 'NÃO'); assert.equal(c3.abono, 'NÃO');
  assert.equal(V(L('cálculo de férias da Carla 03/11 adiantar o 13º')).adiantar13, 'SIM');
  assert.equal(V(L('férias da Carla daqui a 15 dias')).diasGozo, undefined);
  const sem = L('férias da Carla dia 10/11 por uma semana');
  assert.equal(sem.campos.diasGozo.valor, '7'); assert.ok(sem.campos.diasGozo.conf < 0.6);
});

t('intervalos e "preciso até" → expectativa de conclusão', () => {
  const a = L('férias do Ronaldo de 03/11 a 22/11');
  assert.equal(V(a).inicioGozo, '03/11/2026'); assert.equal(V(a).diasGozo, '20');
  assert.equal(V(L('férias do Ronaldo de 3 a 22 de novembro')).inicioGozo, '03/11/2026');
  assert.equal(V(L('férias do Ronaldo entre 03/11 e 22/11')).diasGozo, '20');
  const b = L('férias do Ronaldo de 03/11 a 22/11 por 30 dias');   // a conta não bate: fica para conferir
  assert.equal(b.campos.diasGozo.valor, '30'); assert.ok(b.campos.diasGozo.conf < 0.6);
  const p = V(L('férias da Carla dia 10/11, preciso até sexta'));
  assert.equal(p.inicioGozo, '10/11/2026'); assert.equal(p.conclusao, '23/10/2026');
  const p2 = V(L('atestado do Ronaldo de 2 dias ontem, prazo dia 20'));
  assert.equal(p2.dataAfastamento, '16/10/2026'); assert.equal(p2.conclusao, '20/10/2026');
  assert.equal(V(L('do dia 13 ao dia 16 o Ronaldo ficou de atestado')).dias, '4');
});

t('pedido: radicais, erro de digitação, pesos, palavras que não contam e cartões de escolha', () => {
  const tp = (x) => E.suggestTipoByText(x, rules, null)?.tipo;
  assert.equal(tp('o Ronaldo foi demitido'), 'avisoRescisao');
  assert.equal(tp('fériaz do Ronaldo'), 'avisoFerias');
  assert.equal(tp('atestdo do Ronaldo de 2 dias'), 'afastamento');
  assert.equal(tp('contratar estagiária'), 'cadastroEstagiario');
  // "folha de pagamento" não é rubrica: desde o lote 6 vai para a Solicitação Geral (catálogo: holerites, Pessoal)
  assert.equal(tp('folha de pagamento de setembro'), 'geral');
  assert.equal(L('calcular rescisão do Ronaldo, aviso indenizado, último dia 20/10').tipoSugerido, 'calculoRescisao');
  const res = E.escolhaPara('calcular rescisão do Ronaldo, aviso indenizado', rules);
  assert.equal(res.id, 'rescisao'); assert.equal(E.destaqueEscolha('calcular rescisão do Ronaldo, aviso indenizado', res), 'calculoRescisao');
  assert.equal(E.destaqueEscolha('aviso de férias', E.escolhaPara('aviso de férias', rules)), 'avisoFerias');
  assert.ok(E.escolhaPara('o Ronaldo vai sair de férias', rules).ambos);
  const f = E.escolhaPara('a Carla faltou ontem', rules);
  assert.equal(f.id, 'faltou'); assert.deepEqual(f.tipos, ['afastamento', 'rubricas']);
  assert.equal(E.destaqueEscolha('a Carla faltou ontem sem atestado', E.escolhaPara('a Carla faltou ontem sem atestado', rules)), 'rubricas');
  assert.equal(E.escolhaPara('atestado da Carla, ela faltou ontem', rules), null);
  // empate de verdade vira cartão com os dois pedidos
  const emp = E.escolhaPara('licença e registro', rules);
  assert.equal(emp.id, 'empate'); assert.deepEqual([...emp.tipos].sort(), ['afastamento', 'cadastroEmpregado']);
});

t('funcionário: palpite por apelido, sobrenome e uma letra (pergunta, não preenche); só quando o pedido tem o campo', () => {
  const r1 = L('férias do Ronado dia 10/11');
  assert.equal(r1.campos.empregado, undefined); assert.equal(r1.palpite.nome, 'RONALDO DE SOUZA'); assert.equal(r1.palpite.trecho, 'Ronado');
  assert.equal(L('férias do Souza dia 10/11').palpite.porque, 'sobrenome');
  const ze = L('férias do Zé Carlos dia 10/11');
  assert.equal(ze.palpite.nome, 'JOSE CARLOS PEREIRA'); assert.equal(ze.palpite.porque, 'apelido');
  assert.equal(L('férias do Chico dia 10/11').palpite.nome, 'FRANCISCO DE MOURA');
  const adm = L('vamos admitir a Maria Souza');
  assert.equal(adm.tipoSugerido, 'cadastroEmpregado'); assert.equal(adm.campos.empregado, undefined); assert.equal(adm.palpite, null);
});

t('correção na mesma frase', () => {
  const a = L('férias do Ronaldo dia 10/11, não, é dia 12/11');
  assert.equal(V(a).inicioGozo, '12/11/2026'); assert.equal(V(a).empregado, 'RONALDO DE SOUZA'); assert.deepEqual(a.corrigidos, ['inicioGozo']);
  const b = V(L('atestado do Ronaldo de 3 dias, na verdade 20 dias'));
  assert.equal(b.dias, '20'); assert.equal(b.tipoAfastamento, 'Doença período superior a 15 dias');
  assert.equal(V(L('o Ronaldo, na verdade, vai sair de férias dia 10/11')).inicioGozo, '10/11/2026');
});

t('variáveis da folha: competência, "vale" e uma linha por funcionário', () => {
  assert.equal(V(L('horas extras de dezembro', { hoje: JAN })).competencia, '12/2026');
  assert.equal(V(L('horas extras de outubro')).competencia, '10/2026');
  assert.equal(V(L('faltas do mês passado')).competencia, '09/2026');
  assert.equal(V(L('comissões deste mês')).competencia, '10/2026');
  assert.equal(V(L('desconto de vale transporte')).tipoLancamento, 'MENSAL');
  assert.equal(V(L('vale salarial do Ronaldo R$ 500')).tipoLancamento, 'ADIANTAMENTO');
  assert.ok(rules.tipos.rubricas.dicionarioRubricas.revisarComEscritorio);
  const r = L('Ronaldo fez 10 horas extras, Carla 2 faltas e 1 atraso');
  assert.deepEqual(r.linhas.map(l => [l.empregado, l.rubrica, l.valor]), [['RONALDO DE SOUZA', 'Horas extras 50%', '10'], ['CARLA MENDES FARIAS', 'Faltas', '2'], ['CARLA MENDES FARIAS', 'Atrasos', '1']]);
  assert.match(r.campos.tabelaRubricas.valor, /• RONALDO DE SOUZA — Horas extras 50%: 10 horas/);
  assert.ok(!/fez/.test(r.campos.tabelaRubricas.valor));   // itens entendidos, não o texto
});

t('vários pedidos numa frase: um por funcionário (herda o comum) e férias em dois períodos', () => {
  const P = (x) => E.dividirPedidos(x, rules, { employees: FUNC, hoje: SAB }).map(p => [p.tipo, V(p)]);
  assert.deepEqual(P('férias do Ronaldo dia 10/11 por 20 dias e da Carla dia 01/12 por 30'), [
    ['avisoFerias', { empregado: 'RONALDO DE SOUZA', inicioGozo: '10/11/2026', diasGozo: '20' }],
    ['avisoFerias', { empregado: 'CARLA MENDES FARIAS', inicioGozo: '01/12/2026', diasGozo: '30' }]]);
  const at = P('atestado da Maria de 2 dias ontem e do João de 1 dia hoje');
  assert.deepEqual(at.map(([tp, v]) => [tp, v.empregado, v.dataAfastamento, v.dias]), [['afastamento', 'MARIA APARECIDA LIMA', '16/10/2026', '2'], ['afastamento', 'JOAO DA SILVA', '17/10/2026', '1']]);
  const per = P('férias do Ronaldo em dois períodos: 10/11 por 20 dias e 01/12 por 10 dias');
  assert.deepEqual(per.map(([, v]) => [v.empregado, v.inicioGozo, v.diasGozo]), [['RONALDO DE SOUZA', '10/11/2026', '20'], ['RONALDO DE SOUZA', '01/12/2026', '10']]);
  const junt = P('férias do Ronaldo e da Carla dia 10/11 por 30 dias');
  assert.equal(junt[0][1].inicioGozo, '10/11/2026'); assert.equal(junt[1][1].diasGozo, '30');
  assert.deepEqual(P('férias do Ronaldo dia 10/11 por 20 dias'), []);
  assert.deepEqual(P('Ronaldo 10 horas extras, Carla 2 faltas'), []);   // a folha é um pedido só
});

t('dúvidas: pergunta, radical e as novas (13º, prazos de férias, pró-labore)', () => {
  assert.ok(E.ehPergunta('posso mandar foto do atestado?', rules));
  assert.ok(E.ehPergunta('como mando vários atestados', rules));
  assert.ok(!E.ehPergunta('férias do Ronaldo dia 10/11', rules));
  const q = (x) => E.buscarFaq(x, rules)[0]?.pergunta;
  assert.equal(q('posso mandar foto do atestado?'), 'Posso mandar foto do atestado?');
  assert.equal(q('como mando vários atestados?'), 'Como mando vários atestados de uma vez?');
  assert.match(q('quando pago o 13º?'), /13º/);
  assert.match(q('prazos de férias'), /prazos das férias/);
  assert.match(q('pró-labore do sócio'), /pró-labore/);
  assert.ok(rules.faq.filter(f => f.revisarComEscritorio).length >= 3);
});

t('texto livre continua sem ir para a descrição (correção, folha e vários pedidos)', () => {
  for (const txt of ['férias do Ronaldo dia 10/11, não, é dia 12/11, avisa ele por favor', 'Ronaldo fez 10 horas extras, avisa ele por favor']) {
    const r = L(txt);
    assert.ok(!Object.values(r.campos).some(c => /avisa ele/.test(String(c.valor))), txt);
  }
});

t('listas do portal: a comparação do conteúdo é a mesma do motor', () => {
  const pares = [['PARDO', 'Parda'], ['Nubank', '260 - Nu Pagamentos'], ['JOAO', 'JOAO DA SILVA'], ['Superior completa', 'Superior completo'], ['Sem justa causa', 'Demitido SEM justa causa'], ['xyz', 'Brasil'], ['São Paulo', 'SAO PAULO']];
  for (const [a, b] of pares) assert.equal(globalThis.CtOpcoes.similaridade(a, b), E.similarity(a, b), `${a} × ${b}`);
});

t('listas do portal: escolha exata, aproximada, sugestões e funcionário', () => {
  const O = globalThis.CtOpcoes;
  const raca = ['Branca', 'Preta', 'Parda', 'Amarela', 'Indígena', 'Não informado'];
  assert.deepEqual(O.escolher('parda', raca), { opcao: 'Parda', score: 1, exata: true, sugestoes: [] });
  const sup = O.escolher('Superior completa', ['Superior incompleto', 'Superior completo', 'Médio completo']);
  assert.equal(sup.opcao, 'Superior completo'); assert.equal(sup.exata, false);
  // "Prada" fica no meio de Parda e Preta: não escolhe sozinho, sugere as duas
  const pr = O.escolher('Prada', raca);
  assert.equal(pr.opcao, null); assert.deepEqual(pr.sugestoes.slice(0, 2).sort(), ['Parda', 'Preta']);
  // funcionário: pedaço de nome nunca basta; abaixo de 0,9 pergunta
  const emp = ['JOAO DA SILVA', 'JOANA FONSECA', 'JORGE OLIVEIRA ALVES'];
  assert.equal(O.escolher('JOAO', emp, { pessoa: true }).opcao, null);
  assert.equal(O.escolher('JOAO DA SILVA', emp, { pessoa: true }).opcao, 'JOAO DA SILVA');
  assert.equal(O.escolher('JOAO DA SILVAA', emp, { pessoa: true }).opcao, 'JOAO DA SILVA');
  assert.equal(O.escolher('JORGE ALVES', emp, { pessoa: true }).opcao, null);
});

t('regras: apelidos de opções, campos novos do cadastro e única opção', () => {
  const al = (v) => Object.entries(rules.aliasesOpcoes).find(([k]) => !k.startsWith('_') && E.norm(k) === E.norm(v))?.[1];
  assert.equal(al('pardo'), 'Parda'); assert.equal(al('2º grau completo'), 'Médio completo'); assert.equal(al('Nubank'), '260 - Nu Pagamentos'); assert.equal(al('Itaú'), '341 - Itaú Unibanco');
  const c = rules.tipos.cadastroEmpregado.campos; const ordem = Object.keys(c);
  for (const [k, fc] of [['matricula', 'registration'], ['servico', 'serviceExpanded'], ['categoria', 'category'], ['vinculo', 'employmentRelationship'], ['seguroDesemprego', 'unemploymentInsuranceSituation'], ['cartaoPonto', 'frequencyCard'], ['tipoEndereco', 'addressType']]) { assert.equal(c[k].fc, fc); assert.equal(c[k].calibrar, true); }
  // ordem do preenchimento = ordem das regras: UF antes do município, país → UF → município de nascimento
  assert.ok(ordem.indexOf('uf') < ordem.indexOf('municipio') && ordem.indexOf('paisNascimento') < ordem.indexOf('ufNascimento') && ordem.indexOf('ufNascimento') < ordem.indexOf('municipioNascimento'));
  for (const tp of ['avisoRescisao', 'calculoRescisao', 'afastamento']) assert.equal(Object.keys(rules.tipos[tp].campos).indexOf('empregado'), 0, tp);
  const u = rules.config.escolherUnicaOpcao;
  assert.equal(u.revisarComEscritorio, true); assert.ok(u.campos.includes('centroCusto') && u.campos.includes('sindicato'));
  for (const k of u.campos) assert.equal(E.resolveTipo(rules, 'cadastroEstagiario').campos[k]?.tipo, 'combo', k);
});

/* ---------- Lote 3: cadastro e documentos pessoais ---------- */
t('cadastro: repetir, histórico e modelo levam só os campos da empresa', () => {
  const pessoa = { nome: 'FULANA DE TESTE', cpf: '529.982.247-25', mae: 'MAE DE TESTE', cep: '29000-000', endereco: 'Rua Inventada', banco: '001 - Banco do Brasil', sexo: 'Feminino', racaCor: 'Parda', estadoCivil: 'Solteiro', municipioNascimento: 'Vitória', deficiencia: 'Não', possuiDependentes: 'Sim', agencia: '1234', dataAdmissao: '03/11/2026',
    cargo: 'VENDEDOR', departamento: 'COMERCIAL', jornada: '44 HORAS', contratoExperiencia: '45', prorrogacao: '45', sindicato: 'SINDICATO X', assunto: 'Admissão', descricao: 'texto' };
  const r = E.valoresReaproveitaveis('cadastroEmpregado', pessoa, rules);
  assert.deepEqual(Object.keys(r).sort(), ['cargo', 'contratoExperiencia', 'departamento', 'jornada', 'prorrogacao', 'sindicato']);
  // outros pedidos: como antes (menos assunto, descrição e CID)
  assert.deepEqual(E.valoresReaproveitaveis('avisoFerias', { empregado: 'JOAO', inicioGozo: '10/11/2026', assunto: 'x', cid: 'M54' }, rules), { empregado: 'JOAO', inicioGozo: '10/11/2026' });
  // histórico de um cadastro enviado: nome, datas da Agenda e campos da empresa
  const h = E.valoresParaHistorico('cadastroEmpregado', pessoa, 'enviado', rules);
  for (const k of ['cpf', 'mae', 'cep', 'endereco', 'banco', 'sexo', 'racaCor', 'agencia', 'descricao']) assert.equal(h[k], undefined, k);
  assert.equal(h.nome, 'FULANA DE TESTE'); assert.equal(h.dataAdmissao, '03/11/2026'); assert.equal(h.cargo, 'VENDEDOR');
  // começado e não enviado: guarda tudo (para continuar), menos CID/descrição
  assert.equal(E.valoresParaHistorico('cadastroEmpregado', pessoa, 'preenchido', rules).cpf, '529.982.247-25');
  assert.equal(rules.config.camposDaEmpresa.revisarComEscritorio, true);
});

t('cadastro: sugestões da última admissão, padrões da empresa e 45 + 45 (confiança baixa)', () => {
  const R = { ...rules, empresas: { 'EXEMPLO': { padroes: { departamento: 'ADMINISTRATIVO', cadastroEmpregado: { jornada: '44 HORAS' }, avisoFerias: { diasGozo: '30' } } } } };
  const historico = [{ status: 'enviado', tipo: 'cadastroEmpregado', empresa: 'EMPRESA EXEMPLO LTDA', valores: { nome: 'OUTRA PESSOA', cpf: '529.982.247-25', cargo: 'VENDEDOR', sindicato: 'SIND' } }];
  const s = E.sugestoesCadastro('cadastroEmpregado', R, { empresa: 'EMPRESA EXEMPLO LTDA', historico });
  assert.equal(s.cargo.valor, 'VENDEDOR'); assert.equal(s.cargo.fonte, 'como na última admissão');
  assert.equal(s.departamento.valor, 'ADMINISTRATIVO'); assert.equal(s.jornada.valor, '44 HORAS'); assert.equal(s.diasGozo, undefined);
  assert.equal(s.contratoExperiencia.valor, '45'); assert.equal(s.prorrogacao.valor, '45'); assert.ok(s.contratoExperiencia.conf < 0.6);
  assert.equal(s.nome, undefined); assert.equal(s.cpf, undefined);
  // outra empresa: sem a última admissão nem os padrões
  const o = E.sugestoesCadastro('cadastroEmpregado', R, { empresa: 'OUTRA LTDA', historico });
  assert.equal(o.cargo, undefined); assert.equal(o.departamento, undefined);
  assert.deepEqual(E.sugestoesCadastro('afastamento', R, { empresa: 'EMPRESA EXEMPLO LTDA', historico }), {});
});

t('ficha e TCE: 45 + 45, naturalidade e SSP/UF, sim/não, endereço separado, vigência e curso', () => {
  const ficha = 'FICHA DE ADMISSÃO\nNome completo: Fulana de Teste\nCPF: 529.982.247-25   Data de nascimento: 12/03/1995\nNaturalidade: São Paulo - SP\nRG: 1234567   Órgão expedidor: SSP/SP\nNome da mãe: Mãe de Teste\nEndereço: Rua das Flores, 123, Apto 45 - Jardim América\nCEP: 29000-000   Cidade: Vitória/ES\nContrato de experiência: 45 + 45 dias\nPrimeiro emprego: sim   PCD: não   Dependentes: 2';
  const v = Object.fromEntries(Object.entries(E.analyzeText(ficha, rules, { tipoAtual: 'cadastroEmpregado' }).campos).map(([k, c]) => [k, c.valor]));
  assert.equal(v.contratoExperiencia, '45'); assert.equal(v.prorrogacao, '45');
  assert.equal(v.municipioNascimento, 'São Paulo'); assert.equal(v.ufNascimento, 'SP');
  assert.equal(v.orgaoRg, 'SSP'); assert.equal(v.ufRg, 'SP');
  assert.equal(v.endereco, 'Rua das Flores'); assert.equal(v.numero, '123'); assert.equal(v.complemento, 'Apto 45'); assert.equal(v.bairro, 'Jardim América');
  assert.equal(v.municipio, 'Vitória'); assert.equal(v.uf, 'ES');
  assert.equal(v.primeiroEmprego, 'Sim'); assert.equal(v.deficiencia, 'Não'); assert.equal(v.possuiDependentes, 'Sim');
  // a conferência não acusa mais "no máximo 90"
  assert.ok(!E.runChecks('cadastroEmpregado', v, [], rules).some(x => /90/.test(x.mensagem) && x.nivel === 'erro'));
  const tce = E.analyzeText('TERMO DE COMPROMISSO DE ESTÁGIO\nEstagiário(a): Beltrano de Teste\nCurso: Administração\nNível: Superior\nVigência: 01/11/2026 a 31/10/2027\nBolsa auxílio: R$ 1.200,00', rules, { tipoAtual: 'cadastroEstagiario' }).campos;
  assert.equal(tce.nome.valor, 'Beltrano de Teste'); assert.equal(tce.dataAdmissao.valor, '01/11/2026'); assert.equal(tce.nivel.valor, 'Superior');
  assert.ok(!(rules.tipos.cadastroEstagiario.campos.nivel.sinonimos || []).includes('curso'));
  assert.deepEqual(E.separarUf('Vitória/ES'), { antes: 'Vitória', uf: 'ES' }); assert.equal(E.separarUf('São Paulo'), null);
  assert.deepEqual(E.diasExperiencia('45 + 45 dias'), [45, 45]); assert.equal(E.simNao('nenhum'), 'Não'); assert.equal(E.simNao('3'), 'Sim');
});

t('endereço só do comprovante e da ficha; comprovante em nome de outra pessoa gera aviso educativo', () => {
  const rg = E.analyzeText('CARTEIRA DE IDENTIDADE\nREGISTRO GERAL\n12345678\nNATURALIDADE\nVITÓRIA - ES\nÓrgão expedidor: SSP/ES', rules, { tipoAtual: 'cadastroEmpregado' }).campos;
  for (const k of ['cep', 'municipio', 'uf', 'endereco']) assert.equal(rg[k], undefined, k);
  assert.equal(rg.municipioNascimento.valor, 'VITÓRIA'); assert.equal(rg.ufNascimento.valor, 'ES'); assert.equal(rg.ufRg.valor, 'ES');
  const conta = 'CONTA DE ENERGIA - FATURA\nNome: JOSE DE TESTE SOUZA\nRUA DAS PALMEIRAS, 45, CASA 2 - CENTRO\nVILA VELHA - ES  CEP 29100-200\nVencimento: 10/11/2026  Consumo kWh 150';
  const c = E.analyzeText(conta, rules, { tipoAtual: 'cadastroEmpregado', nome: 'Fulana de Teste' });
  assert.equal(c.documento.id, 'comprovanteEndereco'); assert.equal(c.campos.nome, undefined);
  assert.equal(c.campos.endereco.valor, 'RUA DAS PALMEIRAS'); assert.equal(c.campos.numero.valor, '45'); assert.equal(c.campos.complemento.valor, 'CASA 2'); assert.equal(c.campos.bairro.valor, 'CENTRO'); assert.equal(c.campos.municipio.valor, 'VILA VELHA'); assert.equal(c.campos.cep.valor, '29100-200');
  assert.equal(c.titular, 'JOSE DE TESTE SOUZA'); assert.ok(c.avisos.some(a => a.id === 'comprovanteOutraPessoa' && /declaração/.test(a.mensagem)));
  assert.equal(E.avisoComprovante('FULANA DE TESTE', 'Fulana de Teste', rules), null);
});

/* RG, CNH, CIN, CTPS digital e título com o rótulo em cima do valor (dados inventados, no layout desses documentos) */
const RG_PDF = 'CARTEIRA DE IDENTIDADE\nREGISTRO GERAL           DATA DE EXPEDIÇÃO\n12.345.678-9             10/05/2015\nNOME\nFULANA DE TESTE SILVA\nFILIAÇÃO\nJOSÉ DE TESTE SILVA\nMARIA DE TESTE SILVA\nNATURALIDADE             DATA DE NASCIMENTO\nVITÓRIA - ES             12/03/1995\nDOC. ORIGEM\nC.NASC. LV 12 FL 34\nCPF\n529.982.247-25';
const valores = (txt) => { const r = E.analyzeText(txt, rules, { tipoAtual: 'cadastroEmpregado' }); return { r, v: Object.fromEntries(Object.entries(r.campos).map(([k, c]) => [k, c.valor])) }; };
t('leitor de documento pessoal: RG em PDF (colunas) e como sai do OCR (sem os espaços)', () => {
  const ocr = RG_PDF.replace(/ {2,}/g, ' ').replace('VITÓRIA - ES', 'SÃO PAULO SP');
  for (const [txt, cidade, uf] of [[RG_PDF, 'VITÓRIA', 'ES'], [ocr, 'SÃO PAULO', 'SP']]) {
    const { r, v } = valores(txt);
    assert.equal(r.documento.id, 'identidade'); assert.equal(r.layout, 'rg');
    assert.equal(v.nome, 'FULANA DE TESTE SILVA'); assert.equal(v.rg, '12.345.678-9'); assert.equal(v.dataRg, '10/05/2015');
    assert.equal(v.nascimento, '12/03/1995'); assert.equal(v.municipioNascimento, cidade); assert.equal(v.ufNascimento, uf); assert.equal(v.cpf, '529.982.247-25');
    // filiação: as duas linhas; a mãe fica para confirmar
    assert.deepEqual(r.filiacao, ['JOSÉ DE TESTE SILVA', 'MARIA DE TESTE SILVA']); assert.equal(v.mae, 'MARIA DE TESTE SILVA'); assert.ok(r.campos.mae.conf < 0.6);
    assert.ok(r.avisos.some(a => a.id === 'filiacao'));
    assert.match(r.campos.nome.fonte, /NOME/); assert.match(r.campos.dataRg.fonte, /EXPEDIÇÃO/);
    for (const k of ['cep', 'municipio', 'uf']) assert.equal(v[k], undefined, k);
  }
});
t('leitor de documento pessoal: CNH antiga e nova (campos compostos), CIN, CTPS digital e título', () => {
  const { r: cnh, v: c } = valores('CARTEIRA NACIONAL DE HABILITAÇÃO\nNOME\nCICLANO DE TESTE PEREIRA\nDOC. IDENTIDADE/ÓRG. EMISSOR/UF\n1234567 SSP ES\nCPF DATA NASCIMENTO\n111.444.777-35 20/07/1988\nFILIAÇÃO\nPEDRO DE TESTE PEREIRA\nANA DE TESTE PEREIRA\nPERMISSÃO ACC CAT. HAB.\nAB\nNº REGISTRO VALIDADE 1ª HABILITAÇÃO\n01234567890 15/08/2030 20/01/2010');
  assert.equal(cnh.layout, 'cnh');
  assert.deepEqual([c.rg, c.orgaoRg, c.ufRg], ['1234567', 'SSP', 'ES']);
  assert.deepEqual([c.cpf, c.nascimento, c.cnhCategoria, c.cnh, c.cnhValidade, c.mae], ['111.444.777-35', '20/07/1988', 'AB', '01234567890', '15/08/2030', 'ANA DE TESTE PEREIRA']);
  assert.equal(c.dataRg, undefined);   // 1ª habilitação não é a emissão do RG
  const { v: n } = valores('CARTEIRA NACIONAL DE HABILITAÇÃO\n2 e 1 NOME E SOBRENOME\nCICLANO DE TESTE PEREIRA\n4a DATA, LOCAL E UF DE NASCIMENTO\n20/07/1988, VILA VELHA, ES\n5 Nº REGISTRO 9 CAT. HAB.\n01234567890 B\n4b VALIDADE\n15/08/2030');
  assert.deepEqual([n.nome, n.nascimento, n.municipioNascimento, n.ufNascimento, n.cnh, n.cnhCategoria, n.cnhValidade], ['CICLANO DE TESTE PEREIRA', '20/07/1988', 'VILA VELHA', 'ES', '01234567890', 'B', '15/08/2030']);
  const { r: cin, v: i } = valores('CARTEIRA DE IDENTIDADE NACIONAL\nNOME\nBELTRANA DE TESTE COSTA\nDATA DE NASCIMENTO SEXO\n05/11/1999 F\nFILIAÇÃO\nJOANA DE TESTE COSTA\nCARLOS DE TESTE COSTA\nNATURALIDADE\nCARIACICA/ES\nCPF\n529.982.247-25');
  assert.equal(cin.layout, 'cin'); assert.equal(i.rg, '52998224725'); assert.equal(i.mae, 'JOANA DE TESTE COSTA'); assert.equal(i.sexo, 'Feminino'); assert.equal(i.municipioNascimento, 'CARIACICA');
  const { v: ct } = valores('Carteira de Trabalho Digital\nNome Civil\nBELTRANA DE TESTE COSTA\nCPF\n529.982.247-25\nData de Nascimento\n05/11/1999\nNacionalidade\nBrasileira');
  assert.equal(ct.nome, 'BELTRANA DE TESTE COSTA'); assert.equal(ct.nascimento, '05/11/1999');
  const { r: tit, v: ti } = valores('JUSTIÇA ELEITORAL\nTÍTULO ELEITORAL\nNOME DO ELEITOR\nFULANA DE TESTE SILVA\nINSCRIÇÃO ZONA SEÇÃO\n1234 5678 9012 0123 0456\nMUNICÍPIO/UF\nVITÓRIA/ES\nDATA DE EMISSÃO\n10/05/2015');
  assert.equal(tit.documento.id, 'titulo'); assert.deepEqual([ti.titulo, ti.zona, ti.secao, ti.municipioNascimento, ti.dataRg], ['123456789012', '0123', '0456', undefined, undefined]);
  const { v: t2 } = valores('JUSTIÇA ELEITORAL - TÍTULO DE ELEITOR\nINSCRIÇÃO 1234 5678 9012 ZONA 123 SEÇÃO 0456');
  assert.deepEqual([t2.titulo, t2.zona, t2.secao], ['123456789012', '123', '0456']);
});

t('cadastro pelo texto: ficha colada sem "admissão" e frases soltas (data pelo papel, salário sem R$, 45+45, cargo, CPF, nome)', () => {
  const P = (x, emp = []) => E.parseFreeText(x, rules, { hoje, employees: emp });
  const ficha = P('Nome: Fulana de Teste\nCPF: 529.982.247-25\nNome da mãe: Mãe de Teste\nData de nascimento: 12/03/1995\nNaturalidade: Vitória/ES');
  assert.equal(ficha.tipoSugerido, 'cadastroEmpregado');
  assert.equal(ficha.campos.mae.valor, 'Mãe de Teste'); assert.equal(ficha.campos.nascimento.valor, '12/03/1995'); assert.equal(ficha.campos.ufNascimento.valor, 'ES');
  assert.equal(ficha.campos.municipio, undefined);   // a naturalidade não vira endereço
  assert.equal(E.suggestTipoByText('Nome: Fulana de Teste\nCPF: 529.982.247-25\nNome da mãe: Mãe de Teste', rules, null).tipo, 'cadastroEmpregado');
  const f = P('vamos admitir a Fulana de Teste, CPF 529.982.247-25, nascida em 12/03/1995, começa dia 03/11, salário 2500, experiência 45+45, cargo vendedora');
  const v = Object.fromEntries(Object.entries(f.campos).map(([k, c]) => [k, c.valor]));
  assert.deepEqual(v, { nome: 'Fulana de Teste', cpf: '529.982.247-25', nascimento: '12/03/1995', dataAdmissao: '03/11/2026', salario: '2500', contratoExperiencia: '45', prorrogacao: '45', cargo: 'vendedora' });
  assert.match(f.campos.nascimento.fonte, /nascida em 12\/03\/1995/);
  // sem palavra antes, uma data antiga não vira admissão; "nasceu em 12/03/95" é 1995
  const g = P('contratar o pedro de teste, 12/03/1995, entra 10/11/2026 com salário de R$ 1.800,00');
  assert.equal(g.campos.dataAdmissao.valor, '10/11/2026'); assert.equal(g.campos.nascimento, undefined); assert.equal(g.campos.nome.valor, 'Pedro de Teste');
  assert.equal(P('admitir a joana de teste, nasceu em 12/03/95').campos.nascimento.valor, '12/03/1995');
  // CPF digitado inválido entra para a conferência acusar; funcionário da lista não vira nome
  assert.equal(P('admitir a Fulana de Teste, CPF 111.111.111-12').campos.cpf.valor, '111.111.111-12');
  assert.equal(P('vamos admitir a Maria Souza', ['MARIA SOUZA']).campos.nome, undefined);
  // o texto nunca vai para a descrição
  assert.equal(f.campos.descricao, undefined); assert.equal(f.campos.observacoes, undefined);
});

t('estagiário e contribuinte: categorias do eSocial/SEFIP pelas regras e tipo pelo texto', () => {
  const est = E.resolveTipo(rules, 'cadastroEstagiario').campos.categoriaEsocial;
  assert.match(est.padrao, /Estagi/); assert.equal(est.revisarComEscritorio, true);
  const P = (x) => E.parseFreeText(x, rules, { hoje });
  const s = P('novo sócio com pró-labore de 5000 a partir de 01/11');
  assert.equal(s.tipoSugerido, 'cadastroContribuinte'); assert.equal(s.campos.tipoContribuinte.valor, 'Sócio'); assert.equal(s.campos.salario.valor, '5000');
  const a = P('cadastro de autônomo RPA, CPF 529.982.247-25');
  assert.equal(a.campos.tipoContribuinte.valor, 'Autônomo'); assert.equal(a.campos.nome, undefined);
  const t = rules.tipos.cadastroContribuinte;
  const cs = E.activeConditionals(t, { tipoContribuinte: 'Sócio' }); assert.match(cs[0].valores.categoriaEsocial, /^721/); assert.match(cs[0].valores.categoriaSefip, /^11/);
  const ca = E.activeConditionals(t, { tipoContribuinte: 'Autônomo' }); assert.match(ca[0].valores.categoriaEsocial, /^701/); assert.match(ca[0].valores.categoriaSefip, /^13/);
  assert.ok(t.condicionais.every(c => c.revisarComEscritorio));
});

/* ---- Empresa do pedido (2.7): quais empresas a caixa "Para qual empresa?" oferece ---- */

t('empresas do login: as das solicitações, as já vistas e a aberta no portal, com a do portal primeiro', () => {
  const itens = [
    { empresa: 'COMERCIO MODELO LTDA', empresaApelido: 'MODELO', estado: 'aguardando', aguardando: true },
    { empresa: 'COMERCIO MODELO LTDA', empresaApelido: 'MODELO', estado: 'andamento' },
    { empresa: 'COMERCIO MODELO LTDA', empresaApelido: 'MODELO', estado: 'concluida' },
    { empresa: 'OFICINA FICTICIA ME', estado: 'andamento' },
  ];
  const l = E.empresasParaEscolha(itens, 'EMPRESA EXEMPLO LTDA', []);
  assert.deepEqual(l.map(e => e.nome), ['EMPRESA EXEMPLO LTDA', 'COMERCIO MODELO LTDA', 'OFICINA FICTICIA ME'], 'a do portal vem primeiro mesmo sem solicitações');
  assert.equal(l[0].atual, true);
  const m = l.find(e => e.nome === 'COMERCIO MODELO LTDA');
  assert.deepEqual([m.apelido, m.abertas, m.esperam], ['MODELO', 2, 1], 'conta só as abertas e as que esperam o cliente');
  // a lista das solicitações é relida a cada troca de empresa: as empresas já vistas continuam na caixa
  assert.equal(E.empresasParaEscolha([], 'OFICINA FICTICIA ME', l.map(({ nome, apelido }) => ({ nome, apelido }))).length, 3);
  // o nome do cabeçalho do portal pode vir um pouco diferente do da solicitação: não duplica
  assert.equal(E.empresasParaEscolha(itens, 'oficina ficticia', []).filter(e => /OFICINA/.test(e.nome)).length, 1);
  // um acesso com uma empresa só não tem o que escolher
  assert.equal(E.empresasParaEscolha([], 'EMPRESA EXEMPLO LTDA', []).length, 1);
  assert.equal(E.empresasParaEscolha([{ empresa: 'A LTDA' }, { empresa: 'A LTDA' }], 'A LTDA', []).length, 1);
});

/* ---- Lote 6 ---- */

t('Solicitação Geral: o texto escolhe departamento e assunto pelo catálogo, sem copiar o texto', () => {
  const cat = rules.tipos.geral.catalogo;
  assert.equal(cat.revisarComEscritorio, true); assert.equal(cat.calibrar, true);
  const txt = 'Oi, a Zuleica perdeu a segunda via da guia do FGTS de setembro, podem mandar?';
  assert.equal(E.suggestTipoByText(txt, rules, null)?.tipo, 'geral', 'sem aba própria: Solicitação Geral');
  const r = E.parseFreeText(txt, rules, { hoje });
  assert.equal(r.tipoSugerido, 'geral');
  assert.equal(r.campos.departamento.valor, 'Pessoal');
  assert.equal(r.campos.assunto.valor, 'Guia do FGTS – 2ª via – competência 09/2026');
  assert.match(r.campos.descricao.valor, /2ª via da guia do FGTS/);
  assert.ok(!/zuleica|perdeu|podem mandar/i.test(r.campos.descricao.valor + r.campos.assunto.valor), 'o texto do cliente não vai para a descrição nem para o assunto');
  // sem competência no texto: a linha da competência não entra
  assert.ok(!/Competência/.test(E.parseFreeText('segunda via da guia do FGTS', rules, { hoje }).campos.descricao.valor));
  const dep = (s) => E.parseFreeText(s, rules, { hoje }).campos.departamento?.valor;
  assert.equal(dep('preciso cancelar uma nota fiscal'), 'Fiscal');
  assert.equal(dep('a guia do DAS do simples nacional'), 'Fiscal');
  assert.equal(dep('o balancete e a DRE de setembro'), 'Contábil');
  assert.equal(dep('o boleto dos honorários veio errado'), 'Financeiro');
  assert.equal(dep('quero o holerite do mês passado'), 'Pessoal');
  assert.equal(dep('informe de rendimentos 2025'), 'Pessoal');
  // nota fiscal sem modelo de descrição: fica para o cliente
  assert.equal(E.parseFreeText('preciso cancelar uma nota fiscal', rules, { hoje }).campos.descricao, undefined);
  // pedido com aba própria continua indo para ela (e a Geral avisa "aba errada")
  assert.equal(E.suggestTipoByText('Ronaldo 10 horas extras', rules, null)?.tipo, 'rubricas');
  assert.equal(E.suggestTipoByText('oi, tudo bem?', rules, null), null);
});

t('Solicitação Geral: departamento casa com a lista do portal pelos sinônimos; alvará e CND pelo documento', () => {
  assert.equal(E.departamentoDaLista('Pessoal', ['MASTER', 'CONTÁBIL', 'PESSOAL', 'FISCAL'], rules), 'PESSOAL');
  assert.equal(E.departamentoDaLista('Contábil', ['MASTER', 'CONTÁBIL', 'PESSOAL'], rules), 'CONTÁBIL');
  assert.equal(E.departamentoDaLista('Pessoal', ['DEPTO. PESSOAL', 'FISCAL'], rules), 'DEPTO. PESSOAL', 'palavra inteira dentro da opção');
  assert.equal(E.departamentoDaLista('Societário', ['MASTER', 'ADMINISTRATIVO', 'TI'], rules), 'ADMINISTRATIVO');
  assert.equal(E.departamentoDaLista('Financeiro', ['MASTER', 'TI'], rules), null);
  const a = E.analyzeText('PREFEITURA MUNICIPAL DE EXEMPLO\nALVARÁ DE FUNCIONAMENTO\nInscrição municipal 000\nAtividade: comércio varejista\nValidade: 12/2027', rules, {});
  assert.equal(a.documento.id, 'alvara'); assert.equal(a.tipoSugerido, 'geral');
  assert.equal(a.campos.departamento.valor, 'Societário'); assert.equal(a.campos.assunto.valor, 'Alvará de funcionamento');
  assert.ok(!/12\/2027/.test(a.campos.assunto.valor), 'validade do documento não vira competência');
  const c = E.analyzeText('CERTIDÃO NEGATIVA DE DÉBITOS RELATIVOS AOS TRIBUTOS FEDERAIS E À DÍVIDA ATIVA DA UNIÃO\nEmitida em 01/10/2026', rules, {});
  assert.equal(c.documento.id, 'cnd'); assert.equal(c.campos.departamento.valor, 'Fiscal');
});

t('Pedir de novo: valores do detalhe do portal sem datas, sem saúde e, no cadastro, só os da empresa', () => {
  const af = E.valoresDoDetalhe('afastamento', { clientEmployeeExpanded: { name: 'ANA EXEMPLO' }, employeeLeaveTypeExpanded: { description: 'Licença maternidade' }, leaveDate: '2026-10-01T00:00:00',
    cid: 'Z76', doctorName: 'DR. EXEMPLO', crm: '00000', subject: 'Afastamento – ANA EXEMPLO', description: 'CID Z76', catNumber: '123' }, rules);
  assert.deepEqual(af, { empregado: 'ANA EXEMPLO', tipoAfastamento: 'Licença maternidade' });
  // aviso de rescisão: o código do Onvio sem tradução fica de fora; o "aviso dado por" é traduzido pelas regras
  const ar = E.valoresDoDetalhe('avisoRescisao', { clientEmployeeExpanded: { name: 'ANA EXEMPLO' }, grantedBy: 'EMPLOYEE', reason: 'ApprenticeContractTermination', adviceDate: '2026-10-01T00:00:00' }, rules);
  assert.deepEqual(ar, { empregado: 'ANA EXEMPLO', avisoDadoPor: 'EMPREGADO' });
  const cf = E.valoresDoDetalhe('calculoFerias', { clientEmployeeExpanded: { name: 'ANA EXEMPLO' }, vacationDays: 20, payBonusDays: false, payFirstInstallmentEarlier: true, initialDate: '2026-11-03T00:00:00' }, rules);
  assert.deepEqual(cf, { empregado: 'ANA EXEMPLO', diasGozo: '20', abono: 'NÃO', adiantar13: 'SIM' });
  // cadastro: nome, CPF, mãe e admissão nunca vão; departamento dentro de um bloco do detalhe também é achado
  const cad = E.valoresDoDetalhe('cadastroEmpregado', { name: 'FULANA DE EXEMPLO', nationalIdentity: '000.000.000-00', motherName: 'MAE', admissionDate: '2026-09-01T00:00:00',
    jobPositionExpanded: { description: 'VENDEDOR' }, employeeRegistrationProfessionalExpanded: { departmentExpanded: { description: 'ESCRITÓRIO' } }, daysExperience: 45, extensionDays: 45 }, rules);
  assert.deepEqual(cad, { cargo: 'VENDEDOR', departamento: 'ESCRITÓRIO', contratoExperiencia: '45', prorrogacao: '45' });
  // Geral: departamento do detalhe e o assunto do catálogo, sem a competência antiga
  const g = E.valoresDoDetalhe('geral', { subject: 'Guia do FGTS – 2ª via – competência 09/2026', departmentExpanded: { name: 'PESSOAL' } }, rules);
  assert.equal(g.departamento, 'PESSOAL'); assert.equal(g.assunto, 'Guia do FGTS – 2ª via'); assert.ok(!/09\/2026|Competência/.test(g.descricao));
  assert.deepEqual(E.valoresDoDetalhe('afastamento', null, rules), {});
  // o campo só vai se as regras disserem onde ele está no detalhe (campos.*.api)
  assert.ok(Object.values(rules.tipos.afastamento.campos).filter(c => c.api).every(c => !c.sensivel && c.tipo !== 'data'));
});

t('Repetir e histórico deste computador: sem datas, sem dias do atestado e sem CID', () => {
  const v = E.valoresParaRepetir('afastamento', { empregado: 'ANA EXEMPLO', dataAfastamento: '01/10/2026', dias: '3', tipoAfastamento: 'Doença período igual ou inferior a 15 dias', cid: 'Z76', assunto: 'x', descricao: 'y' }, rules);
  assert.deepEqual(v, { empregado: 'ANA EXEMPLO', tipoAfastamento: 'Doença período igual ou inferior a 15 dias' });
  assert.deepEqual(E.valoresParaRepetir('rubricas', { tipoLancamento: 'MENSAL', competencia: '09/2026' }, rules), { tipoLancamento: 'MENSAL' });
  assert.deepEqual(Object.keys(E.valoresParaRepetir('cadastroEmpregado', { nome: 'FULANA', cpf: '1', cargo: 'VENDEDOR', dataAdmissao: '01/09/2026' }, rules)), ['cargo']);
});

t('Variáveis da folha do mês: competência, janela do aviso e quando o cartão some', () => {
  const cfg = rules.config.variaveisFolha;
  assert.equal(cfg.revisarComEscritorio, true); assert.equal(cfg.calibrar, true);
  const v = E.variaveisDoMes(new Date(2026, 9, 22), rules, [], []);
  assert.equal(v.competencia, '10/2026'); assert.equal(E.fmtDate(v.limite), '03/11/2026'); assert.equal(v.tipoLancamento, 'MENSAL');
  assert.equal(E.variaveisDoMes(new Date(2026, 10, 2), rules, [], []).competencia, '10/2026', 'até o dia limite: a competência é a do mês anterior');
  assert.equal(E.variaveisDoMes(new Date(2026, 9, 10), rules, [], []), null, 'fora da janela do aviso');
  assert.equal(E.variaveisDoMes(new Date(2026, 9, 22), rules, [{ tipo: 'rubricas', estado: 'andamento', competencia: '10/2026' }], []), null, 'o portal já tem o lançamento');
  assert.ok(E.variaveisDoMes(new Date(2026, 9, 22), rules, [{ tipo: 'rubricas', estado: 'concluida', competencia: '09/2026' }], []), 'lançamento de outra competência não conta');
  assert.ok(E.variaveisDoMes(new Date(2026, 9, 22), rules, [{ tipo: 'rubricas', estado: 'cancelada', competencia: '10/2026' }], []), 'cancelado não conta');
  assert.equal(E.variaveisDoMes(new Date(2026, 9, 22), rules, [{ tipo: 'rubricas', estado: 'andamento', competencia: '', criado: new Date(2026, 9, 21) }], []), null, 'sem a competência na lista: pela data de criação (a calibrar)');
  assert.equal(E.variaveisDoMes(new Date(2026, 9, 22), rules, [], ['10/2026']), null, '"Nada a lançar este mês"');
  // dia limite num domingo: antecipa para o dia útil anterior
  assert.equal(E.fmtDate(E.variaveisDoMes(new Date(2026, 9, 22), { ...rules, config: { ...rules.config, variaveisFolha: { ...cfg, diaLimite: 8 } } }, [], []).limite), '06/11/2026');
  assert.equal(E.variaveisDoMes(new Date(2026, 9, 22), { ...rules, config: { ...rules.config, variaveisFolha: { ...cfg, ativo: false } } }, [], []), null);
});

t('Rubricas: planilha → linhas, nome da rubrica → evento da empresa pelos apelidos, células da grade', () => {
  assert.equal(rules.tipos.rubricas.apelidosEventos.revisarComEscritorio, true); assert.equal(rules.tipos.rubricas.grade.calibrar, true);
  const rows = [['Empregado', 'Rubrica', 'Valor'], ['JOAO DA SILVA', 'HE 50', '10:30'], ['JORGE OLIVEIRA ALVES', 'Faltas (dias)', '1'], ['RONALDO DE SOUZA', 'Comissão', 'R$ 350,00'], ['RONALDO DE SOUZA', 'Bônus de Natal', '100'], ['FULANO QUE NAO EXISTE', 'Faltas', '2']];
  const l = E.linhasDaPlanilha(rows, rules);
  assert.equal(l.length, 5); assert.deepEqual(l[0], { empregado: 'JOAO DA SILVA', rubrica: 'HE 50', valor: '10:30' });
  const ev = ['0001 - HORAS EXTRAS 50%', '0002 - HORAS EXTRAS 100%', '0010 - FALTAS', '0020 - COMISSÕES', '0030 - ADICIONAL NOTURNO'];
  assert.equal(E.eventoDaRubrica('HE 50', ev, rules), '0001 - HORAS EXTRAS 50%');
  assert.equal(E.eventoDaRubrica('Horas extras 100%', ev, rules), '0002 - HORAS EXTRAS 100%');
  assert.equal(E.eventoDaRubrica('HE 100', ev, rules), '0002 - HORAS EXTRAS 100%');
  assert.equal(E.eventoDaRubrica('Faltas (dias)', ev, rules), '0010 - FALTAS');
  assert.equal(E.eventoDaRubrica('Comissão', ev, rules), '0020 - COMISSÕES');
  assert.equal(E.eventoDaRubrica('Adicional noturno', ev, rules), '0030 - ADICIONAL NOTURNO');
  assert.equal(E.eventoDaRubrica('Bônus de Natal', ev, rules), null, 'sem par seguro: o cliente lança');
  const g = E.montarGrade(l, ev, ['JOAO DA SILVA', 'JORGE OLIVEIRA ALVES', 'RONALDO DE SOUZA'], rules);
  assert.equal(g.celulas.length, 3); assert.deepEqual(g.semEvento, ['Bônus de Natal']); assert.deepEqual(g.semEmpregado, ['FULANO QUE NAO EXISTE']);
  assert.equal(g.celulas.find(c => c.evento === '0020 - COMISSÕES').valor, '350,00');
  assert.equal(E.montarGrade([{ empregado: 'JOAO DA SILVA', rubrica: 'Horas extras 50%', valor: '10 horas' }], ev, ['JOAO DA SILVA'], rules).celulas[0].valor, '10');
  // o lançamento já feito (detalhe do portal; formato a calibrar) e o texto da descrição de volta em linhas
  const ant = E.linhasDoLancamento({ payrollEntryClientEmployeeExpanded: [{ clientEmployeeExpanded: { name: 'JOAO DA SILVA' }, payrollEntryItems: [{ eventExpanded: { description: '0001 - HORAS EXTRAS 50%' }, value: '08:00' }] }] });
  assert.deepEqual(ant, [{ empregado: 'JOAO DA SILVA', rubrica: 'HORAS EXTRAS 50%', valor: '08:00' }]);
  assert.deepEqual(E.linhasDoLancamento(null), []);
  assert.deepEqual(E.linhasDoTexto('• JOAO DA SILVA — Horas extras 50%: 10:30\n• Funcionário a confirmar — Faltas: 2 dias'), [{ empregado: 'JOAO DA SILVA', rubrica: 'Horas extras 50%', valor: '10:30' }, { empregado: '', rubrica: 'Faltas', valor: '2 dias' }]);
});

/* ---- Lote 5: leitor que não preenche errado (textos inventados, no layout dos documentos do corpus fictício) ---- */
const LH = new Date(2026, 9, 18);
const LEMP = ['FERNANDA OLIVEIRA SANTOS', 'MARIA APARECIDA SANTOS', 'RAFAEL NUNES BARBOSA', 'VANESSA CRISTINA LOPES', 'THIAGO HENRIQUE PRADO', 'BEATRIZ CAMPOS'];
const L5 = (txt, tipo, ctx = {}) => E.analyzeText(txt, rules, { employees: LEMP, tipoAtual: tipo, hoje: LH, ...ctx });

t('leitor (1, 3): conta com o endereço da distribuidora em cima — vale o bloco do titular', () => {
  const conta = 'COMPANHIA DE LUZ FICTÍCIA S.A.\nAv. das Usinas Inventadas, 900 - Centro - Cidade Teste/ES - CEP 29000-111 · CNPJ 00.000.333/0001-00\nDADOS DO CLIENTE   CONTA DE ENERGIA\nFULANO DE TESTE   Instalação: 0099\nRUA DOS IPÊS, 12 APTO 5 Consumo: 99 kWh\nBAIRRO INVENTADO   Leitura atual: 10/09/2026\nCEP 29100-300 VILA TESTE - ES\nVENCIMENTO 20/10/2026';
  const c = L5(conta, 'cadastroEmpregado').campos;
  assert.equal(c.endereco.valor, 'RUA DOS IPÊS'); assert.equal(c.numero.valor, '12'); assert.equal(c.complemento.valor, 'APTO 5');
  assert.equal(c.bairro.valor, 'BAIRRO INVENTADO'); assert.equal(c.cep.valor, '29100-300'); assert.equal(c.municipio.valor, 'VILA TESTE'); assert.equal(c.uf.valor, 'ES');
  assert.ok(c.cep.conf >= 0.6, 'bloco do titular vai ao portal');
  // sem "Dados do cliente" nem titular: dois endereços que empatam ficam abaixo do limiar
  const dois = 'FATURA\nRua Um Inventada, 10 - Centro - Serra/ES - CEP 29160-000\n\n\n\nRua Dois Inventada, 20 - Centro - Vitória/ES - CEP 29010-000\nconsumo kwh vencimento';
  const d = L5(dois, 'cadastroEmpregado').campos;
  assert.ok(!d.cep || d.cep.conf < 0.6, 'empate: sugestão, não preenche');
});

t('leitor (2): CEP de clínica num ASO não vira endereço; CEP sem rótulo fica baixo', () => {
  const aso = 'ATESTADO DE SAÚDE OCUPACIONAL\nClínica Teste, Rua da Saúde, 50 - Centro - Vitória/ES - CEP 29010-500\nNome: FULANA DE TESTE CPF: 529.982.247-25\nExame: (X) Admissional ( ) Demissional\nConclusão: (X) Apto ( ) Inapto';
  const c = L5(aso, 'cadastroEmpregado').campos;
  for (const k of ['cep', 'endereco', 'municipio', 'bairro']) assert.equal(c[k], undefined, k);
  assert.equal(c.cpf.valor, '529.982.247-25');
  assert.ok(E.extractGeneric('pague até 10/10 · 29010-500', rules).cep.conf <= 0.4);
});

t('leitor (3): CPF com espaço do OCR e rótulo em cima; número do registro da CNH não é CPF', () => {
  const cnh = 'CARTEIRA NACIONAL DE HABILITAÇÃO\nNOME\nTHIAGO HENRIQUE PRADO\nCPF DATA NASCIMENTO\n529 .982.247-25 19/01/1990\nNº REGISTRO VALIDADE\n01234567890 25/06/2031';
  const g = E.extractGeneric(cnh, rules);
  assert.equal(g.cpf.valor, '529.982.247-25'); assert.ok(g.cpf.conf >= 0.9);
  const so = E.extractGeneric('Nº REGISTRO\n01234567890', rules);
  assert.equal(so.cpf, undefined, 'registro da CNH descartado');
  assert.ok(E.extractGeneric('codigo 529.982.247-25 xx', rules).cpf === undefined || E.extractGeneric('linha 529.982.247-25', rules).cpf.conf <= 0.5);
  assert.ok(E.extractGeneric('linha solta 529.982.247-25', rules).cpf.conf <= 0.5, 'sem rótulo: sugestão');
});

t('leitor (4, 14): nome do meio que contradiz, abreviação e só o primeiro nome', () => {
  const r = E.empregadoPorNome('MARIA EDUARDA SANTOS', LEMP);
  assert.equal(r.option, 'MARIA APARECIDA SANTOS'); assert.ok(r.contradiz); assert.ok(r.score <= 0.45);
  assert.ok(E.empregadoPorNome('Rafael N. Barbosa', LEMP).score > 0.85, 'abreviação vale');
  assert.ok(E.empregadoPorNome('Vanessa', LEMP).score <= 0.55);
  assert.ok(E.findEmployeeInText('a Beatriz pediu', LEMP).score <= 0.55);
  const a = L5('ATESTADO MÉDICO\nAtesto que a paciente MARIA EDUARDA SANTOS necessita de 2 (dois) dias de afastamento a partir de 15/10/2026.\nCRM-ES 1234', 'afastamento');
  assert.ok(a.campos.empregado.conf < 0.6 && a.avisos.some(x => x.id === 'outroNome'));
  assert.equal(a.campos.tipoAfastamento, undefined, 'atestado de outra pessoa: o tipo fica com o cliente');
});

t('leitor (5): 2ª via — a data é a do atendimento, não a da emissão; O→0, sem ano e "Data:" genérico', () => {
  const v2 = '2ª VIA\nData de emissão: 17/10/2026 08:12\nATESTADO MÉDICO\nPaciente: Rafael N. Barbosa Nasc.: 21/09/1985\nAtesto que o paciente esteve em atendimento neste serviço no dia 10/10/2026, necessitando\nde 3 (três) dias de afastamento de suas atividades a partir desta data.\nCRM-ES 1';
  const d = E.lerDataAtestado(v2, LH); assert.equal(d.data, '10/10/2026'); assert.ok(d.conf >= 0.75);
  assert.equal(E.lerDataAtestado('repouso a partir de 1O/1O/2O26', LH).data, '10/10/2026');
  const sa = E.lerDataAtestado('atendido no dia 12 de outubro, repouso de 2 dias', LH); assert.equal(sa.data, '12/10/2026'); assert.ok(sa.conf < 0.6);
  const g = E.lerDataAtestado('Atestado\nData: 16/10/2026\nafastada por 2 dias', LH); assert.equal(g.data, '16/10/2026'); assert.ok(g.conf < 0.6, '"Data:" sozinho é sugestão');
});

t('leitor (6, 9): opções impressas desmarcadas e atestado de dependente', () => {
  const auto = rules.tipos.afastamento.tipoAfastamentoAuto;
  assert.equal(E.semOpcoesDesmarcadas('Motivo: (X) Doença () Acidente do trabalho ( ) Outros').trim(), 'Motivo: (X) Doença');
  assert.equal(E.inferTipoAfastamento('Motivo: (X) Doença () Acidente do trabalho () Outros', 5, 'atestado', auto).valor, 'Doença período igual ou inferior a 15 dias');
  const f = L5('ATESTADO MÉDICO\nAtesto que a menor ANA TESTE SANTOS, 7 anos, necessita de 2 (dois) dias de repouso, devendo permanecer sob os cuidados de sua mãe, FERNANDA OLIVEIRA SANTOS, a partir de 15/10/2026.\nCID: J11\nDra. Pediatra Fictícia\nCRM-ES 5', 'afastamento');
  assert.equal(f.campos.empregado.valor, 'FERNANDA OLIVEIRA SANTOS');
  assert.equal(f.campos.tipoAfastamento, undefined);
  assert.ok(f.avisos.some(a => a.id === 'dependente'));
});

t('leitor (7, 8): "Data:" de ASO não vira data do aviso; sinônimos genéricos só no documento certo', () => {
  const aso = 'ATESTADO DE SAÚDE OCUPACIONAL\nNome: RAFAEL NUNES BARBOSA\nExame: (X) Demissional\nConclusão: (X) Apto\nData: 17/10/2026';
  assert.equal(L5(aso, 'avisoRescisao').campos.dataAviso, undefined);
  const ficha = 'FICHA DE ADMISSÃO\nNome completo: FULANA DE TESTE\nCategoria: Empregado\nValidade: 31/12/2027\nRegistro: 12345';
  const c = L5(ficha, 'cadastroEmpregado').campos;
  assert.equal(c.cnhCategoria, undefined); assert.equal(c.cnhValidade, undefined); assert.equal(c.cnh, undefined);
  const t2 = E.extractByLabels('Categoria: AB', E.resolveTipo(rules, 'cadastroEmpregado').campos, { docId: 'identidade' });
  assert.equal(t2.cnhCategoria.valor, 'AB');
});

t('leitor (10, P6): corta no próximo rótulo sem acento e em "="; formato inválido fica para conferir', () => {
  const ficha = 'FICHA DE ADMISSÃO\nNome completo: FULANA DE TESTE\nRG: 4.455.667 Orgão expedidor: SSP/ES\nEstado civil: Sotteira = Raça/cor: Parda\nBanco: 001 Agência: 1234-5"É Conta corrente: 98765-4\nE-mail: fulana .teste&exemplo. invalid\nData de admissão: 03/11/2026 por 30 dias';
  const c = L5(ficha, 'cadastroEmpregado').campos;
  assert.equal(c.rg.valor, '4.455.667'); assert.equal(c.orgaoRg.valor, 'SSP'); assert.equal(c.ufRg.valor, 'ES');
  assert.equal(c.estadoCivil.valor, 'Solteira'); assert.ok(c.estadoCivil.conf < 0.6, 'OCR corrigido: confira');
  assert.equal(c.racaCor.valor, 'Parda'); assert.equal(c.agencia.valor, '1234-5'); assert.equal(c.conta.valor, '98765-4');
  assert.ok(c.email.conf < 0.6 && c.email.confira === 'formato');
  assert.equal(c.dataAdmissao.valor, '03/11/2026');
  assert.equal(E.validarValor('email', { tipo: 'email' }, 'a@b.com', rules).ok, true);
  assert.equal(E.validarValor('agencia', { tipo: 'texto' }, '12A4', rules).ok, false);
});

t('leitor (P2): foto ruim não preenche nada; foto fraca só sugere (menos o validado e junto do rótulo)', () => {
  const txt = 'FICHA DE ADMISSÃO\nNome completo: FULANA DE TESTE\nCPF: 529.982.247-25\nCargo: AUXILIAR';
  const ruim = L5(txt, 'cadastroEmpregado', { metodo: 'ocr', confiancaOcr: 40 });
  assert.equal(Object.keys(ruim.campos).length, 0); assert.ok(ruim.fotoRuim && ruim.avisos.some(a => a.id === 'fotoRuim'));
  const fraca = L5(txt, 'cadastroEmpregado', { metodo: 'ocr', confiancaOcr: 60 }).campos;
  assert.ok(fraca.cpf.conf >= 0.6, 'CPF validado e com rótulo continua');
  assert.ok(fraca.cargo.conf < 0.6 && fraca.nome.conf < 0.6);
  assert.ok(L5(txt, 'cadastroEmpregado', { metodo: 'pdf-texto', confiancaOcr: 100 }).campos.cargo.conf >= 0.6);
});

t('leitor (P5): um documento, uma pessoa', () => {
  const a = E.pessoaDaAnalise({ campos: { nome: { valor: 'FULANA DE TESTE', conf: 0.75 }, cpf: { valor: '529.982.247-25', conf: 0.95 } } });
  assert.deepEqual(a, { nome: 'FULANA DE TESTE', cpf: '52998224725' });
  assert.equal(E.mesmaPessoa(a, { nome: 'OUTRA PESSOA', cpf: '11144477735' }), false);
  assert.equal(E.mesmaPessoa(a, { nome: 'Fulana de Teste', cpf: null }), true);
  assert.equal(E.mesmaPessoa({ nome: 'MARIA EDUARDA SANTOS' }, { nome: 'MARIA APARECIDA SANTOS' }), false);
  assert.equal(E.mesmaPessoa(a, null), null);
  assert.equal(E.pessoaDaAnalise({ campos: { nome: { valor: 'X Y', conf: 0.5 } } }), null, 'sugestão não identifica a pessoa');
});

t('leitor (12): aviso de férias em tabela — o gozo não é o período aquisitivo; nome sem sobra do OCR', () => {
  const av = 'AVISO DE FÉRIAS\nParticipamos que suas férias serão concedidas conforme abaixo:\nPERÍODO AQUISITIVO   PERÍODO DE GOZO\n01/03/2025 a 28/02/2026   03/11/2026 a 02/12/2026\nDIAS DE FÉRIAS   RETORNO AO TRABALHO\n30   03/12/2026\nCiente em 02/10/2026.';
  const c = L5(av, 'calculoFerias').campos;
  assert.equal(c.inicioGozo.valor, '03/11/2026'); assert.equal(c.diasGozo.valor, '30');
  const rg = L5('CARTEIRA DE IDENTIDADE\nREGISTRO GERAL\nFILIAÇÃO\nJOSE DE TESTE\nMARTA DE TESTE í', 'cadastroEmpregado').campos;
  assert.equal(rg.mae.valor, 'MARTA DE TESTE');
});

t('leitor: CIN com rótulos bilíngues, órgão "SSP/ES" e sexo ao lado da nacionalidade', () => {
  const cin = 'CARTEIRA DE IDENTIDADE NACIONAL\nNOME / NAME\nFULANA DE TESTE\nSEXO / SEX NACIONALIDADE / NATIONALITY DATA DE NASCIMENTO\nF BRA 05/12/1995\nREGISTRO GERAL - CPF / PERSONAL NUMBER\n529.982.247-25\nNATURALIDADE / PLACE OF BIRTH\nSERRA/ES\nÓRGÃO EXPEDIDOR DATA DE EMISSÃO VALIDADE\nSSP/ES 10/05/2025 10/05/2035';
  const c = L5(cin, 'cadastroEmpregado').campos;
  assert.equal(c.nome.valor, 'FULANA DE TESTE'); assert.equal(c.sexo.valor, 'Feminino'); assert.equal(c.nascimento.valor, '05/12/1995');
  assert.equal(c.cpf.valor, '529.982.247-25'); assert.equal(c.municipioNascimento.valor, 'SERRA'); assert.equal(c.ufNascimento.valor, 'ES');
  assert.equal(c.orgaoRg.valor, 'SSP'); assert.equal(c.ufRg.valor, 'ES');
});

console.log(`\n${n} testes ok`);
