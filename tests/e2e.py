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

async def abrir(p, tmp, plataforma=False, url=URL):
    ctx = await p.chromium.launch_persistent_context(tmp, headless=True, channel='chromium', viewport={'width': 1400, 'height': 900},
        args=[f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}', '--disable-dev-shm-usage', '--no-sandbox', '--window-size=1400,900'])
    async def route(r):
        u = r.request.url
        if u.startswith('https://raw.githubusercontent.com/') and u.split('?')[0].endswith('/regras.json'):
            # testa sempre as regras desta pasta (não as publicadas)
            await r.fulfill(status=200, content_type='application/json', body=open(os.path.join(ROOT, 'rules', 'regras.json'), encoding='utf-8').read())
        elif '/api/storage/v1/containers/documents' in u:
            # documentos que o escritório publica: também só com o cabeçalho de acesso do portal (forma da resposta: candidata, a calibrar)
            if r.request.headers.get('authorization') != 'Bearer teste-123' or 'clientId' not in u:
                await r.fulfill(status=401, content_type='application/json', body='{"message":"Unauthorized"}')
            else:
                docs = [{'id': 'd1', 'name': 'Folha de pagamento 09-2026.pdf', 'createdDate': '2026-10-05T12:00:00Z', 'parent': {'name': 'Folha'}, 'customFields': [{'Name': 'competence', 'Value': '2026-09'}]},
                        {'id': 'd2', 'name': 'Guia do FGTS.pdf', 'createdDate': '2026-10-07T12:00:00Z', 'parent': {'name': 'Guias'}}]
                await r.fulfill(status=200, content_type='application/json', body=json.dumps({'items': docs, 'totalItems': 2}))
        elif '/api/br-payroll-sr/' in u:
            # como o Onvio real: sem o cabeçalho de acesso que o portal usa, 401 (o cookie não basta)
            if r.request.headers.get('authorization') != 'Bearer teste-123':
                await r.fulfill(status=401, content_type='application/json', body='{"message":"Unauthorized"}')
            elif '/clients/' in u and '/employees' in u:
                await r.fulfill(status=200, content_type='application/json', body=json.dumps([{'name': 'JOAO DA SILVA', 'status': 'Ativo', 'hireDate': '2025-01-10'}, {'name': 'MARIA SOUZA', 'status': 'Ativo', 'hireDate': '2026-09-01'}]))
            else:
                itens = [{'id': 77, 'status': {'description': 'Aguardando o cliente'}, 'employee': {'name': 'JOAO DA SILVA'}, 'subject': 'Férias – JOAO DA SILVA'}] if 'vacation' in u else []
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
    await page.goto(url); await page.wait_for_timeout(2500)
    # Chromium sem tela guarda a área de clique antiga do iframe da extensão (a parte de baixo não recebia cliques);
    # redimensionar a janela uma vez refaz essa área. No Chrome de verdade não acontece.
    await page.set_viewport_size({'width': 1400, 'height': 901}); await page.set_viewport_size({'width': 1400, 'height': 900}); await page.wait_for_timeout(300)
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
    check(await pn.locator('#sim-modalidade').count() == 1, 'Calcular abre na simulação de rescisão')
    await pn.click('[data-t="ferias"]'); await page.wait_for_timeout(300)
    await pn.fill('#a', '16102026'); await pn.dispatch_event('#a', 'input'); await pn.fill('#b', '30'); await pn.dispatch_event('#b', 'input')
    await page.wait_for_timeout(300)
    out = await pn.locator('#out').inner_text()
    check('15/11/2026' in out and 'sexta' in out, 'calculadora de férias (retorno e alerta de sexta-feira)')
    await ctx.close(); shutil.rmtree(tmp, ignore_errors=True)

async def cenario_plataforma(p):
    print('\n[plataforma] tela cheia por cima do portal (2.0)')
    tmp = tempfile.mkdtemp()
    ctx, page = await abrir(p, tmp, plataforma=True)
    pn = painel(page)
    check(await pn.evaluate("document.body.classList.contains('plat')"), 'a plataforma abre sozinha em tela cheia')
    check(await page.evaluate("document.elementFromPoint(700, 450)?.id") == 'ct-assistente-host', 'o portal fica coberto')
    await pn.click('#rail [data-mod="pendencias"]'); await page.wait_for_timeout(5000)
    await pn.click('[data-vis-sol="tabela"]'); await page.wait_for_timeout(300)
    lista = await pn.locator('#sol-list').inner_text()
    check('JOAO DA SILVA' in lista and await pn.locator('#sol-list .dp-row').count() == 2, 'solicitações lidas com o mesmo acesso do portal (o cookie sozinho recebe 401)')
    check(await pn.locator('#plat-aviso').inner_text() == '', 'sem aviso fixo quando o portal foi lido')
    check(await pn.locator('#plat-sync .sync-d.st-parcial').count() == 1 and 'Solicitação Geral' in await pn.evaluate("document.querySelector('.sync-pop').textContent"), 'tipo não lido aparece só no indicador (em parte)')
    await pn.click('#rail [data-mod="funcionarios"]'); await page.wait_for_timeout(1500)
    check('MARIA SOUZA' in await pn.locator('#emp-list').inner_text(), 'funcionários lidos pela API do portal')
    await pn.click('#rail [data-mod="documentos"]'); await page.wait_for_timeout(800)
    await pn.click('[data-doc-aba="escritorio"]'); await page.wait_for_timeout(4000)
    lista = await pn.locator('#pub-lista').inner_text()
    check('Folha de pagamento 09-2026.pdf' in lista and 'Guia do FGTS.pdf' in lista and 'Guias' in lista and '09/2026' in lista, 'Documentos do escritório: lista lida da API do portal (com o acesso do portal)')
    check(await pn.locator('#pub-lista [data-baixar]').count() == 2 and 'No portal' in await pn.locator('#pub-lista [data-baixar]').first.inner_text(), 'sem o caminho do download mapeado, o botão leva ao portal')
    await pn.click('#rail [data-mod="inicio"]'); await page.wait_for_timeout(500)
    await pn.set_input_files('#file-input', os.path.join(FIX, 'atestado.pdf'))
    for _ in range(60):
        await page.wait_for_timeout(1000)
        if 'files:' in await log_mock(page): break
    await page.wait_for_timeout(1500)
    v = dict(await page.evaluate("""() => [...document.querySelectorAll('[formcontrolname]:not([type=radio])')].map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value])"""))
    check(v.get('selectedEmployee') == 'JOAO DA SILVA' and v.get('leaveDate') == '05/10/2026', 'preenche o portal por baixo')
    check(await pn.locator('#f-empregado').input_value() == 'JOAO DA SILVA', 'formulário próprio da plataforma mostra o que foi lido')
    await page.screenshot(path=os.path.join(tempfile.gettempdir(), 'assistente-plataforma.png'))
    await pn.click('#btn-send'); await page.wait_for_timeout(1500)
    check(await pn.locator('#modal').is_visible() and 'SUBMITTED' not in await log_mock(page), 'resumo antes de enviar, nada enviado ainda')
    await pn.click('#m-send'); await page.wait_for_timeout(1500)
    check('SUBMITTED' in await log_mock(page), 'envia pelo botão do portal só depois de confirmar')
    await ctx.close(); shutil.rmtree(tmp, ignore_errors=True)

async def cenario_sem_acesso(p):
    print('\n[sem acesso] a API recusa a leitura (401): avisa sem trocar de tela')
    tmp = tempfile.mkdtemp()
    ctx, page = await abrir(p, tmp, plataforma=True, url=URL + '?semacesso')
    pn = painel(page)
    await pn.click('#rail [data-mod="pendencias"]'); await page.wait_for_timeout(9000)
    txt = await pn.locator('#plat-aviso').inner_text()
    check('Não consegui ler o portal agora' in txt and 'Possíveis causas' in txt and 'Tentar de novo' in txt, 'aviso fixo de leitura, com causas e o que fazer')
    check('Sem leitura do portal' in await pn.locator('#plat-sync').inner_text(), 'indicador mostra que não há leitura')
    check(await pn.evaluate("document.body.classList.contains('plat')"), 'continua em tela cheia (não pula para o portal)')
    check('expirou' not in (await pn.locator('#plat-aviso').inner_text()), 'não diz que a sessão expirou')
    await ctx.close(); shutil.rmtree(tmp, ignore_errors=True)

async def main():
    async with async_playwright() as p:
        await cenario_preencher(p, os.path.join(FIX, 'atestado.pdf'), 'pdf')
        await cenario_preencher(p, os.path.join(FIX, 'atestado-foto.png'), 'ocr')
        await cenario_guarda(p)
        await cenario_plataforma(p)
        await cenario_sem_acesso(p)
    print(f'\n{"TUDO CERTO" if not falhas else str(len(falhas)) + " FALHA(S)"}')
    sys.exit(1 if falhas else 0)

asyncio.run(main())
