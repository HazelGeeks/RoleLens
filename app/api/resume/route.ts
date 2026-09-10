import { getAuthSessionUserFromRequest } from "@/lib/auth-server";
import { resumeSaveSchema } from "@/lib/resume/profile";
import { getResume, saveResume, ResumeConflictError } from "@/lib/resume/store";

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
async function handle(request: Request, write: boolean) {
  try {
    const user = await getAuthSessionUserFromRequest(request);
    if (!user) return json({ message: "Login required" }, 401);
    // A stale browser tab must never save another account's draft after login changes.
    if (request.headers.get("x-rolelens-account") !== user.id)
      return json(
        { message: "Your account changed. Reload before continuing." },
        409,
      );
    if (!write) return json({ resume: await getResume(user.id) });
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ message: "Invalid JSON payload" }, 400);
    }
    const parsed = resumeSaveSchema.safeParse(payload);
    if (!parsed.success)
      return json(
        {
          message: "Check your resume fields and dates.",
          issues: parsed.error.issues,
        },
        400,
      );
    return json({
      resume: await saveResume(
        user.id,
        parsed.data.profile,
        parsed.data.version,
      ),
    });
  } catch (error) {
    if (error instanceof ResumeConflictError)
      return json(
        {
          message:
            "This resume changed in another tab. Copy your unsaved changes, then reload before saving.",
        },
        409,
      );
    return json(
      { message: "Your resume could not be loaded or saved. Please retry." },
      503,
    );
  }
}
export function GET(request: Request) {
  return handle(request, false);
}
export function PUT(request: Request) {
  return handle(request, true);
}
