import { defineConfig } from '@radar/core';

const subreddits = [
  'SteamDeck',
  'emulation',
  'SBCGaming',
  'LocalLLaMA',
  'ClaudeAI',
  'ChatGPTCoding',
  'gamedev',
  'indiegaming',
  'neovim',
  'golang',
];

export default defineConfig({
  niches: [
    {
      id: 'ai',
      name: 'AI tools, coding with AI, agents, LLM releases',
      keywords: [
        'llm',
        'ai agent',
        'agents',
        'claude',
        'claude code',
        'gpt',
        'openai',
        'anthropic',
        'deepseek',
        'gemini',
        'llama',
        'qwen',
        'mcp',
        'copilot',
        'cursor',
        'vibe coding',
        'ai coding',
        'ollama',
        'open-weight',
        'rag',
        'fine-tuning',
      ],
    },
    {
      id: 'handheld',
      name: 'Steam Deck, handheld PCs, emulation',
      keywords: [
        'steam deck',
        'steamdeck',
        'steamos',
        'handheld',
        'rog ally',
        'legion go',
        'emudeck',
        'emulation',
        'emulator',
        'xenia',
        'rpcs3',
        'yuzu',
        'ryujinx',
        'retroarch',
        'proton',
        'decky',
        'retro handheld',
      ],
    },
    {
      id: 'gamedev',
      name: 'Gamedev, indie games, AI in games',
      keywords: [
        'gamedev',
        'game dev',
        'indie game',
        'indie dev',
        'devlog',
        'godot',
        'unity',
        'unreal',
        'bevy',
        'game jam',
        'procedural generation',
        'battle royale',
        'ai npc',
        'steam next fest',
      ],
    },
    {
      id: 'devtools',
      name: 'Go and TypeScript dev tools, Neovim, terminal tools',
      keywords: [
        'golang',
        'typescript',
        'neovim',
        'nvim',
        'vim',
        'tmux',
        'terminal',
        'cli',
        'tui',
        'ripgrep',
        'zig',
        'rust',
        'bun',
        'deno',
        'vite',
        'esbuild',
        'dev tool',
        'devtools',
        'pnpm',
      ],
    },
  ],

  sources: [
    { type: 'hn' },
    { type: 'reddit', subreddits },
    {
      type: 'github',
      topics: ['llm', 'ai-agents', 'steam-deck', 'emulator', 'neovim', 'gamedev', 'golang', 'cli'],
      daysBack: 7,
    },
    { type: 'rss', name: 'GamingOnLinux', url: 'https://www.gamingonlinux.com/article_rss.php' },
    { type: 'rss', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
    {
      type: 'rss',
      name: 'Fireship (YouTube)',
      url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA',
    },
    {
      type: 'rss',
      name: 'Google News: Steam Deck',
      url: 'https://news.google.com/rss/search?q=%22steam+deck%22+OR+emudeck&hl=en-US&gl=US&ceid=US:en',
      alwaysInclude: true,
    },
    {
      type: 'rss',
      name: 'Neovim releases',
      url: 'https://github.com/neovim/neovim/releases.atom',
      alwaysInclude: true,
    },
    // Optional, needs rsshubBase. Off by default.
    {
      type: 'rss',
      name: 'X: example (RSSHub)',
      url: 'rsshub:/twitter/user/example',
      mediaType: 'social',
    },
  ],

  // Set to e.g. 'http://localhost:1200' to enable rsshub: sources.
  rsshubBase: undefined,

  // 'deepseek' (needs DEEPSEEK_API_KEY), 'anthropic' (needs ANTHROPIC_API_KEY) or 'none'.
  // A missing key falls back to 'none' with a warning.
  provider: 'deepseek',

  // Items scored by the model per run (after the keyword prefilter).
  topN: 30,

  // scoring: { deepseekModel: 'deepseek-flash', anthropicModel: 'claude-haiku-5-5', feedbackLimit: 10 },
  // digest: { top: 5 },
});
