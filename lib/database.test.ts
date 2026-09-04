import { describe, expect, it } from "vitest";

import { normalizePostgresQuery } from "@/lib/database";

describe("normalizePostgresQuery", () => {
  it("numbers compatibility placeholders and preserves camelCase aliases", () => {
    expect(
      normalizePostgresQuery(
        "SELECT user_id AS userId FROM auth_users WHERE email = ? AND id = ?",
      ),
    ).toBe(
      'SELECT user_id AS "userId" FROM auth_users WHERE email = $1 AND id = $2',
    );
  });

  it("does not rewrite question marks inside string literals", () => {
    expect(
      normalizePostgresQuery("SELECT '?' AS marker FROM auth_users WHERE id = ?"),
    ).toBe('SELECT \'?\' AS "marker" FROM auth_users WHERE id = $1');
  });
});
