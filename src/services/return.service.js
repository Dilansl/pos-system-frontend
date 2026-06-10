import api from './api';

const returnService = {
  getAll: async () => {
    const response = await api.get('/returns');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/returns/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/returns', data);
    return response.data;
  },
};

export default returnService;