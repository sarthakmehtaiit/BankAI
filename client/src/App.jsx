import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { FullPageLoader } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Kyc from './pages/Kyc.jsx';
import SendMoney from './pages/SendMoney.jsx';
import Transactions from './pages/Transactions.jsx';
import Assistant from './pages/Assistant.jsx';
import Insights from './pages/Insights.jsx';
import Admin from './pages/Admin.jsx';

function Protected({ children, adminOnly = false }) {
  const { user } = useAuth();
  if (user === undefined) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="kyc" element={<Kyc />} />
            <Route path="send" element={<SendMoney />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="assistant" element={<Assistant />} />
            <Route path="insights" element={<Insights />} />
            <Route
              path="admin"
              element={
                <Protected adminOnly>
                  <Admin />
                </Protected>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
