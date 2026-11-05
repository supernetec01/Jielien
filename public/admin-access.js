// Show links to the operations workspace only for signed-in staff whose
// effective permissions allow at least one Admin screen. UI checks are not authorization:
// the /api/admin/* routes still enforce permissions on the server.
const adminScreenPermissions = new Set([
  "banners.read",
  "seo.manage",
  "catalog.read",
  "media.read",
  "content.read",
  "returns.manage",
  "inventory.read",
  "audit.read",
  "settings.read",
  "reports.read",
  "promotions.manage",
  "users.manage",
  "dashboard.read",
  "orders.read",
]);

export function canAccessAdmin(user) {
  if (!user || !Array.isArray(user.roles) || !Array.isArray(user.permissions))
    return false;
  if (
    !user.roles.some(
      (role) =>
        typeof role === "string" &&
        role.trim() !== "" &&
        role.trim() !== "customer",
    )
  )
    return false;
  return user.permissions.some((permission) =>
    adminScreenPermissions.has(permission),
  );
}
