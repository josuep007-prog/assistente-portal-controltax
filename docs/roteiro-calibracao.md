# Roteiro de calibração no Onvio real

Para uma sessão com o Chrome do Josué (Claude in Chrome), login de **cliente de teste**, empresa **EMPRESA EXEMPLO SIMPLES NACIONAL LTDA**. Cada item termina com o que anotar e onde mudar. Atualize `docs/mapa-portal.md` com o que descobrir.

## Regras que valem em todos os passos

- **Nunca** clicar em ADICIONAR, SALVAR E ENVIAR, RASCUNHO, RESPONDER ou concluir trâmite. Terminar sempre em CANCELAR.
- Anexos de teste: só arquivos fictícios; remover antes de cancelar.
- Não abrir empresas de clientes reais. Não copiar nomes, valores, CPFs ou CID para logs, testes ou commits.
- Só ler: nas chamadas da API, anotar **caminho, método e forma da resposta** (nomes dos campos), nunca os dados.

## Ordem

1. Fase 0: o Angular aceita o preenchimento com a plataforma cobrindo o portal?
2. Documentos do escritório (área Documentos do Onvio).
3. Resposta ao escritório (caixa e botão do detalhe).
4. Trocar de empresa.
5. Itens menores (lista abaixo).

## 1. Fase 0 — preenchimento por baixo

1. Recarregue o Onvio (F5) com a extensão 2.12.x e abra a plataforma (tela cheia).
2. Novo pedido → Solicitação Geral. Escreva no Assunto e na Descrição (sem sair do campo) e escolha o Departamento.
3. Conferir: o portal por baixo recebeu os valores? (use "Ver no portal": agora recolhe a extensão e deixa a bolinha). O botão ADICIONAR ficou habilitado? **Não clicar.** CANCELAR.

| Resultado | O que fazer |
|---|---|
| Texto e lista chegam, ADICIONAR habilita | Nada; fase 0 ok |
| Texto chega, lista não | Ajustar só `pickCombo` coberto (abrir/fechar a lista por baixo) |
| Campos chegam, ADICIONAR segue desabilitado | Eventos disparados em `setNative` (input/change/blur) |
| Nada chega | Trocar o desenho: recolher a plataforma durante cada `fill`, ou portal atrás sem cobrir |

Anotar também: "Copiar diagnóstico" (Configurações) — só nomes de cabeçalhos e códigos.

## 2. Documentos do escritório

Hoje a aba "Do escritório" só funciona no simulador (`plat.documentos`/`plat.baixarDocumento`); no Onvio real o conteúdo responde `disponivel: false, motivo: 'calibrar'` (`content.js`, mensagens `documentos` e `baixarDocumento`).

Descobrir, na área **Documentos** do portal do cliente:
1. Rota da tela (menu e URL) e como ela se divide (abas "Não lidos", pastas, competências).
2. Chamadas de rede que ela faz ao abrir e ao paginar (DevTools → Rede, filtro `api`): caminho, método, parâmetros (cliente, pasta, paginação) e **nomes dos campos** da resposta (nome, data, pasta, lido/não lido, tamanho, id).
3. Como o arquivo é baixado: URL ou chamada (com qual cabeçalho de acesso; o `pagina.js` guarda só em memória), e se abre em outra aba ou baixa direto.
4. Se "lido/não lido" muda ao baixar (não queremos marcar como lido sem o cliente pedir).
5. Se a lista é por empresa (troca de empresa muda a lista?) e se há várias páginas.

Onde mudar: `content/content.js` (`documentos`, `baixarDocumento` e a chamada via `apiGet`; permitir o caminho novo em `content/pagina.js`), `panel/plataforma.js` (`docsEscritorio`), `docs/mapa-portal.md`, simulador (`simulador/portal.js`, `DOCS`) e um teste no `sim_test.py`. Regra primeiro: caminhos em `rules/regras.json` se possível.

## 3. Resposta ao escritório

Abrir (sem enviar) uma solicitação que aguarda o cliente e anotar:
- seletor da caixa de resposta (hoje palpite: `[data-resposta] textarea`, `textarea[formcontrolname=topicDescription]`, `textarea[formcontrolname=answer]`);
- texto exato e posição do botão (hoje `RESPONDER`) e do botão de anexar;
- se o portal volta à lista ou continua no detalhe depois de responder (a verificação de envio usa isso);
- se a caixa existe em qualquer situação ou só quando "aguarda o cliente".

Onde mudar: `rules/regras.json` → `config.respostaPortal.caixa`/`botaoResponder`; se o fluxo for diferente, `respostaEnviar` em `content/content.js`.

## 4. Trocar de empresa

`trocarEmpresa` (`content.js`) é palpite. Anotar: qual elemento do cabeçalho abre a lista, se há busca, se a lista é virtualizada, se a tela volta ao início ou recarrega, e se existe uma chamada da API com todas as empresas do acesso (para a caixa "Para qual empresa?" listar também as sem solicitação).

## 5. Itens menores

- Remover anexo: qual é o botão de remover da linha (`removerAnexo`).
- Limpar um combobox zera o valor do Angular?
- Colar (Ctrl+V) na página; campo `hireDate` da API de empregados (formato).
- Campo do CPF na API de empregados (`empregadoPorCpf`).
- Lista da Solicitação Geral (endpoint) e formato dos itens das listas de pendências.
- Depois de ADICIONAR o portal volta à lista? (só observar o comportamento; **sem enviar**: use o que o escritório já registrou ou pergunte ao Josué).

## Ao terminar

Atualizar `docs/mapa-portal.md`, tirar o "a calibrar" das pendências do `CLAUDE.md`, rodar `node tests/engine.test.mjs`, `python tests/e2e.py` e o simulador, subir `version` no `manifest.json`, registrar no `CHROMEWEBSTORE.md` e mesclar na `main`.
