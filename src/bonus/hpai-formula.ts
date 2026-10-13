import { BonusSchemeConfig } from "./bonus-engine";

/**
 * Helper rumus bonus HPAI (Day 23/24 follow-up).
 * Skema resmi HPAI belum tersedia — modul ini menyediakan slot公式 yang
 * siap diisi owner tanpa mengubah engine. Semua rate 0–1, PV dalam poin.
 */
export type HpaiFormulaInput = {
  ownPv: number;
  groupPv: number;
  generationPv: number[];
  pvValueRp?: number;
};

export type HpaiPayout = {
  personalBonusRp: number;
  generationBonusRp: number[];
  totalBonusRp: number;
};

export function validateHpaiScheme(config: BonusSchemeConfig): string[] {
  const errors: string[] = [];
  if (config.isExample) errors.push("Skema masih contoh — ganti dengan marketing plan resmi HPAI.");
  if (!(config.pvValue > 0)) errors.push("pvValue (rupiah per PV) harus > 0.");
  if (!config.ranks.length) errors.push("Minimal satu peringkat harus didefinisikan.");
  for (const rank of config.ranks) {
    if (rank.personalRate < 0 || rank.personalRate > 1) errors.push(`personalRate ${rank.code} harus 0–1.`);
    for (const rate of rank.generationRates) {
      if (rate < 0 || rate > 1) errors.push(`generationRate ${rank.code} harus 0–1.`);
    }
  }
  return errors;
}

/** Pure payout math for one member — reused by engine, simulator, and offline export. */
export function calculateHpaiPayout(input: HpaiFormulaInput, personalRate: number, generationRates: number[]): HpaiPayout {
  const pvValue = input.pvValueRp ?? 1000;
  const personalBonusRp = Math.round(input.ownPv * pvValue * personalRate);
  const generationBonusRp = generationRates.map((rate, i) =>
    Math.round((input.generationPv[i] ?? 0) * pvValue * rate));
  return {
    personalBonusRp,
    generationBonusRp,
    totalBonusRp: personalBonusRp + generationBonusRp.reduce((s, b) => s + b, 0),
  };
}
