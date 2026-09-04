import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import saleService from '../../services/sale.service';
import offlineQueue from '../../utils/offlineQueue';
import {
  MdDashboard,
  MdPointOfSale,
  MdInventory2,
  MdAssessment,
  MdLogout,
  MdCloudOff,
} from 'react-icons/md';
import { FaBoxOpen, FaUsers, FaUserFriends, FaUndo, FaReceipt, FaCashRegister, FaBarcode } from 'react-icons/fa';

function Sidebar({ isOpen = false, onClose = () => {} }) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Replay any sales that got queued while offline. Safe to retry blindly —
  // each carries the idempotency key from its original checkout attempt, so
  // the server treats a resend as a replay rather than a new sale.
  useEffect(() => {
    const syncPending = async () => {
      if (syncingRef.current) return;
      const queue = offlineQueue.list();
      if (queue.length === 0) {
        setPendingCount(0);
        return;
      }
      syncingRef.current = true;
      for (const { saleData } of queue) {
        try {
          await saleService.create({ ...saleData, offlineRetry: true });
          offlineQueue.remove(saleData.idempotencyKey);
        } catch (err) {
          if (err.response) {
            // Server rejected it outright (not a connectivity issue) — drop it,
            // retrying forever won't help and it'd block the rest of the queue.
            offlineQueue.remove(saleData.idempotencyKey);
          }
          // else: still offline — leave it queued, try again next tick.
        }
      }
      syncingRef.current = false;
      setPendingCount(offlineQueue.list().length);
    };

    setPendingCount(offlineQueue.list().length);
    syncPending();

    window.addEventListener('online', syncPending);
    const interval = setInterval(syncPending, 30000);

    return () => {
      window.removeEventListener('online', syncPending);
      clearInterval(interval);
    };
  }, []);

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: <MdDashboard />, roles: ['admin', 'manager', 'cashier'] },
    { path: '/sales',     label: 'Sales (POS)', icon: <MdPointOfSale />, roles: ['admin', 'manager', 'cashier'] },
    { path: '/shift',     label: 'Shift', icon: <FaCashRegister />, roles: ['admin', 'manager', 'cashier'] },
    { path: '/products',  label: 'Products', icon: <FaBoxOpen />, roles: ['admin'] },
    { path: '/inventory', label: 'Inventory', icon: <MdInventory2 />, roles: ['admin', 'manager'] },
    { path: '/reports',   label: 'Reports', icon: <MdAssessment />, roles: ['admin', 'manager'] },
    { path: '/staff',     label: 'Staff', icon: <FaUsers />, roles: ['admin'] },
    { path: '/customers', label: 'Customers', icon: <FaUserFriends />, roles: ['admin', 'manager', 'cashier'] },
    { path: '/returns',   label: 'Returns', icon: <FaUndo />, roles: ['admin', 'manager'] },
    { path: '/transactions', label: 'Transactions', icon: <FaReceipt />, roles: ['admin', 'manager'] },
    { path: '/barcodes',  label: 'Barcode Printing', icon: <FaBarcode />, roles: ['admin', 'manager'] },
  ];

  const visibleItems = menuItems.filter((item) =>
    item.roles.includes(user?.role)
  );

  return (
    <>
      {/* Backdrop — mobile drawer only */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed md:static inset-y-0 left-0 z-40 w-60 bg-slate-900 text-white flex flex-col h-screen
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        <div className="p-5 border-b border-slate-700 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-500 to-yellow-300">
              ROPYCO Fashion
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {user?.name} · {user?.role}
            </p>
          </div>
          <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white text-xl leading-none">
            ×
          </button>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          {visibleItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded mb-1 text-sm transition ${
                  isActive
                    ? 'bg-yellow-500 text-black'
                    : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {pendingCount > 0 && (
          <div className="mx-3 mb-2 flex items-center gap-2 bg-orange-900/40 text-orange-300 px-3 py-2 rounded text-xs">
            <MdCloudOff className="text-sm" />
            {pendingCount} sale{pendingCount > 1 ? 's' : ''} pending sync
          </div>
        )}

        <div className="p-3 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-2 rounded text-sm hover:bg-red-700"
          >
            <MdLogout className="text-lg" />
            Logout
          </button>
        </div>
      </div>
    </>
  );
}

export default Sidebar;