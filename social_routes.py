"""Local editorial drafts and branded text visuals. No social network calls."""
from datetime import datetime,timedelta,timezone
from zoneinfo import ZoneInfo
from io import BytesIO
from typing import Literal
from PIL import Image,ImageDraw,ImageFont
from fastapi import HTTPException,Request,Response
from pydantic import BaseModel,Field,field_validator

NETWORKS={'linkedin':'LinkedIn','facebook':'Facebook','tiktok':'TikTok'}

class Draft(BaseModel):
    work_id:int=Field(gt=0)
    network:Literal['linkedin','facebook','tiktok']
    title:str=Field(min_length=2,max_length=120)
    facts:str=Field(default='',max_length=1200)
    @field_validator('title')
    @classmethod
    def meaningful(cls,v):
        if len(v.strip())<2:raise ValueError('Précisez un titre public.')
        return v.strip()

class Edit(Draft):
    body:str=Field(min_length=10,max_length=3000)
    revision:int=Field(ge=1)

class Review(BaseModel):
    revision:int=Field(ge=1)
    confirmed:bool=False

def today():return datetime.now(ZoneInfo('Europe/Paris')).date()

def day(value):
    dt=datetime.fromisoformat(value)
    if dt.tzinfo is None:dt=dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(ZoneInfo('Europe/Paris')).date()

def template(company,data):
    name=company['name'];facts=data.facts.strip()
    if data.network=='linkedin':return f'{data.title}\n\nUne activité terminée chez {name}.'+(f'\n\n{facts}' if facts else '')+'\n\nÉchangeons sur vos besoins.'
    if data.network=='facebook':return f'{data.title}\n\nUne nouvelle réalisation de {name}.'+(f'\n{facts}' if facts else '')+'\n\nUne question ? Contactez-nous.'
    return f'{data.title}\n\nRéalisation terminée — {name}.'+(f'\n{facts}' if facts else '')+'\n\nDécouvrez notre activité.'

def init_schema(db):
    with db() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS work_completion_dates (
          work_id INTEGER PRIMARY KEY REFERENCES work_items(id) ON DELETE CASCADE,
          completed TEXT NOT NULL,estimated INTEGER NOT NULL DEFAULT 0);
        INSERT OR IGNORE INTO work_completion_dates SELECT id,updated,1 FROM work_items WHERE status='done';
        CREATE TRIGGER IF NOT EXISTS work_done_insert AFTER INSERT ON work_items WHEN NEW.status='done'
          BEGIN INSERT OR REPLACE INTO work_completion_dates VALUES (NEW.id,NEW.updated,0); END;
        CREATE TRIGGER IF NOT EXISTS work_done_update AFTER UPDATE OF status ON work_items WHEN NEW.status='done' AND OLD.status!='done'
          BEGIN INSERT OR REPLACE INTO work_completion_dates VALUES (NEW.id,NEW.updated,0); END;
        CREATE TRIGGER IF NOT EXISTS work_done_reopen AFTER UPDATE OF status ON work_items WHEN NEW.status!='done'
          BEGIN DELETE FROM work_completion_dates WHERE work_id=NEW.id; END;
        CREATE TABLE IF NOT EXISTS social_posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER NOT NULL REFERENCES companies(id),
          work_id INTEGER NOT NULL REFERENCES work_items(id),network TEXT NOT NULL,title TEXT NOT NULL,
          facts TEXT NOT NULL,body TEXT NOT NULL,brand_name TEXT NOT NULL,source_version INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'draft',reviewed_by INTEGER REFERENCES users(id),reviewed TEXT,
          created TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(company_id,work_id,network));
        ''')

def public(row):
    p=dict(row);p['source_changed']=p['source_version']!=p['work_version'] or p['work_status']!='done'
    p['needs_review']=p['status']!='archived' and (p['status']!='approved' or p['source_changed'])
    return p

def pending(con,cid):
    return [public(r) for r in con.execute("SELECT p.*,w.version AS work_version,w.status AS work_status FROM social_posts p JOIN work_items w ON w.id=p.work_id AND w.company_id=p.company_id WHERE p.company_id=? AND p.status!='archived' ORDER BY p.id DESC",(cid,)) if r['status']!='approved' or r['source_version']!=r['work_version'] or r['work_status']!='done']

def visual(p,company):
    width=1080;height=1920 if p['network']=='tiktok' else 1080
    image=Image.new('RGB',(width,height),'#f4f8f1');draw=ImageDraw.Draw(image)
    def font(size):return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',size=size)
    def lines(text,size,limit):
        f=font(size);result=[];line=''
        for word in text.split():
            test=(line+' '+word).strip()
            if draw.textlength(test,font=f)>900 and line:result.append(line);line=word
            else:line=test
            # Split unusually long words without allowing horizontal overflow.
            while draw.textlength(line,font=f)>900:
                cut=1
                while cut<len(line) and draw.textlength(line[:cut+1],font=f)<=900:cut+=1
                result.append(line[:cut]);line=line[cut:]
        if line:result.append(line.strip())
        if len(result)>limit:result=result[:limit];result[-1]=result[-1][:-3]+'…'
        return result
    draw.rectangle((0,0,width,22),fill='#377f59')
    y=95
    for line in lines(p.get('brand_name',company['name']),38,2):draw.text((90,y),line,font=font(38),fill='#315642');y+=48
    y=max(220,y+25)
    for line in lines(p['title'],62,5):draw.text((90,y),line,font=font(62),fill='#183d2c');y+=74
    y+=32
    for line in lines(p['facts'],34,4):draw.text((90,y),line,font=font(34),fill='#315642');y+=44
    draw.text((90,height-160),'Réalisation terminée',font=font(30),fill='#377f59')
    if p['needs_review'] or p.get('status')=='archived':draw.text((90,height-100),'CLASSÉ — NON PUBLIÉ' if p.get('status')=='archived' else 'BROUILLON — À VÉRIFIER',font=font(28),fill='#8d6010')
    out=BytesIO();image.save(out,format='PNG');return out.getvalue()

def install(app,db,require,own_company,utcnow):
    def scope(req,cid,write=False):
        user=require(req,tenant_id=cid,owner=True,write=write)
        with db() as con:own_company(con,cid)
        return user
    def work(con,cid,wid):
        row=con.execute('SELECT * FROM work_items WHERE company_id=? AND id=?',(cid,wid)).fetchone()
        if not row:raise HTTPException(404,'Activité introuvable')
        if row['status']!='done':raise HTTPException(409,'L’activité doit être terminée avant de préparer sa publication.')
        return dict(row)
    def post(con,cid,pid):
        row=con.execute('SELECT p.*,w.version AS work_version,w.status AS work_status FROM social_posts p JOIN work_items w ON w.id=p.work_id AND w.company_id=p.company_id WHERE p.company_id=? AND p.id=?',(cid,pid)).fetchone()
        if not row:raise HTTPException(404,'Publication introuvable')
        return public(row)
    def version(p,v):
        if p['revision']!=v:raise HTTPException(409,'La publication a changé. Rechargez-la avant de continuer.')

    @app.get('/api/companies/{cid}/social')
    def listing(cid:int,req:Request):
        scope(req,cid)
        with db() as con:
            candidates=[]
            for r in con.execute("SELECT w.id,w.title,c.completed,c.estimated FROM work_items w JOIN work_completion_dates c ON c.work_id=w.id WHERE w.company_id=? AND w.status='done' ORDER BY c.completed DESC,w.id DESC",(cid,)):
                if today()-timedelta(days=6)<=day(r['completed'])<=today():candidates.append(dict(r))
            posts=[public(r) for r in con.execute('SELECT p.*,w.version AS work_version,w.status AS work_status FROM social_posts p JOIN work_items w ON w.id=p.work_id AND w.company_id=p.company_id WHERE p.company_id=? ORDER BY p.updated DESC,p.id DESC',(cid,))]
        return {'candidates':candidates,'posts':posts,'networks':NETWORKS,'connected':False}

    @app.post('/api/companies/{cid}/social',status_code=201)
    def create(cid:int,data:Draft,req:Request):
        scope(req,cid,True)
        with db() as con:
            con.execute('BEGIN IMMEDIATE');w=work(con,cid,data.work_id)
            existing=con.execute('SELECT id FROM social_posts WHERE company_id=? AND work_id=? AND network=?',(cid,data.work_id,data.network)).fetchone()
            if existing:return post(con,cid,existing['id'])
            now=utcnow();firm=dict(own_company(con,cid))
            cur=con.execute('INSERT INTO social_posts(company_id,work_id,network,title,facts,body,brand_name,source_version,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?)',(cid,data.work_id,data.network,data.title,data.facts,template(firm,data),firm['name'],w['version'],now,now))
            pid=cur.lastrowid;con.execute('COMMIT');return post(con,cid,pid)

    @app.get('/api/companies/{cid}/social/{pid}')
    def detail(cid:int,pid:int,req:Request):
        scope(req,cid)
        with db() as con:return post(con,cid,pid)

    @app.put('/api/companies/{cid}/social/{pid}')
    def edit(cid:int,pid:int,data:Edit,req:Request):
        scope(req,cid,True)
        with db() as con:
            con.execute('BEGIN IMMEDIATE');p=post(con,cid,pid);version(p,data.revision)
            if data.work_id!=p['work_id'] or data.network!=p['network']:raise HTTPException(422,'L’activité et le réseau de cette publication ne peuvent pas être remplacés.')
            w=work(con,cid,p['work_id'])
            firm=dict(own_company(con,cid))
            con.execute("UPDATE social_posts SET title=?,facts=?,body=?,brand_name=?,source_version=?,revision=revision+1,status='draft',reviewed_by=NULL,reviewed=NULL,updated=? WHERE id=?",(data.title,data.facts,data.body,firm['name'],w['version'],utcnow(),pid))
            con.execute('COMMIT');return post(con,cid,pid)

    @app.post('/api/companies/{cid}/social/{pid}/validate')
    def validate(cid:int,pid:int,data:Review,req:Request):
        user=scope(req,cid,True)
        if not data.confirmed:raise HTTPException(422,'Confirmez le contenu et les autorisations avant validation.')
        with db() as con:
            con.execute('BEGIN IMMEDIATE');p=post(con,cid,pid);version(p,data.revision)
            if p['source_changed'] or p['status']=='archived':raise HTTPException(409,'L’activité ou la publication a changé. Vérifiez puis enregistrez le brouillon avant validation.')
            con.execute("UPDATE social_posts SET status='approved',revision=revision+1,reviewed_by=?,reviewed=?,updated=? WHERE id=?",(user['id'],utcnow(),utcnow(),pid));con.execute('COMMIT');return post(con,cid,pid)

    @app.post('/api/companies/{cid}/social/{pid}/archive')
    def archive(cid:int,pid:int,data:Review,req:Request):
        scope(req,cid,True)
        if not data.confirmed:raise HTTPException(422,'Confirmez le classement de ce brouillon.')
        with db() as con:
            con.execute('BEGIN IMMEDIATE');p=post(con,cid,pid);version(p,data.revision)
            con.execute("UPDATE social_posts SET status='archived',revision=revision+1,updated=? WHERE id=?",(utcnow(),pid));con.execute('COMMIT')
        return {'ok':True}

    @app.get('/api/companies/{cid}/social/{pid}/visual.png')
    def image(cid:int,pid:int,req:Request,download:bool=False,revision:int=0):
        scope(req,cid)
        with db() as con:
            p=post(con,cid,pid);firm=dict(own_company(con,cid))
            if revision:version(p,revision)
            if download and (p['needs_review'] or p['status']!='approved'):raise HTTPException(409,'Validez cette version avant de télécharger le visuel final.')
        return Response(visual(p,firm),media_type='image/png',headers={'Cache-Control':'no-store','Content-Disposition':('attachment' if download else 'inline')+f'; filename="publication-{pid}.png"'})
