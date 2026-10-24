from fastapi.testclient import TestClient
from test_app import env
from test_office import owner


def test_priority_conditional_reads_still_authenticate_and_invalidate(env):
    c,h=owner(env);path='/api/companies/1/priorities'
    first=c.get(path);tag=first.headers['etag']
    assert first.status_code==200 and first.headers['cache-control']=='no-store'
    second=c.get(path,headers={'If-None-Match':tag})
    assert second.status_code==304 and second.content==b''
    assert TestClient(env.app).get(path,headers={'If-None-Match':tag}).status_code==401
    c.post('/api/companies/1/clients',headers=h,json={'name':'Nouvelle action'})
    changed=c.get(path,headers={'If-None-Match':tag})
    assert changed.status_code==200 and changed.headers['etag']!=tag
    assert len(changed.json())==1
    cid=c.post('/api/companies',headers=h,json={'name':'Société séparée','city':'Lyon','headline':'Test'}).json()['id']
    c.post(f'/api/companies/{cid}/users',headers=h,json={'email':'perf-other@example.test','password':'another-long-test-password'})
    m=TestClient(env.app);m.post('/api/login',json={'email':'perf-other@example.test','password':'another-long-test-password'})
    assert m.get(path,headers={'If-None-Match':changed.headers['etag']}).status_code==403
    assert m.get(f'/api/companies/{cid}/priorities').json()==[]


def test_only_versioned_static_assets_are_immutable(env):
    c=TestClient(env.app)
    assert 'immutable' in c.get('/static/reader.js?v=prio-v151-20261024').headers['cache-control']
    assert 'immutable' not in c.get('/static/reader.js').headers['cache-control']
    assert c.get('/').headers['cache-control']=='no-cache'
    assert c.get('/demo').headers['cache-control']=='no-store'
    assert c.get('/api/me').headers['cache-control']=='no-store'
