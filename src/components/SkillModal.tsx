import { useMemo, useState } from 'react';
import { Check, Search, Sparkles, X } from 'lucide-react';
import { catalog, normalizeBaseSkill, normalizeName } from '../lib/catalog';
import { addedSkillCost, playerAdvancementCost } from '../lib/engine';
import { CATEGORY_NAMES, RULE_PACK } from '../lib/rules';
import type { AddedSkill, Position, RosterCalculations, RosterPlayer, RosterState } from '../lib/types';
import { Modal } from './UI';

export function SkillModal({ player, position, roster, calc, onSave, onClose }: {
  player: RosterPlayer;
  position: Position;
  roster: RosterState;
  calc: RosterCalculations;
  onSave: (playerId: string, skills: AddedSkill[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<AddedSkill[]>(player.skills);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'primary' | 'secondary'>('primary');
  const baseSkills = useMemo(() => new Set(position.skills.map(normalizeBaseSkill)), [position]);
  const selectedIds = new Set(selected.map((item) => item.skillId));
  const restrictedByStars = roster.stars.length > 0 && calc.team.tier <= 4;
  const otherSecondaryCount = calc.secondaryCount - (player.skills.some((item) => item.type === 'secondary') ? 1 : 0);
  const otherStackCount = calc.stackCount - (player.skills.length > 1 ? 1 : 0);
  const prospectiveCost = playerAdvancementCost({ ...player, skills: selected });

  const canAdd = (skillId: string, type: 'primary' | 'secondary') => {
    const skill = catalog.skills.find((item) => item.id === skillId);
    if (!skill || baseSkills.has(normalizeName(skill.name)) || selectedIds.has(skillId)) return false;
    if (selected.length >= 2) return false;
    if (selected.length > 0 && type === 'secondary') return false;
    if (selected.some((item) => item.type === 'secondary')) return false;
    if (type === 'secondary' && restrictedByStars) return false;
    if (type === 'secondary' && otherSecondaryCount >= RULE_PACK.maxSecondary) return false;
    if (selected.length === 1 && restrictedByStars) return false;
    if (selected.length === 1 && otherStackCount >= RULE_PACK.maxStacks) return false;
    return true;
  };

  const toggle = (skillId: string, type: 'primary' | 'secondary') => {
    if (selectedIds.has(skillId)) {
      setSelected((items) => items.filter((item) => item.skillId !== skillId));
    } else if (canAdd(skillId, type)) {
      setSelected((items) => [...items, { skillId, type }]);
    }
  };

  const renderSkills = (type: 'primary' | 'secondary') => {
    const access = type === 'primary' ? position.primary : position.secondary;
    const normalizedQuery = normalizeName(query);
    const skills = catalog.skills.filter((skill) => access.includes(skill.category) &&
      (!normalizedQuery || normalizeName(skill.name).includes(normalizedQuery)));
    if (!skills.length) return <div className="skill-empty">Навыки не найдены. Попробуйте изменить запрос.</div>;
    return skills.map((skill) => {
      const isSelected = selectedIds.has(skill.id);
      const isBase = baseSkills.has(normalizeName(skill.name));
      const enabled = isSelected || canAdd(skill.id, type);
      const cost = addedSkillCost({ skillId: skill.id, type });
      return (
        <button key={`${type}-${skill.id}`} className={`skill-option ${isSelected ? 'selected' : ''}`} disabled={!enabled} onClick={() => toggle(skill.id, type)}>
          <span className={`category-dot category-${skill.category.toLowerCase()}`}>{skill.category}</span>
          <span className="skill-option-copy"><strong>{skill.name}{skill.elite && <em title="Elite: +10k">ELITE</em>}</strong><small>{CATEGORY_NAMES[skill.category]} · {type === 'primary' ? 'Primary' : 'Secondary'}{isBase ? ' · уже есть' : ''}</small></span>
          <span className="skill-option-cost">{isSelected ? <Check size={17} /> : `${cost}k`}</span>
        </button>
      );
    });
  };

  return (
    <Modal title={position.name} onClose={onClose} wide>
      <div className="skill-modal-summary">
        <div><span>Primary</span><strong>{position.primary.join(' · ') || '—'}</strong></div>
        <div><span>Secondary</span><strong>{position.secondary.join(' · ') || '—'}</strong></div>
        <div><span>Стоимость</span><strong>{prospectiveCost}k</strong></div>
      </div>

      <div className={`selected-skills ${selected.length === 0 ? 'empty' : ''}`}>
        {selected.length === 0 ? <span>Выберите один навык или стак из двух Primary.</span> : selected.map((added, index) => {
          const skill = catalog.skills.find((item) => item.id === added.skillId)!;
          return <button key={added.skillId} onClick={() => toggle(added.skillId, added.type)} title="Убрать навык"><span>{index + 1}</span>{skill.name}<small>{added.type === 'primary' ? 'P' : 'S'}{skill.elite ? ' · Elite' : ''}</small><X size={14} /></button>;
        })}
        {selected.length === 2 && <span className="stack-note"><Sparkles size={14} /> Стак: +{RULE_PACK.stackSurcharge}k</span>}
      </div>

      {restrictedByStars && <div className="inline-alert warning">У команды 1–4 тира со звёздами Secondary навыки и стаки запрещены.</div>}

      <div className="skill-toolbar">
        <div className="segmented-control">
          <button className={tab === 'primary' ? 'active' : ''} onClick={() => setTab('primary')}>Primary <span>{position.primary.join('')}</span></button>
          <button className={tab === 'secondary' ? 'active' : ''} onClick={() => setTab('secondary')}>Secondary <span>{position.secondary.join('')}</span></button>
        </div>
        <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти навык" /></label>
      </div>
      <div className="skill-options-grid">{renderSkills(tab)}</div>
      <div className="skill-modal-footer">
        <div className="skill-limits"><span>Secondary: <b>{calc.secondaryCount}/{RULE_PACK.maxSecondary}</b></span><span>Стаки: <b>{calc.stackCount}/{RULE_PACK.maxStacks}</b></span><span>Elite: <b>+10k</b></span></div>
        <div className="modal-actions"><button className="button button-ghost" onClick={onClose}>Отмена</button><button className="button button-primary" onClick={() => { onSave(player.id, selected); onClose(); }}>Сохранить · {prospectiveCost}k</button></div>
      </div>
    </Modal>
  );
}
