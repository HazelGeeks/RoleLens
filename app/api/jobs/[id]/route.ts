import {
  GET as getPersistentJobById,
  PATCH as patchPersistentJobById,
} from "@/app/api/persistence/jobs/[id]/route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "edge";

async function getNormalizedContext(context: RouteContext): Promise<RouteContext> {
  const params = await context.params;
  return {
    params: Promise.resolve({
      id: params.id.replace(/\/+$/g, ""),
    }),
  };
}

export async function GET(request: Request, context: RouteContext) {
  return getPersistentJobById(request, await getNormalizedContext(context));
}

export async function PATCH(request: Request, context: RouteContext) {
  return patchPersistentJobById(request, await getNormalizedContext(context));
}
