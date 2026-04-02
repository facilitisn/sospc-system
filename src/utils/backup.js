import { supabase } from "../lib/supabase";

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportBackup(tenantId) {
  if (!tenantId) {
    throw new Error("Tenant não identificado para exportação do backup.");
  }

  const [
    clientsRes,
    productsRes,
    ordersRes,
    orderServicesRes,
    orderPartsRes,
    orderHistoryRes,
    salesRes,
    saleItemsRes,
    servicesRes,
    suppliersRes,
    receivablesRes,
    payablesRes,
    cashflowRes,
    settingsRes,
    stockMovementsRes,
    usersRes,
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("tenant_id", tenantId),
    supabase.from("products").select("*").eq("tenant_id", tenantId),
    supabase.from("service_orders").select("*").eq("tenant_id", tenantId),
    supabase.from("service_order_services").select("*").eq("tenant_id", tenantId),
    supabase.from("service_order_parts").select("*").eq("tenant_id", tenantId),
    supabase.from("service_order_history").select("*").eq("tenant_id", tenantId),
    supabase.from("sales").select("*").eq("tenant_id", tenantId),
    supabase.from("sale_items").select("*").eq("tenant_id", tenantId),
    supabase.from("services").select("*").eq("tenant_id", tenantId),
    supabase.from("suppliers").select("*").eq("tenant_id", tenantId),
    supabase.from("receivables").select("*").eq("tenant_id", tenantId),
    supabase.from("payables").select("*").eq("tenant_id", tenantId),
    supabase.from("cashflow").select("*").eq("tenant_id", tenantId),
    supabase.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("stock_movements").select("*").eq("tenant_id", tenantId),
    supabase.from("users").select("*").eq("tenant_id", tenantId),
  ]);

  const responses = [
    clientsRes,
    productsRes,
    ordersRes,
    orderServicesRes,
    orderPartsRes,
    orderHistoryRes,
    salesRes,
    saleItemsRes,
    servicesRes,
    suppliersRes,
    receivablesRes,
    payablesRes,
    cashflowRes,
    stockMovementsRes,
    usersRes,
  ];

  const firstError = responses.find((res) => res.error)?.error || settingsRes.error;
  if (firstError) {
    throw new Error(firstError.message || "Erro ao exportar backup.");
  }

  const data = {
    version: 2,
    tenant_id: tenantId,
    exportedAt: new Date().toISOString(),
    clients: normalizeArray(clientsRes.data),
    products: normalizeArray(productsRes.data),
    service_orders: normalizeArray(ordersRes.data),
    service_order_services: normalizeArray(orderServicesRes.data),
    service_order_parts: normalizeArray(orderPartsRes.data),
    service_order_history: normalizeArray(orderHistoryRes.data),
    sales: normalizeArray(salesRes.data),
    sale_items: normalizeArray(saleItemsRes.data),
    services: normalizeArray(servicesRes.data),
    suppliers: normalizeArray(suppliersRes.data),
    receivables: normalizeArray(receivablesRes.data),
    payables: normalizeArray(payablesRes.data),
    cashflow: normalizeArray(cashflowRes.data),
    stock_movements: normalizeArray(stockMovementsRes.data),
    users: normalizeArray(usersRes.data),
    tenant_settings: settingsRes.data || null,
  };

  downloadJson(`backup-sospc-${tenantId}.json`, data);
}

async function replaceTable(table, rows, tenantId) {
  const safeRows = normalizeArray(rows);

  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq("tenant_id", tenantId);

  if (deleteError) {
    throw new Error(`Erro ao limpar ${table}: ${deleteError.message || "desconhecido"}`);
  }

  if (!safeRows.length) return;

  const payload = safeRows.map((row) => ({
    ...row,
    tenant_id: tenantId,
  }));

  const { error: insertError } = await supabase.from(table).insert(payload);

  if (insertError) {
    throw new Error(`Erro ao importar ${table}: ${insertError.message || "desconhecido"}`);
  }
}

export function importBackup(file, tenantId) {
  if (!file) return Promise.resolve();

  if (!tenantId) {
    return Promise.reject(new Error("Tenant não identificado para importação do backup."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);

        await replaceTable("clients", data.clients, tenantId);
        await replaceTable("products", data.products, tenantId);
        await replaceTable("service_orders", data.service_orders, tenantId);
        await replaceTable("service_order_services", data.service_order_services, tenantId);
        await replaceTable("service_order_parts", data.service_order_parts, tenantId);
        await replaceTable("service_order_history", data.service_order_history, tenantId);
        await replaceTable("sales", data.sales, tenantId);
        await replaceTable("sale_items", data.sale_items, tenantId);
        await replaceTable("services", data.services, tenantId);
        await replaceTable("suppliers", data.suppliers, tenantId);
        await replaceTable("receivables", data.receivables, tenantId);
        await replaceTable("payables", data.payables, tenantId);
        await replaceTable("cashflow", data.cashflow, tenantId);
        await replaceTable("stock_movements", data.stock_movements, tenantId);
        await replaceTable("users", data.users, tenantId);

        const { error: deleteSettingsError } = await supabase
          .from("tenant_settings")
          .delete()
          .eq("tenant_id", tenantId);

        if (deleteSettingsError) {
          throw new Error(
            `Erro ao limpar tenant_settings: ${deleteSettingsError.message || "desconhecido"}`
          );
        }

        if (data.tenant_settings) {
          const { error: settingsError } = await supabase
            .from("tenant_settings")
            .insert({
              ...data.tenant_settings,
              tenant_id: tenantId,
            });

          if (settingsError) {
            throw new Error(
              `Erro ao importar tenant_settings: ${settingsError.message || "desconhecido"}`
            );
          }
        }

        resolve();
      } catch (err) {
        console.error(err);
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error("Não foi possível ler o arquivo de backup."));
    };

    reader.readAsText(file);
  });
}