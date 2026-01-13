import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ProfileDropdown from './ProfileDropdown';

function Layout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const navItems = useMemo(
    () => [
      { to: '/', label: 'Home' },
      { to: '/profile', label: 'Profile' },
      { to: '/preferences', label: 'Preferences' },
      { to: '/search', label: 'Search' },
    ],
    []
  );

  return (
    <div className="app-shell">
      <header className="app-navbar">
        <div className="app-navbar__inner">
          <button className="brand" onClick={() => navigate('/') }>
            <span className="brand__mark" />
            <span className="brand__title">Job Application Finder</span>
          </button>

          <nav className="app-nav" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="app-navbar__actions">
            <button
              className="icon-button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
            {user && <ProfileDropdown showIdentity />}
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
