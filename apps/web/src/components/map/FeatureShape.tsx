import { useTheme } from '@mui/material';
import type { SvgPoint } from './MapCanvas';

export interface MapFeature {
  id: string;
  kind: 'plot' | 'building' | 'zone' | 'line' | 'point';
  name: string;
  nameBn?: string | null;
  geometry: SvgPoint[];
  refType?: string | null;
  refId?: string | null;
  zIndex: number;
  notes?: string | null;
  linkBroken?: boolean;
  status?: 'planted' | 'harvest_due' | 'fallow';
  plot?: {
    name: string; block?: string | null; areaDecimal?: string | null;
    crop?: {
      id: string; cropName: string; variety?: string | null; sownOn: string;
      expectedHarvestOn?: string | null; ageDays: number; cuts: number; totalYieldKg: number;
    } | null;
  };
  shed?: { name: string; nameBn?: string | null };
  device?: { deviceType: string; serialNumber: string; installLocation?: string | null };
}

export function centroid(pts: SvgPoint[]): SvgPoint {
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ];
}

export function localName(f: { name: string; nameBn?: string | null }, lang: string): string {
  return (lang === 'bn' ? f.nameBn : null) ?? f.name;
}

/** One feature → SVG. Style derives from kind + status, never stored
 *  (docs/layout/03 §6, 04 §3). Colour is never the only status signal:
 *  fallow hatches, harvest_due thickens + glyph. */
export default function FeatureShape(props: {
  feature: MapFeature;
  selected: boolean;
  pxPerUnit: number; // screen px per plan px — keeps strokes/labels screen-sized
  lang: string;
  areaLabel?: string;
  interactive?: boolean; // false while drawing/picking: clicks pass through to the canvas
  onClick: (e: React.MouseEvent) => void;
}) {
  const th = useTheme();
  const { feature: f, pxPerUnit: ppu } = props;
  const sw = (n: number) => n / ppu;
  const name = localName(f, props.lang);

  const stroke = props.selected ? th.palette.primary.main : th.palette.text.secondary;
  const strokeWidth = props.selected ? sw(2.5) : sw(1.5);
  const common = {
    stroke,
    strokeWidth,
    style: {
      cursor: 'pointer',
      ...(props.interactive === false ? { pointerEvents: 'none' as const } : {}),
    } as React.CSSProperties,
    onPointerDown: (e: React.PointerEvent) => { if (props.selected) e.stopPropagation(); },
    onPointerUp: (e: React.PointerEvent) => { e.stopPropagation(); props.onClick(e as unknown as React.MouseEvent); },
  };

  let fill = 'transparent';
  let extraStroke = strokeWidth;
  let dash: string | undefined;
  if (f.kind === 'zone') {
    fill = th.palette.warning.main + '1f'; // translucent tint beneath everything
    dash = `${sw(6)} ${sw(4)}`;
  } else if (f.kind === 'building') {
    fill = th.palette.mode === 'dark' ? '#5d4a3a' : '#a1887f';
  } else if (f.kind === 'plot') {
    if (f.status === 'planted') fill = th.palette.success.main + '33';
    else if (f.status === 'harvest_due') { fill = th.palette.warning.main + '4d'; extraStroke = sw(3.5); }
    else if (f.status === 'fallow') fill = `url(#hatch-fallow)`;
    else { fill = th.palette.action.hover; dash = `${sw(3)} ${sw(3)}`; } // unlinked
  }

  const label = (anchor: SvgPoint, showArea: boolean) => {
    // hide labels that would render tiny and collide
    if (ppu * Math.sqrt(polyExtent(f.geometry)) < 40) return null;
    return (
      <text
        x={anchor[0]} y={anchor[1]}
        textAnchor="middle"
        fontSize={sw(13)}
        fontWeight={600}
        fill={th.palette.text.primary}
        stroke={th.palette.background.paper}
        strokeWidth={sw(3)}
        paintOrder="stroke"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {f.status === 'harvest_due' ? '⚠ ' : ''}{name}
        {showArea && props.areaLabel && (
          <tspan x={anchor[0]} dy={sw(15)} fontSize={sw(11)} fontWeight={400}>{props.areaLabel}</tspan>
        )}
      </text>
    );
  };

  if (f.kind === 'line') {
    return (
      <g>
        <polyline
          points={f.geometry.map((p) => p.join(',')).join(' ')}
          fill="none" {...common}
          strokeWidth={sw(2)} strokeDasharray={`${sw(6)} ${sw(4)}`}
          strokeLinecap="round"
        >
          <title>{name}</title>
        </polyline>
        {label(centroid(f.geometry), false)}
      </g>
    );
  }

  if (f.kind === 'point') {
    const [x, y] = f.geometry[0];
    return (
      <g>
        <circle cx={x} cy={y} r={sw(7)} fill={th.palette.info.main} {...common} stroke={th.palette.background.paper} strokeWidth={sw(2)}>
          <title>{name}</title>
        </circle>
        <text x={x} y={y + sw(20)} textAnchor="middle" fontSize={sw(11)} fontWeight={600}
          fill={th.palette.text.primary} stroke={th.palette.background.paper} strokeWidth={sw(3)} paintOrder="stroke"
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {name}
        </text>
      </g>
    );
  }

  return (
    <g>
      <polygon
        points={f.geometry.map((p) => p.join(',')).join(' ')}
        fill={fill}
        {...common}
        strokeWidth={extraStroke}
        strokeDasharray={dash}
      >
        <title>{name}</title>
      </polygon>
      {label(centroid(f.geometry), f.kind !== 'building')}
    </g>
  );
}

function polyExtent(pts: SvgPoint[]): number {
  if (pts.length < 2) return 0;
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

/** SVG pattern defs shared by the map and the PNG export (fallow hatch). */
export function MapDefs() {
  const th = useTheme();
  return (
    <defs>
      <pattern id="hatch-fallow" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
        <rect width="10" height="10" fill={th.palette.action.hover} />
        <line x1="0" y1="0" x2="0" y2="10" stroke={th.palette.text.disabled} strokeWidth="2" />
      </pattern>
    </defs>
  );
}
