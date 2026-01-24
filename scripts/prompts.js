// LLM 评分 Prompt
const RANK_PROMPT = `你是一个内容策展专家。评估以下内容是否适合发布到 X/Twitter。

内容标题：{{title}}
内容摘要：{{snippet}}
来源：{{source}}
链接：{{url}}

请从以下维度评分（0-10分）：
1. relevance: 与AI工具/智能体/技术/工作流的相关性
2. credibility: 内容的可信度和权威性
3. novelty: 新颖性和独特视角

返回严格的JSON格式（不要markdown代码块）：
{
  "relevance": 8,
  "credibility": 9,
  "novelty": 7,
  "total": 24,
  "why": "一句话说明为什么这个内容值得分享",
  "angle_tags": ["ai-tools", "workflow"]
}`;

// 推文生成 Prompt
const TWEET_PROMPT = `基于以下10条精选AI内容，生成3个不同风格的推文草稿。

精选内容：
{{content_list}}

要求：
1. Hot Take（热点观点）：直接、有态度的评论，适合引发讨论，280字符内
2. Framework（框架总结）：结构化、教育性内容，可用emoji分点，适合知识分享
3. Case Study（案例分析）：具体案例和应用，包含链接，适合实践分享

每个推文必须：
- 符合X/Twitter 280字符限制
- 包含相关链接
- 语气专业但不失亲和力
- 避免过度营销

返回严格的JSON格式（不要markdown代码块）：
{
  "hot_take": {
    "text": "推文文本（含链接）",
    "rationale": "为什么选择这个角度",
    "risk": "可能的风险或注意事项"
  },
  "framework": {
    "text": "推文文本（含链接）",
    "rationale": "为什么选择这个角度",
    "risk": "可能的风险或注意事项"
  },
  "case": {
    "text": "推文文本（含链接）",
    "rationale": "为什么选择这个角度",
    "risk": "可能的风险或注意事项"
  }
}`;

module.exports = {
  RANK_PROMPT,
  TWEET_PROMPT
};
