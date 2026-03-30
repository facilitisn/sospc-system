import { useEffect, useMemo, useState } from "react";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/auth.jsx";

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

function parseQty(value) {
  const n = Number(String(value || "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
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

function normalizeSaleItem(item) {
  return {
    id: item.id,
    tenant_id: item.tenant_id,
    sale_id: item.sale_id,
    product_id: item.product_id || null,
    description: item.description || "",
    qty: String(item.qty ?? "1"),
    unitValue: String(item.unit_value ?? ""),
    totalValue:
      item.total_value != null
        ? Number(item.total_value || 0)
        : parseQty(item.qty) * parseMoney(item.unit_value),
  };
}

function getPaymentStatusLabel(sale) {
  const total = Number(sale.total || 0);
  const paid = Number(sale.amount_paid || 0);
  const remaining = Math.max(0, total - paid);

  if (remaining <= 0) return "Pago";
  if (paid > 0) return "Parcial";
  return "Em aberto";
}

function getPaymentStatusClass(sale) {
  const total = Number(sale.total || 0);
  const paid = Number(sale.amount_paid || 0);
  const remaining = Math.max(0, total - paid);

  if (remaining <= 0) return "pill pill-success";
  if (paid > 0) return "pill";
  return "pill pill-danger";
}

export default function VendasPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const toast = useToast();

  const [sales, setSales] = useState([]);
  const [saleItemsBySale, setSaleItemsBySale] = useState({});
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("resumo");

  useEffect(() => {
    async function fetchData() {
      if (!tenantId) {
        setSales([]);
        setSaleItemsBySale({});
        setProducts([]);
        setSelectedId(null);
        setIsLoaded(false);
        return;
      }

      try {
        setIsLoaded(false);

        const [salesRes, itemsRes, productsRes, movementsRes] = await Promise.all([
          supabase
            .from("sales")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),

          supabase
            .from("sale_items")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),

          supabase
            .from("products")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),

          supabase
            .from("stock_movements")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),
        ]);

        if (salesRes.error) {
          console.error("Erro ao carregar vendas:", salesRes.error);
          toast.error(`Erro ao carregar vendas: ${salesRes.error.message || "desconhecido"}`);
          setSales([]);
          return;
        }

        if (itemsRes.error) {
          console.error("Erro ao carregar itens das vendas:", itemsRes.error);
          toast.warning("Não foi possível carregar os itens das vendas.");
        }

        if (productsRes.error) {
          console.error("Erro ao carregar produtos:", productsRes.error);
          toast.warning("Não foi possível carregar os produtos.");
        }

        if (movementsRes.error) {
          console.error("Erro ao carregar movimentações:", movementsRes.error);
          toast.warning("Não foi possível carregar o histórico de estoque.");
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

        const mappedProducts = (productsRes.data || []).map((product) => ({
          id: product.id,
          tenant_id: product.tenant_id || tenantId,
          nome: product.nome || "",
          estoqueAtual: String(product.estoque_atual ?? 0),
          precoVenda: String(product.preco_venda ?? ""),
          stockHistory: movementsByProduct[product.id] || [],
        }));

        const itemsBySale = (itemsRes.data || []).reduce((acc, item) => {
          if (!acc[item.sale_id]) acc[item.sale_id] = [];
          acc[item.sale_id].push(normalizeSaleItem(item));
          return acc;
        }, {});

        const mappedSales = (salesRes.data || []).map((sale) => ({
          id: sale.id,
          tenant_id: sale.tenant_id || tenantId,
          number: sale.number || "",
          client_id: sale.client_id || "",
          client_name: sale.client_name || "",
          payment_method: sale.payment_method || "",
          payment_notes: sale.payment_notes || "",
          amount_paid: Number(sale.amount_paid || 0),
          due_date: sale.due_date || "",
          discount: Number(sale.discount || 0),
          total: Number(sale.total || 0),
          status: sale.status || "Finalizada",
          created_at: sale.created_at,
          updated_at: sale.updated_at,
        }));

        setProducts(mappedProducts);
        setSaleItemsBySale(itemsBySale);
        setSales(mappedSales);
      } catch (error) {
        console.error("Erro ao carregar vendas:", error);
        toast.error("Erro ao carregar vendas.");
        setSales([]);
        setSaleItemsBySale({});
        setProducts([]);
      } finally {
        setIsLoaded(true);
      }
    }

    fetchData();
  }, [tenantId, toast]);

  const filteredSales = useMemo(() => {
    const q = query.trim().toLowerCase();

    return [...sales]
      .filter((sale) => {
        const createdAt = sale.created_at ? new Date(sale.created_at) : null;

        const startOk =
          !dateStart ||
          (createdAt &&
            !Number.isNaN(createdAt.getTime()) &&
            createdAt >= new Date(`${dateStart}T00:00:00`));

        const endOk =
          !dateEnd ||
          (createdAt &&
            !Number.isNaN(createdAt.getTime()) &&
            createdAt <= new Date(`${dateEnd}T23:59:59`));

        if (!startOk || !endOk) return false;

        if (!q) return true;

        return [
          sale.number,
          sale.client_name,
          sale.payment_method,
          sale.status,
          getPaymentStatusLabel(sale),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [sales, query, dateStart, dateEnd]);

  const selectedSale = useMemo(
    () =>
      filteredSales.find((sale) => sale.id === selectedId) ||
      sales.find((sale) => sale.id === selectedId) ||
      null,
    [filteredSales, sales, selectedId]
  );

  const selectedItems = useMemo(() => {
    if (!selectedSale) return [];
    return saleItemsBySale[selectedSale.id] || [];
  }, [selectedSale, saleItemsBySale]);

  async function handleDeleteSale() {
    if (!selectedSale) return;

    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    const confirmed = window.confirm(
      `Excluir a venda ${selectedSale.number || selectedSale.id}?\n\nIsso vai estornar o estoque dos produtos e remover o financeiro vinculado.`
    );

    if (!confirmed) return;

    try {
      setIsDeleting(true);

      const items = saleItemsBySale[selectedSale.id] || [];
      const productItems = items.filter((item) => item.product_id);

      for (const item of productItems) {
        const product = products.find((p) => p.id === item.product_id);

        if (!product) continue;

        const currentStock = Number(product.estoqueAtual || 0);
        const qty = parseQty(item.qty);
        const newStock = currentStock + qty;

        const { error: productError } = await supabase
          .from("products")
          .update({
            estoque_atual: newStock,
            updated_at: new Date().toISOString(),
          })
          .eq("id", product.id)
          .eq("tenant_id", tenantId);

        if (productError) {
          throw new Error(productError.message || "Erro ao estornar estoque.");
        }

        const movementId = crypto.randomUUID();

        const { error: movementError } = await supabase.from("stock_movements").insert({
          id: movementId,
          tenant_id: tenantId,
          product_id: product.id,
          type: "entrada",
          qty,
          reason: `Estorno venda ${selectedSale.number || selectedSale.id}`,
          previous_stock: currentStock,
          new_stock: newStock,
          created_at: new Date().toISOString(),
        });

        if (movementError) {
          throw new Error(movementError.message || "Erro ao registrar estorno de estoque.");
        }
      }

      const { error: receivableError } = await supabase
        .from("receivables")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("source_type", "sale")
        .eq("source_id", selectedSale.id);

      if (receivableError) {
        throw new Error(receivableError.message || "Erro ao remover conta a receber da venda.");
      }

      const { error: itemsError } = await supabase
        .from("sale_items")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("sale_id", selectedSale.id);

      if (itemsError) {
        throw new Error(itemsError.message || "Erro ao remover itens da venda.");
      }

      const { error: saleError } = await supabase
        .from("sales")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("id", selectedSale.id);

      if (saleError) {
        throw new Error(saleError.message || "Erro ao remover venda.");
      }

      setProducts((prev) =>
        prev.map((product) => {
          const relatedItems = productItems.filter((item) => item.product_id === product.id);
          if (!relatedItems.length) return product;

          const qtyToReturn = relatedItems.reduce((sum, item) => sum + parseQty(item.qty), 0);
          return {
            ...product,
            estoqueAtual: String(Number(product.estoqueAtual || 0) + qtyToReturn),
          };
        })
      );

      setSaleItemsBySale((prev) => {
        const copy = { ...prev };
        delete copy[selectedSale.id];
        return copy;
      });

      setSales((prev) => prev.filter((sale) => sale.id !== selectedSale.id));
      setSelectedId(null);

      toast.success("Venda excluída com sucesso.");
    } catch (error) {
      console.error("Erro ao excluir venda:", error);
      toast.error(error.message || "Erro ao excluir venda.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (!tenantId || !isLoaded) {
    return (
      <div className="page-stack">
        <Card title="Vendas">Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Vendas"
        description="Consulte vendas realizadas, visualize itens e exclua vendas quando necessário."
        action={
          <div className="header-actions">
            <Button variant="secondary" onClick={() => window.location.assign("/pdv")}>
              Ir para PDV
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteSale}
              disabled={!selectedSale || isDeleting}
            >
              {isDeleting ? "Excluindo..." : "Excluir venda"}
            </Button>
          </div>
        }
      />

      <div className="split-layout">
        <div className="left-column">
          <Card title="Lista de vendas">
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <input
                className="toolbar-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por número, cliente, pagamento..."
              />
              <div className="toolbar-count">{filteredSales.length} vendas</div>
            </div>

            <div className="form-grid form-grid-2" style={{ marginBottom: 16 }}>
              <label className="form-field">
                <span>Data inicial</span>
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>Data final</span>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                />
              </label>
            </div>

            {filteredSales.length ? (
              <div className="client-list">
                {filteredSales.map((sale) => (
                  <button
                    type="button"
                    key={sale.id}
                    onClick={() => {
                      setSelectedId(sale.id);
                      setActiveTab("resumo");
                    }}
                    className={`client-list-item ${selectedId === sale.id ? "active" : ""}`}
                  >
                    <div className="client-list-head">
                      <strong>{sale.number || sale.id}</strong>
                      <span className={getPaymentStatusClass(sale)}>
                        {getPaymentStatusLabel(sale)}
                      </span>
                    </div>

                    <div className="client-list-meta">
                      {sale.client_name || "Balcão"} • {sale.payment_method || "Sem forma"}
                    </div>

                    <div className="client-list-meta">
                      {formatDateTime(sale.created_at)} • {currencyBR(sale.total)}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhuma venda encontrada"
                description="As vendas realizadas pelo PDV aparecerão aqui."
              />
            )}
          </Card>
        </div>

        <div className="right-column">
          <Card title={selectedSale ? `Venda ${selectedSale.number || selectedSale.id}` : "Detalhes da venda"}>
            {selectedSale ? (
              <>
                <div className="sales-tabs">
                  <button
                    type="button"
                    className={`sales-tab ${activeTab === "resumo" ? "active" : ""}`}
                    onClick={() => setActiveTab("resumo")}
                  >
                    Resumo
                  </button>

                  <button
                    type="button"
                    className={`sales-tab ${activeTab === "itens" ? "active" : ""}`}
                    onClick={() => setActiveTab("itens")}
                  >
                    Itens
                  </button>

                  <button
                    type="button"
                    className={`sales-tab ${activeTab === "pagamento" ? "active" : ""}`}
                    onClick={() => setActiveTab("pagamento")}
                  >
                    Pagamento
                  </button>
                </div>

                {activeTab === "resumo" && (
                  <div className="summary-grid">
                    <div><strong>Número:</strong> {selectedSale.number || "—"}</div>
                    <div><strong>Cliente:</strong> {selectedSale.client_name || "Balcão"}</div>
                    <div><strong>Data:</strong> {formatDateTime(selectedSale.created_at)}</div>
                    <div><strong>Status:</strong> {getPaymentStatusLabel(selectedSale)}</div>
                    <div><strong>Total:</strong> {currencyBR(selectedSale.total)}</div>
                    <div><strong>Desconto:</strong> {currencyBR(selectedSale.discount || 0)}</div>
                    <div><strong>Forma de pagamento:</strong> {selectedSale.payment_method || "—"}</div>
                    <div><strong>Recebido:</strong> {currencyBR(selectedSale.amount_paid || 0)}</div>
                    <div>
                      <strong>Restante:</strong>{" "}
                      {currencyBR(
                        Math.max(
                          0,
                          Number(selectedSale.total || 0) - Number(selectedSale.amount_paid || 0)
                        )
                      )}
                    </div>
                    <div>
                      <strong>Vencimento:</strong>{" "}
                      {selectedSale.due_date ? formatDate(selectedSale.due_date) : "—"}
                    </div>
                    <div><strong>Obs. pagamento:</strong> {selectedSale.payment_notes || "—"}</div>
                    <div><strong>Status venda:</strong> {selectedSale.status || "—"}</div>
                  </div>
                )}

                {activeTab === "itens" && (
                  <div style={{ marginTop: 4 }}>
                    {selectedItems.length ? (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Descrição</th>
                            <th>Qtd</th>
                            <th>Unitário</th>
                            <th>Total</th>
                            <th>Tipo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedItems.map((item) => (
                            <tr key={item.id}>
                              <td>{item.description || "—"}</td>
                              <td>{item.qty || "1"}</td>
                              <td>{currencyBR(item.unitValue)}</td>
                              <td>{currencyBR(item.totalValue)}</td>
                              <td>{item.product_id ? "Produto" : "Serviço"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="empty-inline">Nenhum item encontrado para esta venda.</div>
                    )}
                  </div>
                )}

                {activeTab === "pagamento" && (
                  <div className="summary-grid">
                    <div><strong>Forma:</strong> {selectedSale.payment_method || "—"}</div>
                    <div><strong>Pago:</strong> {currencyBR(selectedSale.amount_paid || 0)}</div>
                    <div>
                      <strong>Restante:</strong>{" "}
                      {currencyBR(
                        Math.max(
                          0,
                          Number(selectedSale.total || 0) - Number(selectedSale.amount_paid || 0)
                        )
                      )}
                    </div>
                    <div>
                      <strong>Status:</strong> {getPaymentStatusLabel(selectedSale)}
                    </div>
                    <div>
                      <strong>Vencimento:</strong>{" "}
                      {selectedSale.due_date ? formatDate(selectedSale.due_date) : "—"}
                    </div>
                    <div>
                      <strong>Observações:</strong> {selectedSale.payment_notes || "—"}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                title="Nenhuma venda selecionada"
                description="Escolha uma venda da lista para visualizar os detalhes."
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}