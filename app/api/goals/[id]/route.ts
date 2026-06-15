import { requireGoalUser } from "@/app/api/goals/auth";
import { deleteGoal } from "@/lib/goals/store";
import { toPublicServerError } from "@/lib/server-config-errors";

export const runtime = "edge";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireGoalUser(request);
  if (!auth.ok) return auth.response;

  const params = await context.params;
  const goalId = params.id;

  try {
    const removed = await deleteGoal({
      userId: auth.userId,
      goalId,
    });

    if (!removed) {
      return Response.json(
        {
          ok: false,
          message: "Goal not found",
        },
        {
          status: 404,
        },
      );
    }

    return Response.json({
      ok: true,
    });
  } catch (error) {
    const publicError = toPublicServerError(error);
    return Response.json(
      {
        ok: false,
        message: publicError.message,
      },
      { status: publicError.status },
    );
  }
}
