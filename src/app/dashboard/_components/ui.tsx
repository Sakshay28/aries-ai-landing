"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

/* ─────────────────── Card ─────────────────── */
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white p-5 md:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

/* ─────────────────── Badge ─────────────────── */
type BadgeColor = "success" | "error" | "warning" | "info" | "neutral";

const badgeStyles: Record<BadgeColor, string> = {
  success: "bg-emerald-50 text-emerald-700",
  error: "bg-rose-50 text-rose-700",
  warning: "bg-amber-50 text-amber-700",
  info: "bg-indigo-50 text-indigo-700",
  neutral: "bg-gray-100 text-gray-700",
};

export function Badge({
  color = "neutral",
  children,
  className = "",
}: {
  color?: BadgeColor;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyles[color]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ─────────────────── MetricCard ─────────────────── */
export function MetricCard({
  label,
  value,
  delta,
  trend = "up",
  icon,
  helper,
}: {
  label: string;
  value: string | number;
  delta?: string;
  trend?: "up" | "down";
  icon: ReactNode;
  helper?: string;
}) {
  return (
    <Card>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
        {icon}
      </div>
      <div className="mt-5 flex items-end justify-between">
        <div>
          <span className="text-sm text-gray-500">{label}</span>
          <h4 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
            {value}
          </h4>
          {helper && <p className="mt-1 text-xs text-gray-400">{helper}</p>}
        </div>
        {delta && (
          <Badge color={trend === "up" ? "success" : "error"}>
            {trend === "up" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {delta}
          </Badge>
        )}
      </div>
    </Card>
  );
}

/* ─────────────────── ChartCard ─────────────────── */
export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div>{children}</div>
    </Card>
  );
}

/* ─────────────────── DataTable ─────────────────── */
export type Column<T> = {
  key: keyof T | string;
  header: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => ReactNode;
  width?: string;
};

export function DataTable<T extends { id?: string | number }>({
  columns,
  rows,
  empty = "No records found",
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            {columns.map((c) => (
              <th
                key={String(c.key)}
                style={c.width ? { width: c.width } : undefined}
                className={[
                  "py-3 text-xs font-semibold uppercase tracking-wide text-gray-500",
                  c.align === "right"
                    ? "text-right"
                    : c.align === "center"
                      ? "text-center"
                      : "text-left",
                ].join(" ")}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-12 text-center text-sm text-gray-400"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id ?? i}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
              >
                {columns.map((c) => (
                  <td
                    key={String(c.key)}
                    className={[
                      "py-3 text-gray-700",
                      c.align === "right"
                        ? "text-right"
                        : c.align === "center"
                          ? "text-center"
                          : "text-left",
                    ].join(" ")}
                  >
                    {c.render
                      ? c.render(row)
                      : ((row as Record<string, unknown>)[c.key as string] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
