export default function PageHeader({ eyebrow, title, children, actions }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
