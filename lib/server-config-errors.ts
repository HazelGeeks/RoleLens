const GENERIC_ERROR_MESSAGE = "Internal server error";
const D1_ERROR_MESSAGE =
  "Server database binding is unavailable. Ensure Cloudflare Pages Functions has D1 binding 'DB'.";
const D1_SCHEMA_ERROR_MESSAGE =
  "Server database schema is missing. Apply database schema changes (npm run db:schema:prod) and redeploy.";
const PEPPER_ERROR_MESSAGE =
  "Server auth configuration is incomplete. Set AUTH_PASSWORD_PEPPER for Production.";

function normalizeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "";
  return error.message.toLowerCase();
}

export function toPublicServerError(error: unknown) {
  const message = normalizeErrorMessage(error);

  if (message.includes("auth_password_pepper is required in production")) {
    return {
      status: 500,
      message: PEPPER_ERROR_MESSAGE,
    };
  }

  if (
    message.includes("auth backend is configured for d1") ||
    message.includes("persistence_backend=d1 is set")
  ) {
    return {
      status: 500,
      message: D1_ERROR_MESSAGE,
    };
  }

  if (message.includes("no such table") || message.includes("sqlite_error")) {
    return {
      status: 500,
      message: D1_SCHEMA_ERROR_MESSAGE,
    };
  }

  return {
    status: 500,
    message: GENERIC_ERROR_MESSAGE,
  };
}
