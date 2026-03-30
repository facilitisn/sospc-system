import { isSupabaseConfigured, supabase } from "./supabase";

export function loadLocalValue(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveLocalValue(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeLocalValue(key) {
  localStorage.removeItem(key);
}

export async function loadValue(key, fallback) {
  if (!isSupabaseConfigured || !supabase) return loadLocalValue(key, fallback);
  try {
    const { data, error } = await supabase.from("app_state").select("data").eq("key", key).maybeSingle();
    if (error) throw error;
    const value = data?.data ?? fallback;
    saveLocalValue(key, value);
    return value;
  } catch (error) {
    console.warn(`Falha ao carregar ${key} do banco. Usando cache local.`, error);
    return loadLocalValue(key, fallback);
  }
}

export async function saveValue(key, value) {
  saveLocalValue(key, value);
  if (!isSupabaseConfigured || !supabase) return;
  const payload = { key, data: value, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("app_state").upsert(payload).select("key");
  if (error) {
    console.warn(`Falha ao salvar ${key} no banco.`, error);
    throw error;
  }
}

export async function removeValue(key) {
  removeLocalValue(key);
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from("app_state").delete().eq("key", key);
  if (error) {
    console.warn(`Falha ao remover ${key} do banco.`, error);
    throw error;
  }
}

export async function syncAllLocalState(keys = []) {
  if (!isSupabaseConfigured || !supabase) return;
  for (const key of keys) {
    const value = loadLocalValue(key, null);
    if (value !== null) {
      await saveValue(key, value);
    }
  }
}
