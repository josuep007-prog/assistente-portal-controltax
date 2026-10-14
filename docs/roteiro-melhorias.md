# Roteiro de melhorias — a partir da 1.3.1

> Levantado em 14/10/2026 numa sessão do Claude Code na nuvem, só com leitura do código e dos testes. Nada foi conferido no Onvio real.

## Contexto

O Josué pediu uma análise ampla da extensão, com sugestões criativas. A análise foi só de leitura e cobriu 8 frentes:

- robustez no Onvio;
- leitura de documentos;
- experiência do cliente;
- regras e manutenção;
- legislação e prazos;
- segurança e privacidade;
- testes;
- ideias fora da caixa.

Saíram **97 itens**. Cada um foi conferido no código por um verificador. Os bugs e riscos passaram ainda por um segundo revisor, que tentou refutá-los. **84 itens sobreviveram e 13 foram contestados ou descartados.** Os 6 mais graves foram reconferidos à mão: cx-01, leg-01, leg-02, doc-01, doc-03 e rm-01.

Três frentes extras não rodaram por limite de uso: distribuição e atualização, várias abas e empresas, e o canal entre página e painel. Ficam para uma próxima rodada.

Há bugs reais que afetam o cliente agora. Os principais:

- um anexo que ainda não foi para o portal conta como "anexado";
- um envio recusado pelo portal vira "enviado";
- o fim do aviso prévio sai 1 dia antes;
- o aviso proporcional é aplicado ao pedido de demissão;
- o ASO "Apto" é lido como INAPTO;
- o funcionário errado é escolhido em caso de empate.

Também há ideias com valor de negócio e que respeitam as restrições: tudo local, sem nuvem e sem telemetria.

Regras gerais para todas as ondas:

- **Regra antes de código:** o que for texto, prazo ou palavra vai em `rules/regras.json`.
- Cada correção leva um teste.
- Não publicar regras no repositório público sem o Josué pedir.

---

## Onda 1 — versão 1.3.2: envio e prazos certos (código + testes)

| # | Item | Onde | Correção |
|---|---|---|---|
| 1 | **cx-01** Anexo que só está no Assistente conta como "anexado" na conferência e no resumo | `panel/panel.js:754` (`pendente:true` nunca lido), `panel/engine.js:390-394` | Em `runChecks`, anexo `pendente` não conta como anexado, salvo `a.anexado`/`jaAnexado`. No modal, separar "Anexado no portal" de "Ainda não anexado". Mensagem `anexoSoNoAssistente` em regras. |
| 2 | **rob-03** Voltar à lista em até 60 s depois de confirmar vira "enviado", mesmo com envio recusado (apaga o rascunho, cria prazos falsos, faz o lote avançar) | `content/content.js:739-750`, `panel/panel.js:1238,1296-1301,525` | No `confirmSubmit`, guardar `envioEm`. Se 4–5 s depois a rota ainda for o mesmo `/add`, mandar `envioNaoConcluido`. O painel zera `S.ultimoEnvio` e explica em tom educativo. Em `routeChanged`, guardar `ultimoForm` em vez de `prev`. |
| 3 | **rob-01** "Desfazer" continua valendo num formulário novo (CANCELAR → reabrir; lote) e apaga o que o cliente digitou | `content/content.js:546,552,578,739-750` | Em `routeChanged`, quando sair de um `/add`, tirar da pilha os itens com `path === prev` (splice). |
| 4 | **Trava de envio segura** (rob-02, seg-02, rm-04, cx-07) | `content/content.js:177,680,692` | `confirmarAntesDeEnviar !== false`, e trava fechada também enquanto `rules` é null. `requestSubmit` não clica: manda `submitAttempt` com o retrato da tela. O único `.click()` no botão de envio fica no `confirmSubmit`. |
| 5 | **leg-01** Fim do aviso prévio 1 dia antes (Súmula 380 do TST) | `panel/panel.js:1668` (Calcular), `:1541` (Agenda) | Helper `E.fimAviso(data, dias)` = `addDays(data, dias)`. Na Agenda, nada de prazo de aviso para justa causa, experiência ou tempo determinado (lista `motivosSemAviso` nas regras). |
| 6 | **leg-02** Aviso proporcional aplicado ao pedido de demissão e à justa causa | `panel/engine.js:308`, dica em `regras.json:1016` | Proporcional só se `avisoDadoPor` for **igual** a EMPREGADOR (atenção: "EMPREGADOR" contém "EMPREGADO"); se EMPREGADO, 30; justa causa, nada. Corrigir a dica nas regras. |
| 7 | **leg-03** "15 dias pela empresa + INSS" mostrado em licença-maternidade, licença sem vencimento etc. | `engine.js:304`, `panel.js:1021,1540`, `regras.json:496` | `tipos.afastamento.tiposComInss` nas regras. Sem tipo escolhido, mantém o comportamento atual. Nova `info` para maternidade. |
| 8 | **leg-04 / qt-04** Datas impossíveis viram outra data ("dia 31" em novembro → 01/12) | `engine.js` `parseDate`/`findDates` | Helper `dataValida` igual ao `mk` de `lerDataAtestado` (engine.js:655), em todos os ramos. Data inválida vira aviso. |
| 9 | **seg-03** CID: o interruptor mostra só a preferência e ignora a regra; o histórico guarda a descrição com o CID | `panel.js:772,977,1716,1520`, `salvarRascunho` (~1328) | Função única `cidAtivo()`: a escolha do cliente vence, e o interruptor mostra o estado efetivo ("ligado pelo escritório"). Não gravar `descricao`/`observacoes` no histórico nem no rascunho. |
| 10 | **cx-02** O aviso com "↶ Desfazer" da página é sobrescrito na hora pelo aviso do painel | `panel.js:1139` | Não mandar o aviso do painel quando `r.mudou`. |
| 11 | **cx-04** Remover um arquivo durante o OCR não cancela, e os dados dele preenchem o portal | `applyAnalysis` (~692), `handleVarios`, `abrirPedido` | Sair cedo se `item.removido`. Mostrar o X também no cartão de leitura do Início. |
| 12 | **ideia-02** Agenda repete prazos e mostra pedidos nunca enviados | `panel.js:1518,1530-1560` | Ao gravar 'enviado', apagar os 'preenchido' da mesma chave (`CHAVE_REPETIDO`). A Agenda usa só 'enviado'. Seção "Começou e não enviou". |
| 13 | **rob-10 (parte P)** Preenchimento que estoura o tempo falha em silêncio e grava 'preenchido' | `panel.js:1129-1139` | Só gravar o histórico com `r`. Com `r` nulo, mostrar "O preenchimento não terminou — confira o portal (há Desfazer)". `S.preenchendo` vira contador. |
| 14 | **rob-05 (parte P)** Trocar de empresa sem recarregar mantém listas, rascunho, lote e pilha de desfazer | `panel.js:102` (`onContext`), `content.js:401-402` (`optionsCache`) | Quando `S.ctx.empresa` mudar: gravar os rascunhos com a empresa anterior, `S.work = {}`, `cargasEmpregados.clear()` e pausar o lote. No conteúdo: `optionsCache.clear()` e zerar a pilha de desfazer. |
| 15 | **qt-01** `tests/sim_test.py` sai com código 0 mesmo com falhas | `tests/sim_test.py:288-290` | `sys.exit(1 if falhas else 0)`, listando as falhas. |

**Testes novos (sim_test, e2e, engine):**
- **sim_test:**
  - "Enviar assim mesmo" → portal recusa → CANCELAR: nada vira "enviado" e o rascunho fica;
  - preencher → CANCELAR → reabrir: `#btn-undo` escondido;
  - no lote, o pedido 2 não mostra "há 2" no desfazer;
  - remover um arquivo durante a leitura.
- **e2e:** com `confirmarAntesDeEnviar` desligado, "Conferir e enviar" ainda mostra o resumo.
- **engine:**
  - `fimAviso`;
  - `diasAviso` por quem deu o aviso;
  - `inicioInss` por tipo;
  - datas impossíveis;
  - anexo pendente não conta como anexado.

## Onda 2 — versão 1.3.3: leitura de documentos

| # | Item | Correção (regras primeiro) |
|---|---|---|
| 1 | **doc-01** ASO/CAT: opção impressa lida como marcada ("Apto" vira INAPTO; CAT vira Trajeto). `engine.js:796-801`, `:225-228` | Mecânica `opcaoMarcada(texto, opcoes)`, que reconhece (X), [X], ☒ e ignora ( ). As opções ficam em `documentos[].opcoes`. Rede de segurança: se aparecerem duas opções e nenhuma marca, devolver null e mostrar um aviso neutro em vez do erro vermelho. |
| 2 | **doc-03** `findEmployeeInText`: empate decidido pela ordem da lista (s bruto × s·0,95) e palavras espalhadas pelo texto. `engine.js:111-114` | Comparar s bruto com s bruto. No empate, devolver `{candidatos}` (usa o "Qual deles?" que já existe). Depois: proximidade e ordem das palavras, e tirar empresa e destinatário do texto. |
| 3 | **doc-04** Teto de 1,0 na nota faz o empate cair na ordem do regras.json. `engine.js:138` | Ordenar pela nota sem teto. `documentos[].negativas` nas regras. |
| 4 | **doc-02** Data genérica pega a primeira data do texto (admissão vira data do aviso; período aquisitivo vira início do gozo) | **Regras:** tirar o último recurso genérico de `pedidoDemissao.dataAviso`, `avisoEmpregador.dataAviso` e `cat.dataAfastamento`, e exigir "gozo" ou "início" em `ferias.inicioGozo`. Depois, `lerDataComPistas` generalizando a pontuação de `lerDataAtestado`. |
| 5 | **doc-07** No Cadastro, qualquer documento recebe todos os rótulos | **Regras:** tirar "inscrição" dos sinônimos de `titulo`. Depois, `documentos[].campos` (opcional) para filtrar os campos. |
| 6 | **doc-05** Documentos não reconhecidos: o anexo "Título de eleitor" nunca fica marcado | **Regras:** criar documentos `titulo`, `trct` e `holerite`, com avisos educativos. |
| 7 | **doc-06** PDF misto não passa por OCR; páginas depois da 5ª são ignoradas sem aviso; pdf.js nunca é liberado. `extract.js:149-162` | `pdf.destroy()` num finally. OCR por página, com `ocrMaxPaginas` em `config` e aviso "li só as N primeiras páginas". |
| 8 | **doc-10 (partes P)** OCR pesado | Limitar o lado maior a ~3000 px (`createImageBitmap` com resize). Desligar hocr/tsv. Hash SHA-256 local para descartar arquivo repetido. |
| 9 | **doc-09 (partes P)** Formatos | Tirar .tif/.tiff do accept. CSV em UTF-8 com `fatal`, caindo para windows-1252. Planilha só vira rubricas se o cabeçalho bater. |
| 10 | **rob-07** Ao entrar no formulário, o Assistente abre e rola todas as listas e rouba o foco. `panel.js:157-161` | Carregar só os campos com `fonte:'empregado'`. Guardar e devolver `document.activeElement` em `openCombo`/`closeCombo`. |
| 11 | **qt-07** `pickCombo` aceita opção "parecida" com 60% sem avisar | Score abaixo de 0,99 → `{ok:true, aproximado:true}`, e o painel marca o campo como "confira". `similarity` com fronteira de palavra ("MARIA SILVA" ≠ "MARIA SILVANA"). |
| 12 | **ideia-06** A coleta da equipe grava `[]` antes da resposta e não tenta de novo. `panel.js:1405-1408` | Não gravar `[]`, tentar de novo no próximo contexto e recarregar quando trocar de empresa. |
| 13 | **ideia-01** A dica de rubricas promete conferir os nomes, mas o código não confere | **Regras:** corrigir a dica já. Depois, conferir com `E.bestMatch` contra `empregadosDaEmpresa()`. |

**Testes:**
- ASO/CAT com opções impressas;
- empate de nomes;
- aviso de férias assinado;
- pedido de demissão com "admitido em";
- comprovante de CPF no Cadastro;
- PDF misto (gerado por `tools/gerar-exemplos-atestados.py`, com dados fictícios).

## Onda 3 — canal de regras seguro (código + ferramentas)

- **rm-01 / seg-08:**
  - comparar versões por número em `background/service-worker.js:59` (`localeCompare(..., {numeric:true})`), numa função testável;
  - motivo: como texto, "2026.10.13-3" é considerado maior que "2026.10.13-10".
- **rm-02:**
  - fazer o `broadcast` só se o conteúdo mudou (sw:63);
  - deixar um ouvinte só no painel (panel.js:62 ou :92);
  - preservar `#free-txt` e `#q` ao redesenhar;
  - motivo: hoje, a cada 30 min, o que o cliente digitava no Início some.
- **rm-03:**
  - `validarRegras()` como função pura no `engine.js`: listas são listas, referências cruzadas existem, tipos de verificação são conhecidos, datas são ISO e regex compilam;
  - guardar `rulesUltimaBoa` e nunca gravar por cima com regra inválida;
  - `requerExtensao` opcional.
- **rm-06 / qt-06:** criar `tests/regras.test.mjs`, que lê `REGRAS=<caminho>` e confere:
  - tipos de verificação, campos referenciados e placeholders;
  - `fc` no simulador;
  - datas ISO em `feriados` e `avisosEscritorio`;
  - `regras.schema.json` com `$schema`, para ter autocompletar no VS Code.
- **rm-05:**
  - corrigir o README (passo 4): uma fonte só da verdade, que é editar em `rules/` e publicar por cópia;
  - criar `tools/publicar-regras.mjs`, que baixa a publicada, mostra o diff, roda lint e testes, gera a próxima `versao` e copia.
- **rm-10 / cx-08 / seg-06:**
  - URL das regras e seção Desenvolvimento só com `info.unpacked`;
  - botão "Restaurar endereço padrão";
  - `tools/empacotar-loja.sh` gera o manifest sem localhost, gist e *.github.io.
- **seg-05:** SheetJS 0.18.5 → 0.20.3 (tarball de cdn.sheetjs.com) em `tools/baixar-libs.sh` (versão e SHA-256), mais o commit do novo `lib/xlsx`. Motivo: dois CVEs conhecidos.
- **seg-09:**
  - CSP completa: `connect-src 'self' https://raw.githubusercontent.com`, `img-src`, `form-action 'none'` etc.;
  - teste de rede no Playwright: nenhuma requisição fora de onvio, raw.githubusercontent e localhost.
- **rm-11:** documentar que `empresas` no repositório público expõe nomes de clientes. Escolher a chave **mais específica** em vez da primeira (`panel.js:80-86`).

## Onda 4 — só regras (sem código; publicável quando o Josué quiser)

- **leg-13 (urgente pela data):** recados no Início com `avisosEscritorio`:
  - 1ª parcela do 13º até 30/11;
  - 2ª parcela até 20/12/2026, **que é domingo → pagar até sexta, 18/12**;
  - férias coletivas: comunicar com 15 dias de antecedência.
- **leg-09 (férias):**
  - `intervalo` informativo: no fracionamento, um período ≥ 14 dias;
  - `prazoEscritorio` sobre `inicioGozo` (30 dias + o tempo do escritório).
- **leg-05:**
  - admissão para hoje já está fora do prazo do eSocial (exige `incluiHoje` no código, 2 linhas);
  - idade mínima com aviso para menor de 18.
- **leg-10 (parte regras):** `info` "Antes de desligar, confirme estabilidade (gestante, acidente, CIPA, dirigente sindical…)" com `condicao {campo:'avisoDadoPor', igual:'EMPREGADOR'}`, em avisoRescisao e calculoRescisao.
- **cx-13 (parte P):** ligar `envioOk`, `semEmpregado` e `contatoSuporte`, que já estão nas regras mas o código não lê. Mover para as regras o `exemploTexto` e a ajuda de aviso/cálculo.
- **leg-07 (parte regras):** texto separado para início de férias em domingo ou feriado (PN 100 do TST).

## Onda 5 — experiência do cliente

- **cx-10:**
  - faixa "Próximo passo" no topo do Preencher ("Falta 1 coisa: escolha o Tipo de afastamento [Mostrar]");
  - "Faltam N itens" no lugar de "3/7 ok".
- **cx-12:**
  - mostrar na linha "Lido no documento: «trecho»", aberto quando a confiança for baixa;
  - nunca mostrar trecho com CID.
- **cx-03:**
  - cartão do Início honesto quando a leitura falha;
  - corrigir "acima" para "abaixo";
  - não perder o arquivo quando o cliente usa a busca.
- **cx-05:**
  - Pendências com estado de erro explícito, em vez de "0 aguardando você";
  - lista de itens "aguardando".
- **cx-06:**
  - tirar `aria-live` de `#view` e usar um `role=status` curto;
  - `updateChecks` só redesenha quando a lista mudar;
  - contraste dos chips.
- **cx-09:**
  - área de soltar logo abaixo de "Escreva com suas palavras";
  - soltar arquivo em qualquer lugar do painel.
- **leg-06:** com aviso indenizado e data de demissão posterior à do aviso, mostrar uma "atenção" com as duas datas-limite; texto próprio para prazo vencido.
- **leg-07 (código):** início das férias no próprio domingo ou feriado; data de pagamento em dia não útil.
- **doc-11 (primeiro passo):** `config.confiancaMinimaParaPreencher`. Abaixo do limite, o campo vira "sugestão — confirme" com um clique.

## Onda 6 — testes e infraestrutura

- **qt-03:**
  - `tests/requirements.txt` com `playwright==1.56.0`; o pip mais novo não acha o Chromium do ambiente;
  - `.github/workflows/testes.yml` rodando engine, json.tool, e2e e sim_test.
- **qt-08:**
  - no simulador, registrar todo clique em ADICIONAR;
  - exigir que cada clique não confiável tenha um gesto do cliente nos 3 s anteriores;
  - cenário do Enter num campo;
  - conferir que o CID não aparece no armazenamento.
- **qt-13:** migrar `engine.test.mjs` para `node:test`; golden files de OCR fictícios.
- **qt-09:** `E.prazos(tipo, valores, rules, hoje)` único para Calcular, Agenda e derived, com testes em tabela.
- **qt-10 (passo 1):** `montarPedidos` para o engine; `documentos[].neutro` e `tipos[].chaveRepetido` nas regras.
- **qt-11:** uma pasta só de exemplos; `invariant=1` no reportlab.
- **qt-02:** trocar as esperas fixas por condições (`wait_for_function`). Provável causa das 8 falhas na primeira execução.

---

## Apostas criativas (fora da caixa), em ordem de recomendação

1. **"Anjo da guarda trabalhista"** (leg-10 + leg-11 + leg-12):
   - checar estabilidade antes de desligar, cruzando com o histórico local (acidente nos últimos 12 meses);
   - regra dos 60 dias: "É a mesma doença?", somando os atestados e indicando INSS acima de 15 dias;
   - períodos aquisitivo e concessivo, com alerta de férias em dobro.

   Evita os erros mais caros de um cliente leigo.
2. **Lembretes fora do portal + "Resumo do dia"** (ideia-04 + ideia-03):
   - alarme diário local e notificação que o cliente liga;
   - cartão no Início com o que espera o cliente (os dados de `fetchPendencias` já existem e hoje são jogados fora).

   Ataca a maior dor do escritório: solicitação parada esperando o cliente. Depende da ideia-02 (Agenda certa).
3. **"Contrato de tela" verificável** (rob-12 + qt-12):
   - seletores e textos do botão de envio nas regras; hoje `tipos[].botaoEnviar` existe mas o código não usa;
   - autoteste de leitura em modo dev contra o Onvio real, terminando em CANCELAR e com envio sempre bloqueado.

   Protege contra mudanças da Thomson Reuters.
4. **"Me guie passo a passo"** (cx-11): balões no próprio portal, campo por campo, reaproveitando `camposFaltando`, `reveal`, `flash` e `markMissing`. Sem capturar Enter nos campos.
5. **Documentos prontos para assinar** (ideia-08): termo de prorrogação de experiência, requerimento de abono e de 1ª parcela do 13º, gerados no computador com texto aprovado pelo escritório nas regras.
6. **Calendário do mês do DP + checklist de fechamento** (ideia-05): `calendarioDP` nas regras, `calendarioDoMes` puro, exportação .ics local. Depende de definir `diaLimiteRubricas`.
7. **Vigia de dados sensíveis** (seg-10): na conferência, avisar quando a descrição ou as observações tiverem CID ou CPF digitado pelo cliente.
8. **IA local verificável** (doc-12 + ideia-10):
   - toda resposta do Gemini Nano precisa citar um trecho que existe no documento; escolhas fechadas com enum;
   - dúvidas respondidas só com a FAQ e as dicas;
   - lista de perguntas sem resposta, que o cliente decide copiar.
9. **Modo treino** (ideia-11): simulador dentro da extensão, com armazenamento separado.
10. **"Seu mês com o Assistente"** (ideia-09): contadores agregados, sem nomes, que o cliente decide copiar. Mede adoção sem telemetria.
11. **Regras assinadas + testes dentro das regras + diff de comportamento** (seg-01, rm-07, rm-08); depois, **Estúdio de regras** (rm-09).
12. **Modo conferência para o analista** (ideia-12): ficha de leitura de um documento baixado, com o CID escondido.

## A calibrar no Onvio real (sessão com o Chrome do Josué)

- **rob-09:** anexos aceitos ou recusados; botão de remover.
- **cx-05 / ideia-03:** formato dos itens de pendências.
- **leg-12:** `hireDate`.
- **rob-05 / rm-11:** `clientId` como identidade da empresa.
- **rob-11:** troca de formulário.
- **qt-12:** contrato de tela.

## Contestados ou descartados (não reintroduzir como estão)

- **rob-04:** substituído pelo qt-07 (aproximado → "confira").
- **rob-06:** guarda sem confirmação de resposta; entra só como ack simples, se necessário.
- **Também contestados:** rob-08, rob-09, rob-11, seg-06, seg-07, rm-12, qt-02 (contestados em parte; as partes úteis estão nas ondas acima).
- **leg-08:** os feriados nacionais de 2026–2027 estão corretos; pontos facultativos são decisão do escritório.
- **Duplicatas da trava de envio:** cx-07, rm-04, seg-02.

---

## Execução nesta sessão (escolhida pelo Josué: Ondas 1 e 2 + recados do 13º)

1. Salvar este roteiro em `docs/roteiro-melhorias.md`, com as tabelas completas e as referências arquivo:linha. Commit separado.
2. Implementar a **Onda 1** (1.3.2), um commit por assunto, em português, com o teste de cada correção. Subir `version` no `manifest.json`, `CHROMEWEBSTORE.md` (histórico) e o README, se o uso mudou.
3. Implementar a **Onda 2** (1.3.3) do mesmo jeito. As partes que são só regras entram em `rules/regras.json`, com a `versao` aumentada.
4. **leg-13:** acrescentar em `rules/regras.json` (só no arquivo local) os recados de 2026:
   - 1ª parcela do 13º até 30/11;
   - 2ª parcela até 20/12, que cai no domingo, então pagar até 18/12;
   - férias coletivas de fim de ano.

   Datas `desde`/`ate` em AAAA-MM-DD. **Não** publicar no repositório de regras.
5. Para dividir o trabalho, usar agentes em paralelo onde os arquivos não se cruzam (engine/regras × content × panel), conferindo cada diff.
6. Rodar todos os testes e só então fazer o push em `claude/hopeful-meitner-dx1see`. Não publicar regras no repositório público, nem abrir PR, sem pedido.

## Verificação

- `node tests/engine.test.mjs`: casos novos de aviso, INSS, datas, anexos, ASO, empate e classificação.
- `pip install playwright==1.56.0 && python tests/e2e.py`: inclui "Conferir e enviar" com a conferência desligada.
- `bash tools/build-simulador.sh <scratch>/sim && python tests/sim_test.py <scratch>/sim`: com o código de saída corrigido; envio recusado, desfazer depois de CANCELAR, lote e remoção durante a leitura.
- `python -m json.tool rules/regras.json`.
- Revisão do diff contra as regras inegociáveis do CLAUDE.md: nunca clicar em enviar sozinho; CID fora; nada sai do computador.
