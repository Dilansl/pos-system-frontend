import { create } from 'zustand';

// Where each role lands after login: cashiers go straight to the till.
export const homePathFor = (user) => (user?.role === 'cashier' ? '/sales' : '/dashboard');

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user')) || null,
  token: localStorage.getItem('token') || null,

  // Save user + token after login
  login: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user, token });
  },

  // Clear everything on logout
  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },
}));

export default useAuthStore;