import { updateJobStatusAction } from "@/actions/jobs";
import { statusLabels, statusOptions } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export function StatusUpdateForm({ jobId, currentStatus }: { jobId: string; currentStatus: (typeof statusOptions)[number] }) {
  return (
    <form action={updateJobStatusAction.bind(null, jobId)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="w-full sm:max-w-[220px]">
        <label className="mb-1 block text-sm font-medium">Update Status</label>
        <Select name="status" defaultValue={currentStatus}>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="secondary">
        Save
      </Button>
    </form>
  );
}
