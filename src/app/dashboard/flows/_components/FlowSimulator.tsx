"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, CheckCheck } from "lucide-react";
import { useFlowStore } from "../store";

export default function FlowSimulator() {
  const [messages, setMessages] = useState<{ id: string; type: "bot" | "user" | "ai"; text: string }[]>([]);
  const [inputText, setInputText] = useState("");
  const { setSelectedNodeId } = useFlowStore();

  useEffect(() => {
    // Start simulation
    setTimeout(() => {
      setMessages([{ id: "1", type: "bot", text: "What type of business do you run?" }]);
      setSelectedNodeId("1"); // Highlight Step 1
    }, 500);
  }, []);

  const handleSend = () => {
    if (!inputText.trim()) return;

    const userMsg = inputText.trim();
    setMessages(prev => [...prev, { id: Date.now().toString(), type: "user", text: userMsg }]);
    setInputText("");

    // Simple script logic for the simulation based on the flow
    if (messages.length === 1) {
      // User answered business type
      setTimeout(() => {
        setMessages(prev => [...prev, { id: "2", type: "bot", text: "How large is your team?" }]);
        setSelectedNodeId("2");
      }, 1000);
    } else if (messages.length === 3) {
      // User likely interrupted (Pricing question)
      setTimeout(() => {
        setSelectedNodeId("3");
        setMessages(prev => [...prev, { id: "3", type: "ai", text: "Our plans start at ₹2,999/mo for the Pro tier. Would you like a full breakdown later?" }]);
      }, 1500);

      // Auto-resume to step 2
      setTimeout(() => {
        setSelectedNodeId("4"); // Highlight Resume node
        setTimeout(() => {
          setSelectedNodeId("2"); // Back to Step 2
          setMessages(prev => [...prev, { id: "4", type: "bot", text: "Coming back to your setup 👇\n\nHow large is your team?" }]);
        }, 1000);
      }, 4000);
    }
  };

  return (
    <div className="w-[360px] flex-shrink-0 border-r border-white/10 bg-[#0A0A0A] flex flex-col z-10 shadow-2xl relative">
      {/* Header */}
      <div className="p-4 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-white text-[12px] shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            AI
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-white tracking-tight">Aries AI Simulation</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-500 font-medium tracking-widest uppercase">Live</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png')] bg-repeat bg-opacity-5 relative" style={{ backgroundSize: '400px' }}>
        <div className="absolute inset-0 bg-[#0A0A0A]/90 pointer-events-none" />
        
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"} relative z-10`}
            >
              <div 
                className={`px-3 py-2 rounded-[12px] max-w-[85%] shadow-sm ${
                  msg.type === "user" 
                    ? "bg-[#005C4B] text-[#E9EDEF] rounded-tr-sm" 
                    : msg.type === "ai"
                    ? "bg-gradient-to-br from-emerald-900/40 to-[#202C33] border border-emerald-500/20 text-[#E9EDEF] rounded-tl-sm shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                    : "bg-[#202C33] text-[#E9EDEF] rounded-tl-sm"
                }`}
              >
                {msg.type === "ai" && (
                  <div className="text-[10px] font-bold text-emerald-400 mb-1 tracking-widest uppercase flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-400" /> AI Auto-Response
                  </div>
                )}
                <p className="text-[13px] leading-relaxed tracking-tight whitespace-pre-wrap">{msg.text}</p>
                <div className="flex justify-end items-center gap-1 mt-1 -mb-1">
                  <span className="text-[9px] text-white/40">Now</span>
                  {msg.type === "user" && <CheckCheck className="w-3 h-3 text-[#53bdeb]" />}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className="p-3 bg-[#202C33] border-t border-white/5 relative z-10">
        <div className="flex items-center gap-2 bg-[#2A3942] rounded-full px-4 py-2">
          <input 
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="flex-1 bg-transparent border-none text-[14px] text-white placeholder:text-white/40 focus:outline-none"
          />
          <button 
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="p-1.5 bg-emerald-500 rounded-full text-white disabled:opacity-50 transition-opacity"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
