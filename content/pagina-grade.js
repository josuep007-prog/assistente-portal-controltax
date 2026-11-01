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
    return { ok: ni >= 0 && titulos.length > 0, titulos, empregados, colunas: h.length, linhas: g.rows.length, colunaDoNome: ni };
  }

  /** Lança cada valor como o portal faz: seleciona a célula, abre o editor, digita e confirma (o portal recalcula e valida). valor '' limpa a célula. */
  function escrever(g, celulas) {
    const h = cabecalhos(g), ni = colunaNome(h), nomes = nomesDasLinhas(g, ni).map(norm);
    const feitas = [], faltaram = [];
    for (const c of celulas) {
      const r = nomes.indexOf(norm(c.empregado)), col = h.findIndex(x => norm(x) === norm(c.evento));
      if (r < 0) { faltaram.push({ ...c, motivo: 'funcionário fora da grade' }); continue; }
      if (col < 0) { faltaram.push({ ...c, motivo: 'rubrica fora da grade' }); continue; }
      if (g.isReadOnly || g.columns[col].isReadOnly) { faltaram.push({ ...c, motivo: 'célula bloqueada pelo portal' }); continue; }
      const antes = String(g.getCellData(r, col, true) ?? '');
      const vazio = String(c.valor ?? '') === '';
      let ok = false, via = '';
      try {
        g.select(r, col); g.scrollIntoView?.(r, col);
        if (!vazio && typeof g.startEditing === 'function' && g.startEditing(true, r, col, true)) {
          const ed = g.activeEditor;
          if (ed) { ed.value = String(c.valor); ed.dispatchEvent(new Event('input', { bubbles: true })); ok = g.finishEditing() !== false; via = 'editor'; }
          else g.cancelEdit?.();
        }
        if (!ok) { g.setCellData(r, col, vazio ? null : c.valor, true); ok = true; via = 'modelo'; }
      } catch (e) {
        try { g.cancelEdit?.(); } catch { /* nada a cancelar */ }
        faltaram.push({ ...c, motivo: `erro ao digitar (${String(e?.message || e).slice(0, 50)})` }); continue;
      }
      const depois = g.getCellData(r, col, false);
      if (!vazio && (depois == null || depois === '' || (typeof depois === 'number' && Number.isNaN(depois)))) { faltaram.push({ ...c, motivo: 'o portal não aceitou o valor' }); continue; }
      feitas.push({ empregado: c.empregado, evento: c.evento, antes, via });
    }
    return { ok: true, feitas, faltaram };
  }

  document.addEventListener('ct-grade-pedido', (e) => {
    let p; try { p = JSON.parse(e.detail); } catch { return; }
    if (p.op === 'ping') { document.dispatchEvent(new CustomEvent('ct-grade-resposta', { detail: JSON.stringify({ id: p.id, ok: true }) })); return; }
    let r;
    try {
      const g = acharGrade();
      r = !g ? { ok: false, semGrade: true, chaves: chavesVistas } : p.op === 'escrever' ? escrever(g, p.celulas || []) : { ...ler(g), achou: true };
    } catch (err) { r = { ok: false, erro: String(err?.message || err).slice(0, 80) }; }
    document.dispatchEvent(new CustomEvent('ct-grade-resposta', { detail: JSON.stringify({ id: p.id, ...r }) }));
  });
})();
