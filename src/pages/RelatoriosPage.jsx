import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import Card from "../components/ui/Card";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import Button from "../components/ui/Button";
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

function inPeriod(dateStr, start, end) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const startOk = !start || d >= new Date(`${start}T00:00:00`);
  const endOk = !end || d <= new Date(`${end}T23:59:59`);
  return startOk && endOk;
}

function saleTotal(sale) {
  if (typeof sale.total === "number") return Number(sale.total || 0);

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

function nowDateInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function exportTableCsv(filename, headers, rows) {
  const csvContent = [
    headers.join(";"),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")
    ),
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildReportPdf(title, columns, rows, settings = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = 210;
  const rightX = pageWidth - margin;
  let y = 16;

  const companyName = settings.fantasyName || settings.companyName || "SOSPC";
  const footerText = settings.footerText || "Relatório emitido pelo sistema";
  const logo = settings.companyLogoDataUrl || "";

  const ensurePage = (needed = 10) => {
    if (y + needed > 280) {
      doc.addPage();
      y = 16;
    }
  };

  if (logo) {
    try {
      doc.addImage(logo, "PNG", margin, y - 2, 16, 16);
    } catch {
      try {
        doc.addImage(logo, "JPEG", margin, y - 2, 16, 16);
      } catch {}
    }
  }

  const titleX = logo ? margin + 22 : margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(companyName, titleX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(new Date().toLocaleString("pt-BR"), rightX, y, { align: "right" });
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, margin, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const usableWidth = pageWidth - margin * 2;
  const colWidths = columns.map(() => usableWidth / columns.length);

  let x = margin;
  columns.forEach((col, idx) => {
    doc.text(String(col), x + 1, y);
    x += colWidths[idx];
  });

  y += 2;
  doc.line(margin, y, rightX, y);
  y += 5;

  rows.forEach((row) => {
    const rowLines = row.map((cell, idx) =>
      doc.splitTextToSize(String(cell ?? "—"), colWidths[idx] - 2)
    );
    const rowHeight =
      Math.max(...rowLines.map((lines) => Math.max(1, lines.length))) * 4.5 + 1;

    ensurePage(rowHeight + 4);

    let colX = margin;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);

    rowLines.forEach((lines, idx) => {
      doc.text(lines, colX + 1, y);
      colX += colWidths[idx];
    });

    y += rowHeight;
    doc.setDrawColor(230);
    doc.line(margin, y - 1.5, rightX, y - 1.5);
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(footerText, margin, 286);

  return doc;
}

export default function RelatoriosPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sales, setSales] = useState([]);
  const [payables, setPayables] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [settings, setSettings] = useState({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("vendas");

  const [salesStartDate, setSalesStartDate] = useState(nowDateInput());
  const [salesEndDate, setSalesEndDate] = useState(nowDateInput());
  const [salesProductQuery, setSalesProductQuery] = useState("");

  const [osStartDate, setOsStartDate] = useState("");
  const [osEndDate, setOsEndDate] = useState("");
  const [osClientQuery, setOsClientQuery] = useState("");
  const [osEquipmentQuery, setOsEquipmentQuery] = useState("");
  const [osStatus, setOsStatus] = useState("");

  const [clientCityQuery, setClientCityQuery] = useState("");

  const [payablesStartDate, setPayablesStartDate] = useState("");
  const [payablesEndDate, setPayablesEndDate] = useState("");
  const [payablesQuery, setPayablesQuery] = useState("");

  const [receivablesStartDate, setReceivablesStartDate] = useState("");
  const [receivablesEndDate, setReceivablesEndDate] = useState("");
  const [receivablesQuery, setReceivablesQuery] = useState("");

  useEffect(() => {
    async function fetchData() {
      if (!tenantId) {
        setClients([]);
        setProducts([]);
        setOrders([]);
        setSales([]);
        setPayables([]);
        setReceivables([]);
        setSettings({});
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
          payablesRes,
          receivablesRes,
          settingsRes,
        ] = await Promise.all([
          supabase.from("clients").select("*").eq("tenant_id", tenantId),
          supabase.from("products").select("*").eq("tenant_id", tenantId),
          supabase.from("service_orders").select("*").eq("tenant_id", tenantId),
          supabase.from("sales").select("*").eq("tenant_id", tenantId),
          supabase.from("payables").select("*").eq("tenant_id", tenantId),
          supabase.from("receivables").select("*").eq("tenant_id", tenantId),
          supabase
            .from("tenant_settings")
            .select("*")
            .eq("tenant_id", tenantId)
            .maybeSingle(),
        ]);

        setClients(
          (clientsRes.data || []).map((item) => ({
            id: item.id,
            nome: item.nome || "",
            telefone1: item.telefone1 || "",
            whatsapp: item.whatsapp || "",
            cidade: item.cidade || "",
            createdAt: item.created_at,
          }))
        );

        setProducts(
          (productsRes.data || []).map((item) => ({
            id: item.id,
            nome: item.nome || "",
            categoria: item.categoria || "",
            marca: item.marca || "",
            estoqueAtual: String(item.estoque_atual ?? 0),
            createdAt: item.created_at,
          }))
        );

        setOrders(
          (ordersRes.data || []).map((item) => ({
            id: item.id,
            osNumber: item.os_number || "",
            clientName: item.client_name || "",
            status: item.status || "",
            equipmentType: item.equipment_type || "",
            equipmentBrand: item.equipment_brand || "",
            equipmentModel: item.equipment_model || "",
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
            clientName: item.client_name || "",
            paymentMethod: item.payment_method || "",
            createdAt: item.created_at,
            total: Number(item.total || 0),
            discount: Number(item.discount || 0),
            items: [],
          }))
        );

        setPayables(
          (payablesRes.data || []).map((item) => ({
            id: item.id,
            description: item.description || "",
            amount: Number(item.amount || 0),
            paidAmount: Number(item.paid_amount || 0),
            remainingAmount: Number(item.remaining_amount || 0),
            dueDate: item.due_date || "",
            category: item.category || "",
            notes: item.notes || "",
            paymentMethod: item.payment_method || "",
            createdBy: item.created_by || "",
            status: item.status || "open",
            createdAt: item.created_at,
          }))
        );

        setReceivables(
          (receivablesRes.data || []).map((item) => ({
            id: item.id,
            sourceType: item.source_type || "",
            sourceId: item.source_id || "",
            description: item.description || "",
            clientName: item.client_name || "",
            amount: Number(item.amount || 0),
            receivedAmount: Number(item.received_amount || 0),
            remainingAmount: Number(item.remaining_amount || 0),
            dueDate: item.due_date || "",
            category: item.category || "",
            notes: item.notes || "",
            paymentMethod: item.payment_method || "",
            status: item.status || "open",
            createdAt: item.created_at,
          }))
        );

        const settingsData = settingsRes.data;
        setSettings({
          companyName: settingsData?.company_name || "SOSPC",
          fantasyName: settingsData?.fantasy_name || "",
          cnpj: settingsData?.cnpj || "",
          address: settingsData?.address || "",
          phone: settingsData?.phone || "",
          whatsapp: settingsData?.whatsapp || "",
          email: settingsData?.email || "",
          footerText: settingsData?.footer_text || "Relatório emitido pelo sistema",
          osPrefix: settingsData?.os_prefix || "",
          acceptedPayments: Array.isArray(settingsData?.accepted_payments)
            ? settingsData.accepted_payments
            : [],
          companyLogoDataUrl: settingsData?.company_logo_data_url || "",
        });
      } catch (error) {
        console.error("Erro ao carregar relatórios:", error);
        setClients([]);
        setProducts([]);
        setOrders([]);
        setSales([]);
        setPayables([]);
        setReceivables([]);
        setSettings({});
      } finally {
        setIsLoaded(true);
      }
    }

    fetchData();
  }, [tenantId]);

  const vendasPeriodo = useMemo(() => {
    const q = salesProductQuery.trim().toLowerCase();

    return sales
      .filter((s) => inPeriod(s.createdAt, salesStartDate, salesEndDate))
      .filter((s) => {
        if (!q) return true;
        return [s.number, s.clientName, s.paymentMethod]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [sales, salesStartDate, salesEndDate, salesProductQuery]);

  function resolveReceivableClientName(item) {
    if (item?.clientName) return item.clientName;
    if (item?.sourceType === "sale") {
      const linkedSale = sales.find((sale) => sale.id === item.sourceId);
      return linkedSale?.clientName || "Balcão";
    }
    if (item?.sourceType === "order") {
      const linkedOrder = orders.find((order) => order.id === item.sourceId);
      return linkedOrder?.clientName || "Cliente não informado";
    }
    return "—";
  }

  const contasPagarFiltradas = useMemo(() => {
    const q = payablesQuery.trim().toLowerCase();
    return [...payables]
      .filter((item) => inPeriod(item.dueDate, payablesStartDate, payablesEndDate))
      .filter(
        (item) =>
          !q ||
          [item.description, item.category, item.notes, item.paymentMethod, item.createdBy]
            .join(" ")
            .toLowerCase()
            .includes(q)
      )
      .sort(
        (a, b) =>
          new Date(a.dueDate || a.createdAt || 0) - new Date(b.dueDate || b.createdAt || 0)
      );
  }, [payables, payablesQuery, payablesStartDate, payablesEndDate]);

  const contasReceberFiltradas = useMemo(() => {
    const q = receivablesQuery.trim().toLowerCase();
    return [...receivables]
      .filter((item) => inPeriod(item.dueDate, receivablesStartDate, receivablesEndDate))
      .filter(
        (item) =>
          !q ||
          [
            resolveReceivableClientName(item),
            item.description,
            item.category,
            item.notes,
            item.paymentMethod,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
      )
      .sort(
        (a, b) =>
          new Date(a.dueDate || a.createdAt || 0) - new Date(b.dueDate || b.createdAt || 0)
      );
  }, [receivables, receivablesQuery, receivablesStartDate, receivablesEndDate, sales, orders]);

  const clientesTodos = useMemo(() => {
    const q = clientCityQuery.trim().toLowerCase();
    return [...clients]
      .filter((c) => !q || String(c.cidade || "").toLowerCase().includes(q))
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  }, [clients, clientCityQuery]);

  const produtosTodos = useMemo(() => {
    return [...products].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  }, [products]);

  const ordensFiltradas = useMemo(() => {
    const clientQ = osClientQuery.trim().toLowerCase();
    const equipQ = osEquipmentQuery.trim().toLowerCase();

    return orders
      .filter((o) => inPeriod(o.createdAt, osStartDate, osEndDate))
      .filter((o) => !clientQ || String(o.clientName || "").toLowerCase().includes(clientQ))
      .filter(
        (o) =>
          !equipQ ||
          [o.equipmentType, o.equipmentBrand, o.equipmentModel]
            .join(" ")
            .toLowerCase()
            .includes(equipQ)
      )
      .filter((o) => !osStatus || o.status === osStatus)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, osStartDate, osEndDate, osClientQuery, osEquipmentQuery, osStatus]);

  const vendasResumo = useMemo(() => {
    const faturamento = vendasPeriodo.reduce((sum, sale) => sum + saleTotal(sale), 0);
    const ticketMedio = vendasPeriodo.length ? faturamento / vendasPeriodo.length : 0;
    return { faturamento, ticketMedio };
  }, [vendasPeriodo]);

  const osPorStatus = useMemo(() => {
    return ordensFiltradas.reduce((acc, order) => {
      acc[order.status || "Sem status"] = (acc[order.status || "Sem status"] || 0) + 1;
      return acc;
    }, {});
  }, [ordensFiltradas]);

  const allStatuses = useMemo(() => {
    return [...new Set(orders.map((o) => o.status).filter(Boolean))].sort();
  }, [orders]);

  const vendasRows = vendasPeriodo.map((item) => [
    item.number,
    item.clientName || "Balcão",
    currencyBR(saleTotal(item)),
    item.paymentMethod || "—",
    formatDate(item.createdAt),
  ]);

  const clientesRows = clientesTodos.map((item) => [
    item.nome || "—",
    item.telefone1 || "—",
    item.whatsapp || "—",
    item.cidade || "—",
    formatDate(item.createdAt),
  ]);

  const produtosRows = produtosTodos.map((item) => [
    item.nome || "—",
    item.categoria || "—",
    item.marca || "—",
    item.estoqueAtual || "0",
    formatDate(item.createdAt),
  ]);

  const contasPagarRows = contasPagarFiltradas.map((item) => [
    item.description || "—",
    item.category || "—",
    formatDate(item.dueDate),
    currencyBR(item.amount),
    currencyBR(item.paidAmount || 0),
    currencyBR(item.remainingAmount ?? item.amount),
    item.status === "paid" ? "Pago" : item.status === "partial" ? "Parcial" : "Em aberto",
  ]);

  const contasReceberRows = contasReceberFiltradas.map((item) => [
    resolveReceivableClientName(item),
    item.description || "—",
    formatDate(item.dueDate),
    currencyBR(item.amount),
    currencyBR(item.receivedAmount || 0),
    currencyBR(item.remainingAmount ?? item.amount),
    item.status === "received"
      ? "Recebido"
      : item.status === "partial"
        ? "Parcial"
        : "Em aberto",
  ]);

  const ordensRows = ordensFiltradas.map((item) => [
    item.osNumber,
    item.clientName || "—",
    item.status || "—",
    currencyBR(orderTotal(item)),
    formatDate(item.createdAt),
  ]);

  if (!tenantId || !isLoaded) {
    return (
      <div className="page-stack">
        <Card title="Relatórios">Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Relatórios"
        description="Relatórios de vendas, ordens de serviço, clientes e produtos."
      />

      <div className="report-tabs">
        <button
          type="button"
          className={`report-tab ${activeTab === "vendas" ? "active" : ""}`}
          onClick={() => setActiveTab("vendas")}
        >
          Vendas
        </button>
        <button
          type="button"
          className={`report-tab ${activeTab === "clientes" ? "active" : ""}`}
          onClick={() => setActiveTab("clientes")}
        >
          Clientes
        </button>
        <button
          type="button"
          className={`report-tab ${activeTab === "produtos" ? "active" : ""}`}
          onClick={() => setActiveTab("produtos")}
        >
          Produtos
        </button>
        <button
          type="button"
          className={`report-tab ${activeTab === "pagar" ? "active" : ""}`}
          onClick={() => setActiveTab("pagar")}
        >
          Contas a pagar
        </button>
        <button
          type="button"
          className={`report-tab ${activeTab === "receber" ? "active" : ""}`}
          onClick={() => setActiveTab("receber")}
        >
          Contas a receber
        </button>
        <button
          type="button"
          className={`report-tab ${activeTab === "os" ? "active" : ""}`}
          onClick={() => setActiveTab("os")}
        >
          Ordens de serviço
        </button>
      </div>

      {activeTab === "vendas" && (
        <Card title="Relatório de Vendas">
          <div className="form-grid form-grid-3">
            <label className="form-field">
              <span>Data inicial</span>
              <input type="date" value={salesStartDate} onChange={(e) => setSalesStartDate(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Data final</span>
              <input type="date" value={salesEndDate} onChange={(e) => setSalesEndDate(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Produto / cliente / pagamento</span>
              <input
                type="text"
                value={salesProductQuery}
                onChange={(e) => setSalesProductQuery(e.target.value)}
                placeholder="Filtrar vendas"
              />
            </label>
          </div>

          <div className="stats-grid" style={{ marginTop: 16 }}>
            <StatCard label="Vendas no período" value={String(vendasPeriodo.length)} hint="Quantidade de vendas" />
            <StatCard label="Faturamento" value={currencyBR(vendasResumo.faturamento)} hint="Soma das vendas" />
            <StatCard label="Ticket médio" value={currencyBR(vendasResumo.ticketMedio)} hint="Média por venda" />
          </div>

          <div className="header-actions" style={{ marginTop: 16 }}>
            <Button
              variant="secondary"
              onClick={() =>
                exportTableCsv(
                  "relatorio-vendas.csv",
                  ["Número", "Cliente", "Total", "Pagamento", "Data"],
                  vendasRows
                )
              }
            >
              Exportar CSV
            </Button>
            <Button
              onClick={() =>
                buildReportPdf(
                  "Relatório de Vendas",
                  ["Número", "Cliente", "Total", "Pagamento", "Data"],
                  vendasRows,
                  settings
                ).save("relatorio-vendas.pdf")
              }
            >
              Exportar PDF
            </Button>
          </div>

          {vendasPeriodo.length ? (
            <table className="data-table" style={{ marginTop: 16 }}>
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
                {vendasPeriodo.map((item) => (
                  <tr key={item.id}>
                    <td>{item.number}</td>
                    <td>{item.clientName || "Balcão"}</td>
                    <td>{currencyBR(saleTotal(item))}</td>
                    <td>{item.paymentMethod || "—"}</td>
                    <td>{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-inline" style={{ marginTop: 16 }}>
              Nenhuma venda no período selecionado.
            </div>
          )}
        </Card>
      )}

      {activeTab === "clientes" && (
        <Card title="Relatório de Clientes">
          <div className="form-grid form-grid-2">
            <label className="form-field">
              <span>Cidade</span>
              <input
                type="text"
                value={clientCityQuery}
                onChange={(e) => setClientCityQuery(e.target.value)}
                placeholder="Filtrar por cidade"
              />
            </label>
          </div>

          <div className="header-actions" style={{ marginTop: 16 }}>
            <Button
              variant="secondary"
              onClick={() =>
                exportTableCsv(
                  "relatorio-clientes.csv",
                  ["Nome", "Telefone", "WhatsApp", "Cidade", "Cadastro"],
                  clientesRows
                )
              }
            >
              Exportar CSV
            </Button>
            <Button
              onClick={() =>
                buildReportPdf(
                  "Relatório de Clientes",
                  ["Nome", "Telefone", "WhatsApp", "Cidade", "Cadastro"],
                  clientesRows,
                  settings
                ).save("relatorio-clientes.pdf")
              }
            >
              Exportar PDF
            </Button>
          </div>

          {clientesTodos.length ? (
            <table className="data-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>WhatsApp</th>
                  <th>Cidade</th>
                  <th>Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {clientesTodos.map((item) => (
                  <tr key={item.id}>
                    <td>{item.nome || "—"}</td>
                    <td>{item.telefone1 || "—"}</td>
                    <td>{item.whatsapp || "—"}</td>
                    <td>{item.cidade || "—"}</td>
                    <td>{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-inline" style={{ marginTop: 16 }}>
              Nenhum cliente encontrado.
            </div>
          )}
        </Card>
      )}

      {activeTab === "produtos" && (
        <Card title="Relatório de Produtos">
          <div className="header-actions">
            <Button
              variant="secondary"
              onClick={() =>
                exportTableCsv(
                  "relatorio-produtos.csv",
                  ["Produto", "Categoria", "Marca", "Estoque", "Cadastro"],
                  produtosRows
                )
              }
            >
              Exportar CSV
            </Button>
            <Button
              onClick={() =>
                buildReportPdf(
                  "Relatório de Produtos",
                  ["Produto", "Categoria", "Marca", "Estoque", "Cadastro"],
                  produtosRows,
                  settings
                ).save("relatorio-produtos.pdf")
              }
            >
              Exportar PDF
            </Button>
          </div>

          {produtosTodos.length ? (
            <table className="data-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Marca</th>
                  <th>Estoque</th>
                  <th>Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {produtosTodos.map((item) => (
                  <tr key={item.id}>
                    <td>{item.nome || "—"}</td>
                    <td>{item.categoria || "—"}</td>
                    <td>{item.marca || "—"}</td>
                    <td>{item.estoqueAtual || "0"}</td>
                    <td>{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-inline" style={{ marginTop: 16 }}>
              Nenhum produto cadastrado.
            </div>
          )}
        </Card>
      )}

      {activeTab === "pagar" && (
        <Card title="Relatório de Contas a Pagar">
          <div className="form-grid form-grid-3">
            <label className="form-field">
              <span>Vencimento inicial</span>
              <input type="date" value={payablesStartDate} onChange={(e) => setPayablesStartDate(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Vencimento final</span>
              <input type="date" value={payablesEndDate} onChange={(e) => setPayablesEndDate(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Nome / descrição</span>
              <input
                type="text"
                value={payablesQuery}
                onChange={(e) => setPayablesQuery(e.target.value)}
                placeholder="Descrição, categoria, observações..."
              />
            </label>
          </div>

          <div className="stats-grid" style={{ marginTop: 16 }}>
            <StatCard label="Contas filtradas" value={String(contasPagarFiltradas.length)} hint="Quantidade no filtro" />
            <StatCard
              label="Total"
              value={currencyBR(contasPagarFiltradas.reduce((sum, item) => sum + parseMoney(item.amount), 0))}
              hint="Soma das contas"
            />
            <StatCard
              label="Restante"
              value={currencyBR(
                contasPagarFiltradas.reduce(
                  (sum, item) => sum + parseMoney(item.remainingAmount ?? item.amount),
                  0
                )
              )}
              hint="Valor ainda em aberto"
            />
          </div>

          <div className="header-actions" style={{ marginTop: 16 }}>
            <Button
              variant="secondary"
              onClick={() =>
                exportTableCsv(
                  "relatorio-contas-pagar.csv",
                  ["Descrição", "Categoria", "Vencimento", "Total", "Pago", "Restante", "Status"],
                  contasPagarRows
                )
              }
            >
              Exportar CSV
            </Button>
            <Button
              onClick={() =>
                buildReportPdf(
                  "Relatório de Contas a Pagar",
                  ["Descrição", "Categoria", "Vencimento", "Total", "Pago", "Restante", "Status"],
                  contasPagarRows,
                  settings
                ).save("relatorio-contas-pagar.pdf")
              }
            >
              Exportar PDF
            </Button>
          </div>

          {contasPagarFiltradas.length ? (
            <table className="data-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Vencimento</th>
                  <th>Total</th>
                  <th>Pago</th>
                  <th>Restante</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contasPagarFiltradas.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description || "—"}</td>
                    <td>{item.category || "—"}</td>
                    <td>{formatDate(item.dueDate)}</td>
                    <td>{currencyBR(item.amount)}</td>
                    <td>{currencyBR(item.paidAmount || 0)}</td>
                    <td>{currencyBR(item.remainingAmount ?? item.amount)}</td>
                    <td>{item.status === "paid" ? "Pago" : item.status === "partial" ? "Parcial" : "Em aberto"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-inline" style={{ marginTop: 16 }}>
              Nenhuma conta a pagar encontrada com esses filtros.
            </div>
          )}
        </Card>
      )}

      {activeTab === "receber" && (
        <Card title="Relatório de Contas a Receber">
          <div className="form-grid form-grid-3">
            <label className="form-field">
              <span>Vencimento inicial</span>
              <input type="date" value={receivablesStartDate} onChange={(e) => setReceivablesStartDate(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Vencimento final</span>
              <input type="date" value={receivablesEndDate} onChange={(e) => setReceivablesEndDate(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Nome / descrição</span>
              <input
                type="text"
                value={receivablesQuery}
                onChange={(e) => setReceivablesQuery(e.target.value)}
                placeholder="Cliente, descrição, observações..."
              />
            </label>
          </div>

          <div className="stats-grid" style={{ marginTop: 16 }}>
            <StatCard label="Contas filtradas" value={String(contasReceberFiltradas.length)} hint="Quantidade no filtro" />
            <StatCard
              label="Total"
              value={currencyBR(contasReceberFiltradas.reduce((sum, item) => sum + parseMoney(item.amount), 0))}
              hint="Soma das contas"
            />
            <StatCard
              label="Restante"
              value={currencyBR(
                contasReceberFiltradas.reduce(
                  (sum, item) => sum + parseMoney(item.remainingAmount ?? item.amount),
                  0
                )
              )}
              hint="Valor ainda pendente"
            />
          </div>

          <div className="header-actions" style={{ marginTop: 16 }}>
            <Button
              variant="secondary"
              onClick={() =>
                exportTableCsv(
                  "relatorio-contas-receber.csv",
                  ["Cliente", "Descrição", "Vencimento", "Total", "Recebido", "Restante", "Status"],
                  contasReceberRows
                )
              }
            >
              Exportar CSV
            </Button>
            <Button
              onClick={() =>
                buildReportPdf(
                  "Relatório de Contas a Receber",
                  ["Cliente", "Descrição", "Vencimento", "Total", "Recebido", "Restante", "Status"],
                  contasReceberRows,
                  settings
                ).save("relatorio-contas-receber.pdf")
              }
            >
              Exportar PDF
            </Button>
          </div>

          {contasReceberFiltradas.length ? (
            <table className="data-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Descrição</th>
                  <th>Vencimento</th>
                  <th>Total</th>
                  <th>Recebido</th>
                  <th>Restante</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contasReceberFiltradas.map((item) => (
                  <tr key={item.id}>
                    <td>{resolveReceivableClientName(item)}</td>
                    <td>{item.description || "—"}</td>
                    <td>{formatDate(item.dueDate)}</td>
                    <td>{currencyBR(item.amount)}</td>
                    <td>{currencyBR(item.receivedAmount || 0)}</td>
                    <td>{currencyBR(item.remainingAmount ?? item.amount)}</td>
                    <td>{item.status === "received" ? "Recebido" : item.status === "partial" ? "Parcial" : "Em aberto"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-inline" style={{ marginTop: 16 }}>
              Nenhuma conta a receber encontrada com esses filtros.
            </div>
          )}
        </Card>
      )}

      {activeTab === "os" && (
        <Card title="Relatório de Ordens de Serviço">
          <div className="form-grid form-grid-3">
            <label className="form-field">
              <span>Data inicial</span>
              <input type="date" value={osStartDate} onChange={(e) => setOsStartDate(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Data final</span>
              <input type="date" value={osEndDate} onChange={(e) => setOsEndDate(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Cliente</span>
              <input
                type="text"
                value={osClientQuery}
                onChange={(e) => setOsClientQuery(e.target.value)}
                placeholder="Digite o nome do cliente"
              />
            </label>
            <label className="form-field">
              <span>Equipamento</span>
              <input
                type="text"
                value={osEquipmentQuery}
                onChange={(e) => setOsEquipmentQuery(e.target.value)}
                placeholder="Ex: notebook, impressora, monitor"
              />
            </label>
            <label className="form-field">
              <span>Status</span>
              <select value={osStatus} onChange={(e) => setOsStatus(e.target.value)}>
                <option value="">Todos</option>
                {allStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="stats-grid" style={{ marginTop: 16 }}>
            <StatCard label="OS filtradas" value={String(ordensFiltradas.length)} hint="Quantidade no filtro" />
            <StatCard
              label="Valor total das OS"
              value={currencyBR(ordensFiltradas.reduce((sum, item) => sum + orderTotal(item), 0))}
              hint="Soma das ordens filtradas"
            />
          </div>

          <div className="header-actions" style={{ marginTop: 16 }}>
            <Button
              variant="secondary"
              onClick={() =>
                exportTableCsv(
                  "relatorio-ordens-servico.csv",
                  ["Número OS", "Cliente", "Status", "Total", "Data"],
                  ordensRows
                )
              }
            >
              Exportar CSV
            </Button>
            <Button
              onClick={() =>
                buildReportPdf(
                  "Relatório de Ordens de Serviço",
                  ["Número OS", "Cliente", "Status", "Total", "Data"],
                  ordensRows,
                  settings
                ).save("relatorio-ordens-servico.pdf")
              }
            >
              Exportar PDF
            </Button>
          </div>

          {ordensFiltradas.length ? (
            <table className="data-table" style={{ marginTop: 16 }}>
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
                {ordensFiltradas.map((item) => (
                  <tr key={item.id}>
                    <td>{item.osNumber}</td>
                    <td>{item.clientName || "—"}</td>
                    <td>{item.status || "—"}</td>
                    <td>{currencyBR(orderTotal(item))}</td>
                    <td>{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-inline" style={{ marginTop: 16 }}>
              Nenhuma OS encontrada com esses filtros.
            </div>
          )}

          <div className="dashboard-grid" style={{ marginTop: 16 }}>
            <Card title="OS por status">
              {Object.keys(osPorStatus).length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Quantidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(osPorStatus).map(([status, quantidade]) => (
                      <tr key={status}>
                        <td>{status}</td>
                        <td>{quantidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-inline">Nenhuma OS no filtro.</div>
              )}
            </Card>
          </div>
        </Card>
      )}
    </div>
  );
}