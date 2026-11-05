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
      <div className="print-meta"><span>Coach: <b>{roster.coach || '—'}</b></span><span>Players: <b>{calc.playerCount}</b></span><span>Status: <b>{calc.valid ? 'Roster ready' : 'Has errors'}</b></span></div>
      <div className="print-budgets"><div>Team Budget <strong>{calc.teamCost} / {calc.teamBudget}k</strong></div><div>Skill Gold <strong>{calc.skillCost} / {calc.skillBudget}k</strong></div></div>
      <table><thead><tr><th>#</th><th>Player</th><th>Position</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills &amp; Traits</th><th>Cost</th></tr></thead><tbody>
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
            return <tr key={`${hire.id}-${member.name}`}><td>{rowNumber}</td><td>★ {member.name}</td><td>{star.name}</td>{(['MA', 'ST', 'AG', 'PA', 'AV'] as const).map((stat) => <td key={stat}>{member.stats[stat]}</td>)}<td>{[...member.skills, ...member.specialRules].join(', ')}</td><td>{index === 0 ? `${star.cost}k + ${starSurcharge(calc.team.tier, star.group)}k SG` : 'paired'}</td></tr>;
          });
        })}
      </tbody></table>
      <div className="print-columns">
        <section><h2>Sideline</h2><p>Team re-rolls: {roster.staff.rerolls} × {calc.team.rerollCost}k</p>{calc.team.apothecary && <p>Apothecary: {roster.staff.apothecary}</p>}<p>Assistant coaches: {roster.staff.assistants} + {calc.freeAssistants} free</p><p>Cheerleaders: {roster.staff.cheerleaders} + {calc.freeCheerleaders} free</p><p>Dedicated fans: {roster.staff.fans}</p></section>
        <section><h2>Inducements</h2>{inducements.length ? inducements.map((item) => <p key={item.id}>{item.name}: {roster.inducements[item.id]} × {item.cost}k</p>) : <p>—</p>}</section>
        <section><h2>Contracts</h2><p>{[...sponsors, ...coaches].map((item) => item.name).join(', ') || '—'}</p><h2>Totals</h2><p>Skills: {calc.advancementCost}k SG</p><p>Star surcharge: {calc.starSurcharge}k SG</p></section>
      </div>
      {!calc.valid && <section className="print-errors"><h2>Validation errors</h2><ul>{calc.errors.map((error) => <li key={error.id}>{error.text}</li>)}</ul></section>}
      <footer>Custom EuroBowl · BB2025 · Built with Dugout</footer>
    </div>
  );
}
