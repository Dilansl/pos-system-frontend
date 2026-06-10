import api from './api';

const staffService = {
  getAll: async () => {
    const response = await api.get('/staff');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/staff/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/staff', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/staff/${id}`, data);
    return response.data;
  },

  resetPassword: async (id, newPassword) => {
    const response = await api.patch(`/staff/${id}/password`, { newPassword });
    return response.data;
  },

  setActive: async (id, isActive) => {
    const response = await api.patch(`/staff/${id}/status`, { isActive });
    return response.data;
  },
};

export default staffService;