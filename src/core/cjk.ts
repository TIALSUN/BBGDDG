// Chinese/Japanese/Korean-aware search support.
//
// FTS5's default tokenizer treats a contiguous run of CJK characters as one
// token, so a query like "机器学习" cannot match a chunk whose whole sentence
// became a single token. We keep the existing English FTS table untouched and
// index an extra "bigram" form of every chunk: Latin/number words stay whole,
// while each CJK run is expanded into overlapping two-character grams. Both
// sides (indexing and querying) use the same segmentation so a Chinese phrase
// can always find candidate chunks, which the caller then re-ranks.

const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const WORD_CHAR = /[\p{L}\p{N}]/u

function segment(text: string): { words: string[]; cjk: string[] } {
  const words: string[] = []
  const cjk: string[] = []
  let word = ''
  let run = ''
  const flushWord = () => { if (word) { words.push(word.toLowerCase()); word = '' } }
  const flushRun = () => {
    if (!run) return
    const chars = [...run]
    for (let i = 0; i + 1 < chars.length; i++) cjk.push(chars[i]! + chars[i + 1]!)
    run = ''
  }
  for (const ch of text) {
    if (CJK_CHAR.test(ch)) { flushWord(); run += ch }
    else if (WORD_CHAR.test(ch)) { flushRun(); word += ch }
    else { flushRun(); flushWord() }
  }
  flushRun()
  flushWord()
  return { words, cjk }
}

/** Space-separated searchable form stored in source_chunks_fts_cn. */
export function cjkIndexText(text: string): string {
  const { words, cjk } = segment(text)
  return [...words, ...cjk].join(' ')
}

/** Query terms split into whole words and CJK bigrams. */
export function cjkSearchTokens(query: string): { words: string[]; cjk: string[] } {
  const { words, cjk } = segment(query)
  return { words: [...new Set(words)], cjk: [...new Set(cjk)] }
}
