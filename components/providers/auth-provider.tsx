"use client";

import {
  Fragment,
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
  signIn: (input: {
    email: string;
    password: string;
  }) => Promise<AuthActionResult>;
  signUp: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  syncError: string | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthSessionUser | null>(null);

  const refreshFromStorage = useCallback(() => {
    const nextUser = getActiveAuthSessionUser();
    setUser(nextUser);
    setStatus(nextUser ? "authenticated" : "guest");
  }, []);

  const claimJobs = useCallback(async () => {
    try {
      const result = await claimLocalJobsForActiveSession();
      setSyncError(
        result.failed
          ? `${result.failed} postings could not be synced. Your local copies are preserved; reload to retry.`
          : null,
      );
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : "Unable to sync saved postings. Reload to retry.",
      );
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const syncedUser = await syncAuthSessionFromServer();
        if (syncedUser) await claimJobs();
      } catch {
        setSyncError(
          "Unable to verify your session. Reconnect and reload to retry.",
        );
      } finally {
        refreshFromStorage();
      }
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
  }, [claimJobs, refreshFromStorage]);

  const signIn = useCallback<AuthContextValue["signIn"]>(
    async (input) => {
      const result = await signInLocalAuth(input);
      if (result.ok) {
        setUser(result.user);
        setStatus("authenticated");
        await claimJobs();
        return { ok: true };
      }

      setStatus("guest");
      return result;
    },
    [claimJobs],
  );

  const signUp = useCallback<AuthContextValue["signUp"]>(
    async (input) => {
      const result = await signUpLocalAuth(input);
      if (result.ok) {
        setUser(result.user);
        setStatus("authenticated");
        await claimJobs();
        return { ok: true };
      }

      setStatus("guest");
      return result;
    },
    [claimJobs],
  );

  const signOut = useCallback(async () => {
    try {
      await signOutLocalAuth();
      setUser(null);
      setStatus("guest");
      setSyncError(null);
    } catch {
      setSyncError("Unable to sign out. Check your connection and retry.");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      syncError,
      signIn,
      signUp,
      signOut,
    }),
    [signIn, signOut, signUp, status, user, syncError],
  );

  return (
    <AuthContext.Provider value={value}>
      {syncError ? (
        <p role="alert" className="p-3 text-sm text-red-700">
          {syncError}
        </p>
      ) : null}
      <Fragment key={user?.id ?? "guest"}>{children}</Fragment>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
