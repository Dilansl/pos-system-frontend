import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaExclamationTriangle, FaPlus, FaMinus, FaHistory } from 'react-icons/fa';
import inventoryService from '../services/inventory.service';

function Inventory() {
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adjustItem, setAdjustItem] = useState(null);

  const loadStock = async () => {
    try {
      const res = await inventoryService.getAll();
      setStock(res.data);
    } catch (err) {
      toast.error('Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStock();
  }, []);

  const lowStockCount = stock.filter((s) => s.is_low_stock).length;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Inventory</h2>
        {lowStockCount > 0 && (
          <span className="flex items-center gap-2 bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg text-sm">
            <FaExclamationTriangle /> {lowStockCount} low stock item{lowStockCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : stock.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <p className="text-gray-500">No stock records yet. Add products first.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Product</th>
                <th className="text-left px-4 py-3 font-medium">Variant</th>
                <th className="text-left px-4 py-3 font-medium">Barcode</th>
                <th className="text-left px-4 py-3 font-medium">In Stock</th>
                <th className="text-left px-4 py-3 font-medium">Min</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-gray-100 hover:bg-gray-50 ${item.is_low_stock ? 'bg-orange-50' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{item.product_name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.size} · {item.color}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{item.barcode || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${item.is_low_stock ? 'text-orange-600' : 'text-gray-800'}`}>
                      {item.quantity}
                    </span>
                    {item.is_low_stock && (
                      <FaExclamationTriangle className="inline ml-2 text-orange-500" size={12} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{item.min_quantity}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setAdjustItem(item)}
                      className="text-blue-600 text-sm hover:underline"
                    >
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adjustItem && (
        <AdjustModal
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          onSuccess={() => { setAdjustItem(null); loadStock(); }}
        />
      )}
    </div>
  );
}

// ─── Adjust Stock Modal ───────────────────────────
function AdjustModal({ item, onClose, onSuccess }) {
  const [mode, setMode] = useState('add');  // 'add' or 'remove'
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const qty = Number(amount);
    if (!qty || qty <= 0) {
      toast.error('Enter a valid amount.');
      return;
    }

    // Positive for add, negative for remove
    const quantityChange = mode === 'add' ? qty : -qty;

    setSaving(true);
    try {
      await inventoryService.adjust({
        variantId: item.variant_id,
        quantityChange,
        changeType: 'manual',
        note: note || `Manual ${mode}`,
      });
      toast.success('Stock updated.');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update stock.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-gray-800 mb-1">Adjust Stock</h3>
        <p className="text-sm text-gray-500 mb-4">
          {item.product_name} · {item.size} · {item.color}
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Current stock: <span className="font-bold">{item.quantity}</span>
        </p>

        {/* Add / Remove toggle */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setMode('add')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm ${mode === 'add' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            <FaPlus size={12} /> Add Stock
          </button>
          <button
            onClick={() => setMode('remove')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm ${mode === 'remove' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            <FaMinus size={12} /> Remove Stock
          </button>
        </div>

        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Quantity"
          className="w-full px-3 py-2 border border-gray-300 rounded mb-3"
        />

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional) — e.g. new delivery"
          className="w-full px-3 py-2 border border-gray-300 rounded mb-4"
        />

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Update Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Inventory;