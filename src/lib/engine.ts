import { catalog, getPosition, getSkill, getStar, getTeam, normalizeBaseSkill, normalizeName } from './catalog';
import { COACHES, RULE_PACK, SPONSORS, getInducements, starSurcharge, tierRules } from './rules';
import type { AddedSkill, RosterCalculations, RosterPlayer, RosterState, StarPlayer, Team, ValidationMessage } from './types';

export function effectiveTags(team: Team, roster: RosterState) {
  const tags = new Set<string>();
  tags.add(roster.league || team.leagues[0]);
  team.specialRules.forEach((rule) => tags.add(rule));
  if (roster.favoured) tags.add(`Favoured of ${roster.favoured}`);
  return tags;
}

export function isStarEligible(star: StarPlayer, team: Team, roster: RosterState) {
  const tags = effectiveTags(team, roster);
  return star.playsFor.some((rule) => {
    const normalized = rule.toLowerCase();
    if (normalized === 'any team') return true;
    if (normalized.includes('any team except')) {
      return !(normalized.includes('sylvanian spotlight') && roster.league === 'Sylvanian Spotlight') && !(normalized.includes('dwarf team') && team.id === 'dwarf');
    }
    return tags.has(rule);
  });
}

export function addedSkillCost(added: AddedSkill) {
  const skill = getSkill(added.skillId);
  if (!skill) return 0;
  return (added.type === 'primary' ? RULE_PACK.primaryCost : RULE_PACK.secondaryCost) +
    (skill.elite ? RULE_PACK.eliteSurcharge : 0);
}

export function playerAdvancementCost(player: RosterPlayer) {
  return player.skills.reduce((sum, added) => sum + addedSkillCost(added), 0) +
    (player.skills.length > 1 ? RULE_PACK.stackSurcharge : 0);
}

function message(id: string, text: string): ValidationMessage {
  return { id, text };
}

export function calculateRoster(roster: RosterState): RosterCalculations {
  const team = getTeam(roster.teamId);
  const tier = tierRules(team.tier);
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];

  const selectedSponsors = SPONSORS.filter((item) => roster.sponsors.includes(item.id));
  const selectedCoaches = COACHES.filter((item) => roster.coaches.includes(item.id));
  const sponsorTeam = selectedSponsors.reduce((sum, item) => sum + item.teamGold, 0);
  const sponsorSkill = selectedSponsors.reduce((sum, item) => sum + item.skillGold, 0);
  const coachTeam = selectedCoaches.reduce((sum, item) => sum + item.teamGold, 0);
  const coachSkill = selectedCoaches.reduce((sum, item) => sum + item.skillGold, 0);
  const teamBudget = tier.teamBudget + sponsorTeam + coachTeam;
  const skillBudget = tier.skillGold + sponsorSkill + coachSkill;
  const freeCheerleaders = 0;
  const freeAssistants = 0;

  let playersCost = 0;
  let advancementCost = 0;
  let secondaryCount = 0;
  let stackCount = 0;
  let bigGuyCount = 0;
  let insignificant = 0;
  let nonInsignificant = 0;
  const positionCounts = new Map<string, number>();

  for (const player of roster.players) {
    const position = getPosition(team, player.positionId);
    if (!position) {
      errors.push(message(`position-${player.id}`, 'The roster contains a position from another team or an outdated data set.'));
      continue;
    }
    playersCost += position.cost;
    positionCounts.set(position.id, (positionCounts.get(position.id) ?? 0) + 1);
    if (position.bigGuy) bigGuyCount += 1;
    const isInsignificant = position.skills.some((skill) => normalizeName(skill) === 'insignificant');
    if (isInsignificant) insignificant += 1; else nonInsignificant += 1;

    advancementCost += playerAdvancementCost(player);
    if (player.skills.some((added) => added.type === 'secondary')) secondaryCount += 1;
    if (player.skills.length > 1) stackCount += 1;
    if (player.skills.length > 2) {
      errors.push(message(`skill-count-${player.id}`, `${position.name}: no more than two added skills.`));
    }
    if (player.skills.length > 1 && player.skills.some((added) => added.type === 'secondary')) {
      errors.push(message(`stack-type-${player.id}`, `${position.name}: a stack may only consist of two Primary skills.`));
    }

    const baseSkills = new Set(position.skills.map(normalizeBaseSkill));
    const addedNames = new Set<string>();
    for (const added of player.skills) {
      const skill = getSkill(added.skillId);
      if (!skill) {
        errors.push(message(`skill-unknown-${player.id}-${added.skillId}`, `${position.name}: unknown skill.`));
        continue;
      }
      const access = added.type === 'primary' ? position.primary : position.secondary;
      if (!access.includes(skill.category)) {
        errors.push(message(`skill-access-${player.id}-${added.skillId}`, `${position.name}: ${skill.name} is not available as ${added.type === 'primary' ? 'Primary' : 'Secondary'}.`));
      }
      const normalized = normalizeName(skill.name);
      if (baseSkills.has(normalized) || addedNames.has(normalized)) {
        errors.push(message(`skill-duplicate-${player.id}-${added.skillId}`, `${position.name}: skill ${skill.name} was added twice or the player already has it.`));
      }
      addedNames.add(normalized);
    }
  }

  for (const position of team.positions) {
    const count = positionCounts.get(position.id) ?? 0;
    if (count > position.max) {
      errors.push(message(`limit-${position.id}`, `${position.name}: ${count} selected, maximum ${position.max} allowed.`));
    }
  }
  if (team.maxBigGuys !== null && bigGuyCount > team.maxBigGuys) {
    errors.push(message('big-guys', `Big Guys: ${bigGuyCount} selected, maximum ${team.maxBigGuys} allowed.`));
  }

  let starsCost = 0;
  let starSurchargeTotal = 0;
  let starMemberCount = 0;
  const hiredStarIds = new Set<string>();
  const starGroups = new Set<string>();
  for (const hire of roster.stars) {
    const star = getStar(hire.starId);
    if (!star) {
      errors.push(message(`star-unknown-${hire.id}`, 'The roster contains an unknown or banned star player.'));
      continue;
    }
    starsCost += star.cost;
    starSurchargeTotal += starSurcharge(team.tier, star.group);
    starMemberCount += star.members.length;
    starGroups.add(star.group);
    if (hiredStarIds.has(star.id)) {
      errors.push(message(`star-duplicate-${star.id}`, `${star.name}: the same star cannot be hired twice.`));
    }
    hiredStarIds.add(star.id);
    if (!isStarEligible(star, team, roster)) {
      errors.push(message(`star-access-${hire.id}`, `${star.name} is not available for the selected league or special rule.`));
    }
    for (const member of star.members) {
      const isInsignificant = member.skills.some((skill) => normalizeName(skill) === 'insignificant');
      if (isInsignificant) insignificant += 1; else nonInsignificant += 1;
    }
  }
  if (starGroups.has('legend') && starGroups.size > 1) {
    errors.push(message('star-mix', 'A Legend cannot be hired with a Veteran or Prospect.'));
  }
  const nonLegendCount = roster.stars.filter((hire) => { const group = getStar(hire.starId)?.group; return group === 'veteran' || group === 'prospect'; }).length;
  const legendCount = roster.stars.filter((hire) => getStar(hire.starId)?.group === 'legend').length;
  if (nonLegendCount > 2) errors.push(message('star-veterans', 'No more than two Veterans and Prospects may be hired in total.'));
  if (legendCount > 1) errors.push(message('star-legend', 'Only one Legend may be hired.'));
  if (roster.stars.length > 0 && team.tier <= 4 && (secondaryCount > 0 || stackCount > 0)) {
    errors.push(message('star-skills', 'Tier 1–4 teams with star players cannot take Secondary skills or stacks.'));
  }

  const playerCount = roster.players.length + starMemberCount;
  if (playerCount < RULE_PACK.minPlayers) {
    errors.push(message('min-players', `${RULE_PACK.minPlayers - playerCount} more player(s) needed: minimum ${RULE_PACK.minPlayers}, stars included.`));
  }
  if (playerCount > RULE_PACK.maxPlayers) {
    errors.push(message('max-players', `The roster has ${playerCount} players; no more than ${RULE_PACK.maxPlayers} allowed.`));
  }
  if (insignificant > nonInsignificant) {
    errors.push(message('insignificant', 'There cannot be more players with Insignificant than players without this Trait.'));
  }
  if (secondaryCount > RULE_PACK.maxSecondary) {
    errors.push(message('secondary-limit', `${secondaryCount} player(s) have Secondary skills; no more than ${RULE_PACK.maxSecondary} allowed.`));
  }
  if (stackCount > RULE_PACK.maxStacks) {
    errors.push(message('stack-limit', `${stackCount} player(s) have stacks; no more than ${RULE_PACK.maxStacks} allowed.`));
  }

  const staff = roster.staff;
  const staffCost = staff.rerolls * team.rerollCost + staff.apothecary * 50 +
    staff.assistants * 10 + staff.cheerleaders * 10 + staff.fans * 5;
  if (staff.rerolls < 0 || staff.rerolls > 8) errors.push(message('rerolls', 'Team re-rolls: must be between 0 and 8.'));
  if (!team.apothecary && staff.apothecary > 0) errors.push(message('apothecary-access', 'This team cannot hire an Apothecary.'));
  if (staff.apothecary < 0 || staff.apothecary > 1) errors.push(message('apothecary-limit', 'Apothecary: must be between 0 and 1.'));
  if (staff.assistants + freeAssistants > 6 || staff.assistants < 0) errors.push(message('assistants', 'Assistant coaches, including free ones: no more than 6.'));
  if (staff.cheerleaders + freeCheerleaders > 6 || staff.cheerleaders < 0) errors.push(message('cheerleaders', 'Cheerleaders, including free ones: no more than 6.'));
  if (staff.fans < 0 || staff.fans > 3) errors.push(message('fans', 'Dedicated fans: must be between 0 and 3.'));

  const inducements = getInducements(team);
  let inducementsCost = 0;
  for (const item of inducements) {
    const quantity = roster.inducements[item.id] ?? 0;
    inducementsCost += quantity * item.cost;
    if (quantity < 0 || quantity > item.max) {
      errors.push(message(`inducement-${item.id}`, `${item.name}: must be between 0 and ${item.max}.`));
    }
  }
  for (const [id, quantity] of Object.entries(roster.inducements)) {
    if (quantity > 0 && !inducements.some((item) => item.id === id)) {
      errors.push(message(`inducement-access-${id}`, 'The roster contains an inducement this team cannot take.'));
    }
  }

  const skillCost = advancementCost + starSurchargeTotal;
  const teamCost = playersCost + starsCost + staffCost + inducementsCost;
  if (teamCost > teamBudget) {
    errors.push(message('team-budget', `Team Budget exceeded by ${teamCost - teamBudget}k.`));
  }
  if (skillCost > skillBudget) {
    errors.push(message('skill-budget', `Skill Gold exceeded by ${skillCost - skillBudget}k.`));
  }

  return {
    team,
    teamBudget,
    skillBudget,
    baseTeamBudget: tier.teamBudget,
    baseSkillBudget: tier.skillGold,
    teamCost,
    playersCost,
    starsCost,
    staffCost,
    inducementsCost,
    advancementCost,
    starSurcharge: starSurchargeTotal,
    skillCost,
    teamRemaining: teamBudget - teamCost,
    skillRemaining: skillBudget - skillCost,
    playerCount,
    regularPlayerCount: roster.players.length,
    starMemberCount,
    secondaryCount,
    stackCount,
    freeAssistants,
    freeCheerleaders,
    errors,
    warnings,
    valid: errors.length === 0,
  };
}

export function availableStars(roster: RosterState) {
  const team = getTeam(roster.teamId);
  return catalog.stars.filter((star) => isStarEligible(star, team, roster));
}
