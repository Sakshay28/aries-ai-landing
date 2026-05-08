"use client";

import {
  Phone,
  Video,
  MoreHorizontal,
  Paperclip,
  Smile,
  Mic,
  Download,
  ThumbsUp,
} from 'lucide-react';

function FigmaIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 57" fill="none" aria-hidden>
      <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="#1ABCFE" />
      <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" fill="#0ACF83" />
      <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" fill="#FF7262" />
      <path d="M0 9.5A9.5 9.5 0 0 1 9.5 0H19v19H9.5A9.5 9.5 0 0 1 0 9.5z" fill="#F24E1E" />
      <path d="M0 28.5A9.5 9.5 0 0 1 9.5 19H19v19H9.5A9.5 9.5 0 0 1 0 28.5z" fill="#A259FF" />
    </svg>
  );
}

export function RightRail() {
  return (
    <aside className="hidden w-[320px] shrink-0 border-l border-[#EEF0F4] bg-white px-5 py-6 xl:flex xl:flex-col">
      {/* Profile card */}
      <div className="rounded-2xl bg-[#F2F3F7] p-5">
        <div className="flex flex-col items-center">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://i.pravatar.cc/120?img=47"
              alt="Megan Norton"
              className="h-[88px] w-[88px] rounded-full object-cover ring-4 ring-white"
            />
            <span className="absolute right-1.5 bottom-1.5 h-3 w-3 rounded-full bg-[#F04438] ring-2 ring-[#F2F3F7]" />
          </div>
          <div className="mt-3 text-[15px] font-bold tracking-tight text-[#101828]">Megan Norton</div>
          <div className="text-[12px] text-[#98A2B3]">@megnorton</div>

          <div className="mt-4 flex items-center gap-2.5">
            <button
              title="Call"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#475467] shadow-sm transition hover:bg-zinc-50"
            >
              <Phone size={15} strokeWidth={1.8} />
            </button>
            <button
              title="Video"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#475467] shadow-sm transition hover:bg-zinc-50"
            >
              <Video size={15} strokeWidth={1.8} />
            </button>
            <button
              title="More"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#475467] shadow-sm transition hover:bg-zinc-50"
            >
              <MoreHorizontal size={15} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </div>

      {/* Activity */}
      <div className="mt-6 flex-1 overflow-y-auto">
        <div className="text-center text-[13px] font-semibold tracking-tight text-[#101828]">Activity</div>

        {/* Entry 1: Floyd Miles — comment + chat bubble */}
        <div className="mt-4">
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://i.pravatar.cc/64?img=12" alt="Floyd Miles" className="h-9 w-9 rounded-full object-cover" />
              <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-[#F04438] ring-2 ring-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-[#101828]">Floyd Miles</span>
                <span className="text-[10.5px] text-[#98A2B3]">10:15 AM</span>
              </div>
              <div className="text-[12px] text-[#667085]">
                Commented on <a href="#" className="font-medium text-[#5B8DEF] hover:underline">Stark Project</a>
              </div>
            </div>
          </div>
          <div className="mt-2 ml-12 relative rounded-2xl rounded-tl-md bg-[#EEF1FB] px-3.5 py-2.5 text-[12.5px] leading-snug text-[#344054]">
            Hi! Next week we&apos;ll start a new project. I&apos;ll tell you all the details later
            <span className="absolute -bottom-2 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-zinc-100">
              <ThumbsUp size={11} className="text-[#F59E0B]" />
            </span>
          </div>
        </div>

        {/* Entry 2: Guy Hawkins — file attachment */}
        <div className="mt-5">
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://i.pravatar.cc/64?img=33" alt="Guy Hawkins" className="h-9 w-9 rounded-full object-cover" />
              <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-[#12B76A] ring-2 ring-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-[#101828]">Guy Hawkins</span>
                <span className="text-[10.5px] text-[#98A2B3]">10:15 AM</span>
              </div>
              <div className="text-[12px] text-[#667085]">
                Added a file to <a href="#" className="font-medium text-[#5B8DEF] hover:underline">7Heros Project</a>
              </div>
            </div>
          </div>
          <div className="mt-2 ml-12 flex items-center gap-3 rounded-2xl bg-[#F2F3F7] px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1A1A2E]">
              <FigmaIcon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-[#101828]">Homepage.fig</div>
              <div className="text-[10.5px] text-[#98A2B3]">13.4 Mb</div>
            </div>
            <button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#5B8DEF] shadow-sm transition hover:bg-blue-50">
              <Download size={13} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Entry 3: Kristin Watson — comment */}
        <div className="mt-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://i.pravatar.cc/64?img=45" alt="Kristin Watson" className="h-9 w-9 rounded-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-[#101828]">Kristin Watson</span>
                <span className="text-[10.5px] text-[#98A2B3]">10:15 AM</span>
              </div>
              <div className="text-[12px] text-[#667085]">
                Commented on <a href="#" className="font-medium text-[#5B8DEF] hover:underline">7Heros Project</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message input */}
      <div className="mt-5">
        <div className="flex items-center gap-2 rounded-full bg-[#F2F3F7] px-3 py-2">
          <button className="text-[#98A2B3] hover:text-[#475467]">
            <Paperclip size={15} />
          </button>
          <input
            placeholder="Write a message"
            className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#98A2B3]"
          />
          <button className="text-[#98A2B3] hover:text-[#475467]">
            <Smile size={15} />
          </button>
          <button className="text-[#98A2B3] hover:text-[#475467]">
            <Mic size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
