import json
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from test_app import env,auth
from test_office import owner,connect_mail


def imported(env,monkeypatch):
    c,h=owner(env);base,calls=connect_mail(c,h,monkeypatch)
    c.post(base+'/sync',headers=h)
    mid=c.get(base+'/messages').json()[0]['id']
    return c,h,base,mid,calls


def test_mail_ai_explicit_cached_encrypted_and_never_sends(env,monkeypatch):
    import assistant_routes
    c,h,base,mid,gmail_calls=imported(env,monkeypatch);url=base+f'/messages/{mid}/analyse';calls=[]
    async def fake(key,messages,**kw):
        calls.append((key,messages,kw));return 'Résumé privé <script>interdit</script> : facture à vérifier.'
    monkeypatch.setattr(assistant_routes,'provider_response',fake)
    assert c.post(url,headers=h,json={'kind':'summary'}).status_code==503
    assert not calls
    monkeypatch.setenv('OPENAI_API_KEY','sk-test-mail-only')
    assert c.post(url,json={'kind':'summary'}).status_code==403
    assert c.post(url,headers=h,json={'kind':'other'}).status_code==422
    result=c.post(url,headers=h,json={'kind':'summary'});assert result.status_code==200,result.text
    assert result.json()['cached'] is False
    assert c.post(url,headers=h,json={'kind':'summary'}).json()['cached'] is True
    assert len(calls)==1
    with env.db() as con:
        raw=con.execute('SELECT payload FROM mail_ai').fetchone()[0]
        assert b'facture' not in raw and b'script' not in raw
        con.execute('UPDATE mail_messages SET body=? WHERE id=?',('Message modifié',mid))
    assert c.post(url,headers=h,json={'kind':'summary'}).json()['cached'] is False
    assert len(calls)==2
    assert not any(url.endswith('/messages/send') for _,url,_ in gmail_calls)
    assert c.get(base+f'/messages/{mid}').json()['reply_body']==''
    c.post(base+'/disconnect',headers=h)
    with env.db() as con:assert con.execute('SELECT COUNT(*) FROM mail_ai').fetchone()[0]==0


def test_mail_ai_history_private_bounded_and_draft_not_committed(env,monkeypatch):
    import assistant_routes
    c,h,base,mid,_=imported(env,monkeypatch);monkeypatch.setenv('OPENAI_API_KEY','sk-test-mail-only');calls=[]
    with env.db() as con:
        uid=con.execute('SELECT id FROM users WHERE role=\'owner\'').fetchone()[0]
        for n in range(8):
            con.execute("INSERT INTO mail_messages(user_id,company_id,gmail_id,thread_id,sender,reply_to,subject,body,received,category,reply_body,send_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",(uid,1,'old-'+str(n),'thread','Client','client@example.test','Ancien '+str(n),'A'*1600,'','Clients','Brouillon secret','draft'))
        con.execute("INSERT INTO mail_messages(user_id,company_id,gmail_id,thread_id,sender,reply_to,subject,body,received,category) VALUES (?,?,?,?,?,?,?,?,?,?)",(uid,1,'latest','thread','Client','client@example.test','Dernier','Question','','Clients'))
        mid=con.execute('SELECT MAX(id) FROM mail_messages').fetchone()[0]
        con.execute("INSERT INTO mail_messages(user_id,company_id,gmail_id,thread_id,sender,reply_to,subject,body,received,category) VALUES (?,?,?,?,?,?,?,?,?,?)",(uid,1,'other-contact','thread','Autre','other@example.test','Autre','CONFIDENTIEL AUTRE','','Clients'))
    async def fake(key,messages,**kw):calls.append(messages);return 'Bonjour, pourriez-vous préciser votre demande ?'
    monkeypatch.setattr(assistant_routes,'provider_response',fake)
    url=base+f'/messages/{mid}/analyse'
    r=c.post(url,headers=h,json={'kind':'reply'});assert r.status_code==200,r.text
    assert r.json()['history_count']==6 and r.json()['truncated']
    prompt=json.loads(calls[0][0]['content'])
    assert len(prompt['previous'])==6 and all(len(p['body'])==1500 for p in prompt['previous'])
    assert 'Brouillon secret' not in str(prompt) and 'CONFIDENTIEL AUTRE' not in str(prompt)
    assert c.get(base+f'/messages/{mid}').json()['revision']==0
    c.post('/api/companies/1/users',headers=h,json={'email':'other@demo.test','password':'manager-password-long'})
    other=TestClient(env.app);oh=auth(other,'other@demo.test','manager-password-long')
    assert other.post(url,headers=oh,json={'kind':'reply'}).status_code==404
    assert other.post(f'/api/companies/999/mail/messages/{mid}/analyse',headers=oh,json={'kind':'reply'}).status_code==403
    assert TestClient(env.app).post(url,json={'kind':'reply'}).status_code==401
    with env.db() as con:con.execute("UPDATE mail_messages SET send_status='sent' WHERE id=?",(mid,))
    assert c.post(url,headers=h,json={'kind':'reply'}).status_code==409


def test_mail_ai_failure_releases_lease_and_disconnect_during_analysis(env,monkeypatch):
    import assistant_routes
    c,h,base,mid,_=imported(env,monkeypatch);monkeypatch.setenv('OPENAI_API_KEY','sk-test-mail-only');url=base+f'/messages/{mid}/analyse'
    async def fail(*a,**kw):raise HTTPException(503,'Crédit indisponible')
    monkeypatch.setattr(assistant_routes,'provider_response',fail)
    assert c.post(url,headers=h,json={'kind':'summary'}).status_code==503
    with env.db() as con:
        row=con.execute('SELECT * FROM mail_ai').fetchone();assert row['busy_until']==0 and row['payload'] is None
        con.execute('UPDATE mail_ai SET busy_until=9999999999')
    assert c.post(url,headers=h,json={'kind':'summary'}).status_code==409
    with env.db() as con:con.execute('UPDATE mail_ai SET busy_until=0')
    async def disconnected(*a,**kw):
        with env.db() as con:
            con.execute('DELETE FROM mail_messages');con.execute('DELETE FROM mail_ai')
        return 'Résultat à ne pas restaurer'
    monkeypatch.setattr(assistant_routes,'provider_response',disconnected)
    assert c.post(url,headers=h,json={'kind':'summary'}).status_code==404
    with env.db() as con:assert con.execute('SELECT COUNT(*) FROM mail_ai').fetchone()[0]==0


def test_mail_reply_uses_only_confirmed_company_selling_tariffs_and_refreshes_cache(env,monkeypatch):
    import assistant_routes
    from test_workspace_documents import upload
    from document_fixtures import quote_pdf
    c,h,base,mid,_=imported(env,monkeypatch);monkeypatch.setenv('OPENAI_API_KEY','sk-test-tariffs-only')
    did=upload(c,h,'quote',quote_pdf()).json()['id']
    doc=c.get(f'/api/companies/1/documents/{did}').json();rates=doc['proposal']['rates']
    assert rates
    c.post(f'/api/companies/1/documents/{did}/confirm',headers=h,json={'confirmed':True,'profile_fields':{},'rates':[{k:v for k,v in r.items() if k!='source'} for r in rates]})
    cid=c.post('/api/companies',headers=h,json={'name':'Société autre','city':'Paris','headline':'Test séparation tarifs'}).json()['id']
    other_did=upload(c,h,'quote',quote_pdf(),cid=cid).json()['id']
    with env.db() as con:
        con.execute('UPDATE source_documents SET reviewed=1 WHERE id=?',(other_did,))
        con.execute('INSERT INTO imported_tariffs(company_id,document_id,description,unit_price_minor,currency,unit) VALUES (?,?,?,?,?,?)',(cid,other_did,'SECRET AUTRE ENTREPRISE',99999,'USD','forfait'))
        # A not-yet-reviewed source must never ground a selling price.
        unreviewed=upload(c,h,'quote',quote_pdf(2)).json()['id']
        con.execute('INSERT INTO imported_tariffs(company_id,document_id,description,unit_price_minor,currency,unit) VALUES (?,?,?,?,?,?)',(1,unreviewed,'NON VALIDÉ',12300,'EUR','heure'))
    calls=[]
    async def fake(key,messages,**kw):
        calls.append((json.loads(messages[0]['content']),kw));return 'Bonjour, voici une proposition à vérifier avant envoi.'
    monkeypatch.setattr(assistant_routes,'provider_response',fake)
    url=base+f'/messages/{mid}/analyse';r=c.post(url,headers=h,json={'kind':'reply'})
    assert r.status_code==200,r.text
    assert r.json()['tariff_count']==1 and not r.json()['tariffs_limited']
    context,instructions=calls[0]
    assert context['validated_selling_tariffs'][0]['unit_price']=='25.5'
    assert context['validated_selling_tariffs'][0]['currency']=='EUR'
    assert 'SECRET AUTRE ENTREPRISE' not in str(context) and 'NON VALIDÉ' not in str(context)
    assert 'coûts de revient' in instructions['instructions'] and 'aucune remise' in instructions['instructions']
    assert c.post(url,headers=h,json={'kind':'reply'}).json()['cached']
    with env.db() as con:con.execute('UPDATE imported_tariffs SET unit_price_minor=3000 WHERE company_id=1 AND document_id=?',(did,))
    changed=c.post(url,headers=h,json={'kind':'reply'}).json();assert not changed['cached']
    assert calls[-1][0]['validated_selling_tariffs'][0]['unit_price']=='30'
    assert c.get(base+f'/messages/{mid}').json()['reply_body']==''
