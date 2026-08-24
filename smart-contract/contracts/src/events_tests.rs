//! Tracking-event stable IDs, pagination, and counting tests moved out of the
//! former tests.rs (#612).
#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup() -> (Env, Address, Address, String) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let owner = Address::generate(&env);
    let product_id = String::from_str(&env, "prod-001");
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    client.register_product(
        &product_id,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Factory A"),
        &owner,
        &1,
        &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
    );
    (env, contract_id, owner, product_id)
}

fn add_event(env: &Env, contract_id: &Address, product_id: &String, caller: &Address) {
    let client = SupplyLinkContractClient::new(env, contract_id);
    client.add_tracking_event(
        product_id,
        caller,
        &String::from_str(env, "Warehouse"),
        &String::from_str(env, "SHIPPING"),
        &String::from_str(env, "{}"),
    );
}

// ── #386: Stable event IDs ────────────────────────────────────────────────

#[test]
fn test_stable_id_is_present() {
    let (env, contract_id, owner, product_id) = setup();
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    let event = client.add_tracking_event(
        &product_id,
        &owner,
        &String::from_str(&env, "Port"),
        &String::from_str(&env, "SHIPPING"),
        &String::from_str(&env, "{}"),
    );
    // stable_id must be a 64-char hex string
    assert_eq!(event.stable_id.len(), 64);
}

#[test]
fn test_stable_id_is_deterministic() {
    // Two events with identical fields at the same ledger timestamp must
    // produce the same stable_id.
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let pid = String::from_str(&env, "prod-det");

    client.register_product(
        &pid,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Origin"),
        &owner,
        &1,
        &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
    );

    let e1 = client.add_tracking_event(
        &pid,
        &owner,
        &String::from_str(&env, "Loc"),
        &String::from_str(&env, "HARVEST"),
        &String::from_str(&env, "{\"k\":1}"),
    );
    // Same ledger timestamp → same stable_id
    let e2 = client.add_tracking_event(
        &pid,
        &owner,
        &String::from_str(&env, "Loc"),
        &String::from_str(&env, "HARVEST"),
        &String::from_str(&env, "{\"k\":1}"),
    );
    assert_eq!(e1.stable_id, e2.stable_id);
}

// ── #388: Paginated event retrieval ───────────────────────────────────────

#[test]
fn test_list_tracking_events_pagination() {
    let (env, contract_id, owner, product_id) = setup();
    let client = SupplyLinkContractClient::new(&env, &contract_id);

    for _ in 0..10 {
        add_event(&env, &contract_id, &product_id, &owner);
    }

    let page1 = client.list_tracking_events(&product_id, &0, &5);
    let page2 = client.list_tracking_events(&product_id, &5, &5);
    let page3 = client.list_tracking_events(&product_id, &10, &5);

    assert_eq!(page1.len(), 5);
    assert_eq!(page2.len(), 5);
    assert_eq!(page3.len(), 0);
}

#[test]
fn test_count_tracking_events() {
    let (env, contract_id, owner, product_id) = setup();
    let client = SupplyLinkContractClient::new(&env, &contract_id);

    assert_eq!(client.count_tracking_events(&product_id), 0);
    for i in 1..=5u32 {
        add_event(&env, &contract_id, &product_id, &owner);
        assert_eq!(client.count_tracking_events(&product_id), i);
    }
}

#[test]
fn test_list_events_offset_beyond_total_returns_empty() {
    let (env, contract_id, owner, product_id) = setup();
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    add_event(&env, &contract_id, &product_id, &owner);

    let result = client.list_tracking_events(&product_id, &100, &10);
    assert_eq!(result.len(), 0);
}
