# Assistente do Portal do Cliente — ControlTax

Extensão do Chrome que age **por cima** do Onvio Portal do Cliente (visão do cliente): lê documentos arrastados (PDF, foto, planilha), descobre qual solicitação abrir, preenche os campos, anexa o arquivo e confere tudo antes do envio. O portal continua sendo o caminho oficial — a integração com o Domínio não muda.

## O que ela faz

| Recurso | Como funciona |
|---|---|
| **Início guiado** | "O que você precisa fazer?" → abre a solicitação certa (resolve o uso da aba errada). |
| **Arrastar e soltar** | Solte o arquivo em qualquer lugar da tela. PDF com texto é lido na hora; foto e PDF escaneado passam por OCR em português. |
| **Preenchimento automático** | Empregado (comparado com a lista da empresa), datas, tipo, motivo, CAT, dados de admissão (CPF, RG, endereço, mãe, salário…), inclusive nas etapas do Cadastro de Empregado. |
| **Assunto e descrição padronizados** | Gerados a partir dos dados, editáveis. CID só entra se o cliente ativar (dado de saúde). |
| **Conferência antes de enviar** | Intercepta o ADICIONAR / SALVAR E ENVIAR: campos obrigatórios, anexos, prazos da CLT e prazos internos do escritório. Tom educativo — o cliente pode corrigir ou enviar assim mesmo (configurável). |
| **Documento na aba errada** | Se o cliente soltar um pedido de demissão em Afastamento, o assistente avisa e leva para Aviso Prévio de Rescisão. |
| **Pendências** | Conta as solicitações "aguardando o cliente" e mostra um selo no botão. |
| **Calculadoras** | Férias, aviso prévio proporcional, prazo de rescisão, afastamento (15 dias/INSS), experiência e dias úteis. |
| **Histórico** | Guarda (só no computador) o que foi preenchido/enviado para reaproveitar. |
| **Privacidade** | Tudo é processado localmente. Nenhum dado sai do computador além do que o próprio cliente envia ao portal. |

## Novidades da 2.5

- **Solicitações** no formato do escritório: cartões por tipo (`.tipo-c`, com "esperam você"), situações (`.hj-sit`) e cartões agrupados pela situação; Cartões, Lista ou Tabela (`ct.solVis`). O Hoje fica com o resumo (rosca, carrossel, próximos passos, Equipe, Atenção) e a rosca leva às Solicitações filtradas.
- **Várias empresas no mesmo login:** seletor com caixas de marcar (uma, várias ou todas; "só esta"; "Só a aberta no portal"), com quantas solicitações cada empresa tem em aberto e quantas esperam você. A escolha fica só na memória.
- **Funcionários:** lista com rolagem e a busca fixa; ficha do funcionário (dados do portal em português, tempo de casa, período aquisitivo, experiência, solicitações em aberto e Histórico das encerradas, atalhos Pedir/Simular). Nada é guardado.
- **Documentos:** "Nas solicitações" (arquivos dos trâmites, do escritório e os seus, por mês, com busca e filtro; lidos na hora, 40 solicitações por vez) e "Publicados pelo escritório" com categoria e competência.
- **Calcular:** "Limpar simulação"; Copiar e Pedir só com resultado.
- **Pedido:** botão "Outro tipo" volta à escolha; a barra de ações fica no rodapé do cartão "Dados do pedido".
- **Português sempre:** enumerações do Onvio em PascalCase ("ApprenticeContractTermination") e situações em inglês são traduzidas (`panel/dados.js`, `valorPt`).

## Novidades da 2.4 — do Control Onvio para o cliente

Tudo lido na hora com o acesso do próprio portal e nunca guardado (só o veredito de cada conversa, na memória).
- **Detalhe com abas:** Conversa (bolhas, você à direita e o escritório à esquerda, "N dias depois", o último em destaque e "Ver tudo"), Dados (a solicitação completa em português, como na aba Dados do escritório; sem CID, médico ou CRM na tela) e O que observar (frases de `config.observacoes` com as datas do pedido, mais alertas de prazo; "Copiar observações").
- **O escritório pede algo?** Lido nos trâmites com as palavras do escritório (`config.pedidoAoCliente`, `cortesiaCliente`): o cartão mostra "O escritório pediu: …"; se a resposta não pede nada, a solicitação vai para "Respondidas, nada pendente".
- **Atenção nas suas solicitações:** anexo citado sem arquivo (`config.anexoCitado`), pedido repetido e pedido na Geral que tem aba própria (`config.abaErrada`).
- **Prazos legais** no Hoje: pagamento dos cálculos de férias e rescisão em aberto e o eSocial das admissões (empregado: até o dia anterior ao início; estagiário: até 15 dias depois).
- **Visual:** fundo do Control Hub, trilho com etiqueta ao passar o mouse, ícone e cor por família.

## Novidades da 2.3 — Calcular

- **Simular rescisão** (aba principal do Calcular): todas as modalidades — sem justa causa, pedido de demissão (aviso cumprido, dispensado ou descontado), justa causa, acordo (art. 484-A), término de contrato a prazo, fim antecipado pela empresa (art. 479) ou pelo empregado (art. 480), com cláusula do art. 481, rescisão indireta, culpa recíproca e falecimento. Mostra cada verba (saldo de salário, aviso prévio proporcional com projeção, 13º e férias proporcionais, férias vencidas e em dobro, indenizações), INSS e IRRF, líquido, multa e saque do FGTS, seguro-desemprego e o prazo de pagamento.
- **Simular férias:** abono pecuniário, faltas (CLT 130), férias em dobro, adiantamento do 13º, INSS e IRRF, prazos de aviso e pagamento.
- **Tabelas de INSS e IRRF nas regras** (`config.tabelas`, vigência 2026, com o redutor da Lei 15.270/2025): o escritório corrige sem nova versão.
- "Pedir o cálculo ao escritório" abre o Cálculo de Rescisão/Férias no portal já com as datas; "Copiar resumo"; atalhos "Simular" em Funcionários.

## Novidades da 2.2

- **Equipe no Hoje:** avisos de férias e rescisão perto do pagamento **sem a solicitação de cálculo** (as datas vêm do detalhe do aviso no portal: início das férias, pagamento, data do aviso), experiência vencendo e férias a vencer — cada linha com o atalho para o pedido certo, já com o funcionário.
- **Várias empresas no mesmo acesso:** por padrão, só a empresa aberta no portal; seletor para outra ou "Todas as empresas", e cada solicitação mostra a sua.
- **Leitura automática a cada 30 segundos** (`config.leituraAutomaticaSegundos` nas regras): a resposta do escritório aparece sozinha; a tela só muda quando algo mudou e você não está digitando.
- **Novo pedido** concentra a criação (escolha do tipo, texto livre, documento, repetir, modelos, dúvidas). Clicar de novo em Novo pedido volta para a escolha do tipo; "Continuar o pedido" retoma o que está aberto.

## Novidades da 2.1 — Hoje

Referências do **Control Onvio** (a extensão da visão do escritório, `josuep007-prog/Assistente-interno-portal-do-cliente-`) trazidas para a visão do cliente:
- **Hoje** (no lugar do Painel), no formato da tela Hoje do Control Onvio: rosca de "% em dia" (do seu lado), "N solicitações esperam sua resposta", carrossel com um aviso por vez (a bolinha mostra que o portal foi lido), **próximos passos** (responder, lembretes de hoje, prazos dos próximos 3 dias), situações que filtram e cartões por motivo com o anel de dias parada — ou em lista.
- **Motivos do cliente** (`E.MOTIVOS_CLIENTE`): responda antes de prescrever (faltam `config.prescricaoAvisoDias` dias dos 30), esperando sua resposta, passou da expectativa de conclusão, com o escritório e concluídas nos últimos 30 dias.
- **Situações reais do Onvio:** o `genericStatus` tem sentido por família (padrão, cadastro, rubricas) — `config.statusSolicitacao.familias` nas regras, com quem está com a vez (você ou o escritório).
- **Listas como o portal pede** (página 1 em diante, 200 por vez, com funcionário e responsável) e a **Solicitação Geral** (`service-requesting/v1/tickets/generic`).
- **Trâmites no detalhe:** a conversa da solicitação (autor, data, situação, texto e anexos), lida na hora com o acesso do portal e nunca guardada.

## Novidades da 2.0 — a plataforma

**O Assistente virou uma plataforma em tela cheia por cima do Portal do Cliente**, no estilo do módulo de Departamento Pessoal do Control Hub (trilho lateral, abas com selos, indicadores, listas). O portal continua aberto por baixo e é a plataforma que preenche; **Ver no portal** mostra a tela original com o painel ao lado, e o botão de tela cheia volta.
- **Painel** (na 2.1 virou **Hoje**): o que espera por você, solicitações em andamento, prazos da semana, contratos de experiência, atalhos e "escreva com suas palavras".
- **Solicitações:** todas as listas do portal num só lugar (com todas as páginas), abas Aguardando você / Em andamento / Concluídas, busca, último trâmite e "Responder no portal".
- **Novo pedido:** formulário próprio, gerado das regras. O que você escreve vai para o portal; antes de enviar, o resumo lê o próprio portal e avisa se ele não aceitou algum valor. O envio continua sendo só pelo botão do portal, depois da sua confirmação.
- **Funcionários:** lista do portal com admissão, tempo de casa, experiência e férias a conceder (estimativa), e atalhos para pedir férias, afastamento ou desligamento já com o funcionário escolhido.
- **Agenda:** calendário do mês com prazos legais (salário, FGTS, INSS, 13º — `agendaFixa` nas regras), prazos das solicitações, experiências e **lembretes** que se repetem (dia útil, semana, mês, ano; "excluir só este dia"). Fica só no computador.
- **Documentos:** do escritório (no simulador; no Onvio real, a calibrar), anexos das solicitações, **modelos para assinar** (`modelosDocumento` nas regras, para imprimir ou salvar em PDF) e listas de documentos.
- **Busca Ctrl+K** (ou /) por funcionário, solicitação, pedido ou dúvida. Aviso quando o portal pede atenção por baixo (janela, sessão).
- Configurações → "Ao abrir o portal": plataforma (padrão) ou só o botão Assistente.

## Novidades da 1.3.3

**Leitura mais confiável.** Formulários impressos trazem todas as opções escritas ("( ) Apto (X) Inapto"): o Assistente agora olha qual está marcada. Antes, um ASO apto aparecia como INAPTO na conferência e uma CAT de acidente típico virava Trajeto.
**Funcionário certo:** quando o nome lido serve para duas pessoas da lista (dois "José Carlos"), o Assistente pergunta em vez de escolher pela ordem.
**Documento certo:** dois documentos com a mesma pontuação deixam de ser desempatados pela ordem do arquivo de regras — o aviso de férias assinado ia para Programação de férias.
**Datas certas:** num pedido de demissão com "admitido em…", a data do aviso não é mais a da admissão; e o início das férias não é mais o do período aquisitivo.
**Documentos novos:** título de eleitor (o item do checklist da admissão nunca ficava marcado), termo de rescisão (TRCT) e holerite — estes dois com uma explicação de qual solicitação usar.

## Novidades da 1.3.2

**Conferência mais segura.** Um arquivo que está na lista do Assistente mas ainda não foi para o portal não conta mais como anexado: antes a conferência dava "Atestado anexado" e a solicitação podia chegar ao escritório sem o documento. "Conferir e enviar" sempre mostra o resumo antes de acionar o botão do portal. Se o portal recusar o envio, o Assistente avisa, mantém o rascunho e não registra a solicitação como enviada.
**Desfazer no lugar certo:** o botão só aparece no formulário que o Assistente preencheu. Trocar de empresa sem recarregar guarda o rascunho da anterior e começa do zero.
**Prazos corrigidos:** o fim do aviso prévio passa a incluir o último dia (Súmula 380 do TST — saía um dia antes); o aviso proporcional vale só quando a empresa demite (quem pede demissão cumpre 30 dias); o aviso de "15 dias pela empresa e INSS a partir do 16º" só aparece em doença e acidente, não em licença-maternidade. Datas que não existem ("dia 31" em novembro, 30/02) não viram outra data em silêncio.
**CID:** o interruptor mostra o estado real, inclusive quando é o escritório que pede, e você sempre pode desligar. A descrição deixou de ser guardada no histórico.

## Novidades da 1.3.1

**O portal é onde se preenche.** O painel não tem mais cópias dos campos do portal: a área "No portal" mostra o que está em cada campo (e se veio do Assistente, de você ou se está vazio); clicar numa linha destaca o campo no portal. Para corrigir, mude direto no portal — o Assistente nunca sobrescreve o que você escreveu lá, e o assunto e a descrição se atualizam sozinhos. No painel ficam só as informações que o portal não tem (dias de afastamento, CID, médico, observações para o analista).
**Desfazer o preenchimento:** depois de preencher, aparece "Desfazer o preenchimento" acima da barra do painel e um aviso com "Desfazer" na própria página. Volta campos e anexos a como estavam; o Assistente não preenche de novo sozinho até você pedir.

## Novidades da 1.3

**Leitor de atestados mais esperto** (calibrado com atestados reais de UPA, posto de saúde, consultório, hospital, receita digital e manuscritos — nenhum foi guardado no repositório; os testes usam cópias com dados inventados):
- **Dias** escritos de vários jeitos: "01 (UM) DIA", "(03) três", "2 dia(s)", "1 ( hum* )", "repouso por 4 dias", e erros comuns do OCR ("( OL )", "012 dias"). Ignora a nota "1 a 15 dias de afastamento" e receitas ("por 5 dias").
- **Data**: "a partir de…", "a partir desta data" (usa a data do documento), datas por extenso e com ano de 2 dígitos. Não confunde com nascimento, decretos ou portarias.
- **Funcionário**: lê o nome do paciente ("Paciente:", "que o(a) NOME", "Sr(a): NOME") e compara com a lista tolerando erros pequenos e sobrenome cortado; não pega o nome do médico nem da mãe. Se o nome não estiver na lista, o painel mostra o que leu.
- **Avisos na conferência**: atestado de acompanhante (o tipo fica para você escolher), atestado de escola ou em nome de outra pessoa com o mesmo sobrenome, declaração de comparecimento (horas) e leitura difícil.
- **Fotos de lado** são giradas sozinhas; fotos ruins ganham uma segunda tentativa com tratamento de imagem. Passe o mouse no rótulo do campo para ver o trecho do documento de onde veio o dado.

**Facilidades:** colar um print com **Ctrl+V** (no painel ou na página) · aviso de **pedido repetido** · **rascunho**: saiu sem enviar? o Assistente oferece continuar (fica 7 dias só no computador) · **repetir a última solicitação** · alerta de **contratos de experiência** (45 e 90 dias pela data de admissão do portal) · **avisos do escritório** e **dúvidas frequentes** pelas regras · **ajustes por empresa** · mensagem pronta com os **documentos da admissão** (Calcular → Docs. admissão) · **tamanho do texto** · **Copiar diagnóstico** (sem nomes nem valores) · **modo seguro**: se o portal mudar a tela, o Assistente não preenche sozinho.

## Novidades da 1.2

**Vários atestados de uma vez:** arraste todos juntos e o Assistente abre **uma solicitação por atestado**, uma de cada vez. Ele preenche e anexa só o atestado daquela solicitação; você confere e clica em ADICIONAR; assim que o portal salva, ele abre e preenche a próxima. O lote mostra o andamento ("2 de 4"), e dá para pular uma ou parar. Documentos de pedidos diferentes arrastados juntos também viram uma solicitação por tipo.
**Tipo de afastamento automático:** sai do atestado (até 15 dias → "Doença período igual ou inferior a 15 dias"; mais de 15 → "Doença período superior a 15 dias"), da CAT (acidente até/acima de 15 dias), e de termos como licença maternidade/paternidade, aborto, serviço militar, doença ocupacional (regras em `tipos.afastamento.tipoAfastamentoAuto`).
**Assunto:** `Atestado médico – NOME – data (dias)`, com alternativas quando falta alguma informação (`tipos.afastamento.assuntos`).
**Escreva com suas palavras, sem ser puxado de volta:** com uma solicitação aberta, um texto sobre outro assunto mostra o que foi entendido e deixa você escolher (abrir a outra ou usar na aberta); nada muda de tela sozinho. Abrir uma solicitação ficou mais rápido.
**Aviso visual do que não foi encontrado:** campos que o leitor não achou no documento ficam destacados no portal e no painel ("Não encontrado no documento — preencha aqui") e o aviso some quando você preenche.

## Novidades da 1.1

Painel ao lado da página (não cobre mais o botão ADICIONAR) · introdução para o cliente · "escreva com suas palavras" (ex.: *o João sai de férias dia 10/11 por 20 dias*) · etapas do pedido e barra de ações fixa · resumo antes de enviar · copiar resumo · modelos reutilizáveis · agenda de prazos (fim de experiência, pagamento de férias e rescisão, retorno de afastamento) · checklist de documentos da admissão · leitura melhor de fichas, comprovantes de endereço e ASO · OCR melhor em fotos de celular.

## Simulador

Uma réplica de testes do portal roda o mesmo código da extensão: `bash tools/build-simulador.sh` monta a pasta e ela é publicada como artefato no claude.ai. Use os "Documentos de exemplo" ou arraste arquivos seus. Nada é enviado ao Onvio.

## Instalar (você, para desenvolver)

1. Descompacte a pasta `assistente-portal-controltax` em um lugar fixo (ex.: `C:\ControlTax\assistente`).
2. Chrome → `chrome://extensions` → ative **Modo do desenvolvedor** → **Carregar sem compactação** → escolha a pasta.
3. Abra o portal em `onvio.com.br/clientcenter` — o botão **Assistente** aparece no canto inferior direito. Atalho: **Alt+Shift+A**.

## Editar sem recarregar a extensão

**Enquanto você desenvolve** (código e regras):

1. Dê dois cliques em `dev\iniciar-dev.bat` (ou rode `python dev\dev_server.py`). Deixe a janela aberta.
2. Edite qualquer arquivo e salve:
   - mudou algo em `rules\` → as regras são recarregadas na hora, sem recarregar nada;
   - mudou outro arquivo → a extensão se recarrega sozinha e as abas do Onvio também.
3. O ícone mostra **DEV** quando está conectado.

**Para os clientes** (sem reinstalar nada):

Quase tudo que muda no dia a dia — campos, textos, prazos, documentos reconhecidos, dicas, feriados, intenções do Início — está em `rules/regras.json`.

1. As regras publicadas ficam no repositório público **josuep007-prog/assistente-portal-regras** (arquivo `regras.json` na raiz).
2. A extensão já vem apontando para `https://raw.githubusercontent.com/josuep007-prog/assistente-portal-regras/main/regras.json` (`DEFAULT_SETTINGS.rulesUrl`).
3. Para publicar, copie o seu `rules/regras.json` testado para lá (pelo site do GitHub ou pelo Claude Code) e aumente a `versao`.
4. Daí em diante, edite o `regras.json` no GitHub: os clientes recebem a mudança em até 30 minutos (ou ao abrir o Chrome). Se o arquivo remoto falhar, vale a última cópia boa; se nunca baixou, valem as regras que vieram na extensão.

Só mudanças de **código** (`content/`, `panel/`, `background/`) exigem uma nova versão da extensão. Publicando na Chrome Web Store como **Não listada**, o Chrome dos clientes atualiza sozinho.

## Mapa do `regras.json`

| Bloco | Para que serve |
|---|---|
| `config` | Bloquear ou só avisar no envio, CID, OCR, prazos internos (`prazoInternoDiasUteis`), dia limite das rubricas, para onde vão atestados de até 15 dias, marcos da experiência (`experienciaDias`). |
| `feriados` | Datas no formato AAAA-MM-DD (nacionais 2026–2027 já incluídos; acrescente os municipais). |
| `aliasesOpcoes` | Converte o que vem no documento para o que o portal mostra (SP → São Paulo). |
| `intencoes` | Cartões do Início e palavras que levam a cada solicitação. |
| `tipos` | Uma entrada por solicitação: `slug` (endereço no portal), `campos` (`fc` = formcontrolname da tela), `anexos`, `condicionais`, `verificacoes`, modelos de `assunto` e `descricao`, `dicas`. |
| `documentos` | Como reconhecer cada documento (palavras) e o que extrair (expressões regulares). `leitor: "atestado"` usa o leitor próprio de atestados; `avisos` = `[{ palavras, cid, semCampo, nivel, mensagem }]` aparecem na conferência. |
| `mensagens` | Textos exibidos ao cliente (inclui `admissaoInicio`/`admissaoFim` da mensagem de documentos da admissão). |
| `avisosEscritorio` | Recados no Início: `[{ id, titulo, texto, nivel: "importante"?, desde, ate: "AAAA-MM-DD", link }]`. O cliente pode dispensar. |
| `faq` | Dúvidas frequentes que aparecem na busca do Início: `[{ pergunta, resposta, palavras }]`. |
| `agendaFixa` | Prazos de todo mês ou de todo ano na Agenda: `itens: [{ id, titulo, detalhe, quando: { dia, mes?, ajuste: "antecipa"\|"prorroga" } \| { diaUtil: N } }]`. |
| `modelosDocumento` | Modelos para assinar (Documentos): `[{ id, titulo, descricao, revisarComEscritorio, campos: [{ k, rotulo, tipo: "empregado"\|"data"\|"numero"\|"texto"\|"opcoes" }], texto: [linhas com {campo\|padrão}] }]`. `{empresa}` e `{hoje}` vêm prontos. |
| `config.statusSolicitacao` | Expressões que dizem se uma solicitação está aguardando você, concluída ou cancelada (a calibrar com o Onvio real). `solicitacoesMaxPaginas`: até quantas páginas de 50 ler por tipo. `campos.*.grupo`: agrupa os campos no formulário da plataforma (cadastro). |
| `empresas` | Ajustes por empresa: `{ "trecho do nome": { config: { … }, avisos: [ … ] } }` (ex.: outro prazo interno, `experienciaDias: [30, 90]`). |

Tipos de verificação disponíveis: `antecedenciaMinima`, `dataPassada`, `dataNaoFutura`, `antiguidadeMaxima`, `intervalo`, `somaMaxima`, `diasMaiorQue`, `inicioFerias`, `pagamentoAntesDe`, `prazoEscritorio`, `prazoRescisao`, `prazoCat`, `cpf`, `pis`, `email`, `idadeMinima`, `competenciaRecente`, `diaLimite`, `abaErrada`, `info`.

## Estrutura

```
manifest.json
background/service-worker.js   regras (dev → remota → cache → embutida), recarga automática, atalho, selo
content/content.js             age no portal: lê a tela, preenche, anexa, confere o envio, arrastar-e-soltar
panel/                         plataforma (plataforma.js/.css) e painel encaixado (panel.*), motor de regras (engine.js), leitura de arquivos (extract.js)
rules/regras.json              o "cérebro" editável
lib/                           pdf.js, Tesseract (OCR português), SheetJS — tudo local
dev/                           servidor de desenvolvimento (Python, sem dependências)
```

## Continuar no Claude Code

O repositório do GitHub tem a extensão completa (inclusive `lib/` e `fonts/`): "Code → Download ZIP", descompactar e carregar a pasta no Chrome. Se alguma vez faltar `lib/`, o painel avisa; `bash tools/baixar-libs.sh` recria as pastas (versões e SHA-256 fixos).

Abra o Claude Code dentro desta pasta: o `CLAUDE.md` traz o contexto, as regras de segurança no portal e o jeito de trabalhar; `docs/mapa-portal.md` traz o mapa da tela; `tests/` tem os testes (`node tests/engine.test.mjs` e `python tests/e2e.py`).

## Pontos a confirmar com o escritório

- **Modelos para assinar** (`modelosDocumento`): os textos são sugestões e aparecem com o aviso "confirme com o escritório". Revise e, quando aprovar, troque `revisarComEscritorio` para `false`.
- **Prazos da Agenda** (`agendaFixa`): confira se salário, FGTS, INSS e 13º estão como o escritório orienta (ex.: antecipar ou prorrogar quando cai em feriado).

- `config.diaLimiteRubricas` está vazio — defina o dia de corte das variáveis da folha.
- Atestado de acompanhante: hoje o Assistente avisa e deixa o tipo de afastamento em branco. Se o escritório tiver um padrão (ex.: "Ausência justificada"), troque a regra `nenhum: true` em `tipos.afastamento.tipoAfastamentoAuto` por `valor`.
- Contratos de experiência: o alerta usa 45 e 90 dias (`config.experienciaDias`); ajuste por empresa se for 30 + 60.
- O preenchimento da **grade** do Lançamento de Rubricas não foi calibrado (a empresa de teste não tem eventos cadastrados); hoje a planilha vira um resumo na descrição.
- A tela de **Pendências** lê as listas com o acesso do próprio cliente; o formato dos itens foi tratado de forma genérica porque a empresa de teste não tinha solicitações.
