# Arquitetura do código

## Motor de regras (`panel/engine.js` → `panel/engine/*.js`)

Desde a 2.16.2 o motor é dividido por assunto. `panel/engine.js` é só uma **fachada**: reexporta os mesmos 180 nomes de antes, então quem usa `import * as E from './engine.js'` (painel, testes, auditor) não muda nada. Puro (sem DOM), testável em Node.

| Módulo | O que tem |
|---|---|
| `base.js` | Texto (`norm`, `onlyDigits`), datas (`parseDate`, `addDays`, calendário) e validadores (CPF, PIS, CEP, e-mail) |
| `nomes.js` | Similaridade de nomes e escolha de funcionário (`bestMatch`, `findEmployeeInText`) |
| `leitor.js` | Leitor de documentos: classificação, `analyzeText`, extração por rótulos, confiança, certidões, uma pessoa por documento |
| `atestado.js` | Leitor de atestados (dias, data, paciente, CID, CRM) e avisos do documento |
| `pessoal.js` | Endereço (inclusive por blocos), UF, sim/não, experiência, documento pessoal (RG, CNH…) |
| `lote.js` | Um pedido por tipo e por pessoa; regra dos 60 dias |
| `tipos.js` | Tipos e campos, cadastros (o que se repete é da empresa) |
| `prazos.js` | Prazos compartilhados, valores derivados, datas calculáveis |
| `modelos.js` | Modelos de texto (assunto e descrição) |
| `verificacoes.js` | Verificações antes de enviar |
| `textolivre.js` | Texto livre: quantidades, datas, cartões de escolha, palpites, leitura do pedido, vários pedidos |
| `planilhas.js` | Variáveis da folha, grade e planilha de rubricas, catálogo da Solicitação Geral |
| `plataforma.js` | Solicitações, equipe, conversa, atenção, prazos legais, observações |
| `portal.js` | Documentos publicados pelo escritório (resposta da API) e a forma da resposta |

Os módulos se importam entre si (há dependências em ciclo, como no arquivo único de antes). Isso funciona porque os módulos só definem funções e constantes: **nada deve chamar função de outro módulo na hora do carregamento** (no nível de cima do arquivo), só dentro de funções.

### Onde pôr uma função nova
No módulo do assunto. Se ela for usada fora do motor, acrescente o nome na fachada (`panel/engine.js`).

### Testes
`node tests/engine.test.mjs` cobre tudo pela fachada.

## Plataforma (`panel/plataforma.js` → `panel/plataforma/*.js`)

Desde a 2.16.3 a plataforma em tela cheia é dividida por tela. `panel/plataforma.js` só monta as partes, na mesma ordem de antes, passando a todas o mesmo **contexto** `C` (o `S`, `$`, `esc`, `icon`, `request`, `send`, `toast`, `viewEl` e o `A` que o painel entrega). Cada parte é uma função `montarX(C)`.

| Parte | O que tem |
|---|---|
| `nucleo.js` | Estado (`S.plat`), `P`, funções de apoio (empresa, tipo, datas, carregando) |
| `casca.js` | Trilho, cabeçalho, indicador de leitura, seletor de empresa |
| `dados.js` | Leitura das solicitações e dos funcionários, leitura automática |
| `entrada.js` | Entrada, contexto, avisos, troca de tela (`P.render`) |
| `dialogos.js`, `eventos.js` | Diálogo genérico; eventos da agenda |
| `hoje.js` | Tela Hoje e atalhos que abrem um pedido já com dados |
| `solicitacoes.js` | Cartões, situações, lista, tabela e detalhe da solicitação |
| `novopedido.js`, `empresa.js` | Novo pedido; escolha e troca da empresa do pedido |
| `funcionarios.js`, `agenda.js` | Funcionários e ficha; agenda e lembretes |
| `documentos.js` | Documentos (das solicitações, do escritório, modelos, listas) |
| `busca.js` | Busca (Ctrl+K) |

**Como as partes se enxergam:** o que uma parte define e outra usa é registrado em `C` no fim dela (`Object.assign(C, {...})`). Uma parte que usa algo definido por uma parte que monta **antes** pega o valor direto de `C`; o que é definido por uma parte que monta **depois** (só funções) entra por um atalho que chama `C.nome(...)` na hora do uso. Por isso: **nada deve chamar, na hora da montagem, uma função de uma parte posterior**; dentro de funções (em tempo de uso) está tudo disponível. Estado que atravessa partes vai em `S.plat` (por exemplo `S.plat.desenhada`), não em `let` local.

### Onde pôr código novo
Na parte da tela. Se outra parte for usar, o nome entra no `Object.assign(C, …)` no fim do arquivo e, na parte que usa, na linha de `const { … } = C` (ou no atalho, se for de uma parte posterior).

## Camadas da extensão
Veja a tabela de arquitetura no `CLAUDE.md`: service worker (`background/`), mãos no portal (`content/`) e painel (`panel/`).

## Painel (`panel/panel.js` → `panel/painel/*.js`)

Desde a 2.16.4 o painel também é dividido por assunto. `panel/panel.js` ficou só com a montagem da plataforma e a partida; o resto está em módulos ES que se importam entre si (com ciclos, como no motor).

| Módulo | O que tem |
|---|---|
| `base.js` | Estado `S`, utilidades de interface, ícones, `request`/`send`, atalho `P` da plataforma |
| `conexao.js` | Conexão com a página, regras, preferências, contexto da página |
| `modo.js` | Modo (plataforma ou painel), navegação entre abas, `render` |
| `inicio.js` | Início e leitura de arquivos |
| `lote.js` | Vários arquivos: uma solicitação por documento |
| `valores.js` | Valores combinados (documento, texto e portal) |
| `preencher.js` | Aba Preencher |
| `formulario.js` | Formulário próprio da plataforma e preenchimento do portal |
| `portal.js` | Portal ↔ Assistente, resumo antes de enviar, modelos |
| `facilidades.js` | Rascunho, repetir, colar, diagnóstico |
| `historico.js` | Histórico e Pendências |
| `config.js` | Calculadoras e Configurações |

Regras: (1) nada chama função de outro módulo na hora do carregamento; (2) variáveis soltas que mudavam (`lastKey`, `reqId`…) agora ficam em `S.pv`; (3) os ouvintes de eventos de cada módulo ficam em `ligar()`, chamado por `panel.js` na ordem de antes; (4) `P` (a plataforma) é um atalho em `base.js`, preenchido por `definirPlat` no fim de `panel.js`.

## Conteúdo (`content/*.js`)

Desde a 2.17.0 o conteúdo que roda dentro do Onvio é dividido em 9 scripts comuns (o Chrome não carrega módulos como script de conteúdo). Eles **compartilham o escopo do mundo isolado**: o que um declara (`const`, `let`, `function`) os seguintes enxergam, como na época do arquivo único. A **ordem de carga** é a do `manifest.json` (e a do `simulador/index.html`): `opcoes`, `nucleo`, `interface`, `canal`, `leitura`, `preenchimento`, `desfazer`, `portal`, `api`, `final`. `pagina.js` continua à parte (mundo da página).

| Script | O que tem |
|---|---|
| `nucleo.js` | Constantes e estado compartilhado (`rules`, `port`, `modo`…) |
| `interface.js` | Shadow DOM: botão, painel, aviso; colar com Ctrl+V |
| `canal.js` | Canal privado com o painel e troca de modo |
| `leitura.js` | Leitura da tela e revelar etapas/abas |
| `preenchimento.js` | Preencher campos, combos, rádios, anexos; marcar o que falta |
| `desfazer.js` | Grade de rubricas e desfazer |
| `portal.js` | Trocar de empresa, pendências, adaptador da plataforma |
| `api.js` | Leituras da API com o acesso do portal, documentos, resposta |
| `final.js` | Conferência antes de enviar, arrastar e soltar, rotas, mensagens do service worker e a partida |

Regras: (1) uma parte nova entra na lista do manifest **e** do simulador; (2) nada chama, ao carregar, uma função de parte que vem depois (as chamadas de partida ficam em `final.js`); (3) cuidado com nomes: tudo no nível de cima é global do mundo isolado, então não repita nomes entre arquivos.
