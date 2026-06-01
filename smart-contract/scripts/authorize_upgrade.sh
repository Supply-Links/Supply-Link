#!/usr/bin/env bash
# Authorize a new Soroban contract upgrade target on the live Supply-Link contract.
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
SOURCE="${SOURCE:?Set SOURCE to your Stellar account alias}"
CONTRACT_ID="${CONTRACT_ID:?Set CONTRACT_ID to the live contract address}"
NEW_CONTRACT="${NEW_CONTRACT:?Set NEW_CONTRACT to the new contract address}"
GUARDIAN="${GUARDIAN:-$SOURCE}"

echo "Authorizing upgrade target $NEW_CONTRACT on contract $CONTRACT_ID as guardian $GUARDIAN..."

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$SOURCE" \
  -- authorize_contract_upgrade "$GUARDIAN" "$NEW_CONTRACT"
