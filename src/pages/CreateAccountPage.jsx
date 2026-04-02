import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { supabase } from "../lib/supabase";

function extractMissingColumn(error) {
  const message =
    error?.message ||
    error?.details ||
    error?.hint ||
    "";

  const patterns = [
    /column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i,
    /could not find the\s+['"]([a-zA-Z0-9_]+)['"]\s+column/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

async function insertWithColumnFallback(table, payload) {
  let candidate = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from(table)
      .insert(candidate)
      .select();

    if (!error) {
      return { data, error: null };
    }

    const missingColumn = extractMissingColumn(error);
    if (!missingColumn || !(missingColumn in candidate)) {
      return { data: null, error };
    }

    const { [missingColumn]: _removed, ...rest } = candidate;
    candidate = rest;
  }

  return { data: null, error: new Error(`Não foi possível inserir em ${table}.`) };
}

async function upsertWithColumnFallback(table, payload, selectSingle = false) {
  let candidate = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let query = supabase.from(table).upsert(candidate);
    if (selectSingle) {
      query = query.select().single();
    }

    const { data, error } = await query;

    if (!error) {
      return { data: data || null, error: null };
    }

    const missingColumn = extractMissingColumn(error);
    if (!missingColumn || !(missingColumn in candidate)) {
      return { data: null, error };
    }

    const { [missingColumn]: _removed, ...rest } = candidate;
    candidate = rest;
  }

  return { data: null, error: new Error(`Não foi possível salvar em ${table}.`) };
}

export default function CreateAccountPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    companyName: "",
    ownerName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const companyName = form.companyName.trim();
    const ownerName = form.ownerName.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;
    const confirmPassword = form.confirmPassword;
    const phone = form.phone.trim();

    if (!companyName || !ownerName || !email || !password || !confirmPassword) {
      toast.warning("Preencha todos os campos obrigatórios.");
      return;
    }

    if (password.length < 6) {
      toast.warning("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      toast.warning("As senhas não conferem.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: ownerName,
            company_name: companyName,
          },
        },
      });

      if (authError) {
        throw new Error(authError.message || "Não foi possível criar o usuário.");
      }

      const authUser = authData.user;
      const session = authData.session;

      if (!authUser?.id) {
        throw new Error("Usuário não retornado pelo Supabase Auth.");
      }

      const { data: tenantData, error: tenantError } = await insertWithColumnFallback(
        "tenants",
        {
          name: companyName,
          company_name: companyName,
          owner_name: ownerName,
          email,
          phone: phone || null,
          is_active: true,
        }
      );

      if (tenantError) {
        throw new Error(tenantError.message || "Não foi possível criar a empresa.");
      }

      const tenantId = Array.isArray(tenantData) ? tenantData[0]?.id : tenantData?.id;

      if (!tenantId) {
        throw new Error("Tenant não retornado após criação da empresa.");
      }

      const profilePayload = {
        id: authUser.id,
        tenant_id: tenantId,
        name: ownerName,
        email,
        role: "owner",
        is_active: true,
      };

      const { error: profileError } = await upsertWithColumnFallback("profiles", profilePayload);

      if (profileError) {
        throw new Error(profileError.message || "Não foi possível criar o perfil do usuário.");
      }

      const legacyUserPayload = {
        id: authUser.id,
        tenant_id: tenantId,
        name: ownerName,
        username: email,
        password,
        role: "Administrador",
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: legacyUserError } = await upsertWithColumnFallback("users", legacyUserPayload);

      if (legacyUserError) {
        throw new Error(legacyUserError.message || "Não foi possível criar o usuário interno.");
      }

      if (session) {
        toast.success("Conta criada com sucesso. Bem-vindo ao sistema!");
        navigate("/", { replace: true });
        return;
      }

      toast.success("Conta criada com sucesso. Faça login para continuar.");
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Erro ao criar conta:", error);
      toast.error(error.message || "Não foi possível criar a conta.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="page-stack"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 520 }}>
        <Card>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 28 }}>Criar conta</h2>
            <p style={{ margin: "8px 0 0", color: "var(--muted, #64748b)" }}>
              Cadastre sua empresa e crie o primeiro acesso do sistema.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="form-grid">
            <label className="form-field">
              <span>Nome da empresa</span>
              <input
                value={form.companyName}
                onChange={(e) => updateField("companyName", e.target.value)}
                placeholder="Ex.: SOS Informática"
              />
            </label>

            <label className="form-field">
              <span>Responsável</span>
              <input
                value={form.ownerName}
                onChange={(e) => updateField("ownerName", e.target.value)}
                placeholder="Seu nome"
              />
            </label>

            <label className="form-field">
              <span>E-mail</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="voce@empresa.com"
              />
            </label>

            <label className="form-field">
              <span>Telefone</span>
              <input
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </label>

            <div className="form-grid form-grid-2">
              <label className="form-field">
                <span>Senha</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </label>

              <label className="form-field">
                <span>Confirmar senha</span>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => updateField("confirmPassword", e.target.value)}
                  placeholder="Repita a senha"
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Criando conta..." : "Criar conta"}
              </Button>

              <Button type="button" variant="secondary" onClick={() => navigate("/login")}>
                Ir para login
              </Button>
            </div>
          </form>

          <div style={{ marginTop: 18, fontSize: 14, color: "var(--muted, #64748b)" }}>
            Já tem conta? <Link to="/login">Entrar</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
