import { AppNode } from "./store";
import { Edge } from "@xyflow/react";

const generateEdge = (source: string, target: string, sourceHandle?: string) => {
  let color = "rgba(16,185,129,0.5)"; // Green
  if (sourceHandle === 'error' || sourceHandle === 'fallback' || sourceHandle === 'missing') {
    color = "rgba(239,68,68,0.5)"; // Red
  } else if (sourceHandle === 'true' || sourceHandle === 'false') {
    color = "rgba(245,158,11,0.5)"; // Yellow
  } else if (!sourceHandle) {
    color = "rgba(255,255,255,0.2)"; // Default
  }

  return {
    id: `e-${source}-${target}-${sourceHandle || 'default'}`,
    source,
    target,
    sourceHandle,
    type: 'smoothstep',
    animated: true,
    style: { stroke: color, strokeWidth: 2 },
    label: sourceHandle ? sourceHandle.toUpperCase() : undefined,
    labelBgStyle: { fill: '#111', color: '#fff', fillOpacity: 0.8 },
    labelStyle: { fill: '#fff', fontWeight: 600, fontSize: 10, letterSpacing: 1 },
  };
};

export function getPrebuiltFlow(templateId: string, businessType: string): { nodes: AppNode[], edges: Edge[] } {
  if (templateId === 'blank' || businessType === 'blank') {
    return { nodes: [], edges: [] };
  }

  if (templateId === 'product-recs') {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: 'User Request', triggerType: 'Keyword Match' } },
      { id: 'interruption_1', type: 'interruption', position: { x: 360, y: 200 }, data: { label: 'Analyze Preferences', userQuery: 'I am looking for running shoes', aiResponse: 'Extracting product category...', threshold: 80 } },
      { id: 'webhook_1', type: 'webhook', position: { x: 360, y: 450 }, data: { label: 'Search Catalog', method: 'POST', url: 'https://api.store.com/recommend' } },
      { id: 'format_1', type: 'format', position: { x: 360, y: 650 }, data: { label: 'Create Carousel', formatType: 'Interactive List with Buttons' } },
      { id: 'message_1', type: 'standard', position: { x: 360, y: 800 }, data: { label: 'Send Recommendations', content: 'Here are some top picks based on what you are looking for!' } },
      { id: 'end_1', type: 'end', position: { x: 360, y: 1000 }, data: { label: 'Complete Flow' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'interruption_1'),
      generateEdge('interruption_1', 'webhook_1', 'success'),
      generateEdge('webhook_1', 'format_1', 'success'),
      generateEdge('format_1', 'message_1'),
      generateEdge('message_1', 'end_1')
    ];
    return { nodes, edges };
  }

  if (templateId === 'order-mgmt') {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: 'Order Inquiry', triggerType: 'Message Received' } },
      { id: 'webhook_1', type: 'webhook', position: { x: 400, y: 250 }, data: { label: 'Fetch Shopify Order', method: 'GET', url: 'https://api.shopify.com/orders' } },
      { id: 'logic_1', type: 'condition', position: { x: 400, y: 450 }, data: { label: 'Is Shipped?', field: 'status', operator: '==', value: 'shipped' } },
      { id: 'message_true', type: 'standard', position: { x: 100, y: 650 }, data: { label: 'Send Tracking', content: 'Good news! Your order is shipped. Track it here: [Link]' } },
      { id: 'message_false', type: 'standard', position: { x: 700, y: 650 }, data: { label: 'Send Status', content: 'Your order is currently being processed and will ship soon.' } },
      { id: 'end_1', type: 'end', position: { x: 100, y: 850 }, data: { label: 'Complete Flow' } },
      { id: 'end_2', type: 'end', position: { x: 700, y: 850 }, data: { label: 'Complete Flow' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'webhook_1'),
      generateEdge('webhook_1', 'logic_1', 'success'),
      generateEdge('logic_1', 'message_true', 'true'),
      generateEdge('logic_1', 'message_false', 'false'),
      generateEdge('message_true', 'end_1'),
      generateEdge('message_false', 'end_2')
    ];
    return { nodes, edges };
  }

  if (templateId === 'returns') {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: 'Return Request', triggerType: 'Intent Match' } },
      { id: 'logic_1', type: 'condition', position: { x: 400, y: 250 }, data: { label: 'Within 30 Days?', field: 'days_since_purchase', operator: '<', value: '30' } },
      { id: 'webhook_1', type: 'webhook', position: { x: 100, y: 450 }, data: { label: 'Generate Label', method: 'POST', url: 'https://api.shipping.com/label' } },
      { id: 'message_1', type: 'standard', position: { x: 100, y: 650 }, data: { label: 'Send Return Label', content: 'Your return is approved! Here is your printable label.' } },
      { id: 'handoff_1', type: 'handoff', position: { x: 700, y: 450 }, data: { label: 'Transfer to Support', team: 'Returns Exceptions' } },
      { id: 'end_1', type: 'end', position: { x: 100, y: 850 }, data: { label: 'Complete Flow' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'logic_1'),
      generateEdge('logic_1', 'webhook_1', 'true'),
      generateEdge('logic_1', 'handoff_1', 'false'),
      generateEdge('webhook_1', 'message_1', 'success'),
      generateEdge('message_1', 'end_1')
    ];
    return { nodes, edges };
  }

  if (templateId === 'inventory') {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: 'System Event', triggerType: 'API Webhook' } },
      { id: 'logic_1', type: 'condition', position: { x: 400, y: 250 }, data: { label: 'Check Stock', field: 'stock_count', operator: '<', value: '10' } },
      { id: 'message_1', type: 'standard', position: { x: 100, y: 450 }, data: { label: 'Alert Manager', content: 'CRITICAL: Product [Name] is running low on stock. Only [Count] left!' } },
      { id: 'end_1', type: 'end', position: { x: 100, y: 650 }, data: { label: 'End' } },
      { id: 'end_2', type: 'end', position: { x: 700, y: 450 }, data: { label: 'Ignore' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'logic_1'),
      generateEdge('logic_1', 'message_1', 'true'),
      generateEdge('logic_1', 'end_2', 'false'),
      generateEdge('message_1', 'end_1')
    ];
    return { nodes, edges };
  }

  if (templateId === 'service-booking') {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: 'User Request', triggerType: 'Intent Match' } },
      { id: 'interruption_1', type: 'interruption', position: { x: 400, y: 200 }, data: { label: 'Collect Details', userQuery: 'I want to book a haircut', aiResponse: 'Extracting service type and preferred date...', threshold: 85 } },
      { id: 'webhook_1', type: 'webhook', position: { x: 400, y: 450 }, data: { label: 'Check Calendar', method: 'GET', url: 'https://api.calendly.com/available-slots' } },
      { id: 'format_1', type: 'format', position: { x: 400, y: 650 }, data: { label: 'Format Slots', formatType: 'Interactive List' } },
      { id: 'message_1', type: 'standard', position: { x: 400, y: 800 }, data: { label: 'Send Options', content: 'Here are our available times for your service:' } },
      { id: 'end_1', type: 'end', position: { x: 400, y: 1000 }, data: { label: 'Complete Flow' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'interruption_1'),
      generateEdge('interruption_1', 'webhook_1', 'success'),
      generateEdge('webhook_1', 'format_1', 'success'),
      generateEdge('format_1', 'message_1'),
      generateEdge('message_1', 'end_1')
    ];
    return { nodes, edges };
  }

  if (templateId === 'appt-reminders') {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: 'Scheduled Event', triggerType: 'Time Based' } },
      { id: 'logic_1', type: 'condition', position: { x: 400, y: 250 }, data: { label: 'Is Tomorrow?', field: 'days_until_appt', operator: '==', value: '1' } },
      { id: 'message_1', type: 'standard', position: { x: 100, y: 450 }, data: { label: 'Send Reminder', content: 'Hi! Just a friendly reminder for your appointment tomorrow at [Time].' } },
      { id: 'delay_1', type: 'delay', position: { x: 100, y: 650 }, data: { label: 'Wait 24 Hours', duration: 86400 } },
      { id: 'message_2', type: 'standard', position: { x: 100, y: 800 }, data: { label: 'Follow-up', content: 'We hope you enjoyed your service today!' } },
      { id: 'end_1', type: 'end', position: { x: 100, y: 1000 }, data: { label: 'End' } },
      { id: 'end_2', type: 'end', position: { x: 700, y: 450 }, data: { label: 'Skip' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'logic_1'),
      generateEdge('logic_1', 'message_1', 'true'),
      generateEdge('logic_1', 'end_2', 'false'),
      generateEdge('message_1', 'delay_1'),
      generateEdge('delay_1', 'message_2'),
      generateEdge('message_2', 'end_1')
    ];
    return { nodes, edges };
  }

  if (templateId === 'cancellation') {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: 'User Request', triggerType: 'Keyword Match' } },
      { id: 'logic_1', type: 'condition', position: { x: 400, y: 250 }, data: { label: 'Late Cancellation?', field: 'hours_until_appt', operator: '<', value: '24' } },
      { id: 'message_1', type: 'standard', position: { x: 100, y: 450 }, data: { label: 'Late Fee Notice', content: 'Because this is within 24 hours, a $20 cancellation fee applies.' } },
      { id: 'webhook_1', type: 'webhook', position: { x: 700, y: 450 }, data: { label: 'Cancel in CRM', method: 'POST', url: 'https://api.crm.com/cancel' } },
      { id: 'message_2', type: 'standard', position: { x: 700, y: 650 }, data: { label: 'Confirm Cancel', content: 'Your appointment has been successfully cancelled. We hope to see you again!' } },
      { id: 'end_1', type: 'end', position: { x: 100, y: 650 }, data: { label: 'End' } },
      { id: 'end_2', type: 'end', position: { x: 700, y: 850 }, data: { label: 'End' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'logic_1'),
      generateEdge('logic_1', 'message_1', 'true'),
      generateEdge('logic_1', 'webhook_1', 'false'),
      generateEdge('message_1', 'end_1'),
      generateEdge('webhook_1', 'message_2', 'success'),
      generateEdge('message_2', 'end_2')
    ];
    return { nodes, edges };
  }

  if (templateId === 'reviews') {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: 'Service Completed', triggerType: 'API Webhook' } },
      { id: 'delay_1', type: 'delay', position: { x: 400, y: 250 }, data: { label: 'Wait 2 Hours', duration: 7200 } },
      { id: 'message_1', type: 'standard', position: { x: 400, y: 450 }, data: { label: 'Request Review', content: 'Hi there! We hope you loved your experience today. Could you leave us a quick review? [Link]' } },
      { id: 'end_1', type: 'end', position: { x: 400, y: 650 }, data: { label: 'Complete Flow' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'delay_1'),
      generateEdge('delay_1', 'message_1'),
      generateEdge('message_1', 'end_1')
    ];
    return { nodes, edges };
  }

  if (templateId === 'membership') {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: 'Monthly Check', triggerType: 'Time Based' } },
      { id: 'webhook_1', type: 'webhook', position: { x: 400, y: 250 }, data: { label: 'Check Status', method: 'GET', url: 'https://api.crm.com/membership' } },
      { id: 'logic_1', type: 'condition', position: { x: 400, y: 450 }, data: { label: 'Is Expiring?', field: 'days_remaining', operator: '<', value: '7' } },
      { id: 'message_1', type: 'standard', position: { x: 100, y: 650 }, data: { label: 'Renewal Notice', content: 'Your membership is expiring soon! Renew now to keep your benefits: [Link]' } },
      { id: 'end_1', type: 'end', position: { x: 100, y: 850 }, data: { label: 'End' } },
      { id: 'end_2', type: 'end', position: { x: 700, y: 650 }, data: { label: 'Skip' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'webhook_1'),
      generateEdge('webhook_1', 'logic_1', 'success'),
      generateEdge('logic_1', 'message_1', 'true'),
      generateEdge('logic_1', 'end_2', 'false'),
      generateEdge('message_1', 'end_1')
    ];
    return { nodes, edges };
  }

  // ── DYNAMIC GENERATOR FOR REMAINING TEMPLATES ──
  // Import config dynamically to get template names (assuming it's available or we just use templateId)
  // Instead of importing, we can format the templateId to look like a title.
  const formatTitle = (id: string) => id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const tName = formatTitle(templateId);

  const PATTERN_BOOKING = ['site-visit', 'interview', 'reservation', 'doctor-appt'];
  const PATTERN_COLLECTOR = ['documents', 'application', 'kyc-handler', 'medical-records', 'course-enroll', 'prescription'];
  const PATTERN_SEARCH = ['re-enquiry', 'property-search', 'doubt-forum', 'job-posting', 'order-taker', 'study-materials'];
  const PATTERN_REMINDER = ['exam-reminders', 'parent-updates', 'emi-reminder', 'policy-mgmt', 'follow-up', 'loan-calc'];
  const PATTERN_TRACKER = ['delivery-tracker', 'claim-tracker', 'test-results', 'screening', 'feedback', 'loyalty', 'onboarding'];

  if (PATTERN_BOOKING.includes(templateId)) {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: `Request ${tName}`, triggerType: 'Intent Match' } },
      { id: 'webhook_1', type: 'webhook', position: { x: 400, y: 250 }, data: { label: 'Check Availability', method: 'GET', url: `https://api.system.com/${templateId}/slots` } },
      { id: 'format_1', type: 'format', position: { x: 400, y: 450 }, data: { label: 'Format Slots', formatType: 'Interactive List' } },
      { id: 'message_1', type: 'standard', position: { x: 400, y: 600 }, data: { label: 'Send Options', content: `Here are the available options for your ${tName}:` } },
      { id: 'end_1', type: 'end', position: { x: 400, y: 800 }, data: { label: 'Complete' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'webhook_1'),
      generateEdge('webhook_1', 'format_1', 'success'),
      generateEdge('format_1', 'message_1'),
      generateEdge('message_1', 'end_1')
    ];
    return { nodes, edges };
  }

  if (PATTERN_COLLECTOR.includes(templateId)) {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: `Start ${tName}`, triggerType: 'Message Received' } },
      { id: 'webhook_1', type: 'webhook', position: { x: 400, y: 250 }, data: { label: 'Validate User', method: 'POST', url: `https://api.system.com/validate` } },
      { id: 'logic_1', type: 'condition', position: { x: 400, y: 450 }, data: { label: 'Is Valid?', field: 'status', operator: '==', value: 'approved' } },
      { id: 'message_1', type: 'standard', position: { x: 100, y: 650 }, data: { label: 'Request Details', content: `Please upload your documents for ${tName}.` } },
      { id: 'handoff_1', type: 'handoff', position: { x: 700, y: 650 }, data: { label: 'Transfer to Agent', team: 'Support Team' } },
      { id: 'end_1', type: 'end', position: { x: 100, y: 850 }, data: { label: 'Wait for Upload' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'webhook_1'),
      generateEdge('webhook_1', 'logic_1', 'success'),
      generateEdge('logic_1', 'message_1', 'true'),
      generateEdge('logic_1', 'handoff_1', 'false'),
      generateEdge('message_1', 'end_1')
    ];
    return { nodes, edges };
  }

  if (PATTERN_SEARCH.includes(templateId)) {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: `Query ${tName}`, triggerType: 'Keyword Match' } },
      { id: 'interruption_1', type: 'interruption', position: { x: 400, y: 200 }, data: { label: 'AI Semantic Search', userQuery: '...', aiResponse: 'Extracting key parameters...', threshold: 85 } },
      { id: 'knowledge_1', type: 'knowledge', position: { x: 400, y: 450 }, data: { label: 'Query Database', source: 'Internal Knowledge Base' } },
      { id: 'message_1', type: 'standard', position: { x: 400, y: 650 }, data: { label: 'Send Results', content: `Here are the top matches for ${tName}:` } },
      { id: 'end_1', type: 'end', position: { x: 400, y: 850 }, data: { label: 'Complete' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'interruption_1'),
      generateEdge('interruption_1', 'knowledge_1', 'success'),
      generateEdge('knowledge_1', 'message_1'),
      generateEdge('message_1', 'end_1')
    ];
    return { nodes, edges };
  }

  if (PATTERN_REMINDER.includes(templateId)) {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: `Schedule ${tName}`, triggerType: 'Time Based' } },
      { id: 'message_1', type: 'standard', position: { x: 400, y: 250 }, data: { label: 'Send Initial Notice', content: `This is your automated notification regarding ${tName}.` } },
      { id: 'delay_1', type: 'delay', position: { x: 400, y: 450 }, data: { label: 'Wait 24 Hours', duration: 86400 } },
      { id: 'message_2', type: 'standard', position: { x: 400, y: 650 }, data: { label: 'Send Follow-up', content: `Just following up on your ${tName}. Please ignore if already resolved.` } },
      { id: 'end_1', type: 'end', position: { x: 400, y: 850 }, data: { label: 'Complete' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'message_1'),
      generateEdge('message_1', 'delay_1'),
      generateEdge('delay_1', 'message_2'),
      generateEdge('message_2', 'end_1')
    ];
    return { nodes, edges };
  }

  if (PATTERN_TRACKER.includes(templateId)) {
    const nodes: AppNode[] = [
      { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: `${tName} Event`, triggerType: 'API Webhook' } },
      { id: 'webhook_1', type: 'webhook', position: { x: 400, y: 250 }, data: { label: 'Fetch Live Status', method: 'GET', url: `https://api.system.com/status/${templateId}` } },
      { id: 'logic_1', type: 'condition', position: { x: 400, y: 450 }, data: { label: 'Requires Update?', field: 'has_changed', operator: '==', value: 'true' } },
      { id: 'message_1', type: 'standard', position: { x: 100, y: 650 }, data: { label: 'Send Update', content: `We have a new update on your ${tName}. Check it out: [Link]` } },
      { id: 'end_1', type: 'end', position: { x: 100, y: 850 }, data: { label: 'Complete' } },
      { id: 'end_2', type: 'end', position: { x: 700, y: 650 }, data: { label: 'Ignore' } }
    ];
    const edges: Edge[] = [
      generateEdge('trigger_1', 'webhook_1'),
      generateEdge('webhook_1', 'logic_1', 'success'),
      generateEdge('logic_1', 'message_1', 'true'),
      generateEdge('logic_1', 'end_2', 'false'),
      generateEdge('message_1', 'end_1')
    ];
    return { nodes, edges };
  }

  // Base prebuilt flow - ecom-support (or fallback for unknown types)
  const nodes: AppNode[] = [
    { id: 'trigger_1', type: 'trigger', position: { x: 400, y: 50 }, data: { label: 'Incoming WhatsApp', triggerType: 'Message Received' } },
    { id: 'interruption_1', type: 'interruption', position: { x: 360, y: 200 }, data: { label: 'AI Intent Routing', userQuery: 'Where is my order? / I want to book', aiResponse: 'Analyzing intent based on conversation history...', threshold: 85 } },
    { id: 'logic_1', type: 'condition', position: { x: 50, y: 450 }, data: { label: 'Check Intent', field: 'intent', operator: '==', value: 'order_status' } },
    { id: 'webhook_1', type: 'webhook', position: { x: -250, y: 650 }, data: { label: 'Fetch Order Data', method: 'GET', url: 'https://api.shopify.com/v1/orders' } },
    { id: 'format_1', type: 'format', position: { x: -250, y: 850 }, data: { label: 'Format Tracking Card', formatType: 'Interactive List with Buttons' } },
    { id: 'message_1', type: 'standard', position: { x: -250, y: 1000 }, data: { label: 'Send Tracking Info', content: 'Your order #12345 is out for delivery today. Track it live here: [Link]' } },
    { id: 'memory_1', type: 'memory', position: { x: 350, y: 650 }, data: { label: 'Update User Profile', scope: 'Contact' } },
    { id: 'knowledge_1', type: 'knowledge', position: { x: 750, y: 450 }, data: { label: 'FAQ Search', source: 'Internal Knowledge Base' } },
    { id: 'message_2', type: 'standard', position: { x: 750, y: 650 }, data: { label: 'Send FAQ Answer', content: 'Based on our policy, you can return items within 30 days of delivery with no questions asked.' } },
    { id: 'handoff_1', type: 'handoff', position: { x: 1100, y: 450 }, data: { label: 'Transfer to Agent', team: 'Customer Success Team' } },
    { id: 'end_1', type: 'end', position: { x: -250, y: 1200 }, data: { label: 'Complete Flow' } },
    { id: 'end_2', type: 'end', position: { x: 750, y: 850 }, data: { label: 'Complete Flow' } }
  ];

  const edges: Edge[] = [
    generateEdge('trigger_1', 'interruption_1'),
    generateEdge('interruption_1', 'logic_1', 'success'),
    generateEdge('interruption_1', 'handoff_1', 'fallback'),
    generateEdge('logic_1', 'webhook_1', 'true'),
    generateEdge('logic_1', 'knowledge_1', 'false'),
    generateEdge('webhook_1', 'format_1', 'success'),
    generateEdge('format_1', 'message_1'),
    generateEdge('message_1', 'end_1'),
    generateEdge('webhook_1', 'memory_1', 'error'),
    generateEdge('knowledge_1', 'message_2'),
    generateEdge('message_2', 'end_2')
  ];

  return { nodes, edges };
}
