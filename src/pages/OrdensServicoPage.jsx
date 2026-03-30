import { useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  CalendarDays,
  ClipboardList,
  FileText,
  Package,
  Search,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import { jsPDF } from "jspdf";
import qrcode from "qrcode";
import { openPdfAndPrint } from "../lib/printPdf";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/auth.jsx";
import { supabase } from "../lib/supabase";

const STATUS_OPTIONS = [
  "Aberta",
  "Em análise",
  "Aguardando aprovação",
  "Aprovada",
  "Em andamento",
  "Aguardando peça",
  "Pronta",
  "Entregue",
  "Cancelada",
];

const STATUS_COLORS = {
  Aberta: "bg-blue-100 text-blue-700",
  "Em análise": "bg-blue-100 text-blue-700",
  "Aguardando aprovação": "bg-blue-100 text-blue-700",
  Aprovada: "bg-green-100 text-green-700",
  "Em andamento": "bg-green-100 text-green-700",
  "Aguardando peça": "bg-yellow-100 text-yellow-800",
  Pronta: "bg-cyan-100 text-cyan-700",
  Entregue: "bg-emerald-100 text-emerald-700",
  Cancelada: "bg-red-100 text-red-700",
};

const QUICK_STATUS_ACTIONS = [
  { label: "Em análise", value: "Em análise" },
  { label: "Aguardando aprovação", value: "Aguardando aprovação" },
  { label: "Aprovar", value: "Aprovada" },
  { label: "Iniciar serviço", value: "Em andamento" },
  { label: "Aguardar peça", value: "Aguardando peça" },
  { label: "Marcar pronta", value: "Pronta" },
  { label: "Entregar", value: "Entregue" },
];

const PAYMENT_METHODS = ["Dinheiro", "Pix", "Crédito", "Débito", "Crediário", "Outros"];
const DEFAULT_TRACKING_BASE_URL = "https://sistema.sospc.com.br";

function resolveTrackingBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_TRACKING_BASE_URL?.trim();
  if (configuredBaseUrl) {
    const normalizedConfiguredBaseUrl = configuredBaseUrl.replace(/\/$/, "");
    const configuredHost = (() => {
      try {
        return new URL(normalizedConfiguredBaseUrl).hostname?.toLowerCase() || "";
      } catch {
        return "";
      }
    })();

    // Prevent stale temporary tunnel domains from leaking into customer links.
    if (configuredHost && !configuredHost.includes("ngrok")) {
      return normalizedConfiguredBaseUrl;
    }
  }

  if (typeof window !== "undefined") {
    const currentOrigin = window.location.origin?.replace(/\/$/, "");
    const currentHost = window.location.hostname?.toLowerCase();
    const isLocalEnvironment = ["localhost", "127.0.0.1"].includes(currentHost);

    if (currentOrigin && !isLocalEnvironment) {
      return currentOrigin;
    }
  }

  return DEFAULT_TRACKING_BASE_URL;
}

function buildTrackingUrl(trackingToken) {
  return `${resolveTrackingBaseUrl()}/acompanhar/os/${trackingToken}`;
}

async function buildTrackingQrDataUrl(order) {
  const token = order?.publicToken || order?.id;
  if (!token) return "";

  try {
    return await qrcode.toDataURL(buildTrackingUrl(token), {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M",
    });
  } catch (error) {
    console.error("Erro ao gerar QR code:", error);
    return "";
  }
}

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

function nowLocalValue() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function applyOrderStockMovement(products, order, previousOrder = null, mode = "save") {
  const previousParts = previousOrder?.parts || [];
  const currentParts = order?.parts || [];

  const prevByProduct = previousParts.reduce((acc, item) => {
    if (!item.productId) return acc;
    const qty = parseQty(item.qty) || 0;
    acc[item.productId] = (acc[item.productId] || 0) + qty;
    return acc;
  }, {});

  const currentByProduct = currentParts.reduce((acc, item) => {
    if (!item.productId) return acc;
    const qty = parseQty(item.qty) || 0;
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
      id: crypto.randomUUID(),
      type: delta > 0 ? "saida" : "entrada",
      qty: Math.abs(delta),
      reason:
        mode === "delete"
          ? `Estorno OS ${previousOrder?.osNumber || ""}`.trim()
          : delta > 0
            ? `OS ${order.osNumber}`
            : `Estorno OS ${order.osNumber}`,
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

function genId() {
  return crypto.randomUUID();
}

function generatePublicToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

function generateOsNumber(existing, createdAt, prefix = "") {
  const d = new Date(createdAt);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const seq =
    existing.filter((o) => {
      const od = new Date(o.createdAt);
      return `${od.getFullYear()}-${od.getMonth()}-${od.getDate()}` === dayKey;
    }).length + 1;

  return `${prefix || ""}${pad(d.getDate())}${pad(d.getMonth() + 1)}${pad(
    d.getFullYear() % 100
  )}${pad(seq, 2)}`;
}

function emptyServiceItem() {
  return {
    id: crypto.randomUUID(),
    catalogServiceId: "",
    description: "",
    value: "",
  };
}

function emptyPartItem() {
  return { id: genId(), productId: "", description: "", qty: "1", unitValue: "" };
}

function summarize(order) {
  const serviceSubtotal = (order.services || []).reduce(
    (sum, item) => sum + parseMoney(item.value),
    0
  );
  const partsSubtotal = (order.parts || []).reduce(
    (sum, item) => sum + parseQty(item.qty) * parseMoney(item.unitValue),
    0
  );
  const discount = parseMoney(order.discount);
  const total = Math.max(0, serviceSubtotal + partsSubtotal - discount);
  return { serviceSubtotal, partsSubtotal, discount, total };
}

function validateStatusTransition(order) {
  const totals = summarize(order);
  const payment = summarizePayment(totals.total, order.amountPaid);
  const hasService =
    String(order.serviceDescription || "").trim() ||
    (order.services || []).some((item) => String(item.description || "").trim());

  if (order.status === "Pronta" && !hasService) {
    return "Adicione o serviço executado antes de marcar a OS como pronta.";
  }

  if (
    order.status === "Entregue" &&
    payment.remaining > 0 &&
    order.paymentMethod !== "Crediário"
  ) {
    return "Existe saldo pendente. Ajuste o pagamento antes de entregar a OS.";
  }

  return null;
}

function emptyOrder(existing, settings = {}, tenantId = "") {
  const createdAt = nowLocalValue();
  return {
    id: genId(),
    tenant_id: tenantId,
    osNumber: generateOsNumber(existing, createdAt, settings.osPrefix),
    createdAt,
    status: "Aberta",
    atendente: "",
    tecnico: "",
    clientId: "",
    clientName: "",
    clientPhone: "",
    clientDoc: "",
    clientAddress: "",
    equipmentType: "",
    equipmentBrand: "",
    equipmentModel: "",
    serialNumber: "",
    color: "",
    accessories: "",
    physicalState: "",
    unlockPassword: "",
    issue: "",
    entryNotes: "",
    serviceDescription: "",
    services: [emptyServiceItem()],
    parts: [emptyPartItem()],
    discount: "",
    paymentMethod: "",
    paymentNotes: "",
    amountPaid: "",
    dueDate: "",
    publicToken: generatePublicToken(),
    publicStatusNote: "",
    customerNotificationsEnabled: true,
    customerWhatsapp: "",
    lastNotifiedStatus: "",
    history: [
      {
        id: genId(),
        action: "OS criada",
        createdAt: new Date().toISOString(),
        note: "Registro inicial.",
      },
    ],
    createdByName: "",
    createdByRole: "",
  };
}

function normalizeOrder(order, existing = [], tenantId = "") {
  const base = order || emptyOrder(existing, {}, tenantId);
  return {
    ...base,
    tenant_id: base.tenant_id || tenantId,
    services:
      Array.isArray(base.services) && base.services.length
        ? base.services
        : [emptyServiceItem()],
    parts:
      Array.isArray(base.parts) && base.parts.length ? base.parts : [emptyPartItem()],
    history: Array.isArray(base.history) ? base.history : [],
    createdByName: base.createdByName || "",
    createdByRole: base.createdByRole || "",
    amountPaid: base.amountPaid || "",
    dueDate: base.dueDate || "",
  };
}

function summarizePayment(total, amountPaid) {
  const paid = Math.max(0, parseMoney(amountPaid));
  const received = Math.min(total, paid);
  const remaining = Math.max(0, total - received);
  const status = remaining <= 0 ? "paid" : received > 0 ? "partial" : "pending";
  return { received, remaining, status };
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
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder = "", rows = 4 }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </label>
  );
}

function OsKpiCard({ icon: Icon, label, value, hint, tone = "primary" }) {
  return (
    <div className={`os-kpi-card tone-${tone}`}>
      <div className="os-kpi-icon">
        <Icon size={18} />
      </div>
      <div className="os-kpi-content">
        <div className="os-kpi-label">{label}</div>
        <div className="os-kpi-value">{value}</div>
        {hint ? <div className="os-kpi-hint">{hint}</div> : null}
      </div>
    </div>
  );
}

function OsSectionTitle({ icon: Icon, title, description, action = null }) {
  return (
    <div className="os-section-title">
      <div className="os-section-title-main">
        <span className="os-section-icon">
          <Icon size={16} />
        </span>
        <div>
          <h4>{title}</h4>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

async function buildPdf(order, settings = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = 210;
  const rightX = pageWidth - margin;
  let y = 14;

  const totals = summarize(order);
  const companyName = settings.companyName || "SOSPC";
  const fantasyName = settings.fantasyName || "";
  const cnpj = settings.cnpj || "";
  const phone = settings.phone || "";
  const whatsapp = settings.whatsapp || "";
  const address = settings.address || "";
  const footerText = settings.footerText || "Obrigado pela preferência!";
  const logo = settings.companyLogoDataUrl || "";
  const trackingUrl = buildTrackingUrl(order.publicToken || order.id);
  const trackingQrDataUrl = await buildTrackingQrDataUrl(order);

  const ensurePage = (needed = 10) => {
    if (y + needed > 280) {
      doc.addPage();
      y = 16;
    }
  };

  const section = (title) => {
    ensurePage(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(title, margin, y);
    y += 3;
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  };

  const field = (label, value) => {
    ensurePage(6);
    const labelX = margin;
    const valueX = 56;
    const safeValue = String(value || "—");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${label}:`, labelX, y);

    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(safeValue, rightX - valueX);
    doc.text(lines, valueX, y);
    y += Math.max(5, lines.length * 4.5);
  };

  const multiline = (text) => {
    ensurePage(8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(String(text || "—"), pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += Math.max(8, lines.length * 5.5);
  };

  const moneyRow = (label, value, bold = false) => {
    ensurePage(6);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9);
    doc.text(label, margin, y);
    doc.text(String(value || "—"), rightX, y, { align: "right" });
    y += 5;
  };

  if (logo) {
    try {
      doc.addImage(logo, "PNG", margin, y - 1, 14, 14);
    } catch {
      try {
        doc.addImage(logo, "JPEG", margin, y - 2, 14, 14);
      } catch {}
    }
  }

  const titleX = logo ? margin + 18 : margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(companyName, titleX, y);

  if (fantasyName) {
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(fantasyName, titleX, y);
  }

  if (cnpj) {
    y += 5;
    doc.text(`CNPJ: ${cnpj}`, titleX, y);
  }

  if (phone || whatsapp) {
    y += 5;
    doc.text(phone ? `Tel: ${phone}` : `WhatsApp: ${whatsapp}`, titleX, y);
  }

  if (address) {
    y += 5;
    const addressLines = doc.splitTextToSize(address, 100);
    doc.text(addressLines, titleX, y);
    y += addressLines.length * 4;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(formatDateTime(order.createdAt), rightX, margin + 2, { align: "right" });

  if (trackingQrDataUrl) {
    const qrSize = 22;
    const qrX = rightX - qrSize;
    const qrY = margin + 6;
    doc.addImage(trackingQrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
  }

  y += 6;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("ORDEM DE SERVIÇO", margin, y);

  doc.setFontSize(10);
  doc.text(`Nº ${order.osNumber}`, rightX, y, { align: "right" });
  y += 8;

  section("CLIENTE");
  field("Nome", order.clientName);
  field("Telefone", order.clientPhone);
  field("CPF/CNPJ", order.clientDoc);
  field("Endereço", order.clientAddress);

  section("EQUIPAMENTO");
  field("Tipo", order.equipmentType);
  field("Marca", order.equipmentBrand);
  field("Modelo", order.equipmentModel);
  field("Série", order.serialNumber);
  field("Cor", order.color);

  section("DEFEITO RELATADO");
  multiline(order.issue);

  section("DESCRIÇÃO GERAL DO SERVIÇO");
  multiline(order.serviceDescription);

  section("ACESSÓRIOS / ENTRADA");
  const entryText = [
    order.accessories ? `Acessórios: ${order.accessories}` : "",
    order.physicalState ? `Estado físico: ${order.physicalState}` : "",
    order.entryNotes ? `Observações: ${order.entryNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  multiline(entryText || "—");

  section("SERVIÇOS");
  const visibleServices = (order.services || []).filter(
    (item) => item.description || item.value
  );
  if (visibleServices.length) {
    visibleServices.forEach((item) => {
      moneyRow(item.description || "Serviço", currencyBR(parseMoney(item.value)));
    });
  } else {
    moneyRow("Serviços", "—");
  }

  section("PEÇAS");
  const visibleParts = (order.parts || []).filter(
    (item) => item.description || item.unitValue
  );
  if (visibleParts.length) {
    visibleParts.forEach((item) => {
      const qty = parseQty(item.qty) || 1;
      const lineTotal = qty * parseMoney(item.unitValue);
      moneyRow(`${item.description || "Peça"} (${qty}x)`, currencyBR(lineTotal));
    });
  } else {
    moneyRow("Peças", "—");
  }

  section("TOTAIS");
  moneyRow("Subtotal serviços", currencyBR(totals.serviceSubtotal));
  moneyRow("Subtotal peças", currencyBR(totals.partsSubtotal));
  moneyRow("Desconto", currencyBR(totals.discount));
  moneyRow("Total geral", currencyBR(totals.total), true);

  section("PAGAMENTO");
  const payment = summarizePayment(totals.total, order.amountPaid);
  field("Forma", order.paymentMethod);
  field("Recebido", currencyBR(payment.received));
  field("Restante", currencyBR(payment.remaining));
  field("Vencimento", order.dueDate);
  field("Observação", order.paymentNotes);

  if (trackingQrDataUrl) {
    section("ACOMPANHAMENTO");
    const lines = doc.splitTextToSize(trackingUrl, pageWidth - margin * 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(lines, margin, y);
    y += Math.max(6, lines.length * 4.2);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(footerText, margin, 286);

  return doc;
}

async function buildCouponPdf(order, settings = {}) {
  const totals = summarize(order);
  const payment = summarizePayment(totals.total, order.amountPaid);
  const services = (order.services || []).filter((item) => item.description || item.value);
  const parts = (order.parts || []).filter((item) => item.description || item.unitValue);
  const trackingUrl = buildTrackingUrl(order.publicToken || order.id);
  const trackingQrDataUrl = await buildTrackingQrDataUrl(order);
  const extraRows = services.length + parts.length + 32 + (trackingQrDataUrl ? 16 : 0);
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
  center("CUPOM DE ORDEM DE SERVIÇO", 9, true);
  line();
  labelValue("OS:", order.osNumber);
  labelValue("Data:", formatDateTime(order.createdAt));
  labelValue("Cliente:", order.clientName || "—");
  if (order.clientPhone) labelValue("Telefone:", order.clientPhone);
  labelValue("Status:", order.status || "—");
  line();
  labelValue(
    "Equipamento:",
    [order.equipmentType, order.equipmentBrand, order.equipmentModel]
      .filter(Boolean)
      .join(" / ") || "—"
  );
  if (order.serialNumber) labelValue("Série:", order.serialNumber);
  if (order.issue) labelValue("Defeito:", order.issue);
  if (order.entryNotes) labelValue("Obs. entrada:", order.entryNotes);

  line();
  center("SERVIÇOS", 8, true);
  if (order.serviceDescription) labelValue("Descrição geral:", order.serviceDescription);
  if (!services.length) {
    itemRow("Sem serviços", "—");
  } else {
    services.forEach((item) =>
      itemRow(item.description || "Serviço", currencyBR(parseMoney(item.value)))
    );
  }

  line();
  center("PEÇAS", 8, true);
  if (!parts.length) {
    itemRow("Sem peças", "—");
  } else {
    parts.forEach((item) => {
      const qty = parseQty(item.qty) || 1;
      itemRow(
        `${item.description || "Peça"} (${qty}x)`,
        currencyBR(qty * parseMoney(item.unitValue))
      );
    });
  }

  line();
  center("RESUMO", 8, true);
  itemRow("Serviços", currencyBR(totals.serviceSubtotal));
  itemRow("Peças", currencyBR(totals.partsSubtotal));
  itemRow("Desconto", currencyBR(totals.discount));
  itemRow("TOTAL", currencyBR(totals.total));

  line();
  center("PAGAMENTO", 8, true);
  labelValue("Forma:", order.paymentMethod || "—");
  labelValue("Recebido:", currencyBR(payment.received));
  labelValue("Restante:", currencyBR(payment.remaining), true);
  if (order.dueDate) labelValue("Vencimento:", order.dueDate);
  if (order.paymentNotes) labelValue("Obs:", order.paymentNotes);

  if (trackingQrDataUrl) {
    line();
    center("ACOMPANHE SUA OS", 8, true);
    const qrSize = 28;
    const qrX = (80 - qrSize) / 2;
    doc.addImage(trackingQrDataUrl, "PNG", qrX, y, qrSize, qrSize);
    y += qrSize + 4;

    const trackingLines = doc.splitTextToSize(trackingUrl, width);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(trackingLines, 40, y, { align: "center" });
    y += Math.max(4, trackingLines.length * 3.5);
  }

  line();
  center("Assinatura do cliente", 8, false);
  y += 5;
  doc.line(12, y, 68, y);
  y += 6;
  center(settings.footerText || "Obrigado pela preferência!", 8, false);

  return doc;
}

export default function OrdensServicoPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const toast = useToast();

  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [catalogServices, setCatalogServices] = useState([]);
  const [settings, setSettings] = useState({});
  const [query, setQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState("atendimento");
  const [form, setForm] = useState(() => emptyOrder([], {}, ""));
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [trackingQrDataUrl, setTrackingQrDataUrl] = useState("");

  useEffect(() => {
    const token = form.publicToken || form.id;
    if (!token) {
      setTrackingQrDataUrl("");
      return;
    }

    let isActive = true;
    qrcode
      .toDataURL(buildTrackingUrl(token), {
        width: 220,
        margin: 1,
        errorCorrectionLevel: "M",
      })
      .then((dataUrl) => {
        if (isActive) setTrackingQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (isActive) setTrackingQrDataUrl("");
      });

    return () => {
      isActive = false;
    };
  }, [form.publicToken, form.id]);

  useEffect(() => {
    async function fetchData() {
      if (!tenantId) {
        setOrders([]);
        setClients([]);
        setProducts([]);
        setCatalogServices([]);
        setSettings({});
        setSelectedId(null);
        setForm(emptyOrder([], {}, ""));
        setIsLoaded(false);
        return;
      }

      try {
        setIsLoaded(false);

        const [
          ordersRes,
          orderServicesRes,
          partsRes,
          historyRes,
          clientsRes,
          productsRes,
          movementsRes,
          catalogServicesRes,
          settingsRes,
        ] = await Promise.all([
          supabase
            .from("service_orders")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),

          supabase
            .from("service_order_services")
            .select("*")
            .eq("tenant_id", tenantId),

          supabase
            .from("service_order_parts")
            .select("*")
            .eq("tenant_id", tenantId),

          supabase
            .from("service_order_history")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),

          supabase
            .from("clients")
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
        ]);

        if (ordersRes.error) console.error("Erro ao carregar OS:", ordersRes.error);
        if (orderServicesRes.error) console.error("Erro ao carregar serviços da OS:", orderServicesRes.error);
        if (partsRes.error) console.error("Erro ao carregar peças da OS:", partsRes.error);
        if (historyRes.error) console.error("Erro ao carregar histórico da OS:", historyRes.error);
        if (clientsRes.error) console.error("Erro ao carregar clientes:", clientsRes.error);
        if (productsRes.error) console.error("Erro ao carregar produtos:", productsRes.error);
        if (movementsRes.error) console.error("Erro ao carregar movimentações:", movementsRes.error);
        if (catalogServicesRes.error) {
          console.error("Erro ao carregar catálogo de serviços:", catalogServicesRes.error);
        }
        if (settingsRes.error) {
          console.error("Erro ao carregar configurações da empresa:", settingsRes.error);
        }

        const servicesByOrder = (orderServicesRes.data || []).reduce((acc, item) => {
          if (!acc[item.order_id]) acc[item.order_id] = [];
          acc[item.order_id].push({
            id: item.id,
            catalogServiceId: item.catalog_service_id || "",
            description: item.description || "",
            value: String(item.value ?? ""),
          });
          return acc;
        }, {});

        const partsByOrder = (partsRes.data || []).reduce((acc, item) => {
          if (!acc[item.order_id]) acc[item.order_id] = [];
          acc[item.order_id].push({
            id: item.id,
            productId: item.product_id || "",
            description: item.description || "",
            qty: String(item.qty ?? "1"),
            unitValue: String(item.unit_value ?? ""),
          });
          return acc;
        }, {});

        const historyByOrder = (historyRes.data || []).reduce((acc, item) => {
          if (!acc[item.order_id]) acc[item.order_id] = [];
          acc[item.order_id].push({
            id: item.id,
            action: item.action || "",
            note: item.note || "",
            createdAt: item.created_at,
          });
          return acc;
        }, {});

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

        const mappedOrders = (ordersRes.data || []).map((o) =>
          normalizeOrder(
            {
              id: o.id,
              tenant_id: o.tenant_id || tenantId,
              osNumber: o.os_number,
              createdAt: o.created_at,
              status: o.status || "Aberta",
              atendente: o.atendente || "",
              tecnico: o.tecnico || "",
              clientId: o.client_id || "",
              clientName: o.client_name || "",
              clientPhone: o.client_phone || "",
              clientDoc: o.client_doc || "",
              clientAddress: o.client_address || "",
              equipmentType: o.equipment_type || "",
              equipmentBrand: o.equipment_brand || "",
              equipmentModel: o.equipment_model || "",
              serialNumber: o.serial_number || "",
              color: o.color || "",
              accessories: o.accessories || "",
              physicalState: o.physical_state || "",
              unlockPassword: o.unlock_password || "",
              issue: o.issue || "",
              entryNotes: o.entry_notes || "",
              serviceDescription: o.service_description || "",
              services: servicesByOrder[o.id] || [emptyServiceItem()],
              parts: partsByOrder[o.id] || [emptyPartItem()],
              discount: String(o.discount ?? ""),
              paymentMethod: o.payment_method || "",
              paymentNotes: o.payment_notes || "",
              amountPaid: String(o.amount_paid ?? ""),
              dueDate: o.due_date || "",
              paidAmount: Number(o.paid_amount ?? 0),
              remainingAmount: Number(o.remaining_amount ?? 0),
              paymentStatus: o.payment_status || "",
              createdByName: o.created_by_name || "",
              createdByRole: o.created_by_role || "",
              history: historyByOrder[o.id] || [],
              publicToken: o.public_token || generatePublicToken(),
              publicStatusNote: o.public_status_note || "",
              customerNotificationsEnabled: o.customer_notifications_enabled ?? true,
              customerWhatsapp: o.customer_whatsapp || o.client_phone || "",
              lastNotifiedStatus: o.last_notified_status || "",
            },
            [],
            tenantId
          )
        );

        const mappedClients = (clientsRes.data || []).map((c) => ({
          id: c.id,
          tenant_id: c.tenant_id || tenantId,
          nome: c.nome || "",
          telefone1: c.telefone1 || "",
          whatsapp: c.whatsapp || "",
          cpfCnpj: c.cpf_cnpj || "",
          rua: c.rua || "",
          numero: c.numero || "",
          bairro: c.bairro || "",
          cidade: c.cidade || "",
          estado: c.estado || "",
        }));

        const mappedProducts = (productsRes.data || []).map((p) => ({
          id: p.id,
          tenant_id: p.tenant_id || tenantId,
          nome: p.nome || "",
          precoVenda: String(p.preco_venda ?? ""),
          estoqueAtual: String(p.estoque_atual ?? 0),
          stockHistory: movementsByProduct[p.id] || [],
        }));

        const mappedCatalogServices = (catalogServicesRes.data || []).map((item) => ({
          id: item.id,
          tenant_id: item.tenant_id || tenantId,
          name: item.name || "",
          description: item.description || "",
          isActive: item.is_active ?? true,
        }));

        const settingsData = settingsRes.data || {};
        const normalizedSettings = {
          companyName: settingsData.company_name || "SOSPC",
          fantasyName: settingsData.fantasy_name || "",
          cnpj: settingsData.cnpj || "",
          address: settingsData.address || "",
          phone: settingsData.phone || "",
          whatsapp: settingsData.whatsapp || "",
          email: settingsData.email || "",
          footerText: settingsData.footer_text || "Obrigado pela preferência!",
          osPrefix: settingsData.os_prefix || "",
          acceptedPayments: Array.isArray(settingsData.accepted_payments)
            ? settingsData.accepted_payments
            : PAYMENT_METHODS,
          companyLogoDataUrl: settingsData.company_logo_data_url || "",
        };

        setOrders(mappedOrders);
        setClients(mappedClients);
        setProducts(mappedProducts);
        setCatalogServices(mappedCatalogServices);
        setSettings(normalizedSettings);
        setForm(emptyOrder(mappedOrders, normalizedSettings, tenantId));

        if (
          ordersRes.error ||
          orderServicesRes.error ||
          partsRes.error ||
          historyRes.error ||
          clientsRes.error ||
          productsRes.error ||
          movementsRes.error ||
          catalogServicesRes.error ||
          settingsRes.error
        ) {
          toast.warning("Alguns dados da OS não puderam ser carregados completamente.");
        }
      } catch (error) {
        console.error("Erro ao carregar dados da OS:", error);
        toast.error("Erro ao carregar dados da ordem de serviço.");
        setOrders([]);
        setClients([]);
        setProducts([]);
        setCatalogServices([]);
        setSettings({});
      } finally {
        setIsLoaded(true);
      }
    }

    fetchData();
  }, [tenantId, toast]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...orders]
      .filter((order) => {
        const orderTotal = summarize(order).total;
        const payment = summarizePayment(orderTotal, order.amountPaid);
        const matchesQuickFilter =
          quickFilter === "all"
            ? true
            : quickFilter === "open"
              ? !["Entregue", "Cancelada"].includes(order.status)
              : quickFilter === "ready"
                ? order.status === "Pronta"
                : quickFilter === "pending"
                  ? payment.remaining > 0
                  : quickFilter === "approval"
                    ? order.status === "Aguardando aprovação"
                    : true;

        if (!matchesQuickFilter) return false;
        if (!q) return true;

        return [
          order.osNumber,
          order.clientName,
          order.clientPhone,
          order.clientDoc,
          order.equipmentType,
          order.equipmentBrand,
          order.equipmentModel,
          order.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, query, quickFilter]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedId) || null,
    [orders, selectedId]
  );

  const totals = useMemo(() => summarize(form), [form]);

  const orderFlags = useMemo(() => {
    const hasClient = !!String(form.clientName || "").trim();
    const hasEquipment =
      !!String(form.equipmentType || "").trim() || !!String(form.equipmentModel || "").trim();
    const hasIssue = !!String(form.issue || "").trim();
    const total = summarize(form).total;
    const payment = summarizePayment(total, form.amountPaid);

    return {
      canOpen: hasClient && hasEquipment && hasIssue,
      hasPendingPayment: payment.remaining > 0,
      isReady: form.status === "Pronta",
      missingTechnician: !String(form.tecnico || "").trim(),
    };
  }, [form]);

  const partWarnings = useMemo(
    () =>
      (form.parts || [])
        .map((part) => {
          const qty = parseQty(part.qty);
          if (!part.productId || !qty) return null;
          const product = products.find((item) => item.id === part.productId);
          const stock = Number(product?.estoqueAtual || 0);

          if (qty > stock) {
            return {
              id: part.id,
              message: `${product?.nome || "Produto"} sem estoque suficiente (${stock} disponível).`,
            };
          }

          return null;
        })
        .filter(Boolean),
    [form.parts, products]
  );

  useEffect(() => {
    if (selectedOrder) {
      setForm(normalizeOrder(selectedOrder, [], tenantId));
    }
  }, [selectedOrder, tenantId]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleNew() {
    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    setSelectedId(null);
    setForm(emptyOrder(orders, settings, tenantId));
    toast.info("Formulário limpo para nova OS.");
  }

  function addHistory(action, note = "") {
    return {
      id: genId(),
      action,
      createdAt: new Date().toISOString(),
      note,
    };
  }

  function applyStatus(nextStatus) {
    setForm((prev) => {
      if (prev.status === nextStatus) return prev;
      return {
        ...prev,
        status: nextStatus,
        history: [...(prev.history || []), addHistory(`Status alterado para ${nextStatus}`)],
      };
    });
  }

  async function upsertReceivableForOrder(payload, payment, total) {
    const dueDate = payload.dueDate || new Date().toISOString().slice(0, 10);

    const existingReceivableRes = await supabase
      .from("receivables")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("source_type", "order")
      .eq("source_id", payload.id)
      .maybeSingle();

    if (existingReceivableRes.error) {
      throw new Error(existingReceivableRes.error.message || "Erro ao verificar conta a receber.");
    }

    if (payment.remaining <= 0) {
      const { error: deleteReceivableError } = await supabase
        .from("receivables")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("source_type", "order")
        .eq("source_id", payload.id);

      if (deleteReceivableError) {
        throw new Error(deleteReceivableError.message || "Erro ao remover conta a receber.");
      }
      return;
    }

    const existing = existingReceivableRes.data;
    const extraReceived = existing
      ? Math.max(
          0,
          Number(existing.received_amount || 0) - Number(existing.source_paid_amount || 0)
        )
      : 0;

    const receivedAmount = Math.min(total, payment.received + extraReceived);
    const remainingAmount = Math.max(0, total - receivedAmount);
    const status =
      remainingAmount <= 0 ? "received" : receivedAmount > 0 ? "partial" : "open";

    const { error: receivableError } = await supabase.from("receivables").upsert({
      id: existing?.id || crypto.randomUUID(),
      tenant_id: tenantId,
      source_type: "order",
      source_id: payload.id,
      description: `OS ${payload.osNumber}`,
      client_name: payload.clientName || "Cliente não informado",
      amount: total,
      received_amount: receivedAmount,
      source_paid_amount: payment.received,
      remaining_amount: remainingAmount,
      due_date: dueDate,
      category: "OS / Crediário",
      notes: payload.paymentNotes || "Gerado automaticamente pela OS.",
      payment_method: payload.paymentMethod || "Crediário",
      status,
      created_at: existing?.created_at || new Date().toISOString(),
    });

    if (receivableError) {
      throw new Error(receivableError.message || "Erro ao salvar conta a receber.");
    }
  }

  async function handleSave() {
    if (isSaving) return;

    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    if (!form.clientName.trim()) {
      toast.warning("Selecione ou informe um cliente.");
      return;
    }

    if (!form.equipmentType.trim() && !form.equipmentModel.trim()) {
      toast.warning("Informe pelo menos o tipo ou modelo do equipamento.");
      return;
    }

    if (!String(form.issue || "").trim()) {
      toast.warning("Informe o defeito relatado para abrir a OS.");
      return;
    }

    if (partWarnings.length) {
      toast.warning("Existem peças com estoque insuficiente. Revise antes de salvar.");
      setActiveTab("servicos");
      return;
    }

    const transitionError = validateStatusTransition(form);
    if (transitionError) {
      toast.warning(transitionError);
      return;
    }

    const previousOrder = orders.find((order) => order.id === form.id) || null;
    const previewTotals = summarize(form);
    const payment = summarizePayment(previewTotals.total, form.amountPaid);

    if (payment.received > previewTotals.total) {
      toast.warning("O valor recebido não pode ser maior que o total da OS.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = normalizeOrder(
      {
        ...form,
        tenant_id: tenantId,
        paidAmount: payment.received,
        remainingAmount: payment.remaining,
        paymentStatus: payment.status,
        createdByName: form.createdByName || user?.name || "",
        createdByRole: form.createdByRole || user?.role || "",
        publicToken: form.publicToken || generatePublicToken(),
        publicStatusNote: form.publicStatusNote || "",
        customerNotificationsEnabled: form.customerNotificationsEnabled ?? true,
        customerWhatsapp: form.customerWhatsapp || form.clientPhone || "",
        lastNotifiedStatus: form.lastNotifiedStatus || "",
        history: selectedId
          ? [
              ...(form.history || []),
              addHistory(
                "OS atualizada",
                payment.remaining > 0
                  ? "Dados revisados com saldo em aberto."
                  : "Dados revisados."
              ),
            ]
          : [
              ...(form.history || []),
              addHistory(
                "OS salva",
                payment.remaining > 0
                  ? "Registro confirmado com conta a receber."
                  : "Registro confirmado."
              ),
            ],
      },
      [],
      tenantId
    );

    let updatedProducts = products;
    try {
      updatedProducts = applyOrderStockMovement(products, payload, previousOrder);
    } catch (error) {
      toast.error(error.message || "Não foi possível salvar a OS por causa do estoque.");
      return;
    }

    const { error: orderError } = await supabase.from("service_orders").upsert({
      id: payload.id,
      tenant_id: tenantId,
      public_token: payload.publicToken,
      public_status_note: payload.publicStatusNote,
      customer_notifications_enabled: payload.customerNotificationsEnabled,
      customer_whatsapp: payload.customerWhatsapp || null,
      last_notified_status: payload.lastNotifiedStatus || null,
      os_number: payload.osNumber,
      created_at: payload.createdAt,
      updated_at: new Date().toISOString(),
      status: payload.status,
      atendente: payload.atendente,
      tecnico: payload.tecnico,
      client_id: payload.clientId || null,
      client_name: payload.clientName,
      client_phone: payload.clientPhone,
      client_doc: payload.clientDoc,
      client_address: payload.clientAddress,
      equipment_type: payload.equipmentType,
      equipment_brand: payload.equipmentBrand,
      equipment_model: payload.equipmentModel,
      serial_number: payload.serialNumber,
      color: payload.color,
      accessories: payload.accessories,
      physical_state: payload.physicalState,
      unlock_password: payload.unlockPassword,
      issue: payload.issue,
      entry_notes: payload.entryNotes,
      service_description: payload.serviceDescription,
      discount: parseMoney(payload.discount),
      payment_method: payload.paymentMethod,
      payment_notes: payload.paymentNotes,
      amount_paid: parseMoney(payload.amountPaid),
      due_date: payload.dueDate || null,
      paid_amount: payment.received,
      remaining_amount: payment.remaining,
      payment_status: payment.status,
      created_by_name: payload.createdByName,
      created_by_role: payload.createdByRole,
    });

    if (orderError) {
      console.error("Erro ao salvar OS:", orderError);
      toast.error(`Erro ao salvar OS: ${orderError.message || "desconhecido"}`);
      return;
    }

    const { error: deleteServicesError } = await supabase
      .from("service_order_services")
      .delete()
      .eq("order_id", payload.id)
      .eq("tenant_id", tenantId);

    if (deleteServicesError) {
      console.error("Erro ao limpar serviços da OS:", deleteServicesError);
    }

    const servicesToInsert = (payload.services || [])
      .filter((item) => item.description || item.value)
      .map((item) => ({
        id: item.id || crypto.randomUUID(),
        tenant_id: tenantId,
        order_id: payload.id,
        catalog_service_id: item.catalogServiceId || null,
        description: item.description || "",
        value: parseMoney(item.value),
      }));

    if (servicesToInsert.length) {
      const { error: servicesError } = await supabase
        .from("service_order_services")
        .insert(servicesToInsert);

      if (servicesError) {
        console.error("Erro ao salvar serviços da OS:", servicesError);
        toast.error(
          `Erro ao salvar serviços da OS: ${servicesError.message || "desconhecido"}`
        );
        return;
      }
    }

    const { error: deletePartsError } = await supabase
      .from("service_order_parts")
      .delete()
      .eq("order_id", payload.id)
      .eq("tenant_id", tenantId);

    if (deletePartsError) {
      console.error("Erro ao limpar peças da OS:", deletePartsError);
    }

    const partsToInsert = (payload.parts || [])
      .filter((item) => item.description || item.unitValue || item.productId)
      .map((item) => ({
        id: item.id || crypto.randomUUID(),
        tenant_id: tenantId,
        order_id: payload.id,
        product_id: item.productId || null,
        description: item.description || "",
        qty: parseQty(item.qty),
        unit_value: parseMoney(item.unitValue),
      }));

    if (partsToInsert.length) {
      const { error: partsError } = await supabase
        .from("service_order_parts")
        .insert(partsToInsert);

      if (partsError) {
        console.error("Erro ao salvar peças da OS:", partsError);
        toast.error(
          `Erro ao salvar peças da OS: ${partsError.message || "desconhecido"}`
        );
        return;
      }
    }

    const { error: deleteHistoryError } = await supabase
      .from("service_order_history")
      .delete()
      .eq("order_id", payload.id)
      .eq("tenant_id", tenantId);

    if (deleteHistoryError) {
      console.error("Erro ao limpar histórico da OS:", deleteHistoryError);
    }

    const historyToInsert = (payload.history || []).map((item) => ({
      id: item.id || crypto.randomUUID(),
      tenant_id: tenantId,
      order_id: payload.id,
      action: item.action || "",
      note: item.note || "",
      created_at: item.createdAt || new Date().toISOString(),
    }));

    if (historyToInsert.length) {
      const { error: historyError } = await supabase
        .from("service_order_history")
        .insert(historyToInsert);

      if (historyError) {
        console.error("Erro ao salvar histórico da OS:", historyError);
        toast.error(
          `Erro ao salvar histórico da OS: ${historyError.message || "desconhecido"}`
        );
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
          toast.error(`Erro ao registrar movimentação: ${movementError.message || "desconhecido"}`);
          return;
        }
      }
    }

    try {
      await upsertReceivableForOrder(payload, payment, previewTotals.total);
    } catch (error) {
      toast.error(error.message || "Erro ao sincronizar conta a receber.");
      return;
    }

    const nextOrders = (() => {
      const index = orders.findIndex((order) => order.id === payload.id);
      if (index >= 0) {
        const copy = [...orders];
        copy[index] = payload;
        return copy;
      }
      return [payload, ...orders];
    })();

    setOrders(nextOrders);
    setProducts(updatedProducts);
    setSelectedId(payload.id);
    setForm(payload);

    toast.success(
      payment.remaining > 0
        ? "OS salva e conta a receber gerada/atualizada."
        : "OS salva com sucesso."
    );
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (!selectedId) return;
    if (!window.confirm("Cancelar esta OS?")) return;

    setForm((prev) => ({
      ...prev,
      status: "Cancelada",
      history: [...(prev.history || []), addHistory("OS cancelada", "Cancelada pelo usuário.")],
    }));
    toast.info("OS marcada como cancelada. Clique em salvar para confirmar.");
  }

  function applyStatus(nextStatus) {
    setForm((prev) => ({
      ...prev,
      status: nextStatus,
      history: [
        {
          id: genId(),
          action: `Status alterado para ${nextStatus}`,
          note: "",
          createdAt: new Date().toISOString(),
        },
        ...(prev.history || []),
      ],
    }));
  }

  function handleCancel() {
    if (!selectedId) {
      toast.warning("Selecione uma OS para cancelar.");
      return;
    }

    const confirmed = window.confirm("Deseja marcar esta OS como cancelada?");
    if (!confirmed) return;

    setForm((prev) => ({
      ...prev,
      status: "Cancelada",
      history: [
        {
          id: genId(),
          action: "OS cancelada",
          note: "Cancelada pelo usuário.",
          createdAt: new Date().toISOString(),
        },
        ...(prev.history || []),
      ],
    }));

    toast.info("OS marcada como cancelada. Clique em salvar para confirmar.");
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm("Excluir esta OS?")) return;

    if (!tenantId) {
      toast.error("Tenant não identificado.");
      return;
    }

    const previousOrder = orders.find((order) => order.id === selectedId) || null;
    let revertedProducts = products;

    if (previousOrder) {
      try {
        revertedProducts = applyOrderStockMovement(products, previousOrder, previousOrder, "delete");
      } catch (error) {
        toast.error(error.message || "Não foi possível estornar a OS.");
        return;
      }
    }

    const { error } = await supabase
      .from("service_orders")
      .delete()
      .eq("id", selectedId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Erro ao excluir OS:", error);
      toast.error(`Erro ao excluir OS: ${error.message || "desconhecido"}`);
      return;
    }

    if (previousOrder) {
      for (const product of revertedProducts) {
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
            toast.error(`Erro ao registrar movimentação: ${movementError.message || "desconhecido"}`);
            return;
          }
        }
      }
    }

    const { error: receivableDeleteError } = await supabase
      .from("receivables")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("source_type", "order")
      .eq("source_id", selectedId);

    if (receivableDeleteError) {
      toast.error(
        `Erro ao remover conta a receber vinculada: ${receivableDeleteError.message || "desconhecido"}`
      );
      return;
    }

    setProducts(revertedProducts);
    setOrders((prev) => prev.filter((order) => order.id !== selectedId));
    handleNew();
    toast.success("OS excluída com sucesso.");
  }

  function handlePick(order) {
    setSelectedId(order.id);
    setForm(normalizeOrder(order, [], tenantId));
  }

  function pickClient(clientId) {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    setForm((prev) => ({
      ...prev,
      clientId: client.id,
      clientName: client.nome || "",
      clientPhone: client.telefone1 || client.whatsapp || "",
      clientDoc: client.cpfCnpj || "",
      clientAddress: [client.rua, client.numero, client.bairro, client.cidade, client.estado]
        .filter(Boolean)
        .join(", "),
    }));
  }

  function addService() {
    setForm((prev) => ({ ...prev, services: [...prev.services, emptyServiceItem()] }));
  }

  function removeService(id) {
    setForm((prev) => ({
      ...prev,
      services:
        prev.services.length > 1
          ? prev.services.filter((item) => item.id !== id)
          : [emptyServiceItem()],
    }));
  }

  function updateService(id, field, value) {
    setForm((prev) => ({
      ...prev,
      services: prev.services.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  }

  function addPart() {
    setForm((prev) => ({ ...prev, parts: [...prev.parts, emptyPartItem()] }));
  }

  function removePart(id) {
    setForm((prev) => ({
      ...prev,
      parts:
        prev.parts.length > 1
          ? prev.parts.filter((item) => item.id !== id)
          : [emptyPartItem()],
    }));
  }

  function updatePart(id, field, value) {
    setForm((prev) => ({
      ...prev,
      parts: prev.parts.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  }

  function selectProductInPart(partId, productId) {
    const product = products.find((item) => item.id === productId);
    setForm((prev) => ({
      ...prev,
      parts: prev.parts.map((item) =>
        item.id === partId
          ? {
              ...item,
              productId,
              description: product?.nome || item.description,
              unitValue: product?.precoVenda || item.unitValue,
            }
          : item
      ),
    }));
  }

  function selectCatalogService(serviceId, catalogServiceId) {
    const selected = catalogServices.find((item) => item.id === catalogServiceId);

    setForm((prev) => ({
      ...prev,
      services: prev.services.map((service) =>
        service.id === serviceId
          ? {
              ...service,
              catalogServiceId,
              description: selected?.name || "",
            }
          : service
      ),
    }));
  }

  async function handlePrint() {
    try {
      const doc = await buildPdf(form, settings);
      openPdfAndPrint(doc);
      toast.success("PDF da OS gerado com sucesso.");
    } catch (error) {
      console.error("Erro ao gerar PDF da OS:", error);
      toast.error("Não foi possível gerar o PDF da OS.");
    }
  }

  async function handlePrintCoupon() {
    try {
      const doc = await buildCouponPdf(form, settings);
      openPdfAndPrint(doc);
      toast.success("Cupom da OS gerado com sucesso.");
    } catch (error) {
      console.error("Erro ao gerar cupom da OS:", error);
      toast.error("Não foi possível gerar o cupom da OS.");
    }
  }

  const paymentSummary = useMemo(
    () => summarizePayment(totals.total, form.amountPaid),
    [totals.total, form.amountPaid]
  );

  const orderMetrics = useMemo(() => {
    const openStatuses = ["Aberta", "Em análise", "Aguardando aprovação", "Em andamento", "Aguardando peça"];
    const readyStatuses = ["Pronta"];
    const deliveredStatuses = ["Entregue"];
    const openCount = orders.filter((order) => openStatuses.includes(order.status)).length;
    const readyCount = orders.filter((order) => readyStatuses.includes(order.status)).length;
    const deliveredCount = orders.filter((order) => deliveredStatuses.includes(order.status)).length;
    const totalValue = orders.reduce((sum, order) => sum + summarize(order).total, 0);
    return { openCount, readyCount, deliveredCount, totalValue };
  }, [orders]);

  if (!tenantId || !isLoaded) {
    return (
      <div className="page-stack">
        <Card title="Ordens de Serviço">Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="page-stack os-redesign-page">
      <PageHeader
        action={
          <div className="header-actions">
            <Button variant="secondary" onClick={handleNew}>Nova OS</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar OS"}
            </Button>
            <Button variant="secondary" onClick={handlePrint} disabled={isSaving}>Gerar PDF</Button>
            <Button variant="secondary" onClick={handlePrintCoupon} disabled={isSaving}>Cupom</Button>
          </div>
        }
      />

      <div className="os-kpi-grid">
        <OsKpiCard
          icon={ClipboardList}
          label="OS em aberto"
          value={String(orderMetrics.openCount)}
          hint="Demandas que ainda estão em execução"
          tone="primary"
        />
        <OsKpiCard
          icon={ShieldCheck}
          label="Prontas para entrega"
          value={String(orderMetrics.readyCount)}
          hint="Aguardando retirada ou confirmação"
          tone="success"
        />
        <OsKpiCard
          icon={Package}
          label="Finalizadas"
          value={String(orderMetrics.deliveredCount)}
          hint="OS entregues com sucesso"
          tone="warning"
        />
        <OsKpiCard
          icon={BadgeDollarSign}
          label="Valor total das OS"
          value={currencyBR(orderMetrics.totalValue)}
          hint={`${orders.length} ordens registradas`}
          tone="neutral"
        />
      </div>

      <div className="split-layout os-layout">
        <div className="left-column">
          <Card>
            <OsSectionTitle
              icon={Search}
              title="Central de ordens"
              description="Pesquise, filtre e selecione uma OS para editar."
            />

            <div className="os-list-toolbar">
              <label className="os-searchbar">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por OS, cliente, telefone ou equipamento..."
                />
              </label>
              <div className="os-list-counter">{filteredOrders.length} OS encontradas</div>
            </div>

            <div className="os-filter-pills">
              {[
                { label: "Todas", value: "all" },
                { label: "Em aberto", value: "open" },
                { label: "Prontas", value: "ready" },
                { label: "Com saldo", value: "pending" },
                { label: "Aprovação", value: "approval" },
              ].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`os-filter-pill ${quickFilter === filter.value ? "active" : ""}`}
                  onClick={() => setQuickFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {filteredOrders.length ? (
              <div className="client-list os-list">
                {filteredOrders.map((order) => {
                  const orderTotal = summarize(order).total;
                  const orderPayment = summarizePayment(orderTotal, order.amountPaid);
                  const isActive = selectedId === order.id;
                  return (
                    <button
                      type="button"
                      key={order.id}
                      onClick={() => handlePick(order)}
                      className={`client-list-item os-order-card ${isActive ? "active" : ""}`}
                    >
                      <div className="client-list-head">
                        <div>
                          <strong>OS {order.osNumber}</strong>
                          <div className="client-list-meta">
                            {formatDate(order.createdAt)} • {order.clientPhone || "Sem telefone"}
                          </div>
                        </div>
                        <span className={`pill ${STATUS_COLORS[order.status] || ""}`}>
                          {order.status}
                        </span>
                      </div>

                      <div className="os-order-main">
                        <div className="os-order-customer">{order.clientName || "Cliente não informado"}</div>
                        <div className="os-order-equipment">
                          {[order.equipmentType, order.equipmentBrand, order.equipmentModel]
                            .filter(Boolean)
                            .join(" • ") || "Equipamento não informado"}
                        </div>
                        <div className="header-actions" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                          {order.status === "Pronta" ? (
                            <span className="pill bg-cyan-100 text-cyan-700">Pronta</span>
                          ) : null}
                          {order.status === "Aguardando aprovação" ? (
                            <span className="pill bg-blue-100 text-blue-700">Aprovação pendente</span>
                          ) : null}
                          {orderPayment.remaining > 0 ? (
                            <span className="pill bg-yellow-100 text-yellow-800">Saldo pendente</span>
                          ) : null}
                          {!String(order.tecnico || "").trim() ? (
                            <span className="pill bg-slate-100 text-slate-700">Sem técnico</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="os-order-footer">
                        <span>{currencyBR(orderTotal)}</span>
                        <span>{(order.parts || []).filter((item) => item.description || item.productId).length} peça(s)</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="Nenhuma OS encontrada"
                description="Crie a primeira ordem de serviço para começar."
              />
            )}
          </Card>

          <Card className="os-side-summary-card">
            <OsSectionTitle
              icon={FileText}
              title="Resumo da OS atual"
              description="Visão rápida do andamento antes de salvar ou imprimir."
            />
            <div className="os-side-summary">
              <div className="os-summary-row">
                <span>Status</span>
                <strong>{form.status || "—"}</strong>
              </div>
              <div className="os-summary-row">
                <span>Cliente</span>
                <strong>{form.clientName || "Não informado"}</strong>
              </div>
              <div className="os-summary-row">
                <span>Equipamento</span>
                <strong>
                  {[form.equipmentType, form.equipmentBrand, form.equipmentModel].filter(Boolean).join(" / ") || "Não informado"}
                </strong>
              </div>
              <div className="os-summary-row">
                <span>Total</span>
                <strong>{currencyBR(totals.total)}</strong>
              </div>
              <div className="os-summary-row">
                <span>Recebido</span>
                <strong>{currencyBR(paymentSummary.received)}</strong>
              </div>
              <div className="os-summary-row">
                <span>Em aberto</span>
                <strong>{currencyBR(paymentSummary.remaining)}</strong>
              </div>
            </div>

            <div className="header-actions" style={{ marginTop: 16, gap: 8, flexWrap: "wrap" }}>
              {orderFlags.canOpen ? (
                <span className="pill bg-green-100 text-green-700">Cadastro essencial ok</span>
              ) : (
                <span className="pill bg-yellow-100 text-yellow-800">Faltam dados obrigatórios</span>
              )}
              {orderFlags.hasPendingPayment ? (
                <span className="pill bg-yellow-100 text-yellow-800">Saldo pendente</span>
              ) : (
                <span className="pill bg-green-100 text-green-700">Financeiro quitado</span>
              )}
              {orderFlags.missingTechnician ? (
                <span className="pill bg-slate-100 text-slate-700">Sem técnico definido</span>
              ) : null}
              {partWarnings.length ? (
                <span className="pill bg-red-100 text-red-700">Revisar estoque</span>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="right-column">
          <div className="os-tabs-card">
            <div className="os-tabs">
              <button
                type="button"
                className={`os-tab ${activeTab === "atendimento" ? "active" : ""}`}
                onClick={() => setActiveTab("atendimento")}
              >
                Atendimento
              </button>
              <button
                type="button"
                className={`os-tab ${activeTab === "servicos" ? "active" : ""}`}
                onClick={() => setActiveTab("servicos")}
              >
                Serviços e peças
              </button>
              <button
                type="button"
                className={`os-tab ${activeTab === "financeiro" ? "active" : ""}`}
                onClick={() => setActiveTab("financeiro")}
              >
                Financeiro
              </button>
              <button
                type="button"
                className={`os-tab ${activeTab === "historico" ? "active" : ""}`}
                onClick={() => setActiveTab("historico")}
              >
                Histórico
              </button>
            </div>
          </div>

          {activeTab === "atendimento" && (
            <Card>
              <div className="os-detail-header">
                <OsSectionTitle
                  icon={ClipboardList}
                  title={selectedId ? `Editar OS ${form.osNumber}` : `Nova OS ${form.osNumber}`}
                  description="Preencha os dados principais da entrada técnica e do cliente."
                  action={
                    <div className="os-top-actions">
                      <Button variant="secondary" onClick={handleNew}>
                        Limpar
                      </Button>

                      <Button
                        variant="secondary"
                        className="btn-cancel-soft"
                        onClick={handleCancel}
                        disabled={!selectedId || form.status === "Cancelada"}
                      >
                        Cancelar OS
                      </Button>
                    </div>
                  }
                />

                <div className="os-quick-actions">
                  {QUICK_STATUS_ACTIONS.map((action) => (
                    <button
                      key={action.value}
                      type="button"
                      className={`os-quick-action-btn ${form.status === action.value ? "active" : ""}`}
                      onClick={() => applyStatus(action.value)}
                      disabled={isSaving || form.status === "Cancelada" || form.status === action.value}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="os-hero-strip">
                <div className="os-hero-block">
                  <span className="os-hero-label">Número</span>
                  <strong>{form.osNumber}</strong>
                </div>
                <div className="os-hero-block">
                  <span className="os-hero-label">Abertura</span>
                  <strong>{formatDateTime(form.createdAt) || "—"}</strong>
                </div>
                <div className="os-hero-block">
                  <span className="os-hero-label">Responsável</span>
                  <strong>{form.tecnico || form.atendente || "Não definido"}</strong>
                </div>
                <div className="os-hero-block">
                  <span className="os-hero-label">Pagamento</span>
                  <strong>{form.paymentMethod || "Não definido"}</strong>
                </div>
              </div>

              <div className="os-form-sections">
                <section className="os-form-panel">
                  <div className="os-panel-heading">
                    <UserRound size={16} />
                    <div>
                      <h4>Cliente e atendimento</h4>
                      <p>Quem está trazendo o equipamento e quem fará o atendimento.</p>
                    </div>
                  </div>

                  <div className="form-grid form-grid-2">
                    <Input label="Número da OS" value={form.osNumber} onChange={() => {}} disabled />
                    <Input
                      label="Data / hora"
                      value={form.createdAt}
                      onChange={(v) => updateField("createdAt", v)}
                      type="datetime-local"
                    />
                    <label className="form-field">
                      <span>Status</span>
                      <select value={form.status} onChange={(e) => updateField("status", e.target.value)}>
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <Input label="Atendente" value={form.atendente} onChange={(v) => updateField("atendente", v)} />
                    <Input label="Técnico" value={form.tecnico} onChange={(v) => updateField("tecnico", v)} />

                    <label className="form-field">
                      <span>Selecionar cliente</span>
                      <select value={form.clientId} onChange={(e) => pickClient(e.target.value)}>
                        <option value="">Selecionar...</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>{client.nome}</option>
                        ))}
                      </select>
                    </label>

                    <Input label="Cliente" value={form.clientName} onChange={(v) => updateField("clientName", v)} />
                    <Input label="Telefone" value={form.clientPhone} onChange={(v) => updateField("clientPhone", v)} />
                    <Input label="CPF/CNPJ" value={form.clientDoc} onChange={(v) => updateField("clientDoc", v)} />
                    <Input label="Endereço" value={form.clientAddress} onChange={(v) => updateField("clientAddress", v)} />
                  </div>
                </section>

                <section className="os-form-panel">
                  <div className="os-panel-heading">
                    <Wrench size={16} />
                    <div>
                      <h4>Equipamento e diagnóstico</h4>
                      <p>Detalhes técnicos para execução e comunicação com o cliente.</p>
                    </div>
                  </div>

                  <div className="form-grid form-grid-2">
                    <Input label="Tipo do equipamento" value={form.equipmentType} onChange={(v) => updateField("equipmentType", v)} />
                    <Input label="Marca" value={form.equipmentBrand} onChange={(v) => updateField("equipmentBrand", v)} />
                    <Input label="Modelo" value={form.equipmentModel} onChange={(v) => updateField("equipmentModel", v)} />
                    <Input label="Número de série" value={form.serialNumber} onChange={(v) => updateField("serialNumber", v)} />
                    <Input label="Cor" value={form.color} onChange={(v) => updateField("color", v)} />
                    <Input label="Senha / padrão" value={form.unlockPassword} onChange={(v) => updateField("unlockPassword", v)} />
                  </div>

                  <div className="form-grid" style={{ marginTop: 16 }}>
                    <TextArea label="Acessórios deixados" value={form.accessories} onChange={(v) => updateField("accessories", v)} />
                    <TextArea label="Estado físico" value={form.physicalState} onChange={(v) => updateField("physicalState", v)} />
                    <TextArea label="Defeito relatado" value={form.issue} onChange={(v) => updateField("issue", v)} />
                    <TextArea label="Observações de entrada" value={form.entryNotes} onChange={(v) => updateField("entryNotes", v)} />
                    <TextArea label="Descrição geral do serviço" value={form.serviceDescription} onChange={(v) => updateField("serviceDescription", v)} />
                  </div>
                </section>
              </div>

              <div style={{ marginTop: 24 }}>
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 16,
                    padding: 16,
                    background: "#f9fafb",
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 10 }}>
                    Acompanhamento do cliente
                  </strong>

                  <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ background: "#fff", padding: 12, borderRadius: 12 }}>
                      {trackingQrDataUrl ? (
                        <img src={trackingQrDataUrl} alt="QR code de acompanhamento" width={110} height={110} />
                      ) : (
                        <div style={{ width: 110, height: 110 }} />
                      )}
                    </div>

                    <div style={{ flex: 1 }}>
                      <input
                        value={buildTrackingUrl(form.publicToken || form.id)}
                        readOnly
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 8,
                          border: "1px solid #ddd",
                          marginBottom: 10,
                        }}
                      />

                      <Button
                        variant="secondary"
                        onClick={() =>
                          navigator.clipboard.writeText(buildTrackingUrl(form.publicToken || form.id))
                        }
                      >
                        Copiar link
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {activeTab === "servicos" && (
            <>
              <Card>
                <OsSectionTitle
                  icon={Wrench}
                  title="Serviços detalhados"
                  description="Serviços executados e valores aplicados na OS."
                  action={<Button variant="secondary" onClick={addService}>Adicionar serviço</Button>}
                />
                <div className="dynamic-list">
                  {form.services.map((service, index) => (
                    <div key={service.id} className="line-item-card os-line-card">
                      <div className="line-item-head">
                        <div>
                          <strong>Serviço {index + 1}</strong>
                          <div className="client-list-meta">Descrição e valor do serviço executado</div>
                        </div>
                        <Button
                          variant="danger"
                          onClick={() => removeService(service.id)}
                          disabled={form.services.length <= 1}
                        >
                          Remover
                        </Button>
                      </div>

                      <div className="form-grid form-grid-service os-form-grid-service">
                        <label className="form-field">
                          <span>Serviço cadastrado</span>
                          <select
                            value={service.catalogServiceId || ""}
                            onChange={(e) => selectCatalogService(service.id, e.target.value)}
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

                        <Input
                          label="Descrição"
                          value={service.description}
                          onChange={(v) => updateService(service.id, "description", v)}
                        />

                        <Input
                          label="Valor"
                          value={service.value}
                          onChange={(v) => updateService(service.id, "value", v)}
                          placeholder="Ex: 120,00"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <OsSectionTitle
                  icon={Package}
                  title="Peças e itens aplicados"
                  description="Controle das peças vinculadas à OS e impacto no estoque."
                  action={<Button variant="secondary" onClick={addPart}>Adicionar peça</Button>}
                />
                <div className="dynamic-list">
                  {form.parts.map((part, index) => {
                    const lineTotal = parseQty(part.qty) * parseMoney(part.unitValue);
                    return (
                      <div key={part.id} className="line-item-card os-line-card">
                        <div className="line-item-head">
                          <div>
                            <strong>Peça {index + 1}</strong>
                            <div className="client-list-meta">Produto, quantidade e valor unitário</div>
                          </div>
                          <Button
                            variant="danger"
                            onClick={() => removePart(part.id)}
                            disabled={form.parts.length <= 1}
                          >
                            Remover
                          </Button>
                        </div>

                        <div className="form-grid form-grid-2">
                          <label className="form-field">
                            <span>Produto vinculado</span>
                            <select
                              value={part.productId}
                              onChange={(e) => selectProductInPart(part.id, e.target.value)}
                            >
                              <option value="">Selecionar...</option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.nome}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Input
                            label="Descrição"
                            value={part.description}
                            onChange={(v) => updatePart(part.id, "description", v)}
                          />
                        </div>

                        <div className="form-grid form-grid-4">
                          <Input
                            label="Quantidade"
                            value={part.qty}
                            onChange={(v) => updatePart(part.id, "qty", v)}
                          />
                          <Input
                            label="Valor unitário"
                            value={part.unitValue}
                            onChange={(v) => updatePart(part.id, "unitValue", v)}
                          />
                          <Input
                            label="Total do item"
                            value={currencyBR(lineTotal)}
                            onChange={() => {}}
                            disabled
                          />
                        </div>

                        {partWarnings.filter((warning) => warning.id === part.id).map((warning) => (
                          <div key={warning.id} className="pill bg-red-100 text-red-700" style={{ marginTop: 12 }}>
                            {warning.message}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}

          {activeTab === "financeiro" && (
            <div className="os-finance-grid">
              <Card>
                <OsSectionTitle
                  icon={BadgeDollarSign}
                  title="Financeiro e pagamento"
                  description="Resumo de cobrança, recebimento e crediário da OS."
                />

                <div className="os-finance-summary-grid">
                  <div className="os-finance-box">
                    <span>Subtotal serviços</span>
                    <strong>{currencyBR(totals.serviceSubtotal)}</strong>
                  </div>
                  <div className="os-finance-box">
                    <span>Subtotal peças</span>
                    <strong>{currencyBR(totals.partsSubtotal)}</strong>
                  </div>
                  <div className="os-finance-box highlight">
                    <span>Total geral</span>
                    <strong>{currencyBR(totals.total)}</strong>
                  </div>
                  <div className="os-finance-box warning">
                    <span>Em aberto</span>
                    <strong>{currencyBR(paymentSummary.remaining)}</strong>
                  </div>
                </div>

                <div className="form-grid form-grid-4" style={{ marginTop: 16 }}>
                  <Input
                    label="Criado por"
                    value={`${form.createdByName || "—"} ${form.createdByRole ? `(${form.createdByRole})` : ""}`}
                    onChange={() => {}}
                    disabled
                  />
                  <label className="form-field">
                    <span>Forma de pagamento</span>
                    <select value={form.paymentMethod} onChange={(e) => updateField("paymentMethod", e.target.value)}>
                      <option value="">Selecionar...</option>
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label="Desconto"
                    value={form.discount}
                    onChange={(v) => updateField("discount", v)}
                    placeholder="Ex: 20,00"
                  />
                  <Input
                    label="Valor recebido no ato"
                    value={form.amountPaid}
                    onChange={(v) => updateField("amountPaid", v)}
                    placeholder="Ex: 50,00"
                  />
                  <Input
                    label="Vencimento do crediário"
                    value={form.dueDate}
                    onChange={(v) => updateField("dueDate", v)}
                    type="date"
                  />
                  <Input
                    label="Obs. pagamento"
                    value={form.paymentNotes}
                    onChange={(v) => updateField("paymentNotes", v)}
                  />
                </div>
              </Card>
            </div>
          )}

          {activeTab === "historico" && (
            <Card>
              <OsSectionTitle
                icon={CalendarDays}
                title="Histórico da OS"
                description="Linha do tempo com mudanças de status e ações executadas."
              />
              {form.history?.length ? (
                <div className="history-list os-history-list">
                  {form.history
                    .slice()
                    .reverse()
                    .map((item) => (
                      <div className="history-item os-history-item" key={item.id}>
                        <div className="os-history-dot" />
                        <div>
                          <strong>{item.action}</strong>
                          <div className="client-list-meta">{formatDateTime(item.createdAt)}</div>
                          <div className="client-list-meta">{item.note || "Sem observação."}</div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <EmptyState
                  title="Sem histórico"
                  description="As ações da OS aparecerão aqui."
                />
              )}
            </Card>
          )}

          <div className="header-actions os-bottom-actions">
            <Button variant="secondary" onClick={handleNew}>Nova OS</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar OS"}
            </Button>
            <Button variant="secondary" onClick={handlePrint} disabled={isSaving}>Gerar PDF</Button>
            <Button variant="secondary" onClick={handlePrintCoupon} disabled={isSaving}>Cupom</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
