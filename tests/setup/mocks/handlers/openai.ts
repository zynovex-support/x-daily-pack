/**
 * OpenAI API Mock Handlers
 */
import { http, HttpResponse } from 'msw';

// Generate deterministic embedding from text
function hashToEmbedding(text: string): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash;
  }

  const embedding: number[] = [];
  for (let i = 0; i < 1536; i++) {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    embedding.push((hash / 0x7fffffff) * 2 - 1);
  }

  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map(v => v / norm);
}

export const openaiHandlers = [
  // Embeddings API
  http.post('https://api.openai.com/v1/embeddings', async ({ request }) => {
    const body = await request.json() as { input: string | string[] };
    const inputs = Array.isArray(body.input) ? body.input : [body.input];

    return HttpResponse.json({
      object: 'list',
      data: inputs.map((text, index) => ({
        object: 'embedding',
        index,
        embedding: hashToEmbedding(text),
      })),
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 10, total_tokens: 10 },
    });
  }),

  // Chat Completions API
  http.post('https://api.openai.com/v1/chat/completions', async () => {
    return HttpResponse.json({
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4o-mini',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify({
            items: [{
              id: 1,
              timeliness: 5,
              impact: 7,
              actionability: 5,
              relevance: 6,
              total: 23,
              category: 'announcement'
            }]
          }),
        },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });
  }),
];
