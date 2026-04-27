#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec, Symbol};

// ── Canonical event type registry (issue #310) ───────────────────────────────
// Accepted values for event_type in add_tracking_event.
// Migration: free-form strings are no longer accepted.
const VALID_EVENT_TYPES: [&str; 4] = ["HARVEST", "PROCESSING", "SHIPPING", "RETAIL"];

fn assert_valid_event_type(env: &Env, event_type: &String) {
    for valid in VALID_EVENT_TYPES.iter() {
        if *event_type == String::from_str(env, valid) { return; }
    }
    panic!("invalid event_type");
}

// ── Data models ──────────────────────────────────────────────────────────────

/// Represents a product registered on the Supply-Link blockchain.
///
/// Products are the core entity of the supply chain. Once registered, a product
/// accumulates [`TrackingEvent`]s as it moves through the supply chain. The
/// `owner` field always reflects the *current* custodian; historical ownership
/// is captured implicitly through `ownership_transferred` events.
///
/// # Storage
/// Stored under [`DataKey::Product`] using the product's `id` as the key.
/// Storage type is `persistent`, so entries survive ledger archival as long as
/// the rent is paid.
#[contracttype]
#[derive(Clone)]
pub struct Product {
    /// Caller-supplied unique identifier for this product (e.g. `"batch-2024-001"`).
    /// Must be unique across all registered products; duplicate IDs are rejected
    /// with `"product already exists"` and leave existing state unchanged.
    pub id: String,
    /// Human-readable product name (e.g. `"Arabica Coffee Beans"`).
    pub name: String,
    /// Geographic or organisational origin of the product
    /// (e.g. `"Yirgacheffe, Ethiopia"`).
    pub origin: String,
    /// Stellar address of the current product owner.
    /// Only this address may call owner-gated functions such as
    /// [`SupplyLinkContract::transfer_ownership`] and
    /// [`SupplyLinkContract::add_authorized_actor`].
    pub owner: Address,
    /// Unix timestamp (seconds) recorded by the Soroban ledger at registration
    /// time. Set automatically; callers cannot supply this value.
    pub timestamp: u64,
    /// Addresses that are permitted to call
    /// [`SupplyLinkContract::add_tracking_event`] for this product in addition
    /// to the owner. Managed via [`SupplyLinkContract::add_authorized_actor`]
    /// and [`SupplyLinkContract::remove_authorized_actor`].
    pub authorized_actors: Vec<Address>,
    /// Number of signatures required to approve events for this product.
    /// If 0 or 1, events are recorded immediately. If > 1, events are staged
    /// as pending until the required number of approvals are received.
    pub required_signatures: u32,
    /// Lifecycle state of the product. `true` indicates the product is active
    /// and can receive tracking events. `false` indicates the product has been
    /// deactivated and is read-only. Defaults to `true` on registration.
    pub active: bool,
}

/// A single supply-chain event recorded against a [`Product`].
///
/// Events are append-only. Once written they cannot be modified or deleted,
/// providing an immutable audit trail. All events for a product are stored
/// together under [`DataKey::Events`].
///
/// # Storage
/// Stored as a `Vec<TrackingEvent>` under [`DataKey::Events`] keyed by
/// `product_id`. Storage type is `persistent`.
#[contracttype]
#[derive(Clone)]
pub struct TrackingEvent {
    /// ID of the [`Product`] this event belongs to.
    pub product_id: String,
    /// Free-form location string describing where the event occurred
    /// (e.g. `"Port of Rotterdam, Netherlands"`).
    pub location: String,
    /// Stellar address of the supply-chain participant who recorded this event.
    /// Must be the product owner or an address in `authorized_actors`.
    pub actor: Address,
    /// Unix timestamp (seconds) recorded by the Soroban ledger when the event
    /// was submitted. Set automatically; callers cannot supply this value.
    pub timestamp: u64,
    /// Supply-chain stage. Accepted values: `"HARVEST"`, `"PROCESSING"`,
    /// `"SHIPPING"`, `"RETAIL"`. The contract stores this as a raw string and
    /// does not validate the value — callers are responsible for using a
    /// recognised stage name.
    pub event_type: String,
    /// Arbitrary JSON string carrying stage-specific metadata
    /// (e.g. `{"temperature":"4°C","humidity":"60%"}`). The contract stores
    /// this opaquely; consumers are responsible for parsing it.
    pub metadata: String,
}

/// A pending event awaiting multi-signature approval.
///
/// For high-value products, events are staged until the required number of
/// authorized actors have approved them.
#[contracttype]
#[derive(Clone)]
pub struct PendingEvent {
    /// ID of the product this event is for.
    pub product_id: String,
    /// The event data awaiting approval.
    pub event: TrackingEvent,
    /// Addresses that have approved this event.
    pub approvals: Vec<Address>,
    /// Number of approvals required before the event is finalized.
    pub required_signatures: u32,
    /// Timestamp when the pending event was created.
    pub created_at: u64,
}

/// Ownership transfer event data with audit context.
///
/// Emitted when product ownership is transferred, providing both
/// previous and new owner information for complete audit trails.
#[contracttype]
#[derive(Clone)]
pub struct OwnershipTransferEvent {
    /// The product ID being transferred.
    pub product_id: String,
    /// The previous owner address.
    pub previous_owner: Address,
    /// The new owner address.
    pub new_owner: Address,
    /// Timestamp of the transfer.
    pub timestamp: u64,
}

// ── Storage keys ─────────────────────────────────────────────────────────────

/// Enumeration of all persistent storage keys used by the contract.
///
/// Using a typed enum prevents key collisions and makes storage layout
/// explicit for auditors.
///
/// # Variants
/// - [`DataKey::Product`] — stores a single [`Product`] by its string ID.
/// - [`DataKey::Events`] — stores a `Vec<TrackingEvent>` for a product ID.
/// - [`DataKey::ProductCount`] — stores a `u64` global counter of registered products.
/// - [`DataKey::ProductIndex`] — maps a sequential `u64` index to a product ID
///   string, enabling paginated listing via [`SupplyLinkContract::list_products`].
#[contracttype]
pub enum DataKey {
    /// Key for a [`Product`] entry. The inner `String` is the product ID.
    Product(String),
    /// Key for the event log of a product. The inner `String` is the product ID.
    Events(String),
    /// Key for pending events awaiting multi-signature approval.
    /// The inner `String` is the product ID.
    PendingEvents(String),
    /// Key for the global product registration counter.
    ProductCount,
    /// Key for the index-to-ID mapping used by pagination.
    /// The inner `u64` is the zero-based insertion index.
    ProductIndex(u64),
}

// ── Contract ─────────────────────────────────────────────────────────────────

/// The Supply-Link Soroban smart contract.
///
/// Provides a decentralised, tamper-proof registry for supply-chain products
/// and their associated tracking events on the Stellar blockchain.
///
/// # Deployment
/// Testnet contract ID: `CBUWSKT2UGOAXK4ZREVDJV5XHSYB42PZ3CERU2ZFUTUMAZLJEHNZIECA`
///
/// # Authorization model
/// - **Owner-gated** functions (`transfer_ownership`, `add_authorized_actor`,
///   `remove_authorized_actor`, `update_product_metadata`) require the current
///   product owner to sign the transaction via `require_auth()`.
/// - **Actor-gated** functions (`add_tracking_event`) accept either the owner
///   or any address in `authorized_actors`.
/// - **Read-only** functions (`get_product`, `get_tracking_events`, etc.) have
///   no authorization requirements.
#[contract]
pub struct SupplyLinkContract;

#[contractimpl]
impl SupplyLinkContract {
    /// Register a new product on-chain.
    ///
    /// Creates a [`Product`] entry in persistent storage and initialises the
    /// global product counter and index mapping used by
    /// [`Self::list_products`].
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment (injected by the runtime).
    /// - `id` — Caller-supplied unique product identifier. Must not already
    ///   exist; duplicate IDs are rejected with `"product already exists"`.
    /// - `name` — Human-readable product name.
    /// - `origin` — Geographic or organisational origin of the product.
    /// - `owner` — Stellar address that will own the product. This address
    ///   must sign the transaction.
    /// - `required_signatures` — Number of approvals required for events (0 or 1 = immediate, >1 = multi-sig).
    ///
    /// # Returns
    /// The newly created [`Product`] struct.
    ///
    /// # Authorization
    /// Requires `owner.require_auth()`. The transaction must be signed by
    /// `owner`.
    ///
    /// # Panics
    /// - `"product already exists"` — if a product with `id` is already registered.
    ///   `product_count` and index mappings are NOT modified on rejection.
    ///
    /// # Emitted Events
    /// Publishes a `("product_registered", id)` event with the [`Product`]
    /// struct as the event body.
    pub fn register_product(
        env: Env,
        id: String,
        name: String,
        origin: String,
        owner: Address,
        required_signatures: u32,
    ) -> Product {
        // Duplicate guard — must come before auth to avoid leaking state on
        // duplicate attempts and to keep counter/index consistent.
        if env.storage().persistent().has(&DataKey::Product(id.clone())) {
            panic!("product already exists");
        }

        owner.require_auth();
        let product = Product {
            id: id.clone(),
            name,
            origin,
            owner,
            timestamp: env.ledger().timestamp(),
            authorized_actors: Vec::new(&env),
            required_signatures,
            active: true,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Product(id.clone()), &product);

        // Increment product count
        let count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::ProductCount)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::ProductCount, &(count + 1));

        // Store product index mapping
        env.storage()
            .persistent()
            .set(&DataKey::ProductIndex(count), &id);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "product_registered"), id.clone()),
            product.clone(),
        );

        product
    }

    /// Add a tracking event for a product.
    ///
    /// Appends a new [`TrackingEvent`] to the product's event log. The event
    /// log is stored as a `Vec<TrackingEvent>` and grows with each call.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — ID of the product to record the event against.
    /// - `caller` — Address of the supply-chain participant submitting the
    ///   event. Must be the product owner or an address in
    ///   `authorized_actors`.
    /// - `location` — Free-form location string (e.g. `"Port of Hamburg"`).
    /// - `event_type` — Canonical supply-chain stage. Must be one of:
    ///   `"HARVEST"`, `"PROCESSING"`, `"SHIPPING"`, `"RETAIL"`.
    ///   Unknown values are rejected with `"invalid event_type"` (issue #310).
    /// - `metadata` — Arbitrary JSON string with stage-specific data.
    ///
    /// # Returns
    /// The newly created [`TrackingEvent`] struct.
    ///
    /// # Authorization
    /// Requires `caller.require_auth()`. The authorization check is performed
    /// *after* verifying that `caller` is the owner or an authorized actor, so
    /// unauthorized addresses are rejected before any auth overhead is incurred.
    ///
    /// # Panics
    /// - `"product not found"` — if `product_id` is not registered.
    /// - `"caller is not authorized"` — if `caller` is neither the product
    ///   owner nor in `authorized_actors`.
    ///
    /// # Emitted Events
    /// Publishes an `("event_added", product_id, event_type)` event with the
    /// [`TrackingEvent`] struct as the event body.
    pub fn add_tracking_event(
        env: Env,
        product_id: String,
        caller: Address,
        location: String,
        event_type: String,
        metadata: String,
    ) -> TrackingEvent {
        let product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        // Check if product is active
        if !product.active {
            panic!("product is not active");
        }

        // Verify caller is owner or an authorized actor before requiring auth
        let is_owner = product.owner == caller;
        let is_actor = product.authorized_actors.contains(&caller);
        if !is_owner && !is_actor {
            panic!("caller is not authorized");
        }
        caller.require_auth();
        // Issue #310: reject unknown event types.
        assert_valid_event_type(&env, &event_type);

        let event = TrackingEvent {
            product_id: product_id.clone(),
            location,
            actor: caller.clone(),
            timestamp: env.ledger().timestamp(),
            event_type: event_type.clone(),
            metadata,
        };

        // Check if multi-signature is required
        if product.required_signatures > 1 {
            // Stage event as pending
            let mut pending: Vec<PendingEvent> = env
                .storage()
                .persistent()
                .get(&DataKey::PendingEvents(product_id.clone()))
                .unwrap_or_else(|| Vec::new(&env));

            let mut approvals = Vec::new(&env);
            approvals.push_back(caller);

            let pending_event = PendingEvent {
                product_id: product_id.clone(),
                event: event.clone(),
                approvals,
                required_signatures: product.required_signatures,
                created_at: env.ledger().timestamp(),
            };

            pending.push_back(pending_event);
            env.storage()
                .persistent()
                .set(&DataKey::PendingEvents(product_id.clone()), &pending);

            // Emit pending event
            env.events().publish(
                (Symbol::new(&env, "event_pending"), product_id, event_type),
                event.clone(),
            );
        } else {
            // Immediately finalize event
            let mut events: Vec<TrackingEvent> = env
                .storage()
                .persistent()
                .get(&DataKey::Events(product_id.clone()))
                .unwrap_or_else(|| Vec::new(&env));

            events.push_back(event.clone());
            env.storage()
                .persistent()
                .set(&DataKey::Events(product_id.clone()), &events);

            // Emit event
            env.events().publish(
                (Symbol::new(&env, "event_added"), product_id, event_type),
                event.clone(),
            );
        }

        event
    }

    /// Retrieve a product by its ID.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `id` — The product ID to look up.
    ///
    /// # Returns
    /// The [`Product`] struct stored under `id`.
    ///
    /// # Authorization
    /// None — this is a read-only function.
    ///
    /// # Panics
    /// - `"product not found"` — if no product with `id` is registered.
    pub fn get_product(env: Env, id: String) -> Product {
        env.storage()
            .persistent()
            .get(&DataKey::Product(id))
            .expect("product not found")
    }

    /// Retrieve all tracking events for a product.
    ///
    /// Returns events in insertion order (oldest first).
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — The product ID whose events to retrieve.
    ///
    /// # Returns
    /// A `Vec<TrackingEvent>` containing every event recorded for the product.
    /// Returns an empty vector if the product has no events or does not exist.
    ///
    /// # Authorization
    /// None — this is a read-only function.
    ///
    /// # Panics
    /// Does not panic.
    pub fn get_tracking_events(env: Env, product_id: String) -> Vec<TrackingEvent> {
        env.storage()
            .persistent()
            .get(&DataKey::Events(product_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Check whether a product ID is registered.
    ///
    /// Useful for pre-flight checks before calling functions that panic on
    /// unknown IDs.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `id` — The product ID to check.
    ///
    /// # Returns
    /// `true` if a product with `id` exists in storage, `false` otherwise.
    ///
    /// # Authorization
    /// None — this is a read-only function.
    ///
    /// # Panics
    /// Does not panic.
    pub fn product_exists(env: Env, id: String) -> bool {
        env.storage().persistent().has(&DataKey::Product(id))
    }

    /// Return the number of tracking events recorded for a product.
    ///
    /// Equivalent to `get_tracking_events(product_id).len()` but cheaper
    /// because it avoids deserialising the full event vector.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — The product ID to query.
    ///
    /// # Returns
    /// The number of events as a `u32`. Returns `0` if the product has no
    /// events or does not exist.
    ///
    /// # Authorization
    /// None — this is a read-only function.
    ///
    /// # Panics
    /// Does not panic.
    pub fn get_events_count(env: Env, product_id: String) -> u32 {
        env.storage()
            .persistent()
            .get::<DataKey, Vec<TrackingEvent>>(&DataKey::Events(product_id))
            .map(|v| v.len())
            .unwrap_or(0)
    }

    /// Transfer product ownership to a new address.
    ///
    /// Updates the `owner` field of the [`Product`] in storage. The previous
    /// owner loses all owner-gated privileges immediately. The new owner gains
    /// them immediately.
    ///
    /// # Safety Checks
    /// - Prevents no-op transfers (transferring to the current owner)
    /// - Validates that the new owner is a valid address
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — ID of the product to transfer.
    /// - `new_owner` — Stellar address of the incoming owner.
    ///
    /// # Returns
    /// `true` on success.
    ///
    /// # Authorization
    /// Requires the *current* `product.owner.require_auth()`. The transaction
    /// must be signed by the current owner.
    ///
    /// # Panics
    /// - `"product not found"` — if `product_id` is not registered.
    /// - `"cannot transfer to current owner"` — if `new_owner` equals current owner.
    ///
    /// # Emitted Events
    /// Publishes an `("ownership_transferred", product_id)` event with
    /// [`OwnershipTransferEvent`] containing both previous and new owner data.
    pub fn transfer_ownership(env: Env, product_id: String, new_owner: Address) -> bool {
        let mut product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        product.owner.require_auth();

        // Prevent no-op transfer to current owner
        if product.owner == new_owner {
            panic!("cannot transfer to current owner");
        }

        let previous_owner = product.owner.clone();
        product.owner = new_owner.clone();
        env.storage()
            .persistent()
            .set(&DataKey::Product(product_id.clone()), &product);

        // Emit enriched event with both previous and new owner
        let transfer_event = OwnershipTransferEvent {
            product_id: product_id.clone(),
            previous_owner,
            new_owner,
            timestamp: env.ledger().timestamp(),
        };

        env.events().publish(
            (Symbol::new(&env, "ownership_transferred"), product_id),
            transfer_event,
        );

        true
    }

    /// Grant an address permission to add tracking events for a product.
    ///
    /// Appends `actor` to `product.authorized_actors`. Prevents duplicate entries
    /// to maintain clean governance state.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — ID of the product to update.
    /// - `actor` — Stellar address to authorise.
    ///
    /// # Returns
    /// `true` on success.
    ///
    /// # Authorization
    /// Requires `product.owner.require_auth()`. Only the current product owner
    /// may grant actor permissions.
    ///
    /// # Panics
    /// - `"product not found"` — if `product_id` is not registered.
    /// - `"actor already authorized"` — if the actor is already in the authorized list.
    ///
    /// # Emitted Events
    /// Publishes an `("actor_authorized", product_id)` event with `actor` as
    /// the event body.
    pub fn add_authorized_actor(env: Env, product_id: String, actor: Address) -> bool {
        let mut product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        product.owner.require_auth();

        // Prevent duplicate actors
        if product.authorized_actors.contains(&actor) {
            panic!("actor already authorized");
        }

        product.authorized_actors.push_back(actor.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Product(product_id.clone()), &product);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "actor_authorized"), product_id),
            actor,
        );

        true
    }

    /// Revoke an address's permission to add tracking events for a product.
    ///
    /// Rebuilds `authorized_actors` without the first occurrence of `actor`.
    /// If `actor` appears multiple times (due to duplicate `add_authorized_actor`
    /// calls), only the first occurrence is removed.
    ///
    /// # Governance Safeguards
    /// - Prevents removal of the owner from authorized actors if multi-signature
    ///   is enabled and would leave insufficient authorized actors to meet the
    ///   required signature threshold.
    /// - Ensures at least one authorized path remains for governance operations.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — ID of the product to update.
    /// - `actor` — Stellar address to revoke.
    ///
    /// # Returns
    /// `true` if `actor` was found and removed, `false` if `actor` was not in
    /// the authorized list.
    ///
    /// # Authorization
    /// Requires `product.owner.require_auth()`. Only the current product owner
    /// may revoke actor permissions.
    ///
    /// # Panics
    /// - `"product not found"` — if `product_id` is not registered.
    /// - `"cannot remove owner from actors"` — if attempting to remove the owner
    ///   when it would violate governance invariants.
    /// - `"removal would violate governance"` — if removal would leave insufficient
    ///   actors to meet multi-signature requirements.
    ///
    /// # Emitted Events
    /// Publishes an `("actor_removed", product_id)` event with the removed actor address.
    pub fn remove_authorized_actor(env: Env, product_id: String, actor: Address) -> bool {
        let mut product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        product.owner.require_auth();

        // Governance safeguard: prevent removing owner from actors if multi-sig is enabled
        if actor == product.owner && product.required_signatures > 1 {
            panic!("cannot remove owner from actors");
        }

        // Find and remove the actor
        let mut found = false;
        let mut new_actors = Vec::new(&env);
        for i in 0..product.authorized_actors.len() {
            let current_actor = product.authorized_actors.get(i).unwrap();
            if current_actor != actor {
                new_actors.push_back(current_actor);
            } else {
                found = true;
            }
        }

        // Governance safeguard: ensure sufficient actors remain for multi-sig
        if product.required_signatures > 1 {
            // Count total authorized entities (owner + actors)
            let total_authorized = 1 + new_actors.len() as u32; // owner + remaining actors
            if total_authorized < product.required_signatures {
                panic!("removal would violate governance");
            }
        }

        product.authorized_actors = new_actors;
        env.storage()
            .persistent()
            .set(&DataKey::Product(product_id.clone()), &product);

        // Emit event
        if found {
            env.events().publish(
                (Symbol::new(&env, "actor_removed"), product_id),
                actor,
            );
        }

        found
    }

    /// Update the mutable metadata fields of a product.
    ///
    /// Only `name` and `origin` can be changed. The `id`, `owner`,
    /// `timestamp`, and `authorized_actors` fields are immutable through this
    /// function.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — ID of the product to update.
    /// - `name` — New human-readable product name.
    /// - `origin` — New origin string.
    ///
    /// # Returns
    /// The updated [`Product`] struct.
    ///
    /// # Authorization
    /// Requires `product.owner.require_auth()`. Only the current product owner
    /// may update metadata.
    ///
    /// # Panics
    /// - `"product not found"` — if `product_id` is not registered.
    ///
    /// # Emitted Events
    /// Publishes a `("product_updated", product_id)` event with the updated
    /// [`Product`] struct as the event body.
    pub fn update_product_metadata(
        env: Env,
        product_id: String,
        name: String,
        origin: String,
    ) -> Product {
        let mut product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        product.owner.require_auth();

        product.name = name;
        product.origin = origin;

        env.storage()
            .persistent()
            .set(&DataKey::Product(product_id.clone()), &product);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "product_updated"), product_id),
            product.clone(),
        );

        product
    }

    /// Return the list of addresses authorised to add events for a product.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — ID of the product to query.
    ///
    /// # Returns
    /// A `Vec<Address>` of authorized actors. Returns an empty vector if the
    /// product does not exist or has no authorized actors.
    ///
    /// # Authorization
    /// None — this is a read-only function.
    ///
    /// # Panics
    /// Does not panic.
    pub fn get_authorized_actors(env: Env, product_id: String) -> Vec<Address> {
        env.storage()
            .persistent()
            .get::<DataKey, Product>(&DataKey::Product(product_id))
            .map(|p| p.authorized_actors)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Return the total number of products registered on this contract.
    ///
    /// The count is a monotonically increasing counter; it is never decremented
    /// even if products were to be removed (which is not currently supported).
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    ///
    /// # Returns
    /// A `u64` count. Returns `0` if no products have been registered.
    ///
    /// # Authorization
    /// None — this is a read-only function.
    ///
    /// # Panics
    /// Does not panic.
    pub fn get_product_count(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::ProductCount)
            .unwrap_or(0)
    }

    /// Return a paginated slice of product IDs in registration order.
    ///
    /// Uses the [`DataKey::ProductIndex`] mapping to look up IDs by their
    /// sequential insertion index, enabling efficient pagination without
    /// iterating all storage keys.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `offset` — Zero-based index of the first product to return.
    /// - `limit` — Maximum number of product IDs to return.
    ///
    /// # Returns
    /// A `Vec<String>` of product IDs. Returns an empty vector if `offset` is
    /// beyond the total count or no products are registered.
    ///
    /// # Authorization
    /// None — this is a read-only function.
    ///
    /// # Panics
    /// Does not panic.
    ///
    /// # Example
    /// ```text
    /// // Fetch the first page of 10 products
    /// list_products(env, 0, 10)
    ///
    /// // Fetch the second page
    /// list_products(env, 10, 10)
    /// ```
    pub fn list_products(env: Env, offset: u64, limit: u64) -> Vec<String> {
        let count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::ProductCount)
            .unwrap_or(0);

        let mut products = Vec::new(&env);
        let end = core::cmp::min(offset + limit, count);

        for i in offset..end {
            if let Some(product_id) =
                env.storage()
                    .persistent()
                    .get::<DataKey, String>(&DataKey::ProductIndex(i))
            {
                products.push_back(product_id);
            }
        }

        products
    }

    /// Approve a pending event for a high-value product.
    ///
    /// For products with `required_signatures > 1`, events are staged as pending
    /// until the required number of approvals are received. This function allows
    /// authorized actors to approve a pending event.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — ID of the product.
    /// - `event_index` — Index of the pending event in the pending queue.
    /// - `approver` — Address of the actor approving the event.
    ///
    /// # Returns
    /// `true` if the event was finalized (all signatures received), `false` if
    /// more approvals are needed.
    ///
    /// # Authorization
    /// Requires `approver.require_auth()`. The approver must be the owner or
    /// an authorized actor.
    ///
    /// # Panics
    /// - `"product not found"` — if `product_id` is not registered.
    /// - `"approver is not authorized"` — if approver is not owner or actor.
    /// - `"no pending events"` — if there are no pending events.
    /// - `"event index out of bounds"` — if `event_index` is invalid.
    pub fn approve_event(
        env: Env,
        product_id: String,
        event_index: u32,
        approver: Address,
    ) -> bool {
        let product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        let is_owner = product.owner == approver;
        let is_actor = product.authorized_actors.contains(&approver);
        if !is_owner && !is_actor {
            panic!("approver is not authorized");
        }
        approver.require_auth();

        let mut pending: Vec<PendingEvent> = env
            .storage()
            .persistent()
            .get(&DataKey::PendingEvents(product_id.clone()))
            .expect("no pending events");

        if event_index >= pending.len() as u32 {
            panic!("event index out of bounds");
        }

        let mut pending_event = pending.get(event_index).unwrap().clone();

        // Check if approver already approved
        if !pending_event.approvals.contains(&approver) {
            pending_event.approvals.push_back(approver.clone());
        }

        // Check if we have enough approvals
        let is_finalized = pending_event.approvals.len() as u32 >= pending_event.required_signatures;

        if is_finalized {
            // Move event to finalized events
            let mut events: Vec<TrackingEvent> = env
                .storage()
                .persistent()
                .get(&DataKey::Events(product_id.clone()))
                .unwrap_or_else(|| Vec::new(&env));

            events.push_back(pending_event.event.clone());
            env.storage()
                .persistent()
                .set(&DataKey::Events(product_id.clone()), &events);

            // Remove from pending
            pending.remove(event_index);
            if pending.len() > 0 {
                env.storage()
                    .persistent()
                    .set(&DataKey::PendingEvents(product_id.clone()), &pending);
            } else {
                env.storage()
                    .persistent()
                    .remove(&DataKey::PendingEvents(product_id.clone()));
            }

            // Emit finalized event
            env.events().publish(
                (
                    Symbol::new(&env, "event_finalized"),
                    product_id,
                    pending_event.event.event_type.clone(),
                ),
                pending_event.event,
            );

            true
        } else {
            // Update pending event with new approval
            pending.set(event_index, pending_event);
            env.storage()
                .persistent()
                .set(&DataKey::PendingEvents(product_id), &pending);
            false
        }
    }

    /// Reject a pending event for a high-value product.
    ///
    /// Removes a pending event from the approval queue without finalizing it.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — ID of the product.
    /// - `event_index` — Index of the pending event to reject.
    /// - `rejector` — Address of the actor rejecting the event.
    ///
    /// # Returns
    /// `true` on success.
    ///
    /// # Authorization
    /// Requires `rejector.require_auth()`. The rejector must be the owner.
    ///
    /// # Panics
    /// - `"product not found"` — if `product_id` is not registered.
    /// - `"only owner can reject"` — if rejector is not the owner.
    /// - `"no pending events"` — if there are no pending events.
    /// - `"event index out of bounds"` — if `event_index` is invalid.
    pub fn reject_event(
        env: Env,
        product_id: String,
        event_index: u32,
        rejector: Address,
    ) -> bool {
        let product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        if product.owner != rejector {
            panic!("only owner can reject");
        }
        rejector.require_auth();

        let mut pending: Vec<PendingEvent> = env
            .storage()
            .persistent()
            .get(&DataKey::PendingEvents(product_id.clone()))
            .expect("no pending events");

        if event_index >= pending.len() as u32 {
            panic!("event index out of bounds");
        }

        let rejected_event = pending.get(event_index).unwrap().clone();

        // Remove from pending
        pending.remove(event_index);
        if pending.len() > 0 {
            env.storage()
                .persistent()
                .set(&DataKey::PendingEvents(product_id.clone()), &pending);
        } else {
            env.storage()
                .persistent()
                .remove(&DataKey::PendingEvents(product_id.clone()));
        }

        // Emit rejection event
        env.events().publish(
            (Symbol::new(&env, "event_rejected"), product_id),
            rejected_event.event,
        );

        true
    }

    /// Get pending events for a product.
    ///
    /// Returns all events awaiting multi-signature approval.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — ID of the product.
    ///
    /// # Returns
    /// A `Vec<PendingEvent>` containing all pending events for the product.
    ///
    /// # Authorization
    /// None — this is a read-only function.
    pub fn get_pending_events(env: Env, product_id: String) -> Vec<PendingEvent> {
        env.storage()
            .persistent()
            .get(&DataKey::PendingEvents(product_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Deactivate a product, preventing new tracking events.
    ///
    /// Sets the `active` field to `false`. Deactivated products remain readable
    /// but cannot receive new tracking events until reactivated.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — ID of the product to deactivate.
    ///
    /// # Returns
    /// `true` on success.
    ///
    /// # Authorization
    /// Requires `product.owner.require_auth()`. Only the current product owner
    /// may deactivate a product.
    ///
    /// # Panics
    /// - `"product not found"` — if `product_id` is not registered.
    /// - `"product already inactive"` — if the product is already deactivated.
    ///
    /// # Emitted Events
    /// Publishes a `("product_deactivated", product_id)` event.
    pub fn deactivate_product(env: Env, product_id: String) -> bool {
        let mut product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        product.owner.require_auth();

        if !product.active {
            panic!("product already inactive");
        }

        product.active = false;
        env.storage()
            .persistent()
            .set(&DataKey::Product(product_id.clone()), &product);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "product_deactivated"), product_id),
            product,
        );

        true
    }

    /// Reactivate a deactivated product.
    ///
    /// Sets the `active` field to `true`, allowing new tracking events again.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — ID of the product to reactivate.
    ///
    /// # Returns
    /// `true` on success.
    ///
    /// # Authorization
    /// Requires `product.owner.require_auth()`. Only the current product owner
    /// may reactivate a product.
    ///
    /// # Panics
    /// - `"product not found"` — if `product_id` is not registered.
    /// - `"product already active"` — if the product is already active.
    ///
    /// # Emitted Events
    /// Publishes a `("product_reactivated", product_id)` event.
    pub fn reactivate_product(env: Env, product_id: String) -> bool {
        let mut product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        product.owner.require_auth();

        if product.active {
            panic!("product already active");
        }

        product.active = true;
        env.storage()
            .persistent()
            .set(&DataKey::Product(product_id.clone()), &product);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "product_reactivated"), product_id),
            product,
        );

        true
    }

    /// Return a paginated slice of product IDs filtered by active status.
    ///
    /// Similar to [`Self::list_products`] but allows filtering by lifecycle state.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `offset` — Zero-based index of the first product to return.
    /// - `limit` — Maximum number of product IDs to return.
    /// - `active_only` — If `true`, only return active products. If `false`, return all products.
    ///
    /// # Returns
    /// A `Vec<String>` of product IDs matching the filter criteria.
    ///
    /// # Authorization
    /// None — this is a read-only function.
    ///
    /// # Panics
    /// Does not panic.
    pub fn list_products_filtered(
        env: Env,
        offset: u64,
        limit: u64,
        active_only: bool,
    ) -> Vec<String> {
        let count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::ProductCount)
            .unwrap_or(0);

        let mut products = Vec::new(&env);
        let mut collected = 0u64;
        let mut skipped = 0u64;

        for i in 0..count {
            if collected >= limit {
                break;
            }

            if let Some(product_id) = env
                .storage()
                .persistent()
                .get::<DataKey, String>(&DataKey::ProductIndex(i))
            {
                if let Some(product) = env
                    .storage()
                    .persistent()
                    .get::<DataKey, Product>(&DataKey::Product(product_id.clone()))
                {
                    // Apply filter
                    if !active_only || product.active {
                        if skipped >= offset {
                            products.push_back(product_id);
                            collected += 1;
                        } else {
                            skipped += 1;
                        }
                    }
                }
            }
        }

        products
    }

    /// Check if a product is active.
    ///
    /// # Parameters
    /// - `env` — Soroban execution environment.
    /// - `product_id` — ID of the product to check.
    ///
    /// # Returns
    /// `true` if the product exists and is active, `false` otherwise.
    ///
    /// # Authorization
    /// None — this is a read-only function.
    ///
    /// # Panics
    /// Does not panic.
    pub fn is_product_active(env: Env, product_id: String) -> bool {
        env.storage()
            .persistent()
            .get::<DataKey, Product>(&DataKey::Product(product_id))
            .map(|p| p.active)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_product_deactivation_lifecycle() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-001");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");

        // Register product
        env.mock_all_auths();
        let product = client.register_product(&product_id, &name, &origin, &owner, &1);
        assert_eq!(product.active, true);

        // Deactivate product
        client.deactivate_product(&product_id);
        let product = client.get_product(&product_id);
        assert_eq!(product.active, false);

        // Verify product is inactive
        assert_eq!(client.is_product_active(&product_id), false);

        // Reactivate product
        client.reactivate_product(&product_id);
        let product = client.get_product(&product_id);
        assert_eq!(product.active, true);
        assert_eq!(client.is_product_active(&product_id), true);
    }

    #[test]
    #[should_panic(expected = "product is not active")]
    fn test_cannot_add_event_to_inactive_product() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-002");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");
        let location = String::from_str(&env, "Test Location");
        let event_type = String::from_str(&env, "HARVEST");
        let metadata = String::from_str(&env, "{}");

        env.mock_all_auths();

        // Register and deactivate product
        client.register_product(&product_id, &name, &origin, &owner, &1);
        client.deactivate_product(&product_id);

        // Try to add event to inactive product - should panic
        client.add_tracking_event(&product_id, &owner, &location, &event_type, &metadata);
    }

    #[test]
    fn test_list_products_filtered() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        env.mock_all_auths();

        // Register 5 products
        for i in 1..=5 {
            let product_id = String::from_str(&env, &format!("product-{:03}", i));
            let name = String::from_str(&env, &format!("Product {}", i));
            let origin = String::from_str(&env, "Test Origin");
            client.register_product(&product_id, &name, &origin, &owner, &1);
        }

        // Deactivate products 2 and 4
        client.deactivate_product(&String::from_str(&env, "product-002"));
        client.deactivate_product(&String::from_str(&env, "product-004"));

        // List all products
        let all_products = client.list_products_filtered(&0, &10, &false);
        assert_eq!(all_products.len(), 5);

        // List only active products
        let active_products = client.list_products_filtered(&0, &10, &true);
        assert_eq!(active_products.len(), 3);
    }

    #[test]
    #[should_panic(expected = "product already inactive")]
    fn test_cannot_deactivate_inactive_product() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-003");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");

        env.mock_all_auths();

        client.register_product(&product_id, &name, &origin, &owner, &1);
        client.deactivate_product(&product_id);
        
        // Try to deactivate again - should panic
        client.deactivate_product(&product_id);
    }

    #[test]
    #[should_panic(expected = "product already active")]
    fn test_cannot_reactivate_active_product() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-004");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");

        env.mock_all_auths();

        client.register_product(&product_id, &name, &origin, &owner, &1);
        
        // Try to reactivate an already active product - should panic
        client.reactivate_product(&product_id);
    }
}

#[cfg(test)]
mod ownership_transfer_tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_ownership_transfer_success() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let new_owner = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-001");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");

        env.mock_all_auths();

        // Register product
        client.register_product(&product_id, &name, &origin, &owner, &1);

        // Transfer ownership
        let result = client.transfer_ownership(&product_id, &new_owner);
        assert_eq!(result, true);

        // Verify new owner
        let product = client.get_product(&product_id);
        assert_eq!(product.owner, new_owner);
    }

    #[test]
    #[should_panic(expected = "cannot transfer to current owner")]
    fn test_cannot_transfer_to_current_owner() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-002");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");

        env.mock_all_auths();

        // Register product
        client.register_product(&product_id, &name, &origin, &owner, &1);

        // Try to transfer to same owner - should panic
        client.transfer_ownership(&product_id, &owner);
    }

    #[test]
    fn test_ownership_transfer_chain() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner1 = Address::generate(&env);
        let owner2 = Address::generate(&env);
        let owner3 = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-003");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");

        env.mock_all_auths();

        // Register product with owner1
        client.register_product(&product_id, &name, &origin, &owner1, &1);

        // Transfer to owner2
        client.transfer_ownership(&product_id, &owner2);
        let product = client.get_product(&product_id);
        assert_eq!(product.owner, owner2);

        // Transfer to owner3
        client.transfer_ownership(&product_id, &owner3);
        let product = client.get_product(&product_id);
        assert_eq!(product.owner, owner3);
    }

    #[test]
    #[should_panic(expected = "product not found")]
    fn test_transfer_nonexistent_product() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let new_owner = Address::generate(&env);
        let product_id = String::from_str(&env, "nonexistent-product");

        env.mock_all_auths();

        // Try to transfer nonexistent product - should panic
        client.transfer_ownership(&product_id, &new_owner);
    }
}

#[cfg(test)]
mod governance_safeguard_tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    #[should_panic(expected = "actor already authorized")]
    fn test_cannot_add_duplicate_actor() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let actor = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-001");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");

        env.mock_all_auths();

        // Register product
        client.register_product(&product_id, &name, &origin, &owner, &1);

        // Add actor
        client.add_authorized_actor(&product_id, &actor);

        // Try to add same actor again - should panic
        client.add_authorized_actor(&product_id, &actor);
    }

    #[test]
    #[should_panic(expected = "cannot remove owner from actors")]
    fn test_cannot_remove_owner_from_multisig_actors() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-002");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");

        env.mock_all_auths();

        // Register product with multi-sig
        client.register_product(&product_id, &name, &origin, &owner, &2);

        // Add owner as actor
        client.add_authorized_actor(&product_id, &owner);

        // Try to remove owner from actors - should panic
        client.remove_authorized_actor(&product_id, &owner);
    }

    #[test]
    #[should_panic(expected = "removal would violate governance")]
    fn test_cannot_remove_actor_below_threshold() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let actor1 = Address::generate(&env);
        let actor2 = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-003");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");

        env.mock_all_auths();

        // Register product requiring 3 signatures
        client.register_product(&product_id, &name, &origin, &owner, &3);

        // Add 2 actors (total authorized: owner + 2 actors = 3)
        client.add_authorized_actor(&product_id, &actor1);
        client.add_authorized_actor(&product_id, &actor2);

        // Try to remove an actor - would leave only 2 authorized (owner + 1 actor)
        // This violates the requirement of 3 signatures - should panic
        client.remove_authorized_actor(&product_id, &actor1);
    }

    #[test]
    fn test_can_remove_actor_above_threshold() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let actor1 = Address::generate(&env);
        let actor2 = Address::generate(&env);
        let actor3 = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-004");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");

        env.mock_all_auths();

        // Register product requiring 3 signatures
        client.register_product(&product_id, &name, &origin, &owner, &3);

        // Add 3 actors (total authorized: owner + 3 actors = 4)
        client.add_authorized_actor(&product_id, &actor1);
        client.add_authorized_actor(&product_id, &actor2);
        client.add_authorized_actor(&product_id, &actor3);

        // Remove one actor - still leaves 3 authorized (owner + 2 actors)
        // This meets the requirement of 3 signatures - should succeed
        let result = client.remove_authorized_actor(&product_id, &actor1);
        assert_eq!(result, true);

        // Verify actor was removed
        let actors = client.get_authorized_actors(&product_id);
        assert_eq!(actors.len(), 2);
    }

    #[test]
    fn test_can_remove_actor_single_sig() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let actor = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-005");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");

        env.mock_all_auths();

        // Register product with single signature (no multi-sig)
        client.register_product(&product_id, &name, &origin, &owner, &1);

        // Add actor
        client.add_authorized_actor(&product_id, &actor);

        // Remove actor - should succeed since no multi-sig governance
        let result = client.remove_authorized_actor(&product_id, &actor);
        assert_eq!(result, true);

        // Verify actor was removed
        let actors = client.get_authorized_actors(&product_id);
        assert_eq!(actors.len(), 0);
    }

    #[test]
    fn test_governance_invariant_after_ownership_transfer() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let owner1 = Address::generate(&env);
        let owner2 = Address::generate(&env);
        let actor = Address::generate(&env);
        let product_id = String::from_str(&env, "test-product-006");
        let name = String::from_str(&env, "Test Product");
        let origin = String::from_str(&env, "Test Origin");

        env.mock_all_auths();

        // Register product with multi-sig
        client.register_product(&product_id, &name, &origin, &owner1, &2);

        // Add actor
        client.add_authorized_actor(&product_id, &actor);

        // Transfer ownership
        client.transfer_ownership(&product_id, &owner2);

        // Verify governance still intact - should still have 2 authorized (new owner + actor)
        let product = client.get_product(&product_id);
        assert_eq!(product.owner, owner2);
        assert_eq!(product.authorized_actors.len(), 1);
    }
}
