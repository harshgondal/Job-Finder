import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ProfileDropdown from './ProfileDropdown';

function Navbar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const isLanding = location.pathname === '/';
  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const handleScroll = (e: React.MouseEvent, targetId: string) => {
    e.preventDefault();
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="navbar-shell">
      <nav className="navbar">
        <div className="nav-brand" onClick={() => navigate('/')}>
          <div className="logo-dot" />
          <span>Job Application Finder</span>
        </div>
        <div className="nav-links">
          <a href="#features" onClick={(e) => handleScroll(e, 'features')}>Features</a>
          <a href="#how-it-works" onClick={(e) => handleScroll(e, 'how-it-works')}>How it works</a>
        </div>
        <div className="nav-actions">
          <button className="icon-button" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
          {user ? (
            <ProfileDropdown />
          ) : (
            <>
              <Link className="button ghost" to="/login">Login</Link>
              <Link className="button" to="/signup">{isLanding ? 'Get Started' : 'Sign Up'}</Link>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}

export default Navbar;


