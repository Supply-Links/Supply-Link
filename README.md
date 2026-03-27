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

Supply-Link provides a decentralized, immutable ledger where every product event — harvest, processing, shipping, quality check, retail receipt — is recorded on-chain and verifiable by anyone with a QR code scan.

### Core Features

- **Product Registration** — Register products at origin with cryptographic proof of authenticity and a unique blockchain ID
- **Event Tracking** — Record every supply chain step with timestamp, location, actor address, and metadata
- **QR Verification** — Consumers scan a QR code to see the complete, tamper-proof product journey
- **Multi-party Authorization** — Farmers, processors, shippers, and retailers each sign their own events
- **Ownership Transfer** — Transfer product custody on-chain with full audit trail

---

## Architecture

```
Supply-Link/
├── frontend/          # Next.js 16 + React 19 + TypeScript web app
└── smart-contract/    # Rust + Soroban smart contracts
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
Producer → Register Product → Stellar Blockchain
    ↓
Processor → Add Event → Stellar Blockchain
    ↓
Shipper → Add Event → Stellar Blockchain
    ↓
Retailer → Add Event → Stellar Blockchain
    ↓
Consumer → Scan QR → View Full History
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
├── app/
│   ├── (marketing)/        Landing page
│   ├── (app)/
│   │   ├── dashboard/      Analytics & overview
│   │   ├── products/       Product registration & list
│   │   └── tracking/       Event tracking
│   ├── verify/[id]/        Public QR verification page
│   └── api/health/         Health check endpoint
├── components/
│   ├── ui/                 Reusable primitives (Button, Card, etc.)
│   ├── layouts/            App shell (Navbar, Sidebar)
│   ├── wallet/             Freighter wallet connect
│   ├── products/           Product cards & registration form
│   └── tracking/           Event timeline & add-event form
└── lib/
    ├── stellar/            Soroban SDK client & contract bindings
    ├── state/              Zustand stores
    ├── hooks/              Custom React hooks
    └── types/              Shared TypeScript domain types
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
# → http://localhost:3000
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
| Tx cost | ~$0.00001 | $10–100 | High |
| Energy | Efficient PoA | PoS | PoW |
| Cross-border | Native | Limited | Limited |

Stellar's speed and near-zero cost make it ideal for supply chain use cases where thousands of events are recorded per day across global participants.

---

## Use Cases

- **Food & Agriculture** — Track coffee from Ethiopian farm to Seattle café, verify organic/fair-trade claims
- **Pharmaceuticals** — Verify medication authenticity from factory to pharmacy, prevent counterfeits
- **Fashion** — Prove ethical sourcing and fair-wage manufacturing
- **Electronics** — Verify conflict-free mineral sourcing
- **Luxury Goods** — Authenticate high-value items, track resale ownership

---

## Roadmap

| Phase | Status | Scope |
|---|---|---|
| Phase 1 – MVP | 🔄 In Progress | Product registration, event tracking, wallet integration, QR codes |
| Phase 2 – Security | 📅 Q2 2026 | Access control, security audit, E2E tests |
| Phase 3 – UX | 📅 Q3 2026 | Timeline visualization, analytics dashboard, mobile |
| Phase 4 – Integrations | 📅 Q3 2026 | REST API, webhooks, SDK |
| Phase 5 – Scale | 📅 Q4 2026 | Multi-language, enterprise features, mainnet launch |

---

## Contributing

Contributions are welcome across all skill levels — smart contracts, frontend, docs, design, and testing.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

---

## License

MIT — free to use, modify, and distribute.

---

*Built with ❤️ on [Stellar](https://stellar.org) & [Soroban](https://soroban.stellar.org)*
