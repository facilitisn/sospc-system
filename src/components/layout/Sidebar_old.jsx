import { NavLink } from "react-router-dom";
import { Home, Users, Boxes, Wrench, Settings, BarChart3, Shield, Wallet, Monitor, Briefcase, Building2 } from "lucide-react";
import { hasRouteAccess, useAuth } from "../../auth/auth.jsx";

const items = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/pdv", label: "PDV", icon: Monitor },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/produtos", label: "Produtos", icon: Boxes },
  { to: "/servicos", label: "Serviços", icon: Briefcase },
  { to: "/fornecedores", label: "Fornecedores", icon: Building2 },
  { to: "/ordens-servico", label: "Ordens de Serviço", icon: Wrench },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/usuarios", label: "Usuários", icon: Shield },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export default function Sidebar() {
  const { user } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <strong>SOSPC</strong>
        <span style={{ marginLeft: 6 }}>Sistema de gestão</span>
      </div>

      <nav className="sidebar-nav">
        {items.filter((item) => hasRouteAccess(user, item.to)).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-user">
        <div><strong>{user?.name || "Usuário"}</strong></div>
        <div className="client-list-meta">{user?.role || "—"}</div>
      </div>
    </aside>
  );
}