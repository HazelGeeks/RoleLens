import {
  getJobById,
  updateStatus,
  upsertJob,
  type JobStatus,
} from "@/lib/local-jobs";
import {
  assertJobsStorageScope,
  getJobsStorageKey,
} from "@/lib/job-cache-scope";
import {
  isPersistenceNotFoundError,
  mirrorLocalJobToPersistence,
  patchPersistentJobClient,
  toLocalJobFromPersistent,
} from "@/lib/persistence-client";

export async function saveJobStatus(
  id: string,
  status: JobStatus,
  authenticated: boolean,
) {
  const scope = getJobsStorageKey();
  const job = getJobById(id);
  if (!job)
    throw new Error("Posting not found. Refresh the list and try again.");
  if (!authenticated) {
    updateStatus(id, status);
    return;
  }

  const create = async () => {
    const persisted = await mirrorLocalJobToPersistence(
      { ...job, persistentId: undefined, persistentVersion: undefined },
      { clientRequestId: `status-recovery:${job.id}:${crypto.randomUUID()}` },
    );
    assertJobsStorageScope(scope);
    upsertJob(toLocalJobFromPersistent(persisted, job));
    return persisted;
  };
  let persistent = job.persistentId
    ? { id: job.persistentId, version: job.persistentVersion }
    : await create();
  const patch = () =>
    patchPersistentJobClient(persistent.id, {
      op: "status",
      expectedVersion: persistent.version,
      status,
    });
  let updated;
  try {
    updated = await patch();
  } catch (error) {
    if (!isPersistenceNotFoundError(error)) throw error;
    assertJobsStorageScope(scope);
    persistent = await create();
    updated = await patch();
  }
  assertJobsStorageScope(scope);
  upsertJob(toLocalJobFromPersistent(updated, getJobById(id) ?? job));
}
