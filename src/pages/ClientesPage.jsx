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
  tipo: "PF",
  nome: "",
  nomeFantasia: "",
  cpfCnpj: "",
  rgIe: "",
  telefone1: "",
  telefone2: "",
  whatsapp: "",
  email: "",
  cep: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  observacoes: "",
  createdAt: "",
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

function getOSNumber(os) {
  if (!os) return "—";

  return (
    os.osNumber ||
    os.numeroOS ||
    os.numero ||
    os.numeroOs ||
    os.osNumero ||
    os.codigo ||
    os.codigoOS ||
    os.ordemNumero ||
    os.numero_ordem ||
    "—"
  );
}

function getOSEquipment(os) {
  if (!os) return "—";

  const composedEquipment = [os.equipmentType, os.equipmentBrand, os.equipmentModel]
    .filter(Boolean)
    .join(" / ");

  return (
    composedEquipment ||
    os.equipamento ||
    os.aparelho ||
    os.produto ||
    os.dispositivo ||
    os.nomeEquipamento ||
    os.tipoEquipamento ||
    os.modelo ||
    "—"
  );
}

function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const clean = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function getSaleNumber(sale) {
  if (!sale) return "—";

  return (
    sale.number ||
    sale.numero ||
    sale.saleNumber ||
    sale.codigo ||
    sale.codigoVenda ||
    sale.vendaNumero ||
    sale.numeroVenda ||
    sale.id ||
    "—"
  );
}

function getSaleTotal(sale) {
  if (!sale) return 0;

  if (sale.total != null) return parseMoney(sale.total);
  if (sale.valorTotal != null) return parseMoney(sale.valorTotal);
  if (sale.amount != null) return parseMoney(sale.amount);

  return (sale.items || []).reduce((sum, item) => {
    const qty = Number(String(item?.qty || 0).replace(",", "."));
    const unitValue = parseMoney(item?.unitValue);
    return sum + (Number.isFinite(qty) ? qty : 0) * unitValue;
  }, 0);
}

function getReceivableDescription(receivable) {
  if (!receivable) return "—";
  return receivable.description || receivable.descricao || receivable.title || receivable.nome || "—";
}

function getReceivableDueDate(receivable) {
  if (!receivable) return "";
  return receivable.dueDate || receivable.vencimento || receivable.dataVencimento || receivable.date || "";
}

function getReceivableRemaining(receivable) {
  if (!receivable) return 0;
  return parseMoney(
    receivable.remainingAmount ??
      receivable.remaining_amount ??
      receivable.restante ??
      receivable.saldoAberto ??
      receivable.amount ??
      0
  );
}

function Input({ label, value, onChange, placeholder = "", disabled = false }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function matchesClient(record, cliente) {
  const clientIdCandidates = [
    record?.clienteId,
    record?.clientId,
    record?.idCliente,
    record?.customerId,
    record?.client_id,
  ];

  const clientNameCandidates = [
    record?.cliente,
    record?.clienteNome,
    record?.nomeCliente,
    record?.clientName,
    record?.client_name,
    record?.customer,
    record?.nome,
  ];

  const selectedId = String(cliente?.id || "");
  const selectedName = normalizeText(cliente?.nome);

  const hasIdMatch = clientIdCandidates.some((value) => String(value || "") === selectedId);
  const hasNameMatch = clientNameCandidates.some((value) => normalizeText(value) === selectedName);

  return hasIdMatch || hasNameMatch;
}

function getClientHistory(cliente, ordersHistory, salesHistory, receivablesHistory) {
  const osCliente = ordersHistory.filter((o) => matchesClient(o, cliente));
  const vendasCliente = salesHistory.filter((v) => matchesClient(v, cliente));
  const receberCliente = receivablesHistory.filter((r) => matchesClient(r, cliente));

  const totalGasto = vendasCliente.reduce((s, v) => s + Number(v.total || 0), 0);

  const saldoAberto = receberCliente.reduce(
    (s, r) =>
      s +
      Number(
        r.remainingAmount ??
          r.remaining_amount ??
          r.restante ??
          0
      ),
    0
  );

  return {
    osCliente,
    vendasCliente,
    receberCliente,
    totalGasto,
    saldoAberto,
  };
}

async function fetchAddressByCep(cep) {
  const cleanCep = String(cep || "").replace(/\D+/g, "");

  if (cleanCep.length !== 8) {
    throw new Error("CEP inválido. Digite 8 números.");
  }

  const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);

  if (!response.ok) {
    throw new Error("Não foi possível consultar o CEP.");
  }

  const data = await response.json();

  if (data.erro) {
    throw new Error("CEP não encontrado.");
  }

  return data;
}

export default function ClientesPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const toast = useToast();

  const [clients, setClients] = useState([]);
  const [ordersHistory, setOrdersHistory] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [receivablesHistory, setReceivablesHistory] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("dados");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    async function fetchClients() {
      if (!tenantId) {
        setClients([]);
        setOrdersHistory([]);
        setSalesHistory([]);
        setReceivablesHistory([]);
        setSelectedId(null);
        setForm(emptyForm);
        setIsLoaded(false);
        return;
      }

      try {
        setIsLoaded(false);

        const [clientsRes, ordersRes, salesRes, receivablesRes] = await Promise.all([
          supabase
            .from("clients")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),

          supabase
            .from("service_orders")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),

          supabase
            .from("sales")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),

          supabase
            .from("receivables")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),
        ]);

        if (clientsRes.error) {
          console.error("Erro ao carregar clientes:", clientsRes.error);
          toast.error(`Erro ao carregar clientes: ${clientsRes.error.message || "desconhecido"}`);
          setClients([]);
        } else {
          const mapped = (clientsRes.data || []).map((c) => ({
            id: c.id,
            tenant_id: c.tenant_id || tenantId,
            tipo: c.tipo || "PF",
            nome: c.nome || "",
            nomeFantasia: c.nome_fantasia || "",
            cpfCnpj: c.cpf_cnpj || "",
            rgIe: c.rg_ie || "",
            telefone1: c.telefone1 || "",
            telefone2: c.telefone2 || "",
            whatsapp: c.whatsapp || "",
            email: c.email || "",
            cep: c.cep || "",
            rua: c.rua || "",
            numero: c.numero || "",
            complemento: c.complemento || "",
            bairro: c.bairro || "",
            cidade: c.cidade || "",
            estado: c.estado || "",
            observacoes: c.observacoes || "",
            createdAt: c.created_at,
          }));

          setClients(mapped);
        }

        if (ordersRes.error) {
          console.error("Erro ao carregar histórico de OS:", ordersRes.error);
          toast.warning("Não foi possível carregar o histórico de ordens de serviço.");
          setOrdersHistory([]);
        } else {
          setOrdersHistory(ordersRes.data || []);
        }

        if (salesRes.error) {
          console.error("Erro ao carregar histórico de vendas:", salesRes.error);
          toast.warning("Não foi possível carregar o histórico de vendas.");
          setSalesHistory([]);
        } else {
          setSalesHistory(salesRes.data || []);
        }

        if (receivablesRes.error) {
          console.error("Erro ao carregar contas a receber:", receivablesRes.error);
          toast.warning("Não foi possível carregar o histórico financeiro do cliente.");
          setReceivablesHistory([]);
        } else {
          setReceivablesHistory(receivablesRes.data || []);
        }
      } catch (error) {
        console.error("Erro ao carregar clientes:", error);
        toast.error("Erro ao carregar clientes.");
        setClients([]);
        setOrdersHistory([]);
        setSalesHistory([]);
        setReceivablesHistory([]);
      } finally {
        setIsLoaded(true);
      }
    }

    fetchClients();
  }, [tenantId, toast]);

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();

    return [...clients]
      .filter((client) => {
        if (!q) return true;
        return [
          client.nome,
          client.nomeFantasia,
          client.cpfCnpj,
          client.telefone1,
          client.telefone2,
          client.whatsapp,
          client.cidade,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [clients, query]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedId) || null,
    [clients, selectedId]
  );

  const history = useMemo(
    () =>
      selectedClient
        ? getClientHistory(
            selectedClient,
            ordersHistory,
            salesHistory,
            receivablesHistory
          )
        : null,
    [selectedClient, ordersHistory, salesHistory, receivablesHistory]
  );

  useEffect(() => {
    if (selectedClient) {
      setForm(selectedClient);
    }
  }, [selectedClient]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCepLookup(cepValue) {
    const cleanCep = String(cepValue || "").replace(/\D+/g, "");
    if (!cleanCep) return;

    try {
      const data = await fetchAddressByCep(cepValue);

      setForm((prev) => ({
        ...prev,
        cep: data.cep || prev.cep,
        rua: data.logradouro || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        estado: data.uf || prev.estado,
      }));

      toast.success("Endereço preenchido automaticamente pelo CEP.");
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
      toast.error(error.message || "Não foi possível buscar o CEP.");
    }
  }

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
    });
    toast.info("Formulário limpo para novo cliente.");
  }

  async function handleSave() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!form.nome.trim()) {
      toast.warning("Informe o nome ou razão social do cliente.");
      return;
    }

    if (!form.telefone1.trim() && !form.whatsapp.trim()) {
      toast.warning("Informe pelo menos um telefone ou WhatsApp.");
      return;
    }

    const payload = {
      ...form,
      id: form.id || crypto.randomUUID(),
      tenant_id: tenantId,
      telefone1: formatPhone(form.telefone1),
      telefone2: formatPhone(form.telefone2),
      whatsapp: formatPhone(form.whatsapp),
      cpfCnpj: formatCpfCnpj(form.cpfCnpj),
      createdAt: form.createdAt || new Date().toISOString(),
    };

    const { error } = await supabase.from("clients").upsert({
      id: payload.id,
      tenant_id: tenantId,
      tipo: payload.tipo,
      nome: payload.nome,
      nome_fantasia: payload.nomeFantasia,
      cpf_cnpj: payload.cpfCnpj,
      rg_ie: payload.rgIe,
      telefone1: payload.telefone1,
      telefone2: payload.telefone2,
      whatsapp: payload.whatsapp,
      email: payload.email,
      cep: payload.cep,
      rua: payload.rua,
      numero: payload.numero,
      complemento: payload.complemento,
      bairro: payload.bairro,
      cidade: payload.cidade,
      estado: payload.estado,
      observacoes: payload.observacoes,
      created_at: payload.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Erro ao salvar cliente:", error);
      toast.error(`Erro ao salvar cliente: ${error.message || "desconhecido"}`);
      return;
    }

    setClients((prev) => {
      const index = prev.findIndex((client) => client.id === payload.id);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = payload;
        return copy;
      }
      return [payload, ...prev];
    });

    setSelectedId(payload.id);
    setForm(payload);
    toast.success("Cliente salvo com sucesso.");
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm("Excluir este cliente?")) return;

    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", selectedId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Erro ao excluir cliente:", error);
      toast.error(`Erro ao excluir cliente: ${error.message || "desconhecido"}`);
      return;
    }

    setClients((prev) => prev.filter((client) => client.id !== selectedId));
    setSelectedId(null);
    setForm({
      ...emptyForm,
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      createdAt: new Date().toISOString(),
    });
    toast.success("Cliente excluído com sucesso.");
  }

  function handlePick(client) {
    setSelectedId(client.id);
    setForm(client);
  }

  if (!tenantId || !isLoaded) {
    return (
      <div className="page-stack">
        <Card title="Clientes">Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Clientes"
        description="Cadastro, busca, edição e exclusão de clientes PF e PJ."
        action={
          <div className="header-actions">
            <Button variant="secondary" onClick={handleNew}>
              Novo cliente
            </Button>
            <Button onClick={handleSave}>Salvar cliente</Button>
          </div>
        }
      />

      <div className="split-layout">
        <div className="left-column">
          <Card title="Lista de clientes">
            <div className="toolbar">
              <input
                className="toolbar-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, telefone, CPF/CNPJ..."
              />
              <div className="toolbar-count">{filteredClients.length} clientes</div>
            </div>

            {filteredClients.length ? (
              <div className="client-list">
                {filteredClients.map((client) => (
                  <button
                    type="button"
                    key={client.id}
                    onClick={() => handlePick(client)}
                    className={`client-list-item ${selectedId === client.id ? "active" : ""}`}
                  >
                    <div className="client-list-head">
                      <strong>{client.nome}</strong>
                      <span className="pill">{client.tipo}</span>
                    </div>
                    <div className="client-list-meta">
                      {client.telefone1 || client.whatsapp || "Sem telefone"}
                    </div>
                    <div className="client-list-meta">
                      {client.cidade || "Sem cidade"} • Cadastro: {formatDate(client.createdAt)}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhum cliente encontrado"
                description="Cadastre seu primeiro cliente para começar."
              />
            )}
          </Card>
        </div>

        <div className="right-column">
          <div className="client-tabs">
            <button
              type="button"
              className={`client-tab ${activeTab === "dados" ? "active" : ""}`}
              onClick={() => setActiveTab("dados")}
            >
              Dados
            </button>
            <button
              type="button"
              className={`client-tab ${activeTab === "resumo" ? "active" : ""}`}
              onClick={() => setActiveTab("resumo")}
            >
              Resumo
            </button>
            <button
              type="button"
              className={`client-tab ${activeTab === "historico" ? "active" : ""}`}
              onClick={() => setActiveTab("historico")}
            >
              Histórico
            </button>
          </div>

          {activeTab === "dados" ? (
            <Card
              title={selectedId ? "Editar cliente" : "Novo cliente"}
              action={
                <div className="header-actions">
                  <Button variant="secondary" onClick={handleNew}>
                    Limpar
                  </Button>
                  <Button variant="danger" onClick={handleDelete} disabled={!selectedId}>
                    Excluir
                  </Button>
                </div>
              }
            >
              <div className="form-grid form-grid-2">
                <label className="form-field">
                  <span>Tipo</span>
                  <select value={form.tipo} onChange={(e) => updateField("tipo", e.target.value)}>
                    <option value="PF">PF</option>
                    <option value="PJ">PJ</option>
                  </select>
                </label>

                <Input label="Nome fantasia" value={form.nomeFantasia} onChange={(v) => updateField("nomeFantasia", v)} />
                <Input label="Nome / Razão social" value={form.nome} onChange={(v) => updateField("nome", v)} />
                <Input label="CPF / CNPJ" value={form.cpfCnpj} onChange={(v) => updateField("cpfCnpj", formatCpfCnpj(v))} />
                <Input label="RG / IE" value={form.rgIe} onChange={(v) => updateField("rgIe", v)} />
                <Input label="E-mail" value={form.email} onChange={(v) => updateField("email", v)} />
                <Input label="Telefone principal" value={form.telefone1} onChange={(v) => updateField("telefone1", formatPhone(v))} />
                <Input label="Telefone secundário" value={form.telefone2} onChange={(v) => updateField("telefone2", formatPhone(v))} />
                <Input label="WhatsApp" value={form.whatsapp} onChange={(v) => updateField("whatsapp", formatPhone(v))} />

                <label className="form-field">
                  <span>CEP</span>
                  <input
                    value={form.cep}
                    onChange={(e) => updateField("cep", e.target.value)}
                    onBlur={() => handleCepLookup(form.cep)}
                    placeholder="Digite o CEP"
                  />
                </label>

                <Input label="Rua" value={form.rua} onChange={(v) => updateField("rua", v)} />
                <Input label="Número" value={form.numero} onChange={(v) => updateField("numero", v)} />
                <Input label="Complemento" value={form.complemento} onChange={(v) => updateField("complemento", v)} />
                <Input label="Bairro" value={form.bairro} onChange={(v) => updateField("bairro", v)} />
                <Input label="Cidade" value={form.cidade} onChange={(v) => updateField("cidade", v)} />
                <Input label="Estado" value={form.estado} onChange={(v) => updateField("estado", v)} />
              </div>

              <div className="form-grid" style={{ marginTop: 16 }}>
                <TextArea
                  label="Observações"
                  value={form.observacoes}
                  onChange={(v) => updateField("observacoes", v)}
                  placeholder="Informações importantes sobre o cliente..."
                />
              </div>
            </Card>
          ) : activeTab === "resumo" ? (
            <Card title="Resumo do cliente">
              {selectedClient ? (
                <>
                  <div className="summary-grid">
                    <div><strong>Nome:</strong> {selectedClient.nome}</div>
                    <div><strong>Tipo:</strong> {selectedClient.tipo}</div>
                    <div><strong>Documento:</strong> {selectedClient.cpfCnpj || "—"}</div>
                    <div><strong>Telefone:</strong> {selectedClient.telefone1 || "—"}</div>
                    <div><strong>WhatsApp:</strong> {selectedClient.whatsapp || "—"}</div>
                    <div><strong>Cidade:</strong> {selectedClient.cidade || "—"}</div>
                    <div><strong>Cadastro:</strong> {formatDate(selectedClient.createdAt)}</div>
                  </div>

                  {history ? (
                    <div className="client-history" style={{ marginTop: 24 }}>
                      <div className="stats-grid" style={{ marginBottom: 20 }}>
                        <div className="card">
                          <strong>Total gasto</strong>
                          <div>R$ {history.totalGasto.toFixed(2)}</div>
                        </div>
                        <div className="card">
                          <strong>Saldo em aberto</strong>
                          <div>R$ {history.saldoAberto.toFixed(2)}</div>
                        </div>
                        <div className="card">
                          <strong>Ordens de serviço</strong>
                          <div>{history.osCliente.length}</div>
                        </div>
                        <div className="card">
                          <strong>Compras</strong>
                          <div>{history.vendasCliente.length}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  title="Nenhum cliente selecionado"
                  description="Escolha um cliente da lista ou crie um novo cadastro."
                />
              )}
            </Card>
          ) : (
            <Card title="Histórico do cliente">
              {selectedClient && history ? (
                <div className="client-history">
                  <div style={{ marginTop: 0 }}>
                    <h3 style={{ marginBottom: 12 }}>Histórico de OS</h3>
                    {history.osCliente.length ? (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Nº</th>
                              <th>Equipamento</th>
                              <th>Status</th>
                              <th>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.osCliente.map((os) => (
                              <tr key={os.id}>
                                <td>{getOSNumber(os)}</td>
                                <td>{getOSEquipment(os)}</td>
                                <td>{os.status || "—"}</td>
                                <td>R$ {Number(os.total || 0).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p>Nenhuma OS encontrada para este cliente.</p>
                    )}
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <h3 style={{ marginBottom: 12 }}>Histórico de vendas</h3>
                    {history.vendasCliente.length ? (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Nº</th>
                              <th>Data</th>
                              <th>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.vendasCliente.map((v) => (
                              <tr key={v.id}>
                                <td>{getSaleNumber(v)}</td>
                                <td>{formatDate(v.data || v.saleDate || v.createdAt || v.created_at)}</td>
                                <td>R$ {getSaleTotal(v).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p>Nenhuma venda encontrada para este cliente.</p>
                    )}
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <h3 style={{ marginBottom: 12 }}>Contas a receber</h3>
                    {history.receberCliente.length ? (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Descrição</th>
                              <th>Vencimento</th>
                              <th>Restante</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.receberCliente.map((r) => (
                              <tr key={r.id}>
                                <td>{getReceivableDescription(r)}</td>
                                <td>{formatDate(getReceivableDueDate(r))}</td>
                                <td>R$ {getReceivableRemaining(r).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p>Nenhuma conta a receber encontrada para este cliente.</p>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="Nenhum cliente selecionado"
                  description="Escolha um cliente para visualizar o histórico."
                />
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}