"""Scoped API call ledger and atomic monthly forecast reservations, not an invoice."""
from contextvars import ContextVar
from datetime import datetime,timezone
from decimal import Decimal,ROUND_CEILING
from typing import Optional
from uuid import uuid4
from zoneinfo import ZoneInfo
import io
import json
import wave
import httpx
from fastapi import HTTPException,Request
from pydantic import BaseModel,Field

CONTEXT=ContextVar('ai_budget_context',default=None)
PRICE_VERSION='2026-10-17'
# USD per million tokens: input, cached input, output. No price guessed for other models.
PRICES={'gpt-4.1-mini':('0.40','0.10','1.60'),'gpt-4.1-mini-2025-04-14':('0.40','0.10','1.60'),
        'gpt-4o-mini-transcribe':('1.25','1.25','5.00'),'gpt-4o-mini-transcribe-2025-12-15':('1.25','1.25','5.00')}

def now():return datetime.now(timezone.utc).isoformat()
def month():return datetime.now(ZoneInfo('Europe/Paris')).strftime('%Y-%m')
def scope_key(cid):return 'platform' if cid is None else 'company:'+str(cid)
def micro(value):return int((Decimal(str(value))*1000000).to_integral_value(rounding=ROUND_CEILING))
def dollars(value):return None if value is None else format(Decimal(value)/1000000,'.6f')
def priced(model,inputs,outputs,cached=0):
    if model not in PRICES:return None
    rates=[Decimal(x) for x in PRICES[model]]
    return int(((inputs-cached)*rates[0]+cached*rates[1]+outputs*rates[2]).to_integral_value(rounding=ROUND_CEILING))

def response_reserve(model,messages,instructions,max_tokens):
    if model not in PRICES:return None
    # Text: deliberately generous UTF-8 byte bound plus message overhead.
    # Files/images: reserve a full model context, then settle from returned usage.
    def multimodal(v):
        if isinstance(v,dict):return v.get('type') in ('input_image','input_file') or any(multimodal(x) for x in v.values())
        return isinstance(v,list) and any(multimodal(x) for x in v)
    inputs=1047576 if multimodal(messages) else min(1047576,len(json.dumps(messages,ensure_ascii=False).encode())+len(instructions.encode())+4096)
    return priced(model,inputs,max_tokens)

def audio_reserve(model,raw):
    if model not in PRICES:return None
    try:
        with wave.open(io.BytesIO(raw)) as w:seconds=w.getnframes()/w.getframerate()
    except (wave.Error,EOFError,ZeroDivisionError):seconds=180
    # Prudential forecast, NOT an asserted maximum provider price.
    return micro(max(1,seconds)/60*0.05)

def init_schema(db):
    with db() as con:
        con.executescript('''CREATE TABLE IF NOT EXISTS ai_meter_meta(id INTEGER PRIMARY KEY,started TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ai_budget_settings(
          scope TEXT PRIMARY KEY,monthly_micro INTEGER,monthly_calls INTEGER,version INTEGER NOT NULL,
          updated_by INTEGER NOT NULL,updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ai_call_ledger(
          id TEXT PRIMARY KEY,scope TEXT NOT NULL,company_id INTEGER REFERENCES companies(id),
          user_id INTEGER REFERENCES users(id),month TEXT NOT NULL,operation TEXT NOT NULL,model TEXT NOT NULL,
          price_version TEXT NOT NULL,reserved_micro INTEGER NOT NULL,cost_micro INTEGER,
          status TEXT NOT NULL,input_tokens INTEGER,output_tokens INTEGER,cached_tokens INTEGER,
          basis TEXT NOT NULL DEFAULT '',http_status INTEGER,created TEXT NOT NULL,updated TEXT NOT NULL,
          reconciled_by INTEGER REFERENCES users(id));
        CREATE INDEX IF NOT EXISTS ai_ledger_month ON ai_call_ledger(scope,month);''')
        con.execute('INSERT OR IGNORE INTO ai_meter_meta VALUES (1,?)',(now(),))

def totals(con,scope,period):
    return dict(con.execute('''SELECT COUNT(*) AS calls,COALESCE(SUM(COALESCE(cost_micro,reserved_micro)),0) AS committed,
      COALESCE(SUM(cost_micro),0) AS estimated,
      COALESCE(SUM(CASE WHEN cost_micro IS NULL THEN reserved_micro ELSE 0 END),0) AS held,
      COALESCE(SUM(CASE WHEN cost_micro IS NULL AND reserved_micro=0 THEN 1 ELSE 0 END),0) AS unpriced,
      COALESCE(SUM(CASE WHEN status IN ('reserved','uncertain') THEN 1 ELSE 0 END),0) AS pending
      FROM ai_call_ledger WHERE scope=? AND month=?''',(scope,period)).fetchone())

def reserve(model,amount,kind):
    context=CONTEXT.get()
    if not context:return None
    db,cid,uid,operation=context;scope=scope_key(cid);period=month();rid=str(uuid4())
    with db() as con:
        con.execute('BEGIN IMMEDIATE')
        limits=con.execute('SELECT * FROM ai_budget_settings WHERE scope=?',(scope,)).fetchone()
        used=totals(con,scope,period)
        if limits and limits['monthly_calls'] is not None and used['calls']>=limits['monthly_calls']:
            raise HTTPException(402,'Quota mensuel d’appels IA atteint. La direction peut vérifier le suivi de consommation.')
        if limits and limits['monthly_micro'] is not None:
            if amount is None or used['unpriced']:raise HTTPException(402,'Coût non chiffrable avec ce modèle ou un appel antérieur. Vérifiez le journal IA avant de poursuivre avec un plafond en dollars.')
            if used['committed']+amount>limits['monthly_micro']:raise HTTPException(402,'Plafond IA prévisionnel insuffisant pour réserver cet appel. Les fonctions sans IA restent disponibles.')
        con.execute('INSERT INTO ai_call_ledger(id,scope,company_id,user_id,month,operation,model,price_version,reserved_micro,status,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          (rid,scope,cid,uid,period,operation+(' · audio' if kind=='audio' else ''),model,PRICE_VERSION,amount or 0,'reserved',now(),now()))
        con.execute('COMMIT')
    return (db,rid,model)

def settle(ticket,response=None):
    if not ticket:return
    db,rid,model=ticket;cost=None;ins=outs=cached=None;status='uncertain';basis='Réserve maintenue : consommation non confirmée';http_status=response.status_code if response is not None else None
    if response is not None and 400<=response.status_code<500 and response.status_code!=408:
        cost=0;status='failed';basis='Requête refusée par le fournisseur'
    elif response is not None and response.status_code<400:
        try:
            usage=response.json().get('usage') or {};ins=usage.get('input_tokens');outs=usage.get('output_tokens')
            cached=(usage.get('input_tokens_details') or {}).get('cached_tokens',0)
            if not all(type(x) is int and 0<=x<=1000000000 for x in (ins,outs,cached)) or cached>ins:raise ValueError()
            cost=priced(model,ins,outs,cached)
            if cost is not None:status='completed';basis='Tokens déclarés par le fournisseur × tarifs de référence'
        except (ValueError,TypeError,AttributeError):ins=outs=cached=None
    with db() as con:
        con.execute('UPDATE ai_call_ledger SET cost_micro=?,status=?,input_tokens=?,output_tokens=?,cached_tokens=?,basis=?,http_status=?,updated=? WHERE id=? AND status=\'reserved\'',(cost,status,ins,outs,cached,basis,http_status,now(),rid))

async def post(client,url,*,model,reservation,kind='text',**kwargs):
    ticket=reserve(model,reservation,kind)
    try:response=await client.post(url,**kwargs)
    except BaseException:
        settle(ticket);raise
    settle(ticket,response);return response

class Limits(BaseModel):
    monthly_usd:Optional[Decimal]=Field(default=None,ge=0,le=100000,decimal_places=6,allow_inf_nan=False)
    monthly_calls:Optional[int]=Field(default=None,ge=0,le=1000000)
    version:int=Field(ge=0)

class Reconcile(BaseModel):
    usd:Decimal=Field(ge=0,le=100000,decimal_places=6,allow_inf_nan=False)
    confirmed:bool=False

def install(app,db,require,own_company):
    def read(scope):
        with db() as con:
            limits=con.execute('SELECT * FROM ai_budget_settings WHERE scope=?',(scope,)).fetchone();used=totals(con,scope,month())
            started=con.execute('SELECT started FROM ai_meter_meta WHERE id=1').fetchone()['started']
            rows=[dict(r) for r in con.execute("SELECT id,month,operation,model,status,cost_micro,reserved_micro,basis,input_tokens,output_tokens,cached_tokens,created,updated,reconciled_by FROM ai_call_ledger WHERE scope=? ORDER BY CASE WHEN status IN ('reserved','uncertain') THEN 0 ELSE 1 END,created DESC LIMIT 50",(scope,))]
        for r in rows:r['cost_usd']=dollars(r.pop('cost_micro'));r['reserved_usd']=dollars(r.pop('reserved_micro'))
        cap=limits['monthly_micro'] if limits else None;countcap=limits['monthly_calls'] if limits else None
        return {'scope':scope,'month':month(),'timezone':'Europe/Paris','tracking_started':started,'version':limits['version'] if limits else 0,
          'monthly_usd':dollars(cap),'monthly_calls':countcap,'calls':used['calls'],'estimated_usd':dollars(used['estimated']),
          'held_usd':dollars(used['held']),'committed_usd':dollars(used['committed']),'unpriced':used['unpriced'],'pending':used['pending'],
          'remaining_usd':dollars(max(0,cap-used['committed'])) if cap is not None else None,
          'warning':bool(cap is not None and (used['committed']>=cap*0.8 or used['unpriced'])) or bool(countcap is not None and used['calls']>=countcap*0.8),
          'blocked':bool(cap is not None and (used['committed']>=cap or used['unpriced'])) or bool(countcap is not None and used['calls']>=countcap),
          'price_version':PRICE_VERSION,'priced_models':list(PRICES),'calls_recent':rows}
    def save(scope,data,uid):
        with db() as con:
            con.execute('BEGIN IMMEDIATE');old=con.execute('SELECT version FROM ai_budget_settings WHERE scope=?',(scope,)).fetchone()
            if data.version!=(old['version'] if old else 0):raise HTTPException(409,'Les plafonds ont changé. Rechargez cet écran.')
            con.execute('INSERT INTO ai_budget_settings VALUES (?,?,?,?,?,?) ON CONFLICT(scope) DO UPDATE SET monthly_micro=excluded.monthly_micro,monthly_calls=excluded.monthly_calls,version=excluded.version,updated_by=excluded.updated_by,updated=excluded.updated',
              (scope,micro(data.monthly_usd) if data.monthly_usd is not None else None,data.monthly_calls,data.version+1,uid,now()));con.execute('COMMIT')
        return read(scope)
    def reconcile(scope,rid,data,uid):
        if not data.confirmed:raise HTTPException(422,'Confirmez avoir vérifié la facturation fournisseur.')
        with db() as con:
            con.execute('BEGIN IMMEDIATE');r=con.execute('SELECT * FROM ai_call_ledger WHERE scope=? AND id=?',(scope,rid)).fetchone()
            if not r:raise HTTPException(404,'Appel introuvable')
            if r['status']!='uncertain' and not (r['status']=='reserved' and (datetime.now(timezone.utc)-datetime.fromisoformat(r['created'])).total_seconds()>600):raise HTTPException(409,'Cet appel est confirmé ou encore en cours.')
            con.execute("UPDATE ai_call_ledger SET cost_micro=?,status='completed',basis='Montant régularisé manuellement par la direction',reconciled_by=?,updated=? WHERE id=?",(micro(data.usd),uid,now(),rid));con.execute('COMMIT')
        return read(scope)
    @app.get('/api/companies/{cid}/ai-usage')
    def company_usage(cid:int,req:Request):
        require(req,tenant_id=cid,owner=True)
        with db() as con:own_company(con,cid)
        return read(scope_key(cid))
    @app.put('/api/companies/{cid}/ai-usage')
    def company_limits(cid:int,data:Limits,req:Request):
        u=require(req,tenant_id=cid,owner=True,write=True)
        with db() as con:own_company(con,cid)
        return save(scope_key(cid),data,u['id'])
    @app.post('/api/companies/{cid}/ai-usage/{rid}/reconcile')
    def company_reconcile(cid:int,rid:str,data:Reconcile,req:Request):
        u=require(req,tenant_id=cid,owner=True,write=True)
        with db() as con:own_company(con,cid)
        return reconcile(scope_key(cid),rid,data,u['id'])
    @app.get('/api/ai-usage/platform')
    def platform_usage(req:Request):require(req,owner=True);return read('platform')
    @app.put('/api/ai-usage/platform')
    def platform_limits(data:Limits,req:Request):return save('platform',data,require(req,owner=True,write=True)['id'])
    @app.post('/api/ai-usage/platform/{rid}/reconcile')
    def platform_reconcile(rid:str,data:Reconcile,req:Request):return reconcile('platform',rid,data,require(req,owner=True,write=True)['id'])
