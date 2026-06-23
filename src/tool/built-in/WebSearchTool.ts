import { buildTool } from '../Tool.js';

export const WebSearchTool = buildTool({
  name: 'WebSearch',
  description: 'Search the web for information. Returns result blocks with titles and URLs.',
  userFacingName: 'WebSearch',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query to use' },
      allowed_domains: { type: 'array', items: { type: 'string' }, description: 'Only include results from these domains' },
      blocked_domains: { type: 'array', items: { type: 'string' }, description: 'Exclude results from these domains' },
    },
    required: ['query'],
  },
  async call(input) {
    try {
      const query = input.query as string;
      const params = new URLSearchParams({ q: query });

      const url = `https://html.duckduckgo.com/html/?${params}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YourCA/0.1)' },
        signal: AbortSignal.timeout(15000),
      });

      const html = await response.text();
      const results: Array<{ title: string; url: string; snippet: string }> = [];

      // Simple HTML parsing for DuckDuckGo results
      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      let count = 0;
      while ((match = resultRegex.exec(html)) !== null && count < 10) {
        const urlStr = match[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '').replace(/&rut=.*$/, '');
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        const snippet = match[3].replace(/<[^>]*>/g, '').trim();
        if (urlStr && title) {
          results.push({ title, url: decodeURIComponent(urlStr), snippet });
          count++;
        }
      }

      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No search results found.' }] };
      }

      const output = results
        .map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet}`)
        .join('\n\n');

      return {
        content: [{ type: 'text', text: `## Search results for "${query}"\n\n${output}` }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Search error: ${err.message}` }],
        isError: true,
      };
    }
  },
  isReadOnly: () => true,
});
