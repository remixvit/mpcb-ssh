import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import api from '../api';
import Icon from './Icon';

const NAV = [
  { to: '/',        label: 'Dashboard', icon: 'dashboard', group: 'Workspace', end: true },
  { to: '/servers', label: 'Servers',   icon: 'server',    group: 'Workspace' },
  { to: '/keys',    label: 'SSH Keys',  icon: 'key',       group: 'Security' },
  { to: '/tunnels', label: 'Tunnels',   icon: 'tunnel',    group: 'Network' },
  { to: '/agents',  label: 'Agents',    icon: 'agent',     group: 'Network' },
];

const GROUPS = ['Workspace', 'Security', 'Network'];

export default function Layout({ children }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    try { await api.post('/auth/logout'); } catch {}
    logout();
    navigate('/login');
  }

  const currentNav = NAV.find(n => n.end ? location.pathname === n.to : location.pathname.startsWith(n.to));
  const initials = user?.username?.slice(0, 2).toUpperCase() || 'ME';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div className="brand-name">MPCB SSH<small>self-hosted</small></div>
        </div>

        {GROUPS.map(g => (
          <div key={g}>
            <div className="nav-group-label">{g}</div>
            {NAV.filter(n => n.group === g).map(n => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </NavLink>
            ))}
          </div>
        ))}

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{initials}</div>
            <div className="user-meta">
              <div className="user-name">{user?.username || 'user'}</div>
              <div className="user-host">mpcb.local</div>
            </div>
            <Icon name="logout" style={{ color: 'var(--text-faint)', cursor: 'pointer' }} onClick={handleLogout} />
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>MPCB</span>
            <span className="sep">/</span>
            <span className="here">{currentNav?.label || 'Terminal'}</span>
          </div>
          <div className="topbar-spacer"></div>
          <div className="topbar-pill"><span className="dot pulse"></span> daemon healthy</div>
          <div className="topbar-pill"><Icon name="shield" style={{ width: 11, height: 11 }} /> TLS 1.3</div>
        </header>

        <div className="content" key={location.pathname}>
          {children}
        </div>
      </main>
    </div>
  );
}
