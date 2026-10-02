let desktopMasterKey: Buffer | undefined

// The desktop main process sends this once over its private IPC channel.
// Never store the master key in the backend environment inherited by AI tools.
export function initializeDesktopMasterKey(hex: string): void {
  if (desktopMasterKey || !/^[a-f0-9]{64}$/i.test(hex)) throw new Error('Invalid desktop key initialization')
  desktopMasterKey = Buffer.from(hex, 'hex')
}
export function getDesktopMasterKey(): Buffer | undefined { return desktopMasterKey }

export function agentEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) =>
    !/^(?:BBGDDG|PDFPAL)_/i.test(name) && !['ELECTRON_RUN_AS_NODE', 'NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE'].includes(name.toUpperCase())))
}
