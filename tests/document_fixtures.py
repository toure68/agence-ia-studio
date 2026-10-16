"""Synthetic documents, never real customer or bank records."""
import io
from pathlib import Path

def kbis_png():
    from PIL import Image,ImageDraw,ImageFont
    import reportlab
    image=Image.new('RGB',(1800,600),'white');draw=ImageDraw.Draw(image)
    font=ImageFont.truetype(str(Path(reportlab.__file__).parent/'fonts'/'Vera.ttf'),36)
    lines=['RAISON SOCIALE: TEST SERVICES','SIRET: 73282932000074','IBAN: FR1420041010050500013M02606','ADRESSE: 1 RUE DU TEST PARIS']
    for i,line in enumerate(lines):draw.text((35,45+i*95),line,fill='black',font=font)
    out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()

def quote_pdf(pages=1):
    from reportlab.pdfgen import canvas
    out=io.BytesIO();c=canvas.Canvas(out)
    for i in range(pages):
        c.setFont('Helvetica',14)
        for n,line in enumerate(['RAISON SOCIALE: TEST SERVICES','SIRET: 73282932000074','Entretien bureaux : 25,50 EUR / heure','TOTAL : 255,00 EUR']):c.drawString(40,780-n*35,line)
        c.showPage()
    c.save();return out.getvalue()

if __name__=='__main__':
    Path('/tmp/ui-kbis.png').write_bytes(kbis_png())
    Path('/tmp/ui-quote.pdf').write_bytes(quote_pdf())
