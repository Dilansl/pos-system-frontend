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

function Sidebar() {
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
    <div className="w-60 bg-gray-900 text-white flex flex-col h-screen">
      <div className="p-5 border-b border-gray-700">
        <h1 className="text-xl font-bold ">ROPYCO Fashion</h1>
        <p className="text-xs text-gray-400 mt-1">
          {user?.name} · {user?.role}
        </p>
      </div>

      <nav className="flex-1 p-3">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded mb-1 text-sm transition ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
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

      <div className="p-3 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-2 rounded text-sm hover:bg-red-700"
        >
          <MdLogout className="text-lg" />
          Logout
        </button>
      </div>
    </div>
  );
}

export default Sidebar;