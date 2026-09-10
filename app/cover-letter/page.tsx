import { Suspense } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { CoverLetterPageClient } from "@/components/cover-letter/cover-letter-page-client";

export default function CoverLetterPage() {
  return (
    <ProtectedRoute featureName="cover letter builder">
      <Suspense fallback={<p>Loading cover letter workspace...</p>}>
        <CoverLetterPageClient />
      </Suspense>
    </ProtectedRoute>
  );
}
