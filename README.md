# Supply-Link

> Decentralized supply chain provenance tracker built on [Stellar](https://stellar.org)'s Soroban smart contract platform.

[![Built on Stellar](https://img.shields.io/badge/Built%20on-Stellar-7B2FBE?logo=stellar)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Smart%20Contracts-Soroban-blueviolet)](https://soroban.stellar.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

Supply-Link is an open-source, blockchain-based supply chain tracker that enables transparent, tamper-proof tracking of products from origin to consumer. It solves the trust and verification crisis in global supply chains by anchoring every product event immutably on the Stellar blockchain.

**Contract Address (Testnet):** `CBUWSKT2UGOAXK4ZREVDJV5XHSYB42PZ3CERU2ZFUTUMAZLJEHNZIECA`

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
| Blockchain | Stellar (Testnet / Mainnet) |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Wallet | Freighter (`@stellar/freighter-api`) |
| State | Zustand |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| QR | `qrcode` + `html5-qrcode` |

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

The Soroban contract exposes these core functions:

```rust
// Register a new product
register_product(env, id, name, origin, owner) -> Product

// Add a tracking event
add_tracking_event(env, product_id, location, event_type, metadata) -> Event

// Read product details
get_product(env, id) -> Product

// Read all events for a product
get_tracking_events(env, product_id) -> Vec<Event>

// Transfer product ownership
transfer_ownership(env, product_id, new_owner) -> bool

// Authorize an actor to add events
add_authorized_actor(env, product_id, actor) -> bool
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

- Node.js 20+
- Rust + `cargo`
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)
- [Freighter Wallet](https://freighter.app) browser extension

### Frontend

```bash
cd frontend
npm install
npm run dev
# â†’ http://localhost:3000
```

### Smart Contract

```bash
cd smart-contract
cargo build --target wasm32-unknown-unknown --release

# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/supply_link.wasm \
  --network testnet \
  --source <YOUR_ACCOUNT>
```

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
