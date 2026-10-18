/* Escolha de uma opção numa lista do portal (combobox) — a MESMA comparação tolerante do motor
 * (panel/engine.js: similarity), aqui num script comum porque o conteúdo não importa módulos.
 * Carregado antes do content.js (manifest e simulador). O teste do motor confere que as duas
 * comparações dão o mesmo resultado. Nada aqui lê a tela: só compara textos. */
(function (g) {
  'use strict';
  if (g.CtOpcoes) return;
  var norm = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(); };
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    var prev = []; for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var cur = [i];
      for (var k = 1; k <= b.length; k++) cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  /** Igual ao similarity do motor: palavras em comum, letras trocadas (distância de edição) e trecho contido. */
  function similaridade(a, b, semTrecho) {
    var A = norm(a), B = norm(b);
    if (!A || !B) return 0;
    if (A === B) return 1;
    var ta = A.split(' ').filter(function (t) { return t.length > 1; }), tb = B.split(' ').filter(function (t) { return t.length > 1; });
    var comuns = ta.filter(function (t) { return tb.indexOf(t) >= 0; }).length;
    var porPalavra = comuns / Math.max(ta.length, tb.length);
    var porLetra = 1 - lev(A, B) / Math.max(A.length, B.length);
    // pessoas: um pedaço de palavra nunca basta ("JOAO" não é "JOAO DA SILVA")
    var trecho = !semTrecho && Math.min(A.length, B.length) >= 4 && (A.indexOf(B) >= 0 || B.indexOf(A) >= 0) ? 0.9 : 0;
    return Math.max(porPalavra, porLetra, trecho);
  }
  /**
   * Qual opção escolher para um valor. pessoa = lista de funcionários (exige 0,9 e não aceita pedaço de palavra).
   * Devolve { opcao, score, exata, sugestoes }: opcao null quando não dá para escolher com segurança
   * (aí sugestoes traz as mais parecidas, para o cliente decidir).
   */
  function escolher(valor, opcoes, o) {
    o = o || {};
    var lista = []; (opcoes || []).forEach(function (x) { if (x && lista.indexOf(x) < 0) lista.push(x); });
    var V = norm(valor);
    for (var i = 0; i < lista.length; i++) if (norm(lista[i]) === V) return { opcao: lista[i], score: 1, exata: true, sugestoes: [] };
    var notas = lista.map(function (x) { return { o: x, s: similaridade(valor, x, !!o.pessoa) }; }).sort(function (a, b) { return b.s - a.s; });
    var minimo = o.pessoa ? 0.9 : (o.minimo || 0.8);
    var a = notas[0], b = notas[1];
    var empate = a && b && b.s >= a.s - 0.02;
    if (a && a.s >= minimo && !empate) return { opcao: a.o, score: a.s, exata: false, sugestoes: [] };
    return { opcao: null, score: a ? a.s : 0, exata: false, sugestoes: notas.filter(function (x) { return x.s >= 0.5; }).slice(0, 3).map(function (x) { return x.o; }) };
  }
  g.CtOpcoes = { norm: norm, similaridade: similaridade, escolher: escolher };
})(typeof globalThis !== 'undefined' ? globalThis : window);
