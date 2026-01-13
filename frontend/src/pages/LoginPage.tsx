import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';

function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, login, googleLogin } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      const returnUrl = searchParams.get('returnUrl');
      navigate(returnUrl || '/dashboard');
    }
  }, [user, navigate, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password });
      const returnUrl = searchParams.get('returnUrl');
      navigate(returnUrl || '/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credential?: string) => {
    if (!credential) {
      setError('Google login failed: no credential');
      return;
    }
    try {
      await googleLogin(credential);
      const returnUrl = searchParams.get('returnUrl');
      navigate(returnUrl || '/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to login with Google');
    }
  };
  return (
    <div className="auth-shell">
      <div className="auth-side-illustration" aria-hidden="true" />
      <div className="auth-shell__card" role="dialog" aria-labelledby="login-heading">
        <div className="auth-shell__title">
          <h1 id="login-heading">Welcome Back</h1>
          <p>Sign in to keep your job search in motion.</p>
        </div>

        {error && (
          <div style={{ color: '#dc2626', fontSize: 14, background: 'rgba(252, 165, 165, 0.18)', padding: '10px 14px', borderRadius: 12 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form-grid">
          <div className="auth-field">
            <label className="auth-field__label" htmlFor="login-email">Email Address</label>
            <div className="auth-field__input" data-field="email">
              <span className="auth-field__icon" aria-hidden="true">✉️</span>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-field__label" htmlFor="login-password">Password</label>
            <div className="auth-field__input" data-field="password">
              <span className="auth-field__icon" aria-hidden="true">🔒</span>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="auth-actions">
            <label className="auth-remember">
              <input type="checkbox" />
              <span>Remember me</span>
            </label>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>

          <button className="auth-primary-button" type="submit" disabled={loading}>
            {loading ? 'Signing you in…' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">or</div>

        <div className="auth-google">
          <GoogleLogin
            onSuccess={(cred) => handleGoogleSuccess(cred.credential)}
            onError={() => setError('Google login failed')}
            useOneTap={false}
            theme="outline"
            size="large"
            shape="rectangular"
            logo_alignment="left"
            text="continue_with"
          />
        </div>

        <div className="auth-footer">
          Don&apos;t have an account? <Link to="/signup">Sign up</Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
