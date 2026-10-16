from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi.testclient import TestClient
from test_app import env,auth
from test_workspace_documents import owner,upload
from document_fixtures import quote_pdf

def test_client_priority_validation_edit_and_tenant_boundaries(env):
    c,h=owner(env);base='/api/companies/1'
    client=c.post(base+'/clients',headers=h,json={'name':'Client à vérifier','phone':'0102030405'}).json()
    path=base+f"/clients/{client['id']}";assert client['needs_review'] is True
    cards=c.get(base+'/priorities').json();assert len(cards)==1 and cards[0]['action']['type']=='client'
    assert c.post(path+'/validate',json={'revision':client['review_revision']}).status_code==403
    assert c.post(path+'/validate',headers=h,json={'revision':'0'*64}).status_code==409
    assert c.post(path+'/validate',headers=h,json={'revision':client['review_revision']}).status_code==200
    assert c.get(base+'/priorities').json()==[]
    assert c.get(path).json()['needs_review'] is False and c.get(base+'/clients').json()[0]['id']==client['id']
    changed=c.put(path,headers=h,json={'name':'Client corrigé','phone':'0607080910'}).json()
    assert changed['review_revision']!=client['review_revision'] and changed['needs_review'] is True
    assert c.post(path+'/validate',headers=h,json={'revision':client['review_revision']}).status_code==409
    env.init_db();assert len(c.get(base+'/priorities').json())==1
    cid=c.post('/api/companies',headers=h,json={'name':'Autre société','city':'Lyon','headline':'Test'}).json()['id']
    assert c.post(f"/api/companies/{cid}/clients/{client['id']}/validate",headers=h,json={'revision':changed['review_revision']}).status_code==404
    c.post(f'/api/companies/{cid}/users',headers=h,json={'email':'other@demo.test','password':'other-password-long-enough'})
    m=TestClient(env.app);mh=auth(m,'other@demo.test','other-password-long-enough')
    assert m.post(path+'/validate',headers=mh,json={'revision':changed['review_revision']}).status_code==403
    c.put(path,headers=h,json={'name':'Client corrigé','archived':True})
    assert c.get(base+'/priorities').json()==[]

def test_mixed_pending_queue_no_cap_and_resolution(env):
    c,h=owner(env);base='/api/companies/1';today=datetime.now(ZoneInfo('Europe/Paris')).date().isoformat()
    work=c.post(base+'/activities',headers=h,json={'title':'Travail ordinaire'}).json()
    client=c.post(base+'/clients',headers=h,json={'name':'Nouveau client'}).json()
    quote=c.post(base+'/quotations',headers=h,json={'customer_name':'Client devis','title':'Devis à préparer','lines':[{'description':'Prestation','quantity':1,'unit_price':'10'}]}).json()
    did=upload(c,h,'quote',quote_pdf(),'document-a-verifier.pdf').json()['id']
    tasks=[c.post(base+'/tasks',headers=h,json={'title':f'Urgence {i}','description':'À contrôler','first_due':today}).json()['id'] for i in range(6)]
    cards=c.get(base+'/priorities').json();assert len(cards)==10
    assert [p['rank'] for p in cards]==sorted(p['rank'] for p in cards)
    assert all(p['action']['type']=='task' for p in cards[:6])
    assert {p['action']['type'] for p in cards[6:]}=={'client','document','quote','activity'}
    target=cards[0]['action'];c.post(base+f"/tasks/{target['id']}/complete",headers=h,json={'occurrence':target['occurrence']})
    remaining=c.get(base+'/priorities').json();assert len(remaining)==9 and remaining[0]['action']['id']!=target['id']
    assert c.post(base+f'/documents/{did}/confirm',headers=h,json={'confirmed':True}).status_code==200
    assert not any(p['action']['type']=='document' for p in c.get(base+'/priorities').json())
    assert c.get(base+f'/documents/{did}').json()['reviewed'] is True
    data=quote['data'];data['status']='sent'
    assert c.put(base+f"/quotations/{quote['id']}",headers=h,json=data).status_code==200
    assert not any(p['action']['type']=='quote' for p in c.get(base+'/priorities').json())
    c.post(base+f"/clients/{client['id']}/validate",headers=h,json={'revision':client['review_revision']})
    c.patch(base+f"/activities/{work['id']}/status",headers=h,json={'status':'done'})
    assert len(c.get(base+'/priorities').json())==5

def test_private_document_and_user_mail_priority_scope(env):
    c,h=owner(env);base='/api/companies/1'
    upload(c,h,'rib',quote_pdf(),'rib-prive.pdf')
    c.post(base+'/users',headers=h,json={'email':'queue@demo.test','password':'queue-password-long-enough'})
    m=TestClient(env.app);mh=auth(m,'queue@demo.test','queue-password-long-enough')
    with env.db() as con:
        uid=con.execute('SELECT id FROM users WHERE email=?',('owner@demo.test',)).fetchone()['id']
        con.execute('INSERT INTO mail_messages(user_id,company_id,gmail_id,thread_id,sender,reply_to,subject,body,received,category) VALUES (?,?,?,?,?,?,?,?,?,?)',(uid,1,'test-mail','test-thread','test@example.test','test@example.test','Message privé','Corps privé',env.utcnow(),'client'))
        con.execute('INSERT INTO leads(company_id,name,phone,service,area,frequency,amount,created,updated) VALUES (?,?,?,?,?,?,?,?,?)',(1,'Demande immédiate','0102030405','Test',10,'Une fois',100,env.utcnow(),env.utcnow()))
    cards=c.get(base+'/priorities').json();assert {x['action']['type'] for x in cards}=={'document','email','lead'}
    manager=m.get(base+'/priorities').json();assert [x['action']['type'] for x in manager]==['lead']
    assert 'rib-prive' not in str(manager) and 'Message privé' not in str(manager)
    assert TestClient(env.app).get(base+'/priorities').status_code==401
