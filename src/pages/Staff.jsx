import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaPlus, FaUserShield, FaKey, FaUserSlash, FaUserCheck, FaEdit } from 'react-icons/fa';
import staffService from '../services/staff.service';
import Modal from '../components/common/Modal';

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
    if (member.is_active && !window.confirm(`Deactivate ${member.name}? They'll be signed out immediately and won't be able to log in until reactivated.`)) {
      return;
    }
    try {
      await staffService.setActive(member.id, !member.is_active);
      toast.success(member.is_active ? 'Staff deactivated.' : 'Staff activated.');
      loadStaff();
    } catch (err) {
      toast.error('Failed to update status.');
    }
  };

  const roleColors = {
    admin: 'bg-purple-50 text-purple-700 border border-purple-200',
    manager: 'bg-blue-50 text-blue-700 border border-blue-200',
    cashier: 'bg-green-50 text-green-700 border border-green-200',
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Staff</h2>
        <button
          onClick={() => { setEditStaff(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-yellow-500 text-black px-4 py-2 rounded-lg hover:bg-yellow-600 text-sm"
        >
          <FaPlus /> Add Staff
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Username</th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Last Login</th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{member.name}</td>
                  <td className="px-4 py-3 text-slate-600">{member.username}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs capitalize ${roleColors[member.role]}`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${member.is_active ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-500'}`}>
                      {member.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {member.last_login ? new Date(member.last_login).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 text-slate-500">
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
    <Modal onClose={onClose} titleId="staff-modal-title">
      <h3 id="staff-modal-title" className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <FaUserShield /> {isEdit ? 'Edit Staff' : 'Add Staff'}
      </h3>

      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full px-3 py-2 border border-slate-300 rounded mb-3" />

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          disabled={isEdit}
          className="w-full px-3 py-2 border border-slate-300 rounded mb-3 disabled:bg-slate-100"
        />

        {!isEdit && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 6 characters)"
            className="w-full px-3 py-2 border border-slate-300 rounded mb-3"
          />
        )}

        <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded mb-4">
          <option value="cashier">Cashier</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
    </Modal>
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
    <Modal onClose={onClose} titleId="password-modal-title">
      <h3 id="password-modal-title" className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
        <FaKey /> Reset Password
      </h3>
      <p className="text-sm text-slate-500 mb-4">For {staff.name} ({staff.username})</p>
      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="New password (min 6 characters)"
        className="w-full px-3 py-2 border border-slate-300 rounded mb-4"
      />
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600 disabled:opacity-50">
          {saving ? 'Saving...' : 'Reset'}
        </button>
      </div>
    </Modal>
  );
}

export default Staff;