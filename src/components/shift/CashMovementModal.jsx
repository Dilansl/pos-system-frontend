import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaMoneyBillWave, FaUserShield } from 'react-icons/fa';
import Modal from '../common/Modal';
import shiftService from '../../services/shift.service';
import settingsService from '../../services/settings.service';
import useAuthStore from '../../store/authStore';

const OUT_REASONS = ['Tea / food', 'Transport', 'Supplier payment', 'Shop supplies', 'Owner took cash'];
const IN_REASONS = ['Change / float added', 'Owner added cash'];

// Petty cash put into / taken out of the drawer during the shift. A cashier's
// cash-out above the limit needs a manager PIN, asked for right here.
function CashMovementModal({ onClose, onSaved }) {
  const user = useAuthStore((state) => state.user);
  const [type, setType] = useState('out');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [settings, setSettings] = useState(null); // { cashOutLimit, approvers }
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsService.getCash()
      .then((res) => {
        setSettings(res.data);
        setApproverId(res.data.approvers[0]?.id || '');
      })
      .catch(() => toast.error('Could not load the cash-out limit.'));
  }, []);

  const value = Number(amount);
  const needsPin = type === 'out' && user?.role === 'cashier'
    && settings && value > settings.cashOutLimit;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!(value > 0)) {
      toast.error('Enter the amount.');
      return;
    }
    if (!reason.trim()) {
      toast.error('Enter a reason.');
      return;
    }
    if (needsPin && (!approverId || pin.length < 4)) {
      toast.error('A manager must approve with their PIN.');
      return;
    }
    setSaving(true);
    try {
      const res = await shiftService.addCashMovement({
        type,
        amount: value,
        reason: reason.trim(),
        ...(needsPin ? { approverId, pin } : {}),
      });
      toast.success(res.message);
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save.');
      setPin('');
    } finally {
      setSaving(false);
    }
  };

  const reasons = type === 'out' ? OUT_REASONS : IN_REASONS;

  return (
    <Modal onClose={onClose} titleId="cash-move-title">
      <h3 id="cash-move-title" className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
        <FaMoneyBillWave /> Cash in / out
      </h3>
      <p className="text-sm text-slate-500 mb-4">
        Money added to or taken from the drawer that isn't a sale. It's counted when you close the shift.
      </p>

      <form onSubmit={handleSave}>
        <div className="grid grid-cols-2 gap-2 mb-3" role="radiogroup" aria-label="Cash in or out">
          {[['out', 'Cash out'], ['in', 'Cash in']].map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => { setType(t); setReason(''); }}
              className={`py-2 rounded border text-sm font-medium ${
                type === t
                  ? (t === 'out' ? 'bg-red-600 border-red-600 text-white' : 'bg-green-600 border-green-600 text-white')
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="block text-xs text-slate-500 mb-1" htmlFor="cash-move-amount">Amount (Rs.)</label>
        <input
          id="cash-move-amount"
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 500"
          autoFocus
          className="w-full px-3 py-2 border border-slate-300 rounded mb-3"
        />

        <label className="block text-xs text-slate-500 mb-1" htmlFor="cash-move-reason">Reason</label>
        <input
          id="cash-move-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={type === 'out' ? 'e.g. Tea for staff' : 'e.g. Change from bank'}
          maxLength={255}
          className="w-full px-3 py-2 border border-slate-300 rounded mb-2"
        />
        <div className="flex flex-wrap gap-1.5 mb-4">
          {reasons.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className="px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-600 hover:bg-slate-100"
            >
              {r}
            </button>
          ))}
        </div>

        {needsPin && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4">
            <p className="text-sm text-amber-800 mb-2 flex items-center gap-1.5">
              <FaUserShield /> Over Rs. {settings.cashOutLimit.toLocaleString()} — manager approval needed.
            </p>
            {settings.approvers.length === 0 ? (
              <p className="text-sm text-red-600">
                No manager has an approval PIN yet. An admin can set one in Staff → PIN.
              </p>
            ) : (
              <div className="flex gap-2">
                <select
                  value={approverId}
                  onChange={(e) => setApproverId(e.target.value)}
                  aria-label="Approving manager"
                  className="flex-1 min-w-0 px-2 py-2 border border-slate-300 rounded text-sm bg-white"
                >
                  {settings.approvers.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                  ))}
                </select>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="PIN"
                  aria-label="Manager PIN"
                  className="w-24 px-2 py-2 border border-slate-300 rounded text-sm"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-300 rounded hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Saving...' : type === 'out' ? 'Record cash out' : 'Record cash in'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default CashMovementModal;
