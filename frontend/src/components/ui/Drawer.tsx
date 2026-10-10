import Dialog,{type DialogProps} from './Dialog'
export default function Drawer(props:DialogProps){return <Dialog {...props} className={`ui-drawer ${props.className||''}`}/>}
