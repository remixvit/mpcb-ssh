import { useEffect, useState } from 'react';
import api from '../api';
import Icon from '../components/Icon';

const TYPE_LABELS = { cpu: 'CPU', mem: 'RAM', disk: 'Disk', offline: 'Офлайн', online: 'Онлайн' };
const TYPE_ICONS  = { cpu: '🖥️', mem: '💾', disk: '💿', offline: '🔴', online: '🟢' };
const NEEDS_THRESHOLD = ['cpu', 'mem', 'disk'];

const EMPTY_RULE = { agent_id: '', type: 'cpu', threshold: 85, cooldown: 300 };

export default function Alerts() {
  const [rules,   setRules]   = useState([]);
  const [agents,  setAgents]  = useState([]);
  const [chatId,  setChatId]  = useState('');
  const [savedChatId, setSavedChatId] = useState(null);
  const [form,    setForm]    = useState(EMPTY_RULE);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  useEffect(() => {
    load();
    api.get('/agents').then(r => setAgents(r.data)).catch(() => {});
    api.get('/alerts/telegram').then(r => {
      setSavedChatId(r.data.chat_id);
      if (r.data.chat_id) setChatId(r.data.chat_id);
    }).catch(() => {});
  }, []);

  function load() {
    api.get('/alerts/rules').then(r => setRules(r.data)).catch(() => {});
  }

  async function addRule() {
    const payload = {
      agent_id:  form.agent_id ? parseInt(form.agent_id) : null,
      type:      form.type,
      threshold: NEEDS_THRESHOLD.includes(form.type) ? parseFloat(form.threshold) : null,
      cooldown:  parseInt(form.cooldown),
    };
    await api.post('/alerts/rules', payload);
    setForm(EMPTY_RULE);
    load();
  }

  async function toggleRule(id, enabled) {
    await api.patch(`/alerts/rules/${id}`, { enabled: !enabled });
    load();
  }

  async function deleteRule(id) {
    await api.delete(`/alerts/rules/${id}`);
    load();
  }

  async function testTelegram() {
    if (!chatId) return;
    setTesting(true);
    setTestMsg('');
    try {
      await api.post('/alerts/telegram/test', { chat_id: chatId });
      setSavedChatId(chatId);
      setTestMsg('✅ Сообщение отправлено! Chat ID сохранён.');
    } catch (e) {
      setTestMsg('❌ ' + (e.response?.data?.error || 'Ошибка'));
    } finally { setTesting(false); }
  }

  async function disconnectTelegram() {
    await api.delete('/alerts/telegram');
    setSavedChatId(null);
    setChatId('');
    setTestMsg('');
  }

  function set(f, v) { setForm(p => ({ ...p, [f]: v })); }

  const agentName = id => agents.find(a => String(a.id) === String(id))?.name || 'Все агенты';

  return (
    <div className="page-enter" style={{ maxWidth: 700 }}>
      <div className="page-head">
        <div>
          <div className="page-title">Alerts</div>
          <div className="page-sub">Уведомления по CPU, RAM, диску и статусу агентов</div>
        </div>
      </div>

      {/* ── Telegram ── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>
          Telegram
        </div>

        {savedChatId ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#c3e88d', fontSize: 13 }}>✅ Подключён (chat_id: {savedChatId})</span>
            <button className="btn ghost sm" onClick={disconnectTelegram} style={{ color: 'var(--danger)' }}>
              Отключить
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>
              Узнать chat_id: напиши боту <code>/start</code>, потом открой
              <code style={{ marginLeft: 4 }}>
                https://api.telegram.org/botТОКЕН/getUpdates
              </code>
              → найди <code>"chat":{'{'}id: XXXXX{'}'}</code>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="input mono" style={{ flex: 1 }} value={chatId}
                onChange={e => setChatId(e.target.value)} placeholder="123456789" />
              <button className="btn primary" onClick={testTelegram} disabled={testing || !chatId}>
                {testing ? 'Отправка…' : 'Проверить и сохранить'}
              </button>
            </div>
          </>
        )}
        {testMsg && (
          <div style={{ marginTop: 10, fontSize: 12,
            color: testMsg.startsWith('✅') ? '#c3e88d' : 'var(--danger)' }}>
            {testMsg}
          </div>
        )}
      </div>

      {/* ── Add rule ── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>
          Добавить правило
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Агент</label>
            <select className="select" value={form.agent_id} onChange={e => set('agent_id', e.target.value)}>
              <option value="">— Все агенты —</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Тип</label>
            <select className="select" value={form.type} onChange={e => set('type', e.target.value)}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{TYPE_ICONS[v]} {l}</option>
              ))}
            </select>
          </div>
          {NEEDS_THRESHOLD.includes(form.type) && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Порог (%)</label>
              <input className="input mono" type="number" min={1} max={100}
                value={form.threshold} onChange={e => set('threshold', e.target.value)} />
            </div>
          )}
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Cooldown (сек)</label>
            <input className="input mono" type="number" min={60}
              value={form.cooldown} onChange={e => set('cooldown', e.target.value)} />
          </div>
        </div>
        <button className="btn primary" onClick={addRule}>
          <Icon name="plus" /> Добавить
        </button>
      </div>

      {/* ── Rules list ── */}
      {rules.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)' }}>
          Правил нет — добавьте выше
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map(r => (
            <div key={r.id} className="card" style={{
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
              opacity: r.enabled ? 1 : 0.5,
            }}>
              <span style={{ fontSize: 16 }}>{TYPE_ICONS[r.type]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>
                  {TYPE_LABELS[r.type]}
                  {r.threshold != null && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>&gt; {r.threshold}%</span>}
                  <span style={{ color: 'var(--text-faint)', marginLeft: 8, fontSize: 11 }}>
                    {r.agent_id ? r.agent_name : 'все агенты'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                  cooldown: {r.cooldown}с
                  {r.last_fired > 0 && (
                    <span style={{ marginLeft: 8 }}>
                      последний: {new Date(r.last_fired * 1000).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <button className="btn ghost sm" onClick={() => toggleRule(r.id, r.enabled)}
                style={{ fontSize: 11 }}>
                {r.enabled ? 'Выкл' : 'Вкл'}
              </button>
              <button className="btn ghost sm" onClick={() => deleteRule(r.id)}
                style={{ color: 'var(--danger)' }}>
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
