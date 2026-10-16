from fastapi.testclient import TestClient
from test_app import env


def test_production_session_and_disabled_collection(env, monkeypatch):
    monkeypatch.setattr(env, 'APP_ENV', 'production')
    monkeypatch.setattr(env, 'PUBLIC_QUOTES_ENABLED', False)
    client = TestClient(env.app, base_url='https://testserver')
    response = client.post('/api/login', json={
        'email': 'owner@demo.test', 'password': 'correct horse battery staple'})
    assert response.status_code == 200
    cookie = response.headers['set-cookie'].lower()
    assert 'secure' in cookie and 'httponly' in cookie and 'samesite=lax' in cookie
    assert client.get('/api/me').status_code == 200
    assert client.get('/health').headers['strict-transport-security'] == 'max-age=31536000'
    assert client.get('/api/public/eclat-proprete').json()['quotes_enabled'] is False
    assert client.post('/api/public/eclat-proprete/quotes', json={
        'name': 'Test Client', 'phone': '0600000000', 'service': 'home',
        'area': 70, 'frequency': 'once', 'privacy_ack': True}).status_code == 503
    assert client.get('/api/companies/1/leads').json() == []
