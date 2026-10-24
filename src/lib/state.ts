import { getTeam } from './catalog';
import type { RosterPlayer, RosterState } from './types';

export const CURRENT_ROSTER_KEY = 'dugout.current.v1';

export function uid(prefix = 'id') {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function createRoster(teamId = 'human'): RosterState {
  const team = getTeam(teamId);
  return {
    version: 1,
    id: uid('roster'),
    name: 'Новый ростер',
    coach: '',
    teamId: team.id,
    league: team.leagues[0] ?? '',
    favoured: team.favouredOptions[0] ?? '',
    players: [],
    stars: [],
    staff: { rerolls: 0, apothecary: 0, assistants: 0, cheerleaders: 0, fans: 0 },
    inducements: {},
    sponsors: [],
    coaches: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createPlayer(positionId: string): RosterPlayer {
  return { id: uid('player'), positionId, name: '', skills: [] };
}

export function touch<T extends RosterState>(roster: T): T {
  return { ...roster, updatedAt: new Date().toISOString() };
}

export function sanitizeRoster(input: unknown): RosterState {
  if (!input || typeof input !== 'object') throw new Error('Файл не содержит ростер.');
  const raw = input as Partial<RosterState>;
  const base = createRoster(typeof raw.teamId === 'string' ? raw.teamId : 'human');
  const team = getTeam(base.teamId);
  const roster: RosterState = {
    ...base,
    id: typeof raw.id === 'string' ? raw.id : base.id,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 100) : base.name,
    coach: typeof raw.coach === 'string' ? raw.coach.slice(0, 100) : '',
    teamId: team.id,
    league: typeof raw.league === 'string' && team.leagues.includes(raw.league) ? raw.league : base.league,
    favoured: typeof raw.favoured === 'string' && team.favouredOptions.includes(raw.favoured) ? raw.favoured : base.favoured,
    players: Array.isArray(raw.players) ? raw.players.slice(0, 32).map((player) => ({
      id: typeof player.id === 'string' ? player.id : uid('player'),
      positionId: typeof player.positionId === 'string' ? player.positionId : '',
      name: typeof player.name === 'string' ? player.name.slice(0, 80) : '',
      skills: Array.isArray(player.skills) ? player.skills.slice(0, 4).flatMap((added) => {
        if (!added || typeof added.skillId !== 'string') return [];
        return [{ skillId: added.skillId, type: added.type === 'secondary' ? 'secondary' as const : 'primary' as const }];
      }) : [],
    })) : [],
    stars: Array.isArray(raw.stars) ? raw.stars.slice(0, 4).flatMap((hire) => {
      if (!hire || typeof hire.starId !== 'string') return [];
      return [{ id: typeof hire.id === 'string' ? hire.id : uid('star'), starId: hire.starId }];
    }) : [],
    staff: {
      rerolls: Number(raw.staff?.rerolls) || 0,
      apothecary: Number(raw.staff?.apothecary) || 0,
      assistants: Number(raw.staff?.assistants) || 0,
      cheerleaders: Number(raw.staff?.cheerleaders) || 0,
      fans: Number(raw.staff?.fans) || 0,
    },
    inducements: raw.inducements && typeof raw.inducements === 'object'
      ? Object.fromEntries(Object.entries(raw.inducements).map(([key, value]) => [key, Number(value) || 0]))
      : {},
    sponsors: Array.isArray(raw.sponsors) ? raw.sponsors.filter((item): item is string => typeof item === 'string') : [],
    coaches: Array.isArray(raw.coaches) ? raw.coaches.filter((item): item is string => typeof item === 'string') : [],
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
  return roster;
}

