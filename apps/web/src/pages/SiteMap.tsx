import CloseIcon from '@mui/icons-material/Close';
import CropFreeIcon from '@mui/icons-material/CropFree';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import PrintIcon from '@mui/icons-material/Print';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, Link as MuiLink, MenuItem, Slider, Stack, Switch,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  anchorResiduals, MIN_VERTICES, M2_PER_KATHA, polygonAreaM2, polylineLengthM,
  solveTransform, toDisplayArea, type AnchorInput,
} from '@pandora/contracts';
import { api, ApiError } from '../api';
import type { Me } from '../App';
import FeatureShape, { centroid, localName, MapDefs, type MapFeature } from '../components/map/FeatureShape';
import MapCanvas, { type SvgPoint, type ViewBox } from '../components/map/MapCanvas';

type Kind = MapFeature['kind'];
const KINDS: Kind[] = ['plot', 'building', 'zone', 'line', 'point'];
const POLY_KINDS: Kind[] = ['plot', 'building', 'zone'];
const REF_TYPE: Partial<Record<Kind, string>> = { plot: 'fodder_plot', building: 'shed', point: 'iot_device' };

interface Layout {
  id: string; name: string;
  planAttachmentId?: string | null; planWidth?: number | null; planHeight?: number | null;
  anchors: AnchorInput[];
  features: MapFeature[];
}

type CalRow = { x?: number; y?: number; lat: string; lng: string; label: string };
type Drag = { type: 'vertex' | 'body'; idx?: number; last?: SvgPoint } | null;

export default function SiteMap(props: { me: Me }) {
  const { t, i18n } = useTranslation();
  const th = useTheme();
  const qc = useQueryClient();
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const altDown = useRef(false);

  const level = props.me.permissions.layout ?? 'none';
  const canEdit = level === 'edit' || level === 'approve';
  const canApprove = level === 'approve';

  const layoutQ = useQuery({
    queryKey: ['site-layout'],
    queryFn: () => api<{ data: Layout }>('/site-layout').then((r) => r.data),
  });
  const layout = layoutQ.data;
  const features = layout?.features ?? [];
  const hasPlan = !!layout?.planAttachmentId;
  const planW = layout?.planWidth ?? 1000;
  const planH = layout?.planHeight ?? 700;

  const transform = useMemo(
    () => (layout && layout.anchors.length >= 2 ? solveTransform(layout.anchors) : null),
    [layout],
  );
  // with 3+ anchors the fit errors expose bad GPS points; >5 m means areas can't be trusted
  const worstResidual = useMemo(() => {
    if (!layout || layout.anchors.length < 3) return 0;
    return Math.max(...(anchorResiduals(layout.anchors) ?? [0]));
  }, [layout]);
  const calibrationPoor = worstResidual > 5;

  // ── interaction state ──────────────────────────────────────────────
  const [vb, setVb] = useState<ViewBox | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [tool, setTool] = useState<Kind | null>(null);
  const [draft, setDraft] = useState<SvgPoint[]>([]);
  const [cursor, setCursor] = useState<SvgPoint | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<SvgPoint[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [undoStack, setUndoStack] = useState<SvgPoint[][]>([]);
  const [redoStack, setRedoStack] = useState<SvgPoint[][]>([]);
  const [drag, setDrag] = useState<Drag>(null);
  const [lastVertex, setLastVertex] = useState<number | null>(null);
  const [visible, setVisible] = useState<Record<Kind, boolean>>({ plot: true, building: true, zone: true, line: true, point: true });
  const [bgOpacity, setBgOpacity] = useState(100);
  const [saveDialog, setSaveDialog] = useState<{ kind: Kind; geometry: SvgPoint[] } | null>(null);
  const [metaDialog, setMetaDialog] = useState<MapFeature | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [calRows, setCalRows] = useState<CalRow[]>([]);
  const [pickingIdx, setPickingIdx] = useState<number | null>(null);

  const selected = features.find((f) => f.id === selectedId) ?? null;
  const fit = () => setVb({ x: -planW * 0.03, y: -planH * 0.03, w: planW * 1.06, h: planH * 1.06 });
  useEffect(() => { if (layout && !vb) fit(); }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  const wrapW = wrapRef.current?.clientWidth || 800;
  const ppu = vb ? wrapW / vb.w : 1;
  const lang = i18n.language;

  // ── measurement helpers ────────────────────────────────────────────
  const fmtArea = (kind: Kind, pts: SvgPoint[]): string | undefined => {
    if (!transform) return undefined;
    if (kind === 'line') return `${polylineLengthM(pts, transform.s).toFixed(1)} ${t('units.m')}`;
    if (kind === 'point') return undefined;
    const d = toDisplayArea(polygonAreaM2(pts, transform.s));
    if (kind === 'building') return `${d.sqft} ${t('units.sqft')} (${d.m2} ${t('units.m2')})`;
    return `${d.bigha} ${t('units.bigha')} ${d.katha} ${t('units.katha')} (${d.decimal} ${t('units.decimal')})`;
  };
  const shortArea = (kind: Kind, pts: SvgPoint[]): string | undefined => {
    if (!transform || kind === 'point' || kind === 'line' || kind === 'building') return undefined;
    return `${(polygonAreaM2(pts, transform.s) / M2_PER_KATHA).toFixed(1)} ${t('units.katha')}`;
  };

  // ── snapping (8 screen px to any other feature's vertex) ──────────
  const snap = (pt: SvgPoint, excludeId?: string): SvgPoint => {
    if (altDown.current) return pt;
    const r = 8 / ppu;
    let best: SvgPoint | null = null;
    let bestD = r;
    for (const f of features) {
      if (f.id === excludeId || !visible[f.kind]) continue;
      for (const v of f.geometry) {
        const d = Math.hypot(v[0] - pt[0], v[1] - pt[1]);
        if (d < bestD) { bestD = d; best = v; }
      }
    }
    return best ? [best[0], best[1]] : pt;
  };

  // ── mutations ──────────────────────────────────────────────────────
  const refresh = () => qc.invalidateQueries({ queryKey: ['site-layout'] });
  const patchGeometry = useMutation<unknown, ApiError, { id: string; geometry: SvgPoint[] }>({
    mutationFn: (v) => api(`/site-features/${v.id}`, { method: 'PATCH', body: { geometry: v.geometry } }),
    onSuccess: () => { setDirty(false); setUndoStack([]); setRedoStack([]); void refresh(); },
  });
  const removeFeature = useMutation<unknown, ApiError, string>({
    mutationFn: (id) => api(`/site-features/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setSelectedId(null); setBuffer(null); setDirty(false); void refresh(); },
  });
  const unlink = useMutation<unknown, ApiError, string>({
    mutationFn: (id) => api(`/site-features/${id}`, { method: 'PATCH', body: { refType: null, refId: null } }),
    onSuccess: () => void refresh(),
  });

  // ── selection & buffer ─────────────────────────────────────────────
  const select = (f: MapFeature) => {
    if (dirty) return; // save or cancel first
    setSelectedId(f.id);
    setBuffer(editMode ? f.geometry.map((p) => [...p] as SvgPoint) : null);
    setUndoStack([]); setRedoStack([]); setLastVertex(null);
  };
  const cancelBuffer = () => {
    setBuffer(selected ? selected.geometry.map((p) => [...p] as SvgPoint) : null);
    setDirty(false); setUndoStack([]); setRedoStack([]);
  };
  const pushUndo = (from: SvgPoint[]) => {
    setUndoStack((s) => [...s.slice(-30), from.map((p) => [...p] as SvgPoint)]);
    setRedoStack([]);
  };

  // ── drawing ────────────────────────────────────────────────────────
  const finishDraft = () => {
    if (!tool) return;
    if (draft.length >= MIN_VERTICES[tool]) setSaveDialog({ kind: tool, geometry: draft });
    setDraft([]);
  };
  const onClickPoint = (pt: SvgPoint) => {
    if (pickingIdx !== null) {
      setCalRows((rows) => rows.map((r, i) => (i === pickingIdx ? { ...r, x: Math.round(pt[0]), y: Math.round(pt[1]) } : r)));
      setPickingIdx(null); setCalOpen(true);
      return;
    }
    if (editMode && tool) {
      const p = snap(pt);
      if (tool === 'point') { setSaveDialog({ kind: 'point', geometry: [p] }); return; }
      // close polygon by clicking the first vertex again
      if (draft.length >= 3 && POLY_KINDS.includes(tool) && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 8 / ppu) {
        finishDraft(); return;
      }
      setDraft((d) => [...d, p]);
      return;
    }
    if (!dirty) { setSelectedId(null); setBuffer(null); }
  };

  // ── vertex/body drags ──────────────────────────────────────────────
  const onDragPoint = (pt: SvgPoint) => {
    if (!drag || !buffer) return;
    if (drag.type === 'vertex' && drag.idx !== undefined) {
      const p = snap(pt, selectedId ?? undefined);
      setBuffer(buffer.map((v, i) => (i === drag.idx ? p : v)));
    } else if (drag.type === 'body' && drag.last) {
      const dx = pt[0] - drag.last[0]; const dy = pt[1] - drag.last[1];
      setBuffer(buffer.map((v) => [v[0] + dx, v[1] + dy] as SvgPoint));
      setDrag({ ...drag, last: pt });
    }
  };
  const onDragEnd = () => { if (drag) { setDrag(null); setDirty(true); } };

  const deleteVertex = (idx: number) => {
    if (!buffer || !selected) return;
    if (buffer.length <= MIN_VERTICES[selected.kind]) return;
    pushUndo(buffer);
    setBuffer(buffer.filter((_, i) => i !== idx));
    setDirty(true);
  };

  // ── keyboard ───────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') altDown.current = true;
      const inField = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA';
      if (inField) return;
      if (e.key === 'Escape') { setDraft([]); setTool(null); if (!dirty) { setSelectedId(null); setBuffer(null); } }
      if (e.key === 'Enter' && draft.length > 0) finishDraft();
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && editMode && !dirty) {
        if (window.confirm(t('map.deleteConfirm', { name: localName(selected, lang) }))) removeFeature.mutate(selected.id);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && buffer) {
        e.preventDefault();
        if (e.shiftKey) {
          setRedoStack((rs) => {
            if (!rs.length) return rs;
            pushUndo(buffer);
            setBuffer(rs[rs.length - 1]); setDirty(true);
            return rs.slice(0, -1);
          });
        } else {
          setUndoStack((us) => {
            if (!us.length) return us;
            setRedoStack((rs) => [...rs, buffer.map((p) => [...p] as SvgPoint)]);
            setBuffer(us[us.length - 1]); setDirty(true);
            return us.slice(0, -1);
          });
        }
      }
      if (e.key.startsWith('Arrow') && buffer && lastVertex !== null) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        pushUndo(buffer);
        setBuffer(buffer.map((v, i) => (i === lastVertex ? [v[0] + dx, v[1] + dy] as SvgPoint : v)));
        setDirty(true);
      }
    };
    const up = (e: KeyboardEvent) => { if (e.key === 'Alt') altDown.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  // unsaved-changes guard
  useEffect(() => {
    if (!dirty && draft.length === 0) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, draft.length]);

  // ── plan upload ────────────────────────────────────────────────────
  const uploadPlan = async (file: File, override?: { reason: string }) => {
    const fd = new FormData();
    fd.append('file', file);
    if (override) { fd.append('confirmOverride', 'true'); fd.append('overrideReason', override.reason); }
    try {
      await api('/site-layout/plan', { method: 'PUT', form: fd });
      void refresh(); setVb(null); // refit to the new image
    } catch (e) {
      if (e instanceof ApiError && e.code === 'RULE_OVERRIDE_REQUIRED') {
        if (window.confirm(t('map.planOverride'))) {
          const reason = window.prompt(t('form.reason')) ?? '';
          if (reason.trim()) await uploadPlan(file, { reason });
        }
        return;
      }
      throw e;
    }
  };

  // ── export ─────────────────────────────────────────────────────────
  const exportPng = async (print: boolean) => {
    const live = document.getElementById('farm-map-svg') as SVGSVGElement | null;
    if (!live) return;
    const clone = live.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('[data-noexport]').forEach((n) => n.remove());
    clone.setAttribute('viewBox', `0 0 ${planW} ${planH}`);
    clone.setAttribute('width', String(planW));
    clone.setAttribute('height', String(planH));
    const img = clone.querySelector('image');
    if (img && hasPlan) {
      const blob = await fetch('/api/v1/site-layout/plan', { credentials: 'include' }).then((r) => r.blob());
      const dataUrl = await new Promise<string>((res) => {
        const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(blob);
      });
      img.setAttribute('href', dataUrl);
    }
    const svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    const image = new Image();
    await new Promise((res, rej) => { image.onload = res; image.onerror = rej; image.src = svgUrl; });
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = planW * scale; canvas.height = planH * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(svgUrl);
    drawLegend(ctx, canvas.height, scale, th.palette.success.main, th.palette.warning.main, [
      t('status.planted'), t('status.harvest_due'), t('status.fallow'),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    if (print) {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(
        `<html><head><title>${layout?.name ?? ''} — ${stamp}</title></head>`
        + `<body style="margin:16px;font-family:sans-serif"><h3 style="margin:0 0 8px">${layout?.name ?? ''} — ${stamp}</h3>`
        + `<img src="${canvas.toDataURL('image/png')}" style="max-width:100%" onload="window.print()"/></body></html>`,
      );
      w.document.close();
    } else {
      canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `farm-map-${stamp}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    }
  };

  // ── calibration ────────────────────────────────────────────────────
  const openCalibrate = () => {
    setCalRows(
      (layout?.anchors ?? []).map((a) => ({ x: a.x, y: a.y, lat: String(a.lat), lng: String(a.lng), label: a.label ?? '' })),
    );
    setCalOpen(true);
  };
  const validAnchors = (): AnchorInput[] =>
    calRows
      .filter((r) => r.x !== undefined && r.lat.trim() && r.lng.trim())
      .map((r) => ({ x: r.x!, y: r.y!, lat: Number(r.lat), lng: Number(r.lng), ...(r.label.trim() ? { label: r.label.trim() } : {}) }))
      .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng));
  const saveAnchors = useMutation<unknown, ApiError, AnchorInput[]>({
    mutationFn: (anchors) => api('/site-layout/anchors', { method: 'PUT', body: { anchors } }),
    onSuccess: () => { setCalOpen(false); void refresh(); },
  });

  if (layoutQ.isLoading || !vb) return null;

  const mappedRefIds = new Set(features.filter((f) => f.refId).map((f) => `${f.refType}:${f.refId}`));
  const renderGeometry = (f: MapFeature) => (f.id === selectedId && buffer ? { ...f, geometry: buffer } : f);
  const sortedVisible = features.filter((f) => visible[f.kind]).map(renderGeometry);

  return (
    <Stack spacing={1.5} sx={{ height: 'calc(100vh - 96px)' }}>
      {/* toolbar */}
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        <Typography variant="h6" sx={{ mr: 1 }}>{t('nav.map')}</Typography>
        {KINDS.map((k) => (
          <Chip
            key={k} size="small" label={t(`map.kind.${k}`)}
            variant={visible[k] ? 'filled' : 'outlined'}
            onClick={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
          />
        ))}
        <Box sx={{ flexGrow: 1 }} />
        {!transform && (
          <Chip size="small" color="warning" icon={<GpsFixedIcon />} label={t('map.notCalibrated')}
            onClick={canApprove ? openCalibrate : undefined} />
        )}
        {transform && calibrationPoor && (
          <Chip size="small" color="warning" icon={<GpsFixedIcon />}
            label={t('map.poorCalibration', { m: worstResidual.toFixed(0) })}
            onClick={canApprove ? openCalibrate : undefined} />
        )}
        {transform && canApprove && (
          <Tooltip title={t('map.scale', { m: transform.s.toFixed(3) })}>
            <Button size="small" startIcon={<GpsFixedIcon />} onClick={openCalibrate}>{t('map.calibrate')}</Button>
          </Tooltip>
        )}
        {canApprove && (
          <Button size="small" startIcon={<UploadFileIcon />} onClick={() => fileRef.current?.click()}>
            {hasPlan ? t('map.replacePlan') : t('map.uploadPlan')}
          </Button>
        )}
        <IconButton size="small" onClick={fit} aria-label={t('map.fit')}><CropFreeIcon /></IconButton>
        <Button size="small" startIcon={<DownloadIcon />} onClick={() => void exportPng(false)}>{t('map.exportPng')}</Button>
        <Button size="small" startIcon={<PrintIcon />} onClick={() => void exportPng(true)}>{t('map.print')}</Button>
        {canEdit && (
          <Tooltip title={t('map.editMode')}>
          <Stack direction="row" alignItems="center">
            <EditIcon fontSize="small" color={editMode ? 'primary' : 'disabled'} />
            <Switch size="small" checked={editMode} onChange={(e) => {
              setEditMode(e.target.checked); setTool(null); setDraft([]);
              if (!e.target.checked) { setBuffer(null); setDirty(false); }
              else if (selected) setBuffer(selected.geometry.map((p) => [...p] as SvgPoint));
            }} />
          </Stack>
          </Tooltip>
        )}
      </Stack>

      {/* edit toolbar */}
      {editMode && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <ToggleButtonGroup size="small" exclusive value={tool}
            onChange={(_, v: Kind | null) => { setTool(v); setDraft([]); }}>
            {KINDS.map((k) => (
              <ToggleButton key={k} value={k}>{t(`map.kind.${k}`)}</ToggleButton>
            ))}
          </ToggleButtonGroup>
          {tool && <Typography variant="body2" color="text.secondary">{t('map.finishHint')}</Typography>}
          {hasPlan && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ width: 160, ml: 'auto' }}>
              <Typography variant="caption" color="text.secondary">{t('map.bgOpacity')}</Typography>
              <Slider size="small" min={20} max={100} value={bgOpacity} onChange={(_, v) => setBgOpacity(v as number)} />
            </Stack>
          )}
        </Stack>
      )}

      {/* save/cancel bar */}
      {dirty && selected && (
        <Alert
          severity="info"
          action={
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={cancelBuffer}>{t('form.cancel')}</Button>
              <Button size="small" variant="contained" disabled={patchGeometry.isPending}
                onClick={() => buffer && patchGeometry.mutate({ id: selected.id, geometry: buffer })}>
                {t('form.save')}
              </Button>
            </Stack>
          }
        >
          {localName(selected, lang)} — {t('map.unsaved')}
        </Alert>
      )}

      {/* canvas + panel */}
      <Stack direction="row" spacing={1.5} sx={{ flexGrow: 1, minHeight: 0 }}>
        <Box ref={wrapRef} sx={{ flexGrow: 1, minWidth: 0, border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden', position: 'relative', bgcolor: 'background.default' }}>
          <MapCanvas
            viewBox={vb} onViewBox={setVb} contentSize={{ w: planW, h: planH }}
            dragging={!!drag}
            onClickPoint={onClickPoint}
            onMovePoint={setCursor}
            onDragPoint={onDragPoint}
            onDragEnd={onDragEnd}
            cursor={tool || pickingIdx !== null ? 'crosshair' : 'default'}
          >
            <g id="farm-map-root">
              <MapDefs />
              {hasPlan ? (
                <image href="/api/v1/site-layout/plan" x={0} y={0} width={planW} height={planH} opacity={bgOpacity / 100} />
              ) : (
                <rect x={0} y={0} width={planW} height={planH} fill={th.palette.action.hover} />
              )}
              {sortedVisible.map((f) => (
                <FeatureShape
                  key={f.id} feature={f} lang={lang}
                  selected={f.id === selectedId}
                  pxPerUnit={ppu}
                  areaLabel={shortArea(f.kind, f.geometry)}
                  interactive={!(editMode && tool) && pickingIdx === null}
                  onClick={() => select(f)}
                />
              ))}
              {/* vertex handles */}
              {editMode && selected && buffer && (
                <g data-noexport>
                  {buffer.map((v, i) => {
                    const mid: SvgPoint = [
                      (v[0] + buffer[(i + 1) % buffer.length][0]) / 2,
                      (v[1] + buffer[(i + 1) % buffer.length][1]) / 2,
                    ];
                    const showMid = selected.kind !== 'point' && (POLY_KINDS.includes(selected.kind) || i < buffer.length - 1);
                    return (
                      <g key={i}>
                        {showMid && (
                          <circle
                            cx={mid[0]} cy={mid[1]} r={5 / ppu}
                            fill={th.palette.background.paper} stroke={th.palette.primary.main} strokeWidth={1.5 / ppu}
                            style={{ cursor: 'copy' }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              pushUndo(buffer);
                              const nb = [...buffer.slice(0, i + 1), mid, ...buffer.slice(i + 1)];
                              setBuffer(nb);
                              setLastVertex(i + 1);
                              setDrag({ type: 'vertex', idx: i + 1 });
                            }}
                          />
                        )}
                        <circle
                          cx={v[0]} cy={v[1]} r={6 / ppu}
                          fill={th.palette.primary.main} stroke={th.palette.background.paper} strokeWidth={1.5 / ppu}
                          style={{ cursor: 'move' }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            pushUndo(buffer);
                            setLastVertex(i);
                            setDrag({ type: 'vertex', idx: i });
                          }}
                          onContextMenu={(e) => { e.preventDefault(); deleteVertex(i); }}
                        />
                      </g>
                    );
                  })}
                  {/* body-drag grip at centroid */}
                  {buffer.length > 1 && (
                    <circle
                      cx={centroid(buffer)[0]} cy={centroid(buffer)[1]} r={8 / ppu}
                      fill={th.palette.primary.main + '55'} stroke={th.palette.primary.main} strokeWidth={1.5 / ppu}
                      style={{ cursor: 'grab' }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        pushUndo(buffer);
                        setDrag({ type: 'body', last: centroid(buffer) });
                      }}
                    />
                  )}
                </g>
              )}
              {/* in-progress draft */}
              {draft.length > 0 && tool && (
                <g data-noexport>
                  <polyline
                    points={[...draft, ...(cursor ? [cursor] : [])].map((p) => p.join(',')).join(' ')}
                    fill={POLY_KINDS.includes(tool) ? th.palette.primary.main + '22' : 'none'}
                    stroke={th.palette.primary.main} strokeWidth={2 / ppu} strokeDasharray={`${4 / ppu} ${3 / ppu}`}
                  />
                  {draft.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={4 / ppu} fill={th.palette.primary.main} />
                  ))}
                  {cursor && transform && draft.length >= 2 && POLY_KINDS.includes(tool) && (
                    <text x={cursor[0]} y={cursor[1] - 12 / ppu} fontSize={12 / ppu} fontWeight={600}
                      fill={th.palette.text.primary} stroke={th.palette.background.paper} strokeWidth={3 / ppu} paintOrder="stroke">
                      {fmtArea(tool, [...draft, cursor])}
                    </text>
                  )}
                </g>
              )}
            </g>
          </MapCanvas>

          {/* hidden svg id target for export: MapCanvas renders the actual <svg>; tag it */}
          <ExportTagger />

          {pickingIdx !== null && (
            <Alert severity="info" sx={{ position: 'absolute', top: 8, left: 8, right: 8 }}
              action={<Button size="small" onClick={() => { setPickingIdx(null); setCalOpen(true); }}>{t('form.cancel')}</Button>}>
              {t('map.anchor.clickMap')}
            </Alert>
          )}

          {!hasPlan && canApprove && (
            <Card sx={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', maxWidth: 360 }}>
              <CardContent>
                <Typography variant="body2" sx={{ mb: 1.5 }}>{t('map.noPlan')}</Typography>
                <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => fileRef.current?.click()}>
                  {t('map.uploadPlan')}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* legend */}
          <Card sx={{ position: 'absolute', bottom: 8, left: 8, opacity: 0.92 }}>
            <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
              <Typography variant="caption" fontWeight={700}>{t('map.legend')}</Typography>
              {([['planted', th.palette.success.main + '55'], ['harvest_due', th.palette.warning.main + '77'], ['fallow', th.palette.text.disabled]] as const).map(([s, c]) => (
                <Stack key={s} direction="row" alignItems="center" spacing={0.75}>
                  <Box sx={{ width: 12, height: 12, bgcolor: c, border: 1, borderColor: 'divider', borderRadius: 0.5 }} />
                  <Typography variant="caption">{t(`status.${s}`)}</Typography>
                </Stack>
              ))}
            </CardContent>
          </Card>
        </Box>

        {/* side panel */}
        {selected && (
          <SidePanel
            feature={selected}
            areaLabel={fmtArea(selected.kind, buffer ?? selected.geometry)}
            calibrationWarning={calibrationPoor ? t('map.poorCalibration', { m: worstResidual.toFixed(0) }) : undefined}
            transformScale={transform?.s ?? null}
            canEdit={canEdit}
            editMode={editMode && canEdit}
            onClose={() => { if (!dirty) { setSelectedId(null); setBuffer(null); } }}
            onEditMeta={() => setMetaDialog(selected)}
            onUnlink={() => unlink.mutate(selected.id)}
            onDelete={() => {
              if (window.confirm(t('map.deleteConfirm', { name: localName(selected, lang) }))) removeFeature.mutate(selected.id);
            }}
          />
        )}
      </Stack>

      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadPlan(f); }} />

      {saveDialog && (
        <FeatureDialog
          mode="create" kind={saveDialog.kind} geometry={saveDialog.geometry}
          mappedRefIds={mappedRefIds}
          onClose={(saved) => { setSaveDialog(null); if (saved) { setTool(null); void refresh(); } }}
        />
      )}
      {metaDialog && (
        <FeatureDialog
          mode="meta" feature={metaDialog} kind={metaDialog.kind} geometry={metaDialog.geometry}
          mappedRefIds={mappedRefIds}
          onClose={(saved) => { setMetaDialog(null); if (saved) void refresh(); }}
        />
      )}
      {calOpen && (
        <CalibrateDialog
          rows={calRows} setRows={setCalRows}
          onPick={(i) => { setPickingIdx(i); setCalOpen(false); }}
          busy={saveAnchors.isPending}
          error={saveAnchors.error}
          planDiag={Math.hypot(planW, planH)}
          onSave={() => { const a = validAnchors(); if (a.length >= 2) saveAnchors.mutate(a); }}
          onClose={() => setCalOpen(false)}
          validAnchors={validAnchors()}
        />
      )}
    </Stack>
  );
}

/** MapCanvas owns the <svg>; give it the id the export code looks for. */
function ExportTagger() {
  useEffect(() => {
    const root = document.getElementById('farm-map-root') as unknown as SVGGElement | null;
    root?.ownerSVGElement?.setAttribute('id', 'farm-map-svg');
  });
  return null;
}

function drawLegend(
  ctx: CanvasRenderingContext2D, canvasH: number, scale: number,
  green: string, amber: string, labels: string[],
) {
  const pad = 12 * scale; const row = 20 * scale; const sw = 14 * scale;
  const w = 150 * scale; const h = row * labels.length + pad * 1.5;
  const x = pad; const y = canvasH - h - pad;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#999'; ctx.strokeRect(x, y, w, h);
  const colors = [green, amber, '#9e9e9e'];
  ctx.font = `${11 * scale}px sans-serif`;
  labels.forEach((label, i) => {
    ctx.fillStyle = colors[i];
    ctx.fillRect(x + pad / 2, y + pad / 2 + i * row, sw, sw);
    ctx.fillStyle = '#000';
    ctx.fillText(label, x + pad / 2 + sw + 6 * scale, y + pad / 2 + i * row + sw - 3 * scale);
  });
}

// ── side panel ─────────────────────────────────────────────────────────
function SidePanel(props: {
  feature: MapFeature;
  areaLabel?: string;
  calibrationWarning?: string;
  transformScale: number | null;
  canEdit: boolean;
  editMode: boolean;
  onClose: () => void;
  onEditMeta: () => void;
  onUnlink: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const f = props.feature;
  const name = localName(f, i18n.language);
  const recorded = f.plot?.areaDecimal ? Number(f.plot.areaDecimal) : null;
  const computedDec = props.transformScale && POLY_KINDS.includes(f.kind)
    ? toDisplayArea(polygonAreaM2(f.geometry, props.transformScale)).decimal
    : null;
  const mismatchPct = recorded && computedDec && recorded > 0
    ? Math.round(Math.abs(computedDec - recorded) / recorded * 100)
    : null;

  return (
    <Card sx={{ width: 300, flexShrink: 0, overflowY: 'auto' }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography fontWeight={700} sx={{ flexGrow: 1 }}>{name}</Typography>
          <Chip size="small" label={t(`map.kind.${f.kind}`)} />
          <IconButton size="small" onClick={props.onClose}><CloseIcon fontSize="small" /></IconButton>
        </Stack>

        {f.linkBroken && (
          <Alert severity="warning" sx={{ mt: 1 }}
            action={props.editMode ? <Button size="small" onClick={props.onUnlink}>{t('map.unlink')}</Button> : undefined}>
            {t('map.linkBroken')}
          </Alert>
        )}

        {f.status && (
          <Chip size="small" sx={{ mt: 1 }}
            color={f.status === 'planted' ? 'success' : f.status === 'harvest_due' ? 'warning' : 'default'}
            label={t(`status.${f.status}`)} />
        )}

        <Stack spacing={0.75} sx={{ mt: 1.5 }}>
          {props.areaLabel && <Row k={t('map.computedArea')} v={props.areaLabel} />}
          {props.areaLabel && props.calibrationWarning && (
            <Alert severity="warning" sx={{ py: 0 }}>{props.calibrationWarning}</Alert>
          )}
          {recorded !== null && (
            <Row k={t('map.recordedArea')} v={`${recorded} ${t('units.decimal')}`} />
          )}
          {mismatchPct !== null && mismatchPct > 10 && (
            <Alert severity="info" sx={{ py: 0 }}>{t('map.areaMismatch', { pct: mismatchPct })}</Alert>
          )}
          {f.plot?.block && <Row k={t('fod.block')} v={f.plot.block} />}
          {f.plot?.crop && (
            <>
              <Divider sx={{ my: 0.5 }} />
              <Row k={t('fod.crop')} v={`${f.plot.crop.cropName}${f.plot.crop.variety ? ` (${f.plot.crop.variety})` : ''}`} />
              <Row k={t('fod.sownOn')} v={String(f.plot.crop.sownOn).slice(0, 10)} />
              <Row k={t('map.age')} v={t('fod.ageDays', { d: f.plot.crop.ageDays })} />
              {f.plot.crop.expectedHarvestOn && (
                <Row k={t('map.expectedHarvest')} v={String(f.plot.crop.expectedHarvestOn).slice(0, 10)} />
              )}
              <Row k={t('fod.yield')} v={`${f.plot.crop.totalYieldKg} kg · ${f.plot.crop.cuts}×`} />
            </>
          )}
          {f.shed && <Row k={t('map.linkTo')} v={(i18n.language === 'bn' ? f.shed.nameBn : null) ?? f.shed.name} />}
          {f.device && (
            <>
              <Row k={t('map.device')} v={`${f.device.deviceType} · ${f.device.serialNumber}`} />
              {f.device.installLocation && <Row k={t('map.installLocation')} v={f.device.installLocation} />}
            </>
          )}
          {f.notes && <Row k={t('form.notes')} v={f.notes} />}
        </Stack>

        {f.refType === 'fodder_plot' && !f.linkBroken && (
          <MuiLink component={Link} to={`/fodder?plot=${f.refId}`} sx={{ display: 'block', mt: 1.5, fontSize: 14 }}>
            {t('map.openFodder')}
          </MuiLink>
        )}

        {props.canEdit && (
          <>
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button size="small" disabled={!props.editMode} onClick={props.onEditMeta}>{t('map.editDetails')}</Button>
              {f.refId && !f.linkBroken && (
                <Button size="small" disabled={!props.editMode} onClick={props.onUnlink}>{t('map.unlink')}</Button>
              )}
              <Box sx={{ flexGrow: 1 }} />
              <Tooltip title={props.editMode ? t('map.delete') : t('map.editModeHint')}>
                <span>
                  <IconButton size="small" color="error" disabled={!props.editMode} onClick={props.onDelete}
                    aria-label={t('map.delete')}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
            {!props.editMode && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {t('map.editModeHint')}
              </Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row(props: { k: string; v: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={1}>
      <Typography variant="body2" color="text.secondary">{props.k}</Typography>
      <Typography variant="body2" textAlign="right">{props.v}</Typography>
    </Stack>
  );
}

// ── create / edit-details dialog ───────────────────────────────────────
function FeatureDialog(props: {
  mode: 'create' | 'meta';
  kind: Kind;
  geometry: SvgPoint[];
  feature?: MapFeature;
  mappedRefIds: Set<string>;
  onClose: (saved: boolean) => void;
}) {
  const { t } = useTranslation();
  const f = props.feature;
  const [kind, setKind] = useState<Kind>(props.kind);
  const [name, setName] = useState(f?.name ?? '');
  const [nameBn, setNameBn] = useState(f?.nameBn ?? '');
  const [refId, setRefId] = useState(f?.refId ?? '');
  const [notes, setNotes] = useState(f?.notes ?? '');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const kindOptions: Kind[] = POLY_KINDS.includes(props.kind) ? POLY_KINDS : [props.kind];
  const refType = REF_TYPE[kind];

  const linkQ = useQuery({
    queryKey: ['map-link-options', refType],
    enabled: !!refType,
    queryFn: () => {
      const path = refType === 'fodder_plot' ? '/fodder-plots' : refType === 'shed' ? '/sheds' : '/iot/devices';
      return api<{ data: any[] }>(path).then((r) => r.data);
    },
  });
  const options = (linkQ.data ?? []).filter(
    (o) => !props.mappedRefIds.has(`${refType}:${o.id}`) || o.id === f?.refId,
  );

  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (props.mode === 'create') {
        await api('/site-features', {
          method: 'POST',
          body: {
            kind, name, geometry: props.geometry,
            ...(nameBn.trim() ? { nameBn: nameBn.trim() } : {}),
            ...(refType && refId ? { refType, refId } : {}),
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          },
        });
      } else {
        await api(`/site-features/${f!.id}`, {
          method: 'PATCH',
          body: {
            name,
            nameBn: nameBn.trim() || undefined,
            notes: notes.trim() || undefined,
            ...(refType
              ? refId
                ? { refType, refId }
                : f?.refId ? { refType: null, refId: null } : {}
              : {}),
          },
        });
      }
      props.onClose(true);
    } catch (e) {
      setError(e as ApiError);
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{props.mode === 'create' ? t('map.newFeature') : t('map.editDetails')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          {props.mode === 'create' && kindOptions.length > 1 && (
            <TextField select label={t('map.kindLabel')} value={kind}
              onChange={(e) => { setKind(e.target.value as Kind); setRefId(''); }}>
              {kindOptions.map((k) => <MenuItem key={k} value={k}>{t(`map.kind.${k}`)}</MenuItem>)}
            </TextField>
          )}
          <TextField required autoFocus label={t('map.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label={t('map.nameBn')} value={nameBn} onChange={(e) => setNameBn(e.target.value)} />
          {refType && (
            <TextField select label={t('map.linkTo')} value={refId} onChange={(e) => setRefId(e.target.value)}>
              <MenuItem value="">{t('map.noLink')}</MenuItem>
              {options.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {o.name ?? o.serialNumber}{o.block ? ` · ${o.block}` : ''}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField label={t('form.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!name.trim() || busy} onClick={() => void save()}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── calibration dialog ─────────────────────────────────────────────────
function CalibrateDialog(props: {
  rows: CalRow[];
  setRows: (fn: (rows: CalRow[]) => CalRow[]) => void;
  validAnchors: AnchorInput[];
  onPick: (idx: number) => void;
  onSave: () => void;
  onClose: () => void;
  busy: boolean;
  error: ApiError | null;
  planDiag: number;
}) {
  const { t } = useTranslation();
  const anchors = props.validAnchors;
  const transform = anchors.length >= 2 ? solveTransform(anchors) : null;
  const residuals = anchors.length >= 3 ? anchorResiduals(anchors) : null;
  const maxBaseline = anchors.length >= 2
    ? Math.max(...anchors.flatMap((a, i) => anchors.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y))))
    : 0;

  const setRow = (i: number, patch: Partial<CalRow>) =>
    props.setRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // paste "23.9061, 87.5412" into the lat field → fills both
  const onLat = (i: number, v: string) => {
    const m = v.match(/^\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)\s*$/);
    if (m) setRow(i, { lat: m[1], lng: m[2] });
    else setRow(i, { lat: v });
  };

  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('map.anchors')}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {props.error && <Alert severity="error">{String(t(props.error.messageCode))}</Alert>}
          <Typography variant="body2" color="text.secondary">{t('map.gpsHint')}</Typography>
          {props.rows.map((r, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="center">
              <Button size="small" variant={r.x !== undefined ? 'outlined' : 'contained'} onClick={() => props.onPick(i)}>
                {r.x !== undefined ? `${r.x}, ${r.y}` : t('map.anchor.pick')}
              </Button>
              <TextField size="small" label="Lat" value={r.lat} sx={{ width: 130 }}
                onChange={(e) => onLat(i, e.target.value)} />
              <TextField size="small" label="Lng" value={r.lng} sx={{ width: 130 }}
                onChange={(e) => setRow(i, { lng: e.target.value })} />
              <TextField size="small" label={t('map.anchor.label')} value={r.label} sx={{ flexGrow: 1 }}
                onChange={(e) => setRow(i, { label: e.target.value })} />
              {residuals && residuals[i] !== undefined && (
                <Chip size="small" color={residuals[i] > 5 ? 'warning' : 'default'}
                  label={t('map.anchor.residual', { m: residuals[i].toFixed(1) })} />
              )}
              <IconButton size="small" onClick={() => props.setRows((rows) => rows.filter((_, j) => j !== i))}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          {props.rows.length < 8 && (
            <Button size="small" sx={{ alignSelf: 'flex-start' }}
              onClick={() => props.setRows((rows) => [...rows, { lat: '', lng: '', label: '' }])}>
              {t('map.anchor.add')}
            </Button>
          )}
          {transform && (
            <Alert severity="success" sx={{ py: 0 }}>{t('map.scale', { m: transform.s.toFixed(3) })}</Alert>
          )}
          {residuals && Math.max(...residuals) > 5 && (
            <Alert severity="warning" sx={{ py: 0 }}>
              {t('map.residualWarning', {
                n: residuals.indexOf(Math.max(...residuals)) + 1,
                m: Math.max(...residuals).toFixed(0),
              })}
            </Alert>
          )}
          {anchors.length >= 2 && maxBaseline < props.planDiag * 0.25 && (
            <Alert severity="warning" sx={{ py: 0 }}>{t('map.baselineWarning')}</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={anchors.length < 2 || props.busy} onClick={props.onSave}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
