import { Bell, LogOut, Menu, Search, UserCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePageTitle } from "../../app/router";
import { useAuth } from "../../auth/auth.jsx";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default function Header({ onOpenSidebar }) {
  const title = usePageTitle();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="topbar-modern">
      <div className="topbar-main-row">
        <div className="topbar-title-wrap">
          <button
            type="button"
            className="topbar-menu-btn"
            onClick={onOpenSidebar}
            aria-label="Abrir menu lateral"
          >
            <Menu size={18} />
          </button>

          <div>
            <div className="topbar-eyebrow">{getGreeting()}</div>
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">
              Acompanhe indicadores, atalhos e movimentações da sua empresa.
            </p>
          </div>
        </div>

        <div className="topbar-actions-modern">
          <label className="searchbox-modern">
            <Search size={16} />
            <input type="text" placeholder="Buscar cliente, produto, OS..." />
          </label>

          <button type="button" className="topbar-icon-btn" aria-label="Notificações">
            <Bell size={18} />
          </button>

          <div className="user-chip-modern">
            <div className="user-chip-avatar">
              <UserCircle2 size={18} />
            </div>
            <div className="user-chip-copy">
              <strong>{user?.name || "Usuário"}</strong>
              <span>{user?.role || "Operador"}</span>
            </div>
          </div>

          <button className="topbar-logout-modern" type="button" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
}
