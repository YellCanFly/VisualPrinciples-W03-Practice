import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ArrowRight, ArrowUpRight, Check, Copy, Download, FolderOpen, Grid2X2, HardDrive, List, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { SceneSvg } from '../../components/SceneSvg';
import type { SceneDocument } from '../../domain/scene/types';
import { exportJson } from '../../services/export/export';
import './gallery.css';

interface GalleryPageProps {
  documents: SceneDocument[];
  onOpen: (scene: SceneDocument) => void;
  onRename: (scene: SceneDocument, name: string) => void;
  onDuplicate: (scene: SceneDocument) => void;
  onDelete: (scene: SceneDocument) => void;
  onNew: () => void;
  onImport: () => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function GalleryPage({ documents, onOpen, onRename, onDuplicate, onDelete, onNew, onImport }: GalleryPageProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [exportError, setExportError] = useState('');
  useEffect(() => {
    if (!menuId) return;
    const close = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest('.gallery-card-menu')) setMenuId(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuId(null); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [menuId]);
  const filtered = useMemo(() => documents.filter(scene => scene.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : sort === 'oldest' ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt)), [documents, search, sort]);
  const startRename = (scene: SceneDocument) => { setRenameId(scene.documentId); setRenameValue(scene.name); setMenuId(null); };
  const download = async (scene: SceneDocument) => { setMenuId(null); try { await exportJson(scene); } catch (error) { setExportError(error instanceof Error ? error.message : '下载失败，请稍后重试'); } };
  return <main className="gallery-page">
    <section className="gallery-hero" aria-labelledby="gallery-title"><div><p className="gallery-eyebrow"><span/>YOUR LITTLE COLLECTION <i>每一次尝试，都值得留下</i></p><h1 id="gallery-title">我的作品<span className="gallery-title-dot">.</span></h1><p>收好你的探索，让想法在下一次打开时继续。</p></div><div className="gallery-hero-actions"><button className="button secondary" onClick={onImport}><Upload size={16}/>导入作品</button><button className="button primary" onClick={onNew}><Plus size={17}/>新建画布<ArrowUpRight size={16}/></button></div></section>
    <div className="gallery-storage-note"><span className="gallery-storage-icon"><HardDrive size={16}/></span><div><strong>保存在此浏览器</strong><span>作品自动保存在当前设备。导出 JSON 文件，可以备份或在其他设备继续编辑。</span></div><span className="gallery-local-badge"><span/>本地存储</span></div>
    {exportError && <div className="gallery-error" role="alert">{exportError}<button className="icon-button" aria-label="关闭错误提示" onClick={() => setExportError('')}><X size={15}/></button></div>}
    <div className="gallery-toolbar"><div className="gallery-collection-title"><FolderOpen size={18}/><h2>全部作品</h2><span>{documents.length}</span></div><div className="gallery-toolbar-controls"><label className="gallery-search"><Search size={15}/><input type="search" placeholder="搜索作品名称…" value={search} onChange={event => setSearch(event.target.value)} aria-label="搜索作品名称"/></label><label className="gallery-sort"><ArrowDownUp size={14}/><select value={sort} onChange={event => setSort(event.target.value)} aria-label="作品排序"><option value="recent">最近修改</option><option value="oldest">最早修改</option><option value="name">按名称</option></select></label><div className="gallery-view-options" aria-label="作品显示方式"><button className={view === 'grid' ? 'active' : ''} aria-label="网格显示" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={15}/></button><button className={view === 'list' ? 'active' : ''} aria-label="列表显示" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17}/></button></div></div></div>
    {documents.length === 0 ? <section className="gallery-empty"><div className="gallery-empty-art" aria-hidden="true"><span className="gallery-empty-paper back"/><span className="gallery-empty-paper front"><i/><i/><i/><b/></span><span className="gallery-empty-plus"><Plus size={21}/></span><span className="gallery-empty-spark one"/><span className="gallery-empty-spark two"/></div><p className="gallery-eyebrow">A PLACE FOR YOUR IDEAS</p><h2>第一张作品，从一个想法开始。</h2><p>添加文字与图形，试试不同的距离、大小和排列。<br/>这里会替你保存每一次自由探索。</p><button className="button primary" onClick={onNew}><Plus size={16}/>打开空白画布<ArrowUpRight size={16}/></button><button className="gallery-empty-import" onClick={onImport}>已有作品文件？导入 JSON<ArrowRight size={13}/></button></section> : filtered.length === 0 ? <section className="gallery-no-results"><Search size={27}/><h2>没有找到相关作品</h2><p>试试其他关键词，或查看全部作品。</p><button className="button secondary" onClick={() => setSearch('')}>清除搜索</button></section> : <section className={`gallery-collection gallery-${view}`} aria-label="作品列表">
      {filtered.map((scene, index) => <article className="gallery-card" key={scene.documentId}><button className="gallery-card-preview" onClick={() => onOpen(scene)} aria-label={`打开作品：${scene.name}`}><div className="gallery-card-artboard"><SceneSvg scene={scene} aria-hidden="true"/>{scene.elements.length === 0 && <span className="gallery-blank-label">空白画布<span>等待你的第一个想法</span></span>}</div><span className="gallery-card-open">继续编辑<ArrowUpRight size={14}/></span><span className="gallery-card-number">{String(index + 1).padStart(2, '0')}</span></button><div className="gallery-card-body"><div className="gallery-card-main">{renameId === scene.documentId ? <form className="gallery-rename-form" onSubmit={event => { event.preventDefault(); const name = renameValue.trim(); if (name) { onRename(scene, name); setRenameId(null); } }}><input aria-label="作品名称" autoFocus maxLength={80} value={renameValue} onFocus={event => event.target.select()} onChange={event => setRenameValue(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setRenameId(null); }}/><button type="submit" disabled={!renameValue.trim()} aria-label="保存名称"><Check size={15}/></button><button type="button" onClick={() => setRenameId(null)} aria-label="取消重命名"><X size={15}/></button></form> : <button className="gallery-card-name" title={scene.name} onClick={() => onOpen(scene)}>{scene.name}</button>}<p><span>{scene.elements.length} 个元素</span><i/>最后修改 {formatDate(scene.updatedAt)}</p></div><div className="gallery-card-menu"><button className={`icon-button${menuId === scene.documentId ? ' active' : ''}`} aria-label={`${scene.name}的更多操作`} aria-expanded={menuId === scene.documentId} aria-haspopup="menu" onClick={() => setMenuId(current => current === scene.documentId ? null : scene.documentId)}><MoreHorizontal size={19}/></button>{menuId === scene.documentId && <div className="gallery-dropdown" role="menu" aria-label="作品操作"><button role="menuitem" onClick={() => { setMenuId(null); onOpen(scene); }}><FolderOpen size={14}/>打开作品<ArrowUpRight size={12}/></button><button role="menuitem" onClick={() => startRename(scene)}><Pencil size={14}/>重命名</button><button role="menuitem" onClick={() => { onDuplicate(scene); setMenuId(null); }}><Copy size={14}/>创建副本</button><button role="menuitem" onClick={() => void download(scene)}><Download size={14}/>导出 JSON</button><span/><button role="menuitem" className="gallery-delete" onClick={() => { onDelete(scene); setMenuId(null); }}><Trash2 size={14}/>删除作品</button></div>}</div></div><div className="gallery-card-footer"><span>{scene.width} × {scene.height}</span><span><span/>已保存</span></div></article>)}
      {view === 'grid' && !search && <button className="gallery-new-card" onClick={onNew}><span><Plus size={23}/></span><strong>留一点空间，给新想法</strong><small>新建一张空白画布</small><ArrowUpRight size={16}/></button>}
    </section>}
    <footer className="gallery-footer"><span>每一张画布，都是一次观察与尝试。</span><span><HardDrive size={12}/>无需登录 · 本地保存 · 自由创作</span></footer>
  </main>;
}
