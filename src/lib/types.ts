export type SkillCategory = 'A' | 'D' | 'G' | 'M' | 'P' | 'S';
export type SkillType = 'primary' | 'secondary';
export type StarGroup = 'veteran' | 'legend';

export interface Stats {
  MA: string;
  ST: string;
  AG: string;
  PA: string;
  AV: string;
}

export interface Position {
  id: string;
  name: string;
  role: string;
  max: number;
  cost: number;
  stats: Stats;
  skills: string[];
  primary: SkillCategory[];
  secondary: SkillCategory[];
  bigGuy: boolean;
}

export interface Team {
  id: string;
  name: string;
  tier: number;
  positions: Position[];
  rerollCost: number;
  apothecary: boolean;
  leagues: string[];
  specialRules: string[];
  favouredOptions: string[];
  maxBigGuys: number | null;
  source?: string;
}

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  elite: boolean;
}

export interface StarMember {
  name: string;
  role: string;
  stats: Stats;
  skills: string[];
  specialRules: string[];
}

export interface StarPlayer {
  id: string;
  name: string;
  group: StarGroup;
  cost: number;
  playsFor: string[];
  members: StarMember[];
  source?: string;
}

export interface Catalog {
  edition: string;
  teams: Team[];
  skills: Skill[];
  stars: StarPlayer[];
}

export interface AddedSkill {
  skillId: string;
  type: SkillType;
}

export interface RosterPlayer {
  id: string;
  positionId: string;
  name: string;
  skills: AddedSkill[];
}

export interface StarHire {
  id: string;
  starId: string;
}

export interface StaffState {
  rerolls: number;
  apothecary: number;
  assistants: number;
  cheerleaders: number;
  fans: number;
}

export interface RosterState {
  version: 1;
  id: string;
  name: string;
  coach: string;
  teamId: string;
  league: string;
  favoured: string;
  players: RosterPlayer[];
  stars: StarHire[];
  staff: StaffState;
  inducements: Record<string, number>;
  sponsors: string[];
  coaches: string[];
  updatedAt: string;
}

export interface Contract {
  id: string;
  name: string;
  teamGold: number;
  skillGold: number;
  freebie: 'cheerleader' | 'assistant';
}

export interface Inducement {
  id: string;
  name: string;
  cost: number;
  max: number;
  note?: string;
}

export interface ValidationMessage {
  id: string;
  text: string;
}

export interface RosterCalculations {
  team: Team;
  teamBudget: number;
  skillBudget: number;
  baseTeamBudget: number;
  baseSkillBudget: number;
  teamCost: number;
  playersCost: number;
  starsCost: number;
  staffCost: number;
  inducementsCost: number;
  advancementCost: number;
  starSurcharge: number;
  skillCost: number;
  teamRemaining: number;
  skillRemaining: number;
  playerCount: number;
  regularPlayerCount: number;
  starMemberCount: number;
  secondaryCount: number;
  stackCount: number;
  freeAssistants: number;
  freeCheerleaders: number;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  valid: boolean;
}
