import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Briefcase,
  Building2,
  CreditCard,
  Gauge,
  Home,
  LayoutGrid,
  Monitor,
  Package,
  Settings,
  Shield,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { hasRouteAccess, useAuth } from "../../auth/auth.jsx";

const groups = [
  {
    title: "Visão geral",
    items: [
      { to: "/", label: "Dashboard", icon: Home },
      { to: "/pdv", label: "PDV", icon: Monitor },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { to: "/clientes", label: "Clientes", icon: Users },
      { to: "/produtos", label: "Produtos", icon: Package },
      { to: "/servicos", label: "Serviços", icon: Briefcase },
      { to: "/fornecedores", label: "Fornecedores", icon: Building2 },
    ],
  },
  {
    title: "Operação",
    items: [
      { to: "/ordens-servico", label: "Ordens de Serviço", icon: Wrench },
      { to: "/caixa", label: "Caixa", icon: CreditCard },
      { to: "/vendas", label: "Vendas", icon: LayoutGrid },
      { to: "/financeiro", label: "Financeiro", icon: Wallet },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    title: "Administração",
    items: [
      { to: "/usuarios", label: "Usuários", icon: Shield },
      { to: "/configuracoes", label: "Configurações", icon: Settings },
      { to: "/planos", label: "Planos", icon: CreditCard },
    ],
  },
];

export default function Sidebar({ open = false, onClose }) {
  const { user } = useAuth();
  const allowedGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasRouteAccess(user, item.to)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className={`sidebar-modern ${open ? "open" : ""}`}>
      <div className="sidebar-modern-top">
        <div className="sidebar-brand-modern">
          <div className="sidebar-brand-badge">
            <Gauge size={18} />
          </div>
          <div>
            <strong>SOSPC Gestão</strong>
            <span>Painel multiempresa</span>
          </div>
        </div>

        <button
          type="button"
          className="sidebar-close-btn"
          aria-label="Fechar menu lateral"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className="sidebar-workspace-card">
        <div className="sidebar-workspace-label">Ambiente atual</div>
        <div className="sidebar-workspace-title">{user?.tenant_id ? `Tenant ${user.tenant_id}` : "Empresa ativa"}</div>
        <div className="sidebar-workspace-meta">Controle operacional, vendas e financeiro no mesmo painel.</div>
      </div>

      <nav className="sidebar-modern-nav">
        {allowedGroups.map((group) => (
          <div key={group.title} className="sidebar-group">
            <div className="sidebar-group-title">{group.title}</div>

            <div className="sidebar-group-links">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `sidebar-link-modern ${isActive ? "active" : ""}`
                    }
                  >
                    <span className="sidebar-link-icon">
                      <Icon size={17} />
                    </span>
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-user-modern">
        <div className="sidebar-user-avatar">
          <Users size={16} />
        </div>
        <div>
          <strong>{user?.name || "Usuário"}</strong>
          <span>{user?.role || "Perfil não informado"}</span>
        </div>
      </div>
    </aside>
  );
}
