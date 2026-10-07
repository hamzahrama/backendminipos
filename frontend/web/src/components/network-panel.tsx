"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Member = { id: string; hniId: string; name: string; level: number; ownPv: number; groupPv: number; downlineCount: number; hiddenDownlineCount: number; downlines: Member[] };
type Network = { month: string; roots: Member[]; memberCount: number; totalPv: number; maxDepth: number; displayDepthLimit: number; externalUplines: string[] };
type Session = { accessToken: string; user: { tenant: { id: string } } };
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const monthNow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date());
const pv = (value: number) => value.toLocaleString("id-ID");

function flatten(members: Member[]): Member[] { return members.flatMap((member) => [member, ...flatten(member.downlines)]); }

function TreeNode({ member, selectedId, onSelect }: { member: Member; selectedId: string | null; onSelect: (member: Member) => void }) {
  return <li className="mt-3">
    <button className={`w-full rounded-lg border p-3 text-left ${selectedId === member.id ? "border-emerald-500 bg-emerald-50" : "bg-white"}`} onClick={() => onSelect(member)} type="button">
      <div className="flex flex-wrap justify-between gap-2"><strong>{member.name} <span className="font-normal text-slate-500">({member.hniId}) · level {member.level + 1}</span></strong><span className="text-sm">PV sendiri {pv(member.ownPv)} · PV jaringan {pv(member.groupPv)} · {member.downlineCount} downline</span></div>
      {member.hiddenDownlineCount > 0 && <small className="text-amber-700">+{member.hiddenDownlineCount} downline di bawah level {member.level + 1} tidak ditampilkan (tetap dihitung di PV jaringan)</small>}
    </button>
    {member.downlines.length > 0 && <ul className="ml-4 border-l pl-3">{member.downlines.map((child) => <TreeNode key={child.id} member={child} selectedId={selectedId} onSelect={onSelect} />)}</ul>}
  </li>;
}

export default function NetworkPanel({ session }: { session: Session }) {
  const [month, setMonth] = useState(monthNow);
  const [data, setData] = useState<Network | null>(null);
  const [selected, setSelected] = useState<Member | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", hniId: "", uplineHniId: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const headers = useMemo(() => ({ Authorization: `Bearer ${session.accessToken}`, "x-tenant-id": session.user.tenant.id }), [session.accessToken, session.user.tenant.id]);
  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`${apiUrl}/customers/network?month=${month}`, { headers });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message ?? "Jaringan gagal dimuat.");
    setData(body as Network);
    setSelected((current) => current ? flatten((body as Network).roots).find((member) => member.id === current.id) ?? null : null);
  }, [month, headers]);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Jaringan gagal dimuat.")); }, [load]);
  const members = useMemo(() => data ? flatten(data.roots).sort((a, b) => a.name.localeCompare(b.name)) : [], [data]);

  async function addDownline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const response = await fetch(`${apiUrl}/customers`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({
        name: form.name, phone: form.phone || undefined, hniId: form.hniId, uplineHniId: form.uplineHniId || undefined,
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message[0] : body.message ?? "Downline gagal disimpan.");
      setMessage(`${form.name} ditambahkan${form.uplineHniId ? ` di bawah ${form.uplineHniId}` : " sebagai member utama"}.`);
      setForm({ name: "", phone: "", hniId: "", uplineHniId: form.uplineHniId });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Downline gagal disimpan."); }
  }

  return <section className="space-y-5 p-5"><header><h1 className="text-2xl font-bold">Jaringan HNI</h1><p className="text-sm text-slate-600">Struktur disimpan di tabel jaringan dan diperbarui otomatis saat ID upline customer berubah. Tampilan dibatasi {data?.displayDepthLimit ?? 5} level.</p></header>
    <label className="flex items-center gap-3">Bulan PV <input className="rounded border px-3 py-2" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
    {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status" className="text-emerald-700">{message}</p>}
    <form className="grid gap-3 rounded-lg border p-4 md:grid-cols-5" onSubmit={addDownline}>
      <strong className="md:col-span-5">Tambah downline</strong>
      <input className="rounded border px-3 py-2" required minLength={2} maxLength={120} placeholder="Nama" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <input className="rounded border px-3 py-2" inputMode="tel" maxLength={32} placeholder="No. WhatsApp (opsional)" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
      <input className="rounded border px-3 py-2" required pattern="[A-Za-z0-9-]{4,32}" maxLength={32} placeholder="ID HNI" value={form.hniId} onChange={(event) => setForm({ ...form, hniId: event.target.value })} />
      <select className="rounded border px-3 py-2" value={form.uplineHniId} onChange={(event) => setForm({ ...form, uplineHniId: event.target.value })}><option value="">Tanpa upline (member utama)</option>{members.map((member) => <option key={member.id} value={member.hniId}>{member.name} · {member.hniId}</option>)}</select>
      <button className="button button-primary" type="submit">Simpan downline</button>
    </form>
    {data && <><div className="flex flex-wrap gap-8 rounded-lg bg-emerald-50 p-4"><p>Anggota <strong>{data.memberCount}</strong></p><p>PV jaringan <strong>{pv(data.totalPv)}</strong></p><p>Kedalaman <strong>{data.maxDepth} level</strong></p></div>
      {data.externalUplines.length > 0 && <p className="text-sm text-slate-600">Upline di luar toko ini (belum terdaftar sebagai customer): {data.externalUplines.join(", ")}</p>}
      {selected && <div className="rounded-lg border p-4"><div className="flex justify-between"><strong>Rekap PV per leg · {selected.name}</strong><button className="text-button" onClick={() => setSelected(null)} type="button">Tutup</button></div>
        <table className="product-table mt-2"><thead><tr><th>Leg (downline langsung)</th><th>ID HNI</th><th>Anggota di leg</th><th>PV leg</th><th>Porsi</th></tr></thead><tbody>
          {selected.downlines.map((leg) => <tr key={leg.id}><td>{leg.name}</td><td>{leg.hniId}</td><td>{leg.downlineCount + 1}</td><td>{pv(leg.groupPv)}</td><td>{selected.groupPv - selected.ownPv > 0 ? `${Math.round((leg.groupPv / (selected.groupPv - selected.ownPv)) * 100)}%` : "—"}</td></tr>)}
          {!selected.downlines.length && <tr><td className="empty-table" colSpan={5}>{selected.hiddenDownlineCount ? "Leg berada di bawah batas tampilan 5 level." : "Belum punya downline."}</td></tr>}
        </tbody></table></div>}
      {data.roots.length ? <ul>{data.roots.map((root) => <TreeNode key={root.id} member={root} selectedId={selected?.id ?? null} onSelect={setSelected} />)}</ul> : <p className="rounded border p-5 text-slate-600">Belum ada profil anggota ber-ID HNI.</p>}</>}
  </section>;
}
