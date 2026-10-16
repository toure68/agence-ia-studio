"""Zero-UI dashboard, internal cashbook and factual operational reminders."""
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal, Optional
from zoneinfo import ZoneInfo
import json
import hashlib
from uuid import UUID

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from conformity import matrix
from priority_routes import next_occurrence

# The next delivery remains unavailable until the user validates step 2.
OPERATIONS_ENABLED = False


class Movement(BaseModel):
    label:str=Field(min_length=2,max_length=200)
    direction:Literal['in','out']
    amount:Decimal=Field(gt=0,le=1000000000,max_digits=12,decimal_places=2)
    currency:Literal['EUR','XOF','USD']='EUR'
    date:date
    operation_id:Optional[UUID]=None

    @field_validator('label')
    @classmethod
    def meaningful_label(cls, value):
        value=value.strip()
        if len(value)<2:raise ValueError('Précisez le libellé du mouvement.')
        return value


class Asset(BaseModel):
    name:str=Field(min_length=2,max_length=150)
    quantity:int=Field(ge=0,le=100000)
    condition:Literal['ready','worn','broken']='ready'
    maintenance_due:Optional[date]=None


class Obligation(BaseModel):
    title:str=Field(min_length=2,max_length=200)
    kind:Literal['vehicle','epi','consumable','insurance','qualification','other']
    due:date
    responsible:str=Field(default='',max_length=120)
    completed:bool=False


class Need(BaseModel):
    name:str=Field(min_length=2,max_length=150)
    quantity:int=Field(gt=0,le=100000)


class Needs(BaseModel):
    items:list[Need]=Field(max_length=50)


def today():return datetime.now(ZoneInfo('Europe/Paris')).date()


def init_schema(db):
    with db() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS cash_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER NOT NULL REFERENCES companies(id),
          label TEXT NOT NULL,direction TEXT NOT NULL,amount_minor INTEGER NOT NULL,currency TEXT NOT NULL,
          date TEXT NOT NULL,checked INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL,operation_id TEXT);
        CREATE TABLE IF NOT EXISTS equipment (
          id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER NOT NULL REFERENCES companies(id),
          name TEXT NOT NULL,quantity INTEGER NOT NULL,condition TEXT NOT NULL,maintenance_due TEXT,updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS work_needs (
          work_id INTEGER PRIMARY KEY REFERENCES work_items(id),company_id INTEGER NOT NULL REFERENCES companies(id),
          items TEXT NOT NULL,updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS risk_obligations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER NOT NULL REFERENCES companies(id),
          title TEXT NOT NULL,kind TEXT NOT NULL,due TEXT NOT NULL,responsible TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,updated TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_cash_company ON cash_movements(company_id,id);
        CREATE INDEX IF NOT EXISTS idx_risk_company ON risk_obligations(company_id,due);
        ''')
        columns={r['name'] for r in con.execute('PRAGMA table_info(cash_movements)')}
        if 'operation_id' not in columns:con.execute('ALTER TABLE cash_movements ADD COLUMN operation_id TEXT')
        con.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_operation ON cash_movements(company_id,operation_id)')


def material_check(con,cid,wid):
    w=con.execute('SELECT id FROM work_items WHERE id=? AND company_id=?',(wid,cid)).fetchone()
    if not w:raise HTTPException(404,'Activité introuvable')
    row=con.execute('SELECT items FROM work_needs WHERE work_id=? AND company_id=?',(wid,cid)).fetchone()
    needs=json.loads(row['items']) if row else []
    assets=[dict(r) for r in con.execute('SELECT * FROM equipment WHERE company_id=?',(cid,))]
    alerts=[]
    for need in needs:
        matching=[a for a in assets if a['name'].strip().casefold()==need['name'].strip().casefold()]
        available=sum(a['quantity'] for a in matching if a['condition']=='ready' and (not a['maintenance_due'] or a['maintenance_due']>=today().isoformat()))
        if available<need['quantity']:
            alerts.append({'name':need['name'],'required':need['quantity'],'available':available,'missing':need['quantity']-available})
    return {'requirements_configured':bool(row),'items':needs,'alerts':alerts,'ready':bool(row) and not alerts}


def risk_cards(con,cid):
    if not OPERATIONS_ENABLED:return []
    result=[];limit=(today()+timedelta(days=30)).isoformat()
    for r in con.execute('SELECT * FROM risk_obligations WHERE company_id=? AND completed=0 AND due<=? ORDER BY due,id',(cid,limit)):
        result.append({'key':f"risk-{r['id']}-{r['updated']}",'kind':'calendar','title':r['title'],
          'description':f"Échéance : {r['due']}"+(' · '+r['responsible'] if r['responsible'] else ''),
          'action':{'type':'risk','id':r['id']},'action_label':'Contrôler et valider','rank':0 if r['due']<=today().isoformat() else 3,'due':r['due']})
    for r in con.execute('SELECT * FROM equipment WHERE company_id=? AND maintenance_due<=? ORDER BY maintenance_due,id',(cid,limit)):
        result.append({'key':f"equipment-{r['id']}-{r['updated']}",'kind':'calendar','title':'Réviser : '+r['name'],
          'description':'Révision prévue : '+r['maintenance_due'],'action':{'type':'equipment','id':r['id']},'action_label':'Vérifier le matériel',
          'rank':0 if r['maintenance_due']<=today().isoformat() else 3,'due':r['maintenance_due']})
    for r in con.execute("SELECT id,title FROM work_items WHERE company_id=? AND status IN ('todo','doing','waiting')",(cid,)):
        check=material_check(con,cid,r['id'])
        if check['alerts']:
            result.append({'key':f"material-{r['id']}",'kind':'urgent','title':'Matériel manquant : '+r['title'],
              'description':', '.join(f"{x['name']} : {x['missing']} manquant(s)" for x in check['alerts']),
              'action':{'type':'material','id':r['id']},'action_label':'Vérifier le chantier','rank':1,'due':None})
    for card in result:
        card['key']=hashlib.sha256((str(cid)+':'+card['key']+':'+card['description']).encode()).hexdigest()
    return result


def install(app,db,require,own_company,utcnow):
    def scope(req,cid,write=False):
        user=require(req,tenant_id=cid,write=write)
        if not OPERATIONS_ENABLED and any(part in req.url.path.split('/') for part in ('equipment','risks','material','conformity')):
            raise HTTPException(404,'Fonction prévue pour une prochaine étape.')
        with db() as con:own_company(con,cid)
        return user
    def scoped_row(con,table,cid,rid):
        row=con.execute(f'SELECT * FROM {table} WHERE company_id=? AND id=?',(cid,rid)).fetchone()
        if not row:raise HTTPException(404,'Enregistrement introuvable')
        return dict(row)

    @app.get('/api/companies/{cid}/cockpit')
    def dashboard(cid:int,req:Request):
        user=scope(req,cid)
        with db() as con:
            incoming=con.execute("SELECT COUNT(*) FROM leads WHERE company_id=? AND status IN ('Nouveau','À rappeler')",(cid,)).fetchone()[0]
            quotes=con.execute("SELECT COUNT(*) FROM quotations WHERE company_id=? AND status='draft'",(cid,)).fetchone()[0]
            mails=con.execute("SELECT COUNT(*) FROM mail_messages WHERE company_id=? AND user_id=? AND send_status='draft'",(cid,user['id'])).fetchone()[0]
            prospect=con.execute("SELECT COUNT(*) FROM prospects WHERE stage IN ('Réponse reçue','Intéressé','Accord de principe')").fetchone()[0] if user['role']=='owner' else 0
            agenda=0
            for task in con.execute('SELECT * FROM calendar_tasks WHERE company_id=?',(cid,)):
                done={r['occurrence'] for r in con.execute('SELECT occurrence FROM task_completions WHERE task_id=?',(task['id'],))}
                due=next_occurrence(dict(task),done)
                agenda+=bool(due and due<=today()+timedelta(days=7))
            risks=risk_cards(con,cid)
            pending=con.execute('SELECT COUNT(*) FROM cash_movements WHERE company_id=? AND checked=0',(cid,)).fetchone()[0]
        return {'badges':{'requests':incoming+quotes+mails,'prospects':prospect,'calendar':agenda+len(risks),'treasury':pending},'risk_cards':risks}

    @app.get('/api/companies/{cid}/conformity')
    def conformity(cid:int,req:Request):
        scope(req,cid)
        result=matrix()
        import os
        result['connections']={'gmail':all(os.environ.get(k) for k in ('GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REDIRECT_URI')),
          'ai':bool(os.environ.get('OPENAI_API_KEY')),'social':False,'qualified_signature':False}
        result['evidence_url']='https://github.com/toure68/agence-ia-studio/actions'
        return result

    @app.get('/api/companies/{cid}/treasury')
    def cashbook(cid:int,req:Request):
        scope(req,cid)
        with db() as con:
            rows=[dict(r) for r in con.execute('SELECT * FROM cash_movements WHERE company_id=? ORDER BY date DESC,id DESC',(cid,))]
        totals={}
        for r in rows:totals[r['currency']]=totals.get(r['currency'],0)+(r['amount_minor'] if r['direction']=='in' else -r['amount_minor'])
        return {'movements':rows,'balances_minor':totals,'bank_connected':False}

    @app.post('/api/companies/{cid}/treasury',status_code=201)
    def add_movement(cid:int,data:Movement,req:Request):
        scope(req,cid,True)
        with db() as con:
            operation_id=str(data.operation_id) if data.operation_id else None
            if operation_id:
                old=con.execute('SELECT * FROM cash_movements WHERE company_id=? AND operation_id=?',(cid,operation_id)).fetchone()
                if old:
                    if (old['label'],old['direction'],old['amount_minor'],old['currency'],old['date'])!=(data.label,data.direction,int(data.amount*100),data.currency,data.date.isoformat()):raise HTTPException(409,'Cette opération a déjà été enregistrée avec un autre contenu.')
                    return dict(old)
            cur=con.execute('INSERT OR IGNORE INTO cash_movements(company_id,label,direction,amount_minor,currency,date,created,operation_id) VALUES (?,?,?,?,?,?,?,?)',
              (cid,data.label,data.direction,int(data.amount*100),data.currency,data.date.isoformat(),utcnow(),operation_id))
            if cur.rowcount==0:
                old=con.execute('SELECT * FROM cash_movements WHERE company_id=? AND operation_id=?',(cid,operation_id)).fetchone()
                if not old or (old['label'],old['direction'],old['amount_minor'],old['currency'],old['date'])!=(data.label,data.direction,int(data.amount*100),data.currency,data.date.isoformat()):raise HTTPException(409,'Opération déjà enregistrée avec un autre contenu.')
                return dict(old)
            return scoped_row(con,'cash_movements',cid,cur.lastrowid)

    @app.post('/api/companies/{cid}/treasury/{mid}/check')
    def check_movement(cid:int,mid:int,req:Request):
        scope(req,cid,True)
        with db() as con:
            scoped_row(con,'cash_movements',cid,mid)
            con.execute('UPDATE cash_movements SET checked=1 WHERE id=? AND company_id=?',(mid,cid))
        return {'ok':True}

    @app.get('/api/companies/{cid}/equipment')
    def equipment(cid:int,req:Request):
        scope(req,cid)
        with db() as con:return [dict(r) for r in con.execute('SELECT * FROM equipment WHERE company_id=? ORDER BY name,id',(cid,))]

    @app.post('/api/companies/{cid}/equipment',status_code=201)
    def add_equipment(cid:int,data:Asset,req:Request):
        scope(req,cid,True)
        with db() as con:
            cur=con.execute('INSERT INTO equipment(company_id,name,quantity,condition,maintenance_due,updated) VALUES (?,?,?,?,?,?)',
              (cid,data.name.strip(),data.quantity,data.condition,data.maintenance_due.isoformat() if data.maintenance_due else None,utcnow()))
            return scoped_row(con,'equipment',cid,cur.lastrowid)

    @app.put('/api/companies/{cid}/equipment/{eid}')
    def edit_equipment(cid:int,eid:int,data:Asset,req:Request):
        scope(req,cid,True)
        with db() as con:
            scoped_row(con,'equipment',cid,eid)
            con.execute('UPDATE equipment SET name=?,quantity=?,condition=?,maintenance_due=?,updated=? WHERE id=? AND company_id=?',
              (data.name.strip(),data.quantity,data.condition,data.maintenance_due.isoformat() if data.maintenance_due else None,utcnow(),eid,cid))
            return scoped_row(con,'equipment',cid,eid)

    @app.get('/api/companies/{cid}/activities/{wid}/material')
    def material(cid:int,wid:int,req:Request):
        scope(req,cid)
        with db() as con:return material_check(con,cid,wid)

    @app.put('/api/companies/{cid}/activities/{wid}/material')
    def set_material(cid:int,wid:int,data:Needs,req:Request):
        scope(req,cid,True)
        normalized={}
        for item in data.items:
            key=item.name.strip().casefold()
            if not key:raise HTTPException(422,'Nom du matériel obligatoire')
            if key not in normalized:normalized[key]={'name':item.name.strip(),'quantity':0}
            normalized[key]['quantity']+=item.quantity
        with db() as con:
            material_check(con,cid,wid)
            con.execute('INSERT INTO work_needs VALUES (?,?,?,?) ON CONFLICT(work_id) DO UPDATE SET items=excluded.items,updated=excluded.updated',
              (wid,cid,json.dumps(list(normalized.values())),utcnow()))
            return material_check(con,cid,wid)

    @app.get('/api/companies/{cid}/risks')
    def risks(cid:int,req:Request):
        scope(req,cid)
        with db() as con:return [dict(r) for r in con.execute('SELECT * FROM risk_obligations WHERE company_id=? ORDER BY completed,due,id',(cid,))]

    @app.post('/api/companies/{cid}/risks',status_code=201)
    def add_risk(cid:int,data:Obligation,req:Request):
        scope(req,cid,True)
        with db() as con:
            cur=con.execute('INSERT INTO risk_obligations(company_id,title,kind,due,responsible,completed,updated) VALUES (?,?,?,?,?,?,?)',
              (cid,data.title,data.kind,data.due.isoformat(),data.responsible,int(data.completed),utcnow()))
            return scoped_row(con,'risk_obligations',cid,cur.lastrowid)

    @app.put('/api/companies/{cid}/risks/{rid}')
    def edit_risk(cid:int,rid:int,data:Obligation,req:Request):
        scope(req,cid,True)
        with db() as con:
            scoped_row(con,'risk_obligations',cid,rid)
            con.execute('UPDATE risk_obligations SET title=?,kind=?,due=?,responsible=?,completed=?,updated=? WHERE id=? AND company_id=?',
              (data.title,data.kind,data.due.isoformat(),data.responsible,int(data.completed),utcnow(),rid,cid))
            return scoped_row(con,'risk_obligations',cid,rid)
