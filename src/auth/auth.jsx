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

const AuthContext = createContext(null);

export function hasRouteAccess(user, path) {
  if (!user?.role) return false;
  const allowed = routePermissions[path] || routePermissions["/"];
  return allowed.includes(user.role);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadSession);
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  useEffect(() => {
    let mounted = true;

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
          return;
        }

        const localSession = loadSession();

        if (localSession?.id) {
          const dbUser = await fetchUserById(localSession.id, localSession.tenant_id);

          if (dbUser && dbUser.is_active !== false) {
            const normalized = normalizeUser(dbUser);

            if (mounted) {
              saveLocalValue(AUTH_KEY, normalized);
              setUser(normalized);
            }
          } else if (mounted) {
            localStorage.removeItem(AUTH_KEY);
            setUser(null);
          }
        }
      } catch (error) {
        console.error("Erro ao inicializar autenticação:", error);
        if (mounted) {
          localStorage.removeItem(AUTH_KEY);
          setUser(null);
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
            localStorage.removeItem(AUTH_KEY);
            if (mounted) setUser(null);
            return;
          }

          const authUser = await buildAuthUserFromSupabase(session.user);
          saveLocalValue(AUTH_KEY, authUser);
          if (mounted) setUser(authUser);
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
    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "");

    if (!normalizedUsername || !normalizedPassword) {
      throw new Error("Informe usuário e senha.");
    }

    const isEmailLogin = normalizedUsername.includes("@");

    if (isEmailLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedUsername,
        password: normalizedPassword,
      });

      if (error) {
        throw new Error(error.message || "Erro ao autenticar.");
      }

      const authUser = await buildAuthUserFromSupabase(data.user);
      saveLocalValue(AUTH_KEY, authUser);
      setUser(authUser);
      return authUser;
    }

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message || "Erro ao buscar usuários.");
    }

    const found = (data || []).find(
      (item) =>
        item.is_active !== false &&
        String(item.username || "").trim().toLowerCase() === normalizedUsername.toLowerCase() &&
        String(item.password || "") === normalizedPassword
    );

    if (!found) {
      throw new Error("Usuário ou senha inválidos.");
    }

    const sessionUser = normalizeUser(found);
    saveLocalValue(AUTH_KEY, sessionUser);
    setUser(sessionUser);
    return sessionUser;
  }

  async function logout() {
    localStorage.removeItem(AUTH_KEY);
    await supabase.auth.signOut();
    setUser(null);
  }

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isBootstrapped,
      login,
      logout,
    }),
    [user, isBootstrapped]
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
