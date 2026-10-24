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
    assert head.meta['apple-mobile-web-app-title']=='Super App'
    assert head.links['manifest']['href']=='/static/manifest.webmanifest'
    response=c.get(head.links['manifest']['href']);assert response.status_code==200
    assert response.headers['content-type'].split(';')[0]=='application/manifest+json'
    manifest=response.json()
    assert manifest['name']=='Super App' and manifest['display']=='standalone'
    assert manifest['id']==manifest['start_url']==manifest['scope']=='/'
    assert manifest['orientation']=='any' and manifest['prefer_related_applications'] is False
    assert {i['sizes'] for i in manifest['icons']}=={'192x192','512x512'}
    paths={head.links['apple-touch-icon']['href']:(180,180),head.links['icon']['href']:(32,32)}
    paths.update({i['src']:tuple(map(int,i['sizes'].split('x'))) for i in manifest['icons']})
    for path,size in paths.items():
        r=c.get(path);assert r.status_code==200 and r.headers['content-type']=='image/png'
        img=Image.open(io.BytesIO(r.content));assert img.size==size and img.mode=='RGB'
        # Approved Coo artwork: opaque dark corners, cyan/blue/violet star and white wordmark.
        w,h=img.size
        assert max(img.getpixel((0,0)))<45
        pixels=list(img.getdata())
        assert sum(1 for red,green,blue in pixels if blue>150 and blue>red*1.15)>w*h*.15
        assert sum(1 for red,green,blue in pixels if min(red,green,blue)>225)>w*h*.03
    assert all('-v8.png' in path for path in paths)
    assert head.links['apple-touch-icon']['sizes']=='180x180'
    assert c.get('/api/companies').status_code==401

