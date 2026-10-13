export type PvCsvMode = "per-member" | "per-member-sku";

export type PvCsvRow = {
  hniId: string | null;
  name: string;
  sku: string;
  product: string;
  quantity: number;
  totalPv: number;
};

export type PvCsvOptions = {
  mode?: PvCsvMode;
  delimiter?: "," | ";" | "\t";
  decimalComma?: boolean;
  includeHeader?: boolean;
  columns?: string[];
  columnTitles?: Record<string, string>;
};

export const DEFAULT_PV_COLUMNS = ["hni_id", "nama", "sku", "produk", "qty", "total_pv"] as const;

const CELL_GETTERS: Record<string, (row: PvCsvRow) => string | number> = {
  hni_id: (r) => r.hniId ?? "",
  nama: (r) => r.name,
  sku: (r) => r.sku,
  produk: (r) => r.product,
  qty: (r) => r.quantity,
  total_pv: (r) => r.totalPv,
};

/** Aggregates per member x SKU details into per-member rows for the HPAI upload format. */
export function toPvCsvRows(
  details: Array<{ hniId: string | null; name: string; sku: string; product: string; quantity: number; totalPv: number }>,
  mode: PvCsvMode = "per-member-sku",
): PvCsvRow[] {
  if (mode === "per-member-sku") return details.map((d) => ({ ...d }));
  const grouped = new Map<string, PvCsvRow>();
  for (const d of details) {
    const key = d.hniId ?? d.name;
    const row = grouped.get(key) ?? { hniId: d.hniId, name: d.name, sku: "", product: "", quantity: 0, totalPv: 0 };
    row.quantity += d.quantity;
    row.totalPv += d.totalPv;
    grouped.set(key, row);
  }
  return [...grouped.values()];
}

function formatNumber(value: number, decimalComma: boolean): string {
  const rounded = Math.round(value * 100) / 100;
  const text = String(rounded);
  return decimalComma ? text.replace(".", ",") : text;
}

function escapeCell(text: string, delimiter: string): string {
  return text.includes(delimiter) || text.includes('"') || text.includes("\n")
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

/** Builds the final HPAI-uploadable CSV text (Day 17 deliverable). */
export function buildPvCsv(details: PvCsvRow[], options: PvCsvOptions = {}): string {
  const delimiter = options.delimiter ?? ";";
  const decimalComma = options.decimalComma ?? delimiter === ";";
  const includeHeader = options.includeHeader ?? true;
  const columns = (options.columns?.length ? options.columns : [...DEFAULT_PV_COLUMNS])
    .filter((c) => c in CELL_GETTERS);
  const titles = options.columnTitles ?? {};
  const lines: string[] = [];
  if (includeHeader) {
    lines.push(columns.map((c) => escapeCell(titles[c] ?? c, delimiter)).join(delimiter));
  }
  for (const row of details) {
    lines.push(columns.map((c) => {
      const raw = CELL_GETTERS[c](row);
      const text = typeof raw === "number" ? formatNumber(raw, decimalComma) : raw;
      return escapeCell(text, delimiter);
    }).join(delimiter));
  }
  return lines.join("\n") + "\n";
}
