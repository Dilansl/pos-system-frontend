import { create } from 'zustand';

const useCartStore = create((set, get) => ({
  items: [],        // each: { variantId, productName, size, color, sellPrice, quantity, stockQuantity }
  discount: 0,      // overall discount amount

  // Add an item to the cart (or increase quantity if already there)
  addItem: (product) => {
    const items = get().items;
    const existing = items.find((i) => i.variantId === product.id);

    if (existing) {
      // Already in cart — increase quantity (if stock allows)
      if (existing.quantity < product.stock_quantity) {
        set({
          items: items.map((i) =>
            i.variantId === product.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        });
      }
    } else {
      // New item
      set({
        items: [
          ...items,
          {
            variantId: product.id,
            productName: product.product_name,
            size: product.size,
            color: product.color,
            barcode: product.barcode,
            sellPrice: Number(product.sell_price),
            quantity: 1,
            stockQuantity: product.stock_quantity,
          },
        ],
      });
    }
  },

  // Increase quantity
  increaseQty: (variantId) => {
    set({
      items: get().items.map((i) =>
        i.variantId === variantId && i.quantity < i.stockQuantity
          ? { ...i, quantity: i.quantity + 1 }
          : i
      ),
    });
  },

  // Decrease quantity (remove if hits 0)
  decreaseQty: (variantId) => {
    set({
      items: get()
        .items.map((i) =>
          i.variantId === variantId
            ? { ...i, quantity: i.quantity - 1 }
            : i
        )
        .filter((i) => i.quantity > 0),
    });
  },

  // Remove an item completely
  removeItem: (variantId) => {
    set({ items: get().items.filter((i) => i.variantId !== variantId) });
  },

  // Set discount amount
  setDiscount: (amount) => set({ discount: amount }),

  // Clear the whole cart (after sale completes)
  clearCart: () => set({ items: [], discount: 0 }),

  // Calculated totals
  getSubtotal: () => {
    return get().items.reduce((sum, i) => sum + i.sellPrice * i.quantity, 0);
  },

  getTotal: () => {
    return get().getSubtotal() - get().discount;
  },

  getItemCount: () => {
    return get().items.reduce((sum, i) => sum + i.quantity, 0);
  },
}));

export default useCartStore;