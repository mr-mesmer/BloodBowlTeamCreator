import { useState } from 'react';
import { AlertCircle, Check, ChevronDown } from 'lucide-react';
import type { RosterCalculations } from '../lib/types';
import { Progress } from './UI';

export function BudgetCards({ calc }: { calc: RosterCalculations }) {
  const cards = [
    { label: 'Team Budget', value: calc.teamCost, max: calc.teamBudget, remaining: calc.teamRemaining, tone: 'green' as const },
    { label: 'Skill Gold', value: calc.skillCost, max: calc.skillBudget, remaining: calc.skillRemaining, tone: 'orange' as const },
  ];
  return (
    <div className="budget-grid" aria-label="Бюджеты команды">
      {cards.map((card) => (
        <section className={`budget-card ${card.value > card.max ? 'over' : ''}`} key={card.label}>
          <div className="budget-card-top">
            <span className="budget-label">{card.label}</span>
            <strong>{card.value}<small>k / {card.max}k</small></strong>
          </div>
          <Progress value={card.value} max={card.max} tone={card.tone} />
          <div className="budget-notes">{card.value > card.max ? `Превышение на ${card.value - card.max}k` : `Осталось ${card.remaining}k`}</div>
        </section>
      ))}
    </div>
  );
}

export function ValidationBar({ calc }: { calc: RosterCalculations }) {
  const [open, setOpen] = useState(false);
  if (calc.valid) {
    return <div className="validation-bar valid"><Check size={15} /><strong>Ростер готов</strong><span>{calc.playerCount} игроков · Secondary {calc.secondaryCount}/3 · стаки {calc.stackCount}/3</span></div>;
  }
  return (
    <div className={`validation-bar invalid ${open ? 'open' : ''}`}>
      <button onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <AlertCircle size={15} /><strong>Проверьте ростер</strong><span>{calc.errors[0]?.text}</span><ChevronDown size={14} />
      </button>
      {open && <ul>{calc.errors.map((error) => <li key={error.id}>{error.text}</li>)}</ul>}
    </div>
  );
}
