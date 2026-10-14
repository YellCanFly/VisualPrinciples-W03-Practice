import { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Check, CircleHelp, X } from 'lucide-react';
import { newScene, type SceneDocument } from '../domain/scene/types';
import { deleteDocument, listDocuments, loadLastDocument, saveDocument, StorageConflictError } from '../services/storage/storage';
import { importJson } from '../services/export/export';
import { ComparePage } from '../features/compare/ComparePage';
import { GalleryPage } from '../features/gallery/GalleryPage';
import { EditorPage } from '../features/editor/EditorPage';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [,fontsChanged] = useState(0);
  useEffect(()=>{const rerender=()=>fontsChanged(n=>n+1);document.fonts.ready.then(rerender);document.fonts.addEventListener('loadingdone',rerender);return()=>document.fonts.removeEventListener('loadingdone',rerender);},[]);
  const [scene, setScene] = useState<SceneDocument>(newScene);
  const [documents, setDocuments] = useState<SceneDocument[]>([]);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('正在读取本地作品');
  const [toast, setToast] = useState('');
  const [help, setHelp] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(scene); latest.current = scene;
  const saveQueue = useRef(Promise.resolve());
  const channel = useRef<BroadcastChannel | null>(null);
  const [conflict, setConflict] = useState(false);
  const notify = (message: string) => setToast(message);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5500); return () => clearTimeout(t); }, [toast]);
  const persist = (value: SceneDocument) => {
    setStatus('保存中…');
    const task = saveQueue.current.catch(() => {}).then(async () => {
      await saveDocument(value); setDocuments(await listDocuments());
      if (latest.current.documentId === value.documentId && latest.current.revision === value.revision) setStatus('已保存到此浏览器');
      channel.current?.postMessage({ id: value.documentId, revision: value.revision, updatedAt: value.updatedAt });
    });
    saveQueue.current = task;
    return task.then(()=>true).catch((error) => { if(error instanceof StorageConflictError){setConflict(true);setStatus(error.message);}else setStatus('保存失败 · 请下载 JSON 备份');return false; });
  };
  useEffect(() => {
    let active = true;
    Promise.all([loadLastDocument(), listDocuments()]).then(([last, all]) => { if (!active) return; if(last) setScene(last); setDocuments(all); setReady(true); setStatus(last ? '已保存到此浏览器' : '自动保存在此浏览器'); }).catch(() => { if(active){setReady(true);setStatus('本地存储不可用 · 请下载 JSON 备份');} });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!ready || conflict) return; const t = setTimeout(() => void persist(scene), 800); return () => clearTimeout(t); }, [scene, ready, conflict]);
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const c = new BroadcastChannel('w03-design-lab-v2'); channel.current = c;
    c.onmessage = ({data}) => { if (data.id === latest.current.documentId && data.updatedAt !== latest.current.updatedAt) { setConflict(true); setStatus('另一标签页修改了此作品'); } };
    return () => { c.close(); channel.current = null; };
  }, []);
  useEffect(() => {
    const flush = () => { if(document.visibilityState === 'hidden' && ready && !conflict) void persist(latest.current); };
    document.addEventListener('visibilitychange',flush); return () => document.removeEventListener('visibilitychange',flush);
  }, [ready,conflict]);
  const openScene = async (value: SceneDocument) => { if(conflict){notify('请先将当前画面保存为新副本，再切换作品。');return;}if(!await persist(latest.current)){notify('当前作品保存失败，已保留在画布中。请先导出 JSON 备份。');return;}setConflict(false);setScene(value);navigate('/practice'); };
  const create = () => void openScene(newScene());
  const useExample = (value: SceneDocument) => void openScene({...value, documentId:crypto.randomUUID(), revision:0, updatedAt:new Date().toISOString()});
  const rename = async (value:SceneDocument,name:string) => { const updated={...value,name,revision:value.revision+1,updatedAt:new Date().toISOString()}; if(await persist(updated)&&value.documentId===scene.documentId)setScene(updated); };
  const duplicate = async (value:SceneDocument) => { if(await persist({...value,documentId:crypto.randomUUID(),name:`${value.name.slice(0,110)} · 副本`,revision:0,updatedAt:new Date().toISOString()}))notify('已复制作品'); };
  const remove = async (value:SceneDocument) => { await saveQueue.current.catch(()=>{}); await deleteDocument(value.documentId); if(scene.documentId===value.documentId)setScene(newScene()); setDocuments(await listDocuments()); setDeleted(value); };
  const [deleted,setDeleted]=useState<SceneDocument|null>(null);
  const [importing,setImporting]=useState(false);
  return <div className="app-shell">
    <header className="site-header">
      <NavLink to="/learn/proximity" className="brand" aria-label="视觉排布实验室首页"><span className="brand-mark"><i/><i/><i/><i/></span><span>视觉排布实验室<small>VISUAL LAYOUT LAB</small></span></NavLink>
      <nav aria-label="主导航"><NavLink className={location.pathname.startsWith('/learn')||location.pathname==='/'?'nav-link active':'nav-link'} to="/learn/proximity">观察对比</NavLink><NavLink className="nav-link" to="/practice">自由实践</NavLink><NavLink className="nav-link" to="/gallery">我的作品<span className="nav-count">{documents.length}</span></NavLink></nav>
      <div className="header-right"><span className="course-tag">视觉原理 <span>/</span> W03</span><button className="icon-button" aria-label="使用帮助" title="使用帮助" onClick={()=>setHelp(true)}><CircleHelp size={20}/></button></div>
    </header>
    {conflict && <div className="conflict-banner">检测到其他标签页的修改，已暂停自动保存。<button onClick={()=>{setScene({...scene,documentId:crypto.randomUUID(),name:`${scene.name} · 恢复副本`,updatedAt:new Date().toISOString()});setConflict(false);}}>将当前画面保存为新副本</button></div>}
    {ready ? <Routes>
      <Route path="/learn/:principle" element={<ComparePage onUseExample={useExample}/>}/>
      <Route path="/practice" element={<EditorPage scene={scene} onChange={setScene} onNew={create} onImport={()=>input.current?.click()} saveStatus={status} notify={notify}/>}/>
      <Route path="/gallery" element={<GalleryPage documents={documents} onOpen={v=>void openScene(v)} onNew={create} onImport={()=>input.current?.click()} onRename={(v,n)=>void rename(v,n)} onDuplicate={v=>void duplicate(v)} onDelete={v=>void remove(v)}/>}/>
      <Route path="*" element={<ComparePage onUseExample={useExample}/>}/>
    </Routes> : <main className="loading-state">正在准备实验室…</main>}
    <input ref={input} type="file" accept=".json,application/json" hidden disabled={importing} onChange={async e=>{ const file=e.target.files?.[0];if(!file)return;setImporting(true);try{await openScene(await importJson(file));notify('已导入为新作品；重新分析以查看当前结果');}catch(err){notify(err instanceof Error?err.message:'导入失败');}finally{e.target.value='';setImporting(false);} }}/>
    {toast && <div role="status" className="toast"><Check size={17}/><span>{toast}</span><button aria-label="关闭提示" onClick={()=>setToast('')}><X size={16}/></button></div>}
    {deleted && <div role="status" className="undo-toast">已删除“{deleted.name}”<button onClick={async()=>{await persist(deleted);setDeleted(null);}}>撤销删除</button><button aria-label="关闭删除提示" onClick={()=>setDeleted(null)}><X size={14}/></button></div>}
    {help && <div className="modal-backdrop" onClick={()=>setHelp(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e=>e.stopPropagation()}><button className="icon-button modal-close" aria-label="关闭帮助" onClick={()=>setHelp(false)}><X size={20}/></button><span className="eyebrow">A SMALL GUIDE</span><h2 id="help-title">让视觉关系变得可见。</h2><p>先观察四个原则如何改变同一组元素，再打开空白画布，自由尝试自己的排布。</p><div className="shortcut-list"><span>多选元素</span><kbd>Shift + 点击</kbd><span>移动 / 快速移动</span><kbd>方向键 / Shift + 方向键</kbd><span>复制 / 删除</span><kbd>Ctrl ⌘ D / Delete</kbd><span>撤销 / 重做</span><kbd>Ctrl ⌘ Z / Shift Z</kbd><span>平移画布</span><kbd>空格 + 拖动</kbd><span>暂时关闭吸附</span><kbd>Alt + 拖动</kbd></div><p className="muted">作品自动保存在当前浏览器。跨设备使用请导出 JSON。分析只观察几何和样式关系，不理解文字语义；证据不足的维度显示“—”。</p><button className="button primary" onClick={()=>{setHelp(false);navigate('/practice');}}>开始自由实践<ArrowUpRight size={16}/></button></section></div>}
  </div>;
}
