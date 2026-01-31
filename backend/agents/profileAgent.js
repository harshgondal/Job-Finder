const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { JsonOutputParser } = require('@langchain/core/output_parsers');
const { config } = require('../config/env');

class ProfileAgent {
  constructor() {
    if (!config.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    this.llm = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      temperature: 0.1,
      apiKey: config.GEMINI_API_KEY,
    });

    this.parser = new JsonOutputParser();

    this.prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are a resume parsing agent. Extract structured information explicitly stated in the resume text.
Return ONLY valid JSON matching this exact structure:
{{
  "name": "Full name or null",
  "skills": ["tech skill 1", "tech skill 2", "soft skill 1"],
  "experience_years": number (total years, can be decimal like 1.5),
  "roles": ["Job Title 1", "Job Title 2"],
  "domains": ["FinTech", "EdTech", etc. or empty array],
  "preferred_locations": ["locations the candidate EXPLICITLY states as desired/targeted"],
  "education_level": "Highest credential with field (e.g., 'B.Tech in Computer Science') or null",
  "projects": ["project name 1", "project name 2"],
  "inferred_preferences": {{
    "company_size": "startup|mid|enterprise|null",
    "work_mode_preference": "remote|hybrid|onsite|null",
    "focus_area": "backend|frontend|fullstack|ml|devops|null"
  }}
}}

Rules:
- Only include preferred_locations when the candidate clearly states job or relocation preferences. Do NOT infer from education history, past employment, or city mentions without preference wording.
- Extract project titles or product names listed under projects; if multiple, include up to five.
- For education_level, capture the single most recent or highest qualification if present.
- If any section is missing, return the field as null or an empty array as defined above.
`,
      ],
      ['human', 'Resume text:\n{resumeText}'],
    ]);

    this.chain = this.prompt.pipe(this.llm).pipe(this.parser);
  }

  /**
   * Parses resume text and extracts structured profile data
   * @param {string} resumeText - Raw text extracted from resume PDF
   * @returns {Promise<Object>} Structured profile JSON
   */
  async parseResume(resumeText) {
    try {
      const truncatedText = resumeText.substring(0, 8000);
      const suffix = resumeText.length > 8000 ? '... (truncated)' : '';

      console.log('[ProfileAgent] Invoking Gemini for resume parsing');
      const result = await this.chain.invoke({
        resumeText: truncatedText + suffix,
      });
      console.log('[ProfileAgent] Gemini resume parsing completed');

      const normalizeList = (maybeList, limit) => {
        if (!Array.isArray(maybeList)) return [];
        const cleaned = maybeList
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0);
        const unique = Array.from(new Set(cleaned));
        return typeof limit === 'number' ? unique.slice(0, limit) : unique;
      };

      const preferredLocations = normalizeList(result.preferred_locations)
        .filter((loc) => !/^(remote|anywhere)$/i.test(loc));

      const projects = normalizeList(result.projects, 5);

      // Validate and set defaults
      return {
        name: result.name?.trim() || null,
        skills: normalizeList(result.skills),
        experience_years: Number(result.experience_years) || 0,
        roles: normalizeList(result.roles),
        domains: normalizeList(result.domains),
        preferred_locations: preferredLocations,
        education_level:
          typeof result.education_level === 'string' && result.education_level.trim().length > 0
            ? result.education_level.trim()
            : null,
        projects,
        inferred_preferences: result.inferred_preferences || {
          company_size: null,
          work_mode_preference: null,
          focus_area: null,
        },
      };
    } catch (error) {
      console.warn('[ProfileAgent] Gemini parse failed:', error.message);
      console.error('[ProfileAgent] Parse error:', error.message);
      throw new Error(`Failed to parse resume: ${error.message}`);
    }
  }
}

module.exports = { ProfileAgent };

