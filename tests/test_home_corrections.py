from test_app import env
from test_workspace_documents import owner
from display_formats import money,person_name

def test_amounts_and_person_names_saved(env):
    assert money(1280000)=='12 800,00 €'
    assert money(435000)=='4 350,00 €'
    assert money(520800)=='5 208,00 €'
    assert person_name('  omar   TOURÉ  ')=='Omar Touré'
    assert person_name('jean-luc d’ORMESSON')=='Jean-Luc D’Ormesson'
    c,h=owner(env);base='/api/companies/1'
    client=c.post(base+'/clients',headers=h,json={'name':'omar touré'}).json()
    assert client['name']=='Omar Touré'
    quote=c.post(base+'/quotations',headers=h,json={'customer_name':'omar touré','title':'Entretien des locaux','lines':[{'description':'Prestation','quantity':1,'unit_price':'5208'}]}).json()
    assert quote['data']['customer_name']=='Omar Touré'
    cards=c.get(base+'/priorities').json()
    assert any('Omar Touré, 5 208,00 €' in p['title'] for p in cards)
    assert not any('EUR' in p['title'] for p in cards)
    assert c.put(base+'/profile',headers=h,json={'confirmed':True,'version':0,'fields':{'first_name':'omar','last_name':'TOURÉ','legal_name':'ACME SAS'}}).status_code==200
    fields=c.get(base+'/profile').json()['fields']
    assert fields=={'first_name':'Omar','last_name':'Touré','legal_name':'ACME SAS'}

def test_replacement_quantity_text(env):
    c,h=owner(env);base='/api/companies/1'
    for n in (1,2):
        c.post(base+'/equipment',headers=h,json={'name':f'Aspirateur {n}','quantity':n,'condition':'worn'})
    descriptions=[p['description'] for p in c.get(base+'/priorities').json() if p['action']['type']=='equipment']
    assert '1 à remplacer' in descriptions and '2 à remplacer' in descriptions
