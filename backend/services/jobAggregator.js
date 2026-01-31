const axios = require('axios');
const { GlassdoorService } = require('./glassdoorService');
const { searchJSearch, isCoolingDown, normalizeUserLocation, toCountryCode } = require('../datasources/jsearch');
const { config } = require('../config/env');
const { Country, State, City } = require('country-state-city');

const glassdoorService = new GlassdoorService();

const DEFAULT_RESULT_LIMIT = 50;
const MAX_RESULT_LIMIT = 60;

function uniqueById(jobs) {
  const seen = new Set();
  const result = [];

  for (const job of jobs) {
    if (!job) continue;
    const key = job.id || `${job.title || 'unknown'}-${job.company || 'unknown'}-${job.location || 'na'}-${result.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(job);
  }

  return result;
}

function expandLocationPatterns(query) {
  const q = (query || '').trim();
  if (!q) return [];
  let qLower = q.toLowerCase();
  // Normalize common aliases so we can match the Country list properly
  // const normalizedNoDots = qLower.replace(/\./g, '');
  // if (
  //   normalizedNoDots === 'usa' ||
  //   normalizedNoDots === 'us' ||
  //   normalizedNoDots === 'america' ||
  //   normalizedNoDots === 'united states of america' ||
  //   normalizedNoDots === 'united states'
  // ) {
  //   qLower = 'united states';
  // }
  // if (normalizedNoDots === 'uk') {
  //   qLower = 'united kingdom';
  // }

  const countries = Country.getAllCountries();
  // Try exact match by name or ISO
  let foundCountry = countries.find(
    c => c.name.toLowerCase() === qLower || c.isoCode.toLowerCase() === qLower
  );
  // Try substring contains (e.g., "united states" in "united states of america")
  if (!foundCountry) {
    foundCountry = countries.find(c => c.name.toLowerCase().includes(qLower) || qLower.includes(c.name.toLowerCase()));
  }
  // Try ISO code contains (short inputs like "us", "uae")
  if (!foundCountry) {
    const qUpper = qLower.toUpperCase();
    foundCountry = countries.find(c => c.isoCode === qUpper);
  }
  const results = new Set();
  if (foundCountry) {
    const states = State.getStatesOfCountry(foundCountry.isoCode) || [];
    states.forEach(s => results.add(s.name));
  } else {
    outer: for (const c of countries) {
      const states = State.getStatesOfCountry(c.isoCode) || [];
      const foundState = states.find(
        s => s.name.toLowerCase() === qLower || s.isoCode?.toLowerCase() === qLower
      );
      if (foundState) {
        const cities = City.getCitiesOfState(foundState.countryCode, foundState.isoCode) || [];
        cities.slice(0, 20).forEach(city => results.add(city.name));
        break outer;
      }
    }
  }
  // Always add Remote as a permissive alternative
  results.add('Remote');
  return Array.from(results).filter(Boolean);
}

function matchesLocation(job, options) {
  const { normalizedLower, originalLower, countryCode } = options;
  const jobLoc = (job.location || '').toLowerCase();

  if (!originalLower && !normalizedLower) {
    return true;
  }

  if (jobLoc.includes('remote')) {
    return true;
  }

  if (originalLower && jobLoc.includes(originalLower)) {
    return true;
  }

  if (normalizedLower && jobLoc.includes(normalizedLower)) {
    return true;
  }

  const jobParts = jobLoc.split(',').map(part => part.trim()).filter(Boolean);
  if (jobParts.some(part => originalLower && originalLower.includes(part))) {
    return true;
  }
  if (jobParts.some(part => normalizedLower && normalizedLower.includes(part))) {
    return true;
  }

  const jobCountry = (job.country || '').toLowerCase();
  const jobCountryCode = job.countryCode ? job.countryCode.toLowerCase() : null;

  if (jobCountry && originalLower && (jobCountry.includes(originalLower) || originalLower.includes(jobCountry))) {
    return true;
  }
  if (jobCountry && normalizedLower && (jobCountry.includes(normalizedLower) || normalizedLower.includes(jobCountry))) {
    return true;
  }

  if (countryCode && jobCountryCode && jobCountryCode === countryCode) {
    return true;
  }

  return false;
}

function isRemoteJob(job) {
  const jobLoc = (job.location || '').toLowerCase();
  return job.remote === true || jobLoc.includes('remote') || jobLoc.includes('anywhere');
}

function jobMatchesAnyLocation(job, locations = []) {
  for (const location of locations) {
    if (!location || typeof location !== 'string') continue;
    const originalLower = location.toLowerCase();
    const normalizedLower = normalizeUserLocation(location).toLowerCase();
    const countryCode = toCountryCode(location);
    if (matchesLocation(job, { normalizedLower, originalLower, countryCode })) {
      return true;
    }
  }
  return false;
}

async function aggregateJobs(rawCriteria) {
  const appliedLimit = Math.max(
    1,
    Math.min(rawCriteria.limit || DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT)
  );

  const requestedWindow = rawCriteria.datePosted;
  const baseDateWindow = requestedWindow || 'week';
  const criteria = {
    ...rawCriteria,
    limit: appliedLimit,
    datePosted: baseDateWindow,
    sortBy: rawCriteria.sortBy || 'date_posted',
    order: rawCriteria.order || 'desc',
  };

  console.log('[JobAggregator] Raw criteria:', rawCriteria);
  console.log('[JobAggregator] Final criteria:', criteria);
  
  const baseResults = await searchJSearch(criteria);
  let combined = [...baseResults];

  if (combined.length < Math.min(criteria.limit, 10) && baseDateWindow !== 'month') {
    try {
      const relaxedWindow = 'month';
      const relaxedResults = await searchJSearch({
        ...criteria,
        datePosted: relaxedWindow,
      });
      combined = uniqueById([...combined, ...relaxedResults]);
      console.log('[JobAggregator] Relaxed date window to', relaxedWindow, '->', relaxedResults.length, 'additional jobs');
    } catch (err) {
      console.warn('[JobAggregator] Relaxed date window fetch failed:', err.message);
    }
  }

  if (combined.length < Math.min(criteria.limit, 20) && !isCoolingDown()) {
    const nextPageCriteria = { ...criteria, page: 2 };
    try {
      const page2 = await searchJSearch(nextPageCriteria);
      combined = uniqueById([...combined, ...page2]);
      if (combined.length < Math.min(criteria.limit, 30)) {
        const page3 = await searchJSearch({ ...criteria, page: 3 });
        combined = uniqueById([...combined, ...page3]);
      }
    } catch (err) {
      console.warn('[JobAggregator] Additional page fetch failed:', err.message);
    }
  }
  combined = uniqueById(combined);
  const jsearchAvailable = baseResults.length > 0;

  console.log('[JobAggregator] Results from JSearch (combined):', combined.length);
  let suggestions = [];

  const wantsRemoteOnly = Boolean(criteria.remoteOnly);
  console.log('[JobAggregator] wantsRemoteOnly?', wantsRemoteOnly, 'allowRemote?', criteria.allowRemote);
  const allowRemote = Boolean(criteria.allowRemote);
  const preferredLocations = Array.isArray(criteria.preferredLocations)
    ? criteria.preferredLocations.filter((loc) => typeof loc === 'string' && loc.trim()).map((loc) => loc.trim())
    : [];

  // Simple location filter: allow Remote jobs or jobs matching requested/preferred locations
  let filtered = combined;
  const locationCandidates = [];
  if (rawCriteria.location) {
    locationCandidates.push(rawCriteria.location);
  }
  for (const loc of preferredLocations) {
    if (!loc) continue;
    if (!locationCandidates.some((existing) => existing.toLowerCase() === loc.toLowerCase())) {
      locationCandidates.push(loc);
    }
  }

  if (locationCandidates.length > 0 || wantsRemoteOnly) {
    filtered = combined.filter((job) => {
      const isRemote = isRemoteJob(job);

      if (wantsRemoteOnly && !isRemote) {
        return false;
      }

      if (locationCandidates.length === 0) {
        return wantsRemoteOnly ? isRemote : true;
      }

      if (jobMatchesAnyLocation(job, locationCandidates)) {
        return true;
      }

      if (allowRemote && isRemote) {
        return true;
      }

      return false;
    });
    console.log('[JobAggregator] After location/preference filter:', filtered.length, 'jobs');
    // If no jobs match, generate location suggestions from all results
    if (filtered.length === 0 && jsearchAvailable) {
      // Expand location generically (country -> states, state -> cities) and retry
      const primaryLocation = locationCandidates[0];
      const expanded = primaryLocation ? expandLocationPatterns(primaryLocation) : [];
      suggestions = expanded.slice(0, 5);
      console.log('[JobAggregator] Expanded locations to try:', expanded);

      if (isCoolingDown()) {
        console.warn('[JobAggregator] Skipping alternate location retries due to JSearch cooldown.');
      } else {
        for (const altLoc of expanded.slice(0, 3)) {
          if (filtered.length >= criteria.limit) break;
          const altCriteria = {
            ...criteria,
            location: altLoc,
            limit: Math.min(5, criteria.limit - filtered.length),
          };
          try {
            const altJSearch = await searchJSearch(altCriteria);
            const existingIds = new Set(filtered.map(j => j.id));
            const newJobs = (altJSearch || []).filter(j => !existingIds.has(j.id));
            filtered = [...filtered, ...newJobs];
            console.log('[JobAggregator] Alt location', altLoc, 'added', newJobs.length, 'jobs');
          } catch (e) {
            console.warn('[JobAggregator] Alt location search failed for', altLoc, e.message);
          }
        }
      }
    }
  }

  // If we have very few results, try a broader search with similar terms
  if (filtered.length <2 && rawCriteria.query) {
    if (!jsearchAvailable) {
      console.warn('[JobAggregator] Skipping similar role fallbacks because JSearch returned no results and may be unavailable.');
    } else {
      console.log('[JobAggregator] Few results found (' + filtered.length + '), trying broader search with similar roles...');

      if (isCoolingDown()) {
        console.warn('[JobAggregator] Skipping similar role fallbacks due to JSearch cooldown.');
      } else {
      try {
        // Ask Gemini for similar role suggestions
        let similarRoles = [];
        if (config.GEMINI_API_KEY) {
          try {
            const similarPrompt = `Given the job role "${rawCriteria.query}", suggest 3-5 similar or related job titles that someone searching for this role might also be interested in. Return ONLY a JSON array of strings, no explanation. Example: ["Backend Developer", "Full Stack Engineer", "Software Developer"]`;
            
            const agentEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
            const { data } = await axios.post(
              `${agentEndpoint}?key=${config.GEMINI_API_KEY}`,
              {
                contents: [{ parts: [{ text: similarPrompt }] }],
                generationConfig: { temperature: 0.3 },
              },
              { headers: { 'Content-Type': 'application/json' } }
            );
            
            const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            const jsonMatch = responseText.match(/\[.*\]/);
            if (jsonMatch) {
              similarRoles = JSON.parse(jsonMatch[0]);
              console.log('[JobAggregator] Gemini suggested similar roles:', similarRoles);
            }
          } catch (err) {
            console.warn('[JobAggregator] Failed to get similar roles from Gemini:', err.message);
          }
        }
        
        // Fallback to simple term variations if Gemini fails
        if (similarRoles.length === 0) {
          const broaderTerms = rawCriteria.query
            .toLowerCase()
            .replace(/\b(senior|junior|lead|principal|staff)\b/gi, '')
            .trim();
          
          similarRoles = [
            broaderTerms,
            broaderTerms.replace(/\bengineer\b/gi, 'developer'),
            broaderTerms.replace(/\bdeveloper\b/gi, 'engineer'),
            broaderTerms.replace(/\bsoftware\b/gi, ''),
          ].filter(q => q && q.length > 2);
        }
        
        // Try each similar query
        for (const similarQuery of similarRoles.slice(0, 2)) {
          if (filtered.length >= criteria.limit) break;

          const fallbackCriteria = {
            ...criteria,
            query: similarQuery,
            limit: Math.min(5, criteria.limit - filtered.length),
          };

          const fallbackJSearch = await searchJSearch(fallbackCriteria);

          // Add fallback results that match location
          const fallbackFiltered = fallbackJSearch.filter((job) => {
            const isRemote = isRemoteJob(job);

            if (wantsRemoteOnly && !isRemote) {
              return false;
            }

            if (locationCandidates.length === 0) {
              return wantsRemoteOnly ? isRemote : true;
            }

            if (jobMatchesAnyLocation(job, locationCandidates)) {
              return true;
            }

            if (allowRemote && isRemote) {
              return true;
            }

            return false;
          });

          // Avoid duplicates
          const existingIds = new Set(filtered.map(j => j.id));
          const newJobs = fallbackFiltered.filter(j => !existingIds.has(j.id));
          filtered = [...filtered, ...newJobs];

          console.log('[JobAggregator] Fallback search with "' + similarQuery + '" added', newJobs.length, 'jobs');
        }
      } catch (err) {
        console.warn('[JobAggregator] Fallback search failed:', err.message);
      }
      }
    }
  }

  filtered = uniqueById(filtered);

  const sorted = [...filtered].sort((a, b) => {
    const timeA = a?.postedAt ? new Date(a.postedAt).getTime() : 0;
    const timeB = b?.postedAt ? new Date(b.postedAt).getTime() : 0;
    return timeB - timeA;
  });

  const limited = sorted.slice(0, criteria.limit);
  const decorated = await Promise.all(
    limited.map(async job => {
      if (!job?.company) {
        return job;
      }
      return glassdoorService.attachRating(job, 'company');
    })
  );

  const sourceCounts = decorated.reduce((acc, job) => {
    const sourceKey = job?.source || 'unknown';
    acc[sourceKey] = (acc[sourceKey] || 0) + 1;
    return acc;
  }, {});

  const totalAvailable = filtered.length;

  return {
    results: decorated,
    meta: {
      total: totalAvailable,
      returned: decorated.length,
      agent: criteria,
      suggestions,
      sourceCounts,
    },
  };
}

module.exports = {
  aggregateJobs,
};


