import { Search, LogOut, UserCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePageTitle } from "../../app/router";
import { useAuth } from "../../auth/auth.jsx";

export default function Header() {
  const title = usePageTitle();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="topbar">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">Base inicial do sistema SOSPC</p>
      </div>

      <div className="topbar-actions">
        <label className="searchbox">
          <Search size={16} />
          <input type="text" placeholder="Busca rápida..." />
        </label>

        <div className="user-chip">
          <UserCircle2 size={18} />
          <span>{user?.name || "Usuário"}</span>
        </div>

        <button className="topbar-logout" type="button" onClick={handleLogout}>
          <LogOut size={16} />
          <span>Sair</span>
        </button>
      </div>
    </header>
  );
}
