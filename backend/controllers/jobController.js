const { z } = require('zod');
const { aggregateJobs } = require('../services/jobAggregator');
const { JobNormalizationAgent } = require('../agents/jobNormalizationAgent');
const { MatchExplanationAgent } = require('../agents/matchExplanationAgent');
const { CompanyResearchAgent } = require('../agents/companyResearchAgent');
const { loadProfileById, updateProfileRecentJobs } = require('./profileController');
const { config } = require('../config/env');
const { getJson, setJson } = require('../config/redis');
const { buildPreferenceSignals, normalizeStringArray } = require('../utils/preferences');

const PAGE_SIZE = 5;
const DEFAULT_MAX_RESULTS = 50;
const MAX_JOBS_TO_SCORE = 60;
const MATCH_AGENT_POOL_SIZE = PAGE_SIZE;
const AGGREGATE_CACHE_TTL_SECONDS = 5 * 60;
const CACHE_TTL_SECONDS = Math.max(60, Math.floor((config.CACHE_TTL_MINUTES || 15) * 60));
const NORMALIZATION_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS;
const MATCH_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS;
const COMPANY_RESEARCH_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS;

const pendingMatchComputations = new Set();

const normalizationAgent = new JobNormalizationAgent();
const matchAgents = Array.from({ length: MATCH_AGENT_POOL_SIZE }, () => new MatchExplanationAgent());
const companyAgent = new CompanyResearchAgent();

const EMPLOYMENT_TYPE_MAP = {
  'full-time': 'FULLTIME',
  fulltime: 'FULLTIME',
  'part-time': 'PARTTIME',
  parttime: 'PARTTIME',
  contract: 'CONTRACT',
  contractor: 'CONTRACT',
  internship: 'INTERNSHIP',
  intern: 'INTERNSHIP',
  temporary: 'TEMPORARY',
  temp: 'TEMPORARY',
};

const JOB_REQUIREMENT_MAP = {
  'no_degree': 'no_degree',
  'no experience': 'no_experience',
  'no_experience': 'no_experience',
  'no degree': 'no_degree',
};

function mapEmploymentTypes(preferenceTypes) {
  if (!Array.isArray(preferenceTypes)) return [];
  return preferenceTypes
    .map((type) => {
      if (typeof type !== 'string') return null;
      const normalized = type.toLowerCase();
      return EMPLOYMENT_TYPE_MAP[normalized] || null;
    })
    .filter(Boolean);
}

function mapJobRequirements(preferenceRequirements) {
  if (!Array.isArray(preferenceRequirements)) return [];
  return preferenceRequirements
    .map((item) => {
      if (typeof item !== 'string') return null;
      const normalized = item.toLowerCase();
      return JOB_REQUIREMENT_MAP[normalized] || null;
    })
    .filter(Boolean);
}

function deriveAggregatorCriteria(profile) {
  const filters = {
    workModes: [],
    remoteOnly: false,
    employmentTypes: [],
    jobRequirements: [],
  };

  if (!profile || typeof profile !== 'object') {
    return filters;
  }

  if (Array.isArray(profile.preference_work_modes)) {
    const normalizedModes = profile.preference_work_modes
      .map((mode) => (typeof mode === 'string' ? mode.toLowerCase() : ''))
      .filter(Boolean);
    filters.workModes = Array.from(new Set(normalizedModes));
    if (filters.workModes.length === 1 && filters.workModes[0] === 'remote') {
      filters.remoteOnly = true;
    }
    filters.allowRemote = filters.workModes.includes('remote');
  }

  filters.employmentTypes = mapEmploymentTypes(profile.preference_employment_types);
  filters.jobRequirements = mapJobRequirements(profile.preference_job_requirements);

  const locationCandidates = normalizeStringArray(
    profile.preference_locations ||
      profile.preferred_locations ||
      profile.locations ||
      profile.location_preferences ||
      (profile.inferred_preferences && profile.inferred_preferences.preferred_locations)
  );

  if (locationCandidates.length > 0) {
    filters.preferredLocations = locationCandidates;
    filters.primaryLocation = locationCandidates[0];
  }

  return filters;
}

function parsePreferenceNotes(notes) {
  if (!notes || typeof notes !== 'string') {
    return { topLimit: null, raw: notes || null };
  }

  const lower = notes.toLowerCase();
  const topMatch = lower.match(/top\s*(\d+)/);
  const topLimit = topMatch ? Math.max(1, Number.parseInt(topMatch[1], 10) || 0) : null;

  return {
    topLimit,
    raw: notes,
  };
}

// Creates a stable identifier for a job so normalization and match results reuse the same cache entry.
function getJobCacheKey(job) {
  if (!job || typeof job !== 'object') return null;
  return (
    job.id ||
    job.job_id ||
    job.externalId ||
    job.url ||
    job.apply_link ||
    `${job.title || 'unknown'}|${job.company || 'unknown'}|${job.location || 'unknown'}|${job.postedAt || ''}`
  );
}

// Produces a cache key for a profile, falling back to serialized attributes when no explicit ID exists.
function getProfileCacheKey(profile, fallbackId) {
  if (!profile) return 'anonymous';
  return (
    (profile._id && profile._id.toString()) ||
    profile.id ||
    fallbackId ||
    profile.profile_id ||
    (profile.email ? `email:${profile.email}` : null) ||
    JSON.stringify({
      skills: profile.skills || [],
      experience_years: profile.experience_years || 0,
    })
  );
}

// Namespaces normalized job documents inside Redis.
function getNormalizedJobRedisKey(cacheKey) {
  return `job:normalized:${cacheKey}`;
}

// Namespaces aggregated job result sets inside Redis.
function getAggregateRedisKey(cacheKey) {
  return `jobs:aggregate:${cacheKey}`;
}

// Namespaces match explanations by profile and job to avoid collisions.
function getMatchRedisKey(profileKey, jobKey) {
  return `match:${profileKey}:${jobKey}`;
}

// Namespaces company research responses by company and profile.
function getCompanyResearchRedisKey(companyName, profileKey) {
  const normalizedCompany = (companyName || '').trim().toLowerCase() || 'unknown';
  const normalizedProfile = (profileKey || 'anonymous').toString().toLowerCase();
  return `company:research:${normalizedCompany}:${normalizedProfile}`;
}

// Generates a unique key for a job search request to share cached aggregator responses.
function getAggregateCacheKey(criteria) {
  const normalizedRole = (criteria.query || '').trim().toLowerCase();
  const normalizedLocation = (criteria.location || '').trim().toLowerCase();
  const limit = criteria.limit || 0;
  const remote = criteria.remoteOnly ? 'remote' : 'any';
  const workModesKey = Array.isArray(criteria.workModes) && criteria.workModes.length > 0
    ? criteria.workModes.slice().sort().join(',')
    : 'any';
  const employmentKey = Array.isArray(criteria.employmentTypes) && criteria.employmentTypes.length > 0
    ? criteria.employmentTypes.slice().sort().join(',')
    : 'any';
  const requirementKey = Array.isArray(criteria.jobRequirements) && criteria.jobRequirements.length > 0
    ? criteria.jobRequirements.slice().sort().join(',')
    : 'any';
  return `${normalizedRole}::${normalizedLocation}::${limit}::${remote}::${workModesKey}::${employmentKey}::${requirementKey}`;
}

// Reads pre-fetched job aggregations from Redis.
async function getAggregateFromCache(key) {
  if (!key) return null;
  const redisKey = getAggregateRedisKey(key);
  const cached = await getJson(redisKey);
  if (cached) {
    console.log('[JobController][Cache Hit] Aggregate results', { redisKey });
  }
  return cached;
}

// Persists aggregated job lists in Redis with a TTL.
async function setAggregateCache(key, value) {
  if (!key) return;
  const redisKey = getAggregateRedisKey(key);
  await setJson(redisKey, value, AGGREGATE_CACHE_TTL_SECONDS);
  console.log('[JobController][Cache Write] Aggregate results stored', {
    redisKey,
    count: Array.isArray(value?.results) ? value.results.length : undefined,
  });
}

// Returns a normalized job from cache when available, otherwise normalizes and caches the result.
async function normalizeJobWithCache(job) {
  if (!job) return job;
  const cacheKey = getJobCacheKey(job);
  const redisKey = cacheKey ? getNormalizedJobRedisKey(cacheKey) : null;

  if (redisKey) {
    const cached = await getJson(redisKey);
    if (cached) {
      console.log('[JobController][Cache Hit] Normalized job', { redisKey });
      return cached;
    }
  }

  let normalizedJob = job;
  try {
    console.log('JobNormalizationAgent invoked');
    normalizedJob = await normalizationAgent.normalizeJob(job);
    console.log('JobNormalizationAgent completed');
  } catch (error) {
    console.error('[JobController] Failed to normalize job:', error.message);
    normalizedJob = job;
  }

  if (redisKey) {
    await setJson(redisKey, normalizedJob, NORMALIZATION_CACHE_TTL_SECONDS);
    console.log('[JobController][Cache Write] Normalized job stored', { redisKey });
  }

  return normalizedJob;
}

function buildPendingMatch(profile, job, baseScore) {
  return {
    status: 'pending',
    score: baseScore,
    summary: 'Generating match explanation…',
    missing_skills: matchAgents[0].getMissingSkills(profile, job),
    reasoning: matchAgents[0].generateBasicReasoning(profile, job),
    suggestions: [],
  };
}

// Schedules a background match explanation, updating Redis once the async work completes.
function scheduleMatchExplanation(profile, profileKey, rawJob, normalizedJob, agentIndex, cacheKey) {
  setImmediate(async () => {
    try {
      const agent = matchAgents[Math.abs(agentIndex) % matchAgents.length] || matchAgents[0];
      console.log('MatchExplanationAgent invoked');
      const detailed = await agent.explainMatch(profile, normalizedJob);
      const finalMatch = { ...detailed, status: 'ready' };
      await setJson(cacheKey, finalMatch, MATCH_CACHE_TTL_SECONDS);
      console.log('MatchExplanationAgent completed');
    } catch (error) {
      console.error('[JobController] Async match explanation failed:', error.message);
    } finally {
      if (cacheKey) {
        pendingMatchComputations.delete(cacheKey);
      }
    }
  });
}

// Retrieves a cached match when ready or seeds Redis with a placeholder while queuing async generation.
async function getMatchOrSchedule(profile, profileKey, rawJob, normalizedJob, agentIndex, baseScore) {
  if (!profile) {
    return { match: null, status: 'unavailable' };
  }

  const jobKey = getJobCacheKey(rawJob);
  const cacheKey = jobKey ? getMatchRedisKey(profileKey, jobKey) : null;

  if (cacheKey) {
    const cached = await getJson(cacheKey);
    if (cached) {
      const status = cached.status || 'ready';
      console.log('[JobController][Cache Hit] Match explanation', {
        cacheKey,
        status,
      });
      if (status === 'pending' && !pendingMatchComputations.has(cacheKey)) {
        pendingMatchComputations.add(cacheKey);
        scheduleMatchExplanation(profile, profileKey, rawJob, normalizedJob, agentIndex, cacheKey);
      }
      return { match: { ...cached, status }, status };
    }
  }

  const placeholder = buildPendingMatch(profile, normalizedJob, baseScore);

  if (cacheKey) {
    await setJson(cacheKey, placeholder, MATCH_CACHE_TTL_SECONDS);
    console.log('[JobController][Cache Write] Match placeholder stored', {
      cacheKey,
      score: placeholder.score,
      jobTitle: rawJob?.title,
    });

    if (!pendingMatchComputations.has(cacheKey)) {
      pendingMatchComputations.add(cacheKey);
      console.log('[JobController] Scheduling async match explanation', {
        cacheKey,
        jobTitle: rawJob?.title,
      });
      scheduleMatchExplanation(profile, profileKey, rawJob, normalizedJob, agentIndex, cacheKey);
    }
  }

  return { match: placeholder, status: 'pending' };
}

// Accept role, optional location, page (1-based) and optional profile_id
const bodySchema = z.object({
  role: z.string().min(2, 'Role must be at least 2 characters'),
  location: z.string().optional(),
  page: z
    .preprocess(v => (v === undefined ? 1 : Number(v)), z.number().int().min(1))
    .optional(),
  preference_notes: z.string().optional(),
  profile_id: z.string().optional(),
});

async function searchJobs(req, res) {
  try {
    const parsed = bodySchema.parse(req.body);
    const preference = parsePreferenceNotes(parsed.preference_notes);
    const maxResults = Math.min(
      MAX_JOBS_TO_SCORE,
      preference.topLimit || DEFAULT_MAX_RESULTS
    );

    let loadedProfile = null;
    if (parsed.profile_id) {
      try {
        loadedProfile = await loadProfileById(parsed.profile_id);
      } catch (e) {
        console.warn('[JobController] Failed to load profile', e.message);
      }
    }

    const aggregatorFilters = deriveAggregatorCriteria(loadedProfile);

    let derivedLocation = parsed.location || aggregatorFilters?.primaryLocation || null;
    if (!derivedLocation && aggregatorFilters?.remoteOnly) {
      derivedLocation = 'Remote';
    }

    const criteria = {
      query: parsed.role,
      ...(derivedLocation ? { location: derivedLocation } : {}),
      limit: maxResults,
      ...(aggregatorFilters.remoteOnly ? { remoteOnly: true } : {}),
      ...(aggregatorFilters.allowRemote ? { allowRemote: true } : {}),
      ...(Array.isArray(aggregatorFilters.workModes) && aggregatorFilters.workModes.length > 0
        ? { workModes: aggregatorFilters.workModes }
        : {}),
      ...(Array.isArray(aggregatorFilters.employmentTypes) && aggregatorFilters.employmentTypes.length > 0
        ? { employmentTypes: aggregatorFilters.employmentTypes }
        : {}),
      ...(Array.isArray(aggregatorFilters.jobRequirements) && aggregatorFilters.jobRequirements.length > 0
        ? { jobRequirements: aggregatorFilters.jobRequirements }
        : {}),
      ...(Array.isArray(aggregatorFilters.preferredLocations) && aggregatorFilters.preferredLocations.length > 0
        ? { preferredLocations: aggregatorFilters.preferredLocations }
        : {}),
      ...(parsed.location ? { locationProvided: true } : { locationProvided: false }),
    };
    const aggregateKey = getAggregateCacheKey(criteria);

    let result = await getAggregateFromCache(aggregateKey);
    if (!result) {
      result = await aggregateJobs(criteria);
      const resultCount = Array.isArray(result?.results) ? result.results.length : 0;
      if (resultCount > 0) {
        await setAggregateCache(aggregateKey, result);
      }
    }

    const safeResults = Array.isArray(result?.results) ? result.results : [];

    if (parsed.profile_id && safeResults.length > 0) {
      const seenJobs = new Set();
      const recentJobs = [];

      for (const job of safeResults) {
        if (!job || recentJobs.length >= 5) break;
        const company = typeof job.company === 'string' ? job.company.trim() : '';
        const title = typeof job.title === 'string' ? job.title.trim() : '';
        if (!company || !title) continue;

        const keyParts = [job.id, title, company, job.location || ''];
        const key = keyParts.filter(Boolean).join('|').toLowerCase();
        if (seenJobs.has(key)) continue;
        seenJobs.add(key);

        recentJobs.push({
          id: job.id || null,
          title,
          company,
          location: typeof job.location === 'string' ? job.location : null,
          externalUrl: typeof job.externalUrl === 'string' ? job.externalUrl : null,
          postedAt: typeof job.postedAt === 'string' ? job.postedAt : null,
          source: typeof job.source === 'string' ? job.source : null,
        });
      }

      if (recentJobs.length > 0) {
        try {
          await updateProfileRecentJobs(parsed.profile_id, recentJobs);
        } catch (err) {
          console.warn('[JobController] Failed to update recent jobs', err.message);
        }
      }
    }

    const totalAvailable = result?.meta?.total ?? safeResults.length;
    const returned = result?.meta?.returned ?? safeResults.length;
    const scoringLimit = Math.min(MAX_JOBS_TO_SCORE, totalAvailable, maxResults);
    const totalPages = Math.max(1, Math.ceil(scoringLimit / PAGE_SIZE));
    const requestedPage = parsed.page || 1;
    const page = Math.min(requestedPage, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, scoringLimit);

    const baseMeta = {
      ...result.meta,
      total: scoringLimit,
      availableTotal: totalAvailable,
      page,
      pageSize: PAGE_SIZE,
      totalPages,
      preference: preference.raw || null,
      returned,
    };

    if (loadedProfile) {
      const profileKey = getProfileCacheKey(loadedProfile, parsed.profile_id);

      try {
        const preferenceSignals = buildPreferenceSignals(loadedProfile);
        const jobsWithScores = await Promise.all(
          result.results
            .slice(0, scoringLimit)
            .map(async (job, index) => {
              const normalizedJob = await normalizeJobWithCache(job);
              const baseScorePayload = matchAgents[0].computeBaseScore(loadedProfile, normalizedJob, {
                rawJob: job,
                includeDetails: true,
                preferenceSignals,
              });

              const excluded = typeof baseScorePayload === 'object' && baseScorePayload?.excluded;
              if (excluded) {
                console.log('[JobController] Skipping job after preference exclusion', {
                  title: job.title,
                  company: job.company,
                  preferenceAdjustment: baseScorePayload?.details?.preferenceAdjustment,
                  workMode: baseScorePayload?.details?.workMode,
                  preferenceSignals: baseScorePayload?.preferenceSignals,
                });
                return null;
              }

              const baseScore =
                typeof baseScorePayload === 'number'
                  ? baseScorePayload
                  : baseScorePayload?.score ?? 0;
              const baseScoreDetails =
                typeof baseScorePayload === 'object' ? baseScorePayload?.details || null : null;

              return {
                raw: job,
                normalized: normalizedJob,
                baseScore,
                baseScoreDetails,
                index,
              };
            })
        );

        const jobsToScore = jobsWithScores.filter(Boolean);

        jobsToScore.sort((a, b) => (b.baseScore || 0) - (a.baseScore || 0));
        const pageMatches = jobsToScore.slice(start, end);

        const jobsWithMatches = await Promise.all(
          pageMatches.map(async (entry) => {
            const { match } = await getMatchOrSchedule(
              loadedProfile,
              profileKey,
              entry.raw,
              entry.normalized,
              entry.index,
              entry.baseScore
            );

            const jobKey = getJobCacheKey(entry.raw);
            const matchCacheKey = jobKey ? getMatchRedisKey(profileKey, jobKey) : null;

            return {
              ...entry.normalized,
              match,
              baseScore: entry.baseScore,
              baseScoreDetails: entry.baseScoreDetails,
              matchCacheKey,
            };
          })
        );

        return res.json({
          data: jobsWithMatches,
          meta: {
            ...baseMeta,
            matched: true,
            asyncMatchExplanations: true,
            returned: jobsWithMatches.length,
          },
        });
      } catch (error) {
        console.error('[JobController] Error in normalization/matching:', error);
        return res.json({
          data: safeResults.slice(start, end),
          meta: {
            ...baseMeta,
            matched: false,
            returned: end - start,
            error: error.message,
          },
        });
      }
    }

    return res.json({
      data: safeResults.slice(start, end),
      meta: {
        ...baseMeta,
        matched: false,
        returned: end - start,
        filters: aggregatorFilters,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('[JobController] Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function getCompanyResearch(req, res) {
  try {
    const { company } = req.query;
    const { profile_id } = req.query;

    if (!company) {
      return res.status(400).json({ error: 'Company name required' });
    }

    let profile = null;
    if (profile_id) {
      try {
        profile = await loadProfileById(profile_id);
      } catch (error) {
        console.warn('[JobController] Failed to load profile for company research', {
          profile_id,
          error: error.message,
        });
      }
    }

    const profileKey = getProfileCacheKey(profile, profile_id);
    const researchKey = getCompanyResearchRedisKey(company, profileKey);

    const cached = await getJson(researchKey);
    if (cached) {
      console.log('[JobController][Cache Hit] Company research', { company, profileKey });
      return res.json(cached);
    }

    try {
      console.log('CompanyResearchAgent invoked');
      const research = await companyAgent.generateResearch(company, profile);
      console.log('CompanyResearchAgent completed');

      if (research) {
        await setJson(researchKey, research, COMPANY_RESEARCH_CACHE_TTL_SECONDS);
        console.log('[JobController][Cache Write] Company research stored', {
          researchKey,
          company,
        });
      }

      res.json(research);
    } catch (error) {
      console.error('[JobController] Company research error:', error);
      res.status(500).json({ error: error.message || 'Failed to research company' });
    }
  } catch (error) {
    console.error('[JobController] Company research handler error:', error);
    res.status(500).json({ error: error.message || 'Failed to process company research request' });
  }
}
async function getMatchStatus(req, res) {
  try {
    const queryKeys = req.query.keys || req.query.key || req.query.match_key;

    if (!queryKeys) {
      return res.status(400).json({ error: 'keys query parameter required' });
    }

    const keys = Array.isArray(queryKeys)
      ? queryKeys.flatMap((value) =>
          typeof value === 'string'
            ? value.split(',').map((piece) => piece.trim()).filter(Boolean)
            : []
        )
      : String(queryKeys)
          .split(',')
          .map((piece) => piece.trim())
          .filter(Boolean);

    const uniqueKeys = Array.from(new Set(keys.filter((key) => key.startsWith('match:')))).slice(0, 25);

    if (uniqueKeys.length === 0) {
      return res.status(400).json({ error: 'No valid match keys provided' });
    }

    const results = {};
    await Promise.all(
      uniqueKeys.map(async (key) => {
        try {
          const stored = await getJson(key);
          results[key] = stored || null;
        } catch (err) {
          console.warn('[JobController] Failed to read match key', key, err.message);
          results[key] = null;
        }
      })
    );

    res.json({ results });
  } catch (error) {
    console.error('[JobController] Match status error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch match status' });
  }
}

module.exports = {
  searchJobs,
  getCompanyResearch,
  getMatchStatus,
};
