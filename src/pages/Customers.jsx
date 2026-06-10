import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaPlus, FaUserFriends, FaStar, FaPhone, FaEnvelope, FaArrowLeft } from 'react-icons/fa';
import customerService from '../services/customer.service';

function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const loadCustomers = async () => {
    try {
      const res = await customerService.getAll();
      setCustomers(res.data);
    } catch (err) {
      toast.error('Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const viewCustomer = async (id) => {
    try {
      const res = await customerService.getById(id);
      setSelectedCustomer(res.data);
    } catch (err) {
      toast.error('Failed to load customer.');
    }
  };

  // ─── CUSTOMER DETAIL VIEW ─────────────────────────
  if (selectedCustomer) {
    return (
      <div className="p-6">
        <button
          onClick={() => setSelectedCustomer(null)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 text-sm"
        >
          <FaArrowLeft /> Back to customers
        </button>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold">
              {selectedCustomer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">{selectedCustomer.name}</h2>
              <div className="flex gap-4 text-sm text-gray-500 mt-1">
                {selectedCustomer.phone && (
                  <span className="flex items-center gap-1"><FaPhone size={12} /> {selectedCustomer.phone}</span>
                )}
                {selectedCustomer.email && (
                  <span className="flex items-center gap-1"><FaEnvelope size={12} /> {selectedCustomer.email}</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-yellow-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 flex items-center gap-1"><FaStar className="text-yellow-500" /> Loyalty Points</p>
              <p className="text-2xl font-bold text-gray-800">{selectedCustomer.loyalty_points}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-xs text-gray-500">Total Spent</p>
              <p className="text-2xl font-bold text-gray-800">Rs. {Number(selectedCustomer.total_spent).toLocaleString()}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-xs text-gray-500">Total Visits</p>
              <p className="text-2xl font-bold text-gray-800">{selectedCustomer.purchaseHistory?.length || 0}</p>
            </div>
          </div>
        </div>

        {/* Purchase history */}
        <div className="bg-white rounded-lg shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-4">Purchase History</h3>
          {!selectedCustomer.purchaseHistory || selectedCustomer.purchaseHistory.length === 0 ? (
            <p className="text-gray-400 text-sm">No purchases yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Total</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedCustomer.purchaseHistory.map((sale) => (
                  <tr key={sale.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-600">{new Date(sale.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 font-medium">Rs. {Number(sale.total).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-1 rounded text-xs ${sale.status === 'refunded' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {sale.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ─── CUSTOMER LIST VIEW ───────────────────────────
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Customers</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
        >
          <FaPlus /> Add Customer
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <FaUserFriends className="text-gray-300 text-5xl mx-auto mb-3" />
          <p className="text-gray-500">No customers yet. Add your first customer.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Loyalty Points</th>
                <th className="text-left px-4 py-3 font-medium">Total Spent</th>
                <th className="text-left px-4 py-3 font-medium">Visits</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => viewCustomer(c.id)}
                  className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-yellow-600">
                      <FaStar size={12} /> {c.loyalty_points}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-800">Rs. {Number(c.total_spent).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-600">{c.total_visits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CustomerModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadCustomers(); }}
        />
      )}
    </div>
  );
}

// ─── Add Customer Modal ───────────────────────────
function CustomerModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Customer name is required.');
      return;
    }
    setSaving(true);
    try {
      await customerService.create({
        name,
        phone: phone || null,
        email: email || null,
      });
      toast.success('Customer added.');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add customer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Add Customer</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full px-3 py-2 border border-gray-300 rounded mb-3" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="w-full px-3 py-2 border border-gray-300 rounded mb-3" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="w-full px-3 py-2 border border-gray-300 rounded mb-4" />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Customers;