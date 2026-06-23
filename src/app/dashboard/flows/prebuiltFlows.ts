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
  if (templateId === 'blank') {
    return { nodes: [], edges: [] };
  }

  if (templateId === 'clock-tower') {
    const nodes: AppNode[] = [
      { id: 'ct1',  type: 'trigger',      position: { x: 400,  y: 50   }, data: { label: 'Inbound Message',         triggerType: 'keyword', keywords: ['hi','hello','book','table','reserve','menu','dine','lunch','dinner','hours','location','help'] } },
      { id: 'ct2',  type: 'standard',     position: { x: 400,  y: 210  }, data: { label: 'Welcome',                 content: "Welcome to Our Business! 🏰\n\nWe're so glad you reached out. What can we help you with today?" } },
      { id: 'ct3',  type: 'send_buttons', position: { x: 400,  y: 390  }, data: { label: 'Main Menu',               message: 'Choose an option below:', buttons: [{ id: 'b1', label: '📅 Book a Table', value: 'book_table' },{ id: 'b2', label: '🍽️ View Menu', value: 'view_menu' },{ id: 'b3', label: '⏰ Hours & Location', value: 'hours_info' }] } },
      { id: 'ct4',  type: 'condition',    position: { x: 400,  y: 570  }, data: { label: 'Booking?',                field: 'button_value', operator: '==', value: 'book_table' } },
      { id: 'ct5',  type: 'intake_form',  position: { x: 80,   y: 750  }, data: { label: 'Collect Booking Details', fields: [{ id: 'f1', name: 'Your Name', type: 'text', required: true, saveAs: 'guest_name', placeholder: 'Full name' },{ id: 'f2', name: 'Date & Time', type: 'text', required: true, saveAs: 'booking_datetime', placeholder: 'e.g. 30 May, 8:00 PM' },{ id: 'f3', name: 'Number of Guests', type: 'text', required: true, saveAs: 'party_size', placeholder: 'e.g. 4' },{ id: 'f4', name: 'Special Request', type: 'text', required: false, saveAs: 'special_request', placeholder: 'Birthday, anniversary, dietary needs…' }] } },
      { id: 'ct6',  type: 'standard',     position: { x: 80,   y: 970  }, data: { label: 'Reservation Confirmed ✅', content: "✅ Your table is confirmed!\n\n👤 Name: {{guest_name}}\n📅 When: {{booking_datetime}}\n👥 Guests: {{party_size}}\n\nWe look forward to welcoming you at Our Business! 🏰 A reminder will be sent before your booking." } },
      { id: 'ct7',  type: 'handoff',      position: { x: 80,   y: 1140 }, data: { label: 'Notify Restaurant Team',  message: '🔔 New Reservation\nGuest: {{guest_name}}\nDate/Time: {{booking_datetime}}\nParty Size: {{party_size}} guests\nSpecial: {{special_request}}' } },
      { id: 'ct8',  type: 'end',          position: { x: 80,   y: 1290 }, data: { label: 'End' } },
      { id: 'ct9',  type: 'condition',    position: { x: 780,  y: 570  }, data: { label: 'View Menu?',              field: 'button_value', operator: '==', value: 'view_menu' } },
      { id: 'ct10', type: 'standard',     position: { x: 580,  y: 750  }, data: { label: 'Our Menu 🍽️',            content: "Our Signature Dishes 🍽️\n\n🥗 *Starters*\nGarden Mezze Platter ₹320 | Crispy Calamari ₹280\n\n🍖 *Mains*\nSlow-Roasted Lamb Chops ₹780\nMushroom Risotto ₹520\nGrilled Sea Bass ₹680\n\n🍰 *Desserts*\nSticky Toffee Pudding ₹220\nChocolate Lava Cake ₹240\n\n🍷 Bar open till midnight. To book, just reply *Book*!" } },
      { id: 'ct11', type: 'end',          position: { x: 580,  y: 960  }, data: { label: 'End' } },
      { id: 'ct12', type: 'condition',    position: { x: 1100, y: 570  }, data: { label: 'Hours & Location?',       field: 'button_value', operator: '==', value: 'hours_info' } },
      { id: 'ct13', type: 'standard',     position: { x: 940,  y: 750  }, data: { label: 'Hours & Location',        content: "Our Business\n\n📍 {{business_address}}\n\n⏰ *Opening Hours*\nMon–Thu: 12 PM – 11 PM\nFri–Sat: 12 PM – 1 AM\nSun: 11 AM – 10 PM\n\nWalk-ins welcome! Book ahead for weekends. 😊" } },
      { id: 'ct14', type: 'end',          position: { x: 940,  y: 970  }, data: { label: 'End' } },
      { id: 'ct15', type: 'handoff',      position: { x: 1260, y: 750  }, data: { label: 'Connect to Staff',        message: 'A customer needs assistance — please connect them with a team member.' } },
      { id: 'ct16', type: 'end',          position: { x: 1260, y: 940  }, data: { label: 'End' } },
    ];
    const edges: Edge[] = [
      generateEdge('ct1',  'ct2'),
      generateEdge('ct2',  'ct3'),
      generateEdge('ct3',  'ct4'),
      generateEdge('ct4',  'ct5',  'true'),
      generateEdge('ct4',  'ct9',  'false'),
      generateEdge('ct5',  'ct6'),
      generateEdge('ct6',  'ct7'),
      generateEdge('ct7',  'ct8'),
      generateEdge('ct9',  'ct10', 'true'),
      generateEdge('ct9',  'ct12', 'false'),
      generateEdge('ct10', 'ct11'),
      generateEdge('ct12', 'ct13', 'true'),
      generateEdge('ct12', 'ct15', 'false'),
      generateEdge('ct13', 'ct14'),
      generateEdge('ct15', 'ct16'),
    ];
    return { nodes, edges };
  }

  if (templateId === 'clock-tower-feedback') {
    const nodes: AppNode[] = [
      { id: 'fb1', type: 'trigger',     position: { x: 400, y: 50  }, data: { label: 'Post-Visit Trigger',      triggerType: 'keyword', keywords: ['feedback','review','rate','experience','visited'] } },
      { id: 'fb2', type: 'standard',    position: { x: 400, y: 210 }, data: { label: 'Thank You Message',       content: "Thank you for dining at Our Business! 🏰\n\nWe'd love to hear about your experience. It only takes 30 seconds! 😊" } },
      { id: 'fb3', type: 'send_buttons',position: { x: 400, y: 390 }, data: { label: 'Rate Your Visit',         message: 'How would you rate your overall experience?', buttons: [{ id: 'b1', label: '⭐⭐⭐⭐⭐ Excellent', value: 'rating_5' },{ id: 'b2', label: '⭐⭐⭐⭐ Good', value: 'rating_4' },{ id: 'b3', label: '⭐⭐⭐ Needs Work', value: 'rating_low' }] } },
      { id: 'fb4', type: 'condition',   position: { x: 400, y: 570 }, data: { label: 'High Rating?',            field: 'button_value', operator: '!=', value: 'rating_low' } },
      { id: 'fb5', type: 'standard',    position: { x: 150, y: 750 }, data: { label: 'Ask for Review',          content: "That's wonderful to hear! 🌟\n\nWould you mind sharing your experience on Google? It truly helps us grow:\n👉 {{google_review_link}}\n\nThank you so much!" } },
      { id: 'fb6', type: 'standard',    position: { x: 700, y: 750 }, data: { label: 'Service Recovery',        content: "We're really sorry to hear that. 😔\n\nYour feedback means a lot and we'd love to make it right. A manager will reach out to you shortly." } },
      { id: 'fb7', type: 'handoff',     position: { x: 700, y: 940 }, data: { label: 'Alert Manager',           message: '⚠️ Low Rating Alert\nA guest left a low rating. Please follow up immediately.' } },
      { id: 'fb8', type: 'end',         position: { x: 150, y: 960 }, data: { label: 'End' } },
      { id: 'fb9', type: 'end',         position: { x: 700, y: 1100}, data: { label: 'End' } },
    ];
    const edges: Edge[] = [
      generateEdge('fb1', 'fb2'),
      generateEdge('fb2', 'fb3'),
      generateEdge('fb3', 'fb4'),
      generateEdge('fb4', 'fb5', 'true'),
      generateEdge('fb4', 'fb6', 'false'),
      generateEdge('fb5', 'fb8'),
      generateEdge('fb6', 'fb7'),
      generateEdge('fb7', 'fb9'),
    ];
    return { nodes, edges };
  }

  if (templateId === 'clock-tower-events') {
    const nodes: AppNode[] = [
      { id: 'ev1',  type: 'trigger',     position: { x: 400, y: 50   }, data: { label: 'Event Enquiry Trigger',   triggerType: 'keyword', keywords: ['event','birthday','anniversary','corporate','private','party','celebration','book event','function'] } },
      { id: 'ev2',  type: 'standard',    position: { x: 400, y: 210  }, data: { label: 'Welcome',                 content: "Welcome! 🎉\n\nWe'd love to host your special occasion. We offer private dining for birthdays, anniversaries, corporate events, and more!" } },
      { id: 'ev3',  type: 'send_buttons',position: { x: 400, y: 390  }, data: { label: 'Event Type',              message: 'What type of event are you planning?', buttons: [{ id: 'b1', label: '🎂 Birthday / Anniversary', value: 'personal' },{ id: 'b2', label: '💼 Corporate Event', value: 'corporate' },{ id: 'b3', label: '🎊 Other Celebration', value: 'other' }] } },
      { id: 'ev4',  type: 'intake_form', position: { x: 400, y: 570  }, data: { label: 'Collect Event Details',   fields: [{ id: 'f1', name: 'Your Name', type: 'text', required: true, saveAs: 'host_name', placeholder: 'Full name' },{ id: 'f2', name: 'Event Date', type: 'text', required: true, saveAs: 'event_date', placeholder: 'e.g. 15 June 2025' },{ id: 'f3', name: 'Number of Guests', type: 'text', required: true, saveAs: 'guest_count', placeholder: 'e.g. 25' },{ id: 'f4', name: 'Budget per person (approx)', type: 'text', required: false, saveAs: 'budget', placeholder: 'e.g. ₹800' },{ id: 'f5', name: 'Special Requirements', type: 'text', required: false, saveAs: 'requirements', placeholder: 'Decor, menu, AV setup...' }] } },
      { id: 'ev5',  type: 'standard',    position: { x: 400, y: 800  }, data: { label: 'Acknowledgement',         content: "Thank you, {{host_name}}! 🎉\n\nWe've received your enquiry for {{guest_count}} guests on {{event_date}}.\n\nOur events team will contact you within 2 hours to discuss your personalised package. We can't wait to celebrate with you! 🥂" } },
      { id: 'ev6',  type: 'handoff',     position: { x: 400, y: 980  }, data: { label: 'Notify Events Team',      message: '🎉 New Event Enquiry!\nHost: {{host_name}}\nDate: {{event_date}}\nGuests: {{guest_count}}\nBudget: {{budget}}\nRequirements: {{requirements}}\n\n📞 Please call back within 2 hours.' } },
      { id: 'ev7',  type: 'end',         position: { x: 400, y: 1140 }, data: { label: 'End' } },
    ];
    const edges: Edge[] = [
      generateEdge('ev1', 'ev2'),
      generateEdge('ev2', 'ev3'),
      generateEdge('ev3', 'ev4'),
      generateEdge('ev4', 'ev5'),
      generateEdge('ev5', 'ev6'),
      generateEdge('ev6', 'ev7'),
    ];
    return { nodes, edges };
  }

  if (templateId === 'meta-ad-lead') {
    const nodes: AppNode[] = [
      { id: 'ctwa1', type: 'ctwa_trigger',  position: { x: 400, y: 50   }, data: { label: 'Meta Ad Click',          ad_id: '' } },
      { id: 'ctwa2', type: 'standard',      position: { x: 400, y: 210  }, data: { label: 'Ad Welcome',             content: "Hi {{name}}! 👋\n\nThanks for reaching out via our ad — *{{ad_headline}}*.\n\nI'm here to help. What would you like to know?" } },
      { id: 'ctwa3', type: 'send_buttons',  position: { x: 400, y: 400  }, data: { label: 'Qualify Interest',       message: 'What can we help you with?', buttons: [{ id: 'b1', label: '💬 Learn More', value: 'learn_more' }, { id: 'b2', label: '📅 Book a Slot', value: 'book_slot' }, { id: 'b3', label: '💰 See Pricing', value: 'pricing' }] } },
      { id: 'ctwa4', type: 'condition',     position: { x: 400, y: 590  }, data: { label: 'Wants to Book?',         field: 'button_value', operator: '==', value: 'book_slot' } },
      { id: 'ctwa5', type: 'intake_form',   position: { x: 80,  y: 770  }, data: { label: 'Capture Lead Details',   fields: [{ id: 'f1', name: 'Your Name', type: 'text', required: true, saveAs: 'lead_name', placeholder: 'Full name' }, { id: 'f2', name: 'Best time to call', type: 'text', required: true, saveAs: 'preferred_time', placeholder: 'e.g. Tomorrow 3 PM' }, { id: 'f3', name: 'Your requirement', type: 'text', required: false, saveAs: 'requirement', placeholder: 'Tell us a bit more…' }] } },
      { id: 'ctwa6', type: 'standard',      position: { x: 80,  y: 990  }, data: { label: 'Booking Confirmed ✅',  content: "✅ Got it, {{lead_name}}!\n\nWe'll call you at {{preferred_time}} to take things forward.\n\nIn the meantime, feel free to ask anything! 😊" } },
      { id: 'ctwa7', type: 'handoff',       position: { x: 80,  y: 1160 }, data: { label: 'Notify Sales Team',     message: '🔔 New Ad Lead!\nSource: {{ad_headline}}\nName: {{lead_name}}\nTime: {{preferred_time}}\nRequirement: {{requirement}}\nPhone: {{wa_phone}}' } },
      { id: 'ctwa8', type: 'end',           position: { x: 80,  y: 1300 }, data: { label: 'End' } },
      { id: 'ctwa9', type: 'condition',     position: { x: 750, y: 590  }, data: { label: 'Wants Pricing?',         field: 'button_value', operator: '==', value: 'pricing' } },
      { id: 'ctwa10', type: 'standard',     position: { x: 550, y: 770  }, data: { label: 'Share Pricing',          content: "Here's a quick overview of our packages:\n\n📦 *Starter* — ₹999/mo\n📦 *Growth* — ₹2,499/mo\n📦 *Pro* — ₹6,999/mo\n\nWant us to recommend the best fit? Reply with your use case! 💬" } },
      { id: 'ctwa11', type: 'end',          position: { x: 550, y: 970  }, data: { label: 'End' } },
      { id: 'ctwa12', type: 'ai_reply',     position: { x: 1020, y: 770 }, data: { label: 'AI: Answer Query',       systemPrompt: 'You are a helpful sales assistant. The customer came from a Meta ad ("{{ad_headline}}"). Answer their query helpfully and try to guide them toward booking a call.' } },
      { id: 'ctwa13', type: 'end',          position: { x: 1020, y: 970 }, data: { label: 'End' } },
    ];
    const edges: Edge[] = [
      generateEdge('ctwa1',  'ctwa2'),
      generateEdge('ctwa2',  'ctwa3'),
      generateEdge('ctwa3',  'ctwa4'),
      generateEdge('ctwa4',  'ctwa5',  'true'),
      generateEdge('ctwa4',  'ctwa9',  'false'),
      generateEdge('ctwa5',  'ctwa6'),
      generateEdge('ctwa6',  'ctwa7'),
      generateEdge('ctwa7',  'ctwa8'),
      generateEdge('ctwa9',  'ctwa10', 'true'),
      generateEdge('ctwa9',  'ctwa12', 'false'),
      generateEdge('ctwa10', 'ctwa11'),
      generateEdge('ctwa12', 'ctwa13'),
    ];
    return { nodes, edges };
  }

  // ─── DEYOR TRIPS / TRAVEL CTWA LEAD FLOW ─────────────────────────────────────
  if (templateId === 'deyor-ladakh') {
    const nodes: AppNode[] = [
      // 1. Trigger — fires when customer clicks the Meta CTWA ad
      { id: 'dy1', type: 'ctwa_trigger', position: { x: 400, y: 50   }, data: { label: 'Meta Ad Click', ad_id: '' } },

      // 2. Welcome — greet with ad headline
      { id: 'dy2', type: 'standard',     position: { x: 400, y: 210  }, data: { label: 'Welcome', content: "Hi {{name}}! 👋 Thanks for your interest in our Ladakh expeditions!\n\nWe have some amazing trips lined up and we'd love to help you find the perfect one. Let's get started! 🏔️" } },

      // 3. Trip selection buttons
      { id: 'dy3', type: 'send_buttons', position: { x: 400, y: 390  }, data: { label: 'Which Trip?', message: 'Which Ladakh expedition are you interested in?', buttons: [{ id: 'b1', label: '6N/7D with Turtuk', value: 'turtuk' }, { id: 'b2', label: '7N/8D with Umling La', value: 'umling_la' }, { id: 'b3', label: 'Other Trips', value: 'other_trip' }] } },

      // 4. Pass-through condition (any button click continues)
      { id: 'dy4', type: 'condition',    position: { x: 400, y: 570  }, data: { label: 'Trip Selected', field: 'button_value', operator: '!=', value: 'NEVER_MATCHES' } },

      // 5. Date selection buttons
      { id: 'dy5', type: 'send_buttons', position: { x: 400, y: 760  }, data: { label: 'Which Dates?', message: "Great choice! 🎉\n\nWhich departure date works best for you?", buttons: [{ id: 'b4', label: '2 Jul - 8 Jul', value: 'jul_2' }, { id: 'b5', label: '23 Jul - 29 Jul', value: 'jul_23' }, { id: 'b6', label: 'Other Dates', value: 'other_date' }] } },

      // 6. Pass-through
      { id: 'dy6', type: 'condition',    position: { x: 400, y: 940  }, data: { label: 'Date Selected', field: 'button_value', operator: '!=', value: 'NEVER_MATCHES' } },

      // 7. Budget check buttons
      { id: 'dy7', type: 'send_buttons', position: { x: 400, y: 1120 }, data: { label: 'Budget OK?', message: "💰 The cost for this expedition is *₹69,999 per person* (all inclusive — bike, accommodation, meals & transfers).\n\nIs this budget okay for you?", buttons: [{ id: 'b7', label: "That's fine! ✅", value: 'budget_ok' }, { id: 'b8', label: 'I need to think', value: 'budget_think' }] } },

      // 8. Pass-through
      { id: 'dy8', type: 'condition',    position: { x: 400, y: 1300 }, data: { label: 'Budget Response', field: 'button_value', operator: '!=', value: 'NEVER_MATCHES' } },

      // 9. Flights to Leh buttons
      { id: 'dy9', type: 'send_buttons', position: { x: 400, y: 1480 }, data: { label: 'Flights Booked?', message: "✈️ Are your flights to Leh already booked?", buttons: [{ id: 'b9', label: 'Yes, booked! ✈️', value: 'flights_yes' }, { id: 'b10', label: 'Not yet', value: 'flights_no' }] } },

      // 10. Pass-through
      { id: 'dy10', type: 'condition',   position: { x: 400, y: 1660 }, data: { label: 'Flights Response', field: 'button_value', operator: '!=', value: 'NEVER_MATCHES' } },

      // 11. Special requirements (free text)
      { id: 'dy11', type: 'standard',    position: { x: 400, y: 1840 }, data: { label: 'Special Requirements?', content: "Last question! 📝\n\nDo you have any special requirements? (dietary needs, medical conditions, experience level, etc.)\n\nType your answer below, or reply *None* if nothing specific." } },

      // 12. Collect the free-text answer
      { id: 'dy12', type: 'intake_form', position: { x: 400, y: 2020 }, data: { label: 'Collect Requirements', fields: [{ id: 'f1', name: 'Special Requirements', type: 'text', required: false, saveAs: 'special_req', placeholder: 'e.g. Vegetarian, no prior bike exp, altitude sickness concern…' }] } },

      // 13. Notify team
      { id: 'dy13', type: 'handoff',     position: { x: 400, y: 2240 }, data: { label: 'Notify Team 🔔', message: "🏔️ *New Ladakh Trip Lead!*\n\nName: {{name}}\nPhone: {{wa_phone}}\nSpecial Requirements: {{special_req}}\n\n_(Check WhatsApp conversation for trip choice, dates, budget & flight status)_" } },

      // 14. Thank you + itinerary highlights
      { id: 'dy14', type: 'standard',    position: { x: 400, y: 2440 }, data: { label: 'Thank You 🌟', content: "Amazing! 🌟\n\nWe've got your details and our team will reach out to you shortly!\n\nIn the meantime, here's a quick look at what each trip covers:\n\n🏕️ *6N/7D with Turtuk*\nNubra Valley → Remote Turtuk village → Pangong Lake\n\n⛰️ *7N/8D with Umling La*\nWorld's highest motorable road → Hanle → Tso Moriri Lake\n\nStay excited — Ladakh awaits! 🏔️" } },

      // 15. End
      { id: 'dy15', type: 'end',         position: { x: 400, y: 2640 }, data: { label: 'End' } },

      // 16. Dead-end for false branches (unreachable in practice)
      { id: 'dy16', type: 'end',         position: { x: 780, y: 940  }, data: { label: 'End' } },
    ];

    const edges: Edge[] = [
      generateEdge('dy1',  'dy2'),
      generateEdge('dy2',  'dy3'),
      generateEdge('dy3',  'dy4'),
      generateEdge('dy4',  'dy5',  'true'),   // any trip button → ask dates
      generateEdge('dy4',  'dy16', 'false'),  // dead branch
      generateEdge('dy5',  'dy6'),
      generateEdge('dy6',  'dy7',  'true'),   // any date → ask budget
      generateEdge('dy6',  'dy16', 'false'),
      generateEdge('dy7',  'dy8'),
      generateEdge('dy8',  'dy9',  'true'),   // any budget answer → ask flights
      generateEdge('dy8',  'dy16', 'false'),
      generateEdge('dy9',  'dy10'),
      generateEdge('dy10', 'dy11', 'true'),   // any flight answer → special req
      generateEdge('dy10', 'dy16', 'false'),
      generateEdge('dy11', 'dy12'),
      generateEdge('dy12', 'dy13'),
      generateEdge('dy13', 'dy14'),
      generateEdge('dy14', 'dy15'),
    ];
    return { nodes, edges };
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
