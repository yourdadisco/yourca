import { buildTool } from '../Tool.js';

export const WebFetchTool = buildTool({
  name: 'WebFetch',
  description: 'Fetch a URL and extract its content as markdown.',
  userFacingName: 'WebFetch',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch content from' },
      prompt: { type: 'string', description: 'Optional question to answer from the content' },
    },
    required: ['url'],
  },
  async call(input) {
    try {
      const url = input.url as string;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YourCA/0.1)' },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `HTTP ${response.status}: ${response.statusText}` }],
          isError: true,
        };
      }

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      if (contentType.includes('text/html') || contentType.includes('text/plain')) {
        const cleaned = text
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, 50000);

        return {
          content: [{ type: 'text', text: `Content from ${url}:\n\n${cleaned}` }],
        };
      }

      return {
        content: [{ type: 'text', text: `Fetched ${url} (${text.length} chars, ${contentType})` }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Fetch error: ${err.message}` }],
        isError: true,
      };
    }
  },
  isReadOnly: () => true,
});
