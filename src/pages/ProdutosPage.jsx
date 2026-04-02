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
  codigo: "",
  codigoBarras: "",
  nome: "",
  categoria: "",
  marca: "",
  modelo: "",
  supplier_id: "",
  supplier_name: "",
  custo: "",
  margemLucro: "",
  precoVenda: "",
  estoqueAtual: "",
  estoqueMinimo: "",
  unidade: "UN",
  observacoes: "",
  status: "Ativo",
  createdAt: "",
  stockHistory: [],
};

function currencyBR(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

function formatDateTime(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR");
}

function calculateVenda(custo, margemLucro) {
  const custoNum = parseMoney(custo);
  const margem = Number(String(margemLucro || "").replace(",", "."));

  if (!Number.isFinite(custoNum) || custoNum <= 0) return "";
  if (!Number.isFinite(margem)) return "";

  return String(custoNum + (custoNum * margem) / 100);
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

export default function ProdutosPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const toast = useToast();

  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("dados");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [movementQty, setMovementQty] = useState("1");
  const [movementReason, setMovementReason] = useState("");

  useEffect(() => {
    async function fetchProducts() {
      if (!tenantId) {
        setProducts([]);
        setSuppliers([]);
        setSelectedId(null);
        setForm(emptyForm);
        setIsLoaded(false);
        return;
      }

      try {
        setIsLoaded(false);

        const [suppliersRes, productsRes, movementsRes] = await Promise.all([
          supabase
            .from("suppliers")
            .select("id, name, is_active")
            .eq("tenant_id", tenantId)
            .eq("is_active", true)
            .order("name", { ascending: true }),

          supabase
            .from("products")
            .select(`
              *,
              supplier:suppliers (
                id,
                name
              )
            `)
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),

          supabase
            .from("stock_movements")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),
        ]);

        if (suppliersRes.error) {
          console.error("Erro ao carregar fornecedores:", suppliersRes.error);
          toast.warning("Não foi possível carregar os fornecedores.");
          setSuppliers([]);
        } else {
          setSuppliers(suppliersRes.data || []);
        }

        if (productsRes.error) {
          console.error("Erro ao carregar produtos:", productsRes.error);
          toast.error(
            `Erro ao carregar produtos: ${productsRes.error.message || "desconhecido"}`
          );
          setProducts([]);
          return;
        }

        if (movementsRes.error) {
          console.error("Erro ao carregar movimentações:", movementsRes.error);
          toast.warning("Não foi possível carregar o histórico de movimentações.");
        }

        const movementsByProduct = (movementsRes.data || []).reduce((acc, item) => {
          const key = item.product_id;
          if (!acc[key]) acc[key] = [];
          acc[key].push({
            id: item.id,
            type: item.type,
            qty: Number(item.qty || 0),
            reason: item.reason || "",
            previousStock: Number(item.previous_stock || 0),
            newStock: Number(item.new_stock || 0),
            createdAt: item.created_at,
          });
          return acc;
        }, {});

        const mapped = (productsRes.data || []).map((p) => ({
          id: p.id,
          tenant_id: p.tenant_id || tenantId,
          codigo: p.codigo || "",
          codigoBarras: p.codigo_barras || "",
          nome: p.nome || "",
          categoria: p.categoria || "",
          marca: p.marca || "",
          modelo: p.modelo || "",
          supplier_id: p.supplier_id || "",
          supplier_name: p.supplier?.name || "",
          custo: String(p.preco_custo ?? ""),
          margemLucro: String(p.margem_lucro ?? ""),
          precoVenda: String(p.preco_venda ?? ""),
          estoqueAtual: String(p.estoque_atual ?? ""),
          estoqueMinimo: String(p.estoque_minimo ?? ""),
          unidade: p.unidade || "UN",
          observacoes: p.observacoes || "",
          status: p.status || (p.ativo === false ? "Inativo" : "Ativo"),
          createdAt: p.created_at,
          stockHistory: movementsByProduct[p.id] || [],
        }));

        setProducts(mapped);
      } catch (error) {
        console.error("Erro ao carregar produtos:", error);
        toast.error("Erro ao carregar produtos.");
        setProducts([]);
        setSuppliers([]);
      } finally {
        setIsLoaded(true);
      }
    }

    fetchProducts();
  }, [tenantId, toast]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();

    return [...products]
      .filter((product) => {
        if (!q) return true;

        return [
          product.codigo,
          product.codigoBarras,
          product.nome,
          product.categoria,
          product.marca,
          product.modelo,
          product.supplier_name,
          product.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [products, query]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) || null,
    [products, selectedId]
  );

  useEffect(() => {
    if (selectedProduct) {
      setForm({ ...selectedProduct, stockHistory: selectedProduct.stockHistory || [] });
    }
  }, [selectedProduct]);

  function updateField(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };

      if (field === "custo" || field === "margemLucro") {
        next.precoVenda = calculateVenda(
          field === "custo" ? value : next.custo,
          field === "margemLucro" ? value : next.margemLucro
        );
      }

      if (field === "supplier_id") {
        const supplier = suppliers.find((item) => item.id === value);
        next.supplier_name = supplier?.name || "";
      }

      return next;
    });
  }

  function handleNew() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    setSelectedId(null);
    setMovementQty("1");
    setMovementReason("");
    setForm({
      ...emptyForm,
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      createdAt: new Date().toISOString(),
      status: "Ativo",
      unidade: "UN",
      stockHistory: [],
    });
    toast.info("Formulário limpo para novo produto.");
  }

  async function handleSave() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!form.nome.trim()) {
      toast.warning("Informe o nome do produto.");
      return;
    }

    if (!form.precoVenda.trim()) {
      toast.warning("Informe o preço de venda.");
      return;
    }

    const selectedSupplier = suppliers.find((item) => item.id === form.supplier_id);

    const payload = {
      ...form,
      id: form.id || crypto.randomUUID(),
      tenant_id: tenantId,
      supplier_id: form.supplier_id || "",
      supplier_name: selectedSupplier?.name || "",
      custo: String(parseMoney(form.custo)),
      margemLucro: String(
        Number(String(form.margemLucro || "").replace(",", ".")) || 0
      ),
      precoVenda: String(parseMoney(form.precoVenda)),
      estoqueAtual: String(
        Number(String(form.estoqueAtual || "0").replace(",", ".")) || 0
      ),
      estoqueMinimo: String(
        Number(String(form.estoqueMinimo || "0").replace(",", ".")) || 0
      ),
      createdAt: form.createdAt || new Date().toISOString(),
      stockHistory: Array.isArray(form.stockHistory) ? form.stockHistory : [],
    };

    const { error } = await supabase.from("products").upsert({
      id: payload.id,
      tenant_id: tenantId,
      codigo: payload.codigo,
      codigo_barras: payload.codigoBarras,
      nome: payload.nome,
      categoria: payload.categoria,
      marca: payload.marca,
      modelo: payload.modelo,
      supplier_id: payload.supplier_id || null,
      preco_custo: parseMoney(payload.custo),
      margem_lucro: Number(String(payload.margemLucro || "").replace(",", ".")) || 0,
      preco_venda: parseMoney(payload.precoVenda),
      estoque_atual: Number(String(payload.estoqueAtual || "0").replace(",", ".")) || 0,
      estoque_minimo:
        Number(String(payload.estoqueMinimo || "0").replace(",", ".")) || 0,
      unidade: payload.unidade,
      observacoes: payload.observacoes,
      status: payload.status,
      ativo: payload.status === "Ativo",
      created_at: payload.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Erro ao salvar produto:", error);
      toast.error(`Erro ao salvar produto: ${error.message || "desconhecido"}`);
      return;
    }

    setProducts((prev) => {
      const index = prev.findIndex((product) => product.id === payload.id);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = payload;
        return copy;
      }
      return [payload, ...prev];
    });

    setSelectedId(payload.id);
    setForm(payload);
    toast.success("Produto salvo com sucesso.");
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm("Excluir este produto?")) return;

    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", selectedId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Erro ao excluir produto:", error);
      toast.error(`Erro ao excluir produto: ${error.message || "desconhecido"}`);
      return;
    }

    setProducts((prev) => prev.filter((product) => product.id !== selectedId));
    handleNew();
    toast.success("Produto excluído com sucesso.");
  }

  function handlePick(product) {
    setSelectedId(product.id);
    setForm({ ...product, stockHistory: product.stockHistory || [] });
    setMovementQty("1");
    setMovementReason("");
  }

  async function applyStockMovement(type) {
    if (!form.id) {
      toast.warning("Salve o produto antes de movimentar estoque.");
      return;
    }

    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    const qty = Number(String(movementQty || "").replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.warning("Informe uma quantidade válida para movimentação.");
      return;
    }

    const current = Number(form.estoqueAtual || 0);
    const next = type === "entrada" ? current + qty : current - qty;

    if (next < 0) {
      toast.error("A saída não pode deixar o estoque negativo.");
      return;
    }

    const historyItem = {
      id: crypto.randomUUID(),
      type,
      qty,
      reason: movementReason || (type === "entrada" ? "Entrada manual" : "Saída manual"),
      previousStock: current,
      newStock: next,
      createdAt: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("products")
      .update({
        estoque_atual: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", form.id)
      .eq("tenant_id", tenantId);

    if (updateError) {
      console.error("Erro ao atualizar estoque:", updateError);
      toast.error(`Erro ao atualizar estoque: ${updateError.message || "desconhecido"}`);
      return;
    }

    const { error: movementError } = await supabase.from("stock_movements").insert({
      id: historyItem.id,
      tenant_id: tenantId,
      product_id: form.id,
      type: historyItem.type,
      qty: historyItem.qty,
      reason: historyItem.reason,
      previous_stock: historyItem.previousStock,
      new_stock: historyItem.newStock,
      created_at: historyItem.createdAt,
    });

    if (movementError) {
      console.error("Erro ao registrar movimentação:", movementError);
      toast.error(
        `Erro ao registrar movimentação: ${movementError.message || "desconhecido"}`
      );
      return;
    }

    const updated = {
      ...form,
      estoqueAtual: String(next),
      stockHistory: [historyItem, ...(form.stockHistory || [])],
    };

    setForm(updated);
    setProducts((prev) =>
      prev.map((product) => (product.id === updated.id ? updated : product))
    );
    setMovementReason("");
    setMovementQty("1");
    toast.success(
      type === "entrada"
        ? `Entrada registrada. Estoque atualizado para ${next}.`
        : `Saída registrada. Estoque atualizado para ${next}.`
    );
  }

  if (!tenantId || !isLoaded) {
    return (
      <div className="page-stack">
        <Card title="Produtos e Estoque">Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Produtos e Estoque"
        description="Cadastro de produtos, preços, fornecedores, estoque atual e movimentação manual."
        action={
          <div className="header-actions">
            <Button variant="secondary" onClick={handleNew}>
              Novo produto
            </Button>
            <Button onClick={handleSave}>Salvar produto</Button>
          </div>
        }
      />

      <div className="split-layout">
        <div className="left-column">
          <Card title="Lista de produtos">
            <div className="toolbar">
              <input
                className="toolbar-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, código, marca..."
              />
              <div className="toolbar-count">{filteredProducts.length} produtos</div>
            </div>

            {filteredProducts.length ? (
              <div className="client-list">
                {filteredProducts.map((product) => {
                  const atual = Number(product.estoqueAtual || 0);
                  const minimo = Number(product.estoqueMinimo || 0);
                  const lowStock = atual <= minimo;

                  return (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => handlePick(product)}
                      className={`client-list-item ${selectedId === product.id ? "active" : ""}`}
                    >
                      <div className="client-list-head">
                        <strong>{product.nome}</strong>
                        <span className={`pill ${lowStock ? "pill-danger" : ""}`}>
                          {product.status}
                        </span>
                      </div>

                      <div className="client-list-meta">
                        {product.codigo || "Sem código"} • {product.marca || "Sem marca"}
                      </div>

                      <div className="client-list-meta">
                        Fornecedor: {product.supplier_name || "Não informado"}
                      </div>

                      <div className="client-list-meta">
                        Estoque: {product.estoqueAtual || "0"} / Mínimo:{" "}
                        {product.estoqueMinimo || "0"} • Venda: {currencyBR(product.precoVenda)}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="Nenhum produto encontrado"
                description="Cadastre seu primeiro produto para começar."
              />
            )}
          </Card>
        </div>

        <div className="right-column">
          <div className="product-tabs">
            <button
              type="button"
              className={`product-tab ${activeTab === "dados" ? "active" : ""}`}
              onClick={() => setActiveTab("dados")}
            >
              Dados
            </button>
            <button
              type="button"
              className={`product-tab ${activeTab === "estoque" ? "active" : ""}`}
              onClick={() => setActiveTab("estoque")}
            >
              Estoque
            </button>
            <button
              type="button"
              className={`product-tab ${activeTab === "resumo" ? "active" : ""}`}
              onClick={() => setActiveTab("resumo")}
            >
              Resumo
            </button>
            <button
              type="button"
              className={`product-tab ${activeTab === "historico" ? "active" : ""}`}
              onClick={() => setActiveTab("historico")}
            >
              Histórico
            </button>
          </div>

          {activeTab === "dados" ? (
            <Card
              title={selectedId ? "Editar produto" : "Novo produto"}
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
                <Input label="Código interno" value={form.codigo} onChange={(v) => updateField("codigo", v)} />
                <Input label="Código de barras" value={form.codigoBarras} onChange={(v) => updateField("codigoBarras", v)} />
                <Input label="Nome do produto" value={form.nome} onChange={(v) => updateField("nome", v)} />
                <Input label="Categoria" value={form.categoria} onChange={(v) => updateField("categoria", v)} />
                <Input label="Marca" value={form.marca} onChange={(v) => updateField("marca", v)} />
                <Input label="Modelo" value={form.modelo} onChange={(v) => updateField("modelo", v)} />

                <label className="form-field">
                  <span>Fornecedor</span>
                  <select
                    value={form.supplier_id || ""}
                    onChange={(e) => updateField("supplier_id", e.target.value)}
                  >
                    <option value="">Selecione um fornecedor</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span>Status</span>
                  <select value={form.status} onChange={(e) => updateField("status", e.target.value)}>
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </label>

                <Input label="Custo" value={form.custo} onChange={(v) => updateField("custo", v)} placeholder="Ex: 120,00" />
                <Input label="Margem de lucro (%)" value={form.margemLucro} onChange={(v) => updateField("margemLucro", v)} placeholder="Ex: 50" />
                <Input label="Preço de venda" value={form.precoVenda} onChange={(v) => updateField("precoVenda", v)} placeholder="Ex: 180,00" />
                <Input label="Unidade" value={form.unidade} onChange={(v) => updateField("unidade", v)} placeholder="UN" />
                <Input label="Estoque atual" value={form.estoqueAtual} onChange={(v) => updateField("estoqueAtual", v)} placeholder="Ex: 5" />
                <Input label="Estoque mínimo" value={form.estoqueMinimo} onChange={(v) => updateField("estoqueMinimo", v)} placeholder="Ex: 2" />
              </div>

              <div className="form-grid" style={{ marginTop: 16 }}>
                <TextArea
                  label="Observações"
                  value={form.observacoes}
                  onChange={(v) => updateField("observacoes", v)}
                  placeholder="Informações importantes sobre o produto..."
                />
              </div>
            </Card>
          ) : activeTab === "estoque" ? (
            <Card title="Movimentação manual de estoque">
              <div className="form-grid form-grid-3">
                <Input label="Quantidade" type="number" value={movementQty} onChange={setMovementQty} placeholder="1" />
                <Input label="Motivo" value={movementReason} onChange={setMovementReason} placeholder="Ex: compra, ajuste, perda, troca" />
              </div>

              <div className="header-actions" style={{ marginTop: 16 }}>
                <Button variant="secondary" onClick={() => applyStockMovement("entrada")}>
                  Registrar entrada
                </Button>
                <Button variant="danger" onClick={() => applyStockMovement("saida")}>
                  Registrar saída
                </Button>
              </div>

              <div className="empty-inline" style={{ marginTop: 12 }}>
                Essa movimentação registra histórico completo e atualiza o estoque do produto selecionado.
              </div>
            </Card>
          ) : activeTab === "resumo" ? (
            <Card title="Resumo do produto">
              {selectedProduct ? (
                <div className="summary-grid">
                  <div><strong>Produto:</strong> {selectedProduct.nome}</div>
                  <div><strong>Código:</strong> {selectedProduct.codigo || "—"}</div>
                  <div><strong>Categoria:</strong> {selectedProduct.categoria || "—"}</div>
                  <div><strong>Marca:</strong> {selectedProduct.marca || "—"}</div>
                  <div><strong>Fornecedor:</strong> {selectedProduct.supplier_name || "—"}</div>
                  <div><strong>Custo:</strong> {currencyBR(selectedProduct.custo)}</div>
                  <div><strong>Venda:</strong> {currencyBR(selectedProduct.precoVenda)}</div>
                  <div><strong>Estoque atual:</strong> {form.estoqueAtual || "0"}</div>
                  <div><strong>Estoque mínimo:</strong> {selectedProduct.estoqueMinimo || "0"}</div>
                  <div><strong>Status:</strong> {selectedProduct.status}</div>
                  <div><strong>Cadastro:</strong> {formatDate(selectedProduct.createdAt)}</div>
                </div>
              ) : (
                <EmptyState
                  title="Nenhum produto selecionado"
                  description="Escolha um produto da lista ou crie um novo cadastro."
                />
              )}
            </Card>
          ) : (
            <Card title="Histórico de movimentação">
              {form.stockHistory?.length ? (
                <div className="history-list">
                  {form.stockHistory.map((item) => (
                    <div className="history-item" key={item.id}>
                      <div className="client-list-head">
                        <strong>
                          {item.type === "entrada" ? "Entrada" : "Saída"} de {item.qty}
                        </strong>
                        <span className={`pill ${item.type === "entrada" ? "pill-success" : "pill-danger"}`}>
                          {item.type === "entrada" ? "Entrada" : "Saída"}
                        </span>
                      </div>
                      <div className="client-list-meta">{item.reason || "Sem motivo"}</div>
                      <div className="client-list-meta">
                        {formatDateTime(item.createdAt)} • Estoque: {item.previousStock} → {item.newStock}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Sem movimentações"
                  description="As entradas e saídas manuais do estoque aparecerão aqui."
                />
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}