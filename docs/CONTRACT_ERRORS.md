# Contract Error Codes

Supply-Link uses a single `#[contracterror]` enum (`Error`, defined in
[`smart-contract/contracts/src/types.rs`](../smart-contract/contracts/src/types.rs))
to expose stable, machine-readable error codes from the Soroban smart
contract. Clients should map these numeric codes to localised messages
rather than matching on strings.

There used to be a second, overlapping `ContractError` enum sitting next to
`Error` in `types.rs`. It was never wired into any contract entry point —
grepping the crate showed zero `Result<_, ContractError>` returns — so it was
dead/aspirational code left over from an earlier pass at this same problem.
It has been removed; `Error` is now the only business-logic error enum.

## Error Catalog

| Code | Rust Variant                   | TS Key                    | HTTP Status | Trigger                                                        |
| ---- | ------------------------------ | ------------------------- | ----------- | -------------------------------------------------------------- |
| `1`  | `Error::ProductNotFound`       | `PRODUCT_NOT_FOUND`       | 404         | Product ID not registered on-chain                             |
| `2`  | `Error::NotAuthorized`         | `NOT_AUTHORIZED`          | 403         | Caller is not the owner or an authorized actor                 |
| `3`  | `Error::ApproverNotAuthorized` | `APPROVER_NOT_AUTHORIZED` | 403         | Approver is not the owner or an authorized actor               |
| `4`  | `Error::NoPendingEvents`       | `NO_PENDING_EVENTS`       | 404         | No pending events exist in the approval queue                  |
| `5`  | `Error::OwnerOnly`             | `OWNER_ONLY`              | 403         | Action requires the product owner; a non-owner attempted it    |
| `6`  | `Error::PendingEventExpired`   | `PENDING_EVENT_EXPIRED`   | 410         | The pending event being approved/rejected has expired          |
| `7`  | `Error::InvalidNonce`          | `INVALID_NONCE`           | 409         | Supplied nonce does not match the expected sequential value    |
| `8`  | `Error::ComplianceViolation`   | `COMPLIANCE_VIOLATION`    | 422         | Event ordering/timing violates the product's compliance policy |
| `9`  | `Error::ContractPaused`        | `CONTRACT_PAUSED`         | 503         | Contract is paused; write operations are not permitted         |

## Functions That Can Return Each Error

| Function                                                                                                                                         | Possible Error Codes              |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `get_product`                                                                                                                                    | `1`                               |
| `add_tracking_event`                                                                                                                             | `1`, `2`, `9`                     |
| `transfer_ownership`                                                                                                                             | `1`                               |
| `add_authorized_actor`                                                                                                                           | `1`                               |
| `remove_authorized_actor`                                                                                                                        | `1`                               |
| `update_product_metadata`                                                                                                                        | `1`                               |
| `approve_event`                                                                                                                                  | `1`, `3`, `4`, `6`                |
| `product_exists`, `get_tracking_events`, `get_events_count`, `get_authorized_actors`, `get_product_count`, `list_products`, `get_pending_events` | _(none — read-only, never error)_ |

`register_product` currently rejects duplicates and a paused contract via
`panic!` rather than a typed `Error`, so it returns `Product` directly instead
of `Result<Product, Error>`. `OwnerOnly` (`5`), `InvalidNonce` (`7`), and
`ComplianceViolation` (`8`) are defined on the enum for use by callers that
enforce those checks (nonce validation currently panics with a string instead
of returning `Error::InvalidNonce`, and the compliance check in
`compliance.rs` is not yet wired into any entry point) — treat this table as
the authoritative source for _reachable_ codes today and grep for
`Err(Error::` in `smart-contract/contracts/src` before relying on a code not
listed here.

## How Errors Are Encoded

Soroban encodes `#[contracterror]` variants as `ScError::Contract(u32)` in the invocation result. The numeric discriminant is the stable identifier — it will not change across contract upgrades.

**Stability rule:** adding a new variant to `Error` is safe; **never renumber
or reuse an existing discriminant**. Deployed clients and indexers key off
these numeric codes directly.

When using `@stellar/stellar-sdk`, a failed invocation throws an object that contains the error code. Use `mapContractError` from `lib/stellar/contract-errors.ts` to extract it:

```ts
import { mapContractError } from "@/lib/stellar/contract-errors";

try {
  await client.get_product({ id: productId });
} catch (err) {
  const mapped = mapContractError(err);
  if (mapped) {
    // mapped.code    → 1
    // mapped.key     → "PRODUCT_NOT_FOUND"
    // mapped.message → "The requested product does not exist on-chain."
    // mapped.httpStatus → 404
    return NextResponse.json(
      { error: mapped.key },
      { status: mapped.httpStatus },
    );
  }
  throw err; // re-throw unexpected errors
}
```

## Recommended Client Behaviour

| Code                        | Recommended Action                                                   |
| --------------------------- | -------------------------------------------------------------------- |
| `1` (ProductNotFound)       | Show "Product not found" UI state; do not retry                      |
| `2` (NotAuthorized)         | Prompt user to connect the correct wallet; do not retry              |
| `3` (ApproverNotAuthorized) | Inform user they are not an authorized approver                      |
| `4` (NoPendingEvents)       | Refresh the pending-events list; the queue may have been cleared     |
| `5` (OwnerOnly)             | Inform user only the product owner can perform this action           |
| `6` (PendingEventExpired)   | Refresh the pending-events list; the event is stale                  |
| `7` (InvalidNonce)          | Refresh state and retry with the current nonce                       |
| `8` (ComplianceViolation)   | Show the compliance rule that was violated; do not retry until fixed |
| `9` (ContractPaused)        | Inform user the contract is paused; retry later                      |

## Internationalisation

The `message` field in `MappedContractError` is a default English fallback. In the UI, use `mapped.key` as the i18n lookup key:

```ts
// messages/en.json
{
  "errors": {
    "PRODUCT_NOT_FOUND": "Product not found.",
    "NOT_AUTHORIZED": "You are not authorised to perform this action.",
    ...
  }
}
```

All seven supported locales (`en`, `es`, `fr`, `de`, `ar`, `zh`, `he`) must
carry a translated entry for every key under `errors`.

## Adding New Error Codes

1. Add a new variant to the `Error` enum in `smart-contract/contracts/src/types.rs` with the next sequential `u32` discriminant.
2. Add the corresponding entry to `ContractErrorCode` and `ERROR_MAP` in `frontend/lib/stellar/contract-errors.ts`.
3. Add the key to the `errors` namespace in every file under `frontend/messages/`.
4. Add a row to the catalog table above.
5. Add a test in `frontend/lib/__tests__/contract-errors.test.ts` and a Rust test in `smart-contract/contracts/src/*.rs`.

**Never reuse or renumber existing discriminants.** Existing on-chain transactions and client code depend on the stability of these values.
