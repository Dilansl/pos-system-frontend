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
};

export default settingsService;
