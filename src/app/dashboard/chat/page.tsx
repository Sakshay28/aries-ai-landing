"use client";

import { Suspense } from "react";
import ChatSidebar from "./ChatSidebar";
import ChatArea from "./ChatArea";

export default function ChatPage() {
  return (
    <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100vh-64px)] lg:h-screen flex overflow-hidden bg-[#F5F7FB] dark:bg-[#0B1120]">
      <Suspense fallback={null}>
        <ChatSidebar />
      </Suspense>
      <Suspense fallback={null}>
        <ChatArea />
      </Suspense>
    </div>
  );
}
