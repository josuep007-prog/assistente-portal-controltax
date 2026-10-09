/* Aplica o tema salvo antes de a página aparecer (evita o piscar). */
try { const t = localStorage.getItem('ct-tema'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) { /* sem armazenamento */ }
