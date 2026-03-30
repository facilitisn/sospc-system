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
          role: item.role || "Atendente",
          isActive: item.is_active ?? true,
          createdAt: item.created_at || "",
        }));

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
  }, [tenantId, toast]);

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

  function handleNew() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    setSelectedId(null);
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

    if (!["Administrador", "Técnico"].includes(user?.role)) {
      toast.warning("Seu usuário não tem permissão para salvar usuários.");
      return;
    }

    if (!form.name.trim() || !form.username.trim() || !form.password.trim()) {
      toast.warning("Preencha nome, usuário e senha.");
      return;
    }

    const duplicate = users.find(
      (item) =>
        item.id !== form.id &&
        String(item.username).trim().toLowerCase() ===
          String(form.username).trim().toLowerCase()
    );

    if (duplicate) {
      toast.warning("Já existe um usuário com esse login.");
      return;
    }

    const payload = {
      ...form,
      id: form.id || crypto.randomUUID(),
      tenant_id: tenantId,
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
  }

  async function handleDelete() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (user?.role !== "Administrador") {
      toast.warning("Somente o administrador pode gerenciar usuários.");
      return;
    }

    if (!selectedId) return;

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
        description="Gerencie acessos de administrador, atendente e técnico."
        action={
          <div className="header-actions">
            <Button variant="secondary" onClick={handleNew}>
              Novo usuário
            </Button>
            <Button onClick={handleSave}>Salvar usuário</Button>
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
                placeholder="Buscar por nome, usuário ou perfil..."
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
                      <span className={`pill ${item.isActive ? "pill-success" : "pill-danger"}`}>
                        {item.isActive ? "Ativo" : "Inativo"}
                      </span>
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
                description="Cadastre o primeiro usuário para começar."
              />
            )}
          </Card>
        </div>

        <div className="right-column">
          <Card
            title={selectedId ? "Editar usuário" : "Novo usuário"}
            action={
              <div className="header-actions">
                <Button variant="secondary" onClick={handleNew}>
                  Limpar
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  disabled={!selectedId || user?.role !== "Administrador"}
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
            </div>

            {activeTab === "dados" ? (
              <div className="user-form-stack">
                <label className="form-field">
                  <span>Nome</span>
                  <input
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                  />
                </label>

                <label className="form-field">
                  <span>Usuário</span>
                  <input
                    value={form.username}
                    onChange={(e) => updateField("username", e.target.value)}
                  />
                </label>

                <label className="form-field">
                  <span>Senha</span>
                  <input
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                  />
                </label>

                <label className="form-field">
                  <span>Perfil</span>
                  <select
                    value={form.role}
                    onChange={(e) => updateField("role", e.target.value)}
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
                    onChange={(e) => updateField("isActive", e.target.value === "true")}
                  >
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className="summary-grid">
                <div><strong>Nome:</strong> {form.name || "—"}</div>
                <div><strong>Usuário:</strong> {form.username || "—"}</div>
                <div><strong>Perfil:</strong> {form.role || "—"}</div>
                <div><strong>Status:</strong> {form.isActive ? "Ativo" : "Inativo"}</div>
                <div>
                  <strong>Cadastro:</strong>{" "}
                  {form.createdAt
                    ? new Date(form.createdAt).toLocaleDateString("pt-BR")
                    : "—"}
                </div>
              </div>
            )}
          </Card>

          <Card title="Acesso atual">
            <div className="summary-grid">
              <div><strong>Usuário logado:</strong> {user?.name || "—"}</div>
              <div><strong>Perfil:</strong> {user?.role || "—"}</div>
              <div><strong>Login:</strong> {user?.username || "—"}</div>
              <div><strong>Tenant:</strong> {tenantId || "—"}</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}