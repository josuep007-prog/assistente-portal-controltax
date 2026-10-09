/* Réplica de testes do Portal do Cliente (visão do cliente).
 * Reproduz a ESTRUTURA de tela mapeada em docs/mapa-portal.md (formcontrolname, bento-combobox,
 * rádios radioBasic-*, etapas do cadastro, seletor de anexos) para que o Assistente rode igual ao real.
 * Nada aqui fala com o Onvio. Os dados ficam só neste navegador. */
(function () {
  'use strict';
  var BASE = '/clientcenter/pt/actions';
  var SR = BASE + '/service-request/';
  var EMPRESA = 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA';
  var EMP5 = ['FRANCISCO DE MOURA', 'JOANA FONSECA', 'JOAO DA SILVA', 'JORGE OLIVEIRA ALVES', 'RONALDO DE SOUZA'];
  var EMP3 = ['JOAO DA SILVA', 'JORGE OLIVEIRA ALVES', 'RONALDO DE SOUZA'];
  var UFS = ['Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí', 'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins'];
  var CIDADES = {
    'São Paulo': ['São Paulo', 'Campinas', 'Guarulhos', 'Osasco', 'Santo André', 'São Bernardo do Campo', 'Santos', 'Sorocaba', 'Ribeirão Preto', 'Jundiaí'],
    'Rio de Janeiro': ['Rio de Janeiro', 'Niterói', 'Duque de Caxias', 'Nova Iguaçu', 'Petrópolis'],
    'Minas Gerais': ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim'],
    'Paraná': ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa'],
    'Bahia': ['Salvador', 'Feira de Santana', 'Vitória da Conquista']
  };
  var LEAVE = ['Afastamento direitos integrais', 'Acid. Trabalho período superior a 15 dias', 'Serviço militar', 'Licença maternidade', 'Doença período superior a 15 dias', 'Licença sem vencimento', 'Novo afast. mesmo acid. Trabalho', 'Antecipação e/ou prorrogação Licença Maternidade', 'Novo afast. mesma doença', 'Exercício de mandato sindical', 'Aposent. por invalid. Acidente de trabalho', 'Aposent. por invalid. doença profissional', 'Aposent. por invalid. exceto acidente e doença profissional'];
  var MOTIVOS = ['Demitido SEM justa causa', 'Demitido COM justa causa', 'Pedido de demissão SEM justa causa', 'Cessão de empregado', 'Rescisão contrato experiência antecipado pelo empregador', 'Rescisão contrato experiência antecipado pelo empregado', 'Término de contrato de trabalho por tempo determinado', 'Antecipado pelo empregador (tempo determinado)', 'Antecipado pelo empregado (tempo determinado)', 'Culpa recíproca', 'Extinção da empresa'];
  var L = {
    dept: ['MASTER', 'CONTÁBIL', 'PESSOAL', 'FINANCEIRO', 'ADMINISTRATIVO', 'TI', 'FISCAL', 'Patrimônio'],
    cargo: ['AUXILIAR ADMINISTRATIVO', 'ASSISTENTE ADMINISTRATIVO', 'VENDEDOR', 'OPERADOR DE CAIXA', 'AUXILIAR DE PRODUÇÃO', 'MOTORISTA', 'RECEPCIONISTA', 'GERENTE COMERCIAL', 'ESTAGIÁRIO', 'SÓCIO ADMINISTRADOR'],
    servico: [EMPRESA, 'TOMADOR DE SERVIÇO'], depto: ['FÁBRICA', 'ESCRITÓRIO'], cc: ['GERAL'], sind: ['SINDICATO EXEMPLO'],
    jornada: ['44h semanais — seg a sex 08:00 às 17:48', '44h semanais — seg a sáb 08:00 às 16:20', '36h semanais — escala 12x36', '30h semanais — estágio 6h/dia'],
    categoria: ['101 - Empregado geral', '103 - Aprendiz', '105 - Contrato por prazo determinado'],
    vinculo: ['CLT - Prazo indeterminado', 'CLT - Prazo determinado'],
    seguro: ['Não recebe seguro-desemprego', 'Recebe seguro-desemprego'],
    tipoEnd: ['Rua', 'Avenida', 'Travessa', 'Alameda', 'Praça', 'Rodovia', 'Estrada'],
    pais: ['Brasil', 'Argentina', 'Bolívia', 'Paraguai', 'Portugal', 'Venezuela', 'Haiti'],
    raca: ['Branca', 'Preta', 'Parda', 'Amarela', 'Indígena', 'Não informado'],
    instrucao: ['Analfabeto', 'Fundamental incompleto', 'Fundamental completo', 'Médio incompleto', 'Médio completo', 'Superior incompleto', 'Superior completo', 'Pós-graduação', 'Mestrado', 'Doutorado'],
    civil: ['Solteiro', 'Casado', 'Divorciado', 'Viúvo', 'União estável', 'Separado judicialmente'],
    sangue: ['A', 'B', 'AB', 'O'],
    conta: ['Conta corrente', 'Conta poupança', 'Conta salário'],
    banco: ['001 - Banco do Brasil', '033 - Santander', '104 - Caixa Econômica Federal', '237 - Bradesco', '341 - Itaú Unibanco', '260 - Nu Pagamentos', '077 - Banco Inter', '336 - C6 Bank'],
    esocialEst: ['901 - Estagiário'], esocialContrib: ['721 - Contribuinte individual - Diretor não empregado', '722 - Diretor não empregado com FGTS', '701 - Contribuinte individual - Autônomo'],
    instituicao: ['UNIVERSIDADE EXEMPLO', 'FACULDADE DE TECNOLOGIA EXEMPLO', 'ESCOLA TÉCNICA EXEMPLO'],
    agente: ['CIEE', 'NUBE', 'IEL'], coord: ['PROF. COORDENADOR EXEMPLO'], nivel: ['Superior', 'Médio', 'Técnico', 'Especial'],
    sefip: ['11 - Contribuinte individual - Diretor', '13 - Contribuinte individual - Autônomo'], tipoContrib: ['Sócio', 'Autônomo', 'Diretor']
  };

  /* ---------- Definição das telas (fiel aos nomes internos do portal) ---------- */
  function emp(fc, list) { return { k: 'combo', fc: fc || 'selectedEmployee', label: 'Empregado', opts: list || EMP3, info: true }; }
  var subj = { k: 'text', fc: 'subject', label: 'Assunto' }, desc = { k: 'textarea', fc: 'description', label: 'Descrição' };
  var fileF = { k: 'file' };
  var TYPES = {
    'general-requests': { nome: 'Solicitação Geral', ico: 'chat', fields: [{ k: 'combo', fc: 'department', label: 'Departamento', opts: L.dept }, subj, desc, { k: 'date', fc: 'conclusionExpectation', label: 'Expectativa de conclusão', opt: true }, fileF] },
    'employee-leave': { nome: 'Afastamento de Empregado', ico: 'medical', fields: [emp('selectedEmployee', EMP5), { k: 'combo', fc: 'selectedLeaveType', label: 'Tipo de afastamento', opts: LEAVE },
      { k: 'row', items: [{ k: 'date', fc: 'leaveDate', id: 'leave-date', label: 'Data de afastamento', opt: true }, { k: 'date', fc: 'catDate', id: 'cat-date', label: 'Data da CAT', dis: 'cat' }] },
      { k: 'radio', label: 'Tipo', name: 'catType', fc: 'catType', dis: 'cat', items: [['typical', 'Típico'], ['disease', 'Doença profissional ou do trabalho'], ['accident', 'Trajeto']] },
      { k: 'text', fc: 'catNumber', label: 'Número da CAT', dis: 'cat' }, subj, desc, { k: 'date', fc: 'conclusionExpectation', id: 'conclusion-date', label: 'Expectativa de conclusão', opt: true }, fileF] },
    'vacation-notice': { nome: 'Aviso Prévio de Férias', ico: 'sun', fields: [emp(), { k: 'row', items: [{ k: 'date', fc: 'vacationStartDate', label: 'Data de início do gozo' }, { k: 'text', fc: 'vacationDays', label: 'Dias de gozo' }, { k: 'text', fc: 'bonusDays', label: 'Dias de abono', opt: true }] },
      { k: 'row', items: [{ k: 'date', fc: 'noticeDate', label: 'Data do aviso', opt: true }, { k: 'date', fc: 'paymentDate', label: 'Data do pagamento', opt: true }] }, subj, desc, { k: 'date', fc: 'dueDate', label: 'Expectativa de Conclusão', opt: true }, fileF] },
    'vacation-calculation': { nome: 'Cálculo de Férias', ico: 'calc', fields: [emp(), { k: 'row', items: [{ k: 'date', fc: 'initialDate', label: 'Data de início de gozo' }, { k: 'text', fc: 'vacationDays', label: 'Dias de gozo' }] },
      { k: 'radio', label: 'Abono pecuniário', name: 'radioBasic', items: [['radioBasic-bonus0', 'NÃO', ''], ['radioBasic-bonus1', 'SIM', 'true']] },
      { k: 'radio', label: 'Adiantar 13º salário', name: 'radioBasic2', items: [['radioBasic-anticipate13th0', 'NÃO', ''], ['radioBasic-anticipate13th1', 'SIM', 'true']] },
      subj, { k: 'textarea', label: 'Descrição' }, { k: 'date', fc: 'expectedConclusionDate', label: 'Expectativa de conclusão', opt: true }, fileF] },
    'termination-notice': { nome: 'Aviso Prévio de Rescisão', ico: 'door', fields: [emp('employee'), { k: 'combo', fc: 'terminationMotive', label: 'Motivo de rescisão', opts: MOTIVOS, opt: true },
      { k: 'radio', label: 'Aviso dado pelo', name: 'radioBasic', items: [['radioBasic-grantedBy0', 'EMPREGADO', 'EMPLOYEE'], ['radioBasic-grantedBy1', 'EMPREGADOR', 'EMPLOYER']] },
      { k: 'date', fc: 'priorNoticeDate', label: 'Data do aviso' }, { k: 'text', label: 'Assunto' }, { k: 'textarea', label: 'Descrição' }, { k: 'date', fc: 'conclusionExpectation', label: 'Expectativa de conclusão', opt: true }, fileF] },
    'termination-calculation': { nome: 'Cálculo de Rescisão', ico: 'calc', fields: [emp('employee'), { k: 'date', fc: 'resignationDate', label: 'Data de demissão' }, { k: 'combo', fc: 'terminationReason', label: 'Motivo da rescisão', opts: MOTIVOS, opt: true, dis: 'emp' },
      { k: 'date', fc: 'priorNoticeDate', label: 'Data do aviso prévio', opt: true },
      { k: 'radio', label: 'Aviso prévio', name: 'radioBasic', items: [['radioBasic-grantedBy0', 'TRABALHADO', 'WORKED'], ['radioBasic-grantedBy1', 'INDENIZADO', 'INDEMNIFIED'], ['radioBasic-grantedBy2', 'AUSÊNCIA/DISPENSA', 'ABSENSE_DISPENSATION']] },
      { k: 'text', label: 'Assunto' }, { k: 'textarea', label: 'Descrição' }, { k: 'date', fc: 'conclusionExpectation', label: 'Expectativa de conclusão', opt: true }, fileF] },
    'payroll-entries': { nome: 'Lançamento de Rubricas', ico: 'list', wizardButtons: true, fields: [{ k: 'payroll' }, { k: 'textarea', label: 'Descrição', opt: true }] }
  };
  function cadastro(nome, ico, variante) {
    var basicos = [{ k: 'text', fc: 'name', label: 'Nome' }, { k: 'text', fc: 'socialName', label: 'Nome social', opt: true }, { k: 'text', fc: 'nationalIdentity', label: 'CPF' },
      { k: 'combo', fc: 'jobPositionExpanded', label: 'Cargo', opts: L.cargo, opt: true }, { k: 'combo', fc: 'occupationExpanded', label: 'Função', opts: L.cargo, opt: true }];
    if (variante !== 'contrib') basicos.push({ k: 'text', fc: 'registration', label: 'Matrícula', opt: true });
    basicos.push({ k: 'combo', fc: 'serviceExpanded', label: 'Serviço (sede onde ficará alocado)', opts: L.servico, opt: true }, { k: 'combo', fc: 'departmentExpanded', label: 'Departamento', opts: L.depto, opt: true }, { k: 'combo', fc: 'costCenterExpanded', label: 'Centro de custo', opts: L.cc, opt: true });
    var geralTabs;
    if (variante === 'contrib') {
      geralTabs = [['DADOS BÁSICOS', basicos], ['INFORMAÇÕES CONTRATUAIS', [{ k: 'date', fc: 'admissionDate', label: 'Início do contrato', opt: true }, { k: 'combo', fc: 'sefipCategory', label: 'Categoria SEFIP', opts: L.sefip, opt: true }, { k: 'combo', fc: 'taxpayerType', label: 'Tipo', opts: L.tipoContrib, opt: true }, { k: 'text', fc: 'wage', label: 'Pró-labore', opt: true }, { k: 'combo', fc: 'eSocialCategory', label: 'Categoria eSocial', opts: L.esocialContrib }]], ['ANEXOS', [fileF]]];
    } else if (variante === 'estag') {
      geralTabs = [['DADOS BÁSICOS', basicos], ['ADMISSÃO', [{ k: 'combo', fc: 'eSocialCategory', label: 'Categoria eSocial', opts: L.esocialEst, opt: true }, { k: 'date', fc: 'admissionDate', label: 'Data', opt: true }, { k: 'text', fc: 'wage', label: 'Bolsa', opt: true },
        { k: 'combo', fc: 'educationalInstitutionExpanded', label: 'Instituição de ensino', opts: L.instituicao, opt: true }, { k: 'combo', fc: 'integrationAgentExpanded', label: 'Agente de integração', opts: L.agente, opt: true }, { k: 'combo', fc: 'internshipCoordinatorExpanded', label: 'Coordenador de estágio', opts: L.coord, opt: true }, { k: 'text', fc: 'careerField', label: 'Área de atuação', opt: true }, { k: 'combo', fc: 'schoolarLevel', label: 'Nível', opts: L.nivel, opt: true }]], ['HORÁRIO', [{ k: 'combo', fc: 'workDayExpanded', label: 'Jornada', opts: L.jornada, opt: true }]], ['ANEXOS', [fileF]]];
    } else {
      geralTabs = [['DADOS BÁSICOS', basicos], ['ADMISSÃO', [{ k: 'combo', fc: 'laborUnionClientExpanded', label: 'Sindicato', opts: L.sind, opt: true }, { k: 'radio', label: 'Primeiro Emprego', name: 'radioBasic', items: [['radioBasic-firstJob0', 'Não', ''], ['radioBasic-firstJob1', 'Sim', 'true']] }, { k: 'combo', fc: 'category', label: 'Categoria', opts: L.categoria, opt: true }, { k: 'date', fc: 'admissionDate', label: 'Data', opt: true }, { k: 'combo', fc: 'employmentRelationship', label: 'Vínculo Empregatício', opts: L.vinculo, opt: true }, { k: 'text', fc: 'wage', label: 'Salário', opt: true }, { k: 'combo', fc: 'unemploymentInsuranceSituation', label: 'Situação Seguro Desemprego', opts: L.seguro, opt: true }]],
        ['CONTRATO DE EXPERIÊNCIA', [{ k: 'text', fc: 'daysExperience', label: 'Contrato de Experiência' }, { k: 'text', fc: 'extensionDays', label: 'Dias de Prorrogação', opt: true }]],
        ['HORÁRIO', [{ k: 'text', fc: 'frequencyCard', label: 'Cartão Ponto', opt: true }, { k: 'combo', fc: 'workDayExpanded', label: 'Jornada', opts: L.jornada, opt: true }, { k: 'text', fc: 'monthlyHours', label: 'Carga Horária', opt: true }]], ['ANEXOS', [fileF]]];
    }
    var pagamento = [{ k: 'radio', label: 'Forma de pagamento', name: 'radioBasic', items: [['radioBasic-paymentMethod0', 'Dinheiro', 'MONEY'], ['radioBasic-paymentMethod1', 'Cheque', 'CHECK'], ['radioBasic-paymentMethod2', 'Crédito em conta', 'ACCOUNT_CREDIT'], ['radioBasic-paymentMethod3', 'PIX', 'PIX']] },
      { k: 'combo', fc: 'paymentAccountType', label: 'Tipo de Conta', opts: L.conta, opt: true }, { k: 'combo', fc: 'paymentBankExpanded', label: 'Banco', opts: L.banco, opt: true }, { k: 'text', fc: 'paymentBankAgencyDescription', label: 'Agência', opt: true }, { k: 'text', fc: 'paymentAccount', label: 'Conta', opt: true }, { k: 'text', fc: 'paymentDigit', label: 'Dígito', opt: true }];
    var prof = variante === 'contrib'
      ? [['PAGAMENTO', pagamento], ['DOCUMENTOS', [{ k: 'text', fc: 'pisNumber', label: 'Número do PIS', opt: true }, { k: 'text', fc: 'inssRegistration', label: 'Matrícula INSS', opt: true }]]]
      : [['CARTEIRA PROFISSIONAL', [{ k: 'text', fc: 'workNumber', label: 'Número', opt: true }, { k: 'text', fc: 'workSerial', label: 'Série', opt: true }, { k: 'combo', fc: 'workState', label: 'UF', opts: UFS, opt: true }]], ['INFORMAÇÕES DO PIS', [{ k: 'text', fc: 'pisNumber', label: 'Número', opt: true }]], ['PAGAMENTO', pagamento]];
    var pessoal = [['ENDEREÇO', [{ k: 'text', fc: 'zipCode', label: 'CEP' }, { k: 'combo', fc: 'addressType', label: 'Tipo de Endereço', opts: L.tipoEnd, opt: true }, { k: 'text', fc: 'streetAddress', label: 'Endereço', opt: true }, { k: 'text', fc: 'addressNumber', label: 'Número', opt: true }, { k: 'text', fc: 'additionalAddress', label: 'Complemento', opt: true }, { k: 'text', fc: 'neighborhood', label: 'Bairro', opt: true }, { k: 'combo', fc: 'addressState', label: 'UF', opts: UFS, opt: true }, { k: 'combo', fc: 'addressCity', label: 'Município', opts: 'cidade:addressState' }]],
      ['INFORMAÇÕES PESSOAIS', [{ k: 'text', fc: 'primaryEmailAddress', label: 'E-mail principal', opt: true }, { k: 'text', fc: 'primaryPhoneNumber', label: 'Número de telefone 1', opt: true }, { k: 'date', fc: 'birthdate', label: 'Data de nascimento' }, { k: 'combo', fc: 'countryOrigin', label: 'País de nacionalidade', opts: L.pais }, { k: 'combo', fc: 'birthCountry', label: 'País', opts: L.pais }, { k: 'combo', fc: 'birthState', label: 'UF', opts: UFS }, { k: 'combo', fc: 'birthCity', label: 'Município de nascimento', opts: 'cidade:birthState' },
        { k: 'radio', label: 'Sexo', name: 'radioBasic', items: [['radioBasic-gender0', 'Masculino', 'M'], ['radioBasic-gender1', 'Feminino', 'F']] }, { k: 'combo', fc: 'race', label: 'Raça/Cor', opts: L.raca }, { k: 'combo', fc: 'schoolingLevel', label: 'Grau de instrução', opts: L.instrucao, opt: true }, { k: 'combo', fc: 'maritalStatus', label: 'Estado civil', opts: L.civil, opt: true }, { k: 'text', fc: 'spouseName', label: 'Nome do cônjuge', opt: true }, { k: 'text', fc: 'fatherName', label: 'Nome do pai', opt: true }, { k: 'text', fc: 'motherName', label: 'Nome da mãe' }]],
      ['PORTADOR DE DEFICIÊNCIA', [{ k: 'radio', label: 'Portador de deficiência', name: 'radioBasic', items: [['radioBasic-isDisabledPerson0', 'Não', ''], ['radioBasic-isDisabledPerson1', 'Sim', 'true']] }]]];
    var docs = [['DOCUMENTOS', [{ k: 'text', fc: 'identityCard', label: 'Número da Identidade', opt: true }, { k: 'text', fc: 'issuingAgency', label: 'Órgão de expedição da identidade', opt: true }, { k: 'combo', fc: 'identityState', label: 'UF', opts: UFS, opt: true }, { k: 'date', fc: 'identityCardIssuingDate', label: 'Data de emissão da identidade', opt: true }, { k: 'text', fc: 'electoralCard', label: 'Número do título eleitoral', opt: true }, { k: 'text', fc: 'electoralWard', label: 'Zona eleitoral', opt: true }, { k: 'text', fc: 'pollingStation', label: 'Seção eleitoral', opt: true }, { k: 'text', fc: 'militaryDischargeCertificate', label: 'Número da carteira de reservista', opt: true }, { k: 'text', fc: 'driverLicenseNumber', label: 'Número da carteira de motorista', opt: true }, { k: 'text', fc: 'driverLicenseCategory', label: 'Categoria da carteira de motorista', opt: true }, { k: 'date', fc: 'driverLicenseDueDate', label: 'Vencimento da carteira de motorista', opt: true }]]];
    return { nome: nome, ico: ico, wizard: [['Geral', geralTabs], ['Profissional', prof], ['Pessoal', pessoal], ['Documentos', docs], ['Dependentes', [['DEPENDENTES', [{ k: 'radio', label: 'Possui Dependentes', name: 'radioBasic', items: [['radioBasic-hasDependents0', 'Não', ''], ['radioBasic-hasDependents1', 'Sim', 'true']] }]]]], ['Observações', [['OBSERVAÇÕES', [{ k: 'textarea', fc: 'comments', label: 'Observações', opt: true }]]]]] };
  }
  TYPES['employee-registration'] = cadastro('Cadastro de Empregado', 'user');
  TYPES['partner-registration'] = cadastro('Cadastro de Contribuinte', 'briefcase', 'contrib');
  TYPES['intern-registration'] = cadastro('Cadastro de Estagiário', 'grad', 'estag');
  var ORDER = ['general-requests', 'employee-registration', 'partner-registration', 'intern-registration', 'vacation-notice', 'vacation-calculation', 'termination-notice', 'termination-calculation', 'employee-leave', 'payroll-entries'];
  var API = { 'employee-leave': 'employee-leave', 'employees-registrations': 'employee-registration', 'taxpayers-registrations': 'partner-registration', 'interns-registrations': 'intern-registration', 'prior-notice-vacations': 'vacation-notice', 'vacation-calculations': 'vacation-calculation', 'prior-notice-terminations': 'termination-notice', 'termination-calculations': 'termination-calculation', 'payroll-entries': 'payroll-entries' };

  /* ---------- Dados (só neste navegador) ---------- */
  var SKEY = 'ct-sim-portal';
  function seed() {
    var hoje = new Date(); var d = function (n) { var x = new Date(hoje); x.setDate(x.getDate() - n); return x.toLocaleDateString('pt-BR'); };
    return { seq: 1043, items: {
      'vacation-notice': [{ id: 1041, status: 'Aguardando o cliente', empregado: 'RONALDO DE SOUZA', assunto: 'Aviso de férias – RONALDO DE SOUZA', tramite: 'Escritório: falta informar a data do pagamento.', data: d(3) }],
      'employee-leave': [{ id: 1039, status: 'Em andamento', empregado: 'JOANA FONSECA', assunto: 'Afastamento – JOANA FONSECA – Licença maternidade', tramite: 'Escritório: recebido, em análise.', data: d(6) }],
      'general-requests': [{ id: 1042, status: 'Concluída', empregado: '', assunto: 'Envio do contrato social atualizado', tramite: 'Cliente: concluído.', data: d(10) }]
    } };
  }
  var db;
  try { db = JSON.parse(localStorage.getItem(SKEY)) || seed(); } catch (e) { db = seed(); }
  function persist() { try { localStorage.setItem(SKEY, JSON.stringify(db)); } catch (e) { /* sem armazenamento */ } }

  /* ---------- Plataforma para o Assistente ---------- */
  var path = BASE;
  var hooks = null;
  window.__ctPlatform = {
    path: function () { return path; },
    navigate: function (p) { go(p); },
    fetchList: function (api) {
      var slug = API[api]; var list = (db.items[slug] || []).map(function (r) { return { id: r.id, status: { description: r.status }, employee: { name: r.empregado }, subject: r.assunto, lastUpdate: r.data }; });
      return Promise.resolve({ ok: !!slug, status: slug ? 200 : 404, json: function () { return Promise.resolve({ items: list, totalItems: list.length }); } });
    },
    expose: function (h) { hooks = h; document.dispatchEvent(new CustomEvent('ct-sim-ready')); }
  };
  window.__ctSim = { hooks: function () { return hooks; }, reset: function () { db = seed(); persist(); go(BASE); }, go: function (p) { go(p); } };

  /* ---------- Utilidades ---------- */
  var uid = 0;
  function h(tag, attrs, html) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] === true) e.setAttribute(k, ''); else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]); }); if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(msg, kind) {
    var t = document.getElementById('p-toast'); t.textContent = msg; t.className = 'p-toast on ' + (kind || '');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = 'p-toast'; }, 3200);
  }
  var main = document.getElementById('p-main');

  /* ---------- Componentes ---------- */
  function labelEl(f, forId) { return h('label', { for: forId, class: 'p-label' }, esc(f.label) + (f.opt ? ' <i>- opcional</i>' : '')); }
  function combo(f, ctx) {
    var n = uid++;
    var wrap = h('div', { class: 'p-field' });
    var cb = h('bento-combobox', { formcontrolname: f.fc, role: 'combobox', 'aria-expanded': 'false', 'aria-owns': 'bui-combobox-' + n + '-box', class: 'p-combo' });
    var inp = h('input', { type: 'text', id: 'bui-combobox-' + n + '-input', autocomplete: 'off', spellcheck: 'false' });
    var arrow = h('span', { class: 'p-arrow', 'aria-hidden': 'true' }, '▾');
    var holder = h('div'); holder.appendChild(inp); cb.appendChild(holder); cb.appendChild(arrow);
    wrap.appendChild(labelEl(f, inp.id)); wrap.appendChild(cb);
    if (f.info) wrap.appendChild(h('small', { class: 'p-help' }, 'Somente empregados ativos na competência são listados.'));
    var options = function () {
      if (typeof f.opts === 'string' && f.opts.indexOf('cidade:') === 0) { var uf = ctx.value(f.opts.slice(7)); return CIDADES[uf] || (uf ? [uf === 'Distrito Federal' ? 'Brasília' : 'Capital de ' + uf] : []); }
      return f.opts || [];
    };
    function close() { cb.setAttribute('aria-expanded', 'false'); var b = document.getElementById(cb.getAttribute('aria-owns')); if (b) b.remove(); cb.classList.remove('open'); }
    function open() {
      if (inp.disabled) return;
      close(); cb.setAttribute('aria-expanded', 'true'); cb.classList.add('open');
      var box = h('bento-combobox-list', { id: cb.getAttribute('aria-owns'), role: 'listbox', class: 'p-list' });
      var q = inp.value && options().indexOf(inp.value) < 0 ? inp.value.toUpperCase() : '';
      var norm = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); };
      options().filter(function (o) { return !q || norm(o).indexOf(norm(q)) >= 0; }).forEach(function (o, i) {
        var row = h('div', { role: 'option', id: 'bui-combobox-list-' + n + '-' + i, class: 'bento-list-row', 'aria-selected': String(o === inp.value) }, '<span class="combobox__row"> ' + esc(o) + ' </span>');
        row.addEventListener('mousedown', function (e) { e.preventDefault(); });
        row.addEventListener('click', function () { inp.value = o; close(); cb.classList.add('ng-dirty'); cb.classList.remove('p-invalid'); inp.dispatchEvent(new Event('change', { bubbles: true })); ctx.changed(f.fc, o); });
        box.appendChild(row);
      });
      if (!box.children.length) box.appendChild(h('div', { class: 'p-empty' }, 'Nenhum resultado'));
      cb.appendChild(box);
    }
    inp.addEventListener('click', function () { cb.getAttribute('aria-expanded') === 'true' ? close() : open(); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); if (e.key === 'ArrowDown' && cb.getAttribute('aria-expanded') !== 'true') open(); });
    inp.addEventListener('input', function () { if (cb.getAttribute('aria-expanded') === 'true') open(); else open(); });
    inp.addEventListener('blur', function () { setTimeout(close, 150); });
    cb.__setDisabled = function (dis) { inp.disabled = dis; cb.classList.toggle('disabled', dis); if (dis) { inp.value = ''; } };
    ctx.register(f.fc, function () { return inp.value; }, cb, !f.opt);
    if (f.dis) ctx.dependents.push({ el: cb, rule: f.dis });
    return wrap;
  }
  function input(f, ctx) {
    var id = f.id || ('f-' + (uid++));
    var wrap = h('div', { class: 'p-field' + (f.k === 'textarea' ? ' wide' : '') });
    var el = f.k === 'textarea' ? h('textarea', { id: id, rows: 5 }) : h('input', { type: 'text', id: id, autocomplete: 'off', placeholder: f.k === 'date' ? 'DD/MM/AAAA' : null });
    if (f.fc) el.setAttribute('formcontrolname', f.fc);
    wrap.appendChild(labelEl(f, id)); wrap.appendChild(el);
    if (f.k === 'date') wrap.appendChild(h('span', { class: 'p-cal', 'aria-hidden': 'true' }, '▦'));
    el.addEventListener('input', function () { el.classList.remove('p-invalid'); ctx.changed(f.fc, el.value); });
    ctx.register(f.fc || f.label, function () { return el.value; }, el, !f.opt);
    if (f.dis) ctx.dependents.push({ el: el, rule: f.dis });
    return wrap;
  }
  function radio(f, ctx) {
    var wrap = h('fieldset', { class: 'p-field p-radios' });
    wrap.appendChild(h('legend', { class: 'p-label' }, esc(f.label)));
    var row = h('div', { class: 'p-radio-row' });
    f.items.forEach(function (it) {
      var r = h('input', { type: 'radio', id: it[0], name: (f.name || 'r') + '-' + f.label, value: it[2] != null ? it[2] : 'on' });
      if (f.fc) r.setAttribute('formcontrolname', f.fc);
      var l = h('label', { for: it[0] }, esc(it[1]));
      var item = h('span', { class: 'p-radio' }); item.appendChild(r); item.appendChild(l); row.appendChild(item);
      r.addEventListener('change', function () { ctx.changed('radio:' + f.label, it[1]); });
      if (f.dis) ctx.dependents.push({ el: r, rule: f.dis });
    });
    wrap.appendChild(row);
    ctx.register('radio:' + f.label, function () { var c = wrap.querySelector('input:checked'); return c ? c.nextSibling.textContent : ''; }, wrap, f.req !== false && !f.opt && !f.dis);
    return wrap;
  }
  function fileSel(ctx) {
    var outer = h('cc-sr-file-selector', { class: 'p-field wide' });
    var sel = h('bento-file-selector', { class: 'p-files' });
    var inp = h('input', { type: 'file', multiple: true, name: 'fileselect_' + (uid++), class: 'p-file-input', 'aria-label': 'Anexar arquivos' });
    var chips = h('div', { class: 'p-chips' });
    sel.innerHTML = '<div class="p-drop-t"><b>Arraste um arquivo aqui ou</b><span>or</span></div>';
    var btn = h('button', { type: 'button', class: 'p-btn-dark' }, 'PROCURAR ARQUIVO');
    btn.addEventListener('click', function () { inp.click(); });
    sel.appendChild(btn); sel.appendChild(inp); sel.appendChild(chips); outer.appendChild(sel);
    var files = [];
    function draw() { chips.innerHTML = ''; files.forEach(function (f, i) { var c = h('span', { class: 'p-chip' }, esc(f.name) + ' (' + f.size + 'B)'); var x = h('button', { type: 'button', 'aria-label': 'Remover ' + f.name }, '×'); x.addEventListener('click', function () { files.splice(i, 1); draw(); }); c.appendChild(x); chips.appendChild(c); }); }
    inp.addEventListener('change', function () { files = files.concat([].slice.call(inp.files || [])); draw(); });
    sel.addEventListener('dragover', function (e) { e.preventDefault(); sel.classList.add('over'); });
    sel.addEventListener('dragleave', function () { sel.classList.remove('over'); });
    sel.addEventListener('drop', function (e) { e.preventDefault(); sel.classList.remove('over'); var dt = new DataTransfer(); [].forEach.call(e.dataTransfer.files, function (f) { dt.items.add(f); }); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); });
    ctx.files = function () { return files; };
    return outer;
  }
  function payroll(ctx) {
    var box = h('div', { class: 'p-field wide' });
    box.innerHTML = '<h3 class="p-sub">Lançamento</h3>';
    var row = h('div', { class: 'p-row' });
    var seg = h('div', { class: 'p-seg', role: 'group', 'aria-label': 'Tipo de lançamento' });
    [['radioBasic-0', 'ADIANTAMENTO', 'WAGE_ADVANCE'], ['radioBasic-1', 'MENSAL', 'MONTHLY'], ['radioBasic-2', 'PLR', 'PRS']].forEach(function (it, i) {
      var r = h('input', { type: 'radio', id: it[0], name: 'radioBasic', value: it[2] }); if (i === 1) r.checked = true;
      var l = h('label', { for: it[0] }, it[1]); seg.appendChild(r); seg.appendChild(l);
    });
    var tl = h('div', { class: 'p-field' }); tl.appendChild(h('span', { class: 'p-label' }, 'Tipo de lançamento')); tl.appendChild(seg);
    var comp = h('div', { class: 'p-field' }); var ci = h('input', { type: 'text', id: 'datepicker-dropdown-input', formcontrolname: 'basisDate', placeholder: 'mm/aaaa', class: 'bento-datepicker' });
    comp.appendChild(h('label', { for: ci.id, class: 'p-label' }, 'Competência')); comp.appendChild(ci);
    ctx.register('basisDate', function () { return ci.value; }, ci, true);
    row.appendChild(tl); row.appendChild(comp); box.appendChild(row);
    var grid = h('div', { class: 'p-grid' });
    grid.innerHTML = '<div class="p-grid-h"><b>Rubricas</b><bento-toolbar><button type="button" data-all>Adicionar todos os funcionários</button><button type="button" data-one>Adicionar funcionários</button></bento-toolbar></div><div class="p-grid-b"><p>Não existem rubricas lançadas.<br>Adicione um funcionário para começar.</p></div>';
    grid.querySelector('[data-all]').addEventListener('click', function () {
      if (!ci.value) { ci.classList.add('p-invalid'); toast('Informe a competência antes de adicionar funcionários.', 'err'); return; }
      grid.querySelector('.p-grid-b').innerHTML = '<table class="p-table"><thead><tr><th>Empregado</th><th>Horas extras 50%</th><th>Faltas (dias)</th><th>Comissão</th></tr></thead><tbody>' + EMP3.map(function (e) { return '<tr><td>' + e + '</td><td><input aria-label="Horas extras de ' + e + '"></td><td><input aria-label="Faltas de ' + e + '"></td><td><input aria-label="Comissão de ' + e + '"></td></tr>'; }).join('') + '</tbody></table><small class="p-help">Grade ilustrativa: no portal real as colunas vêm dos eventos cadastrados para a empresa.</small>';
    });
    grid.querySelector('[data-one]').addEventListener('click', function () { grid.querySelector('[data-all]').click(); });
    box.appendChild(grid);
    return box;
  }

  function build(list, ctx, into) {
    list.forEach(function (f) {
      if (f.k === 'row') { var r = h('div', { class: 'p-row' }); build(f.items, ctx, r); into.appendChild(r); return; }
      if (f.k === 'combo') into.appendChild(combo(f, ctx));
      else if (f.k === 'radio') into.appendChild(radio(f, ctx));
      else if (f.k === 'file') into.appendChild(fileSel(ctx));
      else if (f.k === 'payroll') into.appendChild(payroll(ctx));
      else into.appendChild(input(f, ctx));
    });
  }

  /* ---------- Telas ---------- */
  function go(p) { path = p; render(); window.scrollTo(0, 0); }
  function sideMenu() {
    var nav = document.getElementById('p-menu');
    var slug = (path.match(/service-request\/([a-z-]+)/) || [])[1];
    nav.innerHTML = '<div class="p-menu-h">— Solicitação de Serviço</div>' + ORDER.map(function (s) { return '<button type="button" class="p-menu-i' + (s === slug ? ' on' : '') + '" data-s="' + s + '">' + esc(TYPES[s].nome) + '</button>'; }).join('') + '<div class="p-menu-h dim">+ Manifestação de NF-e</div><div class="p-menu-h dim">+ Relatórios</div>';
    nav.querySelectorAll('[data-s]').forEach(function (b) { b.addEventListener('click', function () { go(SR + b.dataset.s); }); });
  }
  var P = {
    chat: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.6A8 8 0 1 1 21 12Z"/>',
    medical: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    calc: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><rect x="8" y="5.5" width="8" height="3.5" rx=".8"/><path d="M8.5 13h1M14.5 13h1M8.5 17h1M14.5 17h1"/>',
    door: '<path d="M14 3H6a1 1 0 0 0-1 1v17h9M14 3l5 2v15l-5 1Z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    user: '<circle cx="10" cy="8" r="4"/><path d="M2.5 21a7.5 7.5 0 0 1 15 0M19 8v6M16 11h6"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
    grad: '<path d="m2 9 10-5 10 5-10 5Z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>'
  };
  var ICON = {}; Object.keys(P).forEach(function (k) { ICON[k] = '<svg viewBox="0 0 24 24">' + P[k] + '</svg>'; });
  function renderMenu() {
    main.innerHTML = '<h2 class="p-h">Solicitação de Serviço</h2><div class="p-cards"></div>';
    var grid = main.querySelector('.p-cards');
    ORDER.forEach(function (s) {
      var c = h('button', { type: 'button', class: 'p-card' }, '<span class="p-card-i" aria-hidden="true">' + (ICON[TYPES[s].ico] || '•') + '</span><span>' + esc(TYPES[s].nome) + '</span>');
      c.addEventListener('click', function () { go(SR + s); }); grid.appendChild(c);
    });
  }
  function renderList(slug) {
    var T = TYPES[slug]; var items = db.items[slug] || [];
    main.innerHTML = '<h2 class="p-h">Solicitações de ' + esc(T.nome.replace(/^Solicitação /, '')) + '</h2>' +
      '<div class="p-tablewrap"><bento-toolbar class="p-toolbar"><button type="button" data-add>⊕ Adicionar</button><button type="button" data-ref>↻ Atualizar</button><span class="sp"></span><label class="p-chk"><input type="checkbox" id="onlyPending"> Apenas pendentes</label></bento-toolbar>' +
      '<div class="p-scroll"><table class="p-table"><thead><tr><th>ID</th><th>Situação</th><th>Último Trâmite</th><th>Empregado</th><th>Assunto</th><th>Data</th></tr></thead><tbody>' +
      (items.length ? items.map(function (r) { return '<tr><td>' + r.id + '</td><td><span class="p-st ' + (/aguard/i.test(r.status) ? 'warn' : /conclu/i.test(r.status) ? 'ok' : '') + '">' + esc(r.status) + '</span></td><td>' + esc(r.tramite || '') + '</td><td>' + esc(r.empregado || '—') + '</td><td>' + esc(r.assunto || '') + '</td><td class="num">' + esc(r.data) + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="p-none">Você ainda não possui solicitações. Por favor clique em adicionar para começar.</td></tr>') +
      '</tbody></table></div></div>';
    main.querySelector('[data-add]').addEventListener('click', function () { go(SR + slug + '/add'); });
    main.querySelector('[data-ref]').addEventListener('click', function () { renderList(slug); });
  }
  function renderForm(slug) {
    var T = TYPES[slug];
    var ctx = { getters: {}, els: {}, req: [], dependents: [], files: function () { return []; },
      register: function (k, get, el, required) { this.getters[k] = get; this.els[k] = el; if (required !== false) this.req.push(k); },
      value: function (k) { return this.getters[k] ? this.getters[k]() : ''; },
      changed: function () { applyDeps(); } };
    var wizard = !!T.wizard || T.wizardButtons;
    var form = h('form', { class: 'p-form', novalidate: true });
    var head = h('div', { class: 'p-form-h' });
    head.innerHTML = '<h1 class="title">Adicionar Solicitação de ' + esc(T.nome.replace(/^Solicitação /, '')) + ' para: ' + EMPRESA + '</h1>';
    var btns = h('div', { class: 'p-form-btns' });
    var submit = h('button', { type: 'submit', class: wizard ? 'btn btn-primary' : 'form__buttons--add' }, wizard ? 'SALVAR E ENVIAR PARA O ESCRITÓRIO' : 'ADICIONAR');
    btns.appendChild(submit);
    if (wizard) { var rasc = h('button', { type: 'button', class: 'btn btn-outline' }, 'RASCUNHO'); rasc.addEventListener('click', function () { toast('Rascunho salvo (simulação).'); }); btns.appendChild(rasc); }
    var cancel = h('button', { type: 'button', class: wizard ? 'btn btn-outline' : 'form__buttons--cancel' }, 'CANCELAR');
    cancel.addEventListener('click', function () { go(SR + slug); });
    btns.appendChild(cancel); head.appendChild(btns); form.appendChild(head);

    if (T.wizard) {
      var wz = h('bento-wizard', { class: 'p-wizard' });
      var bar = h('div', { class: 'p-steps', role: 'tablist' });
      var stepsEls = [];
      T.wizard.forEach(function (st, i) {
        var b = h('button', { type: 'button', class: 'bento-wizard-step flat' + (i === 0 ? ' selected' : '') + (st[0] === 'Dependentes' ? '' : '') }, '<span class="n">' + (i + 1) + '</span><h1 class="title h5 wizard-title">' + esc(st[0]) + '</h1>');
        bar.appendChild(b);
        var stepEl = h('bento-wizard-step', { class: 'p-step' }); if (i) stepEl.hidden = true;
        var nav = h('div', { class: 'p-tabs', role: 'tablist' }); var panes = [];
        st[1].forEach(function (tab, j) {
          var pid = 'ngb-nav-' + i + '-' + j + '-panel';
          var a = h('a', { href: '', role: 'tab', 'aria-controls': pid, 'aria-selected': String(j === 0), class: 'nav-link' + (j === 0 ? ' active' : '') }, '<span>' + esc(tab[0]) + '</span>');
          var pane = h('div', { role: 'tabpanel', id: pid, class: 'p-pane' }); if (j) pane.hidden = true;
          build(tab[1], ctx, pane);
          a.addEventListener('click', function (e) { e.preventDefault(); panes.forEach(function (p, k) { p.hidden = k !== j; }); nav.querySelectorAll('a').forEach(function (x, k) { x.classList.toggle('active', k === j); x.setAttribute('aria-selected', String(k === j)); }); });
          nav.appendChild(a); panes.push(pane);
        });
        stepEl.appendChild(nav); panes.forEach(function (p) { stepEl.appendChild(p); });
        var nextRow = h('div', { class: 'p-next' });
        if (i) { var prev = h('button', { type: 'button', class: 'btn btn-outline' }, 'VOLTAR PARA ETAPA ANTERIOR'); prev.addEventListener('click', function () { bar.children[i - 1].click(); }); nextRow.appendChild(prev); }
        if (i < T.wizard.length - 1) { var nx = h('button', { type: 'button', class: 'btn btn-primary' }, 'PRÓXIMA'); nx.addEventListener('click', function () { bar.children[i + 1].click(); }); nextRow.appendChild(nx); }
        stepEl.appendChild(nextRow);
        stepsEls.push(stepEl);
        b.addEventListener('click', function () { stepsEls.forEach(function (s, k) { s.hidden = k !== i; }); [].forEach.call(bar.children, function (x, k) { x.classList.toggle('selected', k === i); }); });
      });
      wz.appendChild(bar); stepsEls.forEach(function (s) { wz.appendChild(s); }); form.appendChild(wz);
    } else {
      var body = h('div', { class: 'p-form-b' }); build(T.fields, ctx, body); form.appendChild(body);
    }

    function applyDeps() {
      var leave = ctx.value('selectedLeaveType');
      var cat = /Acid\. Trabalho|mesmo acid/i.test(leave || '');
      ctx.dependents.forEach(function (d) {
        var on = d.rule === 'cat' ? cat : d.rule === 'emp' ? !!ctx.value('employee') : true;
        if (d.el.__setDisabled) d.el.__setDisabled(!on); else { d.el.disabled = !on; if (!on && d.el.type !== 'radio') d.el.value = ''; if (!on && d.el.type === 'radio') d.el.checked = false; }
      });
      // municípios dependem da UF
      ['addressCity', 'birthCity'].forEach(function (fc) { var el = ctx.els[fc]; if (el && el.__setDisabled) { var uf = ctx.value(fc === 'addressCity' ? 'addressState' : 'birthState'); el.__setDisabled(!uf); } });
    }
    applyDeps();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var faltando = ctx.req.filter(function (k) {
        var el = ctx.els[k]; if (!el) return false;
        if (el.tagName === 'BENTO-COMBOBOX') { var inp = el.querySelector('input'); if (inp.disabled) return false; }
        else if (el.disabled) return false;
        var v = ctx.value(k); var bad = !v || !String(v).trim();
        if (bad) (el.tagName === 'FIELDSET' ? el : el).classList.add('p-invalid');
        return bad;
      });
      if (faltando.length && !T.wizard) { toast('Corrija os erros e tente novamente.', 'err'); return; }
      var empregado = ctx.value('selectedEmployee') || ctx.value('employee') || ctx.value('name') || '';
      var assunto = ctx.value('subject') || ctx.value('Assunto') || T.nome;
      db.seq += 1;
      (db.items[slug] = db.items[slug] || []).unshift({ id: db.seq, status: 'Aberta', empregado: empregado, assunto: assunto, tramite: 'Cliente: solicitação incluída' + (ctx.files().length ? ' com ' + ctx.files().length + ' anexo(s)' : '') + '.', data: new Date().toLocaleDateString('pt-BR') });
      persist();
      go(SR + slug);
      toast('Solicitação incluída nesta simulação. Nada foi enviado ao escritório.', 'ok');
    });
    main.innerHTML = '';
    main.appendChild(h('h2', { class: 'p-h' }, 'Solicitações de ' + esc(T.nome.replace(/^Solicitação /, ''))));
    main.appendChild(form);
  }
  function render() {
    sideMenu();
    var m = path.match(/service-request\/([a-z-]+)(\/add)?/);
    if (!m || !TYPES[m[1]]) renderMenu();
    else if (m[2]) renderForm(m[1]);
    else renderList(m[1]);
    document.querySelectorAll('[data-top]').forEach(function (b) { b.classList.toggle('on', b.dataset.top === 'portal'); });
  }
  document.getElementById('p-empresa').textContent = EMPRESA;
  document.querySelectorAll('[data-top]').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.top === 'portal') go(BASE); else toast('Esta área não faz parte da simulação.'); }); });
  render();
})();
