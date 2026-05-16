"use client";

import { Suspense } from "react";
import ChatSidebar from "./ChatSidebar";
import ChatArea from "./ChatArea";
import CustomerContext from "./CustomerContext";

export default function ChatPage() {
  return (
    <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100vh-64px)] lg:h-screen flex overflow-hidden bg-background">
      <Suspense fallback={null}>
        <ChatSidebar />
      </Suspense>
      <Suspense fallback={null}>
        <ChatArea />
      </Suspense>
      <CustomerContext />
    </div>
  );
}
