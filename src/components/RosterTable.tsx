import { useState } from 'react';
import { ChevronDown, Plus, Shield, Star, Trash2, UserPlus, WandSparkles } from 'lucide-react';
import { getPosition, getSkill, getStar } from '../lib/catalog';
import { playerAdvancementCost } from '../lib/engine';
import type { RosterState, Team } from '../lib/types';

interface Props {
  roster: RosterState;
  team: Team;
  playerCount: number;
  onAdd: (positionId: string) => void;
  onRemove: (playerId: string) => void;
  onRemoveStar: (hireId: string) => void;
  onName: (playerId: string, name: string) => void;
  onPosition: (playerId: string, positionId: string) => void;
  onSkills: (playerId: string) => void;
}

export function RosterTable({ roster, team, playerCount, onAdd, onRemove, onRemoveStar, onName, onPosition, onSkills }: Props) {
  const [addOpen, setAddOpen] = useState(roster.players.length === 0);
  const positionCount = (positionId: string) => roster.players.filter((player) => player.positionId === positionId).length;

  return (
    <section className="card roster-card">
      <div className="card-header roster-heading">
        <div><h2>Игроки <span className={`count-badge ${playerCount >= 11 && playerCount <= 16 ? 'ok' : ''}`}>{playerCount} / 16</span></h2></div>
        <button className="button button-primary" onClick={() => setAddOpen((value) => !value)} aria-expanded={addOpen}>
          <Plus size={17} /> Добавить игрока <ChevronDown size={15} className={addOpen ? 'rotate' : ''} />
        </button>
      </div>

      {addOpen && (
        <div className="position-picker">
          <div className="position-grid">
            {team.positions.map((position) => {
              const count = positionCount(position.id);
              const full = count >= position.max || playerCount >= 16;
              return (
                <button key={position.id} className="position-option" disabled={full} onClick={() => onAdd(position.id)}>
                  <span className="position-plus"><Plus size={15} /></span>
                  <span className="position-info">
                    <strong>{position.name}</strong>
                    <small>{position.stats.MA} · {position.stats.ST} · {position.stats.AG} · {position.stats.PA} · {position.stats.AV}</small>
                  </span>
                  <span className="position-meta"><b>{position.cost}k</b><small>{count} / {position.max}</small></span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {roster.players.length === 0 && roster.stars.length === 0 ? (
        <div className="empty-roster">
          <span className="empty-icon"><UserPlus size={25} /></span>
          <div><strong>Ростер пока пуст</strong><p>Добавьте минимум 11 игроков.</p></div>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="roster-table">
            <thead><tr>
              <th>#</th><th>Игрок / позиция</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Навыки</th><th className="align-right">Цена</th><th aria-label="Действия" />
            </tr></thead>
            <tbody>
              {roster.players.map((player, index) => {
                const position = getPosition(team, player.positionId);
                if (!position) return null;
                const advancement = playerAdvancementCost(player);
                return (
                  <tr key={player.id}>
                    <td className="row-number">{String(index + 1).padStart(2, '0')}</td>
                    <td className="player-cell">
                      <input className="player-name-input" value={player.name} onChange={(event) => onName(player.id, event.target.value)} placeholder="Имя игрока" aria-label={`Имя игрока ${index + 1}`} />
                      <select value={player.positionId} onChange={(event) => onPosition(player.id, event.target.value)} aria-label={`Позиция игрока ${index + 1}`}>
                        {team.positions.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.cost}k</option>)}
                      </select>
                    </td>
                    {(['MA', 'ST', 'AG', 'PA', 'AV'] as const).map((stat) => <td key={stat} className="stat-cell">{position.stats[stat]}</td>)}
                    <td className="skills-cell">
                      <div className="base-skills">{position.skills.join(' · ') || '—'}</div>
                      {player.skills.length > 0 && <div className="added-skill-list">
                        {player.skills.map((added) => {
                          const skill = getSkill(added.skillId);
                          return skill ? <span key={added.skillId} className={`skill-pill ${added.type}`} title={`${added.type === 'primary' ? 'Primary' : 'Secondary'}${skill.elite ? ' · Elite' : ''}`}>{skill.name}{skill.elite && <i>É</i>}</span> : null;
                        })}
                      </div>}
                      <button className="skill-add-button" onClick={() => onSkills(player.id)}><WandSparkles size={13} />{player.skills.length ? 'Изменить' : 'Навык'}{advancement > 0 && <span>+{advancement}k</span>}</button>
                    </td>
                    <td className="cost-cell">{position.cost}k</td>
                    <td><button className="row-action" onClick={() => onRemove(player.id)} aria-label={`Удалить игрока ${index + 1}`}><Trash2 size={16} /></button></td>
                  </tr>
                );
              })}
              {roster.stars.flatMap((hire) => {
                const star = getStar(hire.starId);
                if (!star) return [];
                let previousPlayers = roster.players.length;
                const hireIndex = roster.stars.findIndex((item) => item.id === hire.id);
                for (let i = 0; i < hireIndex; i += 1) previousPlayers += getStar(roster.stars[i].starId)?.members.length ?? 0;
                return star.members.map((member, memberIndex) => (
                  <tr key={`${hire.id}-${member.name}`} className="star-row">
                    <td className="row-number">{String(previousPlayers + memberIndex + 1).padStart(2, '0')}</td>
                    <td className="player-cell">
                      <div className="star-player-name"><Star size={13} fill="currentColor" />{member.name}</div>
                      <div className="star-player-subtitle">{star.name} · {star.group === 'veteran' ? 'Ветеран' : 'Легенда'}</div>
                    </td>
                    {(['MA', 'ST', 'AG', 'PA', 'AV'] as const).map((stat) => <td key={stat} className="stat-cell">{member.stats[stat]}</td>)}
                    <td className="skills-cell"><div className="base-skills">{member.skills.join(' · ')}</div>{member.specialRules.length > 0 && <div className="special-rule-line"><Shield size={11} />{member.specialRules.join(' · ')}</div>}</td>
                    <td className="cost-cell">{memberIndex === 0 ? `${star.cost}k` : 'в паре'}</td>
                    <td>{memberIndex === 0 && <button className="row-action" onClick={() => onRemoveStar(hire.id)} aria-label={`Удалить ${star.name}`}><Trash2 size={16} /></button>}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
