import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, FileJson, FileText, Plus, Printer } from 'lucide-react';
import { BudgetCards, ValidationBar } from './components/Budget';
import { ExtrasSection } from './components/ExtrasSection';
import { PrintRoster } from './components/PrintRoster';
import { RosterTable } from './components/RosterTable';
import { SkillModal } from './components/SkillModal';
import { StarsSection } from './components/StarsSection';
import { catalog, getPosition } from './lib/catalog';
import { calculateRoster } from './lib/engine';
import { downloadJson, downloadText } from './lib/export';
import { createPlayer, createRoster, sanitizeRoster, touch, uid, CURRENT_ROSTER_KEY } from './lib/state';
import type { AddedSkill, RosterState, StaffState } from './lib/types';

function initialRoster(): RosterState {
  try {
    const current = localStorage.getItem(CURRENT_ROSTER_KEY);
    if (current) return sanitizeRoster(JSON.parse(current));
  } catch (error) {
    console.warn('Could not restore roster', error);
  }
  return createRoster();
}

function Logo() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 46 46" fill="none"><path d="M12 30C5 20 14 8 26 9c12 1 18 13 11 22-7 9-19 8-25-1Z" fill="currentColor" /><path d="m12 31 23-17M17 35l23-17" stroke="white" strokeWidth="2.4" /><path d="m22 17 4 4m-8 0 4 4m-8 0 4 4" stroke="white" strokeWidth="1.8" /></svg></span>;
}

export default function App() {
  const [roster, setRoster] = useState<RosterState>(initialRoster);
  const [skillPlayerId, setSkillPlayerId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const calc = useMemo(() => calculateRoster(roster), [roster]);
  const team = calc.team;

  useEffect(() => { localStorage.setItem(CURRENT_ROSTER_KEY, JSON.stringify(roster)); }, [roster]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (exportOpen && exportRef.current && !exportRef.current.contains(event.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [exportOpen]);

  const update = (recipe: (current: RosterState) => RosterState) => setRoster((current) => touch(recipe(current)));
  const hasDraft = roster.players.length > 0 || roster.stars.length > 0 || roster.sponsors.length > 0 || roster.coaches.length > 0 ||
    Object.values(roster.inducements).some((value) => value > 0) || Object.values(roster.staff).some((value) => value > 0);

  const changeTeam = (teamId: string) => {
    if (teamId === roster.teamId) return;
    if (hasDraft && !window.confirm('Сменить ростер? Игроки, навыки и покупки будут очищены.')) return;
    const fresh = createRoster(teamId);
    setRoster({ ...fresh, id: roster.id, name: roster.name, coach: roster.coach });
    setSkillPlayerId(null);
  };

  const newRoster = () => {
    if (hasDraft && !window.confirm('Начать новый пустой ростер?')) return;
    setRoster(createRoster());
    setSkillPlayerId(null);
  };

  const skillPlayer = roster.players.find((player) => player.id === skillPlayerId);
  const skillPosition = skillPlayer ? getPosition(team, skillPlayer.positionId) : undefined;

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div className="brand"><Logo /><span><strong>DUGOUT</strong><small>ROSTER BUILDER</small></span></div>
        <span className="autosave-note">Автосохранение</span>
        <div className="header-actions">
          <button className="button button-ghost" onClick={newRoster}><Plus size={16} /><span>Новый ростер</span></button>
          <div className="export-wrap" ref={exportRef}>
            <button className="button button-dark" onClick={() => setExportOpen((value) => !value)} aria-expanded={exportOpen}><Download size={16} /><span>Экспорт</span><ChevronDown size={14} /></button>
            {exportOpen && <div className="export-menu">
              <button onClick={() => { window.print(); setExportOpen(false); }}><Printer size={17} /><span><strong>Печать / PDF</strong></span></button>
              <button onClick={() => { downloadJson(roster); setExportOpen(false); }}><FileJson size={17} /><span><strong>Ростер .json</strong></span></button>
              <button onClick={() => { downloadText(roster); setExportOpen(false); }}><FileText size={17} /><span><strong>Текст .txt</strong></span></button>
            </div>}
          </div>
        </div>
      </header>

      <main className="page-container no-print">
        <section className="setup-card card">
          <div className="team-selector-block">
            <span className="tier-shield"><small>TIER</small>{team.tier}</span>
            <div><label htmlFor="team-select">Ростер</label><select id="team-select" className="team-select" value={roster.teamId} onChange={(event) => changeTeam(event.target.value)}>{Array.from({ length: 7 }, (_, index) => index + 1).map((tier) => <optgroup key={tier} label={`Tier ${tier}`}>{catalog.teams.filter((item) => item.tier === tier).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select></div>
          </div>
          <div className="setup-fields">
            <label className="field"><span>Название команды</span><input value={roster.name} maxLength={100} onChange={(event) => update((current) => ({ ...current, name: event.target.value }))} placeholder="Без названия" /></label>
            <label className="field"><span>Тренер</span><input value={roster.coach} maxLength={100} onChange={(event) => update((current) => ({ ...current, coach: event.target.value }))} placeholder="Необязательно" /></label>
            <label className="field"><span>Лига</span><select value={roster.league} onChange={(event) => update((current) => ({ ...current, league: event.target.value }))} disabled={team.leagues.length <= 1}>{team.leagues.map((league) => <option key={league}>{league}</option>)}</select></label>
            {team.favouredOptions.length > 0 && <label className="field"><span>Favoured of…</span><select value={roster.favoured} onChange={(event) => update((current) => ({ ...current, favoured: event.target.value }))}>{team.favouredOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>}
          </div>
        </section>

        <BudgetCards calc={calc} />
        <ValidationBar calc={calc} />

        <div className="builder-main">
          <RosterTable roster={roster} team={team} playerCount={calc.playerCount}
            onAdd={(positionId) => update((current) => ({ ...current, players: [...current.players, createPlayer(positionId)] }))}
            onRemove={(playerId) => update((current) => ({ ...current, players: current.players.filter((player) => player.id !== playerId) }))}
            onRemoveStar={(hireId) => update((current) => ({ ...current, stars: current.stars.filter((hire) => hire.id !== hireId) }))}
            onName={(playerId, name) => update((current) => ({ ...current, players: current.players.map((player) => player.id === playerId ? { ...player, name } : player) }))}
            onPosition={(playerId, positionId) => update((current) => ({ ...current, players: current.players.map((player) => player.id === playerId ? { ...player, positionId, skills: [] } : player) }))}
            onSkills={setSkillPlayerId}
          />
          <StarsSection roster={roster} calc={calc}
            onAdd={(starId) => update((current) => ({ ...current, stars: [...current.stars, { id: uid('star'), starId }] }))}
            onRemove={(hireId) => update((current) => ({ ...current, stars: current.stars.filter((hire) => hire.id !== hireId) }))}
          />
          <ExtrasSection roster={roster} calc={calc}
            onStaff={(key: keyof StaffState, value) => update((current) => ({ ...current, staff: { ...current.staff, [key]: value } }))}
            onInducement={(id, value) => update((current) => ({ ...current, inducements: { ...current.inducements, [id]: value } }))}
            onToggleContract={(type, id) => update((current) => ({ ...current, [type]: current[type].includes(id) ? current[type].filter((item) => item !== id) : [...current[type], id] }))}
          />
        </div>
      </main>

      {skillPlayer && skillPosition && <SkillModal key={skillPlayer.id} player={skillPlayer} position={skillPosition} roster={roster} calc={calc} onSave={(playerId, skills: AddedSkill[]) => update((current) => ({ ...current, players: current.players.map((player) => player.id === playerId ? { ...player, skills } : player) }))} onClose={() => setSkillPlayerId(null)} />}
      <PrintRoster roster={roster} calc={calc} />
    </div>
  );
}
