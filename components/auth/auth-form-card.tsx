"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AuthFormCardProps = {
  mode: "login" | "signup";
};

export function AuthFormCard({ mode }: AuthFormCardProps) {
  const router = useRouter();
  const { status, user, signIn, signUp } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLogin = mode === "login";
  const submitLabel = isLogin ? "Login" : "Create account";
  const pageTitle = isLogin ? "Login" : "Sign up";
  const pageDescription = isLogin
    ? "Sign in to keep dashboard analytics tied to your own account context."
    : "Create your account. RoleLens stores account credentials securely on the server.";

  const alternateCta = useMemo(
    () =>
      isLogin
        ? {
            href: "/signup",
            text: "Need an account? Sign up",
          }
        : {
            href: "/login",
            text: "Already have an account? Login",
          },
    [isLogin],
  );

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace("/dashboard");
    }
  }, [router, status, user]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isLogin && name.trim().length < 2) {
      setError("Please enter a name with at least 2 characters.");
      return;
    }

    if (password.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = isLogin
        ? await signIn({
            email,
            password,
          })
        : await signUp({
            name,
            email,
            password,
          });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      router.replace("/dashboard");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">{pageTitle}</h2>
        <p className="text-sm text-slate-500">{pageDescription}</p>
      </header>

      <Card>
        <CardTitle>{submitLabel}</CardTitle>

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {!isLogin ? (
            <div className="space-y-2">
              <label htmlFor="auth-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="auth-name"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="auth-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="auth-password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
            {isLogin ? (
              <p className="text-right text-xs">
                <Link
                  href="/forgot-password"
                  className="font-medium text-blue-600 hover:underline"
                >
                  Forgot password?
                </Link>
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={status === "loading" || isSubmitting}
          >
            {isSubmitting ? "Submitting..." : submitLabel}
          </Button>
        </form>
      </Card>

      <p className="text-sm text-slate-500">
        <Link href={alternateCta.href} className="font-medium text-blue-600 hover:underline">
          {alternateCta.text}
        </Link>
      </p>
    </div>
  );
}
