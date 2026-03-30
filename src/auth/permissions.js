export const PERMISSIONS = {
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_EDIT: "users.edit",
  USERS_DELETE: "users.delete",

  SETTINGS_VIEW: "settings.view",
  SETTINGS_EDIT: "settings.edit",

  ORDERS_VIEW: "orders.view",
  ORDERS_CREATE: "orders.create",
  ORDERS_EDIT: "orders.edit",
  ORDERS_DELETE: "orders.delete",
  ORDERS_UPDATE_STATUS: "orders.update_status",
  ORDERS_FINANCIAL_EDIT: "orders.financial.edit",

  CLIENTS_VIEW: "clients.view",
  CLIENTS_CREATE: "clients.create",
  CLIENTS_EDIT: "clients.edit",
  CLIENTS_DELETE: "clients.delete",

  SALES_VIEW: "sales.view",
  SALES_CREATE: "sales.create",
  SALES_EDIT: "sales.edit",
  SALES_DELETE: "sales.delete",

  PRODUCTS_VIEW: "products.view",
  PRODUCTS_CREATE: "products.create",
  PRODUCTS_EDIT: "products.edit",
  PRODUCTS_DELETE: "products.delete",

  RECEIVABLES_VIEW: "receivables.view",
  RECEIVABLES_EDIT: "receivables.edit",

  CASHFLOW_VIEW: "cashflow.view",
  CASHFLOW_EDIT: "cashflow.edit",

  REPORTS_VIEW: "reports.view",
};

const ROLE_PERMISSIONS = {
  Administrador: Object.values(PERMISSIONS),

  "Técnico": [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_EDIT,

    PERMISSIONS.CLIENTS_VIEW,

    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_EDIT,
    PERMISSIONS.ORDERS_UPDATE_STATUS,

    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],

  Atendente: [
    PERMISSIONS.CLIENTS_VIEW,
    PERMISSIONS.CLIENTS_CREATE,
    PERMISSIONS.CLIENTS_EDIT,

    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_EDIT,
    PERMISSIONS.ORDERS_UPDATE_STATUS,

    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.SALES_EDIT,

    PERMISSIONS.RECEIVABLES_VIEW,
    PERMISSIONS.RECEIVABLES_EDIT,
    PERMISSIONS.CASHFLOW_VIEW,

    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
};

const PATH_PERMISSIONS = {
  "/": [],
  "/clientes": [PERMISSIONS.CLIENTS_VIEW],
  "/produtos": [PERMISSIONS.PRODUCTS_VIEW],
  "/ordens-servico": [PERMISSIONS.ORDERS_VIEW],
  "/vendas": [PERMISSIONS.SALES_VIEW],
  "/financeiro": [PERMISSIONS.CASHFLOW_VIEW, PERMISSIONS.RECEIVABLES_VIEW],
  "/relatorios": [PERMISSIONS.REPORTS_VIEW],
  "/usuarios": [PERMISSIONS.USERS_VIEW],
  "/configuracoes": [PERMISSIONS.SETTINGS_VIEW],
};

export function getUserRole(user) {
  return user?.role || "";
}

export function hasPermission(user, permission) {
  const role = getUserRole(user);
  return ROLE_PERMISSIONS[role]?.includes(permission) || false;
}

export function hasAnyPermission(user, permissions = []) {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function canAccessPath(user, path) {
  if (!user?.role) return false;
  const required = PATH_PERMISSIONS[path];
  if (!required || required.length === 0) return true;
  return hasAnyPermission(user, required);
}
