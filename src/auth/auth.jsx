import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadLocalValue, saveLocalValue } from "../lib/cloudStorage";
import { supabase } from "../lib/supabase";

const AUTH_KEY = "sospc_auth_v1";
const DEFAULT_TENANT_ID = "17cf4641-af9c-46f6-a999-e1aed79c8679";

const defaultUsers = [
  {
    id: crypto.randomUUID(),
    name: "Administrador",
    username: "admin",
    password: "123456",
    role: "Administrador",
    tenant_id: DEFAULT_TENANT_ID,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: "Atendente",
    username: "atendente",
    password: "123456",
    role: "Atendente",
    tenant_id: DEFAULT_TENANT_ID,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: "Técnico",
    username: "tecnico",
    password: "123456",
    role: "Técnico",
    tenant_id: DEFAULT_TENANT_ID,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const routePermissions = {
  "/": ["Administrador", "Atendente", "Técnico", "owner"],
  "/clientes": ["Administrador", "Atendente", "Técnico", "owner"],
  "/produtos": ["Administrador", "Atendente", "owner"],
  "/servicos": ["Administrador", "Atendente", "Técnico", "owner"],
  "/ordens-servico": ["Administrador", "Atendente", "Técnico", "owner"],
  "/financeiro": ["Administrador", "Atendente", "owner"],
  "/relatorios": ["Administrador", "Atendente", "Técnico", "owner"],
  "/usuarios": ["Administrador", "owner"],
  "/vendas": ["Administrador", "Atendente", "Técnico", "owner"],
  "/caixa": ["Administrador", "Atendente", "Técnico", "owner"],
  "/configuracoes": ["Administrador", "owner"],
  "/planos": ["Administrador", "owner"],
};

function normalizeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name || user.full_name || user.company_name || "",
    username: user.username || user.email || "",
    email: user.email || "",
    role: user.role || "Atendente",
    tenant_id: user.tenant_id || DEFAULT_TENANT_ID,
    isActive: user.isActive ?? user.is_active ?? true,
  };
}

function loadSession() {
  const session = loadLocalValue(AUTH_KEY, null);
  return normalizeUser(session);
}

async function ensureDefaultUsersInSupabase() {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .limit(1);

  if (error) {
    console.error("Erro ao verificar usuários padrão:", error);
    return;
  }

  if (Array.isArray(data) && data.length > 0) {
    return;
  }

  const { error: insertError } = await supabase.from("users").insert(defaultUsers);

  if (insertError) {
    console.error("Erro ao criar usuários padrão:", insertError);
  }
}

async function fetchUserById(id, tenantId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId || DEFAULT_TENANT_ID)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Erro ao carregar usuário.");
  }

  return data || null;
}

async function fetchUsersByTenant(tenantId = DEFAULT_TENANT_ID) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Erro ao carregar usuários.");
  }

  return (data || []).map((user) => ({
    ...user,
    tenant_id: user.tenant_id || tenantId,
  }));
}

async function fetchProfileById(id) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Erro ao carregar perfil.");
  }

  return data || null;
}

async function fetchTenantSubscription(tenantId) {
  if (!tenantId) return null;

  const { data, error } = await supabase
    .from("tenants")
    .select("id, plan, subscription_status, trial_ends_at, expires_at")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Erro ao carregar assinatura do tenant.");
  }

  return data || null;
}

function normalizeTenantSubscription(subscription, tenantId = "") {
  if (!subscription) {
    return tenantId
      ? {
          id: tenantId,
          plan: "essencial",
          subscription_status: "trial",
          trial_ends_at: null,
          expires_at: null,
        }
      : null;
  }

  return {
    id: subscription.id || tenantId,
    plan: subscription.plan || "essencial",
    subscription_status: subscription.subscription_status || "trial",
    trial_ends_at: subscription.trial_ends_at || null,
    expires_at: subscription.expires_at || null,
  };
}

export function isTenantAccessAllowed(subscription) {
  if (!subscription) return false;

  if (subscription.subscription_status === "active") {
    if (!subscription.expires_at) return true;
    return new Date(subscription.expires_at).getTime() >= Date.now();
  }

  if (subscription.subscription_status === "trial") {
    if (!subscription.trial_ends_at) return false;
    return new Date(subscription.trial_ends_at).getTime() >= Date.now();
  }

  return false;
}

export function getTrialDaysLeft(subscription) {
  if (!subscription?.trial_ends_at) return 0;
  const diff = new Date(subscription.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

async function buildAuthUserFromSupabase(authUser) {
  if (!authUser?.id) return null;

  const profile = await fetchProfileById(authUser.id);

  if (!profile) {
    return normalizeUser({
      id: authUser.id,
      email: authUser.email || "",
      username: authUser.email || "",
      name: authUser.user_metadata?.name || authUser.email || "",
      role: "owner",
      tenant_id: DEFAULT_TENANT_ID,
      is_active: true,
    });
  }

  return normalizeUser({
    id: authUser.id,
    email: authUser.email || "",
    username: profile.username || authUser.email || "",
    name: profile.name || authUser.user_metadata?.name || authUser.email || "",
    role: profile.role || "owner",
    tenant_id: profile.tenant_id || DEFAULT_TENANT_ID,
    is_active: profile.is_active ?? true,
  });
}

async function restoreLocalSession(localSession) {
  if (!localSession?.id) return null;

  const dbUser = await fetchUserById(localSession.id, localSession.tenant_id);
  if (dbUser && dbUser.is_active !== false) {
    return normalizeUser(dbUser);
  }

  const profile = await fetchProfileById(localSession.id);
  if (profile && profile.is_active !== false) {
    return normalizeUser({
      id: localSession.id,
      email: localSession.email || profile.email || "",
      username: profile.username || localSession.username || localSession.email || "",
      name: profile.name || localSession.name || localSession.email || "",
      role: profile.role || localSession.role || "owner",
      tenant_id: profile.tenant_id || localSession.tenant_id || DEFAULT_TENANT_ID,
      is_active: profile.is_active ?? true,
    });
  }

  return null;
}

const AuthContext = createContext(null);

export function hasRouteAccess(user, path) {
  if (!user?.role) return false;
  const allowed = routePermissions[path] || routePermissions["/"];
  return allowed.includes(user.role);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenantSubscription, setTenantSubscription] = useState(null);
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function syncTenantSubscription(nextUser) {
      if (!mounted) return;

      if (!nextUser?.tenant_id) {
        setTenantSubscription(null);
        return;
      }

      try {
        const subscription = await fetchTenantSubscription(nextUser.tenant_id);
        if (mounted) {
          setTenantSubscription(normalizeTenantSubscription(subscription, nextUser.tenant_id));
        }
      } catch (error) {
        console.error("Erro ao carregar assinatura do tenant:", error);
        if (mounted) {
          setTenantSubscription(normalizeTenantSubscription(null, nextUser.tenant_id));
        }
      }
    }

    async function bootstrap() {
      try {
        await ensureDefaultUsersInSupabase();

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          const authUser = await buildAuthUserFromSupabase(session.user);

          if (mounted) {
            saveLocalValue(AUTH_KEY, authUser);
            setUser(authUser);
          }

          await syncTenantSubscription(authUser);
          return;
        }

        const localSession = loadSession();

        if (localSession?.id) {
          const restoredUser = await restoreLocalSession(localSession);

          if (restoredUser) {
            if (mounted) {
              saveLocalValue(AUTH_KEY, restoredUser);
              setUser(restoredUser);
            }

            await syncTenantSubscription(restoredUser);
          } else if (mounted) {
            localStorage.removeItem(AUTH_KEY);
            setUser(null);
            setTenantSubscription(null);
          }
        } else if (mounted) {
          setUser(null);
          setTenantSubscription(null);
        }
      } catch (error) {
        console.error("Erro ao inicializar autenticação:", error);
        if (mounted) {
          localStorage.removeItem(AUTH_KEY);
          setUser(null);
          setTenantSubscription(null);
        }
      } finally {
        if (mounted) {
          setIsBootstrapped(true);
        }
      }
    }

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        try {
          if (!session?.user) {
            const localSession = loadSession();

            if (localSession?.id) {
              const restoredUser = await restoreLocalSession(localSession);

              if (restoredUser) {
                saveLocalValue(AUTH_KEY, restoredUser);
                if (mounted) setUser(restoredUser);
                await syncTenantSubscription(restoredUser);
                return;
              }
            }

            localStorage.removeItem(AUTH_KEY);
            if (mounted) {
              setUser(null);
              setTenantSubscription(null);
            }
            return;
          }

          const authUser = await buildAuthUserFromSupabase(session.user);
          saveLocalValue(AUTH_KEY, authUser);
          if (mounted) setUser(authUser);
          await syncTenantSubscription(authUser);
        } catch (error) {
          console.error("Erro ao sincronizar sessão autenticada:", error);
        }
      })();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function login(username, password) {
    const isEmail = username.includes("@");

    if (isEmail) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: username,
        password,
      });

      if (!error && data?.user) {
        const profile = await fetchProfileById(data.user.id);
        const authUser = normalizeUser({
          id: data.user.id,
          name: profile?.name || data.user.email || "",
          email: data.user.email,
          username: profile?.username || data.user.email,
          role: profile?.role || "owner",
          tenant_id: profile?.tenant_id || DEFAULT_TENANT_ID,
          is_active: profile?.is_active ?? true,
        });

        const subscription = await fetchTenantSubscription(authUser.tenant_id);
        saveLocalValue(AUTH_KEY, authUser);
        setUser(authUser);
        setTenantSubscription(normalizeTenantSubscription(subscription, authUser.tenant_id));
        return;
      }
    }

    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .ilike("username", username)
      .limit(1);

    if (error || !users?.length) {
      throw new Error("Usuário ou senha inválidos");
    }

    const foundUser = users[0];

    if (foundUser.password !== password) {
      throw new Error("Usuário ou senha inválidos");
    }

    const normalized = normalizeUser({
      id: foundUser.id,
      name: foundUser.name,
      username: foundUser.username,
      email: foundUser.email || "",
      role: foundUser.role,
      tenant_id: foundUser.tenant_id,
      is_active: foundUser.is_active,
    });

    const subscription = await fetchTenantSubscription(normalized.tenant_id);
    saveLocalValue(AUTH_KEY, normalized);
    setUser(normalized);
    setTenantSubscription(normalizeTenantSubscription(subscription, normalized.tenant_id));
  }

  async function refreshTenantSubscription() {
    if (!user?.tenant_id) return;
    const subscription = await fetchTenantSubscription(user.tenant_id);
    setTenantSubscription(normalizeTenantSubscription(subscription, user.tenant_id));
  }

  async function logout() {
    localStorage.removeItem(AUTH_KEY);
    await supabase.auth.signOut();
    setUser(null);
    setTenantSubscription(null);
  }

  const value = useMemo(
    () => ({
      user,
      tenantSubscription,
      isAuthenticated: !!user,
      isBootstrapped,
      login,
      logout,
      refreshTenantSubscription,
    }),
    [user, tenantSubscription, isBootstrapped]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }
  return ctx;
}

export async function getStoredUsers(tenantId = DEFAULT_TENANT_ID) {
  return await fetchUsersByTenant(tenantId);
}

export async function saveUsers(users, tenantId = DEFAULT_TENANT_ID) {
  const normalizedUsers = (users || []).map((user) => ({
    id: user.id || crypto.randomUUID(),
    name: user.name || "",
    username: user.username || "",
    password: user.password || "",
    role: user.role || "Atendente",
    tenant_id: user.tenant_id || tenantId,
    is_active: user.isActive ?? user.is_active ?? true,
    created_at: user.createdAt || user.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  if (!normalizedUsers.length) return;

  const { error } = await supabase.from("users").upsert(normalizedUsers);

  if (error) {
    throw new Error(error.message || "Erro ao salvar usuários.");
  }
}
