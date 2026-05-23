import { useEffect, useState } from 'react';
import api from '../api';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';

function Meter({ label, value, online }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{online && value != null ? value + '%' : '—'}</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 99 }}>
        <div style={{
          height: '100%',
          width: online && value != null ? value + '%' : '0%',
          background: value > 75 ? 'var(--warning)' : online ? 'var(--online)' : 'var(--offline)',
          borderRadius: 99,
          transition: 'width 400ms',
        }}></div>
      </div>
    </div>
  );
}

function AgentCard({ agent, onDelete }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="tile-ico" style={{
          width: 36, height: 36,
          background: agent.online ? 'rgba(195,232,141,0.10)' : 'rgba(255,255,255,0.04)',
          borderColor: agent.online ? 'rgba(195,232,141,0.25)' : 'var(--border)',
        }}>
          <Icon name="cpu" style={{ color: agent.online ? 'var(--online)' : 'var(--text-dim)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b>{agent.name}</b>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {agent.hostname || 'Never connected'}
          </div>
        </div>
        <StatusBadge status={agent.online ? 'online' : 'offline'} />
      </div>

      {agent.online && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14, fontSize: 12 }}>
          <Meter label="CPU" value={agent.cpu} online={agent.online} />
          <Meter label="Mem" value={agent.mem} online={agent.online} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--text-dim)' }}>
        <span>{agent.platform || '—'}</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {agent.last_seen ? new Date(agent.last_seen).toLocaleString() : 'Never connected'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <div style={{ flex: 1 }}></div>
        <button className="btn ghost sm danger" onClick={onDelete}>
          <Icon name="power" />Revoke
        </button>
      </div>
    </div>
  );
}

function TokenModal({ open, onClose, token, agentName }) {
  const [copied, setCopied] = useState(false);
  const cmd = `mpcb-agent --server wss://ssh.mpcbstudio.com --token ${token} --name "${agentName}"`;

  function copy() {
    navigator.clipboard?.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Modal open={open} onClose={onClose} title="Enroll new agent" wide
      foot={<button className="btn" onClick={onClose}>Done</button>}>
      <div style={{ color: 'var(--text-2)', marginBottom: 10 }}>
        Run this command on the target machine. Token is shown <b>once only</b>.
      </div>
      <div className="code-block" style={{ position: 'relative', padding: '14px', whiteSpace: 'pre-wrap' }}>
        <span style={{ color: 'var(--text-dim)' }}>$ </span>{cmd}
        <button className="btn sm" style={{ position: 'absolute', top: 8, right: 8 }} onClick={copy}>
          {copied ? <><Icon name="check" />Copied</> : <><Icon name="copy" />Copy</>}
        </button>
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-dim)' }}>
        The agent will connect and appear here once running. You can revoke at any time.
      </div>
    </Modal>
  );
}

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newAgent, setNewAgent] = useState(null);

  useEffect(() => {
    api.get('/agents').then(r => setAgents(r.data)).finally(() => setLoading(false));
  }, []);

  async function handleAdd() {
    const name = prompt('Agent name (e.g. "Home Desktop"):');
    if (!name) return;
    const { data } = await api.post('/agents', { name });
    setAgents(a => [...a, { id: data.id, name: data.name }]);
    setNewAgent({ name: data.name, token: data.token });
  }

  async function handleDelete(id) {
    if (!confirm('Revoke this agent?')) return;
    await api.delete(`/agents/${id}`);
    setAgents(a => a.filter(x => x.id !== id));
  }

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <div className="page-title">Agents</div>
          <div className="page-sub">
            {agents.filter(a => a.online).length} of {agents.length} online · helper daemons on managed machines
          </div>
        </div>
        <div style={{ flex: 1 }}></div>
        <button className="btn primary" onClick={handleAdd}>
          <Icon name="bolt" />Add agent
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dim)', padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : agents.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <div className="empty">
            <Icon name="agent" className="ico" style={{ width: 32, height: 32 }} />
            <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 12 }}>No agents registered</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Add one to enable local tunnel management</div>
            <button className="btn primary" style={{ marginTop: 20 }} onClick={handleAdd}>
              <Icon name="bolt" />Add agent
            </button>
          </div>
        </div>
      ) : (
        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {agents.map(a => (
            <AgentCard key={a.id} agent={a} onDelete={() => handleDelete(a.id)} />
          ))}
        </div>
      )}

      {newAgent && (
        <TokenModal
          open={true}
          onClose={() => setNewAgent(null)}
          token={newAgent.token}
          agentName={newAgent.name}
        />
      )}
    </div>
  );
}
