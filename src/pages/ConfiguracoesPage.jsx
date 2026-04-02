import { useEffect, useState } from "react";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { exportBackup, importBackup } from "../utils/backup";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/auth.jsx";

const defaultSettings = {
  companyName: "SOSPC",
  fantasyName: "",
  cnpj: "",
  address: "",
  phone: "",
  whatsapp: "",
  email: "",
  footerText: "Obrigado pela preferência!",
  osPrefix: "",
  acceptedPayments: ["Dinheiro", "Pix", "Crédito", "Débito", "Outros"],
  companyLogoDataUrl: "",
};

function Input({ label, value, onChange, placeholder = "" }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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

export default function ConfiguracoesPage() {
  const toast = useToast();
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const [backupInputKey, setBackupInputKey] = useState(0);
  const [settings, setSettings] = useState(defaultSettings);
  const [paymentsText, setPaymentsText] = useState(
    defaultSettings.acceptedPayments.join(", ")
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("empresa");

  useEffect(() => {
    async function loadSettings() {
      if (!tenantId) {
        setIsLoaded(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("tenant_settings")
          .select("*")
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (error) {
          console.error("Erro ao carregar configurações:", error);
          toast.error(
            `Erro ao carregar configurações: ${error.message || "desconhecido"}`
          );
          return;
        }

        if (!data) {
          setSettings(defaultSettings);
          setPaymentsText(defaultSettings.acceptedPayments.join(", "));
          return;
        }

        const normalized = {
          companyName: data.company_name || "SOSPC",
          fantasyName: data.fantasy_name || "",
          cnpj: data.cnpj || "",
          address: data.address || "",
          phone: data.phone || "",
          whatsapp: data.whatsapp || "",
          email: data.email || "",
          footerText: data.footer_text || "Obrigado pela preferência!",
          osPrefix: data.os_prefix || "",
          acceptedPayments: Array.isArray(data.accepted_payments)
            ? data.accepted_payments
            : defaultSettings.acceptedPayments,
          companyLogoDataUrl: data.company_logo_data_url || "",
        };

        setSettings(normalized);
        setPaymentsText((normalized.acceptedPayments || []).join(", "));
      } catch (error) {
        console.error("Erro ao carregar configurações:", error);
        toast.error("Erro ao carregar configurações.");
      } finally {
        setIsLoaded(true);
      }
    }

    loadSettings();
  }, [tenantId, toast]);

  function updateField(field, value) {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }

  function handleLogo(file) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.warning("Selecione um arquivo de imagem válido.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setSettings((prev) => ({
        ...prev,
        companyLogoDataUrl: typeof reader.result === "string" ? reader.result : "",
      }));
      toast.success("Logo carregada com sucesso.");
    };

    reader.onerror = () => {
      toast.error("Não foi possível carregar a logo.");
    };

    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    setIsSaving(true);

    try {
      const normalized = {
        ...settings,
        acceptedPayments: paymentsText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };

      const { error } = await supabase
        .from("tenant_settings")
        .upsert(
          {
            tenant_id: tenantId,
            company_name: normalized.companyName,
            fantasy_name: normalized.fantasyName || null,
            cnpj: normalized.cnpj || null,
            address: normalized.address || null,
            phone: normalized.phone || null,
            whatsapp: normalized.whatsapp || null,
            email: normalized.email || null,
            footer_text: normalized.footerText || null,
            os_prefix: normalized.osPrefix || null,
            accepted_payments: normalized.acceptedPayments,
            company_logo_data_url: normalized.companyLogoDataUrl || null,
          },
          {
            onConflict: "tenant_id",
          }
        );

      if (error) {
        console.error("Erro ao salvar configurações:", error);
        toast.error(
          `Erro ao salvar configurações: ${error.message || "desconhecido"}`
        );
        return;
      }

      setSettings(normalized);
      setPaymentsText(normalized.acceptedPayments.join(", "));
      toast.success("Configurações salvas com sucesso.");
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      toast.error("Erro ao salvar configurações.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleRemoveLogo() {
    updateField("companyLogoDataUrl", "");
    toast.info("Logo removida.");
  }

  function handleExportBackup() {
    try {
      exportBackup(tenantId);
      toast.success("Backup exportado com sucesso.");
    } catch (error) {
      console.error("Erro ao exportar backup:", error);
      toast.error(error.message || "Erro ao exportar backup.");
    }
  }

  async function handleImportBackup(file) {
    if (!file) return;

    try {
      await importBackup(file, tenantId);
      setBackupInputKey((v) => v + 1);
      toast.success(
        "Backup importado com sucesso. Recarregue a página para atualizar os dados."
      );
    } catch (error) {
      console.error("Erro ao importar backup:", error);
      setBackupInputKey((v) => v + 1);
      toast.error(error.message || "Erro ao importar backup.");
    }
  }

  if (!tenantId || !isLoaded) {
    return (
      <div className="page-stack">
        <Card title="Configurações">Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Configurações"
        description="Dados da empresa usados no sistema e nos documentos."
        action={
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar configurações"}
          </Button>
        }
      />

      <div className="config-tabs">
        <button
          type="button"
          className={`config-tab ${activeTab === "empresa" ? "active" : ""}`}
          onClick={() => setActiveTab("empresa")}
        >
          Empresa
        </button>
        <button
          type="button"
          className={`config-tab ${activeTab === "logo" ? "active" : ""}`}
          onClick={() => setActiveTab("logo")}
        >
          Logo
        </button>
        <button
          type="button"
          className={`config-tab ${activeTab === "documentos" ? "active" : ""}`}
          onClick={() => setActiveTab("documentos")}
        >
          Documentos
        </button>
        <button
          type="button"
          className={`config-tab ${activeTab === "backup" ? "active" : ""}`}
          onClick={() => setActiveTab("backup")}
        >
          Backup
        </button>
        <button
          type="button"
          className={`config-tab ${activeTab === "resumo" ? "active" : ""}`}
          onClick={() => setActiveTab("resumo")}
        >
          Resumo
        </button>
      </div>

      {activeTab === "empresa" && (
        <Card title="Empresa">
          <div className="form-grid form-grid-2">
            <Input
              label="Nome da empresa"
              value={settings.companyName}
              onChange={(v) => updateField("companyName", v)}
            />
            <Input
              label="Nome fantasia"
              value={settings.fantasyName}
              onChange={(v) => updateField("fantasyName", v)}
            />
            <Input
              label="CNPJ"
              value={settings.cnpj}
              onChange={(v) => updateField("cnpj", v)}
            />
            <Input
              label="Telefone"
              value={settings.phone}
              onChange={(v) => updateField("phone", v)}
            />
            <Input
              label="WhatsApp"
              value={settings.whatsapp}
              onChange={(v) => updateField("whatsapp", v)}
            />
            <Input
              label="E-mail"
              value={settings.email}
              onChange={(v) => updateField("email", v)}
            />
            <Input
              label="Endereço"
              value={settings.address}
              onChange={(v) => updateField("address", v)}
            />
            <Input
              label="Prefixo da OS"
              value={settings.osPrefix}
              onChange={(v) => updateField("osPrefix", v)}
              placeholder="Ex: SOS-"
            />
          </div>
        </Card>
      )}

      {activeTab === "logo" && (
        <Card title="Logo e identidade visual">
          <div className="form-grid">
            <label className="form-field">
              <span>Logo da empresa</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleLogo(e.target.files?.[0])}
              />
            </label>

            {settings.companyLogoDataUrl ? (
              <div className="logo-preview-wrap">
                <img
                  src={settings.companyLogoDataUrl}
                  alt="Logo da empresa"
                  className="logo-preview"
                />
                <Button variant="danger" onClick={handleRemoveLogo}>
                  Remover logo
                </Button>
              </div>
            ) : (
              <EmptyState
                title="Sem logo"
                description="Envie uma imagem PNG ou JPG para usar no sistema e no PDF."
              />
            )}
          </div>
        </Card>
      )}

      {activeTab === "documentos" && (
        <Card title="Documentos e pagamentos">
          <div className="form-grid">
            <TextArea
              label="Texto de rodapé"
              value={settings.footerText}
              onChange={(v) => updateField("footerText", v)}
              placeholder="Mensagem exibida no final do PDF"
            />
            <TextArea
              label="Formas de pagamento aceitas"
              value={paymentsText}
              onChange={setPaymentsText}
              placeholder="Separar por vírgula. Ex: Dinheiro, Pix, Crédito"
            />
          </div>
        </Card>
      )}

      {activeTab === "backup" && (
        <Card title="Backup do sistema">
          <div className="form-grid">
            <div className="header-actions">
              <Button onClick={handleExportBackup}>Exportar backup</Button>

              <label
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}
              >
                Importar backup
                <input
                  key={backupInputKey}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: "none" }}
                  onChange={(e) => handleImportBackup(e.target.files?.[0])}
                />
              </label>
            </div>

            <div className="empty-inline">
              Exporte um arquivo JSON com clientes, produtos, ordens de serviço, vendas e configurações.
            </div>
          </div>
        </Card>
      )}

      {activeTab === "resumo" && (
        <Card title="Resumo atual">
          <div className="summary-grid">
            <div><strong>Empresa:</strong> {settings.companyName || "—"}</div>
            <div><strong>Fantasia:</strong> {settings.fantasyName || "—"}</div>
            <div><strong>CNPJ:</strong> {settings.cnpj || "—"}</div>
            <div><strong>Telefone:</strong> {settings.phone || "—"}</div>
            <div><strong>WhatsApp:</strong> {settings.whatsapp || "—"}</div>
            <div><strong>E-mail:</strong> {settings.email || "—"}</div>
            <div><strong>Prefixo OS:</strong> {settings.osPrefix || "—"}</div>
          </div>
        </Card>
      )}
    </div>
  );
}