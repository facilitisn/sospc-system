export default function StatusBanner({ title, description, tone = "info", actions = null, children = null }) {
  return (
    <section className={["status-banner", `status-banner-${tone}`].join(" ")}>
      <div className="status-banner-copy">
        {title ? <strong>{title}</strong> : null}
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="status-banner-actions">{actions}</div> : null}
    </section>
  );
}
