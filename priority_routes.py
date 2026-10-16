"""Priority cards from recorded CRM state and explicitly configured deadlines.

No outbound messages, payroll or tax submissions are performed here.
"""
from calendar import monthrange
from datetime import date, datetime, timedelta
import hashlib
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field
from business_routes import client_revision
import json


class TaskInput(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    description: str = Field(min_length=2, max_length=2000)
    first_due: date
    monthly: bool = False


class CompletionInput(BaseModel):
    occurrence: date


class DismissInput(BaseModel):
    key: str = Field(min_length=1, max_length=64)


def next_occurrence(task, completed):
    due = date.fromisoformat(task['first_due'])
    anchor_day = due.day
    while due.isoformat() in completed:
        if not task['monthly']:
            return None
        year, month = (due.year + 1, 1) if due.month == 12 else (due.year, due.month + 1)
        if year > 9999:
            return None
        due = date(year, month, min(anchor_day, monthrange(year, month)[1]))
    return due


def install(app, db, require, own_company, utcnow):
    def tasks_for(con, cid):
        result = []
        for row in con.execute('SELECT * FROM calendar_tasks WHERE company_id=? ORDER BY first_due,id', (cid,)):
            task = dict(row)
            done = {r['occurrence'] for r in con.execute(
                'SELECT occurrence FROM task_completions WHERE task_id=?', (task['id'],))}
            due = next_occurrence(task, done)
            result.append({**task, 'monthly': bool(task['monthly']),
                           'next_due': due.isoformat() if due else None})
        return result

    def cards_for(con, cid, user):
        today = datetime.now(ZoneInfo('Europe/Paris')).date()
        cards = []

        def add(kind, identity, revision, title, description, action, label, rank, due=None):
            key = hashlib.sha256(f'{kind}:{cid}:{identity}:{revision}'.encode()).hexdigest()
            cards.append(dict(key=key, kind=kind, title=title, description=description,
                              action=action, action_label=label, rank=rank, due=due))

        for task in tasks_for(con, cid):
            if task['next_due'] is None:
                continue
            due = date.fromisoformat(task['next_due'])
            if due > today + timedelta(days=7):
                continue
            delta = (due - today).days
            timing = 'En retard' if delta < 0 else ('Aujourd’hui' if delta == 0 else 'À venir')
            add('calendar', task['id'], task['next_due'], task['title'],
                f"{task['description']} · {timing} : {due.strftime('%d/%m/%Y')}",
                {'type': 'task', 'id': task['id'], 'occurrence': task['next_due']},
                'Ouvrir la tâche', 0 if delta <= 0 else 3, task['next_due'])


        for row in con.execute("SELECT * FROM work_items WHERE company_id=? AND status NOT IN ('done','cancelled')", (cid,)):
            item = dict(row)
            overdue = bool(item['due'] and item['due'] < today.isoformat())
            due_now = bool(item['due'] and item['due'] <= today.isoformat())
            importance = {'urgent': 'Urgente', 'high': 'Importante', 'normal': 'Normale', 'low': 'Faible'}[item['priority']]
            parts = [importance]
            if item['assignee']:
                parts.append('Responsable : ' + item['assignee'])
            if item['due']:
                parts.append(('En retard : ' if overdue else 'Échéance : ') + date.fromisoformat(item['due']).strftime('%d/%m/%Y'))
            important=item['priority'] in ('high','urgent') or due_now
            add('urgent' if important else 'work', 'activity-' + str(item['id']), str(item['version']),
                item['title'], ' · '.join(parts),
                {'type': 'activity', 'id': item['id']}, 'Traiter l’activité',
                0 if overdue or item['priority'] == 'urgent' else 1 if due_now else 2 if item['priority']=='high' else 4 if item['priority']=='normal' else 5,
                item['due'])
            cards[-1]['workflow_status']=item['status']

        for row in con.execute('SELECT * FROM leads WHERE company_id=?', (cid,)):
            lead = dict(row)
            age = (today - datetime.fromisoformat(lead['updated']).date()).days
            status = lead['status']
            if status == 'À rappeler' or status == 'Nouveau' or (status == 'Devis envoyé' and age >= 7):
                add('urgent', lead['id'], lead['updated'] + status,
                    f"Suivre la demande de {lead['name']}",
                    f"Statut : {status}. Dernière mise à jour il y a {max(0, age)} jour(s). Vérifiez le dossier avant tout contact.",
                    {'type': 'lead', 'id': lead['id']}, 'Ouvrir la demande', 1)

        for row in con.execute('SELECT c.*,r.revision AS validated_revision FROM clients c LEFT JOIN client_reviews r ON r.client_id=c.id WHERE c.company_id=? AND c.archived=0',(cid,)):
            client=dict(row);revision=client_revision(client)
            if revision==client['validated_revision']:continue
            add('client','client-'+str(client['id']),revision,'Vérifier la fiche client : '+client['name'],
                'Nouvelle fiche ou informations modifiées : vérifiez puis validez les coordonnées.',
                {'type':'client','id':client['id'],'revision':revision},'Vérifier la fiche',3)

        for row in con.execute("SELECT * FROM quotations WHERE company_id=? AND status='draft'",(cid,)):
            quote=dict(row);data=json.loads(quote['payload']);due=data.get('valid_until')
            add('quote','quote-'+str(quote['id']),quote['updated']+quote['payload'],'Finaliser '+quote['reference'],
                'Devis pour '+data['customer_name']+' : vérifier le contenu et son état.',
                {'type':'quote','id':quote['id']},'Vérifier le devis',1 if due and due<=today.isoformat() else 2,due)

        for row in con.execute("SELECT id,subject,revision,send_status FROM mail_messages WHERE company_id=? AND user_id=? AND send_status IN ('draft','uncertain')",(cid,user['id'])):
            mail=dict(row);uncertain=mail['send_status']=='uncertain'
            add('email','mail-'+str(mail['id']),str(mail['revision'])+mail['send_status'],
                ('Vérifier l’envoi : ' if uncertain else 'Examiner : ')+mail['subject'],
                'Vérifiez dans Gmail si le message est parti avant toute nouvelle tentative.' if uncertain else 'Réponse en brouillon à relire. Aucun envoi automatique.',
                {'type':'email','id':mail['id']},'Ouvrir l’e-mail',0 if uncertain else 3)

        if user['role']=='owner':
            for row in con.execute('SELECT id,filename,kind FROM source_documents WHERE company_id=? AND reviewed=0',(cid,)):
                doc=dict(row)
                add('document','document-'+str(doc['id']),doc['kind'],'Vérifier le document : '+doc['filename'],
                    'Informations extraites en attente de vérification et d’enregistrement.',
                    {'type':'document','id':doc['id']},'Vérifier le document',2)

        if user['role'] == 'owner':
            for row in con.execute('SELECT * FROM prospects'):
                p = dict(row)
                last = con.execute('SELECT id,direction,created FROM interactions WHERE prospect_id=? ORDER BY id DESC LIMIT 1', (p['id'],)).fetchone()
                # A refusal or signed deal never generates a reminder.
                if p['stage'] in ('Refus', 'Signé'):
                    continue
                age = (today - datetime.fromisoformat(last['created'] if last else p['updated']).date()).days
                text = None
                if last and last['direction'] == 'reçu' or p['stage'] == 'Réponse reçue':
                    text = 'Une réponse est enregistrée : lisez-la et préparez votre réponse.'
                elif p['stage'] == 'Accord de principe':
                    text = 'Validez les conditions et le contrat avant de confirmer cet accord.'
                elif p['stage'] == 'Intéressé':
                    text = 'Une opportunité est signalée : confirmez les besoins et la prochaine étape.'
                elif p['stage'] == 'Contacté' and age >= 7:
                    text = f'Le dernier suivi date de {age} jours. Vérifiez si une relance est appropriée.'
                if text:
                    add('urgent', 'prospect-' + str(p['id']),
                        p['updated'] + p['stage'] + str(last['id'] if last else ''),
                        p['name'], text, {'type': 'prospect', 'id': p['id']},
                        'Ouvrir le suivi', 1 if p['stage'] in ('Réponse reçue', 'Accord de principe') else 2)
        from zero_routes import risk_cards
        cards.extend(risk_cards(con,cid))
        blocked_work={c['action']['id'] for c in cards if c['action']['type']=='material'}
        cards=[c for c in cards if not (c['kind']=='work' and c['action']['id'] in blocked_work)]
        dismissed = {r['priority_key'] for r in con.execute(
            'SELECT priority_key FROM priority_dismissals WHERE user_id=?', (user['id'],))}
        return sorted((c for c in cards if c['key'] not in dismissed),
                      key=lambda c: (c['rank'], c['due'] or '', c['key']))

    @app.get('/api/companies/{cid}/priorities')
    def priorities(cid: int, req: Request):
        user = require(req, tenant_id=cid)
        with db() as con:
            own_company(con, cid)
            return cards_for(con, cid, user)

    @app.post('/api/companies/{cid}/priorities/dismiss')
    def dismiss(cid: int, data: DismissInput, req: Request):
        user = require(req, tenant_id=cid, write=True)
        with db() as con:
            own_company(con, cid)
            if data.key not in {c['key'] for c in cards_for(con, cid, user)}:
                raise HTTPException(404, 'Priorité introuvable ou déjà traitée')
            con.execute('INSERT OR IGNORE INTO priority_dismissals(user_id,priority_key) VALUES (?,?)', (user['id'], data.key))
        return {'ok': True}

    @app.get('/api/companies/{cid}/tasks')
    def list_tasks(cid: int, req: Request):
        require(req, tenant_id=cid)
        with db() as con:
            own_company(con, cid)
            return tasks_for(con, cid)

    @app.post('/api/companies/{cid}/tasks', status_code=201)
    def create_task(cid: int, data: TaskInput, req: Request):
        require(req, tenant_id=cid, write=True)
        if not data.title.strip() or not data.description.strip():
            raise HTTPException(422, 'Titre et description obligatoires')
        with db() as con:
            own_company(con, cid)
            cur = con.execute('INSERT INTO calendar_tasks(company_id,title,description,first_due,monthly,created) VALUES (?,?,?,?,?,?)',
                (cid, data.title.strip(), data.description.strip(), data.first_due.isoformat(), int(data.monthly), utcnow()))
            return {'id': cur.lastrowid}

    @app.post('/api/companies/{cid}/tasks/{tid}/complete')
    def complete_task(cid: int, tid: int, data: CompletionInput, req: Request):
        user = require(req, tenant_id=cid, write=True)
        with db() as con:
            task = next((t for t in tasks_for(con, cid) if t['id'] == tid), None)
            if not task:
                raise HTTPException(404, 'Tâche introuvable dans cette entreprise')
            if task['next_due'] != data.occurrence.isoformat():
                raise HTTPException(409, 'Cette échéance est déjà traitée ou a changé. Actualisez la liste.')
            con.execute('INSERT OR IGNORE INTO task_completions(task_id,occurrence,user_id,completed) VALUES (?,?,?,?)',
                        (tid, data.occurrence.isoformat(), user['id'], utcnow()))
        return {'ok': True}
