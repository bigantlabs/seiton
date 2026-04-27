export type BuiltinRule = {
  readonly folder: string;
  readonly keywords: readonly string[];
};

export const BUILTIN_RULES: readonly BuiltinRule[] = [
  {
    folder: 'Banking & Finance',
    keywords: [
      'bank', 'chase', 'wells fargo', 'citibank', 'capital one',
      'paypal', 'venmo', 'stripe', 'square', 'fidelity',
      'vanguard', 'schwab', 'robinhood', 'coinbase', 'binance',
      'credit union', 'mortgage', 'invest', 'trading',
      'finance', 'banking', 'visa', 'mastercard', 'amex',
    ],
  },
  {
    folder: 'Email',
    keywords: [
      'gmail', 'outlook', 'yahoo mail', 'protonmail', 'proton mail',
      'fastmail', 'zoho mail', 'icloud', 'mail.com', 'tutanota',
      'hey.com', 'email', 'hotmail', 'aol',
    ],
  },
  {
    folder: 'Social',
    keywords: [
      'facebook', 'twitter', 'instagram', 'linkedin', 'tiktok',
      'snapchat', 'reddit', 'pinterest', 'tumblr', 'mastodon',
      'discord', 'slack', 'threads', 'bluesky', 'whatsapp',
      'telegram', 'signal', 'messenger',
    ],
  },
  {
    folder: 'Shopping',
    keywords: [
      'amazon', 'ebay', 'etsy', 'walmart', 'target', 'bestbuy',
      'best buy', 'costco', 'ikea', 'wayfair', 'shopify', 'aliexpress',
      'newegg', 'store', 'marketplace',
    ],
  },
  {
    folder: 'Development',
    keywords: [
      'github', 'gitlab', 'bitbucket', 'stackoverflow', 'stack overflow',
      'npm', 'docker', 'azure', 'gcloud', 'heroku', 'vercel',
      'netlify', 'digitalocean', 'cloudflare', 'jira', 'confluence',
      'sentry', 'datadog', 'pagerduty', 'circleci', 'travisci',
      'jenkins', 'terraform', 'ansible',
    ],
  },
  {
    folder: 'Entertainment',
    keywords: [
      'netflix', 'hulu', 'disney', 'spotify', 'apple music',
      'youtube', 'twitch', 'steam', 'playstation', 'xbox',
      'nintendo', 'hbo', 'paramount', 'peacock', 'crunchyroll',
      'audible', 'kindle',
    ],
  },
  {
    folder: 'Utilities',
    keywords: [
      'electric', 'water', 'internet', 'phone', 'mobile',
      'comcast', 'xfinity', 'verizon', 'at&t', 't-mobile',
      'sprint', 'spectrum', 'cox', 'utility',
    ],
  },
  {
    folder: 'Government & ID',
    keywords: [
      'irs', 'ssa', 'dmv', 'passport', 'immigration',
      'medicare', 'medicaid', 'government',
      '.gov', 'social security', 'voter', 'license',
    ],
  },
  {
    folder: 'Health',
    keywords: [
      'health', 'medical', 'hospital', 'clinic', 'pharmacy',
      'doctor', 'dental', 'vision', 'insurance', 'patient portal',
      'mychart', 'kaiser', 'aetna', 'cigna', 'unitedhealth',
      'blue cross', 'anthem', 'fitbit', 'myfitnesspal',
    ],
  },
];

export const BUILTIN_FOLDER_INDEX = new Map<string, string>();
for (const rule of BUILTIN_RULES) {
  for (const keyword of rule.keywords) {
    BUILTIN_FOLDER_INDEX.set(keyword.toLowerCase(), rule.folder);
  }
}

export {
  classifyItem,
  builtinFolderForKeyword,
  type CustomRuleEntry,
  type ClassifyResult,
} from './classify.js';
