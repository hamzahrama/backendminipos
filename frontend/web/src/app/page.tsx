"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import PosTerminal from "../components/pos-terminal";
import CustomersPanel from "../components/customers-panel";
import VouchersPanel from "../components/vouchers-panel";
import NetworkPanel from "../components/network-panel";
import StorefrontPanel from "../components/storefront-panel";
import WhatsAppLogsPanel from "../components/whatsapp-logs-panel";
import BonusPanel from "../components/bonus-panel";

const ReportsPanel = dynamic(() => import("../components/reports-panel"), { ssr: false });
const ProfitLossPanel = dynamic(() => import("../components/profit-loss-panel"), { ssr: false });
const PvReportPanel = dynamic(() => import("../components/pv-report-panel"), { ssr: false });

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
  pv: string; isActive: boolean; deletedAt: string | null; images: ProductImage[];
  lowStockLimit: number;
};
type ProductPage = { items: Product[]; page: number; limit: number; total: number; totalPages: number };
type ImportRow = {
  name: string; sku: string; barcode?: string; description?: string; category?: string;
  memberPrice: number; retailPrice: number; pv?: number; rowNumber: number; errors: string[];
};
type ImportPreview = { total: number; validCount: number; invalidCount: number; rows: ImportRow[] };
type PriceHistory = {
  id: string; previousMemberPrice: string; previousRetailPrice: string;
  memberPrice: string; retailPrice: string; source: string; createdAt: string;
};
type Warehouse = { id: string; name: string; code: string; isDefault: boolean };
type ProductBatch = {
  id: string; batchCode: string; expiryDate: string | null; quantity: string; receivedQuantity: string;
  unitCost: string | null; warehouse: Warehouse;
};
type InventoryAlert = {
  id: string; kind: "LOW_STOCK" | "EXPIRY"; message: string; quantity: string | null;
  expiresAt: string | null; product: { id: string; name: string; sku: string; lowStockLimit: number };
  batch: { batchCode: string; expiryDate: string | null } | null;
};
type FefoAllocation = { batchId: string; batchCode: string; warehouseId: string; quantity: number; expiryDate: string | null };

const emptyProduct = {
  name: "", sku: "", barcode: "", description: "", categoryId: "",
  memberPrice: "", retailPrice: "", pv: "0", lowStockLimit: "5", isActive: true,
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
  const [activePanel, setActivePanel] = useState<"catalog" | "pos" | "customers" | "vouchers" | "reports" | "profit-loss" | "pv" | "network" | "storefront" | "whatsapp" | "bonus">("catalog");
  const [products, setProducts] = useState<ProductPage | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ ...emptyProduct });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [memberBulkPrice, setMemberBulkPrice] = useState("");
  const [retailBulkPrice, setRetailBulkPrice] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [priceHistory, setPriceHistory] = useState<{ productName: string; rows: PriceHistory[] } | null>(null);
  const [productDetail, setProductDetail] = useState<Product | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([]);
  const [stockSummary, setStockSummary] = useState<Array<{ id: string; quantity: number }>>([]);
  const [warehouseForm, setWarehouseForm] = useState({ name: "", code: "" });
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockBatches, setStockBatches] = useState<ProductBatch[]>([]);
  const [stockForm, setStockForm] = useState({ batchCode: "", expiryDate: "", quantity: "", unitCost: "", warehouseId: "" });
  const [fefoQuantity, setFefoQuantity] = useState("");
  const [fefoPlan, setFefoPlan] = useState<FefoAllocation[] | null>(null);
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

  async function loadCatalog(nextPage = page, nextSearch = search, showDeleted = includeDeleted) {
    const query = new URLSearchParams({ page: String(nextPage), limit: "8", search: nextSearch, includeDeleted: String(showDeleted) });
    const productResult = await api(`/products?${query.toString()}`);
    setProducts(productResult as ProductPage);
  }

  async function loadInventoryPanels() {
    const [categoryResult, warehouseResult, alertResult, stockResult] = await Promise.all([
      api("/categories"), api("/warehouses"), api("/alerts"), api("/inventory/stock"),
    ]);
    setCategories(categoryResult as Category[]);
    setWarehouses(warehouseResult as Warehouse[]);
    setInventoryAlerts(alertResult as InventoryAlert[]);
    setStockSummary(stockResult as Array<{ id: string; quantity: number }>);
  }

  useEffect(() => {
    void Promise.all([loadCatalog(), loadInventoryPanels()]).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Data produk gagal dimuat."));
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
        lowStockLimit: Number(form.lowStockLimit || 0),
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

  async function previewImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(""); setMessage(""); setImportPreview(null); setBusy(true);
    try {
      const formData = new FormData(); formData.append("file", file);
      const result = await api("/products/import/preview", { method: "POST", body: formData });
      setImportPreview(result as ImportPreview);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "CSV gagal diperiksa."); }
    finally { setBusy(false); event.target.value = ""; }
  }

  async function commitImport() {
    if (!importPreview || importPreview.invalidCount > 0) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const rows = importPreview.rows.map(({ rowNumber: _rowNumber, errors: _errors, ...row }) => row);
      const result = await api("/products/import/commit", { method: "POST", body: JSON.stringify({ rows }) }) as { importedCount: number };
      setMessage(`${result.importedCount} produk berhasil diimpor.`); setImportPreview(null); setPage(1); await loadCatalog(1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Import gagal disimpan."); }
    finally { setBusy(false); }
  }

  async function updateBulkPrices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProductIds.length) { setError("Pilih minimal satu produk untuk mengubah harga."); return; }
    if (memberBulkPrice === "" && retailBulkPrice === "") { setError("Isi harga member, harga retail, atau keduanya."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api("/products/bulk-prices", {
        method: "PATCH", body: JSON.stringify({
          productIds: selectedProductIds,
          ...(memberBulkPrice !== "" ? { memberPrice: Number(memberBulkPrice) } : {}),
          ...(retailBulkPrice !== "" ? { retailPrice: Number(retailBulkPrice) } : {}),
        }),
      }) as { updatedCount: number; priceHistoryCount: number };
      setMessage(`Harga ${result.updatedCount} produk diperbarui; riwayat harga tersimpan.`);
      setSelectedProductIds([]); setMemberBulkPrice(""); setRetailBulkPrice(""); await loadCatalog();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Harga massal gagal diperbarui."); }
    finally { setBusy(false); }
  }

  async function togglePriceHistory(product: Product) {
    if (productDetail?.id === product.id) { setProductDetail(null); setPriceHistory(null); return; }
    try {
      const [detail, rows] = await Promise.all([
        api(`/products/${product.id}`) as Promise<Product>,
        api(`/products/${product.id}/price-history`) as Promise<PriceHistory[]>,
      ]);
      setProductDetail(detail);
      setPriceHistory({ productName: product.name, rows });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Riwayat harga gagal dimuat."); }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!categoryName.trim()) return;
    setError("");
    try { await api("/categories", { method: "POST", body: JSON.stringify({ name: categoryName }) }); setCategoryName(""); await loadInventoryPanels(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Kategori gagal dibuat."); }
  }

  async function editProduct(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name, sku: product.sku, barcode: product.barcode ?? "", description: product.description ?? "",
      categoryId: product.categoryId ?? "", memberPrice: String(product.memberPrice), retailPrice: String(product.retailPrice),
      pv: String(product.pv), isActive: product.isActive,
      lowStockLimit: String(product.lowStockLimit),
    });
    setSelectedImage(null);
  }

  async function removeProduct(product: Product) {
    if (!window.confirm(`Arsipkan produk “${product.name}”? Produk dapat dipulihkan nanti.`)) return;
    try { await api(`/products/${product.id}`, { method: "DELETE" }); await loadCatalog(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Produk gagal dihapus."); }
  }

  async function restoreProduct(product: Product) {
    try { await api(`/products/${product.id}/restore`, { method: "POST" }); await loadCatalog(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Produk gagal dipulihkan."); }
  }

  async function addWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try {
      await api("/warehouses", { method: "POST", body: JSON.stringify(warehouseForm) });
      setWarehouseForm({ name: "", code: "" }); await loadInventoryPanels();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Gudang gagal dibuat."); }
  }

  async function openStock(product: Product) {
    if (stockProduct?.id === product.id) { setStockProduct(null); setFefoPlan(null); return; }
    try {
      const batches = await api(`/products/${product.id}/batches`) as ProductBatch[];
      setStockProduct(product); setStockBatches(batches); setFefoPlan(null);
      setStockForm({ batchCode: "", expiryDate: "", quantity: "", unitCost: "", warehouseId: "" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Batch produk gagal dimuat."); }
  }

  async function receiveStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!stockProduct) return;
    setBusy(true); setError("");
    try {
      await api("/inventory/stock-in", { method: "POST", body: JSON.stringify({
        productId: stockProduct.id, batchCode: stockForm.batchCode,
        ...(stockForm.expiryDate ? { expiryDate: stockForm.expiryDate } : {}),
        quantity: Number(stockForm.quantity),
        ...(stockForm.unitCost ? { unitCost: Number(stockForm.unitCost) } : {}),
        ...(stockForm.warehouseId ? { warehouseId: stockForm.warehouseId } : {}),
      }) });
      setMessage(`Stok masuk untuk ${stockProduct.name} berhasil dicatat.`);
      setStockForm({ ...stockForm, batchCode: "", expiryDate: "", quantity: "", unitCost: "" });
      const batches = await api(`/products/${stockProduct.id}/batches`) as ProductBatch[];
      setStockBatches(batches); await Promise.all([loadCatalog(), loadInventoryPanels()]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Stok masuk gagal dicatat."); }
    finally { setBusy(false); }
  }

  async function previewFefo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!stockProduct) return;
    setError("");
    try {
      const result = await api("/inventory/fefo/preview", { method: "POST", body: JSON.stringify({ productId: stockProduct.id, quantity: Number(fefoQuantity) }) }) as { allocations: FefoAllocation[] };
      setFefoPlan(result.allocations);
    } catch (caught) { setFefoPlan(null); setError(caught instanceof Error ? caught.message : "Stok tidak cukup untuk simulasi FEFO."); }
  }

  async function manageCategory(category: Category) {
    const name = window.prompt("Ubah nama kategori", category.name);
    if (name === null) return;
    try {
      if (!name.trim()) await api(`/categories/${category.id}`, { method: "DELETE" });
      else await api(`/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      await loadInventoryPanels();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Kategori gagal diperbarui."); }
  }

  if (activePanel === "pos") return <div className="catalog-dashboard"><nav className="dashboard-tabs" aria-label="Navigasi dashboard"><button onClick={() => setActivePanel("catalog")} type="button">← Kembali ke dashboard</button></nav><PosTerminal session={session} /></div>;
  if (activePanel === "customers") return <div className="catalog-dashboard"><nav className="dashboard-tabs" aria-label="Navigasi dashboard"><button onClick={() => setActivePanel("catalog")} type="button">← Kembali ke dashboard</button><button className="active" type="button">Customer</button><button onClick={() => setActivePanel("pos")} type="button">Buka terminal POS</button></nav><CustomersPanel session={session} /></div>;
  if (activePanel === "vouchers") return <div className="catalog-dashboard"><nav className="dashboard-tabs" aria-label="Navigasi dashboard"><button onClick={() => setActivePanel("catalog")} type="button">← Kembali ke dashboard</button><button className="active" type="button">Voucher</button><button onClick={() => setActivePanel("pos")} type="button">Buka terminal POS</button></nav><VouchersPanel session={session} /></div>;
  if (activePanel === "reports") return <div className="catalog-dashboard"><nav className="dashboard-tabs" aria-label="Navigasi dashboard"><button onClick={() => setActivePanel("catalog")} type="button">← Kembali ke dashboard</button><button className="active" type="button">Laporan</button></nav><ReportsPanel session={session} /></div>;
  if (activePanel === "profit-loss") return <div className="catalog-dashboard"><nav className="dashboard-tabs" aria-label="Navigasi dashboard"><button onClick={() => setActivePanel("catalog")} type="button">← Kembali ke dashboard</button><button className="active" type="button">Laba rugi</button></nav><ProfitLossPanel session={session} /></div>;
  if (activePanel === "pv") return <div className="catalog-dashboard"><nav className="dashboard-tabs" aria-label="Navigasi dashboard"><button onClick={() => setActivePanel("catalog")} type="button">← Kembali ke dashboard</button><button className="active" type="button">Rekap PV</button></nav><PvReportPanel session={session} /></div>;
  if (activePanel === "network") return <div className="catalog-dashboard"><nav className="dashboard-tabs" aria-label="Navigasi dashboard"><button onClick={() => setActivePanel("catalog")} type="button">← Kembali ke dashboard</button><button className="active" type="button">Jaringan HNI</button></nav><NetworkPanel session={session} /></div>;
  if (activePanel === "storefront") return <div className="catalog-dashboard"><nav className="dashboard-tabs" aria-label="Navigasi dashboard"><button onClick={() => setActivePanel("catalog")} type="button">← Kembali ke dashboard</button><button className="active" type="button">Katalog publik</button></nav><StorefrontPanel session={session} /></div>;
  if (activePanel === "whatsapp") return <div className="catalog-dashboard"><nav className="dashboard-tabs" aria-label="Navigasi dashboard"><button onClick={() => setActivePanel("catalog")} type="button">← Kembali ke dashboard</button><button className="active" type="button">Log WhatsApp</button></nav><WhatsAppLogsPanel session={session} /></div>;
  if (activePanel === "bonus") return <div className="catalog-dashboard"><nav className="dashboard-tabs" aria-label="Navigasi dashboard"><button onClick={() => setActivePanel("catalog")} type="button">← Kembali ke dashboard</button><button className="active" type="button">Bonus & leaderboard</button></nav><BonusPanel session={session} /></div>;

  return (
    <div className="catalog-dashboard">
      <nav className="dashboard-tabs" aria-label="Navigasi dashboard"><button className="active" type="button">Katalog & stok</button><button onClick={() => setActivePanel("customers")} type="button">Customer</button>{session.user.roles.includes("owner") && <button onClick={() => setActivePanel("vouchers")} type="button">Voucher</button>}{session.user.roles.includes("owner") && <button onClick={() => setActivePanel("reports")} type="button">Laporan</button>}{session.user.roles.includes("owner") && <button onClick={() => setActivePanel("profit-loss")} type="button">Laba rugi</button>}{session.user.roles.includes("owner") && <button onClick={() => setActivePanel("pv")} type="button">Rekap PV</button>}{session.user.roles.includes("owner") && <button onClick={() => setActivePanel("network")} type="button">Jaringan HNI</button>}{session.user.roles.includes("owner") && <button onClick={() => setActivePanel("bonus")} type="button">Bonus</button>}{session.user.roles.includes("owner") && <button onClick={() => setActivePanel("storefront")} type="button">Katalog publik</button>}{session.user.roles.includes("owner") && <button onClick={() => setActivePanel("whatsapp")} type="button">Log WhatsApp</button>}<button onClick={() => setActivePanel("pos")} type="button">Buka terminal POS</button></nav>
      <div className="catalog-heading"><div><span className="dashboard-label">MASTER DATA</span><h3>Produk toko</h3><p>Kelola katalog dan harga produk Anda.</p></div><span className="product-count">{products?.total ?? 0} produk</span></div>
      {error && <p className="feedback error" role="alert">{error}</p>}
      {message && <p className="feedback success" role="status">{message}</p>}
      <section className="catalog-panel alert-panel">
        <div className="section-title"><div><span className="dashboard-label">PANTAUAN TOKO</span><h4>Alert stok & kedaluwarsa</h4></div><span className={inventoryAlerts.length ? "alert-count has-alert" : "alert-count"}>{inventoryAlerts.length}</span></div>
        {inventoryAlerts.length ? <ul className="alert-list">{inventoryAlerts.map(alert => <li key={alert.id}><span className={alert.kind === "EXPIRY" ? "alert-mark expiry-mark" : "alert-mark"}>{alert.kind === "EXPIRY" ? "!" : "↓"}</span><span><strong>{alert.kind === "EXPIRY" ? "Segera kedaluwarsa" : "Stok menipis"}</strong><small>{alert.message}</small></span></li>)}</ul> : <p className="empty-note">Belum ada stok menipis atau batch yang kedaluwarsa dalam 30 hari.</p>}
      </section>
      <section className="catalog-panel">
        <div className="section-title"><div><h4>Gudang</h4><span className="field-hint">Stok dan batch disimpan per gudang.</span></div><form className="category-add" onSubmit={addWarehouse}><input aria-label="Nama gudang" maxLength={100} placeholder="Nama gudang" value={warehouseForm.name} onChange={e => setWarehouseForm({ ...warehouseForm, name: e.target.value })} required /><input aria-label="Kode gudang" maxLength={24} placeholder="KODE" value={warehouseForm.code} onChange={e => setWarehouseForm({ ...warehouseForm, code: e.target.value })} required /><button className="button button-secondary" type="submit">Tambah</button></form></div>
        <div className="category-list">{warehouses.length ? warehouses.map(warehouse => <span className="category-chip" key={warehouse.id}>{warehouse.name} · {warehouse.code}{warehouse.isDefault ? " · utama" : ""}</span>) : <span className="empty-note">Gudang utama akan dibuat saat stok pertama diterima.</span>}</div>
      </section>
      <section className="catalog-panel">
        <h4>Import produk dari CSV</h4>
        <p className="field-hint">Header wajib: name, sku, memberPrice, retailPrice. Opsional: barcode, description, category, pv. Maksimal 500 produk dan 1 MB per file.</p>
        <label className="csv-picker">Pilih file CSV<input accept=".csv,text/csv" type="file" onChange={previewImport} /></label>
        {importPreview && <div className="import-preview">
          <div className="section-title"><strong>{importPreview.validCount} valid · {importPreview.invalidCount} bermasalah · {importPreview.total} baris</strong><button className="button button-primary" disabled={busy || importPreview.invalidCount > 0} onClick={() => void commitImport()} type="button">Import {importPreview.validCount} produk</button></div>
          {importPreview.invalidCount > 0 && <div className="import-errors">{importPreview.rows.filter(row => row.errors.length).slice(0, 8).map(row => <p key={row.rowNumber}>Baris {row.rowNumber}: {row.errors.join(" ")}</p>)}</div>}
        </div>}
      </section>
      <section className="catalog-panel">
        <h4>{editingId ? "Edit produk" : "Tambah produk"}</h4>
        <form className="product-form" onSubmit={saveProduct}>
          <label>Nama produk<input required maxLength={160} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label>SKU<input required maxLength={64} value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></label>
          <label>Kategori<select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}><option value="">Tanpa kategori</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Harga member<input required min="0" step="1" type="number" value={form.memberPrice} onChange={e => setForm({ ...form, memberPrice: e.target.value })} /></label>
          <label>Harga retail<input required min="0" step="1" type="number" value={form.retailPrice} onChange={e => setForm({ ...form, retailPrice: e.target.value })} /></label>
          <label>PV<input min="0" step="0.01" type="number" value={form.pv} onChange={e => setForm({ ...form, pv: e.target.value })} /></label>
          <label>Batas minimum stok<input min="0" step="1" type="number" value={form.lowStockLimit} onChange={e => setForm({ ...form, lowStockLimit: e.target.value })} /><span className="field-hint">Alert aktif jika stok di bawah angka ini.</span></label>
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
        <div className="section-title"><div><h4>Ubah harga massal</h4><span className="field-hint">Pilih produk dari daftar, lalu tetapkan harga baru.</span></div><strong className="selected-count">{selectedProductIds.length} dipilih</strong></div>
        <form className="bulk-price-form" onSubmit={updateBulkPrices}>
          <label>Harga member baru<input min="0" step="1" type="number" value={memberBulkPrice} onChange={e => setMemberBulkPrice(e.target.value)} placeholder="Biarkan kosong untuk tetap" /></label>
          <label>Harga retail baru<input min="0" step="1" type="number" value={retailBulkPrice} onChange={e => setRetailBulkPrice(e.target.value)} placeholder="Biarkan kosong untuk tetap" /></label>
          <button className="button button-secondary" disabled={busy || !selectedProductIds.length} type="submit">Terapkan ke produk terpilih</button>
        </form>
      </section>
      <section className="catalog-panel">
        <div className="section-title"><h4>Daftar produk</h4><input className="search-input" aria-label="Cari produk" placeholder="Cari nama, SKU, barcode…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); void loadCatalog(1, e.target.value); }} /></div>
        <label className="archive-filter"><input type="checkbox" checked={includeDeleted} onChange={e => { const checked = e.target.checked; setIncludeDeleted(checked); setPage(1); setSelectedProductIds([]); void loadCatalog(1, search, checked); }} /> Tampilkan produk arsip</label>
        <div className="product-table-wrap"><table className="product-table"><thead><tr><th>Pilih</th><th>Produk</th><th>Kategori</th><th>Stok</th><th>Harga member</th><th>Harga retail</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
          {products?.items.map(product => <tr key={product.id}><td><input aria-label={`Pilih ${product.name}`} type="checkbox" checked={selectedProductIds.includes(product.id)} disabled={Boolean(product.deletedAt)} onChange={e => setSelectedProductIds(current => e.target.checked ? [...current, product.id] : current.filter(id => id !== product.id))} /></td><td><div className="product-cell">{product.images[0] ? <Image src={product.images[0].url} alt={product.images[0].alt ?? product.name} width={34} height={34} unoptimized /> : <span className="product-placeholder">{product.name.slice(0, 1).toUpperCase()}</span>}<span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td><td>{product.category?.name ?? "—"}</td><td>{stockSummary.find(row => row.id === product.id)?.quantity ?? 0}</td><td>{Number(product.memberPrice).toLocaleString("id-ID")}</td><td>{Number(product.retailPrice).toLocaleString("id-ID")}</td><td><span className={product.deletedAt ? "status-inactive" : product.isActive ? "status-active" : "status-inactive"}>{product.deletedAt ? "Diarsipkan" : product.isActive ? "Aktif" : "Nonaktif"}</span></td><td>{product.deletedAt ? <button className="row-action" onClick={() => void restoreProduct(product)} type="button">Pulihkan</button> : <><button className="row-action" onClick={() => void editProduct(product)} type="button">Edit</button><button className="row-action" onClick={() => void togglePriceHistory(product)} type="button">Detail</button><button className="row-action" onClick={() => void openStock(product)} type="button">Stok / batch</button><button className="row-action danger-action" onClick={() => void removeProduct(product)} type="button">Arsipkan</button></>}</td></tr>)}
          {products && products.items.length === 0 && <tr><td className="empty-table" colSpan={8}>Belum ada produk yang cocok.</td></tr>}
        </tbody></table></div>
        {stockProduct && <div className="price-history inventory-detail">
          <div className="section-title"><h4>Stok & batch · {stockProduct.name}</h4><button className="text-button" onClick={() => setStockProduct(null)} type="button">Tutup</button></div>
          <form className="stock-in-form" onSubmit={receiveStock}>
            <label>Kode batch<input required maxLength={80} value={stockForm.batchCode} onChange={e => setStockForm({ ...stockForm, batchCode: e.target.value })} /></label>
            <label>Kedaluwarsa<input type="date" value={stockForm.expiryDate} onChange={e => setStockForm({ ...stockForm, expiryDate: e.target.value })} /></label>
            <label>Jumlah masuk<input required min="0.01" step="0.01" type="number" value={stockForm.quantity} onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })} /></label>
            <label>Harga pokok / unit<input min="0" step="0.01" type="number" value={stockForm.unitCost} onChange={e => setStockForm({ ...stockForm, unitCost: e.target.value })} /></label>
            <label>Gudang<select value={stockForm.warehouseId} onChange={e => setStockForm({ ...stockForm, warehouseId: e.target.value })}><option value="">Gudang utama</option>{warehouses.map(warehouse => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select></label>
            <button className="button button-primary" disabled={busy} type="submit">{busy ? "Menyimpan…" : "Catat stok masuk"}</button>
          </form>
          <div className="product-table-wrap"><table className="product-table"><thead><tr><th>Batch</th><th>Gudang</th><th>Kedaluwarsa</th><th>Sisa stok</th><th>Harga pokok</th></tr></thead><tbody>{stockBatches.map(batch => <tr key={batch.id}><td>{batch.batchCode}</td><td>{batch.warehouse.name}</td><td>{batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString("id-ID") : "—"}</td><td>{Number(batch.quantity).toLocaleString("id-ID")}</td><td>{batch.unitCost ? Number(batch.unitCost).toLocaleString("id-ID") : "—"}</td></tr>)}{stockBatches.length === 0 && <tr><td className="empty-table" colSpan={5}>Belum ada batch stok.</td></tr>}</tbody></table></div>
          <form className="fefo-form" onSubmit={previewFefo}><label>Simulasikan penjualan · jumlah<input required min="0.01" step="0.01" type="number" value={fefoQuantity} onChange={e => setFefoQuantity(e.target.value)} /></label><button className="button button-secondary" type="submit">Lihat alokasi FEFO</button></form>
          {fefoPlan && <ol className="fefo-plan">{fefoPlan.map(item => <li key={item.batchId}>{item.batchCode}: {Number(item.quantity).toLocaleString("id-ID")} unit{item.expiryDate ? ` · kedaluwarsa ${new Date(item.expiryDate).toLocaleDateString("id-ID")}` : " · tanpa tanggal kedaluwarsa"}</li>)}</ol>}
        </div>}
        {productDetail && <div className="price-history"><h4>Detail produk · {productDetail.name}</h4><div className="detail-grid"><span>SKU<strong>{productDetail.sku}</strong></span><span>Barcode<strong>{productDetail.barcode ?? "—"}</strong></span><span>Kategori<strong>{productDetail.category?.name ?? "—"}</strong></span><span>PV<strong>{Number(productDetail.pv).toLocaleString("id-ID")}</strong></span></div><p>{productDetail.description || "Tidak ada deskripsi."}</p><h4>Riwayat harga</h4>{priceHistory?.rows.length ? <div className="product-table-wrap"><table className="product-table"><thead><tr><th>Waktu</th><th>Member sebelumnya</th><th>Member baru</th><th>Retail sebelumnya</th><th>Retail baru</th><th>Sumber</th></tr></thead><tbody>{priceHistory.rows.map(row => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString("id-ID")}</td><td>{Number(row.previousMemberPrice).toLocaleString("id-ID")}</td><td>{Number(row.memberPrice).toLocaleString("id-ID")}</td><td>{Number(row.previousRetailPrice).toLocaleString("id-ID")}</td><td>{Number(row.retailPrice).toLocaleString("id-ID")}</td><td>{row.source}</td></tr>)}</tbody></table></div> : <p className="empty-note">Belum ada perubahan harga.</p>}</div>}
        <div className="pagination"><span>{products?.total ?? 0} produk · halaman {products?.page ?? 1} dari {Math.max(products?.totalPages ?? 0, 1)}</span><div><button className="button button-secondary" disabled={page <= 1} onClick={() => { const next = page - 1; setPage(next); void loadCatalog(next); }} type="button">Sebelumnya</button><button className="button button-secondary" disabled={!products || page >= products.totalPages} onClick={() => { const next = page + 1; setPage(next); void loadCatalog(next); }} type="button">Berikutnya</button></div></div>
      </section>
    </div>
  );
}
