import { Suspense } from "react";
import { InterviewPageClient } from "@/components/interview/interview-page-client";

function Loading() {
  return (
    <p className="text-sm text-slate-500">Loading interview practice workspace...</p>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={<Loading />}>
      <InterviewPageClient />
    </Suspense>
  );
}

