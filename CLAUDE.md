# Assistente do Portal do Cliente — ControlTax

Extensão Chrome (Manifest V3) que age por cima do Onvio Portal do Cliente na visão do cliente. Desde a 2.0 é uma **plataforma em tela cheia** (estilo do módulo DP do Control Hub) que cobre o portal e o controla por trás: acompanha solicitações, funcionários, prazos e documentos, lê documentos arrastados, abre a solicitação certa, preenche, anexa e confere antes do envio. Dono: Josué Porfírio (Processos e Automação, ControlTax). Idioma de tudo que o cliente vê: português do Brasil, tom educativo e nunca acusatório.

## Como trabalhamos (manter esta dinâmica)

1. **Entender antes de mexer.** Para qualquer mudança que dependa da tela do portal, inspecionar a tela real pelo Chrome (Claude in Chrome) no login de cliente teste — `docs/mapa-portal.md` tem o que já foi mapeado; atualize-o quando descobrir algo novo.
2. **Regra antes de código.** Se a mudança é campo, texto, prazo, documento reconhecido, dica, feriado ou intenção do Início, ela vai em `rules/regras.json` (chega aos clientes sem nova versão). Código só para mecânica nova.
   **Publicar regras para os clientes** = copiar `rules/regras.json` para `regras.json` na raiz do repositório público **josuep007-prog/assistente-portal-regras** (branch `main`) e subir a `versao` dentro do arquivo. A extensão lê `https://raw.githubusercontent.com/josuep007-prog/assistente-portal-regras/main/regras.json` (configurado em `DEFAULT_SETTINGS.rulesUrl`). Só publique depois dos testes passarem; JSON inválido é ignorado pela extensão, mas confira com `python -m json.tool`.
3. **Testar sempre:** `node tests/engine.test.mjs` e `python tests/e2e.py` (réplica local do portal; nada vai ao Onvio). Ao criar um tipo de verificação ou fluxo novo, acrescente um teste.
4. **Recarga automática:** com `python dev/dev_server.py` rodando, salvar um arquivo já recarrega a extensão no Chrome do Josué (regras sem recarregar). Não peça para ele recarregar na mão.
5. **Ao terminar:** subir `version` no `manifest.json` se mudou código, atualizar `CHROMEWEBSTORE.md` (histórico) e o README se mudou o uso; commit com mensagem em português.
6. **Mesclar na `main` ao final de toda alteração** (pedido do Josué): depois dos testes passarem, subir a branch, abrir/atualizar o PR e mesclá-lo na `main` — o "Download ZIP" do GitHub (branch `main`) precisa vir sempre com a versão nova. Mesclar só com os testes verdes.

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

- `lib/` e `fonts/` estão no Git (desde 1.2.5, para o "Download ZIP" do GitHub virar uma extensão completa). `tools/baixar-libs.sh` recria as pastas a partir do npm com versões e SHA-256 fixos, se faltarem (o gancho `SessionStart` roda o script; ele não faz nada quando as pastas existem). Para trocar a versão de uma biblioteca, atualize o script (versão e hash) junto.
- Os testes com navegador precisam do Playwright para Python (`pip install -r tests/requirements.txt`, que fixa o Playwright 1.56.0 — versões mais novas pedem outro Chromium; o do ambiente já serve — use `channel='chromium'`).
- Não há acesso ao Chrome do Josué nem ao Onvio real: valide tudo no simulador e nos testes (rodam sem tela: `headless` com `channel='chromium'`).
- Mudanças que dependem da tela real (ex.: grade de rubricas) ficam marcadas como "a calibrar" e são conferidas depois numa sessão com o Chrome do Josué.
- Commits pequenos, em português, um assunto por commit.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `manifest.json` | MV3; host onvio.com.br; CSP com `wasm-unsafe-eval` (OCR). |
| `background/service-worker.js` | Regras: dev (localhost:35729) → URL remota (`DEFAULT_SETTINGS.rulesUrl`/Configurações) → cache → embutida. Guarda regras como **texto** (chrome.storage reordena chaves). WebSocket do modo dev, atalho Alt+Shift+A, selo. |
| `content/content.js` | "Mãos" no portal (mundo isolado): Shadow DOM fechado com botão, iframe do painel, sobreposição de arrastar; lê a tela (`snapshot`), preenche (`fillForm`, `pickCombo`, `setRadio`, `attachFiles`, `reveal` para etapas/abas), intercepta envio (clique e `submit`), consulta pendências com o cookie do usuário. |
| `panel/plataforma.js` + `plataforma.css` | Plataforma 2.0 (tela cheia): trilho, cabeçalho, Painel, Solicitações, Novo pedido (usa `renderPreencher`), Funcionários, Agenda (lembretes), Documentos (modelos para assinar), busca Ctrl+K, diálogos. Recebe de `panel.js` as funções que já existem (`montarPlataforma(A)`); dados em `S.plat`. |
| `panel/panel.js` | Interface (Início com introdução, texto livre e modelos; Preencher com etapas, checklist de documentos, barra de ações e resumo antes do envio; Pendências; Agenda de prazos + histórico; Calcular; Configurações) e orquestração. |
| `panel/engine.js` | Motor puro, testável em Node: classificação de documentos, extração (rótulos/sinônimos que param no próximo rótulo, regex, endereço de comprovantes, ASO, nome do empregado na lista inclusive só pelo primeiro nome), texto livre (`parseFreeText`, `findDates`), verificações, prazos, modelos de texto, calendário com feriados. |
| `panel/extract.js` | Leitura local: pdf.js (texto), Tesseract por OCR com pré-tratamento de fotos (escala, cinza, contraste), SheetJS (planilhas), IA do Chrome opcional. |
| `rules/regras.json` | O "cérebro" editável — ver README para o mapa dos blocos. |
| `lib/`, `fonts/` | Bibliotecas e fontes empacotadas (não editar; no Git; `tools/baixar-libs.sh` recria se faltar). pdf.js é importado sob demanda em `extract.js` — sem `lib/` o painel abre e mostra um aviso, em vez de ficar em branco. |

**Plataforma (2.0) — um iframe, três modos:** o conteúdo tem `modo` = `fechado` (só o botão), `painel` (encaixado, `html.ct-docked`) ou `plataforma` (`.frame-wrap.full`, tela cheia, `html.ct-plataforma` sem rolagem). Trocar de modo só muda CSS; o iframe é o mesmo (um só `S.work`). O modo vai no `context` e na mensagem `modo`; o painel move o `#view` entre `.app` (abas antigas) e `#plat` (`aplicarModo`). Os nomes das vistas são os mesmos nos dois modos (`inicio`, `preencher`, `pendencias`, `historico`, `ferramentas`, `config`, e só na plataforma `funcionarios` e `documentos`) para a lógica antiga (`S.view === 'preencher'`) continuar valendo; `render()` chama `P.render` na plataforma. Modo ao abrir: `prefs.abrirComo` (padrão plataforma; o simulador aceita `?modo=painel`). O portal fica renderizado por baixo (não usar `inert` nem `display:none`): `fillForm`/`pickCombo` funcionam coberto, e o conteúdo devolve o foco ao iframe depois de preencher.
**Formulário próprio (2.0):** só na plataforma, `renderFieldsOnly` → `renderFormularioProprio`: um campo por campo do portal que existe na tela (agrupado por `campos.*.grupo`), bloqueado quando o portal bloqueia. O que o cliente escreve fica em `W.valores` com `W.fonteVerdade[k] = 'plataforma'` (vale mais que o portal em `valoresParaChecar` e `fillPortal`) e vai ao portal ao sair do campo (`agendarEnvioPortal`, ou já no "Conferir e enviar" com `enviarPendenteAgora`). Enquanto o foco está no formulário, só os estados mudam (`atualizarEstadosPlat`). O resumo antes de enviar lê o portal e acusa valor não aceito (`naoAceitosPeloPortal`). No modo encaixado continua "o portal é o formulário" (1.3.1).
**Adaptador do portal (2.0, em `content.js`):** `solicitacoes` (todas as páginas de cada lista, 3 tipos por vez, itens crus; o painel normaliza com `E.normalizarSolicitacao`/`classificarEstado` e `config.statusSolicitacao`), `employees` com `aquecer` (sem lista conhecida e sem formulário aberto, abre por baixo uma solicitação com Empregado, espera a chamada do portal e volta, com `navInterna` — nada de `context`/`formClosed` nesse meio-tempo), `clientId()` (tirado do `performance`, só na memória), `documentos`/`baixarDocumento`, `abrirNoPortal` (detalhe só com `plat.detalhe` ou `config.rotaDetalheSolicitacao`; senão a lista) e `portalAtencao` (janela do portal ou 401 enquanto coberto). Sair de um formulário sem enviar marca `W.abandonado` e o próximo documento/pedido começa do zero.
**Comunicação conteúdo ↔ painel:** `MessageChannel` privado (o conteúdo manda `ct-hello` ao iframe). Mensagens: `context` (com `modo`), `modo`, `solicitacoes`, `portalInfo`, `documentos`, `baixarDocumento`, `abrirNoPortal`, `portalAtencao`, `files`, `fill`/`fillResult`, `getOptions`, `navigate`, `highlight`, `markMissing`, `undo`/`undoState`/`undoStart`/`undone`, `requestSubmit` (botão "Conferir e enviar"), `submitAttempt`/`confirmSubmit`, `pendencias`, `formClosed`, `toast`, `setBadge`.
**Lote (vários arquivos):** `handleVarios` lê tudo, `montarPedidos` separa um pedido por atestado (`config.umPedidoPorDocumento`) e um por tipo para o resto (CAT da mesma data acompanha o atestado; documentos neutros só entram se houver um único pedido possível). `abrirPedido` limpa o trabalho do tipo, abre o formulário, reanalisa com a lista de empregados e preenche; `onFormClosed` → `loteAoFecharFormulario` marca enviado e abre o próximo (fechou sem enviar = pausa).
**Empregados:** `loadEmpregados` é uma carga por vez por tipo, com novas tentativas; se a lista da tela vier vazia, usa `employees` do conteúdo, que repete a chamada `/api/br-payroll-sr/v1/clients/<id>/employees` que o portal já fez (endereço tirado do `performance`, só se feita depois da troca de empresa). A lista do combobox no portal real é virtualizada (~13 nomes no DOM): `comboOptions` rola o `cdk-virtual-scroll-viewport` para juntar tudo (e marca `virtual`; o painel então soma a lista da empresa) e `pickCombo`, quando não acha exato, digita para filtrar (sem `blur`, que fecharia a lista) e, se preciso, rola a lista até a opção. O simulador imita isso em listas com mais de 13 itens (a Afastamento tem 24 empregados de A a W). Primeiro nome repetido → `W.candidatos` e botões "Qual deles?". Operações de combobox no conteúdo passam por `comboLock`.
**Versão da página:** o conteúdo manda `versao` no `context`; se for diferente da do painel (extensão atualizada sem recarregar o portal), o painel mostra "Recarregue a página (F5)". No `onInstalled` (update) o service worker recarrega as abas do portal que não estão em `/add`.
**Texto livre não vai para a descrição:** `parseFreeText` só devolve campos entendidos; o texto digitado nunca é copiado para Observações/Descrição (pedido do Josué).
**Aviso ou cálculo:** no texto livre do Início, férias e desligamento mostram as duas opções (`ESCOLHA_AVISO_CALCULO`), com a mencionada no texto destacada.
**Não encontrado:** `marcarFaltando` (painel) usa os obrigatórios em erro + `esperadoDoDocumento` do tipo; manda `markMissing` ao conteúdo, que desenha `.ct-missing`/`.ct-miss-tag` no portal. Campos bloqueados pelo portal não contam como obrigatórios.
**Versão das regras:** se as embutidas tiverem `versao` maior que as remotas/cache, valem as embutidas (atualizar a extensão não depende de publicar). Mantenha as regras compatíveis com versões antigas da extensão (ex.: `assunto` antigo continua; o novo formato fica em `assuntos`). `tests/e2e.py` serve as regras desta pasta no lugar das publicadas.
**Leitor de atestados (1.3):** `lerAtestado` no `engine.js` (`lerDiasAtestado`, `lerDataAtestado`, `lerPacienteAtestado`, `lerCid`, `lerCrm`) — ativado por `documentos[].leitor = "atestado"` ou quando o documento não é reconhecido dentro de Afastamento. Cada campo leva como `fonte` o trecho do documento. Funcionário: `empregadoPorNome` (nome do paciente, tolerante a OCR); sem paciente na lista, `findEmployeeInText` em `semOutrasPessoas(texto)` (sem linhas de médico/mãe) e sem o atalho de só o primeiro nome. `avisosDoDocumento` lê `documentos[].avisos`. Calibrado com atestados reais que **não** ficam no repositório; os testes usam layouts iguais com dados inventados (`tools/gerar-exemplos-atestados.py`). Para medir de novo com exemplos novos: OCR com `panel/extract.js` num Chromium sem tela e comparar campo a campo — nunca copie o texto ou as imagens para o Git.
**OCR (1.3):** `ocrMelhor` em `extract.js` tenta 0° e, se a nota da leitura (`notaLeitura`: palavras de documento + confiança) for baixa, 90°/270° (foto deitada primeiro), limiar adaptativo e 180°; `readFile` devolve `confianca` e `rotacao`.
**Facilidades (1.3):** rascunho (`rascunhos` no storage, 7 dias; na mesma sessão, `entrouComDados` oferece continuar e `comecarDoZeroSeAbandonado` evita misturar dados antigos com um documento novo), pedido repetido (`S.historico`), experiência (`employees` devolve `detalhes` só com nome/admissão/ativo; `equipe` no storage guarda só admissões dos últimos 120 dias), `avisosEscritorio`, `faq`, `empresas` (ajustes de `config` por trecho do nome da empresa), colar com Ctrl+V (painel e página), `telaDiferente` (modo seguro), `textoDiagnostico` (sem nomes, valores, empresa nem CID).
**O portal é o formulário (1.3.1):** o painel não tem inputs dos campos do portal. `renderFieldsOnly` mostra o resumo "No portal" (estado por campo: Assistente / você / a preencher / vazio) e só edita `somenteAssistente` + observações. `sincronizarDoPortal` (no `context`) compara o portal com `W.ultimoPreenchido` (valores lidos depois de cada `fill`): campo mudado pelo cliente vira `editados` e nunca é sobrescrito (`fillPortal` também pula campo que o cliente preencheu); mudou um dado → `atualizarTextoNoPortal` regera assunto/descrição e reescreve só se o portal ainda tiver o texto gerado. `S.preenchendo` ignora contextos no meio de um preenchimento/desfazer. O conteúdo manda `context` também em `change`/`focusout` de campos.
**Desfazer (1.3.1):** `fillForm` lê os campos antes e depois e empilha só o que mudou + anexos novos (`desfazerPilha`, por tela; `semDesfazer` para a atualização automática do texto). `undo` (botão do painel ou "Desfazer" no aviso da página) restaura texto/data com `setNative`, combos com `pickCombo` ou `limparCombo`, rádios, e tira anexos com `removerAnexo` (botão de remover da linha — **calibrar no Onvio real**). Mensagens `undoState`/`undoStart`/`undone`; depois de desfazer, `W.pausarAuto` impede preencher sozinho até o cliente pedir.
**Painel encaixado:** em telas ≥ 1000px a página ganha `margin-right: 420px` (`html.ct-docked`) para o painel não cobrir o botão ADICIONAR.
**Arquivos atravessam o canal como bytes** (`{name,type,buf}` + transferência do ArrayBuffer) e são remontados com `new File` do outro lado — passar `File` direto entre a página e o iframe da extensão derrubou a aba nos testes.

## Design

Mesmo sistema do Control Hub (a plataforma segue o módulo Departamento Pessoal: trilho escuro `#111A21` com brilho vermelho no item ativo, `kpi-card`, `pn-card`, `dp-tabs`, `dp-toolbar`, `list-card`/`dp-listhead`, `pill-*`, `cmdk`): tokens em `panel/panel.css` (`--masthead #0E151B`, `--brand-red #C2000C`, `--blue-deep #3C659B`, raio 4px, sombras suaves), Archivo nos títulos, IBM Plex Sans no texto, IBM Plex Mono em números/datas, tema claro/escuro. Ícones SVG em linha em `panel.html`. Sem frameworks.

## Pendências conhecidas

- **2.0 testada só no simulador e no e2e** — a calibrar no Chrome do Josué (empresa de teste): formato real dos itens das listas e as situações (`config.statusSolicitacao`), rota do detalhe de uma solicitação (`config.rotaDetalheSolicitacao`), `clientId` e a lista de empregados pelo aquecimento, área de Documentos do Onvio (hoje "Abrir no portal"), lista da Solicitação Geral, janelas do portal e sessão expirada (`portalAtencao`), e se o Angular aceita o preenchimento com a página coberta (se não aceitar, recolher para `painel` durante o `fill`).
- No Chromium sem tela, o iframe da extensão em tela cheia não recebia cliques na parte de baixo até a janela ser redimensionada uma vez (o `e2e.py` faz isso). Conferir no Chrome real a barra de ações (Conferir e enviar).
- Modelos para assinar (`modelosDocumento`) e prazos da Agenda (`agendaFixa`) são sugestões: revisar com o escritório.

- 1.3.1 testado só no simulador: no Onvio real, conferir se limpar um combobox (desfazer de um campo que estava vazio) zera o valor do formulário Angular e qual é o botão de remover anexo.
- 1.3 testado só no simulador: conferir no Onvio real o colar (Ctrl+V) na página, o alerta de experiência (campo `hireDate` da API de empregados — formato ainda não confirmado) e o modo seguro.
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
python tools/gerar-exemplos-atestados.py   # atestados fictícios do simulador e dos testes
SIM_SO=13 python tests/sim_test.py <pasta>  # só os testes do simulador da versão 1.3
SIM_SO=20 python tests/sim_test.py <pasta>  # só os testes da plataforma (2.0)
python dev/dev_server.py              # recarga automática (deixar aberto)
node tests/engine.test.mjs            # motor de regras
python tests/e2e.py                   # extensão carregada numa réplica do formulário (pip install -r tests/requirements.txt; python -m playwright install chromium)
bash tools/build-simulador.sh ../simulador-artefato && python tests/sim_test.py ../simulador-artefato   # simulador completo
```
