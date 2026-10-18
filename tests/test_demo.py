from fastapi.testclient import TestClient
from test_app import env


def test_public_demo_isolated_and_read_only(env):
    c = TestClient(env.app)
    assert c.get('/demo').status_code == 200
    assert 'data-public-demo="true"' in c.get('/demo').text
    assert c.get('/demo').headers['x-robots-tag'] == 'noindex, nofollow'
    assert c.get('/demo/api/me').json()['email'] == 'visiteur@example.test'
    assert not c.cookies
    for path in ('/api/me', '/api/companies', '/api/companies/1/treasury'):
        assert c.get(path).status_code == 401
    assert c.get('/demo/api/companies').json()[0]['name'] == 'Entreprise Démo'
    assert c.get('/demo/api/companies/1/treasury').json()['balances_minor']['EUR'] == 2485000
    for method in ('post','put','patch','delete'):
        assert c.request(method.upper(),'/demo/api/companies/1/treasury',json={'amount':100}).status_code == 403
    for path in ('companies/2','companies/1/secret','login','companies/1/documents/999/source'):
        assert c.get('/demo/api/'+path).status_code == 404
    with env.db() as con:
        assert con.execute('SELECT count(*) FROM clients').fetchone()[0] == 0
