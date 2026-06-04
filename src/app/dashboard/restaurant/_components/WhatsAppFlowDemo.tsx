'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw, Smartphone, CheckCheck, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Message = {
  from: 'customer' | 'bot';
  text: string;
  delay: number;         // ms after previous message
  type?: 'text' | 'payment' | 'confirm';
};

const DEMO_MESSAGES: Message[] = [
  { from: 'customer', text: "Hi, I'd like to book a table 🍽️",            delay: 0 },
  { from: 'bot',      text: "Welcome to The Clock Tower! 😊\nI'd love to help you book a table.\n\nHow many guests will be joining?",  delay: 900 },
  { from: 'customer', text: "4 people",                                     delay: 1100 },
  { from: 'bot',      text: "Perfect! What date and time would you like?\n(e.g. Tomorrow 8 PM, 10 June 7:30 PM)", delay: 900 },
  { from: 'customer', text: "Tomorrow evening, 8 PM",                       delay: 1000 },
  { from: 'bot',      text: "Great choice! 🌙\nMay I have your name please?", delay: 800 },
  { from: 'customer', text: "Ravi Mehta",                                   delay: 900 },
  { from: 'bot',      text: "And your phone number so we can reach you?",   delay: 700 },
  { from: 'customer', text: "Use this number",                              delay: 900 },
  {
    from: 'bot',
    text: "Almost done, Ravi! 🎉\nTo confirm your table for 4 guests, please pay the ₹40 booking fee (₹10 × 4 guests):",
    delay: 1000,
    type: 'payment',
  },
  { from: 'customer', text: "✅ Payment of ₹40 successful (UPI)",          delay: 2200 },
  {
    from: 'bot',
    text: "🎉 Your table is confirmed!\n\n📋 Reservation: CT-20260604-4821\n📅 Date: Tomorrow\n⏰ Time: 8:00 PM\n👥 Guests: 4\n\nSee you then, Ravi! 🍽️",
    delay: 800,
    type: 'confirm',
  },
];

type BubbleState = 'hidden' | 'typing' | 'visible';

export function WhatsAppFlowDemo() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [typingFor, setTypingFor] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [feePerPerson, setFeePerPerson] = useState(10);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch real fee from settings
  useEffect(() => {
    fetch('/api/restaurant/settings')
      .then(r => r.json())
      .then(d => { if (d.booking_fee_per_person > 0) setFeePerPerson(d.booking_fee_per_person); })
      .catch(() => {});
  }, []);

  const clearTimers = () => {
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
  };

  const resetDemo = () => {
    clearTimers();
    setVisibleCount(0);
    setTypingFor(null);
    setRunning(false);
    setDone(false);
  };

  const playDemo = () => {
    resetDemo();
    setRunning(true);
    let cumulativeDelay = 300;

    DEMO_MESSAGES.forEach((msg, idx) => {
      cumulativeDelay += msg.delay;
      const typingDuration = msg.from === 'bot' ? Math.min(1200, msg.text.length * 22) : 0;

      if (msg.from === 'bot' && typingDuration > 0) {
        timerRefs.current.push(setTimeout(() => {
          setTypingFor(idx);
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }, cumulativeDelay));
        cumulativeDelay += typingDuration;
      }

      timerRefs.current.push(setTimeout(() => {
        setTypingFor(null);
        setVisibleCount(idx + 1);
        if (idx === DEMO_MESSAGES.length - 1) {
          setRunning(false);
          setDone(true);
        }
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        });
      }, cumulativeDelay));
    });
  };

  useEffect(() => () => clearTimers(), []);

  // Replace dynamic fee in payment messages
  const renderText = (text: string) =>
    text
      .replace(/₹40/g, `₹${feePerPerson * 4}`)
      .replace(/₹10 × 4/g, `₹${feePerPerson} × 4`);

  return (
    <Card className="bg-card border-border shadow-none rounded-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[#25D366]" />
            WhatsApp Booking Flow (Live Demo)
          </CardTitle>
          <div className="flex items-center gap-2">
            {done && (
              <button
                onClick={resetDemo}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-secondary transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
            )}
            <button
              onClick={playDemo}
              disabled={running}
              className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#22c55e] disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Play className="w-3 h-3" />
              {running ? 'Playing…' : done ? 'Replay' : 'Play Demo'}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Exactly what your customers see on WhatsApp — from "I want to book" to payment confirmed.
        </p>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        {/* Phone mockup */}
        <div className="rounded-2xl border border-border overflow-hidden max-w-sm mx-auto shadow-md">
          {/* WhatsApp-style header */}
          <div className="bg-[#075E54] px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center text-white font-bold text-sm shrink-0">
              CT
            </div>
            <div>
              <p className="text-white text-sm font-semibold">The Clock Tower</p>
              <p className="text-[#9de0d4] text-[11px]">Online</p>
            </div>
          </div>

          {/* Chat area */}
          <div
            ref={scrollRef}
            className="bg-[#efeae2] dark:bg-[#0d1418] px-3 py-3 h-[340px] overflow-y-auto space-y-1.5"
            style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0)', backgroundSize: '20px 20px' }}
          >
            {visibleCount === 0 && !running && (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-[#667781] dark:text-[#8696a0] text-center px-4">
                  Press "Play Demo" to see how a customer books on WhatsApp ↑
                </p>
              </div>
            )}

            {DEMO_MESSAGES.slice(0, visibleCount).map((msg, idx) => (
              <div key={idx} className={`flex ${msg.from === 'customer' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={[
                    'max-w-[82%] rounded-xl px-3 py-2 shadow-sm text-[13px] leading-snug',
                    msg.from === 'bot'
                      ? 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-sm'
                      : 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-sm',
                  ].join(' ')}
                >
                  {msg.type === 'payment' ? (
                    <div>
                      <p className="whitespace-pre-line mb-2">{renderText(msg.text)}</p>
                      <div className="bg-[#f0f7ff] dark:bg-[#1a2738] border border-[#d0e8ff] dark:border-[#2d4a6e] rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-full bg-[#007bff] flex items-center justify-center text-white text-xs font-bold shrink-0">₹</div>
                          <div>
                            <p className="text-[12px] font-semibold text-[#111b21] dark:text-[#e9edef]">Booking Fee</p>
                            <p className="text-[10px] text-[#667781]">Secure UPI Payment</p>
                          </div>
                          <span className="ml-auto text-[15px] font-bold text-[#007bff]">₹{feePerPerson * 4}</span>
                        </div>
                        <div className="bg-[#007bff] rounded-lg py-2 text-center">
                          <span className="text-white text-[12px] font-semibold">💳 Pay ₹{feePerPerson * 4} via UPI</span>
                        </div>
                        <p className="text-[10px] text-center text-[#667781] mt-1">Powered by Razorpay · All UPI apps supported</p>
                      </div>
                    </div>
                  ) : msg.type === 'confirm' ? (
                    <div>
                      <p className="whitespace-pre-line">{msg.text}</p>
                      <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10 flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                        <span className="text-[11px] text-[#25D366] font-semibold">Booking Confirmed</span>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-line">{renderText(msg.text)}</p>
                  )}
                  <div className="flex justify-end items-center gap-1 mt-0.5">
                    <span className="text-[10px] text-[#667781]">
                      {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.from === 'bot' && <CheckCheck className="w-3 h-3 text-[#53bdeb]" />}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {typingFor !== null && DEMO_MESSAGES[typingFor]?.from === 'bot' && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-[#202c33] rounded-xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-[#8696a0] animate-bounce"
                      style={{ animationDelay: `${i * 150}ms`, animationDuration: '800ms' }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* WhatsApp input bar */}
          <div className="bg-[#f0f2f5] dark:bg-[#1f2c34] px-3 py-2 flex items-center gap-2">
            <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-full px-4 py-2 text-xs text-[#667781] dark:text-[#8696a0]">
              Type a message
            </div>
            <div className="w-8 h-8 rounded-full bg-[#00a884] flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Caption */}
        {done && (
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <Check className="w-3.5 h-3.5 shrink-0" />
            This is the complete flow your customers go through — from first message to confirmed booking in under 2 minutes.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
