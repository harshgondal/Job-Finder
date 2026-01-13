interface LandingProps {
  onContinue: (method: string) => void;
}

function Landing({ onContinue }: LandingProps) {
  return (
    <div className="landing">
      <div className="hero">
        <p className="eyebrow">Job Application Finder</p>
        <h1>Cut the noise. Keep the jobs that fit you.</h1>
        <p className="subtitle">
          Curated jobs from LinkedIn, Naukri, and more with source links, match explanations,
          and company research — all in one place.
        </p>
        <div className="cta-row">
          <button className="button" onClick={() => onContinue('Google OAuth (UI only)')}>
            Continue with Google
          </button>
          <button className="button ghost" onClick={() => onContinue('Email (UI only)')}>
            Sign up / Log in
          </button>
        </div>
        <p className="muted-text small">
          Authentication UI is ready; wire it to your provider when available.
        </p>
      </div>

      <div className="feature-grid">
        <div className="card">
          <h3 className="card-title">Smart sourcing</h3>
          <p className="muted-text">Aggregates from multiple boards and keeps source links intact.</p>
        </div>
        <div className="card">
          <h3 className="card-title">Match clarity</h3>
          <p className="muted-text">Explains why roles fit your resume and flags gaps.</p>
        </div>
        <div className="card">
          <h3 className="card-title">Location-aware</h3>
          <p className="muted-text">Suggests nearby cities and related titles when results are sparse.</p>
        </div>
      </div>
    </div>
  );
}

export default Landing;




