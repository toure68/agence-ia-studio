from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
from uuid import uuid4
from fastapi.testclient import TestClient
from test_app import env,auth
from test_zero import owner

def bank(c,h,name,opening='0',currency='EUR',reserved='0',cid=1):
    r=c.post(f'/api/companies/{cid}/banks',headers=h,json={'name':name,'opening_balance':opening,'currency':currency,'reserved':reserved})
    assert r.status_code==201,r.text
    return r.json()['id']

def test_bank_available_debits_and_double_entry_transfer(env):
    c,h=owner(env);base='/api/companies/1';a=bank(c,h,'Banque A','1000',reserved='100');b=bank(c,h,'Banque B','-20')
    due=(datetime.now(ZoneInfo('Europe/Paris')).date()+timedelta(days=2)).isoformat()
    d=c.post(base+'/bank-debits',headers=h,json={'bank_id':b,'label':'Prélèvement assurance','amount':'80','due':due}).json()
    snap=c.get(base+'/banks').json();assert snap['balances_minor']=={'EUR':98000}
    rows={x['id']:x for x in snap['banks']};assert rows[a]['available_minor']==90000
    assert rows[b]['available_minor']==-10000 and rows[b]['unavailable_minor']==8000 and rows[b]['shortfall_minor']==10000
    op={'source_id':a,'target_id':b,'amount':'100','confirmed':True,'operation_id':str(uuid4())}
    assert c.post(base+'/bank-transfers',json=op).status_code==403
    assert c.post(base+'/bank-transfers',headers=h,json={**op,'confirmed':False}).status_code==422
    r=c.post(base+'/bank-transfers',headers=h,json=op);assert r.status_code==201,r.text
    assert c.post(base+'/bank-transfers',headers=h,json=op).json()['id']==r.json()['id']
    assert c.post(base+'/bank-transfers',headers=h,json={**op,'amount':'101'}).status_code==409
    ledger=c.get(base+'/treasury').json();assert len(ledger['movements'])==2
    assert ledger['balances_minor']=={'EUR':98000}
    assert ledger['inflows_minor']=={'EUR':0} and ledger['outflows_minor']=={'EUR':0}
    rows={x['id']:x for x in ledger['banks']};assert rows[b]['available_minor']==0
    assert c.post(base+f"/bank-debits/{d['id']}/paid",headers=h,json={'confirmed':False}).status_code==422
    paid=c.post(base+f"/bank-debits/{d['id']}/paid",headers=h,json={'confirmed':True});assert paid.status_code==200
    assert c.post(base+f"/bank-debits/{d['id']}/paid",headers=h,json={'confirmed':True}).json()==paid.json()
    snap=c.get(base+'/banks').json();rows={x['id']:x for x in snap['banks']}
    assert rows[b]['available_minor']==0 and rows[b]['balance_minor']==0 and rows[b]['unavailable_minor']==0
    assert snap['balances_minor']=={'EUR':90000} and snap['outflows_minor']=={'EUR':8000}
    assert c.post(base+'/bank-transfers',headers=h,json={**op,'operation_id':str(uuid4()),'amount':'801'}).status_code==409
    env.init_db();assert c.get(base+'/banks').json()['balances_minor']=={'EUR':90000}

def test_legacy_assignment_currency_isolation_and_stale_edits(env):
    c,h=owner(env);base='/api/companies/1';a=bank(c,h,'Compte euro','10');x=bank(c,h,'Compte CFA','500','XOF')
    r=c.post(base+'/treasury',headers=h,json={'label':'Ancienne entrée','direction':'in','amount':'20','date':'2026-10-18'});assert r.status_code==201
    mid=r.json()['id'];assert c.get(base+'/banks').json()['unassigned_minor']=={'EUR':2000}
    assert c.put(base+f'/treasury/{mid}/bank',headers=h,json={'bank_id':x,'confirmed':True}).status_code==422
    assert c.put(base+f'/treasury/{mid}/bank',headers=h,json={'bank_id':a,'confirmed':True}).status_code==200
    snap=c.get(base+'/banks').json();assert snap['unassigned_minor']=={} and snap['balances_minor']=={'EUR':3000,'XOF':50000}
    assert c.post(base+'/treasury',headers=h,json={'bank_id':x,'label':'Devise erronée','direction':'in','amount':'20','date':'2026-10-18'}).status_code==422
    op={'source_id':a,'target_id':x,'amount':'1','confirmed':True,'operation_id':str(uuid4())}
    assert c.post(base+'/bank-transfers',headers=h,json=op).status_code==422
    cid=c.post('/api/companies',headers=h,json={'name':'Autre banque entreprise','city':'Paris','headline':'Test banque'}).json()['id']
    foreign=bank(c,h,'Autre compte','50',cid=cid)
    assert c.post(base+'/bank-transfers',headers=h,json={**op,'target_id':foreign}).status_code==404
    assert c.post(base+'/bank-debits',headers=h,json={'bank_id':foreign,'label':'Interdit','amount':'10','due':'2026-10-20'}).status_code==404
    c.post(f'/api/companies/{cid}/users',headers=h,json={'email':'bank-manager@demo.test','password':'bank-password-very-long'})
    m=TestClient(env.app);mh=auth(m,'bank-manager@demo.test','bank-password-very-long')
    assert m.get(base+'/banks').status_code==403
    assert m.post(base+'/banks',headers=mh,json={'name':'Interdit'}).status_code==403
    edit={'name':'Compte euro','currency':'EUR','opening_balance':'10','reserved':'2','version':1}
    assert c.put(base+f'/banks/{a}',headers=h,json=edit).status_code==200
    assert c.put(base+f'/banks/{a}',headers=h,json=edit).status_code==409
    assert next(b for b in c.get(base+'/banks').json()['banks'] if b['id']==a)['available_minor']==2800

def test_debit_retry_and_cancel_preserve_cash(env):
    c,h=owner(env);base='/api/companies/1';bid=bank(c,h,'Banque test','100')
    due=datetime.now(ZoneInfo('Europe/Paris')).date().isoformat()
    data={'bank_id':bid,'label':'Assurance','amount':'25','due':due,'operation_id':str(uuid4())}
    first=c.post(base+'/bank-debits',headers=h,json=data);assert first.status_code==201
    did=first.json()['id']
    assert c.post(base+'/bank-debits',headers=h,json=data).json()['id']==did
    assert c.post(base+'/bank-debits',headers=h,json={**data,'amount':'26'}).status_code==409
    assert c.get(base+'/banks').json()['banks'][0]['available_minor']==7500
    assert c.post(base+f'/bank-debits/{did}/cancel',headers=h,json={'confirmed':False}).status_code==422
    assert c.post(base+f'/bank-debits/{did}/cancel',headers=h,json={'confirmed':True}).status_code==200
    assert c.get(base+'/banks').json()['banks'][0]['available_minor']==10000
    assert c.post(base+f'/bank-debits/{did}/paid',headers=h,json={'confirmed':True}).status_code==409
    assert c.get(base+'/treasury').json()['movements']==[]

def test_home_snapshot_month_flows_and_latest_movements(env):
    c,h=owner(env);base='/api/companies/1';a=bank(c,h,'Banque Atlas','500');b=bank(c,h,'Banque Rivage','0')
    today=datetime.now(ZoneInfo('Europe/Paris')).date()
    old=(today.replace(day=1)-timedelta(days=1)).isoformat()
    for label,direction,amount,day,bid in [('Ancien règlement','in','300',old,a),('Règlement client','in','200',today.isoformat(),a),('Fournitures','out','50',today.isoformat(),a),('Abonnement','out','30',today.isoformat(),b)]:
        r=c.post(base+'/treasury',headers=h,json={'label':label,'direction':direction,'amount':amount,'currency':'EUR','date':day,'bank_id':bid});assert r.status_code==201,r.text
    for i in range(5):c.post(base+'/treasury',headers=h,json={'label':f'Petite entrée {i}','direction':'in','amount':'1','currency':'EUR','date':today.isoformat(),'bank_id':a})
    r=c.post(base+'/bank-transfers',headers=h,json={'source_id':a,'target_id':b,'amount':'10','confirmed':True,'operation_id':str(uuid4())});assert r.status_code==201,r.text
    snap=c.get(base+'/banks').json();rows={x['id']:x for x in snap['banks']}
    assert snap['month']==today.isoformat()[:7]
    assert snap['month_inflows_minor']=={'EUR':20500} and snap['month_outflows_minor']=={'EUR':8000}
    assert rows[a]['month_inflows_minor']==20500 and rows[a]['month_outflows_minor']==5000
    assert rows[b]['month_inflows_minor']==0 and rows[b]['month_outflows_minor']==3000
    assert len(rows[a]['latest'])==5 and all(m['date']>=today.isoformat()[:7] for m in rows[a]['latest'])
    assert rows[b]['latest'][0]['transfer_id'] is not None
    assert rows[a]['balance_minor']==50000+30000+20000-5000+500-1000
    cockpit=c.get(base+'/cockpit',headers=h).json()['widgets']['treasury'];assert len(cockpit['banks'])==2 and cockpit['month_inflows_minor']=={'EUR':20500}

def test_bank_logo_upload_is_recropped_private_and_removable(env):
    import base64,io
    from PIL import Image
    c,h=owner(env);base='/api/companies/1';b=bank(c,h,'Banque Logo','10')
    buf=io.BytesIO();Image.new('RGB',(300,200),(20,120,80)).save(buf,format='JPEG')
    image='data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode()
    assert c.put(base+f'/banks/{b}/logo',json={'image':image}).status_code==403
    r=c.put(base+f'/banks/{b}/logo',headers=h,json={'image':image});assert r.status_code==200,r.text
    logo=r.json()['logo'];assert logo.startswith('data:image/png;base64,')
    stored=Image.open(io.BytesIO(base64.b64decode(logo.split(',',1)[1])));assert stored.size==(128,128)
    rows={x['id']:x for x in c.get(base+'/banks').json()['banks']};assert rows[b]['logo']==logo
    svg='data:image/svg+xml;base64,'+base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').decode()
    assert c.put(base+f'/banks/{b}/logo',headers=h,json={'image':svg}).status_code==422
    assert c.put(base+f'/banks/{b}/logo',headers=h,json={'image':'data:image/png;base64,'+base64.b64encode(b'not an image at all, really').decode()}).status_code==422
    assert c.put(base+'/banks/999999/logo',headers=h,json={'image':image}).status_code==404
    assert c.delete(base+f'/banks/{b}/logo',headers=h).status_code==200
    rows={x['id']:x for x in c.get(base+'/banks').json()['banks']};assert rows[b]['logo'] is None


def test_trial_banks_add_and_remove_only_trial_rows(env):
    c,h=owner(env);base='/api/companies/1'
    bank(c,h,'Ma vraie banque','100')
    assert c.post(base+'/trial-treasury').status_code==403  # CSRF required
    r=c.post(base+'/trial-treasury',headers=h);assert r.status_code==201,r.text;assert r.json()['banks']==3
    assert c.post(base+'/trial-treasury',headers=h).status_code==409
    names=[b['name'] for b in c.get(base+'/banks').json()['banks']]
    assert sum(n.startswith('Essai · ') for n in names)==3 and 'Ma vraie banque' in names
    assert len(c.get(base+'/treasury').json()['movements'])>=7
    assert c.delete(base+'/trial-treasury',headers=h).json()['removed']==3
    assert [b['name'] for b in c.get(base+'/banks').json()['banks']]==['Ma vraie banque']
    assert c.get(base+'/treasury').json()['movements']==[]
