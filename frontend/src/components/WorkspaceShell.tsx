import type {ReactNode} from 'react'
export default function WorkspaceShell({navigation,children}:{navigation:ReactNode;children:ReactNode}){return <div className="workspace-shell"><a className="skip-link" href="#main-content">跳到主要内容</a>{navigation}{children}</div>}
