// Motor de regras — Modelos de texto (assunto e descrição).
// Puro (sem DOM). Veja panel/engine.js (reexporta tudo) e docs/arquitetura.md.
import { plain } from './textolivre.js';

/* ---------------- Modelos de texto ---------------- */
/** Primeiro modelo da lista que sai completo (sem variável faltando). */
export function renderFirst(list, values) {
  for (const tpl of [].concat(list || [])) { const s = renderTemplate(tpl, values); if (s) return s; }
  return '';
}

/**
 * Tipo de afastamento do portal a partir do texto, do documento e dos dias.
 * regras = tipos.afastamento.tipoAfastamentoAuto: lista em ordem de prioridade com
 *   { palavras?, documentos?, valor? | ate15?, acima15?, limiteDias? }
 * Devolve { valor, motivo } ou null (sem dias quando o tipo depende deles).
 */
/** Tira do texto as opções de formulário que NÃO estão marcadas: "(X) Doença ( ) Acidente do trabalho" → "(X) Doença".
 *  Formulários impressos trazem todas as opções escritas; só a marcada diz alguma coisa. */
export function semOpcoesDesmarcadas(text) {
  const MARCA = /([(\[]\s*(?:[xX✓✔☒■▣])?\s*[)\]])/;
  return String(text || '').split(/\n/).map(l => {
    const partes = l.split(MARCA);
    if (partes.length < 3) return l;
    let out = partes[0];
    for (let i = 1; i < partes.length; i += 2) if (/[xX✓✔☒■▣]/.test(partes[i])) out += partes[i] + partes[i + 1];
    return out;
  }).join('\n');
}
export function inferTipoAfastamento(text, dias, docId, regras) {
  // linhas que são só uma opção de formulário ("( ) doença", "U acidente do trabalho") e opções desmarcadas não dizem nada
  const T = plain(semOpcoesDesmarcadas(text).split(/\n/).filter(l => !(l.trim().length < 34 && /^\W{0,4}[a-zà-úA-ZÀ-Ú]?\W{0,4}\s*(doen[cç]a|acidente d[eo] trabalho|acidente de trajeto|outros?)\s*\W*$/i.test(l.trim()))).join('\n'));
  const n = parseInt(dias, 10);
  for (const r of regras || []) {
    const porPalavra = r.palavras?.length && r.palavras.some(w => T.includes(plain(w)));
    const porDocumento = r.documentos?.length && docId && r.documentos.includes(docId);
    if (!porPalavra && !porDocumento) continue;
    if (r.nenhum) return null;          // caso que o escritório decide (ex.: atestado de acompanhante)
    if (r.valor) return { valor: r.valor, motivo: porPalavra ? 'texto do documento' : 'tipo de documento' };
    if (isNaN(n)) return null;
    const lim = r.limiteDias || 15;
    return { valor: n > lim ? r.acima15 : r.ate15, motivo: `${n} ${n === 1 ? 'dia' : 'dias'} no documento` };
  }
  return null;
}
export function renderTemplate(tpl, values) {
  if (!tpl) return '';
  const lines = Array.isArray(tpl) ? tpl : [tpl];
  const out = [];
  for (const line of lines) {
    let missing = false;
    const s = line.replace(/\{(\w+)(?:\|([^}]*))?\}/g, (_, k, fb) => {
      const v = values[k];
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) { if (fb != null) return fb; missing = true; return ''; }
      return Array.isArray(v) ? v.join(', ') : String(v);
    });
    if (!missing && s.trim()) out.push(s);
  }
  return out.join('\n');
}
