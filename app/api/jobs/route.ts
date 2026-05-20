import {
  GET as listPersistentJobs,
  POST as createPersistentJob,
} from "@/app/api/persistence/jobs/route";

export const runtime = "edge";

export async function GET(request: Request) {
  return listPersistentJobs(request);
}

export async function POST(request: Request) {
  return createPersistentJob(request);
}
