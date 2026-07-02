import { Suspense } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { InterviewPageClient } from "@/components/interview/interview-page-client";

function Loading() {
  return (
    <p className="text-sm text-slate-500">Loading interview practice workspace...</p>
  );
}

export default function InterviewPage() {
  return (
    <ProtectedRoute featureName="interview prep">
      <Suspense fallback={<Loading />}>
        <InterviewPageClient />
      </Suspense>
    </ProtectedRoute>
  );
}
