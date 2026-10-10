import type {ButtonHTMLAttributes} from 'react'
export default function Button({variant='secondary',className='',type='button',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'danger'}){
 return <button {...props} type={type} className={`ui-button ${variant==='danger'?'ui-danger':variant} ${className}`}/>
}
