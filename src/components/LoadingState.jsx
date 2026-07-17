export default function LoadingState({ title = 'Загрузка', children }) {
  return (
    <section className="state-card loading-state" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </section>
  );
}
