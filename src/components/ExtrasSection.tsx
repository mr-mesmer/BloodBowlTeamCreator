import { useState } from 'react';
import { Check } from 'lucide-react';
import { COACHES, SPONSORS, getInducements } from '../lib/rules';
import type { RosterCalculations, RosterState, StaffState } from '../lib/types';
import { Stepper } from './UI';

type Tab = 'staff' | 'inducements' | 'contracts';

export function ExtrasSection({ roster, calc, onStaff, onInducement, onToggleContract }: {
  roster: RosterState;
  calc: RosterCalculations;
  onStaff: (key: keyof StaffState, value: number) => void;
  onInducement: (id: string, value: number) => void;
  onToggleContract: (type: 'sponsors' | 'coaches', id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('staff');
  const staffRows = [
    { key: 'rerolls' as const, name: 'Team re-rolls', cost: calc.team.rerollCost, max: 8, free: 0 },
    ...(calc.team.apothecary ? [{ key: 'apothecary' as const, name: 'Apothecary', cost: 50, max: 1, free: 0 }] : []),
    { key: 'assistants' as const, name: 'Assistant coaches', cost: 10, max: Math.max(0, 6 - calc.freeAssistants), free: calc.freeAssistants },
    { key: 'cheerleaders' as const, name: 'Cheerleaders', cost: 10, max: Math.max(0, 6 - calc.freeCheerleaders), free: calc.freeCheerleaders },
    { key: 'fans' as const, name: 'Dedicated fans', cost: 5, max: 3, free: 0 },
  ];
  const contractCount = roster.sponsors.length + roster.coaches.length;
  const inducementCount = Object.values(roster.inducements).reduce((sum, value) => sum + value, 0);

  return (
    <section className="card extras-card">
      <div className="extras-tabs" role="tablist" aria-label="Дополнительные покупки">
        <button className={tab === 'staff' ? 'active' : ''} onClick={() => setTab('staff')} role="tab">Стаф{calc.staffCost > 0 && <span>{calc.staffCost}k</span>}</button>
        <button className={tab === 'inducements' ? 'active' : ''} onClick={() => setTab('inducements')} role="tab">Поощрения{inducementCount > 0 && <span>{inducementCount}</span>}</button>
        <button className={tab === 'contracts' ? 'active' : ''} onClick={() => setTab('contracts')} role="tab">Контракты{contractCount > 0 && <span>{contractCount}</span>}</button>
      </div>

      {tab !== 'contracts' ? (
        <div className="purchase-list extras-list">
          {tab === 'staff' ? staffRows.map((row) => (
            <div className="purchase-row" key={row.key}>
              <div className="purchase-copy"><strong>{row.name}</strong><small>{row.cost}k{row.free > 0 && <em>+{row.free} бесплатно</em>}</small></div>
              <Stepper label={row.name} value={roster.staff[row.key]} max={row.max} onChange={(value) => onStaff(row.key, value)} />
              <span className="purchase-total">{roster.staff[row.key] * row.cost}k</span>
            </div>
          )) : getInducements(calc.team).map((item) => {
            const value = roster.inducements[item.id] ?? 0;
            return (
              <div className="purchase-row" key={item.id}>
                <div className="purchase-copy"><strong>{item.name}</strong><small>{item.cost}k · до {item.max}{item.note && <em>{item.note}</em>}</small></div>
                <Stepper label={item.name} value={value} max={item.max} onChange={(next) => onInducement(item.id, next)} />
                <span className="purchase-total">{value * item.cost}k</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="extras-contracts">
          {([['sponsors', 'Спонсоры', SPONSORS], ['coaches', 'Именитые тренеры', COACHES]] as const).map(([type, title, items]) => (
            <div key={type}>
              <h3>{title}</h3>
              {items.map((item) => {
                const active = roster[type].includes(item.id);
                return (
                  <button key={item.id} className={`contract-row ${active ? 'selected' : ''}`} onClick={() => onToggleContract(type, item.id)} aria-pressed={active}>
                    <span className="contract-check">{active && <Check size={13} />}</span>
                    <span className="contract-copy"><strong>{item.name}</strong><small>+1 {item.freebie === 'assistant' ? 'assistant coach' : 'cheerleader'}</small></span>
                    <span className="contract-effects"><b className={item.teamGold >= 0 ? 'positive' : 'negative'}>{item.teamGold >= 0 ? '+' : '−'}{Math.abs(item.teamGold)} TB</b><b className={item.skillGold >= 0 ? 'positive' : 'negative'}>{item.skillGold >= 0 ? '+' : '−'}{Math.abs(item.skillGold)} SG</b></span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
