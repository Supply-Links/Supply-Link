import type {
  Product,
  TrackingEvent,
  EventFilter,
  EventPage,
  AuthPolicy,
  Delegation,
  ProductAssembly,
  WarrantyInfo,
  WarrantyClaim,
  ClaimStatus,
} from '@/lib/types';
import { MOCK_EVENTS, MOCK_PRODUCTS } from '@/lib/mock/products';
import type { ContractClient } from './contract-client.interface';
import { normalizeProduct, normalizeTrackingEvent } from './schema';
import type { ComplianceRule, CompliancePolicy } from '@/lib/compliance';
import {
  collectAllEventPages,
  formatMockTxId,
  paginateEvents,
  requireNonEmptyId,
  sortEventsByTimestamp,
} from './contract-client-shared';

export class MockContractClient implements ContractClient {
  private products: Map<string, Product> = new Map();
  private events: Map<string, TrackingEvent[]> = new Map();
  private nonces: Map<string, number> = new Map();
  private guardians: Set<string> = new Set();
  private authorizedUpgrades: Set<string> = new Set();
  private documentAnchors: Map<string, Array<{ label: string; hash: string; timestamp: number }>> =
    new Map();
  private snapshots: Map<string, Array<{ snapshotHash: string; timestamp: number }>> = new Map();
  private delegations: Map<string, Delegation[]> = new Map();
  private assemblies: Map<string, ProductAssembly> = new Map();
  private warranties: Map<string, WarrantyInfo> = new Map();
  private claims: Map<string, WarrantyClaim[]> = new Map();
  private compliancePolicies: Map<string, CompliancePolicy> = new Map();

  constructor() {
    // Seed initial mock data
    for (const p of MOCK_PRODUCTS) {
      this.products.set(p.id, normalizeProduct(p));
    }

    const groupedEvents = new Map<string, TrackingEvent[]>();
    for (const e of MOCK_EVENTS) {
      const normalized = normalizeTrackingEvent(e);
      const list = groupedEvents.get(normalized.productId) || [];
      list.push(normalized);
      groupedEvents.set(normalized.productId, list);
    }

    for (const [pid, list] of groupedEvents.entries()) {
      this.events.set(pid, list);
    }
  }

  // ── Product Operations ───────────────────────────────────────────────────

  async registerProduct(
    productId: string,
    name: string,
    origin: string,
    owner: string,
    callerAddress: string,
    _description?: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const newProduct: Product = {
      id: productId,
      name,
      origin,
      owner,
      timestamp: Date.now(),
      active: true,
      authorizedActors: [owner],
      recalled: false,
      recallReason: '',
      recallTimestamp: 0,
      schemaVersion: 1,
    };
    this.products.set(productId, newProduct);
    return formatMockTxId('register', productId);
  }

  async getProduct(productId: string, _callerAddress?: string): Promise<Product | null> {
    requireNonEmptyId(productId, 'productId');
    return this.products.get(productId) ?? null;
  }

  async listProducts(
    page: number = 0,
    pageSize: number = 20,
    _callerAddress?: string,
  ): Promise<{ products: Product[]; total: number }> {
    const all = Array.from(this.products.values());
    const total = all.length;
    const offset = page * pageSize;
    const products = all.slice(offset, offset + pageSize);
    return { products, total };
  }

  async getProductCount(_callerAddress?: string): Promise<number> {
    return this.products.size;
  }

  async deactivateProduct(productId: string, callerAddress: string): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const product = this.products.get(productId);
    if (product) {
      product.active = false;
      this.products.set(productId, product);
    }
    return formatMockTxId('deactivate', productId);
  }

  async transferOwnership(
    productId: string,
    newOwner: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const product = this.products.get(productId);
    if (product) {
      product.owner = newOwner;
      this.products.set(productId, product);
    }
    return formatMockTxId('transfer', productId);
  }

  async addAuthorizedActor(
    productId: string,
    actor: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const product = this.products.get(productId);
    if (product) {
      if (!product.authorizedActors.includes(actor)) {
        product.authorizedActors.push(actor);
      }
    }
    return formatMockTxId('add_actor', productId);
  }

  async removeAuthorizedActor(
    productId: string,
    actor: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const product = this.products.get(productId);
    if (product) {
      product.authorizedActors = product.authorizedActors.filter((a) => a !== actor);
    }
    return formatMockTxId('remove_actor', productId);
  }

  async rotateOwnerKey(
    productId: string,
    oldOwner: string,
    newOwner: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const product = this.products.get(productId);
    if (product && product.owner === oldOwner) {
      product.owner = newOwner;
      this.products.set(productId, product);
    }
    return formatMockTxId('rotate_owner', productId);
  }

  async rotateAuthorizedActorKey(
    productId: string,
    oldActor: string,
    newActor: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const product = this.products.get(productId);
    if (product && product.authorizedActors.includes(oldActor)) {
      product.authorizedActors = product.authorizedActors.map((a) =>
        a === oldActor ? newActor : a,
      );
      this.products.set(productId, product);
    }
    return formatMockTxId('rotate_actor', productId);
  }

  // ── Compliance Policy ─────────────────────────────────────────────────────

  async setCompliancePolicy(
    productId: string,
    rules: ComplianceRule[],
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    this.compliancePolicies.set(productId, { product_id: productId, rules });
    return formatMockTxId('compliance', productId);
  }

  async getCompliancePolicy(
    productId: string,
    _callerAddress?: string,
  ): Promise<CompliancePolicy | null> {
    requireNonEmptyId(productId, 'productId');
    return this.compliancePolicies.get(productId) ?? null;
  }

  // ── Event Operations & Provenance ─────────────────────────────────────────

  async addTrackingEvent(
    productId: string,
    location: string,
    eventType: string,
    metadata: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const event: TrackingEvent = {
      productId,
      location,
      actor: callerAddress,
      timestamp: Date.now(),
      eventType: eventType as TrackingEvent['eventType'],
      metadata,
      schemaVersion: 1,
    };
    const list = this.events.get(productId) || [];
    list.push(event);
    this.events.set(productId, list);
    return formatMockTxId('event', productId);
  }

  async addPrivateTrackingEvent(
    productId: string,
    location: string,
    eventType: string,
    metadataCommitment: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const event: TrackingEvent = {
      productId,
      location,
      actor: callerAddress,
      timestamp: Date.now(),
      eventType: eventType as TrackingEvent['eventType'],
      metadata: '',
      metadataCommitment,
      privateMetadata: true,
      schemaVersion: 1,
    };
    const list = this.events.get(productId) || [];
    list.push(event);
    this.events.set(productId, list);
    return formatMockTxId('private_event', productId);
  }

  async getTrackingEvents(productId: string, _callerAddress?: string): Promise<TrackingEvent[]> {
    requireNonEmptyId(productId, 'productId');
    return this.events.get(productId) || [];
  }

  async fetchEventPage(
    productId: string,
    offset: number,
    limit: number = 20,
    filter?: EventFilter,
  ): Promise<EventPage> {
    requireNonEmptyId(productId, 'productId');
    const allForProduct = this.events.get(productId) || [];
    return paginateEvents(allForProduct, offset, limit, filter);
  }

  async fetchAllEvents(
    productId: string,
    filter?: EventFilter,
    pageSize: number = 20,
  ): Promise<TrackingEvent[]> {
    requireNonEmptyId(productId, 'productId');
    return collectAllEventPages(
      (offset, limit) => this.fetchEventPage(productId, offset, limit, filter),
      pageSize,
    );
  }

  async fetchProvenancePath(productId: string): Promise<TrackingEvent[]> {
    requireNonEmptyId(productId, 'productId');
    const events = await this.fetchAllEvents(productId);
    return sortEventsByTimestamp(events);
  }

  async fetchAuthPolicy(productId: string): Promise<AuthPolicy> {
    requireNonEmptyId(productId, 'productId');
    return { threshold: 1, roles: [] };
  }

  async getNonce(actor: string, _callerAddress?: string): Promise<number> {
    requireNonEmptyId(actor, 'actor');
    return this.nonces.get(actor) || 0;
  }

  async approveEvent(
    productId: string,
    _pendingEventId: number,
    approver: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const nonce = (this.nonces.get(approver) || 0) + 1;
    this.nonces.set(approver, nonce);
    return formatMockTxId('approve', productId);
  }

  async rejectEvent(
    productId: string,
    _pendingEventId: number,
    rejector: string,
    _reason: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const nonce = (this.nonces.get(rejector) || 0) + 1;
    this.nonces.set(rejector, nonce);
    return formatMockTxId('reject', productId);
  }

  async getPendingEvents(productId: string, _callerAddress?: string): Promise<unknown[]> {
    requireNonEmptyId(productId, 'productId');
    return [];
  }

  async getProvenanceRoot(productId: string, _callerAddress?: string): Promise<Uint8Array> {
    requireNonEmptyId(productId, 'productId');
    const root = new Uint8Array(32);
    for (let i = 0; i < 32; i++) root[i] = (productId.charCodeAt(i % productId.length) || 0) % 256;
    return root;
  }

  // ── Governance & Upgrades ─────────────────────────────────────────────────

  async registerUpgradeGuardian(guardian: string, callerAddress: string): Promise<string> {
    requireNonEmptyId(guardian, 'guardian');
    requireNonEmptyId(callerAddress, 'callerAddress');
    this.guardians.add(guardian);
    return formatMockTxId('register_guardian');
  }

  async revokeUpgradeGuardian(guardian: string, callerAddress: string): Promise<string> {
    requireNonEmptyId(guardian, 'guardian');
    requireNonEmptyId(callerAddress, 'callerAddress');
    this.guardians.delete(guardian);
    return formatMockTxId('revoke_guardian');
  }

  async authorizeContractUpgrade(contractId: string, callerAddress: string): Promise<string> {
    requireNonEmptyId(contractId, 'contractId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    this.authorizedUpgrades.add(contractId);
    return formatMockTxId('authorize_upgrade');
  }

  async revokeContractUpgrade(contractId: string, callerAddress: string): Promise<string> {
    requireNonEmptyId(contractId, 'contractId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    this.authorizedUpgrades.delete(contractId);
    return formatMockTxId('revoke_upgrade');
  }

  async getUpgradeGuardians(_callerAddress?: string): Promise<string[]> {
    return Array.from(this.guardians);
  }

  async getAuthorizedContractUpgrades(_callerAddress?: string): Promise<string[]> {
    return Array.from(this.authorizedUpgrades);
  }

  async isContractUpgradeAuthorized(contractId: string, _callerAddress?: string): Promise<boolean> {
    requireNonEmptyId(contractId, 'contractId');
    return this.authorizedUpgrades.has(contractId);
  }

  async validateContractUpgradeTarget(
    contractId: string,
    callerAddress?: string,
  ): Promise<boolean> {
    requireNonEmptyId(contractId, 'contractId');
    return this.isContractUpgradeAuthorized(contractId, callerAddress);
  }

  // ── Document Hash Anchoring ────────────────────────────────────────────────

  async anchorDocumentHash(
    productId: string,
    label: string,
    hash: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const list = this.documentAnchors.get(productId) || [];
    list.push({ label, hash, timestamp: Date.now() });
    this.documentAnchors.set(productId, list);
    return formatMockTxId('anchor', productId);
  }

  async verifyDocumentHash(
    productId: string,
    hash: string,
    _callerAddress?: string,
  ): Promise<boolean> {
    requireNonEmptyId(productId, 'productId');
    const list = this.documentAnchors.get(productId) || [];
    return list.some((item) => item.hash === hash);
  }

  async getDocumentAnchors(productId: string, _callerAddress?: string): Promise<unknown[]> {
    requireNonEmptyId(productId, 'productId');
    return this.documentAnchors.get(productId) || [];
  }

  // ── Event Indexing & Audit Proofs ─────────────────────────────────────────

  async listEventsByActor(
    actor: string,
    offset: number,
    limit: number,
    _callerAddress?: string,
  ): Promise<string[]> {
    requireNonEmptyId(actor, 'actor');
    const matches: string[] = [];
    for (const list of this.events.values()) {
      for (const e of list) {
        if (e.actor.toLowerCase() === actor.toLowerCase()) {
          matches.push(e.productId);
        }
      }
    }
    return matches.slice(offset, offset + limit);
  }

  async listEventsByLocation(
    location: string,
    offset: number,
    limit: number,
    _callerAddress?: string,
  ): Promise<string[]> {
    requireNonEmptyId(location, 'location');
    const matches: string[] = [];
    for (const list of this.events.values()) {
      for (const e of list) {
        if (e.location.toLowerCase() === location.toLowerCase()) {
          matches.push(e.productId);
        }
      }
    }
    return matches.slice(offset, offset + limit);
  }

  async listEventsByType(
    eventType: string,
    offset: number,
    limit: number,
    _callerAddress?: string,
  ): Promise<string[]> {
    requireNonEmptyId(eventType, 'eventType');
    const matches: string[] = [];
    for (const list of this.events.values()) {
      for (const e of list) {
        if (e.eventType === eventType) {
          matches.push(e.productId);
        }
      }
    }
    return matches.slice(offset, offset + limit);
  }

  async getSignerProof(
    eventStableId: string,
    _callerAddress?: string,
  ): Promise<{ signer: string; payloadHash: string; timestamp: number } | null> {
    requireNonEmptyId(eventStableId, 'eventStableId');
    return {
      signer: 'GAB...MOCK_SIGNER',
      payloadHash: `0x${eventStableId}`,
      timestamp: Date.now(),
    };
  }

  async isEventReplayed(stableId: string, _callerAddress?: string): Promise<boolean> {
    requireNonEmptyId(stableId, 'stableId');
    return false;
  }

  async snapshotProductState(
    productId: string,
    snapshotHash: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const list = this.snapshots.get(productId) || [];
    list.push({ snapshotHash, timestamp: Date.now() });
    this.snapshots.set(productId, list);
    return formatMockTxId('snapshot', productId);
  }

  async getSnapshots(productId: string, _callerAddress?: string): Promise<unknown[]> {
    requireNonEmptyId(productId, 'productId');
    return this.snapshots.get(productId) || [];
  }

  // ── Delegation Operations ─────────────────────────────────────────────────

  async delegateActorAuthority(
    productId: string,
    delegatee: string,
    expiresAt: number,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const list = this.delegations.get(productId) || [];
    const newDelegation: Delegation = {
      delegationId: list.length + 1,
      productId,
      delegator: callerAddress,
      delegatee,
      expiresAt,
      revoked: false,
      createdAt: Date.now(),
    };
    list.push(newDelegation);
    this.delegations.set(productId, list);
    return formatMockTxId('delegate', productId);
  }

  async revokeDelegate(
    productId: string,
    delegationId: number,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const list = this.delegations.get(productId) || [];
    const item = list.find((d) => d.delegationId === delegationId);
    if (item) item.revoked = true;
    return formatMockTxId('revoke_delegate', productId);
  }

  async getActiveDelegations(productId: string): Promise<Delegation[]> {
    requireNonEmptyId(productId, 'productId');
    const list = this.delegations.get(productId) || [];
    const now = Date.now();
    return list.filter((d) => !d.revoked && d.expiresAt > now);
  }

  // ── Assembly Operations ───────────────────────────────────────────────────

  async registerAssembly(
    parentId: string,
    componentIds: string[],
    description: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(parentId, 'parentId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const assembly: ProductAssembly = {
      parentId,
      componentIds,
      registeredBy: callerAddress,
      registeredAt: Date.now(),
      description,
    };
    this.assemblies.set(parentId, assembly);
    return formatMockTxId('assembly', parentId);
  }

  async getAssembly(parentId: string): Promise<ProductAssembly | null> {
    requireNonEmptyId(parentId, 'parentId');
    return this.assemblies.get(parentId) ?? null;
  }

  async getParentsOfComponent(
    componentId: string,
    candidateParentIds: string[],
  ): Promise<string[]> {
    requireNonEmptyId(componentId, 'componentId');
    const parents: string[] = [];
    for (const pid of candidateParentIds) {
      const ass = this.assemblies.get(pid);
      if (ass && ass.componentIds.includes(componentId)) {
        parents.push(pid);
      }
    }
    return parents;
  }

  // ── Warranty Operations ───────────────────────────────────────────────────

  async registerWarranty(
    productId: string,
    durationSeconds: number,
    terms: string,
    termsRef: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const now = Date.now();
    const warranty: WarrantyInfo = {
      productId,
      durationSeconds,
      issuer: callerAddress,
      issuedAt: now,
      terms,
      termsRef,
      voided: false,
      voidedAt: 0,
    };
    this.warranties.set(productId, warranty);
    return formatMockTxId('warranty', productId);
  }

  async getWarranty(productId: string): Promise<WarrantyInfo | null> {
    requireNonEmptyId(productId, 'productId');
    return this.warranties.get(productId) ?? null;
  }

  async voidWarranty(productId: string, callerAddress: string): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const warranty = this.warranties.get(productId);
    if (warranty) {
      warranty.voided = true;
      warranty.voidedAt = Date.now();
    }
    return formatMockTxId('void_warranty', productId);
  }

  async isWarrantyActive(productId: string): Promise<boolean> {
    requireNonEmptyId(productId, 'productId');
    const warranty = this.warranties.get(productId);
    if (!warranty) return false;
    if (warranty.voided) return false;
    if (warranty.durationSeconds === 0) return true;
    return warranty.issuedAt + warranty.durationSeconds * 1000 > Date.now();
  }

  async fileWarrantyClaim(
    productId: string,
    claimId: string,
    description: string,
    proofRef: string,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(claimId, 'claimId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const list = this.claims.get(productId) || [];
    const now = Date.now();
    const claim: WarrantyClaim = {
      claimId,
      productId,
      claimant: callerAddress,
      description,
      proofRef,
      filedAt: now,
      status: 'Pending',
      updatedAt: now,
    };
    list.push(claim);
    this.claims.set(productId, list);
    return formatMockTxId('claim', claimId);
  }

  async listWarrantyClaims(productId: string): Promise<WarrantyClaim[]> {
    requireNonEmptyId(productId, 'productId');
    return this.claims.get(productId) || [];
  }

  async updateClaimStatus(
    productId: string,
    claimId: string,
    newStatus: ClaimStatus,
    callerAddress: string,
  ): Promise<string> {
    requireNonEmptyId(productId, 'productId');
    requireNonEmptyId(claimId, 'claimId');
    requireNonEmptyId(callerAddress, 'callerAddress');
    const list = this.claims.get(productId) || [];
    const claim = list.find((c) => c.claimId === claimId);
    if (claim) {
      claim.status = newStatus;
      claim.updatedAt = Date.now();
    }
    return formatMockTxId('claim_status', claimId);
  }
}
