import type { Product } from "@/lib/types";

export const MOCK_PRODUCTS: Product[] = [
  {
    id: "prod-001",
    name: "Organic Coffee Beans",
    origin: "Ethiopia",
    owner: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    timestamp: 1710000000000,
    authorizedActors: [
      "GACTOR1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
      "GACTOR2ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
    ],
    ownershipHistory: [
      { owner: "GORIGINALOWNERABCDEFGHIJKLMNOPQRSTUVWXYZ", transferredAt: 1700000000000 },
      { owner: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ", transferredAt: 1710000000000 },
    ],
  },
  {
    id: "prod-002",
    name: "Fair Trade Cocoa",
    origin: "Ghana",
    owner: "GDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    timestamp: 1711000000000,
    authorizedActors: ["GACTOR3ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567"],
    ownershipHistory: [
      { owner: "GDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ", transferredAt: 1711000000000 },
    ],
  },
];

export function getProductById(id: string): Product | undefined {
  return MOCK_PRODUCTS.find((p) => p.id === id);
}
