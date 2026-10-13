# Assistente do Portal do Cliente — ControlTax

Extensão Chrome (Manifest V3) que age por cima do Onvio Portal do Cliente na visão do cliente: lê documentos arrastados, abre a solicitação certa, preenche, anexa e confere antes do envio. Dono: Josué Porfírio (Processos e Automação, ControlTax). Idioma de tudo que o cliente vê: português do Brasil, tom educativo e nunca acusatório.

## Como trabalhamos (manter esta dinâmica)

1. **Entender antes de mexer.** Para qualquer mudança que dependa da tela do portal, inspecionar a tela real pelo Chrome (Claude in Chrome) no login de cliente teste — `docs/mapa-portal.md` tem o que já foi mapeado; atualize-o quando descobrir algo novo.
2. **Regra antes de código.** Se a mudança é campo, texto, prazo, documento reconhecido, dica, feriado ou intenção do Início, ela vai em `rules/regras.json` (chega aos clientes sem nova versão). Código só para mecânica nova.
   **Publicar regras para os clientes** = copiar `rules/regras.json` para `regras.json` na raiz do repositório público **josuep007-prog/assistente-portal-regras** (branch `main`) e subir a `versao` dentro do arquivo. A extensão lê `https://raw.githubusercontent.com/josuep007-prog/assistente-portal-regras/main/regras.json` (configurado em `DEFAULT_SETTINGS.rulesUrl`). Só publique depois dos testes passarem; JSON inválido é ignorado pela extensão, mas confira com `python -m json.tool`.
3. **Testar sempre:** `node tests/engine.test.mjs` e `python tests/e2e.py` (réplica local do portal; nada vai ao Onvio). Ao criar um tipo de verificação ou fluxo novo, acrescente um teste.
4. **Recarga automática:** com `python dev/dev_server.py` rodando, salvar um arquivo já recarrega a extensão no Chrome do Josué (regras sem recarregar). Não peça para ele recarregar na mão.
5. **Ao terminar:** subir `version` no `manifest.json` se mudou código, atualizar `CHROMEWEBSTORE.md` (histórico) e o README se mudou o uso; commit com mensagem em português.

## Segurança no portal real (inegociável)

- **Nunca** clicar em ADICIONAR, SALVAR E ENVIAR, RASCUNHO ou concluir trâmite no portal real. Testes de preenchimento terminam em CANCELAR.
- Anexos de teste no portal real: só arquivos fictícios, e remova antes de cancelar.
- Só a empresa de teste (EMPRESA EXEMPLO SIMPLES NACIONAL LTDA). Não abrir empresas de clientes reais sem o Josué pedir.
- Dados de saúde (CID) ficam fora da descrição por padrão. Nada de dados de cliente em logs, testes ou commits.
- A extensão não envia dados a lugar nenhum além do próprio portal. Não acrescentar telemetria, APIs externas ou IA em nuvem.

## Simulador (artefato) — onde as melhorias são testadas

- `simulador/` + `platform/shim.js` formam uma réplica do Portal do Cliente que roda o **mesmo** `content/`, `panel/` e `rules/` da extensão. O shim imita `chrome.runtime`/`chrome.storage` só quando não há extensão (`chrome.runtime.id` ausente); na extensão ele não faz nada.
- `simulador/portal.js` reproduz a estrutura de tela de `docs/mapa-portal.md` (formcontrolname, bento-combobox, rádios `radioBasic-*`, etapas do cadastro, seletor de anexos). Se o mapa mudar, mude os dois.
- O content script usa `window.__ctPlatform` (rota, navegação, listas) quando existe; no Onvio real ele não existe e vale o comportamento normal.
- Montar: `bash tools/build-simulador.sh <pasta>` (troca `.gz` por `.gz.wasm`, escapa bytes de controle do pdf.js e tira o SheetJS, que no simulador vem do cdnjs — restrições do publicador de artefatos).
- Testar: `python tests/sim_test.py <pasta>`.
- Publicado em https://claude.ai/artifact/2Mm1k4ynUjSmCKgu47PnMR (republicar a partir de uma sessão do claude.ai/Cowork com a ferramenta de artefatos; o Claude Code na nuvem não publica artefatos).
- **"Transformar de volta em extensão"** não exige conversão: é o mesmo código. Basta subir `version` no `manifest.json`, rodar os testes e carregar a pasta no Chrome (ou empacotar).

## Trabalhando no Claude Code na nuvem

- `lib/` e `fonts/` não estão no Git: o gancho `SessionStart` (`.claude/settings.json`) roda `tools/baixar-libs.sh`, que baixa do npm as versões fixas e confere o SHA-256. Se faltar algo, rode o script à mão. Para trocar a versão de uma biblioteca, atualize o script (versão e hash) junto.
- Os testes com navegador precisam do Playwright para Python (`pip install playwright`; o Chromium do ambiente já serve — use `channel='chromium'`).
- Não há acesso ao Chrome do Josué nem ao Onvio real: valide tudo no simulador e nos testes (rodam sem tela: `headless` com `channel='chromium'`).
- Mudanças que dependem da tela real (ex.: grade de rubricas) ficam marcadas como "a calibrar" e são conferidas depois numa sessão com o Chrome do Josué.
- Commits pequenos, em português, um assunto por commit.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `manifest.json` | MV3; host onvio.com.br; CSP com `wasm-unsafe-eval` (OCR). |
| `background/service-worker.js` | Regras: dev (localhost:35729) → URL remota (`DEFAULT_SETTINGS.rulesUrl`/Configurações) → cache → embutida. Guarda regras como **texto** (chrome.storage reordena chaves). WebSocket do modo dev, atalho Alt+Shift+A, selo. |
| `content/content.js` | "Mãos" no portal (mundo isolado): Shadow DOM fechado com botão, iframe do painel, sobreposição de arrastar; lê a tela (`snapshot`), preenche (`fillForm`, `pickCombo`, `setRadio`, `attachFiles`, `reveal` para etapas/abas), intercepta envio (clique e `submit`), consulta pendências com o cookie do usuário. |
| `panel/panel.js` | Interface (Início com introdução, texto livre e modelos; Preencher com etapas, checklist de documentos, barra de ações e resumo antes do envio; Pendências; Agenda de prazos + histórico; Calcular; Configurações) e orquestração. |
| `panel/engine.js` | Motor puro, testável em Node: classificação de documentos, extração (rótulos/sinônimos que param no próximo rótulo, regex, endereço de comprovantes, ASO, nome do empregado na lista inclusive só pelo primeiro nome), texto livre (`parseFreeText`, `findDates`), verificações, prazos, modelos de texto, calendário com feriados. |
| `panel/extract.js` | Leitura local: pdf.js (texto), Tesseract por OCR com pré-tratamento de fotos (escala, cinza, contraste), SheetJS (planilhas), IA do Chrome opcional. |
| `rules/regras.json` | O "cérebro" editável — ver README para o mapa dos blocos. |
| `lib/`, `fonts/` | Bibliotecas e fontes empacotadas (não editar; fora do Git, recriadas por `tools/baixar-libs.sh`). |

**Comunicação conteúdo ↔ painel:** `MessageChannel` privado (o conteúdo manda `ct-hello` ao iframe). Mensagens: `context`, `files`, `fill`/`fillResult`, `getOptions`, `navigate`, `highlight`, `markMissing`, `requestSubmit` (botão "Conferir e enviar"), `submitAttempt`/`confirmSubmit`, `pendencias`, `formClosed`, `toast`, `setBadge`.
**Lote (vários arquivos):** `handleVarios` lê tudo, `montarPedidos` separa um pedido por atestado (`config.umPedidoPorDocumento`) e um por tipo para o resto (CAT da mesma data acompanha o atestado; documentos neutros só entram se houver um único pedido possível). `abrirPedido` limpa o trabalho do tipo, abre o formulário, reanalisa com a lista de empregados e preenche; `onFormClosed` → `loteAoFecharFormulario` marca enviado e abre o próximo (fechou sem enviar = pausa).
**Empregados:** `loadEmpregados` é uma carga por vez por tipo, com novas tentativas; se a lista da tela vier vazia, usa `employees` do conteúdo, que repete a chamada `/api/br-payroll-sr/v1/clients/<id>/employees` que o portal já fez (endereço tirado do `performance`, só se feita depois da troca de empresa). A lista do combobox no portal real é virtualizada (~13 nomes no DOM). Primeiro nome repetido → `W.candidatos` e botões "Qual deles?". Operações de combobox no conteúdo passam por `comboLock`.
**Não encontrado:** `marcarFaltando` (painel) usa os obrigatórios em erro + `esperadoDoDocumento` do tipo; manda `markMissing` ao conteúdo, que desenha `.ct-missing`/`.ct-miss-tag` no portal. Campos bloqueados pelo portal não contam como obrigatórios.
**Versão das regras:** se as embutidas tiverem `versao` maior que as remotas/cache, valem as embutidas (atualizar a extensão não depende de publicar). Mantenha as regras compatíveis com versões antigas da extensão (ex.: `assunto` antigo continua; o novo formato fica em `assuntos`). `tests/e2e.py` serve as regras desta pasta no lugar das publicadas.
**Painel encaixado:** em telas ≥ 1000px a página ganha `margin-right: 420px` (`html.ct-docked`) para o painel não cobrir o botão ADICIONAR.
**Arquivos atravessam o canal como bytes** (`{name,type,buf}` + transferência do ArrayBuffer) e são remontados com `new File` do outro lado — passar `File` direto entre a página e o iframe da extensão derrubou a aba nos testes.

## Design

Mesmo sistema do Control Hub: tokens em `panel/panel.css` (`--masthead #0E151B`, `--brand-red #C2000C`, `--blue-deep #3C659B`, raio 4px, sombras suaves), Archivo nos títulos, IBM Plex Sans no texto, IBM Plex Mono em números/datas, tema claro/escuro. Ícones SVG em linha em `panel.html`. Sem frameworks.

## Pendências conhecidas

- Lote de atestados e avisos de "não encontrado" (1.2) testados só no simulador: conferir no Onvio real se, depois de ADICIONAR, o portal volta à lista (é isso que dispara a próxima solicitação) e onde a etiqueta de aviso aparece nos campos reais.
- "Novo afast. mesma doença" não é escolhido automaticamente (depende do histórico do INSS); avaliar com o escritório.
- Melhorias da versão 1.1 testadas só no simulador: conferir no Onvio real (painel encaixado, "Conferir e enviar", combobox de UF por extenso).
- Num teste sem tela, cliques nos últimos ~30px da altura do painel não chegavam ao iframe; o aviso "Antes de enviar" foi centralizado. Conferir no Chrome real se a barra de ações fixa no rodapé responde bem.
- Grade do Lançamento de Rubricas não mapeada (empresa de teste sem eventos) — hoje a planilha vira resumo na descrição.
- Formato dos itens das listas (pendências) não visto; tratamento genérico em `fetchPendencias`.
- Endpoint da lista de Solicitação Geral não identificado.
- Definir com o escritório: `config.diaLimiteRubricas`.
- Existe outro protótipo no repositório josuep007-prog/Assistente-Onvio (v0.2.0, branch `claude/clever-cerf-pdwl3u`) — decidir com o Josué se vira a base ou se é arquivado.

## Comandos

```
bash tools/baixar-libs.sh             # recria lib/ e fonts/ depois de clonar
python dev/dev_server.py              # recarga automática (deixar aberto)
node tests/engine.test.mjs            # motor de regras
python tests/e2e.py                   # extensão carregada numa réplica do formulário (pip install playwright; python -m playwright install chromium)
bash tools/build-simulador.sh ../simulador-artefato && python tests/sim_test.py ../simulador-artefato   # simulador completo
```
