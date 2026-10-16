import base64
import json
from urllib.parse import urlparse,parse_qs

import httpx
from fastapi.testclient import TestClient
from test_app import env,auth


def owner(env):
    c=TestClient(env.app)
    return c,auth(c,'owner@demo.test','correct horse battery staple')


def test_quotation_money_pdf_and_tenant_isolation(env):
    c,h=owner(env);base='/api/companies/1/quotations'
    data={'customer_name':'Client Exemple','customer_email':'client@example.test','title':'Intervention','vat_rate':'20',
          'notes':'Conditions test','lines':[{'description':'Prestation <test>','quantity':'2.5','unit_price':'19.99'},{'description':'Frais','quantity':'1','unit_price':'0.10'}]}
    assert c.post(base,json=data).status_code==403
    r=c.post(base,headers=h,json=data);assert r.status_code==201,r.text
    q=r.json();qid=q['id'];assert q['subtotal_minor']==5008 and q['tax_minor']==1002 and q['total_minor']==6010
    assert q['reference'].startswith('DEV-')
    pdf=c.get(base+f'/{qid}/pdf');assert pdf.status_code==200 and pdf.content.startswith(b'%PDF-')
    assert pdf.headers['cache-control']=='no-store'
    assert c.post(base,headers=h,json={**data,'lines':[]}).status_code==422
    assert c.post(base,headers=h,json={**data,'lines':[{'description':'test','quantity':-1,'unit_price':1}]}).status_code==422
    assert c.put(base+f'/{qid}',headers=h,json={**data,'status':'accepted'}).json()['status']=='accepted'
    env.init_db();assert c.get(base).json()[0]['reference']==q['reference']
    report=c.get('/api/companies/1/reports').json();assert report['quotations']=={'accepted':1}
    assert report['quotation_totals']==[{'currency':'EUR','total_minor':6010}]
    cid=c.post('/api/companies',headers=h,json={'name':'Entreprise deux','city':'Lyon','headline':'Test devis'}).json()['id']
    c.post(f'/api/companies/{cid}/users',headers=h,json={'email':'manager@demo.test','password':'manager-password-very-long'})
    manager=TestClient(env.app);mh=auth(manager,'manager@demo.test','manager-password-very-long')
    assert manager.get(base).status_code==403
    for path in (f'/api/companies/{cid}/quotations/{qid}',f'/api/companies/{cid}/quotations/{qid}/pdf'):
        assert manager.get(path).status_code==404
    assert TestClient(env.app).get(base+f'/{qid}/pdf').status_code==401


def connect_mail(c,h,monkeypatch):
    import mailbox_routes
    monkeypatch.setenv('GMAIL_CLIENT_ID','test-client')
    monkeypatch.setenv('GMAIL_CLIENT_SECRET','test-secret')
    monkeypatch.setenv('GMAIL_REDIRECT_URI','https://example.test/api/mail/gmail/callback')
    calls=[]
    def post(url,**kwargs):
        if 'revoke' in url:return httpx.Response(200,json={})
        if kwargs['data'].get('grant_type')=='authorization_code':return httpx.Response(200,json={'access_token':'access-test','refresh_token':'refresh-private-test','scope':mailbox_routes.SCOPES})
        return httpx.Response(200,json={'access_token':'access-test'})
    def request(method,url,**kwargs):
        calls.append((method,url,kwargs))
        if url.endswith('/profile'):return httpx.Response(200,json={'emailAddress':'owner@example.test'})
        if url.endswith('/messages/send'):return httpx.Response(200,json={'id':'sent-id'})
        if url.endswith('/messages'):return httpx.Response(200,json={'messages':[{'id':'gmail-1'}]})
        body=base64.urlsafe_b64encode(b'<p>Facture test</p><script>bad()</script>').decode().rstrip('=')
        return httpx.Response(200,json={'id':'gmail-1','threadId':'thread-1','payload':{'mimeType':'text/html','body':{'data':body},'headers':[{'name':'From','value':'Client <client@example.test>'},{'name':'Subject','value':'Facture client'},{'name':'Message-ID','value':'<test@example.test>'}]}})
    monkeypatch.setattr(mailbox_routes.httpx,'post',post);monkeypatch.setattr(mailbox_routes.httpx,'request',request)
    base='/api/companies/1/mail'
    c.put(base+'/settings',headers=h,json={'keywords':'Client facture','automatic':False})
    connect=c.post(base+'/connect',headers=h).json()
    state=parse_qs(urlparse(connect['url']).query)['state'][0]
    assert c.get('/api/mail/gmail/callback?state=wrong&code=test').status_code==400
    result=c.get('/api/mail/gmail/callback',params={'state':state,'code':'code-test'},follow_redirects=False)
    assert result.status_code==303,result.text
    assert c.get('/api/mail/gmail/callback',params={'state':state,'code':'code-test'}).status_code==400
    return base,calls


def test_mail_oauth_private_import_review_send_and_deduplication(env,monkeypatch):
    c,h=owner(env);base,calls=connect_mail(c,h,monkeypatch)
    status=c.get(base+'/status').json();assert status['connected'] and not status['automatic'] and 'token' not in status
    with env.db() as con:
        token=con.execute('SELECT token FROM mail_accounts').fetchone()['token']
        assert 'refresh-private-test' not in token
    assert c.post(base+'/sync').status_code==403
    assert c.post(base+'/sync',headers=h).json()['imported']==1
    assert c.post(base+'/sync',headers=h).json()['imported']==0
    messages=c.get(base+'/messages').json();assert len(messages)==1 and messages[0]['category']=='Factures'
    mid=messages[0]['id'];message=c.get(base+f'/messages/{mid}').json()
    assert 'Facture test' in message['body'] and 'bad()' not in message['body']
    assert not any(url.endswith('/messages/send') for _,url,_ in calls)
    reply=base+f'/messages/{mid}/reply';send=base+f'/messages/{mid}/send'
    assert c.put(reply,headers=h,json={'subject':'Réponse\nbad','body':'Bonjour, voici la réponse.'}).status_code==422
    assert c.put(reply,headers=h,json={'subject':'Réponse','body':'[Complétez ici votre réponse]'}).status_code==422
    saved=c.put(reply,headers=h,json={'subject':'Re: Facture client','body':'Bonjour, voici la réponse validée.'}).json()
    assert c.post(send,headers=h,json={'revision':saved['revision'],'confirmed':False}).status_code==422
    assert c.post(send,headers=h,json={'revision':saved['revision']+1,'confirmed':True}).status_code==409
    assert c.post(send,headers=h,json={'revision':saved['revision'],'confirmed':True}).status_code==200
    assert c.post(send,headers=h,json={'revision':saved['revision'],'confirmed':True}).status_code==409
    assert c.put(reply,headers=h,json={'subject':'Changer','body':'Un autre message interdit.'}).status_code==409
    outgoing=[kw['json'] for _,url,kw in calls if url.endswith('/messages/send')]
    assert len(outgoing)==1
    raw=base64.urlsafe_b64decode(outgoing[0]['raw']).decode();assert 'client@example.test' in raw
    assert c.post(base+'/disconnect',headers=h).status_code==200
    assert c.get(base+'/messages').json()==[] and not c.get(base+'/status').json()['connected']


def test_mail_unconfirmed_send_not_retried_and_user_scope(env,monkeypatch):
    c,h=owner(env);base,calls=connect_mail(c,h,monkeypatch)
    c.post(base+'/sync',headers=h);mid=c.get(base+'/messages').json()[0]['id']
    c.post('/api/companies/1/users',headers=h,json={'email':'manager@demo.test','password':'manager-password-very-long'})
    other=TestClient(env.app);mh=auth(other,'manager@demo.test','manager-password-very-long')
    assert other.get(base+'/messages').json()==[]
    assert other.get(base+f'/messages/{mid}').status_code==404
    assert other.post(base+f'/messages/{mid}/send',headers=mh,json={'revision':1,'confirmed':True}).status_code==404
    assert other.get('/api/companies/999/mail/status').status_code==403
    import mailbox_routes
    original=mailbox_routes.httpx.request
    attempts=[]
    def failure(method,url,**kwargs):
        if url.endswith('/messages/send'):
            attempts.append(url);raise httpx.ReadTimeout('uncertain')
        return original(method,url,**kwargs)
    monkeypatch.setattr(mailbox_routes.httpx,'request',failure)
    saved=c.put(base+f'/messages/{mid}/reply',headers=h,json={'subject':'Re: test','body':'Réponse entièrement vérifiée.'}).json()
    body={'confirmed':True,'revision':saved['revision']}
    assert c.post(base+f'/messages/{mid}/send',headers=h,json=body).status_code==502
    assert c.post(base+f'/messages/{mid}/send',headers=h,json=body).status_code==409
    assert len(attempts)==1
    assert c.get(base+f'/messages/{mid}').json()['send_status']=='uncertain'


def test_mail_missing_config_and_lifespan(env,monkeypatch):
    for name in ('GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REDIRECT_URI'):monkeypatch.delenv(name,raising=False)
    with TestClient(env.app) as c:
        h=auth(c,'owner@demo.test','correct horse battery staple');base='/api/companies/1/mail'
        assert c.get(base+'/status').json()['configured'] is False
        assert c.post(base+'/connect',headers=h).status_code==409
        assert c.put(base+'/settings',headers=h,json={'keywords':'!!!','automatic':True}).status_code==422
