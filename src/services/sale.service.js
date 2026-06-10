import api from './api';

const saleService = {
  // Create a new sale
  create: async (saleData) => {
    const response = await api.post('/sales', saleData);
    return response.data;
  },

  // Get a single sale by id (for receipt)
  getById: async (id) => {
    const response = await api.get(`/sales/${id}`);
    return response.data;
  },

  // Get daily summary
  getDailySummary: async (date) => {
    const url = date ? `/sales/summary?date=${date}` : '/sales/summary';
    const response = await api.get(url);
    return response.data;
  },

  
};

export default saleService;