const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { JsonOutputParser, OutputFixingParser } = require('@langchain/core/output_parsers');
const { config } = require('../config/env');

class JobNormalizationAgent {
  constructor() {
    if (config.GEMINI_API_KEY) {
      this.llm = new ChatGoogleGenerativeAI({
        model: 'gemini-2.5-flash',
        temperature: 0.1,
        apiKey: config.GEMINI_API_KEY,
        responseMimeType: 'application/json',
      });

      const baseParser = new JsonOutputParser();
      if (OutputFixingParser && typeof OutputFixingParser.fromLLM === 'function') {
        this.parser = OutputFixingParser.fromLLM(this.llm, baseParser);
      } else {
        console.warn(
          '[JobNormalizationAgent] OutputFixingParser unavailable. Falling back to basic JSON parser.'
        );
        this.parser = baseParser;
      }

      this.prompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `You are a job normalization agent. Convert raw job listings into structured format.
Return ONLY valid JSON:
{{
  "job_id": "job id",
  "normalized_title": "Standardized job title",
  "required_skills": ["skill1", "skill2"],
  "nice_to_have": ["skill3", "skill4"],
  "level": "intern|junior|mid|senior|lead|null",
  "employment_type": "full-time|internship|contract|part-time|null",
  "work_mode": "remote|hybrid|onsite|null",
  "red_flags": ["flag1"] or [],
  "green_flags": ["flag1"] or [],
  "salary_range": "range or null",
  "summary": "one sentence summary"
}}`,
        ],
        ['human', 'Raw job:\nTitle: {title}\nCompany: {company}\nLocation: {location}\nDescription: {description}'],
      ]);

      this.chain = this.prompt.pipe(this.llm).pipe(this.parser);
    }
  }

  /**
   * Normalizes a job description into structured format
   * @param {Object} rawJob - Raw job object from datasource
   * @returns {Promise<Object>} Normalized job structure
   */
  async normalizeJob(rawJob) {
    if (!this.llm) {
      throw new Error('GEMINI_API_KEY not configured. Job normalization requires AI agent.');
    }

    try {
      console.log('[JobNormalizationAgent] Invoking Gemini for job normalization');
      const normalized = await this.chain.invoke({
        title: rawJob.title || 'N/A',
        company: rawJob.company || 'N/A',
        location: rawJob.location || 'N/A',
        description: (rawJob.description || '').substring(0, 2000),
      });
      console.log('[JobNormalizationAgent] Gemini normalization completed');

      // Merge with original job data
      return {
        ...rawJob,
        normalized: {
          title: normalized.normalized_title || rawJob.title,
          required_skills: Array.isArray(normalized.required_skills) ? normalized.required_skills : [],
          nice_to_have: Array.isArray(normalized.nice_to_have) ? normalized.nice_to_have : [],
          level: normalized.level || null,
          employment_type: normalized.employment_type || null,
          work_mode: normalized.work_mode || null,
          red_flags: Array.isArray(normalized.red_flags) ? normalized.red_flags : [],
          green_flags: Array.isArray(normalized.green_flags) ? normalized.green_flags : [],
          salary_range: normalized.salary_range || null,
          summary: normalized.summary || rawJob.description?.substring(0, 200) || '',
        },
      };
    } catch (error) {
      console.error('[JobNormalizationAgent] Error:', error.message);
      if (error?.output) {
        console.error('[JobNormalizationAgent] Raw output that failed to parse:', error.output);
      }
      throw new Error(`Failed to normalize job: ${error.message}`);
    }
  }
}

module.exports = { JobNormalizationAgent };

