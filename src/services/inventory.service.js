import api from './api';

const inventoryService = {
  getAll: async () => {
    const response = await api.get('/inventory');
    return response.data;
  },

  getLowStock: async () => {
    const response = await api.get('/inventory/low-stock');
    return response.data;
  },

  // Manually adjust stock (add or remove)
  adjust: async (data) => {
    const response = await api.post('/inventory/adjust', data);
    return response.data;
  },

  // Get stock change history for a variant
  getHistory: async (variantId) => {
    const response = await api.get(`/inventory/${variantId}/history`);
    return response.data;
  },
};

export default inventoryService;