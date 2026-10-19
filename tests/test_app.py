import importlib
import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def env(tmp_path,monkeypatch):
    monkeypatch.setenv('DATABASE_PATH',str(tmp_path/'test.db'))
    monkeypatch.setenv('ADMIN_EMAIL','owner@demo.test')
    monkeypatch.setenv('ADMIN_PASSWORD','correct horse battery staple')
    monkeypatch.setenv('SESSION_SECRET','a-very-long-secret-for-tests-only-987654321')
    monkeypatch.setenv('APP_ENV','development')
    monkeypatch.delenv('OPENAI_API_KEY',raising=False)
    import app
    app.DB_PATH=tmp_path/'test.db'
    app.SECRET='a-very-long-secret-for-tests-only-987654321'
    from itsdangerous import URLSafeTimedSerializer
    app.TOKEN=URLSafeTimedSerializer(app.SECRET,salt='agence-ia-session-v2')
    app.RATE_BUCKETS.clear()
    app.init_db()
    return app


def auth(client,email,password):
    r=client.post('/api/login',json={'email':email,'password':password})
    assert r.status_code==200,r.text
    return {'X-CSRF-Token':r.json()['csrf']}


def test_complete_workflow_and_tenant_isolation(env):
    client=TestClient(env.app)
    assert client.get('/api/setup').json()['ready']
    assert client.get('/api/companies').status_code==401
    headers=auth(client,'owner@demo.test','correct horse battery staple')
    companies=client.get('/api/companies').json()
    assert len(companies)==1
    assert companies[0]['slug']=='eclat-proprete'
    # CSRF required
    assert client.post('/api/companies',json={'name':'Test Pro','city':'Lyon','headline':'Propreté sans stress'}).status_code==403
    payload={'name':'Brillance Services','city':'Lyon','headline':'Vos locaux étincelants','color':'#14866e'}
    c=client.post('/api/companies',json=payload,headers=headers)
    assert c.status_code==201,c.text
    new=c.json();assert new['slug']=='brillance-services'
    quote={'name':'Client fictif','phone':'0600000000','email':'', 'service':'office','area':100,'frequency':'once','privacy_ack':True}
    r=client.post('/api/public/eclat-proprete/quotes',json=quote)
    assert r.status_code==201,r.text
    assert r.json()['estimate']==190
    lead=client.get('/api/companies/1/leads').json()[0]
    assert lead['name']=='Client fictif'
    assert client.get('/api/companies/'+str(new['id'])+'/leads').json()==[]
    update=client.patch(f'/api/companies/1/leads/{lead["id"]}',headers=headers,json={'status':'Signé','notes':'Bon pour accord (simulation)'})
    assert update.status_code==200
    assert client.patch(f'/api/companies/{new["id"]}/leads/{lead["id"]}',headers=headers,json={'status':'Perdu','notes':''}).status_code==404
    rates={k:{'unit':data['unit'],'minimum':data['min']} for k,data in env.SERVICE_META.items()}
    rates['home']['unit']=4.0
    assert client.put(f'/api/companies/{new["id"]}/rates',headers=headers,json={'rates':rates}).status_code==200
    assert client.get('/api/public/'+new['slug']).json()['rates']['home']['unit']==4.0
    # Dedicated manager can only access their firm
    u=client.post('/api/companies/'+str(new['id'])+'/users',headers=headers,json={'email':'manager@demo.test','password':'manager-password-very-long'})
    assert u.status_code==201,u.text
    other=TestClient(env.app)
    h2=auth(other,'manager@demo.test','manager-password-very-long')
    restricted=other.get('/api/companies').json()
    assert len(restricted)==1 and restricted[0]['id']==new['id']
    assert other.get('/api/companies/1/leads').status_code==403
    assert other.get('/api/prospects').status_code==403
    assert other.post('/api/companies',json=payload,headers=h2).status_code==403
    # CRM and local draft
    p=client.post('/api/prospects',json={'name':'Garage du Centre','sector':'Garage automobile','city':'Lille','diagnosis':'Pas de réservation en ligne constatée sur le site consulté'},headers=headers)
    assert p.status_code==201,p.text
    pid=p.json()['id']
    assert client.post(f'/api/prospects/{pid}/history',headers=headers,json={'direction':'reçu','body':'Pouvez-vous envoyer des informations ?'}).status_code==201
    draft=client.post(f'/api/prospects/{pid}/drafts',headers=headers,json={'objective':'premier_contact'})
    assert draft.status_code==201,draft.text
    assert 'Garage du Centre' in draft.json()['body']
    assert 'local' in draft.json()['provider']
    assert other.post(f'/api/prospects/{pid}/drafts',headers=h2,json={'objective':'relance'}).status_code==403
    assert client.get('/api/prospects-export').status_code==200
    assert client.post('/api/logout',headers=headers).status_code==200
    assert client.get('/api/me').status_code==401


def test_website_csrf_and_validation(env):
    client=TestClient(env.app)
    assert client.get('/site/eclat-proprete').status_code==200
    assert client.get('/static/admin.js').status_code==200
    assert client.get('/api/public/eclat-proprete').status_code==200
    quote={'name':'Demo User','phone':'0600000000','service':'home','area':70,'frequency':'once','privacy_ack':False}
    assert client.post('/api/public/eclat-proprete/quotes',json=quote).status_code==422
    quote['privacy_ack']=True
    quote['website']='spam'
    assert client.post('/api/public/eclat-proprete/quotes',json=quote).status_code==201
    assert client.get('/api/setup').status_code==200
    headers=auth(client,'owner@demo.test','correct horse battery staple')
    assert client.get('/api/companies/1/leads').json()==[]
    assert client.post('/api/prospects',headers=headers,json={'name':'A','sector':'nettoyage'}).status_code==422


def test_password_rotation_export_and_public_safety(env):
    from fastapi.testclient import TestClient
    import sqlite3
    client=TestClient(env.app)
    token=auth(client,'owner@demo.test','correct horse battery staple')
    assert client.post('/api/password',headers=token,json={
        'old_password':'incorrect','new_password':'new and different password of 30 chars'
    }).status_code==403
    changed=client.post('/api/password',headers=token,json={
        'old_password':'correct horse battery staple','new_password':'new and different password of 30 chars'
    })
    assert changed.status_code==200, changed.text
    assert client.get('/api/me').status_code==401
    assert client.post('/api/login',json={'email':'owner@demo.test','password':'correct horse battery staple'}).status_code==401
    token=auth(client,'owner@demo.test','new and different password of 30 chars')
    assert client.get('/api/companies/1/leads-export').status_code==200
    assert 'Client;' in client.get('/api/companies/1/leads-export').text
    assert env.csv_safe('=HYPERLINK("evil")').startswith("'=")
    assert env.csv_safe('+SUM(1,1)').startswith("'+")
    env.PUBLIC_QUOTES_ENABLED=False
    quote={'name':'Test Client','phone':'0600000000','service':'home','area':70,'frequency':'once','privacy_ack':True}
    assert client.get('/api/public/eclat-proprete').json()['quotes_enabled'] is False
    blocked=client.post('/api/public/eclat-proprete/quotes',json=quote)
    assert blocked.status_code==503
    assert client.get('/api/companies/1/leads').json()==[]
    env.PUBLIC_QUOTES_ENABLED=True
    assert client.post('/api/public/eclat-proprete/quotes',json=quote).status_code==201
    assert len(client.get('/api/companies/1/leads').json())==1


def test_prior_v2_database_migrates_without_data_loss(env):
    import sqlite3
    with sqlite3.connect(env.DB_PATH) as con:
        owner_before=con.execute("SELECT id,email FROM users WHERE role='owner'").fetchone()
        con.execute('UPDATE users SET auth_version=3 WHERE id=?',(owner_before[0],))
    env.init_db()
    with sqlite3.connect(env.DB_PATH) as con:
        owner_after=con.execute("SELECT id,email,auth_version FROM users WHERE role='owner'").fetchone()
        assert owner_after==(owner_before[0],owner_before[1],3)


def test_prospect_action_requires_human_at_agreement(env):
    from fastapi.testclient import TestClient
    client=TestClient(env.app)
    owner=auth(client,'owner@demo.test','correct horse battery staple')
    r=client.post('/api/prospects',headers=owner,json={
        'name':'Nettoyage Exemplaire', 'sector':'Nettoyage', 'stage':'À contacter'
    })
    assert r.status_code==201
    pid=r.json()['id']
    suggested=client.get(f'/api/prospects/{pid}/next-action').json()
    assert suggested['draft_objective']=='premier_contact'
    assert suggested['sending_enabled'] is False
    client.patch(f'/api/prospects/{pid}',headers=owner,json={'stage':'Accord de principe'})
    suggested=client.get(f'/api/prospects/{pid}/next-action').json()
    assert suggested['human_review_required'] is True
    assert suggested['draft_objective'] is None
    client.patch(f'/api/prospects/{pid}',headers=owner,json={'stage':'Refus'})
    assert 'Ne plus relancer' in client.get(f'/api/prospects/{pid}/next-action').json()['recommended_action']


def test_owner_password_recovery_from_host_variables(env,monkeypatch):
    client=TestClient(env.app)
    auth(client,'owner@demo.test','correct horse battery staple')
    # Without the flag, changing ADMIN_PASSWORD does nothing to an existing owner.
    monkeypatch.setenv('ADMIN_PASSWORD','a brand new recovery password')
    env.init_db()
    assert TestClient(env.app).post('/api/login',json={'email':'owner@demo.test','password':'a brand new recovery password'}).status_code!=200
    # With the flag, the owner's password is replaced and old sessions are revoked.
    monkeypatch.setenv('ADMIN_PASSWORD_RESET','1')
    env.init_db()
    assert client.get('/api/me').status_code==401
    fresh=TestClient(env.app)
    assert fresh.post('/api/login',json={'email':'owner@demo.test','password':'correct horse battery staple'}).status_code!=200
    auth(fresh,'owner@demo.test','a brand new recovery password')
    # Too short a password is ignored.
    monkeypatch.setenv('ADMIN_PASSWORD','short')
    env.init_db()
    auth(TestClient(env.app),'owner@demo.test','a brand new recovery password')


def test_stay_signed_in_for_six_months(env):
    client=TestClient(env.app)
    r=client.post('/api/login',json={'email':'owner@demo.test','password':'correct horse battery staple'})
    assert r.status_code==200
    assert 'Max-Age=15552000' in r.headers['set-cookie']
    assert env.SESSION_SECONDS==15552000


def test_wallpaper_is_saved_per_user(env):
    client=TestClient(env.app)
    headers=auth(client,'owner@demo.test','correct horse battery staple')
    assert client.get('/api/me').json()['wallpaper']=='nuit'
    assert client.put('/api/me/wallpaper',json={'wallpaper':'aurore'}).status_code==403  # CSRF required
    assert client.put('/api/me/wallpaper',json={'wallpaper':'inconnu'},headers=headers).status_code==400
    assert client.put('/api/me/wallpaper',json={'wallpaper':'aurore'},headers=headers).json()['wallpaper']=='aurore'
    assert client.get('/api/me').json()['wallpaper']=='aurore'
