import { Suspense } from "react";
import { JobDetailClient } from "@/components/jobs/job-detail-client";


function Loading() {
  return <p className="text-sm text-slate-500">Loading job detail...</p>;
}

export default function JobDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <JobDetailClient />
    </Suspense>
  );
}
