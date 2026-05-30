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

/// Insurance coverage metadata for a product.
/// Stored on-chain so coverage can be independently verified.
#[contracttype]
#[derive(Clone)]
pub struct InsuranceCoverage {
    /// Unique coverage / policy identifier issued by the insurer.
    pub policy_id: String,
    /// Name of the insurance provider.
    pub provider: String,
    /// Coverage type (e.g. "CARGO", "LIABILITY", "ALL_RISK").
    pub coverage_type: String,
    /// ISO-8601 date string for when coverage begins.
    pub valid_from: String,
    /// ISO-8601 date string for when coverage expires.
    pub valid_until: String,
    /// Insured value expressed as a string (e.g. "10000 USD").
    pub insured_value: String,
    /// Address of the actor who recorded this coverage.
    pub recorded_by: Address,
    /// Ledger timestamp when this record was written.
    pub timestamp: u64,
}

/// A claim proof reference attached to a product's insurance record.
/// Stores a verifiable reference (e.g. IPFS CID, document hash) so
/// auditors can retrieve and verify the underlying claim document.
#[contracttype]
#[derive(Clone)]
pub struct ClaimProof {
    /// Unique claim identifier.
    pub claim_id: String,
    /// Content-addressable reference to the claim document (e.g. IPFS CID or SHA-256 hash).
    pub document_ref: String,
    /// Human-readable description of the claim.
    pub description: String,
    /// Claim status: "SUBMITTED" | "APPROVED" | "REJECTED" | "PENDING".
    pub status: String,
    /// Address of the actor who submitted this claim proof.
    pub submitted_by: Address,
    /// Ledger timestamp when this claim was recorded.
    pub timestamp: u64,
}

/// An immutable read-access log entry for sensitive product queries.
/// Records who accessed a product record and when, enabling audit trails.
#[contracttype]
#[derive(Clone)]
pub struct ReadAccessLog {
    /// The product that was accessed.
    pub product_id: String,
    /// Stellar address of the actor who requested the data.
    pub accessor: Address,
    /// Ledger timestamp of the access event.
    pub timestamp: u64,
    /// Purpose / context of the access (e.g. "INSURANCE_VERIFY", "AUDIT", "OWNERSHIP_CHECK").
    pub purpose: String,
}

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Product(String),
    Events(String),
    ProductCount,
    ProductIndex(u64),
    /// Stores InsuranceCoverage for a product.
    Insurance(String),
    /// Stores Vec<ClaimProof> for a product.
    Claims(String),
    /// Stores Vec<ReadAccessLog> for a product.
    ReadLogs(String),
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

    // ── Insurance coverage ────────────────────────────────────────────────────

    /// Record insurance coverage metadata for a product.
    /// Only the product owner or an authorized actor may call this.
    /// Overwrites any previously stored coverage (use add_claim_proof for claims).
    pub fn add_insurance_coverage(
        env: Env,
        product_id: String,
        caller: Address,
        policy_id: String,
        provider: String,
        coverage_type: String,
        valid_from: String,
        valid_until: String,
        insured_value: String,
    ) -> InsuranceCoverage {
        let product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        let is_owner = product.owner == caller;
        let is_actor = product.authorized_actors.contains(&caller);
        if !is_owner && !is_actor {
            panic!("caller is not authorized");
        }
        caller.require_auth();

        let coverage = InsuranceCoverage {
            policy_id: policy_id.clone(),
            provider,
            coverage_type,
            valid_from,
            valid_until,
            insured_value,
            recorded_by: caller,
            timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Insurance(product_id.clone()), &coverage);

        env.events().publish(
            (Symbol::new(&env, "insurance_added"), product_id),
            coverage.clone(),
        );

        coverage
    }

    /// Retrieve the insurance coverage record for a product.
    /// Returns None if no coverage has been recorded.
    /// Also logs this read access for audit purposes.
    pub fn get_insurance(
        env: Env,
        product_id: String,
        accessor: Address,
        purpose: String,
    ) -> Option<InsuranceCoverage> {
        // Require the accessor to authenticate so the log is attributable.
        accessor.require_auth();

        // Record the read access.
        Self::_append_read_log(&env, product_id.clone(), accessor, purpose);

        env.storage()
            .persistent()
            .get(&DataKey::Insurance(product_id))
    }

    /// Attach a claim proof reference to a product's insurance record.
    /// Only the product owner or an authorized actor may call this.
    pub fn add_claim_proof(
        env: Env,
        product_id: String,
        caller: Address,
        claim_id: String,
        document_ref: String,
        description: String,
        status: String,
    ) -> ClaimProof {
        let product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        let is_owner = product.owner == caller;
        let is_actor = product.authorized_actors.contains(&caller);
        if !is_owner && !is_actor {
            panic!("caller is not authorized");
        }
        caller.require_auth();

        let proof = ClaimProof {
            claim_id: claim_id.clone(),
            document_ref,
            description,
            status,
            submitted_by: caller,
            timestamp: env.ledger().timestamp(),
        };

        let mut claims: Vec<ClaimProof> = env
            .storage()
            .persistent()
            .get(&DataKey::Claims(product_id.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        claims.push_back(proof.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Claims(product_id.clone()), &claims);

        env.events().publish(
            (Symbol::new(&env, "claim_proof_added"), product_id, claim_id),
            proof.clone(),
        );

        proof
    }

    /// Retrieve all claim proofs for a product.
    /// Also logs this read access for audit purposes.
    pub fn get_claim_proofs(
        env: Env,
        product_id: String,
        accessor: Address,
        purpose: String,
    ) -> Vec<ClaimProof> {
        accessor.require_auth();
        Self::_append_read_log(&env, product_id.clone(), accessor, purpose);

        env.storage()
            .persistent()
            .get(&DataKey::Claims(product_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    // ── Read-access audit logging ─────────────────────────────────────────────

    /// Explicitly log a read-access event for a sensitive product record.
    /// Callers (e.g. the frontend) may call this when fetching product details
    /// for audit or verification purposes.
    pub fn log_read_access(
        env: Env,
        product_id: String,
        accessor: Address,
        purpose: String,
    ) {
        // Product must exist to prevent spam logging against arbitrary IDs.
        let exists: bool = env
            .storage()
            .persistent()
            .has(&DataKey::Product(product_id.clone()));
        if !exists {
            panic!("product not found");
        }

        accessor.require_auth();
        Self::_append_read_log(&env, product_id, accessor, purpose);
    }

    /// Retrieve read-access logs for a product.
    /// Only the product owner may query the full audit trail.
    pub fn get_read_logs(
        env: Env,
        product_id: String,
        caller: Address,
    ) -> Vec<ReadAccessLog> {
        let product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        product.owner.require_auth();
        // Verify the caller is actually the owner.
        if product.owner != caller {
            panic!("only the product owner may view audit logs");
        }

        env.storage()
            .persistent()
            .get(&DataKey::ReadLogs(product_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Internal helper: append a ReadAccessLog entry.
    fn _append_read_log(env: &Env, product_id: String, accessor: Address, purpose: String) {
        let log = ReadAccessLog {
            product_id: product_id.clone(),
            accessor,
            timestamp: env.ledger().timestamp(),
            purpose,
        };

        let mut logs: Vec<ReadAccessLog> = env
            .storage()
            .persistent()
            .get(&DataKey::ReadLogs(product_id.clone()))
            .unwrap_or_else(|| Vec::new(env));

        logs.push_back(log.clone());
        env.storage()
            .persistent()
            .set(&DataKey::ReadLogs(product_id.clone()), &logs);

        env.events().publish(
            (Symbol::new(env, "read_access_logged"), product_id),
            log,
        );
    }
}

#[cfg(test)]
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

    // ── Insurance coverage tests ──────────────────────────────────────────────

    /// Owner can add insurance coverage and retrieve it.
    #[test]
    fn test_add_and_get_insurance_coverage() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-ins-001");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Coffee Beans"),
            &String::from_str(&env, "Ethiopia"),
            &owner,
        );

        let coverage = client.add_insurance_coverage(
            &product_id,
            &owner,
            &String::from_str(&env, "POL-2024-001"),
            &String::from_str(&env, "Lloyd's of London"),
            &String::from_str(&env, "CARGO"),
            &String::from_str(&env, "2024-01-01"),
            &String::from_str(&env, "2025-01-01"),
            &String::from_str(&env, "50000 USD"),
        );

        assert_eq!(coverage.policy_id, String::from_str(&env, "POL-2024-001"));
        assert_eq!(coverage.provider, String::from_str(&env, "Lloyd's of London"));
        assert_eq!(coverage.coverage_type, String::from_str(&env, "CARGO"));
        assert_eq!(coverage.recorded_by, owner);

        // Retrieve via get_insurance — also logs the read
        let retrieved = client.get_insurance(
            &product_id,
            &owner,
            &String::from_str(&env, "AUDIT"),
        );
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.policy_id, String::from_str(&env, "POL-2024-001"));
    }

    /// Authorized actor (not owner) can add insurance coverage.
    #[test]
    fn test_authorized_actor_can_add_insurance() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let actor = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-ins-actor");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );
        client.add_authorized_actor(&product_id, &actor);

        let coverage = client.add_insurance_coverage(
            &product_id,
            &actor,
            &String::from_str(&env, "POL-ACTOR-001"),
            &String::from_str(&env, "Allianz"),
            &String::from_str(&env, "ALL_RISK"),
            &String::from_str(&env, "2024-06-01"),
            &String::from_str(&env, "2025-06-01"),
            &String::from_str(&env, "20000 EUR"),
        );

        assert_eq!(coverage.recorded_by, actor);
    }

    /// Unauthorized caller cannot add insurance coverage.
    #[test]
    #[should_panic(expected = "caller is not authorized")]
    fn test_unauthorized_caller_cannot_add_insurance() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let stranger = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-ins-unauth");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );

        env.as_contract(&contract_id, || {
            SupplyLinkContract::add_insurance_coverage(
                env.clone(),
                product_id.clone(),
                stranger.clone(),
                String::from_str(&env, "POL-FAKE"),
                String::from_str(&env, "Fake Insurer"),
                String::from_str(&env, "CARGO"),
                String::from_str(&env, "2024-01-01"),
                String::from_str(&env, "2025-01-01"),
                String::from_str(&env, "0 USD"),
            );
        });
    }

    /// get_insurance returns None when no coverage has been recorded.
    #[test]
    fn test_get_insurance_returns_none_when_not_set() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-no-ins");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );

        let result = client.get_insurance(
            &product_id,
            &owner,
            &String::from_str(&env, "AUDIT"),
        );
        assert!(result.is_none());
    }

    /// Adding coverage twice overwrites the previous record.
    #[test]
    fn test_add_insurance_overwrites_previous() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-ins-overwrite");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );

        client.add_insurance_coverage(
            &product_id,
            &owner,
            &String::from_str(&env, "POL-OLD"),
            &String::from_str(&env, "Old Insurer"),
            &String::from_str(&env, "CARGO"),
            &String::from_str(&env, "2023-01-01"),
            &String::from_str(&env, "2024-01-01"),
            &String::from_str(&env, "10000 USD"),
        );

        client.add_insurance_coverage(
            &product_id,
            &owner,
            &String::from_str(&env, "POL-NEW"),
            &String::from_str(&env, "New Insurer"),
            &String::from_str(&env, "ALL_RISK"),
            &String::from_str(&env, "2024-01-01"),
            &String::from_str(&env, "2025-01-01"),
            &String::from_str(&env, "25000 USD"),
        );

        let retrieved = client.get_insurance(
            &product_id,
            &owner,
            &String::from_str(&env, "AUDIT"),
        ).unwrap();
        assert_eq!(retrieved.policy_id, String::from_str(&env, "POL-NEW"));
        assert_eq!(retrieved.provider, String::from_str(&env, "New Insurer"));
    }

    // ── Claim proof tests ─────────────────────────────────────────────────────

    /// Owner can add a claim proof and retrieve it.
    #[test]
    fn test_add_and_get_claim_proof() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-claim-001");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );

        let proof = client.add_claim_proof(
            &product_id,
            &owner,
            &String::from_str(&env, "CLM-2024-001"),
            &String::from_str(&env, "QmXyz123abc"),
            &String::from_str(&env, "Water damage during transit"),
            &String::from_str(&env, "SUBMITTED"),
        );

        assert_eq!(proof.claim_id, String::from_str(&env, "CLM-2024-001"));
        assert_eq!(proof.status, String::from_str(&env, "SUBMITTED"));
        assert_eq!(proof.submitted_by, owner);

        let proofs = client.get_claim_proofs(
            &product_id,
            &owner,
            &String::from_str(&env, "AUDIT"),
        );
        assert_eq!(proofs.len(), 1);
        assert_eq!(proofs.get(0).unwrap().claim_id, String::from_str(&env, "CLM-2024-001"));
    }

    /// Multiple claim proofs accumulate (not overwritten).
    #[test]
    fn test_multiple_claim_proofs_accumulate() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-multi-claim");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );

        for i in 0..3u32 {
            let claim_id = String::from_str(&env, &soroban_sdk::String::from_str(&env, "CLM-00").to_string());
            // Use distinct claim IDs via different string literals
            let cid = match i {
                0 => String::from_str(&env, "CLM-001"),
                1 => String::from_str(&env, "CLM-002"),
                _ => String::from_str(&env, "CLM-003"),
            };
            client.add_claim_proof(
                &product_id,
                &owner,
                &cid,
                &String::from_str(&env, "QmHash"),
                &String::from_str(&env, "Damage claim"),
                &String::from_str(&env, "PENDING"),
            );
            let _ = claim_id;
        }

        let proofs = client.get_claim_proofs(
            &product_id,
            &owner,
            &String::from_str(&env, "AUDIT"),
        );
        assert_eq!(proofs.len(), 3);
    }

    /// Unauthorized caller cannot add a claim proof.
    #[test]
    #[should_panic(expected = "caller is not authorized")]
    fn test_unauthorized_caller_cannot_add_claim_proof() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let stranger = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-claim-unauth");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );

        env.as_contract(&contract_id, || {
            SupplyLinkContract::add_claim_proof(
                env.clone(),
                product_id.clone(),
                stranger.clone(),
                String::from_str(&env, "CLM-FAKE"),
                String::from_str(&env, "QmFake"),
                String::from_str(&env, "Fraudulent claim"),
                String::from_str(&env, "SUBMITTED"),
            );
        });
    }

    // ── Read-access audit log tests ───────────────────────────────────────────

    /// log_read_access records an entry retrievable by the owner.
    #[test]
    fn test_log_read_access_records_entry() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let auditor = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-log-001");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );

        client.log_read_access(
            &product_id,
            &auditor,
            &String::from_str(&env, "INSURANCE_VERIFY"),
        );

        let logs = client.get_read_logs(&product_id, &owner);
        assert_eq!(logs.len(), 1);
        assert_eq!(logs.get(0).unwrap().accessor, auditor);
        assert_eq!(logs.get(0).unwrap().purpose, String::from_str(&env, "INSURANCE_VERIFY"));
    }

    /// Multiple read accesses accumulate in the log.
    #[test]
    fn test_multiple_read_accesses_accumulate() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-log-multi");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );

        for _ in 0..5 {
            let accessor = soroban_sdk::Address::generate(&env);
            client.log_read_access(
                &product_id,
                &accessor,
                &String::from_str(&env, "AUDIT"),
            );
        }

        let logs = client.get_read_logs(&product_id, &owner);
        assert_eq!(logs.len(), 5);
    }

    /// log_read_access panics for an unknown product.
    #[test]
    #[should_panic(expected = "product not found")]
    fn test_log_read_access_unknown_product_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let accessor = soroban_sdk::Address::generate(&env);

        client.log_read_access(
            &String::from_str(&env, "does-not-exist"),
            &accessor,
            &String::from_str(&env, "AUDIT"),
        );
    }

    /// get_insurance automatically appends a read log entry.
    #[test]
    fn test_get_insurance_appends_read_log() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-ins-log");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );

        // No logs yet
        let logs_before = client.get_read_logs(&product_id, &owner);
        assert_eq!(logs_before.len(), 0);

        // get_insurance should append a log
        client.get_insurance(
            &product_id,
            &owner,
            &String::from_str(&env, "INSURANCE_VERIFY"),
        );

        let logs_after = client.get_read_logs(&product_id, &owner);
        assert_eq!(logs_after.len(), 1);
        assert_eq!(
            logs_after.get(0).unwrap().purpose,
            String::from_str(&env, "INSURANCE_VERIFY")
        );
    }

    /// get_claim_proofs automatically appends a read log entry.
    #[test]
    fn test_get_claim_proofs_appends_read_log() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupplyLinkContract, ());
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let owner = soroban_sdk::Address::generate(&env);
        let product_id = String::from_str(&env, "prod-claim-log");

        client.register_product(
            &product_id,
            &String::from_str(&env, "Widget"),
            &String::from_str(&env, "Factory"),
            &owner,
        );

        client.get_claim_proofs(
            &product_id,
            &owner,
            &String::from_str(&env, "CLAIM_REVIEW"),
        );

        let logs = client.get_read_logs(&product_id, &owner);
        assert_eq!(logs.len(), 1);
        assert_eq!(
            logs.get(0).unwrap().purpose,
            String::from_str(&env, "CLAIM_REVIEW")
        );
    }

    /// Property: log count equals number of explicit log_read_access calls.
    proptest! {
        #![proptest_config(ProptestConfig::with_cases(50))]
        #[test]
        fn prop_read_log_count_equals_access_calls(
            product_id_str in "[a-z]{1,15}",
            n in 0usize..=20,
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
                let accessor = soroban_sdk::Address::generate(&env);
                client.log_read_access(
                    &product_id,
                    &accessor,
                    &String::from_str(&env, "AUDIT"),
                );
            }

            let logs = client.get_read_logs(&product_id, &owner);
            prop_assert_eq!(logs.len() as usize, n);
        }
    }
}