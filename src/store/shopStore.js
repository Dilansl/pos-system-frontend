import { create } from 'zustand';
import settingsService from '../services/settings.service';

const SHOP_KEY = 'shopDetails';

// Used until the server answers the first time (same as the backend defaults).
const DEFAULT_SHOP = {
  name: 'ROPYCO Fashion',
  tagline: 'Clothing Shop',
  address: 'Nittambuwwa, Sri Lanka',
  phone: '0706201176',
  tin: '',
  receiptFooter: 'Thank you for shopping!',
};

// Last known details are kept in the browser so receipts printed while
// offline still carry the right shop name/address.
function readCached() {
  try {
    return { ...DEFAULT_SHOP, ...(JSON.parse(localStorage.getItem(SHOP_KEY)) || {}) };
  } catch {
    return DEFAULT_SHOP;
  }
}

function writeCached(shop) {
  try {
    localStorage.setItem(SHOP_KEY, JSON.stringify(shop));
  } catch {
    // Storage unavailable — the defaults/last loaded values still work.
  }
}

const useShopStore = create((set) => ({
  shop: readCached(),

  load: async () => {
    try {
      const res = await settingsService.getShop();
      writeCached(res.data);
      set({ shop: res.data });
    } catch {
      // Offline or server down — keep the cached details.
    }
  },

  save: async (shop) => {
    const res = await settingsService.setShop(shop);
    writeCached(res.data);
    set({ shop: res.data });
    return res.data;
  },
}));

export default useShopStore;
