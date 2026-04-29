#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_nonce_starts_at_zero() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let actor = Address::generate(&env);
    
    assert_eq!(client.get_nonce(&actor), 0);
}

#[test]
fn test_transfer_ownership_increments_nonce() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    
    client.register_product(
        &String::from_str(&env, "prod1"),
        &String::from_str(&env, "Product 1"),
        &String::from_str(&env, "Origin"),
        &owner,
        &1,
    );
    
    assert_eq!(client.get_nonce(&owner), 0);
    
    client.transfer_ownership(
        &String::from_str(&env, "prod1"),
        &new_owner,
        &0,
    );
    
    assert_eq!(client.get_nonce(&owner), 1);
}

#[test]
#[should_panic(expected = "invalid nonce")]
fn test_transfer_ownership_rejects_stale_nonce() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let actor = Address::generate(&env);
    
    client.register_product(
        &String::from_str(&env, "prod1"),
        &String::from_str(&env, "Product 1"),
        &String::from_str(&env, "Origin"),
        &owner,
        &1,
    );
    
    client.add_authorized_actor(
        &String::from_str(&env, "prod1"),
        &actor,
        &0,
    );
    
    client.remove_authorized_actor(
        &String::from_str(&env, "prod1"),
        &actor,
        &0,
    );
}

#[test]
#[should_panic(expected = "invalid nonce")]
fn test_transfer_ownership_rejects_future_nonce() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    
    client.register_product(
        &String::from_str(&env, "prod1"),
        &String::from_str(&env, "Product 1"),
        &String::from_str(&env, "Origin"),
        &owner,
        &1,
    );
    
    client.transfer_ownership(
        &String::from_str(&env, "prod1"),
        &new_owner,
        &5,
    );
}

#[test]
fn test_add_authorized_actor_increments_nonce() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let actor = Address::generate(&env);
    
    client.register_product(
        &String::from_str(&env, "prod1"),
        &String::from_str(&env, "Product 1"),
        &String::from_str(&env, "Origin"),
        &owner,
        &1,
    );
    
    assert_eq!(client.get_nonce(&owner), 0);
    
    client.add_authorized_actor(
        &String::from_str(&env, "prod1"),
        &actor,
        &0,
    );
    
    assert_eq!(client.get_nonce(&owner), 1);
}

#[test]
#[should_panic(expected = "invalid nonce")]
fn test_add_authorized_actor_rejects_duplicate_nonce() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let actor1 = Address::generate(&env);
    let actor2 = Address::generate(&env);
    
    client.register_product(
        &String::from_str(&env, "prod1"),
        &String::from_str(&env, "Product 1"),
        &String::from_str(&env, "Origin"),
        &owner,
        &1,
    );
    
    client.add_authorized_actor(
        &String::from_str(&env, "prod1"),
        &actor1,
        &0,
    );
    
    client.add_authorized_actor(
        &String::from_str(&env, "prod1"),
        &actor2,
        &0,
    );
}

#[test]
fn test_remove_authorized_actor_increments_nonce() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let actor = Address::generate(&env);
    
    client.register_product(
        &String::from_str(&env, "prod1"),
        &String::from_str(&env, "Product 1"),
        &String::from_str(&env, "Origin"),
        &owner,
        &1,
    );
    
    client.add_authorized_actor(
        &String::from_str(&env, "prod1"),
        &actor,
        &0,
    );
    
    assert_eq!(client.get_nonce(&owner), 1);
    
    client.remove_authorized_actor(
        &String::from_str(&env, "prod1"),
        &actor,
        &1,
    );
    
    assert_eq!(client.get_nonce(&owner), 2);
}

#[test]
fn test_approve_event_increments_nonce() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let actor = Address::generate(&env);
    
    client.register_product(
        &String::from_str(&env, "prod1"),
        &String::from_str(&env, "Product 1"),
        &String::from_str(&env, "Origin"),
        &owner,
        &2,
    );
    
    client.add_tracking_event(
        &String::from_str(&env, "prod1"),
        &owner,
        &String::from_str(&env, "Location"),
        &String::from_str(&env, "HARVEST"),
        &String::from_str(&env, "{}"),
    );
    
    assert_eq!(client.get_nonce(&owner), 0);
    
    client.approve_event(
        &String::from_str(&env, "prod1"),
        &0,
        &owner,
        &0,
    );
    
    assert_eq!(client.get_nonce(&owner), 1);
}

#[test]
#[should_panic(expected = "invalid nonce")]
fn test_approve_event_rejects_out_of_order_nonce() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    
    client.register_product(
        &String::from_str(&env, "prod1"),
        &String::from_str(&env, "Product 1"),
        &String::from_str(&env, "Origin"),
        &owner,
        &2,
    );
    
    client.add_tracking_event(
        &String::from_str(&env, "prod1"),
        &owner,
        &String::from_str(&env, "Location"),
        &String::from_str(&env, "HARVEST"),
        &String::from_str(&env, "{}"),
    );
    
    client.approve_event(
        &String::from_str(&env, "prod1"),
        &0,
        &owner,
        &1,
    );
}

#[test]
fn test_reject_event_increments_nonce() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    
    client.register_product(
        &String::from_str(&env, "prod1"),
        &String::from_str(&env, "Product 1"),
        &String::from_str(&env, "Origin"),
        &owner,
        &2,
    );
    
    client.add_tracking_event(
        &String::from_str(&env, "prod1"),
        &owner,
        &String::from_str(&env, "Location"),
        &String::from_str(&env, "HARVEST"),
        &String::from_str(&env, "{}"),
    );
    
    assert_eq!(client.get_nonce(&owner), 0);
    
    client.reject_event(
        &String::from_str(&env, "prod1"),
        &0,
        &owner,
        &String::from_str(&env, ""),
        &0,
    );
    
    assert_eq!(client.get_nonce(&owner), 1);
}

#[test]
fn test_nonce_progression_multiple_operations() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner = Address::generate(&env);
    let actor = Address::generate(&env);
    let new_owner = Address::generate(&env);
    
    client.register_product(
        &String::from_str(&env, "prod1"),
        &String::from_str(&env, "Product 1"),
        &String::from_str(&env, "Origin"),
        &owner,
        &1,
    );
    
    assert_eq!(client.get_nonce(&owner), 0);
    
    client.add_authorized_actor(
        &String::from_str(&env, "prod1"),
        &actor,
        &0,
    );
    assert_eq!(client.get_nonce(&owner), 1);
    
    client.remove_authorized_actor(
        &String::from_str(&env, "prod1"),
        &actor,
        &1,
    );
    assert_eq!(client.get_nonce(&owner), 2);
    
    client.transfer_ownership(
        &String::from_str(&env, "prod1"),
        &new_owner,
        &2,
    );
    assert_eq!(client.get_nonce(&owner), 3);
}

#[test]
fn test_nonce_isolated_per_actor() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);
    
    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);
    let new_owner = Address::generate(&env);
    
    client.register_product(
        &String::from_str(&env, "prod1"),
        &String::from_str(&env, "Product 1"),
        &String::from_str(&env, "Origin"),
        &owner1,
        &1,
    );
    
    client.register_product(
        &String::from_str(&env, "prod2"),
        &String::from_str(&env, "Product 2"),
        &String::from_str(&env, "Origin"),
        &owner2,
        &1,
    );
    
    client.transfer_ownership(
        &String::from_str(&env, "prod1"),
        &new_owner,
        &0,
    );
    
    assert_eq!(client.get_nonce(&owner1), 1);
    assert_eq!(client.get_nonce(&owner2), 0);
    
    client.transfer_ownership(
        &String::from_str(&env, "prod2"),
        &new_owner,
        &0,
    );
    
    assert_eq!(client.get_nonce(&owner1), 1);
    assert_eq!(client.get_nonce(&owner2), 1);
}
