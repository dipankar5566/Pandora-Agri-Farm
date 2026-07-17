import { ReactNode, useCallback, useEffect, useRef } from 'react';

export interface ViewBox { x: number; y: number; w: number; h: number }
export type SvgPoint = [number, number];

/**
 * SVG viewport: wheel zoom about the cursor, drag-pan on empty space.
 * viewBox is the single source of pan/zoom truth; children draw in plan-pixel
 * coordinates. Shape/handle elements must stopPropagation on pointerdown so
 * their drags don't pan.
 */
export default function MapCanvas(props: {
  viewBox: ViewBox;
  onViewBox: (vb: ViewBox) => void;
  contentSize: { w: number; h: number }; // zoom clamps derive from this
  onClickPoint?: (pt: SvgPoint, e: React.MouseEvent) => void;
  onMovePoint?: (pt: SvgPoint) => void;
  onDragPoint?: (pt: SvgPoint) => void; // pointermove while a child drag is active
  onDragEnd?: () => void;
  dragging?: boolean; // parent is dragging a vertex/shape: suppress pan
  cursor?: string;
  children: ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pan = useRef<{ x: number; y: number; vb: ViewBox } | null>(null);
  const moved = useRef(false);

  const toSvg = useCallback((clientX: number, clientY: number): SvgPoint => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const vb = props.viewBox;
    return [vb.x + ((clientX - r.left) / r.width) * vb.w, vb.y + ((clientY - r.top) / r.height) * vb.h];
  }, [props.viewBox]);

  // React attaches wheel as passive; zoom must preventDefault to stop page scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vb = props.viewBox;
      const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const maxW = props.contentSize.w * 3;
      const minW = props.contentSize.w / 40;
      const w = Math.min(maxW, Math.max(minW, vb.w * f));
      const scale = w / vb.w;
      const [mx, my] = toSvg(e.clientX, e.clientY);
      props.onViewBox({ x: mx - (mx - vb.x) * scale, y: my - (my - vb.y) * scale, w, h: vb.h * scale });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  });

  return (
    <svg
      ref={svgRef}
      viewBox={`${props.viewBox.x} ${props.viewBox.y} ${props.viewBox.w} ${props.viewBox.h}`}
      style={{ width: '100%', height: '100%', display: 'block', cursor: props.cursor ?? 'default', touchAction: 'none' }}
      onPointerDown={(e) => {
        if (props.dragging) return;
        moved.current = false;
        pan.current = { x: e.clientX, y: e.clientY, vb: props.viewBox };
      }}
      onPointerMove={(e) => {
        props.onMovePoint?.(toSvg(e.clientX, e.clientY));
        if (props.dragging) { props.onDragPoint?.(toSvg(e.clientX, e.clientY)); return; }
        if (!pan.current) return;
        // pointerup landed on a child that stopped propagation — drop the stale pan
        if (e.buttons === 0) { pan.current = null; return; }
        const dx = e.clientX - pan.current.x;
        const dy = e.clientY - pan.current.y;
        if (!moved.current && Math.abs(dx) + Math.abs(dy) > 3) {
          moved.current = true;
          // capture only once a pan starts: capturing on pointerdown would retarget
          // pointerup to the svg and shape clicks (selection) would never fire
          (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        }
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const vb = pan.current.vb;
        props.onViewBox({ x: vb.x - (dx / r.width) * vb.w, y: vb.y - (dy / r.height) * vb.h, w: vb.w, h: vb.h });
      }}
      onPointerUp={(e) => {
        if (props.dragging) { props.onDragEnd?.(); return; }
        const wasPan = pan.current !== null && moved.current;
        pan.current = null;
        if (!wasPan) props.onClickPoint?.(toSvg(e.clientX, e.clientY), e as unknown as React.MouseEvent);
      }}
      onPointerLeave={() => { pan.current = null; if (props.dragging) props.onDragEnd?.(); }}
    >
      {props.children}
    </svg>
  );
}
