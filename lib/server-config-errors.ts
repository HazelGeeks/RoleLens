const GENERIC_ERROR_MESSAGE = "Internal server error";
const D1_ERROR_MESSAGE =
  "Server database binding is unavailable. Ensure Cloudflare Pages Functions has D1 binding 'DB'.";
const PEPPER_ERROR_MESSAGE =
  "Server auth configuration is incomplete. Set AUTH_PASSWORD_PEPPER for Production.";

export function toPublicServerError(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("AUTH_PASSWORD_PEPPER is required in production")) {
      return {
        status: 500,
        message: PEPPER_ERROR_MESSAGE,
      };
    }

    if (
      error.message.includes("Auth backend is configured for d1") ||
      error.message.includes("PERSISTENCE_BACKEND=d1 is set")
    ) {
      return {
        status: 500,
        message: D1_ERROR_MESSAGE,
      };
    }
  }

  return {
    status: 500,
    message: GENERIC_ERROR_MESSAGE,
  };
}
