"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Session = { accessToken: string; user: { tenant: { id: string } } };
type Rank = { code: string; name: string; minOwnPv: number; minGroupPv: number; personalRate: number; generationRates: number[] };
type Badge = { name: string; minPv: number };
type Scheme = { name: string; isExample: boolean; pvValue: number; ranks: Rank[]; badges: Badge[]; updatedAt: string | null };
type RankRef = { code: string; name: string } | null;
type LeaderRow = { position: number; customerId: string; name: string; hniId: string; ownPv: number; groupPv: number; rank: RankRef; badge: string | null };
type MemberBonus = { name: string; ownPv: number; groupPv: number; rank: RankRef; personalBonus: number; generationBonus: Array<{ generation: number; pv: number; rate: number; bonus: number }>; totalBonus: number };
type Simulation = { member: { before: MemberBonus; after: MemberBonus; difference: number }; changes: Array<{ customerId: string; name: string; fromPv: number; toPv: number; rankBefore: RankRef; rankAfter: RankRef }> };
type Change = { customerId: string; mode: "rank" | "pv"; value: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const monthNow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date());
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const percent = (rate: number) => `${Math.round(rate * 10000) / 100}%`;
const badgeClass: Record<string, string> = { Bronze: "bg-amber-100 text-amber-800", Silver: "bg-slate-200 text-slate-800", Gold: "bg-yellow-100 text-yellow-800", Diamond: "bg-sky-100 text-sky-800" };

function BonusBreakdown({ title, bonus, pvValue }: { title: string; bonus: MemberBonus; pvValue: number }) {
  return <div className="rounded-lg border p-3"><strong>{title}</strong>
    <p className="text-sm">Peringkat: <b>{bonus.rank?.name ?? "Belum memenuhi syarat"}</b> · PV sendiri {bonus.ownPv} · PV grup {bonus.groupPv}</p>
    <ul className="text-sm"><li>Bonus pribadi: {money.format(bonus.personalBonus)}</li>{bonus.generationBonus.map((item) => <li key={item.generation}>Generasi {item.generation}: {item.pv} PV × {money.format(pvValue)} × {percent(item.rate)} = {money.format(item.bonus)}</li>)}</ul>
    <p className="mt-1">Total: <b>{money.format(bonus.totalBonus)}</b></p></div>;
}

export default function BonusPanel({ session }: { session: Session }) {
  const [month, setMonth] = useState(monthNow);
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [schemeText, setSchemeText] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [memberId, setMemberId] = useState("");
  const [changes, setChanges] = useState<Change[]>([{ customerId: "", mode: "rank", value: "" }]);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const headers = useMemo(() => ({ Authorization: `Bearer ${session.accessToken}`, "x-tenant-id": session.user.tenant.id, "Content-Type": "application/json" }), [session.accessToken, session.user.tenant.id]);
  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    const body = await response.json();
    if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message[0] : body.message ?? "Permintaan gagal.");
    return body;
  }, [headers]);

  const load = useCallback(async () => {
    setError("");
    const [schemeBody, boardBody] = await Promise.all([api("/bonus/scheme"), api(`/bonus/leaderboard?month=${month}`)]);
    const { updatedAt: _updatedAt, ...editable } = schemeBody as Scheme;
    setScheme(schemeBody as Scheme); setSchemeText(JSON.stringify(editable, null, 2));
    setLeaderboard((boardBody as { rows: LeaderRow[] }).rows);
  }, [api, month]);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Data bonus gagal dimuat.")); }, [load]);

  async function saveScheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const parsed = JSON.parse(schemeText) as Omit<Scheme, "updatedAt">;
      await api("/bonus/scheme", { method: "PUT", body: JSON.stringify(parsed) });
      setMessage("Skema bonus disimpan."); await load();
    } catch (cause) { setError(cause instanceof SyntaxError ? "Format JSON skema tidak valid." : cause instanceof Error ? cause.message : "Skema gagal disimpan."); }
  }

  async function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSimulation(null);
    try {
      const payload = changes.filter((change) => change.customerId && change.value).map((change) => change.mode === "rank"
        ? { customerId: change.customerId, targetRankCode: change.value } : { customerId: change.customerId, ownPv: Number(change.value) });
      setSimulation(await api("/bonus/simulate", { method: "POST", body: JSON.stringify({ month, customerId: memberId, changes: payload }) }) as Simulation);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Simulasi gagal."); }
  }

  return <section className="space-y-5 p-5">
    <header><h1 className="text-2xl font-bold">Bonus & leaderboard</h1><p className="text-sm text-slate-600">Simulasi bonus memakai skema yang dapat diatur toko dan PV jaringan per bulan.</p></header>
    <label className="flex items-center gap-3">Bulan PV <input className="rounded border px-3 py-2" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
    {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status" className="text-emerald-700">{message}</p>}
    {scheme?.isExample && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Skema aktif masih <b>contoh</b>, bukan rumus resmi HPAI. Ganti angka peringkat, nilai PV, dan persentase generasi sesuai marketing plan resmi sebelum hasil simulasi dipakai.</p>}

    <div className="rounded-lg border p-4"><h2 className="font-bold">Leaderboard PV {month}</h2>
      <table className="product-table mt-2"><thead><tr><th>#</th><th>Member</th><th>ID HNI</th><th>PV sendiri</th><th>PV grup</th><th>Peringkat</th><th>Badge</th></tr></thead><tbody>
        {leaderboard.map((row) => <tr key={row.customerId}><td>{row.position}</td><td>{row.name}</td><td>{row.hniId}</td><td>{row.ownPv}</td><td>{row.groupPv}</td><td>{row.rank?.name ?? "—"}</td><td>{row.badge ? <span className={`rounded px-2 py-0.5 text-xs font-bold ${badgeClass[row.badge] ?? "bg-emerald-100"}`}>{row.badge}</span> : "—"}</td></tr>)}
        {!leaderboard.length && <tr><td className="empty-table" colSpan={7}>Belum ada member ber-ID HNI.</td></tr>}
      </tbody></table></div>

    <form className="space-y-3 rounded-lg border p-4" onSubmit={simulate}><h2 className="font-bold">Simulator: &quot;jika downline naik level, bonus saya?&quot;</h2>
      <label className="flex flex-wrap items-center gap-3">Member yang dihitung<select className="rounded border px-3 py-2" required value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">Pilih member</option>{leaderboard.map((row) => <option key={row.customerId} value={row.customerId}>{row.name} · {row.hniId}</option>)}</select></label>
      {changes.map((change, index) => <div className="flex flex-wrap items-center gap-2" key={index}>
        <select className="rounded border px-3 py-2" value={change.customerId} onChange={(event) => setChanges(changes.map((item, i) => i === index ? { ...item, customerId: event.target.value } : item))}><option value="">Pilih downline</option>{leaderboard.filter((row) => row.customerId !== memberId).map((row) => <option key={row.customerId} value={row.customerId}>{row.name}</option>)}</select>
        <select className="rounded border px-3 py-2" value={change.mode} onChange={(event) => setChanges(changes.map((item, i) => i === index ? { ...item, mode: event.target.value as Change["mode"], value: "" } : item))}><option value="rank">naik ke peringkat</option><option value="pv">PV sendiri menjadi</option></select>
        {change.mode === "rank" ? <select className="rounded border px-3 py-2" value={change.value} onChange={(event) => setChanges(changes.map((item, i) => i === index ? { ...item, value: event.target.value } : item))}><option value="">Pilih peringkat</option>{scheme?.ranks.map((rank) => <option key={rank.code} value={rank.code}>{rank.name}</option>)}</select>
          : <input className="w-28 rounded border px-3 py-2" min="0" step="0.01" type="number" value={change.value} onChange={(event) => setChanges(changes.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} />}
        {changes.length > 1 && <button className="text-button" onClick={() => setChanges(changes.filter((_, i) => i !== index))} type="button">Hapus</button>}
      </div>)}
      <div className="flex gap-3"><button className="text-button" onClick={() => setChanges([...changes, { customerId: "", mode: "rank", value: "" }])} type="button">+ Skenario</button><button className="button button-primary" disabled={!memberId} type="submit">Hitung simulasi</button></div>
      {simulation && scheme && <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2"><BonusBreakdown title="Saat ini" bonus={simulation.member.before} pvValue={scheme.pvValue} /><BonusBreakdown title="Setelah skenario" bonus={simulation.member.after} pvValue={scheme.pvValue} /></div>
        <p className="rounded bg-emerald-50 p-3">Selisih bonus: <b>{simulation.member.difference >= 0 ? "+" : ""}{money.format(simulation.member.difference)}</b></p>
        <ul className="text-sm">{simulation.changes.map((item) => <li key={item.customerId}>{item.name}: PV {item.fromPv} → {item.toPv} · {item.rankBefore?.name ?? "tanpa peringkat"} → {item.rankAfter?.name ?? "tanpa peringkat"}</li>)}</ul>
      </div>}
    </form>

    <form className="space-y-3 rounded-lg border p-4" onSubmit={saveScheme}><h2 className="font-bold">Skema bonus (dapat dikonfigurasi)</h2>
      <p className="text-sm text-slate-600">Atur dalam format JSON: <code>pvValue</code> (rupiah per 1 PV), <code>ranks</code> (kode, nama, syarat PV sendiri & grup, persentase bonus pribadi, persentase per generasi sebagai 0–1), dan <code>badges</code> (nama & minimal PV bulanan). Set <code>isExample</code> ke false setelah memakai angka resmi.</p>
      <textarea aria-label="Skema bonus JSON" className="h-72 w-full rounded border p-3 font-mono text-xs" spellCheck={false} value={schemeText} onChange={(event) => setSchemeText(event.target.value)} />
      <div className="flex gap-3"><button className="button button-primary" type="submit">Simpan skema</button>{scheme?.updatedAt && <span className="text-sm text-slate-500">Terakhir diubah {new Date(scheme.updatedAt).toLocaleString("id-ID")}</span>}</div>
    </form>
  </section>;
}
