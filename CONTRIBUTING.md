# Contributing to Supply-Link

Thanks for your interest in contributing. This guide covers the development workflow, tooling setup, and commit conventions.

---

## Prerequisites

- Node.js 20+
- Rust + `cargo`
- Git

---

## Setup

```bash
git clone https://github.com/Maki-Zeninn/Supply-Link.git
cd Supply-Link
npm install          # installs root devDependencies (husky, lint-staged, semantic-release)
cd frontend
npm install          # installs frontend dependencies
```

Husky hooks are installed automatically via the `prepare` script on `npm install`.

---

## Pre-commit Hooks (Husky + lint-staged)

A pre-commit hook runs automatically on every `git commit`:

- `eslint --fix` — auto-fixes lint issues in staged `.ts`/`.tsx` files
- `prettier --write` — formats staged `.ts`/`.tsx`/`.json`/`.css`/`.md` files

A pre-push hook runs on every `git push`:

- `tsc --noEmit` — full TypeScript type-check of the frontend

If either hook fails, the commit or push is blocked. Fix the reported issues and try again.

To skip hooks in an emergency (not recommended):

```bash
git commit --no-verify -m "your message"
```

---

## Code Style

### Prettier

Formatting is enforced by Prettier. Config is in `frontend/.prettierrc`:

- Single quotes
- 2-space indent
- Trailing commas
- 100-character print width

Run manually:

```bash
cd frontend
npm run format        # write
npm run format:check  # check only (used in CI)
```

### ESLint

Strict rules are enforced via `frontend/eslint.config.mjs`:

- `@typescript-eslint/no-explicit-any` — error
- `@typescript-eslint/no-unused-vars` — error
- `no-console` — warn (only `console.warn` and `console.error` allowed)
- `jsx-a11y` — accessibility rules

Run manually:

```bash
cd frontend
npm run lint          # with warnings
npm run lint:ci       # zero warnings (used in CI)
```

---

## Commit Message Convention

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification. Commit messages drive automated versioning and changelog generation via `semantic-release`.

### Format

```
<type>(<scope>): <short description>

[optional body]

[optional footer: Closes #N]
```

### Types

| Type              | When to use                          | Version bump |
| ----------------- | ------------------------------------ | ------------ |
| `feat`            | New feature                          | minor        |
| `fix`             | Bug fix                              | patch        |
| `perf`            | Performance improvement              | patch        |
| `refactor`        | Code restructure, no behavior change | none         |
| `chore`           | Tooling, deps, config                | none         |
| `docs`            | Documentation only                   | none         |
| `test`            | Tests only                           | none         |
| `ci`              | CI/CD changes                        | none         |
| `BREAKING CHANGE` | Breaking API change (in footer)      | major        |

### Examples

```bash
feat: add product_exists helper function (#14)
fix: enforce authorized-actor check in add_tracking_event (#1)
chore(deps): bump next from 16.1.6 to 16.2.0
docs: update README with health check endpoint
feat!: rename add_tracking_event signature  # breaking change
```

---

## Releases

Releases are fully automated. On every push to `main`, `semantic-release`:

1. Analyzes commits since the last release
2. Determines the next version (major/minor/patch)
3. Updates `frontend/package.json` version
4. Generates / updates `CHANGELOG.md`
5. Creates a GitHub Release with release notes
6. Commits the version bump back to `main`

You do not need to manually bump versions or write changelogs.

---

## CI Checks

Every PR must pass:

| Check      | Command                    |
| ---------- | -------------------------- |
| Prettier   | `npm run format:check`     |
| ESLint     | `npm run lint:ci`          |
| TypeScript | `tsc --noEmit`             |
| CodeQL     | Automated (GitHub Actions) |

---

## Branch Naming

```
feature/<issue-number>-short-description
fix/<issue-number>-short-description
chore/<issue-number>-short-description
```
