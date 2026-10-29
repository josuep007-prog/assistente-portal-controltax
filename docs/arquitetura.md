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

## Camadas da extensão
Veja a tabela de arquitetura no `CLAUDE.md`: service worker (`background/`), mãos no portal (`content/`) e painel (`panel/`).
