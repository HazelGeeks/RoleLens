"use client";

import { Button } from "@/components/ui/button";
import { NewJobClient } from "@/components/jobs/new-job-client";

type SaveJobModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function SaveJobModal({ isOpen, onClose, onSaved }: SaveJobModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-posting-modal-title"
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="save-posting-modal-title" className="text-xl font-semibold">
              Save Job Posting
            </h3>
            <p className="text-sm text-slate-500">
              Paste URL and description, auto-fill fields, then save without leaving
              this page.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <NewJobClient navigateToDetail={false} onSaved={onSaved} />
      </div>
    </div>
  );
}
