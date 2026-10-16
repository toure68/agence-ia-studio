from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from test_app import env, auth
from priority_routes import next_occurrence


def test_dynamic_cards_and_persistent_completion(env):
    c = TestClient(env.app)
    h = auth(c, 'owner@demo.test', 'correct horse battery staple')
    today = datetime.now(ZoneInfo('Europe/Paris')).date()
    payload = {'title': 'Valider la paie', 'description': 'Vérifier avant validation',
               'first_due': today.isoformat(), 'monthly': False}
    assert c.get('/api/companies/1/priorities').json() == []
    assert c.post('/api/companies/1/tasks', json=payload).status_code == 403
    for i in range(6):
        assert c.post('/api/companies/1/tasks', json={**payload, 'title': f'Tâche {i}'}, headers=h).status_code == 201
    far = {**payload, 'first_due': (today + timedelta(days=20)).isoformat()}
    assert c.post('/api/companies/1/tasks', json=far, headers=h).status_code == 201
    cards = c.get('/api/companies/1/priorities').json()
    assert len(cards) == 6  # No fixed cap of four or five cards.
    card = cards[0]
    assert c.post('/api/companies/1/priorities/dismiss', headers=h, json={'key': card['key']}).status_code == 200
    assert len(c.get('/api/companies/1/priorities').json()) == 5
    # Dismissal hides the card for this user; it does not complete the task.
    tasks = c.get('/api/companies/1/tasks').json()
    assert all(t['next_due'] for t in tasks)
    action = cards[1]['action']
    path = f"/api/companies/1/tasks/{action['id']}/complete"
    assert c.post(path, headers=h, json={'occurrence': action['occurrence']}).status_code == 200
    assert c.post(path, headers=h, json={'occurrence': action['occurrence']}).status_code == 409
    assert len(c.get('/api/companies/1/priorities').json()) == 4
    env.init_db()
    assert len(c.get('/api/companies/1/priorities').json()) == 4


def test_monthly_end_of_month_and_occurrence_completion():
    task = {'first_due': '2028-01-31', 'monthly': True}
    assert next_occurrence(task, {'2028-01-31'}) == date(2028, 2, 29)
    assert next_occurrence(task, {'2028-01-31', '2028-02-29'}) == date(2028, 3, 31)
    assert next_occurrence({'first_due': '2028-01-31', 'monthly': False}, {'2028-01-31'}) is None


def test_priorities_tenant_and_owner_permissions(env):
    owner = TestClient(env.app)
    h = auth(owner, 'owner@demo.test', 'correct horse battery staple')
    cid = owner.post('/api/companies', headers=h, json={
        'name': 'Autre entreprise', 'city': 'Lyon', 'headline': 'Entreprise de test'}).json()['id']
    owner.post(f'/api/companies/{cid}/users', headers=h, json={
        'email': 'manager@demo.test', 'password': 'manager-password-very-long'})
    manager = TestClient(env.app)
    mh = auth(manager, 'manager@demo.test', 'manager-password-very-long')
    for resource in ['priorities', 'tasks']:
        assert manager.get(f'/api/companies/1/{resource}').status_code == 403
    today = datetime.now(ZoneInfo('Europe/Paris')).date().isoformat()
    tid = owner.post('/api/companies/1/tasks', headers=h, json={
        'title': 'Privé', 'description': 'Échéance confidentielle', 'first_due': today}).json()['id']
    assert manager.post(f'/api/companies/{cid}/tasks/{tid}/complete', headers=mh,
                        json={'occurrence': today}).status_code == 404
    prospect = owner.post('/api/prospects', headers=h, json={
        'name': 'Opportunité réelle', 'sector': 'Services', 'stage': 'Réponse reçue'}).json()
    cards = owner.get('/api/companies/1/priorities').json()
    urgent = [x for x in cards if x['kind'] == 'urgent']
    assert len(urgent) == 1
    assert manager.get(f'/api/companies/{cid}/priorities').json() == []
    owner.patch(f"/api/prospects/{prospect['id']}", headers=h, json={'stage': 'Refus'})
    assert not any(x['kind'] == 'urgent' for x in owner.get('/api/companies/1/priorities').json())
    assert TestClient(env.app).get('/api/companies/1/priorities').status_code == 401
