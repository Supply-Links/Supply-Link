//! Role and authorization-policy tests moved out of the former tests.rs (#612).
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

// ── #387: Role segregation ────────────────────────────────────────────────

#[test]
fn test_assign_and_get_role() {
    let (env, contract_id, _owner, product_id) = setup();
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    let actor = Address::generate(&env);

    client.add_authorized_actor(&product_id, &actor, &0);
    client.assign_role(&product_id, &actor, &Role::Shipper);

    let policy = client.get_authorization_policy(&product_id);
    assert_eq!(policy.roles.len(), 1);
    assert_eq!(policy.roles.get(0).unwrap().role, Role::Shipper);
}

#[test]
fn test_revoke_role() {
    let (env, contract_id, _owner, product_id) = setup();
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    let actor = Address::generate(&env);

    client.add_authorized_actor(&product_id, &actor, &0);
    client.assign_role(&product_id, &actor, &Role::Producer);
    let removed = client.revoke_role(&product_id, &actor);
    assert!(removed);

    let policy = client.get_authorization_policy(&product_id);
    assert_eq!(policy.roles.len(), 0);
}

#[test]
fn test_set_event_threshold() {
    let (env, contract_id, owner, product_id) = setup();
    let client = SupplyLinkContractClient::new(&env, &contract_id);

    client.set_event_threshold(&product_id, &2);
    let policy = client.get_authorization_policy(&product_id);
    assert_eq!(policy.threshold, 2);
}

#[test]
fn test_default_policy_threshold_is_one() {
    let (env, contract_id, _owner, product_id) = setup();
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    let policy = client.get_authorization_policy(&product_id);
    assert_eq!(policy.threshold, 1);
}
