import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import PageHeader from "../components/ui/PageHeader";
import StatusBanner from "../components/ui/StatusBanner";
import StatCard from "../components/ui/StatCard";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/auth.jsx";
import { supabase } from "../lib/supabase";
import usePageHotkeys from "../hooks/usePageHotkeys";

const PAYMENT_METHODS = [
  "Dinheiro",
  "Pix",
  "Crédito",
  "Débito",
  "Boleto",
  "Transferência",
  "Outros",
];

const SPLIT_PAYMENT_MARKER_START = "[[SETTLEMENT_SPLIT]]";
const SPLIT_PAYMENT_MARKER_END = "[[/SETTLEMENT_SPLIT]]";

function createPaymentSplit(method = "Pix", amount = "") {
  return {
    id: crypto.randomUUID(),
    method,
    amount: String(amount ?? ""),
  };
}

function getPaymentSplitEntries(paymentSplits = []) {
  return (paymentSplits || []).filter(
    (item) => (item.method || "").trim() || parseMoney(item.amount) > 0
  );
}

function sumPaymentSplits(paymentSplits = []) {
  return getPaymentSplitEntries(paymentSplits).reduce((sum, item) => sum + parseMoney(item.amount), 0);
}

function getPaymentMethodLabel(paymentMethod = "", paymentSplits = [], splitEnabled = false) {
  if (!splitEnabled) return paymentMethod || "Não informado";

  const methods = [
    ...new Set(getPaymentSplitEntries(paymentSplits).map((item) => item.method).filter(Boolean)),
  ];

  return methods.length ? methods.join(" + ") : paymentMethod || "Não informado";
}

function serializeSettlementLog(paymentSplits = [], notes = "") {
  const validSplits = getPaymentSplitEntries(paymentSplits).map((item) => ({
    method: item.method || "Pix",
    amount: parseMoney(item.amount),
  }));

  const payload = JSON.stringify({
    paymentSplits: validSplits,
    notes: String(notes || "").trim(),
  });

  return `${SPLIT_PAYMENT_MARKER_START}${payload}${SPLIT_PAYMENT_MARKER_END}`;
}

function buildSettlementNote(existingNotes = "", paymentSplits = [], notes = "", verb = "Recebimento") {
  const summary = getPaymentSplitEntries(paymentSplits)
    .map((item) => `${item.method || "Pix"}: ${currencyBR(parseMoney(item.amount))}`)
    .join(" | ");

  const timestamp = formatDateTime(new Date().toISOString());
  const extra = String(notes || "").trim();
  const marker = serializeSettlementLog(paymentSplits, extra);
  const line = `${verb} em ${timestamp} — ${summary}${extra ? ` — ${extra}` : ""}`;

  return [String(existingNotes || "").trim(), line, marker].filter(Boolean).join("\n");
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

function currencyBR(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

function dateInputValue(date = new Date()) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function inPeriod(dateStr, start, end) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const startOk = !start || d >= new Date(`${start}T00:00:00`);
  const endOk = !end || d <= new Date(`${end}T23:59:59`);
  return startOk && endOk;
}

function manualCashEmpty() {
  return {
    type: "saida",
    description: "",
    amount: "",
    paymentMethod: "Pix",
    date: dateInputValue(),
  };
}

function accountEmpty(type) {
  return {
    description: "",
    amount: "",
    dueDate: dateInputValue(),
    category: type === "payable" ? "Fornecedor" : "Cliente",
    notes: "",
    paymentMethod: "Pix",
  };
}

function entryFromSale(sale) {
  return {
    id: `sale:${sale.id}`,
    sourceType: "sale",
    sourceId: sale.id,
    type: "entrada",
    description: `Venda ${sale.number}`,
    amount: Number(sale.paidAmount ?? sale.amountPaid ?? 0),
    paymentMethod: sale.paymentMethod || "Não informado",
    date: sale.createdAt,
    createdBy: sale.createdByName || "",
    createdByRole: sale.createdByRole || "",
    createdAt: sale.createdAt,
  };
}

function entryFromOrder(order) {
  return {
    id: `order:${order.id}`,
    sourceType: "order",
    sourceId: order.id,
    type: "entrada",
    description: `OS ${order.osNumber}`,
    amount: Number(order.paidAmount ?? order.amountPaid ?? 0),
    paymentMethod: order.paymentMethod || "Não informado",
    date: order.updatedAt || order.createdAt,
    createdBy: order.createdByName || "",
    createdByRole: order.createdByRole || "",
    createdAt: order.updatedAt || order.createdAt,
  };
}

export default function FinanceiroPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const toast = useToast();

  const [manualEntries, setManualEntries] = useState([]);
  const [payables, setPayables] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [sales, setSales] = useState([]);
  const [orders, setOrders] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [cashForm, setCashForm] = useState(manualCashEmpty());
  const [payableForm, setPayableForm] = useState(accountEmpty("payable"));
  const [receivableForm, setReceivableForm] = useState(accountEmpty("receivable"));

  const [settlementDialog, setSettlementDialog] = useState(null);

  const [payableQuery, setPayableQuery] = useState("");
  const [payableStartDate, setPayableStartDate] = useState("");
  const [payableEndDate, setPayableEndDate] = useState("");

  const [receivableQuery, setReceivableQuery] = useState("");
  const [receivableStartDate, setReceivableStartDate] = useState("");
  const [receivableEndDate, setReceivableEndDate] = useState("");

  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("resumo");
  const historySearchRef = useRef(null);
  const payableSearchRef = useRef(null);
  const receivableSearchRef = useRef(null);
  const [startDate, setStartDate] = useState(
    dateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  );
  const [endDate, setEndDate] = useState(dateInputValue());

  function focusActiveSearch() {
    if (activeTab === "pagar") {
      payableSearchRef.current?.focus();
      payableSearchRef.current?.select?.();
      return;
    }

    if (activeTab === "receber") {
      receivableSearchRef.current?.focus();
      receivableSearchRef.current?.select?.();
      return;
    }

    historySearchRef.current?.focus();
    historySearchRef.current?.select?.();
  }

  function closeSettlementDialog() {
    setSettlementDialog(null);
  }

  function updateSettlementField(field, value) {
    setSettlementDialog((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function updateSettlementSplit(splitId, field, value) {
    setSettlementDialog((prev) =>
      prev
        ? {
            ...prev,
            paymentSplits: (prev.paymentSplits || []).map((item) =>
              item.id === splitId ? { ...item, [field]: value } : item
            ),
          }
        : prev
    );
  }

  function addSettlementSplit() {
    setSettlementDialog((prev) =>
      prev
        ? {
            ...prev,
            splitEnabled: true,
            paymentSplits: [...(prev.paymentSplits || []), createPaymentSplit("Pix", "")],
          }
        : prev
    );
  }

  function removeSettlementSplit(splitId) {
    setSettlementDialog((prev) => {
      if (!prev) return prev;
      const nextSplits = (prev.paymentSplits || []).filter((item) => item.id !== splitId);
      return {
        ...prev,
        paymentSplits: nextSplits.length ? nextSplits : [createPaymentSplit(prev.paymentMethod || "Pix", prev.amount || "")],
      };
    });
  }

  function openSettlementDialog(type, item) {
    const remaining = Number(item?.remainingAmount ?? item?.amount ?? 0);
    setSettlementDialog({
      type,
      itemId: item.id,
      title: type === "payable" ? "Registrar pagamento" : "Registrar recebimento",
      confirmLabel: type === "payable" ? "Confirmar pagamento" : "Confirmar recebimento",
      description: item.description || "",
      clientName: resolveReceivableClientName(item),
      category: item.category || "",
      paymentMethod: item.paymentMethod || "Pix",
      amount: String(remaining).replace(".", ","),
      maxAmount: remaining,
      splitEnabled: false,
      paymentSplits: [createPaymentSplit(item.paymentMethod || "Pix", String(remaining).replace(".", ","))],
      notes: "",
      isSubmitting: false,
    });
  }

  usePageHotkeys(
    [
      { combo: "/", handler: () => focusActiveSearch() },
      { combo: "primary+1", handler: () => setActiveTab("resumo"), allowInInput: true },
      { combo: "primary+2", handler: () => setActiveTab("lancamentos"), allowInInput: true },
      { combo: "primary+3", handler: () => setActiveTab("pagar"), allowInInput: true },
      { combo: "primary+4", handler: () => setActiveTab("receber"), allowInInput: true },
      { combo: "primary+5", handler: () => setActiveTab("historico"), allowInInput: true },
      {
        combo: "escape",
        handler: () => {
          if (document.activeElement === payableSearchRef.current) setPayableQuery("");
          if (document.activeElement === receivableSearchRef.current) setReceivableQuery("");
          if (document.activeElement === historySearchRef.current) setQuery("");
        },
      },
    ],
    Boolean(tenantId && isLoaded)
  );

  useEffect(() => {
    async function fetchData() {
      if (!tenantId) {
        setManualEntries([]);
        setPayables([]);
        setReceivables([]);
        setSales([]);
        setOrders([]);
        setIsLoaded(true);
        return;
      }

      const [cashRes, payablesRes, receivablesRes, salesRes, ordersRes] = await Promise.all([
        supabase
          .from("cashflow")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),

        supabase
          .from("payables")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("due_date", { ascending: true }),

        supabase
          .from("receivables")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("due_date", { ascending: true }),

        supabase
          .from("sales")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),

        supabase
          .from("service_orders")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),
      ]);

      if (cashRes.error) console.error("Erro ao carregar caixa:", cashRes.error);
      if (payablesRes.error) console.error("Erro ao carregar contas a pagar:", payablesRes.error);
      if (receivablesRes.error) console.error("Erro ao carregar contas a receber:", receivablesRes.error);
      if (salesRes.error) console.error("Erro ao carregar vendas:", salesRes.error);
      if (ordersRes.error) console.error("Erro ao carregar OS:", ordersRes.error);

      const mappedCash = (cashRes.data || []).map((item) => ({
        id: item.id,
        tenant_id: item.tenant_id || tenantId,
        sourceType: item.source_type || "",
        sourceId: item.source_id || "",
        type: item.type || "entrada",
        description: item.description || "",
        amount: Number(item.amount || 0),
        paymentMethod: item.payment_method || "",
        date: item.created_at,
        createdBy: item.created_by || "",
        createdByRole: item.created_by_role || "",
        createdAt: item.created_at,
      }));

      const mappedPayables = (payablesRes.data || []).map((item) => ({
        id: item.id,
        tenant_id: item.tenant_id || tenantId,
        description: item.description || "",
        amount: Number(item.amount || 0),
        paidAmount: Number(item.paid_amount || 0),
        remainingAmount: Number(item.remaining_amount || 0),
        dueDate: item.due_date || "",
        category: item.category || "",
        notes: item.notes || "",
        paymentMethod: item.payment_method || "",
        status: item.status || "open",
        createdAt: item.created_at,
        createdBy: item.created_by || "",
        paidAt: item.paid_at || "",
      }));

      const mappedReceivables = (receivablesRes.data || []).map((item) => ({
        id: item.id,
        tenant_id: item.tenant_id || tenantId,
        sourceType: item.source_type || "",
        sourceId: item.source_id || "",
        description: item.description || "",
        clientName: item.client_name || "",
        amount: Number(item.amount || 0),
        receivedAmount: Number(item.received_amount || 0),
        sourcePaidAmount: Number(item.source_paid_amount || 0),
        remainingAmount: Number(item.remaining_amount || 0),
        dueDate: item.due_date || "",
        category: item.category || "",
        notes: item.notes || "",
        paymentMethod: item.payment_method || "",
        status: item.status || "open",
        createdAt: item.created_at,
        createdBy: item.created_by || "",
        receivedAt: item.received_at || "",
      }));

      const mappedSales = (salesRes.data || []).map((item) => ({
        id: item.id,
        tenant_id: item.tenant_id || tenantId,
        number: item.number || "",
        clientName: item.client_name || "",
        paymentMethod: item.payment_method || "",
        paidAmount: Number(item.paid_amount || item.amount_paid || 0),
        amountPaid: Number(item.amount_paid || 0),
        createdAt: item.created_at,
        createdByName: item.created_by_name || "",
        createdByRole: item.created_by_role || "",
        items: [],
        discount: Number(item.discount || 0),
        total: Number(item.total || 0),
      }));

      const mappedOrders = (ordersRes.data || []).map((item) => ({
        id: item.id,
        tenant_id: item.tenant_id || tenantId,
        osNumber: item.os_number || "",
        paymentMethod: item.payment_method || "",
        paidAmount: Number(item.paid_amount || item.amount_paid || 0),
        amountPaid: Number(item.amount_paid || 0),
        createdAt: item.created_at,
        updatedAt: item.updated_at || item.created_at,
        createdByName: item.created_by_name || "",
        createdByRole: item.created_by_role || "",
        clientName: item.client_name || "",
        status: item.status || "",
        services: [],
        parts: [],
        discount: Number(item.discount || 0),
        total: Number(item.total || 0),
      }));

      setManualEntries(mappedCash);
      setPayables(mappedPayables);
      setReceivables(mappedReceivables);
      setSales(mappedSales);
      setOrders(mappedOrders);
      setIsLoaded(true);

      if (
        cashRes.error ||
        payablesRes.error ||
        receivablesRes.error ||
        salesRes.error ||
        ordersRes.error
      ) {
        toast.warning("Alguns dados do financeiro não puderam ser carregados completamente.");
      }
    }

    fetchData();
  }, [tenantId, toast]);

  const automaticEntries = useMemo(() => {
    return [
      ...sales.map(entryFromSale).filter((item) => Number(item.amount || 0) > 0),
      ...orders.map(entryFromOrder).filter((item) => Number(item.amount || 0) > 0),
    ];
  }, [sales, orders]);

  const combinedEntries = useMemo(() => {
    return [...manualEntries, ...automaticEntries].sort(
      (a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)
    );
  }, [manualEntries, automaticEntries]);

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return combinedEntries
      .filter((item) => inPeriod(item.date || item.createdAt, startDate, endDate))
      .filter(
        (item) =>
          !q ||
          [item.description, item.paymentMethod, item.type, item.createdBy]
            .join(" ")
            .toLowerCase()
            .includes(q)
      );
  }, [combinedEntries, startDate, endDate, query]);

  const totals = useMemo(() => {
    const entradas = filteredEntries
      .filter((item) => item.type === "entrada")
      .reduce((sum, item) => sum + parseMoney(item.amount), 0);

    const saidas = filteredEntries
      .filter((item) => item.type === "saida")
      .reduce((sum, item) => sum + parseMoney(item.amount), 0);

    return { entradas, saidas, saldoPeriodo: entradas - saidas };
  }, [filteredEntries]);

  const saldoGeral = useMemo(() => {
    const entradas = combinedEntries
      .filter((item) => item.type === "entrada")
      .reduce((sum, item) => sum + parseMoney(item.amount), 0);

    const saidas = combinedEntries
      .filter((item) => item.type === "saida")
      .reduce((sum, item) => sum + parseMoney(item.amount), 0);

    return entradas - saidas;
  }, [combinedEntries]);

  const currentMonthKey = monthKey(new Date());

  const monthEntries = useMemo(
    () => combinedEntries.filter((item) => monthKey(item.date || item.createdAt) === currentMonthKey),
    [combinedEntries, currentMonthKey]
  );

  const monthlySummary = useMemo(() => {
    const entradas = monthEntries
      .filter((item) => item.type === "entrada")
      .reduce((sum, item) => sum + parseMoney(item.amount), 0);

    const saidas = monthEntries
      .filter((item) => item.type === "saida")
      .reduce((sum, item) => sum + parseMoney(item.amount), 0);

    return {
      entradas,
      saidas,
      saldo: entradas - saidas,
      qtdEntradas: monthEntries.filter((item) => item.type === "entrada").length,
      qtdSaidas: monthEntries.filter((item) => item.type === "saida").length,
    };
  }, [monthEntries]);

  const openPayables = useMemo(
    () =>
      [...payables]
        .filter((item) => Number(item.remainingAmount ?? item.amount) > 0)
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)),
    [payables]
  );

  const openReceivables = useMemo(
    () =>
      [...receivables]
        .filter((item) => Number(item.remainingAmount ?? item.amount) > 0)
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)),
    [receivables]
  );

  const filteredOpenPayables = useMemo(() => {
    const q = payableQuery.trim().toLowerCase();
    return openPayables
      .filter((item) => inPeriod(item.dueDate, payableStartDate, payableEndDate))
      .filter((item) => {
        if (!q) return true;
        return [item.description, item.category, item.notes, item.paymentMethod, item.createdBy]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [openPayables, payableQuery, payableStartDate, payableEndDate]);

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

  const filteredOpenReceivables = useMemo(() => {
    const q = receivableQuery.trim().toLowerCase();
    return openReceivables
      .filter((item) => inPeriod(item.dueDate, receivableStartDate, receivableEndDate))
      .filter((item) => {
        if (!q) return true;
        return [
          resolveReceivableClientName(item),
          item.description,
          item.notes,
          item.category,
          item.paymentMethod,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [
    openReceivables,
    receivableQuery,
    receivableStartDate,
    receivableEndDate,
    sales,
    orders,
  ]);

  const settlementSplitTotal = useMemo(
    () => sumPaymentSplits(settlementDialog?.paymentSplits || []),
    [settlementDialog]
  );

  const settlementEnteredAmount = useMemo(
    () => parseMoney(settlementDialog?.amount || 0),
    [settlementDialog]
  );

  const settlementDelta = useMemo(() => {
    if (!settlementDialog?.splitEnabled) return 0;
    return settlementSplitTotal - settlementEnteredAmount;
  }, [settlementDialog, settlementSplitTotal, settlementEnteredAmount]);

  function updateCashField(field, value) {
    setCashForm((prev) => ({ ...prev, [field]: value }));
  }

  function updatePayableField(field, value) {
    setPayableForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateReceivableField(field, value) {
    setReceivableForm((prev) => ({ ...prev, [field]: value }));
  }

  async function addManualEntry() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!cashForm.description.trim()) {
      toast.warning("Informe a descrição do lançamento.");
      return;
    }

    const amount = parseMoney(cashForm.amount);
    if (amount <= 0) {
      toast.warning("Informe um valor válido.");
      return;
    }

    const payload = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      sourceType: "manual",
      sourceId: "",
      type: cashForm.type,
      description: cashForm.description,
      amount,
      paymentMethod: cashForm.paymentMethod || "Não informado",
      date: `${cashForm.date}T12:00:00`,
      createdBy: user?.name || "",
      createdByRole: user?.role || "",
      createdAt: new Date().toISOString(),
    };

    try {
      const { error } = await supabase.from("cashflow").insert({
        id: payload.id,
        tenant_id: tenantId,
        source_type: payload.sourceType,
        source_id: payload.sourceId || null,
        type: payload.type,
        category: "Manual",
        description: payload.description,
        amount: payload.amount,
        payment_method: payload.paymentMethod,
        created_at: payload.date,
        created_by: payload.createdBy,
        created_by_role: payload.createdByRole,
      });

      if (error) {
        toast.error(`Erro ao salvar lançamento: ${error.message || "desconhecido"}`);
        return;
      }

      setManualEntries((prev) => [payload, ...prev]);
      setCashForm(manualCashEmpty());
      toast.success("Lançamento adicionado com sucesso.");
    } catch (err) {
      console.error("Falha real no addManualEntry:", err);
      toast.error(`Falha ao conectar com o banco: ${err.message || "desconhecido"}`);
    }
  }

  async function addPayable() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!payableForm.description.trim()) {
      toast.warning("Informe a descrição da conta a pagar.");
      return;
    }

    const amount = parseMoney(payableForm.amount);
    if (amount <= 0) {
      toast.warning("Informe um valor válido.");
      return;
    }

    const payload = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      description: payableForm.description,
      amount,
      paidAmount: 0,
      remainingAmount: amount,
      dueDate: payableForm.dueDate,
      category: payableForm.category,
      notes: payableForm.notes,
      paymentMethod: payableForm.paymentMethod,
      status: "open",
      createdAt: new Date().toISOString(),
      createdBy: user?.name || "",
    };

    const { error } = await supabase.from("payables").insert({
      id: payload.id,
      tenant_id: tenantId,
      description: payload.description,
      amount: payload.amount,
      paid_amount: payload.paidAmount,
      remaining_amount: payload.remainingAmount,
      due_date: payload.dueDate || null,
      category: payload.category,
      notes: payload.notes,
      payment_method: payload.paymentMethod,
      status: payload.status,
      created_at: payload.createdAt,
      created_by: payload.createdBy,
    });

    if (error) {
      console.error("Erro ao salvar conta a pagar:", error);
      toast.error(`Erro ao salvar conta a pagar: ${error.message || "desconhecido"}`);
      return;
    }

    setPayables((prev) => [payload, ...prev]);
    setPayableForm(accountEmpty("payable"));
    toast.success("Conta a pagar cadastrada.");
  }

  async function addReceivable() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!receivableForm.description.trim()) {
      toast.warning("Informe a descrição da conta a receber.");
      return;
    }

    const amount = parseMoney(receivableForm.amount);
    if (amount <= 0) {
      toast.warning("Informe um valor válido.");
      return;
    }

    const payload = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      description: receivableForm.description,
      amount,
      receivedAmount: 0,
      remainingAmount: amount,
      dueDate: receivableForm.dueDate,
      category: receivableForm.category,
      notes: receivableForm.notes,
      paymentMethod: receivableForm.paymentMethod,
      status: "open",
      createdAt: new Date().toISOString(),
      createdBy: user?.name || "",
      clientName: "",
    };

    const { error } = await supabase.from("receivables").insert({
      id: payload.id,
      tenant_id: tenantId,
      description: payload.description,
      client_name: payload.clientName || "",
      amount: payload.amount,
      received_amount: payload.receivedAmount,
      source_paid_amount: 0,
      remaining_amount: payload.remainingAmount,
      due_date: payload.dueDate || null,
      category: payload.category,
      notes: payload.notes,
      payment_method: payload.paymentMethod,
      status: payload.status,
      created_at: payload.createdAt,
      created_by: payload.createdBy,
    });

    if (error) {
      console.error("Erro ao salvar conta a receber:", error);
      toast.error(`Erro ao salvar conta a receber: ${error.message || "desconhecido"}`);
      return;
    }

    setReceivables((prev) => [payload, ...prev]);
    setReceivableForm(accountEmpty("receivable"));
    toast.success("Conta a receber cadastrada.");
  }

  async function settlePayable(id) {
    const item = payables.find((entry) => entry.id === id);
    if (!item) return;
    openSettlementDialog("payable", item);
  }

  async function settleReceivable(id) {
    const item = receivables.find((entry) => entry.id === id);
    if (!item) return;
    openSettlementDialog("receivable", item);
  }

  async function confirmSettlement() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!settlementDialog) return;

    const sourceList = settlementDialog.type === "payable" ? payables : receivables;
    const item = sourceList.find((entry) => entry.id === settlementDialog.itemId);
    if (!item) {
      toast.error("Lançamento não encontrado.");
      return;
    }

    const totalAmount = parseMoney(settlementDialog.amount);
    const splitTotal = sumPaymentSplits(settlementDialog.paymentSplits);
    const effectiveAmount = settlementDialog.splitEnabled ? splitTotal : totalAmount;
    const remaining = Number(item.remainingAmount ?? item.amount ?? 0);

    if (effectiveAmount <= 0 || effectiveAmount > remaining) {
      toast.warning("Informe um valor válido dentro do saldo restante.");
      return;
    }

    if (settlementDialog.splitEnabled && Math.abs(splitTotal - totalAmount) > 0.009) {
      toast.warning("A soma das formas precisa bater com o valor desta baixa.");
      return;
    }

    const paymentMethodLabel = getPaymentMethodLabel(
      settlementDialog.paymentMethod,
      settlementDialog.paymentSplits,
      settlementDialog.splitEnabled
    );

    const splits = settlementDialog.splitEnabled
      ? getPaymentSplitEntries(settlementDialog.paymentSplits)
      : [createPaymentSplit(settlementDialog.paymentMethod || item.paymentMethod || "Pix", settlementDialog.amount)];

    setSettlementDialog((prev) => (prev ? { ...prev, isSubmitting: true } : prev));

    const nowIso = new Date().toISOString();
    const baseDescription = `${settlementDialog.type === "payable" ? "Pagamento" : "Recebimento"}: ${item.description}`;
    const cashRows = splits.map((split) => ({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      sourceType: settlementDialog.type,
      sourceId: item.id,
      type: settlementDialog.type === "payable" ? "saida" : "entrada",
      description:
        splits.length > 1 ? `${baseDescription} (${split.method || "Pix"})` : baseDescription,
      amount: parseMoney(split.amount),
      paymentMethod: split.method || settlementDialog.paymentMethod || item.paymentMethod || "Pix",
      date: nowIso,
      createdBy: user?.name || "",
      createdByRole: user?.role || "",
      createdAt: nowIso,
    }));

    const { error: cashError } = await supabase.from("cashflow").insert(
      cashRows.map((row) => ({
        id: row.id,
        tenant_id: row.tenant_id,
        source_type: row.sourceType,
        source_id: row.sourceId,
        type: row.type,
        category: item.category || (settlementDialog.type === "payable" ? "Conta a pagar" : "Conta a receber"),
        description: row.description,
        amount: row.amount,
        payment_method: row.paymentMethod,
        created_at: row.date,
        created_by: row.createdBy,
        created_by_role: row.createdByRole,
      }))
    );

    if (cashError) {
      console.error("Erro ao lançar movimentação no caixa:", cashError);
      toast.error(`Erro ao lançar movimentação no caixa: ${cashError.message || "desconhecido"}`);
      setSettlementDialog((prev) => (prev ? { ...prev, isSubmitting: false } : prev));
      return;
    }

    const amountField = settlementDialog.type === "payable" ? "paid_amount" : "received_amount";
    const timeField = settlementDialog.type === "payable" ? "paid_at" : "received_at";
    const currentProgress = Number(
      settlementDialog.type === "payable" ? item.paidAmount || 0 : item.receivedAmount || 0
    );
    const nextProgress = currentProgress + effectiveAmount;
    const nextRemaining = Math.max(0, Number(item.amount || 0) - nextProgress);
    const nextStatus = nextRemaining <= 0
      ? settlementDialog.type === "payable"
        ? "paid"
        : "received"
      : "partial";

    const appendedNotes = buildSettlementNote(
      item.notes,
      splits,
      settlementDialog.notes,
      settlementDialog.type === "payable" ? "Pagamento" : "Recebimento"
    );

    const { error: updateError } = await supabase
      .from(settlementDialog.type === "payable" ? "payables" : "receivables")
      .update({
        [amountField]: nextProgress,
        remaining_amount: nextRemaining,
        payment_method: paymentMethodLabel,
        notes: appendedNotes,
        status: nextStatus,
        [timeField]: nextRemaining <= 0 ? nowIso : item[settlementDialog.type === "payable" ? "paidAt" : "receivedAt"] || null,
      })
      .eq("id", item.id)
      .eq("tenant_id", tenantId);

    if (updateError) {
      console.error("Erro ao atualizar lançamento:", updateError);
      toast.error(`Erro ao atualizar lançamento: ${updateError.message || "desconhecido"}`);
      setSettlementDialog((prev) => (prev ? { ...prev, isSubmitting: false } : prev));
      return;
    }

    setManualEntries((prev) => [...cashRows, ...prev]);

    if (settlementDialog.type === "payable") {
      setPayables((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                paidAmount: nextProgress,
                remainingAmount: nextRemaining,
                paymentMethod: paymentMethodLabel,
                notes: appendedNotes,
                status: nextStatus,
                paidAt: nextRemaining <= 0 ? nowIso : entry.paidAt,
              }
            : entry
        )
      );
    } else {
      setReceivables((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                receivedAmount: nextProgress,
                remainingAmount: nextRemaining,
                paymentMethod: paymentMethodLabel,
                notes: appendedNotes,
                status: nextStatus,
                receivedAt: nextRemaining <= 0 ? nowIso : entry.receivedAt,
              }
            : entry
        )
      );
    }

    closeSettlementDialog();
    toast.success(
      nextRemaining <= 0
        ? settlementDialog.type === "payable"
          ? "Conta a pagar quitada com sucesso."
          : "Conta a receber quitada com sucesso."
        : settlementDialog.type === "payable"
          ? "Pagamento parcial registrado com sucesso."
          : "Recebimento parcial registrado com sucesso."
    );
  }

  async function deleteManualEntry(entryId) {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!window.confirm("Excluir este lançamento manual?")) return;

    const { error } = await supabase
      .from("cashflow")
      .delete()
      .eq("id", entryId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Erro ao excluir lançamento:", error);
      toast.error(`Erro ao excluir lançamento: ${error.message || "desconhecido"}`);
      return;
    }

    setManualEntries((prev) => prev.filter((item) => item.id !== entryId));
    toast.success("Lançamento manual excluído com sucesso.");
  }

  async function deletePayable(id) {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    const item = payables.find((entry) => entry.id === id);
    if (!item) return;

    const linkedEntries = manualEntries.filter(
      (entry) => entry.sourceType === "payable" && entry.sourceId === id
    );

    const hasLinkedEntries = linkedEntries.length > 0;
    const message = hasLinkedEntries
      ? `Excluir a conta "${item.description}"?\n\nTambém serão removidos ${linkedEntries.length} lançamento(s) automático(s) de pagamento do caixa.`
      : `Excluir a conta "${item.description}"?`;

    if (!window.confirm(message)) return;

    const { error: payableError } = await supabase
      .from("payables")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (payableError) {
      console.error("Erro ao excluir conta a pagar:", payableError);
      toast.error(`Erro ao excluir conta a pagar: ${payableError.message || "desconhecido"}`);
      return;
    }

    if (hasLinkedEntries) {
      const { error: cashError } = await supabase
        .from("cashflow")
        .delete()
        .eq("source_type", "payable")
        .eq("source_id", id)
        .eq("tenant_id", tenantId);

      if (cashError) {
        console.error("Erro ao excluir lançamentos vinculados:", cashError);
      }
    }

    setPayables((prev) => prev.filter((entry) => entry.id !== id));

    if (hasLinkedEntries) {
      setManualEntries((prev) =>
        prev.filter((entry) => !(entry.sourceType === "payable" && entry.sourceId === id))
      );
    }

    toast.success("Conta a pagar excluída com sucesso.");
  }

  async function deleteReceivable(id) {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    const item = receivables.find((entry) => entry.id === id);
    if (!item) return;

    const linkedEntries = manualEntries.filter(
      (entry) => entry.sourceType === "receivable" && entry.sourceId === id
    );

    const hasLinkedEntries = linkedEntries.length > 0;
    const message = hasLinkedEntries
      ? `Excluir a conta "${item.description}"?\n\nTambém serão removidos ${linkedEntries.length} lançamento(s) automático(s) de recebimento do caixa.`
      : `Excluir a conta "${item.description}"?`;

    if (!window.confirm(message)) return;

    const { error: receivableError } = await supabase
      .from("receivables")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (receivableError) {
      console.error("Erro ao excluir conta a receber:", receivableError);
      toast.error(`Erro ao excluir conta a receber: ${receivableError.message || "desconhecido"}`);
      return;
    }

    if (hasLinkedEntries) {
      const { error: cashError } = await supabase
        .from("cashflow")
        .delete()
        .eq("source_type", "receivable")
        .eq("source_id", id)
        .eq("tenant_id", tenantId);

      if (cashError) {
        console.error("Erro ao excluir lançamentos vinculados:", cashError);
      }
    }

    setReceivables((prev) => prev.filter((entry) => entry.id !== id));

    if (hasLinkedEntries) {
      setManualEntries((prev) =>
        prev.filter((entry) => !(entry.sourceType === "receivable" && entry.sourceId === id))
      );
    }

    toast.success("Conta a receber excluída com sucesso.");
  }

  if (!isLoaded) {
    return (
      <div className="page-stack">
        <LoadingState
          title="Carregando financeiro"
          description="Estamos consolidando caixa, vendas, ordens de serviço e contas em aberto."
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Financeiro / Fluxo de Caixa"
        description="Fluxo de caixa, contas a pagar, contas a receber e fechamento mensal."
      />

      <StatusBanner
        tone="info"
        title="Atalhos do financeiro"
        description="Use Ctrl+1 até Ctrl+5 para alternar entre abas e / para focar a busca da aba atual."
        actions={<div className="hotkey-hint">Esc limpa o filtro ativo</div>}
      />

      <div className="finance-tabs">
        <button
          type="button"
          className={`finance-tab ${activeTab === "resumo" ? "active" : ""}`}
          onClick={() => setActiveTab("resumo")}
        >
          Resumo
        </button>
        <button
          type="button"
          className={`finance-tab ${activeTab === "lancamentos" ? "active" : ""}`}
          onClick={() => setActiveTab("lancamentos")}
        >
          Lançamentos
        </button>
        <button
          type="button"
          className={`finance-tab ${activeTab === "pagar" ? "active" : ""}`}
          onClick={() => setActiveTab("pagar")}
        >
          Contas a pagar
        </button>
        <button
          type="button"
          className={`finance-tab ${activeTab === "receber" ? "active" : ""}`}
          onClick={() => setActiveTab("receber")}
        >
          Contas a receber
        </button>
        <button
          type="button"
          className={`finance-tab ${activeTab === "historico" ? "active" : ""}`}
          onClick={() => setActiveTab("historico")}
        >
          Histórico do caixa
        </button>
      </div>

      <div hidden={activeTab !== "resumo"} className="page-stack">
        <div className="stats-grid">
        <StatCard label="Saldo atual" value={currencyBR(saldoGeral)} hint="Saldo geral acumulado" />
        <StatCard label="Entradas" value={currencyBR(totals.entradas)} hint="No período filtrado" />
        <StatCard label="Saídas" value={currencyBR(totals.saidas)} hint="No período filtrado" />
        <StatCard label="Saldo do período" value={currencyBR(totals.saldoPeriodo)} hint="Entradas - saídas" />
      </div>

      <Card title="Fechamento mensal">
        <div className="stats-grid">
          <StatCard
            label="Entradas do mês"
            value={currencyBR(monthlySummary.entradas)}
            hint={`${monthlySummary.qtdEntradas} lançamentos`}
          />
          <StatCard
            label="Saídas do mês"
            value={currencyBR(monthlySummary.saidas)}
            hint={`${monthlySummary.qtdSaidas} lançamentos`}
          />
          <StatCard
            label="Saldo do mês"
            value={currencyBR(monthlySummary.saldo)}
            hint={currentMonthKey}
          />
          <StatCard
            label="Em aberto"
            value={currencyBR(
              openPayables.reduce((s, i) => s + Number(i.remainingAmount ?? i.amount), 0) +
                openReceivables.reduce((s, i) => s + Number(i.remainingAmount ?? i.amount), 0)
            )}
            hint="Pagar + receber"
          />
        </div>
      </Card>
      </div>

      <div hidden={activeTab !== "lancamentos"}>
      <Card title="Lançamento manual no caixa">
        <div className="form-grid form-grid-5">
          <label className="form-field">
            <span>Tipo</span>
            <select value={cashForm.type} onChange={(e) => updateCashField("type", e.target.value)}>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </label>

          <label className="form-field">
            <span>Descrição</span>
            <input
              value={cashForm.description}
              onChange={(e) => updateCashField("description", e.target.value)}
              placeholder="Ex: compra de peças"
            />
          </label>

          <label className="form-field">
            <span>Valor</span>
            <input
              value={cashForm.amount}
              onChange={(e) => updateCashField("amount", e.target.value)}
              placeholder="Ex: 150,00"
            />
          </label>

          <label className="form-field">
            <span>Forma de pagamento</span>
            <select
              value={cashForm.paymentMethod}
              onChange={(e) => updateCashField("paymentMethod", e.target.value)}
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Data</span>
            <input
              type="date"
              value={cashForm.date}
              onChange={(e) => updateCashField("date", e.target.value)}
            />
          </label>
        </div>

        <div className="header-actions" style={{ marginTop: 16 }}>
          <Button onClick={addManualEntry}>Adicionar lançamento</Button>
        </div>
      </Card>
      </div>

      <div className="finance-grid">
        <div hidden={activeTab !== "pagar"}>
        <Card title="Contas a pagar">
          <div className="form-grid form-grid-5">
            <label className="form-field">
              <span>Descrição</span>
              <input
                value={payableForm.description}
                onChange={(e) => updatePayableField("description", e.target.value)}
                placeholder="Ex: compra fornecedor"
              />
            </label>

            <label className="form-field">
              <span>Valor</span>
              <input
                value={payableForm.amount}
                onChange={(e) => updatePayableField("amount", e.target.value)}
                placeholder="Ex: 250,00"
              />
            </label>

            <label className="form-field">
              <span>Vencimento</span>
              <input
                type="date"
                value={payableForm.dueDate}
                onChange={(e) => updatePayableField("dueDate", e.target.value)}
              />
            </label>

            <label className="form-field">
              <span>Categoria</span>
              <input
                value={payableForm.category}
                onChange={(e) => updatePayableField("category", e.target.value)}
                placeholder="Fornecedor"
              />
            </label>

            <label className="form-field">
              <span>Pagamento</span>
              <select
                value={payableForm.paymentMethod}
                onChange={(e) => updatePayableField("paymentMethod", e.target.value)}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="form-field">
              <span>Observações</span>
              <textarea
                rows={3}
                value={payableForm.notes}
                onChange={(e) => updatePayableField("notes", e.target.value)}
                placeholder="Observações da conta..."
              />
            </label>
          </div>

          <div className="header-actions" style={{ marginTop: 16 }}>
            <Button onClick={addPayable}>Adicionar conta a pagar</Button>
          </div>

          {openPayables.length ? (
            <>
              <div className="form-grid form-grid-3" style={{ marginTop: 16 }}>
                <label className="form-field">
                  <span>Buscar nome / descrição</span>
                  <input
                    ref={payableSearchRef}
                    value={payableQuery}
                    onChange={(e) => setPayableQuery(e.target.value)}
                    placeholder="Descrição, categoria, observações..."
                  />
                </label>

                <label className="form-field">
                  <span>Vencimento inicial</span>
                  <input
                    type="date"
                    value={payableStartDate}
                    onChange={(e) => setPayableStartDate(e.target.value)}
                  />
                </label>

                <label className="form-field">
                  <span>Vencimento final</span>
                  <input
                    type="date"
                    value={payableEndDate}
                    onChange={(e) => setPayableEndDate(e.target.value)}
                  />
                </label>
              </div>

              {filteredOpenPayables.length ? (
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
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOpenPayables.map((item) => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        <td>{item.category}</td>
                        <td>{formatDate(item.dueDate)}</td>
                        <td>{currencyBR(item.amount)}</td>
                        <td>{currencyBR(item.paidAmount || 0)}</td>
                        <td>{currencyBR(item.remainingAmount ?? item.amount)}</td>
                        <td>
                          <span
                            className={`pill ${
                              item.status === "partial" ? "pill-warning" : "pill-danger"
                            }`}
                          >
                            {item.status === "partial" ? "Parcial" : "Em aberto"}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <Button variant="secondary" onClick={() => settlePayable(item.id)}>
                              {Number(item.remainingAmount ?? item.amount) <= 0 ? "Pago" : "Pagar"}
                            </Button>
                            <Button variant="danger" onClick={() => deletePayable(item.id)}>
                              Excluir
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-inline" style={{ marginTop: 16 }}>
                  Nenhuma conta a pagar encontrada com os filtros informados.
                </div>
              )}
            </>
          ) : (
            <div className="empty-inline" style={{ marginTop: 16 }}>
              Nenhuma conta a pagar em aberto.
            </div>
          )}
        </Card>
        </div>

        <div hidden={activeTab !== "receber"}>
        <Card title="Contas a receber">
          <div className="form-grid form-grid-5">
            <label className="form-field">
              <span>Descrição</span>
              <input
                value={receivableForm.description}
                onChange={(e) => updateReceivableField("description", e.target.value)}
                placeholder="Ex: cliente João"
              />
            </label>

            <label className="form-field">
              <span>Valor</span>
              <input
                value={receivableForm.amount}
                onChange={(e) => updateReceivableField("amount", e.target.value)}
                placeholder="Ex: 320,00"
              />
            </label>

            <label className="form-field">
              <span>Vencimento</span>
              <input
                type="date"
                value={receivableForm.dueDate}
                onChange={(e) => updateReceivableField("dueDate", e.target.value)}
              />
            </label>

            <label className="form-field">
              <span>Categoria</span>
              <input
                value={receivableForm.category}
                onChange={(e) => updateReceivableField("category", e.target.value)}
                placeholder="Cliente"
              />
            </label>

            <label className="form-field">
              <span>Recebimento</span>
              <select
                value={receivableForm.paymentMethod}
                onChange={(e) => updateReceivableField("paymentMethod", e.target.value)}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="form-field">
              <span>Observações</span>
              <textarea
                rows={3}
                value={receivableForm.notes}
                onChange={(e) => updateReceivableField("notes", e.target.value)}
                placeholder="Observações da conta..."
              />
            </label>
          </div>

          <div className="header-actions" style={{ marginTop: 16 }}>
            <Button onClick={addReceivable}>Adicionar conta a receber</Button>
          </div>

          <div className="form-grid form-grid-3" style={{ marginTop: 16 }}>
            <label className="form-field">
              <span>Buscar cliente / descrição</span>
              <input
                ref={receivableSearchRef}
                value={receivableQuery}
                onChange={(e) => setReceivableQuery(e.target.value)}
                placeholder="Nome do cliente, descrição..."
              />
            </label>

            <label className="form-field">
              <span>Vencimento inicial</span>
              <input
                type="date"
                value={receivableStartDate}
                onChange={(e) => setReceivableStartDate(e.target.value)}
              />
            </label>

            <label className="form-field">
              <span>Vencimento final</span>
              <input
                type="date"
                value={receivableEndDate}
                onChange={(e) => setReceivableEndDate(e.target.value)}
              />
            </label>
          </div>

          {openReceivables.length ? (
            filteredOpenReceivables.length ? (
              <table className="data-table" style={{ marginTop: 16 }}>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th>Vencimento</th>
                    <th>Total</th>
                    <th>Recebido</th>
                    <th>Restante</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOpenReceivables.map((item) => (
                    <tr key={item.id}>
                      <td>{resolveReceivableClientName(item)}</td>
                      <td>{item.description}</td>
                      <td>{item.category}</td>
                      <td>{formatDate(item.dueDate)}</td>
                      <td>{currencyBR(item.amount)}</td>
                      <td>{currencyBR(item.receivedAmount || 0)}</td>
                      <td>{currencyBR(item.remainingAmount ?? item.amount)}</td>
                      <td>
                        <span className="pill pill-warning">
                          {item.status === "partial" ? "Parcial" : "Em aberto"}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <Button variant="secondary" onClick={() => settleReceivable(item.id)}>
                            {Number(item.remainingAmount ?? item.amount) <= 0 ? "Recebido" : "Receber"}
                          </Button>
                          <Button variant="danger" onClick={() => deleteReceivable(item.id)}>
                            Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-inline" style={{ marginTop: 16 }}>
                Nenhuma conta a receber encontrada com os filtros informados.
              </div>
            )
          ) : (
            <div className="empty-inline" style={{ marginTop: 16 }}>
              Nenhuma conta a receber em aberto.
            </div>
          )}
        </Card>
        </div>
      </div>

      <div hidden={activeTab !== "historico"}>
      <Card title="Histórico do caixa">
        <div className="form-grid form-grid-3">
          <label className="form-field">
            <span>Data inicial</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>

          <label className="form-field">
            <span>Data final</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>

          <label className="form-field">
            <span>Busca</span>
            <input
              ref={historySearchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Descrição, pagamento, usuário..."
            />
          </label>
        </div>

        {filteredEntries.length ? (
          <table className="data-table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Forma pagamento</th>
                <th>Valor</th>
                <th>Origem</th>
                <th>Criado por</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.date || item.createdAt)}</td>
                  <td>
                    <span className={`pill ${item.type === "entrada" ? "pill-success" : "pill-danger"}`}>
                      {item.type === "entrada" ? "Entrada" : "Saída"}
                    </span>
                  </td>
                  <td>{item.description}</td>
                  <td>{item.paymentMethod || "—"}</td>
                  <td>{currencyBR(item.amount)}</td>
                  <td>
                    {item.sourceType === "manual"
                      ? "Manual"
                      : item.sourceType === "sale"
                        ? "Venda"
                        : item.sourceType === "order"
                          ? "OS"
                          : item.sourceType === "payable"
                            ? "Conta paga"
                            : "Conta recebida"}
                  </td>
                  <td>
                    {item.createdBy
                      ? `${item.createdBy}${item.createdByRole ? ` (${item.createdByRole})` : ""}`
                      : "—"}
                  </td>
                  <td>
                    {item.sourceType === "manual" ? (
                      <Button variant="danger" onClick={() => deleteManualEntry(item.id)}>
                        Excluir
                      </Button>
                    ) : (
                      "Automático"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title="Sem lançamentos"
            description="Ainda não há movimentos no período selecionado."
          />
        )}
      </Card>
      </div>
    </div>
  );
}