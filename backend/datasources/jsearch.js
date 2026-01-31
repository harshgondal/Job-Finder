const axios = require('axios');
const { Country } = require('country-state-city');
const { config } = require('../config/env');

const RAPID_API_HOST = 'jsearch.p.rapidapi.com';
const BASE_URL = config.JSEARCH_API_HOST_URL || `https://${RAPID_API_HOST}`;
const RATE_LIMIT_COOLDOWN_MS = 60_000; // avoid hammering API after rate limit responses

let lastRateLimitHit = 0;

function normalizeUserLocation(input) {
  if (!input) return '';
  const trimmed = input.trim();
  const normalized = trimmed.toLowerCase().replace(/\./g, '');

  if (['us', 'usa', 'united states', 'united states of america', 'america'].includes(normalized)) {
    return 'United States';
  }
  if (['uk', 'gb', 'great britain', 'england', 'united kingdom'].includes(normalized)) {
    return 'United Kingdom';
  }

  return trimmed;
}

function isCoolingDown() {
  return Date.now() - lastRateLimitHit < RATE_LIMIT_COOLDOWN_MS;
}

function toCountryCode(location) {
  const normalized = normalizeUserLocation(location);
  if (!normalized) return null;

  const normalizedLower = normalized.toLowerCase();
  const countries = Country.getAllCountries();

  const exactByName = countries.find(c => c.name.toLowerCase() === normalizedLower);
  if (exactByName) {
    return exactByName.isoCode.toLowerCase();
  }

  const exactByIso = countries.find(c => c.isoCode.toLowerCase() === normalizedLower);
  if (exactByIso) {
    return exactByIso.isoCode.toLowerCase();
  }

  const looseMatch = countries.find(
    c => normalizedLower.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(normalizedLower),
  );
  if (looseMatch) {
    return looseMatch.isoCode.toLowerCase();
  }

  return null;
}

function buildQuery(criteria) {
  const query = (criteria.query || '').trim();
  const normalizedLocation = normalizeUserLocation(criteria.location);
  const location = normalizedLocation.trim();

  if (!query && !location) {
    return 'jobs';
  }
  if (!location) {
    return query;
  }
  if (!query) {
    return `jobs in ${location}`;
  }
  return `${query} in ${location}`;
}

function normalizeLocation(job) {
  const parts = [job.job_city, job.job_state, job.job_country].filter(Boolean);
  if (parts.length === 0) {
    return job.job_is_remote ? 'Remote' : job.job_country || 'Unknown';
  }
  return parts.join(', ');
}

function normalizeDate(job) {
  if (job.job_posted_at_datetime_utc) {
    return job.job_posted_at_datetime_utc;
  }
  if (job.job_posted_at_timestamp) {
    return new Date(job.job_posted_at_timestamp * 1000).toISOString();
  }
  return new Date().toISOString();
}

async function searchJSearch(criteria) {
  if (!config.JSEARCH_API_KEY) {
    return [];
  }

  const now = Date.now();
  if (now - lastRateLimitHit < RATE_LIMIT_COOLDOWN_MS) {
    console.warn('[JSearch] Skipping request due to recent rate limit. Cooling down.');
    return [];
  }

  const query = buildQuery(criteria);
  console.log('[JSearch] Query:', query);
  const countryCode = toCountryCode(criteria.location);
  const limit = Math.min(Math.max(criteria.limit || 20, 10), 60);
  const page = Math.max(criteria.page || 1, 1);
  const numPages = Math.min(Math.ceil(limit / 20), 3);
  const datePosted = criteria.datePosted || null;
  const sortBy = criteria.sortBy || 'date_posted';
  const order = criteria.order || 'desc';

  try {
    const { data } = await axios.get(`${BASE_URL}/search`, {
      params: {
        query,
        page,
        num_pages: numPages,
        ...(countryCode ? { country: countryCode } : {}),
        ...(criteria.experienceLevel ? { experience_level: criteria.experienceLevel } : {}),
        ...(datePosted ? { date_posted: datePosted } : {}),
        ...(sortBy ? { sort_by: sortBy } : {}),
        ...(order ? { order } : {}),
      },
      headers: {
        'x-rapidapi-key': config.JSEARCH_API_KEY,
        'x-rapidapi-host': RAPID_API_HOST,
      },
    });

    const jobs = (data?.data || []).map((job, idx) => {
      const salaryRange = job.job_salary_currency && job.job_min_salary && job.job_max_salary
        ? `${job.job_salary_currency} ${job.job_min_salary} - ${job.job_max_salary}`
        : undefined;

      const externalUrl = [
        job.job_apply_link,
        ...(Array.isArray(job.job_apply_options) ? job.job_apply_options : []),
        job.job_google_link,
        job.job_link,
      ].find((value) => typeof value === 'string' && value.length > 0) || '';

      return {
        id: job.job_id || `jsearch-${idx}`,
        title: job.job_title,
        company: job.employer_name,
        location: normalizeLocation(job),
        remote: Boolean(job.job_is_remote),
        country: job.job_country || '',
        countryCode: (job.job_country_iso2 || job.job_country_iso || '').toLowerCase(),
        description: job.job_description || '',
        source: (job.job_publisher || 'jsearch').toLowerCase(),
        externalUrl,
        postedAt: normalizeDate(job),
        employmentType: job.job_employment_type,
        salary: salaryRange,
      };
    });

    return jobs.slice(0, limit);
  } catch (error) {
    const { status, data } = error.response || {};
    if (status === 429 || status === 403) {
      lastRateLimitHit = Date.now();
    }
    if (data) {
      console.warn('[JSearch] Error response body:', JSON.stringify(data));
    }
    console.warn('[JSearch] Request failed:', status, error.message);
    return [];
  }
}

module.exports = { searchJSearch, isCoolingDown, normalizeUserLocation, toCountryCode };
