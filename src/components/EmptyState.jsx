import Icon from './Icon.jsx';

export default function EmptyState({ title, children, icon = 'info', actions }) {
  return (
    <section className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <Icon name={icon} size={28} />
      </span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {actions && <div className="empty-state-actions">{actions}</div>}
    </section>
  );
}
