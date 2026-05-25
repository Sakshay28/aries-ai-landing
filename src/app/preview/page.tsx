"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  Navbar,
  Hero,
  TrustBar,
  Stats,
  Features,
  HowItWorks,
  Integrations,
  UseCases,
  Pricing,
  QuickStartSection,
  FAQ,
  CTA,
  Footer,
  CSS as GlobalCSS
} from "../_components/LandingPageClient";

// WhatsApp Accent Colors
const G = "#25D366";
const GD = "#128C7E";
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// 6 B2C / B2B Scenarios
interface ChatMsg {
  role: "user" | "ai" | "system";
  text: string;
  delay?: number;
}

interface FlowNode {
  type: "trigger" | "action" | "condition";
  label: string;
}

interface Scenario {
  id: string;
  category: string;
  title: string;
  desc: string;
  features: string[];
  color: string;
  dashboardPage: string;
  flowNodes: FlowNode[];
  chatMessages: ChatMsg[];
  icon: React.ReactNode;
}

// Custom SVGs to replace emojis
function IconFork() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H7M17 19H7" />
    </svg>
  );
}

function IconDumbbell() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5h11M6.5 17.5h11M3 12h18M6.5 6.5v11M17.5 6.5v11" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01" />
    </svg>
  );
}

function IconStethoscope() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 0-2.5-1-2.5-2.5v-3c0-4 3-7 7-7s7 3 7 7v3c0 1.5-1 2.5-2.5 2.5" />
      <path d="M12 11v8c0 1.5-1 2.5-2.5 2.5s-2.5-1-2.5-2.5v-2" />
      <circle cx="12" cy="7" r="1.5" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconShopping() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

// Scenario Checklist Icons
function Checkmark() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" style={{ stroke: G, fill: "none", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// Window Dot SVG Icon
function WindowDots() {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
    </div>
  );
}

const scenarios: Scenario[] = [
  {
    id: "cafe-aroma",
    category: "Restaurants & Cafes",
    title: "Cafe Aroma",
    desc: "Qualifies booking requests, shares live digital menu links, and handles table reservations 24/7 without manual staff entry.",
    features: ["Self-serve booking flow", "Real-time table slots check", "Automated menu routing"],
    color: "#25D366",
    dashboardPage: "Workflow: Dine-In Reservation",
    icon: <IconFork />,
    flowNodes: [
      { type: "trigger", label: "Message Received: 'Bhai table milegi?'" },
      { type: "action", label: "AI Intent: Detect Dine-In Reservation" },
      { type: "condition", label: "Check API: Slots Available?" },
      { type: "action", label: "Trigger: Send Booking Receipt PDF" }
    ],
    chatMessages: [
      { role: "user", text: "Bhai kal 7 baje table milegi?" },
      { role: "ai", text: "Haan bilkul! Kal 7:00 PM pe table available hai. Kitne log honge?" },
      { role: "user", text: "4 log hain bro, confirm kar do." },
      { role: "ai", text: "Done! 4 logon ke liye table reserve ho gayi hai. Kal milte hain! ☕" }
    ]
  },
  {
    id: "fitcore-gym",
    category: "Gyms & Wellness",
    title: "FitCore Gym",
    desc: "Tracks failed membership renewals, sends secure links to complete card/UPI checkout, and flags cases for agent follow-up.",
    features: ["Failed billing alerts", "1-click secure payment link", "AI agent handover"],
    color: "#ef4444",
    dashboardPage: "Workflow: Failed Billing Recovery",
    icon: <IconDumbbell />,
    flowNodes: [
      { type: "trigger", label: "Event: payment.failed (Razorpay)" },
      { type: "action", label: "Fetch Profile & Subscription Status" },
      { type: "action", label: "Send Automated Recovery Text" },
      { type: "condition", label: "Unpaid after 2 hours? Assign Agent" }
    ],
    chatMessages: [
      { role: "system", text: "⚠️ Subscription payment of ₹1,499 failed via Auto-pay." },
      { role: "ai", text: "Hey Rahul, your FitCore renewal failed. Would you like to retry or speak to support?" },
      { role: "user", text: "Can you send the payment link again?" },
      { role: "ai", text: "Here is your direct secure renewal link: pay.fitcore.in/rxl98. Membership resumes instantly on payment!" }
    ]
  },
  {
    id: "burger-planet",
    category: "QSR & Retail Marketing",
    title: "Burger Planet",
    desc: "Powers automated marketing promotions to active segments, driving direct checks and reducing checkout drop-off.",
    features: ["BOGO Campaign Broadcasts", "Fast Razorpay checkout link", "Visual catalog trigger"],
    color: "#f59e0b",
    dashboardPage: "Campaign: Weekend BOGO Blast",
    icon: <IconTag />,
    flowNodes: [
      { type: "trigger", label: "Broadcast Target: Segment 'Active Users'" },
      { type: "action", label: "Send Burger Deal Media Template" },
      { type: "action", label: "Listen for Quick Action Button Click" },
      { type: "action", label: "Generate Dynamic Payment Payload" }
    ],
    chatMessages: [
      { role: "ai", text: "🍔 BUY 1 GET 1 FREE! Grab our Double Cheese Lava burger today. Deal expires in 3 hours!" },
      { role: "user", text: "Nice! Send me the checkout link." },
      { role: "ai", text: "Awesome! Tap below to order and pay instantly. Your order will be sent to your registered address." },
      { role: "user", text: "[Button: Pay Now (₹180)]" }
    ]
  },
  {
    id: "glow-dental",
    category: "Dental & Clinics",
    title: "Glow Dental Clinic",
    desc: "Dispatches automated appointment reminders, coordinates calendars, and handles cancellations or rescheduling requests.",
    features: ["Google Calendar sync", "Self-service slot change", "Automated pre-visit profiling"],
    color: "#3b82f6",
    dashboardPage: "Workflow: Clinic Sync & Reminders",
    icon: <IconStethoscope />,
    flowNodes: [
      { type: "trigger", label: "Cron Trigger: 24 hrs prior to Appointment" },
      { type: "action", label: "Send Reminder Message with Confirmation Buttons" },
      { type: "condition", label: "User clicks 'Reschedule'" },
      { type: "action", label: "Retrieve Next 3 Open Slots from Calendar API" }
    ],
    chatMessages: [
      { role: "ai", text: "Hi Priya! Glow Dental here. Reminding you of your teeth cleaning tomorrow at 11:30 AM." },
      { role: "user", text: "Can I move it to 3 PM instead?" },
      { role: "ai", text: "Sure! Let me check. Dr. Verma has 3:00 PM free tomorrow. Should I book it for you?" },
      { role: "user", text: "Yes, please. Thank you." }
    ]
  },
  {
    id: "propertymax",
    category: "Real Estate Brokers",
    title: "PropertyMax Realtors",
    desc: "Captures property inquiries, profiles user budget/location preferences, and immediately alerts staff of high-value prospects.",
    features: ["Property Lead Qualifier", "Database/CRM integrations", "Hot lead staff alerts"],
    color: "#8b5cf6",
    dashboardPage: "Workflow: Real Estate Lead Capture",
    icon: <IconHome />,
    flowNodes: [
      { type: "trigger", label: "Message: 'Interested in project'" },
      { type: "action", label: "Profile: Collect Area & Budget Preferences" },
      { type: "condition", label: "Check Value: Is Budget > 2Cr?" },
      { type: "action", label: "CRM Sync (HubSpot) + SMS Alert to Agent" }
    ],
    chatMessages: [
      { role: "user", text: "Interested in property in Gurgaon." },
      { role: "ai", text: "Great choice! Are you looking for a 2 BHK, 3 BHK, or a Villa?" },
      { role: "user", text: "Looking for a 3 BHK under 2 Crore." },
      { role: "ai", text: "Perfect! We have 3 premium projects matching in Sector 62. I have shared details with our property expert Amit to schedule a visit." }
    ]
  },
  {
    id: "sneakerverse",
    category: "D2C Brands",
    title: "SneakerVerse",
    desc: "Syncs order tracking details via logistics webhooks to address status queries, lowering return-to-origin rates.",
    features: ["Shiprocket webhook integration", "COD order confirmations", "Dynamic status lookup"],
    color: "#ec4899",
    dashboardPage: "Workflow: Shipping Updates",
    icon: <IconShopping />,
    flowNodes: [
      { type: "trigger", label: "Event: order.shipped (Shiprocket)" },
      { type: "action", label: "Retrieve Shipping Manifest & BlueDart ID" },
      { type: "action", label: "Format & Send WhatsApp Alert with Map URL" },
      { type: "condition", label: "Listen for Tracking Queries" }
    ],
    chatMessages: [
      { role: "ai", text: "👟 Your SneakerVerse order #SV-9821 has been shipped via BlueDart!" },
      { role: "user", text: "When will it reach Mumbai?" },
      { role: "ai", text: "It is currently in transit and expected to reach Mumbai tomorrow by 4:00 PM. Here is your tracking link: track.sv.com/9821" }
    ]
  }
];

// Interactive Showcase Section Component
function NewShowcaseSection() {
  const [activeId, setActiveId] = useState<string>("cafe-aroma");
  const [chatProgress, setChatProgress] = useState<number>(0);
  const activeScenario = scenarios.find(s => s.id === activeId) || scenarios[0];

  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  // Simulate chat messages popping in sequentially when scenario changes
  useEffect(() => {
    setChatProgress(0);
    const interval = setInterval(() => {
      setChatProgress(p => {
        if (p < activeScenario.chatMessages.length - 1) {
          return p + 1;
        }
        clearInterval(interval);
        return p;
      });
    }, 1800);

    return () => clearInterval(interval);
  }, [activeId, activeScenario]);

  // CSS Styles for 3D stack and hover effects
  const cssStyles = `
    .perspective-container {
      perspective: 1600px;
      position: relative;
      width: 100%;
      height: 560px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .layer-3-dashboard {
      transform: rotateY(-24deg) rotateX(12deg) translate3d(-100px, -20px, -140px);
      opacity: 0.6;
      filter: brightness(0.65) blur(0.4px);
    }
    .layer-2-workflow {
      transform: rotateY(-18deg) rotateX(9deg) translate3d(-20px, 0px, -60px);
      opacity: 0.85;
      filter: brightness(0.85);
    }
    .layer-1-phone {
      transform: rotateY(-8deg) rotateX(4deg) translate3d(120px, 30px, 40px);
      opacity: 1;
    }
    .perspective-container:hover .layer-3-dashboard {
      transform: rotateY(-28deg) rotateX(14deg) translate3d(-170px, -35px, -220px);
      opacity: 0.9;
      filter: brightness(0.95) blur(0px);
    }
    .perspective-container:hover .layer-2-workflow {
      transform: rotateY(-22deg) rotateX(11deg) translate3d(-40px, -5px, -100px);
      opacity: 0.95;
      filter: brightness(1);
    }
    .perspective-container:hover .layer-1-phone {
      transform: rotateY(-2deg) rotateX(1deg) translate3d(160px, 40px, 120px);
      box-shadow: 0 40px 90px rgba(0,0,0,0.85), 0 0 50px rgba(37,211,102,0.25);
    }
    
    .live-pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10B981;
      display: inline-block;
      box-shadow: 0 0 8px #10B981;
      animation: live-pulse-anim 2s infinite;
    }
    @keyframes live-pulse-anim {
      0% { transform: scale(0.8); opacity: 0.5; }
      50% { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(0.8); opacity: 0.5; }
    }

    .chart-pulse-circle {
      transform-origin: 290px 20px;
      animation: chart-pulse-anim 2.5s infinite ease-out;
    }
    @keyframes chart-pulse-anim {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2.8); opacity: 0; }
    }

    .flow-pulse-particle {
      animation: flow-pulse-anim 3s infinite linear;
    }
    @keyframes flow-pulse-anim {
      0% { stroke-dashoffset: 24; }
      100% { stroke-dashoffset: 0; }
    }

    @media (max-width: 1024px) {
      .perspective-container {
        perspective: 1200px;
        height: 480px;
      }
      .layer-3-dashboard {
        transform: scale(0.8) rotateY(-18deg) rotateX(9deg) translate3d(-70px, -15px, -100px);
      }
      .layer-2-workflow {
        transform: scale(0.8) rotateY(-12deg) rotateX(6deg) translate3d(-10px, 0px, -40px);
      }
      .layer-1-phone {
        transform: scale(0.8) rotateY(-6deg) rotateX(3deg) translate3d(80px, 20px, 20px);
      }
      .perspective-container:hover .layer-3-dashboard {
        transform: scale(0.8) rotateY(-22deg) rotateX(11deg) translate3d(-110px, -25px, -140px);
      }
      .perspective-container:hover .layer-2-workflow {
        transform: scale(0.8) rotateY(-16deg) rotateX(8deg) translate3d(-20px, -5px, -70px);
      }
      .perspective-container:hover .layer-1-phone {
        transform: scale(0.8) rotateY(-2deg) rotateX(1deg) translate3d(110px, 25px, 70px);
      }
    }
    @media (max-width: 768px) {
      .perspective-container {
        perspective: none !important;
        height: auto !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 32px !important;
        align-items: center !important;
        padding-top: 20px !important;
      }
      .layer-3-dashboard, .layer-2-workflow, .layer-1-phone {
        position: relative !important;
        transform: none !important;
        width: 100% !important;
        max-width: 440px !important;
        left: auto !important;
        top: auto !important;
        z-index: auto !important;
        opacity: 1 !important;
        filter: none !important;
        transition: none !important;
        box-shadow: 0 15px 35px rgba(0,0,0,0.4) !important;
      }
      .layer-3-dashboard {
        height: 280px !important;
      }
      .layer-2-workflow {
        height: 310px !important;
      }
      .layer-1-phone {
        height: 420px !important;
        max-width: 290px !important;
      }
    }
  `;

  return (
    <section 
      ref={ref}
      style={{ 
        background: "#0c0e14",
        borderTopLeftRadius: "50% 30px",
        borderTopRightRadius: "50% 30px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        marginTop: "-30px",
        position: "relative",
        zIndex: 20,
        padding: "100px 40px",
        overflow: "hidden"
      }}
    >
      <style>{cssStyles}</style>

      {/* Background glow orb */}
      <div style={{
        position: "absolute",
        width: 800, height: 600,
        background: `radial-gradient(ellipse, ${activeScenario.color}0d 0%, transparent 65%)`,
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 0
      }} />

      <div style={{ maxWidth: 1300, margin: "0 auto", position: "relative", zIndex: 1 }}>
        
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span style={{
            display: "inline-block",
            fontSize: 11, fontWeight: 500,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#9ca3af",
            fontFamily: "'Geist Mono', monospace",
            marginBottom: 12,
          }}>
            Interactive Playground
          </span>
          <h2 style={{
            fontSize: "clamp(34px, 4vw, 56px)",
            fontWeight: 900,
            lineHeight: 1.1,
            letterSpacing: "-2.5px",
            color: "#fff",
            marginBottom: 20
          }}>
            See Aries AI <span style={{ color: G }}>in action</span>
          </h2>
          <p style={{
            fontSize: 19,
            color: "#9ca3af",
            maxWidth: 640,
            margin: "0 auto",
            lineHeight: 1.7
          }}>
            Watch how our AI automates complex client interactions, qualifies leads, and updates external databases in real-time.
          </p>
        </div>

        {/* Content Layout Split */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.3fr",
          gap: 60,
          alignItems: "center"
        }} className="setup-grid">

          {/* Left Column: Info & Tab Switchers */}
          <div>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
              >
                {/* Category tag */}
                <span style={{
                  display: "inline-block",
                  fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  color: activeScenario.color,
                  border: `1.5px solid ${activeScenario.color}25`,
                  background: `${activeScenario.color}08`,
                  padding: "4px 12px",
                  borderRadius: 100,
                  fontFamily: "'Geist Mono', monospace",
                  marginBottom: 16
                }}>
                  {activeScenario.category}
                </span>

                {/* Title */}
                <h3 style={{
                  fontSize: "clamp(24px, 3vw, 36px)",
                  fontWeight: 800,
                  color: "#fff",
                  letterSpacing: "-1.5px",
                  marginBottom: 16
                }}>
                  {activeScenario.title}
                </h3>

                {/* Description */}
                <p style={{
                  fontSize: 16,
                  color: "#9ca3af",
                  lineHeight: 1.75,
                  marginBottom: 28
                }}>
                  {activeScenario.desc}
                </p>

                {/* Checklist */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 40 }}>
                  {activeScenario.features.map(f => (
                    <div key={f} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14.5, color: "#e5e7eb" }}>
                      <Checkmark />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Grid selector of scenarios */}
            <div>
              <div style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 11, fontWeight: 500,
                color: "#6b7280",
                letterSpacing: "0.08em",
                marginBottom: 14
              }}>SELECT A USE CASE</div>
              
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12
              }} className="industries-grid">
                {scenarios.map(s => {
                  const isActive = s.id === activeId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setActiveId(s.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "14px 18px",
                        background: isActive ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                        border: isActive ? `1.5px solid ${s.color}` : "1.5px solid rgba(255,255,255,0.04)",
                        borderRadius: 14,
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "all 0.25s ease",
                        color: isActive ? "#fff" : "#9ca3af",
                        outline: "none"
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.border = `1.5px solid ${s.color}60`;
                          e.currentTarget.style.color = "#fff";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.border = "1.5px solid rgba(255,255,255,0.04)";
                          e.currentTarget.style.color = "#9ca3af";
                        }
                      }}
                    >
                      <div style={{
                        width: 32, height: 32,
                        borderRadius: 10,
                        background: isActive ? `${s.color}25` : "rgba(255,255,255,0.04)",
                        color: isActive ? s.color : "#9ca3af",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.25s ease"
                      }}>
                        {s.icon}
                      </div>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{s.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Right Column: Layered 3D Perspective Graphic Deck */}
          <div className="perspective-container">
            
            {/* Background Layer 3: Analytics Dashboard */}
            <div className="layer-3-dashboard" style={{
              position: "absolute",
              width: "88%",
              height: 360,
              background: "#0c0e14",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16,
              boxShadow: "0 20px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
              transformStyle: "preserve-3d",
              zIndex: 1,
              overflow: "hidden",
              transition: "all 0.5s cubic-bezier(0.23, 1, 0.32, 1)"
            }}>
              {/* Browser Header */}
              <div style={{
                height: 40,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                padding: "0 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#080a0f"
              }}>
                <WindowDots />
                <div style={{
                  fontSize: 10,
                  fontFamily: "'Geist Mono', monospace",
                  color: "#6b7280",
                  background: "#030406",
                  padding: "3px 20px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.04)"
                }}>
                  admin.ariesai.in/analytics
                </div>
                <div style={{ width: 40 }} />
              </div>

              {/* Dashboard Content */}
              <div style={{ display: "flex", height: "calc(100% - 40px)" }}>
                {/* Left Mini Sidebar */}
                <div style={{
                  width: 50,
                  borderRight: "1px solid rgba(255,255,255,0.06)",
                  padding: "12px 0",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                  background: "#080a0f"
                }}>
                  {[1, 2, 3].map(idx => (
                    <div key={idx} style={{
                      width: 20, height: 20,
                      borderRadius: 5,
                      background: idx === 1 ? `${activeScenario.color}25` : "rgba(255,255,255,0.03)",
                      border: idx === 1 ? `1px solid ${activeScenario.color}45` : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: idx === 1 ? activeScenario.color : "#555"
                    }}>
                      {idx === 1 ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" /></svg>
                      ) : idx === 2 ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                      )}
                    </div>
                  ))}
                </div>

                {/* Main Body */}
                <div style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>
                      Operations Analytics
                    </h4>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span className="live-pulse-dot" />
                      <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "'Geist Mono', monospace" }}>LIVE SYNC</span>
                    </div>
                  </div>

                  {/* Analytics KPI Row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", padding: "10px", borderRadius: 8 }}>
                      <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Resolution</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginTop: 4, display: "flex", alignItems: "baseline", gap: 4 }}>
                        94.2%
                        <span style={{ fontSize: 8, color: G, fontWeight: 600 }}>+2.4%</span>
                      </div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", padding: "10px", borderRadius: 8 }}>
                      <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Volume</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginTop: 4, display: "flex", alignItems: "baseline", gap: 4 }}>
                        8,402
                        <span style={{ fontSize: 8, color: G, fontWeight: 600 }}>+14%</span>
                      </div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", padding: "10px", borderRadius: 8 }}>
                      <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>AI Autopilot</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: G, marginTop: 4, display: "flex", alignItems: "baseline", gap: 4 }}>
                        89.4%
                        <span style={{ fontSize: 8, color: "#9ca3af", fontWeight: 600 }}>Active</span>
                      </div>
                    </div>
                  </div>

                  {/* SVG Traffic Chart */}
                  <div style={{ flex: 1, position: "relative", minHeight: 90, background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 8, padding: 8, overflow: "hidden" }}>
                    <svg viewBox="0 0 320 90" style={{ width: "100%", height: "100%", overflow: "visible" }}>
                      <defs>
                        <linearGradient id={`chartGlow-${activeId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={activeScenario.color} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={activeScenario.color} stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {/* Grid lines */}
                      <line x1="0" y1="20" x2="320" y2="20" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                      <line x1="0" y1="50" x2="320" y2="50" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                      <line x1="0" y1="80" x2="320" y2="80" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                      
                      {/* Chart Path Area */}
                      <path
                        d="M 0,80 Q 30,50 60,60 T 120,35 T 180,60 T 240,25 T 300,15 L 300,90 L 0,90 Z"
                        fill={`url(#chartGlow-${activeId})`}
                      />
                      {/* Chart Line */}
                      <motion.path
                        key={activeId}
                        d="M 0,80 Q 30,50 60,60 T 120,35 T 180,60 T 240,25 T 300,15"
                        fill="none"
                        stroke={activeScenario.color}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 1.8, ease: "easeInOut" }}
                      />
                      {/* Pulsing endpoint */}
                      <circle cx="300" cy="15" r="3.5" fill={activeScenario.color} />
                      <circle cx="300" cy="15" r="10" fill="none" stroke={activeScenario.color} strokeWidth="1.5" className="chart-pulse-circle" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Background Layer 2: Workflows Builder */}
            <div className="layer-2-workflow" style={{
              position: "absolute",
              width: "88%",
              height: 360,
              background: "#161b26",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              boxShadow: "0 25px 55px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
              transformStyle: "preserve-3d",
              zIndex: 2,
              overflow: "hidden",
              transition: "all 0.5s cubic-bezier(0.23, 1, 0.32, 1)"
            }}>
              {/* Browser Header */}
              <div style={{
                height: 40,
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                padding: "0 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#0f131c"
              }}>
                <WindowDots />
                <div style={{
                  fontSize: 10,
                  fontFamily: "'Geist Mono', monospace",
                  color: "#6b7280",
                  background: "#080a0f",
                  padding: "3px 20px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.05)"
                }}>
                  admin.ariesai.in/workflows/{activeScenario.id}
                </div>
                <div style={{ width: 40 }} />
              </div>

              {/* Layout Body */}
              <div style={{ display: "flex", height: "calc(100% - 40px)" }}>
                {/* Left Mini Sidebar */}
                <div style={{
                  width: 50,
                  borderRight: "1px solid rgba(255,255,255,0.08)",
                  padding: "12px 0",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                  background: "#0f131c"
                }}>
                  {[1, 2, 3].map(idx => (
                    <div key={idx} style={{
                      width: 20, height: 20,
                      borderRadius: 5,
                      background: idx === 2 ? `${activeScenario.color}20` : "rgba(255,255,255,0.03)",
                      border: idx === 2 ? `1px solid ${activeScenario.color}40` : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: idx === 2 ? activeScenario.color : "#555"
                    }}>
                      {idx === 1 ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round"/></svg>
                      ) : idx === 2 ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H7M17 19H7" /></svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                      )}
                    </div>
                  ))}
                </div>

                {/* Workflow Canvas */}
                <div style={{ flex: 1, padding: 18, overflow: "hidden", position: "relative" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#fff" }}>
                      {activeScenario.dashboardPage}
                    </h4>
                    <span style={{ fontSize: 8.5, fontFamily: "'Geist Mono', monospace", color: G, background: "rgba(37,211,102,0.1)", padding: "1px 6px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <span className="live-pulse-dot" /> Active
                    </span>
                  </div>

                  {/* Nodes list */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative", zIndex: 2 }}>
                    {activeScenario.flowNodes.map((node, nIdx) => (
                      <motion.div
                        key={nIdx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: nIdx * 0.08, duration: 0.25 }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          background: "#0f131c",
                          border: nIdx === 0 ? `1px solid ${activeScenario.color}` : "1px solid rgba(255,255,255,0.05)",
                          padding: "8px 12px",
                          borderRadius: 8,
                          maxWidth: 240,
                          boxShadow: nIdx === 0 ? `0 0 10px ${activeScenario.color}15` : "none"
                        }}
                      >
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: node.type === "trigger" ? G : node.type === "condition" ? "#f59e0b" : "#3b82f6"
                        }} />
                        <span style={{ fontSize: 10.5, color: "#e5e7eb", fontWeight: 500, fontFamily: "'Geist Mono', monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {node.label}
                        </span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Connecting Flow Lines */}
                  <svg style={{ position: "absolute", left: 24, top: 62, width: 3, height: 160, zIndex: 1, overflow: "visible" }}>
                    <line x1="0" y1="0" x2="0" y2="160" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 3" />
                    <line
                      x1="0" y1="0" x2="0" y2="160"
                      stroke={activeScenario.color}
                      strokeWidth="1.5"
                      strokeDasharray="6 6"
                      className="flow-pulse-particle"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* Foreground Layer 1: Phone */}
            <div className="layer-1-phone" style={{
              position: "absolute",
              width: 270,
              height: 430,
              background: "#000",
              borderRadius: 36,
              border: "3.5px solid #2d3139",
              boxShadow: "0 25px 65px rgba(0,0,0,0.65), 0 0 35px rgba(37,211,102,0.12)",
              transformStyle: "preserve-3d",
              zIndex: 3,
              padding: "6px",
              transition: "all 0.5s cubic-bezier(0.23, 1, 0.32, 1)"
            }}>
              {/* Dynamic Island / Notch */}
              <div style={{
                position: "absolute",
                top: 10, left: "50%",
                transform: "translateX(-50%)",
                width: 64, height: 13,
                background: "#000",
                borderRadius: 8,
                zIndex: 10
              }} />

              {/* Screen inside */}
              <div style={{
                width: "100%",
                height: "100%",
                background: "#efeae2",
                borderRadius: 28,
                overflow: "hidden",
                position: "relative",
                display: "flex",
                flexDirection: "column"
              }}>
                {/* Status Bar */}
                <div style={{
                  height: 32,
                  padding: "0 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  fontSize: 9,
                  fontWeight: 600,
                  color: "#000",
                  zIndex: 5
                }}>
                  <span>9:41</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    <svg width="10" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21l-12-18h24z"/></svg>
                    <svg width="12" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M17 5H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zM23 11v4"/></svg>
                  </div>
                </div>

                {/* WhatsApp Chat Header */}
                <div style={{
                  height: 46,
                  background: "#075e54",
                  padding: "0 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#fff",
                  zIndex: 5
                }}>
                  {/* Back arrow */}
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.8 }}><polyline points="15 18 9 12 15 6" /></svg>
                  
                  {/* User profile avatar */}
                  <div style={{
                    width: 28, height: 28,
                    borderRadius: "50%",
                    background: activeScenario.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff"
                  }}>
                    {activeScenario.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>{activeScenario.title}</div>
                    <div style={{ fontSize: 8.5, color: "#a5d6a7" }}>online</div>
                  </div>

                  {/* Header action icons */}
                  <div style={{ display: "flex", gap: 10, opacity: 0.85 }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.65 15.65A7.96 7.96 0 1 1 18 10a7.9 7.9 0 0 1-2.35 5.65zM22 22l-6-6" /></svg>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                  </div>
                </div>

                {/* WhatsApp Chat Message List */}
                <div style={{
                  flex: 1,
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  overflowY: "hidden",
                  zIndex: 2
                }}>
                  <AnimatePresence>
                    {activeScenario.chatMessages.slice(0, chatProgress + 1).map((msg, mIdx) => {
                      const isUser = msg.role === "user";
                      return (
                        <motion.div
                          key={mIdx}
                          initial={{ opacity: 0, y: 8, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.25, ease: EASE_OUT }}
                          style={{
                            display: "flex",
                            justifyContent: isUser ? "flex-end" : "flex-start"
                          }}
                        >
                          <div style={{
                            background: isUser ? "#e1ffc7" : "#ffffff",
                            color: "#111111",
                            padding: "6px 10px",
                            borderRadius: isUser ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                            fontSize: 10.8,
                            lineHeight: 1.4,
                            maxWidth: "85%",
                            boxShadow: "0 1px 1.5px rgba(0,0,0,0.1)",
                            border: msg.role === "system" ? "1px solid rgba(239, 68, 68, 0.3)" : "none",
                            position: "relative"
                          }}>
                            {msg.text}
                            {/* Time Indicator */}
                            <span style={{
                              fontSize: 7.5,
                              color: "#888",
                              marginLeft: 8,
                              float: "right",
                              marginTop: 4,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 2
                            }}>
                              9:41
                              {isUser && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* Typing indicator */}
                  {chatProgress < activeScenario.chatMessages.length - 1 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      style={{ display: "flex", justifyContent: "flex-start" }}
                    >
                      <div style={{ background: "#fff", borderRadius: "10px 10px 10px 2px", padding: "6px 10px", boxShadow: "0 1px 1.5px rgba(0,0,0,0.1)" }}>
                        <div style={{ display: "flex", gap: 2.5, alignItems: "center" }}>
                          {[0, 1, 2].map(dotIdx => (
                            <motion.div key={dotIdx}
                              animate={{ y: [0, -2.5, 0] }}
                              transition={{ duration: 0.55, delay: dotIdx * 0.12, repeat: Infinity }}
                              style={{ width: 3.5, height: 3.5, borderRadius: "50%", background: "#777" }}
                            />
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Bottom Chat Input Bar */}
                <div style={{
                  height: 42,
                  background: "#f0f0f0",
                  padding: "0 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  borderTop: "1px solid rgba(0,0,0,0.05)",
                  zIndex: 5
                }}>
                  {/* Plus/attachment button */}
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#007aff" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {/* Text input area */}
                  <div style={{
                    flex: 1,
                    background: "#fff",
                    borderRadius: 20,
                    height: 28,
                    border: "1px solid #ddd",
                    padding: "0 10px",
                    display: "flex",
                    alignItems: "center",
                    fontSize: 10.5,
                    color: "#999"
                  }}>
                    Type a message...
                  </div>
                  {/* Send or Mic button */}
                  <div style={{
                    width: 28, height: 28,
                    borderRadius: "50%",
                    background: "#075e54",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff"
                  }}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}

// Preview Page Layout rendering landing components but with the NewShowcaseSection
export default function PreviewPage() {
  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", background: "#fff", color: "#111", margin: 0, overflowX: "hidden" }}>
      <style>{GlobalCSS}</style>
      <Navbar />
      <Hero />
      <NewShowcaseSection />
      <TrustBar />
      <Stats />
      <Features />
      <HowItWorks />
      <Integrations />
      <UseCases />
      <Pricing />
      <QuickStartSection />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}
