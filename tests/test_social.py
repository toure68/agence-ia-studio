from io import BytesIO
from datetime import datetime,timedelta,timezone
from PIL import Image
from fastapi.testclient import TestClient
from test_app import env,auth
from test_office import owner


def done(c,h):
    return c.post('/api/companies/1/activities',headers=h,json={'title':'Activité interne','description':'SECRET CLIENT ET ADRESSE','status':'done'}).json()

def draft(c,h,w,network='linkedin'):
    return c.post('/api/companies/1/social',headers=h,json={'work_id':w['id'],'network':network,'title':'Réalisation publique','facts':'Installation terminée et contrôlée.'})


def test_social_workflow_revision_priority_and_export(env):
    c,h=owner(env);w=done(c,h);base='/api/companies/1/social'
    assert c.post(base,json={'work_id':w['id'],'network':'linkedin','title':'Test'}).status_code==403
    p=draft(c,h,w).json();path=base+'/'+str(p['id'])
    assert draft(c,h,w).json()['id']==p['id']
    assert p['needs_review'] and not p['source_changed'] and 'SECRET' not in p['body']
    cards=c.get('/api/companies/1/priorities').json();assert any(x['action']=={'type':'social','id':p['id']} for x in cards)
    assert c.get('/api/companies/1/cockpit').json()['module_states']['social']['state']=='warning'
    preview=c.get(path+'/visual.png');assert preview.status_code==200
    im=Image.open(BytesIO(preview.content));assert im.size==(1080,1080)
    assert preview.headers['cache-control']=='no-store'
    assert c.get(path+'/visual.png?download=true').status_code==409
    assert c.post(path+'/validate',headers=h,json={'revision':p['revision'],'confirmed':False}).status_code==422
    approved=c.post(path+'/validate',headers=h,json={'revision':p['revision'],'confirmed':True}).json();assert not approved['needs_review']
    assert not any(x['action']['type']=='social' for x in c.get('/api/companies/1/priorities').json())
    assert c.get(path+'/visual.png?download=true&revision='+str(approved['revision'])).status_code==200
    edit={k:approved[k] for k in ('work_id','network','title','facts','body','revision')};edit['body']='Texte corrigé après validation.'
    changed=c.put(path,headers=h,json=edit).json();assert changed['needs_review'] and changed['status']=='draft'
    assert c.put(path,headers=h,json=edit).status_code==409
    assert c.post(path+'/validate',headers=h,json={'revision':approved['revision'],'confirmed':True}).status_code==409
    assert c.get(path+'/visual.png?download=true').status_code==409
    c.post(path+'/validate',headers=h,json={'revision':changed['revision'],'confirmed':True})
    c.patch('/api/companies/1/activities/'+str(w['id'])+'/status',headers=h,json={'status':'doing'})
    assert c.get(path).json()['source_changed']
    assert c.get(path+'/visual.png?download=true').status_code==409
    assert any(x['action']['type']=='social' for x in c.get('/api/companies/1/priorities').json())
    p=c.get(path).json()
    assert c.post(path+'/archive',headers=h,json={'revision':p['revision'],'confirmed':True}).status_code==200
    assert not any(x['action']['type']=='social' for x in c.get('/api/companies/1/priorities').json())


def test_social_completion_date_migration_and_formats(env):
    c,h=owner(env);w=done(c,h);base='/api/companies/1/social'
    original=c.get(base).json()['candidates'][0]
    assert original['estimated']==0
    for network,size in [('facebook',(1080,1080)),('tiktok',(1080,1920))]:
        p=draft(c,h,w,network).json()
        r=c.get(base+'/'+str(p['id'])+'/visual.png');assert Image.open(BytesIO(r.content)).size==size
    assert len(c.get(base).json()['posts'])==2
    # Editing a finished activity must not change its true completion date.
    c.put('/api/companies/1/activities/'+str(w['id']),headers=h,json={'title':'Activité retouchée','status':'done'})
    assert c.get(base).json()['candidates'][0]['completed']==original['completed']
    with env.db() as con:
        con.execute('UPDATE work_completion_dates SET completed=? WHERE work_id=?',((datetime.now(timezone.utc)-timedelta(days=12)).isoformat(),w['id']))
    assert c.get(base).json()['candidates']==[]
    c.patch('/api/companies/1/activities/'+str(w['id'])+'/status',headers=h,json={'status':'doing'})
    c.patch('/api/companies/1/activities/'+str(w['id'])+'/status',headers=h,json={'status':'done'})
    assert len(c.get(base).json()['candidates'])==1
    with env.db() as con:con.execute('DELETE FROM work_completion_dates WHERE work_id=?',(w['id'],))
    env.init_db()
    assert c.get(base).json()['candidates'][0]['estimated']==1
    env.init_db();assert len(c.get(base).json()['candidates'])==1


def test_social_scope_and_no_external_service(env,monkeypatch):
    c,h=owner(env);w=done(c,h);base='/api/companies/1/social'
    import httpx
    def forbidden(*a,**kw):raise AssertionError('No external service may be called')
    monkeypatch.setattr(httpx,'request',forbidden)
    p=draft(c,h,w).json();path=base+'/'+str(p['id'])
    wid=c.post('/api/companies/1/activities',headers=h,json={'title':'En cours'}).json()['id']
    assert c.post(base,headers=h,json={'work_id':wid,'network':'facebook','title':'Essai'}).status_code==409
    c.post('/api/companies/1/users',headers=h,json={'email':'manager@demo.test','password':'manager-password-very-long'})
    manager=TestClient(env.app);mh=auth(manager,'manager@demo.test','manager-password-very-long')
    assert manager.get(base).status_code==403
    assert manager.get(path+'/visual.png').status_code==403
    assert manager.post(path+'/validate',headers=mh,json={'revision':1,'confirmed':True}).status_code==403
    cid=c.post('/api/companies',headers=h,json={'name':'Autre société','city':'Paris','headline':'Test isolation'}).json()['id']
    assert c.get(f'/api/companies/{cid}/social/{p["id"]}').status_code==404
    assert c.get(f'/api/companies/{cid}/social/{p["id"]}/visual.png').status_code==404
    assert TestClient(env.app).get(path+'/visual.png').status_code==401
    state=c.get('/api/companies/1/workspace').json()
    assert 'social' in [x['key'] for x in state['modules']] and 'social' not in state['visible']
    assert c.get(base).json()['connected'] is False
