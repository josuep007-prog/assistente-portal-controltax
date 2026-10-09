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

console.log(`\n${n} testes ok`);
