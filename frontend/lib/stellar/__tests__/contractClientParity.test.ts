import { describe, expect, it } from 'vitest';
import { MockContractClient } from '../mock-contract-client';
import { LiveContractClient } from '../live-contract-client';
import type { ContractClient } from '../contract-client.interface';

/**
 * Every method declared on `ContractClient`, mirrored as an object literal.
 *
 * This is compile-time enforced against the interface: if a method is added
 * to or removed from `ContractClient` without updating this list, TypeScript
 * fails the build with a "missing property" / "excess property" error on the
 * object below (#614).
 */
const CONTRACT_CLIENT_METHOD_FLAGS: Record<keyof ContractClient, true> = {
  registerProduct: true,
  getProduct: true,
  listProducts: true,
  getProductCount: true,
  deactivateProduct: true,
  transferOwnership: true,
  addAuthorizedActor: true,
  removeAuthorizedActor: true,
  rotateOwnerKey: true,
  rotateAuthorizedActorKey: true,
  setCompliancePolicy: true,
  getCompliancePolicy: true,
  addTrackingEvent: true,
  addPrivateTrackingEvent: true,
  getTrackingEvents: true,
  fetchEventPage: true,
  fetchAllEvents: true,
  fetchProvenancePath: true,
  fetchAuthPolicy: true,
  getNonce: true,
  approveEvent: true,
  rejectEvent: true,
  getPendingEvents: true,
  getProvenanceRoot: true,
  registerUpgradeGuardian: true,
  revokeUpgradeGuardian: true,
  authorizeContractUpgrade: true,
  revokeContractUpgrade: true,
  getUpgradeGuardians: true,
  getAuthorizedContractUpgrades: true,
  isContractUpgradeAuthorized: true,
  validateContractUpgradeTarget: true,
  anchorDocumentHash: true,
  verifyDocumentHash: true,
  getDocumentAnchors: true,
  listEventsByActor: true,
  listEventsByLocation: true,
  listEventsByType: true,
  getSignerProof: true,
  isEventReplayed: true,
  snapshotProductState: true,
  getSnapshots: true,
  delegateActorAuthority: true,
  revokeDelegate: true,
  getActiveDelegations: true,
  registerAssembly: true,
  getAssembly: true,
  getParentsOfComponent: true,
  registerWarranty: true,
  getWarranty: true,
  voidWarranty: true,
  isWarrantyActive: true,
  fileWarrantyClaim: true,
  listWarrantyClaims: true,
  updateClaimStatus: true,
};

const CONTRACT_CLIENT_METHODS = Object.keys(CONTRACT_CLIENT_METHOD_FLAGS) as Array<
  keyof ContractClient
>;

describe('ContractClient parity between Mock and Live implementations (#614)', () => {
  const mock = new MockContractClient();
  const live = new LiveContractClient();

  it('covers every declared interface method (sanity check on the fixture list)', () => {
    expect(CONTRACT_CLIENT_METHODS.length).toBeGreaterThan(0);
  });

  it.each(CONTRACT_CLIENT_METHODS)('%s is implemented as a function on both clients', (method) => {
    expect(typeof mock[method]).toBe('function');
    expect(typeof live[method]).toBe('function');
  });

  it.each(CONTRACT_CLIENT_METHODS)('%s has matching arity on both clients', (method) => {
    const mockArity = (mock[method] as (...args: unknown[]) => unknown).length;
    const liveArity = (live[method] as (...args: unknown[]) => unknown).length;
    expect(liveArity).toBe(mockArity);
  });
});
