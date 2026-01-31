const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { JsonOutputParser } = require('@langchain/core/output_parsers');
const { config } = require('../config/env');
const { GlassdoorService } = require('../services/glassdoorService');

class CompanyResearchAgent {
  constructor() {
    this.glassdoor = new GlassdoorService();

    if (config.GEMINI_API_KEY) {
      this.llm = new ChatGoogleGenerativeAI({
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        apiKey: config.GEMINI_API_KEY,
      });

      this.parser = new JsonOutputParser();

      this.prompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `You are a company research agent. Research companies and provide insights.
Return ONLY valid JSON:
{{
  "company_name": "company name",
  "summary": "2-3 sentence overview",
  "tech_stack": ["tech1", "tech2"],
  "company_type": "startup|mid|enterprise|unknown",
  "culture_highlights": ["highlight1"],
  "talking_points": ["point 1", "point 2"],
  "red_flags": ["flag1"] or [],
  "green_flags": ["flag1"] or []
}}`,
        ],
        ['human', 'Company: {company}\n\nSearch Results:\n{searchContext}\n\n{userContext}'],
      ]);

      this.chain = this.prompt.pipe(this.llm).pipe(this.parser);
    }
  }

  /**
   * Researches a company and generates insights
   * @param {string} companyName - Company name
   * @param {Object} userProfile - User profile for personalized insights
   * @returns {Promise<Object>} Company research data
   */
  async researchCompany(companyName, userProfile = null) {
    if (!this.llm) {
      return this.fallbackResearch(companyName);
    }

    const searchContext = 'No external search context provided; rely on general knowledge and reasonable assumptions based on the company name.';

    const userContext = userProfile
      ? `User Profile Context:\n${JSON.stringify(userProfile, null, 2)}`
      : '';

    try {
      console.log('[CompanyResearchAgent] Invoking Gemini for company research');
      const research = await this.chain.invoke({
        company: companyName,
        searchContext,
        userContext,
      });
      console.log('[CompanyResearchAgent] Gemini company research completed');

      const glassdoor = await this.glassdoor.fetchRating(companyName, 'company', research?.company_type);

      if (glassdoor) {
        const reviewCount = Array.isArray(glassdoor.reviews) ? glassdoor.reviews.length : 0;
        console.log(
          '[CompanyResearchAgent] Glassdoor reviews attached',
          JSON.stringify({
            company: companyName,
            score: glassdoor.score,
            totalReviews: glassdoor.totalReviews,
            returnedReviews: reviewCount,
          })
        );
      } else {
        console.log('[CompanyResearchAgent] No Glassdoor reviews available for', companyName);
      }

      return {
        company_name: research.company_name || companyName,
        summary: research.summary || `Information about ${companyName}`,
        tech_stack: Array.isArray(research.tech_stack) ? research.tech_stack : [],
        company_type: research.company_type || 'unknown',
        culture_highlights: Array.isArray(research.culture_highlights) ? research.culture_highlights : [],
        talking_points: Array.isArray(research.talking_points) ? research.talking_points : [],
        red_flags: Array.isArray(research.red_flags) ? research.red_flags : [],
        green_flags: Array.isArray(research.green_flags) ? research.green_flags : [],
        glassdoor,
      };
    } catch (error) {
      console.warn('[CompanyResearchAgent] Gemini research failed:', error.message);
      console.warn('[CompanyResearchAgent] Error:', error.message);
      return this.fallbackResearch(companyName);
    }
  }

  fallbackResearch(companyName) {
    return {
      company_name: companyName,
      summary: `Research data for ${companyName} is not available.`,
      tech_stack: [],
      company_type: 'unknown',
      culture_highlights: [],
      talking_points: [
        `Research ${companyName}'s recent projects and tech stack`,
        `Highlight relevant experience from your background`,
      ],
      red_flags: [],
      green_flags: [],
      glassdoor: null,
    };
  }
}

module.exports = { CompanyResearchAgent };

