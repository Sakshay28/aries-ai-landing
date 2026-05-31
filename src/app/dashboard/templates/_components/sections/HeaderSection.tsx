'use client';

import { type HeaderType, type TemplateFormState } from '../types';
import MediaUpload from '../MediaUpload';

const HEADER_TYPES: { id: HeaderType; label: string; icon: string; desc: string }[] = [
  { id: 'NONE', label: 'None', icon: '—', desc: 'No header' },
  { id: 'TEXT', label: 'Text', icon: 'T', desc: 'Short bold header text' },
  { id: 'IMAGE', label: 'Image', icon: '🖼️', desc: 'JPEG or PNG, max 5 MB' },
  { id: 'VIDEO', label: 'Video', icon: '🎥', desc: 'MP4 only, max 16 MB' },
  { id: 'DOCUMENT', label: 'Document', icon: '📄', desc: 'PDF only, max 100 MB' },
];

interface Props {
  state: TemplateFormState;
  onChange: (updates: Partial<TemplateFormState>) => void;
}

export default function HeaderSection({ state, onChange }: Props) {
  const { headerType, headerText } = state;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Header Type
        </label>

        {/* Type selector */}
        <div className="grid grid-cols-5 gap-1.5">
          {HEADER_TYPES.map((ht) => (
            <button
              key={ht.id}
              type="button"
              onClick={() => onChange({ headerType: ht.id, headerText: '', headerMediaUrl: '' })}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                headerType === ht.id
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border bg-card hover:bg-muted/30 hover:border-border/70'
              }`}
            >
              <div className="text-lg leading-none mb-1">{ht.icon}</div>
              <div className={`text-[10px] font-semibold leading-tight ${headerType === ht.id ? 'text-primary' : 'text-muted-foreground'}`}>
                {ht.label}
              </div>
            </button>
          ))}
        </div>

        {headerType !== 'NONE' && (
          <p className="text-[11px] text-muted-foreground">
            {HEADER_TYPES.find((h) => h.id === headerType)?.desc}
          </p>
        )}
      </div>

      {/* TEXT header input */}
      {headerType === 'TEXT' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground">Header Text</label>
            <span className={`text-[10px] ${headerText.length > 55 ? 'text-amber-500' : 'text-muted-foreground'}`}>
              {headerText.length}/60
            </span>
          </div>
          <input
            type="text"
            value={headerText}
            onChange={(e) => onChange({ headerText: e.target.value })}
            maxLength={60}
            placeholder="e.g. 🎉 Reservation Confirmed"
            className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50 transition-all font-semibold"
          />
          <p className="text-[11px] text-muted-foreground">Max 60 characters. Renders in bold in WhatsApp.</p>
        </div>
      )}

      {/* Media upload */}
      {(headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT') && (
        <MediaUpload
          headerType={headerType}
          currentUrl={state.headerMediaUrl}
          onUploaded={(url) => onChange({ headerMediaUrl: url })}
          onRemoved={() => onChange({ headerMediaUrl: '' })}
        />
      )}
    </div>
  );
}
