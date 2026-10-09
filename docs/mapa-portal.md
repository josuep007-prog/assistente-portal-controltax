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

- Afastamento: campos da CAT só habilitam com "Acid. Trabalho período superior a 15 dias" (e "Novo afast. mesmo acid. Trabalho"). Não existe tipo "até 15 dias".
- Afastamento lista 5 empregados; férias/rescisão listam 3 (provavelmente só ativos).
- Aviso Prévio de Rescisão: Assunto e Descrição **não têm** formcontrolname → localizar pelo rótulo.
- Cálculo de Rescisão: "Motivo da rescisão" fica bloqueado até escolher o empregado.
- UF aparece por extenso ("São Paulo") — por isso `aliasesOpcoes` nas regras.
- Lançamento de Rubricas: tipo (ADIANTAMENTO/MENSAL/PLR = `#radioBasic-0..2`), competência `basisDate` (MM/AAAA), grade "Rubricas" com "Adicionar todos os funcionários" — empresa de teste sem eventos ("Este cliente não possui nenhum evento cadastrado"), **grade não mapeada**.
- Rótulos de i18n de todas as telas: `/clientcenter/pt/assets/service-request/i18n/pt-BR.json` (só acessível pelo navegador logado).
