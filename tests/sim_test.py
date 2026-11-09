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
    # com três empresas no acesso, abrir um pedido pergunta a empresa (2.7): os testes antigos confirmam a que já vem marcada
    auto_emp = {'on': True}
    async def _auto_empresa():
        while True:
            try:
                if auto_emp['on'] and await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa_emp = asyncio.create_task(_auto_empresa())
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
    # (desde a 2.19 os tipos vêm numa faixa de uma linha: só os que têm pedidos; "Ver todos os tipos" abre a grade com os 10 + "Todos")
    check(await pn.locator('.hj-sit[data-sit="prescreve"].on').count() == 1 and 1 < await pn.locator('#sol-tipos .tipo-f').count() < 11, 'rosca → Solicitações filtradas, com a faixa dos tipos que têm pedidos')
    await pn.click('[data-tipos-vis="todos"]'); await pg.wait_for_timeout(200)
    check(await pn.locator('.tipos .tipo-c').count() == 11, 'Ver todos os tipos: a grade com os cartões dos 10 tipos e "Todos"')
    await pn.click('[data-tipos-vis="faixa"]'); await pg.wait_for_timeout(200)
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
    check('Pagamento das férias' in await pn.locator('#eq-legais').text_content(), 'Hoje: prazos legais (pagamento do cálculo de férias; a seção vem recolhida quando nenhum prazo está perto)')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('.hj-casos')?.innerText || '').includes('Anexo não chegou')"), 15)
    check(ok, 'Hoje: atenção nas suas solicitações (você falou em anexo e nenhum arquivo chegou)')
    check(await pn.locator('#free-txt').count() == 0 and await pn.locator('#intents').count() == 0, 'Hoje sem a parte de criar solicitações (fica no Novo pedido)')
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(400)
    check(await pn.locator('#free-txt').count() == 1 and await pn.locator('#q').count() == 1 and await pn.locator('.pd-escolha .intent').count() >= 5, 'Novo pedido: escolha do tipo, texto livre, documento e dúvidas')
    # lote 6 (16): a leitura aparece no Novo pedido; documento não reconhecido + tipo escolhido → o arquivo vai junto
    await pg.evaluate("""() => { const f = new File(['Lembrete interno: conferir o estoque da loja na segunda-feira.'], 'anotacoes-loja.txt', { type: 'text/plain' }); window.__ctSim.hooks().sendFiles([f]); }""")
    ok = await espera(lambda: pn.evaluate("(document.querySelector('.v-preencher #sug-escolha')?.innerText || '').includes('Escolha abaixo')"), 15)
    check(ok and await pn.locator('#rail [data-mod="preencher"].on').count() == 1, 'Novo pedido: documento não reconhecido aparece ali mesmo ("Escolha abaixo")')
    await pn.click('.pd-escolha .intent[data-tipo="geral"]')
    ok = await espera(lambda: pg.evaluate("[...document.querySelectorAll('.p-chip')].some(c => c.textContent.includes('anotacoes-loja.txt'))"), 25)
    check(ok and '/general-requests/add' in await pg.evaluate("window.__ctPlatform.path()"), 'tipo escolhido: o pedido abre e o arquivo vai junto (anexado no portal)')
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/general-requests')"); await pg.wait_for_timeout(1500)
    # lote 6 (24): texto livre da Solicitação Geral → departamento da lista e assunto do catálogo (o texto não é copiado)
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pn.fill('#free-txt', 'preciso da segunda via da guia do FGTS de setembro'); await pn.click('#free-go')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('.v-preencher #sugestao')?.innerText || '').includes('Entendi assim')"), 10)
    sug = await pn.locator('#sugestao').inner_text()
    check(ok and 'Pessoal' in sug and 'Guia do FGTS' in sug, 'Novo pedido: texto livre mostra o cartão ali mesmo (Geral: departamento e assunto)')
    await pn.click('#sug-go')
    ok = await espera(portal_com(department='PESSOAL'), 25)
    v = await portal()
    check(ok and 'Guia do FGTS' in (v.get('subject') or '') and 'setembro' not in (v.get('description') or '').lower(), f"Solicitação Geral: departamento da lista do portal e assunto do catálogo ({v.get('department')!r}, {v.get('subject')!r})")
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/general-requests')"); await pg.wait_for_timeout(1500)
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
    check(await pg.evaluate("window.__ctSim.hooks().modoAtual()") == 'fechado' and '1041' in await pg.evaluate("document.querySelector('#p-main').innerText"), 'Ver no portal: abre a solicitação no portal e a extensão se recolhe (só a bolinha fica no canto)')
    await pg.evaluate("window.__ctSim.hooks().openPanel()"); await pg.wait_for_timeout(800)
    check(await pg.evaluate("window.__ctSim.hooks().modoAtual()") == 'plataforma' and await pn.evaluate("document.body.classList.contains('plat')"), 'clicar na bolinha reabre a plataforma em tela cheia')
    # lote 6 (39): "Pedir de novo" no detalhe: mesmo tipo, com os valores do portal, sem datas, sem CID e (cadastro) sem a pessoa
    async def pedir_de_novo(numero):
        await pn.click('#rail [data-mod="pendencias"]'); await pg.wait_for_timeout(600)
        await pn.click('[data-vis-sol="tabela"]'); await pn.fill('#sol-q', numero); await pg.wait_for_timeout(500)
        await pn.click('#sol-grupos [data-card]'); await pg.wait_for_timeout(800)
        await pn.click('#modal .dt-pedir-novo')
    await pedir_de_novo('1039')
    ok = await espera(portal_com(selectedEmployee='JOANA FONSECA', selectedLeaveType='Licença maternidade'), 30)
    v = await portal()
    check(ok and not v.get('leaveDate') and 'Z76' not in (v.get('description') or ''), f"Pedir de novo: afastamento com a funcionária e o tipo do portal, sem a data e sem CID ({v.get('selectedEmployee')!r}, {v.get('selectedLeaveType')!r}, data {v.get('leaveDate')!r})")
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/employee-leave')"); await pg.wait_for_timeout(1500)
    await pedir_de_novo('957')
    ok = await espera(portal_com(jobPositionExpanded='VENDEDOR'), 30)
    v = await portal()
    check(ok and not v.get('name') and not v.get('nationalIdentity') and not v.get('motherName') and not v.get('admissionDate'), f"Pedir de novo num cadastro: só as escolhas da empresa (cargo {v.get('jobPositionExpanded')!r}), nada da pessoa")
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/employee-registration')"); await pg.wait_for_timeout(1500)
    await pn.click('#rail [data-mod="pendencias"]'); await pg.wait_for_timeout(500); await pn.fill('#sol-q', ''); await pg.wait_for_timeout(400)
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
    await pn.click('#pd-voltar')
    await espera(lambda: pn.evaluate("!!document.querySelector('#pd-continuar')"), 10)
    check(await pn.locator('#pd-continuar').count() == 1 and await pn.locator('.pd-escolha .intent').count() >= 5, 'botão "Outro tipo" dentro do pedido volta para a escolha do tipo')
    await pn.click('#pd-continuar')
    ok = await espera(lambda: pn.evaluate("document.querySelector('#f-empregado')?.value === 'VANESSA PRADO'"), 25)
    check(ok, '"Continuar o pedido" reabre o formulário (no portal também) com o que estava preenchido')
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/employee-leave')"); await pg.wait_for_timeout(1500)
    # Calcular (2.3): simulação de rescisão e de férias, e o pedido do cálculo já com as datas
    print('[2.3] calcular: simulações')
    await pn.click('#rail [data-mod="ferramentas"]'); await pg.mouse.move(1200, 600); await pg.wait_for_timeout(500)
    # a admissão da Vanessa no simulador é relativa a hoje: fixa a data para o líquido não mudar de um dia para o outro
    for k, v in [('sim-quem', 'VANESSA PRADO'), ('sim-admissao', '16092026'), ('sim-desligamento', '15102026'), ('sim-salario', '3.000,00')]:
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
    cel = lambda: pn.locator(f'.ag-day[data-dia="{dia.isoformat()}"]').get_attribute('aria-label')
    check('1 lembrete' in await cel(), 'lembrete aparece no calendário')
    await pn.click('#ag-next'); await pg.wait_for_timeout(400)
    prox = (dia.replace(day=1) + datetime.timedelta(days=32)).replace(day=10)
    check('1 lembrete' in await pn.locator(f'.ag-day[data-dia="{prox.isoformat()}"]').get_attribute('aria-label'), 'lembrete mensal se repete no mês seguinte')
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
    await pn.fill('#cmdk-q', 'férias do Wagner dia 10/11'); await pg.wait_for_timeout(300)
    check((await pn.locator('#cmdk-res [data-r="0"]').inner_text()).startswith('Entender: férias do Wagner dia 10/11'), 'Ctrl+K: frase com data ou funcionário traz "Entender: <frase>" em 1º lugar')
    await pn.fill('#cmdk-q', 'vários atestados'); await pg.wait_for_timeout(300)
    check('Como mando vários atestados de uma vez?' in await pn.locator('#cmdk-res').inner_text(), 'Ctrl+K: dúvidas casam pelo radical (plural acha o singular)')
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
    # ---- Empresa do pedido (2.7): com mais de uma empresa no acesso, pergunta antes de abrir e dá para trocar dentro do pedido ----
    print('[2.7] empresa do pedido')
    auto_emp['on'] = False
    BASE_EMP, OUTRA, TERCEIRA = 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA', 'COMERCIO MODELO DE ALIMENTOS LTDA', 'OFICINA FICTICIA DE SERVICOS ME'
    path = lambda: pg.evaluate("window.__ctPlatform.path()")
    titulo = lambda: pg.evaluate("document.querySelector('main .title')?.innerText || ''")
    escolha = 'document.querySelector(".pd-escolha .intent[data-tipo=afastamento]")'
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions')"); await pg.wait_for_timeout(1500)
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pn.locator('.pd-escolha .intent[data-tipo="afastamento"]').click()
    await pn.locator('.ee-lista').wait_for(timeout=8000)
    check(await pn.locator('.ee-li').count() == 3 and 'aberta no portal' in await pn.locator('.ee-lista').inner_text(), 'abrir um pedido com três empresas no acesso: caixa "Para qual empresa?" com as três')
    check(await pn.locator('input[name="ee-emp"]:checked').get_attribute('value') == BASE_EMP, 'a empresa aberta no portal já vem marcada')
    await pn.click('.dlg [data-acao="0"]'); await pg.wait_for_timeout(800)
    check('/add' not in await path() and await pn.locator('.ee-lista').count() == 0, 'cancelar a escolha não abre o formulário')
    # escolher outra empresa: troca no portal e abre o pedido nela
    await pn.locator('.pd-escolha .intent[data-tipo="afastamento"]').click()
    await pn.locator('.ee-lista').wait_for(timeout=8000)
    await pn.click(f'.ee-li[data-nome="{OUTRA}"]'); await pn.click('.dlg [data-acao="2"]')
    ok = await espera(lambda: pg.evaluate("window.__ctPlatform.path().endsWith('/employee-leave/add')"), 25)
    check(ok and OUTRA in await titulo(), 'escolher outra empresa: o portal troca e o formulário abre nela')
    nomes = await pg.evaluate("window.__ctPlatform.employees().then(l => l.map(e => e.name))")
    check('CARLOS EDUARDO PAIVA' in nomes and 'ADRIANA MOTA LIMA' not in nomes, 'os funcionários são os da empresa escolhida')
    await espera(lambda: pn.locator('#pd-emp').count(), 10)
    check('MODELO' in await pn.locator('#pd-emp').inner_text(), 'dentro do pedido, a empresa aparece como botão para trocar')
    # trocar de empresa dentro do pedido: o que foi preenchido fica, o funcionário sai
    await pn.fill('#f-dataAfastamento', '09/10/2026'); await pn.dispatch_event('#f-dataAfastamento', 'input'); await pn.dispatch_event('#f-dataAfastamento', 'change')
    await pn.fill('#f-empregado', 'DEBORA SANTANA'); await pn.dispatch_event('#f-empregado', 'change'); await pg.wait_for_timeout(1500)
    await pn.click('#pd-emp'); await pn.locator('.ee-lista').wait_for(timeout=8000)
    check('Trocar a empresa do pedido' in await pn.locator('.dlg-head').inner_text() and await pn.locator('input[name="ee-emp"]:checked').get_attribute('value') == OUTRA, 'botão da empresa: caixa de troca, com a empresa do pedido marcada')
    await pn.click(f'.ee-li[data-nome="{TERCEIRA}"]'); await pn.click('.dlg [data-acao="2"]')
    # o formulário antigo continua na tela até a troca terminar: espera o título da empresa nova (e a data refeita nele)
    ok = await espera(lambda: pg.evaluate("(e) => (document.querySelector('main .title')?.innerText || '').includes(e) && !!document.querySelector('main [formcontrolname=leaveDate]')", TERCEIRA), 40)
    check(ok, 'trocar de empresa dentro do pedido: o formulário reabre na empresa nova')
    ok = await espera(lambda: pg.evaluate("document.querySelector('main [formcontrolname=leaveDate]')?.value === '09/10/2026'"), 25)
    check(ok, 'o que o cliente preencheu (a data) segue para a empresa nova')
    v = await portal()
    check(not v.get('selectedEmployee'), f"o funcionário da empresa antiga não vai junto (portal: {v.get('selectedEmployee')!r})")
    ok = await espera(lambda: pn.evaluate("!document.body.classList.contains('trocando-empresa')"), 40)
    check(ok, 'a troca de empresa dentro do pedido termina')
    emp_pl = await pn.locator('#f-empregado').input_value()
    check(emp_pl == '', f'e o campo do funcionário na plataforma fica vazio, para escolher de novo (tem {emp_pl!r})')
    # troca que o portal não confirma: nada é aberto (o pedido iria para a empresa errada)
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions')"); await pg.wait_for_timeout(1500)
    await pg.evaluate("window.__ctPlatform.trocarEmpresa = () => Promise.resolve({ ok: false })")
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pn.locator('.pd-escolha .intent[data-tipo="afastamento"]').click()
    await pn.locator('.ee-lista').wait_for(timeout=8000)
    await pn.click(f'.ee-li[data-nome="{BASE_EMP}"]'); await pn.click('.dlg [data-acao="2"]'); await pg.wait_for_timeout(2500)
    mod = await pn.locator('#modal').inner_text()
    check('Não consegui trocar de empresa' in mod and '/add' not in await path(), f'se o portal não confirma a troca, avisa e não abre o pedido (modal: {mod[:80]!r}, rota: {await path()})')
    await pn.evaluate("document.querySelector('#modal .dlg-x')?.click()")

    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:3]) if erros else ''))
    tarefa_emp.cancel()
    await ctx.close()

async def teste_mecanica(b):
    """Mecânica do preenchimento: ordem das regras, nova tentativa, só o que mudou, opções aproximadas, única opção,
    campos fora das regras, erros do próprio portal, Desfazer coerente e anexo por anexo."""
    import time
    print('\n[mecânica] preenchimento no portal')
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next(f for f in pg.frames if 'panel/panel.html' in f.url)
    portal = lambda: pg.evaluate("""() => Object.fromEntries([...document.querySelectorAll('main [formcontrolname]:not([type=radio])')].map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value]))""")
    SR = '/clientcenter/pt/actions/service-request/'
    async def espera(cond, s=30):
        for _ in range(s * 4):
            try:
                if await cond(): return True
            except Exception: pass
            await pg.wait_for_timeout(250)
        return False
    async def abrir(slug):
        await pn.click('#rail [data-mod="inicio"]'); await pg.wait_for_timeout(3500)   # sai do pedido anterior pela extensão (o portal sai junto, o que leva um instante) antes de abrir o próximo
        await pg.evaluate(f"window.__ctSim.go('{SR}{slug}')"); await pg.wait_for_timeout(600)
        await pg.evaluate(f"window.__ctSim.go('{SR}{slug}/add')"); await pg.wait_for_timeout(1500)
        if 'v-preencher' not in await pn.evaluate("document.querySelector('#view').className"):   # o painel já vai sozinho para o pedido quando o formulário abre; clicar de novo em "Novo pedido" é pedir outro tipo
            await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
        if await pn.locator('#pd-continuar').count(): await pn.click('#pd-continuar'); await pg.wait_for_timeout(500)
        await pg.mouse.move(1200, 600)
    def tem(**kv):
        async def f():
            v = await portal(); return all(v.get(k, '') == x for k, x in kv.items())
        return f
    preencher = lambda tipo, valores, opts=None: pg.evaluate("([t, v, o]) => window.__ctSim.hooks().preencher(t, v, o)", [tipo, valores, opts or {}])
    res = lambda r, k: next((x for x in r['resultados'] if x['campo'] == k), {})

    # 17: na ordem das regras (o motivo só libera depois do funcionário), mesmo com os valores fora de ordem
    await pg.evaluate(f"window.__ctSim.go('{SR}termination-calculation/add')"); await pg.wait_for_timeout(1500)
    r = await preencher('calculoRescisao', {'motivo': 'Demitido SEM justa causa', 'dataDemissao': '15/10/2026', 'empregado': 'RONALDO DE SOUZA'})
    v = await portal()
    check(res(r, 'motivo').get('ok') and v.get('terminationReason') == 'Demitido SEM justa causa' and v.get('employee') == 'RONALDO DE SOUZA', 'ordem das regras: funcionário antes do motivo (o motivo não volta bloqueado)')
    # 17: município depois da UF; a lista de municípios demora a carregar → tenta de novo e acerta
    await pg.evaluate(f"window.__ctSim.go('{SR}employee-registration/add')"); await pg.wait_for_timeout(1500)
    r = await preencher('cadastroEmpregado', {'municipio': 'Campinas', 'uf': 'SP'}, {'unicaOpcao': ['centroCusto', 'sindicato', 'servico', 'departamento']})
    v = await portal()
    m = res(r, 'municipio')
    check(m.get('ok') and m.get('tentouDeNovo') and v.get('addressState') == 'São Paulo' and v.get('addressCity') == 'Campinas', f'UF antes do município e nova tentativa quando a lista ainda carrega ({m})')
    # 44: única opção do portal (centro de custo e sindicato); com duas opções (departamento, serviço) não escolhe
    check(v.get('costCenterExpanded') == 'GERAL' and v.get('laborUnionClientExpanded') == 'SINDICATO EXEMPLO' and res(r, 'centroCusto').get('unica'), 'lista com uma opção só: escolhe sozinho (centro de custo, sindicato)')
    check(not v.get('departmentExpanded') and not v.get('serviceExpanded'), 'lista com mais de uma opção: deixa para o cliente')
    # 32: opção aproximada, apelidos e "você quis dizer"
    r = await preencher('cadastroEmpregado', {'grauInstrucao': 'Superior completa', 'racaCor': 'pardo', 'banco': 'Nubank'})
    v = await portal()
    g = res(r, 'grauInstrucao')
    check(g.get('ok') and g.get('aproximada') and v.get('schoolingLevel') == 'Superior completo', 'opção aproximada escolhida e marcada como aproximada (Superior completa → Superior completo)')
    check(v.get('race') == 'Parda' and not res(r, 'racaCor').get('aproximada') and v.get('paymentBankExpanded') == '260 - Nu Pagamentos', 'apelidos das regras: pardo → Parda, Nubank → 260 - Nu Pagamentos')
    r = await preencher('cadastroEmpregado', {'racaCor': 'Prada'})
    rc = res(r, 'racaCor')
    check(not rc.get('ok') and set(rc.get('sugestoes', [])[:2]) == {'Parda', 'Preta'}, f'sem opção segura: sugestões para o cliente escolher ({rc.get("sugestoes")})')
    await pg.evaluate(f"window.__ctSim.go('{SR}employee-leave/add')"); await pg.wait_for_timeout(1500)
    r = await preencher('afastamento', {'empregado': 'JOAO'})
    check(not res(r, 'empregado').get('ok') and not (await portal()).get('selectedEmployee'), 'funcionário: um pedaço do nome não basta')

    # 15 e 2: cadastro na plataforma — campos fora das regras e só o campo mudado vai ao portal
    await abrir('employee-registration')
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('#f-extra\\\\:eSocialRegistration') && [...document.querySelectorAll('.pf-grupo > summary')].some(s => s.textContent.includes('Outros campos do portal'))"), 10)
    check(ok, 'campos do portal fora das regras aparecem em "Outros campos do portal"')
    await pn.evaluate("document.querySelectorAll('.pf-grupo').forEach(d => d.open = true)")
    await pn.fill('#f-extra\\:eSocialRegistration', 'ABC-77'); await pn.dispatch_event('#f-extra\\:eSocialRegistration', 'change')
    # 2.30.0: no cadastro nada vai ao Onvio ao digitar; o que está pendente vai ao "Conferir e enviar" (só o campo pendente) ou ao "Enviar tudo"
    await pg.wait_for_timeout(1500)
    check(not await tem(eSocialRegistration='ABC-77')(), 'cadastro: o campo fora das regras ainda NÃO foi ao Onvio antes do envio')
    await pn.click('#btn-send')
    ok = await espera(tem(eSocialRegistration='ABC-77'), 10)
    check(ok, 'campo fora das regras preenchido no portal pela plataforma')
    try: await pn.click('#m-fix', timeout=3000)   # fecha o resumo antes do envio (nada é enviado)
    except Exception: pass
    await pn.click('#rail [data-acao="config"]'); await pg.wait_for_timeout(500)
    await pn.click('#diag'); await pg.wait_for_timeout(800)
    diag = await pg.evaluate("navigator.clipboard.readText()")
    check('eSocialRegistration (Matrícula eSocial)' in diag and 'ABC-77' not in diag, 'diagnóstico lista os campos fora das regras só pelo nome')
    await abrir('employee-registration')
    # preenche tudo uma vez (documento), depois muda um campo só
    await pg.evaluate("""async () => { const r = await fetch('exemplos/ficha-admissao.pdf'); window.__ctSim.hooks().sendFiles([new File([await r.blob()], 'ficha-admissao.pdf', { type: 'application/pdf' })]); }""")
    await espera(tem(addressCity='São Paulo', motherName='ANA SOUZA LIMA'), 40)
    await espera(lambda: pn.evaluate("!document.querySelector('#btn-fill')?.disabled"), 20); await pg.wait_for_timeout(1500)
    await pg.evaluate("""() => { window.__aberturas = 0; window.__obsListas = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeName === 'BENTO-COMBOBOX-LIST') window.__aberturas++; }))); window.__obsListas.observe(document.querySelector('main'), { childList: true, subtree: true }); }""")
    await pn.evaluate("document.querySelectorAll('.pf-grupo').forEach(d => d.open = true)")
    t0 = time.time()
    await pn.fill('#f-numero', '2024'); await pn.dispatch_event('#f-numero', 'change')
    await pn.click('#btn-send')   # 2.30.0: o campo pendente vai ao Onvio no "Conferir e enviar" (só ele, sem reabrir listas)
    ok = await espera(tem(addressNumber='2024'), 10)
    dt = time.time() - t0
    await pg.wait_for_timeout(800)
    ab = await pg.evaluate("window.__aberturas")
    check(ok and dt < 2.5 and ab == 0, f'mudar um campo do cadastro manda só ele: nenhuma lista reaberta ({ab}) e rápido ({dt:.1f} s)')
    try: await pn.click('#m-fix', timeout=3000)   # fecha o resumo antes do envio (nada é enviado)
    except Exception: pass

    # 7: o portal recusa o envio (cadastro incompleto) → a plataforma mostra o que ele acusou
    await abrir('employee-registration')
    await pn.click('#btn-send'); await pg.wait_for_timeout(1500)
    if await pn.locator('#m-send').count(): await pn.click('#m-send')
    # 2.34.1: campos obrigatórios VAZIOS que o portal marcou são "o portal ainda pede" (ninguém recusou valor nenhum); "não aceitou" fica para valor enviado e recusado
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#fill-res')?.innerText || '').includes('O portal ainda pede') && !!document.querySelector('#fr-ver-portal')"), 15)
    check(ok, 'envio recusado: a plataforma lista os campos que o portal ainda pede, com "Ver no portal"')
    check('não aceitou estes campos' not in await pn.locator('#fill-res').inner_text(), 'campo vazio não é dado como "não aceito pelo portal"')
    check(await pn.locator('#fields .field.pf-err').count() >= 2, 'campos que o portal marcou ficam destacados no formulário da plataforma')
    await pn.click('#btn-send'); await pg.wait_for_timeout(1500)
    mod = await pn.locator('#modal').inner_text()
    check('O portal pede' in mod or 'O portal acusa' in mod or 'Falta preencher' in mod, '"Conferir e enviar" mostra o que ainda falta ou o portal pede')
    await pn.click('#m-fix'); await pg.wait_for_timeout(300)
    await pn.click('#fr-ver-portal'); await pg.wait_for_timeout(800)
    check(await pg.evaluate("window.__ctSim.hooks().modoAtual()") == 'fechado', '"Ver no portal" mostra a página do portal, com só a bolinha da extensão no canto')
    await pg.evaluate("window.__ctSim.hooks().openPanel()"); await pg.wait_for_timeout(800)

    # 18 e 22: atestado → Desfazer → mudar outro campo; anexos conferidos um a um
    await abrir('employee-leave')
    await pg.evaluate("""async () => { const r = await fetch('exemplos/atestado.pdf'); window.__ctSim.hooks().sendFiles([new File([await r.blob()], 'atestado.pdf', { type: 'application/pdf' })]); }""")
    ok = await espera(tem(selectedEmployee='JOAO DA SILVA', leaveDate='05/10/2026'), 40)
    await espera(lambda: pg.evaluate("document.querySelectorAll('.p-chip').length > 0"), 15); await pg.wait_for_timeout(1200)
    await pn.click('#btn-undo')
    ok = await espera(tem(selectedEmployee='', leaveDate=''), 15); await pg.wait_for_timeout(800)
    check(ok and await pn.locator('#f-empregado').input_value() == '' and await pn.locator('#f-dataAfastamento').input_value() == '', 'Desfazer volta o formulário da plataforma junto com o portal')
    await pn.fill('#f-conclusao', '30/10/2026'); await pn.dispatch_event('#f-conclusao', 'change')
    ok = await espera(tem(conclusionExpectation='30/10/2026'), 10); await pg.wait_for_timeout(1000)
    v = await portal()
    check(ok and not v.get('selectedEmployee') and not v.get('leaveDate') and not v.get('subject'), 'depois de desfazer, mudar outro campo não traz de volta os campos desfeitos')
    check(not await pn.locator('#btn-undo').is_visible(), 'o que o cliente digita na plataforma não entra no Desfazer')
    # dois prints colados no mesmo minuto: nomes diferentes, os dois entram
    await pn.evaluate("""async () => { const c = document.createElement('canvas'); c.width = c.height = 8; const b = await new Promise(r => c.toBlob(r, 'image/png'));
      for (let i = 0; i < 2; i++) { const dt = new DataTransfer(); dt.items.add(new File([b], 'image.png', { type: 'image/png' })); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); await new Promise(r => setTimeout(r, 300)); } }""")
    await pn.click('#btn-fill')
    ok = await espera(lambda: pg.evaluate("[...document.querySelectorAll('.p-chip')].filter(c => c.textContent.includes('print-colado')).length === 2"), 40)
    check(ok, 'dois prints colados no mesmo minuto: nomes diferentes e os dois anexados')
    # anexo tirado pelo cliente no portal volta para "a anexar"
    await espera(lambda: pn.evaluate("!document.querySelector('#btn-fill')?.disabled"), 20); await pg.wait_for_timeout(800)
    await pg.evaluate("[...document.querySelectorAll('.p-chip')].find(c => c.textContent.startsWith('atestado.pdf'))?.querySelector('button')?.click()")
    ok = await espera(lambda: pn.evaluate("(() => { const f = [...document.querySelectorAll('#files .file')].find(x => x.textContent.includes('atestado.pdf')); return !!f && f.textContent.includes('a anexar'); })()"), 10)
    check(ok, 'anexo tirado no portal volta para "a anexar"')
    # arquivo que o portal recusa: aviso e "a anexar"
    await pg.evaluate("window.__ctSim.hooks().sendFiles([new File(['x'], 'planilha.zip', { type: 'application/zip' })])")
    await pg.wait_for_timeout(2500)
    await pn.click('#btn-fill')
    ok = await espera(lambda: pn.evaluate("(() => { const f = [...document.querySelectorAll('#files .file')].find(x => x.textContent.includes('planilha.zip')); return !!f && f.textContent.includes('não aceitou') && f.textContent.includes('a anexar'); })()"), 20)
    check(ok, 'arquivo recusado pelo portal: aviso e volta para "a anexar"')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:3]) if erros else ''))
    await ctx.close()

async def teste_lote4(b):
    """Rescisão, férias e fluxo de pedidos: dados do aviso no cálculo, datas calculadas, próximo passo, experiência."""
    import datetime
    print('\n[lote 4] rescisão, férias e fluxo de pedidos')
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next(f for f in pg.frames if 'panel/panel.html' in f.url)
    portal = lambda: pg.evaluate("""() => Object.fromEntries([...document.querySelectorAll('main [formcontrolname]:not([type=radio])')].map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value]))""")
    total = lambda: pg.evaluate("Promise.all(['prior-notice-vacations','vacation-calculations'].map(a => window.__ctPlatform.fetchList(a).then(r => r.json()).then(j => j.totalItems))).then(l => l[0] + l[1])")
    async def espera(cond, s=30):
        for _ in range(s * 2):
            try:
                if await cond(): return True
            except Exception: pass
            await pg.wait_for_timeout(500)
        return False
    def portal_com(**kv):
        async def f():
            v = await portal(); return all(v.get(k) == x for k, x in kv.items())
        return f
    async def fechar_portal():
        await pn.evaluate("document.querySelector('#modal .dlg-x')?.click(); const m = document.querySelector('#modal'); if (m && m.querySelector('#mh')) { m.hidden = true; m.innerHTML = ''; }")
        await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/employee-leave')"); await pg.wait_for_timeout(1500)
    br = lambda d: d.strftime('%d/%m/%Y')
    hoje = datetime.date.today()
    await espera(lambda: pn.evaluate("(document.querySelector('#eq-avisos')?.innerText || '').includes('Férias em')"), 20)
    # 20: "Pedir o cálculo" do aviso de férias (Equipe) → Cálculo de Férias com início, dias e abono do aviso
    await pn.locator('#eq-avisos .eq-li', has_text='RONALDO DE SOUZA').locator('[data-eq]').click()
    inicio = br(hoje + datetime.timedelta(days=20))
    ok = await espera(portal_com(selectedEmployee='RONALDO DE SOUZA', initialDate=inicio, vacationDays='20'), 25)
    check(ok, f'"Pedir o cálculo" do aviso: Cálculo de Férias com início {inicio}, 20 dias e o funcionário')
    async def abono_sim(): return await pg.evaluate("document.querySelector('#radioBasic-bonus1')?.checked") is True
    check(await espera(abono_sim, 10), 'abono do aviso (10 dias) marca SIM no cálculo')
    src = await pn.locator('[data-campo="inicioGozo"] .src').inner_text() if await pn.locator('[data-campo="inicioGozo"] .src').count() else ''
    check('do aviso nº 1041' in src, f'valor do aviso entra como sugestão "do aviso nº 1041" ({src})')
    # 25: abono → requerimento assinado pedido na conferência, com "Gerar pelo modelo" já preenchido
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('#checks [data-modelo=abonoFerias]')"), 10)
    check(ok, 'conferência: falta o requerimento de abono → "Gerar pelo modelo"')
    if ok:
        await pn.click('#checks [data-modelo=abonoFerias]'); await pg.wait_for_timeout(500)
        prev = await pn.locator('#md-prev').inner_text()
        check('RONALDO DE SOUZA' in prev and 'EMPRESA EXEMPLO' in prev, 'modelo do requerimento já vem com o funcionário e a empresa')
        await pn.click('#modal .dlg-x')
    await fechar_portal()
    # 6 + 33: Calcular → "Pedir o cálculo" leva o motivo e abre o resumo sozinho (nada é enviado)
    await pn.click('#rail [data-mod="ferramentas"]'); await pg.mouse.move(1200, 600); await pg.wait_for_timeout(500)
    for k, v in [('sim-quem', 'RONALDO DE SOUZA'), ('sim-desligamento', '15102026'), ('sim-salario', '3.000,00')]:
        await pn.fill('#' + k, v); await pn.dispatch_event('#' + k, 'input')
    await pn.select_option('#sim-feriasVencidas', '1'); await pg.wait_for_timeout(300)
    antes = await total()
    await pn.click('#sim-pedir')
    ok = await espera(portal_com(employee='RONALDO DE SOUZA', resignationDate='15/10/2026', terminationReason='Demitido SEM justa causa', priorNoticeDate='15/10/2026'), 25)
    check(ok, 'Calcular → Cálculo de Rescisão com o motivo da modalidade')
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('#modal:not([hidden]) #mh')"), 15)
    check(ok, 'pedido preparado sem nada faltando abre o resumo do "Conferir e enviar" sozinho')
    desc = (await portal()).get('description', '') or await pg.evaluate("document.querySelector('main textarea')?.value || ''")
    check('férias vencidas: 1 período' in desc and 'R$' not in desc, 'uma linha da simulação nas observações, sem valores')
    check(await total() == antes, 'nada enviado sem o clique do cliente')
    if await pn.locator('#m-fix').count(): await pn.click('#m-fix')
    await fechar_portal()
    # 33: o que ficou pela metade aparece no Hoje
    await pn.click('#rail [data-mod="inicio"]'); await pg.mouse.move(1200, 600)
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#eq-terminar')?.innerText || '').includes('Continuar')"), 10)
    check(ok, 'Hoje: cartão "Para terminar" com o que foi preenchido e não enviado')
    # 40: experiência vencendo com três saídas
    lin = pn.locator('#eq-exp .eq-li', has_text='VANESSA PRADO')
    bts = await lin.locator('[data-eq]').all_inner_texts()
    check(bts == ['Prorrogar', 'Encerrar no fim', 'Efetivar'], f'experiência vencendo: Prorrogar, Encerrar no fim e Efetivar ({bts})')
    await lin.locator('[data-eq]', has_text='Prorrogar').click(); await pg.wait_for_timeout(500)
    prev = await pn.locator('#md-prev').inner_text() if await pn.locator('#md-prev').count() else ''
    check('VANESSA PRADO' in prev and 'por mais 45 dias' in prev, 'Prorrogar: termo pelo modelo com funcionário, admissão e 45 dias')
    await pn.click('#modal .dlg-x'); await pg.wait_for_timeout(300)
    lin = pn.locator('#eq-exp .eq-li', has_text='VANESSA PRADO')
    await lin.locator('[data-eq]', has_text='Efetivar').click(); await pg.wait_for_timeout(400)
    await pn.click('#modal .btn-primary'); await pg.wait_for_timeout(500)
    check(await pn.locator('#eq-exp .eq-li', has_text='VANESSA PRADO').count() == 0, 'Efetivar: dispensa o aviso da experiência')
    # 21: "Programar" férias a vencer → aviso com a 1ª data que vale, pagamento e data do aviso calculados
    await pn.locator('#eq-ferias .eq-li').first.locator('[data-eq]').click()
    async def programado():
        v = await portal(); return bool(v.get('vacationStartDate')) and bool(v.get('paymentDate')) and v.get('noticeDate') == br(hoje)
    ok = await espera(programado, 25)
    v = await portal()
    check(ok, f"Programar: início sugerido, pagamento e data do aviso calculados ({v.get('vacationStartDate')}, {v.get('paymentDate')}, {v.get('noticeDate')})")
    check('calculado' in (await pn.locator('[data-campo="dataPagamento"]').inner_text()).lower(), 'data calculada marcada "calculado — confira"')
    await fechar_portal()
    # 26: aviso de rescisão de quem está na experiência → pergunta o motivo certo
    await pn.click('#rail [data-mod="funcionarios"]'); await pg.mouse.move(1200, 600); await pg.wait_for_timeout(800)
    row = pn.locator('#emp-list .dp-row', has_text='VANESSA PRADO')
    await row.locator('summary').click(); await row.locator('[data-tipo="avisoRescisao"]').click()
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#dica-pedido')?.innerText || '').includes('prazo de experiência')"), 20)
    check(ok and await pn.locator('#dp-exp-sim').count() == 1, 'Aviso de Rescisão na experiência: pergunta e sugere o motivo (sem escolher sozinho)')
    check(await pn.locator('#modal:not([hidden]) #mh').count() == 0, 'funcionário que o portal não aceitou: o resumo não abre sozinho')
    await pg.wait_for_timeout(6000)   # deixa o preenchimento terminar antes de sair do formulário
    await fechar_portal()
    # 37: envia um aviso de férias → "Próximo: Enviar o Cálculo de Férias… até" com "Preparar agora"
    await pn.click('#rail [data-mod="funcionarios"]'); await pg.mouse.move(1200, 600); await pg.wait_for_timeout(600)
    row = pn.locator('#emp-list .dp-row', has_text='JOAO DA SILVA')
    await row.locator('summary').click(); await row.locator('[data-tipo="avisoFerias"]').click()
    await espera(portal_com(selectedEmployee='JOAO DA SILVA'), 20)
    ini = hoje + datetime.timedelta(days=26)
    while ini.weekday() > 3: ini += datetime.timedelta(days=1)
    for k, val in [('f-inicioGozo', ini.strftime('%d%m%Y')), ('f-diasGozo', '20')]:
        await pn.fill('#' + k, val); await pn.dispatch_event('#' + k, 'input'); await pn.dispatch_event('#' + k, 'change')
    ok = await espera(portal_com(vacationStartDate=br(ini), vacationDays='20'), 15)
    async def com_pagamento(): return bool((await portal()).get('paymentDate'))
    await espera(com_pagamento, 10)
    pag = (await portal()).get('paymentDate')
    if not pag: print('    portal:', await portal(), '| modal:', (await pn.evaluate("document.querySelector('#modal').hidden ? '' : document.querySelector('#modal').innerText"))[:300])
    check(ok and bool(pag), f'pagamento das férias calculado ao digitar o início ({pag})')
    antes = await total()
    await pn.click('#btn-send'); await pg.wait_for_timeout(1500)
    if await pn.locator('#m-send').count(): await pn.click('#m-send')
    async def mais_um(): return await total() == antes + 1
    ok = await espera(mais_um, 15)
    check(ok, 'aviso de férias enviado pelo botão do portal')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#proximo')?.innerText || '').includes('Próximo: Enviar o Cálculo de Férias')"), 15)
    check(ok, 'depois do envio: "Próximo: Enviar o Cálculo de Férias … até DD/MM"')
    await pn.click('#proximo [data-prox-fazer]')
    ok = await espera(portal_com(selectedEmployee='JOAO DA SILVA', initialDate=br(ini), vacationDays='20'), 25)
    check(ok, '"Preparar agora" abre o Cálculo de Férias com os dados do aviso enviado')
    await fechar_portal()
    # 20: texto livre destaca o Cálculo quando o aviso desse funcionário já está no portal
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pn.fill('#free-txt', 'férias do Ronaldo'); await pn.click('#free-go'); await pg.wait_for_timeout(1500)
    check(await pn.locator('#sugestao .opc.sug[data-escolha="calculoFerias"]').count() == 1 and await pn.locator('#sugestao .aviso-portal').count() == 1, 'texto livre: aviso já no portal → destaca o Cálculo')
    # 37: Agenda com "Fazer agora" no passo que veio do aviso enviado
    await pn.click('#rail [data-mod="historico"]'); await pg.wait_for_timeout(800)
    check(await pn.locator('#ag-prox [data-fazer]').count() >= 1 and 'Enviar o Cálculo de Férias' in await pn.locator('#ag-prox').inner_text(), 'Agenda: "Enviar o Cálculo de Férias" com "Fazer agora"')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:3]) if erros else ''))
    await ctx.close()


async def teste_sugestao(b):
    """Lote 5 (P1): valor lido com dúvida não vai ao portal sozinho; aparece como sugestão de um clique ("Usar")."""
    import datetime
    print('\n[leitor] sugestão de um clique: o que foi lido com dúvida não vai ao portal sozinho')
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next(f for f in pg.frames if 'panel/panel.html' in f.url)
    async def _auto_empresa():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa_emp = asyncio.create_task(_auto_empresa())
    portal = lambda: pg.evaluate("""() => Object.fromEntries([...document.querySelectorAll('main [formcontrolname]:not([type=radio])')].map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value]))""")
    async def espera(cond, s=30):
        for _ in range(s * 2):
            try:
                if await cond(): return True
            except Exception: pass
            await pg.wait_for_timeout(500)
        return False
    # atestado (texto inventado) em que a data só aparece num "Data:" genérico: a data fica como sugestão
    dia = (datetime.date.today() - datetime.timedelta(days=3)).strftime('%d/%m/%Y')
    txt = f'ATESTADO MÉDICO\nAtesto que JOAO DA SILVA foi atendido em consulta e deverá permanecer afastado de suas atividades por 2 (dois) dias.\nData: {dia}\nDra. Fictícia de Teste\nCRM-ES 1234'
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pg.evaluate("""(t) => { const f = new File([t], 'atestado-teste.txt', { type: 'text/plain' }); window.__ctSim.hooks().sendFiles([f]); }""", txt)
    await pg.wait_for_timeout(1500)
    if await pn.locator('#sug-go').count(): await pn.click('#sug-go')
    for _ in range(80):
        v = await portal()
        if v.get('selectedEmployee') == 'JOAO DA SILVA': break
        await pg.wait_for_timeout(500)
    await pg.wait_for_timeout(2500)
    v = await portal()
    check(v.get('selectedEmployee') == 'JOAO DA SILVA', f"funcionário com o nome inteiro vai ao portal ({v.get('selectedEmployee')})")
    check(not v.get('leaveDate'), f"data lida com dúvida NÃO vai ao portal sozinha ({v.get('leaveDate')})")
    sug = pn.locator('[data-campo="dataAfastamento"] [data-usar-k="dataAfastamento"]')
    check(await sug.count() == 1 and dia in await pn.locator('[data-campo="dataAfastamento"] .sug-doc').inner_text(), 'formulário mostra a sugestão com o botão Usar')
    check(await pn.locator('#f-dataAfastamento').input_value() == '', 'o campo fica vazio até o cliente usar')
    if await sug.count(): await sug.click()
    async def data_ok():
        return (await portal()).get('leaveDate') == dia
    ok = await espera(data_ok, 15)
    check(ok, 'Usar: a data vai ao portal')
    check(await pn.locator('#f-dataAfastamento').input_value() == dia, 'Usar: o campo da plataforma mostra a data')
    tarefa_emp.cancel()
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:3]) if erros else ''))
    await ctx.close()


async def teste_cadastro(b):
    """Lote 3: cadastro sem os dados da pessoa anterior, sugestões da empresa e ficha colada no campo de várias linhas."""
    print('\n[cadastro] repetir sem dados pessoais, sugestões e ficha colada')
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/?modo=painel'); await pg.wait_for_timeout(2500)
    painel = lambda: next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    portal = lambda: pg.evaluate("""() => Object.fromEntries([...document.querySelectorAll('main [formcontrolname]:not([type=radio])')].map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value]))""")
    async def espera(cond, s=30):
        for _ in range(s * 2):
            try:
                if await cond(): return True
            except Exception: pass
            await pg.wait_for_timeout(500)
        return False
    def tem(**kv):
        async def f():
            v = await portal(); return all(v.get(k) == x for k, x in kv.items())
        return f
    pn = painel()
    await pg.evaluate("window.__ctSim.hooks()?.openPanel()"); await pg.wait_for_timeout(600)
    empresa = (await pn.inner_text('#empresa')).strip()
    # um cadastro enviado por uma versão antiga, com os dados da pessoa (dados inventados)
    h = {'chave': 'x', 'quando': 1, 'empresa': empresa, 'tipo': 'cadastroEmpregado', 'status': 'enviado', 'resumo': 'Cadastro de teste', 'anexos': [],
         'valores': {'nome': 'PESSOA ANTERIOR DE TESTE', 'cpf': '529.982.247-25', 'mae': 'MAE ANTERIOR', 'cep': '01310-100', 'sexo': 'Feminino', 'cargo': 'VENDEDOR', 'dataAdmissao': '01/10/2026'}}
    await pn.evaluate("h => chrome.storage.local.set({ historico: [h] })", h)
    await pg.reload(); await pg.wait_for_timeout(2500)
    await pg.evaluate("window.__ctSim.hooks()?.openPanel()"); await pg.wait_for_timeout(800)
    pn = painel()
    await pn.click('.tab[data-view="inicio"]'); await pg.wait_for_timeout(600)
    await pn.click('#rep-go')
    ok = await espera(tem(jobPositionExpanded='VENDEDOR'), 25)
    v = await portal()
    check(ok and not v.get('name') and not v.get('nationalIdentity') and not v.get('motherName') and not v.get('zipCode'), f"repetir um cadastro leva só o cargo, sem nome, CPF, mãe e CEP ({ {k: x for k, x in v.items() if x} })")
    pn = painel()
    sug = await pn.inner_text('#sug-cad') if await pn.locator('#sug-cad').count() else ''
    check('Sugestões para este cadastro' in sug and '45' in sug and '529.982' not in sug, 'sugestões do cadastro: experiência 45 + 45, sem dados pessoais')
    if await pn.locator('#sug-todas').count(): await pn.click('#sug-todas')
    elif await pn.locator('[data-sug]').count(): await pn.click('[data-sug]')
    ok = await espera(tem(daysExperience='45', extensionDays='45'), 20)
    check(ok, 'usar as sugestões: experiência e prorrogação vão ao portal')
    # campo de texto de várias linhas: Shift+Enter quebra a linha, Enter envia
    check(await pn.evaluate("document.querySelector('#free-form')?.tagName") == 'TEXTAREA', 'campo de texto do Preencher tem várias linhas')
    await pn.click('#free-form'); await pn.type('#free-form', 'linha 1'); await pn.press('#free-form', 'Shift+Enter'); await pn.type('#free-form', 'linha 2')
    check(await pn.evaluate("document.querySelector('#free-form').value") == 'linha 1\nlinha 2', 'Shift+Enter quebra a linha sem enviar')
    await pn.fill('#free-form', 'Nome: Fulana de Teste\nCPF: 529.982.247-25\nNome da mãe: Mãe de Teste\nData de nascimento: 12/03/1995')
    await pn.press('#free-form', 'Enter')
    ok = await espera(tem(name='Fulana de Teste', motherName='Mãe de Teste'), 25)
    v = await portal()
    check(ok, f"ficha colada preenche nome e mãe ({v.get('name')}, {v.get('motherName')})")
    check('Nome:' not in (v.get('comments') or '') and 'Nome:' not in (v.get('description') or ''), 'o texto colado não vai para observações/descrição')
    await pg.click('main button:has-text("CANCELAR")'); await pg.wait_for_timeout(800)   # o cadastro é um assistente de etapas
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:3]) if erros else ''))
    await ctx.close()

async def teste_grade_div(b):
    """2.20.1: a grade do portal real é de blocos (div), não de tabela: lida pela posição, sem mudar nada na tela do Onvio."""
    print('\n[grade em blocos] leitura por posição, escrita e o Onvio intacto')
    for modo in ('div', 'div-edit', 'div-flat', 'wijmo', 'wijmo-campo'):
        ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
        await pg.evaluate("(m) => localStorage.setItem('ct-sim-grade', m)", modo)
        await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/payroll-entries/add')"); await pg.wait_for_timeout(1500)
        # o portal real não tem o formcontrolname da competência (diagnóstico de 30/10/2026): o campo é achado pelo rótulo
        await pg.evaluate("document.querySelector('[formcontrolname=basisDate]').removeAttribute('formcontrolname')")
        await pg.evaluate("window.__ctSim.hooks().preencher('rubricas', { competencia: '11/2026' }, {})"); await pg.wait_for_timeout(800)
        comp = await pg.evaluate("document.querySelector('#datepicker-dropdown-input')?.value")
        check(comp == '11/2026', f'competência sem formcontrolname: achada pelo rótulo "Competência" e preenchida ({comp!r}, {modo})')
        await pg.evaluate("document.querySelector('#datepicker-dropdown-input').dispatchEvent(new Event('input', { bubbles: true }))")
        await pg.evaluate("document.querySelector('[data-all]').click()"); await pg.wait_for_timeout(1200)
        antes = await pg.evaluate("document.documentElement.outerHTML.length")
        g = await pg.evaluate("window.__ctSim.hooks().grade.ler()")
        check(bool(g) and len(g['titulos']) == 6 and g['empregados'] == ['JOAO DA SILVA', 'JORGE OLIVEIRA ALVES', 'RONALDO DE SOUZA'], f'grade em blocos ({modo}): colunas e funcionários lidos pela posição ({g})')
        r = await pg.evaluate("window.__ctSim.hooks().grade.escrever([{ empregado: 'JORGE OLIVEIRA ALVES', evento: '0010 - FALTAS', valor: '2' }, { empregado: 'RONALDO DE SOUZA', evento: '0020 - COMISSÕES', valor: '350' }])")
        if modo.startswith('wijmo'):
            vals = await pg.evaluate("[...document.querySelectorAll('.wj-row')].slice(1).map(r => [...r.querySelectorAll('.wj-cell')].slice(2).map(c => c.dataset.v || '').join('|'))")
            check(r.get('ok') and r.get('n') == 2 and vals == ['|||||', '||2|||', '||||350|'] or vals[1].split('|')[2] == '2' and vals[2].split('|')[4] == '350', f'grade Wijmo: valores nas linhas e colunas certas ({vals})')
            await ctx.close(); continue
        v = await pg.evaluate("(() => { const ins = [...document.querySelectorAll('input.p-grade-v')]; const ys = [...new Set(ins.map(i => Math.round(i.getBoundingClientRect().top)))].sort((a, b) => a - b); return ys.map(y => ins.filter(i => Math.round(i.getBoundingClientRect().top) === y).map(i => i.value).join('|')); })()")
        ordem = [k for k, linha in enumerate(v) if linha.replace('|', '')]
        check(r.get('ok') and r.get('n') == 2 and len(ordem) == 2 and '2' in v[ordem[0]].split('|') and '350' in v[ordem[1]].split('|'), f'grade em blocos ({modo}): os valores caem nas linhas certas, na ordem dos funcionários ({r.get("n")} de 2; {v})')
        if modo in ('div', 'div-flat'):
            check(len(v) == 3 and v[1].split('|')[2] == '2' and v[2].split('|')[4] == '350', f'grade em blocos ({modo}): e nas colunas certas ({v})')
        extra = await pg.evaluate("({ css: !!document.getElementById('ct-grade-css'), btn: !!document.querySelector('.ct-grade-btn, .ct-grade-barra'), cls: !!document.querySelector('.ct-grade-card, .ct-grade-scroll') })")
        check(not any(extra.values()), f'o Onvio fica do jeito original: nenhum estilo, botão ou classe da extensão na grade ({extra})')
        check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
        await ctx.close()

async def teste_grade_virtual(b):
    """2.20.9: a planilha do portal só desenha o que cabe na tela: a leitura rola a grade e junta tudo; a escrita rola até a célula."""
    print('\n[grade virtualizada] ler tudo rolando e escrever em célula fora da tela')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    await pg.evaluate("localStorage.setItem('ct-sim-grade', 'wijmo-virtual')")
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/payroll-entries/add')"); await pg.wait_for_timeout(1500)
    await pg.evaluate("window.__ctSim.hooks().preencher('rubricas', { competencia: '11/2026' }, {})"); await pg.wait_for_timeout(800)
    await pg.evaluate("document.querySelector('[data-all]').click()"); await pg.wait_for_timeout(1200)
    g = await pg.evaluate("window.__ctSim.hooks().grade.ler()")
    check(bool(g) and len(g['empregados']) == 14 and len(g['titulos']) == 10, f"grade virtualizada: lê todos os funcionários e rubricas rolando ({len(g['empregados']) if g else None} e {len(g['titulos']) if g else None}; esperado 14 e 10)")
    check(bool(g) and g['empregados'][0] == 'FUNCIONARIO A TESTE' and g['empregados'][-1] == 'FUNCIONARIO N TESTE' and g['titulos'][-1].endswith('RUBRICA J'), 'grade virtualizada: na ordem da grade, do primeiro ao último')
    r = await pg.evaluate("window.__ctSim.hooks().grade.escrever([{ empregado: 'FUNCIONARIO M TESTE', evento: '190 - RUBRICA J', valor: '7' }, { empregado: 'FUNCIONARIO B TESTE', evento: '110 - RUBRICA B', valor: '3' }])")
    v = await pg.evaluate("window.__vals")
    check(r.get('ok') and r.get('n') == 2 and v.get('FUNCIONARIO M TESTE|190 - RUBRICA J') == '7' and v.get('FUNCIONARIO B TESTE|110 - RUBRICA B') == '3', f"grade virtualizada: os valores chegam às células que estavam fora da tela ({r.get('n')} de 2; {v})")
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    await ctx.close()

async def teste_grade_api(b):
    """2.22.0: a planilha do portal (Wijmo) existe como objeto na página: lê e lança por ela (por baixo), sem clicar na tela."""
    print('\n[grade pela planilha do portal] ler e lançar pelo objeto da planilha')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    await pg.evaluate("localStorage.setItem('ct-sim-grade', 'wijmo-api')")
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/payroll-entries/add')"); await pg.wait_for_timeout(1500)
    await pg.evaluate("window.__ctSim.hooks().preencher('rubricas', { competencia: '11/2026' }, {})"); await pg.wait_for_timeout(800)
    await pg.evaluate("document.querySelector('[data-all]').click()"); await pg.wait_for_timeout(1200)
    g = await pg.evaluate("window.__ctSim.hooks().grade.ler()")
    check(bool(g) and len(g['empregados']) == 14 and len(g['titulos']) == 10, f"planilha do portal: lê todos os funcionários e rubricas de uma vez ({len(g['empregados']) if g else None} e {len(g['titulos']) if g else None})")
    r = await pg.evaluate("window.__ctSim.hooks().grade.escrever([{ empregado: 'FUNCIONARIO M TESTE', evento: '190 - RUBRICA J', valor: '7' }, { empregado: 'FUNCIONARIO B TESTE', evento: '110 - RUBRICA B', valor: '3' }, { empregado: 'FUNCIONARIO X', evento: '110 - RUBRICA B', valor: '1' }])")
    v = await pg.evaluate("window.__vals")
    usada = await pg.evaluate("window.__apiUsada || 0")
    check(r.get('ok') and r.get('n') == 2 and v.get('FUNCIONARIO M TESTE|190 - RUBRICA J') == '7' and v.get('FUNCIONARIO B TESTE|110 - RUBRICA B') == '3' and usada == 2, f"planilha do portal: lança pelo objeto da planilha, sem clicar na tela ({r.get('n')} de 3; modelo {v}; usada {usada}x)")
    check(len(r.get('faltaram', [])) == 1 and 'fora da grade' in (r['faltaram'][0].get('motivo') or ''), f"planilha do portal: funcionário que não existe volta com o motivo ({r.get('faltaram')})")
    # 2.25.1: rubricas que o portal bloqueia e formato que o portal recusa (horas × decimal)
    check(g.get('bloqueadas') == ['180 - RUBRICA I'], f"planilha do portal: a leitura diz quais rubricas o portal bloqueia ({g.get('bloqueadas')})")
    r2 = await pg.evaluate("window.__ctSim.hooks().grade.escrever([{ empregado: 'FUNCIONARIO M TESTE', evento: '170 - RUBRICA H', valor: '01:30' }, { empregado: 'FUNCIONARIO M TESTE', evento: '180 - RUBRICA I', valor: '5' }])")
    v2 = await pg.evaluate("window.__vals")
    check(r2.get('n') == 1 and v2.get('FUNCIONARIO M TESTE|170 - RUBRICA H') == '1,5' and r2.get('formas', {}).get('horas em decimal') == 1, f"planilha do portal: horas 01:30 recusadas na coluna numérica entram como decimal 1,5 ({v2.get('FUNCIONARIO M TESTE|170 - RUBRICA H')!r}; {r2.get('formas')})")
    check(len(r2.get('faltaram', [])) == 1 and 'bloqueada' in (r2['faltaram'][0].get('motivo') or '') and not v2.get('FUNCIONARIO M TESTE|180 - RUBRICA I'), f"planilha do portal: rubrica bloqueada não é lançada e volta com o motivo ({r2.get('faltaram')})")
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    await ctx.close()

async def teste_comando_rubricas(b):
    """2.21.0: bloco "Comando" da planilha: o cliente escreve e a planilha é preenchida sozinha (abre a grade do portal se preciso)."""
    print('\n[comando] preencher a planilha de rubricas por comando')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto_empresa():   # três empresas no acesso: confirma a que já vem marcada (a do portal)
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa_emp = asyncio.create_task(_auto_empresa())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="rubricas"]')
    for _ in range(40):
        if await pn.locator('#plan-cmd-txt').count(): break
        await pg.wait_for_timeout(300)
    check(await pn.locator('#plan-cmd-txt').count() == 1 and await pn.locator('#plan-cmd-go').count() == 1, 'comando: o bloco aparece na planilha, mesmo com a grade do portal ainda fechada')
    ant = await pg.evaluate("document.querySelector('[data-all]') ? 'fechada' : 'aberta'")
    await pn.fill('#plan-cmd-txt', 'Jorge Oliveira 4 faltas'); await pn.click('#plan-cmd-go'); await pg.wait_for_timeout(1200)
    sem = await pn.evaluate("document.querySelector('#plan-cmd-res')?.innerText || ''")
    check('Falta a competência' in sem and await pn.locator('.plan-tabela').count() == 0, f'comando: sem competência no comando nem no portal, pede a competência em vez de tentar às cegas ({sem[:60]!r})')
    await pn.fill('#plan-cmd-txt', 'Mês passado: Jorge Oliveira 4 faltas, Ronaldo comissão 500 e João 2 horas extras 50%')
    await pn.click('#plan-cmd-go')
    ok = False
    for _ in range(80):
        if await pn.evaluate("document.querySelectorAll('.plan-tabela tbody tr').length === 3 && (document.querySelector('#plan-cmd-res')?.innerText || '').includes('Preenchi')"): ok = True; break
        await pg.wait_for_timeout(300)
    check(ok, 'comando: abre e lê a planilha do portal sozinho e preenche (grade antes: ' + ant + ')')
    v = await pn.evaluate("(() => { const g = (i, j) => document.querySelector(`.plan-tabela input[data-i='${i}'][data-j='${j}']`)?.value; return [g(1, 2), g(2, 3), g(0, 0)]; })()")
    check(v[0] == '4' and v[2] == '2', f'comando: faltas do Jorge e horas extras do João nas células certas da planilha ({v})')
    cel = await pg.evaluate("(() => { const ins = [...document.querySelectorAll('input.p-grade-v')]; return ins.map(i => i.value).filter(Boolean); })()")
    await pg.wait_for_timeout(1500)
    cel = await pg.evaluate("[...document.querySelectorAll('input.p-grade-v')].map(i => i.value).filter(Boolean).sort()")
    check('4' in cel and '2' in cel, f'comando: os valores chegam à grade do portal ({cel})')
    await pn.fill('#plan-cmd-txt', 'coloque 30 faltas, 5 atrasos, 700 de comissões para RONALDO DE SOUZA'); await pn.click('#plan-cmd-go')
    ok = False
    for _ in range(60):
        if await pn.evaluate("(document.querySelector('#plan-cmd-res')?.innerText || '').includes('Preenchi 3')"): ok = True; break
        await pg.wait_for_timeout(300)
    await pg.wait_for_timeout(1500)
    cel2 = await pg.evaluate("[...document.querySelectorAll('input.p-grade-v')].map(i => i.value).filter(Boolean).sort()")
    check(ok and all(x in cel2 for x in ('30', '5', '700')), f'comando: o funcionário no fim da frase ("... para RONALDO") vale para todos os itens ({cel2})')
    await pn.fill('#plan-cmd-txt', 'Jorge 9 xpto zeta'); await pn.click('#plan-cmd-go'); await pg.wait_for_timeout(1500)
    txt = await pn.evaluate("document.querySelector('#plan-cmd-res')?.innerText || ''")
    check('Não entendi' in txt, f'comando: o que não foi entendido é avisado, sem inventar valor ({txt[:80]!r})')
    # 2.22.1: a janela do resumo antes de enviar fica inteira na tela, centralizada e por cima da barra lateral
    await pn.click('#btn-send')
    for _ in range(30):
        if await pn.locator('#modal .sheet').count(): break
        await pg.wait_for_timeout(300)
    g = await pn.evaluate("(() => { const s = document.querySelector('#modal .sheet'); if (!s) return null; const r = s.getBoundingClientRect(), rail = document.querySelector('#rail').getBoundingClientRect(), topo = document.elementFromPoint(r.left + 8, r.top + 40); return { cls: s.className, ww: getComputedStyle(s).width, pos: getComputedStyle(document.querySelector('#modal')).position, z: getComputedStyle(document.querySelector('#modal')).zIndex, quem: topo && (topo.id || topo.className), l: r.left, t: r.top, r: r.right, b: r.bottom, rail: rail.right, w: innerWidth, h: innerHeight, topo: !!topo && s.contains(topo) }; })()")
    check(bool(g) and g['l'] >= g['rail'] and g['r'] <= g['w'] and g['t'] >= 0 and g['b'] <= g['h'] and g['topo'], f"resumo antes de enviar: a janela fica inteira na tela, centralizada e por cima da barra lateral ({g})")
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa_emp.cancel(); await asyncio.gather(tarefa_emp, return_exceptions=True)
    await ctx.close()

async def teste_rascunho_rubricas(b):
    """2.23.0: o resumo mostra os valores conferidos com a grade do portal; o rascunho guarda a planilha e volta ao reabrir."""
    print('\n[rascunho] resumo com os valores e rascunho da planilha de rubricas')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e) + ' @ ' + str(getattr(e, 'stack', '') or '').replace(chr(10), ' | ')[:260]))
    async def abrir():
        pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
        async def _auto():
            while True:
                try:
                    if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
                except Exception: pass
                await asyncio.sleep(0.15)
        t = asyncio.create_task(_auto())
        await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
        await pn.click('.pd-escolha .intent[data-tipo="rubricas"]')
        return pn, t
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    await pg.evaluate("localStorage.setItem('ct-sim-grade', 'wijmo-api')")
    pn, tarefa = await abrir()
    for _ in range(40):
        if await pn.locator('#plan-cmd-txt').count(): break
        await pg.wait_for_timeout(300)
    await pn.fill('#plan-cmd-txt', 'Mês passado: funcionario b teste 4 rubrica b e funcionario m teste 7 rubrica j'); await pn.click('#plan-cmd-go')
    ok = False
    for _ in range(80):
        if await pn.evaluate("(document.querySelector('#plan-cmd-res')?.innerText || '').includes('Preenchi 2')"): ok = True; break
        await pg.wait_for_timeout(300)
    await pg.wait_for_timeout(1500)
    v = await pg.evaluate("window.__vals")
    check(ok and v.get('FUNCIONARIO B TESTE|110 - RUBRICA B') == '4' and v.get('FUNCIONARIO M TESTE|190 - RUBRICA J') == '7', f'rascunho: o comando preenche a planilha e a grade do portal ({v})')
    await pn.click('#plan-rascunho'); await pg.wait_for_timeout(800)
    st = await pn.evaluate("document.querySelector('#plan-status')?.innerText || ''")
    gravado = await pn.evaluate("chrome.storage.local.get('rascunhos').then(r => JSON.stringify(r.rascunhos || {}))")
    check('Rascunho salvo' in st and '"planilha"' in gravado and 'FUNCIONARIO M TESTE' in gravado, f'rascunho: "Salvar rascunho" guarda a planilha neste computador ({st[:50]!r})')
    await pn.click('#btn-send')
    for _ in range(30):
        if await pn.locator('#modal .resumo-valores').count(): break
        await pg.wait_for_timeout(300)
    linhas = await pn.evaluate("[...document.querySelectorAll('#modal .resumo-valores tbody tr')].map(t => t.innerText.replace(/\\s+/g, ' ').trim())")
    check(len(linhas) == 2 and all('na grade' in x for x in linhas), f'resumo: mostra os valores lançados e confere com a grade do portal ({linhas})')
    check(await pn.locator('#m-rasc').count() == 1, 'resumo: tem o botão "Salvar rascunho"')
    await pn.click('#m-rasc'); await pg.wait_for_timeout(600)
    check(await pn.locator('#modal .sheet').count() == 0, 'resumo: "Salvar rascunho" guarda e fecha a janela')
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    # sair e voltar: a página é recarregada (tudo da memória some); o rascunho continua guardado
    await pg.reload(); await pg.wait_for_timeout(3500)
    await pg.evaluate("localStorage.setItem('ct-sim-grade', 'wijmo-api')")
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/payroll-entries/add')"); await pg.wait_for_timeout(1500)
    pn, tarefa = await abrir()
    for _ in range(40):
        if await pn.locator('#rasc-sim').count(): break
        await pg.wait_for_timeout(300)
    check(await pn.locator('#rasc-sim').count() == 1, 'rascunho: ao reabrir as rubricas, oferece "Continuar"')
    if await pn.locator('#rasc-sim').count():
        await pn.click('#rasc-sim')
        ok = False
        for _ in range(100):
            vv = await pg.evaluate("window.__vals || {}")
            if vv.get('FUNCIONARIO B TESTE|110 - RUBRICA B') == '4' and vv.get('FUNCIONARIO M TESTE|190 - RUBRICA J') == '7': ok = True; break
            await pg.wait_for_timeout(300)
        check(ok, f'rascunho: "Continuar" abre a planilha do portal e devolve os valores guardados ({vv})')
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    await ctx.close()

async def teste_excel_rubricas(b):
    """2.25.0: exportar a planilha para o Excel e fixar (importar) uma planilha preenchida: a extensão abre a grade do portal e lança sozinha."""
    import zipfile
    print('\n[excel] exportar e importar a planilha de rubricas')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    xlsx = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib', 'xlsx', 'xlsx.full.min.js')
    async def sheetjs(route): await route.fulfill(path=xlsx, content_type='text/javascript')
    await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/xlsx/**', sheetjs)
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    await pg.evaluate("localStorage.setItem('ct-sim-grade', 'wijmo-api')")
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="rubricas"]')
    for _ in range(40):
        if await pn.locator('#plan-exportar').count(): break
        await pg.wait_for_timeout(300)
    check(await pn.locator('#plan-exportar').count() == 1 and await pn.locator('#plan-importar').count() == 1, 'excel: os botões Exportar e Importar aparecem na planilha, mesmo com a grade do portal fechada')
    await pn.click('#plan-exportar'); await pg.wait_for_timeout(1200)
    sem = await pn.evaluate("document.querySelector('#plan-arq-res')?.innerText || ''")
    check('Falta a competência' in sem, f'excel: sem competência, pede a competência em vez de tentar às cegas ({sem[:50]!r})')
    await pg.evaluate("window.__ctSim.hooks().preencher('rubricas', { competencia: '11/2026' }, {})"); await pg.wait_for_timeout(800)
    async with pg.expect_download(timeout=40000) as dl:
        await pn.click('#plan-exportar')
    d = await dl.value
    caminho = await d.path()
    with zipfile.ZipFile(caminho) as z:
        textos = ' '.join(z.read(n).decode('utf-8', 'ignore') for n in z.namelist() if n.startswith('xl/worksheets/') or n.endswith('sharedStrings.xml'))
        nomes_abas = z.read('xl/workbook.xml').decode('utf-8')
    check(d.suggested_filename == 'lancamento-de-rubricas-2026-11.xlsx', f'excel: o arquivo se chama como a competência ({d.suggested_filename})')
    check('FUNCIONARIO B TESTE' in textos and 'FUNCIONARIO N TESTE' in textos and '110 - RUBRICA B' in textos and '190 - RUBRICA J' in textos and 'Rubricas' in nomes_abas and 'Como usar' in nomes_abas, 'excel: o .xlsx tem todos os funcionários e todas as rubricas da grade do portal, e a aba "Como usar"')
    # 2.25.1: a rubrica bloqueada pelo portal fica travada na planilha, e o comando avisa em vez de tentar
    bl = await pn.evaluate("[...document.querySelectorAll('.plan-tabela tbody tr:first-child input')].map(i => i.disabled)")
    check(bl.count(True) == 1 and bl[8] is True, f'excel: só a rubrica bloqueada pelo portal fica travada na planilha ({bl})')
    await pn.fill('#plan-cmd-txt', 'funcionario b teste 5 rubrica i'); await pn.click('#plan-cmd-go'); await pg.wait_for_timeout(2500)
    cm = await pn.evaluate("document.querySelector('#plan-cmd-res')?.innerText || ''")
    check('não deixa lançar' in cm and not (await pg.evaluate("window.__vals || {}")).get('FUNCIONARIO B TESTE|180 - RUBRICA I'), f'excel: o comando avisa da rubrica bloqueada e não a lança ({cm[:90]!r})')
    # 2.25.3: frase com rubrica em dúvida: pergunta qual (botões) em vez de desistir ou chutar
    await pn.fill('#plan-cmd-txt', 'funcionario b teste 6 rubrica'); await pn.click('#plan-cmd-go'); await pg.wait_for_timeout(2500)
    nbot = await pn.locator('#plan-cmd-res [data-duv]').count()
    antes_v = dict(await pg.evaluate("window.__vals || {}"))
    check(nbot >= 2, f'comando: frase em dúvida mostra as rubricas candidatas como botões ({nbot})')
    if nbot:
        rot = await pn.locator('#plan-cmd-res [data-duv]').first.inner_text()
        await pn.locator('#plan-cmd-res [data-duv]').first.click(); await pg.wait_for_timeout(2500)
        v6 = await pg.evaluate("window.__vals || {}")
        check(v6.get(f'FUNCIONARIO B TESTE|{rot.strip()}') == '6' and 'lançado em' in await pn.evaluate("document.querySelector('#plan-cmd-res')?.innerText || ''"), f'comando: escolher a rubrica lança o valor na planilha e no portal ({rot.strip()!r})')
    # a marca vermelha sai sozinha quando o portal passa a aceitar o valor
    await pn.fill('.plan-tabela input[data-i="1"][data-j="7"]', 'abc'); await pg.wait_for_timeout(2500)
    marcada = await pn.evaluate("document.querySelector('.plan-tabela input[data-i=\"1\"][data-j=\"7\"]').closest('td').classList.contains('plan-falhou')")
    await pn.fill('.plan-tabela input[data-i="1"][data-j="7"]', '2'); await pg.wait_for_timeout(2500)
    marcada2 = await pn.evaluate("document.querySelector('.plan-tabela input[data-i=\"1\"][data-j=\"7\"]').closest('td').classList.contains('plan-falhou')")
    check(marcada and not marcada2, f'excel: a marca vermelha aparece quando o portal recusa e sai quando ele aceita ({marcada}, {marcada2})')
    # fixar uma planilha preenchida: o Excel em português salva .csv com ponto e vírgula
    csv = 'Funcionário;110 - RUBRICA B;190 - RUBRICA J;Total\nFUNCIONARIO B TESTE;4;;9\nFUNCIONARIO M TESTE;;7;\nFULANO NAO EXISTE;1;;\n'.encode('utf-8')
    await pn.set_input_files('#plan-arquivo', files=[{'name': 'preenchida.csv', 'mimeType': 'text/csv', 'buffer': csv}])
    ok = False
    for _ in range(80):
        if await pn.evaluate("(document.querySelector('#plan-arq-res')?.innerText || '').includes('Fixei a planilha')"): ok = True; break
        await pg.wait_for_timeout(300)
    await pg.wait_for_timeout(1500)
    v = await pg.evaluate("window.__vals || {}")
    msg = await pn.evaluate("document.querySelector('#plan-arq-res')?.innerText || ''")
    check(ok and v.get('FUNCIONARIO B TESTE|110 - RUBRICA B') == '4' and v.get('FUNCIONARIO M TESTE|190 - RUBRICA J') == '7', f'excel: fixar a planilha preenchida lança os valores na planilha e na grade do portal ({v})')
    check('FULANO NAO EXISTE' in msg and 'Total' in msg, f'excel: avisa o funcionário que não está na grade e a coluna que não é rubrica ({msg[:120]!r})')
    # arrastar o arquivo para o cartão
    csv2 = 'Funcionário;110 - RUBRICA B\nFUNCIONARIO C TESTE;11\n'
    await pn.evaluate("""(t) => { const card = document.querySelector('.plan-rub'); const dt = new DataTransfer(); dt.items.add(new File([t], 'arrastada.csv', { type: 'text/csv' })); card.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }""", csv2)
    ok = False
    for _ in range(60):
        v = await pg.evaluate("window.__vals || {}")
        if v.get('FUNCIONARIO C TESTE|110 - RUBRICA B') == '11': ok = True; break
        await pg.wait_for_timeout(300)
    check(ok, f'excel: arrastar a planilha para o cartão também fixa e lança ({v})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_leitura_repetida(b):
    """2.25.2: o portal não está pronto na primeira tentativa (botão desligado por instantes; primeiro clique ignorado): a leitura espera e repete sozinha."""
    print('\n[leitura] "Carregar funcionários e rubricas" que não lê de primeira')
    for rotulo, chave, valor, limite in (('botão desligado por 5 s', 'ct-sim-botao-lento', '5000', 40), ('primeiro clique ignorado pelo portal', 'ct-sim-ignora-1', '1', 90)):
        ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
        await pg.evaluate("(a) => { localStorage.setItem('ct-sim-grade', 'wijmo-api'); localStorage.setItem(a[0], a[1]); }", [chave, valor])
        pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
        async def _auto():
            while True:
                try:
                    if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
                except Exception: pass
                await asyncio.sleep(0.15)
        tarefa = asyncio.create_task(_auto())
        await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
        await pn.click('.pd-escolha .intent[data-tipo="rubricas"]')
        for _ in range(40):
            if await pn.locator('#plan-carregar').count(): break
            await pg.wait_for_timeout(300)
        await pg.evaluate("window.__ctSim.hooks().preencher('rubricas', { competencia: '11/2026' }, {})"); await pg.wait_for_timeout(800)
        await pn.click('#plan-carregar')
        ok = False
        for _ in range(limite * 3):
            if await pn.evaluate("document.querySelectorAll('.plan-tabela tbody tr').length === 14"): ok = True; break
            await pg.wait_for_timeout(333)
        erro = await pn.evaluate("document.querySelector('#planilha-rub .muted')?.innerText || ''")
        check(ok, f'leitura: com o {rotulo}, "Carregar" lê os 14 funcionários sem precisar clicar de novo ({erro[:80]!r})')
        check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
        tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
        await ctx.close()

async def teste_competencia_comando(b):
    """2.25.4: "do mês anterior" no meio da frase é parte da rubrica e não muda a Competência do portal (só no começo ou com campo vazio)."""
    print('\n[comando] "mês anterior" não muda a competência do portal')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    await pg.evaluate("localStorage.setItem('ct-sim-grade', 'wijmo-api')")
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="rubricas"]')
    for _ in range(40):
        if await pn.locator('#plan-cmd-txt').count(): break
        await pg.wait_for_timeout(300)
    await pg.evaluate("window.__ctSim.hooks().preencher('rubricas', { competencia: '11/2026' }, {})"); await pg.wait_for_timeout(800)
    await pn.fill('#plan-cmd-txt', 'coloque 3 de rubrica b do mes anterior para funcionario b teste'); await pn.click('#plan-cmd-go')
    ok = False
    for _ in range(80):
        if await pn.evaluate("document.querySelectorAll('.plan-tabela tbody tr').length === 14"): ok = True; break
        await pg.wait_for_timeout(300)
    await pg.wait_for_timeout(1500)
    comp = await pg.evaluate("document.querySelector('#datepicker-dropdown-input')?.value")
    check(ok and comp == '11/2026', f'comando: "do mês anterior" no meio da frase não muda a Competência do portal ({comp!r})')
    nota = await pn.evaluate("document.querySelector('#plan-cmd-res')?.innerText || ''")
    check('continua 11/2026' in nota, f'comando: avisa que a Competência do portal continua a mesma ({nota[-120:]!r})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_resumo_conferencia(b):
    """2.25.5: o resumo antes de enviar não acusa o mesmo valor em outro formato (12:45 × 012:45) e oferece "Relançar os que não conferem"."""
    print('\n[resumo] conferência dos valores com a grade do portal')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    await pg.evaluate("localStorage.setItem('ct-sim-grade', 'wijmo-api')")
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="rubricas"]')
    for _ in range(40):
        if await pn.locator('#plan-carregar').count(): break
        await pg.wait_for_timeout(300)
    await pg.evaluate("window.__ctSim.hooks().preencher('rubricas', { competencia: '11/2026' }, {})"); await pg.wait_for_timeout(800)
    await pn.click('#plan-carregar')
    for _ in range(80):
        if await pn.evaluate("document.querySelectorAll('.plan-tabela tbody tr').length === 14"): break
        await pg.wait_for_timeout(300)
    await pn.fill('.plan-tabela input[data-i="1"][data-j="6"]', '12:45'); await pg.wait_for_timeout(2500)   # o portal guarda 012:45
    await pn.fill('.plan-tabela input[data-i="1"][data-j="0"]', '4'); await pg.wait_for_timeout(2500)
    guardado = (await pg.evaluate("window.__vals || {}")).get('FUNCIONARIO B TESTE|160 - RUBRICA G')
    await pg.evaluate("window.__vals['FUNCIONARIO B TESTE|100 - RUBRICA A'] = '9'")   # algo mexeu na grade do portal: o valor agora é outro
    await pn.click('#btn-send')
    for _ in range(40):
        if await pn.locator('#modal .resumo-valores').count(): break
        await pg.wait_for_timeout(300)
    linhas = await pn.evaluate("[...document.querySelectorAll('#modal .resumo-valores tbody tr')].map(t => t.innerText.replace(/\\s+/g, ' ').trim())")
    check(guardado == '012:45' and any('RUBRICA G' in x and 'na grade' in x for x in linhas), f'resumo: o mesmo valor em outro formato (12:45 × {guardado}) conta como conferido ({linhas})')
    check(any('RUBRICA A' in x and 'grade tem 9' in x for x in linhas) and await pn.locator('#m-relancar').count() == 1, 'resumo: o valor que realmente mudou é acusado e aparece "Relançar os que não conferem"')
    await pn.click('#m-relancar')
    for _ in range(60):
        if await pn.locator('#modal .resumo-valores').count(): break
        await pg.wait_for_timeout(300)
    await pg.wait_for_timeout(800)
    linhas2 = await pn.evaluate("[...document.querySelectorAll('#modal .resumo-valores tbody tr')].map(t => t.innerText.replace(/\\s+/g, ' ').trim())")
    v = await pg.evaluate("window.__vals || {}")
    check(v.get('FUNCIONARIO B TESTE|100 - RUBRICA A') == '4' and linhas2 and all('na grade' in x for x in linhas2) and await pn.locator('#m-relancar').count() == 0, f'resumo: "Relançar" corrige a grade e o resumo reabre sem pendências ({v.get("FUNCIONARIO B TESTE|100 - RUBRICA A")!r}; {linhas2})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_troca_empresa_dom(b):
    """2.26.0: a troca de empresa acha o seletor do portal e a opção pelo apelido ("MODELO | 0002-37"), sem o atalho do simulador."""
    print('\n[empresa] trocar de empresa pelo seletor do portal (lista com busca que mostra só apelido e código)')
    OUTRA = 'COMERCIO MODELO DE ALIMENTOS LTDA'
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.evaluate("localStorage.setItem('ct-sim-troca-dom', '1')"); await pg.reload(); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    check(await pg.evaluate("typeof window.__ctPlatform.trocarEmpresa") == 'undefined', 'empresa: sem o atalho do simulador, a troca depende do seletor da tela')
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions')"); await pg.wait_for_timeout(1500)
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pn.locator('.pd-escolha .intent[data-tipo="afastamento"]').click()
    await pn.locator('.ee-lista').wait_for(timeout=8000)
    await pn.click(f'.ee-li[data-nome="{OUTRA}"]'); await pn.click('.dlg [data-acao="2"]')
    ok = False
    for _ in range(120):
        if await pg.evaluate("window.__ctPlatform.path().endsWith('/employee-leave/add')"): ok = True; break
        await pg.wait_for_timeout(300)
    emp = await pg.evaluate("document.querySelector('#p-empresa')?.textContent || ''")
    check(ok and emp == OUTRA, f'empresa: o seletor do portal é aberto, a opção é achada pelo apelido e o pedido abre na empresa escolhida ({emp!r})')
    # a empresa não está na lista do portal: o motivo e a estrutura do que abriu (sem nomes) voltam para o diagnóstico
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions')"); await pg.wait_for_timeout(1500)
    r = await pg.evaluate("window.__ctSim.hooks().trocar('EMPRESA QUE NAO EXISTE LTDA', 'NAOEXISTE | 9999-00')")
    det = (r or {}).get('detalhe') or ''
    check(r and r.get('ok') is False and 'não apareceu na lista' in (r.get('motivo') or '') and 'tentei' in det and 'item(ns) de lista' in det and 'NAOEXISTE' not in det, f'empresa: sem a empresa na lista, o motivo e a estrutura do que abriu voltam sem nomes ({det[:140]!r})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    await ctx.close()

async def teste_troca_empresa_modal(b):
    """2.28.2: com muitas empresas o Onvio abre a janela "Selecione uma empresa" (clicar marca a linha; SELECIONAR EMPRESA troca)."""
    print('\n[empresa] trocar de empresa pela janela "Selecione uma empresa"')
    OUTRA = 'COMERCIO MODELO DE ALIMENTOS LTDA'
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.evaluate("localStorage.setItem('ct-sim-troca-modal', '1')"); await pg.reload(); await pg.wait_for_timeout(3500)
    r = await pg.evaluate("window.__ctSim.hooks().trocar('COMERCIO MODELO DE ALIMENTOS LTDA', 'MODELO | 0002-37')")
    emp = await pg.evaluate("document.querySelector('#p-empresa')?.textContent || ''")
    check(r and r.get('ok') and emp == OUTRA, f'empresa: a janela "Selecione uma empresa" é aberta, a linha marcada e o botão SELECIONAR EMPRESA clicado ({emp!r}, {r})')
    check(await pg.locator('#p-troca-modal').count() == 0, 'empresa: a janela fecha depois da troca')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    await ctx.close()

async def teste_cancelar_rubricas(b):
    """2.29.0: "Cancelar lançamento" na planilha de rubricas clica no CANCELAR do portal por baixo, sem enviar nada, e limpa a planilha."""
    print('\n[cancelar] cancelar o lançamento de rubricas pela extensão')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    await pg.evaluate("localStorage.setItem('ct-sim-grade', 'wijmo-api')")
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="rubricas"]')
    for _ in range(40):
        if await pn.locator('#pd-cancelar').count(): break
        await pg.wait_for_timeout(300)
    lado = await pn.evaluate("(() => { const a = document.querySelector('#ver-portal'), b = document.querySelector('#pd-cancelar'); if (!a || !b) return false; const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return Math.abs(x.top - y.top) < 6 && Math.abs(x.height - y.height) < 2 && y.left > x.left && y.width < 260; })()")
    check(lado, 'cancelar: os dois botões ficam lado a lado, do mesmo tamanho')
    check(await pn.locator('#pd-cancelar').count() == 1, 'cancelar: o botão "Cancelar lançamento" aparece no cabeçalho do pedido, ao lado de "Ver no portal"')
    await pn.click('#pd-cancelar'); await pg.wait_for_timeout(500)
    check(await pn.locator('.dlg').count() == 1, 'cancelar: pergunta antes de descartar')
    await pn.click('.dlg [data-acao="1"]'); await pg.wait_for_timeout(500)   # "Continuar lançando"
    check(await pg.evaluate("window.__ctPlatform.path().endsWith('/add')"), 'cancelar: "Continuar lançando" não sai do formulário do portal')
    await pn.click('#pd-cancelar'); await pg.wait_for_timeout(300)
    await pn.click('.dlg [data-acao="2"]')
    fora = False
    for _ in range(40):
        if not await pg.evaluate("window.__ctPlatform.path().endsWith('/add')"): fora = True; break
        await pg.wait_for_timeout(200)
    check(fora, 'cancelar: o portal volta à lista (pelo CANCELAR do próprio portal), sem enviar')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_blocos_cadastro(b):
    """2.29.2: no formulário próprio do cadastro, o bloco que a pessoa abriu (ou fechou) não muda sozinho quando a tela é redesenhada."""
    print('\n[blocos] blocos do formulário de cadastro não mudam sozinhos')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="cadastroEmpregado"]')
    await pn.locator('details.pf-grupo').first.wait_for(state='attached', timeout=20000)
    estado = lambda: pn.evaluate("[...document.querySelectorAll('details.pf-grupo')].map(d => d.open)")
    n = len(await estado())
    check(n >= 3, f'blocos: o cadastro tem vários blocos ({n})')
    # a pessoa clica num bloco que estava fechado (cabeçalho) e depois num campo de dentro dele; o redesenho que vem do portal (etapas, listas)
    # não pode fechar esse bloco nem abrir outros
    await pn.evaluate("[...document.querySelectorAll('details.pf-grupo')].forEach((d, i) => { d.open = (i === 0); })"); await pg.wait_for_timeout(300)
    alvo = pn.locator('details.pf-grupo').nth(1)
    await alvo.locator('summary').click(); await pg.wait_for_timeout(300)
    esperado = ''.join('1' if x else '0' for x in await estado())
    await pn.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")   # o foco sai do formulário (clicou em outro lugar)
    seq = []
    for r in range(6):
        # o portal muda por baixo (um campo dele recebe um valor): o painel recebe o contexto novo e pode redesenhar o formulário
        await pg.evaluate("""(r) => { const i = [...document.querySelectorAll('input[formcontrolname]:not([type=checkbox]):not([type=radio]):not([disabled])')].find(x => x.offsetParent !== null && x.type !== 'file');
          if (i) { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'TESTE ' + r); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.dispatchEvent(new Event('blur')); } }""", r)
        await pg.wait_for_timeout(900)
        seq.append(await pn.evaluate("[[...document.querySelectorAll('details.pf-grupo')].map(d => d.open ? 1 : 0).join(''), (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.k) || document.activeElement.tagName]"))
    print('   sequência (blocos abertos, foco):', seq)
    antes = seq[0]
    depois = seq[-1]
    check(all(x[0] == esperado for x in seq), f'blocos: depois de redesenhar, cada bloco continua como a pessoa deixou (esperado {esperado}; vistos {[x[0] for x in seq]})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_foco_listas(b):
    """2.29.4: clicar numa lista e logo em outro campo — quando a extensão termina de buscar as opções da lista o foco fica no campo em que a pessoa clicou por último
    (antes voltava à lista anterior)."""
    print('\n[foco] o foco não volta à lista anterior')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="cadastroEmpregado"]')
    await pn.locator('#f-nome').wait_for(state='attached', timeout=20000); await pg.wait_for_timeout(1500)
    foco = "(() => { const a = document.activeElement; return (a && (a.id || a.tagName)) || ''; })()"
    for seq in (('#f-cargo', '#f-nome'), ('#f-funcao', '#f-matricula'), ('#f-sindicato', '#f-centroCusto', '#f-nome')):
        for campo in seq:
            await pn.locator(campo).click(); await pg.wait_for_timeout(120)
        esperado = seq[-1][1:]
        vistos = []
        for _ in range(14):
            await pg.wait_for_timeout(350); vistos.append(await pn.evaluate(foco))
        ruins = [v for v in vistos if v not in (esperado, 'BODY')]
        check(not ruins and vistos[-1] == esperado, f'foco: depois de clicar {" → ".join(c[3:] for c in seq)}, o foco termina em {esperado} (visto: {sorted(set(vistos))})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_foco_lista_vazia(b):
    """2.29.5: lista que volta SEM opções (várias do Onvio real): clicar nela não pode ficar "selecionando e desselecionando" — o foco fica quieto no campo."""
    print('\n[foco] lista sem opções não entra em ciclo de foco')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.evaluate("localStorage.setItem('ct-sim-listas-vazias', '1')"); await pg.reload(); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="cadastroEmpregado"]')
    await pn.locator('#f-cargo').wait_for(state='attached', timeout=20000); await pg.wait_for_timeout(1500)
    await pn.evaluate("window.__focos = 0; document.addEventListener('focusin', (e) => { if (e.target.id === 'f-cargo') window.__focos++; })")
    await pn.locator('#f-cargo').click()
    await pg.wait_for_timeout(9000)
    focos = await pn.evaluate("window.__focos")
    ativo = await pn.evaluate("document.activeElement && (document.activeElement.id || document.activeElement.tagName)")
    check(focos <= 3, f'foco: a lista sem opções não fica pegando o foco de novo e de novo ({focos} vezes em 9 s)')
    check(ativo == 'f-cargo', f'foco: no fim o campo continua com o foco ({ativo})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_sem_ao_vivo(b):
    """2.30.0: no cadastro de funcionário nada vai ao Onvio enquanto a pessoa digita; o botão "Enviar tudo para o Onvio" manda de uma vez."""
    print('\n[ao vivo] cadastro: nada vai ao Onvio até o botão Enviar tudo')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="cadastroEmpregado"]')
    await pn.locator('#f-nome').wait_for(state='attached', timeout=20000); await pg.wait_for_timeout(1500)
    portal = lambda fc: pg.evaluate("(fc) => { const e = document.querySelector('[formcontrolname=\"' + fc + '\"]'); return e ? (e.tagName === 'BENTO-COMBOBOX' ? e.querySelector('input').value : e.value) : null; }", fc)
    check('Enviar tudo para o Onvio' in (await pn.locator('#btn-fill').inner_text()), 'ao vivo: o botão do rodapé se chama "Enviar tudo para o Onvio"')
    await pn.locator('#f-nome').click(); await pg.keyboard.type('MARIA TESTE')
    await pg.wait_for_timeout(2500)
    check((await portal('name')) in ('', None), f'ao vivo: o que foi digitado NÃO foi para o Onvio sozinho (portal: {await portal("name")!r})')
    pend = await pn.locator('#av-pend').inner_text()
    check('1 campo' in pend, f'ao vivo: a tela mostra quantos campos ainda não foram ({pend!r})')
    await pn.locator('#f-cargo').click(); await pg.wait_for_timeout(2500)
    ativo = await pn.evaluate("document.activeElement && document.activeElement.id")
    check(ativo == 'f-cargo', f'ao vivo: clicar numa lista não busca opções nem tira o foco ({ativo})')
    await pn.click('#btn-fill'); await pg.wait_for_timeout(4000)
    check((await portal('name')) == 'MARIA TESTE', f'ao vivo: "Enviar tudo" manda o que foi digitado para o Onvio (portal: {await portal("name")!r})')
    pend2 = ''
    for _ in range(10):
        pend2 = await pn.locator('#av-pend').inner_text()
        if 'Nada pendente' in pend2: break
        await pg.wait_for_timeout(500)
    check('Nada pendente' in pend2, f'ao vivo: depois de enviar não sobra nada pendente ({pend2!r})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_listas_do_onvio(b):
    """2.30.1: no cadastro a extensão lê sozinha as listas de escolha do Onvio (cargo, sindicato…) e traz as opções para os campos da plataforma."""
    print('\n[listas] as listas do Onvio são lidas sozinhas e trazidas para a extensão')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="cadastroEmpregado"]')
    await pn.locator('#f-cargo').wait_for(state='attached', timeout=20000)
    ok = False
    for _ in range(240):
        st = await pn.locator('#av-listas-st').inner_text()
        if 'já estão aqui' in st and 'Lendo' not in st: ok = True; break
        await pg.wait_for_timeout(500)
    st = await pn.locator('#av-listas-st').inner_text()
    check(ok, f'listas: a extensão leu as listas do Onvio sozinha ({st!r})')
    n = await pn.evaluate("(() => { const o = {}; document.querySelectorAll('datalist[id^=dl-]').forEach(d => { o[d.id.slice(3)] = d.querySelectorAll('option').length; }); return o; })()")
    check(n.get('cargo', 0) > 0 and n.get('sindicato', 0) > 0 and n.get('vinculo', 0) > 0, f'listas: cargo, sindicato e vínculo já têm as opções do Onvio ({ {k: n.get(k) for k in ("cargo", "sindicato", "vinculo")} })')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_cargo_novo(b):
    """2.31.0: cargo digitado que não existe na lista do Onvio vira pedido de cadastro nas Observações (e não é enviado ao campo)."""
    print('\n[cargo novo] cargo que não existe vai para as Observações')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="cadastroEmpregado"]')
    await pn.locator('#f-cargo').wait_for(state='attached', timeout=20000)
    for _ in range(240):   # espera as listas do Onvio chegarem
        if 'já estão aqui' in await pn.locator('#av-listas-st').inner_text(): break
        await pg.wait_for_timeout(500)
    existente = await pn.evaluate("document.querySelector('#dl-cargo option').value")
    portal = lambda fc: pg.evaluate("(fc) => { const e = document.querySelector('[formcontrolname=\"' + fc + '\"]'); return e ? (e.tagName === 'BENTO-COMBOBOX' ? e.querySelector('input').value : e.value) : null; }", fc)
    obs = lambda: pn.evaluate("document.querySelector('#f-observacoes').value")
    await pn.fill('#f-nome', 'MARIA SOUZA'); await pn.dispatch_event('#f-nome', 'change')
    await pn.fill('#f-observacoes', 'Admissão urgente.'); await pn.dispatch_event('#f-observacoes', 'change')
    await pn.fill('#f-cargo', 'GERENTE INVENTADO XYZ'); await pn.dispatch_event('#f-cargo', 'change'); await pg.wait_for_timeout(800)
    o = await obs()
    check('GERENTE INVENTADO XYZ' in o and 'MARIA SOUZA' in o and o.startswith('Admissão urgente.'), f'cargo novo: o pedido de cadastro entra nas Observações sem apagar o que foi escrito ({o!r})')
    check(await pn.locator('[data-campo="cargo"] .nn').count() == 1, 'cargo novo: aviso embaixo do campo Cargo')
    check('GERENTE INVENTADO XYZ' in await pn.locator('[data-campo="cargo"] .nn').inner_text(), 'cargo novo: o aviso mostra o texto do pedido (dentro da extensão)')
    c0 = ''
    for _ in range(12):   # o pedido vai ao Onvio na hora, sem esperar o "Enviar tudo"
        c0 = await portal('comments') or ''
        if 'GERENTE INVENTADO XYZ' in c0: break
        await pg.wait_for_timeout(400)
    check('GERENTE INVENTADO XYZ' in c0, f'cargo novo: o pedido já está nas Observações do Onvio, antes do Enviar tudo ({c0!r})')
    await pn.click('#btn-fill'); await pg.wait_for_timeout(4500)
    check((await portal('jobPositionExpanded')) in ('', None), f'cargo novo: o cargo que não existe NÃO foi para o campo do Onvio ({await portal("jobPositionExpanded")!r})')
    c = await portal('comments')
    check(c and 'GERENTE INVENTADO XYZ' in c, f'cargo novo: o pedido foi para as Observações do Onvio ({c!r})')
    await pn.fill('#f-cargo', existente); await pn.dispatch_event('#f-cargo', 'change'); await pg.wait_for_timeout(800)
    o2 = await obs()
    check('GERENTE INVENTADO XYZ' not in o2 and o2 == 'Admissão urgente.', f'cargo novo: trocando por um cargo que existe, a linha sai e o texto da pessoa fica ({o2!r})')
    check(await pn.locator('[data-campo="cargo"] .nn').count() == 0, 'cargo novo: o aviso some')
    c2 = ''
    for _ in range(12):
        c2 = await portal('comments') or ''
        if 'GERENTE INVENTADO XYZ' not in c2: break
        await pg.wait_for_timeout(400)
    check('GERENTE INVENTADO XYZ' not in c2 and c2 == 'Admissão urgente.', f'cargo novo: a linha também sai das Observações do Onvio ({c2!r})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_cancelar_cadastro(b):
    """2.31.1: o cadastro de funcionário tem o botão "Cancelar cadastro" (igual ao das rubricas): clica no CANCELAR do portal e descarta o que foi digitado."""
    print('\n[cancelar] cancelar o cadastro pela extensão')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="cadastroEmpregado"]')
    await pn.locator('#pd-cancelar').wait_for(state='attached', timeout=20000)
    check('Cancelar cadastro' in await pn.locator('#pd-cancelar').inner_text(), 'cancelar: o botão "Cancelar cadastro" aparece no cabeçalho do pedido')
    lado = await pn.evaluate("(() => { const a = document.querySelector('#ver-portal'), b = document.querySelector('#pd-cancelar'); const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return Math.abs(x.top - y.top) < 6 && Math.abs(x.height - y.height) < 2 && y.left > x.left; })()")
    check(lado, 'cancelar: fica ao lado de "Ver no portal", do mesmo tamanho')
    await pn.fill('#f-nome', 'MARIA TESTE'); await pn.dispatch_event('#f-nome', 'change')
    await pn.click('#pd-cancelar'); await pg.wait_for_timeout(500)
    check(await pn.locator('.dlg').count() == 1, 'cancelar: pergunta antes de descartar')
    await pn.click('.dlg [data-acao="1"]'); await pg.wait_for_timeout(500)
    check(await pg.evaluate("window.__ctPlatform.path().endsWith('/add')"), 'cancelar: "Continuar preenchendo" não sai do formulário')
    await pn.click('#pd-cancelar'); await pg.wait_for_timeout(300)
    await pn.click('.dlg [data-acao="2"]')
    fora = False
    for _ in range(40):
        if not await pg.evaluate("window.__ctPlatform.path().endsWith('/add')"): fora = True; break
        await pg.wait_for_timeout(200)
    check(fora, 'cancelar: o portal volta à lista (pelo CANCELAR do próprio portal), sem enviar')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_ocr_tempo(b):
    """2.32.0: foto grande de celular é reduzida antes do OCR, lê em poucas tentativas e o diagnóstico traz tamanho, tentativas e tempo (sem conteúdo)."""
    print('\n[ocr] foto grande de atestado: reduzida, poucas tentativas, tempo no diagnóstico')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    JS = """async ([nome, larg, alt, graus, sombra]) => {
      const m = await import('./extract.js');
      const base = await (await fetch('../exemplos/' + nome)).blob();
      const bmp = await createImageBitmap(base);
      const cv = new OffscreenCanvas(larg, alt); const c = cv.getContext('2d');
      c.fillStyle = '#6b5a45'; c.fillRect(0, 0, larg, alt);
      c.translate(larg / 2, alt / 2); c.rotate(graus * Math.PI / 180);
      const k = Math.min(larg * 0.9 / bmp.width, alt * 0.9 / bmp.height);
      c.drawImage(bmp, -bmp.width * k / 2, -bmp.height * k / 2, bmp.width * k, bmp.height * k); c.setTransform(1, 0, 0, 1, 0, 0);
      if (sombra) { const g = c.createLinearGradient(0, 0, larg, 0); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, larg, alt); }
      const blob = await cv.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
      const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      const t0 = performance.now();
      let r, erro = '';
      try { r = await m.readFile(file, () => {}, { ocr: true }); } catch (e) { erro = String(e?.motivo || e?.message || e); }
      return { ms: Math.round(performance.now() - t0), erro, palavras: r ? (r.texto.match(/atest|paciente|dias|cid|afast/gi) || []).length : 0, diag: r?.diag || null };
    }"""
    for args, rotulo in ((['atestado-foto.png', 4032, 3024, 0, False], 'foto reta 4032×3024'), (['atestado-foto.png', 4032, 3024, 4, True], 'foto torta e com sombra'), (['atestado-girado.jpg', 4032, 3024, 2, True], 'foto girada')):
        r = await pn.evaluate(JS, args)
        d = r['diag'] or {}
        print(f'   {rotulo}: {r["ms"]} ms, {d.get("tentativas")} tentativa(s), lado {d.get("lado")}')
        check(not r['erro'] and r['palavras'] >= 3, f'ocr: {rotulo} é lida (palavras de documento: {r["palavras"]}, erro: {r["erro"] or "-"})')
        check(d.get('reduzida') is True and d.get('lado', 9999) <= 2400, f'ocr: {rotulo} é reduzida antes do OCR (lado {d.get("lado")})')
        check((d.get('tentativas') or 9) <= 2, f'ocr: {rotulo} lê em até 2 tentativas ({d.get("tentativas")})')
    # o diagnóstico traz o tamanho, as tentativas e o tempo do arquivo lido pela tela (nada do conteúdo)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="afastamento"]'); await pg.wait_for_timeout(2500)
    await pg.evaluate("""async () => { const r = await fetch('exemplos/atestado-foto.png'); window.__ctSim.hooks().sendFiles([new File([await r.blob()], 'atestado-foto.png', { type: 'image/png' })]); }""")
    diag = ''
    for _ in range(40):
        await pg.wait_for_timeout(1500)
        await pn.click('#rail [data-acao="config"]'); await pg.wait_for_timeout(600)
        await pn.click('#diag'); await pg.wait_for_timeout(500)
        diag = await pg.evaluate("navigator.clipboard.readText()")
        if 'tentativa(s)' in diag: break
        await pn.click('#rail [data-mod="preencher"]')
    linha = next((l for l in diag.splitlines() if l.startswith('Arquivos:')), '')
    check('tentativa(s)' in linha and 'nota ' in linha, f'ocr: o diagnóstico traz tentativas e tempo do arquivo lido ({linha[:140]!r})')
    check('atestado-foto' not in linha, 'ocr: o diagnóstico não traz o nome do arquivo')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_dicas_arquivo(b):
    """2.33.0: o nome do arquivo ("Joao da Silva 4 dias 02.11") completa funcionário, dias e data como SUGESTÃO (Usar); nunca vai ao portal sozinho."""
    print('\n[arquivo] dicas do nome do arquivo')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="afastamento"]'); await pg.wait_for_timeout(3000)
    await pg.evaluate("""() => { window.__ctSim.hooks().sendFiles([new File(['Declaro que o paciente compareceu a consulta nesta data.'], 'Atestado Joao 4 dias 02.11.txt', { type: 'text/plain' })]); }""")
    ok = False
    for _ in range(40):
        if await pn.locator('[data-usar-k="empregado"]').count(): ok = True; break
        await pg.wait_for_timeout(500)
    check(ok, 'arquivo: o funcionário do nome do arquivo aparece como sugestão com o botão Usar')
    txt = await pn.locator('#fields').inner_text()
    check('Pelo nome do arquivo' in txt and 'JOAO DA SILVA' in txt, 'arquivo: a sugestão diz que veio do nome do arquivo')
    check(await pn.locator('[data-usar-k="dias"]').count() == 0 and await pn.locator('[data-usar-k="dataAfastamento"]').count() == 0, 'arquivo: dias e data do nome do arquivo valem como leitura (sem botão Usar)')
    portal = await pg.evaluate("(() => { const e = document.querySelector('[formcontrolname=selectedEmployee]'); return e ? (e.querySelector('input') || e).value : null; })()")
    check(portal in ('', None), f'arquivo: nada foi ao portal sozinho ({portal!r})')
    await pn.click('[data-usar-k="empregado"]'); await pg.wait_for_timeout(3500)
    portal2 = await pg.evaluate("(() => { const e = document.querySelector('[formcontrolname=selectedEmployee]'); return e ? (e.querySelector('input') || e).value : null; })()")
    check(portal2 == 'JOAO DA SILVA', f'arquivo: ao tocar em Usar, o funcionário vai ao portal ({portal2!r})')
    # 2.36.2: nome com duas palavras que bate com UM funcionário ("Joao da Silva") vale como leitura e vai ao portal, ainda marcado "confira"
    await pn.click('#pd-voltar') if await pn.locator('#pd-voltar').count() else None
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions')"); await pg.wait_for_timeout(1200)
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="afastamento"]'); await pg.wait_for_timeout(3000)
    await pg.evaluate("""() => { window.__ctSim.hooks().sendFiles([new File(['Declaro que o paciente compareceu a consulta nesta data.'], 'Atestado Joao da Silva 4 dias 02.11.txt', { type: 'text/plain' })]); }""")
    portal3 = ''
    for _ in range(40):
        portal3 = await pg.evaluate("(() => { const e = document.querySelector('[formcontrolname=selectedEmployee]'); return e ? (e.querySelector('input') || e).value : ''; })()")
        if portal3: break
        await pg.wait_for_timeout(500)
    check(portal3 == 'JOAO DA SILVA', f'arquivo: nome com duas palavras que bate com um só funcionário vai ao portal ({portal3!r})')
    await pg.wait_for_timeout(3000)
    v3 = await pg.evaluate("(() => { const g = n => { const e = document.querySelector('[formcontrolname=' + n + ']'); return e ? ((e.querySelector('input') || e).value || '') : ''; }; return { data: g('leaveDate'), tipo: g('selectedLeaveType') }; })()")
    check(v3['data'].startswith('02/11/') and 'inferior a 15' in v3['tipo'], f'arquivo: data e tipo do afastamento (pelos 4 dias do nome) também vão ao portal ({v3!r})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_arquivo_nome_e_leitura(b):
    """2.36.5: o arquivo "Denise de Assis 01 dia 13.10" com leitura do documento fraca (nome cortado, data igual à do arquivo): data, dias e tipo vão ao portal pelo nome do arquivo."""
    print('\n[arquivo] leitura fraca + nome do arquivo')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="afastamento"]'); await pg.wait_for_timeout(3000)
    txt = 'ATESTADO MÉDICO\nAtesto que DENISE DE ASS esteve em consulta e necessita de 1 (um) dia de afastamento.\nData: 13/10/2026\nDra. Fictícia de Teste\nCRM-ES 1234'
    await pg.evaluate("(t) => { window.__ctSim.hooks().sendFiles([new File([t], 'Denise de Assis 01 dia 13.10.txt', { type: 'text/plain' })]); }", txt)
    v = {}
    for _ in range(40):
        await pg.wait_for_timeout(500)
        v = await pg.evaluate("(() => { const g = n => { const e = document.querySelector('[formcontrolname=' + n + ']'); return e ? ((e.querySelector('input') || e).value || '') : ''; }; return { data: g('leaveDate'), tipo: g('selectedLeaveType') }; })()")
        if v['data'] and v['tipo']: break
    check(v.get('data', '').startswith('13/10/') and 'inferior a 15' in v.get('tipo', ''), f'arquivo+leitura fraca: data e tipo foram ao portal ({v!r})')
    # 2.36.5: já dentro do formulário de afastamento (empresa escolhida), um lote cujas pessoas não estão na lista NÃO pergunta a empresa de novo
    await pn.evaluate("window.__eeVisto = 0; new MutationObserver(() => { if (document.querySelector('.ee-lista')) window.__eeVisto++; }).observe(document.body, { childList: true, subtree: true });")
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/employee-leave/add')"); await pg.wait_for_timeout(2000)
    await pg.evaluate("(ts) => { window.__ctSim.hooks().sendFiles(ts.map((t, i) => new File([t], ['Denise de Assis 01 dia 13.10.txt', 'Arthur dos Santos 02 dias 06.10.txt'][i], { type: 'text/plain' }))); }", [txt, txt.replace('DENISE DE ASS', 'ARTHUR DOS SANTOS').replace('13/10', '06/10')])
    await pg.wait_for_timeout(9000)
    check(await pn.evaluate("window.__eeVisto") == 0, 'lote dentro do formulário: não pergunta a empresa de novo')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_pular_leitura(b):
    """2.34.0: "Pular leitura" interrompe o OCR em andamento (o arquivo segue só anexado) e as leituras seguintes continuam funcionando."""
    print('\n[pular] botão Pular leitura')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(800)
    await pn.click('.pd-escolha .intent[data-tipo="afastamento"]'); await pg.wait_for_timeout(3000)
    # foto grande e girada (leva alguns segundos para ler): dá tempo de pular
    await pg.evaluate("""async () => {
      const base = await (await fetch('exemplos/atestado-girado.jpg')).blob(); const bmp = await createImageBitmap(base);
      const cv = new OffscreenCanvas(6000, 4500); const c = cv.getContext('2d'); c.fillStyle = '#6b5a45'; c.fillRect(0, 0, 6000, 4500);
      c.translate(3000, 2250); c.rotate(2 * Math.PI / 180); const k = Math.min(6000 * 0.9 / bmp.width, 4500 * 0.9 / bmp.height);
      c.drawImage(bmp, -bmp.width * k / 2, -bmp.height * k / 2, bmp.width * k, bmp.height * k);
      const blob = await cv.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
      window.__ctSim.hooks().sendFiles([new File([blob], 'foto-grande.jpg', { type: 'image/jpeg' })]);
    }""")
    achou = False
    for _ in range(40):
        if await pn.locator('[data-pular]').count(): achou = True; break
        await pg.wait_for_timeout(250)
    check(achou, 'pular: enquanto a foto é lida aparece o botão "Pular leitura"')
    await pg.wait_for_timeout(700)
    if await pn.locator('[data-pular]').count(): await pn.click('[data-pular]')
    pulou = False
    for _ in range(40):
        t = await pn.locator('#files').inner_text()
        if 'Leitura pulada' in t: pulou = True; break
        await pg.wait_for_timeout(300)
    check(pulou, 'pular: a leitura é interrompida e o cartão diz que o arquivo segue só anexado')
    check(await pn.locator('[data-pular]').count() == 0, 'pular: o botão some depois de pular')
    # a leitura seguinte funciona (o motor é reiniciado)
    await pg.evaluate("""async () => { const r = await fetch('exemplos/atestado-foto.png'); window.__ctSim.hooks().sendFiles([new File([await r.blob()], 'atestado-foto.png', { type: 'image/png' })]); }""")
    ok = False
    for _ in range(60):
        if 'lido por OCR' in await pn.locator('#files').inner_text(): ok = True; break
        await pg.wait_for_timeout(500)
    check(ok, 'pular: depois de pular, o arquivo seguinte é lido normalmente (e o cartão não volta a "Reconhecendo" por evento do motor abandonado)')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_todas_as_empresas(b):
    """2.35.0: a caixa "Para qual empresa é este pedido?" mostra TODAS as empresas do acesso (lidas da janela "Selecione uma empresa" do portal), inclusive as sem
    solicitações e filiais de mesmo nome (separadas pelo apelido), e a troca escolhe a filial pelo código."""
    print('\n[empresas] todas as empresas do acesso na caixa de escolha')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.evaluate("localStorage.setItem('ct-sim-troca-modal', '1')"); await pg.reload(); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions')"); await pg.wait_for_timeout(1500)
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pn.locator('.pd-escolha .intent[data-tipo="afastamento"]').click()
    await pn.locator('.ee-lista').wait_for(timeout=20000)
    nomes = await pn.evaluate("[...document.querySelectorAll('.ee-li')].map(l => l.querySelector('.es-tx').innerText.replace(/\\s+/g, ' ').trim())")
    filiais = [n for n in nomes if 'FILIAL' in n]
    check(len(filiais) == 2 and any('0002-14' in n for n in filiais) and any('0003-03' in n for n in filiais), f'empresas: as 2 filiais de mesmo nome e sem solicitações aparecem, separadas pelo código ({filiais})')
    check(len(nomes) >= 5, f'empresas: a caixa traz todas as empresas do acesso, não só as com solicitações ({len(nomes)})')
    check(await pg.evaluate("!document.querySelector('[role=dialog]#p-troca-modal')"), 'empresas: a janela do portal foi fechada sem trocar nada')
    check(await pg.evaluate("document.querySelector('#p-empresa').textContent") == 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA', 'empresas: a empresa aberta no portal continua a mesma')
    # escolhe a filial 0003-03 (mesmo nome da 0002-14): o conteúdo precisa clicar na linha com o código certo
    await pn.evaluate("[...document.querySelectorAll('.ee-li')].find(l => l.textContent.includes('0003-03')).querySelector('input').click()")
    await pn.click('.dlg [data-acao="2"]')
    linha = ''
    for _ in range(40):
        linha = await pg.evaluate("window.__ctSimLinha || ''")
        if linha: break
        await pg.wait_for_timeout(300)
    check(linha == 'FILIAL | 0003-03', f'empresas: a troca clica na linha da filial certa, não na primeira de mesmo nome ({linha!r})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    await ctx.close()

async def teste_empresa_do_funcionario(b):
    import datetime
    """2.36.0: o atestado de um funcionário de OUTRA empresa troca a empresa sozinho (sem perguntar), e cada pessoa de um lote abre na empresa dela."""
    print('\n[funcionário → empresa] a empresa do funcionário é descoberta e a troca é feita')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('console', lambda m: print('CON', m.text[:300]) if 'DBGP' in m.text else None)
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(4000)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    BASE, OUTRA, TERCEIRA = 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA', 'COMERCIO MODELO DE ALIMENTOS LTDA', 'OFICINA FICTICIA DE SERVICOS ME'
    dia = (datetime.date.today() - datetime.timedelta(days=3)).strftime('%d/%m/%Y')
    def texto(nome, dias): return f'ATESTADO MÉDICO\nAtesto que {nome} foi atendido em consulta e deverá permanecer afastado de suas atividades por {dias} dias.\nData: {dia}\nDra. Fictícia de Teste\nCRM-ES 1234'
    emp = lambda: pg.evaluate("document.querySelector('#p-empresa')?.textContent || ''")
    sel = lambda: pg.evaluate("(() => { const e = document.querySelector('[formcontrolname=selectedEmployee]'); return e ? (e.querySelector('input') || e).value : ''; })()")
    check(await emp() == BASE, f'empresa: o teste começa na empresa base ({await emp()!r})')
    # 1) um atestado de funcionário da OUTRA empresa, sem formulário aberto
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pg.evaluate("(t) => { window.__ctSim.hooks().sendFiles([new File([t], 'Atestado Carlos Eduardo Paiva.txt', { type: 'text/plain' })]); }", texto('CARLOS EDUARDO PAIVA', 2))
    await pg.wait_for_timeout(2000)
    if await pn.locator('#sug-go').count(): await pn.click('#sug-go')
    ok = False
    for _ in range(120):
        if await emp() == OUTRA and await pg.evaluate("window.__ctPlatform.path().endsWith('/add')") and await sel() == 'CARLOS EDUARDO PAIVA': ok = True; break
        await pg.wait_for_timeout(500)
    check(ok, f'empresa: o atestado de CARLOS (da empresa MODELO) abriu o pedido já nela, com ele escolhido ({await emp()!r}, {await sel()!r})')
    check(await pn.locator('.ee-lista').count() == 0, 'empresa: não perguntou a empresa (achou uma só)')
    # 1b) já dentro do formulário (empresa base), solta o atestado de alguém de OUTRA empresa: o pedido é movido para ela
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions')"); await pg.wait_for_timeout(1500)
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    if await pn.locator('#pd-voltar').count(): await pn.click('#pd-voltar')
    await pn.click('.pd-escolha .intent[data-tipo="afastamento"]')
    for _ in range(40):
        if await pg.evaluate("window.__ctPlatform.path().endsWith('/add')"): break
        await pg.wait_for_timeout(500)
    await pg.wait_for_timeout(1500)
    check(await emp() == OUTRA, f'empresa: o formulário está aberto na empresa MODELO ({await emp()!r})')
    await pg.evaluate("(t) => { window.__ctSim.hooks().sendFiles([new File([t], 'Atestado Joao da Silva 02 dias.txt', { type: 'text/plain' })]); }", texto('JOAO DA SILVA', 2))
    ok = False
    for _ in range(120):
        if await emp() == BASE and await sel() == 'JOAO DA SILVA': ok = True; break
        await pg.wait_for_timeout(500)
    check(ok, f'empresa: dentro do formulário, o atestado de JOAO (da empresa base) move o pedido para ela e escolhe o funcionário ({await emp()!r}, {await sel()!r})')
    # volta ao início e solta atestados de duas pessoas de empresas diferentes (lote)
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions')"); await pg.wait_for_timeout(1500)
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    if await pn.locator('#pd-voltar').count(): await pn.click('#pd-voltar')
    await pg.evaluate("(ts) => { window.__ctSim.hooks().sendFiles(ts.map((t, i) => new File([t], 'atestado' + i + '.txt', { type: 'text/plain' }))); }", [texto('HUGO BARRETO', 1), texto('JOAO DA SILVA', 2)])
    ok = False
    for _ in range(160):
        if await emp() == TERCEIRA and await sel() == 'HUGO BARRETO': ok = True; break
        await pg.wait_for_timeout(500)
    check(ok, f'lote: o 1º pedido (HUGO) abriu na empresa dele, OFICINA ({await emp()!r}, {await sel()!r})')
    check(await pn.locator('.ee-lista').count() == 0, 'lote: não perguntou a empresa (achou a de cada pessoa)')
    if await pn.locator('#lote-pular').count(): await pn.click('#lote-pular')
    ok = False
    for _ in range(160):
        if await emp() == BASE and await sel() == 'JOAO DA SILVA': ok = True; break
        await pg.wait_for_timeout(500)
    check(ok, f'lote: o 2º pedido (JOAO) voltou para a empresa dele, a base ({await emp()!r}, {await sel()!r})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    await ctx.close()

async def teste_sair_do_pedido(b):
    """2.27.0: sair do pedido pela extensão (outro tipo, outra aba) leva o portal de volta à lista do tipo; "Continuar o pedido" reabre e preenche de novo."""
    print('\n[sair] o portal sai do formulário junto com a extensão')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto():
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa = asyncio.create_task(_auto())
    caminho = lambda: pg.evaluate("window.__ctPlatform.path()")
    async def espera_cam(pred, n=60):
        for _ in range(n):
            if pred(await caminho()): return True
            await pg.wait_for_timeout(300)
        return False
    async def abrir_afastamento():
        await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(600)
        await pn.locator('.pd-escolha .intent[data-tipo="afastamento"]').click()
        await espera_cam(lambda c: c.endswith('/employee-leave/add'))
        for _ in range(40):
            if await pn.locator('#f-dataAfastamento').count(): break
            await pg.wait_for_timeout(300)
    await abrir_afastamento()
    await pn.fill('#f-dataAfastamento', '09/10/2026'); await pn.dispatch_event('#f-dataAfastamento', 'input'); await pn.dispatch_event('#f-dataAfastamento', 'change'); await pg.wait_for_timeout(1500)
    # "Ver Onvio" só mostra o portal: ele continua no formulário
    await pn.click('#plat-ver-portal'); await pg.wait_for_timeout(800)
    check((await caminho()).endswith('/employee-leave/add'), '"Ver Onvio" não tira o portal do formulário')
    await pg.evaluate("window.__ctSim.hooks().modo('plataforma')"); await pg.wait_for_timeout(500)
    # Configurações não tira o portal do formulário (o diagnóstico copiado de lá descreve o formulário aberto)
    await pn.click('#rail [data-acao="config"]'); await pg.wait_for_timeout(1200)
    check((await caminho()).endswith('/employee-leave/add'), 'Configurações não tira o portal do formulário (o diagnóstico precisa dele)')
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(1000)
    # 1) "Novo pedido" de novo (escolher outro tipo): o portal sai do formulário
    await pn.click('#rail [data-mod="preencher"]')
    ok = await espera_cam(lambda c: not c.endswith('/add'))
    check(ok, f'escolher outro tipo pela extensão: o portal sai do formulário de afastamento ({await caminho()})')
    for _ in range(40):
        if await pn.locator('#pd-continuar[data-retomar="afastamento"]').count(): break
        await pg.wait_for_timeout(300)
    check(await pn.locator('#pd-continuar[data-retomar="afastamento"]').count() == 1, 'a faixa "Você deixou o pedido… Continuar o pedido" aparece')
    # continuar: reabre no portal e preenche de novo
    await pn.click('#pd-continuar')
    ok = await espera_cam(lambda c: c.endswith('/employee-leave/add'))
    for _ in range(60):
        v = await pg.evaluate("document.querySelector('main [formcontrolname=leaveDate]')?.value")
        if v == '09/10/2026': break
        await pg.wait_for_timeout(300)
    check(ok and v == '09/10/2026', f'"Continuar o pedido": o portal reabre o formulário com o que foi preenchido ({v!r})')
    # 2) outra aba da extensão (Hoje): o portal também sai
    for _ in range(40):
        if await pn.locator('#f-dataAfastamento').count(): break
        await pg.wait_for_timeout(300)
    await pg.wait_for_timeout(800)
    await pn.click('#rail [data-mod="inicio"]')
    ok = await espera_cam(lambda c: not c.endswith('/add'))
    check(ok, f'ir para outra aba da extensão: o portal também sai do formulário ({await caminho()})')
    # 3) o que não tem pedido aberto não navega o portal à toa
    antes = await caminho()
    await pn.click('#rail [data-mod="pendencias"]'); await pg.wait_for_timeout(1200)
    check(await caminho() == antes, 'sem formulário aberto, trocar de aba não mexe no portal')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:2]) if erros else ''))
    tarefa.cancel(); await asyncio.gather(tarefa, return_exceptions=True)
    await ctx.close()

async def teste_tela_muda(b):
    """2.20.8: se o serviço de fundo da extensão não responde, Configurações não fica muda: avisa e deixa tentar de novo."""
    print('\n[telas] Configurações com o serviço de fundo parado')
    ctx = await b.new_context(viewport={'width': 1500, 'height': 900})
    pg = await ctx.new_page()
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    # 2.23.1: "Ver Onvio" no canto do cabeçalho, ao lado da busca (saiu da barra lateral)
    b2 = await pn.evaluate("(() => { const a = document.querySelector('#plat-ver-portal'), s = document.querySelector('#plat-busca'); if (!a || !s) return null; const ra = a.getBoundingClientRect(), rs = s.getBoundingClientRect(); return { txt: a.innerText.trim(), esq: ra.left >= rs.right - 1, mesmaLinha: Math.abs((ra.top + ra.bottom) / 2 - (rs.top + rs.bottom) / 2) < 6, direita: innerWidth - ra.right < 40, olho: !!a.querySelector('use[href=\"#i-eye\"]'), naBarra: !!document.querySelector('#rail [data-acao=\"portal\"]') }; })()")
    check(bool(b2) and b2['txt'] == 'Ver Onvio' and b2['esq'] and b2['mesmaLinha'] and b2['direita'] and b2['olho'] and not b2['naBarra'], f'"Ver Onvio": botão com olho no canto superior direito, ao lado da busca, e fora da barra lateral ({b2})')
    await pn.click('#plat-ver-portal'); await pg.wait_for_timeout(800)
    check(await pg.evaluate("window.__ctSim.hooks().modoAtual()") == 'fechado', '"Ver Onvio" recolhe a extensão e mostra o portal')
    await pg.evaluate("window.__ctSim.hooks().modo('plataforma')")
    await pg.wait_for_timeout(300)
    await pn.evaluate("chrome.runtime.sendMessage = (m) => (m && (m.type === 'getSettings' || m.type === 'getRules')) ? new Promise(() => {}) : Promise.resolve({})")
    await pn.click('#rail [data-acao="config"]')
    ok = False
    for _ in range(40):
        if await pn.evaluate("!!document.querySelector('#tela-de-novo')"): ok = True; break
        await pg.wait_for_timeout(300)
    check(ok, 'Configurações: sem resposta do serviço de fundo, a tela avisa e oferece "Tentar de novo"')
    await ctx.close()

async def teste_lote6(b):
    """Lote 6: variáveis da folha no Hoje (38), grade de rubricas (45) e resposta preparada no portal (46)."""
    import datetime
    print('\n[lote 6] variáveis da folha, grade de rubricas e resposta no portal')
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
    # a janela do aviso fica sempre aberta no teste (o dia de hoje não decide): avisa desde o dia 1, limite no dia 28
    async def regras(route):
        resp = await route.fetch(); j = await resp.json()
        j['config']['variaveisFolha'].update({'avisarAPartirDoDia': 1, 'diaLimite': 28})
        await route.fulfill(response=resp, json=j)
    await ctx.route('**/rules/regras.json', regras)
    # no simulador a planilha (SheetJS) vem da CDN: no teste, a cópia empacotada na extensão (nada sai do computador)
    xlsx = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib', 'xlsx', 'xlsx.full.min.js')
    async def sheetjs(route): await route.fulfill(path=xlsx, content_type='text/javascript')
    await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/xlsx/**', sheetjs)
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    def painel(): return next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto_empresa():   # três empresas no acesso: confirma a que já vem marcada (a do portal)
        while True:
            try:
                f = painel()
                if f and await f.locator('.ee-lista').count(): await f.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa_emp = asyncio.create_task(_auto_empresa())
    async def espera(cond, s=30):
        for _ in range(s * 2):
            try:
                if await cond(): return True
            except Exception: pass
            await pg.wait_for_timeout(500)
        return False
    async def celula(ev, emp):
        return await pg.evaluate("""([ev, emp]) => { const t = document.querySelector("table[aria-label='Rubricas']"); if (!t) return null;
          const hs = [...t.querySelectorAll('thead th')].map(h => h.innerText.trim()); const tr = [...t.querySelectorAll('tbody tr')].find(r => r.cells[0].innerText.trim() === emp);
          return tr ? (tr.cells[hs.indexOf(ev)]?.querySelector('input')?.value ?? null) : null; }""", [ev, emp])
    def celula_e(ev, emp, v):
        async def f(): return await celula(ev, emp) == v
        return f
    async def lancar():
        # o painel pode redesenhar o cartão enquanto termina um preenchimento: clica de novo se o clique não pegou
        for _ in range(4):
            await pn.click('#grade-lancar')
            if await espera(lambda: pn.evaluate("/Lançando|lançado|Não consegui/.test(document.querySelector('#grade-rub')?.innerText || '')"), 4): return
    hoje = datetime.date.today()
    m, a = (hoje.month - 1, hoje.year) if hoje.day <= 28 else (hoje.month, hoje.year)
    if m == 0: m, a = 12, a - 1
    comp = f'{m:02d}/{a}'
    pn = painel()
    # 38: o Hoje lembra das variáveis da folha do mês
    ok = await espera(lambda: pn.evaluate("(c) => (document.querySelector('#eq-folha')?.innerText || '').includes('Variáveis da folha de ' + c)", comp), 25)
    check(ok, f'Hoje: "Variáveis da folha de {comp}" ainda não enviadas')
    await pn.click('#eq-folha [data-folha="nada"]')
    ok = await espera(lambda: pn.evaluate("!document.querySelector('#eq-folha')"), 6)
    guardado = await pg.evaluate("(JSON.parse(localStorage.getItem('ct-sim-storage') || '{}').folhaNada || []).join('|')")
    check(ok and comp in guardado, '"Nada a lançar este mês" esconde o aviso daquele mês (guardado neste computador)')
    await pg.evaluate("(() => { const s = JSON.parse(localStorage.getItem('ct-sim-storage') || '{}'); s.folhaNada = []; localStorage.setItem('ct-sim-storage', JSON.stringify(s)); })()")
    await pg.reload(); await pg.wait_for_timeout(3500); pn = painel()
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('#eq-folha')"), 25)
    check(ok, 'sem a dispensa, o aviso volta')
    # "Usar o lançamento do mês passado": tipo e linhas do último lançamento no portal (lido na hora), com a competência deste mês
    await pn.click('#eq-folha [data-folha="passado"]')
    ok = await espera(lambda: pg.evaluate("(c) => window.__ctPlatform.path().endsWith('/payroll-entries/add') && document.querySelector('[formcontrolname=basisDate]')?.value === c", comp), 30)
    check(ok and await pg.evaluate("document.querySelector('#radioBasic-1').checked"), f'"Usar o lançamento do mês passado": abre o lançamento MENSAL com a competência deste mês ({comp})')
    check(await pn.locator('#modal #mh').count() == 0, 'não abre o resumo de envio sozinho (faltam as variáveis)')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#grade-rub')?.innerText || '').includes('3 valor')"), 15)
    check(ok, 'as linhas do mês passado ficam prontas para a grade')
    # 45: lançar na grade (a calibrar no Onvio real) — o mês passado nos eventos da empresa
    await lancar()
    ok = await espera(celula_e('0020 - COMISSÕES', 'RONALDO DE SOUZA', '420,00'), 25)
    ok = ok and await celula('0001 - HORAS EXTRAS 50%', 'JOAO DA SILVA') == '08:00' and await celula('0010 - FALTAS', 'RONALDO DE SOUZA') == '1'
    check(ok, 'grade: as linhas vão para as células dos eventos da empresa' + ('' if ok else f" ({(await pn.locator('#grade-rub').inner_text())!r}, {await celula('0020 - COMISSÕES', 'RONALDO DE SOUZA')!r})"))
    await pn.click('#btn-undo')
    ok = await espera(celula_e('0020 - COMISSÕES', 'RONALDO DE SOUZA', ''), 15)
    check(ok and await celula('0001 - HORAS EXTRAS 50%', 'JOAO DA SILVA') == '', 'Desfazer volta as células da grade')
    # planilha arrastada no pedido: nomes das rubricas casados pelos apelidos das regras ("HE 50" → 0001 - HORAS EXTRAS 50%)
    csv = 'Empregado;Rubrica;Valor\nJOAO DA SILVA;HE 50;10:30\nJORGE OLIVEIRA ALVES;Faltas (dias);2\nRONALDO DE SOUZA;Comissão;350,00\nRONALDO DE SOUZA;Bônus de Natal;100\n'
    await pg.evaluate("(t) => window.__ctSim.hooks().sendFiles([new File([t], 'variaveis-mes.csv', { type: 'text/csv' })])", csv)
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#grade-rub')?.innerText || '').includes('4 valor')"), 30)
    check(ok, 'planilha lida: 4 valores para a grade')
    await lancar()
    async def planilha_na_grade():
        return await celula('0001 - HORAS EXTRAS 50%', 'JOAO DA SILVA') == '10:30' and await celula('0010 - FALTAS', 'JORGE OLIVEIRA ALVES') == '2' and await celula('0020 - COMISSÕES', 'RONALDO DE SOUZA') == '350,00'
    ok = await espera(planilha_na_grade, 25)
    check(ok, 'planilha → grade: "HE 50", "Faltas (dias)" e "Comissão" nos eventos da empresa' + ('' if ok else f" ({(await pn.locator('#grade-rub').inner_text())!r}, HE {await celula('0001 - HORAS EXTRAS 50%', 'JOAO DA SILVA')!r})"))
    # 2.20: planilha de rubricas dentro da plataforma — carregar da grade do portal, digitar e lançar célula a célula
    await pn.click('#plan-carregar') if await pn.locator('#plan-carregar').count() else None
    ok = await espera(lambda: pn.evaluate("document.querySelectorAll('.plan-tabela tbody tr').length === 3 && document.querySelectorAll('.plan-tabela thead th').length === 7"), 20)
    resto = '' if ok else await pn.evaluate("[!!document.querySelector('#planilha-rub'), !!document.querySelector('#grade-rub'), document.body.className, document.querySelector('#view')?.className, (document.querySelector('#planilha-rub')?.innerText || '').slice(0, 200)].join(' | ')")
    check(ok, 'planilha da plataforma: carrega os 3 funcionários e as 6 rubricas da grade do portal' + ('' if ok else f' ({resto!r})'))
    check(await pn.evaluate("document.querySelector('.plan-tabela input[data-i=\"0\"][data-j=\"0\"]').value") == '10:30', 'planilha da plataforma: traz o que já veio da planilha arrastada (HE 50 do JOAO)')
    await pn.fill('.plan-tabela input[data-i="0"][data-j="3"]', '7'); await pg.wait_for_timeout(500)
    ok = await espera(lambda: celula('0011 - ATRASOS', 'JOAO DA SILVA'), 15) and await celula('0011 - ATRASOS', 'JOAO DA SILVA') == '7'
    check(ok, 'planilha da plataforma: o valor digitado vai para a célula certa da grade do portal')
    await pn.focus('.plan-tabela input[data-i="1"][data-j="2"]'); await pg.keyboard.press('Enter')
    check(await pn.evaluate("document.activeElement?.dataset.i") == '2' and await pn.evaluate("document.activeElement?.dataset.j") == '2', 'planilha da plataforma: Enter desce para o funcionário de baixo na mesma rubrica')
    await pn.fill('#plan-q', 'ronaldo')
    check(await pn.evaluate("[...document.querySelectorAll('.plan-tabela tbody tr')].filter(t => !t.hidden).length") == 1, 'planilha da plataforma: a busca esconde os outros funcionários')
    await pn.fill('#plan-q', '')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#grade-rub')?.innerText || '').includes('Bônus de Natal')"), 5)
    check(ok, 'rubrica sem evento na empresa fica para o cliente (com aviso)')
    # envio: só pelo botão do portal, depois do resumo; o aviso do Hoje some com o lançamento da competência no portal
    await pn.click('#btn-send'); await pg.wait_for_timeout(1500)
    if await pn.locator('#m-send').count(): await pn.click('#m-send')
    ok = await espera(lambda: pg.evaluate("window.__ctPlatform.path().endsWith('/payroll-entries')"), 15)
    check(ok, 'Lançamento de Rubricas enviado pelo botão do portal')
    await pn.click('#rail [data-mod="inicio"]')
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('.hj-hero[data-pronto]') && !document.querySelector('#eq-folha')"), 30)
    check(ok, f'o aviso some quando o portal já tem o lançamento de {comp}')
    # 46: "Responder no portal" procura o nº na lista e abre a solicitação certa
    async def detalhe(numero):
        await pn.click('#rail [data-mod="pendencias"]'); await pg.wait_for_timeout(800)
        await pn.click('[data-vis-sol="tabela"]'); await pn.fill('#sol-q', numero); await pg.wait_for_timeout(500)
        await pn.click('#sol-grupos [data-card]'); await pg.wait_for_timeout(800)
    await detalhe('1041')
    await pn.click('#modal .dlg-actions .btn-primary')
    async def no_detalhe():
        return await pg.evaluate("window.__ctPlatform.path().endsWith('/vacation-notice/1041') && !!document.querySelector('[data-resposta] textarea')") and await pg.evaluate("window.__ctSim.hooks().modoAtual()") == 'fechado'
    ok = await espera(no_detalhe, 20)
    check(ok, '"Responder no portal": procura o nº na lista e abre a solicitação certa, com só a bolinha da extensão' + ('' if ok else f" ({await pg.evaluate('window.__ctPlatform.path()')})"))
    await pg.evaluate("window.__ctSim.hooks().openPanel()")
    await espera(lambda: pn.evaluate("document.body.classList.contains('plat')"), 10)
    # arquivo solto (arrastado na plataforma, sem pedido) e "Preparar resposta": mensagem das regras e o arquivo na resposta
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions')"); await pg.wait_for_timeout(1200)
    await pg.evaluate("() => window.__ctSim.hooks().sendFiles([new File(['Arquivo de exemplo do simulador.'], 'dados-pedidos.txt', { type: 'text/plain' })])")
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('#sugestao .card')"), 15)
    await detalhe('1041')
    await pn.click('#modal .dt-responder'); await pg.wait_for_timeout(700)
    dlg = await pn.locator('#modal').inner_text()
    ok = ok and 'Envio do que foi pedido' in dlg and 'dados-pedidos.txt' in dlg and 'RESPONDER' in dlg
    check(ok, 'Preparar resposta: mensagens das regras e o arquivo solto já marcado' + ('' if ok else f' ({dlg[:300]!r})'))
    check(await pn.locator('#modal textarea').count() == 0, 'Preparar resposta: sem texto livre (a mensagem vem das regras)')
    await pn.click('#modal .rp-ir')
    ok = await espera(lambda: pg.evaluate("(document.querySelector('[data-resposta] textarea')?.value || '').includes('Segue em anexo') && [...document.querySelectorAll('[data-resposta] .p-chip')].some(c => c.textContent.includes('dados-pedidos.txt'))"), 25)
    check(ok, 'a resposta fica preparada no portal: mensagem das regras e o arquivo anexado')
    st = await pg.evaluate("JSON.parse(localStorage.getItem('ct-sim-portal')).items['vacation-notice'].find(x => x.id === 1041).status")
    check(st == 'Aguardando o cliente' and await pg.evaluate("window.__ctPlatform.path().endsWith('/vacation-notice/1041')"), f'o clique em RESPONDER fica com o cliente (situação: {st})')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:3]) if erros else ''))
    tarefa_emp.cancel()
    await ctx.close()


async def teste_vivo(b):
    """2.12: escrita ao vivo no formulário próprio e resposta em texto livre na aba Conversa (portal por baixo)."""
    print('\n[2.12] escrita ao vivo e resposta ao escritório')
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next(f for f in pg.frames if 'panel/panel.html' in f.url)
    async def _auto_empresa():   # três empresas no acesso: confirma a que já vem marcada
        while True:
            try:
                if await pn.locator('.ee-lista').count(): await pn.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa_emp = asyncio.create_task(_auto_empresa())
    async def espera(cond, s=30):
        for _ in range(s * 2):
            try:
                if await cond(): return True
            except Exception: pass
            await pg.wait_for_timeout(500)
        return False
    portal = lambda: pg.evaluate("""() => Object.fromEntries([...document.querySelectorAll('main [formcontrolname]:not([type=radio])')].map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value]))""")
    caixa = lambda: pg.evaluate("document.querySelector('[data-resposta] textarea')?.value ?? null")
    # --- fase 1: o texto digitado chega ao portal sem sair do campo ---
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pn.click('.pd-escolha .intent[data-tipo="geral"]')
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('#f-assunto')"), 25)
    check(ok, 'Solicitação Geral: o formulário próprio abre')
    if ok:
        await pg.wait_for_timeout(2000)   # o formulário termina de se montar (o preenchimento inicial redesenha uma vez)
        await pn.click('#f-assunto')
        await pn.type('#f-assunto', 'Segunda via da guia', delay=20)
        ok = await espera(lambda: _igual(portal, 'subject', 'Segunda via da guia'), 8)
        v = (await portal()).get('subject')
        foco = await pn.evaluate("document.activeElement && document.activeElement.id")
        check(v == 'Segunda via da guia', f'o texto vai ao portal enquanto escreve, sem sair do campo ({v!r})')
        check(foco == 'f-assunto', f'o foco continua no campo (foco: {foco})')
        await pn.type('#f-assunto', ' do FGTS', delay=20)
        await pg.wait_for_timeout(1800)
        v = (await portal()).get('subject'); mine = await pn.input_value('#f-assunto')
        check(mine == 'Segunda via da guia do FGTS' and v == mine, f'continuar digitando não perde nada ({mine!r} / {v!r})')
    await pg.evaluate("window.__ctSim.go('/clientcenter/pt/actions/service-request/general-requests')"); await pg.wait_for_timeout(1500)
    # --- fase 2: resposta em texto livre na aba Conversa ---
    async def detalhe(numero):
        await pn.click('#rail [data-mod="pendencias"]'); await pg.wait_for_timeout(800)
        await pn.click('[data-vis-sol="tabela"]'); await pn.fill('#sol-q', numero); await pg.wait_for_timeout(500)
        await pn.click('#sol-grupos [data-card]'); await pg.wait_for_timeout(800)
    await detalhe('1041')
    ok = await pn.locator('#dt-resp:visible #rl-texto').count() == 1
    check(ok, 'solicitação que aguarda o cliente: a aba Conversa tem a caixa "Responder ao escritório"')
    await pn.click('#rl-texto')
    await pn.type('#rl-texto', 'Segue a informação pedida.', delay=15)
    ok = await espera(lambda: _igual(caixa, None, 'Segue a informação pedida.'), 15)
    check(ok, f'o texto aparece na caixa de resposta do portal por baixo ({await caixa()!r})')
    check(await pn.evaluate("document.body.classList.contains('plat')") and '/vacation-notice/1041' in await pg.evaluate("window.__ctPlatform.path()"),
          'a plataforma continua na frente enquanto o portal abre a solicitação por baixo')
    st = await pg.evaluate("window.__ctSim.item('vacation-notice', 1041).status")
    check(st == 'Aguardando o cliente', f'escrever ao vivo não envia nada (situação: {st})')
    # dado de saúde (CID) não vai ao portal e bloqueia o envio
    await pn.fill('#rl-texto', 'Segue o atestado, CID M54.5'); await pn.dispatch_event('#rl-texto', 'input'); await pg.wait_for_timeout(1500)
    check(await pn.locator('#rl-bloq:visible').count() == 1 and await pn.locator('#rl-enviar').is_disabled(), 'CID na mensagem: aviso educativo e o envio fica bloqueado')
    check('M54.5' not in (await caixa() or ''), 'o texto com CID não é escrito no portal')
    await pn.fill('#rl-texto', 'Segue o atestado.'); await pn.dispatch_event('#rl-texto', 'input')
    ok = await espera(lambda: _igual(caixa, None, 'Segue o atestado.'), 10)
    check(ok and await pn.locator('#rl-enviar').is_enabled(), 'tirando o CID, volta a escrever no portal e libera o envio')
    # fechou sem enviar: tira do portal o que o Assistente pôs
    await pn.click('#modal .dlg-x')
    ok = await espera(lambda: _igual(caixa, None, ''), 10)
    check(ok, f'fechar sem enviar limpa a caixa do portal ({await caixa()!r})')
    # texto escrito direto no portal nunca é sobrescrito
    await detalhe('1041')
    await pn.click('#rl-texto'); await pn.type('#rl-texto', 'Primeira parte', delay=15)
    await espera(lambda: _igual(caixa, None, 'Primeira parte'), 10)
    await pg.evaluate("""() => { const t = document.querySelector('[data-resposta] textarea'); t.value = 'anotei aqui no portal'; t.dispatchEvent(new Event('input', { bubbles: true })); }""")
    await pn.type('#rl-texto', ' e mais um pouco', delay=15)
    await pg.wait_for_timeout(2200)
    check(await caixa() == 'anotei aqui no portal' and 'não mexi' in await pn.locator('#rl-st').inner_text(), f'o que o cliente escreveu direto no portal não é sobrescrito (e ele é avisado): {await caixa()!r}')
    await pn.click('#modal .dlg-x'); await pg.wait_for_timeout(600)
    check(await caixa() == 'anotei aqui no portal', 'ao fechar, o texto que o cliente pôs no portal também fica como está')
    await pg.evaluate("""() => { const t = document.querySelector('[data-resposta] textarea'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); }""")
    # enviar: resumo primeiro, clique em RESPONDER só depois de confirmar
    await detalhe('1041')
    await pn.click('#rl-texto'); await pn.type('#rl-texto', 'Olá! Segue a informação que vocês pediram.', delay=10)
    await espera(lambda: _igual(caixa, None, 'Olá! Segue a informação que vocês pediram.'), 10)
    await pn.click('#rl-enviar'); await pg.wait_for_timeout(500)
    st = await pg.evaluate("window.__ctSim.item('vacation-notice', 1041).status")
    check(await pn.locator('#rl-resumo:visible').count() == 1 and 'Segue a informação' in await pn.locator('#rl-resumo-t').inner_text() and st == 'Aguardando o cliente',
          f'"Enviar resposta" só abre o resumo: nada foi enviado ainda (situação: {st})')
    await pn.click('#rl-voltar'); await pg.wait_for_timeout(300)
    check(await pn.locator('#rl-resumo:visible').count() == 0, '"Voltar" fecha o resumo sem enviar')
    await pn.click('#rl-enviar'); await pn.click('#rl-confirmar')
    ok = await espera(lambda: pg.evaluate("window.__ctSim.item('vacation-notice', 1041).status === 'Em andamento'"), 20)
    tr = await pg.evaluate("window.__ctSim.item('vacation-notice', 1041).tramite")
    check(ok and 'Segue a informação que vocês pediram' in tr, f'"Confirmar e enviar" clica em RESPONDER no portal e a resposta chega ({tr!r})')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#rl-texto')?.value || '') === ''"), 10)
    check(ok, 'depois de enviar, a caixa da plataforma esvazia')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:3]) if erros else ''))
    tarefa_emp.cancel()
    await ctx.close()


async def _igual(f, k, esperado):
    v = await f()
    if k is not None: v = (v or {}).get(k)
    return v == esperado


async def teste_lote5(b):
    """Lote 5: CPF acha o funcionário, lote por pessoa, regra dos 60 dias, planilha larga, Word/HEIC e recorte da foto."""
    import datetime, zipfile, io
    print('\n[lote 5] CPF, lote por pessoa, 60 dias, planilha, Word/HEIC e recorte da foto')
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    async def regras(route):   # limite alto de propósito: todo valor lido de foto vira "confira" (o recorte aparece sempre)
        resp = await route.fetch(); j = await resp.json()
        j['config']['recorteLeitura']['confiancaPalavraMinima'] = 101
        await route.fulfill(response=resp, json=j)
    await ctx.route('**/rules/regras.json', regras)
    async def sheetjs(route): await route.fulfill(path=os.path.join(base, 'lib', 'xlsx', 'xlsx.full.min.js'), content_type='text/javascript')
    await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/xlsx/**', sheetjs)
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    def painel(): return next((f for f in pg.frames if 'panel/panel.html' in f.url), None)
    async def _auto_empresa():
        while True:
            try:
                f = painel()
                if f and await f.locator('.ee-lista').count(): await f.click('.dlg [data-acao="2"]', timeout=800)
            except Exception: pass
            await asyncio.sleep(0.15)
    tarefa_emp = asyncio.create_task(_auto_empresa())
    portal = lambda: pg.evaluate("""() => Object.fromEntries([...document.querySelectorAll('main [formcontrolname]:not([type=radio])')].map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value]))""")
    async def espera(cond, s=30):
        for _ in range(s * 2):
            try:
                if await cond(): return True
            except Exception: pass
            await pg.wait_for_timeout(500)
        return False
    def tem(**kv):
        async def f():
            v = await portal(); return all(v.get(k) == x for k, x in kv.items())
        return f
    async def mandar(nome, conteudo, tipo='text/plain'):
        await pg.evaluate("([n, t, c]) => window.__ctSim.hooks().sendFiles([new File([c], n, { type: t })])", [nome, tipo, conteudo])
    async def cancelar():
        # o portal fica coberto pela plataforma: o clique vai direto no botão (como o Assistente faria)
        await pg.evaluate("[...document.querySelectorAll('main button')].find(b => /CANCELAR/.test(b.innerText))?.click()")
        await pg.wait_for_timeout(1200)
    pn = painel()
    hoje = datetime.date.today(); f = lambda d: d.strftime('%d/%m/%Y')

    # 23: o CPF do documento acha o funcionário (o nome do documento não bate com a lista)
    cpf = await pg.evaluate("window.__ctPlatform.employees().then(l => l.find(e => e.name === 'JOAO DA SILVA').cpf)")
    cpf_f = f'{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}'
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    txt = f'ATESTADO MÉDICO\nAtesto que o paciente JOAO DE SOUZA SILVA, CPF {cpf_f}, necessita de 2 (dois) dias de repouso a partir de {f(hoje - datetime.timedelta(days=3))}.\nDra. Fictícia de Teste\nCRM-ES 1234'
    await mandar('atestado-cpf.txt', txt); await pg.wait_for_timeout(1500)
    if await pn.locator('#sug-go').count(): await pn.click('#sug-go')
    ok = await espera(tem(selectedEmployee='JOAO DA SILVA'), 40)
    check(ok, f"CPF do documento acha o funcionário na lista ({(await portal()).get('selectedEmployee')})")
    await cancelar()

    # 28: dois pedidos de demissão de pessoas diferentes viram dois pedidos
    p1 = 'PEDIDO DE DEMISSÃO\nEu, JORGE OLIVEIRA ALVES, venho por meio desta formalizar meu pedido de demissão, a partir de 16/10/2026.'
    p2 = 'PEDIDO DE DEMISSÃO\nEu, LUCAS MOREIRA, venho por meio desta formalizar meu pedido de demissão, a partir de 17/10/2026.'
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pg.evaluate("([a, b]) => window.__ctSim.hooks().sendFiles([new File([a], 'demissao-jorge.txt', { type: 'text/plain' }), new File([b], 'demissao-lucas.txt', { type: 'text/plain' })])", [p1, p2])
    ok = await espera(lambda: pn.evaluate("document.querySelectorAll('#lote ol li').length === 2"), 40)
    check(ok, 'lote: dois pedidos de demissão de pessoas diferentes viram dois pedidos')
    lote_txt = await pn.locator('#lote').inner_text() if await pn.locator('#lote').count() else ''
    check('JORGE OLIVEIRA ALVES' in lote_txt and 'LUCAS MOREIRA' in lote_txt and '2 pessoas' in lote_txt, 'lote: cada pedido mostra a pessoa e o aviso "documentos de 2 pessoas"')
    if await pn.locator('#lote-parar').count(): await pn.click('#lote-parar')
    await cancelar()

    # 36: regra dos 60 dias — atestado anterior do histórico + este: "É a mesma doença?"
    empresa = await pn.evaluate("() => document.querySelector('#empresa')?.innerText?.trim() || ''")
    ant = {'chave': 'x', 'quando': int(datetime.datetime.now().timestamp() * 1000) - 86400000, 'empresa': empresa or 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA', 'tipo': 'afastamento', 'status': 'enviado', 'resumo': 'Atestado de teste', 'anexos': [],
           'valores': {'empregado': 'CAMILA ROCHA', 'dataAfastamento': f(hoje - datetime.timedelta(days=30)), 'dias': '10'}}
    await pn.evaluate("h => chrome.storage.local.set({ historico: [h] })", ant)
    await pg.reload(); await pg.wait_for_timeout(3500); pn = painel()
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    at = f'ATESTADO MÉDICO\nAtesto que CAMILA ROCHA necessita de 8 (oito) dias de repouso a partir de {f(hoje - datetime.timedelta(days=5))}.\nDra. Fictícia de Teste\nCRM-ES 1234'
    await mandar('atestado-60.txt', at); await pg.wait_for_timeout(1500)
    if await pn.locator('#sug-go').count(): await pn.click('#sug-go')
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('#r60') && document.querySelector('#r60').innerText.includes('mesma doença')"), 40)
    check(ok, 'regra dos 60 dias: pergunta "É a mesma doença?" com a conta à vista (10 + 8 = 18 dias)')
    if ok:
        conta = await pn.locator('#r60').inner_text()
        check('18 dias' in conta and 'CID' not in conta, 'a pergunta mostra a conta e nunca o CID')
        await pn.click('#r60-sim')
        ok = await espera(lambda: pg.evaluate("[...document.querySelectorAll('main bento-combobox')].some(e => e.querySelector('input').value === 'Novo afast. mesma doença')"), 25)
        check(ok, 'respondendo "Sim", o tipo "Novo afast. mesma doença" vai ao portal')
        ok = await espera(lambda: pg.evaluate("[...document.querySelectorAll('main textarea')].some(t => t.value.includes('Soma 18 dias'))"), 20)
        check(ok, 'a descrição explica "soma 18 dias com o atestado de dd/mm"')
    await cancelar()

    # 14: planilha larga, com o título antes do cabeçalho, competência do título e nomes conferidos
    csv = 'Variáveis de outubro/2026;;;\n;;;\nNome;HE 50%;Faltas;Comissão\nJOAO DA SILVA;10:30;0;\nJORGE OLIVEIRA ALVES;02:00;1;R$ 350,00\nFULANO INEXISTENTE;00:30;;\n'
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await mandar('variaveis.csv', csv, 'text/csv')
    if await espera(lambda: pn.evaluate("!!document.querySelector('#sug-go')"), 30): await pn.click('#sug-go')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#grade-rub')?.innerText || '').includes('5 valor')"), 40)
    check(ok, 'planilha larga (uma rubrica por coluna, célula zerada fora): 5 valores')
    ok = await espera(tem(basisDate='10/2026'), 20)
    check(ok, 'competência tirada do título da planilha')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#checks')?.innerText || '').includes('FULANO INEXISTENTE')"), 20)
    check(ok, 'nome que não está na lista de funcionários é avisado')
    ok = await espera(lambda: pg.evaluate("[...document.querySelectorAll('main textarea')].some(t => t.value.includes('Totais por rubrica') && t.value.includes('13:00'))"), 20)
    check(ok, 'totais por rubrica na descrição (HE 50%: 13:00)')
    check(await pn.locator('#baixar-modelo').count() == 1, '"Baixar planilha modelo" na tela das rubricas')
    await cancelar()

    # 19: Word é lido; HEIC e TIFF explicam o que fazer; a lista de formatos do seletor
    acc = await pn.evaluate("document.querySelector('#file-input').accept")
    check('.docx' in acc and '.odt' in acc and '.ods' in acc and '.tif' not in acc, 'seletor aceita Word/ODT/ODS e não oferece TIFF')
    xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>PEDIDO DE DEMISSÃO</w:t></w:r></w:p><w:p><w:r><w:t>Eu, JORGE OLIVEIRA ALVES, venho por meio desta formalizar meu pedido de demissão, a partir de 16/10/2026.</w:t></w:r></w:p></w:body></w:document>'
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')
        z.writestr('word/document.xml', xml)
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pg.evaluate("(a) => window.__ctSim.hooks().sendFiles([new File([new Uint8Array(a)], 'carta.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })])", list(bio.getvalue()))
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#sugestao')?.innerText || '').includes('Pedido de demissão')"), 30)
    check(ok, 'arquivo do Word lido: reconhece o pedido de demissão')
    await pn.evaluate("document.querySelector('#sug-x')?.click()")
    await mandar('foto.heic', 'x', 'image/heic')
    ok = await espera(lambda: pn.evaluate("(document.querySelector('#sugestao')?.innerText || '').includes('Ctrl+V')"), 20)
    t = await pn.locator('#sugestao').inner_text() if await pn.locator('#sugestao').count() else ''
    check(ok and 'Não consegui ler' in t, 'HEIC: diz que não leu e ensina o print com Ctrl+V')
    await pn.evaluate("document.querySelector('#sug-x')?.click()")

    # 29: um PDF com RG, comprovante e ASO marca os três itens do checklist do cadastro
    pag = ctx_pdf = await ctx.new_page()
    html = ('<html><body style="font-family:Arial;font-size:14px">'
            '<div style="page-break-after:always"><h2>CARTEIRA DE IDENTIDADE</h2><p>REGISTRO GERAL 1.234.567</p><p>NOME FULANA DE TESTE</p><p>FILIAÇÃO MAE DE TESTE</p><p>NATURALIDADE VITORIA/ES</p><p>DATA DE NASCIMENTO 05/12/1995</p></div>'
            '<div style="page-break-after:always"><h2>CONTA DE LUZ - FATURA DE ENERGIA</h2><p>DADOS DO CLIENTE</p><p>Nome: FULANA DE TESTE</p><p>RUA DAS FLORES, 10 - CENTRO</p><p>Vila Velha/ES CEP 29101-450</p><p>Vencimento 10/11/2026</p><p>Consumo 210 kWh</p></div>'
            '<div><h2>ATESTADO DE SAÚDE OCUPACIONAL</h2><p>Clínica Exemplo, Av. Central, 900 - CEP 29010-500</p><p>Tipo de exame: (X) Admissional ( ) Demissional</p><p>Parecer: (X) Apto ( ) Inapto</p><p>Data do exame: 10/10/2026</p></div></body></html>')
    await pag.set_content(html); pdf = await pag.pdf(format='A4'); await pag.close()
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pg.evaluate("(a) => window.__ctSim.hooks().sendFiles([new File([new Uint8Array(a)], 'documentos-juntos.pdf', { type: 'application/pdf' })])", list(pdf))
    if await espera(lambda: pn.evaluate("!!document.querySelector('#sug-go')"), 40): await pn.click('#sug-go')
    ok = await espera(lambda: pn.evaluate("document.querySelectorAll('#doc-checklist .dl-i.ok').length >= 3"), 40)
    check(ok, 'PDF com RG, comprovante e ASO: os três itens do checklist ficam marcados' + ('' if ok else f" ({await pn.evaluate('document.querySelector(`#doc-checklist`)?.innerText || null')!r})"))
    await cancelar()

    # 42: foto com dúvida — recorte ao lado do campo, Confirmar manda ao portal
    await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
    await pg.evaluate("""async () => { const b = await (await fetch('exemplos/atestado-foto.png')).blob(); window.__ctSim.hooks().sendFiles([new File([b], 'atestado-foto.png', { type: 'image/png' })]); }""")
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('#sug-go')"), 90)
    if ok: await pn.click('#sug-go')
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('.confira-box')"), 60)
    check(ok, 'foto: a caixa "Confira estas leituras" aparece')
    if ok:
        okimg = await espera(lambda: pn.evaluate("[...document.querySelectorAll('.confira-box img.recorte')].some(i => !i.hidden && i.src.startsWith('data:image/png') && i.naturalWidth > 10)"), 15)
        check(okimg, 'cada campo duvidoso mostra o recorte da foto')
        check(await pn.evaluate("!/CID|médico|CRM/i.test(document.querySelector('.confira-box').innerText)"), 'sem recorte nem texto de CID e médico')
        antes = await portal()
        check(not antes.get('leaveDate'), 'o valor duvidoso não vai ao portal sozinho')
        if await pn.locator('#conf-todas').count(): await pn.click('#conf-todas')
        else: await pn.click('[data-conf-k]')
        ok = await espera(lambda: pn.evaluate("!document.querySelector('.confira-box')"), 20)
        check(ok, 'Confirmar: o valor vai ao portal e sai da caixa')
    await cancelar()
    tarefa_emp.cancel()
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:3]) if erros else ''))
    await ctx.close()


async def teste_contraste(b):
    """Contraste (WCAG 4,5:1) nos dois temas, em todas as telas da plataforma. O medidor é o do Control Onvio
    (tests/contraste-lib.js) e roda dentro do iframe do painel. Falha se houver qualquer texto abaixo de 4,5:1."""
    print('\n[contraste] 4,5:1 nos temas claro e escuro')
    lib = open(os.path.join(os.path.dirname(__file__), 'contraste-lib.js'), encoding='utf-8').read()
    medir = "(src) => { const m = { exports: null }; new Function('module', src)(m); return m.exports(4.5); }"
    todas = {}
    for tema in ('light', 'dark'):
        ctx = await b.new_context(viewport={'width': 1366, 'height': 768})
        pg = await ctx.new_page()
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
        pn = next(f for f in pg.frames if 'panel/panel.html' in f.url)
        await pn.evaluate(f"document.documentElement.setAttribute('data-theme', '{tema}')")
        async def espera(cond, s=15):
            for _ in range(s * 4):
                try:
                    if await cond(): return True
                except Exception: pass
                await pg.wait_for_timeout(250)
            return False
        async def fechar():
            await pn.evaluate("document.querySelector('#modal .dlg-x')?.click()"); await pg.wait_for_timeout(300)
        async def medir_tela(nome):
            await pg.wait_for_timeout(900)
            r = await pn.evaluate(medir, lib)
            todas[f'{nome}-{tema}'] = r
            check(not r, f'contraste {nome} ({tema}): {len(r)} texto(s) abaixo de 4,5:1' + ('' if not r else ' — ' + '; '.join(f"{x['r']} {x['fg']}/{x['bg']} «{x['texto']}» {x['no']}" for x in r[:6])))
        await espera(lambda: pn.evaluate("!!document.querySelector('.hj-hero[data-pronto]')"))
        await medir_tela('hoje')
        for mod, nome in (('pendencias', 'solicitacoes'), ('funcionarios', 'funcionarios'), ('documentos', 'documentos'), ('ferramentas', 'calcular'), ('historico', 'agenda')):
            await pn.click(f'#rail [data-mod="{mod}"]'); await pg.wait_for_timeout(500)
            await medir_tela(nome)
        # variações: solicitações em lista e tabela, documentos do escritório, ficha do funcionário, busca (Ctrl+K), configurações
        await pn.click('#rail [data-mod="pendencias"]'); await pg.wait_for_timeout(500)
        for vis in ('lista', 'tabela'):
            await pn.click(f'[data-vis-sol="{vis}"]'); await medir_tela(f'solicitacoes-{vis}')
        await pn.click('[data-vis-sol="cartoes"]')
        await pn.click('#rail [data-mod="documentos"]'); await pg.wait_for_timeout(500)
        await pn.click('[data-doc-aba="escritorio"]'); await medir_tela('documentos-escritorio')
        await pn.click('#rail [data-mod="funcionarios"]'); await pg.wait_for_timeout(500)
        if await pn.locator('[data-ficha]').count():
            await pn.locator('[data-ficha]').first.click(); await medir_tela('ficha-funcionario'); await fechar()
        await pn.click('#plat-busca'); await pg.wait_for_timeout(400)
        await medir_tela('busca'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await pn.click('#rail [data-acao="config"]'); await pg.wait_for_timeout(500)
        await medir_tela('configuracoes')
        # detalhe de uma solicitação, em cada aba
        await pn.click('#rail [data-mod="pendencias"]'); await pg.wait_for_timeout(600)
        await pn.locator('#sol-grupos .hj-card').first.click()
        await espera(lambda: pn.evaluate("!!document.querySelector('#dt-body .tr-item')"))
        await medir_tela('detalhe-conversa')
        for aba in ('dados', 'observar'):
            await pn.click(f'#modal [data-dt="{aba}"]'); await medir_tela(f'detalhe-{aba}')
        await fechar()
        # Novo pedido: a escolha do tipo e o formulário
        await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
        await medir_tela('novo-pedido')
        await pn.locator('.pd-escolha .intent[data-tipo="afastamento"]').click()
        if await espera(lambda: pn.evaluate("!!document.querySelector('.ee-lista')"), 4):
            await medir_tela('escolha-empresa')
            await pn.click('.dlg [data-acao="2"]')
        await espera(lambda: pn.evaluate("!!document.querySelector('.v-preencher #pd-voltar')"), 8)
        await medir_tela('formulario')
        # planilha de rubricas (2.20/2.21): outro tipo de tela, com a grade e o bloco Comando
        await pn.click('#rail [data-mod="preencher"]'); await pg.wait_for_timeout(500)
        await pn.locator('.pd-escolha .intent[data-tipo="rubricas"]').click()
        if await espera(lambda: pn.evaluate("!!document.querySelector('.ee-lista')"), 4): await pn.click('.dlg [data-acao="2"]')
        if await espera(lambda: pn.evaluate("!!document.querySelector('#plan-cmd-txt')"), 12):
            await medir_tela('planilha-rubricas')
        else:
            check(False, f'contraste: a planilha de rubricas não abriu ({tema})')
        await ctx.close()
    if os.environ.get('CT_JSON'): json.dump(todas, open(os.environ['CT_JSON'], 'w'), ensure_ascii=False, indent=1)


async def teste_sino(b):
    """Sino de novidades e resumo do trilho (frente A): primeira leitura sem novidade, foto mínima no navegador,
    contador, balão com até 8 linhas, teclado, marcar como lidas e contraste do balão nos dois temas."""
    print('\n[sino] novidades e resumo do trilho')
    lib = open(os.path.join(os.path.dirname(__file__), 'contraste-lib.js'), encoding='utf-8').read()
    medir = "(src) => { const m = { exports: null }; new Function('module', src)(m); return m.exports(4.5); }"
    fotos = os.environ.get('CT_FOTOS', '/tmp')
    ctx = await b.new_context(viewport={'width': 1366, 'height': 650})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3000)
    pn = lambda: next(f for f in pg.frames if 'panel/panel.html' in f.url)
    async def espera(cond, s=20):
        for _ in range(s * 4):
            try:
                if await cond(): return True
            except Exception: pass
            await pg.wait_for_timeout(250)
        return False
    foto = lambda: pn().evaluate("localStorage.getItem('ct.sinoVisto')")
    ok = await espera(lambda: foto())
    check(ok and await pn().locator('#sino-b').count() == 1, 'sino: aparece no cabeçalho e guarda o ponto de partida na primeira leitura')
    check(await pn().locator('#sino-n').is_hidden(), 'sino: primeira abertura da plataforma não acende nada')
    bruto = await foto() or '{}'
    f = json.loads(bruto)
    check(f.get('v') == 1 and all(len(v) == 3 for v in f['itens'].values()) and all(k.count(':') == 1 for k in f['itens']), 'sino: a foto guarda só tipo:id, situação, data e estado')
    check('EMPRESA' not in bruto.upper(), 'sino: a foto não leva empresa nem assunto')
    # trilho: resumo de uma linha na etiqueta
    await espera(lambda: pn().evaluate("!!document.querySelector('[data-resumo=pendencias]:not([hidden])')"), 10)
    await pn().hover('.rail-i[data-mod="pendencias"]'); await pg.wait_for_timeout(300)
    res = await pn().locator('[data-resumo="pendencias"]').inner_text()
    check('esper' in res and await pn().locator('[data-resumo="pendencias"]').is_visible(), f'trilho: Solicitações mostra o resumo ao passar o mouse ({res})')
    await pg.screenshot(path=fotos + '/trilho-resumo.png')
    # simula que o escritório mexeu em tudo desde a última vez: foto antiga com outra situação e estado "em andamento"
    for k in f['itens']: f['itens'][k] = ['Situação antiga', 1, 'andamento']
    await pn().evaluate("(v) => localStorage.setItem('ct.sinoVisto', v)", json.dumps(f))
    await pg.reload(); await pg.wait_for_timeout(3000)
    ok = await espera(lambda: pn().evaluate("!document.querySelector('#sino-n')?.hidden"), 25)
    total = int(await pn().locator('#sino-n').inner_text()) if ok else 0
    check(ok and total > 8, f'sino: contador vermelho com as novidades ({total})')
    for tema in ('light', 'dark'):
        await pn().evaluate(f"document.documentElement.setAttribute('data-theme', '{tema}')")
        await pn().click('#sino-b'); await pg.wait_for_timeout(300)
        check(await pn().get_attribute('#sino-b', 'aria-expanded') == 'true' and await pn().get_attribute('#sino-b', 'aria-haspopup') == 'dialog', f'sino ({tema}): abre o balão com aria-expanded e aria-haspopup')
        check(await pn().locator('.sino-li').count() == 8 and await pn().locator('.sino-mais').count() == 1, f'sino ({tema}): até 8 linhas e o aviso de que há mais')
        await pg.screenshot(path=fotos + f'/sino-{tema}.png')
        r = await pn().evaluate(medir, lib)
        check(not r, f'contraste do sino aberto ({tema}): {len(r)} texto(s) abaixo de 4,5:1' + ('' if not r else ' — ' + '; '.join(f"{x['r']} {x['fg']}/{x['bg']} «{x['texto']}» {x['no']}" for x in r[:5])))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        check(await pn().get_attribute('#sino-b', 'aria-expanded') == 'false' and await pn().evaluate("document.activeElement?.id") == 'sino-b', f'sino ({tema}): Esc fecha e devolve o foco ao botão')
    await pn().evaluate("document.documentElement.removeAttribute('data-theme')")
    # clicar numa linha abre o detalhe e a tira do contador
    await pn().click('#sino-b'); await pn().locator('.sino-li').first.click()
    ok = await espera(lambda: pn().evaluate("!!document.querySelector('#modal .dlg, #modal #dt-body')"), 10)
    n2 = int(await pn().locator('#sino-n').inner_text())
    check(ok and n2 == total - 1, f'sino: clicar numa novidade abre o detalhe e ela deixa de contar ({total} → {n2})')
    await pn().evaluate("document.querySelector('#modal .dlg-x')?.click()"); await pg.wait_for_timeout(300)
    # marcar como lidas: zera, mostra o estado vazio e continua zerado depois de recarregar
    await pn().click('#sino-b'); await pn().click('#sino-lidas'); await pg.wait_for_timeout(300)
    check(await pn().locator('#sino-n').is_hidden() and 'Nenhuma novidade' in await pn().locator('#sino-pop').inner_text(), 'sino: Marcar como lidas zera o contador e mostra "Nenhuma novidade"')
    await pg.wait_for_timeout(600)   # as transições (balão, toast, cartões) terminam antes de medir
    r = await pn().evaluate(medir, lib)
    check(not r, f'contraste do sino vazio: {len(r)} texto(s) abaixo de 4,5:1 {[(x["texto"][:28], x["r"], x["fg"], x["bg"]) for x in r[:4]]}')
    await pg.keyboard.press('Escape')
    await pg.reload(); await pg.wait_for_timeout(3500)
    await espera(lambda: pn().evaluate("!!document.querySelector('#sino-b')"), 10)
    check(await pn().locator('#sino-n').is_hidden(), 'sino: depois de lidas, recarregar não acende de novo')
    check(not erros, 'sino: sem erros na página' + (': ' + '; '.join(erros[:3]) if erros else ''))
async def teste_detalhe(b):
    """2.19: detalhe da solicitação — navegação ‹ ›, chips por tipo, conversa (tempo relativo, ver mais), aviso do pedido, foco que pisca, foco preso."""
    print('\n[2.19] detalhe da solicitação')
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next(f for f in pg.frames if 'panel/panel.html' in f.url)
    async def espera(cond, s=30):
        for _ in range(s * 2):
            try:
                if await cond(): return True
            except Exception: pass
            await pg.wait_for_timeout(500)
        return False
    ativo_na_janela = lambda: pn.evaluate("!!document.activeElement && !!document.activeElement.closest('#modal .sheet')")
    nav_txt = lambda: pn.evaluate("(document.querySelector('.dt-nav-n')?.innerText || '').replace(/\\s+/g, ' ')")
    aba_ativa = lambda: pn.evaluate("document.querySelector('#modal .dp-tab.active')?.dataset.dt")
    numero = lambda: pn.evaluate("(document.querySelector('#modal #dlg-t .mono')?.innerText || '')")
    await espera(lambda: pn.evaluate("!!document.querySelector('.hj-hero[data-pronto]')"), 15)
    await pn.click('#rail [data-mod="pendencias"]')
    ok = await espera(lambda: pn.evaluate("document.querySelectorAll('#sol-grupos [data-card]').length >= 4"), 20)
    total = await pn.locator('#sol-grupos [data-card]').count()
    check(ok, f'Solicitações: {total} cartões na tela')
    # --- 1. navegação pela lista que o cliente via ---
    await pn.locator('#sol-grupos [data-card]').first.click()
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('.dt-nav')"), 10)
    check(ok and (await nav_txt()) == f'1 de {total}', f'detalhe: navegação "1 de {total}" (a lista que estava na tela) — {await nav_txt()!r}')
    check(await pn.locator('[data-dt-nav="-1"]').is_disabled() and await pn.locator('[data-dt-nav="1"]').is_enabled(), 'detalhe: "anterior" desligado na primeira, "próxima" ligado')
    check(bool(await pn.locator('[data-dt-nav="1"]').get_attribute('aria-label')) and bool(await pn.locator('[data-dt-nav="-1"]').get_attribute('aria-label')), 'detalhe: botões ‹ › com aria-label')
    n1 = await numero()
    await pn.click('#modal [data-dt="dados"]'); await pg.wait_for_timeout(300)
    await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(500)
    check(await nav_txt() == f'2 de {total}' and await numero() != n1, f'seta → leva à próxima ({await nav_txt()!r})')
    check(await aba_ativa() == 'dados', 'a aba aberta (Dados) continua ao trocar de solicitação')
    await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(500)
    check(await nav_txt() == f'1 de {total}' and await numero() == n1, 'seta ← volta à anterior')
    await pn.click('[data-dt-nav="1"]'); await pg.wait_for_timeout(500)
    check(await nav_txt() == f'2 de {total}', 'botão › também avança')
    check(await pn.evaluate("document.activeElement?.dataset?.dtNav") == '1', 'o foco continua no botão usado')
    # pontas: vai até o fim com o teclado e a "próxima" desliga
    for _ in range(total + 2):
        await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(120)
    check(await nav_txt() == f'{total} de {total}' and await pn.locator('[data-dt-nav="1"]').is_disabled(), 'na última, "próxima" desligada (e as setas não passam do fim)')
    # --- 5. acessibilidade: foco preso, Esc fecha e devolve o foco ---
    dentro = True
    for k in range(40):
        await pg.keyboard.press('Tab')
        dentro = dentro and await ativo_na_janela()
    check(dentro, 'Tab: o foco fica preso na janela do detalhe (40 vezes)')
    await pg.keyboard.press('Shift+Tab')
    check(await ativo_na_janela(), 'Shift+Tab também fica na janela')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
    check(await pn.locator('#modal .sheet').count() == 0, 'Esc fecha o detalhe')
    # --- 3. voltando para a lista, o cartão da última solicitação vista pisca ---
    ok = await espera(lambda: pn.evaluate("document.querySelectorAll('#sol-grupos .foco-pisca').length === 1"), 5)
    check(ok, 'ao fechar o detalhe, o cartão da solicitação vista pisca na lista')
    ok = await espera(lambda: pn.evaluate("document.querySelectorAll('.foco-pisca').length === 0"), 6)
    check(ok, 'o contorno some sozinho em poucos segundos')
    # --- 2 e 4. chips, conversa e aviso (aviso de férias 1041: o escritório pede a data; texto longo; 2 dias entre trâmites) ---
    await pn.locator('#sol-grupos [data-card]', has_text='nº 1041').first.click()
    ok = await espera(lambda: pn.evaluate("document.querySelectorAll('#dt-body .tr-item').length >= 2"), 15)
    check(ok, 'detalhe do aviso de férias 1041: conversa carregada')
    await pg.wait_for_timeout(1200)
    chips = await pn.evaluate("[...document.querySelectorAll('#dt-dq .dq')].map(x => x.innerText.replace(/\\s+/g, ' ').trim())")
    ks = ' | '.join(chips)
    check(any(c.upper().startswith('INÍCIO DAS FÉRIAS') for c in chips) and any(c.upper().startswith('PAGAMENTO ATÉ') for c in chips) and any(c.upper().startswith('DIAS DE FÉRIAS') for c in chips) and any(c.upper().startswith('PRESCREVE EM') for c in chips),
          f'chips do aviso de férias: início, pagamento, dias e prescreve em ({ks})')
    check(len(chips) <= 4, f'no máximo 4 chips ({len(chips)})')
    qd = await pn.evaluate("document.querySelector('.tr-quando')?.innerText")
    tt = await pn.evaluate("document.querySelector('.tr-quando')?.title")
    check(bool(qd) and qd.startswith('há ') and ' às ' in (tt or '') and '/' in tt, f'conversa: tempo relativo ({qd!r}) com a data completa na dica ({tt!r})')
    check('2 dias depois' in await pn.locator('#dt-body').inner_text(), 'conversa: separador "2 dias depois" entre os trâmites')
    longo = pn.locator('#dt-body .tr-mais:visible')
    check(await longo.count() == 1 and (await longo.inner_text()) == 'Ver mais', 'conversa: texto longo recolhido com "Ver mais"')
    await longo.click(); await pg.wait_for_timeout(200)
    check(await longo.inner_text() == 'Ver menos' and await longo.get_attribute('aria-expanded') == 'true', 'conversa: "Ver menos" abre o texto todo (aria-expanded)')
    check(await pn.locator('#dt-body .tr-item.ultimo').count() == 1, 'conversa: a última mensagem tem o destaque (anel)')
    aviso = await pn.locator('#dt-aviso').inner_text()
    check('O escritório está pedindo' in aviso and 'ajuda o pedido a andar' in aviso, f'aviso acima da conversa: o que o escritório pede, em tom educativo ({aviso[:90]!r})')
    check(await pn.locator('#dt-aviso #dt-aviso-resp').is_visible() and bool(await pn.locator('#dt-aviso-resp').get_attribute('aria-label')), 'aviso tem o botão "Responder no portal"')
    # o aviso só aparece na aba Conversa
    await pn.click('#modal [data-dt="dados"]'); await pg.wait_for_timeout(300)
    check(await pn.locator('#dt-aviso').is_hidden(), 'o aviso só aparece na aba Conversa')
    await pn.click('#modal [data-dt="conversa"]'); await pg.wait_for_timeout(300)
    # setas dentro da caixa de resposta não trocam de solicitação e ‹ › não descarta o que foi escrito
    await pn.click('#rl-texto'); await pn.type('#rl-texto', 'abc', delay=20)
    antes = await nav_txt()
    await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(300)
    check(await nav_txt() == antes and await pn.input_value('#rl-texto') == 'abc', 'setas na caixa de texto só movem o cursor (não trocam de solicitação)')
    alvo = '[data-dt-nav="1"]' if await pn.locator('[data-dt-nav="1"]').is_enabled() else '[data-dt-nav="-1"]'
    await pn.click(alvo); await pg.wait_for_timeout(400)
    check(await nav_txt() == antes and await pn.locator('#rl-texto').count() == 1, 'com resposta escrita, trocar de solicitação é barrado (nada se perde)')
    await pn.fill('#rl-texto', ''); await pn.dispatch_event('#rl-texto', 'input'); await pg.wait_for_timeout(300)
    await pn.click('#modal .dlg-x'); await pg.wait_for_timeout(300)
    # afastamento: início e dias, e nenhum dado de saúde
    await pn.locator('#sol-grupos [data-card]', has_text='nº 1039').first.click()
    ok = await espera(lambda: pn.evaluate("document.querySelectorAll('#dt-dq .dq').length >= 2"), 15)
    chips = await pn.evaluate("[...document.querySelectorAll('#dt-dq .dq')].map(x => x.innerText.replace(/\\s+/g, ' ').trim().toUpperCase())")
    check(ok and any(c.startswith('INÍCIO') for c in chips) and any(c.startswith('DIAS') for c in chips), f'chips do afastamento: início e dias ({chips})')
    todo = (await pn.locator('#modal').inner_text()).upper()
    check('Z76' not in todo and 'MEDICO DE EXEMPLO' not in todo and '00000' not in todo, 'sem CID, médico ou CRM no detalhe do afastamento')
    await pn.click('#modal .dlg-x'); await pg.wait_for_timeout(300)
    # --- 4b. anexos como chips com o tipo do arquivo ---
    await pn.locator('#sol-grupos [data-card]', has_text='nº 1060').first.click()
    ok = await espera(lambda: pn.evaluate("document.querySelectorAll('#dt-body .tr-arq').length >= 1"), 15)
    chip = (await pn.locator('#dt-body .tr-arq').first.inner_text()).replace('\n', ' ') if ok else ''
    check(ok and 'PDF' in chip and 'Informe de rendimentos 2025.pdf' in chip, f'anexo da conversa vira chip com o tipo do arquivo ({chip!r})')
    check('está pedindo' not in await pn.locator('#modal').inner_text(), 'resposta sem pedido: sem o aviso de "está pedindo"')
    await pn.click('#modal .dlg-x'); await pg.wait_for_timeout(300)
    # --- vindo da busca: só a própria ---
    await pn.click('#plat-busca'); await pn.fill('#cmdk-q', '1041'); await pg.wait_for_timeout(500)
    await pn.locator('#cmdk-res [data-r]', has_text='1041').first.click(); await pg.wait_for_timeout(800)
    check(await pn.locator('#modal .dt-nav').count() == 0 and '1041' in await numero(), 'vindo da busca, o detalhe é só da própria solicitação (sem ‹ ›)')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    # --- 3. foco que pisca a partir de outra tela ("Ver na lista"), mesmo com filtro escondendo o cartão ---
    await pn.click('[data-tipo-sol="afastamento"]'); await pg.wait_for_timeout(300)   # filtro que esconde o aviso de férias
    await pn.click('#rail [data-mod="inicio"]'); await pg.wait_for_timeout(800)
    await pn.locator('#hj-passos .hj-step').first.click()
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('#modal .sheet')"), 8)
    check(ok and await pn.locator('#modal .dt-nav').count() == 1, 'vindo do Hoje, o detalhe navega pela lista do Hoje')
    num = await numero()
    await pn.click('#modal .dt-na-lista')
    ok = await espera(lambda: pn.evaluate("document.querySelectorAll('#sol-grupos .foco-pisca').length === 1"), 8)
    check(ok and await pn.locator('#rail [data-mod="pendencias"].on').count() == 1, 'Ver na lista: vai para Solicitações e a solicitação pisca')
    txt = await pn.locator('#sol-grupos .foco-pisca').inner_text() if ok else ''
    check(num.replace('nº ', '') in txt, f'… e é a mesma solicitação ({num})')
    check(await pn.locator('.tipo-c.fam-todos.on, .tipo-f.fam-todos.on').count() == 1, 'o filtro que a escondia foi tirado')   # cartão ou faixa de tipos (2.23)
    vis = await pn.evaluate("(() => { const r = document.querySelector('#sol-grupos .foco-pisca')?.getBoundingClientRect(); return !!r && r.top >= 0 && r.bottom <= innerHeight; })()")
    check(vis, 'o cartão que pisca está à vista (rolou até ele)')
    ok = await espera(lambda: pn.evaluate("document.querySelectorAll('.foco-pisca').length === 0"), 6)
    check(ok, 'o pisca termina (cerca de 2 s)')
    # o botão do aviso abre a solicitação no portal (o mesmo "Responder no portal"): a plataforma se recolhe para o portal aparecer
    if await pn.locator('[data-limpar-sol]').count(): await pn.click('[data-limpar-sol]')
    await pg.wait_for_timeout(300)
    await pn.locator('#sol-grupos [data-card]', has_text='nº 1041').first.click()
    await espera(lambda: pn.evaluate("!!document.querySelector('#dt-aviso-resp')"), 15)
    await pn.click('#dt-aviso-resp')
    ok = await espera(lambda: pg.evaluate("window.__ctPlatform.path().includes('/vacation-notice/1041')"), 15)
    check(ok, 'o botão do aviso leva ao portal, na solicitação certa')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:3]) if erros else ''))
    await ctx.close()


async def teste_agenda(b):
    """Agenda com calendário do mês: grade seg–dom acessível, painel do dia, ações nos lembretes, legenda, feriados, teclado e Hoje."""
    import datetime
    print('\n[Agenda] calendário do mês')
    pasta = os.environ.get('SIM_CAP', '')
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next(f for f in pg.frames if 'panel/panel.html' in f.url)
    await pg.set_viewport_size({'width': 1401, 'height': 900}); await pg.wait_for_timeout(200); await pg.set_viewport_size({'width': 1366, 'height': 650}); await pg.wait_for_timeout(500)
    # Hoje: aviso discreto do próximo prazo (leva à Agenda)
    ok = False
    for _ in range(40):
        if await pn.locator('.hj-saud .hj-prazo').count(): ok = True; break
        await pg.wait_for_timeout(500)
    check(ok and 'Próximo prazo' in await pn.locator('.hj-saud .hj-prazo').inner_text(), 'Hoje: "Próximo prazo: …" discreto ao lado da saudação')
    await pn.click('.hj-saud .hj-prazo'); await pg.wait_for_timeout(700)
    check(await pn.locator('#ag-grade').count() == 1, 'o aviso leva à Agenda')
    # estrutura acessível
    check(await pn.get_attribute('#ag-grade', 'role') == 'grid' and await pn.locator('#ag-grade [role=columnheader]').count() == 7, 'grade com role=grid e 7 cabeçalhos de coluna')
    check((await pn.locator('#ag-grade [role=columnheader]').first.inner_text()).lower() == 'seg', 'a semana começa na segunda')
    linhas = await pn.locator('#ag-grade .ag-sem').count()
    check(linhas in (4, 5, 6) and await pn.locator('#ag-grade .ag-day').count() == linhas * 7, f'semanas completas ({linhas} linhas)')
    await pn.click('#ag-hoje'); await pg.wait_for_timeout(500)
    hoje = datetime.date.today()
    cel_hoje = pn.locator(f'.ag-day[data-dia="{hoje.isoformat()}"]')
    rot = await cel_hoje.get_attribute('aria-label')
    check(str(hoje.year) in rot and ' de ' in rot and 'hoje' in rot, f'cada dia tem aria-label completo ({rot[:70]}…)')
    check(await cel_hoje.get_attribute('aria-selected') == 'true' and await cel_hoje.get_attribute('tabindex') == '0', 'hoje já vem escolhido (e é o único com tabindex 0)')
    check(await pn.locator('.ag-day[tabindex="0"]').count() == 1, 'só um dia na ordem do Tab')
    check('hoje' in (await pn.locator('#ag-dia').inner_text()).lower(), 'painel do dia mostra Hoje')
    # novo lembrete no dia escolhido: a data já vem preenchida
    await pn.click('#ag-novo-dia'); await pg.wait_for_timeout(300)
    check(await pn.input_value('#lb-data') == hoje.isoformat(), '"Novo lembrete neste dia" abre com a data do dia')
    await pn.fill('#lb-texto', 'Conferir banco de horas')
    await pn.click('#modal .btn-primary'); await pg.wait_for_timeout(600)
    check('1 lembrete' in await cel_hoje.get_attribute('aria-label'), 'o dia passa a ter 1 lembrete (aria-label)')
    check(await cel_hoje.locator('.ag-pt.t-lembrete').count() == 1, 'ponto de lembrete no dia')
    check('Conferir banco de horas' in await pn.locator('#ag-dia').inner_text(), 'o painel lista o lembrete')
    # Feito / Reabrir
    await pn.click('#ag-dia [data-a="feito"]'); await pg.wait_for_timeout(500)
    check(await pn.locator('#ag-dia .ag-ev-li.feito').count() == 1 and 'concluído' in await cel_hoje.get_attribute('aria-label'), '"Feito" risca o lembrete e o dia diz "concluído"')
    check(await cel_hoje.locator('.ag-pt.t-lembrete').count() == 0, 'feito não conta como ponto')
    await pn.click('#ag-dia [data-a="reabrir"]'); await pg.wait_for_timeout(500)
    check(await pn.locator('#ag-dia .ag-ev-li.feito').count() == 0, '"Reabrir" desfaz')
    # Adiar +1 dia: sai de hoje e vai para amanhã
    amanha = hoje + datetime.timedelta(days=1)
    await pn.click('#ag-dia [data-a="adiar"]'); await pg.wait_for_timeout(600)
    check(await pn.locator(f'.ag-day[data-dia="{amanha.isoformat()}"] .ag-pt.t-lembrete').count() == 1 or amanha.month != hoje.month, '"Adiar +1 dia" move o lembrete para amanhã')
    # legenda liga e desliga o tipo (e lembra a escolha)
    if amanha.month == hoje.month:
        await pn.click('#ag-tipos [data-tipo="lembrete"]'); await pg.wait_for_timeout(400)
        check(await pn.get_attribute('#ag-tipos [data-tipo="lembrete"]', 'aria-pressed') == 'false' and await pn.locator('#ag-grade .ag-pt.t-lembrete').count() == 0, 'legenda: desligar "Lembretes" tira os pontos')
        check(await pn.evaluate("localStorage.getItem('ct.agOcultos')") == '["lembrete"]', 'a escolha da legenda fica neste computador')
        await pn.click('#ag-tipos [data-tipo="lembrete"]'); await pg.wait_for_timeout(400)
        check(await pn.locator('#ag-grade .ag-pt.t-lembrete').count() >= 1, 'legenda: ligar de novo traz os pontos')
    # teclado: setas, Home/End, Page Down, Enter
    sel = lambda: pn.evaluate("document.querySelector('.ag-day.sel').dataset.dia")
    await pn.locator('.ag-day.sel').focus()
    ini = datetime.date.fromisoformat(await sel())
    await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(200)
    check(await sel() == (ini + datetime.timedelta(days=1)).isoformat(), 'seta para a direita move um dia')
    await pg.keyboard.press('ArrowDown'); await pg.wait_for_timeout(200)
    check(await sel() == (ini + datetime.timedelta(days=8)).isoformat(), 'seta para baixo move uma semana')
    check(await pn.evaluate("document.activeElement.classList.contains('ag-day') && document.activeElement.dataset.dia === document.querySelector('.ag-day.sel').dataset.dia"), 'o foco acompanha o dia escolhido')
    mes0 = await pn.inner_text('#ag-mes')
    await pg.keyboard.press('PageDown'); await pg.wait_for_timeout(500)
    check(await pn.inner_text('#ag-mes') != mes0, 'Page Down muda o mês')
    check(await pn.evaluate("document.activeElement.classList.contains('ag-day')"), 'depois de trocar o mês o foco continua no calendário')
    await pg.keyboard.press('PageUp'); await pg.wait_for_timeout(500)
    check(await pn.inner_text('#ag-mes') == mes0, 'Page Up volta o mês')
    await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
    check(await pn.evaluate("document.activeElement.id") == 'ag-dia-t', 'Enter leva o foco ao painel do dia')
    # feriado: novembro de 2026 tem Finados (02/11, segunda) e a conta de dia útil muda
    async def ir_para(rotulo):
        for _ in range(40):
            if (await pn.inner_text('#ag-mes')).lower() == rotulo: return True
            ant = datetime.date.today() > datetime.date(2026, 11, 1)
            await pn.click('#ag-prev' if ant else '#ag-next'); await pg.wait_for_timeout(250)
        return False
    check(await ir_para('novembro de 2026'), 'navega até novembro de 2026')
    fin = pn.locator('.ag-day[data-dia="2026-11-02"]')
    check('Finados' in await fin.inner_text() and 'feriado: Finados' in await fin.get_attribute('aria-label') and 'dia não útil' in await fin.get_attribute('aria-label'), 'Finados aparece como feriado e dia não útil')
    check('feriado' in (await fin.get_attribute('class')), 'dia de feriado marcado')
    check(await pn.locator('#ag-grade .ag-pt.t-legal').count() >= 3, 'prazos fixos (salário, FGTS, INSS) aparecem como pontos')
    await fin.click(); await pg.wait_for_timeout(300)
    txt = await pn.inner_text('#ag-dia')
    check('Feriado: Finados' in txt and 'Dia não útil' in txt, 'painel do dia explica o feriado')
    d9 = pn.locator('.ag-day[data-dia="2026-11-09"]')
    await d9.click(); await pg.wait_for_timeout(300)
    check('Pagamento dos salários' in await pn.inner_text('#ag-dia'), '5º dia útil de novembro (09/11, pulando Finados) lista o pagamento dos salários')
    # sem rolagem horizontal e capturas nos dois temas
    for (w, h) in [(1280, 720), (1366, 650)]:
        await pg.set_viewport_size({'width': w, 'height': h}); await pg.wait_for_timeout(500)
        largo = await pn.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth, document.querySelector('#view').scrollWidth, document.querySelector('#view').clientWidth]")
        check(largo[0] <= largo[1] + 1 and (largo[2] or 0) <= (largo[3] or 0) + 1, f'{w}x{h}: sem rolagem horizontal {largo}')
        for tema in ['light', 'dark']:
            await pn.evaluate(f"document.documentElement.setAttribute('data-theme','{tema}')"); await pg.wait_for_timeout(300)
            if pasta: await pg.screenshot(path=f'{pasta}/agenda-{tema}-{w}x{h}.png')
    await pn.evaluate("document.documentElement.setAttribute('data-theme','light')")
    # tela estreita: painel do dia empilhado abaixo do calendário
    await pg.set_viewport_size({'width': 1000, 'height': 720}); await pg.wait_for_timeout(500)
    emp = await pn.evaluate("(() => { const c = document.querySelector('.ag-cal').getBoundingClientRect(), d = document.querySelector('#ag-dia').getBoundingClientRect(); return d.top >= c.bottom - 1 && Math.abs(d.left - c.left) < 4; })()")
    check(emp, 'em tela estreita o painel do dia fica embaixo do calendário')
    check(await pn.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"), '1000px: sem rolagem horizontal')
    if pasta: await pg.screenshot(path=f'{pasta}/agenda-estreita-1000.png')
    check(not erros, 'sem erros na página' + (': ' + '; '.join(erros[:3]) if erros else ''))
    await ctx.close()


async def teste_hoje_enxuto(b):
    """2.19: Hoje e Solicitações enxutos (seções recolhíveis, dica ⓘ, faixa de tipos, telas baixas) e o cartão Movimento."""
    print('\n[2.19] Hoje e Solicitações mais enxutos, gráficos')
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
    pg = await ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_timeout(3500)
    pn = next(f for f in pg.frames if 'panel/panel.html' in f.url)
    async def espera(cond, s=30):
        for _ in range(s * 2):
            try:
                if await cond(): return True
            except Exception: pass
            await pg.wait_for_timeout(500)
        return False
    await espera(lambda: pn.evaluate("!!document.querySelector('.hj-hero[data-pronto]')"), 15)
    ok = await espera(lambda: pn.evaluate("!!document.querySelector('#eq-movimento .mv-kpi') && !!document.querySelector('#eq-avisos .eq-li')"), 25)
    check(ok, 'Hoje: leituras prontas (movimento e avisos)')
    # seções recolhíveis: estado coerente, padrão pela ação do cliente, escolha guardada só como ids → true/false
    info = await pn.evaluate("""() => [...document.querySelectorAll('.hj-painel')].map(s => { const b = s.querySelector('.hj-painel-bt'), c = s.querySelector(':scope > .hj-painel-c');
      return { id: s.id, exp: b.getAttribute('aria-expanded'), oculto: c.hidden, ctrl: b.getAttribute('aria-controls') === c.id, n: s.querySelector('.eq-n')?.textContent }; })""")
    ids = [x['id'] for x in info]
    check(len(info) >= 6 and all(x['ctrl'] and (x['exp'] == 'false') == x['oculto'] for x in info), f'Hoje: seções recolhíveis com aria-expanded/aria-controls coerentes ({ids})')
    ordem = [k for k in ('eq-legais', 'eq-avisos', 'eq-exp', 'eq-ferias', 'eq-movimento', 'eq-docs') if k in ids]
    check(ordem == sorted(ordem, key=ids.index) and ids.index('eq-docs') > ids.index('eq-legais'), 'Hoje: ordem das seções mantida, com Documentos novos depois de Prazos legais')
    estado = {x['id']: x['exp'] for x in info}
    check(estado.get('eq-avisos') == 'true' and estado.get('eq-movimento') == 'false', 'Hoje: abre sozinha a seção com algo a fazer; a informativa vem recolhida')
    check(all(x['n'] is not None for x in info if x['id'] not in ('eq-folha', 'eq-movimento')), 'Hoje: contador à direita de cada seção')
    await pn.click('#eq-avisos .hj-painel-bt'); await pn.click('#eq-movimento .hj-painel-bt'); await pg.wait_for_timeout(200)
    guardado = await pn.evaluate("JSON.parse(localStorage.getItem('ct.hojeSecoes') || '{}')")
    check(guardado.get('eq-avisos') is False and guardado.get('eq-movimento') is True and all(isinstance(v, bool) for v in guardado.values()), f'Hoje: a escolha fica em ct.hojeSecoes (só ids e true/false): {guardado}')
    check(await pn.locator('#eq-avisos-c').is_hidden() and await pn.locator('#eq-movimento-c').is_visible(), 'Hoje: recolher esconde o corpo; abrir mostra')
    await pn.click('#rail [data-mod="pendencias"]'); await pg.wait_for_timeout(400)
    await pn.click('#rail [data-mod="inicio"]'); await pg.wait_for_timeout(800)
    check(await pn.locator('#eq-avisos .hj-painel-bt').get_attribute('aria-expanded') == 'false' and await pn.locator('#eq-movimento .hj-painel-bt').get_attribute('aria-expanded') == 'true', 'Hoje: a escolha volta ao reabrir a tela')
    await pn.focus('#eq-avisos .hj-painel-bt'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
    check(await pn.locator('#eq-avisos .hj-painel-bt').get_attribute('aria-expanded') == 'true', 'Hoje: a seção abre pelo teclado (Enter)')
    # dica ⓘ: o texto de ajuda vive no botão, também pelo teclado
    nd = await pn.locator('.hj-painel .dica-i').count()
    sem = await pn.evaluate("[...document.querySelectorAll('.dica-i')].filter(d => !d.getAttribute('data-tip') || !d.getAttribute('aria-label') || d.tagName !== 'BUTTON').length")
    check(nd >= 6 and sem == 0, f'Hoje: textos de ajuda viram dica ⓘ ({nd} botões, todos com texto e aria-label)')
    check(await pn.locator('.hj-painel .pn-card-head small').count() == 0, 'Hoje: sem parágrafos de ajuda sob os títulos das seções')
    await pn.focus('#eq-legais .dica-i'); await pg.wait_for_timeout(150)
    txt = await pn.locator('#eq-legais .dica-i').get_attribute('data-tip')
    check(await pn.locator('#dica').is_visible() and (await pn.locator('#dica').inner_text()).strip() == txt.strip(), 'dica ⓘ: abre pelo foco do teclado com o texto da ajuda')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
    check(await pn.locator('#dica').is_hidden(), 'dica ⓘ: Esc fecha')
    # Movimento das suas solicitações
    m = pn.locator('#eq-movimento')
    check('Movimento das suas solicitações' in await m.inner_text() and await m.locator('.bv-svg rect.seg').count() >= 4, 'Movimento: barras empilhadas das semanas')
    lab = await m.locator('.bv-svg').get_attribute('aria-label')
    check(await m.locator('.bv-svg').get_attribute('role') == 'img' and 'abertas por você' in lab and 'concluídas' in lab and any(c.isdigit() for c in lab), 'Movimento: role="img" e aria-label com os números')
    check(await m.locator('.bv-svg rect.alvo').count() == 8 and await m.locator('.mb-svg').count() == 1, 'Movimento: 8 semanas, com mini barras no cabeçalho')
    await m.locator('.bv-svg rect.alvo').nth(1).hover(); await pg.wait_for_timeout(150)
    tip = (await pn.locator('#dica').inner_text()) if await pn.locator('#dica').is_visible() else ''
    check('Semana de' in tip and 'Abertas por você:' in tip, f'Movimento: dica ao passar o mouse ({tip!r})')
    check(await m.locator('.mv-kpi b').count() == 1 and 'dia' in await m.locator('.mv-kpi').inner_text() and await m.locator('.ls-svg').get_attribute('role') == 'img', 'Movimento: tempo até a 1ª resposta (mediana + linha)')
    check('conversas lidas' in await m.locator('.mv-kpi').inner_text(), 'Movimento: diz de quantas conversas vem o tempo')
    # telas baixas: destaque compacto, cabeçalho em uma linha, início da 1ª seção à vista
    for (w, h) in [(1366, 650), (1280, 720)]:
        await pg.set_viewport_size({'width': w, 'height': h}); await pg.wait_for_timeout(700)
        r = await pn.evaluate("""() => { for (let e = document.querySelector('.hj-hero'); e; e = e.parentElement) e.scrollTop = 0; const hero = document.querySelector('.hj-hero').getBoundingClientRect(), p = document.querySelector('.hj-painel').getBoundingClientRect(), head = document.querySelector('.plat-head').getBoundingClientRect(),
          an = document.querySelector('.hj-hero .an-svg').getBoundingClientRect(); return { hh: hero.height, painelTopo: p.top, altura: innerHeight, cab: head.height, anel: an.width, leg: getComputedStyle(document.querySelector('.hj-legenda')).display }; }""")
        check(r['anel'] <= 100 and r['leg'] == 'none' and r['hh'] <= 230, f'{w}×{h}: destaque compacto (rosca {r["anel"]:.0f}px, altura {r["hh"]:.0f}px, sem legenda)')
        check(r['painelTopo'] + 60 <= r['altura'], f'{w}×{h}: o início da 1ª seção abaixo do destaque fica à vista (topo em {r["painelTopo"]:.0f} de {r["altura"]})')
        check(r['cab'] <= 70, f'{w}×{h}: cabeçalho da plataforma em uma linha ({r["cab"]:.0f}px)')
    hero_bg = await pn.evaluate("getComputedStyle(document.querySelector('.hj-hero')).backgroundColor")
    check(hero_bg != 'rgba(0, 0, 0, 0)', f'destaque mantém a inversão de cores (fundo {hero_bg})')
    await pg.set_viewport_size({'width': 1400, 'height': 900}); await pg.wait_for_timeout(500)
    # Solicitações: faixa de uma linha com os tipos que têm pedidos
    await pn.evaluate("localStorage.removeItem('ct.solTipos')")
    await pn.click('#rail [data-mod="pendencias"]'); await pg.wait_for_timeout(900)
    chips = await pn.evaluate("[...document.querySelectorAll('#sol-tipos .tipo-f')].map(c => [c.dataset.tipoSol, +c.querySelector('b').textContent])")
    check(chips and chips[0][0] == '' and all(n > 0 for k, n in chips if k) and 1 < len(chips) < 11, f'Solicitações: faixa com "Todos os tipos" e só os tipos com pedidos ({len(chips)} chips)')
    uma = await pn.evaluate("(() => { const f = document.querySelector('.tipos-faixa'); return new Set([...f.children].map(c => Math.round(c.getBoundingClientRect().top))).size; })()")
    check(uma == 1, 'Solicitações: a faixa tem uma linha só')
    check(await pn.locator('#sol-tipos .tipo-c').count() == 0 and await pn.locator('[data-tipos-vis="todos"]').count() == 1, 'Solicitações: grade fechada, com o botão "Ver todos os tipos"')
    await pn.click('#sol-tipos .tipo-f[data-tipo-sol="calculoFerias"]'); await pg.wait_for_timeout(300)
    check(await pn.locator('#sol-grupos .hj-card').count() == 1 and await pn.locator('#sol-tipos .tipo-f.on[data-tipo-sol="calculoFerias"]').count() == 1, 'Solicitações: o chip do tipo filtra como o cartão filtrava')
    await pn.click('#sol-tipos .tipo-f[data-tipo-sol="calculoFerias"]')
    await pn.click('[data-tipos-vis="todos"]'); await pg.wait_for_timeout(200)
    check(await pn.locator('#sol-tipos .tipo-c').count() == 11 and await pn.evaluate("localStorage.getItem('ct.solTipos')") == 'todos', 'Solicitações: "Ver todos os tipos" abre a grade e guarda a escolha (ct.solTipos)')
    await pn.click('#rail [data-mod="inicio"]'); await pn.click('#rail [data-mod="pendencias"]'); await pg.wait_for_timeout(500)
    check(await pn.locator('#sol-tipos .tipo-c').count() == 11, 'Solicitações: a grade continua aberta ao voltar à tela')
    await pn.click('[data-tipos-vis="faixa"]'); await pg.wait_for_timeout(200)
    check(await pn.locator('#sol-tipos .tipo-f').count() > 1 and await pn.evaluate("localStorage.getItem('ct.solTipos')") == 'faixa', 'Solicitações: "Mostrar só com pedidos" volta à faixa')
    check(not erros, f'sem erros de script nas telas {erros[:2]}')
    await ctx.close()


async def main():
    serve()
    if os.environ.get('SIM_SO') == 'ct':   # SIM_SO=ct roda só o contraste (temas claro e escuro)
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_contraste(b); await teste_sino(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        sys.exit(1 if falhas else 0)
    if os.environ.get('SIM_SO') == 'dt':   # SIM_SO=dt roda só o detalhe da solicitação (2.19)
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_detalhe(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        sys.exit(1 if falhas else 0)
    if os.environ.get('SIM_SO') == 'hs':   # SIM_SO=hs roda só o Hoje/Solicitações enxutos e o cartão Movimento (2.19)
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_hoje_enxuto(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        sys.exit(1 if falhas else 0)
    if os.environ.get('SIM_SO') == 'ag':   # SIM_SO=ag roda só a Agenda em calendário do mês
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_agenda(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        sys.exit(1 if falhas else 0)
    if os.environ.get('SIM_SO') == 'viv':   # SIM_SO=viv roda só a escrita ao vivo e a resposta ao escritório (2.12)
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_vivo(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        sys.exit(1 if falhas else 0)
    if os.environ.get('SIM_SO') == 'l6':   # SIM_SO=l6 roda só o lote 6 (variáveis da folha, grade de rubricas, resposta no portal)
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_lote6(b); await teste_grade_div(b); await teste_grade_virtual(b); await teste_grade_api(b); await teste_comando_rubricas(b); await teste_rascunho_rubricas(b); await teste_excel_rubricas(b); await teste_leitura_repetida(b); await teste_competencia_comando(b); await teste_resumo_conferencia(b); await teste_troca_empresa_dom(b); await teste_troca_empresa_modal(b); await teste_cancelar_rubricas(b); await teste_blocos_cadastro(b); await teste_foco_listas(b); await teste_foco_lista_vazia(b); await teste_sem_ao_vivo(b); await teste_listas_do_onvio(b); await teste_cargo_novo(b); await teste_cancelar_cadastro(b); await teste_ocr_tempo(b); await teste_dicas_arquivo(b); await teste_arquivo_nome_e_leitura(b); await teste_pular_leitura(b); await teste_todas_as_empresas(b); await teste_empresa_do_funcionario(b); await teste_sair_do_pedido(b); await teste_tela_muda(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        return
    if os.environ.get('SIM_SO') == 'l4':   # SIM_SO=l4 roda só o lote 4 (rescisão, férias e fluxo de pedidos)
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_lote4(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        return
    if os.environ.get('SIM_SO') == 'sug':   # SIM_SO=sug roda só a sugestão de um clique do leitor (lote 5)
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_sugestao(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        return
    if os.environ.get('SIM_SO') == 'l5':   # SIM_SO=l5 roda só o lote 5 (CPF, lote por pessoa, 60 dias, planilha, Word/HEIC, recorte)
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_lote5(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        return
    if os.environ.get('SIM_SO') == 'mec':   # SIM_SO=mec roda só a mecânica do preenchimento
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_mecanica(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        return
    if os.environ.get('SIM_SO') == 'foco':
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_foco_listas(b); await teste_foco_lista_vazia(b); await teste_sem_ao_vivo(b); await teste_listas_do_onvio(b); await teste_cargo_novo(b); await teste_cancelar_cadastro(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        return
    if os.environ.get('SIM_SO') == 'ocr':
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_ocr_tempo(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        return
    if os.environ.get('SIM_SO') == 'arq':
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_dicas_arquivo(b); await teste_arquivo_nome_e_leitura(b); await teste_pular_leitura(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        return
    if os.environ.get('SIM_SO') == 'emp':
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_todas_as_empresas(b); await teste_empresa_do_funcionario(b); await teste_troca_empresa_modal(b); await teste_troca_empresa_dom(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        return
    if os.environ.get('SIM_SO') == 'cad':   # SIM_SO=cad roda só o cadastro (lote 3)
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--disable-dev-shm-usage'])
            await teste_cadastro(b); await b.close()
        print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))
        return
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
        # com três empresas no acesso, abrir um pedido pergunta a empresa (2.7): estes testes confirmam a que já vem marcada
        async def _auto_empresa():
            while True:
                try:
                    f = painel()
                    if f and await f.locator('.ee-lista').count(): await f.click('.dlg [data-acao="2"]', timeout=800)
                except Exception: pass
                await asyncio.sleep(0.15)
        tarefa_emp = asyncio.create_task(_auto_empresa())
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
            # o município só carrega ~2 s depois da UF (como no portal): o Assistente tenta de novo no fim
            for _ in range(40):
                await pg.wait_for_timeout(1000)
                if (await leave()).get('addressCity') and (await leave()).get('birthCity'): break
            await pg.wait_for_timeout(1500)
            v2 = dict(await pg.evaluate("""() => [...document.querySelectorAll('main [formcontrolname]')].filter(e=>e.type!=='radio').map(e => [e.getAttribute('formcontrolname'), e.tagName==='BENTO-COMBOBOX' ? e.querySelector('input').value : e.value])"""))
            check(v2.get('name') == 'MARIA APARECIDA SOUZA LIMA', 'cadastro: nome')
            check(v2.get('motherName') == 'ANA SOUZA LIMA', 'cadastro: mãe (outra etapa)')
            check(v2.get('addressState') == 'São Paulo', 'cadastro: UF convertida (SP → São Paulo)')
            check(v2.get('addressCity') == 'São Paulo', f"cadastro: município depois da UF ({v2.get('addressCity')})")
            check(v2.get('costCenterExpanded') == 'GERAL' and v2.get('laborUnionClientExpanded') == 'SINDICATO EXEMPLO', 'cadastro: lista com uma opção só escolhida sozinha (centro de custo, sindicato)')
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
                if v.get('selectedEmployee') and v.get('vacationStartDate'): break
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

            # texto livre (lote 1): correção com o cartão aberto, cartão editável, "os dois", dúvidas, palpite e vários pedidos
            print('\n[texto livre] correção, cartão editável, dúvidas, palpite e vários pedidos')
            async def escrever(txt, ms=1500):
                await pn.click('.tab[data-view="inicio"]'); await pg.wait_for_timeout(300)
                antes = await pn.locator('#sugestao').inner_text()
                await pn.fill('#free-txt', txt); await pn.click('#free-go'); await pg.wait_for_timeout(ms)
                for _ in range(16):   # o cartão pode esperar a lista de funcionários
                    agora = await pn.locator('#sugestao').inner_text()
                    if agora.strip() and agora != antes: return agora
                    await pg.wait_for_timeout(500)
                return await pn.locator('#sugestao').inner_text()
            sug = await escrever('o jorge vai sair de férias dia 16/11 por 20 dias')
            sug = await escrever('não, é dia 18/11', 1000)
            check('18/11/2026' in sug and 'corrigido' in sug and 'JORGE OLIVEIRA ALVES' in sug, 'segundo texto sem pedido novo corrige o cartão aberto (não vira Solicitação Geral)')
            await pn.click('#sugestao [data-tira="diasGozo"]'); await pg.wait_for_timeout(300)
            sug = await pn.locator('#sugestao').inner_text()
            check('Dias de gozo' not in sug and '18/11/2026' in sug, 'cartão: o x descarta um valor')
            await pn.click('#sugestao [data-ed="inicioGozo"]'); await pg.wait_for_timeout(200)
            await pn.fill('#sugestao .kv-in', '19/11/2026'); await pn.press('#sugestao .kv-in', 'Enter'); await pg.wait_for_timeout(300)
            sug = await pn.locator('#sugestao').inner_text()
            check('19/11/2026' in sug, 'cartão: um clique troca o valor antes de abrir')
            check(await pn.locator('#sugestao [data-ambos]').count() == 1 and 'Os dois' in sug, 'férias: 3ª opção "Os dois: aviso agora e cálculo em seguida"')
            await pn.click('#sugestao [data-ambos]')
            for _ in range(25):
                await pg.wait_for_timeout(700)
                v = await leave()
                if v.get('selectedEmployee') == 'JORGE OLIVEIRA ALVES' and v.get('vacationStartDate'): break
            lote_txt = await pn.locator('#lote').inner_text()
            check('vacation-notice/add' in await pg.evaluate("window.__ctPlatform.path()") and v.get('vacationStartDate') == '19/11/2026' and not v.get('vacationDays'), f'"os dois": abre o aviso com os dados do cartão ({v.get("vacationStartDate")}, dias {v.get("vacationDays")!r})')
            check('1 de 2' in lote_txt and 'Cálculo de Férias' in lote_txt, 'o cálculo fica na fila do lote para depois do envio')
            await pn.click('#lote-parar'); await pg.wait_for_timeout(300)

            sug = await escrever('posso mandar foto do atestado?', 1000)
            check('Encontrei nas dúvidas' in sug and 'Posso mandar foto do atestado?' in sug and 'Abrir o pedido mesmo assim' in sug, 'pergunta: mostra as dúvidas antes de propor um pedido')
            await pn.click('#sug-mesmo'); await pg.wait_for_timeout(1200)
            sug = await pn.locator('#sugestao').inner_text()
            check('Afastamento de Empregado' in sug, '"Abrir o pedido mesmo assim" segue para o pedido')
            await pn.click('#sug-x'); await pg.wait_for_timeout(200)

            sug = await escrever('atestado do Ronado de 2 dias a partir de 08/10/2026')
            check('Não achei “Ronado”' in sug and 'RONALDO DE SOUZA' in sug, 'nome com uma letra trocada vira pergunta de um clique')
            check(await pn.locator('#sugestao [data-ed="empregado"]').count() == 0, 'o palpite não preenche sozinho')
            await pn.click('#sugestao [data-quem="RONALDO DE SOUZA"]'); await pg.wait_for_timeout(300)
            sug = await pn.locator('#sugestao').inner_text()
            check(await pn.locator('#sugestao [data-ed="empregado"]').count() == 1 and 'RONALDO DE SOUZA' in sug and 'Não achei' not in sug, 'respondido "Sim": o funcionário entra no cartão')
            sug = await escrever('vamos admitir a Maria Souza', 1000)
            check('empregado' not in sug and 'Cadastro de Empregado' in sug, 'admissão não procura funcionário nem mostra nome técnico de campo')
            await pn.click('#sug-x'); await pg.wait_for_timeout(200)

            sug = await escrever('férias do Ronaldo dia 10/11 por 20 dias e da Joana dia 01/12 por 30 dias')
            check('Entendi 2 pedidos' in sug and 'RONALDO DE SOUZA' in sug and 'JOANA FONSECA' in sug and '01/12/2026' in sug, 'frase com dois pedidos: "Entendi 2 pedidos" com a lista')
            await pn.click('#sug-lote')
            for _ in range(25):
                await pg.wait_for_timeout(700)
                v = await leave()
                if v.get('selectedEmployee') == 'RONALDO DE SOUZA' and v.get('vacationDays'): break
            lote_txt = await pn.locator('#lote').inner_text()
            check(v.get('vacationStartDate') == '10/11/2026' and v.get('vacationDays') == '20' and '1 de 2' in lote_txt, 'vários pedidos: o lote abre o 1º preenchido e deixa o 2º na fila')
            await pn.click('#lote-parar'); await pg.wait_for_timeout(300)
            # pedido do lote preparado sem pendência abre o resumo do "Conferir e enviar" (2.8): volta sem enviar
            if await pn.locator('#modal').is_visible() and await pn.locator('#modal #m-fix').count(): await pn.click('#modal #m-fix'); await pg.wait_for_timeout(300)

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
            if v.get('selectedEmployee') and v.get('leaveDate'): break   # o preenchimento segue a ordem das regras: funcionário primeiro, a data depois
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
        await teste_agenda(b)
        await teste_mecanica(b)
        await teste_cadastro(b)
        await teste_lote4(b)
        await teste_lote6(b)
        await teste_grade_div(b); await teste_grade_virtual(b); await teste_grade_api(b); await teste_comando_rubricas(b); await teste_rascunho_rubricas(b); await teste_excel_rubricas(b); await teste_leitura_repetida(b); await teste_competencia_comando(b); await teste_resumo_conferencia(b); await teste_troca_empresa_dom(b); await teste_troca_empresa_modal(b); await teste_cancelar_rubricas(b); await teste_blocos_cadastro(b); await teste_foco_listas(b); await teste_foco_lista_vazia(b); await teste_sem_ao_vivo(b); await teste_listas_do_onvio(b); await teste_cargo_novo(b); await teste_cancelar_cadastro(b); await teste_ocr_tempo(b); await teste_dicas_arquivo(b); await teste_pular_leitura(b); await teste_todas_as_empresas(b); await teste_empresa_do_funcionario(b); await teste_sair_do_pedido(b); await teste_tela_muda(b)
        await teste_vivo(b)
        await teste_sugestao(b)
        await teste_lote5(b)
        await teste_contraste(b)
        await teste_sino(b)
        await teste_detalhe(b)
        await teste_hoje_enxuto(b)
        await b.close()
    print('\nTUDO CERTO' if not falhas else f'\n{len(falhas)} FALHA(S):\n' + '\n'.join('  - ' + f for f in falhas))

asyncio.run(main())
sys.exit(1 if falhas else 0)
