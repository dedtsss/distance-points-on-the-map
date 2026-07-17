import Icon from './Icon.jsx';

export default function ErrorState({ title = 'Ошибка', children }) {
  return (
    <section className="state-card error-state" role="alert">
      <Icon name="error" size={28} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </section>
  );
}
