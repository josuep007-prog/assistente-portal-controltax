/* Plataforma (2.0): a interface em tela cheia por cima do Portal do Cliente, no estilo do
 * módulo Departamento Pessoal do Control Hub. O portal continua carregado por baixo e é
 * preenchido por trás; os dados vêm dele, com a sessão do próprio cliente. Nada sai do computador.
 * O painel (panel.js) continua o orquestrador e passa aqui as funções que já existem (A).
 * Desde a 2.16.3 o código é dividido por tela em panel/plataforma/*.js (mapa em docs/arquitetura.md): cada parte
 * recebe o mesmo contexto (C) e registra nele o que as outras usam. A ordem de montagem é a das telas de antes. */
import { montarNucleo } from './plataforma/nucleo.js';
import { montarCasca } from './plataforma/casca.js';
import { montarDados } from './plataforma/dados.js';
import { montarEntrada } from './plataforma/entrada.js';
import { montarDialogos } from './plataforma/dialogos.js';
import { montarEventos } from './plataforma/eventos.js';
import { montarHoje } from './plataforma/hoje.js';
import { montarSolicitacoes } from './plataforma/solicitacoes.js';
import { montarNovopedido } from './plataforma/novopedido.js';
import { montarEmpresa } from './plataforma/empresa.js';
import { montarFuncionarios } from './plataforma/funcionarios.js';
import { montarAgenda } from './plataforma/agenda.js';
import { montarDocumentos } from './plataforma/documentos.js';
import { montarBusca } from './plataforma/busca.js';

export function montarPlataforma(A) {
  const { S, $, esc, icon, request, send, toast, viewEl } = A;
  const C = { A, S, $, esc, icon, request, send, toast, viewEl };
  montarNucleo(C);
  montarCasca(C);
  montarDados(C);
  montarEntrada(C);
  montarDialogos(C);
  montarEventos(C);
  montarHoje(C);
  montarSolicitacoes(C);
  montarNovopedido(C);
  montarEmpresa(C);
  montarFuncionarios(C);
  montarAgenda(C);
  montarDocumentos(C);
  montarBusca(C);
  return C.P;
}
