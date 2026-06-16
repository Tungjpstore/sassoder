// Content_Scorer (Requirement 8 / Property 3). Pure + deterministic spam scoring
// on a 0–10 scale with contributing rule ids. No imports / no randomness so the
// determinism property can be tested directly.

export const CONTENT_SCORE_THRESHOLD = 5.0;

export type ContentScoreInput = {
  subject?: string | null;
  text?: string | null;
  html?: string | null;
};

export type ContentScoreResult = {
  score: number; // 0..10, one decimal
  rules: string[];
  needsReview: boolean;
};

const SPAM_PHRASES = [
  'free',
  'winner',
  'congratulations',
  'click here',
  'act now',
  'limited time',
  'guarantee',
  'risk-free',
  'cash bonus',
  'no cost',
  'viagra',
  'lottery',
  'urgent',
  'wire transfer',
  'bitcoin',
];

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function capsRatio(value: string): number {
  const letters = value.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return 0;
  const upper = value.replace(/[^A-Z]/g, '').length;
  return upper / letters.length;
}

/**
 * Deterministic content spam score in [0, 10]. Identical input always yields the
 * same score and rule set (R8.4 / Property 3).
 */
export function scoreContent(input: ContentScoreInput): ContentScoreResult {
  const subject = (input.subject ?? '').trim();
  const text = (input.text ?? '').trim();
  const html = input.html ?? '';
  const haystack = `${subject}\n${text}`.toLowerCase();

  let score = 0;
  const rules: string[] = [];

  // Spammy phrases.
  let phraseHits = 0;
  for (const phrase of SPAM_PHRASES) {
    phraseHits += countOccurrences(haystack, phrase);
  }
  if (phraseHits > 0) {
    score += Math.min(4, phraseHits);
    rules.push(`SPAM_PHRASES:${phraseHits}`);
  }

  // Excessive exclamation marks.
  const exclamations = countOccurrences(`${subject} ${text}`, '!');
  if (exclamations >= 3) {
    score += Math.min(2, exclamations - 2);
    rules.push(`EXCESS_EXCLAMATION:${exclamations}`);
  }

  // Shouting subject (high caps ratio).
  if (subject.length >= 8 && capsRatio(subject) > 0.6) {
    score += 1.5;
    rules.push('ALL_CAPS_SUBJECT');
  }

  // Missing subject.
  if (subject.length === 0) {
    score += 1;
    rules.push('MISSING_SUBJECT');
  }

  // Many links.
  const linkCount = countOccurrences(`${text} ${html}`.toLowerCase(), 'http');
  if (linkCount >= 5) {
    score += Math.min(2, linkCount - 4);
    rules.push(`MANY_LINKS:${linkCount}`);
  }

  // Image-only HTML body (no meaningful text).
  if (html.length > 0 && text.length < 20 && /<img/i.test(html)) {
    score += 1.5;
    rules.push('IMAGE_HEAVY_LOW_TEXT');
  }

  // Currency / money bait.
  if (/[$€£]\s?\d/.test(`${subject} ${text}`)) {
    score += 0.5;
    rules.push('MONEY_AMOUNT');
  }

  const clamped = Math.max(0, Math.min(10, score));
  // Round to one decimal deterministically.
  const finalScore = Math.round(clamped * 10) / 10;

  return {
    score: finalScore,
    rules,
    needsReview: finalScore >= CONTENT_SCORE_THRESHOLD,
  };
}
