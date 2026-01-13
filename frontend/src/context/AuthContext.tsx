import { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

// Send cookies with all requests
axios.defaults.withCredentials = true;

type User = {
  id: string;
  name: string;
  email: string;
  provider?: string;
  picture?: string;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  signup: (payload: { name: string; email: string; password: string }) => Promise<boolean>;
  login: (payload: { email: string; password: string }) => Promise<boolean>;
  googleLogin: (idToken: string) => Promise<boolean>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Check authentication status on mount (cookie is sent automatically)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await axios.get('/api/auth/me');
        if (data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (_) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const signup = async (payload: { name: string; email: string; password: string }) => {
    try {
      const { data } = await axios.post('/api/auth/signup', payload);
      setUser(data.user);
      setToken(data.token); // optional, kept for backward compatibility
      return true;
    } catch (error: any) {
      alert(error.response?.data?.error || 'Signup failed');
      return false;
    }
  };

  const login = async (payload: { email: string; password: string }) => {
    try {
      const { data } = await axios.post('/api/auth/login', payload);
      setUser(data.user);
      setToken(data.token);
      return true;
    } catch (error: any) {
      alert(error.response?.data?.error || 'Login failed');
      return false;
    }
  };

  const googleLogin = async (idToken: string) => {
    try {
      const { data } = await axios.post('/api/auth/google', { idToken });
      setUser(data.user);
      setToken(data.token);
      return true;
    } catch (error: any) {
      alert(error.response?.data?.error || 'Google login failed');
      return false;
    }
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setToken(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signup, login, googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

