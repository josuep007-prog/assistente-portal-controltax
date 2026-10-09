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
| `config` | Bloquear ou só avisar no envio, CID, OCR, prazos internos (`prazoInternoDiasUteis`), dia limite das rubricas, para onde vão atestados de até 15 dias. |
| `feriados` | Datas no formato AAAA-MM-DD (nacionais 2026–2027 já incluídos; acrescente os municipais). |
| `aliasesOpcoes` | Converte o que vem no documento para o que o portal mostra (SP → São Paulo). |
| `intencoes` | Cartões do Início e palavras que levam a cada solicitação. |
| `tipos` | Uma entrada por solicitação: `slug` (endereço no portal), `campos` (`fc` = formcontrolname da tela), `anexos`, `condicionais`, `verificacoes`, modelos de `assunto` e `descricao`, `dicas`. |
| `documentos` | Como reconhecer cada documento (palavras) e o que extrair (expressões regulares). |
| `mensagens` | Textos exibidos ao cliente. |

Tipos de verificação disponíveis: `antecedenciaMinima`, `dataPassada`, `dataNaoFutura`, `antiguidadeMaxima`, `intervalo`, `somaMaxima`, `diasMaiorQue`, `inicioFerias`, `pagamentoAntesDe`, `prazoEscritorio`, `prazoRescisao`, `prazoCat`, `cpf`, `pis`, `email`, `idadeMinima`, `competenciaRecente`, `diaLimite`, `abaErrada`, `info`.

## Estrutura

```
manifest.json
background/service-worker.js   regras (dev → remota → cache → embutida), recarga automática, atalho, selo
content/content.js             age no portal: lê a tela, preenche, anexa, confere o envio, arrastar-e-soltar
panel/                         painel lateral (HTML/CSS/JS), motor de regras (engine.js), leitura de arquivos (extract.js)
rules/regras.json              o "cérebro" editável
lib/                           pdf.js, Tesseract (OCR português), SheetJS — tudo local (fora do Git: `bash tools/baixar-libs.sh`)
dev/                           servidor de desenvolvimento (Python, sem dependências)
```

## Continuar no Claude Code

No repositório do GitHub as pastas `lib/` e `fonts/` não vão junto (12 MB): depois de clonar, rode `bash tools/baixar-libs.sh` (baixa do npm as versões exatas e confere o SHA-256). No Claude Code isso roda sozinho ao abrir a sessão (`.claude/settings.json`).

Abra o Claude Code dentro desta pasta: o `CLAUDE.md` traz o contexto, as regras de segurança no portal e o jeito de trabalhar; `docs/mapa-portal.md` traz o mapa da tela; `tests/` tem os testes (`node tests/engine.test.mjs` e `python tests/e2e.py`).

## Pontos a confirmar com o escritório

- `config.diaLimiteRubricas` está vazio — defina o dia de corte das variáveis da folha.
- `config.atestadoAte15DiasVaiPara` — o portal só tem tipos "superior a 15 dias"; confirme onde o cliente deve mandar atestados curtos.
- O preenchimento da **grade** do Lançamento de Rubricas não foi calibrado (a empresa de teste não tem eventos cadastrados); hoje a planilha vira um resumo na descrição.
- A tela de **Pendências** lê as listas com o acesso do próprio cliente; o formato dos itens foi tratado de forma genérica porque a empresa de teste não tinha solicitações.
