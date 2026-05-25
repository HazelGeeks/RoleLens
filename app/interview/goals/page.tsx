import { Suspense } from "react";
import { GoalsPageClient } from "@/components/interview/goals-page-client";

function Loading() {
  return <p className="text-sm text-slate-500">Loading goals workspace...</p>;
}

export default function InterviewGoalsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GoalsPageClient />
    </Suspense>
  );
}
