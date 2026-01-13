import { useState, useEffect } from 'react';
import axios from 'axios';

interface CompanyResearchProps {
  company: string;
  profileId: string;
  onClose: () => void;
}

interface GlassdoorReview {
  title: string;
  sentiment: string;
  snippet: string;
  author: string;
  link: string | null;
  publishedAt: string;
  rating: number | null;
  jobTitle: string | null;
  pros: string | null;
  cons: string | null;
  summary: string | null;
}

interface GlassdoorPayload {
  score: number | null;
  totalReviews: number;
  reviews: GlassdoorReview[];
  source: string;
}

interface CompanyResearchResponse {
  company_name: string;
  summary: string;
  tech_stack: string[];
  company_type: string;
  culture_highlights: string[];
  talking_points: string[];
  red_flags: string[];
  green_flags: string[];
  glassdoor: GlassdoorPayload | null;
}

const formatDate = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

function CompanyResearch({ company, profileId, onClose }: CompanyResearchProps) {
  const [research, setResearch] = useState<CompanyResearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResearch = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axios.get<CompanyResearchResponse>('/api/jobs/research', {
          params: { company, profile_id: profileId },
        });
        setResearch(data);
      } catch (err: any) {
        console.error('Failed to fetch company research:', err);
        setError(err.response?.data?.error || 'Unable to load company insights right now.');
      } finally {
        setLoading(false);
      }
    };

    fetchResearch();
  }, [company, profileId]);

  const renderPillGroup = (label: string, items: string[], accentClass: string) => {
    if (!items || items.length === 0) return null;
    return (
      <section className="company-research__section">
        <header className="company-research__section-header">
          <span className={`company-research__flag ${accentClass}`} aria-hidden="true" />
          <span>{label}</span>
        </header>
        <ul className="company-research__list company-research__list--bullets">
          {items.slice(0, 4).map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </section>
    );
  };

  if (loading) {
    return (
      <div className="company-research company-research--loading">
        <div className="company-research__loader" aria-hidden="true" />
        <p>Gathering insights about <strong>{company}</strong>…</p>
      </div>
    );
  }

  if (error || !research) {
    return (
      <div className="company-research company-research--error">
        <p>{error || 'Failed to load company research.'}</p>
        <button className="button" onClick={onClose}>Close</button>
      </div>
    );
  }

  const glassdoor = research.glassdoor;

  return (
    <div className="company-research" role="dialog" aria-labelledby="company-research-title">
      <button className="company-research__close" onClick={onClose} aria-label="Close company research">
        ×
      </button>

      <header className="company-research__header">
        <div>
          <p className="company-research__eyebrow">Company insights</p>
          <h2 id="company-research-title">{research.company_name}</h2>
          <p className="company-research__summary">{research.summary}</p>
        </div>
        {glassdoor && (
          <aside className="company-research__rating">
            <span className="company-research__rating-score">{glassdoor.score ? glassdoor.score.toFixed(1) : '—'}</span>
            <span className="company-research__rating-label">Glassdoor score</span>
            <span className="company-research__rating-meta">{glassdoor.totalReviews} reviews</span>
          </aside>
        )}
      </header>

      {research.tech_stack.length > 0 && (
        <section className="company-research__section">
          <header className="company-research__section-header">
            <span className="company-research__flag" aria-hidden="true" />
            <span>Key technologies</span>
          </header>
          <div className="company-research__chips">
            {research.tech_stack.slice(0, 10).map((tech, idx) => (
              <span key={idx} className="company-research__chip">{tech}</span>
            ))}
          </div>
        </section>
      )}

      <div className="company-research__grid">
        <section className="company-research__section">
          <header className="company-research__section-header">
            <span className="company-research__flag" aria-hidden="true" />
            <span>Talking points</span>
          </header>
          <ul className="company-research__list company-research__list--numbered">
            {research.talking_points.slice(0, 4).map((point, idx) => (
              <li key={idx}>{point}</li>
            ))}
          </ul>
        </section>

        {renderPillGroup('Culture highlights', research.culture_highlights, 'is-highlight')}
      </div>

      <div className="company-research__grid">
        {renderPillGroup('Green flags', research.green_flags, 'is-positive')}
        {renderPillGroup('Red flags', research.red_flags, 'is-warning')}
      </div>

      {glassdoor && glassdoor.reviews.length > 0 && (
        <section className="company-research__section">
          <header className="company-research__section-header">
            <span className="company-research__flag" aria-hidden="true" />
            <span>Recent interview reviews</span>
          </header>
          <div className="company-research__reviews">
            {glassdoor.reviews.map((review, idx) => (
              <article key={idx} className={`company-review company-review--${review.sentiment}`}>
                <header className="company-review__header">
                  <div>
                    <h3>{review.title}</h3>
                    <p className="company-review__meta">
                      {[review.jobTitle, review.author].filter(Boolean).join(' • ') || review.author}
                      {' • '}
                      {formatDate(review.publishedAt)}
                    </p>
                  </div>
                  {typeof review.rating === 'number' && (
                    <span className="company-review__rating">{review.rating.toFixed(1)}</span>
                  )}
                </header>
                {review.summary && <p className="company-review__summary">{review.summary}</p>}
                <p className="company-review__snippet">{review.snippet}</p>
                {(review.pros || review.cons) && (
                  <div className="company-review__insights">
                    {review.pros && (
                      <div className="company-review__insight">
                        <span className="company-review__insight-label is-pro">Pros</span>
                        <p>{review.pros}</p>
                      </div>
                    )}
                    {review.cons && (
                      <div className="company-review__insight">
                        <span className="company-review__insight-label is-con">Cons</span>
                        <p>{review.cons}</p>
                      </div>
                    )}
                  </div>
                )}
                {review.link && (
                  <a
                    href={review.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="company-review__link"
                  >
                    Read full review →
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default CompanyResearch;






