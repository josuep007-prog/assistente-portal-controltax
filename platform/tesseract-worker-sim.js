/* Só no simulador: o publicador de artefatos não serve .gz, então os dados do OCR
   vão publicados como "por.traineddata.gz.wasm" e este adaptador redireciona o download. */
var __fetch = self.fetch.bind(self);
self.fetch = function (url, opts) {
  return __fetch(String(url).replace(/\.traineddata\.gz(\?.*)?$/, '.traineddata.gz.wasm$1'), opts);
};
importScripts('../lib/tesseract/worker.min.js');
