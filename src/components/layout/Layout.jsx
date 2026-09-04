import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { FaBars } from 'react-icons/fa';
import Sidebar from './Sidebar';

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar — hidden on md+ where the sidebar is always visible */}
        <div className="md:hidden flex items-center gap-3 bg-slate-900 text-white px-4 py-3">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="text-xl">
            <FaBars />
          </button>
          <span className="font-bold">ROPYCO Fashion</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
