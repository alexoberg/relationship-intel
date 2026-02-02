// ============================================
// LISTENER KEYWORDS SEED DATA
// ============================================
// Comprehensive keywords for discovering Helix prospects
// Categories: pain_signal, regulatory, cost, competitor

import { HelixProduct } from '@/lib/helix-sales';

type KeywordCategory = 'pain_signal' | 'regulatory' | 'cost' | 'competitor';

interface KeywordSeed {
  keyword: string;
  category: KeywordCategory;
  weight: number; // 1-5, higher = more important
  helixProducts: HelixProduct[];
}

export const LISTENER_KEYWORDS: KeywordSeed[] = [
  // ============================================
  // BOT SORTER - Anti-bot, scraping, automation
  // ============================================

  // High-signal bot keywords (weight 5)
  { keyword: 'bot attack', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'bot traffic', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'bot detection', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'bot prevention', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'bot mitigation', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'anti-bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'antibot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'bot protection', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },

  // Scraping keywords (weight 4-5)
  { keyword: 'web scraping', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'scraper', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'scrapers', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'scraping attack', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'content scraping', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'data scraping', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'price scraping', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'anti-scraping', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },

  // Crawler keywords (weight 4-5)
  { keyword: 'crawler', category: 'pain_signal', weight: 3, helixProducts: ['Bot Sorter'] },
  { keyword: 'crawlers', category: 'pain_signal', weight: 3, helixProducts: ['Bot Sorter'] },
  { keyword: 'web crawler', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'aggressive crawler', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'ai crawler', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'llm crawler', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'gptbot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'claudebot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'ccbot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },

  // Automation abuse (weight 4-5)
  { keyword: 'automation abuse', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'automated attack', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'automated abuse', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'headless browser', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'selenium', category: 'pain_signal', weight: 3, helixProducts: ['Bot Sorter'] },
  { keyword: 'puppeteer', category: 'pain_signal', weight: 3, helixProducts: ['Bot Sorter'] },
  { keyword: 'playwright abuse', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },

  // Ticket scalping (weight 5)
  { keyword: 'ticket scalping', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'ticket bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'ticket bots', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'scalper bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'scalper bots', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'scalping bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'anti-scalping', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'ticket resale', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },

  // Sneaker bots (weight 5)
  { keyword: 'sneaker bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'sneaker bots', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'drop bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'limited release bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'hyped release', category: 'pain_signal', weight: 3, helixProducts: ['Bot Sorter'] },

  // Rate limiting (weight 4)
  { keyword: 'rate limit', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'rate limiting', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'rate limiter', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'api abuse', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'api scraping', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },

  // CAPTCHA (weight 4)
  { keyword: 'captcha', category: 'pain_signal', weight: 3, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'recaptcha', category: 'pain_signal', weight: 3, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'hcaptcha', category: 'pain_signal', weight: 3, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'captcha bypass', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'captcha solver', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'captcha farm', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },

  // DDoS and traffic (weight 4)
  { keyword: 'ddos', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'traffic spike', category: 'pain_signal', weight: 3, helixProducts: ['Bot Sorter'] },
  { keyword: 'traffic flood', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'layer 7 attack', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'application layer attack', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },

  // Competitors (weight 3)
  { keyword: 'cloudflare bot', category: 'competitor', weight: 3, helixProducts: ['Bot Sorter'] },
  { keyword: 'akamai bot', category: 'competitor', weight: 3, helixProducts: ['Bot Sorter'] },
  { keyword: 'imperva', category: 'competitor', weight: 3, helixProducts: ['Bot Sorter'] },
  { keyword: 'datadome', category: 'competitor', weight: 3, helixProducts: ['Bot Sorter'] },
  { keyword: 'perimeterx', category: 'competitor', weight: 3, helixProducts: ['Bot Sorter'] },
  { keyword: 'kasada', category: 'competitor', weight: 3, helixProducts: ['Bot Sorter'] },

  // ============================================
  // VOICE CAPTCHA - Phone/voice verification
  // ============================================

  // Voice verification (weight 5)
  { keyword: 'voice verification', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
  { keyword: 'phone verification', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
  { keyword: 'call verification', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
  { keyword: 'voice authentication', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
  { keyword: 'voice biometric', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },

  // SMS/OTP abuse (weight 5)
  { keyword: 'sms verification', category: 'pain_signal', weight: 4, helixProducts: ['Voice Captcha'] },
  { keyword: 'sms otp', category: 'pain_signal', weight: 4, helixProducts: ['Voice Captcha'] },
  { keyword: 'otp bypass', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
  { keyword: 'sms pumping', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
  { keyword: 'sms toll fraud', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
  { keyword: 'smishing', category: 'pain_signal', weight: 4, helixProducts: ['Voice Captcha'] },
  { keyword: 'sim swap', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
  { keyword: 'sim swapping', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },

  // Virtual numbers (weight 5)
  { keyword: 'virtual phone number', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
  { keyword: 'voip number', category: 'pain_signal', weight: 4, helixProducts: ['Voice Captcha'] },
  { keyword: 'burner phone', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
  { keyword: 'disposable number', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
  { keyword: 'phone number abuse', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },

  // Competitors (weight 3)
  { keyword: 'twilio verify', category: 'competitor', weight: 3, helixProducts: ['Voice Captcha'] },
  { keyword: 'authy', category: 'competitor', weight: 3, helixProducts: ['Voice Captcha'] },

  // ============================================
  // AGE GATE - Age verification
  // ============================================

  // Age verification (weight 5)
  { keyword: 'age verification', category: 'pain_signal', weight: 5, helixProducts: ['Age Gate'] },
  { keyword: 'age gate', category: 'pain_signal', weight: 5, helixProducts: ['Age Gate'] },
  { keyword: 'age check', category: 'pain_signal', weight: 5, helixProducts: ['Age Gate'] },
  { keyword: 'age restricted', category: 'pain_signal', weight: 4, helixProducts: ['Age Gate'] },
  { keyword: 'age assurance', category: 'pain_signal', weight: 5, helixProducts: ['Age Gate'] },
  { keyword: 'minor verification', category: 'pain_signal', weight: 5, helixProducts: ['Age Gate'] },
  { keyword: 'underage', category: 'pain_signal', weight: 4, helixProducts: ['Age Gate'] },

  // Age-restricted industries (weight 4)
  { keyword: 'alcohol delivery', category: 'pain_signal', weight: 4, helixProducts: ['Age Gate'] },
  { keyword: 'cannabis delivery', category: 'pain_signal', weight: 4, helixProducts: ['Age Gate'] },
  { keyword: 'vape delivery', category: 'pain_signal', weight: 4, helixProducts: ['Age Gate'] },
  { keyword: 'tobacco delivery', category: 'pain_signal', weight: 4, helixProducts: ['Age Gate'] },
  { keyword: 'gambling verification', category: 'pain_signal', weight: 5, helixProducts: ['Age Gate'] },
  { keyword: 'online gambling', category: 'pain_signal', weight: 4, helixProducts: ['Age Gate'] },
  { keyword: 'sports betting', category: 'pain_signal', weight: 4, helixProducts: ['Age Gate'] },
  { keyword: 'adult content', category: 'pain_signal', weight: 4, helixProducts: ['Age Gate'] },

  // Regulatory (weight 5)
  { keyword: 'coppa', category: 'regulatory', weight: 5, helixProducts: ['Age Gate'] },
  { keyword: 'child safety', category: 'regulatory', weight: 5, helixProducts: ['Age Gate'] },
  { keyword: 'kosa', category: 'regulatory', weight: 5, helixProducts: ['Age Gate'] },
  { keyword: 'kids online safety', category: 'regulatory', weight: 5, helixProducts: ['Age Gate'] },
  { keyword: 'age appropriate design', category: 'regulatory', weight: 5, helixProducts: ['Age Gate'] },
  { keyword: 'uk age verification', category: 'regulatory', weight: 5, helixProducts: ['Age Gate'] },
  { keyword: 'digital services act', category: 'regulatory', weight: 4, helixProducts: ['Age Gate'] },
  { keyword: 'online safety bill', category: 'regulatory', weight: 5, helixProducts: ['Age Gate'] },

  // Competitors (weight 3)
  { keyword: 'yoti', category: 'competitor', weight: 3, helixProducts: ['Age Gate'] },
  { keyword: 'veriff', category: 'competitor', weight: 3, helixProducts: ['Age Gate'] },
  { keyword: 'onfido', category: 'competitor', weight: 3, helixProducts: ['Age Gate'] },
  { keyword: 'jumio', category: 'competitor', weight: 3, helixProducts: ['Age Gate'] },

  // ============================================
  // FRAUD / FAKE ACCOUNTS (All products)
  // ============================================

  // Fake accounts (weight 5)
  { keyword: 'fake account', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'fake accounts', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'fake user', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'fake users', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'bot account', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'bot accounts', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'spam account', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'spam accounts', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },

  // Account fraud (weight 5)
  { keyword: 'account fraud', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'account takeover', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'ato attack', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'credential stuffing', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'credential abuse', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'brute force', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'password spray', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },

  // Signup abuse (weight 5)
  { keyword: 'signup abuse', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'signup fraud', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'registration abuse', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'registration fraud', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'fake signup', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'fake registration', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'promo abuse', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'referral abuse', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'coupon abuse', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },

  // Identity fraud (weight 5)
  { keyword: 'identity fraud', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha', 'Age Gate'] },
  { keyword: 'identity verification', category: 'pain_signal', weight: 4, helixProducts: ['Voice Captcha', 'Age Gate'] },
  { keyword: 'synthetic identity', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha', 'Age Gate'] },
  { keyword: 'identity theft', category: 'pain_signal', weight: 4, helixProducts: ['Voice Captcha', 'Age Gate'] },
  { keyword: 'kyc', category: 'pain_signal', weight: 3, helixProducts: ['Voice Captcha', 'Age Gate'] },
  { keyword: 'know your customer', category: 'pain_signal', weight: 3, helixProducts: ['Voice Captcha', 'Age Gate'] },

  // Payment fraud (weight 4)
  { keyword: 'payment fraud', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'card fraud', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'carding', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'card testing', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'bin attack', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'chargeback fraud', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },

  // ============================================
  // PLATFORM ABUSE (Bot Sorter + Voice Captcha)
  // ============================================

  // Social media abuse (weight 4)
  { keyword: 'social media bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'twitter bot', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'instagram bot', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'tiktok bot', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'follower bot', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'like bot', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'engagement bot', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'fake engagement', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'fake followers', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'fake likes', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },

  // Gaming abuse (weight 4)
  { keyword: 'game bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'gaming bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'cheating bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'aimbot', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'gold farming', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'rmt bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'game hack', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },

  // Review/content abuse (weight 4)
  { keyword: 'fake review', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'fake reviews', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'review fraud', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'review manipulation', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'astroturfing', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'content spam', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'comment spam', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },

  // Marketplace abuse (weight 4)
  { keyword: 'marketplace fraud', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'listing fraud', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'fake listing', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'fake seller', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'shill bidding', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },

  // ============================================
  // GENERAL SECURITY SIGNALS
  // ============================================

  // Trust & Safety (weight 4)
  { keyword: 'trust and safety', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter', 'Voice Captcha', 'Age Gate'] },
  { keyword: 'trust & safety', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter', 'Voice Captcha', 'Age Gate'] },
  { keyword: 'platform integrity', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'content moderation', category: 'pain_signal', weight: 3, helixProducts: ['Bot Sorter', 'Voice Captcha'] },
  { keyword: 'abuse prevention', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter', 'Voice Captcha', 'Age Gate'] },
  { keyword: 'fraud prevention', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter', 'Voice Captcha', 'Age Gate'] },
  { keyword: 'fraud detection', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter', 'Voice Captcha', 'Age Gate'] },

  // Fingerprinting (weight 4)
  { keyword: 'device fingerprint', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'browser fingerprint', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'fingerprint spoofing', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'anti-fingerprint', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },

  // Proxy/VPN abuse (weight 4)
  { keyword: 'proxy abuse', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'vpn abuse', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'residential proxy', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'datacenter proxy', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },
  { keyword: 'proxy detection', category: 'pain_signal', weight: 4, helixProducts: ['Bot Sorter'] },

  // AI-related abuse (weight 5) - NEW and very relevant
  { keyword: 'ai bot', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'ai bots', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'llm abuse', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'chatgpt abuse', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'ai spam', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'ai generated spam', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'ai scraping', category: 'pain_signal', weight: 5, helixProducts: ['Bot Sorter'] },
  { keyword: 'training data', category: 'pain_signal', weight: 3, helixProducts: ['Bot Sorter'] },
  { keyword: 'model training', category: 'pain_signal', weight: 3, helixProducts: ['Bot Sorter'] },
  { keyword: 'deepfake', category: 'pain_signal', weight: 4, helixProducts: ['Voice Captcha'] },
  { keyword: 'voice clone', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
  { keyword: 'voice cloning', category: 'pain_signal', weight: 5, helixProducts: ['Voice Captcha'] },
];

export default LISTENER_KEYWORDS;
