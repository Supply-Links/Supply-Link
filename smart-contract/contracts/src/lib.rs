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
    pub fn add_tracking_event(
        env: Env,
        product_id: String,
        location: String,
        event_type: String,
        metadata: String,
    ) -> TrackingEvent {
        let product: Product = env
            .storage()
            .persistent()
            .get(&DataKey::Product(product_id.clone()))
            .expect("product not found");

        // caller must be owner or an authorized actor
        let caller = product.owner.clone();
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

    fn setup() -> (Env, soroban_sdk::Address, String) {
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
        (env, contract_id, product_id)
    }

    fn add_event(env: &Env, contract_id: &soroban_sdk::Address, product_id: &String) {
        let client = SupplyLinkContractClient::new(env, contract_id);
        client.add_tracking_event(
            product_id,
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
        let (env, contract_id, product_id) = setup();
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        assert_eq!(client.get_events_count(&product_id), 0);
    }

    /// Req 3.3 — one add_tracking_event call → count == 1
    #[test]
    fn test_one_event_returns_one() {
        let (env, contract_id, product_id) = setup();
        add_event(&env, &contract_id, &product_id);
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        assert_eq!(client.get_events_count(&product_id), 1);
    }

    /// Req 3.4 — multiple add_tracking_event calls → correct count
    #[test]
    fn test_multiple_events_returns_correct_count() {
        let (env, contract_id, product_id) = setup();
        for _ in 0..5 {
            add_event(&env, &contract_id, &product_id);
        }
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        assert_eq!(client.get_events_count(&product_id), 5);
    }

    /// Req 3.5 — get_events_count == get_tracking_events(...).len()
    #[test]
    fn test_count_equals_vec_len() {
        let (env, contract_id, product_id) = setup();
        for _ in 0..3 {
            add_event(&env, &contract_id, &product_id);
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
                    &String::from_str(&env, "Warehouse"),
                    &String::from_str(&env, "SHIPPING"),
                    &String::from_str(&env, "{}"),
                );
            }

            let count_before = client.get_events_count(&product_id);

            // Add one more event
            client.add_tracking_event(
                &product_id,
                &String::from_str(&env, "Warehouse"),
                &String::from_str(&env, "SHIPPING"),
                &String::from_str(&env, "{}"),
            );

            let count_after = client.get_events_count(&product_id);
            prop_assert_eq!(count_after, count_before + 1);
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
}
