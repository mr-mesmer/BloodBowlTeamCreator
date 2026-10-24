import { getPosition, getSkill, getStar } from '../lib/catalog';
import { playerAdvancementCost } from '../lib/engine';
import { COACHES, SPONSORS, getInducements, starSurcharge } from '../lib/rules';
import type { RosterCalculations, RosterState } from '../lib/types';

export function PrintRoster({ roster, calc }: { roster: RosterState; calc: RosterCalculations }) {
  const inducements = getInducements(calc.team).filter((item) => (roster.inducements[item.id] ?? 0) > 0);
  const sponsors = SPONSORS.filter((item) => roster.sponsors.includes(item.id));
  const coaches = COACHES.filter((item) => roster.coaches.includes(item.id));
  let rowNumber = 0;
  return (
    <div className="print-roster">
      <header><div><h1>{roster.name || 'Blood Bowl roster'}</h1><p>{calc.team.name} · Tier {calc.team.tier} · {roster.league}{roster.favoured ? ` · Favoured of ${roster.favoured}` : ''}</p></div><strong>DUGOUT</strong></header>
      <div className="print-meta"><span>Тренер: <b>{roster.coach || '—'}</b></span><span>Игроков: <b>{calc.playerCount}</b></span><span>Статус: <b>{calc.valid ? 'Ростер готов' : 'Есть ошибки'}</b></span></div>
      <div className="print-budgets"><div>Team Budget <strong>{calc.teamCost} / {calc.teamBudget}k</strong></div><div>Skill Gold <strong>{calc.skillCost} / {calc.skillBudget}k</strong></div></div>
      <table><thead><tr><th>#</th><th>Игрок</th><th>Позиция</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Навыки и Traits</th><th>Цена</th></tr></thead><tbody>
        {roster.players.map((player) => {
          const position = getPosition(calc.team, player.positionId);
          if (!position) return null;
          rowNumber += 1;
          const added = player.skills.map((item) => {
            const skill = getSkill(item.skillId);
            return skill ? `${skill.name} [${item.type === 'primary' ? 'P' : 'S'}${skill.elite ? ', Elite' : ''}]` : '';
          }).filter(Boolean);
          return <tr key={player.id}><td>{rowNumber}</td><td>{player.name || '—'}</td><td>{position.name}</td>{(['MA', 'ST', 'AG', 'PA', 'AV'] as const).map((stat) => <td key={stat}>{position.stats[stat]}</td>)}<td>{[...position.skills, ...added].join(', ')}</td><td>{position.cost}k{playerAdvancementCost(player) > 0 ? ` + ${playerAdvancementCost(player)}k SG` : ''}</td></tr>;
        })}
        {roster.stars.flatMap((hire) => {
          const star = getStar(hire.starId);
          if (!star) return [];
          return star.members.map((member, index) => {
            rowNumber += 1;
            return <tr key={`${hire.id}-${member.name}`}><td>{rowNumber}</td><td>★ {member.name}</td><td>{star.name}</td>{(['MA', 'ST', 'AG', 'PA', 'AV'] as const).map((stat) => <td key={stat}>{member.stats[stat]}</td>)}<td>{[...member.skills, ...member.specialRules].join(', ')}</td><td>{index === 0 ? `${star.cost}k + ${starSurcharge(calc.team.tier, star.group)}k SG` : 'в паре'}</td></tr>;
          });
        })}
      </tbody></table>
      <div className="print-columns">
        <section><h2>Сайдлайн</h2><p>Team re-rolls: {roster.staff.rerolls} × {calc.team.rerollCost}k</p>{calc.team.apothecary && <p>Apothecary: {roster.staff.apothecary}</p>}<p>Assistant coaches: {roster.staff.assistants} + {calc.freeAssistants} бесплатно</p><p>Cheerleaders: {roster.staff.cheerleaders} + {calc.freeCheerleaders} бесплатно</p><p>Dedicated fans: {roster.staff.fans}</p></section>
        <section><h2>Поощрения</h2>{inducements.length ? inducements.map((item) => <p key={item.id}>{item.name}: {roster.inducements[item.id]} × {item.cost}k</p>) : <p>—</p>}</section>
        <section><h2>Контракты</h2><p>{[...sponsors, ...coaches].map((item) => item.name).join(', ') || '—'}</p><h2>Итого</h2><p>Навыки: {calc.advancementCost}k SG</p><p>Доплата за звёзд: {calc.starSurcharge}k SG</p></section>
      </div>
      {!calc.valid && <section className="print-errors"><h2>Ошибки проверки</h2><ul>{calc.errors.map((error) => <li key={error.id}>{error.text}</li>)}</ul></section>}
      <footer>Custom EuroBowl · BB2025 · Создано в Dugout</footer>
    </div>
  );
}
