import type {
  CreateGoalFollowUpInput,
  CreateGoalInput,
  Goal,
  GoalFollowUp,
} from "@/lib/goals/types";
import { getDatabaseFromContext, type DatabaseLike } from "@/lib/database";

const userGoalsStore = new Map<string, Map<string, Goal>>();

type PersistenceBackend =
  | {
      kind: "memory";
    }
  | {
      kind: "postgres";
      db: DatabaseLike;
    };

type GoalRow = {
  id: string;
  userId: string;
  company: string;
  targetRole: string | null;
  motivation: string | null;
  createdAt: string;
  updatedAt: string;
};

type GoalFollowUpRow = {
  id: string;
  goalId: string;
  userId: string;
  note: string;
  nextActionDate: string | null;
  createdAt: string;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function resolvePersistenceBackend(): Promise<PersistenceBackend> {
  const configured = process.env.PERSISTENCE_BACKEND?.trim().toLowerCase();
  const isProduction = process.env.NODE_ENV?.trim().toLowerCase() === "production";

  if (configured && configured !== "memory" && configured !== "postgres") {
    throw new Error(
      `Invalid PERSISTENCE_BACKEND value: ${configured}. Expected memory or postgres.`,
    );
  }

  if (configured === "memory") {
    return { kind: "memory" };
  }

  const db = await getDatabaseFromContext();

  if (db) {
    return { kind: "postgres", db };
  }

  if (configured !== "postgres" && !isProduction) {
    return { kind: "memory" };
  }

  if (!db) {
    if (!isProduction) {
      console.warn(
        "PERSISTENCE_BACKEND=postgres is configured but Hyperdrive binding is unavailable in this runtime; falling back to memory backend.",
      );
      return { kind: "memory" };
    }

    throw new Error(
      "Production persistence requires postgres, but no Hyperdrive binding is available in request context.",
    );
  }

  return { kind: "postgres", db };
}

function toNullableValue(value: string | undefined): string | null {
  return value ?? null;
}

function getChangedCount(result: { meta?: { changes?: number } }) {
  return result.meta?.changes ?? 0;
}

function getUserGoalBucket(userId: string) {
  const existing = userGoalsStore.get(userId);
  if (existing) return existing;
  const created = new Map<string, Goal>();
  userGoalsStore.set(userId, created);
  return created;
}

function toGoal(row: GoalRow, followUps: GoalFollowUp[]): Goal {
  return {
    id: row.id,
    userId: row.userId,
    company: row.company,
    targetRole: row.targetRole ?? undefined,
    motivation: row.motivation ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    followUps,
  };
}

async function listGoalsInMemory(userId: string): Promise<Goal[]> {
  const bucket = getUserGoalBucket(userId);
  return Array.from(bucket.values())
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((goal) => clone(goal));
}

async function createGoalInMemory(args: {
  userId: string;
  input: CreateGoalInput;
}): Promise<Goal> {
  const bucket = getUserGoalBucket(args.userId);
  const now = new Date().toISOString();

  const goal: Goal = {
    id: crypto.randomUUID(),
    userId: args.userId,
    company: args.input.company,
    targetRole: args.input.targetRole,
    motivation: args.input.motivation,
    createdAt: now,
    updatedAt: now,
    followUps: [],
  };

  bucket.set(goal.id, goal);
  return clone(goal);
}

async function deleteGoalInMemory(args: {
  userId: string;
  goalId: string;
}): Promise<boolean> {
  const bucket = getUserGoalBucket(args.userId);
  return bucket.delete(args.goalId);
}

async function createGoalFollowUpInMemory(args: {
  userId: string;
  goalId: string;
  input: CreateGoalFollowUpInput;
}): Promise<Goal | undefined> {
  const bucket = getUserGoalBucket(args.userId);
  const existing = bucket.get(args.goalId);
  if (!existing) return undefined;

  const now = new Date().toISOString();
  const followUp: GoalFollowUp = {
    id: crypto.randomUUID(),
    goalId: existing.id,
    userId: args.userId,
    note: args.input.note,
    createdAt: now,
    nextActionDate: args.input.nextActionDate,
  };

  const next: Goal = {
    ...existing,
    updatedAt: now,
    followUps: [followUp, ...existing.followUps],
  };

  bucket.set(existing.id, next);
  return clone(next);
}

async function listFollowUpsByGoalIdInPostgres(
  db: DatabaseLike,
  userId: string,
): Promise<Map<string, GoalFollowUp[]>> {
  const result = await db
    .prepare(
      `SELECT id,
              goal_id AS goalId,
              user_id AS userId,
              note,
              next_action_date AS nextActionDate,
              created_at AS createdAt
         FROM persistent_goal_followups
        WHERE user_id = ?
        ORDER BY created_at DESC`,
    )
    .bind(userId)
    .all<GoalFollowUpRow>();

  const followUpsByGoalId = new Map<string, GoalFollowUp[]>();
  for (const row of result.results) {
    const followUp: GoalFollowUp = {
      id: row.id,
      goalId: row.goalId,
      userId: row.userId,
      note: row.note,
      createdAt: row.createdAt,
      nextActionDate: row.nextActionDate ?? undefined,
    };

    const existing = followUpsByGoalId.get(row.goalId);
    if (existing) {
      existing.push(followUp);
      continue;
    }
    followUpsByGoalId.set(row.goalId, [followUp]);
  }

  return followUpsByGoalId;
}

async function listFollowUpsForGoalInPostgres(
  db: DatabaseLike,
  userId: string,
  goalId: string,
): Promise<GoalFollowUp[]> {
  const result = await db
    .prepare(
      `SELECT id,
              goal_id AS goalId,
              user_id AS userId,
              note,
              next_action_date AS nextActionDate,
              created_at AS createdAt
         FROM persistent_goal_followups
        WHERE user_id = ? AND goal_id = ?
        ORDER BY created_at DESC`,
    )
    .bind(userId, goalId)
    .all<GoalFollowUpRow>();

  return result.results.map((row) => ({
    id: row.id,
    goalId: row.goalId,
    userId: row.userId,
    note: row.note,
    createdAt: row.createdAt,
    nextActionDate: row.nextActionDate ?? undefined,
  }));
}

async function getGoalInPostgres(
  db: DatabaseLike,
  userId: string,
  goalId: string,
): Promise<Goal | undefined> {
  const row = await db
    .prepare(
      `SELECT id,
              user_id AS userId,
              company,
              target_role AS targetRole,
              motivation,
              created_at AS createdAt,
              updated_at AS updatedAt
         FROM persistent_goals
        WHERE user_id = ? AND id = ?`,
    )
    .bind(userId, goalId)
    .first<GoalRow>();

  if (!row) return undefined;
  const followUps = await listFollowUpsForGoalInPostgres(db, userId, goalId);
  return toGoal(row, followUps);
}

async function listGoalsInPostgres(db: DatabaseLike, userId: string): Promise<Goal[]> {
  const goalsResult = await db
    .prepare(
      `SELECT id,
              user_id AS userId,
              company,
              target_role AS targetRole,
              motivation,
              created_at AS createdAt,
              updated_at AS updatedAt
         FROM persistent_goals
        WHERE user_id = ?
        ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<GoalRow>();

  const followUpsByGoalId = await listFollowUpsByGoalIdInPostgres(db, userId);

  return goalsResult.results.map((row) =>
    toGoal(row, followUpsByGoalId.get(row.id) ?? []),
  );
}

async function createGoalInPostgres(args: {
  userId: string;
  input: CreateGoalInput;
  db: DatabaseLike;
}): Promise<Goal> {
  const now = new Date().toISOString();
  const goalId = crypto.randomUUID();

  await args.db
    .prepare(
      `INSERT INTO persistent_goals
       (id, user_id, company, target_role, motivation, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      goalId,
      args.userId,
      args.input.company,
      toNullableValue(args.input.targetRole),
      toNullableValue(args.input.motivation),
      now,
      now,
    )
    .run();

  const created = await getGoalInPostgres(args.db, args.userId, goalId);
  if (!created) {
    throw new Error(`Failed to load created goal ${goalId}.`);
  }

  return created;
}

async function deleteGoalInPostgres(args: {
  userId: string;
  goalId: string;
  db: DatabaseLike;
}): Promise<boolean> {
  const result = await args.db
    .prepare("DELETE FROM persistent_goals WHERE user_id = ? AND id = ?")
    .bind(args.userId, args.goalId)
    .run();

  return getChangedCount(result) === 1;
}

async function createGoalFollowUpInPostgres(args: {
  userId: string;
  goalId: string;
  input: CreateGoalFollowUpInput;
  db: DatabaseLike;
}): Promise<Goal | undefined> {
  const goal = await getGoalInPostgres(args.db, args.userId, args.goalId);
  if (!goal) return undefined;

  const now = new Date().toISOString();
  const followUpId = crypto.randomUUID();

  await args.db
    .prepare(
      `INSERT INTO persistent_goal_followups
       (id, goal_id, user_id, note, next_action_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      followUpId,
      args.goalId,
      args.userId,
      args.input.note,
      toNullableValue(args.input.nextActionDate),
      now,
    )
    .run();

  await args.db
    .prepare("UPDATE persistent_goals SET updated_at = ? WHERE user_id = ? AND id = ?")
    .bind(now, args.userId, args.goalId)
    .run();

  return getGoalInPostgres(args.db, args.userId, args.goalId);
}

export async function listGoals(userId: string): Promise<Goal[]> {
  const backend = await resolvePersistenceBackend();
  if (backend.kind === "postgres") {
    return listGoalsInPostgres(backend.db, userId);
  }
  return listGoalsInMemory(userId);
}

export async function createGoal(args: {
  userId: string;
  input: CreateGoalInput;
}): Promise<Goal> {
  const backend = await resolvePersistenceBackend();
  if (backend.kind === "postgres") {
    return createGoalInPostgres({
      ...args,
      db: backend.db,
    });
  }
  return createGoalInMemory(args);
}

export async function deleteGoal(args: {
  userId: string;
  goalId: string;
}): Promise<boolean> {
  const backend = await resolvePersistenceBackend();
  if (backend.kind === "postgres") {
    return deleteGoalInPostgres({
      ...args,
      db: backend.db,
    });
  }
  return deleteGoalInMemory(args);
}

export async function createGoalFollowUp(args: {
  userId: string;
  goalId: string;
  input: CreateGoalFollowUpInput;
}): Promise<Goal | undefined> {
  const backend = await resolvePersistenceBackend();
  if (backend.kind === "postgres") {
    return createGoalFollowUpInPostgres({
      ...args,
      db: backend.db,
    });
  }
  return createGoalFollowUpInMemory(args);
}

export function resetGoalsStoreForTests() {
  userGoalsStore.clear();
}
