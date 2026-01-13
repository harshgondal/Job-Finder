import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="page-container">
      <section className="page-intro">
        <p className="eyebrow">Dashboard</p>
        <h1 className="page-title">Welcome{user?.name ? `, ${user.name}` : ''}</h1>
        <p className="page-subtitle">
          Upload your resume, fine-tune preferences, and uncover curated roles with instant match explanations.
        </p>
        <div className="button-row">
          <button className="button" onClick={() => navigate('/profile')}>
            Set up profile
          </button>
          <button className="button ghost" onClick={() => navigate('/search')}>
            Search jobs
          </button>
        </div>
      </section>

      <section className="cta-grid">
        <article className="cta-card" role="button" onClick={() => navigate('/profile')}>
          <span style={{ fontSize: '2.25rem' }}>📄</span>
          <h2 className="section-title" style={{ marginBottom: 4 }}>
            Upload & parse resume
          </h2>
          <p className="muted-text">
            Build your snapshot in seconds and unlock tailored recommendations.
          </p>
        </article>

        <article className="cta-card" role="button" onClick={() => navigate('/preferences')}>
          <span style={{ fontSize: '2.25rem' }}>🎯</span>
          <h2 className="section-title" style={{ marginBottom: 4 }}>
            Refine preferences
          </h2>
          <p className="muted-text">
            Set your target roles, locations, and interests for sharper matches.
          </p>
        </article>

        <article className="cta-card" role="button" onClick={() => navigate('/search')}>
          <span style={{ fontSize: '2.25rem' }}>🔍</span>
          <h2 className="section-title" style={{ marginBottom: 4 }}>
            Explore roles
          </h2>
          <p className="muted-text">
            Browse curated jobs with match scores and instant source links.
          </p>
        </article>
      </section>

      <section className="section-card">
        <h2 className="section-title">Quick start</h2>
        <p className="section-subtitle">
          Jump into the flow that matters most right now. Your progress stays in sync across steps.
        </p>
        <div className="button-row" style={{ justifyContent: 'flex-start' }}>
          <button className="button ghost" onClick={() => navigate('/profile')}>
            Upload resume
          </button>
          <button className="button ghost" onClick={() => navigate('/preferences')}>
            Set preferences
          </button>
          <button className="button ghost" onClick={() => navigate('/search')}>
            Start searching
          </button>
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;



