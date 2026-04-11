# AGENTS.md

This file provides operating guidance for coding agents working in this repository.
It is intentionally explicit so agents can act with minimal back-and-forth.

## 1) Repository Snapshot

- Workspace root: `/Users/sungjun/RoleLens`
- Git repository: yes
- Current tracked source files: none detected at authoring time
- Existing build/test config files: none detected (`package.json`, `pyproject.toml`, `Cargo.toml`, `Makefile` not found)
- Existing top-level docs: none detected (`README*` not found)

Because the repo is effectively empty right now, this document includes:
- What is true today (no runnable build/lint/test commands yet)
- Standard command patterns to use once tooling is introduced
- Style and engineering conventions agents should follow when adding code

## 2) Cursor/Copilot Rule Files

Checked locations:
- `.cursorrules`
- `.cursor/rules/`
- `.github/copilot-instructions.md`

Result:
- No Cursor or Copilot rule files were found at authoring time.

Agent policy:
- If any of these files appear later, treat them as higher-priority repository instructions.
- Update this `AGENTS.md` to reflect newly added rules.

## 3) Build, Lint, and Test Commands

## Current State (Important)

There are no project commands to run yet because no build tool or test framework is configured.

At this moment:
- Build command: not defined
- Lint command: not defined
- Test command: not defined
- Single-test command: not defined

## Command Discovery Order (When Files Are Added)

When the repo gains source code, detect commands in this order:
1. `README*` instructions
2. `Makefile` targets
3. Language/tool manifest scripts
4. CI configs (`.github/workflows/*`) as fallback truth

## Standard Commands by Ecosystem (Use Only If Present)

Node.js (npm):
- Build: `npm run build`
- Lint: `npm run lint`
- Test all: `npm test`
- Single test file: `npm test -- path/to/test.file`
- Jest single test name: `npm test -- path/to/test.file -t "test name"`
- Vitest single test file: `npm test -- path/to/test.file`

Node.js (pnpm):
- Build: `pnpm build`
- Lint: `pnpm lint`
- Test all: `pnpm test`
- Single test file: `pnpm test path/to/test.file`
- Vitest test name: `pnpm vitest -t "test name"`

Python (pytest):
- Lint (ruff): `ruff check .`
- Format (black): `black .`
- Test all: `pytest`
- Single test file: `pytest tests/test_module.py`
- Single test case: `pytest tests/test_module.py::TestClass::test_name`
- Single test by keyword: `pytest -k "keyword"`

Go:
- Build: `go build ./...`
- Lint (if golangci): `golangci-lint run`
- Test all: `go test ./...`
- Single package: `go test ./path/to/pkg`
- Single test name: `go test ./path/to/pkg -run TestName`

Rust:
- Build: `cargo build`
- Lint: `cargo clippy --all-targets --all-features -D warnings`
- Test all: `cargo test`
- Single test target: `cargo test test_name`
- Single integration test file: `cargo test --test file_name`

## Execution Rules for Agents

- Prefer the repository's declared scripts over guessed commands.
- Run narrow tests first (single test), then broader suites.
- Before finalizing changes, run lint + tests relevant to touched code.
- If commands are missing, report exactly what is missing and what command was attempted.

## 4) Code Style and Engineering Guidelines

These conventions apply until language-specific standards are added.

## Formatting and Structure

- Use the ecosystem's canonical formatter (e.g., Prettier, Black, gofmt, rustfmt).
- Do not hand-format against formatter output.
- Keep files focused; prefer small modules with clear responsibilities.
- Avoid deeply nested control flow; use guard clauses and early returns.
- Keep functions short and single-purpose where practical.

## Imports and Dependencies

- Group imports in this order: standard library, third-party, local project modules.
- Keep import order deterministic using toolchain defaults.
- Remove unused imports.
- Prefer explicit imports over wildcard imports.
- Add new dependencies only when justified; prefer existing project utilities.

## Types and Interfaces

- Prefer explicit types at public boundaries (API surfaces, exported functions).
- Use strict typing features available in the chosen language.
- Avoid `any`/untyped escape hatches unless unavoidable; document why when used.
- Model domain data with named types/structs/interfaces instead of loose maps.
- Encode null/optional behavior explicitly.

## Naming Conventions

- Use descriptive, intention-revealing names.
- Prefer domain vocabulary over generic names like `data`, `util`, `misc`.
- Classes/types: PascalCase.
- Functions/methods/variables: language-idiomatic casing.
- Constants: language-idiomatic constant style.
- Booleans should read like predicates (`isReady`, `hasAccess`, `shouldRetry`).

## Error Handling

- Never silently swallow errors.
- Fail fast on programmer errors; return structured errors for runtime failures.
- Add context when rethrowing or propagating errors.
- Avoid broad catch-all handling unless converting to a boundary-safe error.
- Ensure user-facing messages are actionable and do not leak secrets.

## Logging and Observability

- Prefer structured logs where possible.
- Include stable identifiers (request id, entity id) in logs.
- Do not log secrets, tokens, credentials, or raw PII.
- Use appropriate log levels (`debug`, `info`, `warn`, `error`).

## Testing Guidelines

- Add or update tests for behavior changes.
- Prefer deterministic tests; avoid time/network flakiness.
- Mock at boundaries, not internals.
- Assert behavior and outcomes, not implementation details.
- Include at least one failure-path test for non-trivial logic.

## Documentation and Comments

- Document public APIs, non-obvious invariants, and tricky algorithms.
- Keep comments accurate; update comments with code changes.
- Do not add redundant comments that restate code.

## Security and Configuration

- Never hardcode secrets.
- Use environment variables or approved secret managers.
- Validate untrusted inputs at boundaries.
- Apply least-privilege defaults for credentials and permissions.

## 5) Git and Change Management

- Keep commits focused and coherent.
- Do not mix refactors with behavior changes unless necessary.
- Run relevant lint/tests before committing.
- Include a concise commit message explaining intent and impact.
- If the worktree contains unrelated changes, do not revert them unless asked.

## 6) Agent Behavior Checklist

Before editing:
- Inspect existing conventions in nearby files.
- Locate and follow any newly added Cursor/Copilot rule files.

During editing:
- Make the minimal change that fully solves the task.
- Preserve backward compatibility unless a breaking change is requested.

Before handoff:
- Report what changed and why.
- List commands run and their outcomes.
- If no tests were run, state why and provide the exact command to run.

## 7) Maintenance Note

This document is a living guide.
When the repository gains concrete tooling, replace placeholders with exact commands.
Priority is always: explicit repository rules > this document > general defaults.
