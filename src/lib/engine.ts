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
      return !(normalized.includes('sylvanian spotlight') && roster.league === 'Sylvanian Spotlight');
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
  const freeCheerleaders = selectedSponsors.length;
  const freeAssistants = selectedCoaches.length;

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
      errors.push(message(`position-${player.id}`, 'В ростере есть позиция из другой команды или устаревшего набора данных.'));
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
      errors.push(message(`skill-count-${player.id}`, `${position.name}: не более двух добавленных навыков.`));
    }
    if (player.skills.length > 1 && player.skills.some((added) => added.type === 'secondary')) {
      errors.push(message(`stack-type-${player.id}`, `${position.name}: стак разрешён только из двух Primary навыков.`));
    }

    const baseSkills = new Set(position.skills.map(normalizeBaseSkill));
    const addedNames = new Set<string>();
    for (const added of player.skills) {
      const skill = getSkill(added.skillId);
      if (!skill) {
        errors.push(message(`skill-unknown-${player.id}-${added.skillId}`, `${position.name}: неизвестный навык.`));
        continue;
      }
      const access = added.type === 'primary' ? position.primary : position.secondary;
      if (!access.includes(skill.category)) {
        errors.push(message(`skill-access-${player.id}-${added.skillId}`, `${position.name}: ${skill.name} недоступен как ${added.type === 'primary' ? 'Primary' : 'Secondary'}.`));
      }
      const normalized = normalizeName(skill.name);
      if (baseSkills.has(normalized) || addedNames.has(normalized)) {
        errors.push(message(`skill-duplicate-${player.id}-${added.skillId}`, `${position.name}: навык ${skill.name} добавлен повторно или уже есть у игрока.`));
      }
      addedNames.add(normalized);
    }
  }

  for (const position of team.positions) {
    const count = positionCounts.get(position.id) ?? 0;
    if (count > position.max) {
      errors.push(message(`limit-${position.id}`, `${position.name}: выбрано ${count}, разрешено не более ${position.max}.`));
    }
  }
  if (team.maxBigGuys !== null && bigGuyCount > team.maxBigGuys) {
    errors.push(message('big-guys', `Big Guys: выбрано ${bigGuyCount}, разрешено не более ${team.maxBigGuys}.`));
  }

  let starsCost = 0;
  let starSurchargeTotal = 0;
  let starMemberCount = 0;
  const hiredStarIds = new Set<string>();
  const starGroups = new Set<string>();
  for (const hire of roster.stars) {
    const star = getStar(hire.starId);
    if (!star) {
      errors.push(message(`star-unknown-${hire.id}`, 'В ростере есть неизвестный или запрещённый звёздный игрок.'));
      continue;
    }
    starsCost += star.cost;
    starSurchargeTotal += starSurcharge(team.tier, star.group);
    starMemberCount += star.members.length;
    starGroups.add(star.group);
    if (hiredStarIds.has(star.id)) {
      errors.push(message(`star-duplicate-${star.id}`, `${star.name}: одну и ту же звезду нельзя нанять дважды.`));
    }
    hiredStarIds.add(star.id);
    if (!isStarEligible(star, team, roster)) {
      errors.push(message(`star-access-${hire.id}`, `${star.name} недоступен для выбранной лиги/спецправила.`));
    }
    for (const member of star.members) {
      const isInsignificant = member.skills.some((skill) => normalizeName(skill) === 'insignificant');
      if (isInsignificant) insignificant += 1; else nonInsignificant += 1;
    }
  }
  if (starGroups.size > 1) {
    errors.push(message('star-mix', 'Нельзя одновременно нанимать Ветеранов и Легенду.'));
  }
  const veteranCount = roster.stars.filter((hire) => getStar(hire.starId)?.group === 'veteran').length;
  const legendCount = roster.stars.filter((hire) => getStar(hire.starId)?.group === 'legend').length;
  if (veteranCount > 2) errors.push(message('star-veterans', 'Можно нанять не более двух Ветеранов.'));
  if (legendCount > 1) errors.push(message('star-legend', 'Можно нанять только одну Легенду.'));
  if (roster.stars.length > 0 && team.tier <= 4 && (secondaryCount > 0 || stackCount > 0)) {
    errors.push(message('star-skills', 'Команды 1–4 тиров со звёздными игроками не могут брать Secondary навыки и стаки.'));
  }

  const playerCount = roster.players.length + starMemberCount;
  if (playerCount < RULE_PACK.minPlayers) {
    errors.push(message('min-players', `Нужно ещё ${RULE_PACK.minPlayers - playerCount} игрок(ов): минимум ${RULE_PACK.minPlayers}, включая звёзд.`));
  }
  if (playerCount > RULE_PACK.maxPlayers) {
    errors.push(message('max-players', `В ростере ${playerCount} игроков, разрешено не более ${RULE_PACK.maxPlayers}.`));
  }
  if (insignificant > nonInsignificant) {
    errors.push(message('insignificant', 'Игроков с Insignificant не может быть больше, чем игроков без этого Trait.'));
  }
  if (secondaryCount > RULE_PACK.maxSecondary) {
    errors.push(message('secondary-limit', `Secondary навыки у ${secondaryCount} игроков; разрешено не более ${RULE_PACK.maxSecondary}.`));
  }
  if (stackCount > RULE_PACK.maxStacks) {
    errors.push(message('stack-limit', `Стаки у ${stackCount} игроков; разрешено не более ${RULE_PACK.maxStacks}.`));
  }

  const staff = roster.staff;
  const staffCost = staff.rerolls * team.rerollCost + staff.apothecary * 50 +
    staff.assistants * 10 + staff.cheerleaders * 10 + staff.fans * 5;
  if (staff.rerolls < 0 || staff.rerolls > 8) errors.push(message('rerolls', 'Team re-rolls: допустимо от 0 до 8.'));
  if (!team.apothecary && staff.apothecary > 0) errors.push(message('apothecary-access', 'Эта команда не может нанимать Apothecary.'));
  if (staff.apothecary < 0 || staff.apothecary > 1) errors.push(message('apothecary-limit', 'Apothecary: допустимо от 0 до 1.'));
  if (staff.assistants + freeAssistants > 6 || staff.assistants < 0) errors.push(message('assistants', 'Assistant coaches, включая бесплатных от тренеров: не более 6.'));
  if (staff.cheerleaders + freeCheerleaders > 6 || staff.cheerleaders < 0) errors.push(message('cheerleaders', 'Cheerleaders, включая бесплатных от спонсоров: не более 6.'));
  if (staff.fans < 0 || staff.fans > 3) errors.push(message('fans', 'Dedicated fans: допустимо от 0 до 3.'));

  const inducements = getInducements(team);
  let inducementsCost = 0;
  for (const item of inducements) {
    const quantity = roster.inducements[item.id] ?? 0;
    inducementsCost += quantity * item.cost;
    if (quantity < 0 || quantity > item.max) {
      errors.push(message(`inducement-${item.id}`, `${item.name}: допустимо от 0 до ${item.max}.`));
    }
  }
  for (const [id, quantity] of Object.entries(roster.inducements)) {
    if (quantity > 0 && !inducements.some((item) => item.id === id)) {
      errors.push(message(`inducement-access-${id}`, 'В ростере есть поощрение, недоступное этой команде.'));
    }
  }

  const skillCost = advancementCost + starSurchargeTotal;
  const teamCost = playersCost + starsCost + staffCost + inducementsCost;
  if (teamCost > teamBudget) {
    errors.push(message('team-budget', `Team Budget превышен на ${teamCost - teamBudget}k.`));
  }
  if (skillCost > skillBudget) {
    errors.push(message('skill-budget', `Skill Gold превышен на ${skillCost - skillBudget}k.`));
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
