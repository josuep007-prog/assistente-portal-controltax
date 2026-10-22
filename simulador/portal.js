/* Réplica de testes do Portal do Cliente (visão do cliente).
 * Reproduz a ESTRUTURA de tela mapeada em docs/mapa-portal.md (formcontrolname, bento-combobox,
 * rádios radioBasic-*, etapas do cadastro, seletor de anexos) para que o Assistente rode igual ao real.
 * Nada aqui fala com o Onvio. Os dados ficam só neste navegador. */
(function () {
  'use strict';
  var BASE = '/clientcenter/pt/actions';
  var SR = BASE + '/service-request/';
  var EMPRESA = 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA';
  var EMPRESA_BASE = EMPRESA;
  // as outras empresas do mesmo login (inventadas), cada uma com os seus funcionários
  var OUTRA = 'COMERCIO MODELO DE ALIMENTOS LTDA', TERCEIRA = 'OFICINA FICTICIA DE SERVICOS ME';
  var FUNC_EMPRESA = {}, BASE_FUNC = null;
  FUNC_EMPRESA[OUTRA] = ['CARLOS EDUARDO PAIVA', 'DEBORA SANTANA', 'ELISA MARTINS', 'FERNANDO GOUVEIA', 'GISELE TAVARES'];
  FUNC_EMPRESA[TERCEIRA] = ['HUGO BARRETO', 'IRENE COUTINHO', 'JULIO CESAR NETO'];
  // lista longa (como numa empresa real): o portal só desenha ~13 nomes por vez (lista virtualizada)
  var EMP5 = ['ADRIANA MOTA LIMA', 'ALEXANDRE PIRES', 'BEATRIZ CAMPOS', 'BRUNO TEIXEIRA', 'CAMILA ROCHA', 'DANIEL FERREIRA', 'EDUARDO NUNES', 'FABIANA LOPES', 'FRANCISCO DE MOURA', 'GABRIEL MENDES', 'HELENA DUARTE', 'IVONE CARDOSO', 'JOANA FONSECA', 'JOAO DA SILVA', 'JORGE OLIVEIRA ALVES', 'KARINA BASTOS', 'LUCAS MOREIRA', 'MARCOS VIEIRA', 'PATRICIA GOMES', 'RONALDO DE SOUZA', 'SILVIA RAMOS', 'THIAGO CARVALHO', 'VANESSA PRADO', 'WAGNER SOUSA'];
  var EMP3 = ['JOAO DA SILVA', 'JORGE OLIVEIRA ALVES', 'RONALDO DE SOUZA'];
  var UFS = ['Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí', 'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins'];
  var CIDADES = {
    'São Paulo': ['São Paulo', 'Campinas', 'Guarulhos', 'Osasco', 'Santo André', 'São Bernardo do Campo', 'Santos', 'Sorocaba', 'Ribeirão Preto', 'Jundiaí'],
    'Rio de Janeiro': ['Rio de Janeiro', 'Niterói', 'Duque de Caxias', 'Nova Iguaçu', 'Petrópolis'],
    'Minas Gerais': ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim'],
    'Paraná': ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa'],
    'Bahia': ['Salvador', 'Feira de Santana', 'Vitória da Conquista']
  };
  var LEAVE = ['Afastamento direitos integrais', 'Acid. Trabalho período superior a 15 dias', 'Serviço militar', 'Licença maternidade', 'Doença período superior a 15 dias', 'Licença sem vencimento', 'Novo afast. mesmo acid. Trabalho', 'Antecipação e/ou prorrogação Licença Maternidade', 'Novo afast. mesma doença', 'Exercício de mandato sindical', 'Aposent. por invalid. Acidente de trabalho', 'Aposent. por invalid. doença profissional', 'Aposent. por invalid. exceto acidente e doença profissional', 'Acid. Trabalho período igual ou inferior a 15 dias', 'Doença período igual ou inferior a 15 dias', 'Aborto não criminoso', 'Licença maternidade adoção 1 ano', 'Licença maternidade adoção 1 até 4 anos', 'Licença maternidade adoção 4 até 8 anos', 'Outros motivos de afastamento', 'Prorrogação licença maternidade 60 dias', 'Prorrogação licença maternidade 60 dias adoção 1 ano', 'Prorrogação licença maternidade 30 dias adoção 1 até 4 anos', 'Prorrogação licença maternidade 15 dias adoção 4 até 8 anos', 'Recesso Estagiário', 'Falecimento do contribuinte', 'Licença paternidade', 'Afastamento por irregularidade no FGTS', 'Cárcere', 'Participação de curso ou programa de qualificação', 'Ausência justificada', 'Encerramento de estágio', 'Licença maternidade por morte da genitora', 'Acid. Trabalho período superior a 30 dias', 'Doença período superior a 30 dias', 'Acid. Trabalho período igual ou inferior a 30 dias', 'Doença período igual ou inferior a 30 dias', 'Doença profissional período igual ou inferior a 15 dias', 'Doença profissional superior a 15 dias'];
  // eventos da empresa na grade do Lançamento de Rubricas (inventados; nomes um pouco diferentes dos da planilha de exemplo)
  var EVENTOS = ['0001 - HORAS EXTRAS 50%', '0002 - HORAS EXTRAS 100%', '0010 - FALTAS', '0011 - ATRASOS', '0020 - COMISSÕES', '0030 - ADICIONAL NOTURNO'];
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
    // dois campos que as regras não conhecem (testam o grupo 'Outros campos do portal'): um texto e uma lista
    basicos.push({ k: 'text', fc: 'eSocialRegistration', label: 'Matrícula eSocial', opt: true }, { k: 'combo', fc: 'admissionTypeExpanded', label: 'Tipo de admissão', opts: ['Admissão', 'Transferência', 'Reintegração'], opt: true });
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
  var API = { 'tickets/generic': 'general-requests', 'employee-leave': 'employee-leave', 'employees-registrations': 'employee-registration', 'taxpayers-registrations': 'partner-registration', 'interns-registrations': 'intern-registration', 'prior-notice-vacations': 'vacation-notice', 'vacation-calculations': 'vacation-calculation', 'prior-notice-terminations': 'termination-notice', 'termination-calculations': 'termination-calculation', 'payroll-entries': 'payroll-entries' };

  /* ---------- Dados (só neste navegador) ---------- */
  var SKEY = 'ct-sim-portal';
  var SEED_V = 9;
  function seed() {
    var hoje = new Date(); var d = function (n) { var x = new Date(hoje); x.setDate(x.getDate() - n); return x.toLocaleDateString('pt-BR'); };
    var items = {
      'vacation-notice': [{ id: 1041, status: 'Aguardando o cliente', empregado: 'RONALDO DE SOUZA', assunto: 'Aviso de férias – RONALDO DE SOUZA', tramite: 'Escritório: falta informar a data do pagamento.', data: d(3), inicio: d(-20), dias: 20, abono: 10 }],
      'employee-leave': [{ id: 1039, status: 'Em andamento', empregado: 'JOANA FONSECA', assunto: 'Afastamento – JOANA FONSECA – Licença maternidade', tramite: 'Cliente: segue em anexo a certidão de nascimento.', data: d(6) }],
      'general-requests': [{ id: 1042, status: 'Concluída', empregado: '', assunto: 'Envio do contrato social atualizado', tramite: 'Cliente: concluído.', data: d(10) },
        { id: 1060, status: 'Aguardando o cliente', empregado: '', assunto: 'Informe de rendimentos 2025', tramite: 'Escritório: segue o seu comprovante de rendimentos de 2025. Qualquer dúvida, estamos à disposição.', data: d(2), anexos: ['Informe de rendimentos 2025.pdf'] }]
    };
    // histórico maior (inventado): o afastamento passa de 50 itens para testar a paginação
    var ST = ['Concluída', 'Concluída', 'Concluída', 'Concluída', 'Concluída', 'Cancelada'];   // só as duas mais novas ficam em aberto
    var seq = 900;
    for (var i = 0; i < 54; i++) {
      var nome = EMP5[(i * 7) % EMP5.length];
      items['employee-leave'].push({ id: seq++, status: i < 2 ? ['Em andamento', 'Aberta'][i] : ST[i % ST.length], empregado: nome, assunto: 'Atestado médico – ' + nome + ' – ' + d(12 + i * 5) + ' (' + (1 + i % 5) + ' dias)', tramite: 'Escritório: lançado na folha.', data: d(12 + i * 5) });
    }
    items['vacation-calculation'] = [{ id: seq++, status: 'Aguardando o cliente', empregado: 'CAMILA ROCHA', assunto: 'Cálculo de férias – CAMILA ROCHA', tramite: 'Escritório: confirme se haverá abono pecuniário.', data: d(23), inicio: d(-12), dias: 30 },
      { id: seq++, status: 'Concluída', empregado: 'BRUNO TEIXEIRA', assunto: 'Cálculo de férias – BRUNO TEIXEIRA', tramite: 'Escritório: recibo disponível.', data: d(40), anexos: ['Recibo de férias - BRUNO TEIXEIRA.pdf', 'Aviso de férias - BRUNO TEIXEIRA.pdf'] }];
    items['termination-notice'] = [{ id: seq++, status: 'Em andamento', empregado: 'MARCOS VIEIRA', assunto: 'Pedido de demissão – MARCOS VIEIRA', tramite: 'Escritório: aviso emitido, aguardando assinatura.', data: d(4), anexos: ['Aviso prévio - MARCOS VIEIRA.pdf'], anexosAbertura: ['carta-de-demissao.jpg'] }];
    items['employee-registration'] = [{ id: seq++, status: 'Concluída', empregado: 'VANESSA PRADO', assunto: 'Admissão – VANESSA PRADO', tramite: 'Escritório: registro concluído.', data: d(41), anexosAbertura: ['RG - VANESSA PRADO.pdf', 'Comprovante de endereço.png', 'Ficha de admissão.xlsx'] },
      { id: seq++, status: 'Concluída', empregado: 'WAGNER SOUSA', assunto: 'Admissão – WAGNER SOUSA', tramite: 'Escritório: registro concluído.', data: d(86) }];
    // competência de uns dois meses e meio atrás: o lançamento do mês (e o do mês anterior) ainda não foi feito — o Hoje lembra das variáveis da folha
    var antes = new Date(hoje); antes.setDate(antes.getDate() - 75);
    items['payroll-entries'] = [{ id: seq++, status: 'Concluída', empregado: '', assunto: 'Variáveis da folha – competência anterior', tramite: 'Escritório: lançado.', data: d(20), competencia: String(antes.getMonth() + 1).padStart(2, '0') + '/' + antes.getFullYear() }];
    // o mesmo login vê outras duas empresas (inventadas): para escolher uma, várias ou todas na plataforma
    items['general-requests'].push({ id: seq++, status: 'Aguardando o cliente', empregado: '', assunto: 'Alvará de funcionamento 2026', tramite: 'Escritório: envie o alvará renovado, por favor.', data: d(5), empresa: OUTRA, apelido: 'MODELO' },
      { id: seq++, status: 'Em andamento', empregado: '', assunto: 'Certidão negativa de débitos', tramite: 'Cliente: aguardo a certidão.', data: d(3), empresa: OUTRA, apelido: 'MODELO' },
      { id: seq++, status: 'Em andamento', empregado: '', assunto: 'Parcelamento do Simples', tramite: 'Cliente: podem simular o parcelamento?', data: d(1), empresa: TERCEIRA, apelido: 'OFICINA' });
    return { v: SEED_V, seq: 1043, items: items };
  }
  var db;
  try { db = JSON.parse(localStorage.getItem(SKEY)); } catch (e) { db = null; }
  if (!db || db.v !== SEED_V) db = seed();
  function persist() { try { localStorage.setItem(SKEY, JSON.stringify(db)); } catch (e) { /* sem armazenamento */ } }

  /* ---------- Plataforma para o Assistente ---------- */
  var path = BASE;
  var hooks = null;
  window.__ctPlatform = {
    path: function () { return path; },
    navigate: function (p) { go(p); },
    // trocar de empresa como o portal: o cabeçalho muda, os funcionários são os da empresa nova e a tela volta ao início
    trocarEmpresa: function (nome) {
      var base = [EMPRESA_BASE, OUTRA, TERCEIRA];
      if (base.indexOf(nome) < 0) return Promise.resolve({ ok: false });
      if (!BASE_FUNC) BASE_FUNC = { e5: EMP5.slice(), e3: EMP3.slice() };
      var e5 = nome === EMPRESA_BASE ? BASE_FUNC.e5 : FUNC_EMPRESA[nome], e3 = nome === EMPRESA_BASE ? BASE_FUNC.e3 : FUNC_EMPRESA[nome].slice(0, 3);
      EMP5.splice.apply(EMP5, [0, EMP5.length].concat(e5));
      EMP3.splice.apply(EMP3, [0, EMP3.length].concat(e3));
      EMPRESA = nome;
      document.getElementById('p-empresa').textContent = EMPRESA;
      go(BASE);
      return Promise.resolve({ ok: true, empresa: nome });
    },
    // mesmo formato da API real (mapa do Onvio de 15/10/2026): genericStatus numérico por família, identifier,
    // id GUID, funcionário e responsável em *Expanded; pageIndex começa em 1
    fetchList: function (api, opts) {
      var slug = API[api]; var all = (db.items[slug] || []).map(function (r) { return itemApi(slug, r); });
      var per = (opts && opts.itemsPerPage) || 50, pg = Math.max(1, (opts && opts.pageIndex) || 1);
      var list = all.slice((pg - 1) * per, pg * per);
      return Promise.resolve({ ok: !!slug, status: slug ? 200 : 404, json: function () { return Promise.resolve({ items: list, totalItems: all.length }); } });
    },
    // mesma forma da API do portal (/api/br-payroll-sr/v1/clients/<id>/employees): nome, situação e admissão
    employees: function () {
      return Promise.resolve(EMP5.map(function (n) { return { name: n, status: 'Ativo', hireDate: admissao(n), cpf: cpfFicticio(n) }; })
        .concat(DESLIGADOS.map(function (n) { return { name: n, status: 'Demitido', hireDate: '2021-03-01', cpf: cpfFicticio(n) }; })));
    },
    clientId: function () { return 'sim-0001'; },
    // trâmites: {base}/{id}/topics (o id é o GUID do item)
    tramites: function (base, guid) {
      var r = null, slug = null;
      Object.keys(db.items).forEach(function (k) { (db.items[k] || []).forEach(function (x) { if (guidDe(x.id) === guid) { r = x; slug = k; } }); });
      if (!r) return Promise.resolve([]);
      var cod = codigoDe(slug, r.status);
      return Promise.resolve([
        { created: isoDe(r.data, 2), status: 1, description: '<p>Solicitação incluída pelo cliente.</p>', createdByContactExpanded: { name: 'Usuário de teste' }, attachmentsExpanded: (r.anexosAbertura || []).map(function (n) { return { name: n }; }) },
        { created: isoDe(r.data, 0), status: /^Cliente/.test(r.tramite || '') ? (FAMILIA[slug] === 'cadastro' ? 2 : FAMILIA[slug] === 'rubricas' ? 11 : 3) : cod, description: '<p>' + esc(String(r.tramite || '').replace(/^(Escritório|Cliente):\s*/, '')) + '</p>', createdByContactExpanded: { name: /^Cliente/.test(r.tramite || '') ? 'Usuário de teste' : 'ANA ANALISTA (escritório)' }, attachmentsExpanded: (r.anexos || []).map(function (n) { return { name: n }; }) }
      ]);
    },
    // detalhe de uma solicitação ({lista}/{id}?expand=all): datas do aviso de férias e de rescisão
    detalheItem: function (key, guid) {
      var slug = API[key] || key, r = (db.items[slug] || []).find(function (x) { return guidDe(x.id) === guid; });
      if (!r) return Promise.resolve(null);
      var it = itemApi(slug, r);
      var dia = function (br, n) { return isoDe(br, n).slice(0, 10) + 'T00:00:00'; };   // datas "só dia", como no Onvio
      if (r.inicio) { it.vacationStartDate = dia(r.inicio, 0); it.paymentDate = dia(r.inicio, 2); it.vacationDays = r.dias || 30; }
      if (r.abono != null) it.bonusDays = r.abono;   // dias de abono do aviso (para o "Pedir o cálculo")
      if (slug === 'termination-notice') { it.adviceDate = dia(r.data, 0); it.reason = 'ApprenticeContractTermination'; it.grantedBy = 'EMPLOYEE'; }   // como o Onvio manda (em inglês)
      // para o "Pedir de novo" (lote 6): o tipo de afastamento e dados de saúde inventados (que nunca podem ir para o pedido novo),
      // o cálculo de férias com as escolhas, e o cadastro com dados da pessoa e da empresa (só os da empresa podem ir) — a calibrar
      if (slug === 'employee-leave') { it.leaveDate = dia(r.data, 0); it.employeeLeaveTypeExpanded = { description: /maternidade/i.test(r.assunto || '') ? 'Licença maternidade' : 'Doença período igual ou inferior a 15 dias' }; it.cid = 'Z76'; it.doctorName = 'DR. MEDICO DE EXEMPLO'; it.crm = '00000'; }
      if (slug === 'vacation-calculation') { it.initialDate = it.vacationStartDate || dia(r.data, -10); it.payBonusDays = false; it.payFirstInstallmentEarlier = true; }
      if (FAMILIA[slug] === 'cadastro') { it.admissionDate = dia(r.data, 3); it.nationalIdentity = '000.000.000-00'; it.motherName = 'MAE DE EXEMPLO'; it.jobPositionExpanded = { description: 'VENDEDOR' }; it.employeeRegistrationProfessionalExpanded = { departmentExpanded: { description: 'ESCRITÓRIO' } }; it.daysExperience = 45; it.extensionDays = 45; }
      if (slug === 'general-requests') it.departmentExpanded = { name: 'CONTÁBIL' };
      // lançamento de rubricas já feito (formato inventado, a calibrar: a empresa de teste do Onvio não tem eventos)
      if (slug === 'payroll-entries') {
        it.entryType = 'MONTHLY';
        it.payrollEntryClientEmployeeExpanded = [
          { clientEmployeeExpanded: { name: 'JOAO DA SILVA' }, payrollEntryItems: [{ eventExpanded: { description: '0001 - HORAS EXTRAS 50%' }, value: '08:00' }] },
          { clientEmployeeExpanded: { name: 'RONALDO DE SOUZA' }, payrollEntryItems: [{ eventExpanded: { description: '0020 - COMISSÕES' }, value: '420,00' }, { eventExpanded: { description: '0010 - FALTAS' }, value: '1' }] }];
      }
      return Promise.resolve(it);
    },
    // sem rota direta do detalhe (como no Onvio real, até ser mapeada): "Ver/Responder no portal" procura o nº na lista
    rotaDocumentos: '/clientcenter/pt/documents',
    // documentos que o escritório publica (inventados): guias e holerites
    documentos: function () { return Promise.resolve(DOCS.map(function (x) { return { id: x.id, nome: x.nome, categoria: x.cat, competencia: x.comp, data: x.data }; })); },
    baixarDocumento: function (id) {
      var x = DOCS.find(function (k) { return k.id === id; }); if (!x) return Promise.resolve(null);
      return Promise.resolve(new File([pdfSimples(['DOCUMENTO DE EXEMPLO DO SIMULADOR', x.nome, 'Competência ' + x.comp, EMPRESA, 'Nada aqui é real.'])], x.arquivo, { type: 'application/pdf' }));
    },
    // a plataforma começa abaixo da barra do simulador (para os documentos de exemplo continuarem à mão)
    reservaTopo: function () { var b = document.querySelector('.sim-bar'); return b ? b.offsetHeight : 0; },
    modoInicial: function () { return /[?&]modo=painel/.test(location.search) ? 'painel' : 'plataforma'; },
    expose: function (h) { hooks = h; document.dispatchEvent(new CustomEvent('ct-sim-ready')); }
  };
  window.__ctSim = { hooks: function () { return hooks; }, reset: function () { db = seed(); persist(); go(BASE); }, go: function (p) { go(p); },
    // o escritório responde uma solicitação (para testar a leitura automática da plataforma)
    escritorioResponde: function (id, texto) {
      Object.keys(db.items).forEach(function (k) { (db.items[k] || []).forEach(function (x) { if (x.id === id) { x.status = 'Aguardando o cliente'; x.data = new Date().toLocaleDateString('pt-BR'); x.tramite = 'Escritório: ' + (texto || 'precisamos de uma informação.'); } }); });
      persist();
    },
    // janela do portal por cima de tudo (como um aviso de sessão): a plataforma precisa avisar
    atencao: function () {
      var d = h('div', { role: 'dialog', class: 'p-dialog', 'aria-label': 'Aviso do portal' }, '<p><b>Sua sessão vai expirar em 2 minutos.</b> Deseja continuar conectado?</p>');
      var ok = h('button', { type: 'button', class: 'p-btn-dark' }, 'CONTINUAR'); ok.addEventListener('click', function () { d.remove(); }); d.appendChild(ok); document.body.appendChild(d);
    } };
  // CPF inventado (válido, só dígitos) para cada nome: a lista de empregados da API traz o CPF (nome do campo a calibrar no Onvio real)
  function cpfFicticio(nome) {
    var h = 7; for (var i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) % 99999999;
    var d = String(900000000 + h % 99999999).slice(0, 9).split('').map(Number);
    if (d.every(function (x) { return x === d[0]; })) d[8] = (d[0] + 1) % 10;
    function dv(a, n) { var t = 0; for (var k = 0; k < n; k++) t += a[k] * (n + 1 - k); var r = (t * 10) % 11; return r === 10 ? 0 : r; }
    d.push(dv(d, 9)); d.push(dv(d, 10)); return d.join('');
  }
  var DESLIGADOS = ['OTAVIO RANGEL', 'NATALIA BRITO'];
  var FAMILIA = { 'employee-registration': 'cadastro', 'partner-registration': 'cadastro', 'intern-registration': 'cadastro', 'payroll-entries': 'rubricas' };
  var CODIGOS = {
    padrao: { 'Aberta': 1, 'Em andamento': 2, 'Aguardando o cliente': 4, 'Concluída': 5, 'Cancelada': 6 },
    cadastro: { 'Aberta': 1, 'Em andamento': 2, 'Aguardando o cliente': 3, 'Concluída': 6, 'Cancelada': 6 },
    rubricas: { 'Aberta': 1, 'Em andamento': 2, 'Aguardando o cliente': 4, 'Concluída': 8, 'Cancelada': 10 }
  };
  function codigoDe(slug, status) { return (CODIGOS[FAMILIA[slug] || 'padrao'] || {})[status] || 2; }
  function guidDe(id) { var h = ''; var n = Number(id) || 0; for (var i = 0; i < 32; i++) h += ((n * 2654435761 + i * 40503) >>> (i % 24) & 15).toString(16); return h; }
  function isoDe(br, menosDias) { var m = String(br || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); var d = m ? new Date(+m[3], +m[2] - 1, +m[1], 10, 0) : new Date(); d.setDate(d.getDate() - (menosDias || 0)); return d.toISOString().slice(0, 19); }
  function itemApi(slug, r) {
    var cod = codigoDe(slug, r.status), quando = isoDe(r.data, 0);
    var it = { id: guidDe(r.id), identifier: r.id, genericStatus: cod, created: isoDe(r.data, 2), subject: r.assunto, clientExpanded: r.empresa ? { code: r.empresa.length, name: r.empresa, nickname: r.apelido || '' } : { code: 1, name: EMPRESA_BASE, nickname: 'EXEMPLO' } };
    if (FAMILIA[slug] === 'rubricas') it.genericLastUpdated = quando; else it.lastUpdated = quando;
    if (r.competencia) { var cm = String(r.competencia).match(/(\d{2})\/(\d{4})/); if (cm) it.effectiveDate = cm[2] + '-' + cm[1] + '-01T00:00:00'; }   // competência (Rubricas)
    if (FAMILIA[slug] === 'cadastro') { it.name = r.empregado; it.clientStatus = cod; }
    else if (r.empregado) it.clientEmployeeExpanded = { name: r.empregado };
    if (cod !== 1 && cod !== 5 && cod !== 6 && cod !== 8) it.staffResponsibleExpanded = { name: 'ANA ANALISTA' };
    if (/calculation|leave|general/.test(slug)) { var due = new Date(quando); due.setDate(due.getDate() + 5); it.dueDate = due.toISOString().slice(0, 19); }
    return it;
  }
  function admissao(n) {
    var dd = function (k) { var x = new Date(); x.setDate(x.getDate() - k); return x.toISOString().slice(0, 10); };
    if (n === 'VANESSA PRADO') return dd(40);
    if (n === 'WAGNER SOUSA') return dd(85);
    var i = EMP5.indexOf(n);
    // espalha as admissões entre 2019 e 2025 (algumas com férias vencendo)
    return (2019 + i % 7) + '-' + String(1 + (i * 5) % 12).padStart(2, '0') + '-' + String(1 + (i * 3) % 27).padStart(2, '0');
  }
  var DOCS = (function () {
    var hoje = new Date(); var comp = function (k) { var x = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1); return String(x.getMonth() + 1).padStart(2, '0') + '/' + x.getFullYear(); };
    var dia = function (k) { var x = new Date(hoje); x.setDate(x.getDate() - k); return x.toLocaleDateString('pt-BR'); };
    return [
      { id: 'd1', nome: 'Guia do FGTS Digital', cat: 'Guias', comp: comp(1), data: dia(5), arquivo: 'guia-fgts.pdf' },
      { id: 'd2', nome: 'DARF — INSS (DCTFWeb)', cat: 'Guias', comp: comp(1), data: dia(5), arquivo: 'darf-inss.pdf' },
      { id: 'd3', nome: 'Holerites', cat: 'Folha', comp: comp(1), data: dia(8), arquivo: 'holerites.pdf' },
      { id: 'd4', nome: 'Resumo da folha', cat: 'Folha', comp: comp(1), data: dia(8), arquivo: 'resumo-folha.pdf' },
      { id: 'd5', nome: 'Recibo de férias – BRUNO TEIXEIRA', cat: 'Férias', comp: comp(2), data: dia(38), arquivo: 'recibo-ferias.pdf' },
      { id: 'd6', nome: 'Guia do FGTS Digital', cat: 'Guias', comp: comp(2), data: dia(35), arquivo: 'guia-fgts-anterior.pdf' }
    ];
  })();
  /** PDF mínimo de uma página com algumas linhas de texto (só para o download funcionar no simulador). */
  function pdfSimples(linhas) {
    var txt = linhas.map(function (l, i) { return 'BT /F1 14 Tf 60 ' + (760 - i * 24) + ' Td (' + String(l).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[()\\]/g, '') + ') Tj ET'; }).join('\n');
    var objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Length ' + txt.length + ' >>\nstream\n' + txt + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    var out = '%PDF-1.4\n', offs = [];
    objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var x = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(function (o) { return String(o).padStart(10, '0') + ' 00000 n \n'; }).join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
    return out;
  }

  /* ---------- Utilidades ---------- */
  var uid = 0;
  function h(tag, attrs, html) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] === true) e.setAttribute(k, ''); else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]); }); if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(msg, kind) {
    var t = document.getElementById('p-toast'); t.textContent = msg; t.className = 'p-toast on ' + (kind || '');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = 'p-toast'; }, 3200);
  }
  var main = document.getElementById('p-main');
  function marcarErro(el, msg) {
    el.classList.add('p-invalid', 'ng-invalid', 'ng-touched'); el.setAttribute('aria-invalid', 'true');
    var box = el.classList.contains('p-field') ? el : el.closest('.p-field'); if (!box) return;
    var m = box.querySelector(':scope > .invalid-feedback'); if (!m) { m = h('div', { class: 'invalid-feedback', role: 'alert' }); box.appendChild(m); }
    m.textContent = msg;
  }
  function limparErro(el) {
    el.classList.remove('p-invalid', 'ng-invalid', 'ng-touched'); el.removeAttribute('aria-invalid');
    var box = el.classList.contains('p-field') ? el : el.closest('.p-field'); var m = box && box.querySelector(':scope > .invalid-feedback'); if (m) m.remove();
  }
  function dataOk(v) { var m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!m) return false; var d = new Date(+m[3], +m[2] - 1, +m[1]); return d.getMonth() === +m[2] - 1 && d.getDate() === +m[1]; }
  // o portal busca os municípios depois de escolher a UF: a lista fica vazia ("Carregando…") por um tempo
  var CARGA_MUNICIPIOS_MS = 2000;
  // anexos: o portal recusa formatos que não aceita e arquivos grandes (a calibrar no Onvio real)
  var ANEXO_PERMITIDO = /\.(pdf|png|jpe?g|gif|bmp|tiff?|webp|heic|docx?|xlsx?|csv|txt|odt|ods|rtf|xml)$/i, ANEXO_LIMITE = 10 * 1024 * 1024;

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
      if (typeof f.opts === 'string' && f.opts.indexOf('cidade:') === 0) { var ufFc = f.opts.slice(7), uf = ctx.value(ufFc); if (Date.now() - (ctx.mudouEm[ufFc] || 0) < CARGA_MUNICIPIOS_MS) return null; return CIDADES[uf] || (uf ? [uf === 'Distrito Federal' ? 'Brasília' : 'Capital de ' + uf] : []); }
      return f.opts || [];
    };
    function close() { cb.setAttribute('aria-expanded', 'false'); var b = document.getElementById(cb.getAttribute('aria-owns')); if (b) b.remove(); cb.classList.remove('open'); }
    function open() {
      if (inp.disabled) return;
      close(); cb.setAttribute('aria-expanded', 'true'); cb.classList.add('open');
      var box = h('bento-combobox-list', { id: cb.getAttribute('aria-owns'), role: 'listbox', class: 'p-list' });
      var todas = options();
      if (todas === null) { box.appendChild(h('div', { class: 'p-empty' }, 'Carregando…')); cb.appendChild(box); return; }
      var q = inp.value && todas.indexOf(inp.value) < 0 ? inp.value.toUpperCase() : '';
      var norm = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); };
      var lista = todas.filter(function (o) { return !q || norm(o).indexOf(norm(q)) >= 0; });
      function linha(o, i) {
        var row = h('div', { role: 'option', id: 'bui-combobox-list-' + n + '-' + i, class: 'bento-list-row', 'aria-selected': String(o === inp.value) }, '<span class="combobox__row"> ' + esc(o) + ' </span>');
        row.addEventListener('mousedown', function (e) { e.preventDefault(); });
        row.addEventListener('click', function () { inp.value = o; close(); cb.classList.add('ng-dirty'); limparErro(cb); inp.dispatchEvent(new Event('change', { bubbles: true })); ctx.changed(f.fc, o); });
        return row;
      }
      if (lista.length > 13) {
        // como o cdk-virtual-scroll do portal: só as linhas visíveis existem no DOM
        var H = 40, vp = h('cdk-virtual-scroll-viewport', { class: 'cdk-virtual-scroll-viewport bento-list-viewport', style: 'display:block;height:' + (8 * H) + 'px;overflow:auto;position:relative' });
        var spacer = h('div', { style: 'height:' + (lista.length * H) + 'px;position:relative' }); vp.appendChild(spacer);
        var desenhar = function () { var ini = Math.floor(vp.scrollTop / H); spacer.innerHTML = ''; lista.slice(ini, ini + 13).forEach(function (o, k) { var r = linha(o, ini + k); r.style.cssText = 'position:absolute;left:0;right:0;top:' + ((ini + k) * H) + 'px;height:' + H + 'px'; spacer.appendChild(r); }); };
        vp.addEventListener('scroll', desenhar); desenhar(); box.appendChild(vp);
      } else lista.forEach(function (o, i) { box.appendChild(linha(o, i)); });
      if (!lista.length) box.appendChild(h('div', { class: 'p-empty' }, 'Nenhum resultado'));
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
    el.addEventListener('input', function () { limparErro(el); ctx.changed(f.fc, el.value); });
    if (f.k === 'date') ctx.datas.push(el);
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
      r.addEventListener('change', function () { limparErro(wrap); ctx.changed('radio:' + f.label, it[1]); });
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
    inp.addEventListener('change', function () {
      var novos = [].slice.call(inp.files || []);
      var recusados = novos.filter(function (f) { return !ANEXO_PERMITIDO.test(f.name) || f.size > ANEXO_LIMITE; });
      files = files.concat(novos.filter(function (f) { return recusados.indexOf(f) < 0; })); draw();
      if (recusados.length) toast('Arquivo não permitido: ' + recusados.map(function (f) { return f.name; }).join(', ') + '. Formatos aceitos: PDF, imagens, Word, Excel e texto (até 10 MB).', 'err');
    });
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
    // grade plausível (A CALIBRAR: a grade real não foi mapeada — a empresa de teste do Onvio não tem eventos): o funcionário na
    // 1ª coluna e um evento da empresa (código - nome) por coluna, um campo por célula
    grid.querySelector('[data-all]').addEventListener('click', function () {
      if (!ci.value) { ci.classList.add('p-invalid'); toast('Informe a competência antes de adicionar funcionários.', 'err'); return; }
      grid.querySelector('.p-grid-b').innerHTML = '<table class="p-table p-grade" role="grid" aria-label="Rubricas"><thead><tr><th>Empregado</th>' + EVENTOS.map(function (ev) { return '<th>' + esc(ev) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        EMP3.map(function (e) { return '<tr><td>' + esc(e) + '</td>' + EVENTOS.map(function (ev) { return '<td><input type="text" class="p-grade-v" inputmode="decimal" aria-label="' + esc(ev + ' de ' + e) + '"></td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table><small class="p-help">Grade do simulador (a calibrar): no portal real as colunas vêm dos eventos cadastrados para a empresa.</small>';
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
      (items.length ? items.map(function (r) { return '<tr data-id="' + r.id + '" style="cursor:pointer"><td>' + r.id + '</td><td><span class="p-st ' + (/aguard/i.test(r.status) ? 'warn' : /conclu/i.test(r.status) ? 'ok' : '') + '">' + esc(r.status) + '</span></td><td>' + esc(r.tramite || '') + '</td><td>' + esc(r.empregado || '—') + '</td><td>' + esc(r.assunto || '') + '</td><td class="num">' + esc(r.data) + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="p-none">Você ainda não possui solicitações. Por favor clique em adicionar para começar.</td></tr>') +
      '</tbody></table></div></div>';
    main.querySelector('[data-add]').addEventListener('click', function () { go(SR + slug + '/add'); });
    main.querySelector('[data-ref]').addEventListener('click', function () { renderList(slug); });
    // clicar na linha abre a solicitação (a rota do detalhe no Onvio real é a calibrar)
    main.querySelectorAll('tr[data-id]').forEach(function (tr) { tr.addEventListener('click', function () { go(SR + slug + '/' + tr.dataset.id); }); });
  }
  function renderForm(slug) {
    var T = TYPES[slug];
    var ctx = { getters: {}, els: {}, req: [], dependents: [], datas: [], mudouEm: {}, files: function () { return []; },
      register: function (k, get, el, required) { this.getters[k] = get; this.els[k] = el; if (required !== false) this.req.push(k); },
      value: function (k) { return this.getters[k] ? this.getters[k]() : ''; },
      changed: function (k) { if (k) this.mudouEm[k] = Date.now(); applyDeps(); } };
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
      var cat = /Acid\. Trabalho período superior|mesmo acid/i.test(leave || '');
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
        if (bad) marcarErro(el, 'Campo obrigatório');
        return bad;
      });
      var invalidas = ctx.datas.filter(function (el) { if (el.disabled || !el.value || dataOk(el.value)) return false; marcarErro(el, 'Data inválida'); return true; });
      // como o portal: o envio só acontece com o formulário válido (no cadastro também)
      if (faltando.length || invalidas.length) { toast('Corrija os erros e tente novamente.', 'err'); return; }
      var empregado = ctx.value('selectedEmployee') || ctx.value('employee') || ctx.value('name') || '';
      var assunto = ctx.value('subject') || ctx.value('Assunto') || T.nome;
      db.seq += 1;
      (db.items[slug] = db.items[slug] || []).unshift({ id: db.seq, status: 'Aberta', empregado: empregado, assunto: assunto, tramite: 'Cliente: solicitação incluída' + (ctx.files().length ? ' com ' + ctx.files().length + ' anexo(s)' : '') + '.', data: new Date().toLocaleDateString('pt-BR'), competencia: ctx.value('basisDate') || undefined });
      persist();
      go(SR + slug);
      toast('Solicitação incluída nesta simulação. Nada foi enviado ao escritório.', 'ok');
    });
    main.innerHTML = '';
    main.appendChild(h('h2', { class: 'p-h' }, 'Solicitações de ' + esc(T.nome.replace(/^Solicitação /, ''))));
    main.appendChild(form);
  }
  function renderDetail(slug, id) {
    var T = TYPES[slug]; var r = (db.items[slug] || []).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!r) { renderList(slug); return; }
    main.innerHTML = '<h2 class="p-h">Solicitação nº ' + esc(r.id) + ' — ' + esc(T.nome) + '</h2><div class="p-detail"><dl><dt>Situação</dt><dd>' + esc(r.status) + '</dd><dt>Empregado</dt><dd>' + esc(r.empregado || '—') + '</dd><dt>Assunto</dt><dd>' + esc(r.assunto) + '</dd><dt>Data</dt><dd>' + esc(r.data) + '</dd></dl>' +
      '<h3 class="p-sub">Trâmites</h3><p>' + esc(r.tramite || '') + '</p></div>';
    // caixa de resposta (plausível, A CALIBRAR: a tela do detalhe do Onvio real não foi mapeada) — sem <form>, como um bloco do detalhe
    var resp = h('section', { class: 'p-detail p-resposta', 'data-resposta': true });
    resp.innerHTML = '<h3 class="p-sub">Responder</h3>';
    var campo = h('div', { class: 'p-field wide' });
    var txt = h('textarea', { id: 'resp-' + r.id, formcontrolname: 'topicDescription', rows: 4 });
    campo.appendChild(h('label', { for: txt.id, class: 'p-label' }, 'Mensagem')); campo.appendChild(txt); resp.appendChild(campo);
    var fctx = { files: function () { return []; } };
    resp.appendChild(fileSel(fctx));
    var btns = h('div', { class: 'p-form-btns' });
    var responder = h('button', { type: 'button', class: 'p-btn-dark', 'data-responder': true }, 'RESPONDER');
    var voltar = h('button', { type: 'button', class: 'btn btn-outline', 'data-back': true }, 'VOLTAR');
    btns.appendChild(responder); btns.appendChild(voltar); resp.appendChild(btns);
    main.appendChild(resp);
    responder.addEventListener('click', function () {
      if (!txt.value.trim() && !fctx.files().length) { toast('Escreva a resposta ou anexe um arquivo.', 'err'); return; }
      r.status = 'Em andamento'; r.data = new Date().toLocaleDateString('pt-BR');
      r.tramite = 'Cliente: ' + txt.value.trim() + (fctx.files().length ? ' (' + fctx.files().length + ' anexo(s))' : '');
      persist(); go(SR + slug);
      toast('Resposta incluída nesta simulação. Nada foi enviado ao escritório.', 'ok');
    });
    voltar.addEventListener('click', function () { go(SR + slug); });
  }
  function renderDocs() {
    main.innerHTML = '<h2 class="p-h">Documentos</h2><div class="p-scroll"><table class="p-table"><thead><tr><th>Documento</th><th>Competência</th><th>Publicado</th></tr></thead><tbody>' +
      DOCS.map(function (x) { return '<tr><td>' + esc(x.nome) + '</td><td>' + esc(x.comp) + '</td><td>' + esc(x.data) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function render() {
    sideMenu();
    var m = path.match(/service-request\/([a-z-]+)(?:\/(add|\d+))?/);
    if (/\/documents/.test(path)) renderDocs();
    else if (!m || !TYPES[m[1]]) renderMenu();
    else if (m[2] === 'add') renderForm(m[1]);
    else if (m[2]) renderDetail(m[1], m[2]);
    else renderList(m[1]);
    document.querySelectorAll('[data-top]').forEach(function (b) { b.classList.toggle('on', b.dataset.top === (/\/documents/.test(path) ? 'docs' : 'portal')); });
  }
  document.getElementById('p-empresa').textContent = EMPRESA;
  document.querySelectorAll('[data-top]').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.top === 'portal') go(BASE); else if (b.dataset.top === 'docs') go('/clientcenter/pt/documents'); else toast('Esta área não faz parte da simulação.'); }); });
  render();
})();
