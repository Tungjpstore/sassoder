export function MetricCard({ label, value, tone = 'neutral' }: Readonly<{ label: string; value: string; tone?: 'neutral' | 'good' | 'warn' }>) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
