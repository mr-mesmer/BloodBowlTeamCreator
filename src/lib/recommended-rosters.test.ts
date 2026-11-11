import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { catalog, getPosition, getSkill, getTeam } from './catalog';
import { addedSkillCost, calculateRoster } from './engine';
import { COACHES, RULE_PACK, SPONSORS } from './rules';
import { sanitizeRoster } from './state';
import type { RosterCalculations, RosterState } from './types';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = new URL('../../rosters/recommended/', import.meta.url);
const report = JSON.parse(readFileSync(new URL('validation.json', directory), 'utf8'));
const choices = JSON.parse(readFileSync(new URL('choices.json', directory), 'utf8'));

const costAndLimitFields = [
  'baseTeamBudget', 'baseSkillBudget', 'teamBudget', 'skillBudget',
  'playersCost', 'starsCost', 'staffCost', 'inducementsCost', 'teamCost',
  'advancementCost', 'starSurcharge', 'skillCost', 'teamRemaining', 'skillRemaining',
  'playerCount', 'regularPlayerCount', 'starMemberCount', 'secondaryCount', 'stackCount',
  'freeAssistants', 'freeCheerleaders',
] as const satisfies readonly (keyof RosterCalculations)[];

type VerificationRow = Pick<RosterCalculations, typeof costAndLimitFields[number]> & {
  teamId: string;
  teamName: string;
  tier: number;
  valid: boolean;
  checks: Record<string, boolean>;
};

const rows = report.rosters as VerificationRow[];
const load = (teamId: string): RosterState =>
  JSON.parse(readFileSync(new URL(`json/${teamId}.json`, directory), 'utf8'));
const errors = (roster: RosterState) => calculateRoster(roster).errors.map((error) => error.id);

// Pinned to the user's text, not catalogue-derived tiers that could silently drift.
const tierTeams = {
  1: ['orc', 'wood-elf', 'amazon'],
  2: ['old-world-alliance', 'skaven', 'underworld-denizens'],
  3: ['dark-elf', 'high-elf', 'human', 'lizardmen', 'shambling-undead', 'vampire', 'snotling'],
  4: ['necromantic-horror', 'norse', 'nurgle', 'tomb-kings', 'elven-union'],
  5: ['chaos-chosen', 'chaos-dwarf', 'dwarf', 'imperial-nobility', 'slann'],
  6: ['black-orc', 'bretonnian', 'chaos-renegades', 'gnome', 'goblin', 'halfling', 'khorne'],
  7: ['ogre'],
};

describe('recommended tournament roster collection', () => {
  it('has exactly one exported, documented roster per team and no extra JSON files', () => {
    expect(rows).toHaveLength(31);
    const ids = rows.map((row) => row.teamId).sort();
    expect(new Set(ids).size).toBe(31);
    expect(ids).toEqual(catalog.teams.map((team) => team.id).sort());
    expect(readdirSync(new URL('json/', directory)).sort()).toEqual(ids.map((id) => `${id}.json`).sort());
    const document = readFileSync(new URL('../../docs/tournament-rosters.md', import.meta.url), 'utf8');
    expect(document.match(/^## \d+\./gm)).toHaveLength(31);
    for (const id of ids) {
      expect(document).toContain(`<a id="${id}"></a>`);
      expect(document).toContain(`../rosters/recommended/json/${id}.json`);
    }
    expect(report.allValid).toBe(true);
    expect(report.flowingFunds).toBe(0);
    expect(report.tierTeams).toEqual(tierTeams);
  });

  it('pins all tiers, skill prices and contracts independently to the supplied pack', () => {
    for (const [tier, ids] of Object.entries(tierTeams)) {
      for (const id of ids) expect(getTeam(id).tier, id).toBe(Number(tier));
    }
    const { name: _name, edition: _edition, ...rules } = RULE_PACK;
    expect(report.rulePack).toEqual(rules);
    expect(report.sponsors).toEqual(SPONSORS);
    expect(report.coaches).toEqual(COACHES);
    expect(getTeam('snotling').tier).toBe(3);
    expect(getTeam('slann').positions.find((p) => p.name === 'Kroxigor')?.stats.PA).toBe('6+');
  });

  it('passes the independent validator and has no stale generated tables, JSON or arithmetic', () => {
    const output = execFileSync('python3', ['scripts/build_recommended_rosters.py', '--check'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(output).toContain('31/31 legal. Flowing Funds: 0.');
  });

  it.each(rows)('$teamName is legal in the actual builder and agrees with the independent ledger', (expected) => {
    const roster = load(expected.teamId);
    const calc = calculateRoster(roster);
    expect(calc.errors, expected.teamId).toEqual([]);
    expect(calc.warnings, expected.teamId).toEqual([]);
    expect(calc.valid).toBe(true);
    expect(sanitizeRoster(roster)).toEqual(roster);
    for (const field of costAndLimitFields) {
      expect(calc[field], `${expected.teamId}: ${field}`).toBe(expected[field]);
    }
    expect(Object.values(expected.checks).every(Boolean)).toBe(true);
  });

  it.each(['human', 'orc'])('nominates a non-Big-Guy captain for %s without charging for free Pro', (id) => {
    const roster = load(id);
    const choice = choices.entries.find((entry: { teamId: string }) => entry.teamId === id);
    const player = roster.players[choice.captain - 1];
    const position = getPosition(getTeam(id), player.positionId)!;
    expect(position.role).not.toContain('Big Guy');
    expect(player.name).toContain('Team Captain');
    expect(player.name).toContain('Pro for free');
    expect(player.skills.some((skill) => skill.skillId === 'pro')).toBe(false);
    expect(calculateRoster(roster).stackCount).toBe(0);
  });

  it('charges the BB2025 Secondary premiums used by the recommendations', () => {
    const dwarf = load('dwarf').players.find((p) => p.positionId === 'dwarf-0' && p.skills.length)!;
    expect(dwarf.skills).toEqual([{ skillId: 'guard', type: 'secondary' }]);
    expect(addedSkillCost(dwarf.skills[0])).toBe(50);
    const khorngor = load('khorne').players.find((p) => p.skills.some((s) => s.skillId === 'leader'))!;
    expect(khorngor.skills).toEqual([{ skillId: 'leader', type: 'secondary' }]);
    expect(addedSkillCost(khorngor.skills[0])).toBe(40);
  });

  it.each(['goblin', 'halfling', 'ogre'])('charges the veteran tax separately and allows legal Secondary for %s', (id) => {
    const roster = load(id);
    const calc = calculateRoster(roster);
    expect(roster.stars).toHaveLength(1);
    expect(calc.starSurcharge).toBe(40);
    expect(calc.skillCost).toBe(calc.advancementCost + 40);
    expect(calc.secondaryCount).toBeGreaterThan(0);
    expect(calc.errors).toEqual([]);
  });

  it('does not import a foreign four-Elite or four-identical-skill limit', () => {
    const roster = load('gnome');
    const elite = roster.players.flatMap((p) => p.skills).filter((s) => getSkill(s.skillId)?.elite);
    expect(elite).toHaveLength(9); // 2 Block Secondary + 7 Dodge Primary
    expect(calculateRoster(roster).valid).toBe(true);
  });
});

describe('illegal edits to recommended rosters are rejected', () => {
  it('does not cover Team Budget overspend with the other wallet', () => {
    const roster = load('orc');
    roster.players.forEach((player) => { player.skills = []; });
    roster.staff.assistants = 1;
    expect(calculateRoster(roster).skillRemaining).toBe(160);
    expect(errors(roster)).toContain('team-budget');
    expect(errors(roster)).not.toContain('skill-budget');
  });

  it('does not cover Skill Gold overspend with Team Budget', () => {
    const roster = load('orc');
    roster.players.find((p) => p.positionId === 'orc-0')!.skills = [{ skillId: 'block', type: 'primary' }];
    expect(errors(roster)).toContain('skill-budget');
    expect(errors(roster)).not.toContain('team-budget');
  });

  it('rejects a fourth Secondary on a tier 6 star roster', () => {
    const roster = load('goblin');
    roster.players.find((p) => p.positionId === 'goblin-0' && !p.skills.length)!.skills = [{ skillId: 'block', type: 'secondary' }];
    expect(errors(roster)).toContain('secondary-limit');
  });

  it('rejects a fourth Primary stack', () => {
    const roster = load('bretonnian');
    roster.players.find((p) => !p.skills.length && p.positionId === 'bretonnian-0')!.skills = [
      { skillId: 'block', type: 'primary' }, { skillId: 'sure-hands', type: 'primary' },
    ];
    expect(errors(roster)).toContain('stack-limit');
  });

  it('rejects mixing a Primary with a Secondary on the same goblin', () => {
    const roster = load('goblin');
    const player = roster.players.find((p) => p.skills.some((s) => s.skillId === 'sure-hands'))!;
    player.skills.push({ skillId: 'sure-feet', type: 'primary' });
    expect(errors(roster)).toContain(`stack-type-${player.id}`);
  });

  it('does not count Riotous Rookies toward the permanent roster or relax Insignificant', () => {
    const roster = load('snotling');
    expect(calculateRoster(roster).playerCount).toBe(14);
    for (const player of roster.players.filter((p) => ['snotling-1', 'snotling-2'].includes(p.positionId))) {
      player.positionId = 'snotling-0';
      player.skills = [];
    }
    expect(errors(roster)).toContain('insignificant');
  });

  it('requires Woodland League for Deeproot', () => {
    const roster = load('halfling');
    roster.league = 'Halfling Thimble Cup';
    expect(errors(roster)).toContain(`star-access-${roster.stars[0].id}`);
  });

  it('does not allow a veteran to be added alongside a legend', () => {
    const roster = load('halfling');
    roster.stars.push({ id: 'illegal-extra-star', starId: 'griff-oberwald' });
    expect(errors(roster)).toContain('star-mix');
  });

  it('rejects a star outside the whitelist', () => {
    const roster = load('goblin');
    roster.stars = [{ id: 'banned-star', starId: 'unknown-star' }];
    expect(errors(roster)).toContain('star-unknown-banned-star');
  });

  it('enforces the tier 1–4 star skill restriction even for an otherwise legal Secondary', () => {
    const roster = load('human');
    roster.stars.push({ id: 'illegal-combination', starId: 'akhorne-the-squirrel' });
    expect(errors(roster)).toContain('star-skills');
  });

  it('enforces the shared Big Guy limit of Old World Alliance', () => {
    const roster = load('old-world-alliance');
    roster.players.push({ id: 'second-big-guy', positionId: 'old-world-alliance-9', name: '', skills: [] });
    expect(errors(roster)).toContain('big-guys');
  });

  it('enforces BB2025 positional limits', () => {
    const roster = load('orc');
    roster.players.push({ id: 'third-big-un', positionId: 'orc-4', name: '', skills: [] });
    expect(errors(roster)).toContain('limit-orc-4');
  });

  it('enforces the minimum eleven and maximum sixteen including stars', () => {
    const shortRoster = load('wood-elf');
    shortRoster.players.pop();
    expect(errors(shortRoster)).toContain('min-players');
    const longRoster = load('underworld-denizens');
    longRoster.players.push({ id: 'seventeenth-player', positionId: 'underworld-denizens-0', name: '', skills: [] });
    expect(errors(longRoster)).toContain('max-players');
  });
});
