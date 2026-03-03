import { DictionaryEntry } from '../types';

const BATCH_SIZE = 1200;
const CHUNK_SIZE = 256 * 1024;
const PREVIEW_BYTES = 8192;
const PREVIEW_LINES = 80;
const PREVIEW_ROWS = 5;

const CSV_SPLITTER = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
const POS_BASE = [
  'n', 'v', 'vt', 'vi', 'adj', 'adv', 'prep', 'pron', 'num', 'art', 'conj', 'int', 'interj',
  'aux', 'modal', 'abbr', 'phr', 'phrase', 'pl', 'det', 'excl'
] as const;
const POS_BASE_SET = new Set<string>(POS_BASE);
const HEADWORD_TOKEN_REGEX = /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF0-9\uAC00-\uD7AF][A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF0-9\uAC00-\uD7AF.'’/-]*$/;
const CJK_CHAR_REGEX = /[\u3400-\u9FFF]/;
const EMBEDDED_ENTRY_REGEX = /^(.*?)[;\uFF1B]\s*([A-Za-z\u00C0-\u00FF0-9][A-Za-z\u00C0-\u00FF0-9.'’/-]*(?:\s+[A-Za-z\u00C0-\u00FF0-9.'’/-]+){0,4})\s*,\s*"?(.+)$/;

interface ParserState {
  currentWord: string;
  currentMeanings: string[];
  pendingHeadword: string;
}

const createState = (): ParserState => ({
  currentWord: '',
  currentMeanings: [],
  pendingHeadword: '',
});

const normalizeToken = (value: string): string => String(value || '').trim();
const normalizeMeaning = (value: string): string =>
  normalizeToken(value)
    .replace(/^[,;\uFF0C\uFF1B]+|[,;\uFF0C\uFF1B]+$/g, '')
    .replace(/^["'\u201C\u201D\u2018\u2019]+|["'\u201C\u201D\u2018\u2019]+$/g, '')
    .trim();
const unquote = (value: string): string => normalizeToken(value).replace(/^"|"$/g, '');

const normalizePosSegment = (token: string): string =>
  normalizeToken(token)
    .replace(/^[([{<]+/, '')
    .replace(/[)\]}>]+$/g, '')
    .replace(/[\uFF0C\uFF1B;,:\uFF1A]+$/g, '')
    .replace(/\.+$/g, '')
    .toLowerCase();

const isPosSegment = (segment: string): boolean => {
  const normalized = normalizePosSegment(segment);
  if (!normalized) return false;
  if (POS_BASE_SET.has(normalized)) return true;
  const root = normalized.split('.')[0];
  return POS_BASE_SET.has(root);
};

const isPosToken = (token: string): boolean => {
  const normalized = normalizeToken(token);
  if (!normalized) return false;
  const clean = normalized.replace(/[\uFF0C\uFF1B;,]+$/g, '');
  const segments = clean.split('/').map((part) => part.trim()).filter(Boolean);
  return segments.length > 0 && segments.every((segment) => isPosSegment(segment));
};

const isHeadwordToken = (token: string): boolean => {
  const normalized = normalizeToken(token).replace(/^[("'\u201C\u201D\u2018\u2019]+|[)"'\u201C\u201D\u2018\u2019,;\uFF0C\uFF1B]+$/g, '');
  return Boolean(normalized) && HEADWORD_TOKEN_REGEX.test(normalized) && !isPosToken(normalized);
};

const isHeadwordPhrase = (value: string): boolean => {
  const normalized = normalizeToken(value);
  if (!normalized) return false;
  const parts = normalized.split(/\s+/).filter(Boolean);
  return parts.length > 0 && parts.every((part) => isHeadwordToken(part));
};

const splitAtFirstComma = (line: string): [string, string] | null => {
  const index = line.indexOf(',');
  if (index <= 0) return null;
  return [line.slice(0, index), line.slice(index + 1)];
};

const parseLeadingPosToken = (value: string): string | null => {
  const normalized = normalizeToken(value).replace(/^"+/, '');
  if (!normalized) return null;
  const first = normalized.split(/\s+/)[0] || '';
  return isPosToken(first) ? first : null;
};

const splitEmbeddedEntry = (translation: string): { currentMeaning: string; nextWord: string; nextTranslation: string } | null => {
  const normalized = normalizeToken(translation);
  if (!normalized) return null;

  const match = normalized.match(EMBEDDED_ENTRY_REGEX);
  if (!match) return null;

  const before = normalizeMeaning(match[1]);
  const nextWord = normalizeToken(match[2]);
  const remainderRaw = normalizeToken(match[3]).replace(/^"+/, '');
  const leadingPos = parseLeadingPosToken(remainderRaw);
  if (!isHeadwordPhrase(nextWord) || !leadingPos) return null;

  return {
    currentMeaning: before,
    nextWord,
    nextTranslation: remainderRaw.replace(/"$/g, ''),
  };
};

const findPosIndex = (tokens: string[]): number => {
  for (let i = 0; i < tokens.length; i += 1) {
    if (isPosToken(tokens[i])) return i;
  }
  return -1;
};

const findCjkBoundaryIndex = (tokens: string[]): number => {
  for (let i = 1; i < tokens.length; i += 1) {
    if (!CJK_CHAR_REGEX.test(tokens[i])) continue;
    const candidate = tokens.slice(0, i).join(' ');
    if (isHeadwordPhrase(candidate)) return i;
  }
  return -1;
};

const appendMeaning = (state: ParserState, meaning: string): void => {
  const normalized = normalizeMeaning(meaning);
  if (!normalized) return;
  const key = normalized.toLowerCase();
  if (!state.currentMeanings.some((existing) => existing.toLowerCase() === key)) {
    state.currentMeanings.push(normalized);
  }
};

const flushEntry = (state: ParserState, onEntry: (entry: Partial<DictionaryEntry>) => void): void => {
  if (!state.currentWord || state.currentMeanings.length === 0) return;
  onEntry({ word: state.currentWord, translation: state.currentMeanings.join('；'), metadata: {} });
  state.currentWord = '';
  state.currentMeanings = [];
};

const startEntry = (state: ParserState, word: string, initialMeaning: string, onEntry: (entry: Partial<DictionaryEntry>) => void): void => {
  const nextWord = normalizeToken(word);
  if (!nextWord) return;

  if (state.currentWord && state.currentWord.toLowerCase() !== nextWord.toLowerCase()) {
    flushEntry(state, onEntry);
  }

  if (!state.currentWord) {
    state.currentWord = nextWord;
    state.currentMeanings = [];
  }

  if (initialMeaning) {
    appendMeaning(state, initialMeaning);
  }

  state.pendingHeadword = '';
};

const handlePosLine = (state: ParserState, line: string, onEntry: (entry: Partial<DictionaryEntry>) => void): void => {
  const headword = state.pendingHeadword || state.currentWord;
  if (!headword) return;

  if (!state.currentWord || state.currentWord.toLowerCase() !== headword.toLowerCase()) {
    if (state.currentWord) flushEntry(state, onEntry);
    state.currentWord = headword;
    state.currentMeanings = [];
  }

  appendMeaning(state, line);
  state.pendingHeadword = '';
};

const parseStructured = (state: ParserState, rawWord: string, rawTranslation: string, onEntry: (entry: Partial<DictionaryEntry>) => void): void => {
  let word = unquote(rawWord);
  let translation = unquote(rawTranslation);

  if (!word && !translation) return;

  if (isPosToken(word)) {
    handlePosLine(state, word + (translation ? ` ${translation}` : ''), onEntry);
    return;
  }

  if (!word) return;

  while (word) {
    const embedded = splitEmbeddedEntry(translation);
    if (!embedded) {
      startEntry(state, word, translation, onEntry);
      return;
    }

    startEntry(state, word, embedded.currentMeaning, onEntry);
    word = embedded.nextWord;
    translation = embedded.nextTranslation;
  }
};

const processLine = (state: ParserState, line: string, onEntry: (entry: Partial<DictionaryEntry>) => void): void => {
  if (typeof line !== 'string') return;
  const trimmed = normalizeToken(line);
  if (!trimmed) return;

  if (trimmed.includes('\t')) {
    const parts = trimmed.split('\t');
    if (parts.length >= 2) {
      parseStructured(state, parts[0], parts.slice(1).join('\t'), onEntry);
    }
    return;
  }

  if (trimmed.includes(',')) {
    const parts = trimmed.split(CSV_SPLITTER);
    if (parts.length >= 2) {
      const firstField = unquote(parts[0]);
      if (isHeadwordPhrase(firstField)) {
        parseStructured(state, parts[0], parts.slice(1).join(','), onEntry);
        return;
      }
    }

    const fallback = splitAtFirstComma(trimmed);
    if (fallback) {
      parseStructured(state, fallback[0], fallback[1], onEntry);
      return;
    }
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return;

  if (isPosToken(tokens[0])) {
    handlePosLine(state, tokens.join(' '), onEntry);
    return;
  }

  const posIndex = findPosIndex(tokens);
  if (posIndex > 0) {
    const headword = tokens.slice(0, posIndex).join(' ');
    if (isHeadwordPhrase(headword)) {
      startEntry(state, headword, tokens.slice(posIndex).join(' '), onEntry);
      return;
    }
  }

  if (tokens.length === 1) {
    const token = tokens[0];
    if (isHeadwordToken(token)) {
      if (state.currentWord && state.currentWord.toLowerCase() !== token.toLowerCase()) {
        flushEntry(state, onEntry);
      }
      state.pendingHeadword = token;
      return;
    }

    if (state.currentWord) {
      appendMeaning(state, token);
    }
    return;
  }

  const cjkBoundary = findCjkBoundaryIndex(tokens);
  if (cjkBoundary > 0) {
    const headword = tokens.slice(0, cjkBoundary).join(' ');
    startEntry(state, headword, tokens.slice(cjkBoundary).join(' '), onEntry);
    return;
  }

  const first = tokens[0];
  const rest = tokens.slice(1).join(' ');

  if (isHeadwordToken(first)) {
    startEntry(state, first, rest, onEntry);
    return;
  }

  if (state.pendingHeadword) {
    startEntry(state, state.pendingHeadword, tokens.join(' '), onEntry);
    return;
  }

  if (state.currentWord) {
    appendMeaning(state, tokens.join(' '));
  }
};

const splitLines = (text: string): string[] => text.split(/\r\n|\n|\r/);

export const createDictionaryStreamParser = (
  onProgress: (count: number) => void,
  onBatch: (entries: Partial<DictionaryEntry>[]) => Promise<void>
) => {
  const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
  const state = createState();
  const queue: Partial<DictionaryEntry>[][] = [];
  let leftover = '';
  let currentBatch: Partial<DictionaryEntry>[] = [];
  let total = 0;
  let draining = false;
  let ended = false;
  let resolveEnd: ((value: { total: number; bloomBuffer: ArrayBuffer }) => void) | null = null;
  let rejectEnd: ((reason?: unknown) => void) | null = null;

  const maybeDone = () => {
    if (!ended || draining || queue.length > 0 || currentBatch.length > 0 || !resolveEnd) return;
    const resolve = resolveEnd;
    resolveEnd = null;
    rejectEnd = null;
    resolve({ total, bloomBuffer: new ArrayBuffer(0) });
  };

  const drainQueue = async () => {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        const batch = queue.shift()!;
        await onBatch(batch);
      }
      draining = false;
      maybeDone();
    } catch (err) {
      draining = false;
      if (rejectEnd) {
        rejectEnd(err);
      }
      resolveEnd = null;
      rejectEnd = null;
    }
  };

  const enqueueBatch = (force = false) => {
    if (currentBatch.length === 0) return;
    if (!force && currentBatch.length < BATCH_SIZE) return;
    queue.push(currentBatch);
    currentBatch = [];
    void drainQueue();
  };

  const onEntry = (entry: Partial<DictionaryEntry>) => {
    currentBatch.push(entry);
    total += 1;
    enqueueBatch(false);
  };

  const ingestText = (chunkText: string) => {
    const combined = leftover + chunkText;
    const lines = splitLines(combined);
    leftover = lines.pop() || '';
    for (const line of lines) {
      processLine(state, line, onEntry);
    }
  };

  return {
    push: (chunk: Uint8Array) => {
      if (ended) return;
      const text = decoder.decode(chunk, { stream: true });
      ingestText(text);
      onProgress(total);
    },
    end: () =>
      new Promise<{ total: number; bloomBuffer: ArrayBuffer }>((resolve, reject) => {
        resolveEnd = resolve;
        rejectEnd = reject;

        const tail = decoder.decode();
        if (tail) ingestText(tail);
        if (leftover && leftover.trim()) {
          processLine(state, leftover, onEntry);
        }
        leftover = '';

        flushEntry(state, onEntry);
        enqueueBatch(true);
        ended = true;
        onProgress(total);
        maybeDone();
      }),
  };
};

export const parseDictionaryFileStream = async (
  file: File,
  onProgress: (percent: number, count: number) => void,
  onBatch: (entries: Partial<DictionaryEntry>[]) => Promise<void>
): Promise<{ total: number; bloomBuffer: ArrayBuffer }> => {
  const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
  const state = createState();
  const totalSize = Number(file?.size || 0);
  let offset = 0;
  let leftover = '';
  let currentBatch: Partial<DictionaryEntry>[] = [];
  let total = 0;

  const flushBatch = async (force = false) => {
    if (currentBatch.length === 0) return;
    if (!force && currentBatch.length < BATCH_SIZE) return;
    const out = currentBatch;
    currentBatch = [];
    await onBatch(out);
    onProgress(totalSize > 0 ? Math.min(99, Math.round((offset / totalSize) * 100)) : 99, total);
  };

  const onEntry = (entry: Partial<DictionaryEntry>) => {
    currentBatch.push(entry);
    total += 1;
  };

  const ingestText = async (chunkText: string) => {
    const combined = leftover + chunkText;
    const lines = splitLines(combined);
    leftover = lines.pop() || '';
    for (const line of lines) {
      processLine(state, line, onEntry);
      if (currentBatch.length >= BATCH_SIZE) {
        await flushBatch(true);
      }
    }
  };

  while (offset < totalSize) {
    const slice = file.slice(offset, Math.min(totalSize, offset + CHUNK_SIZE));
    const arrayBuffer = await slice.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    const textChunk = decoder.decode(uint8, { stream: true });
    await ingestText(textChunk);

    offset += uint8.byteLength;
    const progress = totalSize > 0 ? Math.min(99, Math.round((offset / totalSize) * 100)) : 0;
    onProgress(progress, total);
  }

  const tail = decoder.decode();
  if (tail) {
    await ingestText(tail);
  }

  if (leftover && leftover.trim()) {
    processLine(state, leftover, onEntry);
  }
  leftover = '';

  flushEntry(state, onEntry);
  await flushBatch(true);

  onProgress(100, total);
  return { total, bloomBuffer: new ArrayBuffer(0) };
};

/**
 * Reads the first 8KB of a file to generate a preview of how it will be parsed.
 */
export const previewDictionaryFile = async (file: File): Promise<{ word: string; translation: string }[]> => {
  const slice = file.slice(0, PREVIEW_BYTES);
  const text = await slice.text();
  const lines = splitLines(text).slice(0, PREVIEW_LINES);
  const state = createState();
  const results: { word: string; translation: string }[] = [];

  const pushResult = (entry: Partial<DictionaryEntry>) => {
    if (!entry.word || !entry.translation) return;
    results.push({ word: entry.word, translation: entry.translation });
  };

  for (const line of lines) {
    processLine(state, line, pushResult);
    if (results.length >= PREVIEW_ROWS) {
      break;
    }
  }

  if (results.length < PREVIEW_ROWS) {
    flushEntry(state, pushResult);
  }

  return results.slice(0, PREVIEW_ROWS);
};
