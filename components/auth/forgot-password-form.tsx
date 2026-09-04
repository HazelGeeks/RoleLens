"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  requestPasswordResetLocalAuth,
  resetPasswordLocalAuth,
} from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const { status } = useAuth();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [canRequestReset, setCanRequestReset] = useState<boolean | null>(null);

  useEffect(() => {
    // Auth hydration can remount this public form when an existing session is found.
    if (status === "loading") return;
    const resetToken = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (resetToken) {
      setToken(resetToken);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/request-password-reset", {
          method: "GET",
          cache: "no-store",
        });
        const payload: unknown = await response.json();
        const available =
          response.ok &&
          !!payload &&
          typeof payload === "object" &&
          "available" in payload &&
          payload.available === true;
        if (!cancelled) setCanRequestReset(available);
      } catch {
        if (!cancelled) setCanRequestReset(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token && canRequestReset !== true) return;
    setError(null);
    setNotice(null);
    if (token) {
      if (password.trim().length < 8 || password.length > 1024) {
        setError("Password must be between 8 and 1024 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    } else if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = token
        ? await resetPasswordLocalAuth({ token, password })
        : await requestPasswordResetLocalAuth(email);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice(result.message);
      if (token) {
        setCompleted(true);
        setPassword("");
        setConfirmPassword("");
        setToken("");
        window.location.replace("/login/?passwordReset=1");
      }
    } catch {
      setError(
        "Unable to connect. Please check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">
          {token ? "Choose a new password" : "Forgot password"}
        </h2>
        <p className="text-sm text-slate-500">
          {token || canRequestReset === true
            ? "Reset your password using a link sent to your account email."
            : "Account password recovery"}
        </p>
      </header>
      <Card>
        <CardTitle>{token ? "Reset password" : "Request reset link"}</CardTitle>
        <CardDescription className="mb-4">
          {token
            ? "Your reset link expires after 15 minutes and can be used once."
            : canRequestReset === null
              ? "Checking password recovery availability..."
              : canRequestReset
                ? "Enter your email. If an account exists, we will send you a reset link."
                : "Password reset is currently unavailable. Email recovery has not been enabled."}
        </CardDescription>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <fieldset
            disabled={
              status === "loading" ||
              isSubmitting ||
              completed ||
              (!token && canRequestReset !== true)
            }
            className="space-y-4"
          >
            {!token && !completed ? (
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
            ) : null}
            {token ? (
              <>
                <div className="space-y-2">
                  <label
                    htmlFor="reset-password"
                    className="text-sm font-medium"
                  >
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
                    maxLength={1024}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="reset-password-confirm"
                    className="text-sm font-medium"
                  >
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
                  />
                </div>
              </>
            ) : null}
            {!completed ? (
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting
                  ? "Submitting..."
                  : token
                    ? "Reset password"
                    : "Send reset link"}
              </Button>
            ) : null}
          </fieldset>
          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p
              role="status"
              className="text-sm text-green-700 dark:text-green-300"
            >
              {notice}
            </p>
          ) : null}
          {token ? (
            <button
              type="button"
              className="text-sm text-blue-600"
              onClick={() => {
                setToken("");
                setError(null);
              }}
            >
              Request a new reset link
            </button>
          ) : null}
        </form>
      </Card>
      <p className="text-sm text-slate-500">
        <Link
          href="/login"
          className="font-medium text-blue-600 hover:underline"
        >
          Back to login
        </Link>
      </p>
    </div>
  );
}
