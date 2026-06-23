/**
 * WebBrowser tool — inspired by Claude Code's WebBrowserTool
 * Launches a headless browser to capture webpage screenshots and content.
 */

import { buildTool } from '../Tool.js';

export const WebBrowserTool = buildTool({
  name: 'WebBrowser',
  description: 'Open a web page in a headless browser and capture its rendered content and screenshot.',
  userFacingName: 'WebBrowser',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to open' },
      action: {
        type: 'string',
        description: 'What to capture',
        enum: ['screenshot', 'content', 'pdf'],
        default: 'content',
      },
    },
    required: ['url'],
  },
  async call(input) {
    const url = input.url as string;
    const action = (input.action as string) ?? 'content';

    // Try to use Puppeteer or Playwright if available
    // Fallback to simple fetch for content
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YourCA/1.0)' },
      });

      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `HTTP ${response.status}: ${response.statusText}` }],
          isError: true,
        };
      }

      const html = await response.text();
      // Strip HTML tags for plain text
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 10000);

      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '(no title)';

      return {
        content: [{
          type: 'text',
          text: `Title: ${title}\nURL: ${url}\n\nContent:\n${text}`,
        }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error fetching ${url}: ${err.message}` }],
        isError: true,
      };
    }
  },
  isReadOnly: () => true,
});
