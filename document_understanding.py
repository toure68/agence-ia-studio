"""Document-specific interpretation. Never infer missing names or identifiers.

MRZ layouts/check digits follow ICAO Doc 9303 parts 3, 4, 5 and 6.
These checks detect transcription errors; they do not authenticate a document.
"""
from datetime import date
import re
import unicodedata

IDENTITY_KINDS={'identity','passport','residence'}
FIELD_NAMES={'last_name':'Nom','first_name':'Prénoms','birth_date':'Date de naissance','expiry_date':'Date de fin de validité','document_number':'Numéro du document','nationality':'Nationalité','sex':'Sexe','personal_address':'Adresse du titulaire','document_holder':'Nom complet du titulaire','account_holder':'Titulaire du compte','bic':'BIC','insurer':'Assureur','policy_number':'Numéro de contrat','issue_date':'Date de délivrance','issuing_authority':'Autorité de délivrance','birth_place':'Lieu de naissance'}

def fold(value):
    return ''.join(c for c in unicodedata.normalize('NFD',value) if not unicodedata.combining(c)).lower().replace('’',"'")

def normalized_date(value):
    value=fold(value.strip()).removeprefix('le ').strip()
    months={'janvier':1,'january':1,'fevrier':2,'february':2,'mars':3,'march':3,'avril':4,'april':4,'mai':5,'may':5,'juin':6,'june':6,'juillet':7,'july':7,'aout':8,'august':8,'septembre':9,'september':9,'octobre':10,'october':10,'novembre':11,'november':11,'decembre':12,'december':12}
    m=re.fullmatch(r'(\d{1,2})[ ./-](\d{1,2})[ ./-](\d{2}|\d{4})',value)
    if m:d,month,y=map(int,m.groups());year=m[3]
    else:
        m=re.fullmatch(r'(\d{4})-(\d{2})-(\d{2})',value)
        if m:y,month,d=map(int,m.groups());year=m[1]
        else:
            m=re.fullmatch(r'(\d{1,2})\s+([a-z]+)\.?(?:\s*/\s*([a-z]+)\.?)?\s+(\d{2}|\d{4})',value)
            if not m:return None
            short={'jan':1,'fev':2,'feb':2,'mar':3,'avr':4,'apr':4,'mai':5,'may':5,'jui':6,'jun':6,'jul':7,'aou':8,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12}
            def month_number(s):return 7 if s.startswith('juil') else months.get(s,short.get(s[:3]))
            month=month_number(m[2]);second=month_number(m[3]) if m[3] else month
            if not month or second!=month:return None
            d,y=int(m[1]),int(m[4]);year=m[4]
    try:date(y if len(year)==4 else 2000+y,month,d)
    except ValueError:return None
    return f'{d:02d}/{month:02d}/{year}'

def check_digit(value):
    def number(c):return int(c) if c.isdigit() else ord(c)-55 if 'A'<=c<='Z' else 0
    return str(sum(number(c)*(7,3,1)[i%3] for i,c in enumerate(value))%10)

def mrz_date(value):
    if not re.fullmatch(r'\d{6}',value):return None
    return normalized_date(value[4:6]+'/'+value[2:4]+'/'+value[:2])

def read_mrz(text):
    lines=[re.sub(r'\s+','',l.upper()).replace('＜','<') for l in text.splitlines()]
    lines=[l for l in lines if re.fullmatch(r'[A-Z0-9<]+',l) and len(l) in (30,36,44)]
    found=[];seen=False
    for i,a in enumerate(lines):
        if not re.match(r'^[PIAC][A-Z<][A-Z<]{3}',a):continue
        seen=True
        if i+1>=len(lines):continue
        b=lines[i+1];extra=None
        if len(a)==44 and a[0]=='P' and len(b)==44:
            number,nd,nationality,birth,bd,sex,expiry,ed,names=b[:9],b[9],b[10:13],b[13:19],b[19],b[20],b[21:27],b[27],a[5:]
            composite=b[:10]+b[13:20]+b[21:43];cd=b[43]
            if b[42] not in (check_digit(b[28:42]),'<' if set(b[28:42])=={'<'} else ''):continue
        elif len(a)==30 and a[0] in 'IAC' and len(b)==30 and i+2<len(lines) and len(lines[i+2])==30:
            extra=lines[i+2]
            number,nd,birth,bd,sex,expiry,ed,nationality,names=a[5:14],a[14],b[:6],b[6],b[7],b[8:14],b[14],b[15:18],extra
            composite=a[5:30]+b[:7]+b[8:15]+b[18:29];cd=b[29]
        elif len(a)==36 and a[0] in 'IAC' and len(b)==36:
            number,nd,nationality,birth,bd,sex,expiry,ed,names=b[:9],b[9],b[10:13],b[13:19],b[19],b[20],b[21:27],b[27],a[5:]
            composite=b[:10]+b[13:20]+b[21:35];cd=b[35]
        else:continue
        if not all(check_digit(v)==d for v,d in [(number,nd),(birth,bd),(expiry,ed),(composite,cd)]):continue
        if not mrz_date(birth) or not mrz_date(expiry) or sex not in 'MFX<' or not re.fullmatch('[A-Z<]{3}',nationality):continue
        if '<<' not in names or not re.fullmatch(r'[A-Z<]+',names):continue
        last,first=names.split('<<',1);last=' '.join(last.replace('<',' ').split());first=' '.join(first.replace('<',' ').split())
        if not last or not number.strip('<'):continue
        result={'last_name':last,'document_number':number.rstrip('<'),'birth_date':mrz_date(birth),'expiry_date':mrz_date(expiry),'issuing_country':a[2:5].replace('<','')}
        if first:result['first_name']=first
        if nationality.strip('<'):result['nationality']=nationality.replace('<','')
        if sex!='<':result['sex']=sex
        found.append((result,'\n'.join([a,b]+([extra] if extra else []))))
    unique={tuple(sorted(f.items())):(f,e) for f,e in found}
    if len(unique)>1:return {},{},['Plusieurs pièces différentes sont reconnues. Importez une seule pièce à la fois.']
    if unique:
        fields,evidence=next(iter(unique.values()))
        return fields,{k:evidence for k in fields},[]
    return {},{},['Les lignes codées sont incomplètes ou leur contrôle de lecture échoue. Vérifiez la photo ; les données incertaines ne sont pas reprises.'] if seen else []

PERSON_LABELS={
 'last_name':[r'nom de famille',r'nom de naissance',r'surname',r'last name',r'nom(?:s|\(s\))?'],
 'first_name':[r'prenoms?\(?s?\)?',r'given names?',r'first names?'],
 'document_holder':[r'nom et prenoms?',r'full name'],
 'birth_date':[r'date et lieu de naissance',r'date de naissance',r'date of birth',r'birth date',r'ne(?:\(e\)|e)? le'],
 'birth_place':[r'lieu de naissance',r'place of birth'],
 'nationality':[r'nationalite',r'nationality'],
 'sex':[r'sexe',r'sex',r'gender'],
 'document_number':[r'numero (?:du (?:document|titre)|de (?:carte|passeport))',r'(?:passeport|passport|document|carte|card)\s*(?:no\.?|n[°ºo]|number)',r'document number',r'passport number',r'n[°º]\s*(?:(?:du|de|de la) )?(?:document|passeport|titre|carte)'],
 'expiry_date':[r'date d.expiration',r'date de fin de validite',r'date de validite',r'valable jusqu.au',r'date of expiry',r'expiry date',r'date of expiration'],
 'issue_date':[r'date de delivrance',r'delivre le',r'date of issue',r'issue date'],
 'issuing_authority':[r'autorite de delivrance',r'autorite',r'authority',r'issued by'],
 'personal_address':[r'adresse(?: du domicile)?',r'domicile(?: personnel)?',r'address',r'residence address']}

def read_labeled(text,kind):
    labels=PERSON_LABELS if kind in IDENTITY_KINDS else {
      'address':{'document_holder':[r'titulaire(?: du contrat)?',r'destinataire',r'client',r'customer',r'nom et prenoms?'],'personal_address':[r'adresse de consommation',r'adresse de fourniture',r'adresse du logement',r'adresse du domicile',r'adresse du client',r'billing address',r'service address',r'adresse',r'address']},
      'rib':{'account_holder':[r'titulaire(?: du compte)?',r'beneficiaire',r'account holder',r'account name'],'bic':[r'code bic',r'bic(?:\s*/\s*swift)?',r'swift(?: code)?']},
      'insurance':{'insurer':[r'assureur',r'compagnie d.assurance',r'insurer'],'document_holder':[r'assure\(?e?\)?',r'assure nom',r'policy holder'],'policy_number':[r'numero (?:de contrat|de police)',r'(?:contrat|police)\s*n[°ºo]?',r'policy (?:number|no\.?)'],'expiry_date':PERSON_LABELS['expiry_date'],'issue_date':PERSON_LABELS['issue_date']}
    }.get(kind,{})
    aliases=sorted([(pattern,key) for key,patterns in labels.items() for pattern in patterns],key=lambda p:len(p[0]),reverse=True)
    pattern=re.compile(r'(?<!\w)(?:'+ '|'.join(f'(?P<f{i}>{p})' for i,(p,k) in enumerate(aliases))+r')(?!\w)',re.I) if aliases else None
    lines=[line.strip() for line in text.splitlines() if line.strip()]
    values={};sources={};notes=[];priorities={}
    def matches(line):
        if not pattern:return []
        return [(m.start(),m.end(),aliases[int(m.lastgroup[1:])][1]) for m in pattern.finditer(fold(line))]
    def clean_value(key,value):
        value=re.sub(r'^[\s/:;|.\-–]+|[\s/:;|]+$','',value).strip()
        if not value or '<<' in value:return None
        if key.endswith('_date'):return normalized_date(value)
        if key=='sex':return {'m':'M','f':'F','x':'X','masculin':'M','feminin':'F','male':'M','female':'F'}.get(fold(value))
        if key in ('document_number','policy_number'):
            value=re.sub(r'^(?:n[°ºo]\.?|no\.?|number)\s*[:.]?\s*','',value,flags=re.I)
            return value if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9 /.-]{3,39}',value) and re.search(r'\d',value) else None
        if key=='bic':
            value=re.sub(r'\s','',value).upper()
            return value if re.fullmatch(r'[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?',value) else None
        if key in ('last_name','first_name','nationality'):
            if len(value)>110 or not value[0].isalpha() or not all(c.isalpha() or c in " '-." for c in value):return None
            if re.search(r'carte|identit|passeport|passport|republique|document|nationality|surname|given name',fold(value)):return None
        return value[:600]
    def add(key,value,source):
        if key=='birth_date':
            combined=re.fullmatch(r'(.+?)\s+(?:à|a|at)\s+(.+)',value.strip(' :'),re.I)
            if combined and normalized_date(combined[1]):
                value=combined[1];add('birth_place',combined[2],source)
        if key=='document_number' and re.search(r'country code|code du pays',fold(source)):
            group=re.fullmatch(r'\s*(?:P[A-Z<]?|I[A-Z<]?|A[A-Z<]?)\s+[A-Z]{3}\s+([A-Z0-9]{5,15})\s*',value)
            if group:value=group[1]
        value=clean_value(key,value)
        if not value:return
        if kind=='address' and key=='personal_address':
            if re.search(r'adresse du fournisseur|siege social',fold(source)):return
            priority=2 if re.search(r'adresse de (?:consommation|fourniture)|adresse du (?:logement|domicile|client)|billing address|service address',fold(source)) else 1
            if priorities.get(key,0)>priority:return
            if priorities.get(key,0)<priority:values[key]=[]
            priorities[key]=priority
        values.setdefault(key,[]).append(value);sources[key]=source[:600]
    for i,line in enumerate(lines):
        found=matches(line)
        if not found:continue
        nonempty=False
        for j,(start,end,key) in enumerate(found):
            value=line[end:found[j+1][0] if j+1<len(found) else len(line)]
            if not value.strip(' /:;|.-–'):continue
            if key=='personal_address' and i+1<len(lines) and re.match(r'^\d{4,6}\s+\D',lines[i+1]):value+=' '+lines[i+1]
            add(key,value,line);nonempty=True
        keys=list(dict.fromkeys(k for s,e,k in found))
        if not nonempty and i+1<len(lines) and not matches(lines[i+1]):
            following=lines[i+1]
            if re.search(r'carte nationale|republique|passport|passeport|<<|facture|assurance',fold(following)):continue
            if len(keys)==1:
                key=keys[0]
                if key=='personal_address' and i+2<len(lines) and re.match(r'^\d{4,6}\s+\D',lines[i+2]):following+=' '+lines[i+2]
                add(key,following,line+' '+following)
            else:
                columns=re.split(r'\s{2,}|\s*\|\s*',following)
                if len(columns)==len(keys):
                    for key,value in zip(keys,columns):add(key,value,line+' '+following)
    # A utility bill often contains both supplier and customer addresses. Only a
    # uniquely recognised street address is offered when no explicit label exists.
    if kind=='address' and 'personal_address' not in values:
        addresses=[]
        for i,line in enumerate(lines):
            if re.match(r'^\d+[A-Za-z]?\s+(?:bis\s+|ter\s+)?(?:rue|avenue|av\.?|boulevard|bd|route|place|chemin|impasse|allee)\b',fold(line)):
                address=line
                if i+1<len(lines) and re.match(r'^\d{4,6}\s+\D',lines[i+1]):address+=' '+lines[i+1]
                addresses.append(address)
        if len(set(addresses))==1:add('personal_address',addresses[0],addresses[0])
        elif addresses:notes.append('Plusieurs adresses figurent sur ce justificatif. Choisissez celle du titulaire avant enregistrement.')
    fields={};blocked=set()
    for key,candidates in values.items():
        distinct={fold(v):v for v in candidates}
        if len(distinct)==1:fields[key]=candidates[0]
        else:blocked.add(key);notes.append('Plusieurs valeurs différentes pour « '+FIELD_NAMES.get(key,key)+' » : ce champ reste à vérifier.')
    return fields,{k:sources[k] for k in fields},notes,blocked

def interpret_document(text,kind):
    fields,evidence,notes,blocked=read_labeled(text,kind)
    if kind in IDENTITY_KINDS:
        coded,proof,warnings=read_mrz(text);notes+=warnings
        for key,value in coded.items():
            if key in blocked:continue
            if key in fields:
                left,right=fold(fields[key]).upper(),fold(value).upper()
                if key.endswith('_date'):
                    a=fields[key].split('/');b=value.split('/');same=a[:2]==b[:2] and a[2][-2:]==b[2][-2:]
                elif key=='nationality':
                    # Printed nationality names differ from three-letter MRZ codes.
                    same=left==right if len(left)==len(right)==3 else True
                else:
                    canonical=lambda s:re.sub(r'[^A-Z0-9]','',fold(s).upper())
                    transliterated=fields[key].upper().translate(str.maketrans({'Ä':'AE','Ö':'OE','Ü':'UE','ß':'SS','Æ':'AE','Œ':'OE','Ø':'OE','Ł':'L','Đ':'D'}))
                    same=canonical(fields[key])==canonical(value) or canonical(transliterated)==canonical(value)
                if same:continue
                fields.pop(key);evidence.pop(key,None)
                notes.append('La lecture du champ « '+FIELD_NAMES.get(key,key)+' » diffère entre le texte et les lignes codées. Vérifiez ce champ.')
            else:fields[key]=value;evidence[key]=proof[key]
        if any(k.endswith('_date') and len(v)==8 for k,v in fields.items()):notes.append('Certaines dates ont une année sur deux chiffres : vérifiez le siècle avant de valider.')
        if not coded and not warnings:notes.append('Lignes codées non reconnues : seules les informations lisibles et libellées sont proposées. Photographiez la page avec photo du passeport, ou le recto et le verso de la carte séparément.')
    return fields,evidence,notes
