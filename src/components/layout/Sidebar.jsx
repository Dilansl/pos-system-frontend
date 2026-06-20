import { NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import {
  MdDashboard,
  MdPointOfSale,
  MdInventory2,
  MdAssessment,
  MdLogout,
} from 'react-icons/md';
import { FaBoxOpen, FaUsers, FaUserFriends, FaUndo, FaReceipt, FaCashRegister, FaBarcode } from 'react-icons/fa';

function Sidebar() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
        <h1 className="text-xl font-bold">POS System</h1>
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