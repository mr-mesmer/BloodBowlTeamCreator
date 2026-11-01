#!/usr/bin/env python3
"""Build/check the 31 authored tournament rosters, without network or npm.

This is deliberately an independent implementation of the supplied house pack,
not a call into engine.ts. Vitest then feeds the exported RosterState JSON into
that engine and compares every cost/limit to validation.json. No optimiser or
claim of tactical optimality is hidden in this script: choices.json is authored.

Run --check to validate and detect stale outputs, or --write to regenerate them.
"""
from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import io
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'rosters' / 'recommended'
CATALOG_PATH = ROOT / 'src' / 'data' / 'catalog.json'
CHOICES_PATH = DIRECTORY / 'choices.json'
DOCUMENT_PATH = ROOT / 'docs' / 'tournament-rosters.md'

# Pinned to the user's text, not inferred from the catalogue being checked.
TIER_TEAMS = {
    1: ['old-world-alliance', 'orc', 'wood-elf', 'amazon'],
    2: ['skaven', 'underworld-denizens'],
    3: ['dark-elf', 'high-elf', 'human', 'lizardmen', 'shambling-undead', 'vampire', 'snotling'],
    4: ['necromantic-horror', 'norse', 'nurgle', 'tomb-kings'],
    5: ['chaos-chosen', 'chaos-dwarf', 'dwarf', 'elven-union', 'imperial-nobility', 'slann'],
    6: ['black-orc', 'bretonnian', 'chaos-renegades', 'gnome', 'goblin', 'halfling', 'khorne'],
    7: ['ogre'],
}
BUDGETS = {1: (1080, 120), 2: (1080, 150), 3: (1100, 170), 4: (1120, 200),
           5: (1140, 230), 6: (1160, 260), 7: (1180, 290)}
ELITE = {'block', 'dodge', 'guard', 'mighty-blow'}
RULE_PACK = {
    'minPlayers': 11, 'maxPlayers': 16, 'maxSecondary': 3, 'maxStacks': 3,
    'stackSurcharge': 10, 'primaryCost': 20, 'secondaryCost': 40, 'eliteSurcharge': 10,
    'tiers': [{'tier': tier, 'teamBudget': tb, 'skillGold': sg}
              for tier, (tb, sg) in BUDGETS.items()],
}


def contract(id_: str, name: str, team: int, skill: int) -> dict[str, Any]:
    return {'id': id_, 'name': name, 'teamGold': team, 'skillGold': skill, 'freebie': ''}


SPONSORS = [
    contract('bugmans', 'Bugman’s Brewery', 10, -10),
    contract('nuln', 'Nuln Gunnery School', 10, -15),
    contract('zoo', 'Imperial Zoo of Altdorf', 10, -20),
    contract('mootland', 'Mootland Farms', 20, -30),
    contract('karaz', 'Karaz-a-Karak Guild of Engineers', 30, -40),
]
COACHES = [
    contract('br1ght', 'Br1ght', -10, 10),
    contract('kolianxxxx', 'Kolianxxxx', -15, 10),
    contract('azzik', 'Azzik', -20, 10),
    contract('diomed', 'Diomed', -40, 20),
    contract('neproxy', 'Neproxy', -50, 30),
]
CONTRACTS = {c['id']: c for c in SPONSORS + COACHES}
STAFF_PRICES = {'apothecary': 50, 'assistants': 10, 'cheerleaders': 10, 'fans': 5}
STAFF_NAMES = {'apothecary': 'Apothecary', 'assistants': 'Помощники',
               'cheerleaders': 'Чирлидеры', 'fans': 'Дополнительно купленные Fans'}


class InvalidRoster(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise InvalidRoster(message)


def integer(value: Any, low: int, high: int, label: str) -> None:
    require(type(value) is int and low <= value <= high, f'{label}: нужно целое {low}…{high}, получено {value!r}')


def normalize(value: str) -> str:
    value = re.sub(r'\(\s*\+?\d+\+?\s*\)', '', value)
    return re.sub(r'[^a-z0-9а-я]', '', value.lower())


def dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def inducements(team: dict[str, Any]) -> dict[str, dict[str, Any]]:
    bribery = 'Bribery and Corruption' in team['specialRules']
    result = {
        'kegs': {'name': 'Blitzer’s Best Kegs', 'cost': 50, 'max': 2},
        'bribes': {'name': 'Bribes', 'cost': 50 if bribery else 100, 'max': 6 if bribery else 3},
        'chef': {'name': 'Halfling Master Chef', 'cost': 100 if team['id'] == 'halfling' else 300, 'max': 1},
        'mascot': {'name': 'Team Mascot', 'cost': 25, 'max': 1},
        'weather': {'name': 'Weather Mage', 'cost': 25, 'max': 1},
        'referee': {'name': 'Biased Referee: Dodgy League Rep', 'cost': 80 if bribery else 120, 'max': 1},
    }
    if 'Masters of Undeath' in team['specialRules']:
        result['mortuary'] = {'name': 'Mortuary Assistant', 'cost': 100, 'max': 1}
    if team['id'] == 'nurgle':
        result['plague'] = {'name': 'Plague Doctor', 'cost': 100, 'max': 1}
    if team['id'] in {'ogre', 'snotling'}:
        result['riotous'] = {'name': 'Riotous Rookies', 'cost': 150, 'max': 1}
    if team['apothecary']:
        result['wandering'] = {'name': 'Wandering Apothecaries', 'cost': 100, 'max': 2}
    return result


def skill_cost(added: dict[str, str], skills: dict[str, Any]) -> int:
    return (20 if added['type'] == 'primary' else 40) + (10 if skills[added['skillId']]['elite'] else 0)


def player_cost(player: dict[str, Any], skills: dict[str, Any]) -> int:
    return sum(skill_cost(s, skills) for s in player['skills']) + (10 if len(player['skills']) == 2 else 0)


def fee(tier: int, group: str) -> int:
    return (100 if tier <= 5 else 80) if group == 'legend' else (50 if tier <= 5 else 40)


def eligible(star: dict[str, Any], team: dict[str, Any], roster: dict[str, Any]) -> bool:
    tags = {roster['league'], *team['specialRules']}
    if roster['favoured']:
        tags.add(f"Favoured of {roster['favoured']}")
    for plays_for in star['playsFor']:
        rule = plays_for.lower()
        if rule == 'any team':
            return True
        if rule == 'any team except those from sylvanian spotlight':
            if roster['league'] != 'Sylvanian Spotlight':
                return True
        elif plays_for in tags:
            return True
    return False


def expand(entry: dict[str, Any], team: dict[str, Any], skills: dict[str, Any], date: str) -> dict[str, Any]:
    positions = {p['id']: p for p in team['positions']}
    players = []
    for group in entry['groups']:
        require(set(group) == {'positionId', 'count', 'skills'}, 'Неизвестное поле группы (характеристики не разрешены)')
        require(group['positionId'] in positions, f"Неизвестная позиция {group['positionId']}")
        integer(group['count'], 1, 16, 'Количество в группе')
        position = positions[group['positionId']]
        added = []
        for skill_id in group['skills']:
            require(skill_id in skills, f'Неизвестный навык {skill_id}')
            category = skills[skill_id]['category']
            access = 'primary' if category in position['primary'] else 'secondary'
            require(category in position[access], f"{position['name']}: недоступен {skill_id}")
            added.append({'skillId': skill_id, 'type': access})
        for _ in range(group['count']):
            number = len(players) + 1
            players.append({
                'id': f"recommended-{team['id']}-{number:02}",
                'positionId': position['id'],
                # RosterState has no captain field; preserve nomination visibly
                # without pretending that free Pro is a paid advancement.
                'name': 'Team Captain — Pro бесплатно' if number == entry['captain'] else '',
                'skills': [s.copy() for s in added],
            })
    require(entry['captain'] is None or 1 <= entry['captain'] <= len(players), 'Неверный номер капитана')
    has_captain = 'Team Captain' in team['specialRules']
    require(has_captain == (entry['captain'] is not None), 'Нужно явно назначить только разрешённого капитана')
    if has_captain:
        pos = positions[players[entry['captain'] - 1]['positionId']]
        require('Big Guy' not in pos['role'] and not pos['bigGuy'], 'Big Guy не может быть капитаном')
    return {
        'version': 1, 'id': f"recommended-{team['id']}",
        'name': f"{team['name']} — {entry['title']}", 'coach': '',
        'teamId': team['id'], 'league': entry['league'], 'favoured': entry['favoured'],
        'players': players,
        'stars': [{'id': f"recommended-{team['id']}-star-{i + 1}", 'starId': star_id}
                  for i, star_id in enumerate(entry['stars'])],
        'staff': entry['staff'], 'inducements': entry['inducements'],
        'sponsors': entry['sponsors'], 'coaches': entry['coaches'],
        'updatedAt': f'{date}T00:00:00.000Z',
    }


def validate(roster: dict[str, Any], team: dict[str, Any], skills: dict[str, Any], stars: dict[str, Any]) -> dict[str, Any]:
    tier = team['tier']
    positions = {p['id']: p for p in team['positions']}
    require(roster['league'] in team['leagues'], 'Неверная лига')
    require(roster['favoured'] in team['favouredOptions'] if team['favouredOptions'] else roster['favoured'] == '', 'Неверный Favoured')
    selected_contracts = []
    for kind, contracts in [('sponsors', SPONSORS), ('coaches', COACHES)]:
        ids = roster[kind]
        require(len(ids) == len(set(ids)), f'Повтор контракта: {kind}')
        allowed = {c['id'] for c in contracts}
        require(set(ids) <= allowed, f'Неизвестный контракт: {kind}')
        selected_contracts.extend(CONTRACTS[id_] for id_ in ids)
    base_team, base_skill = BUDGETS[tier]
    team_budget = base_team + sum(c['teamGold'] for c in selected_contracts)
    skill_budget = base_skill + sum(c['skillGold'] for c in selected_contracts)
    counts: Counter[str] = Counter()
    players_cost = advancement_cost = secondaries = stacks = big_guys = insignificant = 0
    all_ids = [p['id'] for p in roster['players']] + [s['id'] for s in roster['stars']]
    require(len(all_ids) == len(set(all_ids)), 'Повтор идентификатора игрока')
    for player in roster['players']:
        require(player['positionId'] in positions, 'Позиция из другой команды')
        position = positions[player['positionId']]
        counts[position['id']] += 1
        players_cost += position['cost']
        base = {normalize(s) for s in position['skills']}
        insignificant += int('insignificant' in base)
        big_guys += int(position['bigGuy'] or 'Big Guy' in position['role'])
        added = player['skills']
        require(len(added) <= 2, f"{position['name']}: не более двух навыков")
        secondaries += int(any(s['type'] == 'secondary' for s in added))
        stacks += int(len(added) == 2)
        if len(added) == 2:
            require(all(s['type'] == 'primary' for s in added), 'Стак может содержать только Primary')
        used = set(base)
        for item in added:
            require(item['type'] in {'primary', 'secondary'}, 'Неизвестный тип навыка')
            require(item['skillId'] in skills, 'Неизвестный навык')
            skill = skills[item['skillId']]
            require(skill['category'] in position[item['type']], 'Неправильный доступ к навыку')
            name = normalize(skill['name'])
            require(name not in used, f"{position['name']}: повтор навыка {skill['name']}")
            used.add(name)
        # Relevant BB2025 exclusions; no stat increases/traits can be purchased.
        require(not ('frenzy' in used and used & {'grab', 'hitandrun', 'multipleblock'}), 'Несовместимые навыки Frenzy')
        require(not {'leap', 'pogo'} <= used, 'Несовместимые Leap/Pogo')
        for restricted, prerequisite in [('bullseye', 'throwteammate'), ('strongarm', 'throwteammate'),
                                         ('lethalflight', 'rightstuff'), ('saboteur', 'secretweapon')]:
            require(restricted not in used or prerequisite in used, f'{restricted}: отсутствует обязательный Trait')
        advancement_cost += player_cost(player, skills)
    for id_, count in counts.items():
        require(count <= positions[id_]['max'], f"{positions[id_]['name']}: превышен лимит")
    require(team['maxBigGuys'] is None or big_guys <= team['maxBigGuys'], 'Превышен общий лимит Big Guys')
    require(secondaries <= 3, 'Более трёх игроков с Secondary')
    require(stacks <= 3, 'Более трёх стаков')

    hires = [s['starId'] for s in roster['stars']]
    require(len(hires) == len(set(hires)), 'Повтор звезды')
    star_cost = tax = star_members = 0
    groups: Counter[str] = Counter()
    for id_ in hires:
        require(id_ in stars, f'Звезда {id_} не входит в whitelist каталога')
        star = stars[id_]
        require(eligible(star, team, roster), f"Звезда {star['name']} недоступна выбранной лиге/Favoured")
        require(star['group'] in {'veteran', 'legend'}, 'Неизвестная категория звезды')
        groups[star['group']] += 1
        star_cost += star['cost']
        tax += fee(tier, star['group'])
        star_members += len(star['members'])
        insignificant += sum('insignificant' in {normalize(s) for s in m['skills']} for m in star['members'])
    require(len(groups) <= 1 and groups['legend'] <= 1 and groups['veteran'] <= 2, 'Незаконная комбинация звёзд')
    require(not (hires and tier <= 4 and (secondaries or stacks)), 'Тиры 1–4 со звёздами: запрещены Secondary/стаки')
    total_players = len(roster['players']) + star_members
    require(11 <= total_players <= 16, f'В заявке {total_players} игроков, нужно 11–16')
    require(insignificant <= total_players - insignificant, 'Превышен лимит Insignificant')

    staff = roster['staff']
    require(set(staff) == {'rerolls', *STAFF_PRICES}, 'Неизвестный сайдлайн-стаф')
    integer(staff['rerolls'], 0, 8, 'Рероллы')
    integer(staff['apothecary'], 0, 1, 'Apothecary')
    integer(staff['assistants'], 0, 6, 'Помощники')
    integer(staff['cheerleaders'], 0, 6, 'Чирлидеры')
    integer(staff['fans'], 0, 3, 'Fans')
    require(team['apothecary'] or staff['apothecary'] == 0, 'Apothecary недоступен')
    staff_cost = staff['rerolls'] * team['rerollCost'] + sum(staff[k] * price for k, price in STAFF_PRICES.items())
    allowed_inducements = inducements(team)
    inducement_cost = 0
    for id_, quantity in roster['inducements'].items():
        require(id_ in allowed_inducements, f'Запрещённое поощрение {id_}')
        item = allowed_inducements[id_]
        integer(quantity, 0, item['max'], item['name'])
        inducement_cost += quantity * item['cost']
    team_cost = players_cost + star_cost + staff_cost + inducement_cost
    skill_total = advancement_cost + tax
    require(team_cost <= team_budget, f'Team Budget превышен: {team_cost}/{team_budget}')
    require(skill_total <= skill_budget, f'Skill Gold превышен: {skill_total}/{skill_budget}')
    return {
        'teamId': team['id'], 'teamName': team['name'], 'tier': tier, 'valid': True,
        'baseTeamBudget': base_team, 'baseSkillBudget': base_skill,
        'teamBudget': team_budget, 'skillBudget': skill_budget,
        'playersCost': players_cost, 'starsCost': star_cost, 'staffCost': staff_cost,
        'inducementsCost': inducement_cost, 'teamCost': team_cost,
        'advancementCost': advancement_cost, 'starSurcharge': tax, 'skillCost': skill_total,
        'teamRemaining': team_budget - team_cost, 'skillRemaining': skill_budget - skill_total,
        'playerCount': total_players, 'regularPlayerCount': len(roster['players']),
        'starMemberCount': star_members, 'secondaryCount': secondaries, 'stackCount': stacks,
        'freeAssistants': 0, 'freeCheerleaders': 0,
        'insignificantCount': insignificant, 'nonInsignificantCount': total_players - insignificant,
        'regularBigGuyCount': big_guys, 'maxBigGuys': team['maxBigGuys'],
        'positions': [{'id': p['id'], 'count': counts[p['id']], 'max': p['max']} for p in team['positions']],
        'checks': {key: True for key in [
            'tierMatchesUserText', 'independentBudgets', 'skillAccessAndElite', 'noDuplicateSkills',
            'onlyPrimaryStacks', 'maxThreeSecondary', 'maxThreeStacks', 'noStatIncreases',
            'positionalLimits', 'sharedBigGuyLimits', 'elevenToSixteenPlayers', 'insignificant',
            'starWhitelist', 'starLeagueAndGroup', 'starSkillRestrictions', 'staffAndInducements',
            'uniqueContracts',
        ]},
    }


def sign(value: int) -> str:
    return f'{value:+}k' if value else '0k'


def skill_description(player: dict[str, Any], skills: dict[str, Any]) -> str:
    parts = []
    for added in player['skills']:
        sk = skills[added['skillId']]
        access = 'P' if added['type'] == 'primary' else 'S'
        parts.append(f"{sk['name']} ({access}{', E' if sk['elite'] else ''}; {skill_cost(added, skills)}k)")
    if len(parts) == 2:
        parts.append('стак +10k')
    return ' + '.join(parts) if parts else '—'


def render_team(index: int, entry: dict[str, Any], roster: dict[str, Any], calc: dict[str, Any],
                team: dict[str, Any], skills: dict[str, Any], stars: dict[str, Any]) -> str:
    lines = [f"<a id=\"{team['id']}\"></a>", f"## {index}. {team['name']} — тир {team['tier']}",
             '', f"**{entry['title']}**", '', f"**Что важно.** {entry['analysis']['priority']}", '',
             f"**Лига:** {roster['league']}." + (f" **Favoured of:** {roster['favoured']}." if roster['favoured'] else ''),
             '', f"**Состав:** {calc['playerCount']} игроков, постоянный резерв {calc['playerCount'] - 11}.", '',
             '| № | Позиция | Кол-во | Цена одного | Team Budget | Добавленные навыки одному | Skill Gold за строку |',
             '|---|---|---:|---:|---:|---|---:|']
    positions = {p['id']: p for p in team['positions']}
    cursor = 0
    for group in entry['groups']:
        count = group['count']
        position = positions[group['positionId']]
        numbers = str(cursor + 1) if count == 1 else f'{cursor + 1}–{cursor + count}'
        if entry['captain'] is not None and cursor < entry['captain'] <= cursor + count:
            numbers += f" (капитан №{entry['captain']})"
        player = roster['players'][cursor]
        lines.append(f"| {numbers} | {position['name']} | {count} | {position['cost']}k | {count * position['cost']}k | {skill_description(player, skills)} | {count * player_cost(player, skills)}k |")
        cursor += count
    for hire in roster['stars']:
        star = stars[hire['starId']]
        count = len(star['members'])
        numbers = str(cursor + 1) if count == 1 else f'{cursor + 1}–{cursor + count}'
        lines.append(f"| {numbers} ★ | {star['name']} — {'Legend' if star['group'] == 'legend' else 'Veteran'} | {count} | {star['cost']}k за найм | {star['cost']}k | Без прокачки; только базовый профиль | {fee(team['tier'], star['group'])}k — налог |")
        cursor += count
    lines.extend(['', f"**Игроки и звёзды:** {calc['playersCost']}k + {calc['starsCost']}k = {calc['playersCost'] + calc['starsCost']}k Team Budget.", ''])
    if entry['captain'] is not None:
        lines.extend([f"**Team Captain — №{entry['captain']}: Pro бесплатно**, не покупаемый навык и не стак; назначение сохранено в имени игрока в JSON.", ''])
    lines.append(f"**Рероллы:** {roster['staff']['rerolls']} купленных × {team['rerollCost']}k = {roster['staff']['rerolls'] * team['rerollCost']}k.")
    leader_count = sum(s['skillId'] == 'leader' for p in roster['players'] for s in p['skills'])
    leader_count += sum(any(normalize(s) == 'leader' for s in member['skills']) for hire in roster['stars'] for member in stars[hire['starId']]['members'])
    if leader_count:
        lines.append(f"Leader даёт ещё одну переброску на половину при выполнении условий: **{roster['staff']['rerolls']} + 1 Leader**, не считая переменных Chef/Mascot.")
    selected_staff = [f"{STAFF_NAMES[k]}: {roster['staff'][k]} × {price}k = {roster['staff'][k] * price}k" for k, price in STAFF_PRICES.items() if roster['staff'][k]]
    if not roster['staff']['apothecary']:
        selected_staff.insert(0, 'Apothecary: нет' + ('' if team['apothecary'] else ' (недоступен)'))
    lines.extend(['', '**Сайдлайн:** ' + '; '.join(selected_staff) + '. Других покупок стафа нет.', '', '**Поощрения:**'])
    available = inducements(team)
    purchases = [(id_, n) for id_, n in roster['inducements'].items() if n]
    if not purchases:
        lines.append('- Нет.')
    for id_, n in purchases:
        item = available[id_]
        lines.append(f"- {item['name']}: {n} × {item['cost']}k = **{n * item['cost']}k**.")
    if roster['inducements'].get('riotous'):
        lines.append('- Riotous Rookies — временные игроки на матч, не включены в постоянное число игроков выше.')
    lines.extend(['', '**Контракты и доступное золото:**', '', '| Основание | Team Budget | Skill Gold |', '|---|---:|---:|',
                  f"| База тира {team['tier']} | {calc['baseTeamBudget']}k | {calc['baseSkillBudget']}k |"])
    selected = roster['sponsors'] + roster['coaches']
    for id_ in selected:
        c = CONTRACTS[id_]
        kind = 'Спонсор' if id_ in roster['sponsors'] else 'Тренер'
        lines.append(f"| {kind}: {c['name']} | {sign(c['teamGold'])} | {sign(c['skillGold'])} |")
    if not selected:
        lines.append('| Без спонсоров и именитых тренеров | 0k | 0k |')
    lines.extend([f"| **Доступно после контрактов** | **{calc['teamBudget']}k** | **{calc['skillBudget']}k** |", '',
                  f"**Расход Team Budget:** игроки {calc['playersCost']} + звёзды {calc['starsCost']} + рероллы/стаф {calc['staffCost']} + поощрения {calc['inducementsCost']} = **{calc['teamCost']} / {calc['teamBudget']}k**. Остаток **{calc['teamRemaining']}k**.", '',
                  f"**Расход Skill Gold:** навыки с Elite/стаками {calc['advancementCost']} + звёздный налог {calc['starSurcharge']} = **{calc['skillCost']} / {calc['skillBudget']}k**. Остаток **{calc['skillRemaining']}k**.", '',
                  f"**План игры.** {entry['analysis']['plan']}", '',
                  f"**Цена выбора / слабое место.** {entry['analysis']['tradeoff']}", '',
                  f"**Сравнение с турнирным образцом.** {entry['analysis']['comparison']} [Опубликованный BB2025-образец]({entry['reference']}). Это ссылка для сравнения, не готовая заявка под ваш пак.", ''])
    details = f"{calc['playerCount']} постоянных игроков; Secondary {calc['secondaryCount']}/3; стаки {calc['stackCount']}/3"
    if calc['insignificantCount']:
        details += f"; Insignificant {calc['insignificantCount']} ≤ {calc['nonInsignificantCount']} без Trait"
    if team['maxBigGuys'] is not None:
        details += f"; обычные Big Guys {calc['regularBigGuyCount']}/{team['maxBigGuys']}"
    if roster['stars']:
        details += '; выбранная звезда в whitelist и доступна лиге; Secondary/стаки со звездой разрешены этому тиру'
    lines.extend([f'**Проверка: PASS.** {details}. Позиционные лимиты, доступ навыков, оба бюджета и остальные проверки пройдены.', '',
                  f"[JSON этого ростера](../rosters/recommended/json/{team['id']}.json) · [к сводке](#summary)", '', '---', ''])
    return '\n'.join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--write', action='store_true', help='validate and regenerate deliverables')
    mode.add_argument('--check', action='store_true', help='validate and fail if a deliverable is stale (default)')
    args = parser.parse_args()
    catalog = json.loads(CATALOG_PATH.read_text())
    choices = json.loads(CHOICES_PATH.read_text())
    teams = {t['id']: t for t in catalog['teams']}
    skills = {s['id']: s for s in catalog['skills']}
    stars = {s['id']: s for s in catalog['stars']}
    expected_tiers = {id_: tier for tier, ids in TIER_TEAMS.items() for id_ in ids}
    entries = choices['entries']
    require(catalog['edition'] == choices['edition'] == 'BB2025', 'Неверная редакция')
    require(len(teams) == len(entries) == 31, 'Нужно ровно 31 команду и 31 ростер')
    require(len({e['teamId'] for e in entries}) == 31, 'Повтор команды')
    require(set(teams) == set(expected_tiers) == {e['teamId'] for e in entries}, 'Список команд отличается от пака')
    # Parse just the literal tier map. Importing build_catalog.py would need its
    # external source data and overwrite the catalogue as an unwanted side effect.
    generator = ast.parse((ROOT / 'scripts' / 'build_catalog.py').read_text())
    tier_map = next(ast.literal_eval(node.value) for node in ast.walk(generator)
                    if isinstance(node, ast.Assign)
                    and any(isinstance(t, ast.Name) and t.id == 'TIER_NAMES' for t in node.targets))
    generated_tiers = {name: tier for tier, names in tier_map.items() for name in names}
    require(generated_tiers == {t['name']: expected_tiers[t['id']] for t in teams.values()},
            'Генератор каталога восстановил бы неправильные тиры')
    require({s['id'] for s in catalog['skills'] if s['elite']} == ELITE, 'Расхождение списка Elite')
    require(len(stars) == 52 and sum(s['group'] == 'veteran' for s in stars.values()) == 40, 'Расхождение whitelist звёзд')
    outputs: dict[Path, str] = {}
    reports = []
    rosters = []
    for entry in entries:
        team = teams[entry['teamId']]
        try:
            require(team['tier'] == expected_tiers[team['id']], f"Неверный тир {team['tier']} вместо {expected_tiers[team['id']]}")
            require(bool(entry['title']) and set(entry['analysis']) == {'priority', 'plan', 'tradeoff', 'comparison'}, 'Не заполнены пояснения')
            roster = expand(entry, team, skills, choices['date'])
            calc = validate(roster, team, skills, stars)
        except InvalidRoster as error:
            raise InvalidRoster(f"{team['name']}: {error}") from error
        outputs[DIRECTORY / 'json' / f"{team['id']}.json"] = dump(roster)
        reports.append(calc)
        rosters.append(roster)
    report = {
        'date': choices['date'], 'edition': 'BB2025', 'flowingFunds': 0,
        'rulePack': RULE_PACK, 'tierTeams': {str(k): v for k, v in TIER_TEAMS.items()},
        'sponsors': SPONSORS, 'coaches': COACHES,
        'inputs': {'catalogSha256': hashlib.sha256(CATALOG_PATH.read_bytes()).hexdigest(),
                   'choicesSha256': hashlib.sha256(CHOICES_PATH.read_bytes()).hexdigest()},
        'allValid': True, 'count': len(reports), 'rosters': reports,
    }
    outputs[DIRECTORY / 'validation.json'] = dump(report)
    lines = [(DIRECTORY / 'methodology.md').read_text().rstrip(), '', '<a id="summary"></a>',
             '## Сводка: 31 ростер', '',
             '**В каждой бюджетной ячейке: потрачено / доступно после контрактов. Skill Gold уже включает налог на звезду. Каждый из 31 ростера прошёл независимую проверку; JSON также проверяются движком билдера через `npm test`.**', '',
             '| Команда | Тир | Игроки | Куплено RR | Leader | Apothecary | Звезда | Team Budget | Skill Gold | S / стаки |',
             '|---|---:|---:|---:|---:|---:|---|---:|---:|---:|']
    csv_buffer = io.StringIO(newline='')
    writer = csv.writer(csv_buffer, lineterminator='\n')
    writer.writerow(['team', 'tier', 'players', 'bought_rerolls', 'leader', 'apothecary', 'stars',
                     'team_spent_k', 'team_budget_k', 'skill_spent_k', 'skill_budget_k', 'secondary', 'stacks'])
    for roster, calc in zip(rosters, reports):
        team = teams[roster['teamId']]
        leader = int(any(s['skillId'] == 'leader' for p in roster['players'] for s in p['skills']))
        star_names = ', '.join(stars[s['starId']]['name'] for s in roster['stars'])
        lines.append(f"| [{team['name']}](#{team['id']}) | {team['tier']} | {calc['playerCount']} | {roster['staff']['rerolls']} | {leader} | {roster['staff']['apothecary']} | {star_names or '—'} | {calc['teamCost']}/{calc['teamBudget']}k | {calc['skillCost']}/{calc['skillBudget']}k | {calc['secondaryCount']} / {calc['stackCount']} |")
        writer.writerow([team['name'], team['tier'], calc['playerCount'], roster['staff']['rerolls'], leader,
                         roster['staff']['apothecary'], star_names, calc['teamCost'], calc['teamBudget'],
                         calc['skillCost'], calc['skillBudget'], calc['secondaryCount'], calc['stackCount']])
    lines.extend(['', '---', ''])
    for i, (entry, roster, calc) in enumerate(zip(entries, rosters, reports), 1):
        lines.append(render_team(i, entry, roster, calc, teams[entry['teamId']], skills, stars))
    outputs[DOCUMENT_PATH] = '\n'.join(lines).rstrip() + '\n'
    outputs[DIRECTORY / 'summary.csv'] = csv_buffer.getvalue()
    expected_json = {p.name for p in outputs if p.parent == DIRECTORY / 'json'}
    actual_json = {p.name for p in (DIRECTORY / 'json').glob('*.json')}
    require(not actual_json - expected_json, f'Лишние JSON, проверьте вручную: {actual_json - expected_json}')
    stale = [p for p, content in outputs.items() if not p.exists() or p.read_bytes() != content.encode('utf-8')]
    if args.write:
        for path in stale:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(outputs[path].encode('utf-8'))
        print(f'Generated {len(outputs)} deliverables ({len(stale)} changed).')
    elif stale:
        print('Stale/missing deliverables; run --write after reviewing choices:', file=sys.stderr)
        for path in stale:
            print(f'  {path.relative_to(ROOT)}', file=sys.stderr)
        return 1
    for calc in reports:
        print(f"PASS {calc['teamName']:22} T{calc['tier']} n={calc['playerCount']:2} "
              f"TB {calc['teamCost']:4}/{calc['teamBudget']:4} SG {calc['skillCost']:3}/{calc['skillBudget']:3} "
              f"S={calc['secondaryCount']} stacks={calc['stackCount']}")
    print('31/31 legal. Flowing Funds: 0. No budget transfers except explicit contracts.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (InvalidRoster, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f'FAILED: {error}', file=sys.stderr)
        sys.exit(1)
