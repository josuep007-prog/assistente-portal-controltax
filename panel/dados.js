/* Aba "Dados" do detalhe (2.4): a solicitação completa do Onvio ({lista}/{id}?expand=all), em grupos e em português.
 * Dicionários e regras trazidos do Control Onvio (visão do escritório, core.js: ROTULOS, VALORES, PALAVRAS,
 * camposDetalhe). Puro: lido na hora pelo painel, mostrado e nunca guardado. Na visão do cliente, os campos de
 * saúde (CID, médico, CRM) ficam fora da tela. */
import { parseDate } from './engine.js';

const diaDe = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
function arquivosDe(lista, max) {
  return (Array.isArray(lista) ? lista : []).filter(a => a && (a.name || a.fileName)).slice(0, max || 50)
    .map(a => ({ id: typeof a.id === 'string' || typeof a.id === 'number' ? String(a.id) : null, nome: String(a.name || a.fileName) }));
}
const ROTULOS = {
  subject: 'Assunto', description: 'Descrição', requestWay: 'Meio da solicitação', serviceRequestType: 'Tipo de solicitação',
  created: 'Aberta em', changed: 'Alterada em', lastUpdated: 'Último trâmite', genericLastUpdated: 'Último trâmite', lastStatusChanged: 'Situação alterada em',
  dueDate: 'Expectativa de conclusão', admissionDate: 'Data de admissão', startDate: 'Início', endDate: 'Fim', extensionEnd: 'Fim da prorrogação',
  name: 'Nome', socialName: 'Nome social', nationalIdentity: 'CPF', wage: 'Salário', category: 'Categoria', comments: 'Observações',
  dailyHours: 'Horas por dia', weeklyHours: 'Horas por semana', monthlyHours: 'Horas por mês', daysExperience: 'Dias de experiência',
  extensionDays: 'Dias de prorrogação', employmentRelationship: 'Vínculo', firstJob: 'Primeiro emprego', frequencyCard: 'Cartão ponto',
  registration: 'Matrícula', teacher: 'Professor', employeeRegistrationType: 'Tipo de cadastro',
  vacationStartDate: 'Início das férias', noticeDate: 'Data do aviso', paymentDate: 'Data do pagamento', bonusDays: 'Dias de abono',
  vacationDays: 'Dias de férias', payBonusDays: 'Pagar abono', payFirstInstallmentEarlier: 'Adiantar 1ª parcela do 13º',
  adviceDate: 'Data do aviso', grantedBy: 'Aviso dado por', terminationReason: 'Motivo da rescisão', terminationType: 'Tipo de rescisão',
  resignationDate: 'Data do desligamento', priorNoticeAdviceDate: 'Data do aviso prévio', leaveDate: 'Data do afastamento',
  effectiveDate: 'Competência', entryType: 'Tipo de lançamento', detailAbsentDay: 'Faltas', detailServiceEntry: 'Lançamentos',
  clientExpanded: 'Cliente', clientEmployeeExpanded: 'Empregado', staffResponsibleExpanded: 'Responsável', requesterExpanded: 'Solicitante',
  createdByContactExpanded: 'Cadastrada por', jobPositionExpanded: 'Cargo', departmentExpanded: 'Departamento', costCenterExpanded: 'Centro de custo',
  serviceExpanded: 'Serviço', employeeLeaveTypeExpanded: 'Tipo de afastamento', payrollEntryConfigurationHeaderExpanded: 'Configuração do lançamento',
  payrollEntryClientEmployeeExpanded: 'Empregados do lançamento', employeeRegistrationPersonalExpanded: 'Dados pessoais',
  employeeRegistrationProfessionalExpanded: 'Dados profissionais', code: 'Código', nickname: 'Apelido', value: 'Valor', amount: 'Valor',
  quantity: 'Quantidade', hours: 'Horas', days: 'Dias', rubric: 'Rubrica', email: 'E-mail', phone: 'Telefone', birthDate: 'Nascimento',
  hireDate: 'Admissão', clientEmployeeRelationship: 'Vínculo', reason: 'Motivo', priorNotice: 'Tem aviso prévio', calculation: 'Pede cálculo',
  internshipOption: 'Opção de estágio', registrationNumber: 'Matrícula', pis: 'PIS', ctps: 'CTPS', cpf: 'CPF', gender: 'Sexo',
  terminationReasonExpanded: 'Motivo da rescisão', noticeType: 'Tipo do aviso', workedNotice: 'Aviso trabalhado', reduction: 'Redução da jornada',
  terminationDate: 'Data do término', lastWorkDay: 'Último dia trabalhado', clientEmployeeRelationshipExpanded: 'Vínculo', customFields: 'Campos adicionais',
  displayStatus: 'Situação', assignedTo: 'Atribuída a', isReadByClientUser: 'Lida pelo cliente', nickName: 'Apelido', clientName: 'Cliente',
  staffName: 'Responsável', mimeType: 'Tipo do arquivo', fileName: 'Arquivo', createdDate: 'Criada em', modifiedDate: 'Alterada em',
  expirationDate: 'Vencimento', sendDate: 'Enviada em', requestType: 'Tipo de solicitação', createdBy: 'Criada por', size: 'Tamanho',
  prescribePendingTicketsDays: 'Dias para prescrever', forwardedToExpanded: 'Encaminhada para', employeeRegistrationTopicNumber: 'Trâmite nº',
  payrollEntryTopicNumber: 'Trâmite nº', motherName: 'Nome da mãe', fatherName: 'Nome do pai', maritalStatus: 'Estado civil',
  educationLevel: 'Escolaridade', nationality: 'Nacionalidade', race: 'Raça/cor', address: 'Endereço', street: 'Rua', number: 'Número',
  complement: 'Complemento', neighborhood: 'Bairro', city: 'Cidade', state: 'UF', zipCode: 'CEP', country: 'País', bank: 'Banco',
  agency: 'Agência', account: 'Conta', dependents: 'Dependentes', relationship: 'Parentesco', workSchedule: 'Horário de trabalho',
  salaryType: 'Tipo de salário', paymentType: 'Forma de pagamento', experienceContract: 'Contrato de experiência', union: 'Sindicato',
  institution: 'Instituição de ensino', course: 'Curso', supervisor: 'Supervisor', scholarship: 'Bolsa', insurance: 'Seguro',
  returnDate: 'Data de retorno', cid: 'CID', doctor: 'Médico', crm: 'CRM', certificate: 'Atestado', note: 'Observação', notes: 'Observações',
  observation: 'Observação', observations: 'Observações', title: 'Título', type: 'Tipo', status: 'Situação', active: 'Ativo'
};
// valores técnicos (enumerações) que o Onvio manda em inglês; o que não estiver aqui aparece como veio
const VALORES = {
  EMPLOYEE: 'Empregado', INTERN: 'Estagiário', TAXPAYER: 'Contribuinte', PARTNER: 'Sócio', DIRECTOR: 'Diretor', APPRENTICE: 'Aprendiz',
  INDEMNIFIED: 'Indenizado', WORKED: 'Trabalhado', MONTHLY: 'Mensal', HOURLY: 'Por hora', DAILY: 'Diário', WEEKLY: 'Semanal',
  EMPLOYER: 'Empregador', MALE: 'Masculino', FEMALE: 'Feminino', PORTAL: 'Portal do Cliente', EMAIL: 'E-mail', PHONE: 'Telefone',
  WEB: 'Portal (web)', MOBILE: 'Aplicativo', PRIOR_NOTICE_TERMINATION: 'Aviso prévio de rescisão', TERMINATION_CALCULATION: 'Cálculo de rescisão',
  PRIOR_NOTICE_VACATION: 'Aviso de férias', VACATION_CALCULATION: 'Cálculo de férias', EMPLOYEE_LEAVE: 'Afastamento', PAYROLL_ENTRY: 'Lançamento de rubricas',
  GENERIC: 'Geral', ADVANCE: 'Adiantamento', THIRTEENTH: '13º salário', VACATION: 'Férias', TERMINATION: 'Rescisão', SINGLE: 'Solteiro(a)',
  MARRIED: 'Casado(a)', DIVORCED: 'Divorciado(a)', WIDOWED: 'Viúvo(a)', SEPARATED: 'Separado(a)', STABLE_UNION: 'União estável', YES: 'Sim', NO: 'Não',
  NONE: 'Nenhum', OTHER: 'Outro', OTHERS: 'Outros', PENDING: 'Pendente', APPROVED: 'Aprovado', REJECTED: 'Recusado', ACTIVE: 'Ativo', INACTIVE: 'Inativo',
  SICK_LEAVE: 'Afastamento por doença', ILLNESS: 'Doença', WORK_ACCIDENT: 'Acidente de trabalho', MATERNITY_LEAVE: 'Licença-maternidade',
  PATERNITY_LEAVE: 'Licença-paternidade', MILITARY_SERVICE: 'Serviço militar', UNPAID_LEAVE: 'Licença não remunerada', PAID_LEAVE: 'Licença remunerada',
  WITH_CAUSE: 'Com justa causa', WITHOUT_CAUSE: 'Sem justa causa', WITH_JUST_CAUSE: 'Com justa causa', WITHOUT_JUST_CAUSE: 'Sem justa causa',
  RESIGNATION: 'Pedido de demissão', DISMISSAL: 'Dispensa', AGREEMENT: 'Acordo entre as partes', MUTUAL_AGREEMENT: 'Acordo entre as partes',
  END_OF_CONTRACT: 'Término de contrato', CONTRACT_END: 'Término de contrato', EXPERIENCE_END: 'Fim do contrato de experiência', DEATH: 'Falecimento',
  RETIREMENT: 'Aposentadoria', TRANSFER: 'Transferência', FULL_TIME: 'Tempo integral', PART_TIME: 'Tempo parcial', INTERMITTENT: 'Intermitente',
  TEMPORARY: 'Temporário', INDEFINITE: 'Indeterminado', DEFINITE: 'Determinado', CLT: 'CLT'
};
// Palavras soltas (campos e valores que o Onvio venha a mandar e ainda não estão acima): traduz palavra por palavra;
// se sobrar alguma sem tradução, mostra como veio (melhor o nome técnico do que uma frase pela metade).
const PALAVRAS = {
  date: 'data', start: 'início', end: 'fim', type: 'tipo', reason: 'motivo', name: 'nome', number: 'número', value: 'valor', days: 'dias',
  day: 'dia', hours: 'horas', hour: 'hora', employee: 'empregado', employer: 'empregador', client: 'cliente', company: 'empresa', staff: 'escritório',
  notice: 'aviso', prior: 'prévio', termination: 'rescisão', vacation: 'férias', leave: 'afastamento', payment: 'pagamento', salary: 'salário',
  wage: 'salário', bonus: 'abono', advance: 'adiantamento', first: 'primeiro', last: 'último', work: 'trabalho', worked: 'trabalhado', job: 'cargo',
  position: 'cargo', department: 'departamento', cost: 'custo', center: 'centro', description: 'descrição', comments: 'observações', note: 'observação',
  document: 'documento', documents: 'documentos', file: 'arquivo', files: 'arquivos', attachment: 'anexo', attachments: 'anexos', created: 'criado',
  updated: 'atualizado', changed: 'alterado', by: 'por', at: 'em', of: 'de', the: '', and: 'e', or: 'ou', with: 'com', without: 'sem', is: '', has: 'tem',
  total: 'total', amount: 'valor', quantity: 'quantidade', code: 'código', status: 'situação', request: 'solicitação', requester: 'solicitante',
  registration: 'cadastro', personal: 'pessoal', professional: 'profissional', address: 'endereço', phone: 'telefone', email: 'e-mail',
  birth: 'nascimento', mother: 'mãe', father: 'pai', dependent: 'dependente', dependents: 'dependentes', category: 'categoria', union: 'sindicato',
  contract: 'contrato', experience: 'experiência', extension: 'prorrogação', weekly: 'semanal', monthly: 'mensal', daily: 'diário', yes: 'sim', no: 'não',
  active: 'ativo', inactive: 'inativo', pending: 'pendente', other: 'outro', calculation: 'cálculo', calculate: 'calcular', entry: 'lançamento',
  entries: 'lançamentos', payroll: 'folha', rubric: 'rubrica', absent: 'falta', absence: 'falta', medical: 'médico', certificate: 'atestado',
  return: 'retorno', expected: 'previsto', due: 'prazo', expiration: 'vencimento', send: 'envio', sent: 'enviado', read: 'lido', user: 'usuário',
  internship: 'estágio', intern: 'estagiário', taxpayer: 'contribuinte', partner: 'sócio', option: 'opção', schedule: 'horário', shift: 'turno',
  indemnified: 'indenizado', reduction: 'redução', paid: 'pago', unpaid: 'não pago', count: 'quantidade', size: 'tamanho', title: 'título'
};
// Mais termos de DP e de cadastro que o Onvio usa nos campos (para nada aparecer em inglês)
Object.assign(PALAVRAS, {
  marital: 'civil', education: 'escolaridade', level: 'nível', race: 'raça', color: 'cor', nationality: 'nacionalidade', gender: 'sexo', sex: 'sexo',
  zip: 'CEP', postal: 'postal', street: 'logradouro', neighborhood: 'bairro', district: 'bairro', city: 'cidade', state: 'estado', country: 'país',
  complement: 'complemento', bank: 'banco', agency: 'agência', branch: 'agência', account: 'conta', pix: 'Pix', key: 'chave', digit: 'dígito',
  voter: 'eleitor', identity: 'identidade', card: 'carteira', issuing: 'emissor', issuer: 'emissor', issue: 'emissão', issued: 'emitido', body: 'órgão',
  transport: 'transporte', voucher: 'vale', meal: 'refeição', food: 'alimentação', health: 'saúde', plan: 'plano', dental: 'odontológico',
  workload: 'carga horária', admission: 'admissão', hiring: 'contratação', hire: 'admissão', hired: 'admitido', dismissal: 'dispensa',
  contribution: 'contribuição', disability: 'deficiência', disabilities: 'deficiências', previous: 'anterior', current: 'atual', method: 'forma',
  place: 'local', series: 'série', serie: 'série', holder: 'titular', relationship: 'vínculo', kinship: 'parentesco', spouse: 'cônjuge', child: 'filho',
  children: 'filhos', retired: 'aposentado', pension: 'pensão', gross: 'bruto', net: 'líquido', discount: 'desconto', discounts: 'descontos',
  overtime: 'hora extra', night: 'noturno', shift: 'turno', allowance: 'auxílio', hazard: 'periculosidade', unhealthy: 'insalubridade',
  commission: 'comissão', gratification: 'gratificação', function: 'função', role: 'função', sector: 'setor', area: 'área', unit: 'unidade',
  reference: 'referência', competence: 'competência', period: 'período', month: 'mês', months: 'meses', year: 'ano', years: 'anos', week: 'semana',
  base: 'base', rate: 'taxa', percentage: 'percentual', percent: 'percentual', factor: 'fator', limit: 'limite', minimum: 'mínimo', maximum: 'máximo',
  initial: 'inicial', final: 'final', new: 'novo', old: 'antigo', next: 'próximo', notes: 'observações', justification: 'justificativa',
  approval: 'aprovação', approved: 'aprovado', rejected: 'recusado', signed: 'assinado', signature: 'assinatura', origin: 'origem', source: 'origem',
  destination: 'destino', channel: 'canal', way: 'meio', mode: 'modo', kind: 'tipo', group: 'grupo', grade: 'grau', stage: 'etapa', phase: 'fase',
  hours: 'horas', minutes: 'minutos', weekly: 'semanal', interval: 'intervalo', break: 'intervalo', rest: 'descanso', entry: 'entrada', exit: 'saída',
  doctor: 'médico', clinic: 'clínica', exam: 'exame', admissional: 'admissional', occupational: 'ocupacional', accident: 'acidente', illness: 'doença',
  sick: 'doença', maternity: 'maternidade', paternity: 'paternidade', military: 'militar', service: 'serviço', services: 'serviços', benefit: 'benefício',
  benefits: 'benefícios', insurance: 'seguro', life: 'vida', reason: 'motivo', cause: 'causa', just: 'justa', remuneration: 'remuneração', fixed: 'fixo',
  variable: 'variável', hourly: 'por hora', paid: 'pago', worked: 'trabalhado', social: 'social', fantasy: 'fantasia', legal: 'jurídico', trade: 'comercial',
  regime: 'regime', model: 'modelo', template: 'modelo', link: 'vínculo', apprentice: 'aprendiz', teacher: 'professor', manager: 'gestor',
  supervisor: 'supervisor', responsible: 'responsável', contact: 'contato', contacts: 'contatos', mobile: 'celular', cell: 'celular', home: 'residencial',
  commercial: 'comercial', street_number: 'número', observation: 'observação', observations: 'observações', situation: 'situação', topic: 'trâmite',
  topics: 'trâmites', answer: 'resposta', response: 'resposta', question: 'pergunta', forwarded: 'encaminhado', assigned: 'atribuído', assignee: 'responsável'
});
Object.assign(ROTULOS, {
  maritalStatus: 'Estado civil', educationLevel: 'Escolaridade', schooling: 'Escolaridade', raceColor: 'Raça/cor', race: 'Raça/cor', gender: 'Sexo',
  nationality: 'Nacionalidade', birthPlace: 'Naturalidade', placeOfBirth: 'Naturalidade', motherName: 'Nome da mãe', fatherName: 'Nome do pai',
  zipCode: 'CEP', postalCode: 'CEP', street: 'Logradouro', streetNumber: 'Número', neighborhood: 'Bairro', city: 'Cidade', state: 'UF', complement: 'Complemento',
  bankCode: 'Banco', bankAgency: 'Agência', bankAccount: 'Conta', accountDigit: 'Dígito da conta', pixKey: 'Chave Pix', voterTitle: 'Título de eleitor',
  identityCard: 'RG', rg: 'RG', issuingBody: 'Órgão emissor', issueDate: 'Data de emissão', cnh: 'CNH', workCard: 'CTPS', workCardSeries: 'Série da CTPS',
  pisNumber: 'PIS', transportVoucher: 'Vale-transporte', mealVoucher: 'Vale-refeição', foodVoucher: 'Vale-alimentação', healthPlan: 'Plano de saúde',
  dentalPlan: 'Plano odontológico', workSchedule: 'Horário de trabalho', workload: 'Carga horária', admissionType: 'Tipo de admissão', contractType: 'Tipo de contrato',
  disability: 'Deficiência', disabilityType: 'Tipo de deficiência', previousEmployer: 'Empregador anterior', cbo: 'CBO', salaryType: 'Tipo de salário',
  paymentMethod: 'Forma de pagamento', terminationDate: 'Data do desligamento', lastWorkDay: 'Último dia trabalhado', returnDate: 'Data de retorno',
  expectedReturnDate: 'Retorno previsto', cid: 'CID', doctorName: 'Nome do médico', crm: 'CRM', competence: 'Competência', unionName: 'Sindicato',
  unionContribution: 'Contribuição sindical', costCenter: 'Centro de custo', jobPosition: 'Cargo', department: 'Departamento', hireDate: 'Admissão',
  clientEmployeeRelationship: 'Vínculo', employeeName: 'Empregado', clientEmployeeName: 'Empregado', rubricCode: 'Código da rubrica', rubricName: 'Rubrica',
  hoursQuantity: 'Quantidade de horas', daysQuantity: 'Quantidade de dias', basis: 'Competência'
});
Object.assign(VALORES, {
  WHITE: 'Branca', BLACK: 'Preta', BROWN: 'Parda', YELLOW: 'Amarela', INDIGENOUS: 'Indígena', NOT_INFORMED: 'Não informado', UNINFORMED: 'Não informado',
  ILLITERATE: 'Analfabeto', ELEMENTARY: 'Fundamental', ELEMENTARY_INCOMPLETE: 'Fundamental incompleto', ELEMENTARY_COMPLETE: 'Fundamental completo',
  HIGH_SCHOOL: 'Médio', HIGH_SCHOOL_INCOMPLETE: 'Médio incompleto', HIGH_SCHOOL_COMPLETE: 'Médio completo', COLLEGE: 'Superior',
  COLLEGE_INCOMPLETE: 'Superior incompleto', COLLEGE_COMPLETE: 'Superior completo', HIGHER_EDUCATION: 'Superior', POSTGRADUATE: 'Pós-graduação',
  MASTER: 'Mestrado', DOCTORATE: 'Doutorado', DETERMINED: 'Prazo determinado', UNDETERMINED: 'Prazo indeterminado', INDETERMINATE: 'Prazo indeterminado',
  FIXED_TERM: 'Prazo determinado', CLT: 'CLT', CHECKING: 'Corrente', SAVINGS: 'Poupança', SALARY: 'Salário', CPF: 'CPF', CNPJ: 'CNPJ', RANDOM: 'Aleatória',
  DAY: 'Dia', NIGHT: 'Noite', PARTIAL: 'Parcial', FULL: 'Integral', OPEN: 'Aberto', CLOSED: 'Fechado', DONE: 'Concluído', CANCELED: 'Cancelado', CANCELLED: 'Cancelado'
});
// Em inglês o principal vem por último ("expected return date"); em português, primeiro ("data de retorno prevista").
const ADJ = new Set(['previsto', 'pago', 'não pago', 'ativo', 'inativo', 'pendente', 'prévio', 'trabalhado', 'indenizado', 'mensal', 'semanal', 'diário', 'pessoal', 'profissional', 'médico', 'criado', 'atualizado', 'alterado', 'enviado', 'lido', 'total']);
const ANTES = new Set(['primeiro', 'último']);
const PREP = new Set(['por', 'em', 'de', 'e', 'ou', 'com', 'sem', 'tem']);
// parcial: mantém a palavra que não conhece (em vez de desistir da frase toda)
function traduzirPalavras(lista, parcial) {
  const out = []; let conhecidas = 0;
  for (const w of lista) { const t = PALAVRAS[w.toLowerCase()]; if (t === undefined) { if (!parcial) return null; out.push(w.toLowerCase()); } else { conhecidas++; if (t) out.push(t); } }
  if (!out.length || !conhecidas) return null;
  if (out.length === 1 || out.some(w => PREP.has(w))) return out.join(' ');
  const nucleo = out[out.length - 1], resto = out.slice(0, -1).reverse();
  let frase = nucleo, antes = '';
  for (const w of resto) { if (ANTES.has(w)) antes = w + ' '; else if (ADJ.has(w)) frase += ' ' + w; else frase += ' de ' + w; }
  return antes + frase;
}
// Fora da aba Dados: o que já está no topo da janela (cliente, responsável, datas, solicitante) e o que só serve ao
// sistema (tipo técnico, meio, quem cadastrou, quando foi alterada). A aba fica com o que é preciso para atender.
const FORA_DADOS = /^(serviceRequestType|requestWay|changed|created|lastUpdated|genericLastUpdated|lastStatusChanged|dueDate|status|sortOrder|clientExpanded|staffResponsibleExpanded|requesterExpanded|createdByContactExpanded|departmentExpanded)$/;
// na visão do cliente, dado de saúde não aparece na tela (cid, médico, CRM, atestado)
const OCULTO = /^(type|apiVersion|id|companyId|identifier|genericStatus|clientStatus|firmStatus|attachmentsExpanded|delete|deleted|staticFilePath|translationKey|cid|cidCode|doctor|doctorName|crm|certificate)$|Id$|Ids$/i;
const humano = k => {
  const partes = String(k).replace(/Expanded$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_]+/).filter(Boolean);
  // como último recurso, traduz o que conhece e mantém só a palavra desconhecida (antes, a frase inteira ficava em inglês)
  const t = traduzirPalavras(partes) || traduzirPalavras(partes, true) || partes.join(' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const enumPt = v => { if (VALORES[v]) return VALORES[v]; const t = traduzirPalavras(v.toLowerCase().split('_'), true); return t ? t.charAt(0).toUpperCase() + t.slice(1) : v; };
const rotulo = k => ROTULOS[k] || humano(k);
function valorDe(k, v) {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return /wage|salary|valor|amount/i.test(k) ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(v);
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?Z?$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v)) { const d = diaDe(v); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) { const d = parseDate(v); if (d) return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    if (/^[A-Z][A-Z_]{1,}$/.test(v)) return enumPt(v);
    // enumeração em camelCase ("highSchoolComplete") ou minúsculas com _ ("not_informed"): só se for valor conhecido
    if (/^[a-z]+([A-Z][a-z]+)+$|^[a-z]+(_[a-z]+)+$/.test(v)) { const u = v.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(); if (VALORES[u]) return VALORES[u]; }
    return v;
  }
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? x.name || x.description || x.value || '' : valorDe(k, x))).filter(Boolean).join(', ');
  if (typeof v === 'object') return v.name || v.description || (typeof v.value !== 'object' ? valorDe(k, v.value) : '') || '';
  return String(v);
}
// objeto "rico" (vários campos úteis) vira um grupo próprio; objeto só com nome vira uma linha
const camposUteis = o => Object.entries(o).filter(([k, v]) => !OCULTO.test(k) && !FORA_DADOS.test(k) && v != null && v !== '' && !(Array.isArray(v) && !v.length));
// Campos que mais importam para atender (datas que definem prazo, motivo, tipo, dias): ganham destaque sutil e vêm
// primeiro no grupo. Salário e documentos ficam sem destaque de propósito.
const RELEVANTE = /^(vacationStartDate|vacationEndDate|vacationDays|daysOfVacation|abonoDays|adviceDate|noticeDate|priorNotice\w*Date|priorNoticeType|resignationDate|lastWorkDay|terminationDate|terminationType|terminationReason|admissionDate|startDate|endDate|leaveDate|returnDate|expectedReturnDate|leaveDays|employeeLeaveType\w*|effectiveDate|paymentDate|competence|reason|category|employmentRelationship|subject)$/i;
export function camposDetalhe(d) {
  if (!d || typeof d !== 'object') return { grupos: [], anexos: [], arquivos: [] };
  const principal = { titulo: 'Solicitação', campos: [] }, grupos = [principal];
  for (const [k, v] of Object.entries(d)) {
    if (OCULTO.test(k) || FORA_DADOS.test(k) || v == null || v === '') continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && camposUteis(v).length > 2) {
      const g = { titulo: rotulo(k), campos: [] };
      for (const [k2, v2] of camposUteis(v)) {
        if (v2 && typeof v2 === 'object' && !Array.isArray(v2) && camposUteis(v2).length > 2) {
          for (const [k3, v3] of camposUteis(v2)) { const x = valorDe(k3, v3); if (x) g.campos.push({ k: rotulo(k2) + ' · ' + rotulo(k3), v: x }); }
        } else { const x = valorDe(k2, v2); if (x) g.campos.push({ k: rotulo(k2), v: x, longo: /description|comments|observ/i.test(k2), destaque: RELEVANTE.test(k2) && !/subject/i.test(k2) }); }
      }
      if (g.campos.length) grupos.push(g);
      continue;
    }
    if (Array.isArray(v) && v.some(x => x && typeof x === 'object' && camposUteis(x).length > 2)) {
      const g = { titulo: rotulo(k), campos: [] };
      v.slice(0, 50).forEach((x, n) => { const linha = camposUteis(x).map(([k2, v2]) => { const y = valorDe(k2, v2); return y ? rotulo(k2) + ': ' + y : ''; }).filter(Boolean).join(' · '); if (linha) g.campos.push({ k: String(n + 1), v: linha }); });
      if (g.campos.length) grupos.push(g);
      continue;
    }
    const x = valorDe(k, v);
    if (x) principal.campos.push({ k: rotulo(k), v: x, longo: /description|comments|observ/i.test(k), destaque: RELEVANTE.test(k) });
  }
  const arquivos = arquivosDe(d.attachmentsExpanded, 50);
  const anexos = arquivos.map(a => a.nome);
  // sem repetição (mesmo rótulo e valor em dois lugares) e os textos longos (assunto, descrição) por último no grupo
  const vistos = new Set();
  grupos.forEach(g => {
    g.campos = g.campos.filter(c => { const ch = c.k + '\u0000' + c.v; if (vistos.has(ch)) return false; vistos.add(ch); return true; });
    g.campos.sort((a, b) => (a.longo ? 1 : 0) - (b.longo ? 1 : 0) || (b.destaque && !b.longo ? 1 : 0) - (a.destaque && !a.longo ? 1 : 0));
  });
  return { grupos: grupos.filter(g => g.campos.length), anexos, arquivos };
}
