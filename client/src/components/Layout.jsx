import { NavLink, Outlet } from 'react-router-dom';
import { Bot, LayoutDashboard, Lightbulb, List, LogOut, Send, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth.jsx';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/send', label: 'Send Money', icon: Send },
  { to: '/transactions', label: 'Transactions', icon: List },
  { to: '/assistant', label: 'AI Assistant', icon: Bot },
  { to: '/insights', label: 'Insights', icon: Lightbulb },
  { to: '/kyc', label: 'KYC', icon: ShieldCheck },
];

function NavItem({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
        }`
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const links = user.role === 'admin' ? [...LINKS, { to: '/admin', label: 'Admin', icon: ShieldAlert }] : LINKS;

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">₹</div>
            <span className="text-lg font-semibold">BankAI</span>
          </div>
          <button onClick={logout} className="text-slate-500 hover:text-slate-800 md:hidden" aria-label="Log out">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
          {links.map((link) => (
            <NavItem key={link.to} {...link} />
          ))}
        </nav>
        <div className="hidden border-t border-slate-200 p-4 md:block">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <button onClick={logout} className="mt-3 flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
