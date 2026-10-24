import { getPosition, getSkill, getStar } from './catalog';
import { calculateRoster } from './engine';
import { COACHES, SPONSORS, getInducements, starSurcharge } from './rules';
import type { RosterState } from './types';

export const k = (value: number) => `${value}k`;

export function rosterToText(roster: RosterState) {
  const calc = calculateRoster(roster);
  const lines: string[] = [
    (roster.name || 'Без названия').toUpperCase(),
    `${calc.team.name} · Tier ${calc.team.tier} · ${roster.league}`,
    roster.coach ? `Тренер: ${roster.coach}` : '',
    `Игроков: ${calc.playerCount} · Team Budget: ${calc.teamCost}/${calc.teamBudget}k · Skill Gold: ${calc.skillCost}/${calc.skillBudget}k`,
    '',
    'ИГРОКИ',
  ];
  roster.players.forEach((player, index) => {
    const position = getPosition(calc.team, player.positionId);
    if (!position) return;
    const added = player.skills.map((item) => {
      const skill = getSkill(item.skillId);
      return skill ? `${skill.name} (${item.type === 'primary' ? 'P' : 'S'}${skill.elite ? ', Elite' : ''})` : '';
    }).filter(Boolean).join(', ');
    lines.push(`${index + 1}. ${player.name || '—'} · ${position.name} · ${position.cost}k`);
    lines.push(`   ${position.skills.join(', ') || 'Нет базовых навыков'}${added ? ` + ${added}` : ''}`);
  });
  if (roster.stars.length) {
    lines.push('', 'ЗВЁЗДНЫЕ ИГРОКИ');
    roster.stars.forEach((hire) => {
      const star = getStar(hire.starId);
      if (star) lines.push(`★ ${star.name} · ${star.group === 'veteran' ? 'Ветеран' : 'Легенда'} · ${star.cost}k + ${starSurcharge(calc.team.tier, star.group)}k SG`);
    });
  }
  lines.push('', 'САЙДЛАЙН');
  lines.push(`Re-rolls: ${roster.staff.rerolls}; Apothecary: ${roster.staff.apothecary}; Assistant coaches: ${roster.staff.assistants}+${calc.freeAssistants}; Cheerleaders: ${roster.staff.cheerleaders}+${calc.freeCheerleaders}; Dedicated fans: ${roster.staff.fans}`);
  const selectedInducements = getInducements(calc.team).filter((item) => (roster.inducements[item.id] ?? 0) > 0);
  if (selectedInducements.length) {
    lines.push('', 'ПООЩРЕНИЯ');
    selectedInducements.forEach((item) => lines.push(`${item.name} ×${roster.inducements[item.id]}`));
  }
  const sponsors = SPONSORS.filter((item) => roster.sponsors.includes(item.id));
  const coaches = COACHES.filter((item) => roster.coaches.includes(item.id));
  if (sponsors.length) lines.push('', `Спонсоры: ${sponsors.map((item) => item.name).join(', ')}`);
  if (coaches.length) lines.push(`Именитые тренеры: ${coaches.map((item) => item.name).join(', ')}`);
  lines.push('', calc.valid ? '✓ Ростер соответствует правилам' : `Ошибки: ${calc.errors.map((error) => error.text).join(' | ')}`);
  return lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n');
}

export function downloadJson(roster: RosterState) {
  const blob = new Blob([JSON.stringify(roster, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${safeFilename(roster.name)}.json`);
}

export function downloadText(roster: RosterState) {
  const blob = new Blob([rosterToText(roster)], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `${safeFilename(roster.name)}.txt`);
}

function safeFilename(value: string) {
  return (value || 'blood-bowl-roster').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
