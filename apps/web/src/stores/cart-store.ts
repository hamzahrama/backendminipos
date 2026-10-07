import { create } from "zustand";

export type CartProduct = {
  id: string;
  name: string;
  sku: string;
  categoryId: string | null;
  memberPrice: number;
  retailPrice: number;
  pv: number;
  imageUrl: string | null;
  stock: number;
};

export type CartLine = { product: CartProduct; quantity: number; discountAmount: number };
type CartStore = {
  lines: CartLine[];
  add: (product: CartProduct) => void;
  setQuantity: (productId: string, quantity: number) => void;
  setDiscount: (productId: string, discountAmount: number) => void;
  setLines: (lines: CartLine[]) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

export const useCartStore = create<CartStore>((set) => ({
  lines: [],
  add: (product) => set((state) => {
    const current = state.lines.find((line) => line.product.id === product.id);
    if (current) {
      if (current.quantity >= product.stock) return state;
      return { lines: state.lines.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line) };
    }
    return product.stock > 0 ? { lines: [...state.lines, { product, quantity: 1, discountAmount: 0 }] } : state;
  }),
  setQuantity: (productId, quantity) => set((state) => ({
    lines: quantity <= 0
      ? state.lines.filter((line) => line.product.id !== productId)
      : state.lines.map((line) => line.product.id === productId ? { ...line, quantity: Math.min(quantity, line.product.stock) } : line),
  })),
  setDiscount: (productId, discountAmount) => set((state) => ({
    lines: state.lines.map((line) => line.product.id === productId
      ? { ...line, discountAmount: Math.max(0, Math.min(discountAmount, line.quantity * line.product.retailPrice)) }
      : line),
  })),
  setLines: (lines) => set({ lines }),
  remove: (productId) => set((state) => ({ lines: state.lines.filter((line) => line.product.id !== productId) })),
  clear: () => set({ lines: [] }),
}));
