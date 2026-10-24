import catalogJson from '../data/catalog.json';
import type { Catalog, Position, Skill, StarPlayer, Team } from './types';

export const catalog = catalogJson as Catalog;

export function getTeam(teamId: string): Team {
  return catalog.teams.find((team) => team.id === teamId) ?? catalog.teams.find((team) => team.id === 'human')!;
}

export function getPosition(team: Team, positionId: string): Position | undefined {
  return team.positions.find((position) => position.id === positionId);
}

export function getSkill(skillId: string): Skill | undefined {
  return catalog.skills.find((skill) => skill.id === skillId);
}

export function getStar(starId: string): StarPlayer | undefined {
  return catalog.stars.find((star) => star.id === starId);
}

export function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9а-я]+/gi, '');
}

export function normalizeBaseSkill(value: string) {
  return normalizeName(value.replace(/\(\s*\+?\d+\+?\s*\)/g, ''));
}
