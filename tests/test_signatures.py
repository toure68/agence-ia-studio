import io
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader
from test_app import env,auth
from test_workspace_documents import owner

def quote(c,h,**changes):
    data={'customer_name':'Client signature','title':'Prestation signature','lines':[{'description':'Prestation de test','quantity':2,'unit_price':'15'}],**changes}
    return c.post('/api/companies/1/quotations',headers=h,json=data).json()

def signature(q,**changes):
    return {'signer_name':'  Signataire  Test  ','confirmed':True,'content_hash':q['content_hash'],'strokes':[[{'x':.1,'y':.4},{'x':.3,'y':.2},{'x':.5,'y':.7},{'x':.8,'y':.3}]],**changes}

def test_signature_explicit_acceptance_pdf_encryption_and_immutable_version(env):
    c,h=owner(env);q=quote(c,h);path=f"/api/companies/1/quotations/{q['id']}"
    assert q['signature'] is None
    assert c.post(path+'/signature',headers=h,json=signature(q,confirmed=False)).status_code==422
    assert c.get(path).json()['status']=='draft'
    assert c.post(path+'/signature',headers=h,json=signature(q)).status_code==201
    saved=c.get(path).json();assert saved['status']==saved['data']['status']=='accepted'
    assert saved['signature']['signer_name']=='Signataire Test' and saved['content_hash']==q['content_hash']
    assert 'strokes' not in saved['signature'] and saved['signature']['consent'].startswith('J’ai lu ce devis')
    pdf=c.get(path+'/pdf?preview=true');assert pdf.headers['content-disposition'].startswith('inline')
    reader=PdfReader(io.BytesIO(pdf.content));text=''.join(p.extract_text() for p in reader.pages)
    assert 'Signataire Test' in text and 'signature recueillie' in text and '30.00 EUR' in text
    assert b'24 48 m' in b''.join(p.get_contents().get_data() for p in reader.pages)
    assert c.get(path+'/pdf').headers['content-disposition'].startswith('attachment')
    assert c.post(path+'/signature',headers=h,json=signature(q)).status_code==409
    assert c.put(path,headers=h,json={**saved['data'],'title':'Changement après signature'}).status_code==409
    assert c.get(path).json()['data']['title']=='Prestation signature'
    with env.db() as con:
        row=con.execute('SELECT * FROM quotation_signatures').fetchone()
        assert b'Signataire' not in row['payload'] and row['recorded_by'] and row['content_hash']==q['content_hash']
    env.init_db();assert c.get(path).json()['signature']['signer_name']=='Signataire Test'
    assert not any(p['action']['type']=='quote' for p in c.get('/api/companies/1/priorities').json())

def test_stale_expired_declined_and_blank_signature_rejected(env):
    c,h=owner(env);q=quote(c,h);path=f"/api/companies/1/quotations/{q['id']}"
    changed=c.put(path,headers=h,json={**q['data'],'title':'Version modifiée'}).json()
    assert changed['content_hash']!=q['content_hash']
    assert c.post(path+'/signature',headers=h,json=signature(q)).status_code==409
    for strokes in [[],[[{'x':.2,'y':.2},{'x':.2,'y':.2}]],[[{'x':-1,'y':0},{'x':.5,'y':.5}]]]:
        assert c.post(path+'/signature',headers=h,json=signature(changed,strokes=strokes)).status_code==422
    assert c.post(path+'/signature',headers=h,content=b' '*262145).status_code==413
    assert c.get(path).json()['signature'] is None
    for data in [{'valid_until':'2020-01-01'},{'status':'declined'}]:
        other=quote(c,h,**data)
        assert c.post(f"/api/companies/1/quotations/{other['id']}/signature",headers=h,json=signature(other)).status_code==409

def test_signature_company_scope_csrf_and_authenticated_capture(env):
    c,h=owner(env);q=quote(c,h);path=f"/api/companies/1/quotations/{q['id']}/signature"
    assert c.post(path,json=signature(q)).status_code==403
    assert TestClient(env.app).post(path,json=signature(q)).status_code==401
    cid=c.post('/api/companies',headers=h,json={'name':'Société autre','city':'Paris','headline':'Test'}).json()['id']
    assert c.post(f"/api/companies/{cid}/quotations/{q['id']}/signature",headers=h,json=signature(q)).status_code==404
    c.post(f'/api/companies/{cid}/users',headers=h,json={'email':'signature@demo.test','password':'signature-password-long-enough'})
    m=TestClient(env.app);mh=auth(m,'signature@demo.test','signature-password-long-enough')
    assert m.post(path,headers=mh,json=signature(q)).status_code==403
    assert m.get(f"/api/companies/1/quotations/{q['id']}/pdf").status_code==403
