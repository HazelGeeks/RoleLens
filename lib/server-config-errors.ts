const GENERIC_ERROR_MESSAGE = "Internal server error";
const DATABASE_ERROR_MESSAGE =
  "Server database binding is unavailable. Ensure the Cloudflare Worker has the HYPERDRIVE binding.";
const DATABASE_SCHEMA_ERROR_MESSAGE =
  "Server database schema is missing. Apply the Supabase migrations and redeploy.";
const PEPPER_ERROR_MESSAGE =
  "Server auth configuration is incomplete. Set AUTH_PASSWORD_PEPPER for Production.";

function normalizeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "";
  return error.message.toLowerCase();
}

export function toPublicServerError(error: unknown) {
  const message = normalizeErrorMessage(error);
  if (message.includes("password reset email"))
    return {
      status: 503,
      message:
        "Password reset email is temporarily unavailable. Please try again later.",
    };

  if (message.includes("auth_password_pepper is required in production")) {
    return {
      status: 500,
      message: PEPPER_ERROR_MESSAGE,
    };
  }

  if (
    message.includes("auth backend is configured for postgres") ||
    message.includes("auth requires postgres") ||
    message.includes("persistence_backend=postgres is set") ||
    message.includes("production persistence requires postgres")
  ) {
    return {
      status: 500,
      message: DATABASE_ERROR_MESSAGE,
    };
  }

  if (
    message.includes("does not exist") ||
    message.includes("undefined_table") ||
    message.includes("42p01")
  ) {
    return {
      status: 500,
      message: DATABASE_SCHEMA_ERROR_MESSAGE,
    };
  }

  return {
    status: 500,
    message: GENERIC_ERROR_MESSAGE,
  };
}
