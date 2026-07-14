"use client";

import React, { useEffect, useState } from "react";
import { useUserContext } from "../_layout/DashboardLayoutClient";
import { NEUTRAL_GREETING } from "@/lib/utils/contact-name";

export function GreetingSection() {
  const [dateStr, setDateStr] = useState("");
  const { userName } = useUserContext();

  useEffect(() => {
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    setDateStr(new Date().toLocaleDateString("en-US", dateOptions));
  }, []);

  // Display name: use server-provided userName, fall back to the neutral greeting
  const displayName = userName || NEUTRAL_GREETING;

  return (
    <div className="pt-2 pb-4">
      <h1 className="text-3xl font-semibold text-foreground tracking-tight">Hello, {displayName}</h1>
      <p className="text-sm text-muted-foreground mt-1.5">{dateStr}</p>
    </div>
  );
}
