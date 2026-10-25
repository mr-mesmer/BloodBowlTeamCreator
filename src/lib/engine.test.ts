import { describe, expect, it } from 'vitest';
import { catalog, getStar, getTeam } from './catalog';
import { calculateRoster, isStarEligible, playerAdvancementCost } from './engine';
import { RULE_PACK, starSurcharge } from './rules';
import { createPlayer, createRoster } from './state';
import type { RosterState } from './types';

function withPlayers(teamId: string, positionName: string, count: number): RosterState {
  const roster = createRoster(teamId);
  const team = getTeam(teamId);
  const position = team.positions.find((item) => item.name === positionName)!;
  roster.players = Array.from({ length: count }, () => createPlayer(position.id));
  return roster;
}

function errorIds(roster: RosterState) {
  return calculateRoster(roster).errors.map((error) => error.id);
}

describe('catalogue and tier budgets', () => {
  it('contains all 31 teams and exactly the 52 allowed stars', () => {
    expect(catalog.teams).toHaveLength(31);
    expect(catalog.stars).toHaveLength(52);
    expect(catalog.stars.filter((star) => star.group === 'veteran')).toHaveLength(40);
    expect(catalog.stars.filter((star) => star.group === 'legend')).toHaveLength(12);
    expect(catalog.stars.some((star) => star.name === 'Griff Oberwald')).toBe(false);
  });

  it.each(catalog.teams.map((team) => [team.name, team.id, team.tier] as const))('uses the custom budget for %s', (_name, id, tier) => {
    const calc = calculateRoster(createRoster(id));
    const expected = RULE_PACK.tiers[tier - 1];
    expect(calc.baseTeamBudget).toBe(expected.teamBudget);
    expect(calc.baseSkillBudget).toBe(expected.skillGold);
  });

  it('assigns Amazon the tier 1 budgets', () => {
    expect(getTeam('amazon').tier).toBe(1);
    const calc = calculateRoster(createRoster('amazon'));
    expect(calc.baseTeamBudget).toBe(1080);
    expect(calc.baseSkillBudget).toBe(120);
  });

  it('uses the requested star surcharges', () => {
    expect(starSurcharge(1, 'veteran')).toBe(50);
    expect(starSurcharge(5, 'veteran')).toBe(50);
    expect(starSurcharge(6, 'veteran')).toBe(40);
    expect(starSurcharge(7, 'legend')).toBe(80);
    expect(starSurcharge(5, 'legend')).toBe(100);
  });
});

describe('contracts', () => {
  it.each([['diomed', 40, 20], ['neproxy', 50, 30]] as const)(
    'charges the updated hiring cost for %s', (coach, cost, skillGold) => {
      const roster = createRoster('human');
      const before = calculateRoster(roster);
      roster.coaches = [coach];
      const after = calculateRoster(roster);
      expect(after.teamBudget).toBe(before.teamBudget - cost);
      expect(after.skillBudget).toBe(before.skillBudget + skillGold);
      expect(after.freeAssistants).toBe(1);
    },
  );

  it('calculates the Necromantic Horror example with updated coach costs', () => {
    const roster = withPlayers('necromantic-horror', 'Zombie Lineman', 11);
    roster.sponsors = ['bugmans'];
    roster.coaches = ['br1ght', 'diomed'];
    const calc = calculateRoster(roster);
    expect(calc.teamBudget).toBe(1080);
    expect(calc.skillBudget).toBe(220);
    expect(calc.freeCheerleaders).toBe(1);
    expect(calc.freeAssistants).toBe(2);
  });

  it('does not charge Team Budget for contract freebies', () => {
    const roster = withPlayers('human', 'Human Lineman', 11);
    const before = calculateRoster(roster).teamCost;
    roster.sponsors = ['bugmans'];
    roster.coaches = ['br1ght'];
    expect(calculateRoster(roster).teamCost).toBe(before);
  });
});

describe('player advancement', () => {
  it('charges Primary, Secondary, Elite and stack surcharges correctly', () => {
    const blitzer = createPlayer(getTeam('human').positions.find((p) => p.name === 'Human Blitzer')!.id);
    blitzer.skills = [
      { skillId: 'guard', type: 'primary' },
      { skillId: 'mighty-blow', type: 'primary' },
    ];
    expect(playerAdvancementCost(blitzer)).toBe(70);

    const lineman = createPlayer(getTeam('human').positions.find((p) => p.name === 'Human Lineman')!.id);
    lineman.skills = [{ skillId: 'guard', type: 'secondary' }];
    expect(playerAdvancementCost(lineman)).toBe(50);
  });

  it('allows no more than three players with Secondary skills', () => {
    const roster = withPlayers('human', 'Human Lineman', 11);
    roster.players.slice(0, 4).forEach((player) => { player.skills = [{ skillId: 'guard', type: 'secondary' }]; });
    expect(errorIds(roster)).toContain('secondary-limit');
  });

  it('allows no more than three Primary stacks', () => {
    const roster = withPlayers('human', 'Human Lineman', 11);
    roster.players.slice(0, 4).forEach((player) => {
      player.skills = [{ skillId: 'block', type: 'primary' }, { skillId: 'sure-hands', type: 'primary' }];
    });
    expect(errorIds(roster)).toContain('stack-limit');
  });

  it('rejects a Secondary + Primary stack', () => {
    const roster = withPlayers('human', 'Human Lineman', 11);
    roster.players[0].skills = [{ skillId: 'guard', type: 'secondary' }, { skillId: 'block', type: 'primary' }];
    expect(errorIds(roster).some((id) => id.startsWith('stack-type-'))).toBe(true);
  });

  it('rejects a skill already present with a parameter in base skills', () => {
    const roster = withPlayers('goblin', "'Ooligan", 1);
    roster.players.push(...withPlayers('goblin', 'Goblin Lineman', 10).players);
    roster.players[0].skills = [{ skillId: 'dirty-player', type: 'primary' }];
    expect(errorIds(roster).some((id) => id.startsWith('skill-duplicate-'))).toBe(true);
  });
});

describe('stars and combined roster limits', () => {
  it('counts both members of Grak & Crumbleberry toward the minimum', () => {
    const roster = withPlayers('human', 'Human Lineman', 9);
    roster.stars = [{ id: 'hire-1', starId: getStar('grak-and-crumbleberry')!.id }];
    const calc = calculateRoster(roster);
    expect(calc.starMemberCount).toBe(2);
    expect(calc.playerCount).toBe(11);
    expect(calc.valid).toBe(true);
  });

  it('prohibits Secondary and stacks for tiers 1–4 with stars', () => {
    const roster = withPlayers('human', 'Human Lineman', 11);
    roster.stars = [{ id: 'hire-1', starId: getStar('akhorne-the-squirrel')!.id }];
    roster.players[0].skills = [{ skillId: 'guard', type: 'secondary' }];
    expect(errorIds(roster)).toContain('star-skills');
  });

  it('allows them for tier 5 with stars', () => {
    const roster = withPlayers('chaos-chosen', 'Beastman Lineman', 11);
    roster.stars = [{ id: 'hire-1', starId: getStar('akhorne-the-squirrel')!.id }];
    roster.players[0].skills = [{ skillId: 'guard', type: 'secondary' }];
    const calc = calculateRoster(roster);
    expect(calc.errors).toEqual([]);
    expect(calc.valid).toBe(true);
  });

  it('prevents mixing a Legend with Veterans', () => {
    const roster = withPlayers('human', 'Human Lineman', 11);
    roster.stars = [
      { id: 'hire-1', starId: getStar('akhorne-the-squirrel')!.id },
      { id: 'hire-2', starId: getStar('deeproot-strongbranch')!.id },
    ];
    expect(errorIds(roster)).toContain('star-mix');
  });

  it('respects league-based star access', () => {
    const roster = withPlayers('goblin', 'Goblin Lineman', 11);
    const kreek = getStar('kreek-rustgouger')!;
    expect(isStarEligible(kreek, getTeam('goblin'), roster)).toBe(false);
    roster.league = 'Underworld Challenge';
    expect(isStarEligible(kreek, getTeam('goblin'), roster)).toBe(true);
  });
});

describe('budgets and positional validation', () => {
  it('reports a Skill Gold overage independently of Team Budget', () => {
    const roster = withPlayers('human', 'Human Lineman', 11);
    roster.players.slice(0, 3).forEach((player) => {
      player.skills = [{ skillId: 'block', type: 'primary' }, { skillId: 'sure-hands', type: 'primary' }];
    });
    const calc = calculateRoster(roster);
    expect(calc.advancementCost).toBe(180);
    expect(calc.skillRemaining).toBe(-10);
    expect(errorIds(roster)).toContain('skill-budget');
    expect(errorIds(roster)).not.toContain('team-budget');
    expect(calc.valid).toBe(false);
  });

  it('reports a Team Budget overage independently of Skill Gold', () => {
    const roster = withPlayers('human', 'Human Lineman', 11);
    roster.staff.rerolls = 8;
    roster.inducements.chef = 1;
    const calc = calculateRoster(roster);
    expect(calc.teamCost).toBe(1250);
    expect(calc.teamRemaining).toBe(-150);
    expect(errorIds(roster)).toContain('team-budget');
    expect(errorIds(roster)).not.toContain('skill-budget');
  });

  it('enforces positional maxima', () => {
    const roster = withPlayers('human', 'Human Lineman', 8);
    const position = getTeam('human').positions.find((item) => item.name === 'Human Blitzer')!;
    roster.players.push(...Array.from({ length: 3 }, () => createPlayer(position.id)));
    expect(errorIds(roster)).toContain(`limit-${position.id}`);
  });

  it('enforces shared Big Guy limits', () => {
    const roster = withPlayers('chaos-chosen', 'Beastman Lineman', 11);
    const team = getTeam('chaos-chosen');
    for (const name of ['Troll', 'Ogre']) {
      roster.players.push(createPlayer(team.positions.find((position) => position.name === name)!.id));
    }
    expect(errorIds(roster)).toContain('big-guys');
  });
});
