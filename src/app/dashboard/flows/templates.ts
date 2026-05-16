import { AppNode } from "./store";
import { Edge } from "@xyflow/react";

export type FlowTemplate = {
  id: string;
  category: string;
  title: string;
  description: string;
  nodes: AppNode[];
  edges: Edge[];
};

export const templates: FlowTemplate[] = [
  {
    id: "ecommerce",
    category: "Commerce",
    title: "E-Commerce Support",
    description: "Product search, order tracking, and returns management.",
    nodes: [
      { id: "1", type: "trigger", position: { x: 400, y: 50 }, data: { label: "Incoming Message", triggerType: "WhatsApp Webhook" } },
      { id: "2", type: "extract", position: { x: 400, y: 180 }, data: { label: "Extract Intent", entities: ["intent", "order_id"] } },
      { id: "3", type: "condition", position: { x: 400, y: 310 }, data: { label: "Product Search?", field: "intent", operator: "==", value: "search" } },
      // Branch A (Product Search)
      { id: "4a", type: "webhook", position: { x: 100, y: 500 }, data: { label: "Catalog API", method: "GET", url: "/products" } },
      { id: "5a", type: "format", position: { x: 100, y: 650 }, data: { label: "Format Cards", formatType: "Product Carousel" } },
      { id: "6a", type: "standard", position: { x: 100, y: 800 }, data: { label: "Show Products", content: "Here are some options:" } },
      { id: "7a", type: "end", position: { x: 130, y: 950 }, data: { label: "End Flow" } },
      // Branch B/C (Order/Returns) handled by AI for now
      { id: "4b", type: "memory", position: { x: 700, y: 500 }, data: { label: "Save Context", scope: "User Session" } },
      { id: "5b", type: "interruption", position: { x: 700, y: 650 }, data: { label: "Intent Routing", threshold: "75", userQuery: "Where is my order?", aiResponse: "Your order is arriving tomorrow." } },
      { id: "6b", type: "end", position: { x: 730, y: 850 }, data: { label: "End Flow" } }
    ],
    edges: [
      { id: "e1", source: "1", target: "2", type: "smoothstep", animated: true },
      { id: "e2", source: "2", target: "3", type: "smoothstep", animated: true },
      { id: "e3a", source: "3", sourceHandle: "true", target: "4a", type: "smoothstep", animated: true, style: { stroke: "rgba(16,185,129,0.8)" } },
      { id: "e3b", source: "3", sourceHandle: "false", target: "4b", type: "smoothstep", animated: true, style: { stroke: "rgba(245,158,11,0.5)" } },
      { id: "e4a", source: "4a", sourceHandle: "success", target: "5a", type: "smoothstep", animated: true },
      { id: "e5a", source: "5a", target: "6a", type: "smoothstep", animated: true },
      { id: "e6a", source: "6a", target: "7a", type: "smoothstep", animated: true },
      { id: "e4b", source: "4b", target: "5b", type: "smoothstep", animated: true },
      { id: "e5b", source: "5b", sourceHandle: "success", target: "6b", type: "smoothstep", animated: true }
    ]
  },
  {
    id: "service",
    category: "Services",
    title: "Service Booking",
    description: "Handle appointments, pricing, and scheduling automatically.",
    nodes: [
      { id: "1", type: "trigger", position: { x: 400, y: 50 }, data: { label: "Incoming Message", triggerType: "WhatsApp Webhook" } },
      { id: "2", type: "extract", position: { x: 400, y: 180 }, data: { label: "Extract Service", entities: ["service_type", "location"] } },
      { id: "3", type: "webhook", position: { x: 400, y: 310 }, data: { label: "Check Availability", method: "POST", url: "/calendar" } },
      { id: "4", type: "standard", position: { x: 400, y: 450 }, data: { label: "Show Dates", content: "Please select a time slot:" } }
    ],
    edges: [
      { id: "e1", source: "1", target: "2", type: "smoothstep", animated: true },
      { id: "e2", source: "2", sourceHandle: "success", target: "3", type: "smoothstep", animated: true },
      { id: "e3", source: "3", sourceHandle: "success", target: "4", type: "smoothstep", animated: true }
    ]
  },
  {
    id: "leadgen",
    category: "Sales",
    title: "Lead Generation",
    description: "Qualify leads, score them, and sync directly to your CRM.",
    nodes: [
      { id: "1", type: "trigger", position: { x: 400, y: 50 }, data: { label: "Incoming Message", triggerType: "WhatsApp Webhook" } },
      { id: "2", type: "interruption", position: { x: 400, y: 180 }, data: { label: "Qualify Lead", threshold: "80", userQuery: "I need pricing.", aiResponse: "What is your budget?" } },
      { id: "3", type: "webhook", position: { x: 400, y: 350 }, data: { label: "Sync to CRM", method: "POST", url: "/hubspot/leads" } },
      { id: "4", type: "standard", position: { x: 400, y: 500 }, data: { label: "Confirm", content: "Thanks! A rep will call you shortly." } }
    ],
    edges: [
      { id: "e1", source: "1", target: "2", type: "smoothstep", animated: true },
      { id: "e2", source: "2", sourceHandle: "success", target: "3", type: "smoothstep", animated: true },
      { id: "e3", source: "3", sourceHandle: "success", target: "4", type: "smoothstep", animated: true }
    ]
  },
  {
    id: "support",
    category: "Support",
    title: "Support & FAQ",
    description: "Deflect tickets with AI knowledge base and escalate when needed.",
    nodes: [
      { id: "1", type: "trigger", position: { x: 400, y: 50 }, data: { label: "Incoming Message", triggerType: "WhatsApp Webhook" } },
      { id: "2", type: "knowledge", position: { x: 200, y: 180 }, data: { label: "Help Center", source: "Zendesk KB" } },
      { id: "3", type: "interruption", position: { x: 400, y: 180 }, data: { label: "AI Support", threshold: "75", userQuery: "How do I reset my password?", aiResponse: "Click 'Forgot Password' on the login screen." } },
      { id: "4", type: "handoff", position: { x: 650, y: 350 }, data: { label: "Human Handoff", team: "L2 Support" } }
    ],
    edges: [
      { id: "e1", source: "1", target: "3", type: "smoothstep", animated: true },
      { id: "e2", source: "2", target: "3", type: "smoothstep", animated: true, style: { strokeDasharray: "5 5" } },
      { id: "e3", source: "3", sourceHandle: "fallback", target: "4", type: "smoothstep", animated: true, style: { stroke: "rgba(239,68,68,0.5)" } }
    ]
  },
  {
    id: "recruitment",
    category: "HR",
    title: "Recruitment Automation",
    description: "Parse incoming resumes, extract skills, and schedule interviews.",
    nodes: [
      { id: "1", type: "trigger", position: { x: 400, y: 50 }, data: { label: "Incoming Message", triggerType: "WhatsApp Webhook" } },
      { id: "2", type: "resume_parser", position: { x: 400, y: 180 }, data: { label: "Parse Resume", extracts: "Skills, Experience" } },
      { id: "3", type: "webhook", position: { x: 400, y: 350 }, data: { label: "Send to ATS", method: "POST", url: "/workable" } },
      { id: "4", type: "standard", position: { x: 400, y: 500 }, data: { label: "Interview Invite", content: "You're a match! Pick a time." } }
    ],
    edges: [
      { id: "e1", source: "1", target: "2", type: "smoothstep", animated: true },
      { id: "e2", source: "2", sourceHandle: "success", target: "3", type: "smoothstep", animated: true },
      { id: "e3", source: "3", sourceHandle: "success", target: "4", type: "smoothstep", animated: true }
    ]
  }
];
