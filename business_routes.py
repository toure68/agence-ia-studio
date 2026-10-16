"""Internal company operations. No messaging, billing or payments are triggered."""
from datetime import date, datetime
from typing import Literal, Optional
from zoneinfo import ZoneInfo
import re

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field, field_validator


class ClientInput(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: str = Field(default='', max_length=200)
    phone: str = Field(default='', max_length=60)
    address: str = Field(default='', max_length=400)
    notes: str = Field(default='', max_length=3000)
    archived: bool = False

    @field_validator('name')
    @classmethod
    def real_name(cls, value):
        if len(value.strip()) < 2:
            raise ValueError('Nom obligatoire')
        return value.strip()

    @field_validator('email')
    @classmethod
    def valid_email(cls, value):
        value = value.strip()
        if value and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('Email invalide')
        return value


class WorkInput(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    description: str = Field(default='', max_length=4000)
    category: Literal['commercial', 'administration', 'operations', 'projet', 'finance', 'equipe'] = 'operations'
    priority: Literal['low', 'normal', 'high', 'urgent'] = 'normal'
    status: Literal['todo', 'doing', 'waiting', 'done', 'cancelled'] = 'todo'
    assignee: str = Field(default='', max_length=120)
    due: Optional[date] = None
    client_id: Optional[int] = Field(default=None, gt=0)

    @field_validator('title')
    @classmethod
    def real_title(cls, value):
        if len(value.strip()) < 2:
            raise ValueError('Titre obligatoire')
        return value.strip()


class WorkStatus(BaseModel):
    status: Literal['todo', 'doing', 'waiting', 'done', 'cancelled']


def init_schema(db):
    with db() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS clients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER NOT NULL REFERENCES companies(id),
          name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
          archived INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_id, archived, name);
        CREATE TABLE IF NOT EXISTS work_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER NOT NULL REFERENCES companies(id),
          title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT 'operations', priority TEXT NOT NULL DEFAULT 'normal',
          status TEXT NOT NULL DEFAULT 'todo', assignee TEXT NOT NULL DEFAULT '', due TEXT,
          client_id INTEGER REFERENCES clients(id), version INTEGER NOT NULL DEFAULT 1,
          created TEXT NOT NULL, updated TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_work_company ON work_items(company_id, status, due);
        ''')

def install(app, db, require, own_company, utcnow):
    def client_row(con, cid, client_id):
        row = con.execute('SELECT * FROM clients WHERE company_id=? AND id=?', (cid, client_id)).fetchone()
        if not row:
            raise HTTPException(404, 'Client introuvable dans cette entreprise')
        result = dict(row)
        result['archived'] = bool(result['archived'])
        return result

    def work_row(con, cid, work_id):
        row = con.execute('SELECT w.*, c.name AS client_name FROM work_items w LEFT JOIN clients c ON c.id=w.client_id AND c.company_id=w.company_id WHERE w.company_id=? AND w.id=?', (cid, work_id)).fetchone()
        if not row:
            raise HTTPException(404, 'Activité introuvable dans cette entreprise')
        return dict(row)

    @app.get('/api/companies/{cid}/clients')
    def clients(cid: int, req: Request):
        require(req, tenant_id=cid)
        with db() as con:
            own_company(con, cid)
            return [{**dict(r), 'archived': bool(r['archived'])} for r in con.execute(
                'SELECT * FROM clients WHERE company_id=? ORDER BY archived,name,id', (cid,))]

    @app.get('/api/companies/{cid}/clients/{client_id}')
    def get_client(cid: int, client_id: int, req: Request):
        require(req, tenant_id=cid)
        with db() as con:
            return client_row(con, cid, client_id)

    @app.post('/api/companies/{cid}/clients', status_code=201)
    def create_client(cid: int, data: ClientInput, req: Request):
        require(req, tenant_id=cid, write=True)
        with db() as con:
            own_company(con, cid)
            now = utcnow()
            cur = con.execute('INSERT INTO clients(company_id,name,email,phone,address,notes,archived,created,updated) VALUES (?,?,?,?,?,?,?,?,?)',
                (cid, data.name, data.email, data.phone, data.address, data.notes, int(data.archived), now, now))
            return client_row(con, cid, cur.lastrowid)

    @app.put('/api/companies/{cid}/clients/{client_id}')
    def edit_client(cid: int, client_id: int, data: ClientInput, req: Request):
        require(req, tenant_id=cid, write=True)
        with db() as con:
            client_row(con, cid, client_id)
            con.execute('UPDATE clients SET name=?,email=?,phone=?,address=?,notes=?,archived=?,updated=? WHERE company_id=? AND id=?',
                (data.name, data.email, data.phone, data.address, data.notes, int(data.archived), utcnow(), cid, client_id))
            return client_row(con, cid, client_id)

    @app.get('/api/companies/{cid}/activities')
    def activities(cid: int, req: Request):
        require(req, tenant_id=cid)
        with db() as con:
            own_company(con, cid)
            return [dict(r) for r in con.execute('SELECT w.*,c.name AS client_name FROM work_items w LEFT JOIN clients c ON c.id=w.client_id AND c.company_id=w.company_id WHERE w.company_id=? ORDER BY w.updated DESC,w.id DESC', (cid,))]

    @app.get('/api/companies/{cid}/activities/{work_id}')
    def get_activity(cid: int, work_id: int, req: Request):
        require(req, tenant_id=cid)
        with db() as con:
            return work_row(con, cid, work_id)

    @app.post('/api/companies/{cid}/activities', status_code=201)
    def create_activity(cid: int, data: WorkInput, req: Request):
        require(req, tenant_id=cid, write=True)
        with db() as con:
            own_company(con, cid)
            if data.client_id:
                client_row(con, cid, data.client_id)
            now = utcnow()
            cur = con.execute('INSERT INTO work_items(company_id,title,description,category,priority,status,assignee,due,client_id,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                (cid, data.title, data.description, data.category, data.priority, data.status, data.assignee, data.due.isoformat() if data.due else None, data.client_id, now, now))
            return work_row(con, cid, cur.lastrowid)

    @app.put('/api/companies/{cid}/activities/{work_id}')
    def edit_activity(cid: int, work_id: int, data: WorkInput, req: Request):
        require(req, tenant_id=cid, write=True)
        with db() as con:
            work_row(con, cid, work_id)
            if data.client_id:
                client_row(con, cid, data.client_id)
            con.execute('UPDATE work_items SET title=?,description=?,category=?,priority=?,status=?,assignee=?,due=?,client_id=?,version=version+1,updated=? WHERE company_id=? AND id=?',
                (data.title, data.description, data.category, data.priority, data.status, data.assignee, data.due.isoformat() if data.due else None, data.client_id, utcnow(), cid, work_id))
            return work_row(con, cid, work_id)

    @app.patch('/api/companies/{cid}/activities/{work_id}/status')
    def activity_status(cid: int, work_id: int, data: WorkStatus, req: Request):
        require(req, tenant_id=cid, write=True)
        with db() as con:
            work_row(con, cid, work_id)
            con.execute('UPDATE work_items SET status=?,version=version+1,updated=? WHERE company_id=? AND id=?', (data.status, utcnow(), cid, work_id))
            return work_row(con, cid, work_id)

    @app.get('/api/companies/{cid}/reports')
    def report(cid: int, req: Request):
        require(req, tenant_id=cid)
        today = datetime.now(ZoneInfo('Europe/Paris')).date().isoformat()
        with db() as con:
            own_company(con, cid)
            states = {r['status']: r['n'] for r in con.execute('SELECT status,COUNT(*) AS n FROM work_items WHERE company_id=? GROUP BY status', (cid,))}
            leads = {r['status']: r['n'] for r in con.execute('SELECT status,COUNT(*) AS n FROM leads WHERE company_id=? GROUP BY status', (cid,))}
            return {
                'quotations': {r['status']:r['n'] for r in con.execute('SELECT status,COUNT(*) AS n FROM quotations WHERE company_id=? GROUP BY status',(cid,))},
                'quotation_totals': [dict(r) for r in con.execute("SELECT json_extract(payload,'$.currency') AS currency,SUM(total_minor) AS total_minor FROM quotations WHERE company_id=? AND status='accepted' GROUP BY json_extract(payload,'$.currency')",(cid,))],
                'clients_active': con.execute('SELECT COUNT(*) FROM clients WHERE company_id=? AND archived=0', (cid,)).fetchone()[0],
                'activities': states,
                'overdue': con.execute("SELECT COUNT(*) FROM work_items WHERE company_id=? AND status NOT IN ('done','cancelled') AND due<?", (cid, today)).fetchone()[0],
                'leads': leads,
                'estimates_total': con.execute('SELECT COALESCE(SUM(amount),0) FROM leads WHERE company_id=?', (cid,)).fetchone()[0],
                'estimates_signed': con.execute("SELECT COALESCE(SUM(amount),0) FROM leads WHERE company_id=? AND status='Signé'", (cid,)).fetchone()[0],
            }

    @app.get('/api/drafts')
    def drafts(req: Request):
        require(req, owner=True)
        with db() as con:
            return [dict(r) for r in con.execute('SELECT d.*,p.name AS prospect_name FROM drafts d JOIN prospects p ON p.id=d.prospect_id ORDER BY d.id DESC')]
