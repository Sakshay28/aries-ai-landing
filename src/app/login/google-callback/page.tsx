"use client";

import { useEffect } from "react";

export default function GoogleCallbackPage() {
  useEffect(() => {
    // Read the fragment hash from the redirect URL
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1));
    const idToken = params.get("id_token");
    const error = params.get("error");

    if (window.opener) {
      if (idToken) {
        window.opener.postMessage(
          { type: "google-login-success", token: idToken },
          window.location.origin
        );
      } else if (error) {
        window.opener.postMessage(
          { type: "google-login-error", error: params.get("error_description") || error },
          window.location.origin
        );
      }
      window.close();
    } else {
      // Fallback if the callback is opened directly
      window.location.replace("/login");
    }
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif", background: "#0f172a", color: "#fff" }}>
      <div style={{ textAlign: "center" }}>
        <h3 style={{ marginBottom: 8 }}>Completing secure sign-in...</h3>
        <p style={{ opacity: 0.7, fontSize: 14 }}>This window will close automatically.</p>
      </div>
    </div>
  );
}
