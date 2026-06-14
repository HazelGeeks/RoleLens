"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AUTH_SESSION_STORAGE_KEY,
  AUTH_SESSION_UPDATED_EVENT,
  getActiveAuthSessionUser,
  signInLocalAuth,
  signOutLocalAuth,
  signUpLocalAuth,
  syncAuthSessionFromServer,
  type AuthSessionUser,
} from "@/lib/auth-client";
import { claimLocalJobsForActiveSession } from "@/lib/persistence-client";

type AuthStatus = "loading" | "guest" | "authenticated";

type AuthActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

type AuthContextValue = {
  status: AuthStatus;
  user: AuthSessionUser | null;
  signIn: (input: { email: string; password: string }) => Promise<AuthActionResult>;
  signUp: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthSessionUser | null>(null);

  const refreshFromStorage = useCallback(() => {
    const nextUser = getActiveAuthSessionUser();
    setUser(nextUser);
    setStatus(nextUser ? "authenticated" : "guest");
  }, []);

  useEffect(() => {
    void (async () => {
      await syncAuthSessionFromServer();
      refreshFromStorage();
    })();

    const handleSessionUpdated = () => {
      refreshFromStorage();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === AUTH_SESSION_STORAGE_KEY) {
        refreshFromStorage();
      }
    };

    window.addEventListener(
      AUTH_SESSION_UPDATED_EVENT,
      handleSessionUpdated as EventListener,
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        AUTH_SESSION_UPDATED_EVENT,
        handleSessionUpdated as EventListener,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshFromStorage]);

  const signIn = useCallback<AuthContextValue["signIn"]>(async (input) => {
    const result = await signInLocalAuth(input);
    if (result.ok) {
      setUser(result.user);
      setStatus("authenticated");
      await claimLocalJobsForActiveSession();
      return { ok: true };
    }

    setStatus("guest");
    return result;
  }, []);

  const signUp = useCallback<AuthContextValue["signUp"]>(async (input) => {
    const result = await signUpLocalAuth(input);
    if (result.ok) {
      setUser(result.user);
      setStatus("authenticated");
      await claimLocalJobsForActiveSession();
      return { ok: true };
    }

    setStatus("guest");
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await signOutLocalAuth();
    setUser(null);
    setStatus("guest");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      signIn,
      signUp,
      signOut,
    }),
    [signIn, signOut, signUp, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
