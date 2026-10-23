"""Agence IA Studio V2.1: production-gated public forms, tenant CRM, draft-only outreach."""
import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel, Field, field_validator
from dotenv import load_dotenv

BASE = Path(__file__).resolve().parent
load_dotenv(BASE / '.env', override=False)
DB_PATH = Path(os.environ.get('DATABASE_PATH', str(BASE / 'data' / 'app.db')))
APP_ENV = os.environ.get('APP_ENV', 'development')
# Public quote capture is opt-in on deployed production instances.
PUBLIC_QUOTES_ENABLED = os.environ.get('PUBLIC_QUOTES_ENABLED', '0' if APP_ENV == 'production' else '1').lower() in ('1','true','yes')
SECRET = os.environ.get('SESSION_SECRET', '')
if APP_ENV == 'production' and len(SECRET) < 32:
    raise RuntimeError('Production requires SESSION_SECRET >= 32 characters')
SECRET = SECRET or secrets.token_hex(32)
TOKEN = URLSafeTimedSerializer(SECRET, salt='agence-ia-session-v2')
COOKIE = 'aia_session'
SERVICE_META = {
    'home': {'label': 'Nettoyage de logement', 'unit': 2.4, 'min': 60},
    'office': {'label': 'Nettoyage de bureaux', 'unit': 1.9, 'min': 90},
    'after': {'label': 'Nettoyage après travaux', 'unit': 3.6, 'min': 150},
    'windows': {'label': 'Nettoyage de vitres', 'unit': 2.7, 'min': 55},
}
FREQ = {'once': 1, 'weekly': .9, 'monthly': .95}
STATUSES = {'Nouveau', 'À rappeler', 'Devis envoyé', 'Signé', 'Perdu'}
PROSPECT_STAGES = {'À contacter', 'Contacté', 'Réponse reçue', 'Intéressé', 'Démo prévue', 'Accord de principe', 'Signé', 'Refus'}
RATE_BUCKETS = {}
# Stay signed in for 6 months on a device (user request 2026-10-19). Changing the password, or the
# owner recovery, bumps auth_version and still signs every device out at once.
SESSION_SECONDS = 60 * 60 * 24 * 180
app = FastAPI(title='Agence IA Studio V2.1', version='2.1')
app.mount('/static', StaticFiles(directory=BASE / 'static'), name='static')


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def make_hash(password):
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return salt.hex() + ':' + key.hex()


def verify_hash(password, packed):
    try:
        salt, expected = packed.split(':')
        got = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
        return hmac.compare_digest(got, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


@contextmanager
def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=12, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    conn.execute('PRAGMA busy_timeout=12000')
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    with db() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS companies (
          id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL, city TEXT NOT NULL, headline TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '#14866e', phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '', rates TEXT NOT NULL, created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','manager')),
          company_id INTEGER REFERENCES companies(id), created TEXT NOT NULL, auth_version INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS leads (
          id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id),
          name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
          service TEXT NOT NULL, area REAL NOT NULL, frequency TEXT NOT NULL,
          amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Nouveau',
          notes TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS prospects (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sector TEXT NOT NULL,
          city TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '',
          diagnosis TEXT NOT NULL DEFAULT '', stage TEXT NOT NULL DEFAULT 'À contacter',
          created TEXT NOT NULL, updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS interactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT, prospect_id INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
          direction TEXT NOT NULL CHECK(direction IN ('reçu','envoyé','note')),
          body TEXT NOT NULL, created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS drafts (
          id INTEGER PRIMARY KEY AUTOINCREMENT, prospect_id INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
          subject TEXT NOT NULL, body TEXT NOT NULL, provider TEXT NOT NULL, created TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id, created);
        CREATE INDEX IF NOT EXISTS idx_prospect_stage ON prospects(stage);
        CREATE INDEX IF NOT EXISTS idx_interactions_prospect ON interactions(prospect_id, created);
        CREATE TABLE IF NOT EXISTS calendar_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER NOT NULL REFERENCES companies(id),
          title TEXT NOT NULL, description TEXT NOT NULL,
          first_due TEXT NOT NULL, monthly INTEGER NOT NULL DEFAULT 0,
          created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS task_completions (
          task_id INTEGER NOT NULL REFERENCES calendar_tasks(id),
          occurrence TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id),
          completed TEXT NOT NULL, PRIMARY KEY(task_id, occurrence));
        CREATE TABLE IF NOT EXISTS priority_dismissals (
          user_id INTEGER NOT NULL REFERENCES users(id),
          priority_key TEXT NOT NULL, PRIMARY KEY(user_id, priority_key));
        ''')
        # Migration for databases created by V2, without discarding customer data.
        fields={r['name'] for r in con.execute('PRAGMA table_info(users)').fetchall()}
        if 'auth_version' not in fields:
            con.execute('ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1')
        if 'wallpaper' not in fields:
            con.execute("ALTER TABLE users ADD COLUMN wallpaper TEXT NOT NULL DEFAULT 'nuit'")
        if 'prefs' not in fields:
            con.execute("ALTER TABLE users ADD COLUMN prefs TEXT NOT NULL DEFAULT '{}'")
        if not con.execute('SELECT 1 FROM companies').fetchone():
            con.execute('INSERT INTO companies(slug,name,city,headline,color,phone,email,rates,created) VALUES (?,?,?,?,?,?,?,?,?)',
                        ('eclat-proprete','Éclat Propreté','Paris', 'Un espace impeccable, un esprit tranquille.', '#14866e', '', '', json.dumps(SERVICE_META,ensure_ascii=False),utcnow()))
        email = os.environ.get('ADMIN_EMAIL', '').strip().lower()
        pwd = os.environ.get('ADMIN_PASSWORD', '')
        if not con.execute("SELECT 1 FROM users WHERE role='owner'").fetchone() and email and len(pwd) >= 12:
            con.execute('INSERT INTO users(email,password_hash,role,company_id,created) VALUES (?,?,?,?,?)',
                        (email, make_hash(pwd), 'owner', None, utcnow()))
        # Owner recovery (no e-mail service needed): set ADMIN_PASSWORD_RESET=1 with ADMIN_EMAIL and a new
        # ADMIN_PASSWORD (12+ characters) in the host's variables, redeploy, sign in, then remove the flag.
        # Only the owner account with that e-mail is affected; every existing session of it is revoked.
        if os.environ.get('ADMIN_PASSWORD_RESET', '').strip().lower() in ('1', 'true', 'yes', 'oui') and email and len(pwd) >= 12:
            con.execute("UPDATE users SET password_hash=?, auth_version=auth_version+1 WHERE lower(email)=? AND role='owner'",
                        (make_hash(pwd), email))

    from business_routes import init_schema as init_business_schema
    init_business_schema(db)
    from quotation_routes import init_schema as init_quotation_schema
    from mailbox_routes import init_schema as init_mailbox_schema
    init_quotation_schema(db)
    init_mailbox_schema(db)
    from zero_routes import init_schema as init_zero_schema
    init_zero_schema(db)
    from workspace_routes import init_schema as init_workspace_schema
    from document_routes import init_schema as init_document_schema
    init_workspace_schema(db)
    init_document_schema(db)
    from assistant_routes import init_schema as init_assistant_schema
    init_assistant_schema(db)
    from social_routes import init_schema as init_social_schema
    init_social_schema(db)
    from ai_budget import init_schema as init_budget_schema
    init_budget_schema(db)


init_db()

from priority_routes import install as install_priorities
install_priorities(app, db, require=lambda *a, **kw: require(*a, **kw),
                   own_company=lambda *a: own_company(*a), utcnow=utcnow)
from business_routes import install as install_business
install_business(app, db, require=lambda *a, **kw: require(*a, **kw),
                 own_company=lambda *a: own_company(*a), utcnow=utcnow)

from quotation_routes import install as install_quotations
install_quotations(app, db, require=lambda *a, **kw: require(*a, **kw), own_company=lambda *a: own_company(*a), utcnow=utcnow, secret=SECRET)
from mailbox_routes import install as install_mailbox
install_mailbox(app, db, require=lambda *a, **kw: require(*a, **kw), own_company=lambda *a: own_company(*a), utcnow=utcnow, secret=SECRET, throttle=lambda *a:throttle(*a))

from zero_routes import install as install_zero
install_zero(app, db, require=lambda *a, **kw: require(*a, **kw), own_company=lambda *a: own_company(*a), utcnow=utcnow)
from bank_routes import install as install_banks
install_banks(app,db,require=lambda *a,**kw:require(*a,**kw),own_company=lambda *a:own_company(*a),utcnow=utcnow)
from workspace_routes import install as install_workspace
install_workspace(app,db,require=lambda *a,**kw:require(*a,**kw),own_company=lambda *a:own_company(*a))
from document_routes import install as install_documents
install_documents(app,db,require=lambda *a,**kw:require(*a,**kw),own_company=lambda *a:own_company(*a),utcnow=utcnow,secret=SECRET)
from assistant_routes import install as install_assistant
install_assistant(app,db,require=lambda *a,**kw:require(*a,**kw),own_company=lambda *a:own_company(*a),utcnow=utcnow,secret=SECRET,throttle=lambda *a:throttle(*a))
from social_routes import install as install_social
install_social(app,db,require=lambda *a,**kw:require(*a,**kw),own_company=lambda *a:own_company(*a),utcnow=utcnow)
import ai_budget
ai_budget.install(app,db,require=lambda *a,**kw:require(*a,**kw),own_company=lambda *a:own_company(*a))

@app.middleware('http')
async def ai_call_scope(request:Request,call_next):
    match=re.match(r'^/api/companies/(\d+)/',request.url.path)
    cid=int(match.group(1)) if match else None
    operation='email' if '/mail/' in request.url.path else 'connexion' if request.url.path.endswith('/connection') else 'assistant' if '/assistant/' in request.url.path else 'prospection plateforme'
    try:uid=get_user(request)['id'] if request.url.path.startswith('/api/') else None
    except HTTPException:uid=None
    token=ai_budget.CONTEXT.set((db,cid,uid,operation))
    try:return await call_next(request)
    finally:ai_budget.CONTEXT.reset(token)


@app.middleware('http')
async def headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    if APP_ENV == 'production':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000'
    demo_path = request.url.path == '/demo' or request.url.path.startswith('/demo/') or request.url.path in ('/static/demo.js', '/static/demo-treasury.js')
    if demo_path or request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    elif response.headers.get('content-type', '').startswith('text/html'):
        # Pages are checked on every opening, so a new version shows at once (scripts and styles are versioned).
        response.headers['Cache-Control'] = 'no-cache'
    else:
        response.headers['Cache-Control'] = 'public, max-age=300'
    return response


class LoginInput(BaseModel):
    email: str = Field(min_length=5, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class CompanyInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    city: str = Field(min_length=2, max_length=100)
    headline: str = Field(min_length=2, max_length=220)
    color: str = '#14866e'
    phone: str = Field(default='', max_length=60)
    email: str = Field(default='', max_length=200)

    @field_validator('color')
    @classmethod
    def valid_color(cls, v):
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', v):
            raise ValueError('Couleur hexadécimale invalide')
        return v


class RatePrice(BaseModel):
    unit: float = Field(gt=0, le=100000)
    minimum: float = Field(gt=0, le=1000000)


class RatesUpdate(BaseModel):
    rates: dict[str, RatePrice]


class QuoteInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=5, max_length=50)
    email: str = Field(default='', max_length=180)
    service: str
    area: float = Field(ge=10, le=20000)
    frequency: str
    privacy_ack: bool
    website: str = ''  # hidden honeypot


class LeadPatch(BaseModel):
    status: str
    notes: str = Field(default='', max_length=4000)


class ProspectInput(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    sector: str = Field(min_length=2, max_length=100)
    city: str = Field(default='', max_length=100)
    website: str = Field(default='', max_length=255)
    email: str = Field(default='', max_length=200)
    contact: str = Field(default='', max_length=150)
    diagnosis: str = Field(default='', max_length=3000)
    stage: str = 'À contacter'


class StagePatch(BaseModel):
    stage: str


class InteractionInput(BaseModel):
    direction: str
    body: str = Field(min_length=2, max_length=6000)


class DraftRequest(BaseModel):
    objective: str = Field(default='premier_contact', max_length=100)


class PasswordChangeInput(BaseModel):
    old_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=12, max_length=200)


class MemberInput(BaseModel):
    email: str = Field(min_length=5, max_length=180)
    password: str = Field(min_length=12, max_length=150)


def throttle(key, limit, seconds):
    now = time.monotonic()
    RATE_BUCKETS[key] = [t for t in RATE_BUCKETS.get(key, []) if now - t < seconds]
    if len(RATE_BUCKETS[key]) >= limit:
        raise HTTPException(429, 'Trop de tentatives, réessayez plus tard.')
    RATE_BUCKETS[key].append(now)


def get_user(req):
    cookie = req.cookies.get(COOKIE)
    if not cookie:
        raise HTTPException(401, 'Authentification nécessaire')
    try:
        data = TOKEN.loads(cookie, max_age=SESSION_SECONDS)
    except (BadSignature, SignatureExpired):
        raise HTTPException(401, 'Session expirée')
    with db() as con:
        row = con.execute('SELECT id,email,role,company_id,auth_version,wallpaper,prefs FROM users WHERE id=?', (data.get('uid'),)).fetchone()
    if not row or row['auth_version'] != data.get('auth_version'):
        raise HTTPException(401, 'Session expirée ou révoquée')
    user = dict(row)
    try:
        user['prefs'] = json.loads(user.get('prefs') or '{}')
    except ValueError:
        user['prefs'] = {}
    user['csrf'] = data.get('csrf')
    return user


def require(req, tenant_id=None, owner=False, write=False):
    user = get_user(req)
    if owner and user['role'] != 'owner':
        raise HTTPException(403, 'Réservé à la direction')
    if tenant_id is not None and user['role'] != 'owner' and user['company_id'] != tenant_id:
        raise HTTPException(403, 'Entreprise non autorisée')
    if write and not hmac.compare_digest(str(req.headers.get('x-csrf-token', '')), str(user['csrf'])):
        raise HTTPException(403, 'Protection CSRF : requête refusée')
    return user


def as_company(row):
    value = dict(row)
    value['rates'] = json.loads(value['rates'])
    return value


def own_company(con, cid):
    row = con.execute('SELECT * FROM companies WHERE id=?', (cid,)).fetchone()
    if not row:
        raise HTTPException(404, 'Entreprise introuvable')
    return row


def clean_slug(name):
    import unicodedata
    normalized = unicodedata.normalize('NFKD', name).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',normalized).strip('-') or 'entreprise'


@app.get('/')
def home():
    return FileResponse(BASE / 'static' / 'admin.html')


from demo_routes import install as install_demo
install_demo(app, BASE)


@app.get('/site/{slug}')
def public_site(slug: str):
    return FileResponse(BASE / 'static' / 'site.html')


@app.get('/health')
def health():
    return {'ok': True}


@app.get('/api/setup')
def setup_state():
    with db() as con:
        ready = bool(con.execute("SELECT 1 FROM users WHERE role='owner'").fetchone())
    return {'ready': ready}


@app.post('/api/login')
def login(data: LoginInput, req: Request, response: Response):
    throttle('login:'+ (req.client.host if req.client else 'unknown'), 12, 900)
    with db() as con:
        user = con.execute('SELECT * FROM users WHERE email=?', (data.email.strip().lower(),)).fetchone()
    if not user or not verify_hash(data.password, user['password_hash']):
        raise HTTPException(401, 'Identifiants incorrects')
    csrf = secrets.token_urlsafe(32)
    signed = TOKEN.dumps({'uid': user['id'], 'csrf': csrf, 'auth_version': user['auth_version']})
    response.set_cookie(COOKIE, signed, max_age=SESSION_SECONDS, httponly=True, secure=APP_ENV == 'production', samesite='lax', path='/')
    return {'ok': True, 'csrf': csrf}


@app.post('/api/logout')
def logout(req: Request, response: Response):
    require(req, write=True)
    response.delete_cookie(COOKIE, path='/')
    return {'ok': True}


@app.post('/api/password')
def change_password(data: PasswordChangeInput, req: Request, response: Response):
    user = require(req, write=True)
    if data.old_password == data.new_password:
        raise HTTPException(422, 'Choisissez un mot de passe différent')
    with db() as con:
        record = con.execute('SELECT password_hash FROM users WHERE id=?', (user['id'],)).fetchone()
        if not record or not verify_hash(data.old_password, record['password_hash']):
            raise HTTPException(403, 'Mot de passe actuel incorrect')
        con.execute('UPDATE users SET password_hash=?, auth_version=auth_version+1 WHERE id=?',
                    (make_hash(data.new_password), user['id']))
    # Every previous session of this user is now revoked.
    response.delete_cookie(COOKIE, path='/')
    return {'ok': True, 'relogin_required': True}


@app.get('/api/me')
def me(req: Request):
    user = require(req)
    return user


# Home wallpaper chosen by each user (glass design). Only the presets below are accepted.
WALLPAPERS = ('nuit', 'emeraude', 'ocean', 'couchant', 'aurore', 'liquide', 'sable')


class WallpaperInput(BaseModel):
    wallpaper: str


@app.put('/api/me/wallpaper')
def set_wallpaper(data: WallpaperInput, req: Request):
    user = require(req, write=True)
    if data.wallpaper not in WALLPAPERS:
        raise HTTPException(400, 'Fond d’écran inconnu')
    with db() as con:
        con.execute('UPDATE users SET wallpaper=? WHERE id=?', (data.wallpaper, user['id']))
    return {'ok': True, 'wallpaper': data.wallpaper}


# Home settings kept in the account (22/10), so they follow the user on any phone or address:
# reader mode, trial messages, function grid. Only these keys and values are accepted.
def clean_prefs(raw):
    out = {}
    for key in ('reader', 'samples'):
        if raw.get(key) in ('on', 'off'):
            out[key] = raw[key]
    grid = raw.get('grid')
    if isinstance(grid, dict) and grid.get('cols') in (2, 3, 4) and isinstance(grid.get('rows'), int) and 1 <= grid['rows'] <= 3:
        out['grid'] = {'cols': grid['cols'], 'rows': grid['rows']}
    return out


@app.put('/api/me/prefs')
async def set_prefs(req: Request):
    user = require(req, write=True)
    try:
        raw = await req.json()
    except ValueError:
        raise HTTPException(400, 'Réglages illisibles')
    if not isinstance(raw, dict):
        raise HTTPException(400, 'Réglages illisibles')
    prefs = {**(user.get('prefs') or {}), **clean_prefs(raw)}
    with db() as con:
        con.execute('UPDATE users SET prefs=? WHERE id=?', (json.dumps(prefs), user['id']))
    return {'ok': True, 'prefs': prefs}


@app.get('/api/companies')
def list_companies(req: Request):
    user = require(req)
    with db() as con:
        if user['role'] == 'owner':
            rows = con.execute('SELECT * FROM companies ORDER BY id').fetchall()
        else:
            rows = con.execute('SELECT * FROM companies WHERE id=?', (user['company_id'],)).fetchall()
    return [as_company(x) for x in rows]


@app.post('/api/companies', status_code=201)
def create_company(data: CompanyInput, req: Request):
    require(req, owner=True, write=True)
    slug = clean_slug(data.name)
    with db() as con:
        base = slug
        k = 1
        while con.execute('SELECT 1 FROM companies WHERE slug=?', (slug,)).fetchone():
            k += 1
            slug = f'{base}-{k}'
        cur = con.execute('INSERT INTO companies(slug,name,city,headline,color,phone,email,rates,created) VALUES (?,?,?,?,?,?,?,?,?)',
                   (slug, data.name, data.city, data.headline, data.color, data.phone, data.email, json.dumps(SERVICE_META,ensure_ascii=False), utcnow()))
        row = own_company(con, cur.lastrowid)
    return as_company(row)


@app.put('/api/companies/{cid}')
def update_company(cid: int, data: CompanyInput, req: Request):
    require(req, tenant_id=cid, write=True)
    with db() as con:
        own_company(con,cid)
        con.execute('UPDATE companies SET name=?,city=?,headline=?,color=?,phone=?,email=? WHERE id=?',
                    (data.name,data.city,data.headline,data.color,data.phone,data.email,cid))
        row = own_company(con,cid)
    return as_company(row)


@app.put('/api/companies/{cid}/rates')
def update_rates(cid: int, data: RatesUpdate, req: Request):
    require(req, tenant_id=cid, write=True)
    if set(data.rates) != set(SERVICE_META):
        raise HTTPException(422, 'Quatre prestations obligatoires')
    rates = {key: {'label': SERVICE_META[key]['label'], 'unit': val.unit, 'min': val.minimum}
             for key, val in data.rates.items()}
    with db() as con:
        own_company(con, cid)
        con.execute('UPDATE companies SET rates=? WHERE id=?', (json.dumps(rates, ensure_ascii=False), cid))
    return {'ok': True, 'rates': rates}


@app.post('/api/companies/{cid}/users', status_code=201)
def create_manager(cid: int, data: MemberInput, req: Request):
    require(req, owner=True, write=True)
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', data.email):
        raise HTTPException(422, 'Email invalide')
    with db() as con:
        own_company(con,cid)
        try:
            con.execute('INSERT INTO users(email,password_hash,role,company_id,created) VALUES (?,?,?,?,?)',
                       (data.email.strip().lower(),make_hash(data.password),'manager',cid,utcnow()))
        except sqlite3.IntegrityError:
            raise HTTPException(409, 'Cet email possède déjà un compte')
    return {'ok':True}


@app.get('/api/companies/{cid}/leads')
def list_leads(cid: int, req: Request):
    require(req, tenant_id=cid)
    with db() as con:
        own_company(con,cid)
        rows=con.execute('SELECT * FROM leads WHERE company_id=? ORDER BY id DESC', (cid,)).fetchall()
    return [dict(x) for x in rows]


@app.patch('/api/companies/{cid}/leads/{lid}')
def patch_lead(cid: int, lid: int, data: LeadPatch, req: Request):
    require(req, tenant_id=cid, write=True)
    if data.status not in STATUSES:
        raise HTTPException(422, 'Statut invalide')
    with db() as con:
        cur=con.execute('UPDATE leads SET status=?,notes=?,updated=? WHERE id=? AND company_id=?',
                        (data.status,data.notes,utcnow(),lid,cid))
        if not cur.rowcount:
            raise HTTPException(404, 'Demande introuvable dans cette entreprise')
        row=con.execute('SELECT * FROM leads WHERE id=? AND company_id=?',(lid,cid)).fetchone()
    return dict(row)


@app.get('/api/public/{slug}')
def public_company(slug: str):
    with db() as con:
        row = con.execute('SELECT * FROM companies WHERE slug=?', (slug,)).fetchone()
    if not row:
        raise HTTPException(404, 'Entreprise inconnue')
    item=as_company(row)
    return {**{k:item[k] for k in ('slug','name','city','headline','color','phone','email','rates')}, 'quotes_enabled': PUBLIC_QUOTES_ENABLED}


@app.post('/api/public/{slug}/quotes',status_code=201)
def public_quote(slug:str, data:QuoteInput, req:Request):
    if not PUBLIC_QUOTES_ENABLED:
        raise HTTPException(503, 'Formulaire désactivé : mode démonstration, aucune donnée client collectée.')
    throttle('quote:'+ (req.client.host if req.client else 'unknown'), 15, 3600)
    if data.website:
        return {'ok': True}  # honeypot: no storage
    if not data.privacy_ack:
        raise HTTPException(422,'Confirmez avoir lu la politique de confidentialité')
    if data.service not in SERVICE_META or data.frequency not in FREQ:
        raise HTTPException(422,'Prestation ou fréquence invalide')
    with db() as con:
        row=con.execute('SELECT * FROM companies WHERE slug=?',(slug,)).fetchone()
        if not row:
            raise HTTPException(404,'Entreprise inconnue')
        rate=json.loads(row['rates'])[data.service]
        estimate=round(max(rate['min'],data.area*rate['unit'])*FREQ[data.frequency])
        cur=con.execute('''INSERT INTO leads(company_id,name,phone,email,service,area,frequency,amount,created,updated)
                        VALUES (?,?,?,?,?,?,?,?,?,?)''',(row['id'],data.name.strip(),data.phone.strip(),data.email.strip(),data.service,
                       data.area,data.frequency,estimate,utcnow(),utcnow()))
    return {'ok':True,'reference':cur.lastrowid,'estimate':estimate}


def csv_safe(value):
    # Stop spreadsheet software treating CRM input as a formula upon CSV open.
    item = str(value if value is not None else '')
    if item.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')):
        return "'" + item
    return item


@app.get('/api/companies/{cid}/leads-export')
def export_leads(cid: int, req: Request):
    require(req, tenant_id=cid)
    with db() as con:
        own_company(con, cid)
        rows = [dict(x) for x in con.execute('''SELECT name, phone, email, service, area, frequency,
                     amount, status, notes, created FROM leads WHERE company_id=? ORDER BY id DESC''', (cid,)).fetchall()]
    out = io.StringIO()
    writer = csv.writer(out, delimiter=';')
    keys = ('name','phone','email','service','area','frequency','amount','status','notes','created')
    writer.writerow(['Client','Téléphone','Email','Prestation','Surface m²','Fréquence','Estimation €','Statut','Notes','Date'])
    for row in rows:
        writer.writerow([csv_safe(row[key]) for key in keys])
    return Response(content='\ufeff'+out.getvalue(), media_type='text/csv; charset=utf-8',
                    headers={'Content-Disposition':f'attachment; filename="demandes-entreprise-{cid}.csv"'})


@app.get('/api/prospects')
def list_prospects(req: Request):
    require(req,owner=True)
    with db() as con:
        rows=con.execute('SELECT * FROM prospects ORDER BY id DESC').fetchall()
    return [dict(x) for x in rows]


@app.post('/api/prospects',status_code=201)
def add_prospect(data:ProspectInput,req:Request):
    require(req,owner=True,write=True)
    if data.stage not in PROSPECT_STAGES:
        raise HTTPException(422,'Statut invalide')
    with db() as con:
        cur=con.execute('''INSERT INTO prospects(name,sector,city,website,email,contact,diagnosis,stage,created,updated)
                         VALUES (?,?,?,?,?,?,?,?,?,?)''',(data.name,data.sector,data.city,data.website,data.email,
                         data.contact,data.diagnosis,data.stage,utcnow(),utcnow()))
        row=con.execute('SELECT * FROM prospects WHERE id=?',(cur.lastrowid,)).fetchone()
    return dict(row)


@app.patch('/api/prospects/{pid}')
def patch_prospect(pid:int,data:StagePatch,req:Request):
    require(req,owner=True,write=True)
    if data.stage not in PROSPECT_STAGES:
        raise HTTPException(422,'Statut invalide')
    with db() as con:
        cur=con.execute('UPDATE prospects SET stage=?,updated=? WHERE id=?',(data.stage,utcnow(),pid))
        if not cur.rowcount:
            raise HTTPException(404,'Prospect introuvable')
        row=con.execute('SELECT * FROM prospects WHERE id=?',(pid,)).fetchone()
    return dict(row)


@app.get('/api/prospects/{pid}/history')
def prospect_history(pid:int,req:Request):
    require(req,owner=True)
    with db() as con:
        if not con.execute('SELECT 1 FROM prospects WHERE id=?',(pid,)).fetchone():
            raise HTTPException(404,'Prospect introuvable')
        interactions=[dict(x) for x in con.execute('SELECT * FROM interactions WHERE prospect_id=? ORDER BY id DESC',(pid,)).fetchall()]
        drafts=[dict(x) for x in con.execute('SELECT * FROM drafts WHERE prospect_id=? ORDER BY id DESC',(pid,)).fetchall()]
    return {'interactions':interactions,'drafts':drafts}


@app.get('/api/prospects/{pid}/next-action')
def next_prospect_action(pid: int, req: Request):
    """Decision aid only; never sends messages or signs an agreement."""
    require(req, owner=True)
    with db() as con:
        p = con.execute('SELECT stage FROM prospects WHERE id=?', (pid,)).fetchone()
        if not p:
            raise HTTPException(404, 'Prospect introuvable')
        last = con.execute('SELECT direction, body FROM interactions WHERE prospect_id=? ORDER BY id DESC LIMIT 1', (pid,)).fetchone()
    stage = p['stage']
    actions = {
        'À contacter': ('Préparer un premier message court et personnalisé', 'premier_contact', False),
        'Contacté': ('Vérifier le délai depuis le dernier contact avant une éventuelle relance', 'relance', False),
        'Réponse reçue': ('Lire la réponse et préparer une réponse adaptée', 'objection', False),
        'Intéressé': ('Proposer une démonstration et confirmer les besoins', 'objection', False),
        'Démo prévue': ('Préparer une démonstration adaptée à l’entreprise', None, False),
        'Accord de principe': ('Faire valider les conditions commerciales et le contrat par un responsable humain', None, True),
        'Signé': ('Préparer l’intégration du client et ses accès, après contrôle du contrat', None, True),
        'Refus': ('Ne plus relancer ce prospect sans nouvelle demande de sa part', None, True),
    }
    title, draft_objective, human = actions[stage]
    return {'stage':stage, 'recommended_action':title, 'draft_objective':draft_objective,
            'human_review_required':human, 'last_interaction_type':last['direction'] if last else None,
            'sending_enabled':False}


@app.post('/api/prospects/{pid}/history',status_code=201)
def log_interaction(pid:int,data:InteractionInput,req:Request):
    require(req,owner=True,write=True)
    if data.direction not in {'reçu','envoyé','note'}:
        raise HTTPException(422,'Type de message invalide')
    with db() as con:
        if not con.execute('SELECT 1 FROM prospects WHERE id=?',(pid,)).fetchone():
            raise HTTPException(404,'Prospect introuvable')
        cur=con.execute('INSERT INTO interactions(prospect_id,direction,body,created) VALUES (?,?,?,?)',
                       (pid,data.direction,data.body.strip(),utcnow()))
    return {'ok':True,'id':cur.lastrowid}


def fallback_draft(p, history, objective):
    name=p['name']; sector=p['sector']; city=p['city'] or 'votre secteur'
    if objective=='relance':
        return ('Suite à notre proposition', f"Bonjour,\n\nJe me permets de revenir vers vous concernant notre proposition pour {name}. Notre solution permet de centraliser les demandes de devis et de répondre plus rapidement aux clients. Seriez-vous disponible pour une courte démonstration ?\n\nBien cordialement,\nÉquipe Agence IA Studio")
    if objective=='objection':
        return ('Votre question sur notre solution', f"Bonjour,\n\nMerci pour votre retour concernant {name}. Notre approche repose sur un site adapté à votre activité, un formulaire de devis et un suivi des demandes. Les tarifs et fonctionnalités seront confirmés avant tout engagement. Quel point souhaitez-vous examiner en priorité ?\n\nBien cordialement,\nÉquipe Agence IA Studio")
    return ('Plus de demandes clients pour '+name, f"Bonjour,\n\nJe vous contacte au sujet de {name}, dans le secteur {sector} à {city}. Nous proposons aux entreprises locales un site professionnel avec demandes de devis centralisées et rappels clients.\n\nUne démonstration de 10 minutes vous intéresserait-elle ?\n\nBien cordialement,\nÉquipe Agence IA Studio")


@app.post('/api/prospects/{pid}/drafts',status_code=201)
async def generate_draft(pid:int, data:DraftRequest, req:Request):
    require(req,owner=True,write=True)
    if data.objective not in {'premier_contact','relance','objection'}:
        raise HTTPException(422,'Objectif non pris en charge')
    throttle('draft:'+str(get_user(req)['id']),30,3600)
    with db() as con:
        p=con.execute('SELECT * FROM prospects WHERE id=?',(pid,)).fetchone()
        if not p:
            raise HTTPException(404,'Prospect introuvable')
        history=[dict(x) for x in con.execute('SELECT direction,body FROM interactions WHERE prospect_id=? ORDER BY id DESC LIMIT 4',(pid,)).fetchall()]
    subject,body=fallback_draft(p,history,data.objective)
    provider='modèle local (sans IA externe)'
    api_key=os.environ.get('OPENAI_API_KEY','')
    if api_key:
        prompt={'entreprise':p['name'],'secteur':p['sector'],'ville':p['city'],'diagnostic':p['diagnosis'],
                'objectif':data.objective,'historique':history}
        try:
            async with httpx.AsyncClient(timeout=22) as client:
                usage_model=os.environ.get('OPENAI_MODEL','gpt-4.1-mini')
                res=await ai_budget.post(client,'https://api.openai.com/v1/responses',model=usage_model,reservation=ai_budget.response_reserve(usage_model,prompt,'',900),headers={'Authorization':'Bearer '+api_key},json={
                    'model':os.environ.get('OPENAI_MODEL','gpt-4.1-mini'),
                    'max_output_tokens':900,'store':False,
                    'instructions':('Tu es un assistant commercial B2B transparent, en français. Retourne UNIQUEMENT un JSON contenant subject et body. '
                      'Rédige un message naturel de 60 à 100 mots. Ne prétends pas avoir vérifié un site ou une absence de présence digitale sans preuve. '
                      'Ne promets ni gains ni résultats garantis. Ne mens pas sur ton identité. Pas de pression ni d\'envoi automatique.'),
                    'input':json.dumps(prompt,ensure_ascii=False),
                    'text':{'format':{'type':'json_schema','name':'commercial_draft','strict':True,'schema':{
                        'type':'object','properties':{'subject':{'type':'string'},'body':{'type':'string'}},
                        'required':['subject','body'],'additionalProperties':False}}}})
                res.raise_for_status()
                result=res.json()
            outputs=[content.get('text','') for item in result.get('output',[]) for content in item.get('content',[]) if content.get('type')=='output_text']
            candidate=json.loads('\n'.join(outputs))
            if 1<len(candidate['subject'])<180 and 1<len(candidate['body'])<5000:
                subject,body=candidate['subject'],candidate['body']
                provider='IA connectée (brouillon non envoyé)'
        except (httpx.HTTPError,ValueError,KeyError,TypeError):
            provider='modèle local (connexion IA indisponible)'
    with db() as con:
        cur=con.execute('INSERT INTO drafts(prospect_id,subject,body,provider,created) VALUES (?,?,?,?,?)',
                        (pid,subject,body,provider,utcnow()))
    return {'id':cur.lastrowid,'subject':subject,'body':body,'provider':provider}


@app.get('/api/prospects-export')
def export_prospects(req:Request):
    require(req,owner=True)
    with db() as con:
        rows=[dict(x) for x in con.execute('SELECT name,sector,city,website,email,contact,diagnosis,stage,created FROM prospects ORDER BY id DESC').fetchall()]
    out=io.StringIO()
    writer=csv.writer(out,delimiter=';')
    writer.writerow(['Entreprise','Secteur','Ville','Site','Email','Contact','Diagnostic','Statut','Création'])
    for x in rows:
        writer.writerow([csv_safe(x[k]) for k in ('name','sector','city','website','email','contact','diagnosis','stage','created')])
    return Response(content='\ufeff'+out.getvalue(),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':'attachment; filename="prospects-agence-ia.csv"'})

