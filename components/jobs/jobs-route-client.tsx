"use client";

import { useSearchParams } from "next/navigation";
import { JobDetailClient } from "@/components/jobs/job-detail-client";
import { JobsPageClient } from "@/components/jobs/jobs-page-client";

export function JobsRouteClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  return id ? <JobDetailClient /> : <JobsPageClient />;
}
