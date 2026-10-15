// Preserve code verbatim while accepting the delimiters commonly emitted by models.
export function normalizeMath(content: string): string {
  return content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math.trim()}\n$$\n`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_, math) => `$${math}$`)
    // remark-math only treats a fence that owns both ends of its lines as
    // display math. A model-emitted `$$…$$` written on one line (or closed on a
    // later line) therefore rendered as *inline* math: left aligned, too wide
    // for the message, overflowing the panel and clipped, and in the
    // late-closed case as a raw KaTeX error. Give those formulas the fenced
    // form so they become display math that can scroll inside the bubble.
    .replace(/^[ \t]*\$\$([^$]*?)\$\$[ \t]*\r?$/gm, (_, math) => `\n$$\n${math.trim()}\n$$\n`)).join('')
}
