//! Anti-replay nonce, event indexing, signer proof, replay detection, and
//! audit snapshot tests moved out of the former tests.rs (#612).
#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

// ── Anti-replay nonces for privileged operations ──────────────────────────────

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
        &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
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
        &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
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
        &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
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
        &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
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
        &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
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
        &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
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
            &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
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
            &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
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
            &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
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
        &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
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
            &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
    );
    
    client.register_product(
        &String::from_str(&env, "prod2"),
        &String::from_str(&env, "Product 2"),
        &String::from_str(&env, "Origin"),
        &owner2,
        &1,
            &String::from_str(&env, "other"),
        &String::from_str(&env, "general"),
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

// ── #403: Event indexing ──────────────────────────────────────────────────────

#[test]
fn test_event_indexes_populated_on_add() {
    use crate::{SupplyLinkContract, SupplyLinkContractClient};
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &cid);
    let owner = Address::generate(&env);
    let pid = String::from_str(&env, "idx-prod");

    client.register_product(
        &pid,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Origin"),
        &owner,
        &1u32,
        &String::from_str(&env, "cat"),
        &String::from_str(&env, "sub"),
    );
    client.add_tracking_event(
        &pid,
        &owner,
        &String::from_str(&env, "Warehouse"),
        &String::from_str(&env, "SHIPPING"),
        &String::from_str(&env, "{}"),
    );

    let by_actor = client.list_events_by_actor(&owner, &0u32, &10u32);
    assert_eq!(by_actor.len(), 1);

    let by_loc = client.list_events_by_location(&String::from_str(&env, "Warehouse"), &0u32, &10u32);
    assert_eq!(by_loc.len(), 1);

    let by_type = client.list_events_by_type(&String::from_str(&env, "SHIPPING"), &0u32, &10u32);
    assert_eq!(by_type.len(), 1);
}

// ── #402: Signer proof ────────────────────────────────────────────────────────

#[test]
fn test_signer_proof_stored_on_add() {
    use crate::{SupplyLinkContract, SupplyLinkContractClient};
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &cid);
    let owner = Address::generate(&env);
    let pid = String::from_str(&env, "proof-prod");

    client.register_product(
        &pid,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Origin"),
        &owner,
        &1u32,
        &String::from_str(&env, "cat"),
        &String::from_str(&env, "sub"),
    );
    let event = client.add_tracking_event(
        &pid,
        &owner,
        &String::from_str(&env, "Port"),
        &String::from_str(&env, "SHIPPING"),
        &String::from_str(&env, "{}"),
    );

    let proof = client.get_signer_proof(&event.stable_id);
    assert!(proof.is_some());
    let p = proof.unwrap();
    assert_eq!(p.signer, owner);
    assert_eq!(p.payload_hash, event.stable_id);
}

// ── #401: Replay protection ───────────────────────────────────────────────────

#[test]
fn test_replay_protection_rejects_duplicate() {
    use crate::{SupplyLinkContract, SupplyLinkContractClient};
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &cid);
    let owner = Address::generate(&env);
    let pid = String::from_str(&env, "replay-prod");

    client.register_product(
        &pid,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Origin"),
        &owner,
        &1u32,
        &String::from_str(&env, "cat"),
        &String::from_str(&env, "sub"),
    );
    let event = client.add_tracking_event(
        &pid,
        &owner,
        &String::from_str(&env, "Port"),
        &String::from_str(&env, "SHIPPING"),
        &String::from_str(&env, "{}"),
    );

    // The stable_id should now be marked as seen
    let replayed = client.is_event_replayed(&event.stable_id);
    assert!(replayed);
}

// ── #400: Audit snapshots ─────────────────────────────────────────────────────

#[test]
fn test_snapshot_created_and_retrievable() {
    use crate::{SupplyLinkContract, SupplyLinkContractClient};
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &cid);
    let owner = Address::generate(&env);
    let pid = String::from_str(&env, "snap-prod");

    client.register_product(
        &pid,
        &String::from_str(&env, "Widget"),
        &String::from_str(&env, "Origin"),
        &owner,
        &1u32,
        &String::from_str(&env, "cat"),
        &String::from_str(&env, "sub"),
    );

    let hash = String::from_str(&env, "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    let snap = client.snapshot_product_state(&pid, &hash);
    assert_eq!(snap.product_id, pid);
    assert_eq!(snap.snapshot_hash, hash);
    assert_eq!(snap.event_count, 0u32);

    let snaps = client.get_snapshots(&pid);
    assert_eq!(snaps.len(), 1);
    assert_eq!(snaps.get(0).unwrap().id, snap.id);
}
