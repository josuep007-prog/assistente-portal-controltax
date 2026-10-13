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
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
        pg.on('pageerror', lambda e: logs.append('PAGEERR ' + str(e)))
        await pg.goto('http://127.0.0.1:8765/')
        await pg.wait_for_timeout(2000)
        await pg.screenshot(path='/tmp/sim-0.png')
        pn = None
        leave = lambda: pg.evaluate("""() => Object.fromEntries([...document.querySelectorAll('main [formcontrolname]:not([type=radio])')].map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value]))""")
        async def espera_empregado(nome, s=40):
            for _ in range(s):
                await pg.wait_for_timeout(1000)
                try:
                    v = await leave()
                    if v.get('selectedEmployee') == nome and v.get('subject') and await pg.evaluate("document.querySelectorAll('.p-chip').length"):
                        await pg.wait_for_timeout(800); return await leave()
                except Exception: pass
            return await leave()
        async def enviar():
            await pg.click('.form__buttons--add'); await pg.wait_for_timeout(1200)
            if await painel().locator('#modal').is_visible() and await painel().locator('#m-send').count(): await painel().click('#m-send')
        def painel(): return next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
        so13 = os.environ.get('SIM_SO') == '13'   # SIM_SO=13 roda só a parte da versão 1.3
        if not so13:
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
            check(v2.get('addressCity') == 'São Paulo', f"cadastro: município depois da UF ({v2.get('addressCity')})")
            print('   cadastro:', {k: v for k, v in v2.items() if v})
            await pg.screenshot(path='/tmp/sim-2.png')

            # vários atestados de uma vez: uma solicitação por atestado
            print('\n[lote] três atestados de uma vez')
            await pg.click('.p-menu-i[data-s="employee-leave"]'); await pg.wait_for_timeout(800)
            await pg.click('#sim-samples > summary'); await pg.click('[data-file*="atestado-2.pdf"]')
            pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
            v = await espera_empregado('JOAO DA SILVA')
            lote_txt = await pn.locator('#lote').inner_text()
            check('1 de 3' in lote_txt, 'lote: abre a 1ª de 3 solicitações')
            check(v.get('selectedLeaveType') == 'Doença período superior a 15 dias', 'lote 1: tipo (mais de 15 dias)')
            check(v.get('subject') == 'Atestado médico – JOAO DA SILVA – 05/10/2026 (20 dias)', 'lote 1: assunto Atestado – Nome – data (dias)')
            await pg.screenshot(path='/tmp/sim-lote-1.png')
            await enviar()
            v = await espera_empregado('RONALDO DE SOUZA')
            check(v.get('selectedLeaveType') == 'Doença período igual ou inferior a 15 dias', 'lote 2: abriu sozinho e escolheu "igual ou inferior a 15 dias"')
            check(v.get('subject') == 'Atestado médico – RONALDO DE SOUZA – 08/10/2026 (3 dias)', 'lote 2: assunto')
            chips = await pg.evaluate("document.querySelector('.p-chips').innerText")
            check('atestado-2.pdf' in chips and 'atestado.pdf' not in chips.replace('atestado-2.pdf', ''), 'lote 2: só o atestado dele anexado')
            await enviar()
            v = await espera_empregado('JOANA FONSECA')
            await pg.wait_for_timeout(1500)
            check(v.get('leaveDate') == '09/10/2026', 'lote 3: data')
            check(not v.get('selectedLeaveType'), 'lote 3: sem dias no atestado → tipo em branco')
            tags = await pg.evaluate("[...document.querySelectorAll('.ct-miss-tag')].map(t => t.previousElementSibling?.getAttribute('formcontrolname') + ': ' + t.textContent)")
            print('   avisos no portal:', tags)
            check(any(t.startswith('selectedLeaveType') and 'Não encontrado no documento' in t for t in tags), 'lote 3: aviso visual no tipo de afastamento')
            miss = await pn.evaluate("[...document.querySelectorAll('#fields .field.missing [data-k]')].map(e => e.dataset.k)")
            check('tipoAfastamento' in miss and 'dias' in miss, 'lote 3: painel marca tipo e dias como não encontrados')
            lote_txt = await pn.locator('#lote').inner_text()
            check('3 de 3' in lote_txt and '2 enviada' in lote_txt, 'lote: 3 de 3, duas enviadas')
            await pg.screenshot(path='/tmp/sim-lote-3.png')
            # completa o tipo: o aviso some
            await pg.click('bento-combobox[formcontrolname=selectedLeaveType] input'); await pg.wait_for_timeout(300)
            await pg.keyboard.type('igual ou inferior a 15'); await pg.wait_for_timeout(300)
            await pg.click('[role=option]:has-text("Doença período igual ou inferior a 15 dias")'); await pg.wait_for_timeout(1800)
            tags = await pg.evaluate("[...document.querySelectorAll('.ct-miss-tag')].map(t => t.previousElementSibling?.getAttribute('formcontrolname'))")
            check('selectedLeaveType' not in tags, 'aviso some quando o cliente escolhe o tipo')
            await enviar(); await pg.wait_for_timeout(2500)
            lote_txt = await pn.locator('#lote').inner_text()
            check('Lote concluído' in lote_txt, 'lote concluído depois do 3º envio')
            main_txt = await pg.inner_text('main')
            check(all(n in main_txt for n in ['RONALDO DE SOUZA', 'JOANA FONSECA']), 'as três solicitações estão na lista')

            # texto livre com outra solicitação aberta: não força a solicitação aberta
            print('\n[texto livre] pedido diferente da solicitação aberta')
            await pg.click('.p-menu-i[data-s="vacation-notice"]'); await pg.click('[data-add]'); await pg.wait_for_timeout(1500)
            await pn.click('.tab[data-view="inicio"]'); await pg.wait_for_timeout(400)
            await pn.fill('#free-txt', 'o Ronaldo apresentou atestado de 3 dias a partir de 08/10/2026'); await pn.click('#free-go'); await pg.wait_for_timeout(1200)
            check('vacation-notice/add' in await pg.evaluate("window.__ctPlatform && window.__ctPlatform.path ? window.__ctPlatform.path() : location.pathname"), 'continua no Aviso Prévio de Férias (não redireciona sozinho)')
            sug = await pn.locator('#sugestao').inner_text()
            check('Afastamento de Empregado' in sug and 'Usar em Aviso Prévio de Férias' in sug, 'mostra o que entendeu e deixa escolher')
            await pn.click('#sug-go')
            v = await espera_empregado('RONALDO DE SOUZA', 20)
            check(v.get('leaveDate') == '08/10/2026' and v.get('selectedLeaveType') == 'Doença período igual ou inferior a 15 dias', 'só abre Afastamento quando o cliente escolhe, e preenche')
            await pn.click('.tab[data-view="inicio"]'); await pg.wait_for_timeout(300)
            await pn.fill('#free-txt', 'na verdade foram 5 dias'); await pn.click('#free-go'); await pg.wait_for_timeout(800)
            sug = await pn.locator('#sugestao').inner_text()
            check('Preencher em Afastamento de Empregado' in sug, 'texto sem tipo claro: propõe a solicitação aberta e espera confirmar')
            await pn.click('#sug-go'); await pg.wait_for_timeout(2500)
            check(await pn.evaluate("document.querySelector('#f-dias')?.value") == '5', 'confirmado: completa a solicitação aberta')

            # primeiro nome, sem nenhuma solicitação aberta
            print('\n[primeiro nome] pedido escrito no Início sem formulário aberto')
            await pg.click('.p-menu-i[data-s="general-requests"]'); await pg.wait_for_timeout(1200)
            await pn.click('.tab[data-view="inicio"]'); await pg.wait_for_timeout(300)
            await pn.fill('#free-txt', 'o jorge vai sair de férias dia 16/11 por 20 dias'); await pn.click('#free-go'); await pg.wait_for_timeout(1500)
            sug = await pn.locator('#sugestao').inner_text()
            check('JORGE OLIVEIRA ALVES' in sug, 'o resumo já mostra o funcionário pelo primeiro nome')
            check('Aviso Prévio de Férias' in sug and 'Cálculo de Férias' in sug, 'férias: pergunta se é aviso ou cálculo')
            await pn.click('[data-escolha="avisoFerias"]')
            for _ in range(20):
                await pg.wait_for_timeout(700)
                v = await leave()
                if v.get('selectedEmployee'): break
            check(v.get('selectedEmployee') == 'JORGE OLIVEIRA ALVES' and v.get('vacationStartDate') == '16/11/2026', 'abre Aviso de Férias com o funcionário e a data preenchidos')
            await pg.wait_for_timeout(1500); v = await leave()
            check(not any('vai sair' in str(x) for x in v.values()), 'o texto escrito não vai literalmente para a descrição')
            await pn.click('.tab[data-view="inicio"]'); await pg.wait_for_timeout(300)
            await pn.fill('#free-txt', 'o Ronaldo pediu demissão hoje'); await pn.click('#free-go'); await pg.wait_for_timeout(1500)
            sug = await pn.locator('#sugestao').inner_text()
            check('Aviso Prévio de Rescisão' in sug and 'Cálculo de Rescisão' in sug, 'rescisão: pergunta se é aviso ou cálculo')
            await pn.click('[data-escolha="calculoRescisao"]')
            for _ in range(20):
                await pg.wait_for_timeout(700)
                if 'termination-calculation/add' in await pg.evaluate("window.__ctPlatform.path()"): break
            for _ in range(25):
                await pg.wait_for_timeout(700)
                v = await leave()
                if 'RONALDO DE SOUZA' in v.values(): break
            print('   ', await pg.evaluate("window.__ctPlatform.path()"), {k: x for k, x in v.items() if x}); check('termination-calculation/add' in await pg.evaluate("window.__ctPlatform.path()") and 'RONALDO DE SOUZA' in v.values(), 'abre o Cálculo de Rescisão escolhido, com o funcionário')

            # lista longa virtualizada: nomes do começo (A) e do meio (I) da lista
            print('\n[lista longa] funcionário fora das primeiras linhas da lista')
            for nome, esperado in [('Adriana', 'ADRIANA MOTA LIMA'), ('Ivone', 'IVONE CARDOSO'), ('Wagner', 'WAGNER SOUSA')]:
                await pg.click('.p-menu-i[data-s="employee-leave"]'); await pg.click('[data-add]'); await pg.wait_for_timeout(1500)
                await pn.click('.tab[data-view="preencher"]'); await pg.wait_for_timeout(300)
                await pn.fill('#free-form', f'atestado da {nome} de 2 dias a partir de 08/10/2026'); await pn.click('#free-form-go')
                for _ in range(25):
                    await pg.wait_for_timeout(700)
                    v = await leave()
                    if v.get('selectedEmployee') and v.get('selectedLeaveType'): break
                check(v.get('selectedEmployee') == esperado, f'{nome}: funcionário escolhido na lista longa ({v.get("selectedEmployee")})')
                check(v.get('selectedLeaveType') == 'Doença período igual ou inferior a 15 dias', f'{nome}: tipo escolhido na lista de 39 opções')

        # leitor de atestados e facilidades da versão 1.3
        pn = painel()
        await pg.evaluate("window.__ctSim.hooks()?.openPanel()"); await pg.wait_for_timeout(500)
        print('\n[1.3] foto de lado colada com Ctrl+V, acompanhante, pedido repetido, rascunho, Início')
        async def abrir_afastamento():
            await pg.click('.p-menu-i[data-s="employee-leave"]'); await pg.click('[data-add]'); await pg.wait_for_timeout(1500)
            await pn.click('.tab[data-view="preencher"]'); await pg.wait_for_timeout(300)
        async def colar(caminho, nome):
            await pn.evaluate('''async ([c, n]) => { const b = await (await fetch(c)).blob(); const dt = new DataTransfer(); dt.items.add(new File([b], n, { type: 'image/png' }));
                document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }''', ['/exemplos/' + caminho, nome])
        await abrir_afastamento()
        await colar('atestado-girado.jpg', 'image.png')
        v = await espera_empregado('BEATRIZ CAMPOS', 60)
        files_txt = await pn.locator('#files').inner_text()
        check('print-colado' in files_txt, 'Ctrl+V no painel: o print entra como arquivo (print-colado-…)')
        check('imagem girada' in files_txt, 'foto deitada: o OCR girou a imagem sozinho')
        check(v.get('leaveDate') == '06/10/2026', f"foto deitada: data pela linha da cidade, não o nascimento ({v.get('leaveDate')})")
        check(v.get('selectedLeaveType') == 'Doença período igual ou inferior a 15 dias', 'foto deitada: tipo pelos 2 dias')
        await enviar(); await pg.wait_for_timeout(1500)
        # o mesmo atestado de novo → aviso de pedido repetido
        await abrir_afastamento()
        await colar('atestado-girado.jpg', 'image.png')
        v = await espera_empregado('BEATRIZ CAMPOS', 60)
        await pg.wait_for_timeout(800)
        checks = await pn.locator('#checks').inner_text()
        check('pedido repetido?' in checks.lower() and 'já foi enviada' in checks, 'mesmo atestado de novo: avisa que parece repetido')
        if 'pedido repetido?' not in checks.lower(): print('   conferência:', checks.replace('\n', ' | ')[:600]); print('   histórico:', await pn.evaluate("chrome.storage.local.get('historico').then(r => (r.historico||[]).slice(0,3).map(h => [h.status, h.tipo, h.empresa, h.valores?.empregado, h.valores?.dataAfastamento]))"))
        # sai sem enviar e volta: oferece continuar o rascunho
        await pg.click('.p-menu-i[data-s="employee-leave"]'); await pg.wait_for_timeout(1200)
        await abrir_afastamento(); await pg.wait_for_timeout(800)
        rasc = await pn.locator('#rascunho').inner_text()
        check('continuar de onde parou' in rasc, 'rascunho: oferece continuar a solicitação começada')
        await pn.click('#rasc-sim')
        for _ in range(20):
            await pg.wait_for_timeout(600)
            v = await leave()
            if v.get('selectedEmployee'): break
        check(v.get('selectedEmployee') == 'BEATRIZ CAMPOS' and v.get('leaveDate') == '06/10/2026', 'rascunho: continuar devolve os dados e preenche o portal')
        # acompanhante: aviso e tipo em aberto
        await abrir_afastamento()
        await pg.click('#sim-samples > summary'); await pg.click('[data-file="exemplos/atestado-acompanhante.pdf"]')
        v = await espera_empregado('CAMILA ROCHA', 30)
        await pg.wait_for_timeout(800)
        checks = await pn.locator('#checks').inner_text()
        check('acompanhante' in checks.lower(), 'acompanhante: aviso na conferência')
        await pn.evaluate("document.querySelector('#checks')?.scrollIntoView()"); await pg.wait_for_timeout(300); await pg.screenshot(path='/tmp/sim-13-acomp.png')
        check(not v.get('selectedLeaveType') and v.get('leaveDate') == '07/10/2026', 'acompanhante: data lida e tipo deixado para o cliente')
        # Início: experiência, dúvidas, repetir
        await pn.click('.tab[data-view="inicio"]'); await pg.wait_for_timeout(2500)
        exp = await pn.locator('#experiencia').inner_text()
        check('Vanessa Prado' in exp and '45 dias' in exp and 'Wagner Sousa' in exp and '90 dias' in exp, 'contratos de experiência: 45 e 90 dias pela admissão')
        await pg.screenshot(path='/tmp/sim-13-inicio.png')
        await pn.fill('#q', 'foto'); await pg.wait_for_timeout(400)
        check('Posso mandar foto' in await pn.locator('#faq').inner_text(), 'busca do Início mostra dúvida frequente')
        check('Repetir a última solicitação' in await pn.locator('#repetir').inner_text(), 'atalho para repetir a última solicitação')
        # Configurações: tamanho do texto e diagnóstico sem dados pessoais
        await pn.click('#btn-config'); await pg.wait_for_timeout(600)
        await pn.click('[data-tam="grande"]'); await pg.wait_for_timeout(300)
        check(await pn.evaluate("document.documentElement.style.zoom") == '1.12', 'texto maior no painel')
        await pn.click('[data-tam="normal"]'); await pg.wait_for_timeout(300)
        await pn.click('#diag'); await pg.wait_for_timeout(600)
        diag = await pg.evaluate("navigator.clipboard.readText()")
        check('Diagnóstico do Assistente' in diag and 'Regras:' in diag, 'diagnóstico copiado')
        check(not any(n in diag for n in ['CAMILA', 'BEATRIZ', 'ROCHA', 'EMPRESA EXEMPLO', 'Z76']), 'diagnóstico sem nomes, empresa ou CID')
        await pg.screenshot(path='/tmp/sim-13.png')
        print('\n'.join(l for l in logs if 'rror' in l or 'PAGEERR' in l)[:2500])
        await b.close()
    print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S)')

asyncio.run(main())
