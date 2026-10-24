import { useMemo, useState } from 'react';
import { ChevronDown, Plus, Search, Star, Trash2, Users, X } from 'lucide-react';
import { getStar, normalizeName } from '../lib/catalog';
import { availableStars } from '../lib/engine';
import { starSurcharge } from '../lib/rules';
import type { RosterCalculations, RosterState, StarGroup } from '../lib/types';

export function StarsSection({ roster, calc, onAdd, onRemove }: {
  roster: RosterState;
  calc: RosterCalculations;
  onAdd: (starId: string) => void;
  onRemove: (hireId: string) => void;
}) {
  const [open, setOpen] = useState(roster.stars.length > 0);
  const [group, setGroup] = useState<StarGroup>('veteran');
  const [query, setQuery] = useState('');
  const eligible = useMemo(() => availableStars(roster), [roster]);
  const normalizedQuery = normalizeName(query);
  const stars = eligible.filter((star) => star.group === group && (!normalizedQuery || normalizeName(star.name).includes(normalizedQuery)));
  const veteranCount = roster.stars.filter((hire) => getStar(hire.starId)?.group === 'veteran').length;
  const legendCount = roster.stars.filter((hire) => getStar(hire.starId)?.group === 'legend').length;

  const canAdd = (starId: string) => {
    const star = getStar(starId);
    if (!star || roster.stars.some((hire) => hire.starId === starId)) return false;
    if (star.group === 'veteran' && (veteranCount >= 2 || legendCount > 0)) return false;
    if (star.group === 'legend' && roster.stars.length > 0) return false;
    if (calc.playerCount + star.members.length > 16) return false;
    return true;
  };

  return (
    <section className="card stars-card">
      <div className="card-header roster-heading">
        <div><h2>Звёздные игроки <span className={`count-badge ${roster.stars.length ? 'star' : ''}`}>{roster.stars.length}</span></h2></div>
        <button className="button button-secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}><Star size={16} />{open ? 'Скрыть список' : 'Нанять звезду'}<ChevronDown size={15} className={open ? 'rotate' : ''} /></button>
      </div>
      {roster.stars.length > 0 && <div className="hired-stars">
        {roster.stars.map((hire) => {
          const star = getStar(hire.starId);
          if (!star) return null;
          return <div className="hired-star" key={hire.id}><span className="hired-star-icon"><Star size={17} fill="currentColor" /></span><div><strong>{star.name}</strong><small>{star.group === 'veteran' ? 'Ветеран' : 'Легенда'} · {star.cost}k TB + {starSurcharge(calc.team.tier, star.group)}k SG{star.members.length > 1 ? ' · пара' : ''}</small></div><button className="row-action" onClick={() => onRemove(hire.id)} aria-label={`Удалить ${star.name}`}><Trash2 size={16} /></button></div>;
        })}
        {calc.team.tier <= 4 && <div className="inline-alert warning">Для тира {calc.team.tier} со звёздами Secondary и стаки запрещены.</div>}
      </div>}
      {open && <div className="star-browser">
        <div className="star-browser-toolbar">
          <div className="segmented-control">
            <button className={group === 'veteran' ? 'active' : ''} onClick={() => setGroup('veteran')}>Ветераны <span>1–2</span></button>
            <button className={group === 'legend' ? 'active' : ''} onClick={() => setGroup('legend')}>Легенды <span>1</span></button>
          </div>
          <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти звезду" />{query && <button onClick={() => setQuery('')} aria-label="Очистить"><X size={14} /></button>}</label>
        </div>
        <div className="star-list">
          {stars.map((star) => {
            const hired = roster.stars.some((hire) => hire.starId === star.id);
            const enabled = canAdd(star.id);
            return <div className={`star-option ${hired ? 'hired' : ''}`} key={star.id}>
              <div className="star-option-main"><strong>{star.name}</strong><small>{star.members.map((member) => `${member.stats.MA}/${member.stats.ST}/${member.stats.AG}/${member.stats.PA}/${member.stats.AV}`).join(' · ')}</small></div>
              {star.members.length > 1 && <span className="pair-badge"><Users size={12} />2</span>}
              <div className="star-option-price"><strong>{star.cost}k</strong><small>+{starSurcharge(calc.team.tier, star.group)}k SG</small></div>
              <button className="star-add" disabled={!enabled} onClick={() => onAdd(star.id)} aria-label={`Нанять ${star.name}`}>{hired ? 'Нанят' : <Plus size={16} />}</button>
            </div>;
          })}
          {stars.length === 0 && <div className="skill-empty">Для этой команды и фильтра звёзды не найдены.</div>}
        </div>
      </div>}
    </section>
  );
}
