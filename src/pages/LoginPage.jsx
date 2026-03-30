import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { useAuth } from "../auth/auth.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "").trim();

    if (!normalizedUsername || !normalizedPassword) {
      setError("Informe usuário e senha.");
      return;
    }

    try {
      setIsSubmitting(true);
      await login(normalizedUsername, normalizedPassword);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err?.message || "Falha ao entrar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-box">
        <Card title="Entrar no sistema">
          <form onSubmit={handleSubmit} className="form-grid">
            <label className="form-field">
              <span>Usuário</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: admin"
                autoComplete="username"
              />
            </label>

            <label className="form-field">
              <span>Senha</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                autoComplete="current-password"
              />
            </label>

            {error ? <div className="login-error">{error}</div> : null}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <div className="login-help">
            <strong>Acessos iniciais:</strong>
            <br />
            admin / 123456
            <br />
            atendente / 123456
            <br />
            tecnico / 123456
          </div>
        </Card>
      </div>
    </div>
  );
}