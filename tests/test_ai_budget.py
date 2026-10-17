import asyncio
import io
import json
import uuid
import wave
from concurrent.futures import ThreadPoolExecutor
import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from test_app import env,auth
from test_office import owner,connect_mail
import ai_budget as ab
import assistant_routes as ar

BASE='/api/companies/1/ai-usage'
CHAT='/api/companies/1/assistant/messages'
KEY='sk-test-budget-not-real-123456789'

def message(revision=0,**kw):return {'text':'Question privée qui ne doit pas figurer au journal','revision':revision,'request_id':str(uuid.uuid4()),**kw}
def fake_provider(monkeypatch,mode='ok'):
    original=httpx.AsyncClient;seen=[]
    async def handle(req):
        seen.append(req)
        if mode=='timeout':raise httpx.ReadTimeout('unconfirmed')
        if mode=='refused':return httpx.Response(429,json={'error':{'message':'not stored'}})
        if '/transcriptions' in str(req.url):return httpx.Response(200,json={'text':'Message transcrit','usage':{'input_tokens':100,'output_tokens':50}})
        content=json.loads(req.content)
        text=json.dumps({'subject':'Message test','body':'Bonjour, proposition commerciale à vérifier.'}) if content.get('text') else 'Réponse de test'
        result={'output':[{'content':[{'type':'output_text','text':text}]}]}
        if mode!='no_usage':result['usage']={'input_tokens':100,'output_tokens':20,'input_tokens_details':{'cached_tokens':50}}
        return httpx.Response(200,json=result)
    monkeypatch.setattr(ar.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(handle),**kw))
    monkeypatch.setenv('OPENAI_API_KEY',KEY)
    return seen


def test_usage_ledger_private_exact_call_quota_duplicate_and_reset(env,monkeypatch):
    c,h=owner(env);seen=fake_provider(monkeypatch)
    settings=c.get(BASE).json();assert settings['calls']==0 and settings['monthly_usd'] is None
    assert c.put(BASE,headers=h,json={'monthly_usd':'0.10','monthly_calls':1,'version':0}).status_code==200
    payload=message();r=c.post(CHAT,headers=h,json=payload);assert r.status_code==201,r.text
    state=c.get(BASE).json();assert state['calls']==1 and state['estimated_usd']=='0.000057' and state['held_usd']=='0.000000'
    assert c.post(CHAT,headers=h,json=payload).status_code==201 and len(seen)==1
    assert c.post(CHAT,headers=h,json=message(1)).status_code==402 and len(seen)==1
    assert c.post('/api/companies/1/assistant/reset',headers=h).status_code==200
    assert c.get(BASE).json()['calls']==1
    # A quota must not block free business functions.
    assert c.post('/api/companies/1/activities',headers=h,json={'title':'Travail sans IA'}).status_code==201
    with env.db() as con:
        raw=str([dict(r) for r in con.execute('SELECT * FROM ai_call_ledger')])
        assert KEY not in raw and 'Question privée' not in raw and 'Réponse de test' not in raw
    assert 'authorization' not in json.dumps(state).lower()


def test_limits_owner_csrf_versions_unknown_model_and_tenant_isolation(env,monkeypatch):
    c,h=owner(env);seen=fake_provider(monkeypatch)
    assert c.put(BASE,json={'version':0}).status_code==403
    assert c.put(BASE,headers=h,json={'monthly_usd':'NaN','version':0}).status_code==422
    assert c.put(BASE,headers=h,json={'monthly_usd':'-1','version':0}).status_code==422
    assert c.put(BASE,headers=h,json={'monthly_usd':'0','version':0}).status_code==200
    assert c.post(CHAT,headers=h,json=message()).status_code==402 and not seen
    assert c.put(BASE,headers=h,json={'monthly_calls':5,'version':0}).status_code==409
    assert c.put(BASE,headers=h,json={'monthly_usd':'1','monthly_calls':5,'version':1}).status_code==200
    monkeypatch.setenv('OPENAI_CHAT_MODEL','unpriced-test-model')
    assert c.post(CHAT,headers=h,json=message()).status_code==402 and not seen
    c.post('/api/companies/1/users',headers=h,json={'email':'budget@demo.test','password':'manager-password-very-long'})
    manager=TestClient(env.app);mh=auth(manager,'budget@demo.test','manager-password-very-long')
    assert manager.get(BASE).status_code==403
    assert manager.put(BASE,headers=mh,json={'version':2}).status_code==403
    assert manager.get('/api/ai-usage/platform').status_code==403
    assert TestClient(env.app).get(BASE).status_code==401
    cid=c.post('/api/companies',headers=h,json={'name':'Autre société','city':'Lyon','headline':'Test budgets séparés'}).json()['id']
    assert c.get(f'/api/companies/{cid}/ai-usage').json()['monthly_usd'] is None
    assert c.get('/api/ai-usage/platform').json()['calls']==0


def test_atomic_reservations_and_calendar_month(env):
    c,h=owner(env)
    c.put(BASE,headers=h,json={'monthly_usd':'0.005','version':0})
    uid=c.get('/api/me').json()['id']
    def attempt(_):
        token=ab.CONTEXT.set((env.db,1,uid,'parallel-test'))
        try:
            try:return ab.reserve('gpt-4.1-mini',5000,'text')
            except HTTPException as e:return e.status_code
        finally:ab.CONTEXT.reset(token)
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(attempt,range(2)))
    assert sum(isinstance(r,tuple) for r in results)==1 and results.count(402)==1
    assert c.get(BASE).json()['held_usd']=='0.005000'
    ticket=next(r for r in results if isinstance(r,tuple));ab.settle(ticket,httpx.Response(429))
    assert c.get(BASE).json()['held_usd']=='0.000000'
    with env.db() as con:con.execute("UPDATE ai_call_ledger SET month='2000-01'")
    assert c.get(BASE).json()['calls']==0
    # A new month excludes past consumption, but the journal remains available.
    assert len(c.get(BASE).json()['calls_recent'])==1


@pytest.mark.parametrize('mode',['timeout','no_usage'])
def test_uncertain_usage_is_retained_and_reconciled_only_explicitly(env,monkeypatch,mode):
    c,h=owner(env);fake_provider(monkeypatch,mode)
    c.put(BASE,headers=h,json={'monthly_usd':'1','version':0})
    response=c.post(CHAT,headers=h,json=message())
    assert response.status_code==(502 if mode=='timeout' else 201)
    state=c.get(BASE).json();assert state['calls']==1 and float(state['held_usd'])>0 and state['pending']==1
    rid=state['calls_recent'][0]['id']
    assert c.post(BASE+'/'+rid+'/reconcile',headers=h,json={'usd':'0','confirmed':False}).status_code==422
    cid=c.post('/api/companies',headers=h,json={'name':'Autre société','city':'Paris','headline':'Vérifier périmètre'}).json()['id']
    assert c.post(f'/api/companies/{cid}/ai-usage/{rid}/reconcile',headers=h,json={'usd':'0','confirmed':True}).status_code==404
    result=c.post(BASE+'/'+rid+'/reconcile',headers=h,json={'usd':'0.02','confirmed':True})
    assert result.status_code==200 and result.json()['held_usd']=='0.000000' and result.json()['estimated_usd']=='0.020000'
    assert result.json()['calls_recent'][0]['reconciled_by'] is not None
    assert c.post(BASE+'/'+rid+'/reconcile',headers=h,json={'usd':'0','confirmed':True}).status_code==409


def test_refusals_and_connection_checks_are_counted_without_assumed_charge(env,monkeypatch):
    c,h=owner(env);seen=fake_provider(monkeypatch,'refused')
    r=c.post('/api/companies/1/assistant/connection',headers=h,json={'api_key':KEY})
    assert r.status_code==503 and len(seen)==1
    state=c.get(BASE).json();assert state['calls']==1 and state['estimated_usd']=='0.000000' and state['pending']==0
    assert state['calls_recent'][0]['status']=='failed'
    assert not c.get('/api/companies/1/assistant').json()['turns']


def test_transcription_and_answer_have_separate_usage(env,monkeypatch):
    import base64
    c,h=owner(env);seen=fake_provider(monkeypatch)
    raw=io.BytesIO()
    with wave.open(raw,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0\0'*16000)
    r=c.post(CHAT,headers=h,json=message(files=[{'name':'voice.wav','data':base64.b64encode(raw.getvalue()).decode()}]))
    assert r.status_code==201,r.text
    state=c.get(BASE).json();assert state['calls']==2 and len(seen)==2
    assert state['estimated_usd']=='0.000432' and state['held_usd']=='0.000000'
    assert any('audio' in x['operation'] for x in state['calls_recent'])


def test_mail_cached_result_does_not_consume_another_call(env,monkeypatch):
    c,h=owner(env);base,_=connect_mail(c,h,monkeypatch);c.post(base+'/sync',headers=h)
    mid=c.get(base+'/messages').json()[0]['id'];seen=fake_provider(monkeypatch)
    url=base+f'/messages/{mid}/analyse'
    assert c.post(url,headers=h,json={'kind':'summary'}).status_code==200
    assert c.post(url,headers=h,json={'kind':'summary'}).json()['cached']
    assert len(seen)==1 and c.get(BASE).json()['calls']==1


def test_legacy_prospect_call_is_metered_in_platform_scope(env,monkeypatch):
    c,h=owner(env);seen=fake_provider(monkeypatch)
    pid=c.post('/api/prospects',headers=h,json={'name':'Société démo','sector':'Services'}).json()['id']
    c.put('/api/ai-usage/platform',headers=h,json={'monthly_calls':1,'version':0})
    assert c.post(f'/api/prospects/{pid}/drafts',headers=h,json={'objective':'premier_contact'}).status_code==201
    assert c.get('/api/ai-usage/platform').json()['calls']==1 and c.get(BASE).json()['calls']==0
    assert json.loads(seen[0].content)['max_output_tokens']==900 and json.loads(seen[0].content)['store'] is False
    assert c.post(f'/api/prospects/{pid}/drafts',headers=h,json={'objective':'relance'}).status_code==402 and len(seen)==1
