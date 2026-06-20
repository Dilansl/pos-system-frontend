import api from './api';

const shiftService = {
  getCurrent: async () => {
    const response = await api.get('/shifts/current');
    return response.data;
  },

  open: async (data) => {
    const response = await api.post('/shifts/open', data);
    return response.data;
  },

  close: async (data) => {
    const response = await api.post('/shifts/close', data);
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/shifts/${id}`);
    return response.data;
  },
};

export default shiftService;