import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardClient } from "@/components/dashboard/dashboard-client";


export default function DashboardPage() {
  return (
    <ProtectedRoute featureName="the dashboard">
      <DashboardClient />
    </ProtectedRoute>
  );
}
