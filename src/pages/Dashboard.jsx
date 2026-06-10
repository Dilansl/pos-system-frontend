import { useState, useEffect } from 'react';
import { FaShoppingCart, FaMoneyBillWave, FaChartLine, FaExclamationTriangle } from 'react-icons/fa';
import useAuthStore from '../store/authStore';
import saleService from '../services/sale.service';
import inventoryService from '../services/inventory.service';

function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [summary, setSummary] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const summaryRes = await saleService.getDailySummary();
        setSummary(summaryRes.data);

        const lowStockRes = await inventoryService.getLowStock();
        setLowStock(lowStockRes.data);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const stats = [
    {
      label: "Today's Revenue",
      value: summary ? `Rs. ${Number(summary.total_revenue).toLocaleString()}` : '—',
      icon: <FaMoneyBillWave />,
      color: 'bg-green-500',
    },
    {
      label: 'Transactions',
      value: summary ? summary.total_transactions : '—',
      icon: <FaShoppingCart />,
      color: 'bg-blue-500',
    },
    {
      label: 'Average Sale',
      value: summary ? `Rs. ${Number(summary.average_sale).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—',
      icon: <FaChartLine />,
      color: 'bg-purple-500',
    },
    {
      label: 'Low Stock Items',
      value: lowStock.length,
      icon: <FaExclamationTriangle />,
      color: 'bg-orange-500',
    },
  ];

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-1">
        Welcome back, {user?.name}!
      </h2>
      <p className="text-gray-500 mb-6 text-sm">
        Here's what's happening in your shop today.
      </p>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-white rounded-lg shadow-sm p-5 flex items-center gap-4">
                <div className={`${stat.color} text-white w-12 h-12 rounded-lg flex items-center justify-center text-xl`}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                  <p className="text-xl font-bold text-gray-800">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Low stock alert list */}
          <div className="bg-white rounded-lg shadow-sm p-5">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <FaExclamationTriangle className="text-orange-500" />
              Low Stock Alerts
            </h3>
            {lowStock.length === 0 ? (
              <p className="text-gray-500 text-sm">All products are well stocked. 👍</p>
            ) : (
              <div className="space-y-2">
                {lowStock.map((item) => (
                  <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
                      <p className="text-xs text-gray-500">{item.size} · {item.color}</p>
                    </div>
                    <span className="text-sm font-bold text-red-500">
                      {item.quantity} left
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Dashboard;