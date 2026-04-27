# Contributing to Supply-Link

Thanks for your interest in contributing. Supply-Link is an open-source project and we welcome contributions across smart contracts, frontend, docs, design, and testing.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
  - [Frontend](#frontend)
  - [Smart Contract](#smart-contract)
- [Branching Strategy](#branching-strategy)
- [Commit Message Convention](#commit-message-convention)
- [Pull Request Process](#pull-request-process)
- [What Reviewers Look For](#what-reviewers-look-for)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating you agree to uphold it. Report unacceptable behaviour to the maintainers via a private GitHub issue or email.

---

## Prerequisites

Install these tools before working on the project:

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| Rust | stable (1.78+) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| wasm32 target | — | `rustup target add wasm32-unknown-unknown` |
| Stellar CLI | latest | [Install guide](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli) |
| Freighter Wallet | latest | [freighter.app](https://freighter.app) browser extension |

Verify your setup:

```bash
node --version      # v20+
cargo --version     # cargo 1.78+
stellar --version   # stellar 0.x
```

---

## Local Setup

### Frontend

```bash
cd Supply-Link/frontend

# 1. Copy environment variables
cp .env.example .env.local

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
# → http://localhost:3000
```

The `.env.example` file documents every required variable. At minimum you need:

```
NEXT_PUBLIC_CONTRACT_ID=<testnet contract address>
NEXT_PUBLIC_NETWORK=testnet
```

The testnet contract is already deployed at `CBUWSKT2UGOAXK4ZREVDJV5XHSYB42PZ3CERU2ZFUTUMAZLJEHNZIECA`.

### Smart Contract

```bash
cd Supply-Link/smart-contract

# 1. Build the WASM binary
cargo build --target wasm32-unknown-unknown --release

# 2. Run tests (unit + property-based)
cargo test

# 3. Generate HTML documentation
cargo doc --open

# 4. Deploy to testnet (requires a funded Stellar account)
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/supply_link.wasm \
  --network testnet \
  --source <YOUR_ACCOUNT_ALIAS>
```

To set up a testnet account:

```bash
stellar keys generate --global alice --network testnet
stellar keys fund alice --network testnet   # uses Friendbot
```

---

## Branching Strategy

| Branch | Purpose |
|---|---|
| `main` | Production-ready code. Direct pushes are blocked. |
| `feat/<short-description>` | New features, e.g. `feat/qr-scanner` |
| `fix/<short-description>` | Bug fixes, e.g. `fix/transfer-auth` |
| `docs/<short-description>` | Documentation only, e.g. `docs/contract-api` |
| `chore/<short-description>` | Tooling, deps, CI, e.g. `chore/upgrade-sdk` |
| `test/<short-description>` | Tests only, e.g. `test/prop-event-count` |

Rules:
- Branch off `main` for every piece of work.
- Keep branches short-lived — open a PR as soon as you have something reviewable.
- Delete your branch after it is merged.

---

## Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

**Types:**

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `style` | Formatting, whitespace (no logic change) |
| `refactor` | Code change that is neither a fix nor a feature |
| `test` | Adding or updating tests |
| `chore` | Build process, dependency updates, CI |
| `perf` | Performance improvement |

**Scopes** (optional but encouraged): `contract`, `frontend`, `wallet`, `tracking`, `products`, `ci`, `deps`.

**Examples:**

```
feat(contract): add remove_authorized_actor function
fix(frontend): correct QR code URL encoding for product IDs
docs(contract): add Rust doc comments to all public functions
test(contract): add property-based tests for event count
chore(deps): upgrade soroban-sdk to 22.0.11
```

Breaking changes: append `!` after the type/scope and add a `BREAKING CHANGE:` footer.

```
feat(contract)!: rename event_type field to kind

BREAKING CHANGE: TrackingEvent.event_type is now TrackingEvent.kind
```

---

## Pull Request Process

1. **Fork** the repository and create your branch from `main`.
2. **Make your changes** following the coding standards below.
3. **Write or update tests** for any logic you add or change.
4. **Run the full test suite** locally before pushing:
   ```bash
   # Smart contract
   cd smart-contract && cargo test

   # Frontend
   cd frontend && npm test
   ```
5. **Open a PR** against `main` with:
   - A clear title following the Conventional Commits format.
   - A description explaining *what* changed and *why*.
   - Screenshots or a short demo for UI changes.
   - A reference to the related issue, e.g. `Closes #42`.
6. **Address review feedback** — push additional commits to the same branch; do not force-push after a review has started.
7. **Squash and merge** once approved. The maintainer will do this.

---

## What Reviewers Look For

**Smart contract (Rust / Soroban)**
- All public functions have `///` doc comments covering parameters, return values, panics, auth requirements, and emitted events.
- `owner.require_auth()` (or equivalent) is called before any state mutation that requires authorization.
- No unbounded loops over user-supplied data.
- New functions have corresponding unit tests and, where applicable, property-based tests using `proptest`.
- `cargo clippy -- -D warnings` passes with no errors.

**Frontend (TypeScript / Next.js)**
- No `any` types without a comment explaining why.
- Wallet interactions go through the existing `lib/stellar/` abstractions.
- New UI components live in `components/ui/` (primitives) or the relevant feature folder.
- `npm run lint` passes with no errors.

**General**
- Commits follow the Conventional Commits convention.
- No secrets, private keys, or `.env` files committed.
- Documentation is updated alongside code changes.
- PR is focused — one logical change per PR.
