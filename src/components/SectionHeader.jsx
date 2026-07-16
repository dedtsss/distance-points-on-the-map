export default function SectionHeader({ kicker, title, children, actions }) {
  return (
    <header className="section-header">
      <div>
        {kicker && <p className="section-kicker">{kicker}</p>}
        <h2>{title}</h2>
        {children && <p className="section-copy">{children}</p>}
      </div>
      {actions && <div className="section-actions">{actions}</div>}
    </header>
  );
}
