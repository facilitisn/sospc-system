import { useEffect, useMemo, useState } from "react";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/auth.jsx";
import { supabase } from "../lib/supabase";

const emptyForm = {
  id: "",
  tenant_id: "",
  name: "",
  username: "",
  password: "",
  role: "Atendente",
  isActive: true,
  createdAt: "",
};

const ROLE_DESCRIPTIONS = {
  owner: "Acesso total ao sistema e à gestão da empresa.",
  Administrador: "Gerencia equipe, cadastros, financeiro e configurações.",
  Atendente: "Atende clientes, cria OS, opera caixa e vendas.",
  Técnico: "Consulta e atualiza ordens de serviço e execução técnica.",
};

const ROLE_ACCESS = {
  owner: ["Tudo", "Usuários", "Configurações", "Financeiro", "OS", "Relatórios"],
  Administrador: ["Usuários", "Configurações", "Financeiro", "OS", "Relatórios"],
  Atendente: ["Clientes", "PDV", "Caixa", "OS", "Vendas"],
  Técnico: ["OS", "Serviços", "Relatórios"],
};

function normalizeRole(value) {
  return value === "owner" ? "owner" : value || "Atendente";
}

export default function UsuariosPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("dados");
  const [isSaving, setIsSaving] = useState(false);

  const canManageUsers = ["owner", "Administrador"].includes(user?.role);

  useEffect(() => {
    async function fetchUsers() {
      if (!tenantId) {
        setUsers([]);
        setSelectedId(null);
        setForm(emptyForm);
        setIsLoaded(false);
        return;
      }

      try {
        setIsLoaded(false);

        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Erro ao carregar usuários:", error);
          toast.error(`Erro ao carregar usuários: ${error.message || "desconhecido"}`);
          setUsers([]);
          return;
        }

        const mapped = (data || []).map((item) => ({
          id: item.id,
          tenant_id: item.tenant_id || tenantId,
          name: item.name || "",
          username: item.username || "",
          password: item.password || "",
          role: normalizeRole(item.role),
          isActive: item.is_active ?? true,
          createdAt: item.created_at || "",
        }));

        if (user?.id && user?.role === "owner") {
          const ownerAlreadyInList = mapped.some((item) => item.id === user.id);
          if (!ownerAlreadyInList) {
            mapped.unshift({
              id: user.id,
              tenant_id: tenantId,
              name: user.name || "",
              username: user.username || user.email || "",
              password: "",
              role: "owner",
              isActive: true,
              createdAt: "",
            });
          }
        }

        setUsers(mapped);
      } catch (error) {
        console.error("Erro ao carregar usuários:", error);
        toast.error("Erro ao carregar usuários.");
        setUsers([]);
      } finally {
        setIsLoaded(true);
      }
    }

    fetchUsers();
  }, [tenantId, toast, user?.id, user?.role, user?.name, user?.username, user?.email]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return [...users]
      .filter(
        (item) =>
          !q ||
          [item.name, item.username, item.role]
            .join(" ")
            .toLowerCase()
            .includes(q)
      )
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [users, query]);

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedId) || null,
    [users, selectedId]
  );

  const adminCount = useMemo(
    () => users.filter((item) => ["owner", "Administrador"].includes(item.role) && item.isActive).length,
    [users]
  );

  function handleNew() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!canManageUsers) {
      toast.warning("Somente owner ou administrador podem gerenciar usuários.");
      return;
    }

    setSelectedId(null);
    setActiveTab("dados");
    setForm({
      ...emptyForm,
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      createdAt: new Date().toISOString(),
      isActive: true,
      role: "Atendente",
    });
    toast.info("Formulário limpo para novo usuário.");
  }

  function handlePick(item) {
    setSelectedId(item.id);
    setForm(item);
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!canManageUsers) {
      toast.warning("Somente owner ou administrador podem salvar usuários.");
      return;
    }

    if (form.role === "owner") {
      toast.warning("O perfil owner é reservado para a conta principal da empresa.");
      return;
    }

    const normalizedUsername = String(form.username || "").trim().toLowerCase();

    if (!form.name.trim() || !normalizedUsername || !form.password.trim()) {
      toast.warning("Preencha nome, login e senha.");
      return;
    }

    if (!["Administrador", "Atendente", "Técnico"].includes(form.role)) {
      toast.warning("Selecione um perfil válido.");
      return;
    }

    setIsSaving(true);

    try {
      const { data: existingUsers, error: duplicateError } = await supabase
        .from("users")
        .select("id, username")
        .ilike("username", normalizedUsername);

      if (duplicateError) {
        console.error("Erro ao validar login:", duplicateError);
        toast.error(`Erro ao validar login: ${duplicateError.message || "desconhecido"}`);
        return;
      }

      const duplicate = (existingUsers || []).find(
        (item) =>
          item.id !== form.id &&
          String(item.username || "").trim().toLowerCase() === normalizedUsername
      );

      if (duplicate) {
        toast.warning("Já existe um usuário com esse login. Use um login único, de preferência o e-mail.");
        return;
      }

      const payload = {
        ...form,
        id: form.id || crypto.randomUUID(),
        tenant_id: tenantId,
        username: normalizedUsername,
        role: normalizeRole(form.role),
        createdAt: form.createdAt || new Date().toISOString(),
      };

      const { error } = await supabase.from("users").upsert({
        id: payload.id,
        tenant_id: tenantId,
        name: payload.name,
        username: payload.username,
        password: payload.password,
        role: payload.role,
        is_active: payload.isActive,
        created_at: payload.createdAt,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error("Erro ao salvar usuário:", error);
        toast.error(`Erro ao salvar usuário: ${error.message || "desconhecido"}`);
        return;
      }

      setUsers((prev) => {
        const index = prev.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          const copy = [...prev];
          copy[index] = payload;
          return copy;
        }
        return [payload, ...prev];
      });

      setSelectedId(payload.id);
      setForm(payload);
      toast.success("Usuário salvo com sucesso.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!canManageUsers) {
      toast.warning("Somente owner ou administrador podem excluir usuários.");
      return;
    }

    if (!selectedId) return;

    if (selectedUser?.role === "owner") {
      toast.warning("O owner principal da empresa não pode ser excluído.");
      return;
    }

    if (form.username === "admin") {
      toast.warning("O usuário admin padrão não pode ser excluído.");
      return;
    }

    if (form.id === user?.id) {
      toast.warning("Você não pode excluir o usuário que está logado.");
      return;
    }

    if (!window.confirm("Excluir este usuário?")) return;

    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", selectedId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Erro ao excluir usuário:", error);
      toast.error(`Erro ao excluir usuário: ${error.message || "desconhecido"}`);
      return;
    }

    setUsers((prev) => prev.filter((item) => item.id !== selectedId));
    handleNew();
    toast.success("Usuário excluído com sucesso.");
  }

  function handleToggleActive(nextValue) {
    if (form.id === user?.id && nextValue === false) {
      toast.warning("Você não pode inativar o usuário que está logado.");
      return;
    }

    if (["owner", "Administrador"].includes(form.role) && nextValue === false && adminCount <= 1) {
      toast.warning("É necessário manter pelo menos um owner ou administrador ativo.");
      return;
    }

    updateField("isActive", nextValue);
  }

  if (!tenantId || !isLoaded) {
    return (
      <div className="page-stack">
        <Card title="Usuários">Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Usuários"
        description="Gerencie acessos de administrador, atendente e técnico da sua empresa."
        action={
          <div className="header-actions">
            <Button variant="secondary" onClick={handleNew} disabled={!canManageUsers}>
              Novo usuário
            </Button>
            <Button onClick={handleSave} disabled={!canManageUsers || isSaving}>
              {isSaving ? "Salvando..." : "Salvar usuário"}
            </Button>
          </div>
        }
      />

      <div className="split-layout">
        <div className="left-column">
          <Card title="Lista de usuários">
            <div className="toolbar">
              <input
                className="toolbar-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, login ou perfil..."
              />
              <div className="toolbar-count">{filtered.length} usuários</div>
            </div>

            {filtered.length ? (
              <div className="client-list">
                {filtered.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => handlePick(item)}
                    className={`client-list-item ${selectedId === item.id ? "active" : ""}`}
                  >
                    <div className="client-list-head">
                      <strong>{item.name}</strong>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {item.role === "owner" ? (
                          <span className="pill pill-success">Owner</span>
                        ) : null}
                        <span className={`pill ${item.isActive ? "pill-success" : "pill-danger"}`}>
                          {item.isActive ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </div>
                    <div className="client-list-meta">
                      {item.username} • {item.role}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhum usuário encontrado"
                description="Cadastre o primeiro usuário da equipe para começar."
              />
            )}
          </Card>
        </div>

        <div className="right-column">
          <Card
            title={selectedId ? "Editar usuário" : "Novo usuário"}
            action={
              <div className="header-actions">
                <Button variant="secondary" onClick={handleNew} disabled={!canManageUsers}>
                  Limpar
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  disabled={!selectedId || !canManageUsers}
                >
                  Excluir
                </Button>
              </div>
            }
          >
            <div className="user-tabs">
              <button
                type="button"
                className={`user-tab ${activeTab === "dados" ? "active" : ""}`}
                onClick={() => setActiveTab("dados")}
              >
                Dados
              </button>
              <button
                type="button"
                className={`user-tab ${activeTab === "resumo" ? "active" : ""}`}
                onClick={() => setActiveTab("resumo")}
              >
                Resumo
              </button>
              <button
                type="button"
                className={`user-tab ${activeTab === "permissoes" ? "active" : ""}`}
                onClick={() => setActiveTab("permissoes")}
              >
                Permissões
              </button>
            </div>

            {activeTab === "dados" ? (
              <div className="user-form-stack">
                <label className="form-field">
                  <span>Nome</span>
                  <input
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    disabled={!canManageUsers || form.role === "owner"}
                  />
                </label>

                <label className="form-field">
                  <span>Login (use e-mail para evitar conflito entre empresas)</span>
                  <input
                    value={form.username}
                    onChange={(e) => updateField("username", e.target.value)}
                    disabled={!canManageUsers || form.role === "owner"}
                  />
                </label>

                <label className="form-field">
                  <span>Senha</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    disabled={!canManageUsers || form.role === "owner"}
                    placeholder={form.role === "owner" ? "Gerenciada pelo owner principal" : ""}
                  />
                </label>

                <label className="form-field">
                  <span>Perfil</span>
                  <select
                    value={form.role}
                    onChange={(e) => updateField("role", e.target.value)}
                    disabled={!canManageUsers || form.role === "owner"}
                  >
                    <option value="Administrador">Administrador</option>
                    <option value="Atendente">Atendente</option>
                    <option value="Técnico">Técnico</option>
                  </select>
                </label>

                <label className="form-field">
                  <span>Status</span>
                  <select
                    value={String(form.isActive)}
                    onChange={(e) => handleToggleActive(e.target.value === "true")}
                    disabled={!canManageUsers || form.role === "owner"}
                  >
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </label>

                {form.role === "owner" ? (
                  <div className="pill pill-success" style={{ marginTop: 8 }}>
                    Conta principal da empresa. Esse acesso deve ser preservado.
                  </div>
                ) : null}
              </div>
            ) : activeTab === "resumo" ? (
              <div className="summary-grid">
                <div><strong>Nome:</strong> {form.name || "—"}</div>
                <div><strong>Login:</strong> {form.username || "—"}</div>
                <div><strong>Perfil:</strong> {form.role || "—"}</div>
                <div><strong>Status:</strong> {form.isActive ? "Ativo" : "Inativo"}</div>
                <div>
                  <strong>Cadastro:</strong>{" "}
                  {form.createdAt
                    ? new Date(form.createdAt).toLocaleDateString("pt-BR")
                    : "—"}
                </div>
              </div>
            ) : (
              <div className="summary-grid">
                <div style={{ gridColumn: "1 / -1" }}>
                  <strong>{form.role || "Perfil"}</strong>
                  <div style={{ marginTop: 6, color: "var(--muted, #64748b)" }}>
                    {ROLE_DESCRIPTIONS[form.role] || "Sem descrição."}
                  </div>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <strong>Acessos principais</strong>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    {(ROLE_ACCESS[form.role] || []).map((label) => (
                      <span key={label} className="pill pill-success">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card title="Acesso atual">
            <div className="summary-grid">
              <div><strong>Usuário logado:</strong> {user?.name || "—"}</div>
              <div><strong>Perfil:</strong> {user?.role || "—"}</div>
              <div><strong>Login:</strong> {user?.username || user?.email || "—"}</div>
              <div><strong>Tenant:</strong> {tenantId || "—"}</div>
            </div>

            <div style={{ marginTop: 12, fontSize: 14, color: "var(--muted, #64748b)" }}>
              Somente <strong>owner</strong> e <strong>Administrador</strong> podem criar, editar e excluir usuários.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}