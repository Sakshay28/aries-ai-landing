"use client";

import React from "react";

interface FeaturePageGateProps {
  feature?: string;
  allowedPlans?: string[];
  children: React.ReactNode;
}

// Plan gating removed — all features are open to everyone.
export function FeaturePageGate({ children }: FeaturePageGateProps) {
  return <>{children}</>;
}
