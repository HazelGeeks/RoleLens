"use client";

type SyncToastProps = {
  message: string;
  onDismiss: () => void;
};

export function SyncToast({ message, onDismiss }: SyncToastProps) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-full max-w-sm px-3 sm:px-0">
      <div
        className="pointer-events-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 shadow-lg dark:border-amber-900 dark:bg-amber-950/80 dark:text-amber-200"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="leading-5">{message}</p>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded border border-amber-300 px-2 py-0.5 text-xs font-medium hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-700 dark:hover:bg-amber-900"
            aria-label="Dismiss sync notice"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
