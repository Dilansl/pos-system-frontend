import api from './api';

const customerService = {
  getAll: async () => {
    const response = await api.get('/customers');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/customers/${id}`);
    return response.data;
  },

  lookupByPhone: async (phone) => {
    const response = await api.get(`/customers/phone/${phone}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/customers', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/customers/${id}`, data);
    return response.data;
  },
};

export default customerService;