import { addJobNoteAction } from "@/actions/jobs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AddNoteForm({ jobId }: { jobId: string }) {
  return (
    <form action={addJobNoteAction.bind(null, jobId)} className="space-y-2">
      <label className="block text-sm font-medium">Add Note</label>
      <Textarea name="content" required className="min-h-[100px]" placeholder="Add your follow-up notes, interview prep points, risks..." />
      <Button type="submit" variant="secondary">
        Add Note
      </Button>
    </form>
  );
}
