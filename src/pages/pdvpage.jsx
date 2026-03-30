import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { openPrintWindow, printPdfInWindow } from "../lib/printPdf";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import CaixaModal from "../components/CaixaModal";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/auth.jsx";
import { Barcode, CreditCard, Package, ShoppingCart, User, Wallet, Wrench } from "lucide-react";

const PAYMENT_METHODS = ["Dinheiro", "Pix", "Crédito", "Débito", "Crediário", "Outros"];

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

function formatDateTime(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR");
}

function nowLocalValue() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function genId() {
  return crypto.randomUUID();
}

function generateSaleNumber(existing, createdAt) {
  const d = new Date(createdAt);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const seq =
    existing.filter((sale) => {
      const sd = new Date(sale.createdAt);
      return `${sd.getFullYear()}-${sd.getMonth()}-${sd.getDate()}` === dayKey;
    }).length + 1;

  return `VD${pad(d.getDate())}${pad(d.getMonth() + 1)}${pad(d.getFullYear() % 100)}${pad(
    seq,
    2
  )}`;
}

function emptySale(existing = [], tenantId = "") {
  const createdAt = nowLocalValue();
  return {
    id: genId(),
    tenant_id: tenantId,
    number: generateSaleNumber(existing, createdAt),
    createdAt,
    clientId: "",
    clientName: "",
    clientPhone: "",
    paymentMethod: "Dinheiro",
    paymentNotes: "",
    amountPaid: "",
    dueDate: "",
    discount: "",
    items: [],
    services: [],
    status: "Finalizada",
  };
}

function normalizeSale(sale, existing = [], tenantId = "") {
  const base = sale || emptySale(existing, tenantId);
  return {
    ...base,
    tenant_id: base.tenant_id || tenantId,
    items: Array.isArray(base.items) ? base.items : [],
    services: Array.isArray(base.services) ? base.services : [],
  };
}

function summarizeSale(sale) {
  const productSubtotal = (sale.items || []).reduce(
    (sum, item) => sum + parseQty(item.qty) * parseMoney(item.unitValue),
    0
  );
  const serviceSubtotal = (sale.services || []).reduce(
    (sum, item) => sum + parseMoney(item.value),
    0
  );
  const subtotal = productSubtotal + serviceSubtotal;
  const discount = parseMoney(sale.discount);
  const total = Math.max(0, subtotal - discount);
  return { productSubtotal, serviceSubtotal, subtotal, discount, total };
}

function summarizePayment(total, amountPaid) {
  const paid = Math.max(0, parseMoney(amountPaid));
  const received = Math.min(total, paid);
  const remaining = Math.max(0, total - received);
  const status = remaining <= 0 ? "paid" : received > 0 ? "partial" : "pending";
  return { received, remaining, status };
}

function applySaleStockMovement(products, sale, previousSale = null, mode = "save") {
  const previousItems = previousSale?.items || [];
  const currentItems = sale?.items || [];

  const prevByProduct = previousItems.reduce((acc, item) => {
    if (!item.productId) return acc;
    const qty = parseQty(item.qty);
    acc[item.productId] = (acc[item.productId] || 0) + qty;
    return acc;
  }, {});

  const currentByProduct = currentItems.reduce((acc, item) => {
    if (!item.productId) return acc;
    const qty = parseQty(item.qty);
    acc[item.productId] = (acc[item.productId] || 0) + qty;
    return acc;
  }, {});

  return products.map((product) => {
    const prevQty = prevByProduct[product.id] || 0;
    const currentQty = currentByProduct[product.id] || 0;

    let delta = 0;
    if (mode === "delete") {
      delta = -prevQty;
    } else {
      delta = currentQty - prevQty;
    }

    if (delta === 0) return product;

    const atual = Number(product.estoqueAtual || 0);
    const novoEstoque = atual - delta;

    if (novoEstoque < 0) {
      throw new Error(`Estoque insuficiente para ${product.nome || "produto"}.`);
    }

    const stockHistory = Array.isArray(product.stockHistory) ? product.stockHistory : [];
    const historyItem = {
      id: genId(),
      type: delta > 0 ? "saida" : "entrada",
      qty: Math.abs(delta),
      reason:
        mode === "delete"
          ? `Estorno venda ${previousSale?.number || ""}`.trim()
          : delta > 0
            ? `Venda ${sale.number}`
            : `Estorno venda ${sale.number}`,
      previousStock: atual,
      newStock: novoEstoque,
      createdAt: new Date().toISOString(),
    };

    return {
      ...product,
      estoqueAtual: String(novoEstoque),
      stockHistory: [historyItem, ...stockHistory],
    };
  });
}

function buildSaleCouponPdf(sale, settings = {}) {
  const totals = summarizeSale(sale);
  const payment = summarizePayment(totals.total, sale.amountPaid);
  const items = (sale.items || []).filter(
    (item) => item.description || item.unitValue || item.productId
  );
  const services = (sale.services || []).filter(
    (item) => item.description || item.value
  );

  const extraRows = items.length + services.length + 26;
  const pageHeight = Math.max(180, 92 + extraRows * 6);
  const doc = new jsPDF({ unit: "mm", format: [80, pageHeight] });
  const left = 4;
  const right = 76;
  const width = right - left;
  let y = 8;

  const line = () => {
    doc.setLineWidth(0.2);
    doc.line(left, y, right, y);
    y += 4;
  };

  const center = (text, size = 10, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text || ""), width);
    doc.text(lines, 40, y, { align: "center" });
    y += Math.max(4, lines.length * (size <= 8 ? 3.6 : 4.5));
  };

  const labelValue = (label, value, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(8);
    const safe = String(value || "—");
    const lines = doc.splitTextToSize(`${label} ${safe}`, width);
    doc.text(lines, left, y);
    y += Math.max(4, lines.length * 3.8);
  };

  const itemRow = (label, value) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(String(label || "Item"), width - 18);
    doc.text(lines, left, y);
    doc.text(String(value || "—"), right, y, { align: "right" });
    y += Math.max(4, lines.length * 3.8);
  };

  center(settings.companyName || "SOSPC", 11, true);
  if (settings.fantasyName) center(settings.fantasyName, 8, false);
  if (settings.cnpj) center(`CNPJ: ${settings.cnpj}`, 8, false);
  if (settings.address) center(settings.address, 8, false);
  if (settings.phone || settings.whatsapp) {
    center(
      settings.phone ? `Tel: ${settings.phone}` : `WhatsApp: ${settings.whatsapp}`,
      8,
      false
    );
  }

  line();
  center("CUPOM DE VENDA", 9, true);
  line();
  labelValue("Venda:", sale.number);
  labelValue("Data:", formatDateTime(sale.createdAt));
  labelValue("Cliente:", sale.clientName || "Venda balcão");
  if (sale.clientPhone) labelValue("Telefone:", sale.clientPhone);

  line();
  center("PRODUTOS", 8, true);
  if (!items.length) {
    itemRow("Sem produtos", "—");
  } else {
    items.forEach((item) => {
      const qty = parseQty(item.qty) || 1;
      itemRow(
        `${item.description || "Produto"} (${qty}x)`,
        currencyBR(qty * parseMoney(item.unitValue))
      );
    });
  }

  line();
  center("SERVIÇOS", 8, true);
  if (!services.length) {
    itemRow("Sem serviços", "—");
  } else {
    services.forEach((item) =>
      itemRow(item.description || "Serviço", currencyBR(parseMoney(item.value)))
    );
  }

  line();
  center("RESUMO", 8, true);
  itemRow("Produtos", currencyBR(totals.productSubtotal));
  itemRow("Serviços", currencyBR(totals.serviceSubtotal));
  itemRow("Desconto", currencyBR(totals.discount));
  itemRow("TOTAL", currencyBR(totals.total));

  line();
  center("PAGAMENTO", 8, true);
  labelValue("Forma:", sale.paymentMethod || "—");
  labelValue("Recebido:", currencyBR(payment.received));
  labelValue("Restante:", currencyBR(payment.remaining), true);
  if (sale.dueDate) labelValue("Vencimento:", sale.dueDate);
  if (sale.paymentNotes) labelValue("Obs:", sale.paymentNotes);

  line();
  center(settings.footerText || "Obrigado pela preferência!", 8, false);
  return doc;
}

export default function PDVPage() {
  const toast = useToast();
  const barcodeRef = useRef(null);
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [settings, setSettings] = useState({});
  const [form, setForm] = useState(() => emptySale([], ""));
  const [barcodeValue, setBarcodeValue] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [catalogServices, setCatalogServices] = useState([]);
  const [serviceQuickCatalogId, setServiceQuickCatalogId] = useState("");
  const [serviceQuickDescription, setServiceQuickDescription] = useState("");
  const [serviceQuickValue, setServiceQuickValue] = useState("");
  const [cashSession, setCashSession] = useState(null);
  const [cashEntries, setCashEntries] = useState([]);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [isOpeningCash, setIsOpeningCash] = useState(false);
  const [isClosingCash, setIsClosingCash] = useState(false);
  const [isSavingCashEntry, setIsSavingCashEntry] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!tenantId) {
        setSales([]);
        setProducts([]);
        setClients([]);
        setCatalogServices([]);
        setSettings({});
        setCashSession(null);
        setCashEntries([]);
        setForm(emptySale([], ""));
        setIsLoaded(false);
        return;
      }

      try {
        setIsLoaded(false);

        const [
          salesRes,
          productsRes,
          movementsRes,
          clientsRes,
          catalogServicesRes,
          tenantSettingsRes,
          cashSessionRes,
          cashEntriesRes,
        ] = await Promise.all([
          supabase
            .from("sales")
            .select("id, number, created_at, total, cash_session_id")
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

          supabase
            .from("clients")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),

          supabase
            .from("services")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("name", { ascending: true }),

          supabase
            .from("tenant_settings")
            .select("*")
            .eq("tenant_id", tenantId)
            .maybeSingle(),

          supabase
            .from("cash_sessions")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("status", "open")
            .maybeSingle(),

          supabase
            .from("cash_session_entries")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),
        ]);

        if (salesRes.error) console.error("Erro ao carregar vendas:", salesRes.error);
        if (productsRes.error) console.error("Erro ao carregar produtos:", productsRes.error);
        if (movementsRes.error) console.error("Erro ao carregar movimentações:", movementsRes.error);
        if (clientsRes.error) console.error("Erro ao carregar clientes:", clientsRes.error);
        if (catalogServicesRes.error) {
          console.error("Erro ao carregar catálogo de serviços:", catalogServicesRes.error);
        }
        if (tenantSettingsRes.error) {
          console.error("Erro ao carregar configurações da empresa:", tenantSettingsRes.error);
        }
        if (cashSessionRes.error) {
          console.error("Erro ao carregar caixa aberto:", cashSessionRes.error);
        }
        if (cashEntriesRes.error) {
          console.error("Erro ao carregar movimentações do caixa:", cashEntriesRes.error);
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

        const mappedSales = (salesRes.data || []).map((sale) => ({
          id: sale.id,
          tenant_id: tenantId,
          number: sale.number || sale.id,
          createdAt: sale.created_at,
          total: Number(sale.total || 0),
          cash_session_id: sale.cash_session_id || null,
        }));

        const mappedProducts = (productsRes.data || []).map((product) => ({
          id: product.id,
          tenant_id: product.tenant_id || tenantId,
          codigo: product.codigo || "",
          codigoBarras: product.codigo_barras || "",
          nome: product.nome || "",
          precoVenda: String(product.preco_venda ?? ""),
          estoqueAtual: String(product.estoque_atual ?? 0),
          stockHistory: movementsByProduct[product.id] || [],
        }));

        const mappedClients = (clientsRes.data || []).map((client) => ({
          id: client.id,
          tenant_id: client.tenant_id || tenantId,
          nome: client.nome || "",
          telefone1: client.telefone1 || "",
          whatsapp: client.whatsapp || "",
        }));

        const mappedCatalogServices = (catalogServicesRes.data || []).map((item) => ({
          id: item.id,
          tenant_id: item.tenant_id || tenantId,
          name: item.name || "",
          description: item.description || "",
          value: item.price ?? item.valor ?? "",
          isActive: item.is_active ?? true,
        }));

        setSales(mappedSales);
        setProducts(mappedProducts);
        setClients(mappedClients);
        setCatalogServices(mappedCatalogServices);
        setCashSession(cashSessionRes.data || null);
        setCashEntries(cashEntriesRes.data || []);
        setSettings({
          companyName: tenantSettingsRes.data?.company_name || "SOSPC",
          fantasyName: tenantSettingsRes.data?.fantasy_name || "",
          cnpj: tenantSettingsRes.data?.cnpj || "",
          address: tenantSettingsRes.data?.address || "",
          phone: tenantSettingsRes.data?.phone || "",
          whatsapp: tenantSettingsRes.data?.whatsapp || "",
          email: tenantSettingsRes.data?.email || "",
          footerText: tenantSettingsRes.data?.footer_text || "Obrigado pela preferência!",
          osPrefix: tenantSettingsRes.data?.os_prefix || "",
          acceptedPayments: Array.isArray(tenantSettingsRes.data?.accepted_payments)
            ? tenantSettingsRes.data.accepted_payments
            : PAYMENT_METHODS,
          companyLogoDataUrl: tenantSettingsRes.data?.company_logo_data_url || "",
        });
        setForm(emptySale(mappedSales, tenantId));

        if (
          salesRes.error ||
          productsRes.error ||
          movementsRes.error ||
          clientsRes.error ||
          catalogServicesRes.error ||
          tenantSettingsRes.error ||
          cashSessionRes.error ||
          cashEntriesRes.error
        ) {
          toast.warning("Alguns dados do PDV não puderam ser carregados completamente.");
        }
      } catch (error) {
        console.error("Erro ao carregar PDV:", error);
        toast.error("Erro ao carregar dados do PDV.");
        setSales([]);
        setProducts([]);
        setClients([]);
        setCatalogServices([]);
        setCashSession(null);
        setCashEntries([]);
      } finally {
        setIsLoaded(true);
      }
    }

    fetchData();
  }, [tenantId, toast]);

  useEffect(() => {
    if (!isLoaded) return;
    const t = setTimeout(() => barcodeRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [isLoaded, form.id]);

  useEffect(() => {
    function handleKeyDown(e) {
      const tag = String(e.target?.tagName || "").toLowerCase();
      const typing = tag === "textarea" || tag === "select";

      if (e.key === "F2") {
        e.preventDefault();
        handleFinalize();
      }
      if (e.key === "F4") {
        e.preventDefault();
        handleNewSale();
      }
      if (e.key === "F6") {
        e.preventDefault();
        barcodeRef.current?.focus();
      }
      if (e.key === "F8") {
        e.preventDefault();
        handlePrintCoupon();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setBarcodeValue("");
        setProductSearch("");
        barcodeRef.current?.focus();
      }
      if (!typing && e.key === "Delete" && form.items.length) {
        e.preventDefault();
        removeCartItem(form.items[form.items.length - 1].id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const totals = useMemo(() => summarizeSale(form), [form]);
  const receivedNow = Math.min(totals.total, parseMoney(form.amountPaid));
  const remainingNow = Math.max(0, totals.total - receivedNow);

  const quickProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = q
      ? products.filter((product) =>
          [product.nome, product.codigo, product.codigoBarras]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : products;

    return list.slice(0, 12);
  }, [products, productSearch]);

  const cashSalesTotal = useMemo(() => {
    if (!cashSession) return 0;

    return sales
      .filter((sale) => sale.cash_session_id === cashSession.id)
      .reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  }, [sales, cashSession]);

  function focusBarcode() {
    barcodeRef.current?.focus();
  }

  function handleNewSale() {
    setForm(emptySale(sales, tenantId || ""));
    setBarcodeValue("");
    setProductSearch("");
    setServiceQuickDescription("");
    setServiceQuickValue("");
    setServiceQuickCatalogId("");
    toast.info("Nova venda iniciada.");
    setTimeout(() => focusBarcode(), 40);
  }

  async function handleOpenCash({ initialAmount, notes }) {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (cashSession) {
      toast.warning("Já existe um caixa aberto.");
      return;
    }

    try {
      setIsOpeningCash(true);

      const payload = {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        opened_by: user?.id || null,
        opened_by_name: user?.name || user?.username || "Usuário",
        opened_at: new Date().toISOString(),
        initial_amount: Number(initialAmount || 0),
        status: "open",
        notes: notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("cash_sessions").insert(payload);

      if (error) {
        throw new Error(error.message || "Erro ao abrir caixa.");
      }

      setCashSession(payload);
      setCashEntries([]);
      toast.success("Caixa aberto com sucesso.");
    } catch (error) {
      console.error("Erro ao abrir caixa:", error);
      toast.error(error.message || "Erro ao abrir caixa.");
    } finally {
      setIsOpeningCash(false);
    }
  }

  async function handleAddCashEntry({ type, amount, note }) {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!cashSession) {
      toast.warning("Nenhum caixa aberto.");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      toast.warning("Informe um valor válido.");
      return;
    }

    try {
      setIsSavingCashEntry(true);

      const payload = {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        cash_session_id: cashSession.id,
        type,
        amount: Number(amount || 0),
        note: note || null,
        created_by: user?.id || null,
        created_by_name: user?.name || user?.username || "Usuário",
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("cash_session_entries").insert(payload);

      if (error) {
        throw new Error(error.message || "Erro ao registrar movimentação de caixa.");
      }

      setCashEntries((prev) => [payload, ...prev]);
      toast.success(type === "entry" ? "Entrada registrada." : "Sangria registrada.");
    } catch (error) {
      console.error("Erro ao registrar movimentação do caixa:", error);
      toast.error(error.message || "Erro ao registrar movimentação.");
    } finally {
      setIsSavingCashEntry(false);
    }
  }

  async function handleCloseCash({ informedAmount }) {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!cashSession) {
      toast.warning("Nenhum caixa aberto.");
      return;
    }

    try {
      setIsClosingCash(true);

      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("id, total, cash_session_id")
        .eq("tenant_id", tenantId)
        .eq("cash_session_id", cashSession.id);

      if (salesError) {
        throw new Error(salesError.message || "Erro ao calcular vendas do caixa.");
      }

      const totalSales = (salesData || []).reduce(
        (sum, sale) => sum + Number(sale.total || 0),
        0
      );

      const totalEntries = (cashEntries || [])
        .filter((item) => item.type === "entry")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);

      const totalWithdrawals = (cashEntries || [])
        .filter((item) => item.type === "withdrawal")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);

      const expectedAmount =
        Number(cashSession.initial_amount || 0) + totalSales + totalEntries - totalWithdrawals;

      const difference = Number(informedAmount || 0) - expectedAmount;

      const updatePayload = {
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: user?.id || null,
        closed_by_name: user?.name || user?.username || "Usuário",
        final_amount: Number(informedAmount || 0),
        expected_amount: expectedAmount,
        difference,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("cash_sessions")
        .update(updatePayload)
        .eq("id", cashSession.id)
        .eq("tenant_id", tenantId);

      if (error) {
        throw new Error(error.message || "Erro ao fechar caixa.");
      }

      setCashSession(null);
      setCashEntries([]);
      setIsCashModalOpen(false);
      toast.success("Caixa fechado com sucesso.");
    } catch (error) {
      console.error("Erro ao fechar caixa:", error);
      toast.error(error.message || "Erro ao fechar caixa.");
    } finally {
      setIsClosingCash(false);
    }
  }

  function pickClient(clientId) {
    const client = clients.find((c) => c.id === clientId);
    if (!client) {
      setForm((prev) => ({
        ...prev,
        clientId: "",
        clientName: "",
        clientPhone: "",
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      clientId: client.id,
      clientName: client.nome || "",
      clientPhone: client.telefone1 || client.whatsapp || "",
    }));
  }

  function addProductToCart(product) {
    if (!product) return;
    const available = Number(product.estoqueAtual || 0);

    setForm((prev) => {
      const existing = prev.items.find((item) => item.productId === product.id);

      if (existing) {
        const nextQty = parseQty(existing.qty) + 1;
        if (nextQty > available) {
          toast.warning(`Estoque disponível de ${product.nome}: ${available}.`);
          return prev;
        }

        return {
          ...prev,
          items: prev.items.map((item) =>
            item.productId === product.id
              ? {
                  ...item,
                  qty: String(nextQty),
                  unitValue: String(parseMoney(product.precoVenda || item.unitValue)),
                  lineTotal: String(nextQty * parseMoney(product.precoVenda || item.unitValue)),
                }
              : item
          ),
        };
      }

      if (available <= 0) {
        toast.warning(`Produto ${product.nome} sem estoque disponível.`);
        return prev;
      }

      return {
        ...prev,
        items: [
          ...prev.items,
          {
            id: genId(),
            productId: product.id,
            description: product.nome || "",
            qty: "1",
            unitValue: String(parseMoney(product.precoVenda)),
            lineTotal: String(parseMoney(product.precoVenda)),
          },
        ],
      };
    });

    setBarcodeValue("");
    setProductSearch("");
    setTimeout(() => focusBarcode(), 30);
  }

  function handleBarcodeSubmit() {
    const code = barcodeValue.trim();
    if (!code) return;

    const product = products.find(
      (p) =>
        String(p.codigoBarras || "").trim() === code ||
        String(p.codigo || "").trim() === code
    );

    if (!product) {
      toast.warning("Produto não encontrado pelo código informado.");
      setBarcodeValue("");
      setTimeout(() => focusBarcode(), 30);
      return;
    }

    addProductToCart(product);
  }

  function updateCartQty(itemId, nextQtyRaw) {
    const nextQty = parseQty(nextQtyRaw);
    if (nextQty <= 0) return;

    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== itemId) return item;
        const product = products.find((p) => p.id === item.productId);
        const available = Number(product?.estoqueAtual || 0);

        if (item.productId && nextQty > available) {
          toast.warning(`Estoque disponível de ${item.description}: ${available}.`);
          return item;
        }

        return {
          ...item,
          qty: String(nextQty),
          lineTotal: String(nextQty * parseMoney(item.unitValue)),
        };
      }),
    }));
  }

  function updateCartPrice(itemId, nextValue) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              unitValue: nextValue,
              lineTotal: String(parseQty(item.qty) * parseMoney(nextValue)),
            }
          : item
      ),
    }));
  }

  function removeCartItem(itemId) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== itemId),
    }));
    setTimeout(() => focusBarcode(), 30);
  }

  function selectQuickCatalogService(catalogServiceId) {
    const selected = catalogServices.find((item) => item.id === catalogServiceId);
    setServiceQuickCatalogId(catalogServiceId);
    setServiceQuickDescription(selected?.name || "");
    setServiceQuickValue(
      selected?.value !== undefined && selected?.value !== null
        ? String(selected.value)
        : ""
    );
  }

  function addQuickService() {
    if (!serviceQuickDescription.trim()) {
      toast.warning("Informe a descrição do serviço.");
      return;
    }

    const value = parseMoney(serviceQuickValue);
    if (value <= 0) {
      toast.warning("Informe um valor válido para o serviço.");
      return;
    }

    setForm((prev) => ({
      ...prev,
      services: [
        ...prev.services,
        {
          id: genId(),
          catalogServiceId: serviceQuickCatalogId || "",
          description: serviceQuickDescription,
          value: String(value),
        },
      ],
    }));

    setServiceQuickCatalogId("");
    setServiceQuickDescription("");
    setServiceQuickValue("");
    toast.success("Serviço adicionado à venda.");
    setTimeout(() => focusBarcode(), 30);
  }

  function removeService(serviceId) {
    setForm((prev) => ({
      ...prev,
      services: prev.services.filter((item) => item.id !== serviceId),
    }));
  }

  async function handleFinalize() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!cashSession) {
      toast.warning("Abra o caixa antes de finalizar uma venda.");
      return;
    }

    if (!form.items.length && !form.services.length) {
      toast.warning("Adicione pelo menos um produto ou serviço à venda.");
      return;
    }

    const previewTotals = summarizeSale(form);
    const payment = summarizePayment(previewTotals.total, form.amountPaid);

    const payload = normalizeSale(
      {
        ...form,
        tenant_id: tenantId,
        amountPaid: String(payment.received),
        status: "Finalizada",
      },
      sales,
      tenantId
    );

    let updatedProducts = products;
    try {
      updatedProducts = applySaleStockMovement(products, payload);
    } catch (error) {
      toast.error(error.message || "Não foi possível finalizar a venda por causa do estoque.");
      return;
    }

    const { error: saleError } = await supabase.from("sales").upsert({
      id: payload.id,
      tenant_id: tenantId,
      number: payload.number,
      created_at: payload.createdAt,
      updated_at: new Date().toISOString(),
      client_id: payload.clientId || null,
      client_name: payload.clientName || null,
      payment_method: payload.paymentMethod || null,
      payment_notes: payload.paymentNotes || null,
      amount_paid: payment.received,
      due_date: payload.dueDate || null,
      discount: parseMoney(payload.discount),
      total: previewTotals.total,
      status: payload.status,
      cash_session_id: cashSession.id,
    });

    if (saleError) {
      toast.error(`Erro ao salvar venda: ${saleError.message || "desconhecido"}`);
      return;
    }

    const { error: deleteItemsError } = await supabase
      .from("sale_items")
      .delete()
      .eq("sale_id", payload.id)
      .eq("tenant_id", tenantId);

    if (deleteItemsError) {
      toast.error(
        `Erro ao limpar itens anteriores da venda: ${deleteItemsError.message || "desconhecido"}`
      );
      return;
    }

    const itemsToInsert = [
      ...payload.items.map((item) => ({
        id: item.id || genId(),
        tenant_id: tenantId,
        sale_id: payload.id,
        product_id: item.productId || null,
        description: item.description || "",
        qty: parseQty(item.qty),
        unit_value: parseMoney(item.unitValue),
        total_value: parseQty(item.qty) * parseMoney(item.unitValue),
      })),
      ...payload.services.map((item) => ({
        id: item.id || genId(),
        tenant_id: tenantId,
        sale_id: payload.id,
        product_id: null,
        description: item.description || "",
        qty: 1,
        unit_value: parseMoney(item.value),
        total_value: parseMoney(item.value),
      })),
    ];

    if (itemsToInsert.length) {
      const { error: itemsError } = await supabase.from("sale_items").insert(itemsToInsert);
      if (itemsError) {
        toast.error(`Erro ao salvar itens da venda: ${itemsError.message || "desconhecido"}`);
        return;
      }
    }

    for (const product of updatedProducts) {
      const original = products.find((item) => item.id === product.id);
      if (!original) continue;
      if (String(original.estoqueAtual) === String(product.estoqueAtual)) continue;

      const { error: productError } = await supabase
        .from("products")
        .update({
          estoque_atual: Number(product.estoqueAtual || 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", product.id)
        .eq("tenant_id", tenantId);

      if (productError) {
        toast.error(`Erro ao atualizar estoque: ${productError.message || "desconhecido"}`);
        return;
      }

      const newMovements = (product.stockHistory || []).filter(
        (movement) => !((original.stockHistory || []).some((item) => item.id === movement.id))
      );

      if (newMovements.length) {
        const movementsToInsert = newMovements.map((movement) => ({
          id: movement.id,
          tenant_id: tenantId,
          product_id: product.id,
          type: movement.type,
          qty: movement.qty,
          reason: movement.reason,
          previous_stock: movement.previousStock,
          new_stock: movement.newStock,
          created_at: movement.createdAt,
        }));

        const { error: movementError } = await supabase
          .from("stock_movements")
          .insert(movementsToInsert);

        if (movementError) {
          toast.error(
            `Erro ao registrar movimentação: ${movementError.message || "desconhecido"}`
          );
          return;
        }
      }
    }

    const totals = summarizeSale(payload);
    const receivablePayment = summarizePayment(totals.total, payload.amountPaid);
    const dueDate = payload.dueDate || new Date().toISOString().slice(0, 10);

    if (receivablePayment.remaining > 0) {
      const existingReceivableRes = await supabase
        .from("receivables")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("source_type", "sale")
        .eq("source_id", payload.id)
        .maybeSingle();

      if (existingReceivableRes.error) {
        toast.error(
          `Erro ao verificar conta a receber: ${existingReceivableRes.error.message || "desconhecido"}`
        );
        return;
      }

      const existingReceivable = existingReceivableRes.data;
      const extraReceived = existingReceivable
        ? Math.max(
            0,
            Number(existingReceivable.received_amount || 0) -
              Number(existingReceivable.source_paid_amount || 0)
          )
        : 0;

      const receivedAmount = Math.min(
        totals.total,
        receivablePayment.received + extraReceived
      );

      const remainingAmount = Math.max(0, totals.total - receivedAmount);

      const receivableStatus =
        remainingAmount <= 0
          ? "received"
          : receivedAmount > 0
            ? "partial"
            : "open";

      const { error: receivableError } = await supabase.from("receivables").upsert({
        id: existingReceivable?.id || genId(),
        tenant_id: tenantId,
        source_type: "sale",
        source_id: payload.id,
        description: `Venda ${payload.number}`,
        client_name: payload.clientName || "Cliente não informado",
        amount: totals.total,
        received_amount: receivedAmount,
        source_paid_amount: receivablePayment.received,
        remaining_amount: remainingAmount,
        due_date: dueDate,
        category: "Venda / Crediário",
        notes: payload.paymentNotes || "Gerado automaticamente pela venda.",
        payment_method: payload.paymentMethod || "Crediário",
        status: receivableStatus,
        created_at: existingReceivable?.created_at || new Date().toISOString(),
      });

      if (receivableError) {
        toast.error(
          `Erro ao salvar conta a receber: ${receivableError.message || "desconhecido"}`
        );
        return;
      }
    } else {
      const { error: deleteReceivableError } = await supabase
        .from("receivables")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("source_type", "sale")
        .eq("source_id", payload.id);

      if (deleteReceivableError) {
        toast.error(
          `Erro ao limpar conta a receber: ${deleteReceivableError.message || "desconhecido"}`
        );
        return;
      }
    }

    setSales((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)]);
    setProducts(updatedProducts);

    toast.success(
      payment.remaining > 0
        ? "Venda salva com crediário."
        : "Venda finalizada com sucesso."
    );

    handlePrintCoupon(payload);
    handleNewSale();
  }

  function handlePrintCoupon(customSale = null) {
    const targetSale = customSale || form;

    if (!targetSale?.items?.length && !targetSale?.services?.length) {
      toast.warning("Não há itens na venda para imprimir o cupom.");
      return;
    }

    const printWindow = openPrintWindow();
    if (!printWindow) return;

    const doc = buildSaleCouponPdf(targetSale, settings);
    printPdfInWindow(doc, printWindow);
  }


  useEffect(() => {
    document.body.classList.add("pdv-focus-mode");
    return () => document.body.classList.remove("pdv-focus-mode");
  }, []);


  if (!tenantId || !isLoaded) {
    return (
      <div className="page-stack">
        <Card title="PDV">Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="pdv-focus-page">
      <section className="pdv-focus-topbar">
        <div className="pdv-focus-topbar__left">
  <button
    className="pdv-back-button"
    onClick={() => window.location.assign("/")}
    title="Sair do PDV"
  >
    ←
  </button>

  <div>
    <h1>PDV • Venda {form.number}</h1>
    <p>
      F2 finaliza • F4 nova venda • F6 foca leitor • F8 cupom • ESC limpa busca
    </p>
  </div>
</div>

        <div className="pdv-focus-topbar__right">
          <div className="pdv-focus-topbar__status">
            <div className="pdv-mini-chip">
              <Wallet size={15} />
              <span>{cashSession?.status === "open" ? "Caixa aberto" : "Caixa fechado"}</span>
            </div>
            <div className="pdv-mini-chip">
              <CreditCard size={15} />
              <span>{form.paymentMethod}</span>
            </div>
            <div className="pdv-mini-chip">
              <User size={15} />
              <span>{form.clientName || "Venda balcão"}</span>
            </div>
          </div>

          <div className="pdv-focus-actions pdv-focus-actions--topbar">
            <Button variant="secondary" onClick={handleNewSale}>Nova venda</Button>
            <Button variant="secondary" onClick={() => setIsCashModalOpen(true)}>Caixa</Button>
            <Button variant="secondary" onClick={() => window.location.assign("/vendas")}>Ver vendas</Button>
            <Button onClick={handleFinalize}>Finalizar venda</Button>
          </div>
        </div>
      </section>

      <section className="pdv-focus-layout">
        <div className="pdv-workspace">
          <Card title="Entrada rápida" description="Cliente, leitura e inclusão de itens sem sair da tela.">
            <div className="pdv-focus-fields pdv-focus-fields--4">
              <label className="form-field">
                <span>Cliente</span>
                <select value={form.clientId} onChange={(e) => pickClient(e.target.value)}>
                  <option value="">Venda balcão / sem cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Forma de pagamento</span>
                <select
                  value={form.paymentMethod}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, paymentMethod: e.target.value }))
                  }
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Código de barras / código interno</span>
                <input
                  ref={barcodeRef}
                  value={barcodeValue}
                  onChange={(e) => setBarcodeValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleBarcodeSubmit();
                    }
                  }}
                  placeholder="Bipar código e pressionar Enter"
                />
              </label>

              <label className="form-field">
                <span>Busca rápida</span>
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Nome, código ou barras"
                />
              </label>
            </div>

            <div className="pdv-focus-actions">
              <Button variant="secondary" onClick={handleBarcodeSubmit}>Adicionar pelo código</Button>
              <Button variant="secondary" onClick={() => barcodeRef.current?.focus()}>Focar leitor</Button>
            </div>
          </Card>

          <div className="pdv-focus-stack">
            <Card
              title="Produtos encontrados"
              description="Clique para adicionar ao carrinho."
            >
              <div className="pdv-product-grid pdv-product-grid--focus">
                {quickProducts.length ? (
                  quickProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className="pdv-product-card pdv-product-card--compact"
                      onClick={() => addProductToCart(product)}
                    >
                      <div className="pdv-product-card__head">
                        <div className="pdv-product-card__icon">
                          <Package size={16} />
                        </div>
                        <span
                          className={`pill ${
                            Number(product.estoqueAtual || 0) > 0 ? "pill-success" : "pill-danger"
                          }`}
                        >
                          Estoque {product.estoqueAtual}
                        </span>
                      </div>
                      <strong>{product.nome}</strong>
                      <span>{product.codigo || "Sem código"} • {product.codigoBarras || "Sem barras"}</span>
                      <div className="pdv-product-card__price">{currencyBR(product.precoVenda)}</div>
                    </button>
                  ))
                ) : (
                  <EmptyState
                    title="Sem produtos na busca"
                    description="Digite nome, código ou código de barras."
                  />
                )}
              </div>
            </Card>

            <Card
              title="Serviço rápido"
              description="Adicione serviço sem sair do fluxo do caixa."
            >
              <div className="pdv-focus-fields pdv-focus-fields--3">
                <label className="form-field">
                  <span>Serviço cadastrado</span>
                  <select
                    value={serviceQuickCatalogId || ""}
                    onChange={(e) => selectQuickCatalogService(e.target.value)}
                  >
                    <option value="">Selecionar...</option>
                    {catalogServices
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="form-field">
                  <span>Descrição</span>
                  <input
                    value={serviceQuickDescription}
                    onChange={(e) => setServiceQuickDescription(e.target.value)}
                    placeholder="Ex: instalação, formatação"
                  />
                </label>

                <label className="form-field">
                  <span>Valor</span>
                  <input
                    value={serviceQuickValue}
                    onChange={(e) => setServiceQuickValue(e.target.value)}
                    placeholder="Ex: 80,00"
                  />
                </label>
              </div>

              <div className="pdv-focus-actions">
                <Button variant="secondary" onClick={addQuickService}>Adicionar serviço</Button>
              </div>
            </Card>
          </div>

          <Card
            title="Itens da venda"
            description="Edite quantidade e valor sem sair da tela."
          >
            {form.items.length || form.services.length ? (
              <div className="pdv-lines-stack">
                {form.items.map((item, index) => (
                  <div key={item.id} className="pdv-line-card pdv-line-card--focus">
                    <div className="pdv-line-card__title">
                      <div className="pdv-line-badge"><ShoppingCart size={14} /></div>
                      <div>
                        <strong>Produto {index + 1} — {item.description}</strong>
                        <span>Item de venda</span>
                      </div>
                    </div>

                    <div className="pdv-focus-fields pdv-focus-fields--4">
                      <label className="form-field">
                        <span>Quantidade</span>
                        <input
                          value={item.qty}
                          onChange={(e) => updateCartQty(item.id, e.target.value)}
                        />
                      </label>

                      <label className="form-field">
                        <span>Valor unitário</span>
                        <input
                          value={item.unitValue}
                          onChange={(e) => updateCartPrice(item.id, e.target.value)}
                        />
                      </label>

                      <div className="form-field">
                        <span>Total</span>
                        <div className="empty-inline">
                          {currencyBR(parseQty(item.qty) * parseMoney(item.unitValue))}
                        </div>
                      </div>

                      <div className="pdv-line-card__remove">
                        <Button variant="danger" onClick={() => removeCartItem(item.id)}>
                          Remover
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {form.services.map((service, index) => (
                  <div key={service.id} className="pdv-line-card pdv-line-card--focus">
                    <div className="pdv-line-card__title">
                      <div className="pdv-line-badge pdv-line-badge--service"><Wrench size={14} /></div>
                      <div>
                        <strong>Serviço {index + 1} — {service.description}</strong>
                        <span>Serviço lançado no balcão</span>
                      </div>
                    </div>

                    <div className="pdv-focus-fields pdv-focus-fields--4">
                      <div className="form-field form-field--wide">
                        <span>Descrição</span>
                        <div className="empty-inline">{service.description || "—"}</div>
                      </div>

                      <div className="form-field">
                        <span>Valor</span>
                        <div className="empty-inline">{currencyBR(service.value)}</div>
                      </div>

                      <div className="pdv-line-card__remove">
                        <Button variant="danger" onClick={() => removeService(service.id)}>
                          Remover
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Carrinho vazio"
                description="Bipe ou selecione um produto para começar a venda."
              />
            )}
          </Card>
        </div>

        <aside className="pdv-checkout">
          <Card title="Pagamento" description="Resumo e fechamento sempre visíveis.">
            <div className="pdv-totals-grid">
              <div className="pdv-total-mini">
                <span>Produtos</span>
                <strong>{currencyBR(totals.productSubtotal)}</strong>
              </div>
              <div className="pdv-total-mini">
                <span>Serviços</span>
                <strong>{currencyBR(totals.serviceSubtotal)}</strong>
              </div>
              <div className="pdv-total-mini">
                <span>Subtotal</span>
                <strong>{currencyBR(totals.subtotal)}</strong>
              </div>
              <div className="pdv-total-mini">
                <span>Desconto</span>
                <strong>{currencyBR(totals.discount)}</strong>
              </div>
            </div>

            <div className="pdv-total-highlight">
              <div>Total da venda</div>
              <strong>{currencyBR(totals.total)}</strong>
            </div>

            <div className="pdv-focus-fields pdv-focus-fields--1">
              <label className="form-field">
                <span>Forma de pagamento</span>
                <select
                  value={form.paymentMethod}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, paymentMethod: e.target.value }))
                  }
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Recebido</span>
                <input
                  value={form.amountPaid}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, amountPaid: e.target.value }))
                  }
                  placeholder="Ex: 200,00"
                />
              </label>

              <label className="form-field">
                <span>Desconto</span>
                <input
                  value={form.discount}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, discount: e.target.value }))
                  }
                  placeholder="Ex: 10,00"
                />
              </label>

              <label className="form-field">
                <span>Vencimento crediário</span>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, dueDate: e.target.value }))
                  }
                />
              </label>
            </div>

            <div className="pdv-payment-status">
              <div className="pdv-total-mini">
                <span>Recebido agora</span>
                <strong>{currencyBR(receivedNow)}</strong>
              </div>
              <div className="pdv-total-mini">
                <span>Restante</span>
                <strong>{currencyBR(remainingNow)}</strong>
              </div>
              <div className="pdv-total-mini">
                <span>Data</span>
                <strong>{formatDateTime(form.createdAt)}</strong>
              </div>
            </div>

            <div className="pdv-focus-actions pdv-focus-actions--column">
              <Button onClick={handleFinalize}>Finalizar venda</Button>
              <Button variant="secondary" onClick={() => handlePrintCoupon()}>Imprimir cupom</Button>
              <Button variant="secondary" onClick={handleNewSale}>Nova venda</Button>
            </div>
          </Card>
        </aside>
      </section>
      <CaixaModal
        isOpen={isCashModalOpen}
        onClose={() => setIsCashModalOpen(false)}
        cashSession={cashSession}
        cashEntries={cashEntries}
        salesTotal={cashSalesTotal}
        onOpenCash={handleOpenCash}
        onCloseCash={handleCloseCash}
        onAddEntry={handleAddCashEntry}
        isOpeningCash={isOpeningCash}
        isClosingCash={isClosingCash}
        isSavingEntry={isSavingCashEntry}
      />
    </div>
  );
}