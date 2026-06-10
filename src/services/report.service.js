import api from './api';

const reportService = {
  getSummary: async (startDate, endDate) => {
    const response = await api.get(`/reports/summary?startDate=${startDate}&endDate=${endDate}`);
    return response.data;
  },

  getByDay: async (startDate, endDate) => {
    const response = await api.get(`/reports/by-day?startDate=${startDate}&endDate=${endDate}`);
    return response.data;
  },

  getBestSellers: async (startDate, endDate) => {
    const response = await api.get(`/reports/best-sellers?startDate=${startDate}&endDate=${endDate}`);
    return response.data;
  },

  getByStaff: async (startDate, endDate) => {
    const response = await api.get(`/reports/by-staff?startDate=${startDate}&endDate=${endDate}`);
    return response.data;
  },

  getPaymentBreakdown: async (startDate, endDate) => {
    const response = await api.get(`/reports/payments?startDate=${startDate}&endDate=${endDate}`);
    return response.data;
  },
};

export default reportService;