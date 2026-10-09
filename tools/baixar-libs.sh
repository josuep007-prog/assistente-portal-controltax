#!/usr/bin/env bash
# Baixa do npm as bibliotecas e fontes empacotadas na extensão (lib/ e fonts/).
# Elas não ficam no repositório (12 MB); este script as recria com as versões exatas
# e confere o SHA-256 de cada arquivo. Uso: bash tools/baixar-libs.sh  (precisa de node/npm)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f lib/tesseract/lang/por.traineddata.gz ] && [ -f fonts/archivo-latin-700-normal.woff2 ] && [ "${1:-}" != "--forcar" ]; then
  echo "lib/ e fonts/ já existem (use --forcar para baixar de novo)."; exit 0
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pacote() {  # pacote <nome@versão> -> pasta extraída
  local d="$TMP/$(echo "$1" | tr '/@' '__')"; mkdir -p "$d"
  (cd "$d" && npm pack "$1" --silent >/dev/null && tar -xzf ./*.tgz)
  echo "$d/package"
}
PDF=$(pacote pdfjs-dist@4.10.38)
TJS=$(pacote tesseract.js@5.1.1)
CORE=$(pacote tesseract.js-core@5.1.1)
POR=$(pacote @tesseract.js-data/por@1.0.0)
XLSX=$(pacote xlsx@0.18.5)
ARC=$(pacote @fontsource/archivo@5.3.0)
MONO=$(pacote @fontsource/ibm-plex-mono@5.3.0)
SANS=$(pacote @fontsource/ibm-plex-sans@5.3.0)

mkdir -p lib/pdfjs lib/tesseract/core lib/tesseract/lang lib/xlsx fonts
cp "$PDF/build/pdf.min.mjs" "$PDF/build/pdf.worker.min.mjs" "$PDF/LICENSE" lib/pdfjs/
cp "$TJS/dist/tesseract.min.js" "$TJS/dist/worker.min.js" "$TJS/LICENSE.md" lib/tesseract/
cp "$CORE/tesseract-core-lstm.wasm.js" "$CORE/tesseract-core-simd-lstm.wasm.js" "$CORE/LICENSE" lib/tesseract/core/
cp "$POR/4.0.0_best_int/por.traineddata.gz" lib/tesseract/lang/
cp "$XLSX/dist/xlsx.full.min.js" "$XLSX/dist/LICENSE" lib/xlsx/
for w in 500 600 700; do cp "$ARC/files/archivo-latin-$w-normal.woff2" fonts/; done
for w in 400 500; do cp "$MONO/files/ibm-plex-mono-latin-$w-normal.woff2" fonts/; done
for w in 400 500 600; do cp "$SANS/files/ibm-plex-sans-latin-$w-normal.woff2" fonts/; done

sha256sum -c --quiet <<'EOF'
ab74eca5ad115fe4cfec82ba641e5d37e4d92c58dfb1bfc1e464e9039c9d17cf  fonts/archivo-latin-500-normal.woff2
d9e8c29fdd348edde2a4f9aae438e569dd165bbbdebda78495824a2d9aaa67e8  fonts/archivo-latin-600-normal.woff2
abada6cd4c92a9a706f6d7ed3189f322ff43dd78b9402c7d1137465b861d2a04  fonts/archivo-latin-700-normal.woff2
08949f728dc52d528e69b1667d15c89a5686a4ee9a296ff90983985f99c380f7  fonts/ibm-plex-mono-latin-400-normal.woff2
01d285447409c8a588692162439a038b8cbd7871309ee20267b0d2d91c6e8e22  fonts/ibm-plex-mono-latin-500-normal.woff2
3b646991d30055a93a4ecc499713d4347953a74a947ecab435ab72070cbdab0e  fonts/ibm-plex-sans-latin-400-normal.woff2
0717336fb31fcdcde4b8deb3675bb4a0f7f6d484864afcd6751ac29975962203  fonts/ibm-plex-sans-latin-500-normal.woff2
8960851d691c054ed38e259bdcf1a6190d157b4203ed5bb32c632a863fb8ec2f  fonts/ibm-plex-sans-latin-600-normal.woff2
0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594  lib/pdfjs/LICENSE
27fc2a057a00f92a4334ad06e17dbd7259912954e9fb7f76400bcca5fd190a9c  lib/pdfjs/pdf.min.mjs
1baa1844c89c80a5b2797c916e75ab29254be46d8e9cb53cb6364d7aad84be36  lib/pdfjs/pdf.worker.min.mjs
b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1  lib/tesseract/LICENSE.md
c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08  lib/tesseract/core/LICENSE
8f04aa0cc81e7bde33f80e92fa01a7a665f0b4884d098acf5de9c7104a11dfaa  lib/tesseract/core/tesseract-core-lstm.wasm.js
ce20eda9533cbed1e6c2b4276fbae1e0adc61b6754b5513084be601787b457cf  lib/tesseract/core/tesseract-core-simd-lstm.wasm.js
dacebc1386ddaaf8389f81094236cca0d690897cde693d48cbdaa881c86e2b4c  lib/tesseract/lang/por.traineddata.gz
a8e29918d098b2b06e1012bdaeffb4aec0445c5d5654709023e0bd1f442a80e8  lib/tesseract/tesseract.min.js
aca1229639fc9907d86f96e825955a2b7c5716d17f3bc3acd71f9c7ab66181fc  lib/tesseract/worker.min.js
4d2a38ac35cda06a555c84074a819d413339cd3691b822cae50f8f322fe01f64  lib/xlsx/LICENSE
c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99  lib/xlsx/xlsx.full.min.js
EOF
echo "lib/ e fonts/ prontos (versões conferidas)."
