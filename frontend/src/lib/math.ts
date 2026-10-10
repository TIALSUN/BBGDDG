// Preserve code verbatim while accepting the delimiters commonly emitted by models.
export function normalizeMath(content: string): string {
  return content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math.trim()}\n$$\n`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_, math) => `$${math}$`)).join('')
}
