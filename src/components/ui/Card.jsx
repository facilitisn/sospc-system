export default function Card({
  title,
  description,
  action,
  children,
  className = "",
  bodyClassName = "",
  tone = "default",
}) {
  return (
    <section className={["card", `card-${tone}`, className].filter(Boolean).join(" ")}>
      {(title || description || action) && (
        <div className="card-header card-header-vertical-mobile">
          <div className="card-header-copy">
            {title ? <h3>{title}</h3> : null}
            {description ? <p className="card-description">{description}</p> : null}
          </div>
          {action ? <div className="card-header-action">{action}</div> : null}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
