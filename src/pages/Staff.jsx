import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaPlus, FaUserShield, FaKey, FaUserSlash, FaUserCheck, FaEdit } from 'react-icons/fa';
import staffService from '../services/staff.service';

function Staff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editStaff, setEditStaff] = useState(null);
  const [passwordStaff, setPasswordStaff] = useState(null);

  const loadStaff = async () => {
    try {
      const res = await staffService.getAll();
      setStaff(res.data);
    } catch (err) {
      toast.error('Failed to load staff.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const handleToggleActive = async (member) => {
    try {
      await staffService.setActive(member.id, !member.is_active);
      toast.success(member.is_active ? 'Staff deactivated.' : 'Staff activated.');
      loadStaff();
    } catch (err) {
      toast.error('Failed to update status.');
    }
  };

  const roleColors = {
    admin: 'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    cashier: 'bg-green-100 text-green-700',
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Staff</h2>
        <button
          onClick={() => { setEditStaff(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
        >
          <FaPlus /> Add Staff
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Username</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Last Login</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{member.name}</td>
                  <td className="px-4 py-3 text-gray-600">{member.username}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs capitalize ${roleColors[member.role]}`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${member.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {member.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {member.last_login ? new Date(member.last_login).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 text-gray-500">
                      <button onClick={() => { setEditStaff(member); setShowModal(true); }} title="Edit" className="hover:text-blue-600">
                        <FaEdit />
                      </button>
                      <button onClick={() => setPasswordStaff(member)} title="Reset password" className="hover:text-orange-600">
                        <FaKey />
                      </button>
                      <button onClick={() => handleToggleActive(member)} title={member.is_active ? 'Deactivate' : 'Activate'} className="hover:text-red-600">
                        {member.is_active ? <FaUserSlash /> : <FaUserCheck />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <StaffModal
          staff={editStaff}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadStaff(); }}
        />
      )}

      {passwordStaff && (
        <PasswordModal
          staff={passwordStaff}
          onClose={() => setPasswordStaff(null)}
          onSuccess={() => setPasswordStaff(null)}
        />
      )}
    </div>
  );
}

// ─── Add / Edit Staff Modal ───────────────────────
function StaffModal({ staff, onClose, onSuccess }) {
  const isEdit = !!staff;
  const [name, setName] = useState(staff?.name || '');
  const [username, setUsername] = useState(staff?.username || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(staff?.role || 'cashier');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Name is required.');
      return;
    }
    if (!isEdit && (!username.trim() || password.length < 6)) {
      toast.error('Username and a password (min 6 chars) are required.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await staffService.update(staff.id, { name, role });
        toast.success('Staff updated.');
      } else {
        await staffService.create({ name, username, password, role });
        toast.success('Staff created.');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save staff.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <FaUserShield /> {isEdit ? 'Edit Staff' : 'Add Staff'}
        </h3>

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full px-3 py-2 border border-gray-300 rounded mb-3" />

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          disabled={isEdit}
          className="w-full px-3 py-2 border border-gray-300 rounded mb-3 disabled:bg-gray-100"
        />

        {!isEdit && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 6 characters)"
            className="w-full px-3 py-2 border border-gray-300 rounded mb-3"
          />
        )}

        <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded mb-4">
          <option value="cashier">Cashier</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reset Password Modal ─────────────────────────
function PasswordModal({ staff, onClose, onSuccess }) {
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    try {
      await staffService.resetPassword(staff.id, newPassword);
      toast.success('Password reset.');
      onSuccess();
    } catch (err) {
      toast.error('Failed to reset password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
          <FaKey /> Reset Password
        </h3>
        <p className="text-sm text-gray-500 mb-4">For {staff.name} ({staff.username})</p>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (min 6 characters)"
          className="w-full px-3 py-2 border border-gray-300 rounded mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Reset'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Staff;