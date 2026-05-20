import { Suspense } from "react";
import { JobsPageClient } from "@/components/jobs/jobs-page-client";

function Loading() {
  return <p className="text-sm text-slate-500">Loading jobs...</p>;
}

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <JobsPageClient />
    </Suspense>
  );
}
