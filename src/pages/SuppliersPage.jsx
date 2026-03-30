import { useEffect, useMemo, useState } from "react";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/auth.jsx";

const emptyForm = {
  id: "",
  tenant_id: "",
  name: "",
  company_name: "",
  cpf_cnpj: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  notes: "",
  is_active: true,
  created_at: "",
  updated_at: "",
};

function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function formatPhone(value) {
  const d = onlyDigits(value);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

function formatCpfCnpj(value) {
  const d = onlyDigits(value);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function nullable(value) {
  const text = String(value || "").trim();
  return text ? text : null;
}

function Input({
  label,
  value,
  onChange,
  placeholder = "",
  disabled = false,
  type = "text",
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        type={type}
      />
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder = "" }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
      />
    </label>
  );
}

export default function SuppliersPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const toast = useToast();

  const [suppliers, setSuppliers] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [activeTab, setActiveTab] = useState("dados");

  useEffect(() => {
    async function fetchSuppliers() {
      if (!tenantId) {
        setSuppliers([]);
        setSelectedId(null);
        setForm(emptyForm);
        setIsLoaded(false);
        return;
      }

      try {
        setIsLoaded(false);

        const { data, error } = await supabase
          .from("suppliers")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Erro ao carregar fornecedores:", error);
          toast.error(
            `Erro ao carregar fornecedores: ${error.message || "desconhecido"}`
          );
          setSuppliers([]);
          return;
        }

        const mapped = (data || []).map((item) => ({
          id: item.id,
          tenant_id: item.tenant_id || tenantId,
          name: item.name || "",
          company_name: item.company_name || "",
          cpf_cnpj: item.cpf_cnpj || "",
          phone: item.phone || "",
          whatsapp: item.whatsapp || "",
          email: item.email || "",
          address: item.address || "",
          notes: item.notes || "",
          is_active: item.is_active ?? true,
          created_at: item.created_at || "",
          updated_at: item.updated_at || "",
        }));

        setSuppliers(mapped);
      } catch (error) {
        console.error("Erro ao carregar fornecedores:", error);
        toast.error("Erro ao carregar fornecedores.");
        setSuppliers([]);
      } finally {
        setIsLoaded(true);
      }
    }

    fetchSuppliers();
  }, [tenantId, toast]);

  const filteredSuppliers = useMemo(() => {
    const q = query.trim().toLowerCase();

    return [...suppliers]
      .filter((supplier) => {
        if (!q) return true;
        return [
          supplier.name,
          supplier.company_name,
          supplier.cpf_cnpj,
          supplier.phone,
          supplier.whatsapp,
          supplier.email,
          supplier.address,
          supplier.is_active ? "ativo" : "inativo",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [suppliers, query]);

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedId) || null,
    [suppliers, selectedId]
  );

  useEffect(() => {
    if (selectedSupplier) {
      setForm({ ...selectedSupplier });
    }
  }, [selectedSupplier]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleNew() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    setSelectedId(null);
    setActiveTab("dados");
    setForm({
      ...emptyForm,
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    toast.info("Formulário limpo para novo fornecedor.");
  }

  function handlePick(supplier) {
    setSelectedId(supplier.id);
    setForm({ ...supplier });
  }

  async function handleSave() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!normalizeText(form.name)) {
      toast.warning("Informe o nome do fornecedor.");
      return;
    }

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.warning("Informe um e-mail válido.");
      return;
    }

    const payload = {
      id: form.id || crypto.randomUUID(),
      tenant_id: tenantId,
      name: normalizeText(form.name),
      company_name: nullable(form.company_name),
      cpf_cnpj: nullable(onlyDigits(form.cpf_cnpj)),
      phone: nullable(onlyDigits(form.phone)),
      whatsapp: nullable(onlyDigits(form.whatsapp)),
      email: nullable(String(form.email || "").toLowerCase()),
      address: nullable(form.address),
      notes: nullable(form.notes),
      is_active: !!form.is_active,
      created_at: form.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("suppliers").upsert(payload);

    if (error) {
      console.error("Erro ao salvar fornecedor:", error);
      toast.error(
        `Erro ao salvar fornecedor: ${error.message || "desconhecido"}`
      );
      return;
    }

    const normalized = {
      ...payload,
      company_name: payload.company_name || "",
      cpf_cnpj: payload.cpf_cnpj || "",
      phone: payload.phone || "",
      whatsapp: payload.whatsapp || "",
      email: payload.email || "",
      address: payload.address || "",
      notes: payload.notes || "",
    };

    setSuppliers((prev) => {
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
    toast.success("Fornecedor salvo com sucesso.");
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm("Excluir este fornecedor?")) return;

    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    const { error } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", selectedId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Erro ao excluir fornecedor:", error);
      toast.error(
        `Erro ao excluir fornecedor: ${error.message || "desconhecido"}`
      );
      return;
    }

    setSuppliers((prev) => prev.filter((item) => item.id !== selectedId));
    handleNew();
    toast.success("Fornecedor excluído com sucesso.");
  }

  if (!tenantId || !isLoaded) {
    return (
      <div className="page-stack">
        <Card title="Fornecedores">Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Fornecedores"
        description="Cadastro de fornecedores, contatos, documento, endereço e observações."
        action={
          <div className="header-actions">
            <Button variant="secondary" onClick={handleNew}>
              Novo fornecedor
            </Button>
            <Button onClick={handleSave}>Salvar fornecedor</Button>
          </div>
        }
      />

      <div className="split-layout">
        <div className="left-column">
          <Card title="Lista de fornecedores">
            <div className="toolbar">
              <input
                className="toolbar-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, documento, telefone..."
              />
              <div className="toolbar-count">
                {filteredSuppliers.length} fornecedores
              </div>
            </div>

            {filteredSuppliers.length ? (
              <div className="client-list">
                {filteredSuppliers.map((supplier) => (
                  <button
                    type="button"
                    key={supplier.id}
                    onClick={() => handlePick(supplier)}
                    className={`client-list-item ${
                      selectedId === supplier.id ? "active" : ""
                    }`}
                  >
                    <div className="client-list-head">
                      <strong>{supplier.name || "Sem nome"}</strong>
                      <span
                        className={`pill ${
                          supplier.is_active ? "pill-success" : "pill-danger"
                        }`}
                      >
                        {supplier.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </div>

                    <div className="client-list-meta">
                      {supplier.company_name || "Sem razão social"}
                    </div>

                    <div className="client-list-meta">
                      {supplier.cpf_cnpj
                        ? formatCpfCnpj(supplier.cpf_cnpj)
                        : "Sem documento"}{" "}
                      •{" "}
                      {supplier.phone
                        ? formatPhone(supplier.phone)
                        : "Sem telefone"}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhum fornecedor encontrado"
                description="Cadastre seu primeiro fornecedor para começar."
              />
            )}
          </Card>
        </div>

        <div className="right-column">
          <Card
            title={selectedId ? "Editar fornecedor" : "Novo fornecedor"}
            action={
              <div className="header-actions">
                <Button variant="secondary" onClick={handleNew}>
                  Limpar
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  disabled={!selectedId}
                >
                  Excluir
                </Button>
              </div>
            }
          >
            <div className="supplier-tabs">
              <button
                type="button"
                className={`supplier-tab ${activeTab === "dados" ? "active" : ""}`}
                onClick={() => setActiveTab("dados")}
              >
                Dados
              </button>

              <button
                type="button"
                className={`supplier-tab ${activeTab === "endereco" ? "active" : ""}`}
                onClick={() => setActiveTab("endereco")}
              >
                Endereço
              </button>

              <button
                type="button"
                className={`supplier-tab ${activeTab === "obs" ? "active" : ""}`}
                onClick={() => setActiveTab("obs")}
              >
                Observações
              </button>

              <button
                type="button"
                className={`supplier-tab ${activeTab === "resumo" ? "active" : ""}`}
                onClick={() => setActiveTab("resumo")}
              >
                Resumo
              </button>
            </div>

            {activeTab === "dados" && (
              <div className="form-grid form-grid-2">
                <Input
                  label="Nome do fornecedor"
                  value={form.name}
                  onChange={(v) => updateField("name", v)}
                  placeholder="Ex: Distribuidora Tech"
                />
                <Input
                  label="Razão social"
                  value={form.company_name}
                  onChange={(v) => updateField("company_name", v)}
                  placeholder="Ex: Distribuidora Tech LTDA"
                />
                <Input
                  label="CPF/CNPJ"
                  value={formatCpfCnpj(form.cpf_cnpj)}
                  onChange={(v) => updateField("cpf_cnpj", v)}
                  placeholder="00.000.000/0000-00"
                />
                <Input
                  label="E-mail"
                  value={form.email}
                  onChange={(v) => updateField("email", v)}
                  placeholder="contato@fornecedor.com"
                />
                <Input
                  label="Telefone"
                  value={formatPhone(form.phone)}
                  onChange={(v) => updateField("phone", v)}
                  placeholder="(00) 00000-0000"
                />
                <Input
                  label="WhatsApp"
                  value={formatPhone(form.whatsapp)}
                  onChange={(v) => updateField("whatsapp", v)}
                  placeholder="(00) 00000-0000"
                />
                <label className="form-field">
                  <span>Status</span>
                  <select
                    value={form.is_active ? "Ativo" : "Inativo"}
                    onChange={(e) =>
                      updateField("is_active", e.target.value === "Ativo")
                    }
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </label>
              </div>
            )}

            {activeTab === "endereco" && (
              <TextArea
                label="Endereço"
                value={form.address}
                onChange={(v) => updateField("address", v)}
                placeholder="Rua, número, bairro, cidade, estado, CEP"
              />
            )}

            {activeTab === "obs" && (
              <TextArea
                label="Observações"
                value={form.notes}
                onChange={(v) => updateField("notes", v)}
                placeholder="Informações importantes sobre o fornecedor..."
              />
            )}

            {activeTab === "resumo" && (
              <div className="summary-grid">
                <div><strong>Fornecedor:</strong> {form.name || "—"}</div>
                <div><strong>Empresa:</strong> {form.company_name || "—"}</div>
                <div>
                  <strong>Documento:</strong>{" "}
                  {form.cpf_cnpj ? formatCpfCnpj(form.cpf_cnpj) : "—"}
                </div>
                <div>
                  <strong>Telefone:</strong>{" "}
                  {form.phone ? formatPhone(form.phone) : "—"}
                </div>
                <div>
                  <strong>WhatsApp:</strong>{" "}
                  {form.whatsapp ? formatPhone(form.whatsapp) : "—"}
                </div>
                <div><strong>E-mail:</strong> {form.email || "—"}</div>
                <div><strong>Status:</strong> {form.is_active ? "Ativo" : "Inativo"}</div>
                <div><strong>Cadastro:</strong> {formatDate(form.created_at)}</div>
                <div><strong>Atualização:</strong> {formatDate(form.updated_at)}</div>
                <div><strong>Endereço:</strong> {form.address || "—"}</div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}