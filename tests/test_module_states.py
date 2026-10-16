from fastapi.testclient import TestClient
from test_app import env,auth
from test_workspace_documents import owner,upload
from document_fixtures import quote_pdf

def test_state_colours_follow_validation_urgency_and_completion(env):
    c,h=owner(env);base='/api/companies/1'
    assert c.get(base+'/cockpit').json()['module_states']=={}
    client=c.post(base+'/clients',headers=h,json={'name':'Client couleurs'}).json()
    assert c.get(base+'/cockpit').json()['module_states']['clients']=={'state':'warning','label':'À valider'}
    c.post(base+f"/clients/{client['id']}/validate",headers=h,json={'revision':client['review_revision']})
    assert c.get(base+'/cockpit').json()['module_states']['clients']['state']=='success'
    work=c.post(base+'/activities',headers=h,json={'title':'Travail couleurs','status':'doing'}).json()
    assert c.get(base+'/cockpit').json()['module_states']['activities']['state']=='info'
    c.put(base+f"/activities/{work['id']}",headers=h,json={'title':'Travail urgent','priority':'urgent','status':'doing'})
    assert c.get(base+'/cockpit').json()['module_states']['activities']['state']=='danger'
    c.patch(base+f"/activities/{work['id']}/status",headers=h,json={'status':'done'})
    assert c.get(base+'/cockpit').json()['module_states']['activities']['state']=='success'
    did=upload(c,h,'quote',quote_pdf(),'document-couleurs.pdf').json()['id']
    assert c.get(base+'/cockpit').json()['module_states']['scanner']['state']=='warning'
    c.post(base+f'/documents/{did}/confirm',headers=h,json={'confirmed':True})
    assert c.get(base+'/cockpit').json()['module_states']['scanner']['state']=='success'
    c.post(base+'/users',headers=h,json={'email':'color@demo.test','password':'color-password-long-enough'})
    manager=TestClient(env.app);auth(manager,'color@demo.test','color-password-long-enough')
    assert 'scanner' not in manager.get(base+'/cockpit').json()['module_states']

def test_worst_state_wins_even_when_priority_is_personally_hidden(env):
    c,h=owner(env);base='/api/companies/1'
    c.post(base+'/activities',headers=h,json={'title':'Travail terminé','status':'done'})
    c.post(base+'/activities',headers=h,json={'title':'Travail bloquant','priority':'urgent'})
    c.post(base+'/activities',headers=h,json={'title':'Travail en cours','status':'doing'})
    card=next(p for p in c.get(base+'/priorities').json() if p['rank']==0)
    c.post(base+'/priorities/dismiss',headers=h,json={'key':card['key']})
    assert c.get(base+'/cockpit').json()['module_states']['activities']['state']=='danger'
