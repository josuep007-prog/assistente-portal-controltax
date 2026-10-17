"""
Teste do simulador (artefato) servido localmente, como o claude.ai serve: index.html embrulhado num esqueleto.
Rodar: python tests/sim_test.py [pasta_do_artefato]
"""
import asyncio, os, sys, threading, http.server, functools, json
from playwright.async_api import async_playwright

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'simulador-artefato'))
PORT = int(os.environ.get('SIM_PORT', '8765'))   # porta do servidor local (para rodar dois testes ao mesmo tempo)
SKEL = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>{}</body></html>'

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.split('?')[0] in ('/', '/index.html'):
            body = SKEL.format(open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()).encode()
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()
    def guess_type(self, p):
        if p.endswith('.mjs'): return 'text/javascript'
        return super().guess_type(p)

def serve():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(H, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv

falhas = []
def check(c, m):
    print(('  OK   ' if c else '  FALHA ') + m)
    if not c: falhas.append(m)


async def teste_plataforma(b):
    """2.0: a plataforma em tela cheia por cima do portal, que é preenchido por baixo."""
    import datetime
    print('\n[2.0] plataforma em tela cheia')
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next(f for f in pg.frames if 'panel/panel.html' in f.url)
    portal = lambda: pg.evaluate("""() => Object.fromEntries([...document.querySelectorAll('main [formcontrolname]:not([type=radio])')].map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value]))""")
    total = lambda: pg.evaluate("window.__ctPlatform.fetchList('employee-leave').then(r => r.json()).then(j => j.totalItems)")
    def portal_com(**kv):
        async def f():
            v = await portal(); return all(v.get(k) == x for k, x in kv.items())
        return f
    def total_e(n):
        async def f(): return await total() == n
        return f
    async def espera(cond, s=30):
        for _ in range(s * 2):
            try:
                if await cond(): return True
            except Exception: pass
            await pg.wait_for_timeout(500)
        return False
    check(await pn.evaluate("document.body.classList.contains('plat')"), 'abre a plataforma em tela cheia')
    check(await pg.evaluate("document.elementFromPoint(700, 500)?.id") == 'ct-assistente-host', 'o portal fica coberto (os cliques não chegam a ele)')
    # Hoje (2.1): rosca, carrossel, próximos passos, situações e cartões (tela Hoje do Control Onvio)
    await espera(lambda: pn.evaluate("!!document.querySelector('.hj-hero[data-pronto]')"), 15)
    # a resposta do escritório que não pede nada (informe de rendimentos) sai de "esperam sua resposta" quando a conversa é lida
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#hj-titulo')?.innerText || '').startsWith('2 ') && !!document.querySelector('.an-f[data-motivo=respondida]')"), 20)
    tit = await pn.locator('#hj-titulo').inner_text()
    check(ok and 'esperam sua resposta' in tit, f'Hoje: 2 esperam sua resposta e 1 respondida sem pedido ({tit})')
    check(': 1 (' in (await pn.locator('.an-f[data-motivo="prescreve"]').get_attribute('data-tip') or ''), 'Hoje: 1 perto de prescrever (parada há 23 dias)')
    check(await pn.locator('#hj-cartoes').count() == 0 and await pn.locator('.hj-sit').count() == 0, 'Hoje: situações e cartões ficam em Solicitações')
    check(await pn.locator('#hj-passos .hj-step').count() >= 2, 'Hoje: próximos passos com o que responder')
    await pn.evaluate("document.querySelector('#hj-passos').style.maxHeight = '2000px'")
    cabe = await espera(lambda: pn.evaluate("(() => { const l = document.querySelector('#hj-passos'); return l.scrollHeight <= l.clientHeight + 2 && !l.classList.contains('rola'); })()"), 3)
    check(cabe, 'Hoje: próximos passos que cabem na caixa não ficam esmaecidos')
    await pn.evaluate("document.querySelector('#hj-passos').style.maxHeight = '60px'")
    ok = await espera(lambda: pn.evaluate("document.querySelector('#hj-passos').classList.contains('rola')"), 3)
    check(ok, 'Hoje: esmaecido só quando os passos não cabem (rolar)')
    await pn.evaluate("document.querySelector('#hj-passos').style.maxHeight = ''")
    check(await pn.locator('.an-svg .an-f').count() >= 2, 'Hoje: rosca por situação')
    # a rosca leva às Solicitações já filtradas (situações e cartões por tipo, como no Control Onvio)
    await pn.dispatch_event('.an-f[data-motivo="prescreve"]', 'click'); await pg.wait_for_timeout(600)
    check(await pn.locator('.hj-sit[data-sit="prescreve"].on').count() == 1 and await pn.locator('.tipos .tipo-c').count() == 11, 'rosca → Solicitações filtradas, com os cartões dos tipos')
    cards = pn.locator('#sol-grupos .hj-card')
    check(await cards.count() == 1 and 'CAMILA ROCHA' in await cards.inner_text() and 'PRESCREVE EM' in (await cards.inner_text()).upper(), 'Hoje: filtro "Responda antes de prescrever" mostra o cartão com o prazo')
    check('O escritório pediu' in await cards.inner_text() and 'abono pecuniário' in await cards.inner_text(), 'Hoje: o cartão mostra o que o escritório pediu')
    await cards.first.click()
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('#dt-body .tr-item.esc') && !!document.querySelector('#dt-body .tr-item.cli') && (document.querySelector('#modal')?.innerText || '').includes('O escritório está pedindo')"), 10)
    check(ok, 'detalhe: conversa em bolhas (você e o escritório) com o pedido em destaque')
    await pn.click('#modal [data-dt="dados"]')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#dt-body')?.textContent || '').includes('Início das férias')"), 10)
    check(ok, 'detalhe: aba Dados com a solicitação completa em português')
    await pn.click('#modal [data-dt="observar"]'); await pg.wait_for_timeout(300)
    check('pagamento das férias' in (await pn.locator('#dt-body').inner_text()).lower(), 'detalhe: O que observar com o prazo de pagamento')
    await pn.click('#modal .dlg-x')
    await pn.click('[data-vis-sol="lista"]'); await pg.wait_for_timeout(300)
    check(await pn.locator('#sol-grupos .prio').count() == 1, 'Solicitações: modo lista')
    await pn.click('[data-vis-sol="cartoes"]'); await pn.click('.hj-sit[data-sit="prescreve"]'); await pg.wait_for_timeout(300)
    check(await pn.locator('#sol-grupos .hj-card').count() >= 3 and await pn.locator('#sol-grupos [data-grupo]').first.get_attribute('data-grupo') == 'prescreve', 'Solicitações: sem filtro, cartões agrupados pela situação (a mais urgente primeiro)')
    await pn.click('[data-tipo-sol="calculoFerias"]'); await pg.wait_for_timeout(300)
    check(await pn.locator('#sol-grupos .hj-card').count() == 1 and await pn.locator('[data-tipo-sol="calculoFerias"].on').count() == 1, 'Solicitações: cartão do tipo filtra')
    await pn.click('[data-tipo-sol="calculoFerias"]')
    await pn.click('#rail [data-mod="inicio"]'); await pg.mouse.move(1200, 600); await pg.wait_for_timeout(600)
    # Equipe: avisos sem cálculo (datas lidas do detalhe), experiência e férias a vencer
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#eq-avisos')?.innerText || '').includes('Férias em')"), 10)
    av = await pn.locator('#eq-avisos').inner_text()
    check(ok and 'RONALDO DE SOUZA' in av and 'MARCOS VIEIRA' in av, 'Hoje: avisos de férias e rescisão sem o cálculo, com as datas do aviso')
    check('VANESSA PRADO' in await pn.locator('#eq-exp').inner_text(), 'Hoje: experiência vencendo')
    check(await pn.locator('#eq-ferias .eq-li').count() >= 1, 'Hoje: férias a vencer')
    # cartão estreito (4 colunas numa tela larga): nada passa da borda; com mais de 5 itens, a lista rola
    cabe = await pn.evaluate("""(() => { const c = document.querySelector('#eq-ferias'); c.style.width = '300px';
      const r = c.getBoundingClientRect(); const ok = [...c.querySelectorAll('.eq-li .btn, .eq-li .pill')].every(b => b.getBoundingClientRect().right <= r.right + 1);
      c.style.width = ''; return ok; })()""")
    check(cabe, 'Hoje: linhas da Equipe não passam da borda do cartão estreito')
    await pn.evaluate("""(() => { const l = document.querySelector('#eq-ferias .eq-lista'); const um = l.firstElementChild; for (let k = 0; k < 8; k++) l.appendChild(um.cloneNode(true)); })()""")
    rola = await espera(lambda: pn.evaluate("""(() => { const l = document.querySelector('#eq-ferias .eq-lista'); const it = [...l.children];
      const visiveis = it.filter(x => x.getBoundingClientRect().bottom <= l.getBoundingClientRect().bottom + 3).length;
      return getComputedStyle(l).overflowY === 'auto' && visiveis === 5 && l.scrollHeight > l.clientHeight; })()"""), 3)
    check(rola, 'Hoje: a partir de 5 itens a lista da Equipe rola')
    check('Pagamento das férias' in await pn.locator('#eq-legais').inner_text(), 'Hoje: prazos legais (pagamento do cálculo de férias)')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('.hj-casos')?.innerText || '').includes('Anexo não chegou')"), 15)
    check(ok, 'Hoje: atenção nas suas solicitações (você falou em anexo e nenhum arquivo chegou)')
    check(await pn.locator('#free-txt').count() == 0 and await pn.locator('#intents').count() == 0, 'Hoje sem a parte de criar solicitações (fica no Novo pedido)')
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(400)
    check(await pn.locator('#free-txt').count() == 1 and await pn.locator('#q').count() == 1 and await pn.locator('.pd-escolha .intent').count() >= 5, 'Novo pedido: escolha do tipo, texto livre, documento e dúvidas')
    await pn.click('#rail [data-mod="inicio"]'); await pg.wait_for_timeout(400)
    await pg.mouse.move(1200, 600)
    await pg.screenshot(path='/tmp/sim-20-painel.png')
    # Solicitações: todas as páginas, filtros, detalhe
    await pn.click('#rail [data-mod="pendencias"]'); await pg.wait_for_timeout(800)
    # 2.5.2: com um filtro de situação ativo, a Tabela mostra o filtro e os cartões dos tipos contam o que ela mostra
    await pn.click('.hj-sit[data-sit="responder"]'); await pn.click('[data-vis-sol="tabela"]'); await pg.wait_for_timeout(300)
    linhas = await pn.locator('#sol-list .dp-row').count()
    todos = int(await pn.locator('[data-tipo-sol=""] b').inner_text())
    ok = await pn.evaluate("!document.querySelector('#sol-sits').hidden && !!document.querySelector('.hj-sit[data-sit=responder].on') && !!document.querySelector('[data-limpar-sol]')")
    check(linhas >= 1 and todos == linhas and ok, f'Tabela: filtro de situação à vista e cartões dos tipos contam o que a tabela mostra ({todos} = {linhas})')
    await pn.click('[data-limpar-sol]'); await pg.wait_for_timeout(300)
    n = await pn.locator('#sol-list .dp-row').count()
    check(n == 64, f'solicitações: tabela com todas as páginas lidas, Geral inclusive ({n} de 64)')
    # várias empresas no mesmo login (2.5): por padrão a do portal; o seletor escolhe uma, várias ou todas
    await pn.click('.emp-sel summary'); await pg.wait_for_timeout(200)
    check(await pn.locator('.es-li').count() == 3 and 'aberta no portal' in await pn.locator('.es-pop').inner_text(), 'seletor de empresas: as três empresas, com a do portal marcada')
    await pn.click('.es-li[data-nome="COMERCIO MODELO DE ALIMENTOS LTDA"] input'); await pn.click('[data-es="aplicar"]'); await pg.wait_for_timeout(400)
    n2 = await pn.locator('#sol-list .dp-row').count()
    check(n2 == 66 and 'EXEMPLO + 1' in await pn.locator('.emp-sel summary').inner_text(), f'seletor de empresas: duas empresas juntas ({n2} de 66)')
    await pn.click('.emp-sel summary'); await pn.click('[data-es="todas"]'); await pn.click('[data-es="aplicar"]'); await pg.wait_for_timeout(400)
    check(await pn.locator('#sol-list .dp-row').count() == 67 and 'Todas as empresas' in await pn.locator('.emp-sel summary').inner_text(), 'seletor de empresas: todas')
    await pn.click('.emp-sel summary'); await pn.click('[data-so="OFICINA FICTICIA DE SERVICOS ME"]'); await pg.wait_for_timeout(400)
    check(await pn.locator('#sol-list .dp-row').count() == 1, 'seletor de empresas: "só esta"')
    await pn.click('.emp-sel summary'); await pn.click('[data-es="portal"]'); await pg.wait_for_timeout(400)
    check(await pn.locator('#sol-list .dp-row').count() == 64, 'seletor de empresas: volta para a empresa do portal')
    # valores que o Onvio manda em inglês (motivo do desligamento em PascalCase) aparecem em português
    await pn.fill('#sol-q', 'MARCOS VIEIRA'); await pg.wait_for_timeout(500)
    await pn.click('#sol-list .dp-row')
    await pn.click('#modal [data-dt="dados"]')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#modal')?.textContent || '').includes('Término do contrato de aprendizagem')"), 10)
    check(ok and 'Apprentice' not in await pn.evaluate("document.querySelector('#modal').textContent"), 'Dados: motivo do desligamento em português (sem palavras em inglês)')
    await pn.evaluate("document.querySelector('#modal .x, #modal [aria-label=Fechar]')?.click()"); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    await pn.fill('#sol-q', '1041'); await pg.wait_for_timeout(500)
    check(await pn.locator('#sol-list .dp-row').count() == 1, 'busca na lista de solicitações')
    await pn.click('#sol-list .dp-row')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#modal')?.innerText || '').includes('falta informar a data do pagamento')"), 10)
    check(ok, 'detalhe mostra o último trâmite')
    await pn.click('#modal .btn-primary'); await pg.wait_for_timeout(1800)
    check(not await pn.evaluate("document.body.classList.contains('plat')") and '1041' in await pg.evaluate("document.querySelector('#p-main').innerText"), 'Ver no portal: abre a solicitação no portal, com o painel ao lado')
    await pn.click('#btn-plat'); await pg.wait_for_timeout(800)
    check(await pn.evaluate("document.body.classList.contains('plat')"), 'volta para a tela cheia')
    # Funcionários: experiência e atalho com o funcionário escolhido
    await pn.click('#rail [data-mod="funcionarios"]'); await pg.wait_for_timeout(800)
    check(await pn.evaluate("getComputedStyle(document.querySelector('#emp-list')).overflowY === 'auto' && !!document.querySelector('#emp-q')"), 'funcionários: a lista rola e a busca fica à vista')
    await pn.locator('#emp-list .dp-row', has_text='JOANA FONSECA').locator('b').first.click()
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#modal')?.innerText || '').includes('Solicitações em aberto (1)') && (document.querySelector('#fu-dados')?.textContent || '').includes('Admissão')"), 10)
    check(ok, 'ficha do funcionário: dados do portal e as solicitações em aberto sobre ele')
    await pn.click('#modal .fu-hist-btn'); await pg.wait_for_timeout(300)
    check('Histórico: solicitações encerradas' in await pn.locator('#modal').inner_text(), 'ficha do funcionário: Histórico com as encerradas')
    await pn.click('#modal .dlg-x')
    row = pn.locator('#emp-list .dp-row', has_text='VANESSA PRADO')
    check('Fim da experiência (45 dias)' in await row.inner_text(), 'funcionários: experiência da Vanessa vencendo')
    await row.locator('summary').click(); await row.locator('[data-tipo="afastamento"]').click()
    ok = await espera(portal_com(selectedEmployee='VANESSA PRADO'), 20)
    check(ok, 'atalho "Pedir": abre o afastamento no portal com a funcionária escolhida')
    check(await pn.locator('#f-empregado').input_value() == 'VANESSA PRADO', 'formulário próprio mostra a funcionária')
    await pn.click('#pd-voltar'); await pg.wait_for_timeout(400)
    check(await pn.locator('#pd-continuar').count() == 1 and await pn.locator('.pd-escolha .intent').count() >= 5, 'botão "Outro tipo" dentro do pedido volta para a escolha do tipo')
    await pn.click('#pd-continuar'); await pg.wait_for_timeout(400)
    check(await pn.locator('#f-empregado').count() == 1, '"Continuar o pedido" volta ao formulário aberto')
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/employee-leave')"); await pg.wait_for_timeout(1500)
    # Calcular (2.3): simulação de rescisão e de férias, e o pedido do cálculo já com as datas
    print('[2.3] calcular: simulações')
    await pn.click('#rail [data-mod="ferramentas"]'); await pg.mouse.move(1200, 600); await pg.wait_for_timeout(500)
    for k, v in [('sim-quem', 'VANESSA PRADO'), ('sim-desligamento', '15102026'), ('sim-salario', '3.000,00')]:
        await pn.fill('#' + k, v); await pn.dispatch_event('#' + k, 'input')
    await pg.wait_for_timeout(300)
    res = (await pn.locator('#sim-res').inner_text()).replace('\xa0', ' ')
    check('R$ 5.516,67' in res and 'Aviso prévio indenizado' in res, f'simulação de rescisão sem justa causa (líquido R$ 5.516,67)')
    check(await pn.locator('#sim-admissao').input_value() != '', 'admissão do funcionário vem do portal')
    await pn.select_option('#sim-modalidade', 'justaCausa'); await pg.wait_for_timeout(300)
    res = await pn.locator('#sim-res').inner_text()
    check('13º salário proporcional' not in res and 'Seguro-desemprego'.upper() in res.upper(), 'justa causa: sem 13º proporcional')
    await pn.select_option('#sim-modalidade', 'semJustaCausa'); await pg.wait_for_timeout(300)
    await pn.fill('#sim-quem', 'RONALDO DE SOUZA'); await pn.dispatch_event('#sim-quem', 'input')   # a rescisão no portal lista só alguns funcionários
    await pn.click('#sim-pedir')
    ok = await espera(portal_com(employee='RONALDO DE SOUZA', resignationDate='15/10/2026'), 25)
    if not ok: print('    portal:', {k: v for k, v in (await portal()).items() if k in ('employee', 'resignationDate', 'priorNoticeDate')}, await pg.evaluate("location.pathname"))
    check(ok, '"Pedir o cálculo": abre o Cálculo de Rescisão no portal com a funcionária e a data')
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/employee-leave')"); await pg.wait_for_timeout(1500)
    await pn.click('#rail [data-mod="ferramentas"]'); await pg.mouse.move(1200, 600); await pg.wait_for_timeout(400)
    await pn.click('[data-t="simFerias"]'); await pg.wait_for_timeout(300)
    for k, v in [('sim-salario', '3000'), ('sim-diasGozo', '20'), ('sim-inicio', '03112026')]:
        await pn.fill('#' + k, v); await pn.dispatch_event('#' + k, 'input')
    await pn.select_option('#sim-diasAbono', '10'); await pg.wait_for_timeout(300)
    res = await pn.locator('#sim-res').inner_text()
    check('Abono pecuniário' in res and '01/11/2026' in res, 'simulação de férias com abono e prazo de pagamento')
    await pn.click('#sim-limpar'); await pg.wait_for_timeout(300)
    ok = await pn.evaluate("document.querySelector('#sim-salario').value === '' && document.querySelector('#sim-inicio').value === '' && document.querySelector('#sim-pedir').disabled && document.querySelector('#sim-limpar').disabled")
    check(ok, 'Limpar simulação apaga o que foi digitado (e desliga Copiar/Pedir até ter resultado)')
    await pn.click('#rail [data-mod="funcionarios"]'); await pg.mouse.move(1200, 600); await pg.wait_for_timeout(800)
    row = pn.locator('#emp-list .dp-row', has_text='WAGNER SOUSA')
    await row.locator('summary').click(); await row.locator('[data-sim="rescisao"]').click(); await pg.wait_for_timeout(500)
    check(await pn.locator('#sim-quem').input_value() == 'WAGNER SOUSA' and await pn.locator('#sim-admissao').input_value() != '', 'Funcionários → "Simular rescisão" abre o Calcular com o funcionário e a admissão')
    # Novo pedido com atestado: formulário próprio, portal por baixo, envio só depois do resumo
    print('[2.0] atestado: formulário próprio e envio')
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pg.evaluate("""async () => { const r = await fetch('exemplos/atestado.pdf'); const f = new File([await r.blob()], 'atestado.pdf', { type: 'application/pdf' }); window.__ctSim.hooks().sendFiles([f]); }""")
    await pg.wait_for_timeout(1500)
    if await pn.locator('#sug-go').count(): await pn.click('#sug-go')
    ok = await espera(portal_com(selectedEmployee='JOAO DA SILVA', leaveDate='05/10/2026'), 40)
    check(ok, 'atestado lido e o portal preenchido por baixo')
    await espera(lambda: pg.evaluate("document.querySelectorAll('.p-chip').length > 0"), 15)
    check(await pn.locator('#f-dataAfastamento').input_value() == '05/10/2026', 'formulário próprio com a data do atestado')
    await pn.fill('#f-dataAfastamento', '06102026'); await pn.dispatch_event('#f-dataAfastamento', 'input'); await pn.dispatch_event('#f-dataAfastamento', 'change')
    ok = await espera(portal_com(leaveDate='06/10/2026'), 15)
    check(ok, 'mudar a data na plataforma muda o portal por baixo')
    await pg.mouse.move(1200, 600)
    await pg.screenshot(path='/tmp/sim-20-pedido.png')
    antes = await total()
    await pn.click('#btn-send'); await pg.wait_for_timeout(1500)
    check(await pn.locator('#modal').is_visible(), 'Conferir e enviar mostra o resumo')
    check(await total() == antes, 'nada é enviado antes da confirmação')
    if await pn.locator('#m-send').count(): await pn.click('#m-send')
    ok = await espera(total_e(antes + 1), 15)
    check(ok, 'enviado ao confirmar (uma solicitação a mais no portal)')
    await pg.wait_for_timeout(2500)
    # Agenda: lembrete mensal
    print('[2.0] agenda, documentos, busca e avisos')
    await pn.click('#rail [data-mod="historico"]'); await pg.wait_for_timeout(600)
    hoje = datetime.date.today(); dia = hoje.replace(day=10)
    await pn.click('#ag-novo'); await pg.wait_for_timeout(300)
    await pn.fill('#lb-texto', 'Mandar as horas extras'); await pn.fill('#lb-data', dia.isoformat())
    await pn.select_option('#lb-rep', 'mensal')
    check('Todo mês, dia 10' in await pn.locator('#lb-resumo').inner_text(), 'resumo da repetição do lembrete')
    await pn.click('#modal .btn-primary'); await pg.wait_for_timeout(600)
    cel = lambda: pn.locator(f'.ag-day[data-dia="{dia.isoformat()}"]').inner_text()
    check('Mandar as horas extras' in await cel(), 'lembrete aparece no calendário')
    await pn.click('#ag-next'); await pg.wait_for_timeout(400)
    prox = (dia.replace(day=1) + datetime.timedelta(days=32)).replace(day=10)
    check('Mandar as horas extras' in await pn.locator(f'.ag-day[data-dia="{prox.isoformat()}"]').inner_text(), 'lembrete mensal se repete no mês seguinte')
    # Documentos: modelo para assinar
    await pn.click('#rail [data-mod="documentos"]'); await pg.wait_for_timeout(800)
    # 2.5: arquivos trocados nas solicitações (lidos dos trâmites na hora), do escritório e os seus
    ok = await espera(lambda: pn.evaluate("document.querySelectorAll('#arq-lista [data-arq]').length >= 7"), 20)
    txt = await pn.locator('#doc-body').inner_text()
    check(ok and 'Recibo de férias - BRUNO TEIXEIRA.pdf' in txt and 'RG - VANESSA PRADO.pdf' in txt, 'Documentos: arquivos das solicitações (do escritório e os seus)')
    await pn.click('[data-arq-lado="esc"]'); await pg.wait_for_timeout(200)
    n_esc = await pn.locator('#arq-lista [data-arq]').count()
    check(n_esc == 4 and 'RG - VANESSA' not in await pn.locator('#arq-lista').inner_text(), f'Documentos: filtro "Do escritório" ({n_esc} de 4)')
    await pn.click('[data-arq-lado=""]'); await pn.fill('#arq-q', 'marcos'); await pg.wait_for_timeout(400)
    check(await pn.locator('#arq-lista [data-arq]').count() == 2, 'Documentos: busca pelo funcionário')
    await pn.click('#arq-lista [data-arq]')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#modal')?.innerText || '').includes('MARCOS VIEIRA')"), 10)
    check(ok, 'Documentos: clicar no arquivo abre a solicitação')
    await pn.evaluate("document.querySelector('#modal .dlg-x')?.click()"); await pg.wait_for_timeout(300)
    await pn.fill('#arq-q', '')
    await pn.click('[data-doc-aba="escritorio"]'); await pg.wait_for_timeout(800)
    check('Guia do FGTS Digital' in await pn.locator('#doc-body').inner_text(), 'documentos do escritório (simulador)')
    await pn.click('[data-pub-cat="Folha"]'); await pg.wait_for_timeout(200)
    check(await pn.locator('#pub-lista .dp-row').count() == 2, 'Publicados: filtro por categoria')
    await pn.click('[data-doc-aba="modelos"]'); await pg.wait_for_timeout(300)
    await pn.click('[data-mdl="0"]'); await pg.wait_for_timeout(300)
    await pn.fill('#md-empregado', 'JOAO DA SILVA'); await pn.dispatch_event('#md-empregado', 'input')
    prev = await pn.locator('#md-prev').inner_text()
    check('JOAO DA SILVA' in prev and 'EMPRESA EXEMPLO' in prev, 'modelo para assinar preenchido com funcionário e empresa')
    await pn.click('#modal .dlg-x')
    # Busca (Ctrl+K)
    await pn.click('#plat-titulo'); await pg.keyboard.press('Control+k'); await pg.wait_for_timeout(300)
    check(await pn.locator('#cmdk').is_visible(), 'Ctrl+K abre a busca')
    await pn.fill('#cmdk-q', 'wagner'); await pg.wait_for_timeout(300)
    check('WAGNER SOUSA' in await pn.locator('#cmdk-res').inner_text(), 'busca acha o funcionário')
    await pg.keyboard.press('Escape')
    # Indicador da leitura (2.5.2): estado, há quanto tempo leu e a garantia de que nada sai do computador
    await pn.click('#plat-sync summary'); await pg.wait_for_timeout(200)
    pop = await pn.locator('.sync-pop').inner_text()
    check(await pn.locator('.sync-d.st-ok').count() == 1 and 'Portal conectado' in await pn.locator('#plat-sync summary').inner_text() and 'Nada é enviado' in pop and 'Próxima leitura' in pop, 'indicador da leitura: conectado, quando leu, próxima leitura e privacidade')
    await pn.click('#plat-sync summary')
    # Aviso do portal coberto (2.5.2): não fica fixo; aparece por cima quando o cliente tenta agir no portal
    await pg.wait_for_timeout(10500)
    await pg.evaluate("window.__ctSim.atencao()"); await pg.wait_for_timeout(1800)
    check(await pn.locator('#plat-aviso').inner_text() == '' and await pn.locator('#modal').is_hidden(), 'janela do portal por baixo: sem aviso fixo enquanto o cliente não age')
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(400)
    await pn.locator('.pd-escolha .intent').first.click(); await pg.wait_for_timeout(1200)
    txt = await pn.locator('#modal').inner_text() if await pn.locator('#modal').is_visible() else ''
    check('sessão vai expirar' in txt and 'entre de novo' in txt, 'ao tentar abrir um pedido, o aviso do portal aparece por cima (com a dica)')
    await pn.evaluate("document.querySelector('#modal .dlg-x')?.click()")
    await pg.evaluate("document.querySelector('.p-dialog')?.remove(); window.__ctSim.go('/clientcenter/pt/actions/service-request/employee-leave')"); await pg.wait_for_timeout(1500)
    # Leitura automática (config.leituraAutomaticaSegundos = 30): o escritório responde e o Hoje mostra sozinho
    await pn.click('#rail [data-mod="pendencias"]'); await pg.mouse.move(1200, 600); await pg.wait_for_timeout(600)
    await pn.fill('#sol-q', ''); await pn.dispatch_event('#sol-q', 'input'); await pn.click('[data-vis-sol="cartoes"]'); await pg.wait_for_timeout(600); await pn.evaluate("document.activeElement?.blur()")
    antes = int(await pn.locator('.hj-sit[data-sit="responder"] b').get_attribute('data-conta'))
    await pg.evaluate("window.__ctSim.escritorioResponde(1039, 'confirme a data de retorno.')")
    alvo = str(antes + 1)
    ok = await espera(lambda: pn.evaluate("(n) => document.querySelector('.hj-sit[data-sit=responder] b')?.dataset.conta === n", alvo), 45)
    check(ok, 'leitura automática: a resposta do escritório aparece sem clicar em nada')
    await pn.evaluate("document.documentElement.setAttribute('data-theme','dark')"); await pn.click('#rail [data-mod="inicio"]'); await pg.mouse.move(1200, 600); await pg.wait_for_timeout(600)
    await pg.screenshot(path='/tmp/sim-20-escuro.png')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:3]) if erros else ''))
    await ctx.close()

async def main():
    serve()
    if os.environ.get('SIM_SO') == '20':   # SIM_SO=20 roda só a parte da plataforma (2.0)
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_plataforma(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        return
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
        pg.on('pageerror', lambda e: logs.append('PAGEERR ' + str(e)))
        await pg.goto(f'http://127.0.0.1:{PORT}/?modo=painel')   # testes da 1.x: portal à vista, painel encaixado
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
        check(not v.get('selectedLeaveType') and v.get('leaveDate') == '07/10/2026', 'acompanhante: data lida e tipo deixado para o cliente')
        checks = await pn.locator('#checks').inner_text()
        check('acompanhante' in checks.lower(), 'acompanhante: aviso na conferência')
        # o painel não repete os campos do portal: só resume e deixa editar o que o portal não tem
        check(await pn.locator('#f-empregado, #f-dataAfastamento, #f-tipoAfastamento').count() == 0 and await pn.locator('#f-dias').count() == 1, 'painel sem campos repetidos do portal (só dias/CID/médico/observações)')
        resumo = await pn.locator('#fields').inner_text()
        check('CAMILA ROCHA' in resumo and 'ASSISTENTE' in resumo.upper(), 'resumo "No portal" mostra o que o Assistente preencheu')
        if 'ASSISTENTE' not in resumo.upper(): print('   resumo:', resumo.replace('\n', ' | ')[:500])
        await pn.evaluate("document.querySelector('#fields')?.scrollIntoView()"); await pg.wait_for_timeout(300); await pg.screenshot(path='/tmp/sim-13-resumo.png')
        # desfazer
        check(await pn.locator('#btn-undo').is_visible(), 'botão Desfazer aparece na barra depois de preencher')
        await pn.click('#btn-undo'); await pg.wait_for_timeout(2500)
        v = await leave()
        chips = await pg.evaluate("document.querySelectorAll('.p-chip').length")
        check(not v.get('selectedEmployee') and not v.get('leaveDate') and not v.get('subject') and chips == 0, f"desfazer: formulário volta a como estava, sem o anexo ({ {k: x for k, x in v.items() if x} }, anexos={chips})")
        await pg.wait_for_timeout(1500); v = await leave()
        check(not v.get('selectedEmployee'), 'depois de desfazer, não preenche de novo sozinho')
        await pn.click('#btn-fill')
        v = await espera_empregado('CAMILA ROCHA', 20)
        check(v.get('leaveDate') == '07/10/2026', 'Preencher no portal refaz quando o cliente pede')
        # o cliente corrige a data no portal → assunto e descrição acompanham
        await pg.fill('main [formcontrolname=leaveDate]', '08/10/2026'); await pg.press('main [formcontrolname=leaveDate]', 'Tab')
        for _ in range(12):
            await pg.wait_for_timeout(500); v = await leave()
            if '08/10/2026' in (v.get('subject') or ''): break
        check('08/10/2026' in (v.get('subject') or '') and '08/10/2026' in (v.get('description') or ''), f"correção no portal atualiza assunto e descrição ({v.get('subject')})")
        await pg.wait_for_timeout(800)
        check(await pn.evaluate("document.querySelector('#fields').innerText.includes('você')"), 'resumo marca o campo como mudado por você')
        await pn.evaluate("document.querySelector('#checks')?.scrollIntoView()"); await pg.wait_for_timeout(300); await pg.screenshot(path='/tmp/sim-13-acomp.png')
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

        # ---- 1.3.2: desfazer não atravessa formulários, e cancelar não conta como enviado ----
        print('\n[1.3.2] desfazer de uma tela não vale na seguinte')
        enviados = lambda: pg.evaluate("(JSON.parse(localStorage.getItem('ct-sim-storage') || '{}').historico || []).filter(h => h.status === 'enviado').length")
        antes = await enviados()
        await pg.click('.p-menu-i[data-s="employee-leave"]'); await pg.click('[data-add]'); await pg.wait_for_timeout(1500)
        await pg.evaluate("window.__ctSim.hooks().openPanel()"); await pg.wait_for_timeout(800)
        pn = painel()
        await pn.click('[data-view="preencher"]'); await pg.wait_for_timeout(600)
        await pn.click('#btn-fill'); await espera_empregado('CAMILA ROCHA', 20)
        check(await pn.locator('#btn-undo').is_visible(), 'desfazer disponível no formulário preenchido')
        await pg.click('.form__buttons--cancel'); await pg.wait_for_timeout(1500)
        await pg.click('[data-add]'); await pg.wait_for_timeout(2500)
        pn = painel()
        await pn.click('[data-view="preencher"]'); await pg.wait_for_timeout(600)
        check(not await pn.locator('#btn-undo').is_visible(), 'cancelar e reabrir: desfazer da tela anterior não aparece')
        depois = await enviados()
        check(depois == antes, f'cancelar não registra envio (enviados: {antes} antes, {depois} depois)')

        print('\n'.join(l for l in logs if 'rror' in l or 'PAGEERR' in l)[:2500])
        await teste_plataforma(b)
        await b.close()
    print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))

asyncio.run(main())
sys.exit(1 if falhas else 0)
