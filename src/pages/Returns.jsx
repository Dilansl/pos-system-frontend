import { useState } from 'react';
import toast from 'react-hot-toast';
import { FaSearch, FaUndo } from 'react-icons/fa';
import saleService from '../services/sale.service';
import returnService from '../services/return.service';

function Returns() {
  const [saleId, setSaleId] = useState('');
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(false);
  const [returnItems, setReturnItems] = useState({});
  const [refundMethod, setRefundMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  // Remaining returnable qty for an item
  const remainingQty = (item) => item.quantity - (item.already_returned || 0);

  const handleLookup = async () => {
    if (!saleId.trim()) {
      toast.error('Enter a receipt number.');
      return;
    }
    setLoading(true);
    setSale(null);
    setReturnItems({});
    try {
      const seq = saleId.trim().replace(/[^0-9]/g, '');
      const res = await saleService.getByReceiptSeq(seq);
      if (res.data.status === 'refunded') {
        toast('This sale is fully refunded — nothing left to return.', { icon: 'ℹ️' });
      }
      setSale(res.data);
    } catch (err) {
      toast.error('Receipt not found. Check the number.');
    } finally {
      setLoading(false);
    }
  };

  const setItemQty = (saleItemId, qty, maxQty) => {
    const q = Math.max(0, Math.min(Number(qty), maxQty));
    setReturnItems({ ...returnItems, [saleItemId]: q });
  };

  const calculateRefund = () => {
    if (!sale) return 0;
    return sale.items.reduce((sum, item) => {
      const qty = returnItems[item.id] || 0;
      return sum + qty * Number(item.unit_price);
    }, 0);
  };

  const handleProcessReturn = async () => {
    const itemsToReturn = sale.items
      .filter((item) => (returnItems[item.id] || 0) > 0)
      .map((item) => ({
        saleItemId: item.id,
        quantity: returnItems[item.id],
        refundAmount: returnItems[item.id] * Number(item.unit_price),
      }));

    if (itemsToReturn.length === 0) {
      toast.error('Select at least one item to return.');
      return;
    }

    const refundAmount = calculateRefund();

    setProcessing(true);
    try {
      await returnService.create({
        originalSaleId: sale.id,
        refundAmount,
        refundMethod,
        reason,
        items: itemsToReturn,
      });
      toast.success('Return processed. Stock restored.');
      setSale(null);
      setSaleId('');
      setReturnItems({});
      setReason('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to process return.');
    } finally {
      setProcessing(false);
    }
  };

  const refundTotal = calculateRefund();
  // Is there anything still returnable on this sale?
  const anyReturnable = sale?.items?.some((item) => remainingQty(item) > 0);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Returns & Refunds</h2>

      {/* Sale lookup */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Enter Receipt Number to process a return
        </label>
        <div className="flex gap-2">
          <input
            value={saleId}
            onChange={(e) => setSaleId(e.target.value)}
            placeholder="e.g. RF-0006 or 6"
            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
          />
          <button
            onClick={handleLookup}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <FaSearch /> {loading ? 'Looking up...' : 'Look Up'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Tip: the receipt number is printed on the customer's receipt (e.g. RF-0006).
        </p>
      </div>

      {/* Sale details + return form */}
      {sale && (
        <div className="bg-white rounded-lg shadow-sm p-5">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-bold text-gray-800">
                {sale.receipt_seq ? `RF-${String(sale.receipt_seq).padStart(4, '0')}` : `Sale #${sale.id.slice(0, 8)}`}
              </h3>
              <p className="text-xs text-gray-500">
                {new Date(sale.created_at).toLocaleString()} · Cashier: {sale.cashier_name}
              </p>
            </div>
            <span className={`px-2 py-1 rounded text-xs ${
              sale.status === 'refunded' ? 'bg-red-100 text-red-700'
              : sale.status === 'partially_refunded' ? 'bg-amber-100 text-amber-700'
              : 'bg-green-100 text-green-700'
            }`}>
              {sale.status.replace('_', ' ')}
            </span>
          </div>

          {/* Items table */}
          <table className="w-full text-sm mb-4">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Item</th>
                <th className="text-center px-3 py-2 font-medium">Sold Qty</th>
                <th className="text-center px-3 py-2 font-medium">Returned</th>
                <th className="text-center px-3 py-2 font-medium">Unit Price</th>
                <th className="text-center px-3 py-2 font-medium">Return Qty</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => {
                const remaining = remainingQty(item);
                const fullyReturned = remaining <= 0;
                return (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-800">{item.product_name}</p>
                      <p className="text-xs text-gray-500">{item.size} · {item.color}</p>
                    </td>
                    <td className="text-center px-3 py-2">{item.quantity}</td>
                    <td className="text-center px-3 py-2">
                      {item.already_returned > 0 ? (
                        <span className="text-amber-600">{item.already_returned}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="text-center px-3 py-2">Rs. {Number(item.unit_price).toLocaleString()}</td>
                    <td className="text-center px-3 py-2">
                      {fullyReturned ? (
                        <span className="text-xs text-gray-400">— returned —</span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          max={remaining}
                          value={returnItems[item.id] || 0}
                          onChange={(e) => setItemQty(item.id, e.target.value, remaining)}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {anyReturnable ? (
            <>
              {/* Refund method + reason */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Refund Method</label>
                  <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="store_credit">Store Credit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Reason (optional)</label>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong size" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
              </div>

              {/* Refund total + button */}
              <div className="flex justify-between items-center border-t border-gray-200 pt-4">
                <div>
                  <p className="text-sm text-gray-500">Total Refund</p>
                  <p className="text-2xl font-bold text-red-600">Rs. {refundTotal.toLocaleString()}</p>
                </div>
                <button
                  onClick={handleProcessReturn}
                  disabled={processing || refundTotal === 0}
                  className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <FaUndo /> {processing ? 'Processing...' : 'Process Return'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-center text-sm text-gray-500 py-2">
              All items on this sale have been returned.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default Returns;