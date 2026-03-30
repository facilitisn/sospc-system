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
  "/": ["Administrador", "Atendente", "Técnico"],
  "/clientes": ["Administrador", "Atendente", "Técnico"],
  "/produtos": ["Administrador", "Atendente"],
  "/servicos": ["Administrador", "Atendente", "Técnico"],
  "/ordens-servico": ["Administrador", "Atendente", "Técnico"],
  "/financeiro": ["Administrador", "Atendente"],
  "/relatorios": ["Administrador", "Atendente", "Técnico"],
  "/usuarios": ["Administrador"],
  "/vendas": ["Administrador", "Atendente", "Técnico"],
  "/caixa": ["Administrador", "Atendente", "Técnico"],
  "/configuracoes": ["Administrador"],
};

function normalizeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name || "",
    username: user.username || "",
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
    (async () => {
      try {
        await ensureDefaultUsersInSupabase();

        const session = loadSession();

        if (session?.id) {
          const dbUser = await fetchUserById(session.id, session.tenant_id);

          if (dbUser && dbUser.is_active !== false) {
            const normalized = normalizeUser(dbUser);
            saveLocalValue(AUTH_KEY, normalized);
            setUser(normalized);
          } else {
            localStorage.removeItem(AUTH_KEY);
            setUser(null);
          }
        }
      } catch (error) {
        console.error("Erro ao inicializar autenticação:", error);
        localStorage.removeItem(AUTH_KEY);
        setUser(null);
      } finally {
        setIsBootstrapped(true);
      }
    })();
  }, []);

  async function login(username, password) {
    const normalizedUsername = String(username || "").trim().toLowerCase();
    const normalizedPassword = String(password || "");

    if (!normalizedUsername || !normalizedPassword) {
      throw new Error("Informe usuário e senha.");
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
        String(item.username || "").trim().toLowerCase() === normalizedUsername &&
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

  function logout() {
    localStorage.removeItem(AUTH_KEY);
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