/**
 * Offline POS snapshot helper (Day 28 backend part).
 * Frontend caches this payload in IndexedDB; queued transactions
 * replay through POST /transactions with the same Idempotency-Key.
 */
export type OfflineProductSnapshot = {
  id: string; sku: string; name: string; memberPrice: number; retailPrice: number; pv: number; stock: number;
};

export function buildOfflineSnapshot(products: OfflineProductSnapshot[]) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    count: products.length,
    products: products.map((p) => ({
      ...p,
      memberPrice: Math.round(p.memberPrice * 100) / 100,
      retailPrice: Math.round(p.retailPrice * 100) / 100,
    })),
  };
}

/** Validates a queued offline transaction before replay. */
export function validateQueuedTransaction(items: Array<{ productId: string; quantity: number }>): string[] {
  const errors: string[] = [];
  if (!items.length) errors.push("Keranjang kosong.");
  if (items.length > 100) errors.push("Maksimal 100 baris per transaksi.");
  for (const item of items) {
    if (!item.productId) errors.push("productId wajib diisi.");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) errors.push(`Qty ${item.productId} harus > 0.`);
  }
  return errors;
}
