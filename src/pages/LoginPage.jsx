import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/auth.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { login, isAuthenticated, isBootstrapped } = useAuth();

  const [form, setForm] = useState({
    username: "",
    password: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isBootstrapped && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isBootstrapped, isAuthenticated, navigate]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const username = String(form.username || "").trim();
    const password = String(form.password || "");

    if (!username || !password) {
      toast.warning("Informe seu e-mail/usuário e senha.");
      return;
    }

    setIsSubmitting(true);

    try {
      await login(username, password);
      toast.success("Login realizado com sucesso.");
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Erro ao realizar login:", error);
      toast.error(error.message || "Não foi possível entrar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isBootstrapped) {
    return (
      <div
        className="page-stack"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        <Card>
          <div style={{ minWidth: 320 }}>Carregando...</div>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="page-stack"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "linear-gradient(180deg, rgba(239,246,255,0.9) 0%, rgba(255,255,255,1) 100%)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 460 }}>
        <Card>
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 42,
                height: 42,
                padding: "0 12px",
                borderRadius: 12,
                background: "#eff6ff",
                color: "#2563eb",
                fontWeight: 800,
                marginBottom: 14,
              }}
            >
              SOSPC
            </div>

            <h1 style={{ margin: 0, fontSize: 28 }}>Entrar no sistema</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted, #64748b)" }}>
              Acesse sua empresa com e-mail, usuário e senha.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="form-grid">
            <label className="form-field">
              <span>E-mail ou usuário</span>
              <input
                value={form.username}
                onChange={(e) => updateField("username", e.target.value)}
                placeholder="voce@empresa.com ou admin"
                autoComplete="username"
              />
            </label>

            <label className="form-field">
              <span>Senha</span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="Sua senha"
                autoComplete="current-password"
              />
            </label>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Entrando..." : "Entrar"}
              </Button>

              <Button type="button" variant="secondary" onClick={() => navigate("/criar-conta")}>
                Criar conta
              </Button>
            </div>
          </form>

          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid #e5e7eb",
              display: "grid",
              gap: 8,
              fontSize: 14,
              color: "var(--muted, #64748b)",
            }}
          >
            <div>
              Não tem conta? <Link to="/criar-conta">Criar conta</Link>
            </div>
            <div>
              Acompanhar OS do cliente?{" "}
              <span style={{ color: "#475569" }}>
                Use o link/QR recebido no atendimento.
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
