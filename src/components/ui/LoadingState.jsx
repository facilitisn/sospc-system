export default function LoadingState({
  title = "Carregando dados",
  description = "Aguarde um instante enquanto preparamos esta tela.",
  compact = false,
}) {
  return (
    <section className={["loading-state", compact ? "loading-state-compact" : ""].filter(Boolean).join(" ")}>
      <div className="loading-state-spinner" aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </section>
  );
}
