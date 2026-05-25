"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { resetPasswordLocalAuth } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const router = useRouter();
  const { status, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace("/dashboard");
    }
  }, [router, status, user]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await resetPasswordLocalAuth({
        email,
        password,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setNotice(result.message);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Forgot password</h2>
        <p className="text-sm text-slate-500">
          Reset your password with your account email, then log in again.
        </p>
      </header>

      <Card>
        <CardTitle>Reset password</CardTitle>
        <CardDescription className="mb-4">
          Enter your account email and choose a new password.
        </CardDescription>

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <label htmlFor="reset-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="reset-password" className="text-sm font-medium">
              New password
            </label>
            <Input
              id="reset-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="reset-password-confirm" className="text-sm font-medium">
              Confirm new password
            </label>
            <Input
              id="reset-password-confirm"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-green-700 dark:text-green-300">
              {notice}
            </p>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={status === "loading" || isSubmitting}
          >
            {isSubmitting ? "Resetting..." : "Reset password"}
          </Button>
        </form>
      </Card>

      <p className="text-sm text-slate-500">
        <Link href="/login" className="font-medium text-blue-600 hover:underline">
          Back to login
        </Link>
      </p>
    </div>
  );
}
