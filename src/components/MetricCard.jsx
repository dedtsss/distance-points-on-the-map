export default function MetricCard({ label, value, tone = 'neutral' }) {
  return (
    <div className={`metric-card metric-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
