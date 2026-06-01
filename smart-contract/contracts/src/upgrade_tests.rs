use crate::{SupplyLinkContract, SupplyLinkContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_admin_can_register_guardian_and_authorize_upgrade_target() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let guardian = Address::generate(&env);
    let target = Address::generate(&env);

    assert!(client.initialize_admin(&admin));
    assert!(client.register_upgrade_guardian(&guardian));
    assert!(client.is_upgrade_guardian(&guardian));

    assert!(client.authorize_contract_upgrade(&guardian, &target));
    assert!(client.is_contract_upgrade_authorized(&target));

    let authorized_targets = client.get_authorized_contract_upgrades();
    assert_eq!(authorized_targets.len(), 1);
    assert_eq!(authorized_targets.get(0).unwrap(), &target);
}

#[test]
#[should_panic(expected = "guardian is not authorized")]
fn test_non_guardian_cannot_authorize_contract_upgrade() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let unauthorized_guardian = Address::generate(&env);
    let target = Address::generate(&env);

    assert!(client.initialize_admin(&admin));
    client.authorize_contract_upgrade(&unauthorized_guardian, &target);
}

#[test]
fn test_guardian_revoke_contract_upgrade_target() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, SupplyLinkContract);
    let client = SupplyLinkContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let guardian = Address::generate(&env);
    let target = Address::generate(&env);

    assert!(client.initialize_admin(&admin));
    assert!(client.register_upgrade_guardian(&guardian));
    assert!(client.authorize_contract_upgrade(&guardian, &target));
    assert!(client.is_contract_upgrade_authorized(&target));

    assert!(client.revoke_contract_upgrade(&guardian, &target));
    assert!(!client.is_contract_upgrade_authorized(&target));
    assert_eq!(client.get_authorized_contract_upgrades().len(), 0);
}
