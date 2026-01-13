import Navbar from '../components/Navbar';

type Step = {
  id: number;
  title: string;
  desc: string;
  details: string[];
};

const steps: Step[] = [
  {
    id: 1,
    title: 'Find roles fast',
    desc: 'Aggregate jobs across boards with source-aware links and redirects to the original listing.',
    details: [
      'Pulls from LinkedIn, Naukri, Wellfound',
      'Shows exact source for every role',
      'Keeps redirects to the original listing'
    ],
  },
  {
    id: 2,
    title: 'Explain the match',
    desc: 'See why each job fits your resume, what skills are missing, and how to improve.',
    details: [
      'Match summary with missing skills',
      'Reasons tailored to your resume',
      'Suggestions to close gaps quickly'
    ],
  },
  {
    id: 3,
    title: 'Research effortlessly',
    desc: 'Launch company research, talking points, and flags directly from the results.',
    details: [
      'Company highlights and culture notes',
      'Talking points for outreach',
      'Green/red flags at a glance'
    ],
  },
  {
    id: 4,
    title: 'Stay in control',
    desc: 'Edit interests, re-upload resumes, and manage your profile from the dashboard.',
    details: [
      'Resume upload and profile editing',
      'Interests and preferences stay in sync',
      'Re-run searches with one click'
    ],
  },
];

function LandingPage() {
  return (
    <div className="landing-page">
      <Navbar />

      <header className="hero-block container">
        <div className="hero-center">
          <div className="badge">Find better-matched jobs faster</div>
          <h1>
          Find <span className="text-gradient">Suitable Openings</span>{' '} based on your<span className="text-gradient"> Profile and Preferences.</span>{' '}
            {/* in <span className="text-gradient">minutes.</span> */}
          </h1>
          <p className="subtitle">
            Upload your profile, set your preferences, and get curated roles with source links,
            match explanations, and company insights.
          </p>
        </div>
      </header>

      <section id="how-it-works" className="section container">
        <p className="eyebrow">How it works</p>
        <h2 className="section-title">Four steps to applications</h2>
        <div className="feature-grid interactive">
          {steps.map((step) => (
            <div
              key={step.id}
              className="feature-card interactive-card"
            >
              <span className="step-icon" aria-hidden="true">
                {step.id === 1 ? '🔍' : step.id === 2 ? '🧠' : step.id === 3 ? '🧭' : '🎛️'}
              </span>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="section container live-preview">
        <div className="features-wrap">
          <p className="eyebrow center">Features</p>
          <h2 className="section-title center">Smart Features for Better Job Matching</h2>
          <div className="feature-columns text-columns">
            <div className="feature-col">
              <div className="feature-label feature-label-left">Feature set · role discovery</div>
              <h3 className="feature-heading">Aggregate the right roles</h3>
              <p className="feature-text">
                Pull roles from multiple boards and keep the original source intact.
              </p>
              <div className="feature-point">AI surfaces relevant openings from LinkedIn, Naukri, and more.</div>
              <div className="feature-point">Source-tagged links so you always know where it came from.</div>
              <div className="feature-point">Location-aware suggestions for nearby cities and remote options.</div>
            </div>
            <div className="feature-col">
              <div className="feature-label feature-label-right">Feature set · profile matching</div>
              <h3 className="feature-heading">Match to your profile, prepare faster</h3>
              <p className="feature-text">
                Rank roles by fit and see what to improve before you apply.
              </p>
              <div className="feature-point">Profile-based fit with clear reasons and missing skills.</div>
              <div className="feature-point">Guidance on where to upskill before applying.</div>
              <div className="feature-point">Company insights, talking points, and flags in one place.</div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

export default LandingPage;


