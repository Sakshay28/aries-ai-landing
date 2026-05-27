"use client";

// ═══════════════════════════════════════════════════════════
// ✏️  VariableTextarea — autocomplete for {{variable}} syntax
// ═══════════════════════════════════════════════════════════
// Renders a <textarea> that opens a dropdown whenever the
// user types `{{` (or `{`), listing all flow variables.
// Arrow keys + Enter navigate; click also works.
// ═══════════════════════════════════════════════════════════

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import type { VariableDefinition } from "@/lib/flows/variables";

const SOURCE_COLORS: Record<string, string> = {
  system:  "#3B82F6",
  flow:    "#22C55E",
  session: "#A855F7",
};

interface Props {
  value: string;
  onChange: (val: string) => void;
  variables: VariableDefinition[];
  placeholder?: string;
  rows?: number;
  className?: string;
}

export default function VariableTextarea({ value, onChange, variables, placeholder, rows = 4, className = "" }: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ─── Compute dropdown screen position (avoids overflow-hidden clipping) ─────
  const computeDropdownPos = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const rect = ta.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
  }, []);

  // ─── Detect when user just typed {{ (or {) ────────────────
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart ?? 0;
    onChange(val);

    // Match partial {{ or { before cursor
    const before = val.slice(0, pos);
    const match = before.match(/\{\{?(\w*)$/);
    if (match && before.endsWith('{')) {
      setDropdownSearch("");
      setShowDropdown(true);
      setActiveIdx(0);
      computeDropdownPos();
    } else if (match && before.match(/\{\{\w*$/)) {
      setDropdownSearch(match[1] ?? "");
      setShowDropdown(true);
      setActiveIdx(0);
      computeDropdownPos();
    } else {
      setShowDropdown(false);
    }
  }, [onChange, computeDropdownPos]);

  // ─── Filter variables by search ──────────────────────────
  const filteredVars = useMemo(() => variables.filter(v =>
    !dropdownSearch || v.name.toLowerCase().includes(dropdownSearch.toLowerCase()) || v.label.toLowerCase().includes(dropdownSearch.toLowerCase())
  ).slice(0, 14), [variables, dropdownSearch]);

  // ─── Insert selected variable ─────────────────────────────
  const insertVariable = useCallback((varName: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    // Replace the partial {{ + word
    const newBefore = before.replace(/\{\{(\w*)$/, `{{${varName}}}`);
    const newVal = newBefore + after;
    onChange(newVal);
    setShowDropdown(false);
    // Restore focus + move cursor after inserted variable
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = newBefore.length;
    }, 0);
  }, [value, onChange]);

  // ─── Keyboard navigation ──────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showDropdown || filteredVars.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filteredVars.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (filteredVars[activeIdx]) insertVariable(filteredVars[activeIdx].name);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }, [showDropdown, filteredVars, activeIdx, insertVariable]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && !textareaRef.current?.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    const el = dropdownRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={`w-full resize-none text-[13px] focus:outline-none leading-relaxed ${className}`}
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 12,
          color: 'rgba(255,255,255,0.85)',
          padding: '10px 12px',
          fontFamily: 'inherit',
        }}
        onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.18)'; }}
        onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.09)'; }}
      />

      {/* Variable hint */}
      <p className="mt-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
        Type <span style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{'{{'}</span> to insert a variable
      </p>

      {/* Autocomplete dropdown — portal to body to avoid overflow-hidden clipping */}
      {showDropdown && dropdownPos && typeof window !== 'undefined' && (
        <DropdownPortal
          dropdownRef={dropdownRef}
          filteredVars={filteredVars}
          activeIdx={activeIdx}
          setActiveIdx={setActiveIdx}
          insertVariable={insertVariable}
          dropdownPos={dropdownPos}
          dropdownSearch={dropdownSearch}
        />
      )}

      {/* Highlight {{vars}} in text display — purely informational */}
      {containsVar(value) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {extractVarNames(value).map(name => (
            <span key={name} className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>
              {`{{${name}}}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function containsVar(text: string): boolean { return /\{\{\w+\}\}/.test(text); }
function extractVarNames(text: string): string[] {
  return [...new Set((text.match(/\{\{(\w+)\}\}/g) ?? []).map(m => m.slice(2, -2)))];
}

// ─── Portal dropdown (avoids overflow-hidden clipping in inspector) ───────────
function DropdownPortal({
  dropdownRef, filteredVars, activeIdx, setActiveIdx, insertVariable, dropdownPos, dropdownSearch,
}: {
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  filteredVars: VariableDefinition[];
  activeIdx: number;
  setActiveIdx: (i: number) => void;
  insertVariable: (name: string) => void;
  dropdownPos: { top: number; left: number; width: number };
  dropdownSearch: string;
}) {
  if (typeof document === 'undefined') return null;
  return ReactDOM.createPortal(
    <div
      ref={dropdownRef}
      className="max-h-52 overflow-y-auto rounded-xl shadow-2xl"
      style={{
        position: 'absolute',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        zIndex: 9999,
        background: '#141920',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      }}
    >
      {filteredVars.length === 0 ? (
        <div className="px-3 py-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          No variables match <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{`{{${dropdownSearch}`}</span>
        </div>
      ) : filteredVars.map((v, idx) => (
        <button
          key={v.name}
          data-idx={idx}
          onMouseDown={e => { e.preventDefault(); insertVariable(v.name); }}
          className="w-full flex items-center justify-between px-3 py-2 text-left"
          style={{ background: idx === activeIdx ? 'rgba(255,255,255,0.08)' : 'transparent' }}
          onMouseEnter={() => setActiveIdx(idx)}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: `${SOURCE_COLORS[v.source]}18`, color: SOURCE_COLORS[v.source] }}>
              {v.source === 'system' ? 'SYS' : v.source === 'session' ? 'SES' : 'FLW'}
            </span>
            <span className="font-mono text-[12px] truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{v.name}</span>
            {v.label !== v.name && (
              <span className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{v.label}</span>
            )}
          </div>
          <span className="text-[9px] flex-shrink-0 ml-2" style={{ color: 'rgba(255,255,255,0.2)' }}>{v.type}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
