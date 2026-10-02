import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const PreferencesSchema = z.object({ readerTopCollapsed: z.boolean() })
export type UiPreferences = z.infer<typeof PreferencesSchema>

export function readUiPreferences(dataDir: string): UiPreferences {
  try {
    const parsed = PreferencesSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dataDir, 'ui-preferences.json'), 'utf8')))
    return parsed.success ? parsed.data : { readerTopCollapsed: false }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return { readerTopCollapsed: false }
    throw error
  }
}

export function saveUiPreferences(dataDir: string, input: unknown): UiPreferences {
  const preferences = PreferencesSchema.strict().parse(input)
  const target = path.join(dataDir, 'ui-preferences.json')
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(preferences)}\n`, { mode: 0o600 })
    fs.renameSync(temporary, target)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
  return preferences
}
