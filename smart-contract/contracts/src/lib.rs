#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

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

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Product(String),
    Events(String),
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
            .set(&DataKey::Product(id), &product);
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
            event_type,
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
            .set(&DataKey::Events(product_id), &events);

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
        product.owner = new_owner;
        env.storage()
            .persistent()
            .set(&DataKey::Product(product_id), &product);
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
        product.authorized_actors.push_back(actor);
        env.storage()
            .persistent()
            .set(&DataKey::Product(product_id), &product);
        true
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
        let contract_id = env.register_contract(None, SupplyLinkContract);
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
        let contract_id = env.register_contract(None, SupplyLinkContract);
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
            let contract_id = env.register_contract(None, SupplyLinkContract);
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
            let contract_id = env.register_contract(None, SupplyLinkContract);
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
            let contract_id = env.register_contract(None, SupplyLinkContract);
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
        let contract_id = env.register_contract(None, SupplyLinkContract);
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
            let contract_id = env.register_contract(None, SupplyLinkContract);
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
            let contract_id = env.register_contract(None, SupplyLinkContract);
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
            let contract_id = env.register_contract(None, SupplyLinkContract);
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
        let contract_id = env.register_contract(None, SupplyLinkContract);
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
        let contract_id = env.register_contract(None, SupplyLinkContract);
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
}
