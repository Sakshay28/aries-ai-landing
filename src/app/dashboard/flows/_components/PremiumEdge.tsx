"use client";

import React, { useState, useCallback } from "react";
import { getBezierPath, type EdgeProps } from "@xyflow/react";

// ─── Color mapping ───────────────────────────────────────────────────────────
function resolveColor(sourceHandleId?: string | null): string {
  if (!sourceHandleId) return "#10b981";
  const h = sourceHandleId.toLowerCase();
  if (h === "error"   || h === "false"   || h.includes("fail")) return "#ef4444";
  if (h === "fallback"|| h === "timeout" || h === "missing")    return "#94a3b8";
  return "#10b981";
}

// ─── Adaptive curvature based on node distance ───────────────────────────────
// Short path → tighter curve (0.15). Long path → gentle arc (0.42). Capped.
function curvature(sx: number, sy: number, tx: number, ty: number): number {
  const d = Math.hypot(tx - sx, ty - sy);
  return Math.min(0.42, Math.max(0.15, d / 1100));
}

// ─── PremiumEdge ─────────────────────────────────────────────────────────────
export function PremiumEdge({
  id,
  sourceX, sourceY, sourcePosition,
  targetX, targetY, targetPosition,
  sourceHandleId,
  selected,
  label,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const active = selected || hovered;

  const color   = resolveColor(sourceHandleId);
  const markerId = `pm-mk-${id}`;

  const [path, lx, ly] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    curvature: curvature(sourceX, sourceY, targetX, targetY),
  });

  const onEnter = useCallback(() => setHovered(true),  []);
  const onLeave = useCallback(() => setHovered(false), []);

  return (
    <g onMouseEnter={onEnter} onMouseLeave={onLeave}>

      {/* ── Custom arrowhead ── */}
      <defs>
        <marker
          id={markerId}
          markerWidth="5"
          markerHeight="5"
          refX="4.8"
          refY="2.5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon
            points="0,0.5 4.5,2.5 0,4.5"
            fill={color}
            opacity={active ? 1 : 0.8}
          />
        </marker>
      </defs>

      {/* ── Fat invisible hit zone (easier to hover/click) ── */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={22} />

      {/* ── Glow halo — only rendered when active, no SVG filter for perf ── */}
      {active && (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeOpacity={0.11}
          strokeLinecap="round"
        />
      )}

      {/* ── Main wire ── */}
      <path
        id={id}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={active ? 2.5 : 1.8}
        strokeOpacity={active ? 1 : 0.68}
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
        className="react-flow__edge-path"
        style={{
          transition: "stroke-width 0.16s ease, stroke-opacity 0.16s ease",
          filter: active ? `drop-shadow(0 0 4px ${color}70)` : undefined,
        }}
      />

      {/* ── Flowing dash layer — subtle data-movement animation ── */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={active ? 1.8 : 1.2}
        strokeOpacity={active ? 0.55 : 0.22}
        strokeLinecap="round"
        strokeDasharray="5 22"
        style={{
          animation: "premiumFlowDash 2.2s linear infinite",
          transition: "stroke-opacity 0.2s ease, stroke-width 0.16s ease",
        }}
      />

      {/* ── Edge label ── */}
      {label && (
        <foreignObject
          x={lx - 30}
          y={ly - 12}
          width={60}
          height={24}
          style={{ overflow: "visible" }}
        >
          <div
            style={{
              display:        "inline-flex",
              alignItems:     "center",
              padding:        "2px 7px",
              fontSize:       10,
              fontWeight:     700,
              letterSpacing:  "0.06em",
              textTransform:  "uppercase",
              color,
              background:     "rgba(6,7,10,0.88)",
              border:         `1px solid ${color}38`,
              borderRadius:   5,
              whiteSpace:     "nowrap",
              userSelect:     "none",
              backdropFilter: "blur(6px)",
            }}
          >
            {label as string}
          </div>
        </foreignObject>
      )}
    </g>
  );
}
