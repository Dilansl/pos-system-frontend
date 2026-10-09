import { create } from 'zustand';

const HELD_CARTS_KEY = 'heldCarts';

function readHeldCarts() {
  try {
    return JSON.parse(localStorage.getItem(HELD_CARTS_KEY)) || [];
  } catch {
    return [];
  }
}

function writeHeldCarts(heldCarts) {
  try {
    localStorage.setItem(HELD_CARTS_KEY, JSON.stringify(heldCarts));
  } catch {
    // Storage full/unavailable — held carts just won't survive a reload.
  }
}

const useCartStore = create((set, get) => ({
  items: [],  // each item also has: discountType ('percent'|'fixed'), discountValue (number), promoType, promoValue
  // Discount on the whole bill (cashier input), applied after line discounts.
  billDiscountType: 'percent',
  billDiscountValue: 0,
  // Parked carts — persisted so they survive a page refresh or nav away/back.
  heldCarts: readHeldCarts(),

  // Park the current cart (e.g. to serve another customer) and start a fresh one.
  holdCart: (label) => {
    const items = get().items;
    if (items.length === 0) return;
    const held = {
      id: crypto.randomUUID(),
      label: label?.trim() || `Hold ${get().heldCarts.length + 1}`,
      items,
      billDiscountType: get().billDiscountType,
      billDiscountValue: get().billDiscountValue,
      heldAt: new Date().toISOString(),
    };
    const heldCarts = [...get().heldCarts, held];
    writeHeldCarts(heldCarts);
    set({ heldCarts, items: [], billDiscountType: 'percent', billDiscountValue: 0 });
  },

  // Bring a parked cart back as the active cart. Caller is responsible for
  // confirming with the user if the active cart already has items.
  resumeCart: (id) => {
    const held = get().heldCarts.find((h) => h.id === id);
    if (!held) return;
    const heldCarts = get().heldCarts.filter((h) => h.id !== id);
    writeHeldCarts(heldCarts);
    set({
      heldCarts,
      items: held.items,
      billDiscountType: held.billDiscountType || 'percent',
      billDiscountValue: held.billDiscountValue || 0,
    });
  },

  discardHeldCart: (id) => {
    const heldCarts = get().heldCarts.filter((h) => h.id !== id);
    writeHeldCarts(heldCarts);
    set({ heldCarts });
  },

  // Add an item to the cart (or increase quantity if already there), capped
  // at stock. Returns the quantity actually added (0 = already at stock).
  addItem: (product, qty = 1) => {
    const items = get().items;
    const existing = items.find((i) => i.variantId === product.id);
    const inCart = existing?.quantity || 0;
    const added = Math.max(0, Math.min(qty, product.stock_quantity - inCart));
    if (added === 0) return 0;

    if (existing) {
      set({
        items: items.map((i) =>
          i.variantId === product.id
            ? { ...i, quantity: i.quantity + added, stockQuantity: product.stock_quantity }
            : i
        ),
      });
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
            quantity: added,
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
    return added;
  },

  // Typed quantity — clamped to 1..stock.
  setQty: (variantId, qty) => {
    set({
      items: get().items.map((i) =>
        i.variantId === variantId
          ? { ...i, quantity: Math.min(Math.max(Math.floor(Number(qty)) || 1, 1), i.stockQuantity) }
          : i
      ),
    });
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

  setBillDiscountType: (type) => set({ billDiscountType: type, billDiscountValue: 0 }),

  setBillDiscountValue: (value) => set({ billDiscountValue: Number(value) || 0 }),

  clearCart: () => set({ items: [], billDiscountType: 'percent', billDiscountValue: 0 }),

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

  // Line total after promo + bargain (before the bill discount)
  getItemLineTotal: (item) => {
    const lineGross = item.sellPrice * item.quantity;
    return lineGross - get().getItemDiscount(item);
  },

  // Bill discount in rupees — on the total after line discounts (mirrors the server).
  getBillDiscount: () => {
    const { billDiscountType, billDiscountValue, items } = get();
    const net = items.reduce((sum, i) => sum + get().getItemLineTotal(i), 0);
    if (!billDiscountValue) return 0;
    const discount = billDiscountType === 'percent'
      ? net * (billDiscountValue / 100)
      : billDiscountValue;
    return Math.min(Math.max(discount, 0), net);
  },

  // Largest cashier discount on any one line (bargain + its share of the bill
  // discount) as a % of that line's price after promo. The server caps this
  // per role, so the POS uses it to know when to ask for a manager PIN.
  getItemCashierPercent: (item) => {
    const afterPromo = item.sellPrice * item.quantity - get().getItemPromoDiscount(item);
    if (afterPromo <= 0) return 0;
    const net = get().items.reduce((sum, i) => sum + get().getItemLineTotal(i), 0);
    const share = net > 0 ? get().getBillDiscount() * (get().getItemLineTotal(item) / net) : 0;
    return ((get().getItemBargainDiscount(item) + share) / afterPromo) * 100;
  },

  getMaxCashierPercent: () => {
    return get().items.reduce((max, item) => Math.max(max, get().getItemCashierPercent(item)), 0);
  },

  // Subtotal before any discounts
  getSubtotal: () => {
    return get().items.reduce((sum, i) => sum + i.sellPrice * i.quantity, 0);
  },

  // Total discount across all items (promo + bargain) plus the bill discount
  getTotalDiscount: () => {
    return get().items.reduce((sum, i) => sum + get().getItemDiscount(i), 0) + get().getBillDiscount();
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