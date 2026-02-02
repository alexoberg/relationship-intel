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
  { keyword: 'bot attack', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'bot traffic', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'bot detection', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'bot prevention', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'bot mitigation', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'anti-bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'antibot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'bot protection', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },

  // Scraping keywords (weight 4-5)
  { keyword: 'web scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'scraper', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'scrapers', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'scraping attack', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'content scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'data scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'price scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'anti-scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },

  // Crawler keywords (weight 4-5)
  { keyword: 'crawler', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'crawlers', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'web crawler', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'aggressive crawler', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ai crawler', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'llm crawler', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'gptbot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'claudebot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ccbot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },

  // Automation abuse (weight 4-5)
  { keyword: 'automation abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'automated attack', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'automated abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'headless browser', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'selenium', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'puppeteer', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'playwright abuse', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },

  // Ticket scalping (weight 5)
  { keyword: 'ticket scalping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ticket bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ticket bots', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'scalper bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'scalper bots', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'scalping bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'anti-scalping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ticket resale', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },

  // Sneaker bots (weight 5)
  { keyword: 'sneaker bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'sneaker bots', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'drop bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'limited release bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'hyped release', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement'] },

  // Rate limiting (weight 4)
  { keyword: 'rate limit', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'rate limiting', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'rate limiter', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'api abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'api scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },

  // CAPTCHA (weight 4)
  { keyword: 'captcha', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'recaptcha', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'hcaptcha', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'captcha bypass', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'captcha solver', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'captcha farm', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },

  // DDoS and traffic (weight 4)
  { keyword: 'ddos', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'traffic spike', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'traffic flood', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'layer 7 attack', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'application layer attack', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },

  // Competitors (weight 3)
  { keyword: 'cloudflare bot', category: 'competitor', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'akamai bot', category: 'competitor', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'imperva', category: 'competitor', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'datadome', category: 'competitor', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'perimeterx', category: 'competitor', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'kasada', category: 'competitor', weight: 3, helixProducts: ['captcha_replacement'] },

  // ============================================
  // VOICE CAPTCHA - Phone/voice verification
  // ============================================

  // Voice verification (weight 5)
  { keyword: 'voice verification', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'phone verification', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'call verification', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'voice authentication', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'voice biometric', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },

  // SMS/OTP abuse (weight 5)
  { keyword: 'sms verification', category: 'pain_signal', weight: 4, helixProducts: ['voice_captcha'] },
  { keyword: 'sms otp', category: 'pain_signal', weight: 4, helixProducts: ['voice_captcha'] },
  { keyword: 'otp bypass', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'sms pumping', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'sms toll fraud', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'smishing', category: 'pain_signal', weight: 4, helixProducts: ['voice_captcha'] },
  { keyword: 'sim swap', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'sim swapping', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },

  // Virtual numbers (weight 5)
  { keyword: 'virtual phone number', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'voip number', category: 'pain_signal', weight: 4, helixProducts: ['voice_captcha'] },
  { keyword: 'burner phone', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'disposable number', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'phone number abuse', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },

  // Competitors (weight 3)
  { keyword: 'twilio verify', category: 'competitor', weight: 3, helixProducts: ['voice_captcha'] },
  { keyword: 'authy', category: 'competitor', weight: 3, helixProducts: ['voice_captcha'] },

  // ============================================
  // AGE GATE - Age verification
  // ============================================

  // Age verification (weight 5)
  { keyword: 'age verification', category: 'pain_signal', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'age gate', category: 'pain_signal', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'age check', category: 'pain_signal', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'age restricted', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'age assurance', category: 'pain_signal', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'minor verification', category: 'pain_signal', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'underage', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },

  // Age-restricted industries (weight 4)
  { keyword: 'alcohol delivery', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'cannabis delivery', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'vape delivery', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'tobacco delivery', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'gambling verification', category: 'pain_signal', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'online gambling', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'sports betting', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'adult content', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },

  // Regulatory (weight 5)
  { keyword: 'coppa', category: 'regulatory', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'child safety', category: 'regulatory', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'kosa', category: 'regulatory', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'kids online safety', category: 'regulatory', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'age appropriate design', category: 'regulatory', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'uk age verification', category: 'regulatory', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'digital services act', category: 'regulatory', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'online safety bill', category: 'regulatory', weight: 5, helixProducts: ['age_verification'] },

  // Competitors (weight 3)
  { keyword: 'yoti', category: 'competitor', weight: 3, helixProducts: ['age_verification'] },
  { keyword: 'veriff', category: 'competitor', weight: 3, helixProducts: ['age_verification'] },
  { keyword: 'onfido', category: 'competitor', weight: 3, helixProducts: ['age_verification'] },
  { keyword: 'jumio', category: 'competitor', weight: 3, helixProducts: ['age_verification'] },

  // ============================================
  // FRAUD / FAKE ACCOUNTS (All products)
  // ============================================

  // Fake accounts (weight 5)
  { keyword: 'fake account', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'fake accounts', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'fake user', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'fake users', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'bot account', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'bot accounts', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'spam account', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'spam accounts', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },

  // Account fraud (weight 5)
  { keyword: 'account fraud', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'account takeover', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'ato attack', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'credential stuffing', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'credential abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'brute force', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'password spray', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },

  // Signup abuse (weight 5)
  { keyword: 'signup abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'signup fraud', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'registration abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'registration fraud', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'fake signup', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'fake registration', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'promo abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'referral abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'coupon abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },

  // Identity fraud (weight 5)
  { keyword: 'identity fraud', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha', 'age_verification'] },
  { keyword: 'identity verification', category: 'pain_signal', weight: 4, helixProducts: ['voice_captcha', 'age_verification'] },
  { keyword: 'synthetic identity', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha', 'age_verification'] },
  { keyword: 'identity theft', category: 'pain_signal', weight: 4, helixProducts: ['voice_captcha', 'age_verification'] },
  { keyword: 'kyc', category: 'pain_signal', weight: 3, helixProducts: ['voice_captcha', 'age_verification'] },
  { keyword: 'know your customer', category: 'pain_signal', weight: 3, helixProducts: ['voice_captcha', 'age_verification'] },

  // Payment fraud (weight 4)
  { keyword: 'payment fraud', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'card fraud', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'carding', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'card testing', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'bin attack', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'chargeback fraud', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },

  // ============================================
  // PLATFORM ABUSE (Bot Sorter + Voice Captcha)
  // ============================================

  // Social media abuse (weight 4)
  { keyword: 'social media bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'twitter bot', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'instagram bot', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'tiktok bot', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'follower bot', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'like bot', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'engagement bot', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'fake engagement', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'fake followers', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'fake likes', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },

  // Gaming abuse (weight 4)
  { keyword: 'game bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'gaming bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'cheating bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'aimbot', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'gold farming', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'rmt bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'game hack', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },

  // Review/content abuse (weight 4)
  { keyword: 'fake review', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'fake reviews', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'review fraud', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'review manipulation', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'astroturfing', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'content spam', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'comment spam', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },

  // Marketplace abuse (weight 4)
  { keyword: 'marketplace fraud', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'listing fraud', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'fake listing', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'fake seller', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'shill bidding', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },

  // ============================================
  // GENERAL SECURITY SIGNALS
  // ============================================

  // Trust & Safety (weight 4)
  { keyword: 'trust and safety', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement', 'voice_captcha', 'age_verification'] },
  { keyword: 'trust & safety', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement', 'voice_captcha', 'age_verification'] },
  { keyword: 'platform integrity', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'content moderation', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'abuse prevention', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement', 'voice_captcha', 'age_verification'] },
  { keyword: 'fraud prevention', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement', 'voice_captcha', 'age_verification'] },
  { keyword: 'fraud detection', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement', 'voice_captcha', 'age_verification'] },

  // Fingerprinting (weight 4)
  { keyword: 'device fingerprint', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'browser fingerprint', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'fingerprint spoofing', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'anti-fingerprint', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },

  // Proxy/VPN abuse (weight 4)
  { keyword: 'proxy abuse', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'vpn abuse', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'residential proxy', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'datacenter proxy', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'proxy detection', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },

  // AI-related abuse (weight 5) - NEW and very relevant
  { keyword: 'ai bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ai bots', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'llm abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'chatgpt abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ai spam', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ai generated spam', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ai scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'training data', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'model training', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'deepfake', category: 'pain_signal', weight: 4, helixProducts: ['voice_captcha'] },
  { keyword: 'voice clone', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'voice cloning', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
];

export default LISTENER_KEYWORDS;
