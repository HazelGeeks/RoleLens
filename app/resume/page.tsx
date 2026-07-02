import { Suspense } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { ResumePageClient } from "@/components/resume/resume-page-client";

function Loading() {
  return <p className="text-sm text-slate-500">Loading resume workspace...</p>;
}

export default function ResumePage() {
  return (
    <ProtectedRoute featureName="resume review">
      <Suspense fallback={<Loading />}>
        <ResumePageClient />
      </Suspense>
    </ProtectedRoute>
  );
}
