export function StatBlock({ icon: Icon, label, value, meta, color }) {
  return (
    <article className="data-stat" style={{ "--stat-color": color }}>
      <Icon size={18} strokeWidth={1.3} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </article>
  );
}
