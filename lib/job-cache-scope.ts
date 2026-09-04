export const AUTH_SESSION_STORAGE_KEY = "rolelens.auth.session.v1";
export const JOBS_CACHE_PREFIX = "rolelens.jobs.v2:";
export const GUEST_JOBS_STORAGE_KEY = `${JOBS_CACHE_PREFIX}guest`;

export function getJobsStorageKey(): string {
  if (typeof window === "undefined") return GUEST_JOBS_STORAGE_KEY;
  try {
    const session: unknown = JSON.parse(
      window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) || "null",
    );
    const user =
      session && typeof session === "object" && "user" in session
        ? session.user
        : null;
    const id =
      user && typeof user === "object" && "id" in user ? user.id : null;
    return typeof id === "string" && id
      ? `${JOBS_CACHE_PREFIX}account:${encodeURIComponent(id)}`
      : GUEST_JOBS_STORAGE_KEY;
  } catch {
    return GUEST_JOBS_STORAGE_KEY;
  }
}

/** Prevent a response started under one account from mutating another account's cache. */
export function assertJobsStorageScope(key: string): void {
  if (getJobsStorageKey() !== key) {
    throw new Error("Account changed. Please retry in the current account.");
  }
}
