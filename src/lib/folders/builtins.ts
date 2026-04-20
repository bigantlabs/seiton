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

const BUILTIN_FOLDER_INDEX = new Map<string, string>();
for (const rule of BUILTIN_RULES) {
  for (const keyword of rule.keywords) {
    BUILTIN_FOLDER_INDEX.set(keyword.toLowerCase(), rule.folder);
  }
}

export type CustomRule = {
  readonly folder: string;
  readonly keywords: readonly string[];
};

function isWordChar(ch: string): boolean {
  return /[a-z0-9]/.test(ch);
}

function containsAsWord(text: string, keyword: string): boolean {
  if (!keyword) return false;
  let start = 0;
  while (start <= text.length) {
    const idx = text.indexOf(keyword, start);
    if (idx < 0) return false;
    const before = idx === 0 ? '' : text[idx - 1]!;
    const afterIdx = idx + keyword.length;
    const after = afterIdx >= text.length ? '' : text[afterIdx]!;
    const beforeOk = before === '' || !isWordChar(before);
    const afterOk = after === '' || !isWordChar(after);
    if (beforeOk && afterOk) return true;
    start = idx + 1;
  }
  return false;
}

export function classifyItem(
  name: string,
  uris: readonly string[],
  customRules: readonly CustomRule[],
  enabledCategories: readonly string[],
): string | null {
  const searchable = [
    name.toLowerCase(),
    ...uris.map((u) => u.toLowerCase()),
  ];

  for (const rule of customRules) {
    for (const keyword of rule.keywords) {
      const lower = keyword.toLowerCase();
      for (const text of searchable) {
        if (containsAsWord(text, lower)) return rule.folder;
      }
    }
  }

  const enabledSet = new Set(enabledCategories);

  for (const rule of BUILTIN_RULES) {
    if (!enabledSet.has(rule.folder)) continue;
    for (const keyword of rule.keywords) {
      const lower = keyword.toLowerCase();
      for (const text of searchable) {
        if (containsAsWord(text, lower)) return rule.folder;
      }
    }
  }

  return null;
}

export function builtinFolderForKeyword(keyword: string): string | undefined {
  return BUILTIN_FOLDER_INDEX.get(keyword.toLowerCase());
}
