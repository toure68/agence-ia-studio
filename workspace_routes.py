"""Personal home modules: hiding a shortcut never changes data or access rights."""
import json
import time
from typing import Literal, Optional
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

DOMAINS={'general':'Tous secteurs','cleaning':'Nettoyage & services','construction':'Bâtiment & chantiers','automotive':'Automobile & atelier','agriculture':'Agriculture & transformation','commerce':'Commerce','consulting':'Conseil & prestations'}
# Only existing, working modules belong in this catalogue.
MODULES=[
 ('requests','Demandes','📥',[],False),('clients','Clients','👤',[],False),
 ('activities','Activités','✅',[],False),('leads','Devis','📄',[],False),
 ('emails','E-mails','✉️',['consulting','commerce'],False),('prospects','Prospection','🤝',['consulting','commerce'],True),
 ('calendar','Agenda','🗓️',[],False),('reports','Rapports','📊',['consulting','commerce'],False),
 ('drafts','Brouillons','✉️',['consulting','commerce'],True),('companies','Entreprises','🏢',[],False),
 ('company-edit','Identité & tarifs','🎨',[],False),('team','Équipe','👥',['cleaning','construction','agriculture'],True),
 ('treasury','Trésorerie','💶',[],False),('equipment','Matériel','🧰',['cleaning','construction','automotive','agriculture'],False),
 ('risks','Prévention','🛡️',['cleaning','construction','automotive','agriculture'],False),
 ('scanner','Documents & profil','📷',[],True),
 ('social','Publications','📣',[],True),
 ('veille','Veille métier','📡',[],False),
]

class Preferences(BaseModel):
    domain:str=Field(max_length=40)
    visible:list[str]=Field(max_length=100)
    version:int=Field(ge=0)
    columns:Optional[Literal[2,3,4]]=None
    rows:Optional[int]=Field(default=None,ge=1,le=10)
    dynamic:Optional[bool]=None

class Domain(BaseModel):
    domain:str=Field(max_length=40)

def init_schema(db):
    with db() as con:
        con.execute('CREATE TABLE IF NOT EXISTS company_activity_domains(company_id INTEGER PRIMARY KEY REFERENCES companies(id),domain TEXT NOT NULL)')
        con.execute('''CREATE TABLE IF NOT EXISTS workspace_preferences (
          user_id INTEGER NOT NULL REFERENCES users(id),company_id INTEGER NOT NULL REFERENCES companies(id),
          domain TEXT NOT NULL,visible TEXT NOT NULL,version INTEGER NOT NULL,
          PRIMARY KEY(user_id,company_id))''')
        if 'columns' not in {r[1] for r in con.execute('PRAGMA table_info(workspace_preferences)')}:
            con.execute('ALTER TABLE workspace_preferences ADD COLUMN columns INTEGER NOT NULL DEFAULT 2')
        if 'grid_rows' not in {r[1] for r in con.execute('PRAGMA table_info(workspace_preferences)')}:
            con.execute('ALTER TABLE workspace_preferences ADD COLUMN grid_rows INTEGER')
        if 'dynamic' not in {r[1] for r in con.execute('PRAGMA table_info(workspace_preferences)')}:
            con.execute('ALTER TABLE workspace_preferences ADD COLUMN dynamic INTEGER NOT NULL DEFAULT 1')
        con.execute('CREATE TABLE IF NOT EXISTS workspace_tracking(user_id INTEGER NOT NULL,company_id INTEGER NOT NULL,started REAL NOT NULL,PRIMARY KEY(user_id,company_id))')
        con.execute('CREATE TABLE IF NOT EXISTS workspace_usage(user_id INTEGER NOT NULL,company_id INTEGER NOT NULL,module TEXT NOT NULL,last_used REAL NOT NULL,PRIMARY KEY(user_id,company_id,module))')

def install(app,db,require,own_company):
    def catalog(user):
        return [dict(key=k,label=l,icon=i,domains=d) for k,l,i,d,o in MODULES if not o or user['role']=='owner']

    @app.get('/api/companies/{cid}/workspace')
    def preferences(cid:int,req:Request):
        user=require(req,tenant_id=cid)
        with db() as con:
            own_company(con,cid)
            row=con.execute('SELECT * FROM workspace_preferences WHERE user_id=? AND company_id=?',(user['id'],cid)).fetchone()
            business=con.execute('SELECT domain FROM company_activity_domains WHERE company_id=?',(cid,)).fetchone()
            now=time.time()
            con.execute('INSERT OR IGNORE INTO workspace_tracking VALUES (?,?,?)',(user['id'],cid,now))
            started=con.execute('SELECT started FROM workspace_tracking WHERE user_id=? AND company_id=?',(user['id'],cid)).fetchone()['started']
            usage={r['module']:r['last_used'] for r in con.execute('SELECT module,last_used FROM workspace_usage WHERE user_id=? AND company_id=?',(user['id'],cid))}
        modules=catalog(user);allowed={m['key'] for m in modules}
        domain=row['domain'] if row else business['domain'] if business else 'general'
        return {'modules':modules,'domains':DOMAINS,'domain':domain,'configured':bool(row),
          'visible':[k for k in json.loads(row['visible']) if k in allowed] if row else [m['key'] for m in modules if m['key'] not in ('social','veille') and (not business or domain=='general' or not m['domains'] or domain in m['domains'])],
          'suggested':[m['key'] for m in modules if domain=='general' or not m['domains'] or domain in m['domains']],
          'version':row['version'] if row else 0,'columns':row['columns'] if row else 2,'rows':row['grid_rows'] if row else None,'dynamic':bool(row['dynamic']) if row else True,
          'last_used':{key:usage.get(key,started) for key in allowed},'inactive':[key for key in allowed if now-usage.get(key,started)>=10*86400]}

    @app.post('/api/companies/{cid}/workspace/usage/{key}')
    def use_module(cid:int,key:str,req:Request):
        user=require(req,tenant_id=cid,write=True)
        if key not in {m['key'] for m in catalog(user)}:raise HTTPException(403,'Fonction non autorisée.')
        with db() as con:
            own_company(con,cid)
            con.execute('INSERT INTO workspace_usage VALUES (?,?,?,?) ON CONFLICT(user_id,company_id,module) DO UPDATE SET last_used=excluded.last_used',(user['id'],cid,key,time.time()))
        return {'ok':True}

    @app.put('/api/companies/{cid}/activity-domain')
    def business_domain(cid:int,data:Domain,req:Request):
        require(req,tenant_id=cid,owner=True,write=True)
        if data.domain not in DOMAINS:raise HTTPException(422,'Domaine inconnu')
        with db() as con:
            own_company(con,cid)
            con.execute('INSERT INTO company_activity_domains VALUES (?,?) ON CONFLICT(company_id) DO UPDATE SET domain=excluded.domain',(cid,data.domain))
        return {'ok':True}

    @app.put('/api/companies/{cid}/workspace')
    def save(cid:int,data:Preferences,req:Request):
        user=require(req,tenant_id=cid,write=True)
        if data.domain not in DOMAINS:raise HTTPException(422,'Domaine inconnu')
        allowed={m['key'] for m in catalog(user)}
        if any(k not in allowed for k in data.visible):raise HTTPException(403,'Une fonction sélectionnée n’est pas autorisée.')
        if len(set(data.visible))!=len(data.visible):raise HTTPException(422,'Fonction sélectionnée deux fois')
        with db() as con:
            own_company(con,cid);con.execute('BEGIN IMMEDIATE')
            row=con.execute('SELECT version,columns,grid_rows,dynamic FROM workspace_preferences WHERE user_id=? AND company_id=?',(user['id'],cid)).fetchone()
            version=row['version'] if row else 0
            if version!=data.version:raise HTTPException(409,'La personnalisation a changé sur un autre écran. Rechargez cette page.')
            columns=data.columns if data.columns is not None else row['columns'] if row else 2
            rows=data.rows if data.rows is not None else row['grid_rows'] if row else None
            dynamic=int(data.dynamic if data.dynamic is not None else bool(row['dynamic']) if row else True)
            con.execute('INSERT INTO workspace_preferences(user_id,company_id,domain,visible,version,columns,grid_rows,dynamic) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,company_id) DO UPDATE SET domain=excluded.domain,visible=excluded.visible,version=excluded.version,columns=excluded.columns,grid_rows=excluded.grid_rows,dynamic=excluded.dynamic',
              (user['id'],cid,data.domain,json.dumps(data.visible),version+1,columns,rows,dynamic))
            con.execute('COMMIT')
        return {'ok':True,'version':version+1}
