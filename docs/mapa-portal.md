# Mapa do Onvio Portal do Cliente (visão do cliente)

Levantado em 09/10/2026 na empresa de teste "EMPRESA EXEMPLO SIMPLES NACIONAL LTDA" (login de cliente teste do Josué). Angular 13 + componentes Bento (Thomson Reuters).

## Rotas

Base: `https://onvio.com.br/clientcenter/pt/actions/service-request/<slug>` (lista) e `.../<slug>/add` (novo).
Navegar sem recarregar: `history.pushState({}, '', path)` + `dispatchEvent(new PopStateEvent('popstate'))` — o roteador Angular obedece.

| Solicitação | slug | API da lista (GET, cookie de sessão) |
|---|---|---|
| Solicitação Geral | general-requests | (não identificada) |
| Cadastro de Empregado | employee-registration | /api/br-payroll-sr/v1/employees-registrations |
| Cadastro de Contribuinte | partner-registration | /api/br-payroll-sr/v1/taxpayers-registrations |
| Cadastro de Estagiário | intern-registration | /api/br-payroll-sr/v1/interns-registrations |
| Aviso Prévio de Férias | vacation-notice | /api/br-payroll-sr/v1/prior-notice-vacations |
| Cálculo de Férias | vacation-calculation | /api/br-payroll-sr/v1/vacation-calculations |
| Aviso Prévio de Rescisão | termination-notice | /api/br-payroll-sr/v1/prior-notice-terminations |
| Cálculo de Rescisão | termination-calculation | /api/br-payroll-sr/v1/termination-calculations |
| Afastamento de Empregado | employee-leave | /api/br-payroll-sr/v1/employee-leave |
| Lançamento de Rubricas | payroll-entries | /api/br-payroll-sr/v1/payroll-entries |

Parâmetros das listas: `?pageIndex=0&itemsPerPage=30&filter=…&expand=…&assignedtome=false&orderBy=…`. A empresa de teste não tinha itens — **o formato de cada item ainda não foi visto**.

## Componentes e como preencher (testado no portal real)

| Componente | Como achar | Como preencher |
|---|---|---|
| Texto / data / textarea | `[formcontrolname=X]` | setter nativo de `value` + eventos `input`, `change`, `blur`. Datas `DD/MM/AAAA`; o portal aplica as próprias máscaras (CEP vira `01.310-100`, salário vira `R$ 2.500,00`). |
| Combobox | `bento-combobox[formcontrolname=X]` → `input` interno; lista em `#<aria-owns>` com `[role=option]` | clicar no input, esperar a lista, clicar na opção. Fechar: Escape. Listas longas filtram ao digitar. |
| Rádio | `#radioBasic-<chave><índice>` (ex.: `#radioBasic-grantedBy0`) | clicar no `label[for]`. Afastamento usa `#typical`, `#disease`, `#accident`. |
| Anexo | `bento-file-selector input[type=file]` | `DataTransfer` → `input.files` + `change`. O nome aparece como "arquivo.pdf (192B)". |
| Etapas (cadastros) | `bento-wizard-step` na mesma ordem dos botões `button.bento-wizard-step` | clicar no botão da etapa antes de preencher campo escondido. |
| Abas internas | ancestral `[role=tabpanel]` → `[role=tab][aria-controls=<id>]` | clicar na aba. |
| Botão enviar | texto "ADICIONAR" (formulários simples, classe `form__buttons--add`) ou "SALVAR E ENVIAR PARA O ESCRITÓRIO" (cadastros/rubricas) | identificar pelo **texto**, as classes variam. "Adicionar" da barra da lista fica dentro de `bento-toolbar`. |
| Menu lateral | dentro de shadow root `bm-tree` | não usar; navegar pela rota. |

## Particularidades

- Afastamento: campos da CAT só habilitam com "Acid. Trabalho período superior a 15 dias" (e "Novo afast. mesmo acid. Trabalho"). "Data de afastamento" aparece como *opcional* no portal (o Assistente trata como necessária).
- Empregados: o formulário chama `GET /api/br-payroll-sr/v1/clients/<clientId>/employees?expand=clientEmployeeRelationshipExpanded` (lista completa, campos `name`, `status`, `hireDate`, `cpf`…). Desde a 1.3 o Assistente usa só `name`, `status` e `hireDate` (alerta de experiência); o formato exato de `hireDate`/`status` no portal real ainda precisa ser conferido. Férias e rescisão mostram só 3 dos 5 da empresa de teste (provavelmente só ativos); afastamento mostra os 5.
- Combobox por dentro (13/10/2026): `bento-combobox[aria-owns]` → `bento-combobox-list` → `bento-list` → `cdk-virtual-scroll-viewport` (altura 300px, linhas de 40px) → `.cdk-virtual-scroll-content-wrapper` → `div.bento-list-row[role=option]`. Algumas linhas vêm vazias (espaçadoras). Rolar o viewport por código + evento `scroll` desenha as demais (138 nomes lidos em ~2 s numa empresa grande); digitar no input (`input` + `keyup`) filtra por trecho do texto. Pode haver outro `cdk-virtual-scroll-viewport` visível fora da lista (use sempre o de dentro do `aria-owns`).
- Tipo de afastamento: lista virtualizada (`cdk-virtual-scroll-viewport`, só ~13 itens no DOM por vez; digitar filtra). São 39 opções (vistas em 13/10/2026): Afastamento direitos integrais · Acid. Trabalho período superior a 15 dias · Serviço militar · Licença maternidade · Doença período superior a 15 dias · Licença sem vencimento · Novo afast. mesmo acid. Trabalho · Antecipação e/ou prorrogação Licença Maternidade · Novo afast. mesma doença · Exercício de mandato sindical · Aposent. por invalid. Acidente de trabalho · Aposent. por invalid. doença profissional · Aposent. por invalid. exceto acidente e doença profissional · Acid. Trabalho período igual ou inferior a 15 dias · Doença período igual ou inferior a 15 dias · Aborto não criminoso · Licença maternidade adoção 1 ano · Licença maternidade adoção 1 até 4 anos · Licença maternidade adoção 4 até 8 anos · Outros motivos de afastamento · Prorrogação licença maternidade 60 dias · Prorrogação licença maternidade 60 dias adoção 1 ano · Prorrogação licença maternidade 30 dias adoção 1 até 4 anos · Prorrogação licença maternidade 15 dias adoção 4 até 8 anos · Recesso Estagiário · Falecimento do contribuinte · Licença paternidade · Afastamento por irregularidade no FGTS · Cárcere · Participação de curso ou programa de qualificação · Ausência justificada · Encerramento de estágio · Licença maternidade por morte da genitora · Acid. Trabalho período superior a 30 dias · Doença período superior a 30 dias · Acid. Trabalho período igual ou inferior a 30 dias · Doença período igual ou inferior a 30 dias · Doença profissional período igual ou inferior a 15 dias · Doença profissional superior a 15 dias.
- Afastamento lista 5 empregados; férias/rescisão listam 3 (provavelmente só ativos).
- Aviso Prévio de Rescisão: Assunto e Descrição **não têm** formcontrolname → localizar pelo rótulo.
- Cálculo de Rescisão: "Motivo da rescisão" fica bloqueado até escolher o empregado.
- UF aparece por extenso ("São Paulo") — por isso `aliasesOpcoes` nas regras.
- Lançamento de Rubricas: tipo (ADIANTAMENTO/MENSAL/PLR = `#radioBasic-0..2`), competência `basisDate` (MM/AAAA), grade "Rubricas" com "Adicionar todos os funcionários" — empresa de teste sem eventos ("Este cliente não possui nenhum evento cadastrado"), **grade não mapeada**.
- Rótulos de i18n de todas as telas: `/clientcenter/pt/assets/service-request/i18n/pt-BR.json` (só acessível pelo navegador logado).

## A calibrar para a plataforma (2.0)

O que a plataforma usa e ainda não foi visto no Onvio real. No simulador tudo isso existe (`simulador/portal.js`, `window.__ctPlatform`).

| O quê | Como a 2.0 faz hoje | Conferir |
|---|---|---|
| Itens das listas (`/api/br-payroll-sr/v1/<api>?pageIndex=N&itemsPerPage=50`) | Lê todas as páginas (até `config.solicitacoesMaxPaginas`), procura situação/empregado/assunto/datas em vários nomes de campo (`normalizarSolicitacao`). O diagnóstico mostra só os nomes dos campos. | Nomes reais dos campos, valores de situação ("Aguardando o cliente"?), `totalItems`. Ajustar `config.statusSolicitacao`. |
| Detalhe de uma solicitação | "Ver no portal" abre a lista do tipo (ou `/<slug>/<id>` se `config.rotaDetalheSolicitacao` estiver ligado). | Rota do detalhe e dos trâmites; se existe API de trâmites. |
| Solicitação Geral | Sem API conhecida: a plataforma oferece "Abrir no portal". | Endpoint da lista. |
| Empresa (`clientId`) | Tirado de uma chamada `/api/br-payroll-sr/v1/clients/<id>/...` que o portal fez depois da troca de empresa. | Se o id aparece em outras chamadas; como trocar de empresa. |
| Lista de empregados | Sem chamada registrada, abre por baixo `employee-leave/add`, espera o portal pedir `/clients/<id>/employees` e volta (só sem formulário aberto). | Se a navegação por baixo é aceita; formato de `hireDate` e `status`. |
| Documentos do escritório | "Abrir Documentos no portal" clica no link/botão "DOCUMENTOS" do topo. | Rota e API da área de documentos; download. |
| Janelas do portal | `[role=dialog]`, `[role=alertdialog]`, `.modal.show` visíveis viram aviso na plataforma; 401 nas listas leva ao portal. | Seletores das janelas reais (sessão, avisos). |
