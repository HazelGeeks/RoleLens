"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Goal } from "@/lib/goals/types";

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatDateTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Unknown";
  return new Date(timestamp).toLocaleString();
}

function formatCalendarDate(value: string) {
  const timestamp = Date.parse(`${value}T00:00:00`);
  if (Number.isNaN(timestamp)) return value;
  return new Date(timestamp).toLocaleDateString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getApiMessage(payload: unknown) {
  if (!isRecord(payload)) return null;
  const value = payload.message;
  return typeof value === "string" ? value : null;
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

async function parseJson(response: Response) {
  return (await response.json().catch(() => null)) as unknown;
}

function buildAuthHeaders(userId: string) {
  return {
    "x-rolelens-user": userId,
  };
}

async function listGoalsFromApi(userId: string) {
  const response = await fetch("/api/goals", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: buildAuthHeaders(userId),
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    throw new Error(getApiMessage(payload) || "Failed to load goals.");
  }

  if (!isRecord(payload) || !Array.isArray(payload.goals)) {
    throw new Error("Invalid goals response shape.");
  }

  return payload.goals as Goal[];
}

async function createGoalViaApi(input: {
  userId: string;
  company: string;
  targetRole?: string;
  motivation?: string;
}) {
  const response = await fetch("/api/goals", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...buildAuthHeaders(input.userId),
    },
    body: JSON.stringify({
      company: input.company,
      targetRole: input.targetRole,
      motivation: input.motivation,
    }),
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    throw new Error(getApiMessage(payload) || "Failed to save goal.");
  }

  if (!isRecord(payload) || !isRecord(payload.goal)) {
    throw new Error("Invalid create-goal response shape.");
  }

  return payload.goal as Goal;
}

async function removeGoalViaApi(userId: string, goalId: string) {
  const response = await fetch(`/api/goals/${goalId}`, {
    method: "DELETE",
    credentials: "include",
    headers: buildAuthHeaders(userId),
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    throw new Error(getApiMessage(payload) || "Failed to delete goal.");
  }
}

async function createFollowUpViaApi(
  userId: string,
  goalId: string,
  input: { note: string; nextActionDate?: string },
) {
  const response = await fetch(`/api/goals/${goalId}/follow-ups`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...buildAuthHeaders(userId),
    },
    body: JSON.stringify(input),
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    throw new Error(getApiMessage(payload) || "Failed to save follow-up.");
  }

  if (!isRecord(payload) || !isRecord(payload.goal)) {
    throw new Error("Invalid follow-up response shape.");
  }

  return payload.goal as Goal;
}

function GoalsAuthRequiredModal() {
  return (
    <div className="relative min-h-[65vh]">
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-2xl bg-slate-900/20 backdrop-blur-[1px] dark:bg-slate-950/40"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="goals-auth-required-title"
        aria-describedby="goals-auth-required-description"
        className="relative mx-auto mt-16 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950"
      >
        <h2 id="goals-auth-required-title" className="text-xl font-semibold">
          Goals workspace requires login
        </h2>
        <p
          id="goals-auth-required-description"
          className="mt-2 text-sm text-slate-600 dark:text-slate-300"
        >
          Sign in to store your target companies and continue follow-up notes
          over time.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link href="/login" className="w-full">
            <Button className="w-full">Login</Button>
          </Link>
          <Link href="/signup" className="w-full">
            <Button variant="secondary" className="w-full">
              Sign up
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

export function GoalsPageClient() {
  const { status, user } = useAuth();
  const [companyInput, setCompanyInput] = useState("");
  const [targetRoleInput, setTargetRoleInput] = useState("");
  const [motivationInput, setMotivationInput] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, string>>({});
  const [nextActionDrafts, setNextActionDrafts] = useState<Record<string, string>>({});
  const [isLoadingGoals, setIsLoadingGoals] = useState(false);
  const [isCreatingGoal, setIsCreatingGoal] = useState(false);
  const [pendingDeleteGoalId, setPendingDeleteGoalId] = useState<string | null>(null);
  const [pendingFollowUpGoalId, setPendingFollowUpGoalId] = useState<string | null>(
    null,
  );
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setCompanyInput("");
      setTargetRoleInput("");
      setMotivationInput("");
      setGoals([]);
      setFollowUpDrafts({});
      setNextActionDrafts({});
      setIsLoadingGoals(false);
      setNoticeMessage(null);
      setErrorMessage(null);
      return;
    }

    let cancelled = false;
    setIsLoadingGoals(true);

    void (async () => {
      try {
        const loadedGoals = await listGoalsFromApi(user.id);
        if (!cancelled) {
          setGoals(loadedGoals);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toErrorMessage(error, "Failed to load goals."));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingGoals(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const sortedGoals = useMemo(
    () =>
      [...goals].sort((left, right) => {
        const leftTime = Date.parse(left.updatedAt);
        const rightTime = Date.parse(right.updatedAt);
        return rightTime - leftTime;
      }),
    [goals],
  );

  const addGoal = useCallback(async () => {
    const company = normalizeText(companyInput);
    if (!company) {
      setErrorMessage("Type your target company before adding a goal.");
      return;
    }

    setIsCreatingGoal(true);
    try {
      if (!user) {
        setErrorMessage("Login required");
        return;
      }

      const createdGoal = await createGoalViaApi({
        userId: user.id,
        company,
        targetRole: normalizeText(targetRoleInput) || undefined,
        motivation: motivationInput.trim() || undefined,
      });

      setGoals((current) => [createdGoal, ...current.filter((goal) => goal.id !== createdGoal.id)]);
      setCompanyInput("");
      setTargetRoleInput("");
      setMotivationInput("");
      setNoticeMessage("Goal saved. Keep adding follow-up notes as you progress.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to save goal."));
    } finally {
      setIsCreatingGoal(false);
    }
  }, [companyInput, motivationInput, targetRoleInput, user]);

  const removeGoal = useCallback(async (goalId: string) => {
    if (!user) {
      setErrorMessage("Login required");
      return;
    }

    setPendingDeleteGoalId(goalId);
    try {
      await removeGoalViaApi(user.id, goalId);
      setGoals((current) => current.filter((goal) => goal.id !== goalId));
      setFollowUpDrafts((current) => {
        const next = { ...current };
        delete next[goalId];
        return next;
      });
      setNextActionDrafts((current) => {
        const next = { ...current };
        delete next[goalId];
        return next;
      });
      setNoticeMessage("Goal removed.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to remove goal."));
    } finally {
      setPendingDeleteGoalId(null);
    }
  }, [user]);

  const addFollowUp = useCallback(
    async (goalId: string) => {
      const goal = goals.find((item) => item.id === goalId);
      if (!goal) {
        setErrorMessage("Goal not found. Refresh and try again.");
        return;
      }

      const note = normalizeText(followUpDrafts[goalId] ?? "");
      if (!note) {
        setErrorMessage("Write a follow-up note before saving.");
        return;
      }

      setPendingFollowUpGoalId(goalId);
      try {
        if (!user) {
          setErrorMessage("Login required");
          return;
        }

        const updatedGoal = await createFollowUpViaApi(user.id, goalId, {
          note,
          nextActionDate: (nextActionDrafts[goalId] ?? "").trim() || undefined,
        });

        setGoals((current) =>
          current.map((item) => (item.id === goalId ? updatedGoal : item)),
        );
        setFollowUpDrafts((current) => ({ ...current, [goalId]: "" }));
        setNextActionDrafts((current) => ({ ...current, [goalId]: "" }));
        setNoticeMessage(`Follow-up saved for ${goal.company}.`);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(toErrorMessage(error, "Failed to save follow-up."));
      } finally {
        setPendingFollowUpGoalId(null);
      }
    },
    [followUpDrafts, goals, nextActionDrafts, user],
  );

  if (status === "loading") {
    return (
      <Card role="status" aria-live="polite" className="mx-auto mt-16 max-w-md">
        <CardTitle>Checking session...</CardTitle>
        <CardDescription>
          We are verifying your account before opening goals workspace.
        </CardDescription>
      </Card>
    );
  }

  if (!user) {
    return <GoalsAuthRequiredModal />;
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Goals Workspace</h1>
        <p className="text-sm text-slate-500">
          Track your target companies and keep a running follow-up history.
        </p>
      </header>

      <Card className="space-y-3">
        <CardTitle>Add target company</CardTitle>
        <CardDescription>
          Save the companies you want and keep short notes for why each one matters.
        </CardDescription>

        <div className="space-y-2">
          <label htmlFor="goal-company" className="text-sm font-medium">
            Company
          </label>
          <Input
            id="goal-company"
            value={companyInput}
            onChange={(event) => setCompanyInput(event.target.value)}
            placeholder="e.g., Shopify"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="goal-role" className="text-sm font-medium">
            Target role (optional)
          </label>
          <Input
            id="goal-role"
            value={targetRoleInput}
            onChange={(event) => setTargetRoleInput(event.target.value)}
            placeholder="Senior Frontend Engineer"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="goal-motivation" className="text-sm font-medium">
            Why this company? (optional)
          </label>
          <Textarea
            id="goal-motivation"
            value={motivationInput}
            onChange={(event) => setMotivationInput(event.target.value)}
            className="min-h-[120px]"
            placeholder="Product domain, team culture, growth opportunities..."
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={addGoal} disabled={isCreatingGoal}>
            {isCreatingGoal ? "Saving..." : "Add goal"}
          </Button>
        </div>
      </Card>

      {noticeMessage ? (
        <p className="text-sm text-green-700 dark:text-green-300">{noticeMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className="text-sm text-rose-700 dark:text-rose-300">{errorMessage}</p>
      ) : null}

      <Card className="space-y-3">
        <CardTitle>My goals</CardTitle>
        <CardDescription>
          Add follow-up notes each time you research, apply, or reconnect.
        </CardDescription>

        {isLoadingGoals ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Loading goals...</p>
        ) : sortedGoals.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No goals yet. Add your first target company above.
          </p>
        ) : (
          <ul className="space-y-3">
            {sortedGoals.map((goal) => (
              <li
                key={goal.id}
                className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {goal.company}
                    </p>
                    {goal.targetRole ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Target role: {goal.targetRole}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pendingDeleteGoalId === goal.id}
                    onClick={() => {
                      void removeGoal(goal.id);
                    }}
                  >
                    {pendingDeleteGoalId === goal.id ? "Removing..." : "Remove"}
                  </Button>
                </div>

                {goal.motivation ? (
                  <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {goal.motivation}
                  </p>
                ) : null}

                <p className="text-xs text-slate-500">
                  Added {formatDateTime(goal.createdAt)} · Last update{" "}
                  {formatDateTime(goal.updatedAt)}
                </p>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Follow-up history</p>
                  {goal.followUps.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      No follow-ups yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {goal.followUps.map((followUp) => (
                        <li
                          key={followUp.id}
                          className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                        >
                          <p className="text-xs text-slate-500">
                            {formatDateTime(followUp.createdAt)}
                            {followUp.nextActionDate
                              ? ` · Next follow-up ${formatCalendarDate(
                                  followUp.nextActionDate,
                                )}`
                              : ""}
                          </p>
                          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                            {followUp.note}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor={`goal-follow-up-${goal.id}`}
                    className="text-sm font-medium"
                  >
                    Add follow-up note
                  </label>
                  <Textarea
                    id={`goal-follow-up-${goal.id}`}
                    className="min-h-[100px]"
                    value={followUpDrafts[goal.id] ?? ""}
                    onChange={(event) =>
                      setFollowUpDrafts((current) => ({
                        ...current,
                        [goal.id]: event.target.value,
                      }))
                    }
                    placeholder="What did you do, and what should happen next?"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-[minmax(0,180px)_auto] sm:items-end">
                  <div className="space-y-2">
                    <label
                      htmlFor={`goal-next-action-${goal.id}`}
                      className="text-sm font-medium"
                    >
                      Next follow-up date (optional)
                    </label>
                    <Input
                      id={`goal-next-action-${goal.id}`}
                      type="date"
                      value={nextActionDrafts[goal.id] ?? ""}
                      onChange={(event) =>
                        setNextActionDrafts((current) => ({
                          ...current,
                          [goal.id]: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={pendingFollowUpGoalId === goal.id}
                    onClick={() => {
                      void addFollowUp(goal.id);
                    }}
                  >
                    {pendingFollowUpGoalId === goal.id
                      ? "Saving..."
                      : "Save follow-up"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
