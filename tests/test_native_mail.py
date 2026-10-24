import base64
import hashlib
import json
from urllib.parse import urlparse,parse_qs
import httpx
from fastapi.testclient import TestClient
from test_app import env
from test_office import owner,connect_mail
import native_mail


def test_retirement_keeps_mail_and_drafts_and_disables_old_tokens(env,monkeypatch):
    c,h=owner(env)
    from cryptography.fernet import Fernet
    cipher=Fernet(base64.urlsafe_b64encode(hashlib.sha256((env.SECRET+':gmail-tokens').encode()).digest()))
    with env.db() as con:
        uid=con.execute('SELECT id FROM users WHERE email=?',('owner@demo.test',)).fetchone()[0]
        con.execute("INSERT INTO mail_accounts(user_id,company_id,email,token,provider,automatic,grant_hash,mail_service) VALUES (?,1,'owner@example.test','old-secret','nylas',1,'old-account','google')",(uid,))
        mid=con.execute("INSERT INTO mail_messages(user_id,company_id,gmail_id,thread_id,sender,reply_to,subject,body,received,category,provider) VALUES (?,1,'old-message','opaque-thread','Client','client@example.test','Commande','Contenu conservé','','Clients','nylas')",(uid,)).lastrowid
        con.execute("INSERT INTO mail_compositions(user_id,company_id,source_id,mode,payload,account_key,operation,updated) VALUES (?,1,?,'reply',?,'old-account','unique-op',1)",(uid,mid,cipher.encrypt(json.dumps({'source_id':mid,'mode':'reply','to':'client@example.test','subject':'Re: Commande','body':'Réponse conservée','files':[],'forwarded':[]}).encode())))
    native_mail.init_schema(env.db)
    native_mail.init_schema(env.db)
    with env.db() as con:
        a=dict(con.execute('SELECT * FROM mail_accounts').fetchone())
        assert a['provider']=='imported' and a['token']=='' and a['automatic']==0 and a['auth_invalid']==1
        assert con.execute('SELECT body,provider FROM mail_messages WHERE id=?',(mid,)).fetchone()['body']=='Contenu conservé'
        assert con.execute('SELECT count(*) FROM mail_compositions').fetchone()[0]==1
    status=c.get('/api/companies/1/mail/unified/status').json();assert not status['connected']
    assert c.get(f'/api/companies/1/mail/unified/messages/{mid}/thread').json()['messages'][0]['body']=='Contenu conservé'
    assert c.post('/api/mail/unified/webhook',json={}).status_code==404
    assert c.get('/api/mail/unified/callback?code=x').status_code==404
    assert c.post('/api/companies/1/mail/unified/drafts',headers=h,json={}).status_code in (405,409)
    base,calls=connect_mail(c,h,monkeypatch)
    with env.db() as con:
        assert con.execute('SELECT count(*) FROM mail_compositions').fetchone()[0]==1
        assert con.execute('SELECT count(*) FROM mail_messages').fetchone()[0]==1
        assert con.execute('SELECT provider FROM mail_accounts').fetchone()[0]=='gmail'
    preserved=c.get(base+'/unified/drafts/1').json();assert preserved['body']=='Réponse conservée'
    assert c.post(base+'/unified/drafts/1/send',headers=h,json={'revision':preserved['revision'],'confirmed':True}).status_code==200
    outgoing=next(kw['json'] for _,u,kw in calls if u.endswith('/messages/send'));assert 'threadId' not in outgoing


def test_direct_composer_explicit_send_identity_and_uncertain_guard(env,monkeypatch):
    c,h=owner(env);base,calls=connect_mail(c,h,monkeypatch)
    c.post(base+'/sync',headers=h);mid=c.get(base+'/messages').json()[0]['id']
    body={'source_id':mid,'mode':'reply','to':'client@example.test','subject':'Re: Facture client','body':'Bonjour, commande confirmée.','files':[],'forwarded':[]}
    draft=c.put(base+'/unified/drafts',headers=h,json=body).json();did=draft['id']
    assert not any(u.endswith('/messages/send') for _,u,_ in calls)
    url=base+f'/unified/drafts/{did}/send'
    assert c.post(url,headers=h,json={'revision':draft['revision'],'confirmed':False}).status_code==422
    result=c.post(url,headers=h,json={'revision':draft['revision'],'confirmed':True});assert result.status_code==200,result.text
    sent=[kw['json'] for _,u,kw in calls if u.endswith('/messages/send')]
    assert len(sent)==1 and sent[0]['threadId']=='thread-1'
    from email import message_from_bytes
    mime=message_from_bytes(base64.urlsafe_b64decode(sent[0]['raw']))
    assert mime['From']=='owner@example.test' and mime['To']=='client@example.test' and mime['In-Reply-To']=='<test@example.test>'
    assert c.post(url,headers=h,json={'revision':draft['revision'],'confirmed':True}).status_code==409
    new=c.put(base+'/unified/drafts',headers=h,json={**body,'mode':'new','source_id':None}).json()
    import mailbox_routes
    original=mailbox_routes.httpx.request
    def failed(method,url,**kw):
        if url.endswith('/messages/send'):raise httpx.ReadTimeout('simulated')
        return original(method,url,**kw)
    monkeypatch.setattr(mailbox_routes.httpx,'request',failed)
    path=base+f"/unified/drafts/{new['id']}/send";data={'revision':new['revision'],'confirmed':True}
    assert c.post(path,headers=h,json=data).status_code==502
    assert c.post(path,headers=h,json=data).status_code==409


def test_secondary_google_identity_state_and_scope(env,monkeypatch):
    c,h=owner(env);base,calls=connect_mail(c,h,monkeypatch)
    assert c.post(base+'/unified/connect',headers=h,json={'service':'outlook','add':True}).status_code==409
    catalog=c.get(base+'/unified/accounts').json()
    assert [p['id'] for p in catalog['providers'] if p['supported']]==['gmail']
    import mailbox_routes
    previous=mailbox_routes.httpx.request
    def second(method,url,**kw):
        if url.endswith('/profile'):return httpx.Response(200,json={'emailAddress':'second@example.test'})
        return previous(method,url,**kw)
    monkeypatch.setattr(mailbox_routes.httpx,'request',second)
    result=c.post(base+'/unified/connect',headers=h,json={'service':'gmail','add':True,'login_hint':'second@example.test'})
    assert urlparse(result.json()['url']).hostname=='accounts.google.com'
    state=parse_qs(urlparse(result.json()['url']).query)['state'][0]
    assert c.get('/api/mail/gmail/callback',params={'state':state,'code':'code'}).status_code==200
    accounts=c.get(base+'/unified/accounts').json()['accounts'];aid=next(a['id'] for a in accounts if a['email']=='second@example.test')
    assert aid>0 and len(accounts)==2
    assert c.post(base+f'/unified/boxes/{aid}/sync',headers=h).status_code==200
    m=c.get(base+f'/unified/boxes/{aid}/messages').json()[0]
    assert c.get(base+f"/unified/messages/{m['id']}/thread").status_code==404
    assert c.get(base+f"/unified/messages/{m['id']}/thread?account_id={aid}").status_code==200
    assert c.get(base+'/messages').json()==[]
    # Reconnecting is bound to the selected mailbox, not just a typed address.
    result=c.post(base+f'/unified/connect?account_id={aid}',headers=h,json={'service':'gmail'})
    state=parse_qs(urlparse(result.json()['url']).query)['state'][0]
    monkeypatch.setattr(mailbox_routes.httpx,'request',previous)
    assert c.get('/api/mail/gmail/callback',params={'state':state,'code':'code'}).status_code==409
    assert c.get(base+'/unified/accounts').json()['accounts']==accounts


def test_native_labels_attachments_and_encrypted_files(env,monkeypatch):
    c,h=owner(env);base,calls=connect_mail(c,h,monkeypatch)
    c.post(base+'/sync',headers=h);mid=c.get(base+'/messages').json()[0]['id']
    with env.db() as con:
        con.execute('UPDATE mail_messages SET attachments=? WHERE id=?',(json.dumps([{'id':'att','filename':'note.txt','size':4,'content_type':'text/plain'}]),mid))
    import mailbox_routes
    previous=mailbox_routes.httpx.request
    def direct(method,url,**kw):
        assert 'nylas' not in url
        if url.endswith('/labels'):return httpx.Response(200,json={'labels':[{'id':'client','name':'Clients','type':'user'}]})
        if url.endswith('/modify'):
            assert kw['json']=={'addLabelIds':['client'],'removeLabelIds':['INBOX']}
            return httpx.Response(200,json={'labelIds':['client','UNREAD']})
        if url.endswith('/attachments/att'):return httpx.Response(200,json={'data':base64.urlsafe_b64encode(b'Note').decode()})
        return previous(method,url,**kw)
    monkeypatch.setattr(mailbox_routes.httpx,'request',direct)
    root=base+f'/unified/messages/{mid}'
    assert c.post(root+'/action',headers=h,json={'action':'move','folder_id':'foreign'}).status_code==422
    assert c.post(root+'/action',headers=h,json={'action':'move','folder_id':'client'}).status_code==200
    assert c.get(root+'/attachments/att').content==b'Note'
    draft=c.put(base+'/unified/drafts',headers=h,json={'source_id':mid,'mode':'forward','to':'recipient@example.test','subject':'Transfert','body':'Texte conservé','files':[{'name':'test.txt','content_type':'text/plain','data':base64.b64encode(b'Secret').decode()}],'forwarded':['att']})
    assert draft.status_code==200,draft.text
    with env.db() as con:
        blob=con.execute('SELECT payload FROM mail_compositions WHERE id=?',(draft.json()['id'],)).fetchone()[0]
        assert b'Texte conserv' not in blob and base64.b64encode(b'Secret') not in blob
    assert c.get(base+f"/unified/drafts/{draft.json()['id']}").json()['body']=='Texte conservé'
