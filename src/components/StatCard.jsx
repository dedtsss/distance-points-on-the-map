import Icon from './Icon.jsx';

export default function StatCard({ label, value, helper, tone = 'neutral', icon = 'info' }) {
  return (
    <article className={`stat-card stat-card-${tone}`}>
      <div className="stat-icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {helper && <p>{helper}</p>}
      </div>
    </article>
  );
}
