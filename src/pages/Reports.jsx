import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

import reportService from '../services/report.service';
import { FaMoneyBillWave, FaShoppingCart, FaChartLine, FaUndo, FaPercent } from 'react-icons/fa';
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function Reports() {
  // Default: last 30 days
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(monthAgo);
  const [endDate, setEndDate] = useState(today);
  const [summary, setSummary] = useState(null);
  const [byDay, setByDay] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadReports = async () => {
    setLoading(true);
    try {
      // End date needs to include the full day
      const end = `${endDate}T23:59:59`;

      const [summaryRes, byDayRes, bestRes, payRes] = await Promise.all([
        reportService.getSummary(startDate, end),
        reportService.getByDay(startDate, end),
        reportService.getBestSellers(startDate, end),
        reportService.getPaymentBreakdown(startDate, end),
      ]);

      setSummary(summaryRes.data);
      setByDay(byDayRes.data.map((d) => ({
        date: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        revenue: Number(d.revenue),
        transactions: d.transactions,
      })));
      setBestSellers(bestRes.data.map((b) => ({
        name: `${b.product_name} (${b.size}/${b.color})`,
        units: b.units_sold,
      })));
      setPayments(payRes.data.map((p) => ({
        name: p.method.replace('_', ' '),
        value: Number(p.total_amount),
      })));
    } catch (err) {
      toast.error('Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const stats = summary ? [
    { label: 'Total Revenue', value: `Rs. ${Number(summary.total_revenue).toLocaleString()}`, icon: <FaMoneyBillWave />, color: 'bg-green-500' },
    { label: 'Total Profit', value: `Rs. ${Number(summary.total_profit).toLocaleString()}`, icon: <FaChartLine />, color: 'bg-emerald-600' },
    { label: 'Profit Margin', value: `${Number(summary.profit_margin).toFixed(1)}%`, icon: <FaPercent />, color: 'bg-teal-500' },
    { label: 'Transactions', value: summary.total_transactions, icon: <FaShoppingCart />, color: 'bg-blue-500' },
    { label: 'Average Sale', value: `Rs. ${Number(summary.average_sale).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: <FaChartLine />, color: 'bg-purple-500' },
    { label: 'Refunds', value: `Rs. ${Number(summary.total_refunds).toLocaleString()}`, icon: <FaUndo />, color: 'bg-red-500' },
  ] : [];

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Reports</h2>

      {/* Date range */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded text-sm" />
        </div>
        <button onClick={loadReports} className="bg-blue-600 text-white px-5 py-2 rounded text-sm hover:bg-blue-700">
          Apply
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading reports...</p>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

          {/* Revenue over time */}
          <div className="bg-white rounded-lg shadow-sm p-5 mb-6">
            <h3 className="font-bold text-gray-800 mb-4">Revenue Over Time</h3>
            {byDay.length === 0 ? (
              <p className="text-gray-400 text-sm">No sales in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Best sellers */}
            <div className="bg-white rounded-lg shadow-sm p-5">
              <h3 className="font-bold text-gray-800 mb-4">Best Selling Items</h3>
              {bestSellers.length === 0 ? (
                <p className="text-gray-400 text-sm">No data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={bestSellers} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" fontSize={12} />
                    <YAxis type="category" dataKey="name" width={120} fontSize={10} />
                    <Tooltip />
                    <Bar dataKey="units" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Payment breakdown */}
            <div className="bg-white rounded-lg shadow-sm p-5">
              <h3 className="font-bold text-gray-800 mb-4">Payment Methods</h3>
              {payments.length === 0 ? (
                <p className="text-gray-400 text-sm">No data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={payments} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                      {payments.map((entry, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Reports;