import {Link} from 'react-router-dom'
import AiControlPanel from '../components/AiControlPanel'
export default function SettingsPage(){return <main className="settings-page"><Link to="/">← 我的项目</Link><h1>设置</h1><AiControlPanel/><section><h2>显示与阅读</h2><p>中文深色界面；阅读工具可收起，面板宽度可在阅读页调整。</p></section><section><h2>本地数据</h2><p>文献、笔记和阅读进度保存在当前服务所在设备。升级数据库前自动备份。</p><p>跨设备同步尚未启用。iPhone / iPad 独立安装版正在规划。</p></section></main>}
