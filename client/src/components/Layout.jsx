import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import api from '../api';

const NAV = [
  { to: '/',        label: 'Dashboard',  icon: '⊞' },
  { to: '/servers', label: 'Servers',    icon: '🖥' },
  { to: '/keys',    label: 'SSH Keys',   icon: '🔑' },
  { to: '/tunnels', label: 'Tunnels',    icon: '⇄' },
  { to: '/agents',  label: 'Agents',     icon: '◈' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  async function handleLogout() {
    try { await api.post('/auth/logout'); } catch {}
    logout();
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 'var(--sidebar-w)', minWidth: 'var(--sidebar-w)',
        background: 'var(--bg-panel)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: '0',
      }}>
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)', letterSpacing: 1 }}>MPCB SSH</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{user?.username}</div>
        </div>

        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {NAV.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 6, marginBottom: 2,
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              background: isActive ? 'var(--bg-card)' : 'transparent',
              transition: 'all 0.15s',
              fontSize: 14,
            })}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
          <NavLink to="/settings" style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:6, color:'var(--text-muted)', fontSize:14, marginBottom:2 }}>
            ⚙ Settings
          </NavLink>
          <button onClick={handleLogout} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '9px 12px', borderRadius: 6,
            background: 'transparent', color: 'var(--text-muted)', fontSize: 14,
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            ⎋ Logout
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
