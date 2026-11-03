/* Assistente do Portal do Cliente — ajudante da grade do Lançamento de Rubricas (world: MAIN).
 *
 * A grade do portal é uma planilha Wijmo (FlexGrid): só desenha na tela o que cabe nela, e clicar em células "de fora" não faz o
 * portal aceitar o valor. A própria planilha, porém, vive como objeto na página: aqui (mundo da página) ela é achada e usada pelo
 * jeito que o próprio portal usa — selecionar a célula, abrir o editor, digitar, confirmar. É como o Assistente "preenche por baixo".
 * Só funciona na tela do Lançamento de Rubricas; nada é enviado (o envio é só pelo botão do portal). O conteúdo da planilha
 * (nomes e valores) não vai para storage, logs ou diagnóstico: o diagnóstico recebe só contagens e nomes de propriedades. */
(() => {
  if (window.__ctPaginaGrade) return;
  window.__ctPaginaGrade = true;

  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const rotEvento = /^\s*\d{1,6}\s*-\s*\S/;
  const ehGrade = (v) => !!v && typeof v === 'object' && typeof v.getCellData === 'function' && typeof v.setCellData === 'function' && !!v.rows && !!v.columns;
  let chavesVistas = [];

  /** A instância da planilha: o Wijmo a guarda numa propriedade do elemento que a hospeda. */
  function doElemento(el) {
    for (let e = el, n = 0; e && n < 4; e = e.parentElement, n++) {
      for (const k of [...Object.getOwnPropertyNames(e), ...Object.getOwnPropertySymbols(e)]) {
        let v; try { v = e[k]; } catch { continue; }
        if (ehGrade(v)) return v;
      }
    }
    return null;
  }
  function acharGrade() {
    const hosts = [...document.querySelectorAll('.wj-flexgrid, wj-flex-grid, [role=grid]')];
    chavesVistas = hosts[0] ? Object.getOwnPropertyNames(hosts[0]).slice(0, 16) : [];
    for (const h of hosts) { const g = doElemento(h); if (g) return g; }
    return null;
  }

  const cabecalhos = (g) => { const h = []; for (let c = 0; c < g.columns.length; c++) h.push(String(g.columns[c].header ?? g.columns[c].binding ?? '')); return h; };
  const colunaNome = (h) => h.findIndex(x => /^(nome|empregad|funcionari)/.test(norm(x)));
  const nomesDasLinhas = (g, ni) => { const n = []; for (let r = 0; r < g.rows.length; r++) n.push(ni >= 0 ? String(g.getCellData(r, ni, true) ?? '').trim() : ''); return n; };

  /** Todas as rubricas (colunas "código - evento") e todos os funcionários, sem rolar a tela. */
  function ler(g) {
    const h = cabecalhos(g), ni = colunaNome(h);
    const titulos = h.filter(x => rotEvento.test(x)).map(x => x.trim());
    const empregados = nomesDasLinhas(g, ni).filter(Boolean);
    // quais rubricas o portal não deixa lançar (coluna somente leitura) e como cada coluna guarda o valor (tipo e formato; nunca valores)
    const meta = h.map((t, c) => ({ titulo: t.trim(), c })).filter(x => rotEvento.test(x.titulo)).map(({ titulo, c }) => ({ titulo, somenteLeitura: !!(g.isReadOnly || g.columns[c].isReadOnly), tipoDado: g.columns[c].dataType ?? null, formato: String(g.columns[c].format || ''), mascara: String(g.columns[c].mask || '') }));
    return { ok: ni >= 0 && titulos.length > 0, titulos, empregados, colunas: h.length, linhas: g.rows.length, colunaDoNome: ni, bloqueadas: meta.filter(m => m.somenteLeitura).map(m => m.titulo), meta };
  }

  /** Os valores que a grade tem agora (só as células preenchidas): para o resumo antes de enviar. */
  function valores(g) {
    const h = cabecalhos(g), nomes = nomesDasLinhas(g, colunaNome(h)), celulas = [];
    h.forEach((tit, c) => {
      if (!rotEvento.test(tit)) return;
      for (let r = 0; r < g.rows.length; r++) { const v = String(g.getCellData(r, c, true) ?? '').trim(); if (v && nomes[r]) celulas.push({ empregado: nomes[r], evento: tit.trim(), valor: v }); }
    });
    return { ok: true, celulas };
  }

  const aceito = (g, r, col) => { const d = g.getCellData(r, col, false); return !(d == null || d === '' || (typeof d === 'number' && Number.isNaN(d))); };
  /** Formas de escrever o mesmo valor: como veio, horas ↔ decimal e número puro. Colunas numéricas começam pelo decimal. */
  function formas(valor, tipoDado) {
    const v = String(valor).trim(), out = [{ nome: 'como digitado', v }];
    const hm = /^(\d{1,3}):(\d{2})$/.exec(v);
    if (hm) { const dec = +hm[1] + +hm[2] / 60, txt = String(Math.round(dec * 100) / 100).replace('.', ','); out.push({ nome: 'horas em decimal', v: txt }, { nome: 'número', v: Math.round(dec * 100) / 100 }); }
    else if (/^\d+([.,]\d+)?$/.test(v)) { const n = parseFloat(v.replace(',', '.')), hh = Math.floor(n), mm = Math.round((n - hh) * 60); out.push({ nome: 'horas HH:MM', v: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` }, { nome: 'número', v: n }); }
    return tipoDado === 2 && hm ? [out[1], out[0], ...out.slice(2)] : out;   // coluna numérica: o decimal antes
  }
  /** Uma tentativa, do jeito do portal: seleciona, abre o editor, digita e confirma; sem editor, grava no modelo. Devolve de onde veio o valor aceito ('' = recusado). */
  function tentar(g, r, col, valor) {
    g.select(r, col); g.scrollIntoView?.(r, col);
    if (typeof g.startEditing === 'function' && g.startEditing(true, r, col, true)) {
      const ed = g.activeEditor;
      if (ed) {
        ed.value = String(valor); ed.dispatchEvent(new Event('input', { bubbles: true }));
        const fim = g.finishEditing();
        if (fim === false) { try { g.cancelEdit?.(); } catch { /* nada a cancelar */ } } else if (aceito(g, r, col)) return 'editor';
      } else g.cancelEdit?.();
    }
    g.setCellData(r, col, valor, true);
    return aceito(g, r, col) ? 'modelo' : '';
  }

  /** Lança cada valor como o portal faz; se o portal recusar o formato, tenta os outros (horas ↔ decimal). valor '' limpa a célula. */
  function escrever(g, celulas) {
    const h = cabecalhos(g), ni = colunaNome(h), nomes = nomesDasLinhas(g, ni).map(norm);
    const feitas = [], faltaram = [], recusas = [], formasUsadas = {};
    for (const c of celulas) {
      const r = nomes.indexOf(norm(c.empregado)), col = h.findIndex(x => norm(x) === norm(c.evento));
      if (r < 0) { faltaram.push({ ...c, motivo: 'funcionário fora da grade' }); continue; }
      if (col < 0) { faltaram.push({ ...c, motivo: 'rubrica fora da grade' }); continue; }
      if (g.isReadOnly || g.columns[col].isReadOnly) { faltaram.push({ ...c, motivo: 'célula bloqueada pelo portal' }); continue; }
      const antes = String(g.getCellData(r, col, true) ?? '');
      const vazio = String(c.valor ?? '') === '';
      let via = '', forma = '';
      try {
        if (vazio) { g.select(r, col); g.setCellData(r, col, null, true); via = 'modelo'; forma = 'limpar'; }
        else for (const f of formas(c.valor, g.columns[col].dataType)) {
          via = tentar(g, r, col, f.v);
          if (via) { forma = f.nome; break; }
          try { g.setCellData(r, col, null, true); } catch { /* nada a limpar */ }   // não deixa um valor inválido para trás
        }
      } catch (e) {
        try { g.cancelEdit?.(); } catch { /* nada a cancelar */ }
        faltaram.push({ ...c, motivo: `erro ao digitar (${String(e?.message || e).slice(0, 50)})` }); continue;
      }
      if (!via) {
        faltaram.push({ ...c, motivo: 'o portal não aceitou o valor' });
        const info = { tipoDado: g.columns[col].dataType ?? null, formato: String(g.columns[col].format || ''), mascara: String(g.columns[col].mask || '') };
        if (!recusas.some(x => x.tipoDado === info.tipoDado && x.formato === info.formato && x.mascara === info.mascara)) recusas.push(info);
        continue;
      }
      formasUsadas[forma] = (formasUsadas[forma] || 0) + 1;
      feitas.push({ empregado: c.empregado, evento: c.evento, antes, via, forma });
    }
    try { g.invalidate?.(); g.refresh?.(); } catch { /* o portal repinta sozinho */ }   // força a planilha do portal a redesenhar com os valores novos
    return { ok: true, feitas, faltaram, recusas, formas: formasUsadas };
  }

  document.addEventListener('ct-grade-pedido', (e) => {
    let p; try { p = JSON.parse(e.detail); } catch { return; }
    if (p.op === 'ping') { document.dispatchEvent(new CustomEvent('ct-grade-resposta', { detail: JSON.stringify({ id: p.id, ok: true }) })); return; }
    let r;
    try {
      const g = acharGrade();
      r = !g ? { ok: false, semGrade: true, chaves: chavesVistas } : p.op === 'escrever' ? escrever(g, p.celulas || []) : p.op === 'valores' ? valores(g) : { ...ler(g), achou: true };
    } catch (err) { r = { ok: false, erro: String(err?.message || err).slice(0, 80) }; }
    document.dispatchEvent(new CustomEvent('ct-grade-resposta', { detail: JSON.stringify({ id: p.id, ...r }) }));
  });
})();
