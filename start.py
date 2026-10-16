"""Démarrage local simplifié de la démo (non destiné à l'hébergement public)."""
from pathlib import Path
import getpass
import json
import os
import re
import secrets

BASE = Path(__file__).resolve().parent
ENV_FILE = BASE / '.env'


def prepare_config():
    if ENV_FILE.exists():
        return
    print("\nBienvenue dans Agence IA Studio V2 – configuration initiale\n")
    while True:
        email = input('Email administrateur : ').strip().lower()
        if re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
            break
        print('Saisissez un email valide.')
    while True:
        pwd = getpass.getpass('Mot de passe administrateur (12 caractères minimum) : ')
        if len(pwd) < 12:
            print('Mot de passe trop court.')
            continue
        if pwd != getpass.getpass('Confirmer le mot de passe : '):
            print('Les mots de passe ne correspondent pas.')
            continue
        break
    settings = {
        'ADMIN_EMAIL': email,
        'ADMIN_PASSWORD': pwd,
        'SESSION_SECRET': secrets.token_hex(48),
        'DATABASE_PATH': str(BASE / 'data' / 'app.db'),
        'APP_ENV': 'development'
    }
    ENV_FILE.write_text(''.join(f'{k}={json.dumps(v,ensure_ascii=False)}\n' for k,v in settings.items()), encoding='utf-8')
    try:
        os.chmod(ENV_FILE, 0o600)
    except OSError:
        pass
    print('\nConfiguration enregistrée localement dans .env (ne pas partager).')


if __name__ == '__main__':
    prepare_config()
    from dotenv import load_dotenv
    load_dotenv(ENV_FILE, override=False)
    import uvicorn
    print('\nApplication disponible sur http://127.0.0.1:8000')
    print('Site public fictif : http://127.0.0.1:8000/site/eclat-proprete')
    print('Pour arrêter : Ctrl+C. Ne publiez pas ce mode local sur Internet.\n')
    uvicorn.run('app:app', host='127.0.0.1', port=8000, reload=False)
