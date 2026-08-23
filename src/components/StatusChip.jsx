export default function StatusChip({ tone = 'neutral', children }) {
  return <span className={`status-chip status-chip-${tone}`}><span aria-hidden="true">•</span><span>{children}</span></span>;
}
