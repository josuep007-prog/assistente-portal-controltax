"""
Teste ponta a ponta do Assistente numa réplica local do formulário do portal.
Nada é enviado ao Onvio: todas as requisições para onvio.com.br são respondidas aqui.

Requisitos (uma vez):  pip install -r tests/requirements.txt  &&  python -m playwright install chromium
Rodar:                 python tests/e2e.py
No Linux sem tela:     xvfb-run -a python tests/e2e.py
"""
import asyncio, json, os, sys, tempfile, shutil
os.environ.setdefault('PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS', '1')  # para interceptar o que o service worker baixa
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FIX = os.path.join(ROOT, 'tests', 'fixtures')
MOCK = open(os.path.join(FIX, 'portal-afastamento.html'), encoding='utf-8').read()
URL = 'https://onvio.com.br/clientcenter/pt/actions/service-request/employee-leave/add'
falhas = []

def check(cond, msg):
    print(('  OK   ' if cond else '  FALHA ') + msg)
    if not cond: falhas.append(msg)

async def abrir(p, tmp, plataforma=False):
    ctx = await p.chromium.launch_persistent_context(tmp, headless=True, channel='chromium', viewport={'width': 1400, 'height': 900},
        args=[f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}', '--disable-dev-shm-usage', '--no-sandbox'])
    async def route(r):
        u = r.request.url
        if u.startswith('https://raw.githubusercontent.com/') and u.split('?')[0].endswith('/regras.json'):
            # testa sempre as regras desta pasta (não as publicadas)
            await r.fulfill(status=200, content_type='application/json', body=open(os.path.join(ROOT, 'rules', 'regras.json'), encoding='utf-8').read())
        elif '/api/br-payroll-sr/' in u:
            itens = [{'id': 77, 'status': {'description': 'Aguardando o cliente'}, 'employee': {'name': 'JOAO DA SILVA'}}] if 'vacation' in u else []
            await r.fulfill(status=200, content_type='application/json', body=json.dumps({'items': itens, 'totalItems': len(itens)}))
        elif u.startswith('https://onvio.com.br/'):
            await r.fulfill(status=200, content_type='text/html', body=MOCK)
        else:
            await r.continue_()
    await ctx.route('**/*', route)
    if not plataforma:
        # testes da 1.x: o portal à vista e o painel encaixado (a 2.0 abre a plataforma em tela cheia)
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
        await sw.evaluate("chrome.storage.local.set({ prefs: { abrirComo: 'painel' } })")
    page = await ctx.new_page()
    await page.goto(URL); await page.wait_for_timeout(2500)
    return ctx, page

def painel(page):
    return next(f for f in page.frames if f.url.startswith('chrome-extension://') and 'panel/panel.html' in f.url)

async def log_mock(page):
    return await page.evaluate("document.getElementById('log').textContent")

async def cenario_preencher(p, arquivo, nome):
    print(f'\n[{nome}] ler {os.path.basename(arquivo)} e preencher')
    tmp = tempfile.mkdtemp()
    ctx, page = await abrir(p, tmp)
    await page.mouse.click(1330, 855); await page.wait_for_timeout(1200)   # botão "Assistente"
    pn = painel(page)
    await pn.set_input_files('#file-input', arquivo)
    for _ in range(60):
        await page.wait_for_timeout(1000)
        if 'files:' in await log_mock(page): break
    await page.wait_for_timeout(1200)
    v = dict(await page.evaluate("""() => [...document.querySelectorAll('[formcontrolname]:not([type=radio])')].map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value])"""))
    print('       regras:', await pn.locator('#rules-ver').inner_text(), '| tipo:', v.get('selectedLeaveType'), '| assunto:', v.get('subject'))
    check(v.get('selectedEmployee') == 'JOAO DA SILVA', 'empregado reconhecido na lista')
    check(v.get('selectedLeaveType') == 'Doença período superior a 15 dias', 'tipo de afastamento (>15 dias)')
    check(v.get('leaveDate') == '05/10/2026', 'data de afastamento')
    check('JOAO DA SILVA' in v.get('subject', ''), 'assunto gerado')
    check('M54' not in v.get('description', ''), 'CID fora da descrição (padrão)')
    check(os.path.basename(arquivo) in await log_mock(page), 'arquivo anexado no portal')
    await page.screenshot(path=os.path.join(tempfile.gettempdir(), f'assistente-{nome}.png'))
    await page.click('#add'); await page.wait_for_timeout(1200)
    check('SUBMITTED' in await log_mock(page), 'envio liberado quando está tudo certo')
    await ctx.close(); shutil.rmtree(tmp, ignore_errors=True)

async def cenario_guarda(p):
    print('\n[guarda] conferência antes de enviar e documento de outro tipo')
    tmp = tempfile.mkdtemp()
    ctx, page = await abrir(p, tmp)
    await page.click('#add'); await page.wait_for_timeout(1500)
    pn = painel(page)
    check(await pn.locator('#modal').is_visible(), 'aviso "Antes de enviar" aparece')
    check('SUBMITTED' not in await log_mock(page), 'envio segurado com pendências')
    await pn.click('#m-fix'); await page.wait_for_timeout(500)
    check(not await pn.locator('#modal').is_visible(), 'aviso fecha ao clicar em Corrigir agora')
    await pn.set_input_files('#file-input', os.path.join(FIX, 'pedido-demissao.pdf')); await page.wait_for_timeout(4000)
    check('Aviso Prévio de Rescisão' in await pn.locator('#outro-tipo').inner_text(), 'sugere a aba certa para pedido de demissão')
    check('files:' not in await log_mock(page), 'não anexa documento de outro tipo')
    await pn.click('.tab[data-view="ferramentas"]'); await page.wait_for_timeout(300)
    await pn.fill('#a', '16102026'); await pn.dispatch_event('#a', 'input'); await pn.fill('#b', '30'); await pn.dispatch_event('#b', 'input')
    await page.wait_for_timeout(300)
    out = await pn.locator('#out').inner_text()
    check('15/11/2026' in out and 'sexta' in out, 'calculadora de férias (retorno e alerta de sexta-feira)')
    await ctx.close(); shutil.rmtree(tmp, ignore_errors=True)

async def main():
    async with async_playwright() as p:
        await cenario_preencher(p, os.path.join(FIX, 'atestado.pdf'), 'pdf')
        await cenario_preencher(p, os.path.join(FIX, 'atestado-foto.png'), 'ocr')
        await cenario_guarda(p)
    print(f'\n{"TUDO CERTO" if not falhas else str(len(falhas)) + " FALHA(S)"}')
    sys.exit(1 if falhas else 0)

asyncio.run(main())
