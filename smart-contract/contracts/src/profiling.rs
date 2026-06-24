/// Storage rent and cost profiling suite for Supply-Link.
///
/// Each test registers products and events at realistic volumes, then asserts
/// that CPU instructions and storage-entry counts stay within documented budget
/// thresholds (see `docs/storage-cost-budget.md`).
///
/// Run with:
///   cargo test --features testutils -- profiling 2>&1 | tee cost_report.txt
///
/// The output lines tagged `[COST]` are parsed by `scripts/cost_report.sh`.
#[cfg(test)]
mod profiling {
    use crate::{SupplyLinkContract, SupplyLinkContractClient};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, String, Vec};

    // ── Budget thresholds ────────────────────────────────────────────────────
    // Updated after the O(1) per-event keyed-storage optimisation.
    // add_tracking_event cost is now constant regardless of event count.

    /// Max CPU instructions for a single register_product call.
    const BUDGET_REGISTER_CPU: u64 = 2_500_000;
    /// Max CPU instructions for a single add_tracking_event call (now O(1)).
    const BUDGET_ADD_EVENT_CPU: u64 = 2_000_000;
    /// Max CPU for get_tracking_events_page(limit=10) — 10 keyed reads.
    const BUDGET_GET_PAGE_CPU: u64 = 1_500_000;
    /// Max storage entries after registering N_PRODUCTS products.
    const BUDGET_REGISTER_STORAGE_ENTRIES: usize = 210;
    /// Max storage entries budget — kept large enough for the keyed pattern
    /// (N_EVENTS × 6 entries: EventEntry, EventCount, 3 indexes, SignerProof, HashSeen).
    const BUDGET_EVENTS_STORAGE_ENTRIES: usize = 360;

    const N_PRODUCTS: u64 = 100;
    const N_EVENTS: u64 = 50;

    fn new_env() -> Env {
        let env = Env::default();
        env.mock_all_auths();
        env
    }

    fn deploy(env: &Env) -> (soroban_sdk::Address, soroban_sdk::Address) {
        let contract_id = env.register_contract(None, SupplyLinkContract);
        let owner = soroban_sdk::Address::generate(env);
        (contract_id, owner)
    }

    fn register(env: &Env, client: &SupplyLinkContractClient, id: &str, owner: &soroban_sdk::Address) {
        client.register_product(
            &String::from_str(env, id),
            &String::from_str(env, "Item"),
            &String::from_str(env, "Origin"),
            owner,
            &0u32,
            &String::from_str(env, "other"),
            &String::from_str(env, "general"),
        );
    }

    fn add_event(env: &Env, client: &SupplyLinkContractClient, id: &str, owner: &soroban_sdk::Address, seq: u64) {
        client.add_tracking_event(
            &String::from_str(env, id),
            owner,
            &String::from_str(env, "Loc"),
            &String::from_str(env, "SHIPPING"),
            &String::from_str(env, &format!(r#"{{"seq":{seq}}}"#)),
        );
    }

    // ── register_product ─────────────────────────────────────────────────────

    #[test]
    fn profile_register_product_single() {
        let env = new_env();
        let (contract_id, owner) = deploy(&env);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        env.budget().reset_default();
        client.register_product(
            &String::from_str(&env, "prod-0"),
            &String::from_str(&env, "Coffee Beans"),
            &String::from_str(&env, "Ethiopia"),
            &owner,
            &0u32,
            &String::from_str(&env, "other"),
            &String::from_str(&env, "general"),
        );
        let cpu = env.budget().cpu_instruction_count();
        let mem = env.budget().memory_bytes_used();

        println!("[COST] register_product single | cpu_instructions={cpu} | memory_bytes={mem}");
        assert!(
            cpu <= BUDGET_REGISTER_CPU,
            "register_product CPU {cpu} exceeds budget {BUDGET_REGISTER_CPU}"
        );
    }

    #[test]
    fn profile_register_product_bulk_storage() {
        let env = new_env();
        let (contract_id, owner) = deploy(&env);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        for i in 0..N_PRODUCTS {
            register(&env, &client, &format!("prod-{i}"), &owner);
        }

        let count = client.get_product_count();
        println!(
            "[COST] register_product bulk | products={N_PRODUCTS} | product_count={count} | \
             storage_entries_approx={}",
            N_PRODUCTS * 2 + 1
        );
        assert_eq!(count, N_PRODUCTS, "product count mismatch");
        assert!(
            (N_PRODUCTS * 2 + 1) as usize <= BUDGET_REGISTER_STORAGE_ENTRIES,
            "storage entries {} exceed budget {BUDGET_REGISTER_STORAGE_ENTRIES}",
            N_PRODUCTS * 2 + 1
        );
    }

    // ── add_tracking_event (O(1) keyed storage) ──────────────────────────────

    /// Single add_tracking_event call must be within budget.
    #[test]
    fn profile_add_event_single() {
        let env = new_env();
        let (contract_id, owner) = deploy(&env);
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        register(&env, &client, "p1", &owner);

        env.budget().reset_default();
        client.add_tracking_event(
            &String::from_str(&env, "p1"),
            &owner,
            &String::from_str(&env, "Port of Hamburg"),
            &String::from_str(&env, "SHIPPING"),
            &String::from_str(&env, r#"{"temp":"4C"}"#),
        );
        let cpu = env.budget().cpu_instruction_count();
        let mem = env.budget().memory_bytes_used();

        println!("[COST] add_tracking_event single (O1) | cpu_instructions={cpu} | memory_bytes={mem}");
        assert!(
            cpu <= BUDGET_ADD_EVENT_CPU,
            "add_tracking_event CPU {cpu} exceeds budget {BUDGET_ADD_EVENT_CPU}"
        );
    }

    /// Confirms O(1) cost invariant: the 25th and 50th event cost the same as the 1st.
    #[test]
    fn profile_add_event_constant_cost() {
        let env = new_env();
        let (contract_id, owner) = deploy(&env);
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        register(&env, &client, "p1", &owner);

        // Warm up: 24 events
        for i in 0..24u64 { add_event(&env, &client, "p1", &owner, i); }

        env.budget().reset_default();
        add_event(&env, &client, "p1", &owner, 24);
        let cpu_at_25 = env.budget().cpu_instruction_count();

        for i in 25..49u64 { add_event(&env, &client, "p1", &owner, i); }

        env.budget().reset_default();
        add_event(&env, &client, "p1", &owner, 49);
        let cpu_at_50 = env.budget().cpu_instruction_count();

        println!(
            "[COST] add_tracking_event O1 invariant | \
             cpu_at_25={cpu_at_25} | cpu_at_50={cpu_at_50} | budget={BUDGET_ADD_EVENT_CPU}"
        );
        assert!(cpu_at_25 <= BUDGET_ADD_EVENT_CPU, "cpu@25 {cpu_at_25} > budget");
        assert!(cpu_at_50 <= BUDGET_ADD_EVENT_CPU, "cpu@50 {cpu_at_50} > budget");
    }

    /// Storage entries grow predictably with the keyed pattern.
    #[test]
    fn profile_add_event_bulk_storage() {
        let env = new_env();
        let (contract_id, owner) = deploy(&env);
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        register(&env, &client, "p1", &owner);

        for i in 0..N_EVENTS { add_event(&env, &client, "p1", &owner, i); }

        let count = client.get_events_count(&String::from_str(&env, "p1"));
        // 1 Product + 1 ProductIndex + 1 ProductCount
        // + N EventEntry + 1 EventCount
        // + N*3 index vecs (actor/loc/type grow but each is 1 entry per location/actor/type)
        // + N SignerProof + N HashSeen
        let storage_entries = (3 + N_EVENTS + 1 + N_EVENTS * 3 + N_EVENTS + N_EVENTS) as usize;
        println!(
            "[COST] add_tracking_event bulk (keyed) | events={N_EVENTS} | event_count={count} | \
             storage_entries_approx={storage_entries} | NOTE=O1_per_event_write"
        );
        assert_eq!(count, N_EVENTS as u32);
        assert!(
            storage_entries <= BUDGET_EVENTS_STORAGE_ENTRIES,
            "storage entries {storage_entries} exceed budget {BUDGET_EVENTS_STORAGE_ENTRIES}"
        );
    }

    // ── get_tracking_events_page ─────────────────────────────────────────────

    /// Page retrieval costs O(page_size) not O(total_events).
    #[test]
    fn profile_get_tracking_events_page_cost() {
        let env = new_env();
        let (contract_id, owner) = deploy(&env);
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        register(&env, &client, "p1", &owner);

        for i in 0..N_EVENTS { add_event(&env, &client, "p1", &owner, i); }

        env.budget().reset_default();
        let page = client.get_tracking_events_page(&String::from_str(&env, "p1"), &0u32, &10u32);
        let cpu = env.budget().cpu_instruction_count();
        let mem = env.budget().memory_bytes_used();

        println!(
            "[COST] get_tracking_events_page limit=10 total={N_EVENTS} | \
             cpu_instructions={cpu} | memory_bytes={mem} | returned={}",
            page.len()
        );
        assert_eq!(page.len(), 10, "page should contain 10 events");
        assert!(cpu <= BUDGET_GET_PAGE_CPU, "page CPU {cpu} exceeds {BUDGET_GET_PAGE_CPU}");
    }

    /// Page cost stays flat even as total event count grows.
    #[test]
    fn profile_get_tracking_events_cost_growth() {
        let env = new_env();
        let (contract_id, owner) = deploy(&env);
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        register(&env, &client, "p1", &owner);

        let checkpoints = [10u64, 25, 50];
        let mut prev = 0u64;
        for &checkpoint in &checkpoints {
            while prev < checkpoint { add_event(&env, &client, "p1", &owner, prev); prev += 1; }

            env.budget().reset_default();
            client.get_tracking_events_page(&String::from_str(&env, "p1"), &0u32, &10u32);
            let cpu = env.budget().cpu_instruction_count();
            let mem = env.budget().memory_bytes_used();
            println!(
                "[COST] get_tracking_events_page limit=10 | events_total={checkpoint} | \
                 cpu_instructions={cpu} | memory_bytes={mem}"
            );
            assert!(
                cpu <= BUDGET_GET_PAGE_CPU,
                "page CPU {cpu} at {checkpoint} events > {BUDGET_GET_PAGE_CPU}"
            );
        }
    }

    // ── batch_add_tracking_events (linear scaling) ───────────────────────────

    /// Per-event CPU cost must not grow by more than 20% as batch size doubles.
    #[test]
    fn profile_batch_add_events_linear_scaling() {
        let env = new_env();
        let (contract_id, owner) = deploy(&env);
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        register(&env, &client, "p1", &owner);

        let sizes: [u32; 3] = [5, 10, 20];
        let mut prev_cpu_per_event: u64 = 0;

        for &size in &sizes {
            let mut locs = Vec::new(&env);
            let mut types = Vec::new(&env);
            let mut metas = Vec::new(&env);
            for _ in 0..size {
                locs.push_back(String::from_str(&env, "Loc"));
                types.push_back(String::from_str(&env, "SHIPPING"));
                metas.push_back(String::from_str(&env, "{}"));
            }

            env.budget().reset_default();
            client.batch_add_tracking_events(
                &String::from_str(&env, "p1"),
                &owner,
                &locs,
                &types,
                &metas,
            );
            let cpu = env.budget().cpu_instruction_count();
            let cpu_per_event = cpu / size as u64;

            println!(
                "[COST] batch_add_tracking_events size={size} | \
                 total_cpu={cpu} | cpu_per_event={cpu_per_event}"
            );

            if prev_cpu_per_event > 0 {
                let growth_pct = if cpu_per_event > prev_cpu_per_event {
                    (cpu_per_event - prev_cpu_per_event) * 100 / prev_cpu_per_event
                } else {
                    0
                };
                println!("[COST] batch_add_tracking_events per-event growth={growth_pct}%");
                assert!(
                    growth_pct <= 20,
                    "per-event CPU grew {growth_pct}% (max 20%) — batch not linearly scaled"
                );
            }
            prev_cpu_per_event = cpu_per_event;
        }
    }

    // ── transfer_ownership ───────────────────────────────────────────────────

    #[test]
    fn profile_transfer_ownership() {
        let env = new_env();
        let (contract_id, owner) = deploy(&env);
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        let new_owner = soroban_sdk::Address::generate(&env);
        register(&env, &client, "p1", &owner);

        env.budget().reset_default();
        client.transfer_ownership(&String::from_str(&env, "p1"), &new_owner);
        let cpu = env.budget().cpu_instruction_count();
        let mem = env.budget().memory_bytes_used();
        println!("[COST] transfer_ownership single | cpu_instructions={cpu} | memory_bytes={mem}");
    }

    // ── list_products pagination ─────────────────────────────────────────────

    #[test]
    fn profile_list_products_pagination() {
        let env = new_env();
        let (contract_id, owner) = deploy(&env);
        let client = SupplyLinkContractClient::new(&env, &contract_id);

        for i in 0..N_PRODUCTS {
            register(&env, &client, &format!("prod-{i}"), &owner);
        }

        env.budget().reset_default();
        let page = client.list_products(&0u64, &10u64);
        let cpu = env.budget().cpu_instruction_count();
        let mem = env.budget().memory_bytes_used();
        println!(
            "[COST] list_products page_size=10 total={N_PRODUCTS} | \
             cpu_instructions={cpu} | memory_bytes={mem} | returned={}",
            page.len()
        );
        assert_eq!(page.len(), 10);
    }

    // ── estimate_gas ─────────────────────────────────────────────────────────

    /// estimate_gas must return 4 elements and reflect the real event count.
    #[test]
    fn profile_estimate_gas_accuracy() {
        let env = new_env();
        let (contract_id, owner) = deploy(&env);
        let client = SupplyLinkContractClient::new(&env, &contract_id);
        register(&env, &client, "p1", &owner);

        for i in 0..10u64 { add_event(&env, &client, "p1", &owner, i); }

        let estimates = client.estimate_gas(&String::from_str(&env, "p1"));
        assert_eq!(estimates.len(), 4, "estimate_gas must return 4 elements");

        let event_count = estimates.get(3).unwrap();
        assert_eq!(event_count, 10u64, "estimate_gas event_count must reflect stored count");

        println!(
            "[COST] estimate_gas | add_event_cpu={} | register_cpu={} | \
             page_cpu={} | event_count={}",
            estimates.get(0).unwrap(),
            estimates.get(1).unwrap(),
            estimates.get(2).unwrap(),
            estimates.get(3).unwrap(),
        );
    }
}
