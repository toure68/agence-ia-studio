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

KBIS_ROWS=[('Immatriculation au RCS, numéro','123 456 789 R.C.S. Paris'),('Dénomination ou raison sociale','INFONET'),('Forme juridique','Société par actions simplifiée'),('Capital social','10 000,00 EUROS'),('Adresse du siège','75 avenue des Champs-Élysées 75008 Paris'),('Nom, prénoms','JULIEN DUPÉ'),('Nom commercial','INFONET WEB GROUP'),('Activité(s) exercée(s)','PORTAILS INTERNET')]

def two_column_kbis_png():
    from PIL import Image,ImageDraw,ImageFont
    import reportlab
    image=Image.new('RGB',(2400,1050),'white');draw=ImageDraw.Draw(image)
    font=ImageFont.truetype(str(Path(reportlab.__file__).parent/'fonts'/'Vera.ttf'),34)
    draw.text((40,30),'EXTRAIT KBIS — EXEMPLE',fill='black',font=font)
    for i,(label,value) in enumerate(KBIS_ROWS):
        draw.text((40,140+i*100),label,fill='black',font=font)
        draw.text((850,140+i*100),value,fill='black',font=font)
    out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()

PASSPORT_MRZ='P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10'
IDENTITY_MRZ='I<UTOD231458907<<<<<<<<<<<<<<<\n7408122F1204159UTO<<<<<<<<<<<6\n'+'ERIKSSON<<ANNA<MARIA'.ljust(30,'<')

def identity_png(kind='passport'):
    from PIL import Image,ImageDraw,ImageFont
    import reportlab
    image=Image.new('RGB',(2400,1500),'white');draw=ImageDraw.Draw(image)
    font=ImageFont.truetype(str(Path(reportlab.__file__).parent/'fonts'/'Vera.ttf'),38)
    mono=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',42)
    # Synthetic specimen, with a portrait placeholder and multi-field/bilingual
    # rows rather than the simple "LABEL: VALUE" format of the old tests.
    draw.rectangle((40,160,440,850),outline='gray',width=4)
    draw.text((75,450),'EXEMPLE',fill='gray',font=font)
    rows=['PASSEPORT / PASSPORT' if kind=='passport' else 'CARTE NATIONALE D’IDENTITÉ',
      'Nom / Surname  ERIKSSON','Prénoms / Given names  ANNA MARIA',
      'Date de naissance / Date of birth  12/08/1974',
      'Sexe / Sex  F    Nationalité / Nationality  UTO',
      'Passport No.  L898902C3' if kind=='passport' else 'Document No.  D23145890',
      'Date of expiry  15/04/2012','Lieu de naissance / Place of birth  PARIS']
    draw.text((40,40),'DOCUMENT FICTIF — TEST',fill='black',font=font)
    for i,line in enumerate(rows):draw.text((500,170+i*90),line,fill='black',font=font)
    for i,line in enumerate((PASSPORT_MRZ if kind=='passport' else IDENTITY_MRZ).splitlines()):draw.text((40,1120+i*100),line,fill='black',font=mono)
    out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()

def typed_pdf(lines):
    from reportlab.pdfgen import canvas
    out=io.BytesIO();c=canvas.Canvas(out);c.setFont('Helvetica',12)
    for n,line in enumerate(lines):c.drawString(40,800-n*30,line)
    c.save();return out.getvalue()

if __name__=='__main__':
    Path('/tmp/ui-kbis.png').write_bytes(kbis_png())
    Path('/tmp/ui-quote.pdf').write_bytes(quote_pdf())
    Path('/tmp/ui-kbis-columns.png').write_bytes(two_column_kbis_png())
    Path('/tmp/ui-passport.png').write_bytes(identity_png())
    Path('/tmp/ui-identity.png').write_bytes(identity_png('identity'))
    Path('/tmp/ui-address.pdf').write_bytes(typed_pdf(['FACTURE ELECTRICITE - EXEMPLE','Adresse du fournisseur 10 rue Fournisseur 69001 Lyon','Titulaire du contrat ALICE MARTIN','Adresse de consommation 12 rue du Test','75001 Paris']))
