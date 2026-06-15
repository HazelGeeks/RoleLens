import Link from "next/link";
import { Button } from "@/components/ui/button";

type AuthRequiredModalProps = {
  id: string;
  title: string;
  description: string;
};

export function AuthRequiredModal({
  id,
  title,
  description,
}: AuthRequiredModalProps) {
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return (
    <div className="relative min-h-[65vh]">
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-2xl bg-slate-900/20 backdrop-blur-[1px] dark:bg-slate-950/40"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative mx-auto mt-16 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950"
      >
        <h2 id={titleId} className="text-xl font-semibold">
          {title}
        </h2>
        <p
          id={descriptionId}
          className="mt-2 text-sm text-slate-600 dark:text-slate-300"
        >
          {description}
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
