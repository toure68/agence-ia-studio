"""Internal quotations, amounts calculated on the server in minor currency units."""
import io
import json
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
import re
from typing import Literal, Optional
from xml.sax.saxutils import escape

from fastapi import HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from display_formats import person_name
from signature_routes import content_hash,signature_for,init_schema as init_signature_schema,install as install_signatures


class QuoteLine(BaseModel):
    description: str = Field(min_length=2, max_length=300)
    quantity: Decimal = Field(gt=0, le=1000000, max_digits=12, decimal_places=3)
    unit_price: Decimal = Field(ge=0, le=100000000, max_digits=11, decimal_places=2)


class Quotation(BaseModel):
    customer_name: str = Field(min_length=2, max_length=150)
    customer_email: str = Field(default='', max_length=200)
    customer_address: str = Field(default='', max_length=600)
    title: str = Field(min_length=2, max_length=200)
    currency: Literal['EUR', 'XOF', 'USD'] = 'EUR'
    vat_rate: Decimal = Field(default=Decimal('0'), ge=0, le=100, max_digits=5, decimal_places=2)
    valid_until: Optional[date] = None
    status: Literal['draft', 'sent', 'accepted', 'declined'] = 'draft'
    notes: str = Field(default='', max_length=3000)
    lines: list[QuoteLine] = Field(min_length=1, max_length=30)

    @field_validator('customer_name','title')
    @classmethod
    def nonempty(cls,value,info):
        if len(value.strip())<2:raise ValueError('Champ obligatoire')
        return person_name(value) if info.field_name=='customer_name' else value.strip()

    @field_validator('customer_email')
    @classmethod
    def email(cls,value):
        value=value.strip()
        if value and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',value):raise ValueError('Email invalide')
        return value


def minor(value):
    return int((value*100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def calculate(data):
    lines = [{**line.model_dump(mode='json'), 'total_minor':minor(line.quantity*line.unit_price)} for line in data.lines]
    subtotal = sum(line['total_minor'] for line in lines)
    tax = int((Decimal(subtotal)*data.vat_rate/100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    return lines, subtotal, tax


def init_schema(db):
    with db() as con:
        con.execute('''CREATE TABLE IF NOT EXISTS quotations (
          id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id),
          reference TEXT NOT NULL UNIQUE, issuer TEXT NOT NULL, payload TEXT NOT NULL,
          subtotal_minor INTEGER NOT NULL, tax_minor INTEGER NOT NULL, total_minor INTEGER NOT NULL,
          status TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL)''')
        con.execute('CREATE INDEX IF NOT EXISTS idx_quotations_company ON quotations(company_id,id)')
        init_signature_schema(con)


def install(app, db, require, own_company, utcnow, secret=None):
    def unpack(row):
        r = dict(row)
        r['issuer'] = json.loads(r['issuer'])
        r['data'] = json.loads(r.pop('payload'))
        return r

    def get(con, cid, qid):
        row = con.execute('SELECT * FROM quotations WHERE company_id=? AND id=?', (cid,qid)).fetchone()
        if not row:
            raise HTTPException(404, 'Devis introuvable')
        q=unpack(row);q['content_hash']=content_hash(q);q['signature']=signature_for(con,cid,qid,secret)
        if q['signature'] and q['signature']['content_hash']!=q['content_hash']:raise HTTPException(409,'Le contenu du devis signé ne correspond plus à sa version enregistrée.')
        return q

    @app.get('/api/companies/{cid}/quotations')
    def quotations(cid:int, req:Request):
        require(req, tenant_id=cid)
        with db() as con:
            own_company(con,cid)
            return [unpack(r) for r in con.execute('SELECT * FROM quotations WHERE company_id=? ORDER BY id DESC',(cid,))]

    @app.get('/api/companies/{cid}/quotations/{qid}')
    def quotation(cid:int,qid:int,req:Request):
        require(req,tenant_id=cid)
        with db() as con:
            return get(con,cid,qid)

    @app.post('/api/companies/{cid}/quotations',status_code=201)
    def create(cid:int,data:Quotation,req:Request):
        require(req,tenant_id=cid,write=True)
        lines,subtotal,tax=calculate(data)
        payload=data.model_dump(mode='json');payload['lines']=lines
        with db() as con:
            issuer=dict(own_company(con,cid))
            issuer={k:issuer.get(k,'') for k in ('name','city','phone','email')}
            if secret:
                from document_routes import issuer_details
                issuer.update(issuer_details(db,cid,secret))
            now=utcnow()
            cur=con.execute('INSERT INTO quotations(company_id,reference,issuer,payload,subtotal_minor,tax_minor,total_minor,status,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?)',
              (cid,'pending-'+__import__('secrets').token_hex(16),json.dumps(issuer),json.dumps(payload),subtotal,tax,subtotal+tax,data.status,now,now))
            qid=cur.lastrowid
            con.execute('UPDATE quotations SET reference=? WHERE id=?',(f'DEV-{datetime.now().year}-{qid:05}',qid))
            return get(con,cid,qid)

    @app.put('/api/companies/{cid}/quotations/{qid}')
    def edit(cid:int,qid:int,data:Quotation,req:Request):
        require(req,tenant_id=cid,write=True)
        lines,subtotal,tax=calculate(data)
        payload=data.model_dump(mode='json');payload['lines']=lines
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            if get(con,cid,qid)['signature']:raise HTTPException(409,'Ce devis signé est conservé sans modification. Créez un nouveau devis pour le corriger.')
            con.execute('UPDATE quotations SET payload=?,subtotal_minor=?,tax_minor=?,total_minor=?,status=?,updated=? WHERE company_id=? AND id=?',
              (json.dumps(payload),subtotal,tax,subtotal+tax,data.status,utcnow(),cid,qid))
            con.execute('COMMIT')
            return get(con,cid,qid)

    @app.get('/api/companies/{cid}/quotations/{qid}/pdf')
    def pdf(cid:int,qid:int,req:Request,preview:bool=False):
        require(req,tenant_id=cid)
        with db() as con:
            q=get(con,cid,qid)
            signature=signature_for(con,cid,qid,secret,paths=True)
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,KeepTogether
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from pathlib import Path
        import reportlab
        fonts=Path(reportlab.__file__).parent/'fonts'
        for name,file in [('Studio','Vera.ttf'),('StudioBold','VeraBd.ttf'),('StudioItalic','VeraIt.ttf')]:
            if name not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont(name,str(fonts/file)))
        pdfmetrics.registerFontFamily('Studio',normal='Studio',bold='StudioBold',italic='StudioItalic',boldItalic='StudioBold')
        output=io.BytesIO();styles=getSampleStyleSheet();story=[];d=q['data'];issuer=q['issuer']
        for name in styles.byName:
            style=styles[name]
            style.fontName='StudioBold' if name in ('Title','Heading1','Heading2') else 'StudioItalic' if name=='Heading3' else 'Studio'
        styles['Normal'].fontSize=9
        styles['Normal'].leading=13
        def para(text,style='Normal'):
            return Paragraph(escape(str(text)).replace('\n','<br/>'),styles[style])
        def amount(value):
            return f'{value/100:,.2f} {d["currency"]}'.replace(',',' ')
        story += [para(issuer['name'],'Title'),para(' · '.join(x for x in (issuer['city'],issuer['email'],issuer['phone']) if x))]
        for key in ('legal_name','address','siret'):
            if issuer.get(key):story.append(para(('SIRET : ' if key=='siret' else '')+issuer[key]))
        story += [Spacer(1,24),para(q['reference'],'Heading1'),para(d['title'],'Heading2'),para('Date : '+q['created'][:10])]
        if d['valid_until']:story.append(para('Valable jusqu’au : '+d['valid_until']))
        story += [Spacer(1,18),para(d['customer_name'],'Heading3'),para(d['customer_address']),para(d['customer_email']),Spacer(1,20)]
        rows=[[para('Désignation'),para('Quantité'),para('Prix unitaire'),para('Total HT')]]
        for line in d['lines']:
            rows.append([para(line['description']),para(line['quantity']),para(amount(minor(Decimal(line['unit_price'])))),para(amount(line['total_minor']))])
        table=Table(rows,colWidths=[235,55,105,105],repeatRows=1,hAlign='LEFT')
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#eaf3e5')),('VALIGN',(0,0),(-1,-1),'TOP'),('BOTTOMPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),10),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#d3e2d3'))]))
        story += [table,Spacer(1,20),para('Total HT : '+amount(q['subtotal_minor'])),para('TVA ('+str(d['vat_rate'])+' %) : '+amount(q['tax_minor'])),para('Total TTC : '+amount(q['total_minor']),'Heading2')]
        if d['notes']:story += [Spacer(1,18),para(d['notes'])]
        if signature:
            from reportlab.graphics.shapes import Drawing,PolyLine
            from zoneinfo import ZoneInfo
            drawing=Drawing(240,80)
            for stroke in signature['strokes']:
                points=[coordinate for p in stroke for coordinate in (p['x']*240,(1-p['y'])*80)]
                drawing.add(PolyLine(points,strokeColor=colors.HexColor('#183d31'),strokeWidth=1.5,fillColor=None))
            signed=datetime.fromisoformat(signature['signed_at']).astimezone(ZoneInfo('Europe/Paris')).strftime('%d/%m/%Y à %H:%M')
            story.append(KeepTogether([Spacer(1,20),para('Bon pour accord — signature recueillie','Heading3'),drawing,para(signature['signer_name']+' · '+signed),para(signature['consent'])]))
        SimpleDocTemplate(output,pagesize=A4,leftMargin=42,rightMargin=42,topMargin=42,bottomMargin=42,title=q['reference']).build(story)
        disposition='inline' if preview else 'attachment'
        return Response(output.getvalue(),media_type='application/pdf',headers={'Content-Disposition':f'{disposition}; filename="{q["reference"]}.pdf"','Cache-Control':'no-store'})

    install_signatures(app,db,require,get,utcnow,secret)

