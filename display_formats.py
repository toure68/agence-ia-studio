"""Shared display and saved-person-name normalization (no currency conversion)."""
import re
from decimal import Decimal

def person_name(value):
    value=' '.join(value.split())
    return re.sub(r"[^\W\d_]+",lambda m:m.group(0).capitalize(),value,flags=re.UNICODE)

def money(minor, currency='EUR'):
    amount=format(Decimal(minor)/100,',.2f').replace(',',' ').replace('.',',')
    return amount+' '+{'EUR':'€','USD':'$','XOF':'FCFA'}.get(currency,currency)
