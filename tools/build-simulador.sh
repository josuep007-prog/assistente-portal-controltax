#!/usr/bin/env bash
# Monta a pasta do artefato (simulador) a partir do MESMO código da extensão.
# Uso: bash tools/build-simulador.sh [destino]   (padrão: ../simulador-artefato)
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="${1:-$SRC/../simulador-artefato}"
rm -rf "$DST" && mkdir -p "$DST/simulador"
cp "$SRC/simulador/index.html" "$DST/index.html"
cp "$SRC/simulador/portal.js" "$SRC/simulador/portal.css" "$SRC/simulador/sim.js" "$DST/simulador/"
cp -r "$SRC/simulador/exemplos" "$DST/exemplos"
for d in platform content panel lib fonts icons rules; do cp -r "$SRC/$d" "$DST/$d"; done
rm -rf "$DST/lib/xlsx"   # no simulador vem da CDN (ver platform/shim.js)
mv "$DST/lib/tesseract/lang/por.traineddata.gz" "$DST/lib/tesseract/lang/por.traineddata.gz.wasm"
# o publicador de artefatos recusa bytes de controle crus: troca por escapes \xNN (equivalentes em JS)
python3 - "$DST" <<'PY'
import re, sys, os
for p in ['lib/pdfjs/pdf.worker.min.mjs']:
    f = os.path.join(sys.argv[1], p); b = open(f, 'rb').read()
    open(f, 'wb').write(re.sub(rb'[\x00-\x08\x0b\x0c\x0e-\x1f]', lambda m: b'\\x%02x' % m.group(0)[0], b))
PY
echo "Simulador montado em $DST"
