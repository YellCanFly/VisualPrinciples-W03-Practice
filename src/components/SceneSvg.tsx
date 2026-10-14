import type { ReactNode, SVGProps } from 'react';
import type { SceneDocument, SceneElement } from '../domain/scene/types';
import { arrowPoints, fontFamily, measureText, polygonPath, shapePath } from '../domain/layout/layout';

export function ElementSvg({ element: e }: { element: SceneElement }) {
  if (e.type === 'text') {
    const layout = measureText(e);
    const anchor = e.textAlign === 'left' ? 'start' : e.textAlign === 'center' ? 'middle' : 'end';
    const x = e.x + (e.textAlign === 'center' ? e.width / 2 : e.textAlign === 'right' ? e.width : 0);
    return <text data-element-id={e.id} fill={e.color} fontFamily={fontFamily(e.fontFamily)} fontSize={e.fontSize} fontWeight={e.fontWeight} textAnchor={anchor} xmlSpace="preserve">{layout.lines.map((line, index) => <tspan key={index} x={x} y={layout.baselines[index]}>{line}</tspan>)}</text>;
  }
  const linear = e.shape === 'line' || e.shape === 'arrow';
  return <g data-element-id={e.id}><path d={shapePath(e)} fill={linear ? 'none' : e.fill} stroke={e.stroke} strokeWidth={e.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />{e.shape === 'arrow' && e.stroke !== 'none' && e.strokeWidth > 0 && <path d={polygonPath(arrowPoints(e))} fill={e.stroke} stroke={e.stroke} strokeWidth={e.strokeWidth} strokeLinejoin="round" />}</g>;
}
export function SceneSvg({ scene, className, children, viewBox: _, ...props }: SVGProps<SVGSVGElement> & { scene: SceneDocument; children?: ReactNode }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={scene.width} height={scene.height} className={className} {...props} viewBox={`0 0 ${scene.width} ${scene.height}`}><rect width={scene.width} height={scene.height} fill={scene.background} />{scene.elements.map(element => <ElementSvg key={element.id} element={element} />)}{children}</svg>;
}
