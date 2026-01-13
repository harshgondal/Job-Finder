import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';

function SignupPage() {
  const { signup, googleLogin } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
  }, [email, password, name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await signup({ name, email, password });
    if (ok) navigate('/dashboard');
  };

  const handleGoogleSuccess = async (credential?: string) => {
    if (!credential) {
      setError('Google sign-in failed.');
      return;
    }
    const ok = await googleLogin(credential);
    if (ok) navigate('/dashboard');
  };

  return (
    <div className="auth-shell">
      <div className="auth-side-illustration" aria-hidden="true" />
      <div className="auth-shell__card" role="dialog" aria-labelledby="signup-heading">
        <div className="auth-shell__title">
          <h1 id="signup-heading">Create Account</h1>
          <p>Join the portal to shortlist roles faster.</p>
        </div>

        {error && (
          <div style={{ color: '#dc2626', fontSize: 14, background: 'rgba(252, 165, 165, 0.18)', padding: '10px 14px', borderRadius: 12 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form-grid">
          <div className="auth-field">
            <label className="auth-field__label" htmlFor="signup-name">Full Name</label>
            <div className="auth-field__input" data-field="name">
              <span className="auth-field__icon" aria-hidden="true">👤</span>
              <input
                id="signup-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-field__label" htmlFor="signup-email">Email Address</label>
            <div className="auth-field__input" data-field="email">
              <span className="auth-field__icon" aria-hidden="true">✉️</span>
              <input
                id="signup-email"
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
            <label className="auth-field__label" htmlFor="signup-password">Password</label>
            <div className="auth-field__input" data-field="password">
              <span className="auth-field__icon" aria-hidden="true">🔒</span>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Create a password"
                autoComplete="new-password"
              />
            </div>
          </div>

          <button className="auth-primary-button" type="submit">
            Sign Up
          </button>
        </form>

        <div className="auth-divider">or</div>

        <div className="auth-google">
          <GoogleLogin
            onSuccess={(cred) => handleGoogleSuccess(cred.credential)}
            onError={() => setError('Google sign-in failed.')}
            useOneTap={false}
            theme="outline"
            size="large"
            shape="rectangular"
            logo_alignment="left"
            text="continue_with"
          />
        </div>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

export default SignupPage;



