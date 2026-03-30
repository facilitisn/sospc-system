import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import { supabase } from "../lib/supabase";

function formatDateTime(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR");
}

function getStatusTone(status) {
  switch (status) {
    case "Aberta":
    case "Em análise":
      return "info";
    case "Aguardando aprovação":
    case "Aguardando peça":
      return "warning";
    case "Aprovada":
    case "Em andamento":
    case "Entregue":
      return "success";
    case "Pronta":
      return "ready";
    case "Cancelada":
      return "danger";
    default:
      return "neutral";
  }
}

function getStatusMessage(status) {
  switch (status) {
    case "Aberta":
      return "Sua ordem de serviço foi aberta e está aguardando andamento.";
    case "Em análise":
      return "Seu equipamento está em análise técnica.";
    case "Aguardando aprovação":
      return "Estamos aguardando sua aprovação para continuar.";
    case "Aprovada":
      return "O orçamento foi aprovado e a OS seguirá para execução.";
    case "Em andamento":
      return "Seu equipamento está em manutenção neste momento.";
    case "Aguardando peça":
      return "Estamos aguardando a chegada da peça para continuar.";
    case "Pronta":
      return "Seu equipamento está pronto para retirada.";
    case "Entregue":
      return "A OS foi finalizada e entregue.";
    case "Cancelada":
      return "Esta ordem de serviço foi cancelada.";
    default:
      return "Acompanhe aqui o andamento da sua ordem de serviço.";
  }
}

export default function PublicOrderTrackingPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      if (!token) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setNotFound(false);

      const orderRes = await supabase
        .from("service_orders")
        .select(`
          id,
          os_number,
          client_name,
          equipment_type,
          equipment_brand,
          equipment_model,
          status,
          public_status_note,
          created_at,
          updated_at,
          public_token
        `)
        .eq("public_token", token)
        .maybeSingle();

      if (orderRes.error || !orderRes.data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const historyRes = await supabase
        .from("service_order_history")
        .select("id, action, note, created_at")
        .eq("order_id", orderRes.data.id)
        .order("created_at", { ascending: false });

      setOrder(orderRes.data);
      setHistory(historyRes.data || []);
      setLoading(false);
    }

    load();
  }, [token]);

  if (loading) {
    return (
      <div className="page-stack public-os-page">
        <Card>Carregando acompanhamento...</Card>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="page-stack public-os-page">
        <EmptyState
          title="OS não encontrada"
          description="Verifique o link informado ou entre em contato com a assistência."
        />
      </div>
    );
  }

  const equipment = [
    order.equipment_type,
    order.equipment_brand,
    order.equipment_model,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <div className="page-stack public-os-page">
      <Card>
        <div className={`os-status-highlight tone-${getStatusTone(order.status)}`}>
          <div className="os-status-highlight-main">
            <span className="os-status-highlight-label">Status atual</span>
            <strong className="os-status-highlight-value">
              {order.status || "—"}
            </strong>
            <p className="os-status-highlight-text">
              {order.public_status_note?.trim()
                ? order.public_status_note
                : getStatusMessage(order.status)}
            </p>
          </div>

          <div className="os-status-highlight-side">
            <span className="os-status-highlight-meta-label">Ordem de serviço</span>
            <strong>{order.os_number || "—"}</strong>
          </div>
        </div>

        <div className="os-summary-strip">
          <div className="os-summary-item">
            <span className="os-summary-label">Cliente</span>
            <strong className="os-summary-value">
              {order.client_name || "—"}
            </strong>
          </div>

          <div className="os-summary-item">
            <span className="os-summary-label">Equipamento</span>
            <strong className="os-summary-value">{equipment || "—"}</strong>
          </div>

          <div className="os-summary-item">
            <span className="os-summary-label">Abertura</span>
            <strong className="os-summary-value">
              {formatDateTime(order.created_at)}
            </strong>
          </div>

          <div className="os-summary-item">
            <span className="os-summary-label">Última atualização</span>
            <strong className="os-summary-value">
              {formatDateTime(order.updated_at || order.created_at)}
            </strong>
          </div>
        </div>
      </Card>

      <Card>
        <div className="os-section-title">
          <div className="os-section-title-main">
            <div>
              <h4>Histórico da ordem de serviço</h4>
              <p>Acompanhe as atualizações mais recentes da sua OS.</p>
            </div>
          </div>
        </div>

        <div className="os-history-timeline">
          {history.length ? (
            history.map((item, index) => (
              <div key={item.id || index} className="os-history-timeline-item">
                <div className="os-history-timeline-rail">
                  <span className="os-history-timeline-dot" />
                  {index !== history.length - 1 ? (
                    <span className="os-history-timeline-line" />
                  ) : null}
                </div>

                <div className="os-history-timeline-card">
                  <div className="os-history-timeline-head">
                    <strong>{item.action || "Atualização"}</strong>
                    <span>{formatDateTime(item.created_at)}</span>
                  </div>

                  <div className="os-history-timeline-body">
                    {item.note?.trim()
                      ? item.note
                      : "Sem observações adicionais."}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              title="Sem atualizações ainda"
              description="As movimentações da ordem de serviço aparecerão aqui."
            />
          )}
        </div>
      </Card>
    </div>
  );
}
