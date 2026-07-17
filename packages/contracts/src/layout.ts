import { z } from 'zod';
import { Ulid } from './herd';
import { isSelfIntersecting, type PointPx } from './geometry';

export const FeatureKind = z.enum(['plot', 'building', 'zone', 'line', 'point']);
export type FeatureKind = z.infer<typeof FeatureKind>;

export const FEATURE_REF_TYPES = ['fodder_plot', 'shed', 'iot_device'] as const;
export const FeatureRefType = z.enum(FEATURE_REF_TYPES);
export type FeatureRefType = z.infer<typeof FeatureRefType>;

const PlanPoint = z.tuple([
  z.number().min(0).max(20000),
  z.number().min(0).max(20000),
]);

export const MIN_VERTICES: Record<FeatureKind, number> = { plot: 3, building: 3, zone: 3, line: 2, point: 1 };
const isPolygonKind = (k: FeatureKind) => MIN_VERTICES[k] === 3;

/** Kind-vs-geometry rules, also re-run by the service on partial updates. */
export function geometryIssue(kind: FeatureKind, geometry: PointPx[]): string | null {
  if (geometry.length < MIN_VERTICES[kind]) return 'errors.geometry_too_few_vertices';
  if (kind === 'point' && geometry.length !== 1) return 'errors.geometry_point_single_vertex';
  if (isPolygonKind(kind) && isSelfIntersecting(geometry)) return 'errors.geometry_self_intersecting';
  return null;
}

const featureBase = z.object({
  kind: FeatureKind,
  name: z.string().trim().min(1).max(120),
  nameBn: z.string().trim().max(120).optional(),
  geometry: z.array(PlanPoint).min(1).max(500),
  refType: FeatureRefType.optional(),
  refId: Ulid.optional(),
  zIndex: z.coerce.number().int().min(-100).max(100).optional(),
  notes: z.string().max(500).optional(),
});

export const CreateFeatureInput = featureBase.superRefine((v, ctx) => {
  const issue = geometryIssue(v.kind, v.geometry as PointPx[]);
  if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue, path: ['geometry'] });
  if ((v.refType === undefined) !== (v.refId === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'errors.ref_type_and_id_together', path: ['refId'] });
  }
});
export type CreateFeatureInput = z.infer<typeof CreateFeatureInput>;

// Partial; refType/refId accept null (both together) to unlink from the panel.
// Kind-vs-geometry is re-checked in the service against the stored row when
// only one side changes.
export const UpdateFeatureInput = featureBase
  .extend({ refType: FeatureRefType.nullish(), refId: Ulid.nullish() })
  .partial()
  .superRefine((v, ctx) => {
    const a = v.refType === undefined ? 'absent' : v.refType === null ? 'null' : 'set';
    const b = v.refId === undefined ? 'absent' : v.refId === null ? 'null' : 'set';
    if (a !== b) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'errors.ref_type_and_id_together', path: ['refId'] });
    }
    if (v.geometry && v.kind) {
      const issue = geometryIssue(v.kind, v.geometry as PointPx[]);
      if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue, path: ['geometry'] });
    }
  });
export type UpdateFeatureInput = z.infer<typeof UpdateFeatureInput>;

// Birbhum sanity band — catches swapped lat/lng, the classic field mistake.
const AnchorInput = z.object({
  x: z.number().min(0).max(20000),
  y: z.number().min(0).max(20000),
  lat: z.number().min(20).max(28),
  lng: z.number().min(85).max(90),
  label: z.string().trim().max(60).optional(),
});
export type AnchorInput = z.infer<typeof AnchorInput>;

export const SetAnchorsInput = z.object({
  anchors: z.array(AnchorInput).min(2).max(8),
}).refine(
  (v) => v.anchors.every((a, i) =>
    v.anchors.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > 1)),
  { message: 'errors.anchors_coincident', path: ['anchors'] },
);
export type SetAnchorsInput = z.infer<typeof SetAnchorsInput>;

/** Multipart sibling fields for PUT /site-layout/plan (file is the upload).
 *  Multipart values arrive as strings; z.coerce.boolean('false') is true, so
 *  coerce explicitly. */
export const ReplacePlanInput = z.object({
  confirmOverride: z.preprocess((v) => v === true || v === 'true', z.boolean()).optional(),
  overrideReason: z.string().trim().max(300).optional(),
});
export type ReplacePlanInput = z.infer<typeof ReplacePlanInput>;
