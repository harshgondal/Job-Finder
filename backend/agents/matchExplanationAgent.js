const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { JsonOutputParser } = require('@langchain/core/output_parsers');
const { config } = require('../config/env');
const { buildPreferenceSignals, evaluateJobAgainstPreferences, inferWorkMode } = require('../utils/preferences');

class MatchExplanationAgent {
  constructor() {
    if (config.GEMINI_API_KEY) {
      this.llm = new ChatGoogleGenerativeAI({
        model: 'gemini-2.5-flash',
        temperature: 0.2,
        apiKey: config.GEMINI_API_KEY,
      });

      this.parser = new JsonOutputParser();

      this.prompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `You are a job match explanation agent. Analyze how well a profile matches a job and communicate concrete, personalized insights.
Always ground statements in the supplied profile and job data (skills, experience, work mode, location, salary signals).
Keep the tone concise but specific. Avoid generic advice like "improve skills" without context.
Return ONLY valid JSON with the following structure:
{{
  "score": number (0-100),
  "summary": "1-2 sentences highlighting why this profile is or isn't ready, referencing years of experience, standout strengths, or context from the role",
  "missing_skills": ["skill gaps with brief context (e.g., 'AWS Lambda (required for automation pipeline)')"],
  "reasoning": [
    "Strength-focused insight referencing matching skills or experience",
    "Gap or risk with context (why it matters for this role)",
    "Alignment note (culture, work mode, domain, impact)"
  ],
  "suggestions": [
    "Actionable next steps with verbs, e.g., 'Complete XYZ certification to cover <skill>', 'Prepare examples about <experience>'"
  ]
}}
`,
        ],
        ['human', 'User Profile:\n{profile}\n\nJob:\nTitle: {title}\nRequired Skills: {requiredSkills}\nNice to Have: {niceToHave}\nLevel: {level}\nWork Mode: {workMode}\nLocation: {location}'],
      ]);

      this.chain = this.prompt.pipe(this.llm).pipe(this.parser);
    }
  }

  /**
   * Computes match score and generates explanation
   * @param {Object} profile - User profile
   * @param {Object} job - Normalized job object
   * @returns {Promise<Object>} Match score and explanation
   */
  async explainMatch(profile, job) {
    // First compute base score using rule-based logic
    const baseScore = this.computeBaseScore(profile, job);

    if (!this.llm) {
      console.log('[MatchExplanationAgent] Using rule-based explanation fallback', {
        title: job.normalized?.title || job.title,
        company: job.company,
      });
      // If no LLM, return rule-based match (this is acceptable as it's not synthetic)
      return {
        score: baseScore,
        summary: this.generateBasicSummary(baseScore, profile, job),
        missing_skills: this.getMissingSkills(profile, job),
        reasoning: this.generateBasicReasoning(profile, job),
        suggestions: this.generateBasicSuggestions(profile, job),
      };
    }

    try {
      console.log('[MatchExplanationAgent] Invoking Gemini for match explanation');
      const aiMatch = await this.chain.invoke({
        profile: JSON.stringify(profile, null, 2),
        title: job.normalized?.title || job.title,
        requiredSkills: (job.normalized?.required_skills || []).join(', '),
        niceToHave: (job.normalized?.nice_to_have || []).join(', '),
        level: job.normalized?.level || 'unknown',
        workMode: job.normalized?.work_mode || 'unknown',
        location: job.location || 'unknown',
      });
      console.log('[MatchExplanationAgent] Gemini match explanation completed');

      return {
        score: Math.min(100, Math.max(0, Number(aiMatch.score) || baseScore)),
        summary: aiMatch.summary || this.generateBasicSummary(baseScore, profile, job),
        missing_skills: Array.isArray(aiMatch.missing_skills) ? aiMatch.missing_skills : this.getMissingSkills(profile, job),
        reasoning: Array.isArray(aiMatch.reasoning) ? aiMatch.reasoning : this.generateBasicReasoning(profile, job),
        suggestions: Array.isArray(aiMatch.suggestions) ? aiMatch.suggestions : [],
      };
    } catch (error) {
      console.warn('[MatchExplanationAgent] Gemini explanation failed:', error.message);
      console.error('[MatchExplanationAgent] Error:', error.message);
      // Fall back to rule-based match if AI fails (this is acceptable as it's not synthetic)
      return {
        score: baseScore,
        summary: this.generateBasicSummary(baseScore, profile, job),
        missing_skills: this.getMissingSkills(profile, job),
        reasoning: this.generateBasicReasoning(profile, job),
        suggestions: this.generateBasicSuggestions(profile, job),
      };
    }
  }

  computeBaseScore(profile, job, options = {}) {
    const {
      rawJob = null,
      includeDetails = false,
      preferenceSignals: providedPreferenceSignals = null,
    } = options;
    let score = 50; // Base score
    const details = {
      skills: 0,
      niceToHave: 0,
      experience: 0,
      location: 0,
      workMode: 0,
      preferenceAdjustment: 0,
    };

    // Skills match (40 points max)
    const profileSkills = (profile.skills || []).map(s => s.toLowerCase());
    const requiredSkills = (job.normalized?.required_skills || []).map(s => s.toLowerCase());
    const niceToHave = (job.normalized?.nice_to_have || []).map(s => s.toLowerCase());

    const matchedRequired = requiredSkills.filter(s => 
      profileSkills.some(ps => ps.includes(s) || s.includes(ps))
    ).length;
    const matchedNice = niceToHave.filter(s => 
      profileSkills.some(ps => ps.includes(s) || s.includes(ps))
    ).length;

    if (requiredSkills.length > 0) {
      const requiredPoints = (matchedRequired / requiredSkills.length) * 30;
      score += requiredPoints;
      details.skills = Math.round(requiredPoints * 10) / 10;
    }
    const nicePoints = (matchedNice / Math.max(niceToHave.length, 1)) * 10;
    score += nicePoints;
    details.niceToHave = Math.round(nicePoints * 10) / 10;

    // Experience level match (20 points max)
    const profileExp = profile.experience_years || 0;
    const jobLevel = job.normalized?.level;
    if (jobLevel === 'intern' && profileExp < 2) {
      score += 20;
      details.experience = 20;
    } else if (jobLevel === 'junior' && profileExp >= 0.5 && profileExp < 3) {
      score += 20;
      details.experience = 20;
    } else if (jobLevel === 'mid' && profileExp >= 2 && profileExp < 5) {
      score += 20;
      details.experience = 20;
    } else if (jobLevel === 'senior' && profileExp >= 4) {
      score += 20;
      details.experience = 20;
    } else if (jobLevel === 'lead' && profileExp >= 6) {
      score += 20;
      details.experience = 20;
    }

    // Location match (15 points max)
    const jobLocation = (job.location || '').toLowerCase();
    const preferredLocations = (profile.preferred_locations || []).map(l => l.toLowerCase());
    if (jobLocation.includes('remote') && (preferredLocations.includes('remote') || preferredLocations.length === 0)) {
      score += 15;
      details.location = 15;
    } else if (preferredLocations.some(loc => jobLocation.includes(loc) || loc.includes(jobLocation.split(',')[0]))) {
      score += 15;
      details.location = 15;
    }

    // Work mode match (15 points max)
    const workMode = job.normalized?.work_mode;
    const preferredMode = profile.inferred_preferences?.work_mode_preference;
    if (workMode && preferredMode && workMode === preferredMode) {
      score += 15;
      details.workMode = 15;
    } else if (!preferredMode) {
      score += 10; // Neutral if no preference
      details.workMode = 10;
    }

    const preferenceSignals = providedPreferenceSignals || buildPreferenceSignals(profile);
    const { adjustment, exclude } = evaluateJobAgainstPreferences({
      normalizedJob: job,
      rawJob,
    }, preferenceSignals);

    if (exclude) {
      return includeDetails
        ? { score: 0, excluded: true, details: { ...details, preferenceAdjustment: adjustment } }
        : 0;
    }

    score += adjustment;
    details.preferenceAdjustment = Math.round(adjustment * 10) / 10;

    const finalScore = Math.min(100, Math.max(0, Math.round(score)));

    if (includeDetails) {
      return {
        score: finalScore,
        excluded: false,
        details,
        preferenceSignals,
        inferredWorkMode: inferWorkMode(job, rawJob),
      };
    }

    return finalScore;
  }

  getMissingSkills(profile, job) {
    const profileSkills = (profile.skills || []).map(s => s.toLowerCase());
    const requiredSkills = (job.normalized?.required_skills || []).map(s => s.toLowerCase());
    return requiredSkills.filter(s => 
      !profileSkills.some(ps => ps.includes(s) || s.includes(ps))
    );
  }

  generateBasicSummary(score, profile, job) {
    if (score >= 80) return 'Excellent match! Your skills and experience align well with this role.';
    if (score >= 60) return 'Good match. Most requirements are met with some minor gaps.';
    if (score >= 40) return 'Moderate match. Some relevant experience but missing key requirements.';
    return 'Limited match. Significant gaps between your profile and job requirements.';
  }

  generateBasicReasoning(profile, job) {
    const reasons = [];
    const profileSkills = (profile.skills || []).map(s => s.toLowerCase());
    const requiredSkills = (job.normalized?.required_skills || []).map(s => s.toLowerCase());
    const matched = requiredSkills.filter(s => 
      profileSkills.some(ps => ps.includes(s) || s.includes(ps))
    );

    if (matched.length > 0) {
      reasons.push(`Strength: ${matched.length} of ${requiredSkills.length} core skills align (${matched.join(', ')}).`);
    }

    const missing = this.getMissingSkills(profile, job);
    if (missing.length > 0) {
      reasons.push(`Gap: Missing exposure to ${missing.join(', ')}, which are highlighted in the role requirements.`);
    }

    if (profile.experience_years && job.normalized?.level) {
      reasons.push(`Context: ${profile.experience_years} years of experience compared to the ${job.normalized.level || 'unspecified'} level expectations.`);
    }

    if (job.location) {
      const preferredLocations = (profile.preferred_locations || []).map(loc => loc.toLowerCase());
      const jobLocation = job.location.toLowerCase();
      if (jobLocation.includes('remote')) {
        reasons.push('Location: Role is remote-friendly, reducing relocation friction.');
      } else if (preferredLocations.some(loc => jobLocation.includes(loc))) {
        reasons.push(`Location: Preferred region matches (${job.location}).`);
      }
    }

    return reasons;
  }

  generateBasicSuggestions(profile, job) {
    const suggestions = [];
    const missingSkills = this.getMissingSkills(profile, job);

    if (missingSkills.length > 0) {
      const highlighted = missingSkills.slice(0, 3).join(', ');
      suggestions.push(`Plan focused upskilling on ${highlighted} using a certification or hands-on project aligned to cloud deployments.`);
    }

    if (job.normalized?.required_skills?.length) {
      const overlap = (job.normalized.required_skills || []).filter(skill =>
        (profile.skills || []).some(ps => ps.toLowerCase().includes((skill || '').toLowerCase()))
      );
      if (overlap.length > 0) {
        suggestions.push(`Highlight recent wins that show applied strength in ${overlap.join(', ')} during interviews or on your resume.`);
      }
    }

    if (job.normalized?.work_mode && !suggestions.some(text => text.toLowerCase().includes('work mode'))) {
      suggestions.push(`Prepare an example illustrating your success working in a ${job.normalized.work_mode} environment.`);
    }

    if (!suggestions.length) {
      suggestions.push('Prepare a concise story that connects your recent achievements to the role’s stated outcomes.');
    }

    return suggestions;
  }

  generateFallbackMatch(profile, job, baseScore) {
    return {
      score: baseScore,
      summary: this.generateBasicSummary(baseScore, profile, job),
      missing_skills: this.getMissingSkills(profile, job),
      reasoning: this.generateBasicReasoning(profile, job),
      suggestions: this.generateBasicSuggestions(profile, job),
    };
  }
}

module.exports = { MatchExplanationAgent };

