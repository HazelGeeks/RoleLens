import { Suspense } from "react";
import { JobsRouteClient } from "@/components/jobs/jobs-route-client";


function Loading() {
  return <p className="text-sm text-slate-500">Loading jobs...</p>;
}

export default function JobsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <JobsRouteClient />
    </Suspense>
  );
}
