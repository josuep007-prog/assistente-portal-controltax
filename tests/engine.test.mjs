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

console.log(`\n${n} testes ok`);
