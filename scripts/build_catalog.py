#!/usr/bin/env python3
"""Build the compact factual BB2025 catalogue used by the roster builder.

Source data: protoLabsAI/bloodbowl-plugin (MIT), which transcribes
bloodbowlbase.ru. Slann is supplemented from the public BB2025 roster reference.
The rule pack itself is maintained separately in src/lib/rules.ts.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/tmp/bbplugin/data')
META = Path('/tmp/bbtc_meta.json')
OUT = ROOT / 'src' / 'data' / 'catalog.json'

rosters = json.loads((SOURCE / 'rosters.json').read_text())
skill_source = json.loads((SOURCE / 'skills.json').read_text())['skills']
meta = json.loads(META.read_text()) if META.exists() else {}

TIER_NAMES = {
    1: ['Amazon', 'Old World Alliance', 'Orc', 'Wood Elf'],
    2: ['Skaven', 'Underworld Denizens'],
    3: ['Dark Elf', 'High Elf', 'Human', 'Lizardmen', 'Shambling Undead', 'Vampire'],
    4: ['Necromantic Horror', 'Norse', 'Nurgle', 'Tomb Kings'],
    5: ['Chaos Chosen', 'Chaos Dwarf', 'Dwarf', 'Elven Union', 'Imperial Nobility', 'Slann', 'Snotling'],
    6: ['Black Orc', 'Bretonnian', 'Chaos Renegades', 'Gnome', 'Goblin', 'Halfling', 'Khorne'],
    7: ['Ogre'],
}
TEAM_TIER = {name: tier for tier, names in TIER_NAMES.items() for name in names}
BIG_GUY_LIMITS = {
    'Chaos Chosen': 1,
    'Chaos Renegades': 3,
    'Old World Alliance': 1,
    'Underworld Denizens': 1,
}
FAVOURED = {
    'Chaos Chosen': ['Undivided', 'Hashut', 'Khorne', 'Nurgle', 'Slaanesh', 'Tzeentch'],
    'Chaos Renegades': ['Undivided', 'Khorne', 'Nurgle', 'Slaanesh', 'Tzeentch'],
}
TEAM_SLUG_OVERRIDES = {
    'Black Orc': 'black-orc', 'Chaos Chosen': 'chaos-chosen',
    'Chaos Dwarf': 'chaos-dwarf', 'Chaos Renegades': 'chaos-renegade',
    'Dark Elf': 'dark-elf', 'Elven Union': 'elven-union', 'High Elf': 'high-elf',
    'Imperial Nobility': 'imperial-nobility', 'Necromantic Horror': 'necromantic-horror',
    'Old World Alliance': 'old-world-alliance', 'Shambling Undead': 'shambling-undead',
    'Tomb Kings': 'tomb-kings', 'Underworld Denizens': 'underworld-denizens',
    'Wood Elf': 'wood-elf',
}
VETERANS = [
    'Akhorne The Squirrel', 'Anqi Panqi', 'Barik Farblast', 'Bilerot Vomitflesh',
    "Boa Kon'ssstriktr", 'Count Luthor von Drakenborg', 'Captain Karina von Riesz',
    'Eldril Sidewinder', 'Fungus the Loon', 'Glart Smashrip', 'Gloriel Summerbloom',
    'Glotl Stop', 'Grashnak Blackhoof', 'Gretchen Wächter', 'Grim Ironjaw',
    'Grombrindal', 'Guffle Pusmaw', 'Helmut Wulf', 'Josef Bugman', 'Karla von Kill',
    'Kiroth Krakeneye', 'Max Spleenripper', 'Nobbla Blackwart', 'Puggy Baconbreath',
    'Rashnak Backstabber', 'Rodney Roachbait', 'Rowana Forestfoot',
    'Rumbelow Sheepskin', 'Scrappa Sorehead', 'Scyla Anfingrimm',
    'Skrull Halfheight', 'Swiftvine Glimmershard', 'The Black Gobbo',
    'The Mighty Zug', 'Thorsson Stoutmead', 'Varag Ghoul-Chewer', 'Wilhelm Chaney',
    'Willow Rosebark', 'Withergrasp Doubledrool', 'Zzharg Madeye',
]
LEGENDS = [
    'Deeproot Strongbranch', 'Grak and Crumbleberry', 'Ivar Eriksson',
    'Kreek Rustgouger', 'Lord Borak the Despoiler', 'The Swift Twins',
    'Maple Highgrove', "Morg 'n' Thorg", 'Ripper Bolgrot', 'Skitter Stab-Stab',
    'Skrorg Snowpelt', 'Zolcath the Zoat',
]
DISPLAY_NAMES = {
    'Akhorne The Squirrel': 'Akhorne the Squirrel',
    'Captain Karina von Riesz': 'Cpt Karina von Riesz',
    'Grak and Crumbleberry': 'Grak & Crumbleberry',
    'The Swift Twins': 'Lucien & Valen Swift',
}
CATEGORY_CODES = {
    'Agility': 'A', 'Devious': 'D', 'General': 'G',
    'Mutation': 'M', 'Passing': 'P', 'Strength': 'S',
}

def slug(value: str) -> str:
    value = value.replace('ä', 'a').replace('ö', 'o').replace('ü', 'u')
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')

def cost(value: str | int | None) -> int:
    if value is None:
        return 0
    return int(re.sub(r'\D', '', str(value)))

def title(value: str) -> str:
    small = {'and', 'of', 'the', 'on', 'in', 'a', 'to'}
    words = value.lower().split(' ')
    return ' '.join(w if i and w in small else w[:1].upper() + w[1:] for i, w in enumerate(words))

skills = {}
for raw in skill_source.values():
    if raw.get('kind') != 'Skill' or raw.get('category') not in CATEGORY_CODES:
        continue
    name = title(raw['name'])
    skills[slug(name)] = {
        'id': slug(name), 'name': name,
        'category': CATEGORY_CODES[raw['category']],
        'elite': bool(raw.get('elite')),
    }

teams = []
for raw in rosters['teams']:
    name = raw['name']
    team_slug = slug(name)
    positions = []
    for index, p in enumerate(raw['positionals']):
        positions.append({
            'id': f'{team_slug}-{index}',
            'name': p['position'].rstrip('*'),
            'role': p.get('role', ''),
            'max': int(p['qty'].split('-')[-1]),
            'cost': cost(p['cost']),
            'stats': {k: p[k] for k in ['MA', 'ST', 'AG', 'PA', 'AV']},
            'skills': p.get('skills', []),
            'primary': [c for c in p.get('primary', []) if c != '-'],
            'secondary': [c for c in p.get('secondary', []) if c != '-'],
            'bigGuy': p['position'].endswith('*'),
        })
    bbtc = meta.get(TEAM_SLUG_OVERRIDES.get(name, team_slug), {})
    leagues = bbtc.get('leagues') or raw.get('league') or []
    leagues = ['Elven Kingdoms League' if x == 'Elven Kingdom League' else x for x in leagues]
    special = list(raw.get('special_rules') or [])
    if name in FAVOURED:
        special = [x for x in special if not x.startswith('Favoured of')]
    special = [x.split(' (Chaos Clash)')[0] if x.startswith('Favoured of') else x for x in special]
    teams.append({
        'id': team_slug, 'name': name, 'tier': TEAM_TIER[name],
        'positions': positions, 'rerollCost': cost(raw['reroll_cost']),
        'apothecary': 'Apothecary' in raw.get('staff', {}),
        'leagues': leagues, 'specialRules': special,
        'favouredOptions': FAVOURED.get(name, []),
        'maxBigGuys': BIG_GUY_LIMITS.get(name),
        'source': raw.get('source'),
    })

# Slann is a NAF legacy roster and is not part of the 30-team source catalogue.
if not any(t['name'] == 'Slann' for t in teams):
    slann_positions = [
        ('Slann Lineman', 'Lineman, Lizardman', 16, 60, ['6','3','3+','4+','9+'], ['Pogo'], ['G'], ['A','S']),
        ('Slann Catcher', 'Catcher, Lizardman', 2, 80, ['7','2','2+','3+','8+'], ['Diving Catch','On the Ball','Pogo','Very Long Legs'], ['A','G'], ['P','S']),
        ('Slann Blitzer', 'Blitzer, Lizardman', 2, 100, ['7','3','3+','4+','9+'], ['Diving Tackle','Hit and Run','Jump Up','Pogo'], ['A','G','S'], ['P']),
        ('Kroxigor', 'Big Guy, Lizardman', 1, 140, ['6','5','5+','-','10+'], ['Bone Head','Loner (4+)','Mighty Blow','Prehensile Tail','Thick Skull'], ['S'], ['A','G']),
    ]
    positions = []
    for index, (name, role, maximum, price, stats, base, primary, secondary) in enumerate(slann_positions):
        positions.append({
            'id': f'slann-{index}', 'name': name, 'role': role, 'max': maximum,
            'cost': price, 'stats': dict(zip(['MA','ST','AG','PA','AV'], stats)),
            'skills': base, 'primary': primary, 'secondary': secondary, 'bigGuy': False,
        })
    teams.append({
        'id': 'slann', 'name': 'Slann', 'tier': 5, 'positions': positions,
        'rerollCost': 50, 'apothecary': True, 'leagues': ['Lustrian Superleague'],
        'specialRules': [], 'favouredOptions': [], 'maxBigGuys': None,
        'source': 'https://dadidimerda.it/teams.php?ruleset=bb25',
    })

source_stars = {s['name']: s for s in rosters['stars']}
missing = [n for n in VETERANS + LEGENDS if n not in source_stars]
assert not missing, f'Missing star players: {missing}'
stars = []
for group, names in [('veteran', VETERANS), ('legend', LEGENDS)]:
    for name in names:
        raw = source_stars[name]
        stars.append({
            'id': slug(name), 'name': DISPLAY_NAMES.get(name, name), 'group': group,
            'cost': cost(raw['cost']), 'playsFor': raw.get('plays_for', []),
            'members': [{
                'name': m['name'], 'role': m.get('role', ''),
                'stats': m['stats'], 'skills': m.get('skills', []),
                'specialRules': m.get('special_rules', []),
            } for m in raw['members']],
            'source': raw.get('source'),
        })

catalog = {
    'edition': 'BB2025',
    'teams': sorted(teams, key=lambda t: (t['tier'], t['name'])),
    'skills': sorted(skills.values(), key=lambda s: (s['category'], s['name'])),
    'stars': stars,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
print(f'Wrote {OUT}: {len(teams)} teams, {len(skills)} skills, {len(stars)} allowed stars')
assert len(teams) == 31
assert len(stars) == 52
