import { Component } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import DashboardPage from "../pages/DashboardPage";
import ClientesPage from "../pages/ClientesPage";
import ProdutosPage from "../pages/ProdutosPage";
import ServicosPage from "../pages/ServicosPage";
import SuppliersPage from "../pages/SuppliersPage";
import OrdensServicoPage from "../pages/OrdensServicoPage";
import PublicOrderTrackingPage from "../pages/PublicOrderTrackingPage";
import PDVPage from "../pages/pdvpage";
import ConfiguracoesPage from "../pages/ConfiguracoesPage";
import RelatoriosPage from "../pages/RelatoriosPage";
import FinanceiroPage from "../pages/FinanceiroPage";
import LoginPage from "../pages/LoginPage";
import UsuariosPage from "../pages/UsuariosPage";
import VendasPage from "../pages/VendasPage.jsx";
import CaixaPage from "../pages/CaixaPage.jsx";
import CreateAccountPage from "../pages/CreateAccountPage.jsx";
import { AuthProvider, hasRouteAccess, useAuth } from "../auth/auth.jsx";

class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "Erro inesperado na página.",
    };
  }

  componentDidCatch(error) {
    console.error("Erro de rota capturado:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-stack">
          <section className="card">
            <div className="card-header card-header-vertical-mobile">
              <div className="card-header-copy">
                <h3>Falha ao carregar a página</h3>
                <p>{this.state.errorMessage}</p>
              </div>
            </div>
            <div style={{ padding: 16 }}>
              Recarregue a página. Se o erro persistir, faça login novamente.
            </div>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}

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
  "/login": "Login",
};

export function usePageTitle() {
  const location = useLocation();
  return TITLES[location.pathname] || "SOSPC";
}

function Protected({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
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
              <RouteErrorBoundary>
                <OrdensServicoPage />
              </RouteErrorBoundary>
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
        <Route path="/criar-conta" element={<CreateAccountPage />} />
        <Route
          path="/configuracoes"
          element={
            <RoleGate path="/configuracoes">
              <ConfiguracoesPage />
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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/acompanhar/os/:token" element={<PublicOrderTrackingPage />} />

          <Route
            path="/pdv"
            element={
              <Protected>
                <PDVPage />
              </Protected>
            }
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