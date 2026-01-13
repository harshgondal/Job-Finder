import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ResumeUpload from '../components/ResumeUpload';
import { useProfile } from '../context/ProfileContext';

function ProfilePage() {
  const {
    profile,
    interests,
    setInterests,
  } = useProfile();
  const navigate = useNavigate();

  const formatExperience = (years: number | undefined) => {
    if (years === undefined || years === null) return 'Not provided';
    if (Number.isNaN(years)) return 'Not provided';
    return `${years % 1 === 0 ? years : years.toFixed(1)} years`;
  };

  const renderChipList = (items: string[] | undefined, emptyMessage: string, limit?: number) => {
    if (!items || items.length === 0) {
      return <p className="muted-text small">{emptyMessage}</p>;
    }
    const data = typeof limit === 'number' ? items.slice(0, limit) : items;
    return (
      <div className="pill-list">
        {data.map((item) => (
          <span key={item} className="chip">
            {item}
          </span>
        ))}
      </div>
    );
  };

  useEffect(() => {
    if (profile?.interests && profile.interests.length > 0 && !interests) {
      setInterests(profile.interests.join(', '));
    }
  }, [profile, interests, setInterests]);

  return (
    <div className="page-container">
      <header className="page-intro" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
        <p className="eyebrow">Step 1</p>
        <h1 className="page-title" style={{ fontSize: '2.4rem' }}>Profile &amp; Resume</h1>
        <p className="page-subtitle" style={{ textAlign: 'left' }}>
          Upload your resume to generate a profile snapshot. You can still search without it.
        </p>
        <p className="muted-text" style={{ marginTop: 12 }}>
          Toggle daily job emails from the profile menu to instantly send the latest matches and schedule auto emails.
        </p>
      </header>

      <div className="section-grid">
        <ResumeUpload wrapperClassName="section-card" />

        <section className="section-card" style={{ minHeight: '100%' }}>
          <h2 className="section-title">Profile snapshot</h2>
          {!profile && (
            <p className="muted-text">
              Upload a resume to unlock personalized matches. Once parsed, your summary appears here.
            </p>
          )}

          {profile && (
            <div className="profile-snapshot">
              <div className="info-grid">
                <div className="info-card">
                  <p className="label">Name</p>
                  <p className="info-value">{profile.name || 'Not provided'}</p>
                </div>
                <div className="info-card">
                  <p className="label">Experience</p>
                  <p className="info-value">{formatExperience(profile.experience_years)}</p>
                </div>
                <div className="info-card">
                  <p className="label">Education</p>
                  <p className="info-value">{profile.education_level || 'Not captured yet'}</p>
                </div>
                <div className="info-card">
                  <p className="label">Preferred locations</p>
                  <p className="info-value">
                    {profile.preferred_locations.length > 0
                      ? profile.preferred_locations.join(', ')
                      : 'Not specified'}
                  </p>
                </div>
              </div>

              <div className="snapshot-section">
                <p className="label">Roles</p>
                {renderChipList(profile.roles, 'Roles not detected')}
              </div>

              <div className="snapshot-section">
                <p className="label">Skills</p>
                {renderChipList(profile.skills, 'Skills not detected', 40)}
              </div>

              <div className="snapshot-section">
                <p className="label">Domains</p>
                {renderChipList(profile.domains, 'Domains not detected')}
              </div>

              {profile.projects && profile.projects.length > 0 && (
                <div className="snapshot-section">
                  <p className="label">Projects</p>
                  <ul className="project-list">
                    {profile.projects.map((project) => (
                      <li key={project}>{project}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="button-row" style={{ justifyContent: 'flex-end' }}>
        <button className="button" onClick={() => navigate('/preferences')}>
          Next
        </button>
      </div>
    </div>
  );
}

export default ProfilePage;

