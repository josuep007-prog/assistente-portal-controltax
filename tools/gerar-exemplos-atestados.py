"""Gera atestados de exemplo FICTÍCIOS (nomes, CPFs e médicos inventados) para o simulador e os testes.
Imitam layouts reais que o leitor precisa entender: foto girada (OCR tenta outras posições) e
atestado de acompanhante (aviso + tipo em aberto). Nunca use atestados de verdade no repositório.

Uso: python tools/gerar-exemplos-atestados.py   (precisa de Pillow e reportlab)
"""
import os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

AQUI = os.path.dirname(os.path.abspath(__file__))
SIM = os.path.join(AQUI, '..', 'simulador', 'exemplos')
FIX = os.path.join(AQUI, '..', 'tests', 'fixtures')
FONTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONTE_B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def foto_girada(destino):
    """Atestado de pronto-atendimento fotografado de lado (a foto ficou deitada)."""
    random.seed(7)
    W, H = 1240, 1754
    img = Image.new('RGB', (W, H), (246, 243, 236))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONTE, 30); fb = ImageFont.truetype(FONTE_B, 44); fs = ImageFont.truetype(FONTE, 22)
    y = 120
    for linha, fonte in [('PREFEITURA MUNICIPAL DE CIDADE EXEMPLO', f), ('UNIDADE DE PRONTO ATENDIMENTO 24 HORAS', f)]:
        d.text((110, y), linha, font=fonte, fill=(40, 40, 40)); y += 48
    y += 70
    d.text((420, y), 'ATESTADO MÉDICO', font=fb, fill=(20, 20, 20)); y += 120
    corpo = [
        'Atesto que o(a) BEATRIZ CAMPOS, portador(a) do CPF: 000.000.001-91,',
        'Nascimento: 10/03/1990, necessita de 02 (dois) dia(s) de afastamento',
        'do trabalho a partir desta data por motivo de doença.',
        '',
        'Cidade Exemplo - ES, 06 de outubro de 2026',
    ]
    for linha in corpo:
        d.text((110, y), linha, font=f, fill=(25, 25, 30)); y += 54
    y += 160
    d.line((380, y, 860, y), fill=(60, 60, 60), width=2); y += 14
    d.text((400, y), 'DRA. FICTICIA EXEMPLO - CRM 00000-ES', font=fs, fill=(40, 40, 40)); y += 200
    d.text((110, y), 'Nota: Este atestado é válido para justificativa de 1 a 15 dias de afastamento do trabalho.', font=fs, fill=(70, 70, 70))
    # papel de foto: leve sombra e ruído
    px = img.load()
    for _ in range(9000):
        x, yy = random.randrange(W), random.randrange(H); c = random.randrange(200, 245); px[x, yy] = (c, c, c - 6)
    img = img.filter(ImageFilter.GaussianBlur(0.6)).rotate(90, expand=True, fillcolor=(120, 110, 100))
    img = img.resize((img.width * 7 // 10, img.height * 7 // 10))
    img.save(destino, quality=82)


def acompanhante(destino):
    c = canvas.Canvas(destino, pagesize=A4)
    w, h = A4
    c.setFont('Helvetica-Bold', 12); c.drawString(60, h - 70, 'PREFEITURA DE CIDADE EXEMPLO')
    c.setFont('Helvetica', 10); c.drawString(60, h - 86, 'Secretaria Municipal de Saúde')
    c.setFont('Helvetica-Bold', 15); c.drawCentredString(w / 2, h - 130, 'ATESTADO')
    c.setFont('Helvetica', 10); c.drawString(60, h - 150, 'Nº: 0000001/2026')
    t = c.beginText(60, h - 190); t.setFont('Helvetica', 11); t.setLeading(17)
    for linha in [
        'Atesto que CAMILA ROCHA',
        'inscrito no CPF Nº 000.000.002-72, necessita de 1 ( um ) dia(s) de afastamento do trabalho a',
        'partir de 7 de outubro de 2026, por estar acompanhando PEDRO ROCHA para o',
        'fim de: CONSULTA MÉDICA.',
        'CID: Z76.3',
        '',
        'Unidade de Saúde: Unidade de Saúde Exemplo',
        'Data/Assinatura do profissional: 07/10/2026',
        'MEDICA FICTICIA DA SILVA',
        'Médico da estratégia de saúde da família',
        'Conselho: CRM - ES Nº 0000',
    ]:
        t.textLine(linha)
    c.drawText(t)
    c.setFont('Helvetica', 8)
    c.drawString(60, 90, 'Nota: Este atestado é válido para as finalidades previstas no Artigo 86 do RGPS, aprovado pelo Decreto nº 60.501,')
    c.drawString(60, 78, 'de 14 de março de 1967, e será expedido para justificativa de 1 a 15 dias de afastamento do trabalho.')
    c.save()


if __name__ == '__main__':
    for pasta in (SIM, FIX):
        foto_girada(os.path.join(pasta, 'atestado-girado.jpg'))
        acompanhante(os.path.join(pasta, 'atestado-acompanhante.pdf'))
    print('exemplos gerados')
