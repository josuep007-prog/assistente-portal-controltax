"""Gera o corpus FICTÍCIO da auditoria do leitor de documentos (tools/auditar-leitor.py).

Tudo aqui é inventado: nomes, CPFs (válidos só no dígito, com prefixo 000), endereços, médicos e empresas.
Nunca coloque documentos de verdade no corpus nem no Git. Os arquivos gerados ficam FORA do repositório
(padrão: pasta `corpus` ao lado do repositório, ou o caminho passado na linha de comando) e só o gerador
vai para o Git.

Cada documento sai em até cinco formas, como o cliente arrasta no dia a dia:
  pdf       PDF com texto (gerado pelo Chromium)
  img       imagem limpa (PNG, "print" ou escaneada boa)
  foto      foto de celular: girada 2–4°, perspectiva, sombra, baixa resolução, JPEG
  deitada   a mesma foto tirada de lado (90°)
  scan      PDF escaneado (só imagem, sem texto)
  ruim      foto muito ruim (pequena, borrada, JPEG forte) — onde o OCR troca 0/O, 1/l
  scanmisto PDF escaneado com uma linha de texto do aplicativo de digitalização no rodapé
e o gabarito vai em gabarito.json: documento esperado, tipo de pedido esperado e o valor certo de cada campo
(None = o campo deve ficar vazio; "*" = não avaliar).

Uso: python tools/gerar-corpus-leitor.py [pasta]   (precisa de Playwright com Chromium, Pillow, numpy, openpyxl)
"""
import importlib.util, json, math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

AQUI = os.path.dirname(os.path.abspath(__file__))
PADRAO = os.path.join(AQUI, '..', '..', 'corpus-leitor')


# ---------------------------------------------------------------- dados inventados
def cpf(base9):
    d = [int(x) for x in base9]
    for n in (10, 11):
        s = sum(v * (n - i) for i, v in enumerate(d)); r = (s * 10) % 11; d.append(0 if r == 10 else r)
    c = ''.join(map(str, d)); return f'{c[:3]}.{c[3:6]}.{c[6:9]}-{c[9:]}'


def pis(base10):
    w = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; s = sum(int(base10[i]) * w[i] for i in range(10)); r = 11 - s % 11
    r = 0 if r >= 10 else r; p = base10 + str(r); return f'{p[:3]}.{p[3:8]}.{p[8:10]}-{p[10]}'


# lista de funcionários da empresa de teste (inventada) — tem armadilhas de propósito:
# sobrenomes repetidos (MARTINS), uma funcionária com o nome da mãe de outra pessoa (MARIA APARECIDA SANTOS)
# e um funcionário com o nome igual ao de um médico (RICARDO ALMEIDA CASTRO / JOSE CARLOS MARTINS)
FUNCIONARIOS = [
    'ANA PAULA FERREIRA', 'BEATRIZ CAMPOS', 'CAMILA ROCHA', 'CARLOS EDUARDO MENDES', 'DANIELA SOUZA LIMA',
    'EDUARDO SILVA RAMOS', 'FERNANDA OLIVEIRA SANTOS', 'GABRIEL ALVES PEREIRA', 'JOAO PEDRO MARTINS',
    'JOSE CARLOS MARTINS', 'LUCIANA REIS MOREIRA', 'MARCOS VINICIUS TEIXEIRA', 'MARIA APARECIDA SANTOS',
    'PATRICIA GOMES DIAS', 'RAFAEL NUNES BARBOSA', 'RICARDO ALMEIDA CASTRO', 'THIAGO HENRIQUE PRADO',
    'VANESSA CRISTINA LOPES',
]
EMPRESA = 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA'
CNPJ = '00.000.000/0001-91'
END_EMPRESA = 'Rua Projetada Exemplo, 100 - Sala 2 - Centro - Cidade Exemplo/ES - CEP 29000-010'

CSS = """
@page { size: A4; margin: 0 }
* { box-sizing: border-box }
html, body { margin: 0; background: #fff }
body { font-family: 'Liberation Sans', Arial, sans-serif; font-size: 13.5px; color: #141414; line-height: 1.45 }
.pg { width: 794px; min-height: 1123px; padding: 52px 62px; position: relative; background: #fff; overflow: hidden }
.c { text-align: center } .r { text-align: right } .b { font-weight: 700 } .sm { font-size: 11px; color: #444 }
h1 { font-size: 22px; text-align: center; margin: 26px 0 22px; letter-spacing: 1px }
h2 { font-size: 15px; margin: 18px 0 6px }
.hdr { border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 10px }
.ass { margin: 70px auto 0; width: 330px; border-top: 1px solid #222; text-align: center; padding-top: 4px; font-size: 12px }
table.f { width: 100%; border-collapse: collapse; margin: 6px 0 }
table.f td { border: 1px solid #555; padding: 3px 6px; vertical-align: top; font-size: 12.5px }
table.f td small { display: block; font-size: 9.5px; color: #555; text-transform: uppercase }
.box { border: 1px solid #555; padding: 8px 10px; margin: 8px 0 }
.hw { font-family: 'DejaVu Serif', serif; font-style: italic; color: #1d3a8f; font-size: 17px }
.hw span { display: inline-block }
.card { width: 860px; height: 545px; border-radius: 22px; position: relative; overflow: hidden; padding: 22px 28px;
        font-family: 'Liberation Sans', Arial, sans-serif; color: #122 }
.card .lbl { font-size: 11px; color: #355; text-transform: uppercase; letter-spacing: .4px }
.card .val { font-size: 17px; font-weight: 700; margin-bottom: 7px; font-family: 'Liberation Mono', monospace }
.foto3x4 { position: absolute; width: 150px; height: 195px; background: linear-gradient(#9aa, #677); border: 1px solid #455 }
"""


def pagina(corpo, extra_css=''):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{extra_css}</style></head><body>{corpo}</body></html>'


def hw(texto, seed=1):
    """'Letra à mão' simulada: serifada itálica azul, cada letra um pouco torta."""
    rnd = random.Random(seed); out = []
    for ch in texto:
        if ch == ' ': out.append('&nbsp;'); continue
        out.append(f'<span style="transform:translateY({rnd.uniform(-2.2, 2.2):.1f}px) rotate({rnd.uniform(-6, 6):.1f}deg)">{ch}</span>')
    return f'<span class="hw">{"".join(out)}</span>'


# ---------------------------------------------------------------- documentos
DOCS = []


def doc(id, html, documento, tipo, campos, formas=('pdf', 'img', 'foto'), forma='a4', descricao='', extra=None):
    DOCS.append(dict(id=id, html=html, documento=documento, tipo=tipo, campos=campos, formas=list(formas), forma=forma, descricao=descricao, extra=extra or {}))


CLINICA = '<div class="hdr"><div class="b" style="font-size:17px">CLÍNICA MÉDICA BEM VIVER EXEMPLO</div><div class="sm">Av. Central Fictícia, 1.250 - Sala 304 - Praia da Costa - Vila Velha/ES - CEP 29101-020 · Tel. (27) 3000-0000 · CNPJ 00.000.111/0001-00</div></div>'

doc('atestado-clinica', pagina(f'''<div class="pg">{CLINICA}
<h1>ATESTADO MÉDICO</h1>
<p style="font-size:15px;text-align:justify">Atesto, para os devidos fins, que o(a) Sr(a). <b>DANIELA SOUZA LIMA</b>, portador(a) do CPF {cpf('000123401')},
esteve sob meus cuidados profissionais nesta data e necessita de <b>03 (três) dias</b> de afastamento de suas atividades laborais
a partir de 14/10/2026.</p>
<p style="font-size:15px">CID 10: J06.9</p>
<p style="font-size:15px;margin-top:40px">Vila Velha - ES, 14 de outubro de 2026.</p>
<div class="ass">Dr. Ricardo Almeida<br>Clínico Geral · CRM-ES 12345</div>
<p class="sm" style="position:absolute;bottom:40px">Rua das Palmeiras Fictícias, 88 - Itapuã - Vila Velha/ES · Agendamentos (27) 99999-0000</p>
</div>'''), 'atestado', 'afastamento',
    {'empregado': 'DANIELA SOUZA LIMA', 'dias': '3', 'dataAfastamento': '14/10/2026', 'tipoAfastamento': 'Doença período igual ou inferior a 15 dias', 'cid': 'J06.9', 'medico': '*'},
    formas=('pdf', 'img', 'foto', 'deitada', 'scan', 'ruim', 'scanmisto'), descricao='clínica, médico com nome parecido com funcionário, CID')

doc('atestado-upa', pagina(f'''<div class="pg">
<div class="hdr"><div class="b">PREFEITURA MUNICIPAL DE CIDADE EXEMPLO</div><div>SECRETARIA MUNICIPAL DE SAÚDE · UPA 24H EXEMPLO NORTE</div></div>
<table class="f"><tr><td colspan="2"><small>Paciente</small>GABRIEL ALVES PEREIRA</td><td><small>Prontuário</small>447.120</td></tr>
<tr><td><small>Data de nascimento</small>22/05/1994</td><td><small>Nome da mãe</small>ROSANGELA ALVES PEREIRA</td><td><small>Sexo</small>Masculino</td></tr>
<tr><td><small>Data/Hora de atendimento</small>12/10/2026 23:40</td><td colspan="2"><small>Endereço</small>Rua Sete Fictícia, 70 - Bairro Novo - Cidade Exemplo/ES</td></tr></table>
<h1>ATESTADO</h1>
<p style="font-size:15px;text-align:justify">Atesto que o paciente acima identificado foi atendido nesta unidade e necessita de 1 (um) dia de repouso, a partir de 13/10/2026.</p>
<p style="font-size:15px">CID: R51</p>
<div class="ass">Dra. Helena Fictícia Duarte<br>CRM 99881-ES</div>
<p class="sm" style="margin-top:60px">Impresso em 13/10/2026 00:12 por usuário recepcao.upa</p>
</div>'''), 'atestado', 'afastamento',
    {'empregado': 'GABRIEL ALVES PEREIRA', 'dias': '1', 'dataAfastamento': '13/10/2026', 'tipoAfastamento': 'Doença período igual ou inferior a 15 dias', 'cid': 'R51', 'medico': '*'},
    formas=('pdf', 'img', 'foto', 'scan', 'ruim'), descricao='UPA em tabela, nome da mãe, data de atendimento ≠ início')

doc('atestado-odonto', pagina(f'''<div class="pg">
<div class="hdr c"><div class="b" style="font-size:17px">ODONTO SORRISO EXEMPLO</div><div class="sm">Rua do Dentista Fictício, 15 - Serra/ES · CRO-ES 5566</div></div>
<h1>ATESTADO ODONTOLÓGICO</h1>
<p style="font-size:15px;text-align:justify">Atesto, para fins de justificativa trabalhista, que JOAO PEDRO MARTINS, RG 3.210.987 SSP/ES,
submeteu-se a procedimento odontológico (exodontia) nesta data, necessitando de 2 (dois) dias de repouso.</p>
<p style="font-size:15px;margin-top:36px">Serra/ES, 09/10/2026</p>
<div class="ass">Dr. Paulo Fictício Rangel<br>Cirurgião-Dentista · CRO-ES 5566</div>
</div>'''), 'atestado', 'afastamento',
    {'empregado': 'JOAO PEDRO MARTINS', 'dias': '2', 'dataAfastamento': '09/10/2026', 'tipoAfastamento': 'Doença período igual ou inferior a 15 dias', 'cid': None, 'medico': '*'},
    descricao='dentista (CRO), "nesta data", sobrenome repetido na lista')

doc('declaracao-comparecimento', pagina(f'''<div class="pg">{CLINICA}
<h1>DECLARAÇÃO DE COMPARECIMENTO</h1>
<p style="font-size:15px;text-align:justify">Declaro, para os devidos fins, que PATRICIA GOMES DIAS, CPF {cpf('000123402')}, esteve neste consultório
no dia 15/10/2026, no período das 08:00 às 10:30 horas, para consulta médica.</p>
<p style="font-size:15px;margin-top:36px">Vila Velha/ES, 15/10/2026.</p>
<div class="ass">Dr. Ricardo Almeida<br>CRM-ES 12345</div>
</div>'''), 'atestado', 'afastamento',
    {'empregado': 'PATRICIA GOMES DIAS', 'dias': None, 'dataAfastamento': '15/10/2026', 'tipoAfastamento': '*', 'cid': None, 'medico': '*'},
    descricao='só horas (não é afastamento em dias)')

doc('atestado-manuscrito', pagina(f'''<div class="pg">
<div class="hdr"><div class="b">POSTO DE SAÚDE JARDIM EXEMPLO</div><div class="sm">Secretaria Municipal de Saúde de Cidade Exemplo</div></div>
<h1>ATESTADO MÉDICO</h1>
<p style="font-size:15px;line-height:2.4">Atesto que {hw('Vanessa Cristina Lopes', 3)} necessita de {hw('05 (cinco)', 4)} dias de afastamento
de suas atividades a partir de {hw('08/10/26', 5)}.</p>
<p style="font-size:15px">Motivo: (<b>X</b>) Doença &nbsp; ( ) Acidente do trabalho &nbsp; ( ) Outros</p>
<p style="font-size:15px">CID: {hw('M54', 6)}</p>
<p style="font-size:15px;margin-top:30px">Data: {hw('08/10/26', 7)}</p>
<div class="ass">{hw('Dr. A. Fictício', 8)}<br>CRM-ES 33221</div>
</div>'''), 'atestado', 'afastamento',
    {'empregado': 'VANESSA CRISTINA LOPES', 'dias': '5', 'dataAfastamento': '08/10/2026', 'tipoAfastamento': 'Doença período igual ou inferior a 15 dias', 'cid': 'M54', 'medico': '*'},
    formas=('img', 'foto', 'scan'), descricao='formulário preenchido à mão, ano com 2 dígitos, opções impressas')

doc('atestado-longo', pagina(f'''<div class="pg">{CLINICA}
<h1>ATESTADO MÉDICO</h1>
<table class="f"><tr><td><small>Paciente</small>LUCIANA REIS MOREIRA</td><td><small>Data de nascimento</small>03/02/1988</td><td><small>Convênio</small>Particular</td></tr></table>
<p style="font-size:15px;text-align:justify;margin-top:20px">Atesto que a paciente acima necessita de 30 (trinta) dias de afastamento de suas atividades laborais,
a partir de 01/10/2026, para tratamento de saúde.</p>
<p style="font-size:15px">CID 10: M54.5</p>
<p style="font-size:15px;margin-top:30px">Vila Velha/ES, 01/10/2026</p>
<div class="ass">Dra. Simone Fictícia Prates<br>Ortopedista · CRM-ES 45678</div>
<p class="sm" style="position:absolute;bottom:50px;left:62px;right:62px">Nota: este atestado é válido para as finalidades previstas no art. 86 do RGPS (Decreto nº 3.048, de 06/05/1999) e para justificativa de 1 a 15 dias de afastamento do trabalho.</p>
</div>'''), 'atestado', 'afastamento',
    {'empregado': 'LUCIANA REIS MOREIRA', 'dias': '30', 'dataAfastamento': '01/10/2026', 'tipoAfastamento': 'Doença período superior a 15 dias', 'cid': 'M54.5', 'medico': '*'},
    formas=('pdf', 'img', 'foto', 'deitada'), descricao='mais de 15 dias, nascimento e decreto com datas')

doc('atestado-filha', pagina(f'''<div class="pg">{CLINICA}
<h1>ATESTADO MÉDICO</h1>
<p style="font-size:15px;text-align:justify">Atesto que a menor MARIA EDUARDA SANTOS, 7 anos, foi atendida nesta data e necessita de 2 (dois) dias de
repouso, devendo permanecer sob os cuidados de sua mãe, FERNANDA OLIVEIRA SANTOS, CPF {cpf('000123403')}, a partir de 15/10/2026.</p>
<p style="font-size:15px">CID: J11</p>
<p style="font-size:15px;margin-top:30px">Vila Velha/ES, 15/10/2026</p>
<div class="ass">Dra. Pediatra Fictícia<br>CRM-ES 55443</div>
</div>'''), 'atestado', 'afastamento',
    {'empregado': 'FERNANDA OLIVEIRA SANTOS', 'dias': '2', 'dataAfastamento': '15/10/2026', 'tipoAfastamento': None, 'cid': '*', 'medico': '*'},
    formas=('pdf', 'foto'), descricao='atestado da filha (nome parecido com outra funcionária); quem se afasta é a mãe')

doc('atestado-2via', pagina(f'''<div class="pg">
<div class="hdr" style="display:flex;justify-content:space-between"><div><div class="b">HOSPITAL E MATERNIDADE EXEMPLO</div><div class="sm">Pronto-socorro adulto</div></div>
<div class="sm r">2ª VIA<br>Data de emissão: 17/10/2026 08:12</div></div>
<h1>ATESTADO MÉDICO</h1>
<p>Paciente: Rafael N. Barbosa &nbsp;&nbsp; Nasc.: 21/09/1985</p>
<p style="font-size:15px;text-align:justify">Atesto que o paciente acima esteve em atendimento neste serviço no dia 10/10/2026, necessitando de 3 (três) dias de
afastamento de suas atividades a partir desta data.</p>
<div class="ass">Dr. Plantonista Fictício<br>CRM-ES 66554</div>
</div>'''), 'atestado', 'afastamento',
    {'empregado': 'RAFAEL NUNES BARBOSA', 'dias': '3', 'dataAfastamento': '10/10/2026', 'tipoAfastamento': 'Doença período igual ou inferior a 15 dias', 'cid': None, 'medico': '*'},
    formas=('pdf', 'img', 'foto'), descricao='2ª via: data de emissão (reimpressão) antes da data do atendimento; nome abreviado')

doc('atestado-digital', pagina(f'''<div class="pg">
<div style="display:flex;justify-content:space-between;align-items:center" class="hdr"><div class="b" style="font-size:18px;color:#0a5">TeleSaúde Exemplo</div><div class="sm">Documento assinado digitalmente · ICP-Brasil</div></div>
<h1>Atestado Médico</h1>
<p>Paciente: Fernanda Oliveira Santos</p>
<p>CPF: {cpf('000123403')}</p>
<p>Data: 16/10/2026</p>
<p style="text-align:justify">Atesto, para os devidos fins, que a paciente foi atendida em teleconsulta e deverá permanecer afastada de suas atividades por 2 (dois) dias.</p>
<p>Afastamento: 2 dias</p>
<div style="margin-top:50px" class="box sm">Assinado digitalmente por DR JOSE CARLOS MARTINS FILHO · CRM 77881 SP · 16/10/2026 09:41:12<br>Verifique a autenticidade em validador.exemplo.invalid · Código ABCD-1234</div>
</div>'''), 'atestado', 'afastamento',
    {'empregado': 'FERNANDA OLIVEIRA SANTOS', 'dias': '2', 'dataAfastamento': '16/10/2026', 'tipoAfastamento': 'Doença período igual ou inferior a 15 dias', 'cid': None, 'medico': '*'},
    formas=('pdf', 'img', 'foto'), descricao='teleconsulta, nome em minúsculas, médico com nome de funcionário')

# ---------- ASO
ASO_CSS = '.op{display:inline-block;margin-right:16px}'
doc('aso-admissional', pagina(f'''<div class="pg">
<div class="hdr"><div class="b">MEDICINA DO TRABALHO EXEMPLO LTDA</div><div class="sm">Av. Saúde Ocupacional, 900 - Centro - Vitória/ES - CEP 29010-500 · Tel. (27) 3111-1111</div></div>
<h1 style="font-size:18px">ATESTADO DE SAÚDE OCUPACIONAL - ASO</h1>
<table class="f"><tr><td colspan="2"><small>Empresa</small>{EMPRESA}</td><td><small>CNPJ</small>{CNPJ}</td></tr>
<tr><td colspan="3"><small>Endereço da empresa</small>{END_EMPRESA}</td></tr>
<tr><td colspan="2"><small>Nome do trabalhador</small>LARISSA MONTEIRO DUARTE</td><td><small>CPF</small>{cpf('000123404')}</td></tr>
<tr><td><small>Data de nascimento</small>11/11/2001</td><td><small>Função</small>ASSISTENTE ADMINISTRATIVO</td><td><small>Setor</small>ADMINISTRATIVO</td></tr></table>
<h2>Tipo de exame</h2>
<p><span class="op">(X) Admissional</span><span class="op">( ) Periódico</span><span class="op">( ) Retorno ao trabalho</span><span class="op">( ) Mudança de função</span><span class="op">( ) Demissional</span></p>
<h2>Riscos ocupacionais</h2><p>Ausência de riscos ocupacionais específicos.</p>
<h2>Exames complementares</h2><p>Acuidade visual — 10/10/2026</p>
<h2>Parecer</h2><p><span class="op">(X) Apto</span><span class="op">( ) Inapto</span></p>
<p style="margin-top:28px">Vitória/ES, 13/10/2026</p>
<div class="ass">Dr. Médico Examinador Fictício<br>CRM-ES 11111 · Coordenador do PCMSO</div>
</div>''', ASO_CSS), 'aso', 'cadastroEmpregado',
    {'nome': 'LARISSA MONTEIRO DUARTE', 'cpf': cpf('000123404'), 'nascimento': '11/11/2001', 'cep': None, 'endereco': None, 'numero': None, 'municipio': None, 'uf': None, 'cargo': '*', 'departamento': '*', 'dataAdmissao': None},
    descricao='ASO admissional anexado ao cadastro: endereço é da clínica/empresa', extra={'aso': {'tipo': 'admissional', 'resultado': 'APTO', 'data': '13/10/2026'}})

doc('aso-demissional', pagina(f'''<div class="pg">
<div class="hdr"><div class="b">MEDICINA DO TRABALHO EXEMPLO LTDA</div><div class="sm">Av. Saúde Ocupacional, 900 - Centro - Vitória/ES - CEP 29010-500</div></div>
<h1 style="font-size:18px">ATESTADO DE SAÚDE OCUPACIONAL</h1>
<p>Empresa: {EMPRESA} &nbsp; CNPJ: {CNPJ}</p>
<p>Nome: RAFAEL NUNES BARBOSA &nbsp;&nbsp; CPF: {cpf('000123405')}</p>
<p>Função: AUXILIAR DE PRODUÇÃO &nbsp;&nbsp; Admissão: 10/03/2021</p>
<p>Exame: ( ) Admissional ( ) Periódico ( ) Retorno ao trabalho ( ) Mudança de função (X) Demissional</p>
<p>Conclusão: (X) Apto ( ) Inapto</p>
<p>Data: 17/10/2026</p>
<div class="ass">Dra. Examinadora Fictícia<br>CRM-ES 22222</div>
</div>'''), 'aso', 'calculoRescisao',
    {'empregado': 'RAFAEL NUNES BARBOSA', 'dataDemissao': None, 'motivo': None, 'dataAvisoPrevio': None},
    descricao='ASO demissional anexado ao cálculo de rescisão: data do exame não é a data de demissão',
    extra={'aso': {'tipo': 'demissional', 'resultado': 'APTO', 'data': '17/10/2026'}})
DOCS.append({**DOCS[-1], 'id': 'aso-demissional-no-aviso', 'tipo': 'avisoRescisao', 'campos': {'empregado': 'RAFAEL NUNES BARBOSA', 'dataAviso': None, 'motivo': None, 'avisoDadoPor': None, 'anosEmpresa': '*'},
             'formas': ['pdf', 'foto'], 'descricao': 'o mesmo ASO demissional anexado ao Aviso Prévio de Rescisão: data do exame não é a data do aviso'})

# ---------- comprovantes de residência
def conta(titulo, emissor, end_emissor, extra_linhas, cor):
    return pagina(f'''<div class="pg">
<div style="background:{cor};color:#fff;padding:12px 16px;border-radius:6px"><div class="b" style="font-size:19px">{emissor}</div>
<div style="font-size:11px">{end_emissor}</div></div>
<div style="display:flex;gap:18px;margin-top:16px">
<div class="box" style="flex:1.4"><div class="sm">DADOS DO CLIENTE</div>
<div class="b">RAFAEL NUNES BARBOSA</div>
<div>RUA DAS ACÁCIAS, 245 APTO 302</div><div>JARDIM ATLÂNTICO</div><div>CEP 29101-450 VILA VELHA - ES</div>
<div class="sm">CPF ***.123.4**-**</div></div>
<div class="box" style="flex:1"><div class="sm">{titulo}</div>{''.join(f'<div>{l}</div>' for l in extra_linhas)}</div></div>
<table class="f" style="margin-top:14px"><tr><td><small>Mês de referência</small>09/2026</td><td><small>Vencimento</small>20/10/2026</td><td><small>Total a pagar</small>R$ 187,42</td></tr></table>
<p class="sm" style="margin-top:20px">Histórico de consumo: ago/26 · jul/26 · jun/26 · mai/26 · abr/26 · mar/26</p>
<p class="sm">Central de atendimento 0800 000 0000 · Ouvidoria · Pague pelo PIX ou nas agências credenciadas.</p>
<div class="sm" style="position:absolute;bottom:60px;left:62px;right:62px;border-top:1px dashed #999;padding-top:6px">
Autenticação mecânica · 00190.00009 01234.567891 23456.789012 3 98760000018742</div>
</div>''')


END_GABARITO = {'telefone': '*', 'endereco': 'RUA DAS ACACIAS', 'numero': '245', 'complemento': 'APTO 302', 'bairro': 'JARDIM ATLANTICO', 'cep': '29101-450', 'municipio': 'VILA VELHA', 'uf': 'ES', 'nome': '*', 'cpf': None}
doc('conta-luz', conta('NOTA FISCAL / CONTA DE ENERGIA ELÉTRICA', 'COMPANHIA DE ENERGIA EXEMPLO S.A.',
    'Av. das Indústrias Fictícias, 1500 - Centro - Cidade Exemplo/ES - CEP 29000-100 · CNPJ 00.000.222/0001-00',
    ['Instalação: 0012345678', 'Consumo: 210 kWh', 'Leitura atual: 15/09/2026'], '#0b4f8a'), 'comprovanteEndereco', 'cadastroEmpregado', END_GABARITO,
    formas=('pdf', 'img', 'foto', 'deitada'), descricao='endereço da distribuidora antes do endereço do cliente')
doc('conta-agua', conta('CONTA DE ÁGUA E ESGOTO', 'SANEAMENTO EXEMPLO - COMPANHIA DE ÁGUA',
    'Rua da Represa Fictícia, 30 - Bento Ferreira - Vitória/ES - CEP 29050-000',
    ['Matrícula: 778899-0', 'Consumo: 12 m³', 'Hidrômetro: Y00X12345'], '#0a7f86'), 'comprovanteEndereco', 'cadastroEmpregado', END_GABARITO,
    formas=('pdf', 'img', 'foto'), descricao='conta de água, emissor em Vitória')
doc('conta-telefone', conta('FATURA DE SERVIÇOS DE TELECOMUNICAÇÕES', 'TELEFONIA EXEMPLO S.A.',
    'Avenida Paulista Fictícia, 1000 - Bela Vista - São Paulo/SP - CEP 01310-000',
    ['Telefone: (27) 3222-0000', 'Plano Internet 300 Mega', 'Período: 01/09 a 30/09/2026'], '#6a1b9a'), 'comprovanteEndereco', 'cadastroEmpregado', END_GABARITO,
    formas=('pdf', 'img', 'foto'), descricao='fatura de telefone/internet com sede em SP')

# ---------- documentos pessoais
RG_CSS = '.card{background:linear-gradient(135deg,#d7ecd9,#eef6e8 60%,#cfe3d2)}'
doc('rg-antigo', pagina(f'''<div class="card" id="doc">
<div class="c b" style="font-size:13px">REPÚBLICA FEDERATIVA DO BRASIL</div>
<div class="c" style="font-size:12px">ESTADO DO ESPÍRITO SANTO · SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA</div>
<div class="c b" style="font-size:12px;margin-bottom:12px">INSTITUTO DE IDENTIFICAÇÃO · CARTEIRA DE IDENTIDADE</div>
<div style="display:flex;gap:30px"><div style="flex:1">
<div class="lbl">Registro Geral</div><div class="val">1.234.567</div>
<div class="lbl">Nome</div><div class="val">MARCOS VINICIUS TEIXEIRA</div>
<div class="lbl">Filiação</div><div class="val" style="font-size:15px">JORGE TEIXEIRA<br>SONIA MARIA TEIXEIRA</div>
<div style="display:flex;gap:30px"><div><div class="lbl">Naturalidade</div><div class="val">VITÓRIA-ES</div></div>
<div><div class="lbl">Data de Nascimento</div><div class="val">30/07/1992</div></div></div>
<div class="lbl">Doc. Origem</div><div class="val" style="font-size:13px">C.NASC. LV A-12 FL 34 Nº 5678 CART. 1º OFÍCIO VITÓRIA-ES</div>
<div class="lbl">CPF</div><div class="val">{cpf('000123406')}</div>
</div><div style="width:240px;text-align:right">
<div class="lbl">Data de Expedição</div><div class="val">12/03/2015</div>
<div class="sm" style="margin-top:150px">SSP/ES</div>
<div class="sm">Assinatura do Diretor</div></div></div>
</div>''', RG_CSS), 'identidade', 'cadastroEmpregado',
    {'nome': 'MARCOS VINICIUS TEIXEIRA', 'rg': '1.234.567', 'dataRg': '12/03/2015', 'nascimento': '30/07/1992', 'mae': 'SONIA MARIA TEIXEIRA', 'pai': 'JORGE TEIXEIRA', 'municipioNascimento': 'VITORIA', 'ufNascimento': 'ES', 'cpf': cpf('000123406'), 'orgaoRg': '*', 'ufRg': '*'},
    formas=('img', 'foto', 'deitada', 'scan'), forma='card', descricao='rótulo em cima do valor, sem dois-pontos')

CNH_CSS = '.card{background:linear-gradient(135deg,#e9f0d8,#f4f1dc 55%,#dfe9cf)}'
doc('cnh', pagina(f'''<div class="card" id="doc">
<div class="c b" style="font-size:12px">REPÚBLICA FEDERATIVA DO BRASIL · MINISTÉRIO DOS TRANSPORTES · SECRETARIA NACIONAL DE TRÂNSITO</div>
<div class="c b" style="font-size:15px;margin-bottom:8px">CARTEIRA NACIONAL DE HABILITAÇÃO</div>
<div class="foto3x4" style="left:28px;top:80px"></div>
<div style="margin-left:180px">
<div class="lbl">Nome</div><div class="val">THIAGO HENRIQUE PRADO</div>
<div style="display:flex;gap:26px"><div><div class="lbl">Doc. Identidade / Órg. Emissor / UF</div><div class="val">2233445 SSP ES</div></div></div>
<div style="display:flex;gap:26px"><div><div class="lbl">CPF</div><div class="val">{cpf('000123407')}</div></div><div><div class="lbl">Data Nascimento</div><div class="val">19/01/1990</div></div></div>
<div class="lbl">Filiação</div><div class="val" style="font-size:14px">HENRIQUE PRADO SOBRINHO<br>MARTA LUCIA PRADO</div>
<div style="display:flex;gap:26px"><div><div class="lbl">Permissão</div><div class="val">&nbsp;</div></div><div><div class="lbl">ACC</div><div class="val">&nbsp;</div></div><div><div class="lbl">Cat. Hab.</div><div class="val">AB</div></div></div>
<div style="display:flex;gap:26px"><div><div class="lbl">Nº Registro</div><div class="val">01234567890</div></div><div><div class="lbl">Validade</div><div class="val">25/06/2031</div></div><div><div class="lbl">1ª Habilitação</div><div class="val">02/08/2009</div></div></div>
<div style="display:flex;gap:26px"><div><div class="lbl">Local</div><div class="val">VILA VELHA, ES</div></div><div><div class="lbl">Data Emissão</div><div class="val">26/06/2021</div></div></div>
</div></div>''', CNH_CSS), 'identidade', 'cadastroEmpregado',
    {'nome': 'THIAGO HENRIQUE PRADO', 'cpf': cpf('000123407'), 'nascimento': '19/01/1990', 'rg': '2233445', 'orgaoRg': 'SSP', 'ufRg': '*', 'mae': 'MARTA LUCIA PRADO', 'pai': 'HENRIQUE PRADO SOBRINHO',
     'cnh': '01234567890', 'cnhCategoria': 'AB', 'cnhValidade': '25/06/2031', 'dataRg': None, 'municipio': None, 'uf': None, 'municipioNascimento': None},
    formas=('pdf', 'img', 'foto', 'deitada'), forma='card', descricao='CNH (a "data emissão" é da CNH, não do RG)')

CIN_CSS = '.card{background:linear-gradient(135deg,#dbe7f5,#f0f4fb 55%,#d5e2f2)}'
doc('cin', pagina(f'''<div class="card" id="doc">
<div class="c b" style="font-size:12px">REPÚBLICA FEDERATIVA DO BRASIL · CARTEIRA DE IDENTIDADE NACIONAL</div>
<div class="foto3x4" style="left:28px;top:60px"></div>
<div style="margin-left:180px;margin-top:10px">
<div class="lbl">Nome / Name</div><div class="val">ANA PAULA FERREIRA</div>
<div class="lbl">Nome Social / Social Name</div><div class="val">&nbsp;</div>
<div style="display:flex;gap:26px"><div><div class="lbl">Sexo / Sex</div><div class="val">F</div></div><div><div class="lbl">Nacionalidade / Nationality</div><div class="val">BRA</div></div><div><div class="lbl">Data de Nascimento</div><div class="val">05/12/1995</div></div></div>
<div class="lbl">Registro Geral - CPF / Personal Number</div><div class="val">{cpf('000123408')}</div>
<div class="lbl">Naturalidade / Place of birth</div><div class="val">CARIACICA/ES</div>
<div class="lbl">Filiação / Filiation</div><div class="val" style="font-size:14px">PAULO FERREIRA<br>ROSA MARIA FERREIRA</div>
<div style="display:flex;gap:26px"><div><div class="lbl">Órgão Expedidor</div><div class="val">SSP/ES</div></div><div><div class="lbl">Data de Emissão</div><div class="val">10/05/2025</div></div><div><div class="lbl">Validade</div><div class="val">10/05/2035</div></div></div>
</div></div>''', CIN_CSS), 'identidade', 'cadastroEmpregado',
    {'nome': 'ANA PAULA FERREIRA', 'cpf': cpf('000123408'), 'nascimento': '05/12/1995', 'mae': 'ROSA MARIA FERREIRA', 'pai': 'PAULO FERREIRA', 'municipioNascimento': 'CARIACICA', 'ufNascimento': 'ES',
     'orgaoRg': 'SSP', 'ufRg': 'ES', 'dataRg': '10/05/2025', 'rg': '*', 'sexo': 'Feminino', 'cnhValidade': None, 'nomeSocial': None},   # o portal tem Órgão e UF do RG separados
    formas=('pdf', 'img', 'foto'), forma='card', descricao='CIN nova (número = CPF), rótulos bilíngues')

doc('ctps-digital', pagina(f'''<div class="pg">
<div class="hdr"><div class="b" style="font-size:18px">Carteira de Trabalho Digital</div><div class="sm">Ministério do Trabalho e Emprego · documento gerado em 15/10/2026 10:22</div></div>
<h2>Dados pessoais</h2>
<p>Nome: EDUARDO SILVA RAMOS<br>CPF: {cpf('000123409')}<br>Data de nascimento: 14/04/1987<br>Sexo: Masculino<br>Nacionalidade: Brasileira</p>
<h2>Contratos de trabalho</h2>
<table class="f"><tr><td><small>Empregador</small>COMÉRCIO ANTERIOR FICTÍCIO LTDA</td><td><small>CNPJ</small>00.000.333/0001-00</td></tr>
<tr><td><small>Cargo</small>AUXILIAR ADMINISTRATIVO</td><td><small>CBO</small>4110-05</td></tr>
<tr><td><small>Data de admissão</small>01/02/2020</td><td><small>Data de desligamento</small>30/06/2024</td></tr>
<tr><td><small>Remuneração inicial</small>R$ 1.412,00</td><td><small>Tipo de contrato</small>Prazo indeterminado</td></tr></table>
<table class="f"><tr><td><small>Empregador</small>SERVIÇOS ANTIGOS EXEMPLO ME</td><td><small>CNPJ</small>00.000.444/0001-00</td></tr>
<tr><td><small>Cargo</small>RECEPCIONISTA</td><td><small>CBO</small>4221-05</td></tr>
<tr><td><small>Data de admissão</small>03/03/2015</td><td><small>Data de desligamento</small>20/12/2019</td></tr></table>
</div>'''), 'ctps', 'cadastroEmpregado',
    {'nome': 'EDUARDO SILVA RAMOS', 'cpf': cpf('000123409'), 'nascimento': '14/04/1987', 'sexo': '*', 'dataAdmissao': None, 'cargo': None, 'salario': None, 'nacionalidade': '*'},
    descricao='contratos anteriores (admissão/cargo/salário de outro emprego)')

doc('titulo-eleitor', pagina(f'''<div class="card" id="doc" style="background:linear-gradient(135deg,#f3efe3,#fbf8ef)">
<div class="c b" style="font-size:13px">JUSTIÇA ELEITORAL · TRIBUNAL SUPERIOR ELEITORAL</div>
<div class="c b" style="font-size:16px;margin-bottom:12px">TÍTULO ELEITORAL</div>
<div class="lbl">Nome do eleitor</div><div class="val">LUCIANA REIS MOREIRA</div>
<div style="display:flex;gap:30px"><div><div class="lbl">Data de nascimento</div><div class="val">03/02/1988</div></div>
<div><div class="lbl">Inscrição</div><div class="val">0123 4567 0108</div></div></div>
<div style="display:flex;gap:30px"><div><div class="lbl">Zona</div><div class="val">012</div></div><div><div class="lbl">Seção</div><div class="val">0345</div></div>
<div><div class="lbl">Município/UF</div><div class="val">VILA VELHA/ES</div></div></div>
<div class="lbl">Filiação</div><div class="val" style="font-size:14px">ANTONIO REIS MOREIRA<br>CLEUSA REIS MOREIRA</div>
<div style="display:flex;gap:30px"><div><div class="lbl">Data de emissão</div><div class="val">20/08/2018</div></div></div>
</div>'''), 'titulo', 'cadastroEmpregado',
    {'titulo': '012345670108', 'zona': '012', 'secao': '0345', 'nome': 'LUCIANA REIS MOREIRA', 'nascimento': '03/02/1988', 'dataRg': None, 'municipio': None, 'uf': None, 'mae': '*', 'pai': '*'},
    formas=('img', 'foto'), forma='card', descricao='título: inscrição/zona/seção; data de emissão não é do RG')

doc('ficha-admissao', pagina(f'''<div class="pg" style="font-size:13px">
<div class="hdr"><div class="b">{EMPRESA}</div><div class="sm">CNPJ {CNPJ} · {END_EMPRESA}</div></div>
<h1 style="font-size:18px;margin:12px 0">FICHA DE ADMISSÃO</h1>
<h2>Dados do empregado</h2>
<p>Nome completo: LARISSA MONTEIRO DUARTE<br>
CPF: {cpf('000123404')} &nbsp;&nbsp; PIS: {pis('0001234567')}<br>
Data de nascimento: 11/11/2001 &nbsp;&nbsp; Sexo: Feminino<br>
Estado civil: Solteira &nbsp;&nbsp; Raça/cor: Parda<br>
Grau de instrução: Ensino médio completo<br>
Naturalidade: Serra &nbsp;&nbsp; Naturalidade UF: ES<br>
Nome da mãe: MARIA APARECIDA SANTOS<br>
Nome do pai: JOSÉ MONTEIRO DUARTE<br>
RG: 4.455.667 &nbsp;&nbsp; Órgão expedidor: SSP/ES &nbsp;&nbsp; Data de expedição: 20/01/2019</p>
<h2>Endereço</h2>
<p>Endereço: Rua Sete de Setembro Fictícia &nbsp;&nbsp; Número: 1200<br>
Complemento: Casa 2 &nbsp;&nbsp; Bairro: Laranjeiras<br>
CEP: 29165-130 &nbsp;&nbsp; Cidade: Serra &nbsp;&nbsp; UF: ES<br>
Telefone: (27) 99888-7766 &nbsp;&nbsp; E-mail: larissa.exemplo@exemplo.invalid</p>
<h2>Contrato</h2>
<p>Cargo: ASSISTENTE ADMINISTRATIVO<br>
Data de admissão: 20/10/2026 &nbsp;&nbsp; Salário: R$ 2.150,00<br>
Contrato de experiência: 45 dias &nbsp;&nbsp; Prorrogação: 45 dias<br>
Horário de trabalho: 08:00 às 17:00</p>
<h2>Dados bancários</h2>
<p>Banco: 001 - Banco do Brasil &nbsp;&nbsp; Agência: 1234-5 &nbsp;&nbsp; Conta corrente: 98765-4</p>
<div class="ass">Assinatura do empregado</div>
</div>'''), 'fichaAdmissao', 'cadastroEmpregado',
    {'nome': 'LARISSA MONTEIRO DUARTE', 'cpf': cpf('000123404'), 'pis': pis('0001234567'), 'nascimento': '11/11/2001', 'sexo': 'Feminino', 'estadoCivil': 'Solteira', 'racaCor': 'Parda',
     'grauInstrucao': 'Ensino médio completo', 'municipioNascimento': 'Serra', 'ufNascimento': 'ES', 'mae': 'MARIA APARECIDA SANTOS', 'pai': 'JOSE MONTEIRO DUARTE',
     'rg': '4.455.667', 'orgaoRg': 'SSP', 'ufRg': 'ES', 'dataRg': '20/01/2019', 'endereco': 'Rua Sete de Setembro Ficticia', 'numero': '1200', 'complemento': 'Casa 2', 'bairro': 'Laranjeiras',
     'cep': '29165-130', 'municipio': 'Serra', 'uf': 'ES', 'telefone': '(27) 99888-7766', 'email': 'larissa.exemplo@exemplo.invalid', 'cargo': 'ASSISTENTE ADMINISTRATIVO',
     'dataAdmissao': '20/10/2026', 'salario': '2150,00', 'contratoExperiencia': '45', 'prorrogacao': '45', 'banco': '*', 'agencia': '1234-5', 'conta': '98765-4', 'jornada': '*', 'digitoConta': '*', 'tipoConta': '*'},
    formas=('pdf', 'img', 'foto', 'scan', 'scanmisto'), descricao='ficha com rótulos (melhor caso), cabeçalho com endereço da empresa')

doc('contrato-experiencia', pagina(f'''<div class="pg" style="font-size:13.5px;text-align:justify">
<h1 style="font-size:18px">CONTRATO DE TRABALHO A TÍTULO DE EXPERIÊNCIA</h1>
<p>Pelo presente instrumento particular, de um lado <b>{EMPRESA}</b>, inscrita no CNPJ sob o nº {CNPJ}, com sede na
Rua Projetada Exemplo, 100, Centro, Cidade Exemplo/ES, CEP 29000-010, doravante denominada EMPREGADORA, e de outro lado
<b>THIAGO HENRIQUE PRADO</b>, portador da CTPS nº 1234567 série 0012-ES, CPF {cpf('000123407')}, residente na Avenida Beira Mar Fictícia, 455,
Praia de Itaparica, Vila Velha/ES, CEP 29102-200, doravante denominado EMPREGADO, celebram o presente contrato de experiência,
nos termos do art. 443 da CLT, mediante as cláusulas seguintes:</p>
<p>1. O EMPREGADO exercerá a função de AUXILIAR DE ESTOQUE, mediante salário mensal de R$ 1.850,00 (mil oitocentos e cinquenta reais).</p>
<p>2. O presente contrato vigorará pelo prazo de 45 (quarenta e cinco) dias, com início em 05/10/2026 e término em 18/11/2026,
podendo ser prorrogado por mais 45 (quarenta e cinco) dias, nos termos do art. 451 da CLT.</p>
<p>3. O horário de trabalho será das 08h00 às 17h48, de segunda a sexta-feira, com uma hora de intervalo.</p>
<p>E por estarem de pleno acordo, assinam o presente em duas vias.</p>
<p style="margin-top:20px">Cidade Exemplo/ES, 05 de outubro de 2026.</p>
<div style="display:flex;gap:40px"><div class="ass" style="width:280px">EMPREGADORA</div><div class="ass" style="width:280px">EMPREGADO</div></div>
</div>'''), None, 'cadastroEmpregado',
    {'nome': 'THIAGO HENRIQUE PRADO', 'cpf': cpf('000123407'), 'cargo': 'AUXILIAR DE ESTOQUE', 'salario': '1850,00', 'dataAdmissao': '05/10/2026', 'contratoExperiencia': '45', 'prorrogacao': '45',
     'ctpsNumero': '1234567', 'ctpsSerie': '0012', 'endereco': 'Avenida Beira Mar Ficticia', 'numero': '455', 'bairro': 'Praia de Itaparica', 'cep': '29102-200', 'municipio': 'Vila Velha', 'uf': 'ES', 'ctpsUf': '*', 'jornada': '*'},
    descricao='contrato corrido: endereço da empregadora aparece antes do empregado')

doc('aviso-ferias-assinado', pagina(f'''<div class="pg" style="font-size:14px">
<div class="hdr"><div class="b">{EMPRESA}</div><div class="sm">CNPJ {CNPJ}</div></div>
<h1>AVISO DE FÉRIAS</h1>
<p>Ao(À) Sr(a). EDUARDO SILVA RAMOS &nbsp; CTPS 7654321 série 0034-ES &nbsp; Admissão: 01/03/2023</p>
<p style="text-align:justify">Participamos que, de acordo com a lei, suas férias serão concedidas conforme abaixo:</p>
<table class="f"><tr><td><small>Período aquisitivo</small>01/03/2025 a 28/02/2026</td><td><small>Período de gozo</small>03/11/2026 a 02/12/2026</td></tr>
<tr><td><small>Dias de férias</small>30</td><td><small>Retorno ao trabalho</small>03/12/2026</td></tr></table>
<p>Cidade Exemplo/ES, 02 de outubro de 2026.</p>
<div class="ass">{EMPRESA}</div>
<p style="margin-top:30px">Ciente em 02/10/2026.</p>
<div class="ass">{hw('Eduardo S. Ramos', 11)}<br>EDUARDO SILVA RAMOS</div>
</div>'''), 'avisoFeriasAssinado', 'calculoFerias',
    {'empregado': 'EDUARDO SILVA RAMOS', 'inicioGozo': '03/11/2026', 'diasGozo': '30', 'abono': None, 'adiantar13': None},
    formas=('pdf', 'img', 'foto', 'scan'), descricao='período aquisitivo e admissão antes do gozo')

doc('pedido-demissao', pagina(f'''<div class="pg" style="font-size:15px;text-align:justify">
<p class="r" style="margin-top:40px">Vila Velha, 16 de outubro de 2026.</p>
<p style="margin-top:30px">À<br>{EMPRESA}<br>At. Departamento Pessoal</p>
<p style="margin-top:20px" class="b">Assunto: Pedido de demissão</p>
<p>Eu, CARLOS EDUARDO MENDES, portador do CPF {cpf('000123410')} e da CTPS nº 5544332 série 0021-ES, venho por meio desta
solicitar meu desligamento do cargo de VENDEDOR, a partir desta data, comprometendo-me a cumprir o aviso prévio de 30 dias.</p>
<p>Fui admitido em 02/05/2022.</p>
<p>Sem mais,</p>
<div class="ass">{hw('Carlos E. Mendes', 13)}<br>CARLOS EDUARDO MENDES</div>
<p style="margin-top:50px">Recebido em: ____/____/______</p>
</div>'''), 'pedidoDemissao', 'avisoRescisao',
    {'empregado': 'CARLOS EDUARDO MENDES', 'dataAviso': '16/10/2026', 'motivo': 'Pedido de demissão SEM justa causa', 'avisoDadoPor': 'EMPREGADO', 'anosEmpresa': '*'},
    formas=('pdf', 'img', 'foto', 'deitada', 'ruim'), descricao='carta com "a partir desta data" e data de admissão')

doc('aviso-previo-empregador', pagina(f'''<div class="pg" style="font-size:14.5px;text-align:justify">
<div class="hdr"><div class="b">{EMPRESA}</div><div class="sm">CNPJ {CNPJ} · {END_EMPRESA}</div></div>
<h1>AVISO PRÉVIO DO EMPREGADOR</h1>
<p>Ao Sr. RAFAEL NUNES BARBOSA<br>CTPS nº 8877665 série 0045-ES &nbsp; Admissão: 10/03/2021</p>
<p>Pelo presente, comunicamos que, a partir desta data, fica V.Sa. avisado(a) da rescisão do seu contrato de trabalho
sem justa causa, devendo cumprir aviso prévio trabalhado de 33 (trinta e três) dias, encerrando-se em 18/11/2026,
com redução de 2 horas diárias, conforme art. 488 da CLT.</p>
<p>Cidade Exemplo/ES, 16/10/2026.</p>
<div class="ass">{EMPRESA}</div>
<p style="margin-top:30px">Ciente: ____/____/______</p>
<div class="ass">RAFAEL NUNES BARBOSA</div>
</div>'''), 'avisoEmpregador', 'avisoRescisao',
    {'empregado': 'RAFAEL NUNES BARBOSA', 'dataAviso': '16/10/2026', 'motivo': 'Demitido SEM justa causa', 'avisoDadoPor': 'EMPREGADOR', 'anosEmpresa': '*'},
    formas=('pdf', 'img', 'foto'), descricao='aviso da empresa, admissão e término do aviso com datas')

doc('cat', pagina(f'''<div class="pg" style="font-size:12.5px">
<div class="c b" style="font-size:16px">COMUNICAÇÃO DE ACIDENTE DE TRABALHO - CAT</div>
<div class="c sm">Instituto Nacional do Seguro Social · emitida pelo eSocial (S-2210)</div>
<table class="f" style="margin-top:10px"><tr><td><small>Nº da CAT</small>2026.123.456-7/01</td><td><small>Data de emissão</small>12/10/2026</td><td><small>Emitente</small>Empregador</td></tr>
<tr><td colspan="3"><small>Tipo de CAT</small>(X) Inicial &nbsp; ( ) Reabertura &nbsp; ( ) Comunicação de óbito</td></tr></table>
<h2>Empregador</h2>
<table class="f"><tr><td colspan="2"><small>Razão social</small>{EMPRESA}</td><td><small>CNPJ</small>{CNPJ}</td></tr>
<tr><td colspan="3"><small>Endereço</small>{END_EMPRESA}</td></tr></table>
<h2>Acidentado</h2>
<table class="f"><tr><td colspan="2"><small>Nome</small>GABRIEL ALVES PEREIRA</td><td><small>Data de nascimento</small>22/05/1994</td></tr>
<tr><td><small>CPF</small>{cpf('000123411')}</td><td><small>Sexo</small>Masculino</td><td><small>Nome da mãe</small>ROSANGELA ALVES PEREIRA</td></tr>
<tr><td colspan="3"><small>Endereço</small>Rua Sete Fictícia, 70 - Bairro Novo - Cidade Exemplo/ES - CEP 29000-700</td></tr></table>
<h2>Acidente</h2>
<table class="f"><tr><td><small>Data do acidente</small>11/10/2026</td><td><small>Hora</small>14:30</td><td><small>Após quantas horas de trabalho</small>05:30</td></tr>
<tr><td colspan="3"><small>Tipo</small>(X) Típico &nbsp; ( ) Doença &nbsp; ( ) Trajeto</td></tr>
<tr><td><small>Houve afastamento?</small>Sim</td><td><small>Último dia trabalhado</small>11/10/2026</td><td><small>Local</small>Estabelecimento do empregador</td></tr>
<tr><td colspan="3"><small>Descrição</small>Corte superficial na mão esquerda ao manusear caixa no estoque.</td></tr></table>
<h2>Atestado médico</h2>
<table class="f"><tr><td><small>Data do atendimento</small>11/10/2026</td><td><small>Duração provável do tratamento</small>5 dias</td><td><small>CID</small>S61.4</td></tr></table>
</div>'''), 'cat', 'afastamento',
    {'empregado': 'GABRIEL ALVES PEREIRA', 'numeroCat': '2026.123.456-7/01', 'dataCat': '12/10/2026', 'dataAfastamento': '11/10/2026', 'tipoCat': 'Típico', 'tipoAfastamento': '*', 'dias': '*', 'cid': '*', 'medico': None},
    formas=('pdf', 'img', 'foto'), descricao='CAT do eSocial com opções impressas')

doc('certidao-nascimento', pagina(f'''<div class="pg" style="font-size:13.5px">
<div class="c b">REPÚBLICA FEDERATIVA DO BRASIL</div><div class="c b">REGISTRO CIVIL DAS PESSOAS NATURAIS</div>
<h1>CERTIDÃO DE NASCIMENTO</h1>
<table class="f"><tr><td colspan="3"><small>Nome</small>ENZO FERREIRA</td></tr>
<tr><td><small>CPF</small>{cpf('000123412')}</td><td><small>Data de nascimento</small>14/09/2026</td><td><small>Sexo</small>Masculino</td></tr>
<tr><td colspan="3"><small>Filiação</small>ANA PAULA FERREIRA e MARCELO FERREIRA</td></tr>
<tr><td colspan="3"><small>Avós</small>PAULO FERREIRA e ROSA MARIA FERREIRA; JOÃO FERREIRA e LÚCIA FERREIRA</td></tr>
<tr><td><small>Local de nascimento</small>Hospital Exemplo, Vila Velha/ES</td><td colspan="2"><small>Matrícula</small>123456 01 55 2026 1 00012 345 0001234-56</td></tr></table>
<p>O conteúdo da certidão é verdadeiro. Dou fé. Cartório do 1º Ofício de Vila Velha/ES, 20/09/2026.</p>
<div class="ass">Oficial de Registro Civil</div>
</div>'''), 'certidao', None, {}, formas=('pdf', 'img', 'foto'), descricao='certidão de filho (sem pedido próprio)')


# ---------------------------------------------------------------- degradações
def coeficientes(src, dst):
    m = []
    for (x, y), (u, v) in zip(dst, src):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    A = np.array(m, dtype=float); B = np.array(src, dtype=float).reshape(8)
    return np.linalg.solve(A, B).tolist()


def foto(img, seed, deitada=False, pequena=False):
    rnd = random.Random(seed)
    img = img.convert('RGB')
    W, H = img.size
    # mesa ao fundo, papel um pouco menor e torto
    fundo = Image.new('RGB', (int(W * 1.18), int(H * 1.14)), (rnd.randint(90, 140), rnd.randint(80, 120), rnd.randint(60, 100)))
    papel = img.rotate(rnd.uniform(-4, 4) or 2.5, expand=True, fillcolor=fundo.getpixel((0, 0)), resample=Image.BICUBIC)
    fundo.paste(papel, ((fundo.width - papel.width) // 2, (fundo.height - papel.height) // 2))
    # perspectiva (celular inclinado)
    w, h = fundo.size; d = 0.05
    dst = [(0, 0), (w, 0), (w, h), (0, h)]
    src = [(w * rnd.uniform(0, d), h * rnd.uniform(0, d)), (w * (1 - rnd.uniform(0, d)), h * rnd.uniform(0, d / 2)),
           (w * (1 - rnd.uniform(0, d / 2)), h * (1 - rnd.uniform(0, d))), (w * rnd.uniform(0, d / 2), h * (1 - rnd.uniform(0, d / 2)))]
    fundo = fundo.transform((w, h), Image.PERSPECTIVE, coeficientes(src, dst), Image.BICUBIC)
    # sombra (mão/celular) e luz amarelada
    a = np.asarray(fundo).astype(np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = rnd.choice([(0, 0), (w, 0), (0, h), (w, h)])
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / math.hypot(w, h)
    sombra = 0.55 + 0.45 * np.clip(dist * 1.4, 0, 1)
    a = a * sombra[..., None] * np.array([1.0, 0.97, 0.88])
    a += np.random.default_rng(seed).normal(0, 7, a.shape)
    fundo = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.9))
    fundo = ImageEnhance.Contrast(fundo).enhance(0.85)
    lado = 900 if pequena else 1200
    esc = lado / max(fundo.size); fundo = fundo.resize((int(fundo.width * esc), int(fundo.height * esc)), Image.BILINEAR)
    if deitada: fundo = fundo.rotate(90 if seed % 2 else 270, expand=True)
    return fundo


def escaneado(img, seed):
    rnd = random.Random(seed)
    g = img.convert('L').rotate(rnd.uniform(-1.2, 1.2), expand=False, fillcolor=255, resample=Image.BICUBIC)
    a = np.asarray(g).astype(np.float32) + np.random.default_rng(seed).normal(0, 10, (g.height, g.width))
    g = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5))
    esc = 1240 / max(g.size); g = g.resize((int(g.width * esc), int(g.height * esc)), Image.BILINEAR)
    return g


# ---------------------------------------------------------------- montagem
def gerar(pasta):
    from playwright.sync_api import sync_playwright
    os.makedirs(pasta, exist_ok=True)
    gab = []
    with sync_playwright() as p:
        nav = p.chromium.launch(channel='chromium', headless=True)
        for i, d in enumerate(DOCS):
            card = d['forma'] == 'card'
            pg = nav.new_page(viewport={'width': 900 if card else 794, 'height': 600 if card else 1123}, device_scale_factor=1.6)
            pg.set_content(d['html']); pg.wait_for_timeout(150)
            alvo = pg.locator('#doc') if card else pg.locator('.pg')
            png = os.path.join(pasta, f'_{d["id"]}.png'); alvo.screenshot(path=png)
            limpa = Image.open(png).convert('RGB'); os.remove(png)
            arquivos = {}
            for forma in d['formas']:
                nome = f'{d["id"]}--{forma}'
                if forma == 'pdf':
                    if card: pg.pdf(path=os.path.join(pasta, nome + '.pdf'), width='900px', height='600px', print_background=True)
                    else: pg.pdf(path=os.path.join(pasta, nome + '.pdf'), format='A4', print_background=True)
                    arquivos[forma] = nome + '.pdf'
                elif forma == 'img':
                    limpa.save(os.path.join(pasta, nome + '.png')); arquivos[forma] = nome + '.png'
                elif forma in ('foto', 'deitada'):
                    foto(limpa, 100 + i * 7 + len(forma), deitada=forma == 'deitada', pequena=(i % 3 == 0)).save(os.path.join(pasta, nome + '.jpg'), quality=58)
                    arquivos[forma] = nome + '.jpg'
                elif forma == 'scan':
                    escaneado(limpa, 300 + i).save(os.path.join(pasta, nome + '.pdf'), 'PDF', resolution=150.0)
                    arquivos[forma] = nome + '.pdf'
                elif forma == 'ruim':
                    r = foto(limpa, 200 + i, pequena=True)
                    esc = 650 / max(r.size); r = r.resize((int(r.width * esc), int(r.height * esc)), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.1))
                    r.save(os.path.join(pasta, nome + '.jpg'), quality=35); arquivos[forma] = nome + '.jpg'
                elif forma == 'scanmisto':
                    from reportlab.lib.pagesizes import A4
                    from reportlab.lib.utils import ImageReader
                    from reportlab.pdfgen import canvas
                    c = canvas.Canvas(os.path.join(pasta, nome + '.pdf'), pagesize=A4)
                    c.drawImage(ImageReader(escaneado(limpa, 400 + i)), 20, 40, width=A4[0] - 40, height=A4[1] - 60, preserveAspectRatio=True)
                    c.setFont('Helvetica', 8); c.drawString(30, 20, 'Digitalizado com o aplicativo Scanner Exemplo - www.scanner-exemplo.invalid - pagina 1 de 1')
                    c.save(); arquivos[forma] = nome + '.pdf'
            pg.close()
            for forma, arq in arquivos.items():
                gab.append(dict(arquivo=arq, base=d['id'], forma=forma, descricao=d['descricao'], documento=d['documento'], tipo=d['tipo'], campos=d['campos'], **d['extra']))
        nav.close()

    # atestados do gerador antigo (mesmos layouts dos testes)
    spec = importlib.util.spec_from_file_location('gerar_exemplos', os.path.join(AQUI, 'gerar-exemplos-atestados.py'))
    ge = importlib.util.module_from_spec(spec); spec.loader.exec_module(ge)
    ge.foto_girada(os.path.join(pasta, 'atestado-pa-girado--deitada.jpg'))
    ge.acompanhante(os.path.join(pasta, 'atestado-acompanhante--pdf.pdf'))
    gab.append(dict(arquivo='atestado-pa-girado--deitada.jpg', base='atestado-pa-girado', forma='deitada', descricao='gerador antigo: foto deitada de pronto atendimento',
                    documento='atestado', tipo='afastamento', campos={'empregado': 'BEATRIZ CAMPOS', 'dias': '2', 'dataAfastamento': '06/10/2026', 'tipoAfastamento': 'Doença período igual ou inferior a 15 dias', 'cid': None, 'medico': '*'}))
    gab.append(dict(arquivo='atestado-acompanhante--pdf.pdf', base='atestado-acompanhante', forma='pdf', descricao='gerador antigo: acompanhante (tipo fica com o cliente)',
                    documento='atestado', tipo='afastamento', campos={'empregado': 'CAMILA ROCHA', 'dias': '1', 'dataAfastamento': '07/10/2026', 'tipoAfastamento': None, 'cid': 'Z76.3', 'medico': '*'}))

    # planilha de rubricas (xlsx e csv)
    from openpyxl import Workbook
    linhas = [['Funcionário', 'Rubrica', 'Valor'], ['ANA PAULA FERREIRA', 'Horas extras 50%', '10'], ['GABRIEL ALVES PEREIRA', 'Faltas', '2'],
              ['JOAO PEDRO MARTINS', 'Comissão', '350,00'], ['VANESSA CRISTINA LOPES', 'Adicional noturno', '12']]
    wb = Workbook(); ws = wb.active
    for l in linhas: ws.append(l)
    wb.save(os.path.join(pasta, 'planilha-rubricas--xlsx.xlsx'))
    with open(os.path.join(pasta, 'planilha-rubricas--csv.csv'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(';'.join(l) for l in linhas) + '\n')
    for forma, arq in (('xlsx', 'planilha-rubricas--xlsx.xlsx'), ('csv', 'planilha-rubricas--csv.csv')):
        gab.append(dict(arquivo=arq, base='planilha-rubricas', forma=forma, descricao='lançamentos do mês em planilha', documento='planilha', tipo='rubricas', campos={},
                        linhas=[l[0] for l in linhas[1:]]))

    with open(os.path.join(pasta, 'gabarito.json'), 'w', encoding='utf-8') as f:
        json.dump({'hoje': '2026-10-18', 'funcionarios': FUNCIONARIOS, 'documentos': gab}, f, ensure_ascii=False, indent=1)
    print(f'{len(gab)} arquivos fictícios em {os.path.abspath(pasta)}')


if __name__ == '__main__':
    gerar(sys.argv[1] if len(sys.argv) > 1 else PADRAO)
