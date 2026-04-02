import { supabase } from "../lib/supabase";

export type Supplier = {
  id: string;
  name: string;
  company_name: string | null;
  cpf_cnpj: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SupplierInput = {
  name: string;
  company_name?: string | null;
  cpf_cnpj?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

export async function getSuppliers() {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []) as Supplier[];
}

export async function createSupplier(input: SupplierInput) {
  const payload = {
    ...input,
    is_active: input.is_active ?? true,
  };

  const { data, error } = await supabase
    .from("suppliers")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;

  return data as Supplier;
}

export async function updateSupplier(id: string, input: SupplierInput) {
  const { data, error } = await supabase
    .from("suppliers")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data as Supplier;
}
export async function deleteSupplier(id: string) {
  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", id);

  if (error) throw error;
}