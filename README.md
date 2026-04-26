# Supply-Link

> Decentralized supply chain provenance tracker built on [Stellar](https://stellar.org)'s Soroban smart contract platform.

[![Built on Stellar](https://img.shields.io/badge/Built%20on-Stellar-7B2FBE?logo=stellar)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Smart%20Contracts-Soroban-blueviolet)](https://soroban.stellar.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/YOUR_ORG/supply-link/ci.yml?label=CI&logo=github)](https://github.com/YOUR_ORG/supply-link/actions)
[![Coverage](https://img.shields.io/badge/coverage-coming%20soon-lightgrey)](https://github.com/YOUR_ORG/supply-link)
[![Vercel](https://img.shields.io/badge/Vercel-not%20yet%20deployed-lightgrey?logo=vercel)](https://vercel.com)

> **Live Demo:** _Not yet deployed — coming soon._

---

## Overview

Supply-Link is an open-source, blockchain-based supply chain tracker that enables transparent, tamper-proof tracking of products from origin to consumer. It anchors every product event immutably on the Stellar blockchain via Soroban smart contracts.

**Contract Address (Testnet):** `CBUWSKT2UGOAXK4ZREVDJV5XHSYB42PZ3CERU2ZFUTUMAZLJEHNZIECA`

> ⚠️ This address is a **placeholder** used during development. The contract has not been deployed to testnet yet. Update `NEXT_PUBLIC_CONTRACT_ID` in your `.env` once you deploy.

---

## Current Status

This project is in active development (Phase 1 — MVP). Here's an honest breakdown of what works today:

### ✅ Implemented

**Smart Contract (`smart-contract/`)**
- `register_product` — register a product on-chain with ID, name, origin, and owner
- `add_tracking_event` — log supply chain events (HARVEST / PROCESSING / SHIPPING / RETAIL) with location and metadata
- `get_product` / `get_tracking_events` — read product details and full event history
- `transfer_ownership` — transfer product custody to a new owner
- `add_authorized_actor` / `remove_authorized_actor` — manage who can log events
- `get_authorized_actors` — list authorized actors for a product
- `product_exists` — check if a product ID is registered
- `get_product_count` / `list_products` — paginated product listing
- Full unit test suite + property-based tests (proptest) covering all core invariants

**Frontend (`frontend/`)**
- Landing page with feature overview, how-it-works, and inline product verification widget
- Dashboard page with stat cards, events-per-day line chart, event-type pie chart, and recent events table
- Products list page with search, filter, skeleton loading, and empty state
- Product detail page with QR code, authorized actors panel, ownership history, and action buttons
- Tracking page with product selector and event timeline
- Public verify page (`/verify/[id]`) — no wallet required, shows full product journey
- Consumer guide page (`/docs/user-guide-consumer`)
- Freighter wallet connect/disconnect with balance display and network mismatch detection
- `RegisterProductForm` — modal form with Zod validation and auto-generated product IDs
- `TransferOwnershipForm` — transfer product ownership
- `AddEventModal` / `AddEventForm` — log new tracking events
- `AuthorizedActorsPanel` — add/remove authorized actors
- `ProductQRCode` — generates and displays QR codes linking to the verify page
- `QRScanner` / `ScanQRButton` — scan QR codes via camera
- `EventTimeline` — visual timeline of tracking events
- Dark/light theme toggle
- Zustand store with wallet state, product/event lists, and pagination
- `contractClient` in `lib/stellar/contract.ts` — full Soroban SDK wiring for all contract methods

### ⚠️ Partially Implemented / Stubs

- **Frontend → contract integration:** `lib/stellar/client.ts` exports stub functions (`registerProduct`, `listProducts`, `transferOwnership`, `addAuthorizedActor`, `removeAuthorizedActor`) that simulate network delay and return mock data. The real Soroban calls are implemented in `lib/stellar/contract.ts` (`contractClient`) but the UI components still call the stubs in `client.ts`. Wiring the UI to `contractClient` is the next step.
- **Dashboard data:** Loaded from `lib/mock/products.ts` (mock data), not from the contract.
- **Tracking page:** Product list and events come from mock data; the `Add Event` modal creates local state only — not submitted on-chain.
- **Product detail page:** Reads from mock data; ownership history is a local field not stored on-chain.
- **Verify page:** Reads from mock data; does not query the Soroban RPC.

### ❌ Not Yet Implemented

- Contract deployment to testnet (no live contract address)
- CI/CD pipeline (no `.github/workflows/` directory)
- Test coverage reporting
- Vercel / production deployment
- E2E tests
- REST API / webhooks
- Mobile-optimized layout
- Multi-language support

---

## The Problem

Modern supply chains suffer from deep trust failures:

| Issue | Impact |
|---|---|
| Counterfeit goods | $4.5 trillion lost annually |
| Supply chain fraud | $40+ billion lost annually |
| Counterfeit medications | 250,000+ deaths per year |
| Consumer distrust | 73% don't trust sustainability claims |

Paper trails are forged. Databases are siloed. No single source of truth exists across supply chain participants.

---

## The Solution

Supply-Link provides a decentralized, immutable ledger where every product event â€” harvest, processing, shipping, quality check, retail receipt â€” is recorded on-chain and verifiable by anyone with a QR code scan.

### Core Features

- **Product Registration** â€” Register products at origin with cryptographic proof of authenticity and a unique blockchain ID
- **Event Tracking** â€” Record every supply chain step with timestamp, location, actor address, and metadata
- **QR Verification** â€” Consumers scan a QR code to see the complete, tamper-proof product journey
- **Multi-party Authorization** â€” Farmers, processors, shippers, and retailers each sign their own events
- **Ownership Transfer** â€” Transfer product custody on-chain with full audit trail

---

## Architecture

```
Supply-Link/
â”œâ”€â”€ frontend/          # Next.js 16 + React 19 + TypeScript web app
â””â”€â”€ smart-contract/    # Rust + Soroban smart contracts
```

### Technology Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Rust + Soroban SDK 22 |
| Blockchain | Stellar Testnet (Mainnet: future) |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Wallet | Freighter (`@stellar/freighter-api` v6) |
| State | Zustand v5 |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| QR | `qrcode` + `html5-qrcode` |
| Testing (contract) | `soroban-sdk` testutils + proptest |
| Testing (frontend) | Vitest |

### Data Flow

```
Producer â†’ Register Product â†’ Stellar Blockchain
    â†“
Processor â†’ Add Event â†’ Stellar Blockchain
    â†“
Shipper â†’ Add Event â†’ Stellar Blockchain
    â†“
Retailer â†’ Add Event â†’ Stellar Blockchain
    â†“
Consumer â†’ Scan QR â†’ View Full History
```

---

## Smart Contract

The Soroban contract exposes these functions:

```rust
// Register a new product
register_product(env, id, name, origin, owner) -> Product

// Add a tracking event (owner or authorized actor only)
add_tracking_event(env, product_id, caller, location, event_type, metadata) -> TrackingEvent

// Read product details
get_product(env, id) -> Product

// Read all events for a product
get_tracking_events(env, product_id) -> Vec<TrackingEvent>

// Check if a product exists
product_exists(env, id) -> bool

// Get event count for a product
get_events_count(env, product_id) -> u32

// Transfer product ownership
transfer_ownership(env, product_id, new_owner) -> bool

// Manage authorized actors
add_authorized_actor(env, product_id, actor) -> bool
remove_authorized_actor(env, product_id, actor) -> bool
get_authorized_actors(env, product_id) -> Vec<Address>

// Paginated product listing
get_product_count(env) -> u64
list_products(env, offset, limit) -> Vec<String>
```

### Data Models

```rust
pub struct Product {
    pub id: String,
    pub name: String,
    pub origin: String,
    pub owner: Address,
    pub timestamp: u64,
    pub authorized_actors: Vec<Address>,
}

pub struct TrackingEvent {
    pub product_id: String,
    pub location: String,
    pub actor: Address,
    pub timestamp: u64,
    pub event_type: String,  // HARVEST | PROCESSING | SHIPPING | RETAIL
    pub metadata: String,    // JSON string
}
```

---

## Frontend Structure

```
frontend/
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ (marketing)/        Landing page
â”‚   â”œâ”€â”€ (app)/
â”‚   â”‚   â”œâ”€â”€ dashboard/      Analytics & overview
â”‚   â”‚   â”œâ”€â”€ products/       Product registration & list
â”‚   â”‚   â””â”€â”€ tracking/       Event tracking
â”‚   â”œâ”€â”€ verify/[id]/        Public QR verification page
â”‚   â””â”€â”€ api/health/         Health check endpoint
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ ui/                 Reusable primitives (Button, Card, etc.)
â”‚   â”œâ”€â”€ layouts/            App shell (Navbar, Sidebar)
â”‚   â”œâ”€â”€ wallet/             Freighter wallet connect
â”‚   â”œâ”€â”€ products/           Product cards & registration form
â”‚   â””â”€â”€ tracking/           Event timeline & add-event form
â””â”€â”€ lib/
    â”œâ”€â”€ stellar/            Soroban SDK client & contract bindings
    â”œâ”€â”€ state/              Zustand stores
    â”œâ”€â”€ hooks/              Custom React hooks
    â””â”€â”€ types/              Shared TypeScript domain types
```

---

## Getting Started

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Rust + cargo** — [rustup.rs](https://rustup.rs)
- **wasm32 target** — `rustup target add wasm32-unknown-unknown`
- **Stellar CLI** — [installation guide](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)
- **Freighter Wallet** browser extension — [freighter.app](https://freighter.app)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_ORG/supply-link.git
cd supply-link
```

### 2. Frontend

```bash
cd frontend

# Copy environment variables
cp .env.example .env
# Edit .env and set NEXT_PUBLIC_CONTRACT_ID once you deploy the contract

npm install
npm run dev
# â†’ http://localhost:3000
```

The app runs with mock data by default. No contract deployment is required to explore the UI.

### 3. Smart Contract

```bash
cd smart-contract

# Run tests
cargo test

# Build the WASM binary
cargo build --target wasm32-unknown-unknown --release

# Deploy to testnet (requires a funded Stellar account alias)
SOURCE=my-account bash scripts/deploy.sh
# Copy the printed contract address into frontend/.env as NEXT_PUBLIC_CONTRACT_ID
```

### 4. Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_CONTRACT_ID` | Deployed Soroban contract address | Placeholder — update after deploy |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` or `mainnet` | `testnet` |

---

## Screenshots

> Screenshots will be added once the app is deployed. To preview locally, run `npm run dev` inside `frontend/`.

---

## Why Stellar / Soroban?

| Feature | Stellar | Ethereum | Bitcoin |
|---|---|---|---|
| Finality | ~5 seconds | Minutes | Hours |
| Tx cost | ~$0.00001 | $10â€“100 | High |
| Energy | Efficient PoA | PoS | PoW |
| Cross-border | Native | Limited | Limited |

Stellar's speed and near-zero cost make it ideal for supply chain use cases where thousands of events are recorded per day across global participants.

---

## Use Cases

- **Food & Agriculture** â€” Track coffee from Ethiopian farm to Seattle cafÃ©, verify organic/fair-trade claims
- **Pharmaceuticals** â€” Verify medication authenticity from factory to pharmacy, prevent counterfeits
- **Fashion** â€” Prove ethical sourcing and fair-wage manufacturing
- **Electronics** â€” Verify conflict-free mineral sourcing
- **Luxury Goods** â€” Authenticate high-value items, track resale ownership

---

## Roadmap

| Phase | Status | Scope |
|---|---|---|
| Phase 1 â€“ MVP | ðŸ”„ In Progress | Product registration, event tracking, wallet integration, QR codes |
| Phase 2 â€“ Security | ðŸ“… Q2 2026 | Access control, security audit, E2E tests |
| Phase 3 â€“ UX | ðŸ“… Q3 2026 | Timeline visualization, analytics dashboard, mobile |
| Phase 4 â€“ Integrations | ðŸ“… Q3 2026 | REST API, webhooks, SDK |
| Phase 5 â€“ Scale | ðŸ“… Q4 2026 | Multi-language, enterprise features, mainnet launch |

---


---

## Architecture Decision Records

Key architectural decisions are documented in [docs/adr/](docs/adr/):

| ADR | Decision |
|---|---|
| [ADR-001](docs/adr/ADR-001-stellar-soroban-over-ethereum.md) | Why Stellar/Soroban over Ethereum |
| [ADR-002](docs/adr/ADR-002-nextjs-app-router.md) | Why Next.js App Router over Pages Router |
| [ADR-003](docs/adr/ADR-003-zustand-over-redux.md) | Why Zustand over Redux/Context |
| [ADR-004](docs/adr/ADR-004-freighter-wallet.md) | Why Freighter as the wallet provider |

---

## UI Component Library

Stories for all UI components are written with [Storybook](https://storybook.js.org).

```bash
cd frontend
npm install
npm run storybook
# -> http://localhost:6006
```

Components covered: `Button` (all variants), `Card`, `Badge` (all event types), `WalletConnect` (connected/disconnected/loading), `ProductCard`, `EventTimeline`.

Visual regression tests run automatically on every PR via [Chromatic](https://www.chromatic.com). Set `CHROMATIC_PROJECT_TOKEN` in your repository secrets to enable it.
## Contributing

Contributions are welcome across all skill levels â€” smart contracts, frontend, docs, design, and testing.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

---

## License

MIT â€” free to use, modify, and distribute.

---



---

## Contract API Reference

> Full HTML docs: run `cargo doc --open` inside `smart-contract/`.
> Testnet contract: `CBUWSKT2UGOAXK4ZREVDJV5XHSYB42PZ3CERU2ZFUTUMAZLJEHNZIECA`

### Functions

| Function | Auth Required | Returns | Panics |
|---|---|---|---|
| `register_product(id, name, origin, owner)` | `owner` | `Product` | never (under normal conditions) |
| `add_tracking_event(product_id, caller, location, event_type, metadata)` | `caller` (owner or authorized actor) | `TrackingEvent` | `"product not found"`, `"caller is not authorized"` |
| `get_product(id)` | none | `Product` | `"product not found"` |
| `get_tracking_events(product_id)` | none | `Vec<TrackingEvent>` | never |
| `product_exists(id)` | none | `bool` | never |
| `get_events_count(product_id)` | none | `u32` | never |
| `transfer_ownership(product_id, new_owner)` | current `owner` | `bool` | `"product not found"` |
| `add_authorized_actor(product_id, actor)` | `owner` | `bool` | `"product not found"` |
| `remove_authorized_actor(product_id, actor)` | `owner` | `bool` (false if not found) | `"product not found"` |
| `update_product_metadata(product_id, name, origin)` | `owner` | `Product` | `"product not found"` |
| `get_authorized_actors(product_id)` | none | `Vec<Address>` | never |
| `get_product_count()` | none | `u64` | never |
| `list_products(offset, limit)` | none | `Vec<String>` | never |

### Emitted Events

| Topic | Body | Trigger |
|---|---|---|
| `("product_registered", id)` | `Product` | `register_product` |
| `("event_added", product_id, event_type)` | `TrackingEvent` | `add_tracking_event` |
| `("ownership_transferred", product_id)` | `Address` (new owner) | `transfer_ownership` |
| `("actor_authorized", product_id)` | `Address` (actor) | `add_authorized_actor` |
| `("product_updated", product_id)` | `Product` | `update_product_metadata` |

### Storage Keys

| Key | Type | Description |
|---|---|---|
| `Product(String)` | `Product` | Product record keyed by product ID |
| `Events(String)` | `Vec<TrackingEvent>` | Append-only event log keyed by product ID |
| `ProductCount` | `u64` | Global monotonic registration counter |
| `ProductIndex(u64)` | `String` | Index-to-ID map for paginated listing |

---

*Built with â¤ï¸ on [Stellar](https://stellar.org) & [Soroban](https://soroban.stellar.org)*
