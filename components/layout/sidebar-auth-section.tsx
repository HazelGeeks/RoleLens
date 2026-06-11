"use client";

import Link from "next/link";
import { LogIn, LogOut, UserCircle2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";

export function SidebarAuthSection() {
  const { status, user, signOut } = useAuth();

  return (
    <section className="mt-6 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
      <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
        Account
      </h2>

      {status === "loading" ? (
        <p className="text-sm text-slate-500" role="status" aria-live="polite">
          Checking session...
        </p>
      ) : null}

      {status !== "authenticated" ? (
        <p className="text-sm text-slate-500" role="status" aria-live="polite">
          You are browsing as a guest.
        </p>
      ) : null}

      {status === "authenticated" && user ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <UserCircle2 className="h-4 w-4" />
            <span className="truncate" title={user.email}>
              {user.name}
            </span>
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => {
              void signOut();
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      ) : null}

      {status !== "authenticated" ? (
        <div className="flex flex-col gap-2">
          <Link
            href="/login"
            className="rolelens-link-button rolelens-link-button-primary"
          >
            <LogIn size={16} />
            Login
          </Link>
          <Link
            href="/signup"
            className="rolelens-link-button rolelens-link-button-secondary"
          >
            <UserPlus size={16} />
            Sign up
          </Link>
        </div>
      ) : null}
    </section>
  );
}
