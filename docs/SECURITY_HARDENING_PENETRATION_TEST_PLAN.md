# Security Hardening and Penetration Test Plan

**Issue:** #509  
**Status:** Active  
**Last Updated:** 2026-06-01

---

## Executive Summary

This document outlines the comprehensive security hardening strategy and penetration testing plan for Supply-Link, covering the smart contract layer, frontend application, wallet integration, and public APIs. The plan identifies threat models, high-risk components, and actionable penetration tests tied to the repository architecture.

---

## 1. Threat Model

### 1.1 Smart Contract Layer

| Threat                                | Impact                                               | Likelihood | Mitigation                                                                     |
| ------------------------------------- | ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| **Unauthorized event injection**      | Attacker adds false tracking events                  | Medium     | Authorization checks on `add_tracking_event`; role-based access control (#387) |
| **Product ID collision**              | Duplicate registration overwrites existing product   | High       | Duplicate guard in `register_product` (#311); panic on collision               |
| **Replay attacks**                    | Attacker reuses old signatures                       | Medium     | Nonce tracking per actor (#314); expiration windows on pending events          |
| **Multi-sig bypass**                  | Attacker approves event with insufficient signatures | Low        | Threshold enforcement; signature deduplication in `approve_event`              |
| **Ownership hijacking**               | Attacker transfers product to themselves             | Medium     | Owner-only auth on `transfer_ownership`; escrow pattern (#396)                 |
| **Payload size DoS**                  | Attacker submits oversized metadata                  | Low        | Payload size limits enforced (#311); panic on overflow                         |
| **Compliance rule bypass**            | Attacker violates event sequencing rules             | Medium     | Compliance policy enforcement on every event (#402)                            |
| **Identifier canonicalization abuse** | Attacker creates conflicting aliases                 | Low        | Duplicate alias prevention (#508); canonical ID validation                     |
| **Provenance score manipulation**     | Attacker inflates score artificially                 | Medium     | Score validation (0-100 range); schema versioning (#507)                       |
| **Contract upgrade state loss**       | Score/alias data lost during upgrade                 | High       | Persistent storage with stable IDs; migration logic (#507, #508)               |

### 1.2 Frontend Layer

| Threat                          | Impact                                     | Likelihood | Mitigation                                           |
| ------------------------------- | ------------------------------------------ | ---------- | ---------------------------------------------------- |
| **Wallet connection hijacking** | Attacker intercepts Freighter auth         | Medium     | Freighter API security; origin validation            |
| **XSS in product metadata**     | Attacker injects malicious scripts         | Medium     | Input sanitization; React auto-escaping; CSP headers |
| **QR code tampering**           | Attacker modifies QR payload               | Low        | QR verification on scan; hash validation             |
| **Offline data poisoning**      | Attacker modifies cached product data      | Low        | Signature verification on cached events              |
| **CSRF on API calls**           | Attacker forges requests from user session | Low        | CSRF tokens; SameSite cookies                        |

### 1.3 API Layer

| Threat                            | Impact                                | Likelihood | Mitigation                                |
| --------------------------------- | ------------------------------------- | ---------- | ----------------------------------------- |
| **Rate limit bypass**             | Attacker floods endpoints             | Medium     | Rate limiting per IP/wallet (#311)        |
| **Unauthorized API access**       | Attacker calls protected endpoints    | Medium     | JWT/signature validation on all endpoints |
| **Information disclosure**        | Attacker reads sensitive product data | Low        | Access control; audit logging             |
| **SQL injection** (if applicable) | Attacker manipulates queries          | Low        | Parameterized queries; input validation   |

### 1.4 Wallet Integration

| Threat                             | Impact                                  | Likelihood | Mitigation                                      |
| ---------------------------------- | --------------------------------------- | ---------- | ----------------------------------------------- |
| **Freighter extension compromise** | Attacker steals private keys            | Low        | User responsibility; recommend hardware wallets |
| **Signature forgery**              | Attacker forges transaction signatures  | Low        | Soroban SDK signature verification              |
| **Network switching attack**       | Attacker switches user to wrong network | Medium     | Network detection; warning on mismatch (#311)   |

---

## 2. High-Risk Components

### 2.1 Smart Contract

**File:** `smart-contract/contracts/src/lib.rs`

| Component                | Risk Level | Reason                                                             |
| ------------------------ | ---------- | ------------------------------------------------------------------ |
| `register_product`       | **HIGH**   | Duplicate guard is critical; overwrites on collision               |
| `add_tracking_event`     | **HIGH**   | Authorization check must be bulletproof; compliance rules enforced |
| `approve_event`          | **HIGH**   | Multi-sig logic; threshold enforcement; signature deduplication    |
| `transfer_ownership`     | **HIGH**   | Ownership escrow (#396); state mutation                            |
| `set_provenance_score`   | **MEDIUM** | Score validation; schema versioning (#507)                         |
| `register_product_alias` | **MEDIUM** | Alias collision prevention (#508); canonical ID validation         |
| `resolve_product_id`     | **MEDIUM** | Alias resolution; must not create loops                            |

### 2.2 Frontend

**Directory:** `frontend/`

| Component                              | Risk Level | Reason                                        |
| -------------------------------------- | ---------- | --------------------------------------------- |
| `components/wallet/WalletConnect.tsx`  | **HIGH**   | Freighter integration; auth entry point       |
| `lib/stellar/contract-client.ts`       | **HIGH**   | Contract invocation; signature handling       |
| `app/(app)/products/register/page.tsx` | **HIGH**   | Product registration form; input validation   |
| `app/verify/[id]/page.tsx`             | **MEDIUM** | Public verification; QR parsing; data display |
| `lib/state/productStore.ts`            | **MEDIUM** | Cached product state; offline data            |

### 2.3 API Routes

**Directory:** `frontend/app/api/`

| Endpoint             | Risk Level | Reason                                  |
| -------------------- | ---------- | --------------------------------------- |
| `/api/products/[id]` | **HIGH**   | Product lookup; authorization check     |
| `/api/events/add`    | **HIGH**   | Event submission; compliance validation |
| `/api/health`        | **LOW**    | Read-only; no auth required             |

---

## 3. Penetration Test Plan

### 3.1 Smart Contract Penetration Tests

#### 3.1.1 Authorization & Access Control

**Test:** `test_unauthorized_event_injection`

- **Objective:** Verify that non-authorized actors cannot add events
- **Steps:**
  1. Register product with owner A
  2. Attempt to add event as actor B (not authorized)
  3. Verify rejection with `Error::NotAuthorized`
- **Expected Result:** Event rejected; no state mutation
- **File:** `smart-contract/contracts/src/resilience_tests.rs`

**Test:** `test_owner_only_transfer`

- **Objective:** Verify that only the owner can transfer ownership
- **Steps:**
  1. Register product with owner A
  2. Attempt transfer as actor B
  3. Verify rejection
- **Expected Result:** Transfer rejected; ownership unchanged
- **File:** `smart-contract/contracts/src/resilience_tests.rs`

#### 3.1.2 Duplicate Registration & Collision

**Test:** `test_duplicate_product_id_collision`

- **Objective:** Verify that duplicate product IDs are rejected
- **Steps:**
  1. Register product with ID "batch-001"
  2. Attempt to register another product with ID "batch-001"
  3. Verify panic with "product already exists"
- **Expected Result:** Second registration panics; first product unchanged
- **File:** `smart-contract/contracts/src/resilience_tests.rs`

#### 3.1.3 Replay Attack Prevention

**Test:** `test_nonce_replay_rejection`

- **Objective:** Verify that replayed nonces are rejected
- **Steps:**
  1. Submit event with nonce N
  2. Attempt to resubmit same event with nonce N
  3. Verify rejection with `Error::InvalidNonce`
- **Expected Result:** Replay rejected; nonce consumed
- **File:** `smart-contract/contracts/src/resilience_tests.rs`

#### 3.1.4 Multi-Signature Bypass

**Test:** `test_multisig_threshold_enforcement`

- **Objective:** Verify that events require minimum signatures
- **Steps:**
  1. Register product with `required_signatures = 2`
  2. Submit event; verify it stays pending
  3. Approve with actor A; verify still pending
  4. Approve with actor B; verify finalized
  5. Attempt to finalize with only 1 approval; verify rejection
- **Expected Result:** Event only finalizes after threshold met
- **File:** `smart-contract/contracts/src/resilience_tests.rs`

#### 3.1.5 Payload Size DoS

**Test:** `test_oversized_metadata_rejection`

- **Objective:** Verify that oversized payloads are rejected
- **Steps:**
  1. Attempt to add event with metadata > 4096 bytes
  2. Verify panic with "metadata exceeds max length"
- **Expected Result:** Event rejected; no state mutation
- **File:** `smart-contract/contracts/src/resilience_tests.rs`

#### 3.1.6 Compliance Rule Enforcement

**Test:** `test_compliance_rule_violation`

- **Objective:** Verify that compliance rules are enforced
- **Steps:**
  1. Set compliance rule: HARVEST must precede PROCESSING
  2. Attempt to add PROCESSING event without prior HARVEST
  3. Verify rejection with `Error::ComplianceViolation`
- **Expected Result:** Event rejected; rule enforced
- **File:** `smart-contract/contracts/src/compliance_tests.rs`

#### 3.1.7 Identifier Canonicalization (#508)

**Test:** `test_alias_collision_prevention`

- **Objective:** Verify that duplicate aliases are rejected
- **Steps:**
  1. Register product "prod-001"
  2. Create alias "sku-123" → "prod-001"
  3. Attempt to create alias "sku-123" → "prod-002"
  4. Verify rejection with "alias already exists"
- **Expected Result:** Duplicate alias rejected
- **File:** `smart-contract/contracts/src/tests.rs`

**Test:** `test_alias_resolution_correctness`

- **Objective:** Verify that alias resolution returns correct canonical ID
- **Steps:**
  1. Register product "prod-001"
  2. Create alias "sku-123" → "prod-001"
  3. Call `resolve_product_id("sku-123")`
  4. Verify returns "prod-001"
- **Expected Result:** Alias resolves to canonical ID
- **File:** `smart-contract/contracts/src/tests.rs`

#### 3.1.8 Provenance Score Traceability (#507)

**Test:** `test_provenance_score_persistence_across_upgrade`

- **Objective:** Verify that provenance scores persist across contract upgrades
- **Steps:**
  1. Register product "prod-001"
  2. Set provenance score to 85
  3. Simulate contract upgrade (state migration)
  4. Retrieve provenance score
  5. Verify score is 85 and schema_version is preserved
- **Expected Result:** Score persists with correct schema version
- **File:** `smart-contract/contracts/src/tests.rs`

**Test:** `test_provenance_score_validation`

- **Objective:** Verify that scores are validated (0-100 range)
- **Steps:**
  1. Attempt to set score to 101
  2. Verify panic with "score must be between 0 and 100"
  3. Attempt to set score to -1
  4. Verify panic
- **Expected Result:** Invalid scores rejected
- **File:** `smart-contract/contracts/src/tests.rs`

#### 3.1.9 Contract Upgrade State Loss

**Test:** `test_upgrade_migration_preserves_state`

- **Objective:** Verify that state is preserved during contract upgrades
- **Steps:**
  1. Register product with events, aliases, and provenance score
  2. Simulate contract upgrade
  3. Verify all data is accessible post-upgrade
- **Expected Result:** All state preserved; no data loss
- **File:** `smart-contract/contracts/src/tests.rs`

---

### 3.2 Frontend Penetration Tests

#### 3.2.1 Wallet Connection Security

**Test:** `test_wallet_connection_origin_validation`

- **Objective:** Verify that wallet connection validates origin
- **Steps:**
  1. Attempt to connect wallet from unauthorized origin
  2. Verify connection rejected
- **Expected Result:** Connection rejected; no auth granted
- **File:** `frontend/__tests__/WalletConnect.test.tsx`

**Test:** `test_wallet_network_mismatch_warning`

- **Objective:** Verify that network mismatches are detected
- **Steps:**
  1. Connect wallet on testnet
  2. Switch wallet to mainnet
  3. Verify warning displayed
- **Expected Result:** User warned of network mismatch
- **File:** `frontend/__tests__/WalletConnect.test.tsx`

#### 3.2.2 Input Validation & XSS Prevention

**Test:** `test_product_metadata_xss_prevention`

- **Objective:** Verify that malicious scripts in metadata are escaped
- **Steps:**
  1. Register product with metadata: `{"note": "<script>alert('xss')</script>"}`
  2. Retrieve and display product
  3. Verify script is escaped (not executed)
- **Expected Result:** Script escaped; no XSS
- **File:** `frontend/__tests__/RegisterProductForm.test.tsx`

**Test:** `test_qr_payload_validation`

- **Objective:** Verify that QR payloads are validated
- **Steps:**
  1. Generate QR with malicious payload
  2. Scan QR
  3. Verify payload rejected or sanitized
- **Expected Result:** Malicious payload rejected
- **File:** `frontend/e2e/public-verification.spec.ts`

#### 3.2.3 Offline Data Integrity

**Test:** `test_cached_product_signature_verification`

- **Objective:** Verify that cached product data is signed
- **Steps:**
  1. Cache product data offline
  2. Modify cached data
  3. Attempt to use modified data
  4. Verify signature validation fails
- **Expected Result:** Modified data rejected
- **File:** `frontend/__tests__/productReadModel.test.ts`

---

### 3.3 API Penetration Tests

#### 3.3.1 Rate Limiting

**Test:** `test_api_rate_limit_enforcement`

- **Objective:** Verify that rate limits are enforced
- **Steps:**
  1. Send 100 requests to `/api/products/[id]` in 1 second
  2. Verify requests after limit are rejected with 429
- **Expected Result:** Rate limit enforced; excess requests rejected
- **File:** `frontend/__tests__/rateLimit.test.ts`

#### 3.3.2 Authorization

**Test:** `test_api_unauthorized_access_rejection`

- **Objective:** Verify that unauthorized API calls are rejected
- **Steps:**
  1. Call `/api/events/add` without valid signature
  2. Verify rejection with 403
- **Expected Result:** Unauthorized call rejected
- **File:** `frontend/app/api/events/add/route.ts`

#### 3.3.3 CSRF Protection

**Test:** `test_api_csrf_token_validation`

- **Objective:** Verify that CSRF tokens are validated
- **Steps:**
  1. Attempt POST to `/api/events/add` without CSRF token
  2. Verify rejection with 403
- **Expected Result:** CSRF token required
- **File:** `frontend/app/api/events/add/route.ts`

---

### 3.4 Wallet Integration Penetration Tests

#### 3.4.1 Signature Verification

**Test:** `test_freighter_signature_verification`

- **Objective:** Verify that Freighter signatures are validated
- **Steps:**
  1. Sign transaction with Freighter
  2. Modify transaction payload
  3. Verify signature validation fails
- **Expected Result:** Modified transaction rejected
- **File:** `frontend/__tests__/WalletConnect.test.tsx`

#### 3.4.2 Network Switching Attack

**Test:** `test_network_switch_detection`

- **Objective:** Verify that network switches are detected
- **Steps:**
  1. Connect wallet on testnet
  2. Simulate network switch to mainnet
  3. Verify user is warned before proceeding
- **Expected Result:** Network switch detected; user warned
- **File:** `frontend/components/wallet/NetworkBadge.tsx`

---

## 4. Existing Security Documentation

The following documents provide additional security context:

- **[RESILIENCE.md](./RESILIENCE.md)** — End-to-end resilience test suite covering payload limits, unauthorized access, duplicate registration, nonce replay, multi-sig quorum, and full lifecycle scenarios.
- **[CONTRACT_ERRORS.md](./CONTRACT_ERRORS.md)** — Stable error codes and client error handling recommendations.
- **[SECRET_ROTATION_RUNBOOK.md](./SECRET_ROTATION_RUNBOOK.md)** — Procedures for rotating secrets and credentials.
- **[BACKUP_RESTORE.md](./BACKUP_RESTORE.md)** — Data backup and recovery procedures.

---

## 5. Actionable Recommendations

### 5.1 Immediate Actions (Sprint 1)

- [ ] Run all penetration tests in `resilience_tests.rs` and `compliance_tests.rs`
- [ ] Verify wallet connection origin validation in `WalletConnect.tsx`
- [ ] Enable CSP headers in `next.config.ts`
- [ ] Implement rate limiting on all API routes

### 5.2 Short-term Actions (Sprint 2-3)

- [ ] Conduct external security audit of smart contract
- [ ] Implement CSRF token validation on all POST endpoints
- [ ] Add signature verification to cached product data
- [ ] Document network switching detection in user guide

### 5.3 Long-term Actions (Q3 2026)

- [ ] Implement hardware wallet support (Ledger, Trezor)
- [ ] Deploy bug bounty program
- [ ] Conduct annual penetration testing
- [ ] Implement security monitoring and alerting

---

## 6. Testing Infrastructure

### 6.1 Running Penetration Tests

**Smart Contract Tests:**

```bash
cd smart-contract
cargo test resilience_tests
cargo test compliance_tests
```

**Frontend Tests:**

```bash
cd frontend
npm run test
npm run test:e2e
```

**API Tests:**

```bash
cd frontend
npm run test:api
```

### 6.2 CI/CD Integration

All penetration tests run automatically on:

- Pull requests to `main`
- Commits to `develop`
- Pre-deployment to testnet/mainnet

See `.github/workflows/ci.yml` for details.

---

## 7. Compliance & Standards

Supply-Link follows these security standards:

- **OWASP Top 10** — Web application security best practices
- **Soroban SDK Security Guidelines** — Smart contract security
- **Stellar Best Practices** — Blockchain security
- **NIST Cybersecurity Framework** — Risk management

---

## 8. Incident Response

In case of a security incident:

1. **Immediate:** Disable affected functionality; notify users
2. **Investigation:** Analyze logs; determine root cause
3. **Remediation:** Deploy fix; test thoroughly
4. **Communication:** Post-mortem; transparency with users
5. **Prevention:** Update threat model; add tests

See [RELEASE_RUNBOOK.md](./RELEASE_RUNBOOK.md) for deployment procedures.

---

## 9. References

- [Soroban Security Best Practices](https://soroban.stellar.org/docs/learn/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Stellar Documentation](https://developers.stellar.org/)
- [Freighter Wallet Security](https://freighter.app/)

---

**Document Version:** 1.0  
**Last Reviewed:** 2026-06-01  
**Next Review:** 2026-09-01
