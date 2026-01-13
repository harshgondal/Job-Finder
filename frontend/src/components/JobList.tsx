interface JobListProps {
  jobs: any[];
  onCompanyClick: (company: string) => void;
}

function JobList({ jobs, onCompanyClick }: JobListProps) {
  const getMatchClass = (score: number) => {
    if (score >= 80) return 'match-excellent';
    if (score >= 60) return 'match-good';
    if (score >= 40) return 'match-moderate';
    return 'match-low';
  };

  const getMatchLabel = (score: number) => {
    if (score >= 80) return 'Excellent Match';
    if (score >= 60) return 'Good Match';
    if (score >= 40) return 'Moderate Match';
    return 'Limited Match';
  };

  const buildExplanationBullets = (match: any, status: string): string[] => {
    const reasoning = Array.isArray(match?.reasoning)
      ? match.reasoning.map((item: string) => item?.trim()).filter(Boolean)
      : [];
    const summarySentences = typeof match?.summary === 'string'
      ? match.summary
          .split(/(?<=[.!?])\s+/)
          .map((sentence: string) => sentence.trim())
          .filter(Boolean)
      : [];
    const suggestions = Array.isArray(match?.suggestions)
      ? match.suggestions.map((item: string) => item?.trim()).filter(Boolean)
      : [];

    const combined = [...reasoning, ...summarySentences, ...suggestions];
    const unique: string[] = [];

    combined.forEach((item) => {
      if (unique.length >= 2) return;
      const lower = item.toLowerCase();
      if (!unique.some((existing) => existing.toLowerCase() === lower)) {
        unique.push(item);
      }
    });

    while (unique.length < 2) {
      unique.push(
        status === 'pending'
          ? 'Detailed insight will appear once the match analysis finishes.'
          : 'Additional insight will be added as more data is processed.'
      );
    }

    return unique.slice(0, 2);
  };

  const buildGapBullets = (match: any): { bullets: string[]; chips: string[] } => {
    const missingSkills = Array.isArray(match?.missing_skills)
      ? match.missing_skills.map((skill: string) => skill?.trim()).filter(Boolean)
      : [];
    const suggestions = Array.isArray(match?.suggestions)
      ? match.suggestions.map((item: string) => item?.trim()).filter(Boolean)
      : [];

    if (missingSkills.length === 0) {
      return {
        bullets: [
          'No significant skill gaps detected for this role.',
          suggestions[0] || 'Keep refining your strengths to stay interview-ready.',
        ],
        chips: [],
      };
    }

    const primary = missingSkills.slice(0, 3);
    const secondary = missingSkills.slice(3, 6);

    const bullets = [
      `Highest impact focus: ${primary.join(', ')}`,
      secondary.length > 0
        ? `Secondary areas to explore: ${secondary.join(', ')}`
        : suggestions[0] || 'Plan a mini-project or certification around the core gaps above.',
    ];

    return {
      bullets,
      chips: missingSkills.slice(0, 8),
    };
  };

  return (
    <div>
      <div className="card-header">
        <div>
          <p className="eyebrow">Matches</p>
      <h2>Job Matches ({jobs.length})</h2>
        </div>
        <span className="pill subtle">Source-aware links</span>
      </div>

      {jobs.map((job) => {
        const rawStatus = job.match?.status ?? 'ready';
        const normalizedStatus = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : 'ready';
        const hasMeaningfulMatchData = Boolean(job.match && (
          typeof job.match.score === 'number' ||
          (Array.isArray(job.match.reasoning) && job.match.reasoning.length > 0) ||
          (Array.isArray(job.match.suggestions) && job.match.suggestions.length > 0) ||
          (typeof job.match.summary === 'string' && job.match.summary.trim().length > 0)
        ));
        const isPending = normalizedStatus === 'pending' && !hasMeaningfulMatchData;
        const rawScore = typeof job.match?.score === 'number' ? job.match.score : 0;
        const safeScore = Math.max(0, Math.min(100, Math.round(rawScore)));
        const hasFinalMatch = Boolean(job.match) && !isPending;
        const explanationBullets = hasFinalMatch
          ? buildExplanationBullets(job.match, normalizedStatus)
          : [];
        const { bullets: gapBullets, chips: gapChips } = hasFinalMatch
          ? buildGapBullets(job.match)
          : { bullets: [], chips: [] };

        return (
          <div key={job.id} className="card">
          <div className="job-head">
            <div>
              <h3 className="job-title">{job.title}</h3>
              <p className="muted-text">
                <strong>{job.company}</strong> • {job.location || 'Location not listed'}
              </p>
              <div className="pill-row">
                <span className="pill subtle">{job.source ? `From ${job.source}` : 'Source unknown'}</span>
                {job.postedAt && <span className="pill subtle">Posted {job.postedAt}</span>}
              </div>
            </div>
            {job.match && (
              <div>
                <span className={`match-badge ${getMatchClass(safeScore)}`}>
                  {getMatchLabel(safeScore)} ({safeScore}%)
                </span>
              </div>
            )}
          </div>

          {job.match && (
            isPending ? (
              <div className="match-panel match-panel--pending" aria-live="polite">
                <div className="match-panel__loading">
                  <p className="match-panel__loading-title">Generating explanation</p>
                  <div className="loading-ellipsis" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <p className="match-panel__loading-copy">
                    We're comparing your profile with this role.
                  </p>
                </div>
              </div>
            ) : (
              <div className="match-panel">
                <div className="match-panel__header">
                  <div>
                    <p className="match-panel__eyebrow">Match Insights</p>
                    <p className="match-panel__summary">
                      {job.match.summary || 'No explanation available for this job yet.'}
                    </p>
                    <span className={`match-status match-status--${normalizedStatus}`}>
                      {normalizedStatus === 'ready' ? 'Ready' : normalizedStatus === 'pending' ? 'Pending' : 'Unavailable'}
                    </span>
                  </div>
                  <div className="match-donut">
                    <svg viewBox="0 0 42 42" className="match-donut__svg">
                      <circle className="match-donut__track" cx="21" cy="21" r="18" />
                      <circle
                        className="match-donut__indicator"
                        cx="21"
                        cy="21"
                        r="18"
                        strokeDasharray={`${safeScore} 100`}
                      />
                      <text x="21" y="22.5" textAnchor="middle" className="match-donut__label">
                        {safeScore}
                      </text>
                      <text x="21" y="30" textAnchor="middle" className="match-donut__label-sub">
                        /100
                      </text>
                    </svg>
                  </div>
                </div>

                <div className="match-panel__body">
                  <div className="match-panel__grid">
                    <section className="match-pane match-pane--positive">
                      <header className="match-pane__header">
                        <span className="match-pane__icon" aria-hidden="true">✓</span>
                        <span>Match explanation</span>
                      </header>
                      <ul className="match-pane__list">
                        {explanationBullets.map((item, idx) => (
                          <li key={idx}>
                            <span className="match-pane__bullet-icon" aria-hidden="true">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section className="match-pane match-pane--warning">
                      <header className="match-pane__header">
                        <span className="match-pane__icon" aria-hidden="true">!</span>
                        <span>Gaps to address</span>
                      </header>
                      <ul className="match-pane__list">
                        {gapBullets.map((item, idx) => (
                          <li key={idx}>
                            <span className="match-pane__bullet-icon" aria-hidden="true">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      {gapChips.length > 0 && (
                        <div className="match-pane__chips" role="list">
                          {gapChips.map((skill, idx) => (
                            <span key={idx} role="listitem" className="match-chip">
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              </div>
            )
          )}

          {job.normalized && (
            <div className="meta-grid">
              <div>
                <p className="label">Level</p>
                <p>{job.normalized.level || 'N/A'}</p>
              </div>
              <div>
                <p className="label">Work mode</p>
                <p>{job.normalized.work_mode || 'N/A'}</p>
              </div>
              {job.normalized.required_skills && job.normalized.required_skills.length > 0 && (
                <div>
                  <p className="label">Required skills</p>
                  <p>{job.normalized.required_skills.join(', ')}</p>
                </div>
              )}
            </div>
          )}

          <div className="actions">
            <a
              href={job.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button"
            >
              View on {job.source ? job.source.charAt(0).toUpperCase() + job.source.slice(1) : 'source'}
            </a>
            <button
              className="button secondary"
              onClick={() => onCompanyClick(job.company)}
            >
              Research company
            </button>
          </div>
          </div>
        );
      })}
    </div>
  );
}

export default JobList;


