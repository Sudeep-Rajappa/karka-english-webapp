import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

// ── AI proxy helper ──
async function chatCompletion<T>(systemPrompt: string, userPrompt: string, context: string): Promise<T> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, userPrompt }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `API error (${context})`);
  }

  const data = await response.json();
  const text = data.content;

  if (!text?.trim()) {
    throw new Error(`Empty response (${context}). Please try again.`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid response (${context}): ${text.slice(0, 120)}…`);
  }
}

// ── Types ──
export interface WordMeaning {
  word: string;
  meaning: string;
  kannadaTranslation: string;
  pronunciation: string;
  exampleSentences: string[];
}

export interface GrammarCorrection {
  original: string;
  corrected: string;
  explanation: string;
  errorsFound: string[];
}

export interface TranslationResult {
  original: string;
  translated: string;
  explanation: string;
  grammarPoints: string[];
}

// ── Cache helpers ──
function wordCacheKey(word: string): string {
  return word.toLowerCase().trim().replace(/[^a-z0-9]/g, "_");
}

async function getCachedWord(word: string): Promise<WordMeaning | null> {
  try {
    const ref = doc(db, "wordCache", wordCacheKey(word));
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as WordMeaning;
    }
  } catch (err) {
    console.warn("Cache read failed, falling back to AI:", err);
  }
  return null;
}

async function cacheWord(word: string, data: WordMeaning): Promise<void> {
  try {
    const ref = doc(db, "wordCache", wordCacheKey(word));
    await setDoc(ref, { ...data, cachedAt: new Date().toISOString() });
  } catch (err) {
    console.warn("Cache write failed (non-blocking):", err);
  }
}

// ── Word Meaning: cache-first, AI fallback ──
export const getWordMeaning = async (word: string): Promise<WordMeaning> => {
  // 1. Check cache
  const cached = await getCachedWord(word);
  if (cached) {
    console.log(`Cache hit: "${word}"`);
    return cached;
  }

  // 2. Cache miss → call AI
  console.log(`Cache miss: "${word}" → calling AI`);
  const systemPrompt = `You are a language learning assistant for Kannada medium students learning English. 
Always respond with valid JSON matching this exact schema:
{
  "word": string,
  "meaning": string (English meaning),
  "kannadaTranslation": string (Kannada translation),
  "pronunciation": string (pronunciation in Kannada script),
  "exampleSentences": string[] (3 example sentences)
}`;

  const userPrompt = `Provide the meaning of the English word "${word}" for a Kannada medium student. Include the English meaning, Kannada translation, pronunciation (in Kannada script), and 3 example sentences.`;

  const result = await chatCompletion<WordMeaning>(systemPrompt, userPrompt, "word meaning");

  // 3. Save to cache (fire-and-forget)
  cacheWord(word, result);

  return result;
};

// ── Translation (no cache — inputs are too varied) ──
export const translateKannadaToEnglish = async (text: string): Promise<TranslationResult> => {
  const systemPrompt = `You are a Kannada to English translation assistant.
Always respond with valid JSON matching this exact schema:
{
  "original": string,
  "translated": string,
  "explanation": string,
  "grammarPoints": string[]
}`;

  const userPrompt = `Translate the following Kannada text (which might be in Kannada script or transliterated English script) into English: "${text}". Provide the English translation, a detailed explanation of the sentence structure and grammar in simple English and Kannada, and a list of key grammar points or vocabulary used.`;

  return chatCompletion<TranslationResult>(systemPrompt, userPrompt, "translation");
};

// ── Bidirectional translation (for voice assistant) ──
export const translateBidirectional = async (text: string): Promise<TranslationResult> => {
  const systemPrompt = `You are a bidirectional Kannada-English translation assistant.
Always respond with valid JSON matching this exact schema:
{
  "original": string,
  "translated": string,
  "explanation": string,
  "grammarPoints": string[]
}`;

  const userPrompt = `Detect the language (Kannada or English) and translate the following text to the other language: "${text}". If it's Kannada (script or transliterated), translate to English. If it's English, translate to Kannada. Provide the translation, a detailed explanation in both languages, and key grammar points.`;

  return chatCompletion<TranslationResult>(systemPrompt, userPrompt, "bidirectional translation");
};

// ── Grammar check (no cache — inputs are too varied) ──
export const checkGrammar = async (text: string): Promise<GrammarCorrection> => {
  const systemPrompt = `You are an English grammar checker for Kannada medium students.
Always respond with valid JSON matching this exact schema:
{
  "original": string,
  "corrected": string,
  "explanation": string,
  "errorsFound": string[]
}`;

  const userPrompt = `Check the grammar of the following English sentence: "${text}". Provide the corrected sentence, an explanation of the errors in simple English and Kannada, and a list of specific errors found (e.g., word order, subject-verb agreement, capitalization, spelling, punctuation).`;

  return chatCompletion<GrammarCorrection>(systemPrompt, userPrompt, "grammar");
};
