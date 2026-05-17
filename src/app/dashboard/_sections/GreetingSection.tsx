"use client";

import React, { useEffect, useState } from "react";

export function GreetingSection() {
  const [dateStr, setDateStr] = useState("");
  const [userName, setUserName] = useState("there");

  useEffect(() => {
    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    setDateStr(new Date().toLocaleDateString('en-US', dateOptions));

    // Fetch user's first name
    import("@/lib/supabase/client").then(({ createBrowserSupabaseClient }) => {
      const sb = createBrowserSupabaseClient();
      sb.auth.getUser().then(({ data }) => {
        if (data?.user?.user_metadata?.full_name) {
          const first = data.user.user_metadata.full_name.split(" ")[0];
          setUserName(first);
        } else if (data?.user?.email) {
          setUserName(data.user.email.split("@")[0]);
        }
      });
    });
  }, []);

  return (
    <div className="pt-2 pb-4">
      <h1 className="text-3xl font-semibold text-foreground tracking-tight">Hello, {userName}</h1>
      <p className="text-sm text-muted-foreground mt-1.5">{dateStr}</p>
    </div>
  );
}
