import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaReceipt, FaUndo, FaTimes } from 'react-icons/fa';
import saleService from '../services/sale.service';
import returnService from '../services/return.service';

function Transactions() {
  const [tab, setTab] = useState('sales'); // 'sales' | 'refunds'
  const [sales, setSales] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);     // sale detail for modal
  const [detailLoading, setDetailLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      // Build query string for sales date filter
      let params = '?limit=500';
      if (startDate) params += `&startDate=${startDate}`;
      if (endDate) params += `&endDate=${endDate} 23:59:59`;

      const [salesRes, refundsRes] = await Promise.all([
        saleService.getAll(params),
        returnService.getAll(),
      ]);
      setSales(salesRes.data);

      // Filter refunds by date on the frontend
      let filteredRefunds = refundsRes.data;
      if (startDate) {
        filteredRefunds = filteredRefunds.filter((r) => new Date(r.created_at) >= new Date(startDate));
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filteredRefunds = filteredRefunds.filter((r) => new Date(r.created_at) <= end);
      }
      setRefunds(filteredRefunds);
    } catch (err) {
      toast.error('Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  const openSaleDetail = async (saleId) => {
    setDetailLoading(true);
    try {
      const res = await saleService.getById(saleId);
      setDetail(res.data);
    } catch (err) {
      toast.error('Failed to load details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const rfNumber = (seq) => (seq ? `RF-${String(seq).padStart(4, '0')}` : '—');

  const statusBadge = (status) => {
    const map = {
      completed: 'bg-green-100 text-green-700',
      refunded: 'bg-red-100 text-red-700',
      partially_refunded: 'bg-amber-100 text-amber-700',
      held: 'bg-gray-100 text-gray-600',
    };
    return map[status] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Transactions</h2>

      {/* Tabs */}
      {/* Date filter */}
      <div className="bg-white rounded-lg shadow-sm p-3 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded text-sm"
          />
        </div>
        <button
          onClick={() => {
            const today = new Date().toISOString().split('T')[0];
            setStartDate(today);
            setEndDate(today);
          }}
          className="px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
        >
          Today
        </button>
        {(startDate || endDate) && (
          <button
            onClick={() => { setStartDate(''); setEndDate(''); }}
            className="px-3 py-2 text-gray-500 rounded text-sm hover:bg-gray-100"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('sales')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${tab === 'sales' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
        >
          <FaReceipt /> Sales ({sales.length})
        </button>
        <button
          onClick={() => setTab('refunds')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${tab === 'refunds' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
        >
          <FaUndo /> Refunds ({refunds.length})
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {/* SALES TAB */}
          {tab === 'sales' && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Receipt</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Cashier</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No sales yet.</td></tr>
                ) : (
                  sales.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => openSaleDetail(s.id)}
                      className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">{rfNumber(s.receipt_seq)}</td>
                      <td className="px-4 py-3 text-gray-600">{new Date(s.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-600">{s.cashier_name || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-800">Rs. {Number(s.total).toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs ${statusBadge(s.status)}`}>
                          {s.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* REFUNDS TAB */}
          {tab === 'refunds' && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Receipt</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Items Returned</th>
                  <th className="text-left px-4 py-3 font-medium">Processed By</th>
                  <th className="text-left px-4 py-3 font-medium">Method</th>
                  <th className="text-right px-4 py-3 font-medium">Refund</th>
                </tr>
              </thead>
              <tbody>
                {refunds.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No refunds yet.</td></tr>
                ) : (
                  refunds.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{rfNumber(r.receipt_seq)}</td>
                      <td className="px-4 py-3 text-gray-600">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.items && r.items.length > 0 ? (
                          <div className="space-y-1">
                            {r.items.map((it, idx) => (
                              <div key={idx} className="text-xs">
                                <span className="text-gray-800">{it.product_name}</span>
                                {it.barcode && <span className="text-gray-400 font-mono"> [{it.barcode}]</span>}
                                <span className="text-gray-400"> ×{it.quantity}</span>
                              </div>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.staff_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{r.refund_method?.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-right text-red-600 font-medium">Rs. {Number(r.refund_amount).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Sale detail modal */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {detailLoading ? (
              <p className="text-gray-500">Loading...</p>
            ) : detail && (
              <>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{rfNumber(detail.receipt_seq)}</h3>
                    <p className="text-xs text-gray-500">
                      {new Date(detail.created_at).toLocaleString()} · Cashier: {detail.cashier_name}
                    </p>
                  </div>
                  <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600">
                    <FaTimes />
                  </button>
                </div>

                <span className={`inline-block px-2 py-1 rounded text-xs mb-3 ${statusBadge(detail.status)}`}>
                  {detail.status.replace('_', ' ')}
                </span>

                {/* Items */}
                <table className="w-full text-sm mb-3">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-2 py-2 font-medium">Item</th>
                      <th className="text-center px-2 py-2 font-medium">Qty</th>
                      <th className="text-right px-2 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items?.map((it) => (
                      <tr key={it.id} className="border-t border-gray-100">
                        <td className="px-2 py-2">
                          <p className="text-gray-800">{it.product_name}</p>
                          <p className="text-xs text-gray-500">{it.size} · {it.color} {it.barcode ? `· ${it.barcode}` : ''}</p>
                        </td>
                        <td className="text-center px-2 py-2">{it.quantity}</td>
                        <td className="text-right px-2 py-2">Rs. {Number(it.line_total).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="border-t border-gray-200 pt-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>Rs. {Number(detail.subtotal).toLocaleString()}</span></div>
                  {Number(detail.discount_amount) > 0 && (
                    <div className="flex justify-between text-green-600"><span>Discount</span><span>− Rs. {Number(detail.discount_amount).toLocaleString()}</span></div>
                  )}
                  <div className="flex justify-between font-bold text-base mt-1"><span>Total</span><span className="text-blue-600">Rs. {Number(detail.total).toLocaleString()}</span></div>
                </div>

                {/* Payments */}
                {detail.payments?.length > 0 && (
                  <div className="border-t border-gray-200 pt-2 mt-2 text-sm">
                    {detail.payments.map((p) => (
                      <div key={p.id} className="flex justify-between text-gray-600">
                        <span className="capitalize">{p.method?.replace('_', ' ')}</span>
                        <span>Rs. {Number(p.amount).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end mt-4">
                  <button onClick={() => setDetail(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Transactions;