"""Company-scoped bank accounts and internal bookkeeping; no banking provider calls."""
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field, field_validator

Money=Decimal

class BankInput(BaseModel):
    name:str=Field(min_length=2,max_length=100)
    currency:Literal['EUR','XOF','USD']='EUR'
    opening_balance:Money=Field(default=Decimal('0'),ge=-1000000000,le=1000000000,max_digits=12,decimal_places=2)
    reserved:Money=Field(default=Decimal('0'),ge=0,le=1000000000,max_digits=12,decimal_places=2)

    @field_validator('name')
    @classmethod
    def nonempty(cls,value):
        value=' '.join(value.split())
        if len(value)<2:raise ValueError('Indiquez le nom de la banque.')
        return value

class BankEdit(BankInput):
    version:int=Field(ge=1)

class DebitInput(BaseModel):
    bank_id:int=Field(gt=0)
    label:str=Field(min_length=2,max_length=200)
    amount:Money=Field(gt=0,le=1000000000,max_digits=12,decimal_places=2)
    due:date
    operation_id:UUID|None=None

class TransferInput(BaseModel):
    source_id:int=Field(gt=0)
    target_id:int=Field(gt=0)
    amount:Money=Field(gt=0,le=1000000000,max_digits=12,decimal_places=2)
    operation_id:UUID
    confirmed:bool=False

class LogoInput(BaseModel):
    image:str=Field(min_length=30,max_length=1_500_000)

class Confirmation(BaseModel):
    confirmed:bool=False

class Assignment(Confirmation):
    bank_id:int=Field(gt=0)

def init_schema(db):
    with db() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS bank_accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER NOT NULL REFERENCES companies(id),
          name TEXT NOT NULL,currency TEXT NOT NULL,opening_minor INTEGER NOT NULL DEFAULT 0,
          reserved_minor INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,
          UNIQUE(company_id,name,currency));
        CREATE TABLE IF NOT EXISTS bank_debits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER NOT NULL REFERENCES companies(id),
          bank_id INTEGER NOT NULL REFERENCES bank_accounts(id),label TEXT NOT NULL,amount_minor INTEGER NOT NULL,
          due TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',movement_id INTEGER);
        CREATE TABLE IF NOT EXISTS bank_transfers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER NOT NULL REFERENCES companies(id),
          source_id INTEGER NOT NULL,target_id INTEGER NOT NULL,amount_minor INTEGER NOT NULL,
          currency TEXT NOT NULL,operation_id TEXT NOT NULL,created TEXT NOT NULL,
          UNIQUE(company_id,operation_id));
        CREATE INDEX IF NOT EXISTS idx_bank_company ON bank_accounts(company_id,id);
        CREATE INDEX IF NOT EXISTS idx_bank_debits ON bank_debits(company_id,bank_id,status,due);
        ''')
        columns={r['name'] for r in con.execute('PRAGMA table_info(cash_movements)')}
        if 'bank_id' not in columns:con.execute('ALTER TABLE cash_movements ADD COLUMN bank_id INTEGER REFERENCES bank_accounts(id)')
        if 'transfer_id' not in columns:con.execute('ALTER TABLE cash_movements ADD COLUMN transfer_id INTEGER REFERENCES bank_transfers(id)')
        debit_columns={r['name'] for r in con.execute('PRAGMA table_info(bank_debits)')}
        bank_columns={r['name'] for r in con.execute('PRAGMA table_info(bank_accounts)')}
        if 'logo' not in bank_columns:con.execute('ALTER TABLE bank_accounts ADD COLUMN logo TEXT')
        if 'operation_id' not in debit_columns:con.execute('ALTER TABLE bank_debits ADD COLUMN operation_id TEXT')
        con.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_debit_operation ON bank_debits(company_id,operation_id)')

def clean_logo(data_url):
    # Accept only raster images uploaded by the user; re-encode server-side so nothing but pixels is stored.
    import base64,binascii,io
    from PIL import Image,UnidentifiedImageError
    prefix,_,payload=data_url.partition(',')
    if prefix not in ('data:image/png;base64','data:image/jpeg;base64','data:image/webp;base64'):raise HTTPException(422,'Choisissez une image PNG, JPEG ou WebP.')
    try:raw=base64.b64decode(payload,validate=True)
    except (binascii.Error,ValueError):raise HTTPException(422,'Image illisible.')
    if len(raw)>1_000_000:raise HTTPException(413,'Image trop lourde (1 Mo maximum).')
    try:
        image=Image.open(io.BytesIO(raw));image.load()
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError):raise HTTPException(422,'Image illisible.')
    if image.width*image.height>40_000_000:raise HTTPException(422,'Image trop grande.')
    image=image.convert('RGBA');side=min(image.size)
    left,top=(image.width-side)//2,(image.height-side)//2
    image=image.crop((left,top,left+side,top+side)).resize((128,128),Image.LANCZOS)
    out=io.BytesIO();image.save(out,format='PNG',optimize=True)
    return 'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode()

def bank_for(con,cid,bid):
    row=con.execute('SELECT * FROM bank_accounts WHERE company_id=? AND id=?',(cid,bid)).fetchone()
    if not row:raise HTTPException(404,'Banque introuvable dans cette entreprise.')
    return dict(row)

def snapshot(con,cid):
    limit=(datetime.now(ZoneInfo('Europe/Paris')).date()+timedelta(days=7)).isoformat()
    banks=[dict(r) for r in con.execute('SELECT * FROM bank_accounts WHERE company_id=? ORDER BY name,id',(cid,))]
    movement_totals={r['bank_id']:r['balance'] for r in con.execute("SELECT bank_id,SUM(CASE WHEN direction='in' THEN amount_minor ELSE -amount_minor END) AS balance FROM cash_movements WHERE company_id=? AND bank_id IS NOT NULL GROUP BY bank_id",(cid,))}
    debits=[dict(r) for r in con.execute("SELECT d.*,b.name AS bank_name,b.currency FROM bank_debits d JOIN bank_accounts b ON b.id=d.bank_id AND b.company_id=d.company_id WHERE d.company_id=? AND d.status='pending' ORDER BY d.due,d.id",(cid,))]
    totals={}
    for bank in banks:
        bank['balance_minor']=bank['opening_minor']+movement_totals.get(bank['id'],0)
        planned=[d for d in debits if d['bank_id']==bank['id'] and d['due']<=limit]
        bank['upcoming_minor']=sum(d['amount_minor'] for d in planned)
        bank['unavailable_minor']=bank['reserved_minor']+bank['upcoming_minor']
        bank['available_minor']=bank['balance_minor']-bank['unavailable_minor']
        bank['shortfall_minor']=max(0,-bank['available_minor'])
        bank['next_due']=planned[0]['due'] if planned else None
        totals[bank['currency']]=totals.get(bank['currency'],0)+bank['opening_minor']
    flows=list(con.execute("SELECT currency,SUM(CASE WHEN direction='in' THEN amount_minor ELSE -amount_minor END) AS balance,SUM(CASE WHEN direction='in' AND transfer_id IS NULL THEN amount_minor ELSE 0 END) AS incoming,SUM(CASE WHEN direction='out' AND transfer_id IS NULL THEN amount_minor ELSE 0 END) AS outgoing FROM cash_movements WHERE company_id=? GROUP BY currency",(cid,)))
    for row in flows:totals[row['currency']]=totals.get(row['currency'],0)+row['balance']
    unassigned={r['currency']:r['balance'] for r in con.execute("SELECT currency,SUM(CASE WHEN direction='in' THEN amount_minor ELSE -amount_minor END) AS balance FROM cash_movements WHERE company_id=? AND bank_id IS NULL GROUP BY currency",(cid,))}
    # Current-month external flows (internal transfers excluded), per bank and per currency, for the home card.
    month=datetime.now(ZoneInfo('Europe/Paris')).date().isoformat()[:7]
    month_rows=list(con.execute("SELECT bank_id,currency,SUM(CASE WHEN direction='in' THEN amount_minor ELSE 0 END) AS incoming,SUM(CASE WHEN direction='out' THEN amount_minor ELSE 0 END) AS outgoing FROM cash_movements WHERE company_id=? AND transfer_id IS NULL AND substr(date,1,7)=? GROUP BY bank_id,currency",(cid,month)))
    month_in,month_out={},{}
    for row in month_rows:
        month_in[row['currency']]=month_in.get(row['currency'],0)+row['incoming']
        month_out[row['currency']]=month_out.get(row['currency'],0)+row['outgoing']
    for bank in banks:
        own=[r for r in month_rows if r['bank_id']==bank['id']]
        bank['month_inflows_minor']=sum(r['incoming'] for r in own)
        bank['month_outflows_minor']=sum(r['outgoing'] for r in own)
        bank['latest']=[dict(r) for r in con.execute('SELECT id,label,direction,amount_minor,currency,date,transfer_id FROM cash_movements WHERE company_id=? AND bank_id=? ORDER BY date DESC,id DESC LIMIT 5',(cid,bank['id']))]
    return {'banks':banks,'debits':debits,'unassigned_minor':unassigned,'balances_minor':totals,
            'inflows_minor':{r['currency']:r['incoming'] for r in flows},'outflows_minor':{r['currency']:r['outgoing'] for r in flows},
            'month':month,'month_inflows_minor':month_in,'month_outflows_minor':month_out,
            'bank_connected':False,'label':'Solde interne'}

def install(app,db,require,own_company,utcnow):
    def scope(req,cid,write=False):
        require(req,tenant_id=cid,write=write)
        with db() as con:own_company(con,cid)

    @app.get('/api/companies/{cid}/banks')
    def banks(cid:int,req:Request):
        scope(req,cid)
        with db() as con:return snapshot(con,cid)

    # Trial banks (user request 22/10): one tap fills the treasury with clearly named fictitious banks
    # (« Essai · … ») and movements of the month, to see how the dial behaves; another tap removes them all.
    # Logos can then be uploaded on them like on any bank. Nothing outside these trial rows is touched.
    TRIAL='Essai · '
    @app.post('/api/companies/{cid}/trial-treasury',status_code=201)
    def add_trial(cid:int,req:Request):
        scope(req,cid,True)
        today=datetime.now(ZoneInfo('Europe/Paris')).date();first=today.replace(day=1)
        day=lambda n:min(today,first+timedelta(days=n)).isoformat()
        banks=[('Banque Nord',1850000,0),('Banque Sud',640000,150000),('Néo Pro',-120000,0)]
        moves={0:[('Facture client Dupont','in',420000,2),('Loyer atelier','out',180000,4),('Acompte chantier Moreau','in',950000,9)],
               1:[('Achat matériaux','out',260000,3),('Paiement client Lefèvre','in',310000,7)],
               2:[('Abonnement logiciels','out',8900,1),('Carburant','out',21000,6)]}
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            if con.execute('SELECT 1 FROM bank_accounts WHERE company_id=? AND name LIKE ?',(cid,TRIAL+'%')).fetchone():
                raise HTTPException(409,'Les banques d’essai sont déjà là.')
            ids=[]
            for name,opening,reserved in banks:
                ids.append(con.execute('INSERT INTO bank_accounts(company_id,name,currency,opening_minor,reserved_minor) VALUES (?,?,?,?,?)',(cid,TRIAL+name,'EUR',opening,reserved)).lastrowid)
            for i,rows in moves.items():
                for label,direction,amount,n in rows:
                    con.execute('INSERT INTO cash_movements(company_id,bank_id,label,direction,amount_minor,currency,date,created) VALUES (?,?,?,?,?,?,?,?)',(cid,ids[i],TRIAL+label,direction,amount,'EUR',day(n),utcnow()))
            con.execute('INSERT INTO bank_debits(company_id,bank_id,label,amount_minor,due) VALUES (?,?,?,?,?)',(cid,ids[1],TRIAL+'Prélèvement assurance',45000,(today+timedelta(days=5)).isoformat()))
            con.execute('INSERT INTO bank_debits(company_id,bank_id,label,amount_minor,due) VALUES (?,?,?,?,?)',(cid,ids[2],TRIAL+'Prélèvement leasing',62000,(today+timedelta(days=3)).isoformat()))
            con.execute('COMMIT')
        return {'ok':True,'banks':len(ids)}
    @app.delete('/api/companies/{cid}/trial-treasury')
    def remove_trial(cid:int,req:Request):
        scope(req,cid,True)
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            ids=[r['id'] for r in con.execute('SELECT id FROM bank_accounts WHERE company_id=? AND name LIKE ?',(cid,TRIAL+'%'))]
            if ids:
                q=','.join('?'*len(ids))
                con.execute(f'DELETE FROM cash_movements WHERE company_id=? AND bank_id IN ({q})',(cid,*ids))
                con.execute(f'DELETE FROM bank_debits WHERE company_id=? AND bank_id IN ({q})',(cid,*ids))
                con.execute(f'DELETE FROM bank_transfers WHERE company_id=? AND (source_id IN ({q}) OR target_id IN ({q}))',(cid,*ids,*ids))
                con.execute(f'DELETE FROM bank_accounts WHERE company_id=? AND id IN ({q})',(cid,*ids))
            con.execute('COMMIT')
        return {'ok':True,'removed':len(ids)}

    @app.post('/api/companies/{cid}/banks',status_code=201)
    def add_bank(cid:int,data:BankInput,req:Request):
        scope(req,cid,True)
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            if con.execute('SELECT 1 FROM bank_accounts WHERE company_id=? AND lower(name)=lower(?) AND currency=?',(cid,data.name,data.currency)).fetchone():raise HTTPException(409,'Cette banque existe déjà dans cette devise.')
            cur=con.execute('INSERT INTO bank_accounts(company_id,name,currency,opening_minor,reserved_minor) VALUES (?,?,?,?,?)',(cid,data.name,data.currency,int(data.opening_balance*100),int(data.reserved*100)))
            con.execute('COMMIT')
            return bank_for(con,cid,cur.lastrowid)

    @app.put('/api/companies/{cid}/banks/{bid}')
    def edit_bank(cid:int,bid:int,data:BankEdit,req:Request):
        scope(req,cid,True)
        with db() as con:
            con.execute('BEGIN IMMEDIATE');old=bank_for(con,cid,bid)
            if old['version']!=data.version:raise HTTPException(409,'Cette banque a changé. Rechargez ses informations.')
            if data.currency!=old['currency']:raise HTTPException(422,'La devise du compte ne peut pas être changée.')
            if con.execute('SELECT 1 FROM bank_accounts WHERE company_id=? AND lower(name)=lower(?) AND currency=? AND id!=?',(cid,data.name,data.currency,bid)).fetchone():raise HTTPException(409,'Ce nom existe déjà dans cette devise.')
            con.execute('UPDATE bank_accounts SET name=?,opening_minor=?,reserved_minor=?,version=version+1 WHERE company_id=? AND id=?',(data.name,int(data.opening_balance*100),int(data.reserved*100),cid,bid))
            con.execute('COMMIT')
            return bank_for(con,cid,bid)

    @app.put('/api/companies/{cid}/banks/{bid}/logo')
    def set_logo(cid:int,bid:int,data:LogoInput,req:Request):
        scope(req,cid,True);logo=clean_logo(data.image)
        with db() as con:
            con.execute('BEGIN IMMEDIATE');bank_for(con,cid,bid)
            con.execute('UPDATE bank_accounts SET logo=? WHERE company_id=? AND id=?',(logo,cid,bid))
            con.execute('COMMIT')
            return {'ok':True,'logo':logo}

    @app.delete('/api/companies/{cid}/banks/{bid}/logo')
    def remove_logo(cid:int,bid:int,req:Request):
        scope(req,cid,True)
        with db() as con:
            con.execute('BEGIN IMMEDIATE');bank_for(con,cid,bid)
            con.execute('UPDATE bank_accounts SET logo=NULL WHERE company_id=? AND id=?',(cid,bid))
            con.execute('COMMIT')
            return {'ok':True}

    @app.post('/api/companies/{cid}/bank-debits',status_code=201)
    def add_debit(cid:int,data:DebitInput,req:Request):
        scope(req,cid,True)
        if not data.label.strip():raise HTTPException(422,'Indiquez le motif du prélèvement.')
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            bank_for(con,cid,data.bank_id)
            operation=str(data.operation_id) if data.operation_id else None
            if operation:
                old=con.execute('SELECT * FROM bank_debits WHERE company_id=? AND operation_id=?',(cid,operation)).fetchone()
                if old:
                    if (old['bank_id'],old['label'],old['amount_minor'],old['due'])!=(data.bank_id,data.label.strip(),int(data.amount*100),data.due.isoformat()):raise HTTPException(409,'Ce prélèvement existe déjà avec un autre contenu.')
                    return dict(old)
            cur=con.execute('INSERT INTO bank_debits(company_id,bank_id,label,amount_minor,due,operation_id) VALUES (?,?,?,?,?,?)',(cid,data.bank_id,data.label.strip(),int(data.amount*100),data.due.isoformat(),operation))
            result=dict(con.execute('SELECT * FROM bank_debits WHERE company_id=? AND id=?',(cid,cur.lastrowid)).fetchone())
            con.execute('COMMIT')
            return result

    @app.post('/api/companies/{cid}/bank-debits/{did}/cancel')
    def cancel_debit(cid:int,did:int,data:Confirmation,req:Request):
        scope(req,cid,True)
        if not data.confirmed:raise HTTPException(422,'Confirmez l’annulation de cette prévision.')
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            d=con.execute('SELECT * FROM bank_debits WHERE company_id=? AND id=?',(cid,did)).fetchone()
            if not d:raise HTTPException(404,'Prélèvement introuvable.')
            if d['status']=='paid':raise HTTPException(409,'Ce débit est déjà effectué. Il ne peut plus être annulé comme prévision.')
            con.execute("UPDATE bank_debits SET status='cancelled' WHERE company_id=? AND id=?",(cid,did))
            con.execute('COMMIT')
            return {'ok':True}

    @app.post('/api/companies/{cid}/bank-debits/{did}/paid')
    def pay_debit(cid:int,did:int,data:Confirmation,req:Request):
        scope(req,cid,True)
        if not data.confirmed:raise HTTPException(422,'Confirmez que ce prélèvement a été effectué.')
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            d=con.execute('SELECT * FROM bank_debits WHERE company_id=? AND id=?',(cid,did)).fetchone()
            if not d:raise HTTPException(404,'Prélèvement introuvable.')
            if d['status']=='paid':return {'ok':True,'movement_id':d['movement_id']}
            if d['status']!='pending':raise HTTPException(409,'Cette prévision a été annulée.')
            bank=bank_for(con,cid,d['bank_id'])
            cur=con.execute('INSERT INTO cash_movements(company_id,bank_id,label,direction,amount_minor,currency,date,created) VALUES (?,?,?,?,?,?,?,?)',(cid,bank['id'],d['label'],'out',d['amount_minor'],bank['currency'],datetime.now(ZoneInfo('Europe/Paris')).date().isoformat(),utcnow()))
            con.execute("UPDATE bank_debits SET status='paid',movement_id=? WHERE company_id=? AND id=?",(cur.lastrowid,cid,did))
            con.execute('COMMIT')
            return {'ok':True,'movement_id':cur.lastrowid}

    @app.post('/api/companies/{cid}/bank-transfers',status_code=201)
    def transfer(cid:int,data:TransferInput,req:Request):
        scope(req,cid,True)
        if not data.confirmed:raise HTTPException(422,'Confirmez le transfert interne.')
        if data.source_id==data.target_id:raise HTTPException(422,'Choisissez deux banques différentes.')
        with db() as con:
            con.execute('BEGIN IMMEDIATE');amount=int(data.amount*100);operation=str(data.operation_id)
            old=con.execute('SELECT * FROM bank_transfers WHERE company_id=? AND operation_id=?',(cid,operation)).fetchone()
            if old:
                if (old['source_id'],old['target_id'],old['amount_minor'])!=(data.source_id,data.target_id,amount):raise HTTPException(409,'Cette opération existe déjà avec un autre contenu.')
                return dict(old)
            source=bank_for(con,cid,data.source_id);target=bank_for(con,cid,data.target_id)
            if source['currency']!=target['currency']:raise HTTPException(422,'Un transfert nécessite deux comptes dans la même devise.')
            available=next(b['available_minor'] for b in snapshot(con,cid)['banks'] if b['id']==source['id'])
            if amount>available:raise HTTPException(409,'Le disponible de la banque source ne suffit plus. Vérifiez ses prélèvements.')
            tid=con.execute('INSERT INTO bank_transfers(company_id,source_id,target_id,amount_minor,currency,operation_id,created) VALUES (?,?,?,?,?,?,?)',(cid,source['id'],target['id'],amount,source['currency'],operation,utcnow())).lastrowid
            for bank,direction,label in [(source,'out','Transfert vers '+target['name']),(target,'in','Transfert depuis '+source['name'])]:
                con.execute('INSERT INTO cash_movements(company_id,bank_id,transfer_id,label,direction,amount_minor,currency,date,created,operation_id) VALUES (?,?,?,?,?,?,?,?,?,?)',(cid,bank['id'],tid,label,direction,amount,bank['currency'],datetime.now(ZoneInfo('Europe/Paris')).date().isoformat(),utcnow(),'bank-transfer-'+operation+'-'+direction))
            result=dict(con.execute('SELECT * FROM bank_transfers WHERE company_id=? AND id=?',(cid,tid)).fetchone())
            con.execute('COMMIT')
            return result

    @app.put('/api/companies/{cid}/treasury/{mid}/bank')
    def assign_movement(cid:int,mid:int,data:Assignment,req:Request):
        scope(req,cid,True)
        if not data.confirmed:raise HTTPException(422,'Confirmez l’affectation à cette banque.')
        with db() as con:
            con.execute('BEGIN IMMEDIATE');bank=bank_for(con,cid,data.bank_id)
            row=con.execute('SELECT * FROM cash_movements WHERE company_id=? AND id=?',(cid,mid)).fetchone()
            if not row:raise HTTPException(404,'Mouvement introuvable.')
            if row['bank_id'] not in (None,data.bank_id):raise HTTPException(409,'Ce mouvement est déjà affecté à une autre banque.')
            if row['currency']!=bank['currency']:raise HTTPException(422,'La devise du mouvement ne correspond pas à la banque.')
            con.execute('UPDATE cash_movements SET bank_id=? WHERE company_id=? AND id=?',(data.bank_id,cid,mid))
            con.execute('COMMIT')
            return {'ok':True}
