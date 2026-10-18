"""Build a public snapshot exclusively from a disposable, synthetic local DB.

Run in a fresh process: python scripts/build_demo.py. No production DB is read.
"""
import json
import os
from pathlib import Path
import re
import sys
import tempfile

base = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(base))
with tempfile.TemporaryDirectory(prefix='public-demo-') as directory:
    os.environ.update(DATABASE_PATH=str(Path(directory)/'demo.db'), APP_ENV='development', ADMIN_EMAIL='visiteur@example.test', ADMIN_PASSWORD='disposable-local-demo-password', SESSION_SECRET='disposable-local-demo-session-secret')
    for key in list(os.environ):
        if any(part in key for part in ('OPENAI', 'RESEND', 'GMAIL', 'GOOGLE', 'ANTHROPIC')):
            os.environ.pop(key, None)
    import app
    from fastapi.testclient import TestClient
    app.init_db()
    c = TestClient(app.app)
    login = c.post('/api/login', json={'email':'visiteur@example.test','password':'disposable-local-demo-password'})
    h = {'X-CSRF-Token': login.json()['csrf']}
    with app.db() as con:
        con.execute("UPDATE companies SET name='Entreprise Démo',slug='entreprise-demo',city='Paris',headline='Votre activité au quotidien',phone='',email='contact@example.test'")
    b = '/api/companies/1'
    def seed(path, data):
        r = c.post(b+path, headers=h, json=data)
        assert r.status_code in (200,201), (path,r.text)
        return r.json()
    seed('/clients', {'name':'Alex Martin','email':'alex@example.test'})
    seed('/quotations', {'customer_name':'Alex Martin','customer_email':'alex@example.test','title':'Entretien des locaux','vat_rate':'20','lines':[{'description':'Prestation mensuelle','quantity':1,'unit_price':'4340'}]})
    seed('/activities', {'title':'Entretien des bureaux','client_id':1})
    seed('/equipment', {'name':'Aspirateur professionnel','quantity':1,'condition':'worn'})
    for direction, amount, label in [('in','29200','Règlements clients'),('out','4350','Charges et fournitures')]:
        seed('/treasury', {'label':label,'direction':direction,'amount':amount,'currency':'EUR','date':'2026-10-18'})
    snapshot = {}
    for route in app.app.routes:
        path = getattr(route,'path','')
        if 'GET' not in getattr(route,'methods',set()) or not path.startswith('/api/'):
            continue
        if any(part in path for part in ('/public/','callback','export','/pdf','/source','visual.png')):
            continue
        path = re.sub(r'\{[^}]+\}', '1', path)
        r = c.get(path)
        if r.status_code == 200 and 'application/json' in r.headers.get('content-type',''):
            snapshot[path] = r.json()
    snapshot['/api/me']['csrf'] = 'demo-read-only'
    (base/'demo-data.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2)+'\n')
    print(f'Built {len(snapshot)} synthetic endpoints')
