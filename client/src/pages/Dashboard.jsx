import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuthStore } from '../store/auth';

export default function Dashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ servers: 0, keys: 0, tunnels: 0, agents: 0 });

  useEffect(() => {
    Promise.all([
      api.get('/servers'),
      api.get('/keys'),
      api.get('/tunnels'),
      api.get('/agents'),
    ]).then(([s, k, t, a]) => setStats({
      servers: s.data.length,
      keys: k.data.length,
      tunnels: t.data.length,
      agents: a.data.length,
    })).catch(() => {});
  }, []);

  const tiles = [
    { label: 'Servers',  value: stats.servers, to: '/servers', icon: '🖥' },
    { label: 'SSH Keys', value: stats.keys,    to: '/keys',    icon: '🔑' },
    { label: 'Tunnels',  value: stats.tunnels, to: '/tunnels', icon: '⇄' },
    { label: 'Agents',   value: stats.agents,  to: '/agents',  icon: '◈' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span style={{ color: 'var(--text-muted)' }}>Welcome, {user?.username}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        {tiles.map(({ label, value, to, icon }) => (
          <Link key={to} to={to} className="card" style={{ display: 'block', textDecoration: 'none', transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent)' }}>{value}</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
          </Link>
        ))}
      </div>

      <div className="card" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        <strong style={{ color: 'var(--text)' }}>Quick start:</strong> Add a server, upload your SSH key, then click Connect to open a terminal.
      </div>
    </div>
  );
}
