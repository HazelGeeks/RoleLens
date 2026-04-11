import { JobsPageClient } from "@/components/jobs/jobs-page-client";

export const runtime = "edge";

export default function Home() {
  return <JobsPageClient />;
}
