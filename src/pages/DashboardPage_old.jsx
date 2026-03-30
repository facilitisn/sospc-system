import Card from "../components/ui/Card";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import Button from "../components/ui/Button";
import { useEffect, useMemo, useState } from "react";
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

function sameDay(dateStr, ref = new Date()) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;

  return (
    d.getDate() === ref.getDate() &&
    d.getMonth() === ref.getMonth() &&
    d.getFullYear() === ref.getFullYear()
  );
}

function saleTotal(sale) {
  if (typeof sale.total === "number") return Number(sale.total || 0);
  if (typeof sale.finalTotal === "number") return Number(sale.finalTotal || 0);

  const subtotal = (sale.items || []).reduce(
    (sum, item) => sum + parseQty(item.qty) * parseMoney(item.unitValue),
    0
  );

  const discount = parseMoney(sale.discount);
  return Math.max(0, subtotal - discount);
}

function orderTotal(order) {
  if (typeof order.total === "number") return Number(order.total || 0);

  const services = (order.services || []).reduce(
    (sum, item) => sum + parseMoney(item.value),
    0
  );

  const parts = (order.parts || []).reduce(
    (sum, item) => sum + parseQty(item.qty) * parseMoney(item.unitValue),
    0
  );

  const discount = parseMoney(order.discount);
  return Math.max(0, services + parts - discount);
}

function buildMonthlyRevenue(sales) {
  const now = new Date();
  const points = [];

  for (let i = 5; i >= 0; i -= 1) {
    const current = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = current
      .toLocaleDateString("pt-BR", { month: "short" })
      .replace(".", "");
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;

    points.push({ key, label, total: 0, salesCount: 0 });
  }

  for (const sale of sales) {
    const rawDate = sale.createdAt || sale.created_at;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) continue;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const point = points.find((item) => item.key === key);
    if (!point) continue;

    point.total += saleTotal(sale);
    point.salesCount += 1;
  }

  return points;
}

function buildMonthlyOrders(orders) {
  const now = new Date();
  const points = [];

  for (let i = 5; i >= 0; i -= 1) {
    const current = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = current
      .toLocaleDateString("pt-BR", { month: "short" })
      .replace(".", "");
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;

    points.push({ key, label, total: 0, ordersCount: 0, openCount: 0 });
  }

  for (const order of orders) {
    const rawDate = order.createdAt || order.created_at;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) continue;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const point = points.find((item) => item.key === key);
    if (!point) continue;

    point.total += orderTotal(order);
    point.ordersCount += 1;

    const status = String(order.status || "").toLowerCase();
    const isOpen = [
      "aberta",
      "em análise",
      "em analise",
      "aguardando aprovação",
      "aguardando aprovacao",
      "aprovada",
      "em andamento",
      "aguardando peça",
      "aguardando peca",
      "pronta",
    ].includes(status);

    if (isOpen) point.openCount += 1;
  }

  return points;
}

function statusClass(status) {
  const value = String(status || "").toLowerCase();

  if (value.includes("pronta") || value.includes("entreg")) return "pill";
  if (value.includes("andamento") || value.includes("aprova")) return "pill";

  return "pill pill-neutral";
}

function RevenueChart({ salesPoints, orderPoints }) {
  const [mode, setMode] = useState("revenue");

  const chart = useMemo(() => {
    if (mode === "sales") {
      return {
        title: "Quantidade de vendas nos últimos 6 meses",
        subtitle: "Volume de vendas registradas por mês",
        legend: "Vendas",
        points: salesPoints.map((item) => ({
          key: item.key,
          label: item.label,
          value: item.salesCount,
          formatted: `${item.salesCount} venda(s)`,
          meta: currencyBR(item.total),
        })),
      };
    }

    if (mode === "orders") {
      return {
        title: "Ordens abertas por mês",
        subtitle: "Quantidade de ordens que ficaram abertas no mês de criação",
        legend: "OS abertas",
        points: orderPoints.map((item) => ({
          key: item.key,
          label: item.label,
          value: item.openCount,
          formatted: `${item.openCount} OS`,
          meta: `${item.ordersCount} OS criada(s)`,
        })),
      };
    }

    return {
      title: "Faturamento dos últimos 6 meses",
      subtitle: "Baseado nas vendas registradas no sistema",
      legend: "Faturamento",
      points: salesPoints.map((item) => ({
        key: item.key,
        label: item.label,
        value: item.total,
        formatted: currencyBR(item.total),
        meta: `${item.salesCount} venda(s)`,
      })),
    };
  }, [mode, orderPoints, salesPoints]);

  const max = Math.max(...chart.points.map((item) => item.value), 0);

  return (
    <div className="revenue-chart">
      <div className="revenue-chart-head">
        <div>
          <div className="chart-title">{chart.title}</div>
          <div className="chart-subtitle">{chart.subtitle}</div>
        </div>

        <div className="chart-actions">
          <button
            type="button"
            className={`chart-tab ${mode === "revenue" ? "active" : ""}`}
            onClick={() => setMode("revenue")}
          >
            Faturamento
          </button>

          <button
            type="button"
            className={`chart-tab ${mode === "sales" ? "active" : ""}`}
            onClick={() => setMode("sales")}
          >
            Vendas
          </button>

          <button
            type="button"
            className={`chart-tab ${mode === "orders" ? "active" : ""}`}
            onClick={() => setMode("orders")}
          >
            OS abertas
          </button>
        </div>
      </div>

      <div className="chart-legend">
        <span className="legend-dot" />
        <span>{chart.legend}</span>
      </div>

      <div className="revenue-chart-bars">
        {chart.points.map((item) => {
          const height =
            max > 0 ? Math.max(14, Math.round((item.value / max) * 220)) : 14;

          return (
            <div className="revenue-bar-column" key={item.key}>
              <div className="revenue-bar-value">{item.formatted}</div>

              <div className="revenue-bar-track">
                <div
                  className="revenue-bar-fill"
                  style={{ height: `${height}px` }}
                  title={`${item.label}: ${item.formatted}`}
                />
              </div>

              <div className="revenue-bar-label">{item.label}</div>
              <div className="revenue-bar-meta">{item.meta}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sales, setSales] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [payables, setPayables] = useState([]);
  const [cashflow, setCashflow] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function fetchDashboardData() {
      if (!tenantId) {
        setIsLoaded(false);
        return;
      }

      try {
        setIsLoaded(false);

        const [
          clientsRes,
          productsRes,
          ordersRes,
          salesRes,
          receivablesRes,
          payablesRes,
          cashflowRes,
        ] = await Promise.all([
          supabase.from("clients").select("*").eq("tenant_id", tenantId),
          supabase.from("products").select("*").eq("tenant_id", tenantId),
          supabase.from("service_orders").select("*").eq("tenant_id", tenantId),
          supabase.from("sales").select("*").eq("tenant_id", tenantId),
          supabase.from("receivables").select("*").eq("tenant_id", tenantId),
          supabase.from("payables").select("*").eq("tenant_id", tenantId),
          supabase.from("cashflow").select("*").eq("tenant_id", tenantId),
        ]);

        setClients(clientsRes.data || []);
        setProducts(productsRes.data || []);

        setOrders(
          (ordersRes.data || []).map((item) => ({
            id: item.id,
            osNumber: item.os_number || "",
            clientName: item.client_name || "",
            status: item.status || "",
            createdAt: item.created_at,
            total: Number(item.total || 0),
            discount: Number(item.discount || 0),
            services: [],
            parts: [],
          }))
        );

        setSales(
          (salesRes.data || []).map((item) => ({
            id: item.id,
            number: item.number || "",
            clientName: item.client_name || item.customer_name || "",
            paymentMethod: item.payment_method || "",
            createdAt: item.created_at,
            total: Number(item.total || 0),
            discount: Number(item.discount || 0),
            items: [],
          }))
        );

        setReceivables(receivablesRes.data || []);
        setPayables(payablesRes.data || []);
        setCashflow(cashflowRes.data || []);
      } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
        setClients([]);
        setProducts([]);
        setOrders([]);
        setSales([]);
        setReceivables([]);
        setPayables([]);
        setCashflow([]);
      } finally {
        setIsLoaded(true);
      }
    }

    fetchDashboardData();
  }, [tenantId]);

  const data = useMemo(() => {
    const today = new Date();

    const openOrders = orders.filter((o) =>
      [
        "Aberta",
        "Em análise",
        "Aguardando aprovação",
        "Aprovada",
        "Em andamento",
        "Aguardando peça",
      ].includes(o.status)
    );

    const readyOrders = orders.filter((o) => o.status === "Pronta");
    const inProgressOrders = orders.filter((o) => o.status === "Em andamento");

    const todaySales = sales.filter((s) => sameDay(s.createdAt || s.created_at, today));
    const todayRevenue = todaySales.reduce((sum, sale) => sum + saleTotal(sale), 0);

    const lowStock = products.filter(
      (p) =>
        Number(p.estoque_atual || p.estoqueAtual || 0) <=
        Number(p.estoque_minimo || p.estoqueMinimo || 0)
    );

    const averageTicket = todaySales.length ? todayRevenue / todaySales.length : 0;

    const recentOrders = [...orders]
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.created_at) -
          new Date(a.createdAt || a.created_at)
      )
      .slice(0, 5);

    const recentSales = [...sales]
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.created_at) -
          new Date(a.createdAt || a.created_at)
      )
      .slice(0, 5);

    const monthlyRevenue = buildMonthlyRevenue(sales);
    const monthlyOrders = buildMonthlyOrders(orders);

    const todayReceivables = receivables.filter((item) =>
      sameDay(item.due_date || item.dueDate, today)
    );

    const receivableTodayTotal = todayReceivables.reduce((sum, item) => {
      const amount = Number(item.amount || 0);
      const paid = Number(item.received_amount || item.receivedAmount || 0);
      return sum + Math.max(0, amount - paid);
    }, 0);

    const todayPayables = payables.filter((item) =>
      sameDay(item.due_date || item.dueDate, today)
    );

    const payableTodayTotal = todayPayables.reduce((sum, item) => {
      const amount = Number(item.amount || 0);
      const paid = Number(item.paid_amount || item.paidAmount || 0);
      return sum + Math.max(0, amount - paid);
    }, 0);

    const todayCash = cashflow.filter((item) =>
      sameDay(item.created_at || item.createdAt, today)
    );

    const cashIn = todayCash
      .filter((item) => String(item.type || "").toLowerCase() === "entrada")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const cashOut = todayCash
      .filter((item) => String(item.type || "").toLowerCase() === "saida")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return {
      openOrders,
      readyOrders,
      inProgressOrders,
      todaySales,
      todayRevenue,
      averageTicket,
      lowStock,
      recentOrders,
      recentSales,
      monthlyRevenue,
      monthlyOrders,
      receivableTodayTotal,
      payableTodayTotal,
      cashIn,
      cashOut,
    };
  }, [orders, sales, products, receivables, payables, cashflow]);

  if (!tenantId || !isLoaded) {
    return (
      <div className="page-stack">
        <Card title="Dashboard">Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Dashboard"
        description="Resumo geral do sistema."
        action={
          <div className="header-actions">
            <Button onClick={() => window.location.reload()}>Atualizar</Button>
            <Button onClick={() => window.location.assign("/ordens-servico")}>
              Nova OS
            </Button>
            <Button
              variant="secondary"
              onClick={() => window.location.assign("/pdv")}
            >
              Nova venda
            </Button>
          </div>
        }
      />

      <div className="stats-grid">
        <StatCard
          label="Clientes"
          value={String(clients.length)}
          hint="Cadastros ativos no sistema"
        />
        <StatCard
          label="Produtos"
          value={String(products.length)}
          hint="Itens cadastrados"
        />
        <StatCard
          label="OS abertas"
          value={String(data.openOrders.length)}
          hint="Ainda em andamento"
        />
        <StatCard
          label="OS em andamento"
          value={String(data.inProgressOrders.length)}
          hint="Serviços em execução"
        />
        <StatCard
          label="OS prontas"
          value={String(data.readyOrders.length)}
          hint="Prontas para entrega"
        />
        <StatCard
          label="Vendas do dia"
          value={String(data.todaySales.length)}
          hint="Atendimentos registrados hoje"
        />
        <StatCard
          label="Faturamento do dia"
          value={currencyBR(data.todayRevenue)}
          hint="Total das vendas de hoje"
        />
        <StatCard
          label="Ticket médio"
          value={currencyBR(data.averageTicket)}
          hint="Média das vendas do dia"
        />
        <StatCard
          label="A receber hoje"
          value={currencyBR(data.receivableTodayTotal)}
          hint="Vencimentos do dia"
        />
        <StatCard
          label="A pagar hoje"
          value={currencyBR(data.payableTodayTotal)}
          hint="Pagamentos do dia"
        />
        <StatCard
          label="Caixa hoje"
          value={currencyBR(data.cashIn - data.cashOut)}
          hint={`Entradas ${currencyBR(data.cashIn)} • Saídas ${currencyBR(data.cashOut)}`}
        />
        <StatCard
          label="Estoque baixo"
          value={String(data.lowStock.length)}
          hint="Produtos abaixo do mínimo"
        />
      </div>

      <Card title="Indicadores mensais">
        <RevenueChart
          salesPoints={data.monthlyRevenue}
          orderPoints={data.monthlyOrders}
        />
      </Card>

      <div className="dashboard-grid">
        <Card title="Últimas ordens de serviço">
          {data.recentOrders.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nº OS</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((item) => (
                  <tr key={item.id}>
                    <td>{item.osNumber || item.os_number || item.id}</td>
                    <td>{item.clientName || item.client_name || "—"}</td>
                    <td>
                      <span className={statusClass(item.status)}>
                        {item.status || "—"}
                      </span>
                    </td>
                    <td>{currencyBR(orderTotal(item))}</td>
                    <td>{formatDate(item.createdAt || item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-inline">Nenhuma OS cadastrada ainda.</div>
          )}
        </Card>

        <Card title="Últimas vendas">
          {data.recentSales.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Pagamento</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((item) => (
                  <tr key={item.id}>
                    <td>{item.number || item.saleNumber || item.sale_number || item.id}</td>
                    <td>{item.clientName || item.customer_name || "Balcão"}</td>
                    <td>{currencyBR(saleTotal(item))}</td>
                    <td>{item.paymentMethod || item.payment_method || "—"}</td>
                    <td>{formatDate(item.createdAt || item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-inline">Nenhuma venda cadastrada ainda.</div>
          )}
        </Card>

        <Card title="Produtos com estoque baixo">
          {data.lowStock.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Atual</th>
                  <th>Mínimo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.slice(0, 10).map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.nome || [item.brand, item.model].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td>{item.estoque_atual ?? item.estoqueAtual ?? 0}</td>
                    <td>{item.estoque_minimo ?? item.estoqueMinimo ?? 0}</td>
                    <td>
                      <span className="pill pill-danger">Baixo</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-inline">Nenhum produto com estoque crítico.</div>
          )}
        </Card>
      </div>
    </div>
  );
}