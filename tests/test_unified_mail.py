import base64
import hashlib
import hmac
import json
from contextlib import contextmanager
from urllib.parse import urlparse,parse_qs

import httpx
from fastapi.testclient import TestClient
from test_app import env,auth
import unified_mail


def connected(env,monkeypatch):
    monkeypatch.setenv('NYLAS_API_KEY','nylas-private-test-key')
    monkeypatch.setenv('NYLAS_CLIENT_ID','client-test')
    monkeypatch.setenv('NYLAS_REDIRECT_URI','https://example.test/api/mail/unified/callback')
    monkeypatch.setenv('NYLAS_WEBHOOK_SECRET','webhook-test-secret')
    c=TestClient(env.app);h=auth(c,'owner@demo.test','correct horse battery staple');calls=[];control={'fail_send':False,'body':'<p>Bonjour, pouvez-vous confirmer la commande ?</p><script>secret()</script>'}
    original={'id':'message-one','thread_id':'thread-one','from':[{'email':'client@example.test','name':'Client'}],'reply_to':[{'email':'client@example.test'}],'subject':'Commande test','body':control['body'],'date':1792760000,'unread':True,'folders':['inbox','project'],'attachments':[{'id':'attachment-one','filename':'note.txt','content_type':'text/plain','size':3}]}
    def request(method,url,**kw):
        calls.append((method,url,kw))
        if url.endswith('/connect/token'):return httpx.Response(200,json={'grant_id':'grant-private-test'})
        if url.endswith('/grants/grant-private-test'):
            return httpx.Response(200,json={'data':{'id':'grant-private-test','email':'owner@example.test','provider':'google'}})
        if url.endswith('/folders'):return httpx.Response(200,json={'data':[{'id':'inbox','name':'Réception','attributes':['\\Inbox']},{'id':'archive','name':'Archives','attributes':['\\Archive']},{'id':'project','name':'Projet','attributes':[]}]})
        if url.endswith('/messages/send'):
            if control['fail_send']:raise httpx.ReadTimeout('Ambiguous send')
            return httpx.Response(200,json={'data':{'id':'sent-one'}})
        if url.endswith('/messages'):return httpx.Response(200,json={'data':[original]})
        if '/messages/' in url:return httpx.Response(200,json={'data':{**original,'body':control['body']}})
        raise AssertionError((method,url))
    @contextmanager
    def stream(*args,**kwargs):yield httpx.Response(200,content=b'abc')
    monkeypatch.setattr(unified_mail.httpx,'request',request);monkeypatch.setattr(unified_mail.httpx,'stream',stream)
    root='/api/companies/1/mail';u=root+'/unified'
    assert c.post(u+'/connect').status_code==403
    conn=c.post(u+'/connect',headers=h);assert conn.status_code==200,conn.text
    state=parse_qs(urlparse(conn.json()['url']).query)['state'][0]
    assert c.get('/api/mail/unified/callback',params={'state':'wrong','code':'test'}).status_code==400
    response=c.get('/api/mail/unified/callback',params={'state':state,'code':'test'});assert response.status_code==200,response.text
    assert c.get('/api/mail/unified/callback',params={'state':state,'code':'test'}).status_code==400
    assert c.post(root+'/sync',headers=h).status_code==200
    mid=c.get(root+'/messages').json()[0]['id']
    return c,h,root,u,mid,calls,control


def test_unified_oauth_sync_attachment_and_scoping(env,monkeypatch):
    c,h,root,u,mid,calls,_=connected(env,monkeypatch)
    status=c.get(u+'/status').json();assert status['connected'] and status['configured'] and status['realtime']
    assert 'key' not in status and 'token' not in status
    with env.db() as con:assert 'grant-private-test' not in con.execute('SELECT token FROM mail_accounts').fetchone()['token']
    assert c.post(root+'/sync',headers=h).status_code==200
    assert len(c.get(root+'/messages').json())==1
    thread=c.get(u+f'/messages/{mid}/thread').json()['messages'];assert len(thread)==1 and 'secret()' not in thread[0]['body']
    assert thread[0]['attachments'][0]['id']=='attachment-one'
    file=c.get(u+f'/messages/{mid}/attachments/attachment-one');assert file.content==b'abc' and file.headers['cache-control']=='no-store'
    assert c.get(u+f'/messages/{mid}/attachments/other').status_code==404
    assert c.get('/api/companies/2/mail/unified/messages/'+str(mid)+'/thread').status_code in (403,404)
    assert TestClient(env.app).get(u+f'/messages/{mid}/thread').status_code==401
    assert not any(url.endswith('/messages/send') for _,url,_ in calls)
    env.init_db();assert c.get(u+'/status').json()['connected']


def test_compositions_revision_explicit_consent_and_no_duplicate_send(env,monkeypatch):
    c,h,root,u,mid,calls,_=connected(env,monkeypatch)
    payload={'mode':'reply','source_id':mid,'to':'client@example.test','subject':'Re: Commande','body':'Bonjour, voici notre réponse.','files':[{'name':'test.txt','data':base64.b64encode(b'abc').decode(),'content_type':'text/plain'}]}
    assert c.put(u+'/drafts',json=payload).status_code==403
    d=c.put(u+'/drafts',headers=h,json=payload).json();assert d['revision']==1
    assert c.post(u+f'/drafts/{d["id"]}/send',headers=h,json={'revision':1}).status_code==422
    changed=c.put(u+'/drafts',headers=h,json={**payload,'id':d['id'],'revision':1,'body':'Réponse corrigée.'}).json();assert changed['revision']==2
    assert c.put(u+'/drafts',headers=h,json={**payload,'id':d['id'],'revision':1}).status_code==409
    path=u+f'/drafts/{d["id"]}/send'
    assert c.post(path,headers=h,json={'revision':1,'confirmed':True}).status_code==409
    assert c.post(path,headers=h,json={'revision':2,'confirmed':True}).json()=={'sent':True}
    assert c.post(path,headers=h,json={'revision':2,'confirmed':True}).status_code==409
    sends=[kw for _,url,kw in calls if url.endswith('/messages/send')];assert len(sends)==1
    assert sends[0]['headers']['Idempotency-Key']
    message=json.loads(sends[0]['files'][0][1][1]);assert message['reply_to_message_id']=='message-one' and message['is_plaintext']
    assert c.get(root+f'/messages/{mid}').json()['send_status']=='sent'
    with env.db() as con:assert b'Bonjour' not in bytes(con.execute('SELECT payload FROM mail_compositions').fetchone()['payload'])


def test_forward_new_and_uncertain_delivery(env,monkeypatch):
    c,h,root,u,mid,calls,control=connected(env,monkeypatch)
    forward={'mode':'forward','source_id':mid,'to':'dest@example.test','subject':'Tr: Commande','body':'Pour information.','forwarded':['attachment-one']}
    assert c.put(u+'/drafts',headers=h,json={**forward,'forwarded':['not-owned']}).status_code==422
    d=c.put(u+'/drafts',headers=h,json=forward).json()
    assert c.post(u+f'/drafts/{d["id"]}/send',headers=h,json={'revision':1,'confirmed':True}).status_code==200
    sent=[kw for _,url,kw in calls if url.endswith('/messages/send')][-1];assert len(sent['files'])==2
    assert 'reply_to_message_id' not in json.loads(sent['files'][0][1][1])
    new={'mode':'new','to':'other@example.test','subject':'Message neuf','body':'Bonjour, nouveau message.'}
    assert c.put(u+'/drafts',headers=h,json={**new,'to':'bad\n@example.test'}).status_code==422
    d=c.put(u+'/drafts',headers=h,json=new).json();control['fail_send']=True
    path=u+f'/drafts/{d["id"]}/send';assert c.post(path,headers=h,json={'revision':1,'confirmed':True}).status_code==502
    assert c.get(u+f'/drafts/{d["id"]}').json()['status']=='uncertain'
    control['fail_send']=False;before=len(calls)
    assert c.post(path,headers=h,json={'revision':1,'confirmed':True}).status_code==409
    assert not any(url.endswith('/messages/send') for _,url,_ in calls[before:])


def test_webhook_signatures_dedup_and_actions(env,monkeypatch):
    c,h,root,u,mid,calls,control=connected(env,monkeypatch)
    event={'id':'event-one','type':'message.updated','data':{'object':{'grant_id':'grant-private-test','id':'message-one'}}};raw=json.dumps(event).encode()
    hook='/api/mail/unified/webhook';assert c.post(hook,content=raw).status_code==403
    sign=hmac.new(b'webhook-test-secret',raw,hashlib.sha256).hexdigest()
    for _ in range(2):assert c.post(hook,content=raw,headers={'x-nylas-signature':sign}).status_code==200
    with env.db() as con:assert con.execute('SELECT count(*) FROM mail_events').fetchone()[0]==1
    control['body']='<p>Nouvelle information.</p>';env.app.state.unified_mail['process_events']()
    assert 'Nouvelle information' in c.get(root+f'/messages/{mid}').json()['body']
    assert c.post(u+f'/messages/{mid}/action',headers=h,json={'action':'read'}).status_code==200
    assert not c.get(root+f'/messages/{mid}').json()['unread']
    assert c.post(u+f'/messages/{mid}/action',headers=h,json={'action':'move','folder_id':'not-my-folder'}).status_code==422
    assert c.post(u+f'/messages/{mid}/action',headers=h,json={'action':'archive'}).status_code==200
    edit=[kw['json'] for method,url,kw in calls if method=='PUT' and '/messages/' in url][-1]
    assert 'project' in edit['folders'] and 'inbox' not in edit['folders']
    assert not any(x.get('action',{}).get('id')==mid and x.get('action',{}).get('type')=='email' for x in c.get('/api/companies/1/priorities').json())
    assert not any(url.endswith('/messages/send') for _,url,_ in calls)


def test_account_replacement_and_attachment_limits(env,monkeypatch):
    c,h,root,u,mid,calls,control=connected(env,monkeypatch)
    assert c.post(u+'/connect',headers=h).status_code==409
    assert c.post(u+'/connect',headers=h,json={'replace_confirmed':True}).status_code==200
    monkeypatch.setattr(unified_mail,'MAX_FILE',2)
    payload={'mode':'new','to':'client@example.test','subject':'Test','body':'Bonjour','files':[{'name':'file.txt','data':base64.b64encode(b'abc').decode()}]}
    assert c.put(u+'/drafts',headers=h,json=payload).status_code==413
    assert c.put(u+'/drafts',headers=h,json={**payload,'files':[{'name':'file.txt','data':'!!!'}]}).status_code==422
    assert c.post(root+'/disconnect',headers=h).status_code==200
    assert not c.get(u+'/status').json()['connected']
    assert c.get(root+'/messages').json()==[]


def test_reauthentication_keeps_draft_and_grant_expiry_is_visible(env,monkeypatch):
    c,h,root,u,mid,calls,control=connected(env,monkeypatch)
    d=c.put(u+'/drafts',headers=h,json={'mode':'new','to':'client@example.test','subject':'Brouillon conservé','body':'Bonjour.'}).json()
    conn=c.post(u+'/connect',headers=h,json={'replace_confirmed':True}).json()
    state=parse_qs(urlparse(conn['url']).query)['state'][0]
    assert c.get('/api/mail/unified/callback',params={'state':state,'code':'test'}).status_code==200
    assert c.post(u+f'/drafts/{d["id"]}/send',headers=h,json={'revision':1,'confirmed':True}).status_code==200
    event={'id':'grant-expired','type':'grant.expired','data':{'object':{'id':'grant-private-test'}}};raw=json.dumps(event).encode()
    sign=hmac.new(b'webhook-test-secret',raw,hashlib.sha256).hexdigest()
    assert c.post('/api/mail/unified/webhook',content=raw,headers={'x-nylas-signature':sign}).status_code==200
    env.app.state.unified_mail['process_events']()
    assert not c.get(u+'/status').json()['connected']
    assert c.post(root+'/sync',headers=h).status_code==409
    assert c.post(root+'/disconnect',headers=h).status_code==200


def test_disconnect_does_not_revoke_another_company_grant(env,monkeypatch):
    c,h,root,u,mid,calls,control=connected(env,monkeypatch)
    cid=c.post('/api/companies',headers=h,json={'name':'Deuxième entreprise','city':'Paris','headline':'Test de séparation'}).json()['id']
    with env.db() as con:
        con.execute('INSERT INTO mail_accounts(user_id,company_id,email,token,provider,grant_hash) SELECT user_id,?,email,token,provider,grant_hash FROM mail_accounts WHERE company_id=1',(cid,))
    before=len(calls);assert c.post(root+'/disconnect',headers=h).status_code==200
    assert not any(method=='DELETE' and '/grants/' in url for method,url,_ in calls[before:])
    assert c.get(f'/api/companies/{cid}/mail/unified/status').json()['connected']


def test_replacing_a_box_revokes_only_the_unused_old_grant(env,monkeypatch):
    c,h,root,u,mid,calls,control=connected(env,monkeypatch)
    c.put(u+'/drafts',headers=h,json={'mode':'new','to':'test@example.test','subject':'Ancien brouillon','body':'Bonjour'})
    original=unified_mail.httpx.request
    def switched(method,url,**kw):
        if url.endswith('/connect/token'):return httpx.Response(200,json={'grant_id':'grant-new'})
        if url.endswith('/grants/grant-new'):return httpx.Response(200,json={'data':{'id':'grant-new','email':'new@example.test','provider':'microsoft'}})
        return original(method,url,**kw)
    monkeypatch.setattr(unified_mail.httpx,'request',switched)
    conn=c.post(u+'/connect',headers=h,json={'replace_confirmed':True}).json();state=parse_qs(urlparse(conn['url']).query)['state'][0]
    assert c.get('/api/mail/unified/callback',params={'state':state,'code':'test'}).status_code==200
    assert c.get(root+'/messages').json()==[] and c.get(u+'/drafts').json()==[]
    assert c.get(u+'/status').json()['email']=='new@example.test'
    assert sum(method=='DELETE' and url.endswith('/grants/grant-private-test') for method,url,_ in calls)==1
    with monkeypatch.context() as cfg:
        cfg.delenv('NYLAS_API_KEY')
        assert not c.get(u+'/status').json()['connected']


def test_multiple_boxes_keep_messages_drafts_sends_and_disconnect_separate(env,monkeypatch):
    c,h,root,u,mid,calls,_=connected(env,monkeypatch)
    previous=unified_mail.httpx.request
    def provider(method,url,**kw):
        if url.endswith('/connect/token'):return httpx.Response(200,json={'grant_id':'second-grant'})
        if url.endswith('/grants/second-grant'):
            if method=='DELETE':return httpx.Response(200,json={})
            return httpx.Response(200,json={'data':{'email':'other@outlook.test','provider':'microsoft'}})
        return previous(method,url,**kw)
    monkeypatch.setattr(unified_mail.httpx,'request',provider)
    conn=c.post(u+'/connect',headers=h,json={'add':True,'service':'outlook','login_hint':'other@outlook.test'});assert conn.status_code==200,conn.text
    params=parse_qs(urlparse(conn.json()['url']).query)
    assert params['provider']==['microsoft'] and params['login_hint']==['other@outlook.test']
    assert c.get('/api/mail/unified/callback',params={'state':params['state'][0],'code':'second'}).status_code==200
    accounts=c.get(u+'/accounts').json()['accounts'];assert len(accounts)==2
    extra=next(a for a in accounts if a['id']>0);aid=extra['id'];q={'account_id':aid}
    assert extra['service']=='outlook' and extra['connected']
    assert c.post(u+f'/boxes/{aid}/sync',headers=h).status_code==200
    listing=c.get(u+f'/boxes/{aid}/messages').json();othermid=listing[0]['id'];assert othermid!=mid
    assert len(c.get(root+'/messages').json())==1
    assert c.get(u+f'/messages/{othermid}/thread').status_code==404
    assert c.get(u+f'/messages/{mid}/thread',params=q).status_code==404
    thread=c.get(u+f'/messages/{othermid}/thread',params=q).json();assert len(thread['messages'])==1 and thread['selected']==othermid
    payload={'mode':'new','to':'receiver@example.test','subject':'Second box','body':'Isolated draft'}
    draft=c.put(u+'/drafts',headers=h,params=q,json=payload);assert draft.status_code==200,draft.text
    did=draft.json()['id'];rev=draft.json()['revision']
    assert c.get(u+f'/drafts/{did}').status_code==404
    assert c.post(u+f'/drafts/{did}/send',headers=h,json={'confirmed':True,'revision':rev}).status_code==404
    assert c.post(u+f'/drafts/{did}/send',headers=h,params=q,json={'confirmed':True,'revision':rev}).status_code==200
    assert any('/grants/second-grant/messages/send' in url for _,url,_ in calls)
    # Provider events identify a grant, never every mailbox in the company.
    event={'id':'second-expired','type':'grant.expired','data':{'object':{'id':'second-grant'}}}
    raw=json.dumps(event).encode();signature=hmac.new(b'webhook-test-secret',raw,hashlib.sha256).hexdigest()
    assert c.post('/api/mail/unified/webhook',content=raw,headers={'x-nylas-signature':signature,'content-type':'application/json'}).status_code==200
    env.app.state.unified_mail['process_events']()
    assert not c.get(u+'/status',params=q).json()['connected']
    assert c.get(u+'/status').json()['connected']
    # Repeated consent updates the same connection rather than creating duplicates.
    state=parse_qs(urlparse(c.post(u+'/connect',headers=h,json={'add':True,'service':'outlook'}).json()['url']).query)['state'][0]
    assert c.get('/api/mail/unified/callback',params={'state':state,'code':'second'}).status_code==200
    assert len(c.get(u+'/accounts').json()['accounts'])==2
    assert c.get(u+f'/drafts/{did}',params=q).json()['status']=='sent'
    assert c.get(u+'/status',params={'account_id':99999}).status_code==404
    assert c.get('/api/companies/2/mail/unified/boxes/'+str(aid)+'/messages').status_code in (403,404)
    assert c.post(u+f'/boxes/{aid}/disconnect').status_code==403
    assert c.post(u+f'/boxes/{aid}/disconnect',headers=h).status_code==200
    assert len(c.get(u+'/accounts').json()['accounts'])==1
    assert c.get(u+'/status').json()['connected']
    assert c.get(root+'/messages/'+str(mid)).status_code==200
    assert c.get(u+f'/drafts/{did}',params=q).status_code==404


def test_provider_catalog_and_new_connection_validation(env,monkeypatch):
    c,h,root,u,mid,_,_=connected(env,monkeypatch)
    catalog=c.get(u+'/accounts').json();ids={p['id'] for p in catalog['providers']}
    assert {'gmail','outlook','icloud','yahoo','zoho','orange','sfr','free','ovh','ionos','other'}<=ids
    assert not any(s in json.dumps(catalog) for s in ['nylas-private-test-key','grant-private-test','token'])
    assert c.post(u+'/connect',headers=h,json={'add':True,'service':'unknown'}).status_code==422
    r=c.post(u+'/connect',headers=h,json={'add':True,'service':'other','login_hint':'contact@mycompany.test'})
    assert parse_qs(urlparse(r.json()['url']).query)['provider']==['generic']
    assert c.get(u+'/status').json()['connected']
