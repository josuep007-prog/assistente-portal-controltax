"""Auditoria medida do leitor de documentos (corpus FICTÍCIO de tools/gerar-corpus-leitor.py).

Carrega o leitor de verdade num Chromium sem tela — panel/extract.js (readFile: pdf.js, OCR do Tesseract,
planilhas) e panel/engine.js (classificação, extração, leitor de atestado) com as regras de rules/regras.json e a
lista de funcionários inventada do gabarito — e compara campo a campo com o gabarito:
  documento reconhecido, tipo de pedido sugerido, cada campo (certo / errado / vazio / indevido),
  confiança dada pelo motor e se o valor iria ao portal (campo do formulário, ou na descrição gerada).

Imita o caminho do painel: 1ª leitura sem tipo e sem funcionários (sugestão "Encontrei o caminho"), 2ª com o tipo
do pedido e a lista de funcionários (o que o applyAnalysis manda preencher; o funcionário passa pelo bestMatch).
Os textos lidos ficam em <corpus>/_textos.json (cache, fora do Git) para rodar de novo sem OCR (--cache).

Uso: python tools/auditar-leitor.py <pasta-do-corpus> [--so trecho] [--paralelo 3] [--cache]
Nada sai do computador: o servidor é local e o corpus é inventado.
"""
import argparse, asyncio, functools, http.server, json, os, re, socketserver, sys, threading, time, unicodedata

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ALTA = 0.6          # a partir daqui o painel mostra o valor como achado (abaixo, com "confira" em amarelo): erro sem aviso = GRAVE
GERADOS = {'assunto', 'descricao', 'conclusao', 'observacoes', 'tabelaRubricas'}

PAGINA = r"""<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>window.chrome = window.chrome || {}; window.chrome.runtime = { getURL: (p) => location.origin + '/' + p }; self.__ctOcrLog = [];</script>
<script type="module">
import { readFile } from '/panel/extract.js';
import * as E from '/panel/engine.js';
const rules = await (await fetch('/rules/regras.json')).json();
const tipoMime = (n) => /\.pdf$/i.test(n) ? 'application/pdf' : /\.png$/i.test(n) ? 'image/png' : /\.jpe?g$/i.test(n) ? 'image/jpeg' : /\.csv$/i.test(n) ? 'text/csv' : '';
window.__ler = async (nome) => {
  const b = await (await fetch('/__corpus/' + encodeURIComponent(nome))).blob();
  self.__ctOcrLog = []; const t0 = performance.now();
  const r = await readFile(new File([b], nome, { type: tipoMime(nome) }), () => {}, { ocr: true });
  return { texto: r.texto || '', metodo: r.metodo, confianca: r.confianca ?? null, rotacao: r.rotacao || 0, paginas: r.paginas, tabela: r.tabela || null, ocrLog: self.__ctOcrLog, ms: Math.round(performance.now() - t0) };
};
// mesmas listas do panel.js (docDeOutroTipo)
const DOCS_NEUTROS = ['certidao', 'aso', 'identidade', 'cpf', 'comprovanteEndereco', 'ctps', 'seguro', 'bancario'];
const FAMILIAS = [['avisoFerias', 'calculoFerias'], ['avisoRescisao', 'calculoRescisao'], ['cadastroEmpregado', 'cadastroEstagiario', 'cadastroContribuinte']];
const outroTipo = (doc, tipo) => { const dt = doc?.tipoSolicitacao; if (!dt || dt === tipo || DOCS_NEUTROS.includes(doc.id)) return null; if (FAMILIAS.some(f => f.includes(dt) && f.includes(tipo))) return null; return dt; };
const limiar = E.limiarPortal ? E.limiarPortal(rules) : 0;
window.__analisar = ({ nome, texto, tabela, tipoEsperado, funcionarios, hoje, metodo, confianca }) => {
  const h = new Date(hoje + 'T00:00:00');
  // como o painel: o método e a confiança do OCR vão junto (leitura fraca vira sugestão)
  const ocr = { metodo, confiancaOcr: metodo === 'ocr' ? confianca : null };
  const a1 = E.analyzeText(texto || nome, rules, { employees: [], tipoAtual: null, hoje: h, ...ocr });
  if (tabela) { a1.tipoSugerido = 'rubricas'; a1.documento = { id: 'planilha', nome: 'Planilha de lançamentos' }; }
  const tipo = tipoEsperado || a1.tipoSugerido;
  let a2 = null; const campos = {}; let outro = null;
  if (tipo) {
    a2 = E.analyzeText(texto || nome, rules, { employees: funcionarios, tipoAtual: tipo, hoje: h, ...ocr });
    if (tabela) a2.documento = { id: 'planilha', nome: 'Planilha de lançamentos' };
    const t = E.resolveTipo(rules, tipo); outro = outroTipo(a2.documento, tipo);
    const desc = JSON.stringify(t.descricao || []);
    for (const [k, c] of Object.entries(a2.campos)) {
      const def = t.campos[k]; if (!def) continue;
      let valor = c.valor, conf = c.conf;
      if (k === 'empregado') { const m = E.bestMatch(valor, funcionarios, 0.7); if (m) valor = m.option; else conf = 0.3; }
      const naDescricao = desc.includes('{' + k + '}') && (k !== 'cid' || !!rules.config?.incluirCidNaDescricao);
      // abaixo do limiar o painel não manda ao portal: fica como sugestão de um clique ("Usar")
      const sugestao = conf < limiar;
      campos[k] = { valor: String(valor), conf, fonte: c.fonte, tipoCampo: def.tipo, somenteAssistente: !!def.somenteAssistente,
        portal: !outro && !sugestao && (!def.somenteAssistente || naDescricao), comoVai: outro ? 'descartado (documento de outro tipo)' : sugestao ? 'sugestão (Usar)' : def.somenteAssistente ? (naDescricao ? 'descrição' : 'só no assistente') : 'campo do portal' };
    }
  }
  const docId = (a2 || a1).documento?.id;
  return {
    doc1: a1.documento?.id || null, doc1Score: a1.documento?.score != null ? +a1.documento.score.toFixed(2) : null, alternativas: (a1.alternativas || []).map(d => d.id),
    sugerido: a1.tipoSugerido || null, doc2: a2?.documento?.id || null, tipoAvaliado: tipo || null, outroTipo: outro, campos,
    candidatos: a2?.candidatos || null, paciente: a2?.paciente || null, avisos: (a2?.avisos || []).map(a => a.id || a.mensagem.slice(0, 60)), pessoa: a2?.pessoa || null,
    aso: docId === 'aso' ? E.readASO(texto) : null, resumo: E.summarizeDocument(a2 || a1, texto || ''),
    linhasTabela: tabela ? tabela.slice(1).map(r => String(r[0] || '')) : null
  };
};
window.__pronto = true;
</script></body></html>"""


# ---------------------------------------------------------------- servidor local (repositório + corpus)
def servidor(corpus):
    class H(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.gz': 'application/octet-stream'}

        def __init__(s, *a, **k): super().__init__(*a, directory=RAIZ, **k)

        def log_message(s, *a): pass

        def do_GET(s):
            if s.path.startswith('/__auditoria'):
                b = PAGINA.encode(); s.send_response(200); s.send_header('Content-Type', 'text/html; charset=utf-8'); s.send_header('Content-Length', str(len(b))); s.end_headers(); s.wfile.write(b); return
            if s.path.startswith('/__corpus/'):
                from urllib.parse import unquote
                f = os.path.join(corpus, os.path.basename(unquote(s.path[len('/__corpus/'):])))
                if not os.path.isfile(f): s.send_error(404); return
                b = open(f, 'rb').read(); s.send_response(200); s.send_header('Content-Type', 'application/octet-stream'); s.send_header('Content-Length', str(len(b))); s.end_headers(); s.wfile.write(b); return
            super().do_GET()

    class T(socketserver.ThreadingMixIn, http.server.HTTPServer): daemon_threads = True
    srv = T(('127.0.0.1', 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# ---------------------------------------------------------------- comparação
def N(s):
    s = unicodedata.normalize('NFD', str(s or '')); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^A-Z0-9]+', ' ', s.upper()).strip()


def dig(s): return re.sub(r'\D', '', str(s or ''))


def data(s):
    m = re.match(r'^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\s*$', str(s or ''))
    if not m: return None
    y = int(m.group(3)); y = y + 2000 if y < 100 else y
    return f'{int(m.group(1)):02d}/{int(m.group(2)):02d}/{y}'


def moeda(s):
    t = re.sub(r'[^\d,.]', '', str(s or ''))
    if ',' in t: t = t.replace('.', '').replace(',', '.')
    try: return round(float(t), 2)
    except ValueError: return None


def comparar(k, tipoCampo, esperado, obtido):
    """'certo' | 'parcial' | 'errado'"""
    if k in ('cpf', 'pis', 'cep', 'telefone', 'titulo', 'cnh'): return 'certo' if dig(esperado) == dig(obtido) else 'errado'
    if tipoCampo == 'data' or data(esperado): return 'certo' if data(esperado) == data(obtido) else 'errado'
    if tipoCampo == 'numero': return 'certo' if dig(esperado).lstrip('0') == dig(obtido).lstrip('0') else 'errado'
    if tipoCampo == 'moeda': return 'certo' if moeda(esperado) == moeda(obtido) else 'errado'
    if k == 'cid': return 'certo' if N(esperado).replace(' ', '') == N(obtido).replace(' ', '') else 'errado'
    e, o = N(esperado), N(obtido)
    if e == o: return 'certo'
    if e and o and (e in o or o in e):
        # combo/rádio: o portal escolhe a opção mais parecida ("VITORIA ES" → Vitória)
        if tipoCampo in ('combo', 'radio'): return 'certo'
        return 'parcial'
    return 'errado'


def avaliar(g, r):
    """Uma linha por campo: estado, valor lido, confiança, se ia ao portal e a gravidade."""
    linhas = []
    esperados = g.get('campos') or {}
    obtidos = r['campos']
    for k in sorted(set(esperados) | set(obtidos)):
        if k in GERADOS: continue
        esp = esperados.get(k, '__nao_listado__'); c = obtidos.get(k)
        if esp == '*': continue
        if c is None:
            if esp in (None, '__nao_listado__'): continue
            linhas.append(dict(campo=k, estado='vazio', esperado=esp, obtido=None, conf=None, portal=False, gravidade='')); continue
        if esp in (None, '__nao_listado__'):
            if not c['portal'] and esp == '__nao_listado__': continue          # extra que nem vai ao portal: não conta
            estado = 'indevido'
        else:
            estado = comparar(k, c['tipoCampo'], esp, c['valor'])
        grav = ''
        if estado != 'certo':
            grav = 'GRAVE' if c['portal'] and c['conf'] >= ALTA else 'media' if c['portal'] else 'leve'
        linhas.append(dict(campo=k, estado=estado, esperado=None if esp == '__nao_listado__' else esp, obtido=c['valor'], conf=round(c['conf'], 2), portal=c['portal'], comoVai=c['comoVai'], fonte=c.get('fonte'), gravidade=grav))
    return linhas


# ---------------------------------------------------------------- execução no navegador
async def rodar(corpus, gab, so, paralelo, usar_cache):
    from playwright.async_api import async_playwright
    cache_f = os.path.join(corpus, '_textos.json')
    cache = json.load(open(cache_f, encoding='utf-8')) if usar_cache and os.path.isfile(cache_f) else {}
    docs = [d for d in gab['documentos'] if not so or any(s in d['arquivo'] for s in so.split(','))]
    srv = servidor(corpus); base = f'http://127.0.0.1:{srv.server_address[1]}'
    resultados = {}
    async with async_playwright() as p:
        nav = await p.chromium.launch(channel='chromium', headless=True)

        async def nova():
            pg = await nav.new_page(); pg.set_default_timeout(300000)
            pg.on('pageerror', lambda e: print('  [erro na página]', e))
            await pg.goto(base + '/__auditoria'); await pg.wait_for_function('window.__pronto === true', timeout=60000)
            return pg

        fila = asyncio.Queue()
        for d in docs: fila.put_nowait(d)

        async def trabalhador(n):
            pg = await nova()
            while not fila.empty():
                d = fila.get_nowait(); nome = d['arquivo']
                try:
                    if nome not in cache:
                        cache[nome] = await pg.evaluate('(n) => window.__ler(n)', nome)
                    lido = cache[nome]
                    an = await pg.evaluate('(a) => window.__analisar(a)', dict(nome=nome, texto=lido['texto'], tabela=lido.get('tabela'), tipoEsperado=d.get('tipo'), funcionarios=gab['funcionarios'], hoje=gab['hoje'], metodo=lido.get('metodo'), confianca=lido.get('confianca')))
                    resultados[nome] = dict(lido={k: v for k, v in lido.items() if k not in ('tabela',)}, analise=an)
                    print(f'  [{n}] {nome}: {lido["metodo"]} conf={lido.get("confianca")} rot={lido.get("rotacao")} {lido.get("ms", 0) / 1000:.0f}s → {an["doc1"]}/{an["sugerido"]}', flush=True)
                except Exception as e:
                    print(f'  [{n}] {nome}: FALHOU {str(e)[:200]}', flush=True)
                    resultados[nome] = dict(erro=str(e)[:300])
                    try: await pg.close()
                    except Exception: pass
                    pg = await nova()
            await pg.close()

        await asyncio.gather(*[trabalhador(i + 1) for i in range(paralelo)])
        await nav.close()
    srv.shutdown()
    json.dump(cache, open(cache_f, 'w', encoding='utf-8'), ensure_ascii=False)
    return docs, resultados


# ---------------------------------------------------------------- relatório
def pct(a, b): return f'{100 * a / b:5.1f}%' if b else '   — '


def relatorio(docs, resultados, saida):
    porDoc, porCampo, porForma, porBase = [], {}, {}, {}
    graves = []
    tot = dict(esperados=0, certos=0, preenchidos=0, errados=0, graves=0, docOk=0, docN=0, tipoOk=0, tipoN=0, aoPortal=0, aoPortalCertos=0, sugestoes=0, sugestoesCertas=0)
    print('\n=== POR ARQUIVO ===')
    for g in docs:
        nome = g['arquivo']; r = resultados.get(nome)
        if not r or 'erro' in r: print(f'{nome}: sem resultado ({(r or {}).get("erro", "")[:80]})'); continue
        a = r['analise']; lido = r['lido']
        linhas = avaliar(g, a)
        docOk = None if g.get('documento') is None else (a['doc1'] == g['documento'])
        tipoOk = (a['sugerido'] == g.get('tipo'))
        if docOk is not None: tot['docN'] += 1; tot['docOk'] += docOk
        tot['tipoN'] += 1; tot['tipoOk'] += tipoOk
        esperados = [l for l in linhas if l['esperado'] is not None]
        certos = [l for l in linhas if l['estado'] == 'certo']
        preench = [l for l in linhas if l['obtido'] is not None]
        errados = [l for l in linhas if l['estado'] in ('errado', 'parcial', 'indevido')]
        extras = []
        if g.get('aso') and a.get('aso'):
            for k, v in g['aso'].items():
                ok = N(a['aso'].get(k)) == N(v); extras.append(f'aso.{k}={"ok" if ok else repr(a["aso"].get(k))}')
        if g.get('linhas') is not None:
            extras.append('linhas ' + ('ok' if [N(x) for x in a.get('linhasTabela') or []] == [N(x) for x in g['linhas']] else repr(a.get('linhasTabela'))))
        tot['esperados'] += len(esperados); tot['certos'] += len(certos); tot['preenchidos'] += len(preench); tot['errados'] += len(errados)
        vai = [l for l in preench if l['portal']]; sug = [l for l in preench if l.get('comoVai', '').startswith('sugest')]
        tot['aoPortal'] += len(vai); tot['aoPortalCertos'] += sum(1 for l in vai if l['estado'] == 'certo')
        tot['sugestoes'] += len(sug); tot['sugestoesCertas'] += sum(1 for l in sug if l['estado'] == 'certo')
        for l in errados:
            if l['gravidade'] == 'GRAVE': tot['graves'] += 1; graves.append((nome, l))
        for l in linhas:
            pc = porCampo.setdefault(l['campo'], dict(esperados=0, certos=0, preenchidos=0, errados=0, graves=0, vazios=0))
            pc['esperados'] += l['esperado'] is not None; pc['certos'] += l['estado'] == 'certo'; pc['preenchidos'] += l['obtido'] is not None
            pc['errados'] += l['estado'] in ('errado', 'parcial', 'indevido'); pc['graves'] += l['gravidade'] == 'GRAVE'; pc['vazios'] += l['estado'] == 'vazio'
        for chave, mapa in ((g['forma'], porForma), (g['base'], porBase)):
            m = mapa.setdefault(chave, dict(arquivos=0, esperados=0, certos=0, preenchidos=0, errados=0, graves=0, docOk=0, tipoOk=0))
            m['arquivos'] += 1; m['esperados'] += len(esperados); m['certos'] += len(certos); m['preenchidos'] += len(preench); m['errados'] += len(errados)
            m['graves'] += sum(1 for l in errados if l['gravidade'] == 'GRAVE'); m['docOk'] += bool(docOk) or docOk is None; m['tipoOk'] += tipoOk
        porDoc.append(dict(arquivo=nome, metodo=lido['metodo'], confOcr=lido.get('confianca'), rotacao=lido.get('rotacao'), ocrLog=lido.get('ocrLog'), doc=a['doc1'], docEsperado=g.get('documento'),
                           sugerido=a['sugerido'], tipoEsperado=g.get('tipo'), outroTipo=a['outroTipo'], paciente=a['paciente'], candidatos=a['candidatos'], avisos=a['avisos'], linhas=linhas, extras=extras))
        marca = lambda ok: 'ok' if ok else 'X '
        print(f'\n{nome}  [{lido["metodo"]}{" conf " + str(lido.get("confianca")) if lido["metodo"] == "ocr" else ""}{" rot " + str(lido.get("rotacao")) if lido.get("rotacao") else ""}]'
              f'  doc {"--" if docOk is None else marca(docOk)} {a["doc1"]}  tipo {marca(tipoOk)} {a["sugerido"]}  campos {len(certos)}/{len(esperados)}'
              f'{"  outroTipo=" + a["outroTipo"] if a["outroTipo"] else ""}{"  candidatos=" + str(a["candidatos"]) if a["candidatos"] else ""}  {" ".join(extras)}')
        for l in linhas:
            if l['estado'] == 'certo': continue
            print(f'    {l["gravidade"] or "-":5} {l["campo"]:<20} {l["estado"]:<8} lido={l["obtido"]!r:<34} esperado={l["esperado"]!r:<28} conf={l["conf"]} {l.get("comoVai", "")}')

    print('\n=== POR TIPO DE DOCUMENTO ===')
    print(f'{"documento":<28}{"arq":>4}{"doc ok":>8}{"tipo ok":>8}{"precisão":>10}{"cobertura":>11}{"errados":>9}{"graves":>8}')
    for b, m in sorted(porBase.items()):
        print(f'{b:<28}{m["arquivos"]:>4}{m["docOk"]:>5}/{m["arquivos"]:<2}{m["tipoOk"]:>5}/{m["arquivos"]:<2}{pct(m["certos"], m["preenchidos"]):>10}{pct(m["certos"], m["esperados"]):>11}{m["errados"]:>9}{m["graves"]:>8}')
    print('\n=== POR FORMA DO ARQUIVO ===')
    for b, m in sorted(porForma.items()):
        print(f'{b:<10}{m["arquivos"]:>4} arquivos  doc ok {m["docOk"]}/{m["arquivos"]}  tipo ok {m["tipoOk"]}/{m["arquivos"]}  precisão {pct(m["certos"], m["preenchidos"])}  cobertura {pct(m["certos"], m["esperados"])}  errados {m["errados"]}  graves {m["graves"]}')
    print('\n=== POR CAMPO ===')
    print(f'{"campo":<22}{"esper.":>7}{"certos":>7}{"vazios":>7}{"errados":>8}{"graves":>7}{"precisão":>10}{"cobertura":>11}')
    for k, m in sorted(porCampo.items(), key=lambda x: (-x[1]['graves'], -x[1]['errados'])):
        print(f'{k:<22}{m["esperados"]:>7}{m["certos"]:>7}{m["vazios"]:>7}{m["errados"]:>8}{m["graves"]:>7}{pct(m["certos"], m["preenchidos"]):>10}{pct(m["certos"], m["esperados"]):>11}')
    print('\n=== RESUMO ===')
    print(f'documento reconhecido: {tot["docOk"]}/{tot["docN"]}   tipo de pedido sugerido certo: {tot["tipoOk"]}/{tot["tipoN"]}')
    print(f'precisão (certos/preenchidos): {pct(tot["certos"], tot["preenchidos"])}   cobertura (certos/esperados): {pct(tot["certos"], tot["esperados"])}')
    print(f'valores errados preenchidos: {tot["errados"]}   graves (iam ao portal com confiança ≥ {ALTA}): {tot["graves"]}')
    print(f'o que vai ao portal sozinho: {tot["aoPortal"]} valores, precisão {pct(tot["aoPortalCertos"], tot["aoPortal"])}   sugestões de um clique: {tot["sugestoes"]} ({pct(tot["sugestoesCertas"], tot["sugestoes"])} certas)')
    print('\n=== ERROS GRAVES ===')
    for nome, l in graves:
        print(f'  {nome:<38} {l["campo"]:<18} lido={l["obtido"]!r} esperado={l["esperado"]!r} conf={l["conf"]} ({l.get("fonte")})')
    json.dump(dict(total=tot, porArquivo=porDoc, porCampo=porCampo, porForma=porForma, porDocumento=porBase), open(saida, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'\nDetalhes em {saida}')


def lote(docs, resultados):
    """Vários arquivos no mesmo pedido: o applyAnalysis guarda o de maior confiança (empate: o último)."""
    grupos = [('afastamento', ['atestado-clinica--pdf.pdf', 'declaracao-comparecimento--pdf.pdf']),
              ('afastamento', ['atestado-upa--pdf.pdf', 'cat--pdf.pdf']),
              ('cadastroEmpregado', ['ficha-admissao--pdf.pdf', 'aso-admissional--pdf.pdf']),
              ('cadastroEmpregado', ['cnh--pdf.pdf', 'conta-luz--pdf.pdf', 'ctps-digital--pdf.pdf'])]
    print('\n=== LOTE (vários arquivos no mesmo formulário) ===')
    for tipo, arqs in grupos:
        if not all(a in resultados and 'analise' in resultados[a] for a in arqs): continue
        W = {}
        for a in arqs:
            for k, c in resultados[a]['analise']['campos'].items():
                if k in GERADOS: continue
                if k not in W or W[k][1] <= c['conf']: W[k] = (c['valor'], c['conf'], a.split('--')[0])
        mistura = {k: v for k, v in W.items() if v[2] != arqs[0].split('--')[0]}
        print(f'  {tipo}: {" + ".join(a.split("--")[0] for a in arqs)}')
        for k, (v, c, de) in sorted(W.items()):
            print(f'     {k:<20} {v!r:<34} conf={c:.2f}  de {de}{"   <- veio de outro documento" if k in mistura else ""}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('corpus'); ap.add_argument('--so', default=''); ap.add_argument('--paralelo', type=int, default=3); ap.add_argument('--cache', action='store_true')
    a = ap.parse_args()
    corpus = os.path.abspath(a.corpus)
    gab = json.load(open(os.path.join(corpus, 'gabarito.json'), encoding='utf-8'))
    t0 = time.time()
    docs, res = asyncio.run(rodar(corpus, gab, a.so, a.paralelo, a.cache))
    relatorio(docs, res, os.path.join(corpus, '_resultado.json'))
    lote(docs, res)
    print(f'\n{len(docs)} arquivos em {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
