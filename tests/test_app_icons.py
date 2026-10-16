import io
from html.parser import HTMLParser
from PIL import Image
from fastapi.testclient import TestClient
from test_app import env

class HeadLinks(HTMLParser):
    def __init__(self):super().__init__();self.links={};self.meta={}
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='link':self.links[attrs.get('rel')]=attrs
        if tag=='meta':self.meta[attrs.get('name')]=attrs.get('content')

def test_app_installation_metadata_and_supplied_image_icons(env):
    c=TestClient(env.app);head=HeadLinks();head.feed(c.get('/').text)
    assert head.meta['apple-mobile-web-app-capable']=='yes'
    assert head.meta['apple-mobile-web-app-title']=='IA Studio'
    assert head.links['manifest']['href']=='/static/manifest.webmanifest'
    response=c.get(head.links['manifest']['href']);assert response.status_code==200
    assert response.headers['content-type'].split(';')[0]=='application/manifest+json'
    manifest=response.json()
    assert manifest['name']=='Agence IA Studio' and manifest['display']=='standalone'
    assert manifest['id']==manifest['start_url']==manifest['scope']=='/'
    assert manifest['orientation']=='any' and manifest['prefer_related_applications'] is False
    assert {i['sizes'] for i in manifest['icons']}=={'192x192','512x512'}
    paths={head.links['apple-touch-icon']['href']:(180,180),head.links['icon']['href']:(32,32)}
    paths.update({i['src']:tuple(map(int,i['sizes'].split('x'))) for i in manifest['icons']})
    for path,size in paths.items():
        r=c.get(path);assert r.status_code==200 and r.headers['content-type']=='image/png'
        img=Image.open(io.BytesIO(r.content));assert img.size==size and img.mode=='RGB'
        # Opaque white surrounds the smaller rainbow letters, also inside A.
        w,h=img.size
        for x,y in [(0,0),(.98,.98),(.39,.5),(.72,.5)]:
            pixel=img.getpixel((int(x*(w-1)),int(y*(h-1))));assert min(pixel)>245
        colorful=[(x,y) for y in range(h) for x in range(w) if max(img.getpixel((x,y)))-min(img.getpixel((x,y)))>80]
        assert .72<(max(x for x,y in colorful)-min(x for x,y in colorful)+1)/w<.86
    large=Image.open(io.BytesIO(c.get('/static/icons/app-512-v4.png').content)).convert('RGB')
    red=large.getpixel((180,120));green=large.getpixel((90,370))
    assert red[0]>red[1]*1.5 and green[1]>green[0]*1.5
    assert head.links['apple-touch-icon']['sizes']=='180x180'
    assert c.get('/api/companies').status_code==401
