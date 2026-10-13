# Chrome Web Store — Assistente do Portal do Cliente — ControlTax

> Última atualização: 2026-10-09 · Publicação recomendada: **Não listada** (só quem tem o link instala; o Chrome atualiza sozinho)

## Ficha

**Nome:** Assistente do Portal do Cliente — ControlTax

**Descrição curta (≤132):** Preenche as solicitações do Portal do Cliente a partir dos seus documentos e confere campos, anexos e prazos antes do envio.

**Descrição detalhada:**
Ajuda os clientes da ControlTax a abrir solicitações no Portal do Cliente de forma rápida, completa e no lugar certo.

Arraste um atestado, pedido de demissão, documentos de admissão ou planilha: o assistente identifica qual solicitação abrir, preenche os campos, anexa o arquivo e escreve um assunto e uma descrição padronizados.
Antes do envio, confere campos obrigatórios, anexos e prazos trabalhistas (férias, rescisão, afastamento, admissão) e explica o que falta.
Inclui calculadoras de férias, aviso prévio, rescisão, afastamento e contrato de experiência, além de um resumo das solicitações que aguardam resposta.

Como usar: abra o Portal do Cliente, clique em "Assistente" no canto da tela (ou Alt+Shift+A), escolha o que precisa fazer ou arraste um documento.

Privacidade: os arquivos são lidos no próprio computador. Nada é enviado a servidores da extensão; os dados vão apenas para o portal quando o próprio usuário envia a solicitação.

**Categoria:** Produtividade · **Idioma:** Português (Brasil)

**Propósito único:** Ajudar o cliente a preencher e conferir solicitações no Portal do Cliente do escritório.

## Imagens

| Item | Tamanho | Status |
|---|---|---|
| Ícone | 128×128 | ✅ icons/icon-128.png |
| Captura 1 — painel preenchendo um afastamento | 1280×800 | ⬜ |
| Captura 2 — conferência antes de enviar | 1280×800 | ⬜ |
| Captura 3 — Início com "O que você precisa fazer?" | 1280×800 | ⬜ |

## Justificativa das permissões

| Permissão | Tipo | Justificativa |
|---|---|---|
| storage | permissions | Guarda as preferências do usuário, o histórico local de solicitações preenchidas e a cópia das regras de preenchimento. |
| alarms | permissions | Atualiza periodicamente o arquivo de regras (campos, prazos e textos) publicado pelo escritório. |
| https://onvio.com.br/* | host | O assistente aparece e preenche formulários somente no Portal do Cliente e lê a lista de solicitações do próprio usuário para mostrar pendências. |
| https://raw.githubusercontent.com/*, https://gist.githubusercontent.com/*, https://*.github.io/* | host | Baixar o arquivo de regras (JSON, sem código) mantido pelo escritório. |
| http://localhost:35729/* | host | Somente para o desenvolvedor: recarregar a extensão ao salvar arquivos. Sem efeito para clientes. Pode ser removida da versão publicada. |

## Privacidade

Coleta de dados: **não** há envio a servidores próprios. Conteúdo de documentos (inclusive dados de saúde de atestados) é processado localmente e só vai ao portal por ação do usuário. Histórico e preferências ficam no armazenamento local do navegador.

- [x] Dados não são vendidos
- [x] Dados não são usados para fins alheios ao propósito único
- [x] Dados não são usados para crédito/empréstimo

Política de privacidade: ⬜ publicar uma página simples (pode ser no mesmo repositório do GitHub) com o parágrafo acima.

## Versões

| Versão | Data | Mudanças |
|---|---|---|
| 1.2.3 | 2026-10-13 | Férias e desligamento pelo texto livre: pergunta se é aviso ou cálculo. Ao atualizar a extensão, as abas do portal fora de formulário recarregam sozinhas e, nas que estão num formulário, o painel avisa para recarregar (F5) — antes a página continuava com a versão antiga das "mãos". |
| 1.2.2 | 2026-10-13 | Listas longas do portal (virtualizadas, só ~13 nomes desenhados por vez): o Assistente lê a lista inteira rolando-a e completando com a lista da empresa, e escolhe a opção digitando para filtrar ou rolando até ela — funcionários com qualquer inicial e tipos de afastamento do fim da lista. |
| 1.2.1 | 2026-10-13 | Funcionário pelo primeiro nome no texto livre: a lista é carregada antes de interpretar (com novas tentativas e, se preciso, a lista completa da empresa pela API do portal); se o primeiro nome servir para mais de um, o painel pergunta qual; listas de combobox não abrem mais duas ao mesmo tempo. |
| 1.2.0 | 2026-10-13 | Vários atestados de uma vez (uma solicitação por atestado, abertas uma após a outra); tipo de afastamento automático (inclui até 15 dias); assunto "Atestado médico – Nome – data (dias)"; aviso visual no portal e no painel para o que não foi encontrado no documento; texto livre não força mais a solicitação aberta; abrir solicitação mais rápido; regras embutidas mais novas prevalecem sobre as publicadas. |
| 1.1.1 | 2026-10-13 | Modo dev só tenta o WebSocket quando o servidor de recarga está ligado (sem erros em chrome://extensions). |
| 1.1.0 | 2026-10-09 | Painel encaixado ao lado da página; introdução; "escreva com suas palavras"; etapas do pedido; barra de ações; resumo antes do envio; copiar resumo; modelos; agenda de prazos; checklist de documentos; leitura melhor de fichas, comprovantes de endereço e ASO; pré-tratamento de fotos no OCR; simulador para testes. |
| 1.0.0 | 2026-10-09 | Primeira versão: 10 tipos de solicitação, leitura de PDF/foto/planilha, conferência antes do envio, pendências, calculadoras, histórico, regras remotas e modo dev. |
