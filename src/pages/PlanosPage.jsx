import { useMemo, useState } from "react";
import { BadgeDollarSign, Check, Crown, Rocket, ShieldCheck, Wrench } from "lucide-react";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import PageHeader from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { getTrialDaysLeft, useAuth } from "../auth/auth.jsx";
import { supabase } from "../lib/supabase";

const BILLING_OPTIONS = {
  monthly: { label: "Mensal", discount: 0, multiplier: 1 },
  quarterly: { label: "Trimestral", discount: 0.05, multiplier: 3 },
  yearly: { label: "Anual", discount: 0.15, multiplier: 12 },
};

const PLANS = [
  {
    id: "essencial",
    name: "Essencial",
    monthlyPrice: 49.9,
    description: "Para o técnico que quer organizar a assistência sem complicação.",
    badge: "Começo rápido",
    icon: Wrench,
    highlight: false,
    limit: "1 usuário",
    cta: "Começar no Essencial",
    features: [
      "Ordens de Serviço completas",
      "Cadastro de clientes",
      "Histórico de OS",
      "Serviços e peças na OS",
      "Acompanhamento por QR Code",
      "Fluxo ideal para técnico autônomo",
    ],
  },
  {
    id: "profissional",
    name: "Profissional",
    monthlyPrice: 79.9,
    description: "Controle total da operação para quem vende produto e serviço no mesmo sistema.",
    badge: "Mais escolhido",
    icon: Rocket,
    highlight: true,
    limit: "Até 3 usuários",
    cta: "Assinar Profissional",
    features: [
      "Tudo do Essencial",
      "PDV completo",
      "Pagamento misto",
      "Controle de caixa",
      "Controle de estoque",
      "QR Code de acompanhamento",
      "Fluxo ideal para loja pequena e média",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    monthlyPrice: 119.9,
    description: "Estrutura completa para empresas que querem crescer com segurança.",
    badge: "Mais completo",
    icon: Crown,
    highlight: false,
    limit: "Usuários ilimitados",
    cta: "Assinar Premium",
    features: [
      "Tudo do Profissional",
      "Usuários ilimitados",
      "Permissões por perfil",
      "Operação multiusuário completa",
      "Prioridade no suporte",
      "Preparado para módulos avançados",
    ],
  },
];

const ADDONS = [
  {
    id: "fiscal",
    name: "Módulo Fiscal",
    price: 59,
    description: "NF-e / NFC-e como módulo adicional, sem travar a venda do sistema principal.",
    icon: ShieldCheck,
    features: ["Emissão fiscal", "XML e DANFE", "Integração futura com API fiscal"],
  },
  {
    id: "whatsapp",
    name: "WhatsApp Automático",
    price: 19,
    description: "Atualizações automáticas de OS, cobrança e avisos para o cliente.",
    icon: BadgeDollarSign,
    features: ["OS pronta", "Link de acompanhamento", "Avisos automáticos"],
  },
];

function currencyBR(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function statusLabel(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return "Ativo";
  if (normalized === "trial") return "Trial";
  if (normalized === "expired") return "Expirado";
  if (normalized === "canceled") return "Cancelado";
  return status || "Sem status";
}

function statusTone(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return "success";
  if (normalized === "trial") return "warning";
  if (normalized === "expired" || normalized === "canceled") return "danger";
  return "neutral";
}

function PlanCard({ plan, cycle, onSelect, isSelected, isCurrentPlanActive }) {
  const billing = BILLING_OPTIONS[cycle];
  const cycleTotal = plan.monthlyPrice * billing.multiplier * (1 - billing.discount);
  const effectiveMonthly = cycleTotal / billing.multiplier;
  const Icon = plan.icon;

  return (
    <Card
      className={`plans-card ${plan.highlight ? "plans-card--highlight" : ""} ${
        isSelected ? "plans-card--selected" : ""
      }`}
    >
      <div className="plans-card__badge-row">
        <span className={`plans-badge ${plan.highlight ? "plans-badge--highlight" : ""}`}>
          {plan.badge}
        </span>
        {isSelected ? <span className="plans-badge plans-badge--neutral">Selecionado</span> : null}
      </div>

      <div className="plans-card__header">
        <div className={`plans-card__icon ${plan.highlight ? "is-highlight" : ""}`}>
          <Icon size={20} />
        </div>
        <div>
          <h3>{plan.name}</h3>
          <p>{plan.description}</p>
        </div>
      </div>

      <div className="plans-card__price-block">
        <div className="plans-card__price">{currencyBR(effectiveMonthly)}</div>
        <div className="plans-card__price-caption">por mês no {billing.label.toLowerCase()}</div>
        {billing.discount > 0 ? (
          <div className="plans-card__price-secondary">
            Total do ciclo: {currencyBR(cycleTotal)} • desconto de{" "}
            {Math.round(billing.discount * 100)}%
          </div>
        ) : (
          <div className="plans-card__price-secondary">Cobrança mensal simples e direta</div>
        )}
      </div>

      <div className="plans-card__limit">{plan.limit}</div>

      {isCurrentPlanActive ? (
        <div className="plans-card__active-note">✔ Plano em uso</div>
      ) : null}

      <ul className="plans-feature-list">
        {plan.features.map((feature) => (
          <li key={feature}>
            <Check size={16} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Button variant={isSelected ? "primary" : "secondary"} onClick={() => onSelect(plan)}>
        {plan.cta}
      </Button>
    </Card>
  );
}

function AddonCard({ addon }) {
  const Icon = addon.icon;

  return (
    <Card className="addon-card">
      <div className="addon-card__header">
        <div className="addon-card__icon">
          <Icon size={18} />
        </div>
        <div>
          <h4>{addon.name}</h4>
          <p>{addon.description}</p>
        </div>
      </div>

      <div className="addon-card__price">+ {currencyBR(addon.price)}/mês</div>

      <ul className="plans-feature-list plans-feature-list--compact">
        {addon.features.map((feature) => (
          <li key={feature}>
            <Check size={16} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function PlanosPage() {
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [selectedPlanId, setSelectedPlanId] = useState("profissional");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user, tenantSubscription, refreshTenantSubscription } = useAuth();
  const toast = useToast();

  const selectedPlan = useMemo(
    () => PLANS.find((plan) => plan.id === selectedPlanId) || PLANS[1],
    [selectedPlanId]
  );

  const selectedBilling = BILLING_OPTIONS[billingCycle];
  const selectedTotal =
    selectedPlan.monthlyPrice * selectedBilling.multiplier * (1 - selectedBilling.discount);

  const isCurrentPlan = tenantSubscription?.plan === selectedPlan.id;
  const isActive = tenantSubscription?.subscription_status === "active";

  function handleSelectPlan(plan) {
    setSelectedPlanId(plan.id);
  }

  async function handleActivatePlan(planId, cycle) {
    if (user?.role !== "owner" && user?.role !== "Administrador") {
      toast.error("Você não tem permissão para alterar o plano.");
      return;
    }

    if (!user?.tenant_id) {
      toast.error("Tenant não identificado.");
      return;
    }

    try {
      setIsSubmitting(true);

      const cycleDays = cycle === "yearly" ? 365 : cycle === "quarterly" ? 90 : 30;

      // FUTURO: integrar checkout real aqui (Stripe / Mercado Pago)
      const { error } = await supabase
        .from("tenants")
        .update({
          plan: planId,
          subscription_status: "active",
          expires_at: addDays(cycleDays),
        })
        .eq("id", user.tenant_id);

      if (error) {
        throw new Error(error.message || "Erro ao ativar plano.");
      }

      await refreshTenantSubscription();
      toast.success("Plano ativado com sucesso.");
    } catch (error) {
      console.error("Erro ao ativar plano:", error);
      toast.error(error.message || "Não foi possível ativar o plano.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack plans-page">
      <PageHeader
        title="Planos do sistema"
        description="Um sistema de técnico para técnico"
        action={
          <div className="plans-cycle-switch">
            {Object.entries(BILLING_OPTIONS).map(([key, option]) => (
              <button
                key={key}
                type="button"
                className={`plans-cycle-switch__button ${billingCycle === key ? "active" : ""}`}
                onClick={() => setBillingCycle(key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {tenantSubscription && (
        <Card className="plans-status-card">
          <div className="plans-status-card__head">
            <div>
              <h3>Status da assinatura</h3>
              <p>Acompanhe seu plano atual e o vencimento do acesso.</p>
            </div>
            <span
              className={`plans-status-pill plans-status-pill--${statusTone(
                tenantSubscription.subscription_status
              )}`}
            >
              {statusLabel(tenantSubscription.subscription_status)}
            </span>
          </div>

          <div className="plans-status-grid">
            <div className="plans-status-box">
              <span>Plano atual</span>
              <strong>{tenantSubscription.plan || "Não definido"}</strong>
            </div>

            <div className="plans-status-box">
              <span>Status</span>
              <strong>{statusLabel(tenantSubscription.subscription_status)}</strong>
            </div>

            {tenantSubscription.subscription_status === "trial" ? (
              <div className="plans-status-box">
                <span>Dias restantes</span>
                <strong>{getTrialDaysLeft(tenantSubscription?.trial_ends_at)} dia(s)</strong>
              </div>
            ) : null}

            {tenantSubscription.expires_at ? (
              <div className="plans-status-box">
                <span>Expira em</span>
                <strong>
                  {new Date(tenantSubscription.expires_at).toLocaleDateString("pt-BR")}
                </strong>
              </div>
            ) : null}
          </div>

          {tenantSubscription?.subscription_status === "trial" ? (
            <div className="plans-trial-callout">
              Seu período de teste está ativo. Escolha um plano para continuar usando sem
              interrupções.
            </div>
          ) : null}
        </Card>
      )}

      <Card className="plans-hero">
        <div className="plans-hero__content">
          <span className="plans-hero__eyebrow">Pensado a partir da rotina real da assistência</span>
          <h2>Você construiu um produto com dor real de oficina.</h2>
          <p>
            A proposta aqui não é vender "mais um sistema". É entregar organização, velocidade e
            controle para quem vive assistência técnica todos os dias.
          </p>
        </div>
        <div className="plans-hero__quote">
          <strong>“Um sistema de técnico para técnico”</strong>
          <span>
            Feito com base no que faltava nos sistemas que você já testou no mercado.
          </span>
        </div>
      </Card>

      <section className="plans-grid">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            cycle={billingCycle}
            onSelect={handleSelectPlan}
            isSelected={selectedPlan.id === plan.id}
            isCurrentPlanActive={
              tenantSubscription?.plan === plan.id &&
              tenantSubscription?.subscription_status === "active"
            }
          />
        ))}
      </section>

      <section className="plans-bottom-grid">
        <Card className="plans-summary-card">
          <div className="plans-summary-card__head">
            <div>
              <h3>Resumo da escolha</h3>
              <p>Base ideal para ligar no checkout depois.</p>
            </div>
            <span className="plans-badge plans-badge--neutral">Plano selecionado</span>
          </div>

          <div className="plans-summary-list">
            <div className="plans-summary-row">
              <span>Plano</span>
              <strong>{selectedPlan.name}</strong>
            </div>
            <div className="plans-summary-row">
              <span>Ciclo</span>
              <strong>{selectedBilling.label}</strong>
            </div>
            <div className="plans-summary-row">
              <span>Total do ciclo</span>
              <strong>{currencyBR(selectedTotal)}</strong>
            </div>
            <div className="plans-summary-row">
              <span>Frase comercial</span>
              <strong>{selectedPlan.description}</strong>
            </div>
          </div>

          <div className="plans-summary-card__actions">
            <Button
              onClick={() => handleActivatePlan(selectedPlan.id, billingCycle)}
              disabled={isSubmitting || (isCurrentPlan && isActive)}
            >
              {isSubmitting
                ? "Ativando..."
                : isCurrentPlan && isActive
                ? "Plano atual"
                : "Continuar para cobrança"}
            </Button>
            <Button variant="secondary">Falar com atendimento</Button>
          </div>
        </Card>

        <div className="plans-addons-stack">
          <Card>
            <div className="plans-summary-card__head">
              <div>
                <h3>Módulos extras</h3>
                <p>Perfeitos para aumentar ticket sem complicar o plano principal.</p>
              </div>
            </div>
          </Card>

          {ADDONS.map((addon) => (
            <AddonCard key={addon.id} addon={addon} />
          ))}
        </div>
      </section>

      <style>{`
        .plans-page {
          gap: 20px;
        }

        .plans-cycle-switch {
          display: inline-flex;
          background: #f3f4f6;
          padding: 4px;
          border-radius: 14px;
          gap: 4px;
          flex-wrap: wrap;
        }

        .plans-cycle-switch__button {
          border: 0;
          background: transparent;
          padding: 10px 14px;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
        }

        .plans-cycle-switch__button.active {
          background: #111827;
          color: white;
        }

        .plans-status-card {
          display: grid;
          gap: 16px;
          border-radius: 24px;
        }

        .plans-status-card__head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .plans-status-card__head h3 {
          margin: 0 0 6px;
        }

        .plans-status-card__head p {
          margin: 0;
          color: #6b7280;
        }

        .plans-status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }

        .plans-status-box {
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 14px 16px;
          display: grid;
          gap: 6px;
          background: #fafafa;
        }

        .plans-status-box span {
          color: #6b7280;
          font-size: 13px;
        }

        .plans-status-box strong {
          color: #111827;
          font-size: 16px;
        }

        .plans-status-pill {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }

        .plans-status-pill--success {
          background: #dcfce7;
          color: #166534;
        }

        .plans-status-pill--warning {
          background: #fef3c7;
          color: #92400e;
        }

        .plans-status-pill--danger {
          background: #fee2e2;
          color: #991b1b;
        }

        .plans-status-pill--neutral {
          background: #e5e7eb;
          color: #374151;
        }

        .plans-trial-callout {
          margin-top: 4px;
          color: #92400e;
          font-weight: 600;
        }

        .plans-hero {
          display: grid;
          grid-template-columns: 1.7fr 1fr;
          gap: 20px;
          align-items: stretch;
        }

        .plans-hero__eyebrow {
          display: inline-block;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #2563eb;
          margin-bottom: 10px;
        }

        .plans-hero__content h2 {
          margin: 0 0 10px;
          font-size: 28px;
          line-height: 1.1;
        }

        .plans-hero__content p,
        .plans-hero__quote span,
        .plans-card__header p,
        .addon-card__header p,
        .plans-summary-card__head p {
          color: #6b7280;
          line-height: 1.5;
        }

        .plans-hero__quote {
          border: 1px solid #dbeafe;
          background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
          border-radius: 20px;
          padding: 22px;
          display: grid;
          gap: 8px;
          align-content: center;
        }

        .plans-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .plans-card,
        .addon-card,
        .plans-summary-card {
          border-radius: 24px;
        }

        .plans-card {
          display: grid;
          gap: 16px;
          border: 1px solid #e5e7eb;
        }

        .plans-card--highlight {
          border-color: #93c5fd;
          box-shadow: 0 18px 45px rgba(37, 99, 235, 0.14);
          position: relative;
          transform: translateY(-2px);
        }

        .plans-card--selected {
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        .plans-card__badge-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }

        .plans-badge {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          background: #f3f4f6;
          color: #374151;
        }

        .plans-badge--highlight {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .plans-badge--neutral {
          background: #eef2ff;
          color: #4338ca;
        }

        .plans-card__header,
        .addon-card__header {
          display: flex;
          gap: 14px;
          align-items: flex-start;
        }

        .plans-card__icon,
        .addon-card__icon {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f3f4f6;
          color: #111827;
          flex-shrink: 0;
        }

        .plans-card__icon.is-highlight {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .plans-card__header h3,
        .addon-card__header h4,
        .plans-summary-card__head h3 {
          margin: 0 0 6px;
        }

        .plans-card__price-block {
          display: grid;
          gap: 4px;
        }

        .plans-card__price {
          font-size: 34px;
          line-height: 1;
          font-weight: 800;
          color: #111827;
        }

        .plans-card__price-caption {
          font-weight: 600;
          color: #374151;
        }

        .plans-card__price-secondary,
        .plans-card__limit {
          font-size: 13px;
          color: #6b7280;
        }

        .plans-card__active-note {
          color: #16a34a;
          font-weight: 600;
          font-size: 13px;
        }

        .plans-feature-list {
          display: grid;
          gap: 10px;
          padding: 0;
          margin: 0;
          list-style: none;
        }

        .plans-feature-list li {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          color: #111827;
        }

        .plans-feature-list li svg {
          color: #16a34a;
          margin-top: 2px;
          flex-shrink: 0;
        }

        .plans-feature-list--compact {
          gap: 8px;
        }

        .plans-bottom-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 18px;
        }

        .plans-summary-card__head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .plans-summary-list {
          display: grid;
          gap: 12px;
        }

        .plans-summary-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid #e5e7eb;
        }

        .plans-summary-row span {
          color: #6b7280;
        }

        .plans-summary-row strong {
          text-align: right;
          color: #111827;
        }

        .plans-summary-card__actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 18px;
        }

        .plans-addons-stack {
          display: grid;
          gap: 14px;
        }

        .addon-card {
          display: grid;
          gap: 14px;
        }

        .addon-card__price {
          font-size: 18px;
          font-weight: 800;
          color: #111827;
        }

        @media (max-width: 980px) {
          .plans-grid,
          .plans-bottom-grid,
          .plans-hero {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
