import {
  GET as getPersistentJobById,
  PATCH as patchPersistentJobById,
} from "@/app/api/persistence/jobs/[id]/route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "edge";

export async function GET(request: Request, context: RouteContext) {
  return getPersistentJobById(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return patchPersistentJobById(request, context);
}
