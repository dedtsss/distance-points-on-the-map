import React, { useId, useState } from 'react';
import { readRecentValues, rememberValue, forgetValue, matchingValues } from './recentValues.js';

export default function RecentField({ field, label, value, onChange, multiline = false, placeholder }) {
  const id = useId();
  const [values, setValues] = useState([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [error, setError] = useState('');
  const persist = (action) => {
    try { setValues(action()); setError(''); }
    catch { setError('Не удалось сохранить подсказки на устройстве.'); }
  };
  const matches = matchingValues(values, value);
  const pick = (suggestion) => {
    onChange(suggestion); persist(() => rememberValue(field, suggestion)); setOpen(false); setSelected(-1);
  };
  const Input = multiline ? 'textarea' : 'input';
  return <div className="recent-field" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      persist(() => rememberValue(field, value)); setOpen(false); setSelected(-1);
    }
  }}>
    <label htmlFor={id}>{label}</label>
    <Input id={id} value={value} placeholder={placeholder} rows={multiline ? 2 : undefined}
      role="combobox" aria-autocomplete="list" aria-expanded={open && matches.length > 0}
      aria-controls={`${id}-list`} aria-activedescendant={selected >= 0 ? `${id}-option-${selected}` : undefined}
      onFocus={() => { persist(() => readRecentValues(field)); setOpen(true); }}
      onChange={(event) => { onChange(event.target.value); setOpen(true); setSelected(-1); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { setOpen(false); setSelected(-1); }
        if (matches.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault(); setOpen(true);
          setSelected((current) => (current + (event.key === 'ArrowDown' ? 1 : matches.length - 1) + matches.length) % matches.length);
        }
        if (open && selected >= 0 && event.key === 'Enter') { event.preventDefault(); pick(matches[selected]); }
      }} />
    {open && matches.length > 0 && <div className="recent-suggestions">
      <div id={`${id}-list`} role="listbox" aria-label={`Подсказки: ${label}`}>
        {matches.map((suggestion, index) => <button key={suggestion} id={`${id}-option-${index}`} type="button"
          role="option" aria-selected={selected === index} onClick={() => pick(suggestion)}>{suggestion}</button>)}
      </div>
      <button className="recent-forget" type="button" onClick={() => {
        persist(() => forgetValue(field, value.trim())); setSelected(-1);
      }} disabled={!values.includes(value.trim())} aria-label={`Забыть значение поля ${label}`}>Забыть это значение</button>
    </div>}
    {error && <span role="status">{error}</span>}
  </div>;
}
