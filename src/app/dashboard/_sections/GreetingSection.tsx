"use client";

import React, { useEffect, useState } from "react";

export function GreetingSection() {
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    setDateStr(new Date().toLocaleDateString('en-US', dateOptions));
  }, []);

  return (
    <div className="pt-2 pb-4">
      <h1 className="text-3xl font-semibold text-foreground tracking-tight">Hello, Alex</h1>
      <p className="text-sm text-muted-foreground mt-1.5">{dateStr}</p>
    </div>
  );
}
