"""
Teste do simulador (artefato) servido localmente, como o claude.ai serve: index.html embrulhado num esqueleto.
Rodar: python tests/sim_test.py [pasta_do_artefato]
"""
import asyncio, os, sys, threading, http.server, functools, json
from playwright.async_api import async_playwright

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'simulador-artefato'))
SKEL = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>{}</body></html>'

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path in ('/', '/index.html'):
            body = SKEL.format(open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()).encode()
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()
    def guess_type(self, p):
        if p.endswith('.mjs'): return 'text/javascript'
        return super().guess_type(p)

def serve():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8765), functools.partial(H, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv

falhas = []
def check(c, m):
    print(('  OK   ' if c else '  FALHA ') + m)
    if not c: falhas.append(m)

async def main():
    serve()
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        logs = []
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
        pg.on('pageerror', lambda e: logs.append('PAGEERR ' + str(e)))
        await pg.goto('http://127.0.0.1:8765/')
        await pg.wait_for_timeout(2000)
        await pg.screenshot(path='/tmp/sim-0.png')
        # abre Afastamento > Adicionar pelo menu do portal
        await pg.click('.p-menu-i[data-s="employee-leave"]'); await pg.click('[data-add]'); await pg.wait_for_timeout(1500)
        # documento de exemplo
        await pg.click('#sim-samples > summary'); await pg.click('[data-file="exemplos/atestado.pdf"]')
        for _ in range(30):
            await pg.wait_for_timeout(1000)
            n = await pg.evaluate("document.querySelectorAll('.p-chip').length")
            if n: break
        await pg.wait_for_timeout(1000)
        vals = dict(await pg.evaluate("""() => [...document.querySelectorAll('main [formcontrolname]:not([type=radio])')].map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value])"""))
        check(vals.get('selectedEmployee') == 'JOAO DA SILVA', 'empregado preenchido no simulador')
        check(vals.get('leaveDate') == '05/10/2026', 'data preenchida')
        check('atestado.pdf' in await pg.evaluate("document.querySelector('.p-chips').innerText"), 'anexo no seletor do portal simulado')
        await pg.screenshot(path='/tmp/sim-1.png')
        await pg.click('.form__buttons--add'); await pg.wait_for_timeout(1500)
        pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
        if pn and await pn.locator('#modal').is_visible():
            print('   aviso antes de enviar:', (await pn.locator('#modal').inner_text()).replace('\n', ' | ')[:400])
            await pg.screenshot(path='/tmp/sim-modal.png')
            if await pn.locator('#m-send').count(): await pn.click('#m-send'); await pg.wait_for_timeout(1200)
        check('Solicitações de Afastamento' in await pg.inner_text('main') and 'JOAO DA SILVA' in await pg.inner_text('main'), 'envio simulado volta à lista com o registro')
        # cadastro com a ficha
        await pg.click('.p-menu-i[data-s="employee-registration"]'); await pg.click('[data-add]'); await pg.wait_for_timeout(1200)
        await pg.click('#sim-samples > summary'); await pg.click('[data-file="exemplos/ficha-admissao.pdf"]')
        await pg.wait_for_timeout(9000)
        v2 = dict(await pg.evaluate("""() => [...document.querySelectorAll('main [formcontrolname]')].filter(e=>e.type!=='radio').map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value])"""))
        check(v2.get('name') == 'MARIA APARECIDA SOUZA LIMA', 'cadastro: nome')
        check(v2.get('motherName') == 'ANA SOUZA LIMA', 'cadastro: mãe (outra etapa)')
        check(v2.get('addressState') == 'São Paulo', 'cadastro: UF convertida (SP → São Paulo)')
        check(v2.get('addressCity') == 'São Paulo', 'cadastro: município depois da UF')
        print('   cadastro:', {k: v for k, v in v2.items() if v})
        await pg.screenshot(path='/tmp/sim-2.png')
        print('\n'.join(l for l in logs if 'rror' in l or 'PAGEERR' in l)[:2500])
        await b.close()
    print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S)')

asyncio.run(main())
