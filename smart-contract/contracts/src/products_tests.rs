//! Product lifecycle, hazard metadata, identifier aliasing, and provenance
//! score tests moved out of the former tests.rs (#612).
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

// ── Deactivation ──────────────────────────────────────────────────────────

#[test]
fn test_deactivate_blocks_events() {
    let (env, contract_id, _owner, product_id) = setup();
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    client.deactivate_product(&product_id);
    // Verified by test_add_event_deactivated_panics pattern
    assert!(!client.get_product(&product_id).active);
}

#[test]
fn test_reactivate_allows_events() {
    let (env, contract_id, owner, product_id) = setup();
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    client.deactivate_product(&product_id);
    client.reactivate_product(&product_id);
    // Should not panic
    add_event(&env, &contract_id, &product_id, &owner);
    assert_eq!(client.count_tracking_events(&product_id), 1);
}

// ── Hazard metadata ───────────────────────────────────────────────────────

#[test]
fn test_set_hazard_status() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    
    client.register_product(
        &String::from_str(&env, "haz1"),
        &String::from_str(&env, "Chemical"),
        &String::from_str(&env, "Factory"),
        &owner,
        &1,
        &String::from_str(&env, "cat"),
        &String::from_str(&env, "sub"),
    );
    
    client.set_hazard_status(
        &String::from_str(&env, "haz1"),
        &true,
        &String::from_str(&env, "Flammable"),
    );
    
    let product = client.get_product(&String::from_str(&env, "haz1"));
    assert_eq!(product.hazardous, true);
    assert_eq!(product.hazard_classification, String::from_str(&env, "Flammable"));
}

// ── #508: Product identifier canonicalization ────────────────────────────────

#[test]
fn test_register_product_alias_success() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let canonical_id = String::from_str(&env, "prod-001");
    let alias = String::from_str(&env, "sku-123");
    
    // Register canonical product
    client.register_product(
        &canonical_id,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Factory A"),
        &owner,
        &1,
        &String::from_str(&env, "cat"),
        &String::from_str(&env, "sub"),
    );
    
    // Register alias
    let alias_entry = client.register_product_alias(&canonical_id, &alias, &owner);
    assert_eq!(alias_entry.canonical_id, canonical_id);
    assert_eq!(alias_entry.alias, alias);
}

#[test]
#[should_panic(expected = "alias already exists")]
fn test_register_product_alias_duplicate_rejection() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let canonical_id = String::from_str(&env, "prod-001");
    let alias = String::from_str(&env, "sku-123");
    
    client.register_product(
        &canonical_id,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Factory A"),
        &owner,
        &1,
        &String::from_str(&env, "cat"),
        &String::from_str(&env, "sub"),
    );
    
    // Register first alias
    client.register_product_alias(&canonical_id, &alias, &owner);
    
    // Attempt to register duplicate alias
    client.register_product_alias(&canonical_id, &alias, &owner);
}

#[test]
fn test_resolve_product_id_canonical() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let canonical_id = String::from_str(&env, "prod-001");
    
    // Resolving a canonical ID should return itself
    let resolved = client.resolve_product_id(&canonical_id);
    assert_eq!(resolved, canonical_id);
}

#[test]
fn test_resolve_product_id_alias() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let canonical_id = String::from_str(&env, "prod-001");
    let alias = String::from_str(&env, "sku-123");
    
    client.register_product(
        &canonical_id,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Factory A"),
        &owner,
        &1,
        &String::from_str(&env, "cat"),
        &String::from_str(&env, "sub"),
    );
    
    client.register_product_alias(&canonical_id, &alias, &owner);
    
    // Resolving an alias should return the canonical ID
    let resolved = client.resolve_product_id(&alias);
    assert_eq!(resolved, canonical_id);
}

// ── #507: Provenance score traceability ──────────────────────────────────────

#[test]
fn test_set_provenance_score_success() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let product_id = String::from_str(&env, "prod-001");
    
    client.register_product(
        &product_id,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Factory A"),
        &owner,
        &1,
        &String::from_str(&env, "cat"),
        &String::from_str(&env, "sub"),
    );
    
    let metadata = client.set_provenance_score(&product_id, &85, &10);
    assert_eq!(metadata.product_id, product_id);
    assert_eq!(metadata.score, 85);
    assert_eq!(metadata.verified_event_count, 10);
    assert_eq!(metadata.schema_version, 1);
}

#[test]
#[should_panic(expected = "score must be between 0 and 100")]
fn test_set_provenance_score_invalid_high() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let product_id = String::from_str(&env, "prod-001");
    
    client.register_product(
        &product_id,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Factory A"),
        &owner,
        &1,
        &String::from_str(&env, "cat"),
        &String::from_str(&env, "sub"),
    );
    
    // Attempt to set score > 100
    client.set_provenance_score(&product_id, &101, &10);
}

#[test]
fn test_get_provenance_score() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let product_id = String::from_str(&env, "prod-001");
    
    client.register_product(
        &product_id,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Factory A"),
        &owner,
        &1,
        &String::from_str(&env, "cat"),
        &String::from_str(&env, "sub"),
    );
    
    client.set_provenance_score(&product_id, &75, &5);
    
    let retrieved = client.get_provenance_score(&product_id);
    assert!(retrieved.is_some());
    let score_data = retrieved.unwrap();
    assert_eq!(score_data.score, 75);
    assert_eq!(score_data.verified_event_count, 5);
}

#[test]
fn test_get_provenance_score_history() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let product_id = String::from_str(&env, "prod-001");
    
    client.register_product(
        &product_id,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Factory A"),
        &owner,
        &1,
        &String::from_str(&env, "cat"),
        &String::from_str(&env, "sub"),
    );
    
    client.set_provenance_score(&product_id, &75, &5);
    
    let history = client.get_provenance_score_history(&product_id);
    assert_eq!(history.len(), 1);
    assert_eq!(history.get(0).unwrap().score, 75);
}
