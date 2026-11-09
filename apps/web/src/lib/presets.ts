import type { Niche } from '@radar/core/ranking';

export interface PresetFeed {
  title: string;
  url: string;
}

export interface Preset {
  /** Matches the built-in niche id where one exists (ai, handheld, gamedev, devtools). */
  id: string;
  name: string;
  keywords: string[];
  /**
   * Suggested RSS feeds for topics the built-in sources barely cover. Every URL here was
   * fetched and parsed during development; add only feeds that were checked the same way.
   */
  feeds: PresetFeed[];
}

export const MAX_NICHES = 20;

export const PRESETS: readonly Preset[] = [
  {
    id: 'ai',
    name: 'AI',
    keywords: ['llm', 'claude', 'openai', 'gemini', 'agent', 'ai model', 'fine-tuning', 'rag'],
    feeds: [],
  },
  {
    id: 'devtools',
    name: 'Dev tools',
    keywords: ['cli', 'terminal', 'neovim', 'editor', 'compiler', 'typescript', 'golang', 'rust'],
    feeds: [],
  },
  {
    id: 'webdev',
    name: 'Web dev',
    keywords: ['css', 'javascript', 'react', 'browser', 'web platform', 'accessibility', 'html'],
    feeds: [
      { title: 'web.dev', url: 'https://web.dev/feed.xml' },
      { title: 'CSS-Tricks', url: 'https://css-tricks.com/feed/' },
      { title: 'JavaScript Weekly', url: 'https://javascriptweekly.com/rss/' },
    ],
  },
  {
    id: 'security',
    name: 'Security',
    keywords: ['vulnerability', 'zero-day', 'ransomware', 'breach', 'cve', 'malware', 'exploit'],
    feeds: [
      { title: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
      { title: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
      { title: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
    ],
  },
  {
    id: 'startups',
    name: 'Startups',
    keywords: ['startup', 'funding', 'seed round', 'series a', 'founder', 'y combinator', 'saas'],
    feeds: [
      { title: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
      { title: 'Y Combinator Blog', url: 'https://www.ycombinator.com/blog/rss' },
    ],
  },
  {
    id: 'gaming',
    name: 'Gaming',
    keywords: ['game release', 'steam', 'playstation', 'nintendo', 'xbox', 'patch notes', 'dlc'],
    feeds: [
      { title: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/feed' },
      { title: 'PC Gamer', url: 'https://www.pcgamer.com/rss/' },
    ],
  },
  {
    id: 'handheld',
    name: 'Handhelds and Steam Deck',
    keywords: ['steam deck', 'rog ally', 'legion go', 'handheld', 'emudeck', 'steamos'],
    feeds: [{ title: 'Liliputing', url: 'https://liliputing.com/feed/' }],
  },
  {
    id: 'gamedev',
    name: 'Indie games',
    keywords: ['indie game', 'gamedev', 'godot', 'unity', 'unreal', 'game jam', 'itch.io'],
    feeds: [{ title: 'Game Developer', url: 'https://www.gamedeveloper.com/rss.xml' }],
  },
  {
    id: 'science',
    name: 'Science',
    keywords: ['study', 'physics', 'biology', 'chemistry', 'researchers', 'discovery', 'climate'],
    feeds: [
      { title: 'Quanta Magazine', url: 'https://api.quantamagazine.org/feed/' },
      { title: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml' },
      { title: 'Phys.org', url: 'https://phys.org/rss-feed/' },
    ],
  },
  {
    id: 'space',
    name: 'Space',
    keywords: ['nasa', 'spacex', 'starship', 'rocket', 'artemis', 'telescope', 'mars', 'orbit'],
    feeds: [
      { title: 'NASA', url: 'https://www.nasa.gov/news-release/feed/' },
      { title: 'SpaceNews', url: 'https://spacenews.com/feed/' },
      { title: 'Ars Technica: Space', url: 'https://arstechnica.com/space/feed/' },
    ],
  },
  {
    id: 'design',
    name: 'Design',
    keywords: ['typography', 'ux', 'ui design', 'design system', 'figma', 'layout', 'branding'],
    feeds: [
      { title: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/' },
      { title: 'A List Apart', url: 'https://alistapart.com/main/feed/' },
    ],
  },
  {
    id: 'finance',
    name: 'Personal finance',
    keywords: ['index fund', 'budget', 'retirement', 'mortgage', 'savings', 'credit score', 'tax'],
    feeds: [
      { title: 'NerdWallet', url: 'https://www.nerdwallet.com/blog/feed/' },
      { title: 'Mr. Money Mustache', url: 'https://www.mrmoneymustache.com/feed/' },
    ],
  },
  {
    id: 'productivity',
    name: 'Productivity',
    keywords: ['productivity', 'habits', 'focus', 'note-taking', 'deep work', 'time management'],
    feeds: [
      { title: 'Zen Habits', url: 'https://zenhabits.net/feed/' },
      { title: 'Cal Newport', url: 'https://calnewport.com/feed/' },
    ],
  },
  {
    id: 'opensource',
    name: 'Open source',
    keywords: ['open source', 'linux', 'kernel', 'foss', 'maintainer', 'license', 'distro'],
    feeds: [
      { title: 'LWN.net', url: 'https://lwn.net/headlines/rss' },
      { title: "It's FOSS", url: 'https://itsfoss.com/feed/' },
    ],
  },
  {
    id: 'hardware',
    name: 'Hardware',
    keywords: ['gpu', 'cpu', 'chip', 'benchmark', 'motherboard', 'raspberry pi', 'fpga', 'ssd'],
    feeds: [
      { title: "Tom's Hardware", url: 'https://www.tomshardware.com/feeds/all' },
      { title: 'Hackaday', url: 'https://hackaday.com/blog/feed/' },
      { title: 'Phoronix', url: 'https://www.phoronix.com/rss.php' },
    ],
  },
  {
    id: 'creator',
    name: 'Creator economy',
    keywords: [
      'creator',
      'youtube',
      'tiktok',
      'monetization',
      'algorithm',
      'newsletter',
      'sponsor',
    ],
    feeds: [
      { title: 'Tubefilter', url: 'https://www.tubefilter.com/feed/' },
      { title: 'Social Media Today', url: 'https://www.socialmediatoday.com/feeds/news/' },
      { title: 'Passionfruit', url: 'https://www.passionfru.it/feed' },
    ],
  },
];

export const presetById = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id);

export const presetToNiche = (p: Preset): Niche => ({
  id: p.id,
  name: p.name,
  weight: 1,
  keywords: [...p.keywords],
});
