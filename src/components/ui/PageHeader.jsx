export default function PageHeader({
  title,
  description,
  action,
  eyebrow,
  className = "",
}) {
  return (
    <div className={["module-header", className].filter(Boolean).join(" ")}>
      <div className="module-header-copy">
        {eyebrow ? <span className="module-header-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="module-header-action">{action}</div> : null}
    </div>
  );
}
