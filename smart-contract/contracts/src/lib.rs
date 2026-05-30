#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec, Symbol};

// ── Data models ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct Product {
    pub id: String,
    pub name: String,
    pub origin: String,
    pub owner: Address,
    pub timestamp: u64,
    pub authorized_actors: Vec<Address>,
}

#[contracttype]
#[derive(Clone)]
pub struct TrackingEvent {
    pub product_id: String,
    pub location: String,
    pub actor: Address,
    pub timestamp: u64,
    pub event_type: String, // HARVEST | PROCESSING | SHIPPING | RETAIL
    pub metadata: String,   // JSON string
}

// ── Alert / Recall models ─────────────────────────────────────────────────────

/// Severity levels for recall alerts (stored as u32 for compact on-chain representation).
/// 0 = LOW, 1 = MEDIUM, 2 = HIGH, 3 = CRITICAL
#[contracttype]
#[derive(Clone, PartialEq)]
pub enum AlertSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum AlertStatus {
    Active,
    Resolved,
}

#[contracttype]
#[derive(Clone)]
pub struct RecallAlert {
    pub product_id: String,
    pub severity: AlertSeverity,
    pub message: String,
    pub issued_by: Address,
    pub issued_at: u64,
    pub status: AlertStatus,
    pub resolved_at: u64,   // 0 when not resolved
    pub resolved_by: String, // empty string when not resolved
}

// ── Certificate / Revocation models ──────────────────────────────────────────

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum CertificateStatus {
    Valid,
    Revoked,
    Expired,
}

#[contracttype]
#[derive(Clone)]
pub struct Certificate {
    pub id: String,
    pub product_id: String,
    pub cert_type: String,   // e.g. "ORGANIC", "FAIR_TRADE", "ISO_9001"
    pub issued_by: Address,
    pub issued_at: u64,
    pub expires_at: u64,     // 0 = no expiry
    pub metadata: String,    // JSON string
    pub status: CertificateStatus,
    pub revoked_at: u64,     // 0 when not revoked
    pub revoked_by: String,  // empty string when not revoked
    pub revocation_reason: String,
}

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Product(String),
    Events(String),
    ProductCount,
    ProductIndex(u64),
    // Recall alerts keyed by product_id
    RecallAlert(String),
    // Certificates keyed by cert_id
    Certificate(String),
    // Index: product_id → Vec<cert_id>
    ProductCerts(String),
    // Revocation registry: cert_id → bool (true = revoked)
    Revoked(String),
    // Global cert count for indexing
    CertCount,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct SupplyLinkContract;

#[contractimpl]
impl SupplyLinkContract {
    /// Register a new product on-chain.
    pub fn register_product(
        env: Env,
        id: String,
        name: String,
        origin: String,
        owner: Address,
    ) -> Product {
        owner.require_auth();
        let product = Product {
            id: id.clone(),
            name,
            origin,
            owner,
            timestamp: env.ledger().timestamp(),
            authorized_actors: Vec::new(&env),
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
            product.clone()
        );
        
        product
    }

    /// Add a tracking event for a product.
    /// `caller` must be the product owner or an address in `authorized_actors`.
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

        // Verify caller is owner or an authorized actor before requiring auth
        let is_owner = product.owner == caller;
        let is_actor = product.authorized_actors.contains(&caller);
        if !is_owner && !is_actor {
            panic!("caller is not authorized");
        }
        caller.require_auth();

        let event = TrackingEvent {
            product_id: product_id.clone(),
            location,
            actor: caller,
            timestamp: env.ledger().timestamp(),
            event_type: event_type.clone(),
            metadata,
        };

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
            event.clone()
        );

        event
    }

    /// Get product details.
    pub fn get_product(env: Env, id: String) -> Product {
        env.storage()
            .persistent()
            .get(&DataKey::Product(id))
            .expect("product not found")
    }

    /// Get all tracking events for a product.
    pub fn get_tracking_events(env: Env, product_id: String) -> Vec<TrackingEvent> {
        env.storage()
            .persistent()
            .get(&DataKey::Events(product_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Returns true if a product with the given id is registered, false otherwise.
    pub fn product_exists(env: Env, id: String) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Product(id))
    }

    /// Returns the number of tracking events recorded for `product_id`.
    /// Returns 0 if the product has no events or does not exist.
    pub fn get_events_count(env: Env, product_id: String) -> u32 {
        env.storage()
            .persistent()
            .get::<DataKey, Vec<TrackingEvent>>(&DataKey::Events(product_id))
            .map(|v| v.len())
            .unwrap_or(0)
    }

    /// Transfer product ownership.
    pub fn transfer_ownership(env: Env, product_id: String, new_owner: Address) -> bool {
        let mut product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        product.owner.require_auth();
        product.owner = new_owner.clone();
        env.storage()
            .persistent()
            .set(&DataKey::Product(product_id.clone()), &product);
        
        // Emit event
        env.events().publish(
            (Symbol::new(&env, "ownership_transferred"), product_id),
            new_owner
        );
        
        true
    }

    /// Authorize an actor to add events for a product.
    pub fn add_authorized_actor(env: Env, product_id: String, actor: Address) -> bool {
        let mut product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        product.owner.require_auth();
        product.authorized_actors.push_back(actor.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Product(product_id.clone()), &product);
        
        // Emit event
        env.events().publish(
            (Symbol::new(&env, "actor_authorized"), product_id),
            actor
        );
        
        true
    }

    /// Remove an authorized actor from a product.
    /// Only the product owner may call this.
    /// Returns true if the actor was removed, false if they were not in the list.
    pub fn remove_authorized_actor(env: Env, product_id: String, actor: Address) -> bool {
        let mut product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        product.owner.require_auth();
        
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
        
        product.authorized_actors = new_actors;
        env.storage()
            .persistent()
            .set(&DataKey::Product(product_id), &product);
        
        found
    }

    /// Update product metadata (name and origin).
    /// Only the product owner may call this.
    /// Does not allow changing id, owner, or timestamp.
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
            product.clone()
        );
        
        product
    }

    /// Get the list of authorized actors for a product.
    /// Returns an empty vec for unknown product IDs.
    pub fn get_authorized_actors(env: Env, product_id: String) -> Vec<Address> {
        env.storage()
            .persistent()
            .get::<DataKey, Product>(&DataKey::Product(product_id))
            .map(|p| p.authorized_actors)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get the total number of registered products.
    pub fn get_product_count(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::ProductCount)
            .unwrap_or(0)
    }

    /// List products with pagination.
    /// Returns a vector of product IDs from offset to offset + limit.
    pub fn list_products(env: Env, offset: u64, limit: u64) -> Vec<String> {
        let count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::ProductCount)
            .unwrap_or(0);
        
        let mut products = Vec::new(&env);
        let end = core::cmp::min(offset + limit, count);
        
        for i in offset..end {
            if let Some(product_id) = env.storage().persistent().get::<DataKey, String>(&DataKey::ProductIndex(i)) {
                products.push_back(product_id);
            }
        }
        
        products
    }

    // ── Recall / Emergency Alert methods ─────────────────────────────────────

    /// Issue a recall alert for a product.
    /// Only the product owner or an authorized actor may issue a recall.
    /// Severity: 0=Low, 1=Medium, 2=High, 3=Critical
    pub fn issue_recall(
        env: Env,
        product_id: String,
        caller: Address,
        severity: AlertSeverity,
        message: String,
    ) -> RecallAlert {
        let product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        let is_owner = product.owner == caller;
        let is_actor = product.authorized_actors.contains(&caller);
        if !is_owner && !is_actor {
            panic!("caller is not authorized to issue recall");
        }
        caller.require_auth();

        let alert = RecallAlert {
            product_id: product_id.clone(),
            severity: severity.clone(),
            message,
            issued_by: caller,
            issued_at: env.ledger().timestamp(),
            status: AlertStatus::Active,
            resolved_at: 0,
            resolved_by: String::from_str(&env, ""),
        };

        env.storage()
            .persistent()
            .set(&DataKey::RecallAlert(product_id.clone()), &alert);

        env.events().publish(
            (Symbol::new(&env, "recall_issued"), product_id),
            alert.clone(),
        );

        alert
    }

    /// Resolve (clear) an active recall alert.
    /// Only the product owner may resolve a recall.
    pub fn resolve_recall(
        env: Env,
        product_id: String,
        caller: Address,
    ) -> RecallAlert {
        let product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        if product.owner != caller {
            panic!("only the product owner can resolve a recall");
        }
        caller.require_auth();

        let mut alert: RecallAlert = env
            .storage()
            .persistent()
            .get(&DataKey::RecallAlert(product_id.clone()))
            .expect("no recall alert found for this product");

        if alert.status == AlertStatus::Resolved {
            panic!("recall is already resolved");
        }

        alert.status = AlertStatus::Resolved;
        alert.resolved_at = env.ledger().timestamp();
        // Store caller address as string for resolved_by
        alert.resolved_by = String::from_str(&env, "resolved");

        env.storage()
            .persistent()
            .set(&DataKey::RecallAlert(product_id.clone()), &alert);

        env.events().publish(
            (Symbol::new(&env, "recall_resolved"), product_id),
            alert.clone(),
        );

        alert
    }

    /// Get the current recall alert for a product, if any.
    /// Returns None (panics with "no recall") if no alert exists.
    pub fn get_recall(env: Env, product_id: String) -> RecallAlert {
        env.storage()
            .persistent()
            .get(&DataKey::RecallAlert(product_id))
            .expect("no recall alert found for this product")
    }

    /// Returns true if the product has an active recall alert.
    pub fn has_active_recall(env: Env, product_id: String) -> bool {
        if let Some(alert) = env
            .storage()
            .persistent()
            .get::<DataKey, RecallAlert>(&DataKey::RecallAlert(product_id))
        {
            alert.status == AlertStatus::Active
        } else {
            false
        }
    }

    // ── Certificate / Revocation Registry methods ─────────────────────────────

    /// Issue a certificate for a product.
    /// Any authorized actor or the product owner may issue a certificate.
    pub fn issue_certificate(
        env: Env,
        cert_id: String,
        product_id: String,
        caller: Address,
        cert_type: String,
        expires_at: u64,
        metadata: String,
    ) -> Certificate {
        let product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        let is_owner = product.owner == caller;
        let is_actor = product.authorized_actors.contains(&caller);
        if !is_owner && !is_actor {
            panic!("caller is not authorized to issue certificate");
        }
        caller.require_auth();

        // Ensure cert_id is unique
        if env
            .storage()
            .persistent()
            .has(&DataKey::Certificate(cert_id.clone()))
        {
            panic!("certificate id already exists");
        }

        let cert = Certificate {
            id: cert_id.clone(),
            product_id: product_id.clone(),
            cert_type,
            issued_by: caller,
            issued_at: env.ledger().timestamp(),
            expires_at,
            metadata,
            status: CertificateStatus::Valid,
            revoked_at: 0,
            revoked_by: String::from_str(&env, ""),
            revocation_reason: String::from_str(&env, ""),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Certificate(cert_id.clone()), &cert);

        // Update product → cert index
        let mut product_certs: Vec<String> = env
            .storage()
            .persistent()
            .get(&DataKey::ProductCerts(product_id.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        product_certs.push_back(cert_id.clone());
        env.storage()
            .persistent()
            .set(&DataKey::ProductCerts(product_id.clone()), &product_certs);

        // Revocation registry: mark as NOT revoked
        env.storage()
            .persistent()
            .set(&DataKey::Revoked(cert_id.clone()), &false);

        env.events().publish(
            (Symbol::new(&env, "cert_issued"), product_id, cert_id),
            cert.clone(),
        );

        cert
    }

    /// Revoke a certificate.
    /// Only the original issuer or the product owner may revoke.
    pub fn revoke_certificate(
        env: Env,
        cert_id: String,
        caller: Address,
        reason: String,
    ) -> Certificate {
        let mut cert: Certificate = env
            .storage()
            .persistent()
            .get(&DataKey::Certificate(cert_id.clone()))
            .expect("certificate not found");

        if cert.status == CertificateStatus::Revoked {
            panic!("certificate is already revoked");
        }

        // Only the issuer or the product owner may revoke
        let product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(cert.product_id.clone()))
            .expect("product not found");

        let is_issuer = cert.issued_by == caller;
        let is_owner = product.owner == caller;
        if !is_issuer && !is_owner {
            panic!("caller is not authorized to revoke this certificate");
        }
        caller.require_auth();

        cert.status = CertificateStatus::Revoked;
        cert.revoked_at = env.ledger().timestamp();
        cert.revocation_reason = reason;
        // Store a marker string for revoked_by (address serialization)
        cert.revoked_by = String::from_str(&env, "revoked");

        env.storage()
            .persistent()
            .set(&DataKey::Certificate(cert_id.clone()), &cert);

        // Update revocation registry
        env.storage()
            .persistent()
            .set(&DataKey::Revoked(cert_id.clone()), &true);

        env.events().publish(
            (Symbol::new(&env, "cert_revoked"), cert.product_id.clone(), cert_id),
            cert.clone(),
        );

        cert
    }

    /// Get a certificate by ID.
    pub fn get_certificate(env: Env, cert_id: String) -> Certificate {
        env.storage()
            .persistent()
            .get(&DataKey::Certificate(cert_id))
            .expect("certificate not found")
    }

    /// Returns true if the certificate has been revoked.
    pub fn is_revoked(env: Env, cert_id: String) -> bool {
        env.storage()
            .persistent()
            .get::<DataKey, bool>(&DataKey::Revoked(cert_id))
            .unwrap_or(false)
    }

    /// Get all certificate IDs for a product.
    pub fn get_product_certificates(env: Env, product_id: String) -> Vec<String> {
        env.storage()
            .persistent()
            .get(&DataKey::ProductCerts(product_id))
            .unwrap_or_else(|| Vec::new(&env))
    }
}
mod tests {
    use super::*;
    use proptest::prelude::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, soroban_sdk::Address, soroban_sdk::Address, String) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let owner = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-001");
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory A"),
            &owner,
        );
        (env, contract_id, owner, product_id)
    }

    fn add_event(env: &Env, contract_id: &soroban_sdk::Address, product_id: &String, caller: &soroban_sdk::Address) {
        let client = SupplyLinkContractClient::new(env, contract_id);
        client.add_tracking_event(
            product_id,
            caller,
            &String::from_str(env, "Warehouse"),
            &String::from_str(env, "SHIPPING"),
            &String::from_str(env, "{}"),
        );
    }

    /// Req 3.1 — unknown product_id returns 0
    #[test]
    fn test_unknown_product_returns_zero() {
        let env = Env::default();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let unknown = String::from_str(&env, "does-not-exist");
        assert_eq!(client.get_events_count(&unknown), 0);
    }

    /// Req 3.2 — registered product with no events returns 0
    #[test]
    fn test_registered_product_no_events_returns_zero() {
        let (env, contract_id, _owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        assert_eq!(client.get_events_count(&product_id), 0);
    }

    /// Req 3.3 — one add_tracking_event call → count == 1
    #[test]
    fn test_one_event_returns_one() {
        let (env, contract_id, owner, product_id) = setup();
        add_event(&env, &contract_id, &product_id, &owner);
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        assert_eq!(client.get_events_count(&product_id), 1);
    }

    /// Req 3.4 — multiple add_tracking_event calls → correct count
    #[test]
    fn test_multiple_events_returns_correct_count() {
        let (env, contract_id, owner, product_id) = setup();
        for _ in 0..5 {
            add_event(&env, &contract_id, &product_id, &owner);
        }
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        assert_eq!(client.get_events_count(&product_id), 5);
    }

    /// Req 3.5 — get_events_count == get_tracking_events(...).len()
    #[test]
    fn test_count_equals_vec_len() {
        let (env, contract_id, owner, product_id) = setup();
        for _ in 0..3 {
            add_event(&env, &contract_id, &product_id, &owner);
        }
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let count = client.get_events_count(&product_id);
        let events = client.get_tracking_events(&product_id);
        assert_eq!(count, events.len());
    }

    // ── Property-based tests ─────────────────────────────────────────────────

    /// Property 1: Count equals number of added events
    /// Validates: Requirements 1.1, 1.2, 3.2, 3.3, 3.4
    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]
        #[test]
        fn prop_count_equals_n_events(
            product_id_str in "[a-z]{1,20}",
            n in 0usize..=50,
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register(SupplyLinkContract, ());
            let client = SupplyLinkContractClient::new(&env, &contract_id);
            let owner = soroban_sdk::Address::generate(&env);
            let product_id = String::from_str(&env, &product_id_str);

            client.register_product(
                &product_id,
                &String::from_str(&env, "Widget"),
                &String::from_str(&env, "Origin"),
                &owner,
            );

            for _ in 0..n {
                client.add_tracking_event(
                    &product_id,
                    &owner,
                    &String::from_str(&env, "Warehouse"),
                    &String::from_str(&env, "SHIPPING"),
                    &String::from_str(&env, "{}"),
                );
            }

            prop_assert_eq!(client.get_events_count(&product_id), n as u32);
        }
    }

    /// Property 2: Unknown product returns 0
    /// Validates: Requirements 1.3, 3.1
    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]
        #[test]
        fn prop_unknown_product_returns_zero(
            product_id_str in "[a-z]{1,20}",
        ) {
            let env = Env::default();
            let contract_id = env.register(SupplyLinkContract, ());
            let client = SupplyLinkContractClient::new(&env, &contract_id);
            let product_id = String::from_str(&env, &product_id_str);

            prop_assert_eq!(client.get_events_count(&product_id), 0);
        }
    }

    /// Property 3: Add-then-count increments by one
    /// Validates: Requirements 2.1
    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]
        #[test]
        fn prop_add_increments_count(
            product_id_str in "[a-z]{1,20}",
            n in 0usize..=50,
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register(SupplyLinkContract, ());
            let client = SupplyLinkContractClient::new(&env, &contract_id);
            let owner = soroban_sdk::Address::generate(&env);
            let product_id = String::from_str(&env, &product_id_str);

            client.register_product(
                &product_id,
                &String::from_str(&env, "Widget"),
                &String::from_str(&env, "Origin"),
                &owner,
            );

            // Add N events to establish a baseline
            for _ in 0..n {
                client.add_tracking_event(
                    &product_id,
                    &owner,
                    &String::from_str(&env, "Warehouse"),
                    &String::from_str(&env, "SHIPPING"),
                    &String::from_str(&env, "{}"),
                );
            }

            let count_before = client.get_events_count(&product_id);

            // Add one more event
            client.add_tracking_event(
                &product_id,
                &owner,
                &String::from_str(&env, "Warehouse"),
                &String::from_str(&env, "SHIPPING"),
                &String::from_str(&env, "{}"),
            );

            let count_after = client.get_events_count(&product_id);
            prop_assert_eq!(count_after, count_before + 1);
        }
    }

    // ── product_exists unit tests ────────────────────────────────────────────

    /// Req 1.2, 1.3 — unknown product returns false
    #[test]
    fn test_product_exists_returns_false_for_unknown() {
        let env = Env::default();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let id = String::from_str(&env, "does-not-exist");
        assert!(!client.product_exists(&id));
    }

    /// Req 1.1 — registered product returns true
    #[test]
    fn test_product_exists_returns_true_after_register() {
        let (env, contract_id, _owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        assert!(client.product_exists(&product_id));
    }

    // ── product_exists property-based tests ──────────────────────────────────

    /// Property: exists iff registered
    /// Validates: Requirements 1.1, 1.2, 1.3
    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]
        #[test]
        fn prop_exists_iff_registered(product_id_str in "[a-z]{1,20}") {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register(SupplyLinkContract, ());
            let client = SupplyLinkContractClient::new(&env, &contract_id);
            let owner = soroban_sdk::Address::generate(&env);
            let product_id = String::from_str(&env, &product_id_str);

            prop_assert!(!client.product_exists(&product_id));

            client.register_product(
                &product_id,
                &String::from_str(&env, "Widget"),
                &String::from_str(&env, "Origin"),
                &owner,
            );

            prop_assert!(client.product_exists(&product_id));
        }
    }

    /// Property: unregistered product always returns false
    /// Validates: Requirements 1.2, 1.3
    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]
        #[test]
        fn prop_exists_false_before_register(product_id_str in "[a-z]{1,20}") {
            let env = Env::default();
            let contract_id = env.register(SupplyLinkContract, ());
            let client = SupplyLinkContractClient::new(&env, &contract_id);
            let product_id = String::from_str(&env, &product_id_str);
            prop_assert!(!client.product_exists(&product_id));
        }
    }

    /// Property 4: Count equals vec length (consistency invariant)
    /// Validates: Requirements 2.2, 3.5
    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]
        #[test]
        fn prop_count_equals_vec_len(
            product_id_str in "[a-z]{1,20}",
            n in 0usize..=50,
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register(SupplyLinkContract, ());
            let client = SupplyLinkContractClient::new(&env, &contract_id);
            let owner = soroban_sdk::Address::generate(&env);
            let product_id = String::from_str(&env, &product_id_str);

            client.register_product(
                &product_id,
                &String::from_str(&env, "Widget"),
                &String::from_str(&env, "Origin"),
                &owner,
            );

            for _ in 0..n {
                client.add_tracking_event(
                    &product_id,
                    &owner,
                    &String::from_str(&env, "Warehouse"),
                    &String::from_str(&env, "SHIPPING"),
                    &String::from_str(&env, "{}"),
                );
            }

            let count = client.get_events_count(&product_id);
            let events = client.get_tracking_events(&product_id);
            prop_assert_eq!(count, events.len());
        }
    }

    // ── authorized-actor auth tests ──────────────────────────────────────────

    /// Req: an authorized actor (not the owner) can add an event
    #[test]
    fn test_authorized_actor_can_add_event() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let actor = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-actor-test");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );
        client.add_authorized_actor(&product_id, &actor);

        // Actor (not owner) submits an event — must succeed
        let event = client.add_tracking_event(
            &product_id,
            &actor,
            &String::from_str(&env, "Warehouse"),
            &String::from_str(&env, "SHIPPING"),
            &String::from_str(&env, "{}"),
        );
        assert_eq!(event.actor, actor);
        assert_eq!(client.get_events_count(&product_id), 1);
    }

    /// Req: an address that is neither owner nor authorized actor is rejected
    #[test]
    #[should_panic(expected = "caller is not authorized")]
    fn test_unauthorized_caller_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let stranger = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-unauth-test");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );

        env.as_contract(&contract_id, || {
            SupplyLinkContract::add_tracking_event(
                env.clone(),
                product_id.clone(),
                stranger.clone(),
                String::from_str(&env, "Warehouse"),
                String::from_str(&env, "SHIPPING"),
                String::from_str(&env, "{}"),
            );
        });
    }

    // ── remove_authorized_actor tests ──────────────────────────────────────────

    /// Test successful removal of an authorized actor
    #[test]
    fn test_remove_authorized_actor_success() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let actor = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-remove-test");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );
        client.add_authorized_actor(&product_id, &actor);
        
        // Verify actor was added
        let product = client.get_product(&product_id);
        assert_eq!(product.authorized_actors.len(), 1);
        
        // Remove the actor
        let result = client.remove_authorized_actor(&product_id, &actor);
        assert!(result);
        
        // Verify actor was removed
        let product = client.get_product(&product_id);
        assert_eq!(product.authorized_actors.len(), 0);
    }

    /// Test removal of a non-existent actor returns false
    #[test]
    fn test_remove_nonexistent_actor_returns_false() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let actor = soroban_sdk::Address::generate(&env);
        let non_existent_actor = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-remove-fail");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );
        client.add_authorized_actor(&product_id, &actor);
        
        // Try to remove an actor that was never added
        let result = client.remove_authorized_actor(&product_id, &non_existent_actor);
        assert!(!result);
        
        // Verify original actor is still there
        let product = client.get_product(&product_id);
        assert_eq!(product.authorized_actors.len(), 1);
    }

    /// Test that non-owner cannot remove authorized actors
    #[test]
    #[should_panic(expected = "Auth")]
    fn test_unauthorized_caller_cannot_remove_actor() {
        let env = Env::default();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let actor = soroban_sdk::Address::generate(&env);
        let unauthorized_caller = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-unauth-remove");

        // Register product without mock_all_auths
        env.as_contract(&contract_id, || {
            SupplyLinkContract::register_product(
                env.clone(),
                product_id.clone(),
                String::from_str(&env, "Widget"),
                String::from_str(&env, "Factory"),
                owner.clone(),
            );
            SupplyLinkContract::add_authorized_actor(
                env.clone(),
                product_id.clone(),
                actor.clone(),
            );
        });
        
        // Try to remove as unauthorized caller (should fail)
        env.as_contract(&contract_id, || {
            SupplyLinkContract::remove_authorized_actor(
                env.clone(),
                product_id.clone(),
                actor.clone(),
            );
        });
    }

    // ── get_product_count and list_products tests ──────────────────────────────

    /// Test product count starts at 0
    #[test]
    fn test_product_count_initial_zero() {
        let env = Env::default();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        assert_eq!(client.get_product_count(), 0);
    }

    /// Test product count increments on registration
    #[test]
    fn test_product_count_increments() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);

        assert_eq!(client.get_product_count(), 0);
        
        client.register_product(
            &String::from_str(&env, "prod-1"),
            &String::from_str(&env, "Widget 1"),
            &String::from_str(&env, "Factory A"),
            &owner,
        );
        assert_eq!(client.get_product_count(), 1);
        
        client.register_product(
            &String::from_str(&env, "prod-2"),
            &String::from_str(&env, "Widget 2"),
            &String::from_str(&env, "Factory B"),
            &owner,
        );
        assert_eq!(client.get_product_count(), 2);
    }

    /// Test list_products returns all products
    #[test]
    fn test_list_products_returns_all() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);

        let id1 = String::from_str(&env, "prod-1");
        let id2 = String::from_str(&env, "prod-2");
        let id3 = String::from_str(&env, "prod-3");

        client.register_product(&id1, &String::from_str(&env, "Widget 1"), &String::from_str(&env, "Factory A"), &owner);
        client.register_product(&id2, &String::from_str(&env, "Widget 2"), &String::from_str(&env, "Factory B"), &owner);
        client.register_product(&id3, &String::from_str(&env, "Widget 3"), &String::from_str(&env, "Factory C"), &owner);

        let products = client.list_products(&0, &10);
        assert_eq!(products.len(), 3);
        assert_eq!(products.get(0).unwrap(), id1);
        assert_eq!(products.get(1).unwrap(), id2);
        assert_eq!(products.get(2).unwrap(), id3);
    }

    /// Test list_products pagination with offset
    #[test]
    fn test_list_products_pagination_offset() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);

        let id1 = String::from_str(&env, "prod-1");
        let id2 = String::from_str(&env, "prod-2");
        let id3 = String::from_str(&env, "prod-3");

        client.register_product(&id1, &String::from_str(&env, "Widget 1"), &String::from_str(&env, "Factory A"), &owner);
        client.register_product(&id2, &String::from_str(&env, "Widget 2"), &String::from_str(&env, "Factory B"), &owner);
        client.register_product(&id3, &String::from_str(&env, "Widget 3"), &String::from_str(&env, "Factory C"), &owner);

        // Get products starting from index 1
        let products = client.list_products(&1, &10);
        assert_eq!(products.len(), 2);
        assert_eq!(products.get(0).unwrap(), id2);
        assert_eq!(products.get(1).unwrap(), id3);
    }

    /// Test list_products pagination with limit
    #[test]
    fn test_list_products_pagination_limit() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);

        let id1 = String::from_str(&env, "prod-1");
        let id2 = String::from_str(&env, "prod-2");
        let id3 = String::from_str(&env, "prod-3");

        client.register_product(&id1, &String::from_str(&env, "Widget 1"), &String::from_str(&env, "Factory A"), &owner);
        client.register_product(&id2, &String::from_str(&env, "Widget 2"), &String::from_str(&env, "Factory B"), &owner);
        client.register_product(&id3, &String::from_str(&env, "Widget 3"), &String::from_str(&env, "Factory C"), &owner);

        // Get only first 2 products
        let products = client.list_products(&0, &2);
        assert_eq!(products.len(), 2);
        assert_eq!(products.get(0).unwrap(), id1);
        assert_eq!(products.get(1).unwrap(), id2);
    }

    /// Test list_products with offset beyond count returns empty
    #[test]
    fn test_list_products_offset_beyond_count() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);

        client.register_product(
            &String::from_str(&env, "prod-1"),
            &String::from_str(&env, "Widget 1"),
            &String::from_str(&env, "Factory A"),
            &owner,
        );

        // Offset beyond count
        let products = client.list_products(&10, &10);
        assert_eq!(products.len(), 0);
    }

    // ── update_product_metadata tests ─────────────────────────────────────────

    /// Test successful metadata update
    #[test]
    fn test_update_product_metadata_success() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-update");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory A"),
            &owner,
        );

        let updated = client.update_product_metadata(
            &product_id,
            &String::from_str(&env, "Updated Widget"),
            &String::from_str(&env, "Factory B"),
        );

        assert_eq!(updated.name, String::from_str(&env, "Updated Widget"));
        assert_eq!(updated.origin, String::from_str(&env, "Factory B"));
        assert_eq!(updated.id, product_id);
        assert_eq!(updated.owner, owner);
    }

    /// Test that non-owner cannot update metadata
    #[test]
    #[should_panic(expected = "Auth")]
    fn test_unauthorized_caller_cannot_update_metadata() {
        let env = Env::default();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-unauth-update");

        // Register product without mock_all_auths
        env.as_contract(&contract_id, || {
            SupplyLinkContract::register_product(
                env.clone(),
                product_id.clone(),
                String::from_str(&env, "Widget"),
                String::from_str(&env, "Factory A"),
                owner.clone(),
            );
        });

        // Try to update as non-owner (should fail)
        env.as_contract(&contract_id, || {
            SupplyLinkContract::update_product_metadata(
                env.clone(),
                product_id.clone(),
                String::from_str(&env, "Hacked Widget"),
                String::from_str(&env, "Hacked Factory"),
            );
        });
    }

    /// Test that update preserves immutable fields
    #[test]
    fn test_update_preserves_immutable_fields() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-immutable");

        let original = client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory A"),
            &owner,
        );

        let updated = client.update_product_metadata(
            &product_id,
            &String::from_str(&env, "Updated Widget"),
            &String::from_str(&env, "Factory B"),
        );

        // Verify immutable fields are preserved
        assert_eq!(updated.id, original.id);
        assert_eq!(updated.owner, original.owner);
        assert_eq!(updated.timestamp, original.timestamp);
    }

    // ── get_authorized_actors tests ──────────────────────────────────────────

    /// Unknown product_id returns an empty vec
    #[test]
    fn test_get_authorized_actors_unknown_product_returns_empty() {
        let env = Env::default();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let unknown = String::from_str(&env, "does-not-exist");
        let actors = client.get_authorized_actors(&unknown);
        assert_eq!(actors.len(), 0);
    }

    /// Single actor added → get_authorized_actors returns that actor
    #[test]
    fn test_get_authorized_actors_single_actor() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let actor = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-single-actor");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );
        client.add_authorized_actor(&product_id, &actor);

        let actors = client.get_authorized_actors(&product_id);
        assert_eq!(actors.len(), 1);
        assert_eq!(actors.get(0).unwrap(), actor);
    }

    /// Multiple actors added → get_authorized_actors returns all of them in order
    #[test]
    fn test_get_authorized_actors_multiple_actors() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let actor1 = soroban_sdk::Address::generate(&env);
        let actor2 = soroban_sdk::Address::generate(&env);
        let actor3 = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-multi-actor");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );
        client.add_authorized_actor(&product_id, &actor1);
        client.add_authorized_actor(&product_id, &actor2);
        client.add_authorized_actor(&product_id, &actor3);

        let actors = client.get_authorized_actors(&product_id);
        assert_eq!(actors.len(), 3);
        assert_eq!(actors.get(0).unwrap(), actor1);
        assert_eq!(actors.get(1).unwrap(), actor2);
        assert_eq!(actors.get(2).unwrap(), actor3);
    }

    // ── Recall / Emergency Alert tests ───────────────────────────────────────

    /// Owner can issue a recall alert
    #[test]
    fn test_owner_can_issue_recall() {
        let (env, contract_id, owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let alert = client.issue_recall(
            &product_id,
            &owner,
            &AlertSeverity::Critical,
            &String::from_str(&env, "Contamination detected"),
        );

        assert_eq!(alert.product_id, product_id);
        assert_eq!(alert.severity, AlertSeverity::Critical);
        assert_eq!(alert.status, AlertStatus::Active);
        assert_eq!(alert.resolved_at, 0);
    }

    /// Authorized actor can issue a recall
    #[test]
    fn test_authorized_actor_can_issue_recall() {
        let (env, contract_id, _owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let actor = soroban_sdk::Address::generate(&env);
        client.add_authorized_actor(&product_id, &actor);

        let alert = client.issue_recall(
            &product_id,
            &actor,
            &AlertSeverity::High,
            &String::from_str(&env, "Safety concern"),
        );
        assert_eq!(alert.status, AlertStatus::Active);
    }

    /// Unauthorized caller cannot issue a recall
    #[test]
    #[should_panic(expected = "caller is not authorized to issue recall")]
    fn test_unauthorized_cannot_issue_recall() {
        let (env, contract_id, _owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let stranger = soroban_sdk::Address::generate(&env);

        env.as_contract(&contract_id, || {
            SupplyLinkContract::issue_recall(
                env.clone(),
                product_id.clone(),
                stranger.clone(),
                AlertSeverity::Critical,
                String::from_str(&env, "Unauthorized recall"),
            );
        });
    }

    /// has_active_recall returns true after issuing
    #[test]
    fn test_has_active_recall_after_issue() {
        let (env, contract_id, owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        assert!(!client.has_active_recall(&product_id));

        client.issue_recall(
            &product_id,
            &owner,
            &AlertSeverity::Critical,
            &String::from_str(&env, "Recall message"),
        );

        assert!(client.has_active_recall(&product_id));
    }

    /// Owner can resolve a recall
    #[test]
    fn test_owner_can_resolve_recall() {
        let (env, contract_id, owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        client.issue_recall(
            &product_id,
            &owner,
            &AlertSeverity::Medium,
            &String::from_str(&env, "Issue found"),
        );

        let resolved = client.resolve_recall(&product_id, &owner);
        assert_eq!(resolved.status, AlertStatus::Resolved);
        assert!(resolved.resolved_at > 0);
        assert!(!client.has_active_recall(&product_id));
    }

    /// Non-owner cannot resolve a recall
    #[test]
    #[should_panic(expected = "only the product owner can resolve a recall")]
    fn test_non_owner_cannot_resolve_recall() {
        let (env, contract_id, owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let actor = soroban_sdk::Address::generate(&env);
        client.add_authorized_actor(&product_id, &actor);

        client.issue_recall(
            &product_id,
            &owner,
            &AlertSeverity::High,
            &String::from_str(&env, "Issue"),
        );

        env.as_contract(&contract_id, || {
            SupplyLinkContract::resolve_recall(
                env.clone(),
                product_id.clone(),
                actor.clone(),
            );
        });
    }

    // ── Certificate / Revocation Registry tests ───────────────────────────────

    /// Owner can issue a certificate
    #[test]
    fn test_owner_can_issue_certificate() {
        let (env, contract_id, owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let cert_id = String::from_str(&env, "cert-001");

        let cert = client.issue_certificate(
            &cert_id,
            &product_id,
            &owner,
            &String::from_str(&env, "ORGANIC"),
            &0u64,
            &String::from_str(&env, "{}"),
        );

        assert_eq!(cert.id, cert_id);
        assert_eq!(cert.cert_type, String::from_str(&env, "ORGANIC"));
        assert_eq!(cert.status, CertificateStatus::Valid);
        assert_eq!(cert.revoked_at, 0);
    }

    /// is_revoked returns false for a freshly issued certificate
    #[test]
    fn test_is_revoked_false_after_issue() {
        let (env, contract_id, owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let cert_id = String::from_str(&env, "cert-002");

        client.issue_certificate(
            &cert_id,
            &product_id,
            &owner,
            &String::from_str(&env, "FAIR_TRADE"),
            &0u64,
            &String::from_str(&env, "{}"),
        );

        assert!(!client.is_revoked(&cert_id));
    }

    /// Issuer can revoke a certificate
    #[test]
    fn test_issuer_can_revoke_certificate() {
        let (env, contract_id, owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let cert_id = String::from_str(&env, "cert-003");

        client.issue_certificate(
            &cert_id,
            &product_id,
            &owner,
            &String::from_str(&env, "ISO_9001"),
            &0u64,
            &String::from_str(&env, "{}"),
        );

        let revoked = client.revoke_certificate(
            &cert_id,
            &owner,
            &String::from_str(&env, "Standards no longer met"),
        );

        assert_eq!(revoked.status, CertificateStatus::Revoked);
        assert!(revoked.revoked_at > 0);
        assert!(client.is_revoked(&cert_id));
    }

    /// Product owner can revoke a certificate issued by an actor
    #[test]
    fn test_product_owner_can_revoke_actor_certificate() {
        let (env, contract_id, owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let actor = soroban_sdk::Address::generate(&env);
        client.add_authorized_actor(&product_id, &actor);

        let cert_id = String::from_str(&env, "cert-004");
        client.issue_certificate(
            &cert_id,
            &product_id,
            &actor,
            &String::from_str(&env, "ORGANIC"),
            &0u64,
            &String::from_str(&env, "{}"),
        );

        // Owner revokes the actor's certificate
        let revoked = client.revoke_certificate(
            &cert_id,
            &owner,
            &String::from_str(&env, "Fraud detected"),
        );
        assert_eq!(revoked.status, CertificateStatus::Revoked);
        assert!(client.is_revoked(&cert_id));
    }

    /// Unauthorized caller cannot revoke a certificate
    #[test]
    #[should_panic(expected = "caller is not authorized to revoke this certificate")]
    fn test_unauthorized_cannot_revoke_certificate() {
        let (env, contract_id, owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let stranger = soroban_sdk::Address::generate(&env);
        let cert_id = String::from_str(&env, "cert-005");

        client.issue_certificate(
            &cert_id,
            &product_id,
            &owner,
            &String::from_str(&env, "ORGANIC"),
            &0u64,
            &String::from_str(&env, "{}"),
        );

        env.as_contract(&contract_id, || {
            SupplyLinkContract::revoke_certificate(
                env.clone(),
                cert_id.clone(),
                stranger.clone(),
                String::from_str(&env, "Unauthorized"),
            );
        });
    }

    /// get_product_certificates returns all cert IDs for a product
    #[test]
    fn test_get_product_certificates() {
        let (env, contract_id, owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        let cert_id1 = String::from_str(&env, "cert-a");
        let cert_id2 = String::from_str(&env, "cert-b");

        client.issue_certificate(&cert_id1, &product_id, &owner, &String::from_str(&env, "ORGANIC"), &0u64, &String::from_str(&env, "{}"));
        client.issue_certificate(&cert_id2, &product_id, &owner, &String::from_str(&env, "FAIR_TRADE"), &0u64, &String::from_str(&env, "{}"));

        let certs = client.get_product_certificates(&product_id);
        assert_eq!(certs.len(), 2);
        assert_eq!(certs.get(0).unwrap(), cert_id1);
        assert_eq!(certs.get(1).unwrap(), cert_id2);
    }

    /// Duplicate certificate ID is rejected
    #[test]
    #[should_panic(expected = "certificate id already exists")]
    fn test_duplicate_cert_id_rejected() {
        let (env, contract_id, owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let cert_id = String::from_str(&env, "cert-dup");

        client.issue_certificate(&cert_id, &product_id, &owner, &String::from_str(&env, "ORGANIC"), &0u64, &String::from_str(&env, "{}"));
        // Second call with same cert_id should panic
        client.issue_certificate(&cert_id, &product_id, &owner, &String::from_str(&env, "ORGANIC"), &0u64, &String::from_str(&env, "{}"));
    }

    /// Revoking an already-revoked certificate panics
    #[test]
    #[should_panic(expected = "certificate is already revoked")]
    fn test_double_revoke_panics() {
        let (env, contract_id, owner, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let cert_id = String::from_str(&env, "cert-double-revoke");

        client.issue_certificate(&cert_id, &product_id, &owner, &String::from_str(&env, "ORGANIC"), &0u64, &String::from_str(&env, "{}"));
        client.revoke_certificate(&cert_id, &owner, &String::from_str(&env, "First revocation"));
        // Second revocation should panic
        client.revoke_certificate(&cert_id, &owner, &String::from_str(&env, "Second revocation"));
    }
}
