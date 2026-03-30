import { useMemo, useState } from "react";
import Button from "./ui/Button";
import Card from "./ui/Card";

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

function formatDateTime(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR");
}

export default function CaixaModal({
  isOpen,
  onClose,
  cashSession,
  cashEntries = [],
  salesTotal = 0,
  onOpenCash,
  onCloseCash,
  onAddEntry,
  isOpeningCash = false,
  isClosingCash = false,
  isSavingEntry = false,
}) {
  const [openAmount, setOpenAmount] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [closeAmount, setCloseAmount] = useState("");
  const [entryType, setEntryType] = useState("entry");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryNote, setEntryNote] = useState("");

  const entriesSummary = useMemo(() => {
    const totalEntries = (cashEntries || [])
      .filter((item) => item.type === "entry")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const totalWithdrawals = (cashEntries || [])
      .filter((item) => item.type === "withdrawal")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return { totalEntries, totalWithdrawals };
  }, [cashEntries]);

  const expectedAmount = useMemo(() => {
    if (!cashSession) return 0;
    return (
      Number(cashSession.initial_amount || 0) +
      Number(salesTotal || 0) +
      entriesSummary.totalEntries -
      entriesSummary.totalWithdrawals
    );
  }, [cashSession, salesTotal, entriesSummary]);

  const informedAmount = parseMoney(closeAmount);
  const previewDifference = informedAmount - expectedAmount;

  if (!isOpen) return null;

  async function handleOpenCashClick() {
    await onOpenCash({
      initialAmount: parseMoney(openAmount),
      notes: openNotes,
    });
    setOpenAmount("");
    setOpenNotes("");
  }

  async function handleCloseCashClick() {
    await onCloseCash({
      informedAmount,
    });
    setCloseAmount("");
  }

  async function handleEntryClick() {
    await onAddEntry({
      type: entryType,
      amount: parseMoney(entryAmount),
      note: entryNote,
    });
    setEntryAmount("");
    setEntryNote("");
  }

  function handleGoToCashHistory() {
    onClose?.();
    window.location.assign("/caixa");
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 980,
          maxHeight: "92vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Card
          title="Controle de Caixa"
          action={
            <div className="header-actions">
              <Button variant="secondary" onClick={handleGoToCashHistory}>
                Histórico de caixa
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Fechar
              </Button>
            </div>
          }
        >
          {!cashSession ? (
            <div style={{ display: "grid", gap: 16 }}>
              <div className="summary-grid">
                <div><strong>Status:</strong> Caixa fechado</div>
                <div><strong>Ação necessária:</strong> Abrir caixa para vender</div>
              </div>

              <div className="form-grid form-grid-2">
                <label className="form-field">
                  <span>Valor inicial</span>
                  <input
                    value={openAmount}
                    onChange={(e) => setOpenAmount(e.target.value)}
                    placeholder="Ex: 100,00"
                  />
                </label>

                <label className="form-field">
                  <span>Observações</span>
                  <input
                    value={openNotes}
                    onChange={(e) => setOpenNotes(e.target.value)}
                    placeholder="Ex: troco inicial"
                  />
                </label>
              </div>

              <div className="header-actions">
                <Button onClick={handleOpenCashClick} disabled={isOpeningCash}>
                  {isOpeningCash ? "Abrindo..." : "Abrir caixa"}
                </Button>
              </div>

              <div className="empty-inline">
                O PDV só finaliza vendas com um caixa aberto.
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 20 }}>
              <div className="stats-grid">
                <div className="card">
                  <strong>Status</strong>
                  <div>Caixa aberto</div>
                </div>
                <div className="card">
                  <strong>Abertura</strong>
                  <div>{formatDateTime(cashSession.opened_at)}</div>
                </div>
                <div className="card">
                  <strong>Operador</strong>
                  <div>{cashSession.opened_by_name || "—"}</div>
                </div>
                <div className="card">
                  <strong>Saldo inicial</strong>
                  <div>{currencyBR(cashSession.initial_amount || 0)}</div>
                </div>
              </div>

              <div className="stats-grid">
                <div className="card">
                  <strong>Vendas</strong>
                  <div>{currencyBR(salesTotal)}</div>
                </div>
                <div className="card">
                  <strong>Entradas</strong>
                  <div>{currencyBR(entriesSummary.totalEntries)}</div>
                </div>
                <div className="card">
                  <strong>Sangrias</strong>
                  <div>{currencyBR(entriesSummary.totalWithdrawals)}</div>
                </div>
                <div className="card">
                  <strong>Esperado</strong>
                  <div>{currencyBR(expectedAmount)}</div>
                </div>
              </div>

              <Card title="Entrada / Sangria">
                <div className="form-grid form-grid-3">
                  <label className="form-field">
                    <span>Tipo</span>
                    <select
                      value={entryType}
                      onChange={(e) => setEntryType(e.target.value)}
                    >
                      <option value="entry">Entrada</option>
                      <option value="withdrawal">Sangria</option>
                    </select>
                  </label>

                  <label className="form-field">
                    <span>Valor</span>
                    <input
                      value={entryAmount}
                      onChange={(e) => setEntryAmount(e.target.value)}
                      placeholder="Ex: 50,00"
                    />
                  </label>

                  <label className="form-field">
                    <span>Motivo</span>
                    <input
                      value={entryNote}
                      onChange={(e) => setEntryNote(e.target.value)}
                      placeholder="Ex: reforço, retirada, troco"
                    />
                  </label>
                </div>

                <div className="header-actions" style={{ marginTop: 12 }}>
                  <Button variant="secondary" onClick={handleEntryClick} disabled={isSavingEntry}>
                    {isSavingEntry ? "Salvando..." : "Registrar movimentação"}
                  </Button>
                </div>
              </Card>

              <Card title="Movimentações do caixa">
                {cashEntries.length ? (
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
                      {cashEntries.map((item) => (
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
                  <div className="empty-inline">Nenhuma movimentação registrada neste caixa.</div>
                )}
              </Card>

              <Card title="Fechamento do caixa">
                <div className="form-grid form-grid-2">
                  <label className="form-field">
                    <span>Valor contado no caixa</span>
                    <input
                      value={closeAmount}
                      onChange={(e) => setCloseAmount(e.target.value)}
                      placeholder="Ex: 550,00"
                    />
                  </label>

                  <div className="form-field">
                    <span>Resumo do fechamento</span>
                    <div
                      className="empty-inline"
                      style={{
                        display: "grid",
                        gap: 6,
                        minHeight: 46,
                        alignContent: "center",
                      }}
                    >
                      <div>Esperado: {currencyBR(expectedAmount)}</div>
                      <div>
                        Diferença:{" "}
                        <strong>
                          {closeAmount ? currencyBR(previewDifference) : "—"}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="header-actions" style={{ marginTop: 12 }}>
                  <Button variant="secondary" onClick={handleCloseCashClick} disabled={isClosingCash}>
                    {isClosingCash ? "Fechando..." : "Fechar caixa"}
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}