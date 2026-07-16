export default function EmptyState({ title, children }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </section>
  );
}
