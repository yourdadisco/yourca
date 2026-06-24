/**
 * Memory tools — store, search, and manage vector memory via MemPalace.
 *
 * Tools:
 *   memory_store   — Store content into vector memory
 *   memory_search  — Semantic search across stored memories
 *   memory_stats   — Memory system statistics (wings, rooms, DB size)
 *   memory_forget  — DANGER: erase ALL stored memories
 */
import { buildTool } from '../Tool.js';
import {
  storeMemory,
  searchMemories,
  getWingStats,
  getMemoryStats,
  clearMemories,
  initMempalace,
} from '../../services/vectorMemory/index.js';

// ─── Memory Store ───

export const MemoryStore = buildTool({
  name: 'memory_store',
  aliases: ['mem_store'],
  searchHint: 'Store content into vector memory for semantic recall',
  userFacingName: 'MemoryStore',
  description:
    'Store content into vector memory for semantic recall. Content is auto-chunked, ' +
    'embedded via all-MiniLM-L6-v2, and indexed with wing/room metadata. Use this to persist ' +
    'important facts, conversations, decisions, or reference material that should be searchable ' +
    'later via memory_search.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Text content to store in memory (required)',
      },
      wing: {
        type: 'string',
        description: 'Project wing (auto-detected from cwd if omitted)',
      },
      room: {
        type: 'string',
        description: 'Room/category within the wing (default: "conversation")',
      },
      tags: {
        type: 'string',
        description: 'Comma-separated tags for filtering (e.g. "decision,architecture")',
      },
    },
    required: ['content'],
  },
  async call(input) {
    if (!input.content || !(input.content as string).trim()) {
      return {
        content: [{ type: 'text', text: 'Error: content is required and must be non-empty.' }],
        isError: true,
      };
    }
    try {
      await initMempalace();
      const content = input.content as string;
      const ids = await storeMemory(content, {
        wing: input.wing as string | undefined,
        room: input.room as string | undefined,
        tags: (input.tags as string)
          ?.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      return {
        content: [
          {
            type: 'text',
            text: `Stored ${ids.length} chunk(s) into memory.\nIDs: ${ids.join(', ')}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error storing memory: ${err.message}` }],
        isError: true,
      };
    }
  },
});

// ─── Memory Search ───

export const MemorySearch = buildTool({
  name: 'memory_search',
  aliases: ['mem_search', 'mem_query'],
  searchHint: 'Semantic search across stored vector memories',
  userFacingName: 'MemorySearch',
  description:
    'Semantic search across stored vector memories. Returns relevant chunks ordered by ' +
    'cosine similarity score. Use this to recall past conversations, decisions, preferences, ' +
    'and facts previously stored via memory_store.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language search query',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 5, max: 50)',
        default: 5,
      },
    },
    required: ['query'],
  },
  async call(input) {
    if (!input.query || !(input.query as string).trim()) {
      return {
        content: [{ type: 'text', text: 'Error: query is required and must be non-empty.' }],
        isError: true,
      };
    }
    try {
      await initMempalace();
      const query = input.query as string;
      const limit = Math.min(Math.max(1, (input.limit as number) ?? 5), 50);
      const results = await searchMemories(query, limit);

      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No matching memories found.' }] };
      }

      const lines = results.map((r, i) => {
        const age = r.chunk.filedAt
          ? `${Math.floor((Date.now() - new Date(r.chunk.filedAt).getTime()) / 86400000)}d`
          : '?d';
        const tags = r.chunk.sourceFile ? ` [${r.chunk.sourceFile}]` : '';
        return (
          `[${i + 1}] (${Math.round(r.score * 100)}% match, ${age}, ${r.chunk.wing}/${r.chunk.room}${tags})\n` +
          r.chunk.content.slice(0, 500)
        );
      });

      return {
        content: [
          {
            type: 'text',
            text: `## Memory Search Results (${results.length}/${limit})\n\n${lines.join('\n\n')}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error searching memory: ${err.message}` }],
        isError: true,
      };
    }
  },
  isReadOnly: () => true,
});

// ─── Memory Stats ───

export const MemoryStats = buildTool({
  name: 'memory_stats',
  aliases: ['mem_stats', 'memory_status'],
  searchHint: 'Get memory system statistics',
  userFacingName: 'MemoryStats',
  description:
    'Get memory system statistics: total stored chunks, breakdown by wing and room, ' +
    'and vector database file size on disk. Useful for monitoring memory usage and ' +
    'understanding what data is currently stored.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async call() {
    try {
      await initMempalace();
      const stats = await getWingStats();
      const memStats = getMemoryStats();

      const wingLines = Object.entries(stats.wings)
        .sort((a, b) => b[1] - a[1])
        .map(([w, c]) => `  ${w}: ${c} chunk(s)`);

      const roomLines = Object.entries(stats.rooms)
        .sort((a, b) => b[1] - a[1])
        .map(([r, c]) => `  ${r}: ${c} chunk(s)`);

      return {
        content: [
          {
            type: 'text',
            text: [
              '## Memory Stats',
              '',
              `Total chunks: ${stats.total}`,
              `Vector DB size: ${memStats.vectorSizeKB} KB`,
              '',
              'By Wing:',
              wingLines.length > 0 ? wingLines.join('\n') : '  (none)',
              '',
              'By Room:',
              roomLines.length > 0 ? roomLines.join('\n') : '  (none)',
            ].join('\n'),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error getting memory stats: ${err.message}` }],
        isError: true,
      };
    }
  },
  isReadOnly: () => true,
});

// ─── Memory Forget ───

export const MemoryForget = buildTool({
  name: 'memory_forget',
  aliases: ['mem_forget', 'mem_clear'],
  searchHint: 'DANGER: erase ALL stored vector memories',
  userFacingName: 'MemoryForget',
  description:
    'DANGER: Erase ALL stored vector memories across all wings and rooms. ' +
    'This destroys the vector database file and knowledge graph irreversibly. ' +
    'Requires confirm=true to execute. Use memory_stats first to review what will be lost.',
  inputSchema: {
    type: 'object',
    properties: {
      confirm: {
        type: 'boolean',
        description: 'Must be true to confirm irreversible deletion of ALL memories',
      },
    },
    required: ['confirm'],
  },
  async call(input) {
    if (input.confirm !== true) {
      return {
        content: [
          {
            type: 'text',
            text: 'Memory forget aborted. Set confirm=true to proceed with irreversible deletion.',
          },
        ],
        isError: true,
      };
    }
    try {
      await initMempalace();
      clearMemories();
      return {
        content: [
          {
            type: 'text',
            text: 'All memories cleared. The vector database and knowledge graph have been deleted.',
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error clearing memory: ${err.message}` }],
        isError: true,
      };
    }
  },
  isDestructive: () => true,
});
