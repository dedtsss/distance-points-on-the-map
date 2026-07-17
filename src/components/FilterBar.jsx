export default function FilterBar({ label = 'Фильтр', options, value, onChange }) {
  return (
    <div className="filter-bar" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`filter-button${value === option.value ? ' is-active' : ''}`}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          {option.label}
          {Number.isFinite(option.count) && <span>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
