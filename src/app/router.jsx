import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import DashboardPage from "../pages/DashboardPage";
import ClientesPage from "../pages/ClientesPage";
import ProdutosPage from "../pages/ProdutosPage";
import ServicosPage from "../pages/ServicosPage";
import SuppliersPage from "../pages/SuppliersPage";
import OrdensServicoPage from "../pages/OrdensServicoPage";
import PDVPage from "../pages/pdvpage";
import ConfiguracoesPage from "../pages/ConfiguracoesPage";
import RelatoriosPage from "../pages/RelatoriosPage";
import FinanceiroPage from "../pages/FinanceiroPage";
import LoginPage from "../pages/LoginPage";
import UsuariosPage from "../pages/UsuariosPage";
import VendasPage from "../pages/VendasPage.jsx";
import CaixaPage from "../pages/CaixaPage.jsx";
import PublicOrderTrackingPage from "../pages/PublicOrderTrackingPage";
import CreateAccountPage from "../pages/CreateAccountPage";
import PlanosPage from "../pages/PlanosPage";
import { AuthProvider, hasRouteAccess, isTenantAccessAllowed, useAuth } from "../auth/auth.jsx";
import LoadingState from "../components/ui/LoadingState";

const TITLES = {
  "/": "Dashboard",
  "/clientes": "Clientes",
  "/produtos": "Produtos",
  "/servicos": "Serviços",
  "/ordens-servico": "Ordens de Serviço",
  "/pdv": "PDV",
  "/relatorios": "Relatórios",
  "/financeiro": "Financeiro / Fluxo de Caixa",
  "/usuarios": "Usuários",
  "/configuracoes": "Configurações",
  "/planos": "Planos",
  "/login": "Login",
  "/criar-conta": "Criar conta",
};

export function usePageTitle() {
  const location = useLocation();

  if (location.pathname.startsWith("/acompanhar/os/")) {
    return "Acompanhar Ordem de Serviço";
  }

  return TITLES[location.pathname] || "SOSPC";
}

function Protected({ children }) {
  const { isAuthenticated, isBootstrapped, tenantSubscription, user } = useAuth();
  const location = useLocation();
  const isPlanRoute = location.pathname === "/planos";
  const requiresSubscriptionCheck = ["owner", "Administrador"].includes(user?.role);
  const canAccessSystem = requiresSubscriptionCheck
    ? isTenantAccessAllowed(tenantSubscription)
    : true;

  if (!isBootstrapped) {
    return (
      <div className="page-stack">
        <LoadingState title="Validando acesso" description="Estamos confirmando sua sessão e permissões." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessSystem && !isPlanRoute) {
    return <Navigate to="/planos" replace />;
  }

  return children;
}

function PublicOnly({ children }) {
  const { isAuthenticated, isBootstrapped } = useAuth();

  if (!isBootstrapped) {
    return (
      <div className="page-stack">
        <LoadingState title="Preparando login" description="Só mais um instante para liberar o acesso." />
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/" replace /> : children;
}

function RoleGate({ path, children }) {
  const { user } = useAuth();
  return hasRouteAccess(user, path) ? children : <Navigate to="/" replace />;
}

function PrivateLayout() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />

        <Route
          path="/clientes"
          element={
            <RoleGate path="/clientes">
              <ClientesPage />
            </RoleGate>
          }
        />

        <Route
          path="/produtos"
          element={
            <RoleGate path="/produtos">
              <ProdutosPage />
            </RoleGate>
          }
        />

        <Route
          path="/servicos"
          element={
            <RoleGate path="/servicos">
              <ServicosPage />
            </RoleGate>
          }
        />

        <Route path="/fornecedores" element={<SuppliersPage />} />

        <Route
          path="/ordens-servico"
          element={
            <RoleGate path="/ordens-servico">
              <OrdensServicoPage />
            </RoleGate>
          }
        />

        <Route
          path="/financeiro"
          element={
            <RoleGate path="/financeiro">
              <FinanceiroPage />
            </RoleGate>
          }
        />

        <Route
          path="/relatorios"
          element={
            <RoleGate path="/relatorios">
              <RelatoriosPage />
            </RoleGate>
          }
        />

        <Route
          path="/usuarios"
          element={
            <RoleGate path="/usuarios">
              <UsuariosPage />
            </RoleGate>
          }
        />

        <Route path="/vendas" element={<VendasPage />} />
        <Route path="/caixa" element={<CaixaPage />} />

        <Route
          path="/planos"
          element={
            <RoleGate path="/planos">
              <PlanosPage />
            </RoleGate>
          }
        />

        <Route
          path="/configuracoes"
          element={
            <RoleGate path="/configuracoes">
              <ConfiguracoesPage />
            </RoleGate>
          }
        />

        <Route
          path="/pdv"
          element={
            <RoleGate path="/pdv">
              <PDVPage />
            </RoleGate>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function AppRouter() {
  return (
    <AuthProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnly>
                <LoginPage />
              </PublicOnly>
            }
          />

          <Route
            path="/criar-conta"
            element={
              <PublicOnly>
                <CreateAccountPage />
              </PublicOnly>
            }
          />

          <Route
            path="/acompanhar/os/:token"
            element={<PublicOrderTrackingPage />}
          />

          <Route
            path="/*"
            element={
              <Protected>
                <PrivateLayout />
              </Protected>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
