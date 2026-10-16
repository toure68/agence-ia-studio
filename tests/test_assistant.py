import base64
import asyncio
import io
import json
from pathlib import Path
import subprocess
import time
import uuid
import wave
import zipfile
import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from test_app import env,auth
from test_workspace_documents import owner
from document_fixtures import kbis_png,quote_pdf
import assistant_routes as ar
from assistant_media import prepare_file

BASE='/api/companies/1/assistant'
KEY='sk-test-assistant-not-a-real-key-123456789'
def message(text='Aide à organiser mon entreprise',**kw):return {'text':text,'revision':0,'request_id':str(uuid.uuid4()),**kw}
def attachment(name,raw):return {'name':name,'data':base64.b64encode(raw).decode()}
def connected(c,h,monkeypatch,answer='Réponse IA de test'):
    calls=[]
    async def reply(key,messages,instructions=ar.INSTRUCTIONS,max_tokens=1800):
        calls.append({'key':key,'messages':messages,'instructions':instructions});return answer
    monkeypatch.setattr(ar,'provider_response',reply)
    r=c.post(BASE+'/connection',headers=h,json={'api_key':KEY});assert r.status_code==200,r.text
    calls.clear();return calls

def test_chat_no_connection_is_honest_bounded_and_authenticated(env):
    c,h=owner(env)
    state=c.get(BASE).json();assert not state['configured'] and state['turns']==[] and state['can_connect']
    assert TestClient(env.app).get(BASE).status_code==401
    assert c.post(BASE+'/messages',json=message()).status_code==403
    assert c.post(BASE+'/messages',headers=h,json=message()).status_code==503
    assert c.get(BASE).json()['turns']==[]
    assert c.post(BASE+'/messages',headers=h,json=message(text='')).status_code==422
    assert c.post(BASE+'/messages',headers=h,json=message(files=[attachment('x.txt',b'hello')]*5)).status_code==422
    assert c.post(BASE+'/connection',headers=h,content=b' '*4097).status_code==413
    assert c.post(BASE+'/messages',headers=h,content=b' '*(ar.MAX_BODY+1)).status_code==413
    assert c.get(BASE).headers['cache-control']=='no-store'

def test_chat_connection_private_history_scopes_idempotency_and_encryption(env,monkeypatch):
    c,h=owner(env);calls=connected(c,h,monkeypatch)
    first=message('Question confidentielle propriétaire')
    r=c.post(BASE+'/messages',headers=h,json=first);assert r.status_code==201,r.text
    assert r.json()['revision']==1 and r.json()['turn']['answer']=='Réponse IA de test'
    assert c.post(BASE+'/messages',headers=h,json=first).json()['turn']['id']==r.json()['turn']['id'];assert len(calls)==1
    assert c.post(BASE+'/messages',headers=h,json=message('Révision périmée')).status_code==409
    r=c.post(BASE+'/messages',headers=h,json=message('Question suivante',revision=1));assert r.status_code==201
    assert [m['role'] for m in calls[-1]['messages']]==['user','assistant','user']
    assert 'Question confidentielle' in calls[-1]['messages'][0]['content'][0]['text']
    assert 'API' not in c.get(BASE).text and KEY not in c.get(BASE).text
    with env.db() as con:
        data=bytes(con.execute('SELECT payload FROM assistant_turns LIMIT 1').fetchone()[0]);assert b'Question confidentielle' not in data
        key=bytes(con.execute('SELECT payload FROM assistant_connections').fetchone()[0]);assert KEY.encode() not in key
    env.init_db();assert len(c.get(BASE).json()['turns'])==2
    c.post('/api/companies/1/users',headers=h,json={'email':'chat-manager@demo.test','password':'chat-manager-long-password'})
    m=TestClient(env.app);mh=auth(m,'chat-manager@demo.test','chat-manager-long-password')
    assert m.get(BASE).json()['turns']==[] and not m.get(BASE).json()['can_connect']
    assert m.post(BASE+'/connection',headers=mh,json={'api_key':KEY}).status_code==403
    assert m.post(BASE+'/messages',headers=mh,json=message('Question gestionnaire')).status_code==201
    assert len(m.get(BASE).json()['turns'])==1 and len(c.get(BASE).json()['turns'])==2
    assert m.post(BASE+'/reset',headers=mh).status_code==200;assert len(c.get(BASE).json()['turns'])==2
    cid=c.post('/api/companies',headers=h,json={'name':'Autre société IA','city':'Lyon','headline':'Test'}).json()['id']
    assert m.get(f'/api/companies/{cid}/assistant').status_code==403
    assert c.get(f'/api/companies/{cid}/assistant').json()['turns']==[]
    assert c.get('/api/companies/999999/assistant').status_code==404
    assert c.post(BASE+'/reset',headers=h).json()['turns']==[]
    assert c.get(BASE).json()['revision']==3

def test_chat_files_vision_pdf_office_and_text_reach_provider(env,monkeypatch):
    c,h=owner(env);calls=connected(c,h,monkeypatch)
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as z:z.writestr('word/document.xml','<document>Document de test</document>')
    files=[attachment('../photo.png',kbis_png()),attachment('devis.pdf',quote_pdf()),attachment('notes.txt','Montant prévu : 250 euros'.encode()),attachment('contrat.docx',out.getvalue())]
    r=c.post(BASE+'/messages',headers=h,json=message('Compare ces documents',files=files));assert r.status_code==201,r.text
    blocks=calls[0]['messages'][0]['content'];assert sum(b['type']=='input_file' for b in blocks)==2
    assert any(b['type']=='input_image' and b['image_url'].startswith('data:image/jpeg;base64,') for b in blocks)
    assert any('250 euros' in b.get('text','') for b in blocks)
    result=r.json()['turn'];assert result['files'][0]['name']=='photo.png';assert 'blocks' not in result and 'data' not in result['files'][0]
    bad=[('faux.png',b'not an image',422),('code.exe',b'MZ...',415),('trop.pdf',quote_pdf(21),413),('x.docx',b'not zip',422)]
    for name,raw,status in bad:
        r=c.post(BASE+'/messages',headers=h,json=message(files=[attachment(name,raw)],revision=1));assert r.status_code==status,(name,r.text)
    assert len(calls)==1 and not c.get(BASE).json()['busy']

def test_chat_failure_releases_lease_and_does_not_invent_answer(env,monkeypatch):
    c,h=owner(env);connected(c,h,monkeypatch)
    async def fail(*a,**kw):raise HTTPException(502,'Fournisseur indisponible')
    monkeypatch.setattr(ar,'provider_response',fail);data=message()
    assert c.post(BASE+'/messages',headers=h,json=data).status_code==502
    assert c.get(BASE).json()['turns']==[] and not c.get(BASE).json()['busy']
    with env.db() as con:con.execute('UPDATE assistant_threads SET busy_until=?',(time.time()+30,))
    assert c.post(BASE+'/messages',headers=h,json=data).status_code==409
    assert c.post(BASE+'/reset',headers=h).status_code==409
    with env.db() as con:con.execute('UPDATE assistant_threads SET busy_until=0')
    async def okay(*a,**kw):return 'Connexion rétablie'
    monkeypatch.setattr(ar,'provider_response',okay)
    assert c.post(BASE+'/messages',headers=h,json=data).json()['turn']['answer']=='Connexion rétablie'

def test_chat_audio_and_video_are_transcribed_and_sampled(env,monkeypatch,tmp_path):
    c,h=owner(env);calls=connected(c,h,monkeypatch)
    audio=io.BytesIO()
    with wave.open(audio,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0\0'*16000)
    seen=[]
    async def transcript(key,raw):seen.append(raw);return 'Je souhaite comparer deux devis.'
    monkeypatch.setattr(ar,'transcribe',transcript)
    r=c.post(BASE+'/messages',headers=h,json=message(files=[attachment('message.wav',audio.getvalue())]));assert r.status_code==201,r.text
    assert seen and any('comparer deux devis' in b.get('text','') for b in calls[-1]['messages'][-1]['content'])
    video=tmp_path/'clip.mp4'
    result=subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','color=green:s=160x120:r=5','-t','2','-c:v','mpeg4',str(video)],capture_output=True,timeout=15);assert result.returncode==0
    r=c.post(BASE+'/messages',headers=h,json=message(files=[attachment('clip.mp4',video.read_bytes())],revision=1));assert r.status_code==201,r.text
    blocks=calls[-1]['messages'][-1]['content'];assert 1<=sum(b['type']=='input_image' for b in blocks)<=6
    assert any('échantillonnées' in b.get('text','') for b in blocks)
    assert r.json()['turn']['files'][0]['kind']=='video'

def test_provider_uses_server_credentials_store_false_and_safe_errors(monkeypatch):
    original=httpx.AsyncClient;seen=[]
    async def handler(req):
        seen.append(req);return httpx.Response(200,json={'output':[{'type':'message','content':[{'type':'output_text','text':'Une réponse vérifiée'}]}]})
    monkeypatch.setattr(ar.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(handler),**kw))
    assert asyncio.run(ar.provider_response(KEY,[{'role':'user','content':'Test'}]))=='Une réponse vérifiée'
    payload=json.loads(seen[0].content);assert payload['store'] is False and seen[0].headers['authorization']=='Bearer '+KEY
    assert KEY not in json.dumps(payload)
