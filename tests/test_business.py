from fastapi.testclient import TestClient
from test_app import env, auth


def test_operations_priorities_reports_and_migration(env):
    c = TestClient(env.app)
    h = auth(c, 'owner@demo.test', 'correct horse battery staple')
    base = '/api/companies/1'
    assert c.post(base+'/clients', json={'name':'Client test'}).status_code == 403
    assert c.post(base+'/clients', headers=h, json={'name':'  '}).status_code == 422
    client = c.post(base+'/clients', headers=h, json={'name':'Client test', 'email':'client@example.test'}).json()
    assert c.post(base+f"/clients/{client['id']}/validate",headers=h,json={'revision':client['review_revision']}).status_code==200
    payload = {'title':'Préparer intervention', 'priority':'urgent', 'assignee':'Responsable test', 'due':'2020-01-01', 'client_id':client['id']}
    w = c.post(base+'/activities', headers=h, json=payload)
    assert w.status_code == 201, w.text
    wid = w.json()['id']
    assert w.json()['client_name'] == 'Client Test'
    cards = c.get(base+'/priorities').json()
    card = next(x for x in cards if x['action']['type'] == 'activity')
    assert card['action']['id'] == wid
    c.post(base+'/priorities/dismiss', headers=h, json={'key':card['key']})
    assert c.get(base+'/priorities').json() == []
    assert c.patch(base+f'/activities/{wid}/status', headers=h, json={'status':'doing'}).status_code == 200
    assert len(c.get(base+'/priorities').json()) == 1  # A changed activity surfaces again.
    report = c.get(base+'/reports').json()
    assert report['clients_active'] == 1 and report['overdue'] == 1
    assert report['activities'] == {'doing':1}
    assert c.put(base+f'/activities/{wid}', headers=h, json={**payload,'status':'done'}).status_code == 200
    assert c.get(base+'/priorities').json() == []
    assert c.get(base+'/reports').json()['overdue'] == 0
    assert c.put(base+f"/clients/{client['id']}", headers=h, json={'name':'Client test','archived':True}).status_code == 200
    assert c.get(base+'/reports').json()['clients_active'] == 0
    env.init_db()
    assert c.get(base+f'/activities/{wid}').json()['status'] == 'done'
    assert c.get(base+f"/clients/{client['id']}").json()['archived'] is True


def test_operations_company_isolation_and_draft_role(env):
    owner = TestClient(env.app)
    h = auth(owner, 'owner@demo.test', 'correct horse battery staple')
    cid = owner.post('/api/companies', headers=h, json={'name':'Autre entreprise','city':'Lyon','headline':'Entreprise test'}).json()['id']
    owner.post(f'/api/companies/{cid}/users', headers=h, json={'email':'manager@demo.test','password':'manager-password-very-long'})
    manager = TestClient(env.app)
    mh = auth(manager, 'manager@demo.test', 'manager-password-very-long')
    cl = owner.post('/api/companies/1/clients', headers=h, json={'name':'Client privé'}).json()
    work = owner.post('/api/companies/1/activities', headers=h, json={'title':'Action privée'}).json()
    for resource in ['clients','activities','reports']:
        assert manager.get('/api/companies/1/'+resource).status_code == 403
        assert TestClient(env.app).get(f'/api/companies/{cid}/'+resource).status_code == 401
    base = f'/api/companies/{cid}'
    assert manager.get(base+f"/clients/{cl['id']}").status_code == 404
    assert manager.put(base+f"/clients/{cl['id']}", headers=mh, json={'name':'Interdit'}).status_code == 404
    assert manager.patch(base+f"/activities/{work['id']}/status", headers=mh, json={'status':'done'}).status_code == 404
    assert manager.post(base+'/activities', headers=mh, json={'title':'Mauvais client','client_id':cl['id']}).status_code == 404
    assert manager.post(base+'/activities', headers=mh, json={'title':'Travail autorisé','priority':'high'}).status_code == 201
    assert manager.get(base+'/reports').json()['activities'] == {'todo':1}
    assert manager.get('/api/drafts').status_code == 403
    assert owner.get('/api/drafts').json() == []
    p = owner.post('/api/prospects', headers=h, json={'name':'Prospect test','sector':'Services'}).json()
    d = owner.post(f"/api/prospects/{p['id']}/drafts", headers=h, json={'objective':'premier_contact'})
    assert d.status_code == 201
    assert owner.get('/api/drafts').json()[0]['prospect_name'] == 'Prospect test'

