import { Suspense } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { JobsRouteClient } from "@/components/jobs/jobs-route-client";


function Loading() {
  return <p className="text-sm text-slate-500">Loading jobs...</p>;
}

export default function JobsPage() {
  return (
    <ProtectedRoute featureName="the job workspace">
      <Suspense fallback={<Loading />}>
        <JobsRouteClient />
      </Suspense>
    </ProtectedRoute>
  );
}
