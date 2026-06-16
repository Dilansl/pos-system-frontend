import { create } from 'zustand';

const useCartStore = create((set, get) => ({
  items: [],  // each item also has: discountType ('percent'|'fixed'), discountValue (number), promoType, promoValue

  // Add an item to the cart (or increase quantity if already there)
  addItem: (product) => {
    const items = get().items;
    const existing = items.find((i) => i.variantId === product.id);

    if (existing) {
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
            discountType: 'percent',  // 'percent' or 'fixed'
            discountValue: 0,          // the number the cashier types
            // Promotion: variant (batch clearance) wins; otherwise product-level promo
            promoType: product.variant_promo_type || product.product_promo_type || null,
            promoValue: Number(
              product.variant_promo_type ? product.variant_promo_value : product.product_promo_value
            ) || 0,
            // Track whether this came from a batch clearance (for the badge label)
            isClearance: !!product.variant_promo_type,  // the promo number
          },
        ],
      });
    }
  },

  increaseQty: (variantId) => {
    set({
      items: get().items.map((i) =>
        i.variantId === variantId && i.quantity < i.stockQuantity
          ? { ...i, quantity: i.quantity + 1 }
          : i
      ),
    });
  },

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

  removeItem: (variantId) => {
    set({ items: get().items.filter((i) => i.variantId !== variantId) });
  },

  // Set discount type ('percent' or 'fixed') for an item
  setItemDiscountType: (variantId, type) => {
    set({
      items: get().items.map((i) =>
        i.variantId === variantId ? { ...i, discountType: type, discountValue: 0 } : i
      ),
    });
  },

  // Set discount value for an item
  setItemDiscountValue: (variantId, value) => {
    set({
      items: get().items.map((i) =>
        i.variantId === variantId ? { ...i, discountValue: Number(value) || 0 } : i
      ),
    });
  },

  clearCart: () => set({ items: [] }),

  // ─── Calculations ───────────────────────────────

  // Promotion discount in rupees for one item (applied first, before bargain)
  getItemPromoDiscount: (item) => {
    const lineGross = item.sellPrice * item.quantity;
    if (!item.promoType || !item.promoValue) return 0;
    let discount = 0;
    if (item.promoType === 'percent') {
      discount = lineGross * (item.promoValue / 100);
    } else {
      discount = item.promoValue * item.quantity;  // fixed rupees per unit
    }
    return Math.min(Math.max(discount, 0), lineGross);
  },

  // Bargain (cashier) discount in rupees — applied on the price AFTER promo
  getItemBargainDiscount: (item) => {
    const lineGross = item.sellPrice * item.quantity;
    const afterPromo = lineGross - get().getItemPromoDiscount(item);
    let discount = 0;
    if (item.discountType === 'percent') {
      discount = afterPromo * (item.discountValue / 100);
    } else {
      discount = item.discountValue;  // fixed rupees
    }
    // Never discount more than what's left after the promo
    return Math.min(Math.max(discount, 0), afterPromo);
  },

  // Total discount in rupees for one item (promo + bargain combined)
  getItemDiscount: (item) => {
    return get().getItemPromoDiscount(item) + get().getItemBargainDiscount(item);
  },

  // Line total after promo + bargain
  getItemLineTotal: (item) => {
    const lineGross = item.sellPrice * item.quantity;
    return lineGross - get().getItemDiscount(item);
  },

  // Subtotal before any discounts
  getSubtotal: () => {
    return get().items.reduce((sum, i) => sum + i.sellPrice * i.quantity, 0);
  },

  // Total discount across all items (promo + bargain)
  getTotalDiscount: () => {
    return get().items.reduce((sum, i) => sum + get().getItemDiscount(i), 0);
  },

  // Final total (subtotal − all discounts)
  getTotal: () => {
    return get().getSubtotal() - get().getTotalDiscount();
  },

  getItemCount: () => {
    return get().items.reduce((sum, i) => sum + i.quantity, 0);
  },
}));

export default useCartStore;