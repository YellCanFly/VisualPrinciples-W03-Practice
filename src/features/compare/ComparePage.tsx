import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Copy, Eye, Layers2, Lightbulb, MoveHorizontal, RefreshCcw, SlidersHorizontal, Sparkles } from 'lucide-react';
import { SceneSvg } from '../../components/SceneSvg';
import { DIMENSIONS, newScene, type DimensionKey, type SceneDocument } from '../../domain/scene/types';
import { COMBINED_STEPS, COMPARISON_COPY, DEFAULT_COMPARISON_SETTINGS, copyExample, getCombinedScene, getComparisonScenes, type ComparisonSettings } from '../../data/comparisons/examples';
import './compare.css';

interface ComparePageProps { onUseExample: (scene: SceneDocument) => void; }

function AnalysisLines({ principle, after, settings }: { principle: DimensionKey; after: boolean; settings: ComparisonSettings }) {
  const color = '#76906b';
  if (principle === 'proximity') return <g fill="none" stroke={color} strokeWidth="2" strokeDasharray="8 7" opacity=".8">
    {[0, 1, 2].map(i => <rect key={i} x={104 + i * 282} y="119" width="252" height={after ? 219 + settings.proximity * 2 : 414} rx="14" />)}
    {after && <path d="M356 393h30m-30-8v16m30-16v16M638 393h30m-30-8v16m30-16v16" strokeDasharray="none"/>}
  </g>;
  if (principle === 'repetition') return <g fill="none" stroke={color} strokeWidth="2" strokeDasharray="7 7" opacity=".8">
    {[0, 1, 2, 3].map(i => <rect key={i} x="117" y={84 + i * 124} width="710" height="99" rx="10" />)}
    {after && <path d="M101 100v440M92 100h18M92 540h18" strokeDasharray="none"/>}
  </g>;
  if (principle === 'contrast') return <g fill="none" stroke={color} strokeWidth="2" strokeDasharray="7 7" opacity=".8">
    <path d="M113 104v116m-9-116h18m-18 116h18M113 239v48m-9-48h18m-18 48h18"/>
    <rect x="120" y={after ? 397 : 427} width={after ? 188 : 120} height={after ? 188 : 120} rx="10"/>
    <path d="M420 553h120M717 553h120"/>
  </g>;
  const xs = after ? settings.alignment === 'center' ? [480] : settings.alignment === 'columns' ? [150, 530] : [160] : [165, 221, 310, 180, 229, 369];
  return <g fill="none" stroke={color} strokeWidth="2" strokeDasharray="8 7" opacity=".8">{xs.map((x, i) => <path key={i} d={`M${x} 78V568`}/>)}</g>;
}

function RangeControl({ label, value, min = 0, max = 100, unit = '%', onChange }: { label: string; value: number; min?: number; max?: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="compare-range"><span className="compare-range-heading"><span>{label}</span><output>{value}<small>{unit}</small></output></span><input type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))}/></label>;
}

export function ComparePage({ onUseExample }: ComparePageProps) {
  const params = useParams();
  const navigate = useNavigate();
  const principle: DimensionKey = DIMENSIONS.some(item => item.key === params.principle) ? params.principle as DimensionKey : 'proximity';
  const [settings, setSettings] = useState<ComparisonSettings>({ ...DEFAULT_COMPARISON_SETTINGS });
  const [showLines, setShowLines] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [mobileVersion, setMobileVersion] = useState<'before' | 'after'>('after');
  const [combinedStep, setCombinedStep] = useState(4);
  const scenes = useMemo(() => getComparisonScenes(principle, settings), [principle, settings]);
  const combinedScene = useMemo(() => getCombinedScene(combinedStep), [combinedStep]);
  const copy = COMPARISON_COPY[principle];
  const dimension = DIMENSIONS.find(item => item.key === principle)!;
  const update = <K extends keyof ComparisonSettings>(key: K, value: ComparisonSettings[K]) => setSettings(current => ({ ...current, [key]: value }));
  return <main className={`compare-page${reduceMotion ? ' compare-reduce-motion' : ''}`}>
    <section className="compare-hero" aria-labelledby="compare-page-title">
      <div><p className="compare-eyebrow"><span/>DESIGN IS A RELATIONSHIP <i>设计，始于关系</i></p><h1 id="compare-page-title">好的排布，<em>有迹可循。</em></h1><p className="compare-hero-intro">从四个基本原则出发，观察微小改变如何影响画面。<br className="compare-desktop-break"/>先看一看，再动手试一试。</p></div>
      <div className="compare-start"><button className="button primary" onClick={() => onUseExample(newScene())}>打开自由画布<ArrowUpRight size={19}/></button><span>一张空白画布，无限种可能</span></div>
    </section>

    <nav className="principle-tabs" aria-label="四原则">
      {DIMENSIONS.map((item, index) => <button key={item.key} className={`principle-tab${item.key === principle ? ' is-active' : ''}`} aria-current={item.key === principle ? 'page' : undefined} onClick={() => navigate(`/learn/${item.key}`)}>
        <span className="principle-tab-number">0{index + 1}</span><span className="principle-tab-label">{item.label}<small>{item.english}</small></span><span className={`principle-symbol principle-symbol-${item.key}`} aria-hidden="true"><i/><i/><i/><i/></span>
      </button>)}
    </nav>

    <section className="comparison-lab" aria-labelledby="current-principle-title">
      <div className="comparison-lab-heading"><div><p className="comparison-kicker">{dimension.english}<span> / </span> {dimension.label}</p><h2 id="current-principle-title">{copy.title}</h2><p>{copy.intro}</p></div><span className="comparison-lesson-count">0{DIMENSIONS.indexOf(dimension) + 1}<small> / 04</small></span></div>
      <div className="comparison-display-toolbar"><div className="comparison-legend"><span className="comparison-legend-dot"/>相同内容 · 相同画布 · 不同排布</div><div className="comparison-options"><label className="comparison-check"><input type="checkbox" checked={showLines} onChange={event => setShowLines(event.target.checked)}/><Eye size={15}/><span>显示分析线</span></label><label className="comparison-check"><input type="checkbox" checked={reduceMotion} onChange={event => setReduceMotion(event.target.checked)}/><span>减少动态</span></label></div></div>
      <div className="comparison-mobile-tabs" aria-label="对比版本"><button className={mobileVersion === 'before' ? 'active' : ''} onClick={() => setMobileVersion('before')}>调整前</button><button className={mobileVersion === 'after' ? 'active' : ''} onClick={() => setMobileVersion('after')}>调整后</button></div>
      <div className="comparison-pair">
        {(['before', 'after'] as const).map((version, index) => <article key={version} className={`comparison-version comparison-${version}${mobileVersion === version ? ' mobile-selected' : ''}`}>
          <div className="comparison-version-label"><span><i/>{version === 'before' ? '调整前' : '调整后'}<small>{version === 'before' ? 'BEFORE' : 'AFTER'}</small></span>{version === 'after' && <span className="comparison-improved"><Check size={12}/>建立视觉关系</span>}</div>
          <div className="comparison-canvas"><SceneSvg scene={scenes[version]} aria-label={`${dimension.label}${version === 'before' ? '调整前' : '调整后'}示例`} role="img">{showLines && <AnalysisLines principle={principle} after={index === 1} settings={settings}/>}</SceneSvg></div>
          <p className="comparison-caption">{version === 'before' ? copy.before : copy.after}</p>
        </article>)}
        <span className="comparison-pair-arrow" aria-hidden="true"><ArrowRight size={17}/></span>
      </div>
      <div className="comparison-controls"><div className="comparison-controls-label"><SlidersHorizontal size={17}/><span>动手调一调<small>看看画面如何变化</small></span></div><div className={`comparison-control-fields${principle === 'contrast' ? ' has-three' : ''}`}>
        {principle === 'proximity' && <><RangeControl label="组内间距" value={settings.proximity} min={12} max={72} unit="px" onChange={value => update('proximity', value)}/><div className="comparison-range-hint"><span>更紧密</span><MoveHorizontal size={15}/><span>更疏松</span></div></>}
        {principle === 'repetition' && <><RangeControl label="样式统一程度" value={settings.repetition} onChange={value => update('repetition', value)}/><div className="comparison-range-hint"><span>保留变化</span><MoveHorizontal size={15}/><span>更多重复</span></div></>}
        {principle === 'contrast' && <><RangeControl label="字号差异" value={settings.contrast} onChange={value => update('contrast', value)}/><RangeControl label="图形大小差异" value={settings.contrastShape} onChange={value => update('contrastShape', value)}/><RangeControl label="明暗差异" value={settings.contrastColor} onChange={value => update('contrastColor', value)}/></>}
        {principle === 'alignment' && <div className="comparison-alignment-options" aria-label="对齐轴线">{([['left', '左侧轴线'], ['center', '中心轴线'], ['columns', '双列轴线']] as const).map(([key, label]) => <button key={key} className={settings.alignment === key ? 'selected' : ''} onClick={() => update('alignment', key)}>{label}</button>)}</div>}
      </div><button className="icon-button comparison-reset" aria-label="重置演示参数" title="重置演示参数" onClick={() => setSettings({ ...DEFAULT_COMPARISON_SETTINGS })}><RefreshCcw size={16}/></button></div>
      <div className="comparison-takeaway"><span className="comparison-bulb"><Lightbulb size={20}/></span><div><strong>{copy.takeaway}</strong><p>{copy.note}</p></div><button className="button secondary" onClick={() => onUseExample(copyExample(scenes.after, `${dimension.label} · 自由尝试`))}><Copy size={15}/>复制此示例到新画布<ArrowUpRight size={15}/></button></div>
    </section>

    <section className="combined-section" aria-labelledby="combined-title"><div className="combined-heading"><div><p className="compare-eyebrow">BETTER TOGETHER</p><h2 id="combined-title">四个原则，一起发生作用。</h2><p>同一组元素，逐步建立更清楚的视觉关系。</p></div><span className="combined-label"><Layers2 size={16}/>综合对比</span></div>
      <div className="combined-lab"><div className="combined-process"><ol>{COMBINED_STEPS.map((step, index) => <li key={step.label}><button onClick={() => setCombinedStep(index)} className={combinedStep === index ? 'active' : ''} aria-pressed={combinedStep === index}><span className="combined-step-number">{index === 0 ? '○' : `0${index}`}</span><span>{step.label}<small>{step.principle}</small></span>{combinedStep === index && <ArrowRight size={17}/>}</button></li>)}</ol><p><Sparkles size={15}/>每一步都可以自由切换，无需按顺序完成。</p></div><div className="combined-preview"><div className="combined-preview-header"><span>0{combinedStep + 1}<i>/</i>05</span><strong>{COMBINED_STEPS[combinedStep].label}</strong><span className="combined-preview-dots" aria-hidden="true">{COMBINED_STEPS.map((_, i) => <i key={i} className={i === combinedStep ? 'active' : ''}/>)}</span></div><SceneSvg scene={combinedScene} aria-label={`综合对比：${COMBINED_STEPS[combinedStep].label}`} role="img"/><div className="combined-preview-bottom"><p>{COMBINED_STEPS[combinedStep].description}</p><button className="icon-button" aria-label="复制当前综合示例到新画布" title="复制到新画布" onClick={() => onUseExample(copyExample(combinedScene, '综合对比 · 自由尝试'))}><Copy size={16}/></button></div></div></div>
    </section>
    <footer className="compare-footer"><span><span className="compare-footer-mark"/>观察是开始，尝试让理解发生。</span><button onClick={() => onUseExample(newScene())}>去自由实践<ArrowRight size={16}/></button><span className="compare-scroll-label"><ArrowDown size={13}/>让每次改变，都有自己的理由</span></footer>
  </main>;
}
