import { describe, expect, it } from "vitest";
import { buildPvCsv, toPvCsvRows } from "./pv-csv";

const details = [
  { hniId: "HNI-1", name: "Bu Ani", sku: "SKU-A", product: "Madu", quantity: 2, totalPv: 20 },
  { hniId: "HNI-1", name: "Bu Ani", sku: "SKU-B", product: "Teh", quantity: 3, totalPv: 15 },
];

describe("pv-csv (Day 17)", () => {
  it("builds per-member-sku CSV with ; delimiter by default", () => {
    const csv = buildPvCsv(toPvCsvRows(details, "per-member-sku"));
    expect(csv).toContain("hni_id;nama;sku;produk;qty;total_pv");
    expect(csv).toContain("HNI-1;Bu Ani;SKU-A;Madu;2;20");
  });
  it("aggregates per-member mode", () => {
    const rows = toPvCsvRows(details, "per-member");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quantity: 5, totalPv: 35 });
  });
  it("supports comma delimiter and custom columns", () => {
    const csv = buildPvCsv(toPvCsvRows(details), { delimiter: ",", decimalComma: false, columns: ["hni_id", "total_pv"] });
    expect(csv.split("\n")[0]).toBe("hni_id,total_pv");
  });
  it("escapes delimiter inside cells", () => {
    const csv = buildPvCsv([{ hniId: "1", name: 'A;B', sku: "S", product: "P", quantity: 1, totalPv: 1 }]);
    expect(csv).toContain('"A;B"');
  });
});
