"""Personal home modules: hiding a shortcut never changes data or access rights."""
import json
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
]

class Preferences(BaseModel):
    domain:str=Field(max_length=40)
    visible:list[str]=Field(max_length=100)
    version:int=Field(ge=0)

class Domain(BaseModel):
    domain:str=Field(max_length=40)

def init_schema(db):
    with db() as con:
        con.execute('CREATE TABLE IF NOT EXISTS company_activity_domains(company_id INTEGER PRIMARY KEY REFERENCES companies(id),domain TEXT NOT NULL)')
        con.execute('''CREATE TABLE IF NOT EXISTS workspace_preferences (
          user_id INTEGER NOT NULL REFERENCES users(id),company_id INTEGER NOT NULL REFERENCES companies(id),
          domain TEXT NOT NULL,visible TEXT NOT NULL,version INTEGER NOT NULL,
          PRIMARY KEY(user_id,company_id))''')

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
        modules=catalog(user);allowed={m['key'] for m in modules}
        domain=row['domain'] if row else business['domain'] if business else 'general'
        return {'modules':modules,'domains':DOMAINS,'domain':domain,'configured':bool(row),
          'visible':[k for k in json.loads(row['visible']) if k in allowed] if row else [m['key'] for m in modules if not business or domain=='general' or not m['domains'] or domain in m['domains']],
          'suggested':[m['key'] for m in modules if domain=='general' or not m['domains'] or domain in m['domains']],
          'version':row['version'] if row else 0}

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
            row=con.execute('SELECT version FROM workspace_preferences WHERE user_id=? AND company_id=?',(user['id'],cid)).fetchone()
            version=row['version'] if row else 0
            if version!=data.version:raise HTTPException(409,'La personnalisation a changé sur un autre écran. Rechargez cette page.')
            con.execute('INSERT INTO workspace_preferences VALUES (?,?,?,?,?) ON CONFLICT(user_id,company_id) DO UPDATE SET domain=excluded.domain,visible=excluded.visible,version=excluded.version',
              (user['id'],cid,data.domain,json.dumps(data.visible),version+1))
            con.execute('COMMIT')
        return {'ok':True,'version':version+1}
