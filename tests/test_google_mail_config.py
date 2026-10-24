import json
from urllib.parse import urlparse,parse_qs
from fastapi.testclient import TestClient
from test_app import env
from test_office import owner
from google_mail_config import CALLBACK

CLIENT='1234567890-local-test.apps.googleusercontent.com'
SECRET='test-oauth-secret-only'
PATH='/api/companies/1/mail/google/setup'


def test_google_client_owner_csrf_encrypted_and_no_secret_readback(env,monkeypatch):
    for key in ['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REDIRECT_URI']:monkeypatch.delenv(key,raising=False)
    c,h=owner(env)
    assert not c.get(PATH).json()['configured']
    body={'client_id':CLIENT,'client_secret':SECRET}
    assert TestClient(env.app).get(PATH).status_code==401
    assert c.put(PATH,json=body).status_code==403
    c.post('/api/companies/1/users',headers=h,json={'email':'manager-config@example.test','password':'manager-configuration-test'})
    m=TestClient(env.app);mh=m.post('/api/login',json={'email':'manager-config@example.test','password':'manager-configuration-test'}).json()['csrf']
    assert m.get(PATH).status_code==403
    assert m.put(PATH,headers={'X-CSRF-Token':mh},json=body).status_code==403
    r=c.put(PATH,headers=h,json=body);assert r.status_code==200,r.text
    assert r.json()['configured'] and r.json()['secret_set'] and SECRET not in r.text and 'client_secret' not in r.json()
    assert SECRET not in c.get(PATH).text
    with env.db() as con:
        raw=con.execute('SELECT payload FROM google_mail_config').fetchone()[0]
        assert SECRET.encode() not in raw and CLIENT.encode() not in raw
    status=c.get('/api/companies/1/mail/unified/status').json();assert status['configured'] and not status['connected']
    direct=c.post('/api/companies/1/mail/unified/connect',headers=h,json={'service':'gmail','add':True,'login_hint':'user@example.test'}).json()
    parsed=urlparse(direct['url']);q=parse_qs(parsed.query)
    assert parsed.hostname=='accounts.google.com' and q['client_id']==[CLIENT] and q['redirect_uri']==[CALLBACK]
    assert SECRET not in direct['url']


def test_google_client_validation_precedence_and_secret_retention(env,monkeypatch):
    monkeypatch.setenv('GMAIL_CLIENT_ID','environment-client')
    monkeypatch.setenv('GMAIL_CLIENT_SECRET','environment-secret')
    c,h=owner(env)
    assert c.get(PATH).json()['source']=='environment'
    for body in [{'client_id':'user@gmail.com','client_secret':SECRET},{'client_id':CLIENT,'client_secret':'short'},{'client_id':CLIENT,'client_secret':'spaces invalid'}]:
        assert c.put(PATH,headers=h,json=body).status_code==422
    bad='s'*600
    error=c.put(PATH,headers=h,json={'client_id':CLIENT,'client_secret':bad})
    assert error.status_code==422 and bad not in error.text
    assert c.put(PATH,headers=h,content=b'x'*4097).status_code==413
    assert c.put(PATH,headers=h,json={'client_id':CLIENT,'client_secret':SECRET}).status_code==200
    assert c.get(PATH).json()['source']=='application'
    # Later host values do not silently replace the administrator's saved Google project.
    monkeypatch.setenv('GMAIL_CLIENT_ID','changed-environment')
    assert c.get(PATH).json()['client_id']==CLIENT
    assert c.put(PATH,headers=h,json={'client_id':CLIENT,'client_secret':''}).status_code==200
    assert c.put(PATH,headers=h,json={'client_id':'9876543210-other.apps.googleusercontent.com','client_secret':''}).status_code==422
    result=c.post('/api/companies/1/mail/unified/connect',headers=h,json={'service':'gmail'}).json()
    assert parse_qs(urlparse(result['url']).query)['client_id']==[CLIENT]
