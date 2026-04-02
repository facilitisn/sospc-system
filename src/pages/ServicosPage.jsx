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
  description: "",
  isActive: true,
  createdAt: "",
};

export default function ServicosPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const toast = useToast();

  const [services, setServices] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("dados");

  useEffect(() => {
    async function fetchServices() {
      if (!tenantId) {
        setServices([]);
        setSelectedId(null);
        setForm(emptyForm);
        setIsLoaded(false);
        return;
      }

      try {
        setIsLoaded(false);

        const { data, error } = await supabase
          .from("services")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Erro ao carregar serviços:", error);
          toast.error(`Erro ao carregar serviços: ${error.message || "desconhecido"}`);
          setServices([]);
          return;
        }

        const mapped = (data || []).map((item) => ({
          id: item.id,
          tenant_id: item.tenant_id || tenantId,
          name: item.name || "",
          description: item.description || "",
          isActive: item.is_active ?? true,
          createdAt: item.created_at || "",
        }));

        setServices(mapped);
      } catch (error) {
        console.error("Erro ao carregar serviços:", error);
        toast.error("Erro ao carregar serviços.");
        setServices([]);
      } finally {
        setIsLoaded(true);
      }
    }

    fetchServices();
  }, [tenantId, toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return [...services]
      .filter((item) => {
        if (!q) return true;
        return [item.name, item.description].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [services, query]);

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
    });
    toast.info("Formulário limpo para novo serviço.");
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

    if (!form.name.trim()) {
      toast.warning("Informe o nome do serviço.");
      return;
    }

    const duplicate = services.find(
      (item) =>
        item.id !== form.id &&
        String(item.name).trim().toLowerCase() === String(form.name).trim().toLowerCase()
    );

    if (duplicate) {
      toast.warning("Já existe um serviço com esse nome.");
      return;
    }

    const payload = {
      ...form,
      id: form.id || crypto.randomUUID(),
      tenant_id: tenantId,
      createdAt: form.createdAt || new Date().toISOString(),
    };

    const { error } = await supabase.from("services").upsert({
      id: payload.id,
      tenant_id: tenantId,
      name: payload.name,
      description: payload.description || null,
      is_active: payload.isActive,
      created_at: payload.createdAt,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Erro ao salvar serviço:", error);
      toast.error(`Erro ao salvar serviço: ${error.message || "desconhecido"}`);
      return;
    }

    const normalized = {
      ...payload,
      description: payload.description || "",
    };

    setServices((prev) => {
      const index = prev.findIndex((item) => item.id === normalized.id);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = normalized;
        return copy;
      }
      return [normalized, ...prev];
    });

    setSelectedId(normalized.id);
    setForm(normalized);
    toast.success("Serviço salvo com sucesso.");
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm("Excluir este serviço?")) return;

    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    const { error } = await supabase
      .from("services")
      .delete()
      .eq("id", selectedId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Erro ao excluir serviço:", error);
      toast.error(`Erro ao excluir serviço: ${error.message || "desconhecido"}`);
      return;
    }

    setServices((prev) => prev.filter((item) => item.id !== selectedId));
    handleNew();
    toast.success("Serviço excluído com sucesso.");
  }

  if (!tenantId || !isLoaded) {
    return (
      <div className="page-stack">
        <Card title="Serviços">Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Serviços"
        description="Cadastre serviços para usar na OS, venda direta e PDV."
      />

      <div className="split-layout">
        <div className="left-column">
          <Card
            title="Lista de serviços"
            action={
              <Button variant="secondary" onClick={handleNew}>
                Novo serviço
              </Button>
            }
          >
            <div className="toolbar">
              <input
                className="toolbar-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome ou descrição..."
              />
              <div className="toolbar-count">{filtered.length} serviços</div>
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
                      {item.description || "Sem descrição"}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhum serviço encontrado"
                description="Cadastre o primeiro serviço para começar."
              />
            )}
          </Card>
        </div>

        <div className="right-column">
          <Card
            title={selectedId ? "Editar serviço" : "Novo serviço"}
            action={
              <div className="header-actions">
                <Button variant="secondary" onClick={handleNew}>
                  Limpar
                </Button>
                <Button onClick={handleSave}>Salvar</Button>
                <Button variant="danger" onClick={handleDelete} disabled={!selectedId}>
                  Excluir
                </Button>
              </div>
            }
          >
            <div className="service-tabs">
              <button
                type="button"
                className={`service-tab ${activeTab === "dados" ? "active" : ""}`}
                onClick={() => setActiveTab("dados")}
              >
                Dados
              </button>
              <button
                type="button"
                className={`service-tab ${activeTab === "resumo" ? "active" : ""}`}
                onClick={() => setActiveTab("resumo")}
              >
                Resumo
              </button>
            </div>

            {activeTab === "dados" ? (
              <div className="service-form-stack">
                <label className="form-field">
                  <span>Nome do serviço</span>
                  <input
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="Ex: Assistência Técnica TV's"
                  />
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

                <label className="form-field">
                  <span>Descrição</span>
                  <textarea
                    rows={6}
                    value={form.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    placeholder="Descreva o serviço..."
                  />
                </label>
              </div>
            ) : (
              <div className="summary-grid">
                <div><strong>Nome:</strong> {form.name || "—"}</div>
                <div><strong>Status:</strong> {form.isActive ? "Ativo" : "Inativo"}</div>
                <div>
                  <strong>Cadastro:</strong>{" "}
                  {form.createdAt
                    ? new Date(form.createdAt).toLocaleDateString("pt-BR")
                    : "—"}
                </div>
                <div><strong>Descrição:</strong> {form.description || "Sem descrição"}</div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}