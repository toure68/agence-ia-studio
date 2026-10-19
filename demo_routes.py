"""Public review uses an immutable synthetic snapshot, never the application DB."""
import json
from pathlib import Path
from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse


def install(app, base: Path):
    @app.get('/demo', include_in_schema=False)
    @app.get('/demo/', include_in_schema=False)
    def demo_home():
        html = (base / 'static/admin.html').read_text()
        html = html.replace('</head>', '<meta name="robots" content="noindex,nofollow"><script src="/static/demo.js?v=review-1" defer></script><script src="/static/demo-treasury.js?v=dial-10" defer></script><link rel="stylesheet" href="/static/demo-home.css?v=center-2"></head>')
        html = html.replace('<body>', '<body data-public-demo="true"><aside class="demo-notice" role="note">Démonstration publique · Données fictives · Lecture seule</aside>')
        return HTMLResponse(html, headers={'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow'})

    @app.api_route('/demo/api/{path:path}', methods=['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], include_in_schema=False)
    def demo_api(path: str, request: Request):
        if request.method not in ('GET', 'HEAD'):
            raise HTTPException(403, 'Démonstration en lecture seule : aucune modification ni aucun envoi.')
        snapshot = json.loads((base / 'demo-data.json').read_text())
        key = '/api/' + path
        if key not in snapshot:
            raise HTTPException(404, 'Cet exemple ne figure pas dans la démonstration.')
        return JSONResponse(snapshot[key], headers={'Cache-Control': 'no-store'})
