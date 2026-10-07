export const RECEIPT_TEMPLATE_CODE = "receipt_v1";

export type ReceiptMessageInput = {
  storeName: string;
  invoiceNo: string;
  createdAt: Date;
  customerName?: string | null;
  items: Array<{ productName: string; quantity: number; lineTotal: number }>;
  discount: number;
  total: number;
  totalPv: number;
  receiptUrl: string;
};

const rupiah = (value: number) => `Rp${Math.round(value).toLocaleString("id-ID")}`;

/** Receipt message template (receipt_v1). Keep wording in sync with the template registered at the WA provider. */
export function buildReceiptMessage(input: ReceiptMessageInput): string {
  const date = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short",
  }).format(input.createdAt);
  const shownItems = input.items.slice(0, 15);
  const lines = [
    `*${input.storeName}*`,
    `Struk belanja ${input.invoiceNo}`,
    `${date} WIB`,
    input.customerName ? `Pelanggan: ${input.customerName}` : null,
    "",
    ...shownItems.map((item) => `• ${item.productName} x${item.quantity} = ${rupiah(item.lineTotal)}`),
    input.items.length > shownItems.length ? `• …dan ${input.items.length - shownItems.length} produk lainnya` : null,
    "",
    input.discount > 0 ? `Diskon: -${rupiah(input.discount)}` : null,
    `*Total: ${rupiah(input.total)}*`,
    input.totalPv > 0 ? `PV: ${input.totalPv.toLocaleString("id-ID")}` : null,
    "",
    `Struk digital: ${input.receiptUrl}`,
    "Terima kasih telah berbelanja.",
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}
