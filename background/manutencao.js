/* Manutenção de dois em dois dias (service worker e testes em Node): retrato das regras (backup) e aviso de versão nova da
 * extensão. Funções puras; o service worker é quem guarda e avisa. Sem rede além do que ele já faz (o arquivo de regras). */
(() => {
  const DIA = 86400000;
  const partes = (v) => String(v || '').split(/[.\-]/).map(x => parseInt(x, 10) || 0);
  /** 1 se a > b, -1 se a < b, 0 se iguais, comparando número a número ('2.13.10' > '2.13.9'; '2026.10.26-10' > '2026.10.26-9'). */
  function compararVersoes(a, b) {
    const x = partes(a), y = partes(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  }
  /** Já se passaram `dias` desde `ultima` (ISO ou ms)? Sem data guardada, sim. */
  function vencido(ultima, agora = Date.now(), dias = 2) {
    const t = typeof ultima === 'number' ? ultima : Date.parse(ultima || '');
    return !Number.isFinite(t) || agora - t >= dias * DIA || t > agora + DIA;
  }
  /** Retratos das regras, o mais novo primeiro, no máximo `max`. Retrato igual ao mais novo não é repetido. */
  function guardarRetrato(lista, novo, max = 2) {
    const l = Array.isArray(lista) ? lista : [];
    if (!novo?.rulesJson) return l;
    if (l[0]?.rulesJson === novo.rulesJson) return l;
    return [novo, ...l].slice(0, Math.max(1, max));
  }
  /** Regras publicadas dizem que há uma versão mais nova que a instalada? (config.atualizacaoExtensao) */
  function atualizacaoDisponivel(regras, versaoInstalada) {
    const a = regras?.config?.atualizacaoExtensao;
    if (!a?.versao || compararVersoes(a.versao, versaoInstalada) <= 0) return null;
    return { versao: String(a.versao), url: String(a.url || ''), mensagem: String(a.mensagem || '') };
  }
  globalThis.CtManutencao = { DIA, compararVersoes, vencido, guardarRetrato, atualizacaoDisponivel };
})();
