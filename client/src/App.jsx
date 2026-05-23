import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import ServerForm from './pages/ServerForm';
import Terminal from './pages/Terminal';
import Keys from './pages/Keys';
import KeyUpload from './pages/KeyUpload';
import Tunnels from './pages/Tunnels';
import Agents from './pages/Agents';

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <PrivateRoute>
          <Layout>
            <Routes>
              <Route path="/"            element={<Dashboard />} />
              <Route path="/servers"       element={<Servers />} />
              <Route path="/servers/new"   element={<ServerForm />} />
              <Route path="/servers/:id"   element={<ServerForm />} />
              <Route path="/terminal/:id"  element={<Terminal />} />
              <Route path="/keys"          element={<Keys />} />
              <Route path="/keys/upload"   element={<KeyUpload />} />
              <Route path="/tunnels"     element={<Tunnels />} />
              <Route path="/agents"      element={<Agents />} />
            </Routes>
          </Layout>
        </PrivateRoute>
      } />
    </Routes>
  );
}
