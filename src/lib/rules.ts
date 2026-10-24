import type { Contract, Inducement, Team } from './types';

/** All values are in thousands of gold pieces (k). */
export const RULE_PACK = {
  name: 'Custom EuroBowl',
  edition: 'BB2025',
  minPlayers: 11,
  maxPlayers: 16,
  maxSecondary: 3,
  maxStacks: 3,
  stackSurcharge: 10,
  primaryCost: 20,
  secondaryCost: 40,
  eliteSurcharge: 10,
  tiers: [
    { tier: 1, teamBudget: 1080, skillGold: 120 },
    { tier: 2, teamBudget: 1080, skillGold: 150 },
    { tier: 3, teamBudget: 1100, skillGold: 170 },
    { tier: 4, teamBudget: 1120, skillGold: 200 },
    { tier: 5, teamBudget: 1140, skillGold: 230 },
    { tier: 6, teamBudget: 1160, skillGold: 260 },
    { tier: 7, teamBudget: 1180, skillGold: 290 },
  ],
} as const;

export const SPONSORS: Contract[] = [
  { id: 'bugmans', name: 'Bugman’s Brewery', teamGold: 10, skillGold: -10, freebie: 'cheerleader' },
  { id: 'nuln', name: 'Nuln Gunnery School', teamGold: 10, skillGold: -15, freebie: 'cheerleader' },
  { id: 'zoo', name: 'Imperial Zoo of Altdorf', teamGold: 10, skillGold: -20, freebie: 'cheerleader' },
  { id: 'mootland', name: 'Mootland Farms', teamGold: 20, skillGold: -30, freebie: 'cheerleader' },
  { id: 'karaz', name: 'Karaz-a-Karak Guild of Engineers', teamGold: 30, skillGold: -40, freebie: 'cheerleader' },
];

export const COACHES: Contract[] = [
  { id: 'br1ght', name: 'Br1ght', teamGold: -10, skillGold: 10, freebie: 'assistant' },
  { id: 'kolianxxxx', name: 'Kolianxxxx', teamGold: -15, skillGold: 10, freebie: 'assistant' },
  { id: 'azzik', name: 'Azzik', teamGold: -20, skillGold: 10, freebie: 'assistant' },
  { id: 'diomed', name: 'Diomed', teamGold: -30, skillGold: 20, freebie: 'assistant' },
  { id: 'neproxy', name: 'Neproxy', teamGold: -40, skillGold: 30, freebie: 'assistant' },
];

export function tierRules(tier: number) {
  return RULE_PACK.tiers.find((item) => item.tier === tier) ?? RULE_PACK.tiers[0];
}

export function starSurcharge(tier: number, group: 'veteran' | 'legend') {
  if (group === 'legend') return tier <= 5 ? 100 : 80;
  return tier <= 5 ? 50 : 40;
}

export function getInducements(team: Team): Inducement[] {
  const bribery = team.specialRules.includes('Bribery and Corruption');
  const masters = team.specialRules.includes('Masters of Undeath');
  const items: Inducement[] = [
    { id: 'kegs', name: 'Blitzer’s Best Kegs', cost: 50, max: 2 },
    { id: 'bribes', name: 'Bribes', cost: bribery ? 50 : 100, max: bribery ? 6 : 3, note: bribery ? 'Bribery and Corruption' : undefined },
    { id: 'chef', name: 'Halfling Master Chef', cost: team.id === 'halfling' ? 100 : 300, max: 1, note: team.id === 'halfling' ? 'Скидка Halfling' : undefined },
  ];
  if (masters) items.push({ id: 'mortuary', name: 'Mortuary Assistant', cost: 100, max: 1 });
  if (team.id === 'nurgle') items.push({ id: 'plague', name: 'Plague Doctor', cost: 100, max: 1 });
  if (team.id === 'ogre' || team.id === 'snotling') items.push({ id: 'riotous', name: 'Riotous Rookies', cost: 150, max: 1 });
  items.push({ id: 'mascot', name: 'Team Mascot', cost: 25, max: 1 });
  if (team.apothecary) items.push({ id: 'wandering', name: 'Wandering Apothecaries', cost: 100, max: 2 });
  items.push(
    { id: 'weather', name: 'Weather Mage', cost: 25, max: 1 },
    { id: 'referee', name: 'Biased Referee: Dodgy League Rep', cost: bribery ? 80 : 120, max: 1, note: bribery ? 'Bribery and Corruption' : undefined },
  );
  return items;
}

export const CATEGORY_NAMES = {
  A: 'Agility', D: 'Devious', G: 'General',
  M: 'Mutation', P: 'Passing', S: 'Strength',
} as const;
