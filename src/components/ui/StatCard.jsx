export default function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}) {
  return (
    <div className={`stat-card stat-card-${tone}`}>
      <div className="stat-card-top">
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
        </div>

        {Icon ? (
          <div className="stat-icon">
            <Icon size={18} />
          </div>
        ) : null}
      </div>

      <div className="stat-hint">{hint}</div>
    </div>
  );
}
