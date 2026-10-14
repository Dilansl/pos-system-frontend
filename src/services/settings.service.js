import api from './api';

const settingsService = {
  // { limits: { cashier, manager, admin }, approvers: [{ id, name, role }] }
  getDiscount: async () => {
    const response = await api.get('/settings/discount');
    return response.data;
  },

  setDiscountLimits: async (limits) => {
    const response = await api.put('/settings/discount-limits', limits);
    return response.data;
  },

  // { name, tagline, address, phone, tin, receiptFooter }
  getShop: async () => {
    const response = await api.get('/settings/shop');
    return response.data;
  },

  setShop: async (shop) => {
    const response = await api.put('/settings/shop', shop);
    return response.data;
  },

  // { cashOutLimit, approvers: [{ id, name, role }] }
  getCash: async () => {
    const response = await api.get('/settings/cash');
    return response.data;
  },

  setCashOutLimit: async (amount) => {
    const response = await api.put('/settings/cash-out-limit', { amount });
    return response.data;
  },
};

export default settingsService;
