import { supabase } from "./supabase";

const TENANT_STORAGE_KEY = "sospc_current_tenant_id";

export function getStoredTenantId() {
  return localStorage.getItem(TENANT_STORAGE_KEY) || "";
}

export function setStoredTenantId(tenantId) {
  localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
}

export async function ensureTenantId() {
  const stored = getStoredTenantId();
  if (stored) return stored;

  const { data, error } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", "empresa-principal")
    .single();

  if (error) {
    console.error("Erro ao carregar tenant padrão:", error);
    return "";
  }

  if (data?.id) {
    setStoredTenantId(data.id);
    return data.id;
  }

  return "";
}