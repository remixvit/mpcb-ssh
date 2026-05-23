export default function StatusBadge({ status }) {
  const map = {
    running:  { cls: 'running', label: 'Running',  dotCls: 'pulse' },
    stopped:  { cls: 'stopped', label: 'Stopped',  dotCls: 'offline' },
    error:    { cls: 'error',   label: 'Error',    dotCls: 'danger pulse' },
    online:   { cls: 'online',  label: 'Online',   dotCls: 'pulse' },
    offline:  { cls: 'offline', label: 'Offline',  dotCls: 'offline' },
  };
  const m = map[status] || map.stopped;
  return (
    <span className={`badge ${m.cls}`}>
      <span className={`dot ${m.dotCls}`}></span>{m.label}
    </span>
  );
}
