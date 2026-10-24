import { useEffect, type ReactNode } from 'react';
import { Minus, Plus, X } from 'lucide-react';

export function Modal({ title, children, onClose, wide = false }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max, label, disabled = false }: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={disabled || value <= min} aria-label={`Уменьшить: ${label}`}><Minus size={14} /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} aria-label={`Увеличить: ${label}`}><Plus size={14} /></button>
    </div>
  );
}

export function Progress({ value, max, tone = 'green' }: { value: number; max: number; tone?: 'green' | 'orange' | 'blue' }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : (value > 0 ? 100 : 0);
  const over = value > max;
  return (
    <div className={`progress-track ${over ? 'is-over' : ''}`} aria-hidden="true">
      <span className={`progress-fill ${tone}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

