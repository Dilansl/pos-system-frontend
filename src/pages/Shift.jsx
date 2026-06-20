import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaCashRegister, FaLock, FaLockOpen } from 'react-icons/fa';
import shiftService from '../services/shift.service';

function Shift() {
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [lastClosed, setLastClosed] = useState(null);

  const loadCurrent = async () => {
    setLoading(true);
    try {
      const res = await shiftService.getCurrent();
      setCurrent(res.data);
    } catch (err) {
      toast.error('Failed to load shift.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrent();
  }, []);

  const handleOpen = async () => {
    if (openingCash === '' || Number(openingCash) < 0) {
      toast.error('Enter the opening cash amount.');
      return;
    }
    setProcessing(true);
    try {
      await shiftService.open({ openingCash: Number(openingCash), notes });
      toast.success('Shift opened.');
      setOpeningCash('');
      setNotes('');
      setLastClosed(null);
      loadCurrent();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to open shift.');
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = async () => {
    if (closingCash === '' || Number(closingCash) < 0) {
      toast.error('Enter the closing cash amount (count the drawer).');
      return;
    }
    setProcessing(true);
    try {
      const res = await shiftService.close({ closingCash: Number(closingCash), notes });
      setLastClosed(res.data);
      toast.success('Shift closed.');
      setClosingCash('');
      setNotes('');
      loadCurrent();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to close shift.');
    } finally {
      setProcessing(false);
    }
  };

  // Expected drawer = opening cash + cash sales
  const expectedDrawer = (shift, cashSales) =>
    Number(shift.opening_cash) + Number(cashSales || 0);

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <FaCashRegister /> Shift
      </h2>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : current ? (
        /* ── OPEN SHIFT — show details + close form ── */
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-700 flex items-center gap-1">
              <FaLockOpen size={10} /> Shift Open
            </span>
            <span className="text-sm text-gray-500">
              Opened {new Date(current.opened_at).toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 rounded p-3">
              <p className="text-xs text-gray-500">Opening Cash</p>
              <p className="text-lg font-bold text-gray-800">Rs. {Number(current.opening_cash).toLocaleString()}</p>
            </div>
            {current.notes && (
              <div className="bg-gray-50 rounded p-3">
                <p className="text-xs text-gray-500">Notes</p>
                <p className="text-sm text-gray-700">{current.notes}</p>
              </div>
            )}
          </div>

          <hr className="my-4" />

          <h3 className="font-medium text-gray-700 mb-3">Close Shift</h3>
          <p className="text-sm text-gray-500 mb-3">
            Count the cash in the drawer and enter the total below.
          </p>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Closing Cash (counted)</label>
            <input
              type="number"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              placeholder="e.g. 15000"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. drawer short by 200"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <button
            onClick={handleClose}
            disabled={processing}
            className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <FaLock /> {processing ? 'Closing...' : 'Close Shift'}
          </button>
        </div>
      ) : (
        /* ── NO OPEN SHIFT — show open form (+ last closed summary) ── */
        <>
          {lastClosed && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6">
              <h3 className="font-bold text-gray-800 mb-3">Shift Closed — Summary</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Opening Cash:</span> Rs. {Number(lastClosed.opening_cash).toLocaleString()}</div>
                <div><span className="text-gray-500">Cash Sales:</span> Rs. {Number(lastClosed.cash_sales || 0).toLocaleString()}</div>
                <div><span className="text-gray-500">Expected in Drawer:</span> Rs. {expectedDrawer(lastClosed, lastClosed.cash_sales).toLocaleString()}</div>
                <div><span className="text-gray-500">Counted (Closing):</span> Rs. {Number(lastClosed.closing_cash).toLocaleString()}</div>
                <div className="col-span-2 pt-2 border-t border-blue-200">
                  {(() => {
                    const diff = Number(lastClosed.closing_cash) - expectedDrawer(lastClosed, lastClosed.cash_sales);
                    if (diff === 0) return <span className="text-green-600 font-medium">Drawer balances exactly ✓</span>;
                    if (diff > 0) return <span className="text-amber-600 font-medium">Over by Rs. {diff.toLocaleString()}</span>;
                    return <span className="text-red-600 font-medium">Short by Rs. {Math.abs(diff).toLocaleString()}</span>;
                  })()}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600 flex items-center gap-1">
                <FaLock size={10} /> No Open Shift
              </span>
            </div>
            <h3 className="font-medium text-gray-700 mb-3">Open Shift</h3>
            <p className="text-sm text-gray-500 mb-3">
              Enter the starting cash in the drawer to begin.
            </p>
            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Opening Cash</label>
              <input
                type="number"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Morning shift"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            <button
              onClick={handleOpen}
              disabled={processing}
              className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <FaLockOpen /> {processing ? 'Opening...' : 'Open Shift'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default Shift;