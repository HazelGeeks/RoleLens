import { ProtectedRoute } from "@/components/auth/protected-route";
import { AdminDashboardClient } from "@/components/admin/admin-dashboard-client";

export default function AdminPage() {
  return (
    <ProtectedRoute
      featureName="the admin dashboard"
      description="RoleLens admin tools are limited to approved operators."
    >
      <AdminDashboardClient />
    </ProtectedRoute>
  );
}
