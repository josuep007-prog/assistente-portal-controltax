/* Controles do simulador: documentos de exemplo e restauração dos dados. */
(function () {
  var details = document.getElementById('sim-samples');
  document.querySelectorAll('[data-file]').forEach(function (b) {
    b.addEventListener('click', async function () {
      details.open = false;
      var urls = b.dataset.file.split(',');
      try {
        var files = await Promise.all(urls.map(async function (url) {
          var r = await fetch(url);
          var blob = await r.blob();
          var name = url.split('/').pop();
          var type = /\.pdf$/.test(name) ? 'application/pdf' : /\.png$/.test(name) ? 'image/png' : /\.csv$/.test(name) ? 'text/csv' : blob.type;
          return new File([blob], name, { type: type, lastModified: Date.now() });
        }));
        var hooks = window.__ctSim && window.__ctSim.hooks();
        if (hooks) hooks.sendFiles(files);
        else document.addEventListener('ct-sim-ready', function () { window.__ctSim.hooks().sendFiles(files); }, { once: true });
      } catch (e) {
        console.error(e);
      }
    });
  });
  document.addEventListener('click', function (e) { if (details.open && !details.contains(e.target)) details.open = false; });
  // cliques dentro do painel (iframe) não chegam a esta página: fecha o menu quando ela perde o foco
  window.addEventListener('blur', function () { details.open = false; });
  var reset = document.getElementById('sim-reset');
  reset.addEventListener('click', function () {
    if (reset.dataset.confirm) {
      try { localStorage.removeItem('ct-sim-storage'); } catch (e) { /* ignore */ }
      window.__ctSim.reset();
      reset.textContent = 'Restaurar exemplo'; delete reset.dataset.confirm;
      location.reload();
    } else {
      reset.dataset.confirm = '1'; reset.textContent = 'Confirmar: apagar o que fiz aqui';
      setTimeout(function () { reset.textContent = 'Restaurar exemplo'; delete reset.dataset.confirm; }, 4000);
    }
  });
})();
