import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default AuthGuard;




