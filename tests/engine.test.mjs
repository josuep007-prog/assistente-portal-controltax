// Testes do motor de regras (sem navegador).  Rodar:  node tests/engine.test.mjs
import * as E from '../panel/engine.js';
import * as C from '../panel/calculos.js';
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
  assert.equal(E.fmtDate(l[1].pagamento), '01/11/2026');           // 2 dias antes do início
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

console.log(`\n${n} testes ok`);
