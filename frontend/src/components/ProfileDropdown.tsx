import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

type ProfileDropdownProps = {
  showIdentity?: boolean;
};

function ProfileDropdown({ showIdentity = false }: ProfileDropdownProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.name || 'User';
  const avatarLetter = user?.name?.[0]?.toUpperCase() || 'U';
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleUpdating, setScheduleUpdating] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [cronExpression, setCronExpression] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let ignore = false;

    async function fetchSchedule() {
      if (!user) {
        setScheduleEnabled(false);
        setScheduleError(null);
        setLastRunAt(null);
        setLastError(null);
        setCronExpression(null);
        return;
      }

      setScheduleLoading(true);
      try {
        const { data } = await axios.get('/api/profile/job-email/schedule');
        if (ignore) return;
        setScheduleEnabled(Boolean(data?.enabled));
        setLastRunAt(data?.lastRunAt ?? null);
        setLastError(data?.lastError ?? null);
        setCronExpression(data?.cronExpression ?? null);
        setScheduleError(null);
      } catch (error: any) {
        if (ignore) return;
        const message = error?.response?.data?.error || error?.message || 'Failed to load job email schedule.';
        setScheduleError(message);
      } finally {
        if (!ignore) {
          setScheduleLoading(false);
        }
      }
    }

    fetchSchedule();

    return () => {
      ignore = true;
    };
  }, [user]);

  const triggerImmediateSend = useCallback(
    async (notify = true) => {
      if (!user) return false;
      setSendingEmail(true);
      try {
        const { data } = await axios.post('/api/profile/send-jobs-email');
        const sentCount = data?.jobsSent ?? 0;
        if (notify) {
          alert(sentCount > 0 ? `Email sent with ${sentCount === 1 ? '' : 's'}.` : 'Email triggered successfully.');
        }
        const nowIso = new Date().toISOString();
        setLastRunAt(nowIso);
        setLastError(null);
        return true;
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to trigger email.';
        setLastError(message);
        if (notify) {
          alert(message);
        }
        return false;
      } finally {
        setSendingEmail(false);
      }
    },
    [user]
  );

  const handleScheduleToggle = useCallback(async () => {
    if (!user || scheduleLoading || scheduleUpdating || sendingEmail) {
      return;
    }

    const nextEnabled = !scheduleEnabled;
    setScheduleUpdating(true);
    try {
      const { data } = await axios.put('/api/profile/job-email/schedule', { enabled: nextEnabled });
      const enabledValue = Boolean(data?.enabled);
      setScheduleEnabled(enabledValue);
      setLastRunAt(data?.lastRunAt ?? null);
      setLastError(data?.lastError ?? null);
      setCronExpression(data?.cronExpression ?? null);
      setScheduleError(null);

      if (nextEnabled && enabledValue) {
        const sentSuccessfully = await triggerImmediateSend(true);
        if (!sentSuccessfully) {
          try {
            await axios.put('/api/profile/job-email/schedule', { enabled: false });
          } catch (secondaryError) {
            console.error('[ProfileDropdown] Failed to revert schedule after email failure:', secondaryError);
          }
          setScheduleEnabled(false);
        }
      }
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to update schedule.';
      setScheduleError(message);
      alert(message);
    } finally {
      setScheduleUpdating(false);
    }
  }, [
    user,
    scheduleEnabled,
    scheduleLoading,
    scheduleUpdating,
    sendingEmail,
    triggerImmediateSend,
  ]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current) return;
      if (event.target instanceof Node && rootRef.current.contains(event.target)) {
        return;
      }
      setIsMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  if (!user) {
    return null;
  }

  const handleMouseLeave = (event: ReactMouseEvent<HTMLDivElement>) => {
    const nextElement = event.relatedTarget as Node | null;
    if (nextElement && rootRef.current?.contains(nextElement)) {
      return;
    }
    setIsMenuOpen(false);
  };

  const renderScheduleStatus = () => {
    if (scheduleLoading) {
      return <p className="profile-menu__status">Loading schedule…</p>;
    }

    if (scheduleUpdating) {
      return <p className="profile-menu__status">Updating schedule…</p>;
    }

    const rows: JSX.Element[] = [];

    if (lastRunAt) {
      const formatted = new Date(lastRunAt).toLocaleString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
      });
      rows.push(
        <p className="profile-menu__status" key="schedule-last-run">
          Last sent {formatted}
        </p>
      );
    }

    if (lastError) {
      rows.push(
        <p className="profile-menu__status profile-menu__status--error" key="schedule-error">
          {lastError}
        </p>
      );
    }

    if (!rows.length && cronExpression) {
      rows.push(
        <p className="profile-menu__status" key="schedule-cron">
          Sends daily (cron {cronExpression})
        </p>
      );
    }

    if (scheduleError) {
      rows.push(
        <p className="profile-menu__status profile-menu__status--error" key="schedule-fetch-error">
          {scheduleError}
        </p>
      );
    }

    return rows;
  };

  return (
    <div
      ref={rootRef}
      className={`profile-chip${showIdentity ? ' profile-chip--with-meta' : ''}${isMenuOpen ? ' is-open' : ''}`}
      onMouseEnter={() => setIsMenuOpen(true)}
      onMouseLeave={handleMouseLeave}
      onFocus={() => setIsMenuOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsMenuOpen(false);
        }
      }}
      tabIndex={0}
    >
      <span className="avatar">{avatarLetter}</span>
      {showIdentity && (
        <div className="profile-chip__identity">
          <span className="profile-chip__name">{displayName}</span>
        </div>
      )}
      <span
        className="profile-chip__caret"
        role="button"
        tabIndex={0}
        aria-label={isMenuOpen ? 'Collapse profile menu' : 'Expand profile menu'}
        aria-haspopup="true"
        aria-expanded={isMenuOpen}
        onClick={(event) => {
          event.stopPropagation();
          setIsMenuOpen((prev) => !prev);
        }}
        onKeyDown={(event: ReactKeyboardEvent<HTMLSpanElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsMenuOpen((prev) => !prev);
          }
        }}
      >
        ▾
      </span>
      <div className="profile-menu">
        <div className="profile-menu__section">
          <div className="profile-menu__row">
            <div className="profile-menu__copy">
              <span className="profile-menu__label">Daily job emails</span>
              <span className="profile-menu__hint">Send top matches every 24 hours</span>
            </div>
            <button
              type="button"
              className={`menu-toggle ${scheduleEnabled ? 'is-active' : ''}`}
              aria-pressed={scheduleEnabled}
              aria-label="Toggle daily job emails"
              onClick={handleScheduleToggle}
              disabled={scheduleLoading || scheduleUpdating || sendingEmail}
            >
              <span className="menu-toggle__track" />
              <span className="menu-toggle__thumb" />
            </button>
          </div>
          {renderScheduleStatus()}
        </div>
        <div className="profile-menu__actions">
          <button className="button ghost" onClick={() => navigate('/dashboard')}>
            Dashboard
          </button>
          <button className="button ghost" onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProfileDropdown;
