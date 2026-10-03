"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Image from "next/image";

type AuthMode = "login" | "register";

type AuthSession = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: {
    id: string;
    name: string;
    email: string;
    tenant: { id: string; name: string; slug: string };
    roles: string[];
    permissions: string[];
  };
};

type FormValues = {
  tenantName: string;
  ownerName: string;
  email: string;
  password: string;
  tenantSlug: string;
};

type AuthProfile = {
  userId: string;
  email: string;
  tenantId: string;
  tenantSlug: string;
  roles: string[];
};

type Category = { id: string; name: string };
type ProductImage = { id: string; url: string; key: string; alt: string | null };
type Product = {
  id: string; name: string; sku: string; barcode: string | null; description: string | null;
  categoryId: string | null; category: Category | null; memberPrice: string; retailPrice: string;
  pv: string; isActive: boolean; images: ProductImage[];
};
type ProductPage = { items: Product[]; page: number; limit: number; total: number; totalPages: number };

const emptyProduct = {
  name: "", sku: "", barcode: "", description: "", categoryId: "",
  memberPrice: "", retailPrice: "", pv: "0", isActive: true,
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function rotateSession(session: AuthSession): Promise<AuthSession> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": session.user.tenant.id,
    },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? "Sesi berakhir. Silakan masuk kembali.");
  return result as AuthSession;
}

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [values, setValues] = useState<FormValues>({
    tenantName: "",
    ownerName: "",
    email: "",
    password: "",
    tenantSlug: "",
  });
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!session) return;

    let active = true;
    const refreshAfter = Math.max(session.expiresIn * 1000 - 60_000, 10_000);
    const timeout = window.setTimeout(() => {
      void rotateSession(session)
        .then((nextSession) => {
          if (active) setSession(nextSession);
        })
        .catch((caught: unknown) => {
          if (!active) return;
          setSession(null);
          setProfile(null);
          setError(caught instanceof Error ? caught.message : "Sesi berakhir. Silakan masuk kembali.");
        });
    }, refreshAfter);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }

    let active = true;
    async function loadProfile(currentSession: AuthSession, alreadyRefreshed = false) {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${currentSession.accessToken}`,
          "x-tenant-id": currentSession.user.tenant.id,
        },
      });

      if (response.status === 401 && !alreadyRefreshed) {
        const nextSession = await rotateSession(currentSession);
        if (active) setSession(nextSession);
        return loadProfile(nextSession, true);
      }

      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Profil toko tidak dapat dimuat.");
      if (active) setProfile(result as AuthProfile);
    }

    void loadProfile(session).catch((caught: unknown) => {
      if (!active) return;
      setError(caught instanceof Error ? caught.message : "Profil toko tidak dapat dimuat.");
    });

    return () => {
      active = false;
    };
  }, [session]);

  function updateField(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    const endpoint = mode === "register" ? "register-tenant" : "login";
    const body =
      mode === "register"
        ? {
            tenantName: values.tenantName,
            ownerName: values.ownerName,
            email: values.email,
            password: values.password,
          }
        : {
            email: values.email,
            password: values.password,
            tenantSlug: values.tenantSlug,
          };

    try {
      const response = await fetch(`${API_URL}/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();

      if (!response.ok) {
        const message = Array.isArray(result.message) ? result.message[0] : result.message;
        throw new Error(message ?? "Permintaan belum berhasil. Coba lagi.");
      }

      setSession(result as AuthSession);
      setNotice(mode === "register" ? "Toko dan akun pemilik berhasil dibuat." : "Berhasil masuk.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tidak dapat terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  async function copyAccessToken() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.accessToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Browser tidak mengizinkan menyalin token. Anda tetap bisa memakai respons API.");
    }
  }

  async function logout() {
    if (!session) return;
    let logoutError = "";
    try {
      const response = await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
          "x-tenant-id": session.user.tenant.id,
        },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (!response.ok) logoutError = "Sesi ditutup di browser, tetapi server belum menerima permintaan keluar.";
    } catch {
      logoutError = "Koneksi terputus. Sesi lokal ditutup, tetapi server belum menerima permintaan keluar.";
    } finally {
      setSession(null);
      setProfile(null);
      setCopied(false);
    }
    setError(logoutError);
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setNotice("");
  }

  function useAnotherAccount() {
    if (!session) return;
    void logout();
    setValues((current) => ({
      ...current,
      email: session.user.email,
      tenantSlug: session.user.tenant.slug,
      password: "",
    }));
    setSession(null);
    changeMode("login");
  }

  return (
    <main className="auth-shell">
      <div className="auth-layout">
        <section className="intro-panel" aria-label="Tentang HNI POS">
          <div className="brand-mark font-bold" aria-hidden="true">H</div>
          <p className="eyebrow">HNI POS</p>
          <h1>Kelola toko dengan lebih tenang.</h1>
          <p className="intro-copy">
            Satu tempat untuk menata penjualan, stok, dan kebutuhan toko HNI Anda.
          </p>
          <div className="intro-footer">
            <span className="online-dot" />
            Fondasi toko Anda siap digunakan
          </div>
        </section>

        <section className="form-panel" aria-labelledby="auth-title">
          {session ? (
            <div className="session-view">
              <div className="success-icon" aria-hidden="true">✓</div>
              <p className="eyebrow">AUTENTIKASI BERHASIL</p>
              <h2 id="auth-title">Selamat datang, {session.user.name}.</h2>
              <p className="form-description">
                Anda masuk ke <strong>{session.user.tenant.name}</strong> sebagai{" "}
                {session.user.roles.join(", ")}.
              </p>
              {profile ? <CatalogDashboard session={session} /> : <div className="dashboard-empty"><h3>Menyiapkan dashboard…</h3></div>}
              <div className="token-card">
                <div><strong>Sesi aktif</strong><span>{session.user.tenant.slug} · berlaku {Math.floor(session.expiresIn / 60)} menit</span></div>
                <button className="button button-secondary" onClick={copyAccessToken} type="button">{copied ? "Tersalin" : "Salin JWT"}</button>
              </div>
              {error && <p className="feedback error" role="alert">{error}</p>}
              <button className="text-button" onClick={logout} type="button">
                Keluar
              </button>
              <button className="text-button" onClick={useAnotherAccount} type="button">
                Masuk dengan akun lain
              </button>
            </div>
          ) : (
            <>
              <p className="eyebrow">MULAI DI SINI</p>
              <h2 id="auth-title">{mode === "login" ? "Masuk ke toko" : "Daftarkan toko"}</h2>
              <p className="form-description">
                {mode === "login"
                  ? "Masukkan akun dan slug toko untuk melanjutkan."
                  : "Buat ruang kerja toko dan akun pemilik dalam beberapa langkah."}
              </p>

              <div className="mode-switch" role="tablist" aria-label="Pilih autentikasi">
                <button
                  aria-selected={mode === "login"}
                  className={mode === "login" ? "mode-tab active" : "mode-tab"}
                  onClick={() => changeMode("login")}
                  role="tab"
                  type="button"
                >
                  Masuk
                </button>
                <button
                  aria-selected={mode === "register"}
                  className={mode === "register" ? "mode-tab active" : "mode-tab"}
                  onClick={() => changeMode("register")}
                  role="tab"
                  type="button"
                >
                  Daftar toko
                </button>
              </div>

              <form className="auth-form" onSubmit={submit}>
                {mode === "register" ? (
                  <>
                    <label>
                      Nama toko
                      <input
                        autoComplete="organization"
                        maxLength={100}
                        minLength={2}
                        onChange={(event) => updateField("tenantName", event.target.value)}
                        placeholder="Contoh: Toko Sehat Ibu"
                        required
                        value={values.tenantName}
                      />
                    </label>
                    <label>
                      Nama pemilik
                      <input
                        autoComplete="name"
                        maxLength={100}
                        minLength={2}
                        onChange={(event) => updateField("ownerName", event.target.value)}
                        placeholder="Nama lengkap"
                        required
                        value={values.ownerName}
                      />
                    </label>
                  </>
                ) : (
                  <label>
                    Slug toko
                    <input
                      autoComplete="organization"
                      maxLength={100}
                      onChange={(event) => updateField("tenantSlug", event.target.value)}
                      placeholder="contoh: toko-sehat-ibu"
                      required
                      value={values.tenantSlug}
                    />
                    <span className="field-hint">Slug diberikan saat toko didaftarkan.</span>
                  </label>
                )}

                <label>
                  Email
                  <input
                    autoComplete="email"
                    maxLength={254}
                    onChange={(event) => updateField("email", event.target.value)}
                    placeholder="nama@email.com"
                    required
                    type="email"
                    value={values.email}
                  />
                </label>
                <label>
                  Password
                  <input
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    maxLength={72}
                    minLength={8}
                    onChange={(event) => updateField("password", event.target.value)}
                    placeholder="Minimal 8 karakter"
                    required
                    type="password"
                    value={values.password}
                  />
                </label>

                {error && <p className="feedback error" role="alert">{error}</p>}
                {notice && <p className="feedback success" role="status">{notice}</p>}
                <button className="button button-primary" disabled={loading} type="submit">
                  {loading ? "Memproses…" : mode === "login" ? "Masuk ke toko" : "Buat toko dan akun"}
                </button>
              </form>
              <p className="security-note">Password Anda disimpan dalam bentuk hash yang aman.</p>
            </>
          )}
        </section>
      </div>
      <footer className="page-footer">HNI POS <span>•</span> Inventaris dan penjualan dalam satu alur</footer>
    </main>
  );
}

function CatalogDashboard({ session }: { session: AuthSession }) {
  const [products, setProducts] = useState<ProductPage | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ ...emptyProduct });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "x-tenant-id": session.user.tenant.id,
        ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(Array.isArray(result?.message) ? result.message[0] : result?.message ?? "Permintaan belum berhasil.");
    return result;
  }

  async function loadCatalog(nextPage = page, nextSearch = search) {
    const query = new URLSearchParams({ page: String(nextPage), limit: "8", search: nextSearch });
    const [productResult, categoryResult] = await Promise.all([
      api(`/products?${query.toString()}`), api("/categories"),
    ]);
    setProducts(productResult as ProductPage);
    setCategories(categoryResult as Category[]);
  }

  useEffect(() => {
    void loadCatalog().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Data produk gagal dimuat."));
    // Initial load follows the current authenticated session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  function resetForm() { setEditingId(null); setForm({ ...emptyProduct }); setSelectedImage(null); }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const payload = {
        ...form,
        barcode: form.barcode || undefined,
        description: form.description || undefined,
        categoryId: form.categoryId || undefined,
        memberPrice: Number(form.memberPrice), retailPrice: Number(form.retailPrice), pv: Number(form.pv || 0),
      };
      const product = await api(editingId ? `/products/${editingId}` : "/products", {
        method: editingId ? "PATCH" : "POST", body: JSON.stringify(payload),
      }) as Product;
      if (selectedImage) {
        const upload = await api("/products/images/presign", {
          method: "POST", body: JSON.stringify({ fileName: selectedImage.name, contentType: selectedImage.type, size: selectedImage.size }),
        }) as { key: string; uploadUrl: string; publicUrl: string };
        const uploaded = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": selectedImage.type }, body: selectedImage });
        if (!uploaded.ok) throw new Error("Gambar gagal diunggah ke storage. Periksa konfigurasi CORS bucket.");
        await api(`/products/${product.id}/images`, {
          method: "POST", body: JSON.stringify({ key: upload.key, url: upload.publicUrl, alt: form.name, position: 0 }),
        });
      }
      resetForm(); setMessage(editingId ? "Produk berhasil diperbarui." : "Produk berhasil ditambahkan.");
      await loadCatalog();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Produk gagal disimpan."); }
    finally { setBusy(false); }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!categoryName.trim()) return;
    setError("");
    try { await api("/categories", { method: "POST", body: JSON.stringify({ name: categoryName }) }); setCategoryName(""); await loadCatalog(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Kategori gagal dibuat."); }
  }

  async function editProduct(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name, sku: product.sku, barcode: product.barcode ?? "", description: product.description ?? "",
      categoryId: product.categoryId ?? "", memberPrice: String(product.memberPrice), retailPrice: String(product.retailPrice),
      pv: String(product.pv), isActive: product.isActive,
    });
    setSelectedImage(null);
  }

  async function removeProduct(product: Product) {
    if (!window.confirm(`Hapus produk “${product.name}”?`)) return;
    try { await api(`/products/${product.id}`, { method: "DELETE" }); await loadCatalog(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Produk gagal dihapus."); }
  }

  async function manageCategory(category: Category) {
    const name = window.prompt("Ubah nama kategori", category.name);
    if (name === null) return;
    try {
      if (!name.trim()) await api(`/categories/${category.id}`, { method: "DELETE" });
      else await api(`/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      await loadCatalog();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Kategori gagal diperbarui."); }
  }

  return (
    <div className="catalog-dashboard">
      <div className="catalog-heading"><div><span className="dashboard-label">MASTER DATA</span><h3>Produk toko</h3><p>Kelola katalog dan harga produk Anda.</p></div><span className="product-count">{products?.total ?? 0} produk</span></div>
      {error && <p className="feedback error" role="alert">{error}</p>}
      {message && <p className="feedback success" role="status">{message}</p>}
      <section className="catalog-panel">
        <h4>{editingId ? "Edit produk" : "Tambah produk"}</h4>
        <form className="product-form" onSubmit={saveProduct}>
          <label>Nama produk<input required maxLength={160} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label>SKU<input required maxLength={64} value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></label>
          <label>Kategori<select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}><option value="">Tanpa kategori</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Harga member<input required min="0" step="1" type="number" value={form.memberPrice} onChange={e => setForm({ ...form, memberPrice: e.target.value })} /></label>
          <label>Harga retail<input required min="0" step="1" type="number" value={form.retailPrice} onChange={e => setForm({ ...form, retailPrice: e.target.value })} /></label>
          <label>PV<input min="0" step="0.01" type="number" value={form.pv} onChange={e => setForm({ ...form, pv: e.target.value })} /></label>
          <label className="wide-field">Deskripsi<textarea maxLength={2000} rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
          <label className="wide-field">Gambar produk<input accept="image/jpeg,image/png,image/webp" type="file" onChange={(e: ChangeEvent<HTMLInputElement>) => setSelectedImage(e.target.files?.[0] ?? null)} /><span className="field-hint">JPEG, PNG, WebP · maksimal 10 MB</span></label>
          <label className="checkbox-field"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Produk aktif</label>
          <div className="form-actions"><button className="button button-primary" disabled={busy} type="submit">{busy ? "Menyimpan…" : editingId ? "Simpan perubahan" : "Tambah produk"}</button>{editingId && <button className="button button-secondary" onClick={resetForm} type="button">Batal</button>}</div>
        </form>
      </section>
      <section className="catalog-panel">
        <div className="section-title"><h4>Kategori</h4><form className="category-add" onSubmit={addCategory}><input aria-label="Nama kategori baru" maxLength={80} placeholder="Nama kategori" value={categoryName} onChange={e => setCategoryName(e.target.value)} /><button className="button button-secondary" type="submit">Tambah</button></form></div>
        <div className="category-list">{categories.length ? categories.map(category => <button key={category.id} className="category-chip" onClick={() => void manageCategory(category)} type="button">{category.name}<span>⋯</span></button>) : <span className="empty-note">Belum ada kategori.</span>}</div>
        <p className="field-hint">Pilih kategori untuk mengubah nama. Nama kosong akan menghapusnya.</p>
      </section>
      <section className="catalog-panel">
        <div className="section-title"><h4>Daftar produk</h4><input className="search-input" aria-label="Cari produk" placeholder="Cari nama, SKU, barcode…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); void loadCatalog(1, e.target.value); }} /></div>
        <div className="product-table-wrap"><table className="product-table"><thead><tr><th>Produk</th><th>Kategori</th><th>Harga member</th><th>Harga retail</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
          {products?.items.map(product => <tr key={product.id}><td><div className="product-cell">{product.images[0] ? <Image src={product.images[0].url} alt={product.images[0].alt ?? product.name} width={34} height={34} unoptimized /> : <span className="product-placeholder">{product.name.slice(0, 1).toUpperCase()}</span>}<span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td><td>{product.category?.name ?? "—"}</td><td>{Number(product.memberPrice).toLocaleString("id-ID")}</td><td>{Number(product.retailPrice).toLocaleString("id-ID")}</td><td><span className={product.isActive ? "status-active" : "status-inactive"}>{product.isActive ? "Aktif" : "Nonaktif"}</span></td><td><button className="row-action" onClick={() => void editProduct(product)} type="button">Edit</button><button className="row-action danger-action" onClick={() => void removeProduct(product)} type="button">Hapus</button></td></tr>)}
          {products && products.items.length === 0 && <tr><td className="empty-table" colSpan={6}>Belum ada produk yang cocok.</td></tr>}
        </tbody></table></div>
        <div className="pagination"><span>{products?.total ?? 0} produk · halaman {products?.page ?? 1} dari {Math.max(products?.totalPages ?? 0, 1)}</span><div><button className="button button-secondary" disabled={page <= 1} onClick={() => { const next = page - 1; setPage(next); void loadCatalog(next); }} type="button">Sebelumnya</button><button className="button button-secondary" disabled={!products || page >= products.totalPages} onClick={() => { const next = page + 1; setPage(next); void loadCatalog(next); }} type="button">Berikutnya</button></div></div>
      </section>
    </div>
  );
}
