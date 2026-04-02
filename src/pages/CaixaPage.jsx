import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

function inPeriod(dateStr, start, end) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;

  const startOk = !start || d >= new Date(`${start}T00:00:00`);
  const endOk = !end || d <= new Date(`${end}T23:59:59`);

  return startOk && endOk;
}

function getStatusLabel(status) {
  if (status === "open") return "Aberto";
  if (status === "closed") return "Fechado";
  return status || "—";
}

function getStatusClass(status) {
  if (status === "open") return "pill pill-success";
  if (status === "closed") return "pill";
  return "pill";
}

export default function CaixaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const tenantId = user?.tenant_id;
  const toast = useToast();

  const [cashSessions, setCashSessions] = useState([]);
  const [cashEntries, setCashEntries] = useState([]);
  const [sales, setSales] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("detalhes");

  useEffect(() => {
    async function fetchData() {
      if (!tenantId) {
        setCashSessions([]);
        setCashEntries([]);
        setSales([]);
        setSelectedId(null);
        setIsLoaded(false);
        return;
      }

      try {
        setIsLoaded(false);

        const [sessionsRes, entriesRes, salesRes] = await Promise.all([
          supabase
            .from("cash_sessions")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("opened_at", { ascending: false }),

          supabase
            .from("cash_session_entries")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),

          supabase
            .from("sales")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),
        ]);

        if (sessionsRes.error) {
          console.error("Erro ao carregar caixas:", sessionsRes.error);
          toast.error(`Erro ao carregar caixas: ${sessionsRes.error.message || "desconhecido"}`);
          setCashSessions([]);
          return;
        }

        if (entriesRes.error) {
          console.error("Erro ao carregar movimentações do caixa:", entriesRes.error);
          toast.warning("Não foi possível carregar as movimentações do caixa.");
        }

        if (salesRes.error) {
          console.error("Erro ao carregar vendas:", salesRes.error);
          toast.warning("Não foi possível carregar as vendas vinculadas ao caixa.");
        }

        setCashSessions(sessionsRes.data || []);
        setCashEntries(entriesRes.data || []);
        setSales(salesRes.data || []);
      } catch (error) {
        console.error("Erro ao carregar caixa:", error);
        toast.error("Erro ao carregar dados de caixa.");
        setCashSessions([]);
        setCashEntries([]);
        setSales([]);
      } finally {
        setIsLoaded(true);
      }
    }

    fetchData();
  }, [tenantId, toast]);

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();

    return [...cashSessions]
      .filter((session) => inPeriod(session.opened_at, startDate, endDate))
      .filter((session) => {
        if (!q) return true;

        return [
          session.opened_by_name,
          session.closed_by_name,
          session.status,
          session.notes,
          getStatusLabel(session.status),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => new Date(b.opened_at || 0) - new Date(a.opened_at || 0));
  }, [cashSessions, query, startDate, endDate]);

  const selectedSession = useMemo(
    () =>
      filteredSessions.find((session) => session.id === selectedId) ||
      cashSessions.find((session) => session.id === selectedId) ||
      null,
    [filteredSessions, cashSessions, selectedId]
  );

  const selectedEntries = useMemo(() => {
    if (!selectedSession) return [];
    return cashEntries.filter((item) => item.cash_session_id === selectedSession.id);
  }, [selectedSession, cashEntries]);

  const selectedSales = useMemo(() => {
    if (!selectedSession) return [];
    return sales.filter((sale) => sale.cash_session_id === selectedSession.id);
  }, [selectedSession, sales]);

  const summary = useMemo(() => {
    if (!selectedSession) {
      return {
        totalSales: 0,
        totalEntries: 0,
        totalWithdrawals: 0,
        expectedAmount: 0,
        informedAmount: 0,
        difference: 0,
      };
    }

    const totalSales = selectedSales.reduce(
      (sum, sale) => sum + Number(sale.total || 0),
      0
    );

    const totalEntries = selectedEntries
      .filter((item) => item.type === "entry")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const totalWithdrawals = selectedEntries
      .filter((item) => item.type === "withdrawal")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const expectedAmount =
      Number(selectedSession.initial_amount || 0) +
      totalSales +
      totalEntries -
      totalWithdrawals;

    const informedAmount = Number(selectedSession.final_amount || 0);
    const difference =
      selectedSession.status === "closed"
        ? Number(selectedSession.difference || 0)
        : informedAmount - expectedAmount;

    return {
      totalSales,
      totalEntries,
      totalWithdrawals,
      expectedAmount,
      informedAmount,
      difference,
    };
  }, [selectedSession, selectedEntries, selectedSales]);

  const totalsAll = useMemo(() => {
    const openCount = cashSessions.filter((item) => item.status === "open").length;
    const closedCount = cashSessions.filter((item) => item.status === "closed").length;
    const totalDifference = cashSessions
      .filter((item) => item.status === "closed")
      .reduce((sum, item) => sum + Number(item.difference || 0), 0);

    return {
      openCount,
      closedCount,
      totalDifference,
    };
  }, [cashSessions]);

  if (!tenantId || !isLoaded) {
    return (
      <div className="page-stack">
        <Card title="Caixa">Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Histórico de Caixa"
        description="Consulte caixas abertos e fechados, movimentações, vendas e diferenças."
        action={
          <div className="header-actions">
            <Button variant="secondary" onClick={() => navigate("/pdv")}>
              Voltar ao PDV
            </Button>
          </div>
        }
      />

      <Card title="Resumo geral">
        <div className="stats-grid">
          <div className="card">
            <strong>Caixas abertos</strong>
            <div>{totalsAll.openCount}</div>
          </div>
          <div className="card">
            <strong>Caixas fechados</strong>
            <div>{totalsAll.closedCount}</div>
          </div>
          <div className="card">
            <strong>Diferença acumulada</strong>
            <div>{currencyBR(totalsAll.totalDifference)}</div>
          </div>
        </div>
      </Card>

      <div className="split-layout">
        <div className="left-column">
          <Card title="Sessões de caixa">
            <div className="toolbar">
              <input
                className="toolbar-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por operador, status, observações..."
              />
              <div className="toolbar-count">{filteredSessions.length} caixas</div>
            </div>

            <div className="form-grid form-grid-2" style={{ marginTop: 12, marginBottom: 16 }}>
              <label className="form-field">
                <span>Data inicial</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>Data final</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </div>

            {filteredSessions.length ? (
              <div className="client-list">
                {filteredSessions.map((session) => (
                  <button
                    type="button"
                    key={session.id}
                    onClick={() => setSelectedId(session.id)}
                    className={`client-list-item ${selectedId === session.id ? "active" : ""}`}
                  >
                    <div className="client-list-head">
                      <strong>{formatDateTime(session.opened_at)}</strong>
                      <span className={getStatusClass(session.status)}>
                        {getStatusLabel(session.status)}
                      </span>
                    </div>

                    <div className="client-list-meta">
                      Abertura: {session.opened_by_name || "—"}
                    </div>

                    <div className="client-list-meta">
                      Inicial: {currencyBR(session.initial_amount || 0)}
                    </div>

                    <div className="client-list-meta">
                      Fechamento: {session.closed_at ? formatDateTime(session.closed_at) : "Em aberto"}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhum caixa encontrado"
                description="As sessões de caixa abertas e fechadas aparecerão aqui."
              />
            )}
          </Card>
        </div>

        <div className="right-column">
          <Card
            title={selectedSession ? "Detalhes do caixa" : "Selecione um caixa"}
          >
            <div className="cash-tabs">
              <button
                type="button"
                className={`cash-tab ${activeTab === "detalhes" ? "active" : ""}`}
                onClick={() => setActiveTab("detalhes")}
              >
                Detalhes
              </button>
              <button
                type="button"
                className={`cash-tab ${activeTab === "movimentacoes" ? "active" : ""}`}
                onClick={() => setActiveTab("movimentacoes")}
              >
                Movimentações
              </button>
              <button
                type="button"
                className={`cash-tab ${activeTab === "vendas" ? "active" : ""}`}
                onClick={() => setActiveTab("vendas")}
              >
                Vendas
              </button>
            </div>

            {activeTab === "detalhes" ? (
              selectedSession ? (
                <>
                  <div className="summary-grid">
                    <div><strong>Status:</strong> {getStatusLabel(selectedSession.status)}</div>
                    <div><strong>Abertura:</strong> {formatDateTime(selectedSession.opened_at)}</div>
                    <div><strong>Operador abertura:</strong> {selectedSession.opened_by_name || "—"}</div>
                    <div><strong>Saldo inicial:</strong> {currencyBR(selectedSession.initial_amount || 0)}</div>
                    <div><strong>Fechamento:</strong> {selectedSession.closed_at ? formatDateTime(selectedSession.closed_at) : "Em aberto"}</div>
                    <div><strong>Operador fechamento:</strong> {selectedSession.closed_by_name || "—"}</div>
                    <div><strong>Observações:</strong> {selectedSession.notes || "—"}</div>
                  </div>

                  <div className="stats-grid" style={{ marginTop: 20 }}>
                    <div className="card">
                      <strong>Vendas</strong>
                      <div>{currencyBR(summary.totalSales)}</div>
                    </div>
                    <div className="card">
                      <strong>Entradas</strong>
                      <div>{currencyBR(summary.totalEntries)}</div>
                    </div>
                    <div className="card">
                      <strong>Sangrias</strong>
                      <div>{currencyBR(summary.totalWithdrawals)}</div>
                    </div>
                    <div className="card">
                      <strong>Esperado</strong>
                      <div>{currencyBR(summary.expectedAmount)}</div>
                    </div>
                    <div className="card">
                      <strong>Informado</strong>
                      <div>{currencyBR(summary.informedAmount)}</div>
                    </div>
                    <div className="card">
                      <strong>Diferença</strong>
                      <div>{currencyBR(summary.difference)}</div>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState
                  title="Nenhum caixa selecionado"
                  description="Escolha uma sessão de caixa para ver os detalhes."
                />
              )
            ) : activeTab === "movimentacoes" ? (
              selectedSession ? (
                selectedEntries.length ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Valor</th>
                        <th>Motivo</th>
                        <th>Usuário</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEntries.map((item) => (
                        <tr key={item.id}>
                          <td>{item.type === "entry" ? "Entrada" : "Sangria"}</td>
                          <td>{currencyBR(item.amount)}</td>
                          <td>{item.note || "—"}</td>
                          <td>{item.created_by_name || "—"}</td>
                          <td>{formatDateTime(item.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-inline">Nenhuma movimentação neste caixa.</div>
                )
              ) : (
                <div className="empty-inline">Selecione um caixa para ver as movimentações.</div>
              )
            ) : selectedSession ? (
              selectedSales.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Venda</th>
                      <th>Cliente</th>
                      <th>Pagamento</th>
                      <th>Total</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSales.map((sale) => (
                      <tr key={sale.id}>
                        <td>{sale.number || sale.id}</td>
                        <td>{sale.client_name || "Balcão"}</td>
                        <td>{sale.payment_method || "—"}</td>
                        <td>{currencyBR(sale.total || 0)}</td>
                        <td>{formatDateTime(sale.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-inline">Nenhuma venda vinculada a este caixa.</div>
              )
            ) : (
              <div className="empty-inline">Selecione um caixa para ver as vendas.</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}