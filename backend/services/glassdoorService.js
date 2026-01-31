const axios = require('axios');
const { config } = require('../config/env');
const { getJson, setJson } = require('../config/redis');

const CACHE_SECONDS = Math.max(60, (config.CACHE_TTL_MINUTES || 15) * 60);
const RAPID_API_HOST = 'glassdoor-real-time.p.rapidapi.com';
const MAX_REVIEWS = 3;

class GlassdoorService {
  constructor() {}

  async attachRating(job, preferredMode = 'company') {
    const rating = await this.fetchRating(job.company, preferredMode, job.title);
    if (!rating) return job;

    return {
      ...job,
      rating: rating.score,
      reviewMode: rating.mode,
      reviews: rating.reviews,
    };
  }

  async fetchRating(company, mode = 'company', role = '') {
    const searchRole = (role || '').trim();
    const normalizedRole = searchRole.toLowerCase();
    const cacheKey = `${company}:${mode}:${normalizedRole || 'any'}`;
    const cached = await getJson(this.getCacheKey(cacheKey));
    if (cached) return cached;

    if (!config.GLASSDOOR_RAPIDAPI_KEY) {
      console.warn('[GlassdoorService] GLASSDOOR_RAPIDAPI_KEY not configured. Cannot fetch reviews.');
      return null;
    }

    try {
      const headers = {
        'x-rapidapi-key': config.GLASSDOOR_RAPIDAPI_KEY,
        'x-rapidapi-host': RAPID_API_HOST,
      };

      const companyProfile = await this.getCompanyId(company, headers);
      if (!companyProfile?.id) {
        console.warn('[GlassdoorService] No companyId resolved for company:', company);
        return null;
      }

      const { id: companyId, slug: employerSlug } = companyProfile;

      console.info(
        '[GlassdoorService] Resolved companyId',
        companyId,
        employerSlug ? `(${employerSlug})` : '',
        'for company:',
        company
      );

      const reviews = await this.getCompanyReviews(companyId, 2, headers);
      if (!reviews.length) {
        console.warn('[GlassdoorService] No reviews found for company:', company);
        return null;
      }

      const relevantReviews = this.selectRelevantReviews(reviews, normalizedRole);
      if (!relevantReviews.length) {
        console.warn('[GlassdoorService] No role-matching reviews found for company:', company);
        return null;
      }

      const payload = this.transformResponse(relevantReviews, {
        company,
        mode,
        averageRating: this.calculateAverageRating(reviews),
        totalReviews: reviews.length,
        employerSlug,
      });
      if (payload) {
        await setJson(this.getCacheKey(cacheKey), payload, CACHE_SECONDS);
      }
      return payload;
    } catch (err) {
      console.warn('[GlassdoorService] RapidAPI request failed:', err.message);
      return null;
    }
  }

  getCacheKey(rawKey) {
    return `glassdoor:${rawKey}`;
  }

  async getCompanyId(companyName, headers) {
    try {
      const response = await axios.request({
        method: 'GET',
        url: `https://${RAPID_API_HOST}/companies/search`,
        params: {
          query: companyName,
        },
        headers,
      });

      const normalizedCompany = (companyName || '').trim().toLowerCase();
      const candidates = this.extractCompanyCandidates(response.data);

      if (!candidates.length) {
        return null;
      }

      const exactMatch = candidates.find((candidate) =>
        candidate.names.includes(normalizedCompany)
      );

      if (exactMatch) {
        return exactMatch;
      }

      const partialMatch = candidates.find((candidate) =>
        candidate.names.some((name) => name.includes(normalizedCompany) || normalizedCompany.includes(name))
      );

      if (partialMatch) {
        return partialMatch;
      }

      return candidates[0];
    } catch (error) {
      console.warn('[GlassdoorService] Failed to resolve companyId:', error.message);
      return null;
    }
  }

  extractCompanyId(companyData) {
    if (!companyData || typeof companyData !== 'object') {
      return null;
    }

    const possibleIdFields = [
      'id',
      'companyId',
      'company_id',
      'employerId',
      'employer_id',
      'glassdoorId',
      'glassdoor_id',
      'employerID',
      'employerid',
      'employerProfileId',
      'employer_profile_id',
      'profileId',
      'profile_id',
    ];

    for (const field of possibleIdFields) {
      if (companyData[field]) {
        const value = companyData[field];
        if (typeof value === 'string' || typeof value === 'number') {
          return value;
        }

        if (value && typeof value === 'object') {
          if (typeof value.value === 'string' || typeof value.value === 'number') {
            return value.value;
          }

          const nested = this.extractCompanyId(value);
          if (nested) {
            return nested;
          }
        }
      }
    }

    if (companyData.metadata && typeof companyData.metadata === 'object') {
      const metadataMatch = this.extractCompanyId(companyData.metadata);
      if (metadataMatch) {
        return metadataMatch;
      }
    }

    if (companyData.employer && typeof companyData.employer === 'object') {
      return this.extractCompanyId(companyData.employer);
    }

    return null;
  }

  getCompanyNameCandidates(companyData) {
    const candidates = [
      companyData?.name,
      companyData?.companyName,
      companyData?.company_name,
      companyData?.displayName,
      companyData?.display_name,
      companyData?.employerName,
      companyData?.employer_name,
      companyData?.shortName,
      companyData?.short_name,
      companyData?.slug,
      companyData?.label,
      companyData?.title,
      companyData?.nameText,
      companyData?.name_text,
      companyData?.employer?.name,
      companyData?.employer?.displayName,
      companyData?.employer?.display_name,
      companyData?.employer?.shortName,
      companyData?.employer?.short_name,
      companyData?.employer?.label,
      companyData?.employer?.title,
    ];

    return candidates
      .filter((candidate) => typeof candidate === 'string')
      .map((candidate) => candidate.trim().toLowerCase())
      .filter(Boolean);
  }

  extractCompanyCandidates(rawData) {
    if (!rawData) {
      return [];
    }

    const candidates = [];
    const seenIds = new Set();
    const visited = new WeakSet();

    const visit = (node) => {
      if (!node || typeof node !== 'object') {
        return;
      }

      if (visited.has(node)) {
        return;
      }
      visited.add(node);

      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }

      const extractedId = this.extractCompanyId(node);
      const normalizedId = this.normalizeCompanyId(extractedId);
      const nameCandidates = this.getCompanyNameCandidates(node);
      const slugCandidate = this.extractCompanySlug(node) || this.slugifyName(nameCandidates[0]);

      if (normalizedId && nameCandidates.length && !seenIds.has(normalizedId)) {
        candidates.push({ id: normalizedId, names: nameCandidates, slug: slugCandidate || null });
        seenIds.add(normalizedId);
      }

      Object.values(node).forEach(visit);
    };

    visit(rawData);

    return candidates;
  }

  extractCompanySlug(companyData) {
    if (!companyData || typeof companyData !== 'object') {
      return null;
    }

    const possibleSlugFields = [
      'slug',
      'companySlug',
      'company_slug',
      'employerSlug',
      'employer_slug',
      'employerNameUrl',
      'employer_name_url',
      'canonicalName',
      'canonical_name',
      'profileSlug',
      'profile_slug',
      'urlSlug',
      'url_slug',
      'urlFriendlyName',
      'url_friendly_name',
      'nameUrl',
      'name_url',
      'shortUrl',
      'short_url',
    ];

    for (const field of possibleSlugFields) {
      const value = companyData[field];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (value && typeof value === 'object' && typeof value.value === 'string' && value.value.trim()) {
        return value.value.trim();
      }
    }

    if (companyData.employer && typeof companyData.employer === 'object') {
      const nested = this.extractCompanySlug(companyData.employer);
      if (nested) {
        return nested;
      }
    }

    if (companyData.metadata && typeof companyData.metadata === 'object') {
      const nested = this.extractCompanySlug(companyData.metadata);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  slugifyName(name) {
    if (typeof name !== 'string' || !name.trim()) {
      return null;
    }

    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  async getCompanyReviews(companyId, maxPages = 2, headers) {
    const reviews = [];
    const normalizedId = this.normalizeCompanyId(companyId);

    if (!normalizedId) {
      return reviews;
    }

    for (let page = 1; page <= maxPages; page += 1) {
      let response;

      try {
        response = await axios.request({
          method: 'GET',
          url: `https://${RAPID_API_HOST}/companies/reviews`,
          params: {
            companyId: normalizedId,
            page,
          },
          headers,
        });
      } catch (error) {
        if (error?.response?.status === 400 && page > 1) {
          break;
        }

        throw error;
      }

      const pageReviews = this.normalizeReviews(response.data);

      if (!pageReviews.length) {
        const dataSection = response.data?.data || response.data || {};
        console.info(
          '[GlassdoorService] Reviews payload had no normalized entries. Keys:',
          Object.keys(dataSection)
        );
      } else {
        console.info('[GlassdoorService] Retrieved', pageReviews.length, 'reviews for page', page);
      }

      if (!pageReviews.length) {
        break;
      }

      reviews.push(...pageReviews);
    }

    return reviews;
  }

  selectRelevantReviews(reviews, normalizedRole) {
    if (!Array.isArray(reviews) || !reviews.length) {
      return [];
    }

    const keywords = this.buildRoleKeywords(normalizedRole);

    const matched = reviews.filter((review) => {
      const title = typeof review?.jobTitle === 'string' ? review.jobTitle.toLowerCase() : '';
      if (!title) return false;
      return keywords.some((keyword) => title.includes(keyword));
    });

    return matched.length ? matched : reviews;
  }

  buildRoleKeywords(normalizedRole) {
    const baseKeywords = [
      'software',
      'developer',
      'engineer',
      'sde',
      'sdet',
      'programmer',
      'devops',
      'full stack',
      'frontend',
      'front end',
      'backend',
      'back end',
      'mobile developer',
      'ios developer',
      'android developer',
      'data engineer',
      'platform engineer',
    ];

    if (!normalizedRole) {
      return baseKeywords;
    }

    return Array.from(new Set([normalizedRole, ...baseKeywords]));
  }

  calculateAverageRating(reviews) {
    if (!Array.isArray(reviews) || !reviews.length) {
      return null;
    }

    const ratings = reviews
      .map((review) => Number(review?.ratingOverall ?? review?.overallRating))
      .filter((rating) => !Number.isNaN(rating));

    if (!ratings.length) {
      return null;
    }

    const sum = ratings.reduce((acc, rating) => acc + rating, 0);
    return Math.round((sum / ratings.length) * 10) / 10;
  }

  normalizeReviews(payload) {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const candidates = [
      payload?.data?.reviews,
      payload?.data?.employerReviews,
      payload?.reviews,
      payload?.employerReviews,
      payload?.data?.items,
      payload?.employerReviewsRG?.results,
      payload?.employerReviewsRG?.items,
      payload?.employerReviewsRG?.reviews,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    const employerReviewsRG = payload?.employerReviewsRG;
    const extractedFromRG = this.extractReviewsFromRG(employerReviewsRG);
    if (extractedFromRG.length) {
      return extractedFromRG;
    }

    const deepSearch = this.findReviewArray(payload);
    if (deepSearch.length) {
      return deepSearch;
    }

    return [];
  }

  extractReviewsFromRG(rgPayload) {
    if (!rgPayload || typeof rgPayload !== 'object') {
      return [];
    }

    const reviewArrays = [];

    const visit = (node) => {
      if (!node) {
        return;
      }

      if (Array.isArray(node)) {
        if (
          node.some(
            (item) =>
              item &&
              typeof item === 'object' &&
              (item.jobTitle ||
                item.job_title ||
                item.summary ||
                item.pros ||
                item.cons ||
                item.ratingOverall ||
                item.overallRating)
          )
        ) {
          reviewArrays.push(node);
        } else {
          node.forEach(visit);
        }
        return;
      }

      if (typeof node === 'object') {
        Object.values(node).forEach(visit);
      }
    };

    visit(rgPayload);

    return reviewArrays[0] || [];
  }

  findReviewArray(payload) {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const visited = new WeakSet();
    let found = null;

    const isReviewLike = (item) =>
      item &&
      typeof item === 'object' &&
      (typeof item.jobTitle === 'string' ||
        typeof item.job_title === 'string' ||
        typeof item.role === 'string' ||
        typeof item.summary === 'string' ||
        typeof item.pros === 'string' ||
        typeof item.cons === 'string' ||
        item.ratingOverall !== undefined ||
        item.overallRating !== undefined ||
        (item.rating && (item.rating.overall !== undefined || item.rating.overallRating !== undefined)));

    const visit = (node) => {
      if (!node || found) {
        return;
      }

      if (typeof node === 'object') {
        if (visited.has(node)) {
          return;
        }
        visited.add(node);
      }

      if (Array.isArray(node)) {
        if (node.some(isReviewLike)) {
          found = node;
          return;
        }

        node.forEach(visit);
        return;
      }

      if (typeof node === 'object') {
        Object.values(node).forEach(visit);
      }
    };

    visit(payload);

    return found || [];
  }

  normalizeCompanyId(companyId) {
    if (companyId === undefined || companyId === null) {
      return null;
    }

    if (typeof companyId === 'number') {
      return String(Math.trunc(companyId));
    }

    if (typeof companyId === 'string') {
      const trimmed = companyId.trim();
      return trimmed || null;
    }

    if (typeof companyId === 'object') {
      if (typeof companyId.value === 'string' || typeof companyId.value === 'number') {
        return this.normalizeCompanyId(companyId.value);
      }

      const nested = this.extractCompanyId(companyId);
      return this.normalizeCompanyId(nested);
    }

    return null;
  }

  transformResponse(reviews, meta) {
    if (!Array.isArray(reviews) || !reviews.length) {
      return null;
    }

    const rating = meta.averageRating ?? this.calculateAverageRating(reviews) ?? null;
    const reviewCount = meta.totalReviews ?? reviews.length;
    const normalized = reviews
      .slice(0, MAX_REVIEWS)
      .map((review) => this.normalizeReview(review, meta.company, rating, meta.employerSlug));

    return {
      score: rating,
      mode: meta.mode,
      company: meta.company,
      totalReviews: reviewCount,
      reviews: normalized,
      source: 'glassdoor-rapidapi',
    };
  }

  normalizeReview(review, company, aggregateRating, employerSlug) {
    const rating = this.getReviewRating(review) ?? aggregateRating;

    const titleCandidates = [
      review?.headline,
      review?.reviewTitle,
      review?.title,
      review?.jobTitle,
      review?.role,
    ];

    const snippetCandidates = [
      review?.summary,
      review?.pros,
      review?.cons,
      review?.advice,
      review?.reviewDescription,
      review?.description,
    ];

    const authorCandidates = [
      review?.author,
      review?.reviewer,
      review?.reviewerTitle,
      review?.reviewer_title,
    ];

    const publishedCandidates = [
      review?.reviewDate,
      review?.review_date,
      review?.date,
      review?.createdAt,
      review?.created_at,
      review?.reviewDateTime,
    ];

    const linkCandidates = [
      review?.reviewLink,
      review?.review_link,
      review?.link,
      review?.url,
      review?.permalink,
    ];

    if (!linkCandidates.some((value) => typeof value === 'string' && value.trim()) && employerSlug) {
      const reviewId = review?.id || review?.reviewId || review?.review_id;
      if (reviewId) {
        linkCandidates.push(`https://www.glassdoor.com/Reviews/${employerSlug}-Reviews-E${reviewId}.htm`);
      }
    }

    const title = titleCandidates.find((value) => typeof value === 'string' && value.trim()) || `${company} review`;
    const snippet = snippetCandidates.find((value) => typeof value === 'string' && value.trim()) || '';
    const author = authorCandidates.find((value) => typeof value === 'string' && value.trim()) || 'Glassdoor Reviewer';
    const publishedAt = publishedCandidates.find((value) => typeof value === 'string' && value.trim()) || new Date().toISOString();
    const link = linkCandidates.find((value) => typeof value === 'string' && value.trim()) || null;

    return {
      title,
      sentiment: this.deriveSentimentFromRating(rating),
      snippet: snippet.slice(0, 280),
      author,
      link,
      publishedAt,
      rating,
      jobTitle: typeof review?.jobTitle === 'string' ? review.jobTitle : typeof review?.job_title === 'string' ? review.job_title : null,
      pros: typeof review?.pros === 'string' ? review.pros : null,
      cons: typeof review?.cons === 'string' ? review.cons : null,
      summary: typeof review?.summary === 'string' ? review.summary : null,
    };
  }

  getReviewRating(review) {
    if (!review || typeof review !== 'object') {
      return null;
    }

    const candidates = [
      review?.ratingOverall,
      review?.overallRating,
      review?.rating_overall,
      review?.rating?.overall,
      review?.rating?.overallRating,
      review?.rating,
    ];

    for (const value of candidates) {
      const numeric = Number(value);
      if (!Number.isNaN(numeric) && numeric > 0) {
        return Math.round(numeric * 10) / 10;
      }
    }

    return null;
  }

  deriveSentimentFromRating(rating) {
    if (rating === null || rating === undefined) {
      return 'neutral';
    }

    if (rating >= 4) return 'positive';
    if (rating >= 3) return 'neutral';
    return 'negative';
  }
}

module.exports = {
  GlassdoorService,
};




