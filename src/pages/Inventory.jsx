import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { FaExclamationTriangle, FaPlus, FaMinus, FaHistory, FaSearch } from 'react-icons/fa';
import inventoryService from '../services/inventory.service';
import Modal from '../components/common/Modal';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

function Inventory() {
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adjustItem, setAdjustItem] = useState(null);
  const [lowStockCount, setLowStockCount] = useState(0);

  // ── Server-side pagination + search state ──
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  // Guards against a slower earlier request resolving after a newer one and
  // clobbering the UI with stale results (variable network latency, fast typing).
  const requestIdRef = useRef(0);

  // Debounce: wait 350ms after the user stops typing before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset to page 1 whenever the search term or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, pageSize]);

  const loadStock = async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const res = await inventoryService.getAll({
        page: currentPage,
        limit: pageSize,
        search: debouncedSearch,
      });
      if (requestId !== requestIdRef.current) return;
      setStock(res.data);
      setTotalPages(res.totalPages);
      setTotalCount(res.total);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      toast.error('Failed to load inventory.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  // Re-fetch whenever page, page size, or the debounced search term changes
  useEffect(() => {
    loadStock();
  }, [currentPage, pageSize, debouncedSearch]);

  // Low-stock badge counts the WHOLE inventory, independent of pagination —
  // fetched separately so paging the table doesn't change the count.
  const loadLowStockCount = async () => {
    try {
      const res = await inventoryService.getLowStock();
      setLowStockCount(res.data.length);
    } catch (err) {
      // Non-critical — just skip the badge if this fails.
    }
  };

  useEffect(() => {
    loadLowStockCount();
  }, []);

  const refreshAll = () => {
    loadStock();
    loadLowStockCount();
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Inventory</h2>
        {lowStockCount > 0 && (
          <span className="flex items-center gap-2 bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg text-sm">
            <FaExclamationTriangle /> {lowStockCount} low stock item{lowStockCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Search + page size */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="relative w-full sm:w-72">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by product, category, or barcode..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>Show</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span>per page</span>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : stock.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-12 text-center">
          <p className="text-slate-500">
            {debouncedSearch ? 'No stock records match your search.' : 'No stock records yet. Add products first.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Product</th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Variant</th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Barcode</th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider">In Stock</th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Min</th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-slate-100 hover:bg-slate-50 ${item.is_low_stock ? 'bg-orange-50' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">{item.product_name}</td>
                  <td className="px-4 py-3 text-slate-600">{item.size} · {item.color}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{item.barcode || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${item.is_low_stock ? 'text-orange-600' : 'text-slate-800'}`}>
                      {item.quantity}
                    </span>
                    {item.is_low_stock && (
                      <FaExclamationTriangle className="inline ml-2 text-orange-500" size={12} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{item.min_quantity}</td>
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

      {/* Pagination footer */}
      {!loading && totalCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-4 text-sm text-slate-600">
          <span>
            Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} of {totalCount} items
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Prev
            </button>
            <span className="text-slate-500">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {adjustItem && (
        <AdjustModal
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          onSuccess={() => { setAdjustItem(null); refreshAll(); }}
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
    <Modal onClose={onClose} title="Adjust Stock">
      <p className="text-sm text-slate-500 mb-4">
        {item.product_name} · {item.size} · {item.color}
      </p>
      <p className="text-sm text-slate-600 mb-4">
        Current stock: <span className="font-bold">{item.quantity}</span>
      </p>

      {/* Add / Remove toggle */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setMode('add')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm ${mode === 'add' ? 'bg-green-600 text-white' : 'bg-slate-50 text-slate-700 border border-slate-200'}`}
        >
          <FaPlus size={12} /> Add Stock
        </button>
        <button
          onClick={() => setMode('remove')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm ${mode === 'remove' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-700 border border-slate-200'}`}
        >
          <FaMinus size={12} /> Remove Stock
        </button>
      </div>

      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Quantity"
        className="w-full px-3 py-2 border border-slate-300 rounded mb-3"
      />

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional) — e.g. new delivery"
        className="w-full px-3 py-2 border border-slate-300 rounded mb-4"
      />

      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600 disabled:opacity-50">
          {saving ? 'Saving...' : 'Update Stock'}
        </button>
      </div>
    </Modal>
  );
}

export default Inventory;