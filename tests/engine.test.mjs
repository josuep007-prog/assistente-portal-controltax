// Testes do motor de regras (sem navegador).  Rodar:  node tests/engine.test.mjs
import * as E from '../panel/engine.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';

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

console.log(`\n${n} testes ok`);
