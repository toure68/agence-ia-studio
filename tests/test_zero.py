from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
from uuid import uuid4
from fastapi.testclient import TestClient
from test_app import env,auth


def owner(env):
    c=TestClient(env.app)
    return c,auth(c,'owner@demo.test','correct horse battery staple')


def test_zero_dashboard_and_ledger(env):
    c,h=owner(env);base='/api/companies/1'
    assert c.get(base+'/cockpit').json()['badges']=={'requests':0,'prospects':0,'calendar':0,'treasury':0}
    op=str(uuid4());data={'label':'Paiement client','direction':'in','amount':'128.10','currency':'EUR','date':'2026-10-16','operation_id':op}
    assert c.post(base+'/treasury',json=data).status_code==403
    result=c.post(base+'/treasury',headers=h,json=data);assert result.status_code==201,result.text
    mid=result.json()['id']
    assert c.post(base+'/treasury',headers=h,json=data).json()['id']==mid
    assert c.post(base+'/treasury',headers=h,json={**data,'amount':'1'}).status_code==409
    assert c.post(base+'/treasury',headers=h,json={**data,'operation_id':str(uuid4()),'amount':'-1'}).status_code==422
    c.post(base+'/treasury',headers=h,json={**data,'operation_id':str(uuid4()),'label':'Dépense','direction':'out','amount':'28.10'})
    c.post(base+'/treasury',headers=h,json={**data,'operation_id':str(uuid4()),'currency':'XOF','amount':'500'})
    cash=c.get(base+'/treasury').json();assert cash['balances_minor']=={'EUR':10000,'XOF':50000}
    assert len(cash['movements'])==3 and cash['bank_connected'] is False
    assert c.get(base+'/cockpit').json()['badges']['treasury']==3
    assert c.post(base+f'/treasury/{mid}/check',headers=h).status_code==200
    assert c.get(base+'/cockpit').json()['badges']['treasury']==2
    env.init_db();assert c.get(base+'/treasury').json()['balances_minor']['EUR']==10000


def test_step3_available_and_cash_privacy(env):
    c,h=owner(env);base='/api/companies/1'
    for route in ['equipment','risks','conformity']:
        assert c.get(base+'/'+route).status_code==200
    payload={'label':'  ','direction':'in','amount':'10','currency':'EUR','date':'2026-10-16'}
    assert c.post(base+'/treasury',headers=h,json=payload).status_code==422
    payload['label']='Paiement'
    for invalid in [{'amount':'1.001'},{'amount':'NaN'},{'date':'2026-02-30'},{'currency':'GBP'}]:
        assert c.post(base+'/treasury',headers=h,json={**payload,**invalid}).status_code==422
    cid=c.post('/api/companies',headers=h,json={'name':'Autre société','city':'Lyon','headline':'Test sécurité'}).json()['id']
    c.post(f'/api/companies/{cid}/users',headers=h,json={'email':'cash@demo.test','password':'cash-manager-password-very-long'})
    m=TestClient(env.app);mh=auth(m,'cash@demo.test','cash-manager-password-very-long')
    for route in ['treasury','cockpit']:
        assert m.get(base+'/'+route).status_code==403
        assert TestClient(env.app).get(base+'/'+route).status_code==401
    mid=c.post(base+'/treasury',headers=h,json=payload).json()['id']
    assert m.post(base+'/treasury',headers=mh,json=payload).status_code==403
    assert m.post(f'/api/companies/{cid}/treasury/{mid}/check',headers=mh).status_code==404
    assert m.get(f'/api/companies/{cid}/treasury').json()['movements']==[]


def test_logistics_crosscheck_and_risks(env,monkeypatch):
    monkeypatch.setattr('zero_routes.OPERATIONS_ENABLED',True)
    c,h=owner(env);base='/api/companies/1';today=datetime.now(ZoneInfo('Europe/Paris')).date()
    work=c.post(base+'/activities',headers=h,json={'title':'Intervention client'}).json();wid=work['id']
    assert c.get(base+f'/activities/{wid}/material').json()['ready'] is False
    check=c.put(base+f'/activities/{wid}/material',headers=h,json={'items':[{'name':'Perceuse','quantity':1},{'name':'perceuse','quantity':1}]}).json()
    assert check['alerts']==[{'name':'Perceuse','required':2,'available':0,'missing':2}]
    a=c.post(base+'/equipment',headers=h,json={'name':'Perceuse','quantity':2,'condition':'broken'}).json();aid=a['id']
    assert c.get(base+f'/activities/{wid}/material').json()['alerts'][0]['missing']==2
    c.put(base+f'/equipment/{aid}',headers=h,json={'name':'Perceuse','quantity':2,'condition':'ready','maintenance_due':(today-timedelta(days=1)).isoformat()})
    assert c.get(base+f'/activities/{wid}/material').json()['alerts']
    cards=c.get(base+'/priorities').json();assert {r['action']['type'] for r in cards}=={'material','equipment'}
    assert c.get(base+'/cockpit').json()['badges']['calendar']==2
    c.put(base+f'/equipment/{aid}',headers=h,json={'name':'Perceuse','quantity':2,'condition':'ready','maintenance_due':(today+timedelta(days=180)).isoformat()})
    assert c.get(base+f'/activities/{wid}/material').json()['ready'] is True
    assert not c.get(base+'/priorities').json()
    payload={'title':'Renouvellement RC Pro','kind':'insurance','due':(today+timedelta(days=7)).isoformat(),'responsible':'Responsable test'}
    risk=c.post(base+'/risks',headers=h,json=payload).json();rid=risk['id']
    card=c.get(base+'/priorities').json()[0];assert card['action']=={'type':'risk','id':rid}
    assert c.post(base+'/priorities/dismiss',headers=h,json={'key':card['key']}).status_code==200
    assert c.get(base+'/priorities').json()==[]
    c.put(base+f'/risks/{rid}',headers=h,json={**payload,'completed':True})
    assert c.get(base+'/cockpit').json()['badges']['calendar']==0
    env.init_db();assert c.get(base+'/risks').json()[0]['completed']==1


def test_zero_permissions_and_no_false_compliance(env,monkeypatch):
    monkeypatch.setattr('zero_routes.OPERATIONS_ENABLED',True)
    c,h=owner(env)
    cid=c.post('/api/companies',headers=h,json={'name':'Autre société','city':'Lyon','headline':'Test sécurité'}).json()['id']
    c.post(f'/api/companies/{cid}/users',headers=h,json={'email':'manager@demo.test','password':'manager-password-very-long'})
    m=TestClient(env.app);mh=auth(m,'manager@demo.test','manager-password-very-long')
    for name in ['cockpit','treasury','equipment','risks','conformity']:
        assert m.get('/api/companies/1/'+name).status_code==403
        assert TestClient(env.app).get('/api/companies/1/'+name).status_code==401
    item=c.post('/api/companies/1/equipment',headers=h,json={'name':'Perceuse','quantity':1}).json()
    assert m.put(f"/api/companies/{cid}/equipment/{item['id']}",headers=mh,json={'name':'Autre nom','quantity':1}).status_code==404
    work=c.post('/api/companies/1/activities',headers=h,json={'title':'Travail privé'}).json()
    assert m.put(f"/api/companies/{cid}/activities/{work['id']}/material",headers=mh,json={'items':[]}).status_code==404
    matrix=c.get('/api/companies/1/conformity').json();rows=matrix['requirements']
    assert matrix['complete'] is False and len(rows)==33
    assert len({r['id'] for r in rows})==33
    assert sum(matrix['counts'].values())==33
    assert next(r for r in rows if r['id']=='SIG-02')['status']=='blocked'
    assert next(r for r in rows if r['id']=='OCR-01')['status']=='partial'
    assert next(r for r in rows if r['id']=='SOC-04')['status']=='blocked'
    assert all(r['evidence'] for r in rows if r['status']=='implemented')
    assert matrix['connections']['social'] is False and matrix['connections']['qualified_signature'] is False


def test_operational_reminders_and_due_today_availability(env):
    c,h=owner(env);base='/api/companies/1';today=datetime.now(ZoneInfo('Europe/Paris')).date()
    for kind in ['vehicle','epi','consumable','insurance','qualification']:
        r=c.post(base+'/risks',headers=h,json={'title':'Contrôle '+kind,'kind':kind,'due':(today+timedelta(days=5)).isoformat()})
        assert r.status_code==201
    assert len(c.get(base+'/priorities').json())==5
    asset={'name':'Perceuse','quantity':1,'condition':'worn'}
    a=c.post(base+'/equipment',headers=h,json=asset).json();aid=a['id']
    assert any(p['title']=='Remplacer : Perceuse' for p in c.get(base+'/priorities').json())
    wid=c.post(base+'/activities',headers=h,json={'title':'Chantier test'}).json()['id']
    c.put(base+f'/activities/{wid}/material',headers=h,json={'items':[{'name':'Perceuse','quantity':1}]})
    assert c.get(base+f'/activities/{wid}/material').json()['ready'] is False
    c.put(base+f'/equipment/{aid}',headers=h,json={**asset,'condition':'ready','maintenance_due':today.isoformat()})
    assert c.get(base+f'/activities/{wid}/material').json()['ready'] is False
    c.put(base+f'/equipment/{aid}',headers=h,json={**asset,'condition':'ready','maintenance_due':(today+timedelta(days=60)).isoformat()})
    assert c.get(base+f'/activities/{wid}/material').json()['ready'] is True
    for path,data in [('/equipment',{'name':'  ','quantity':1}),('/risks',{'title':'  ','kind':'epi','due':today.isoformat()}), (f'/activities/{wid}/material',{'items':[{'name':'  ','quantity':1}]})]:
        request=c.put if 'material' in path else c.post
        assert request(base+path,headers=h,json=data).status_code==422
    env.init_db();assert len(c.get(base+'/risks').json())==5
