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

  if (templateId === 'mezo-booking') {
    return getMezoBookingFlow();
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

  // ─── GLOBESOME ZANSKAR RAFTING CTWA FLOW ─────────────────────────────────────
  if (templateId === 'globesome-rafting') {
    const nodes: AppNode[] = [
      // 1. Fires when customer clicks the Meta CTWA ad
      { id: 'gr1',  type: 'ctwa_trigger', position: { x: 400, y: 50   }, data: { label: 'Meta Ad Click', ad_id: '' } },

      // 2. Brief ack before first question
      { id: 'gr2',  type: 'standard',     position: { x: 400, y: 210  }, data: { label: 'Welcome', content: "Hi {{name}}! 👋 Thanks for your interest in our *6N/7D Zanskar River Rafting Expedition*! 🛶\n\nLet me quickly get a few details so our team can assist you." } },

      // 3. Date selection
      { id: 'gr3',  type: 'send_buttons', position: { x: 400, y: 390  }, data: { label: 'Which Date?', message: 'Which date are you looking to join? 📅', buttons: [{ id: 'b1', label: '2nd Jul - 8th Jul', value: 'jul_2_8' }, { id: 'b2', label: '23rd Jul - 29th Jul', value: 'jul_23_29' }, { id: 'b3', label: 'Other Dates', value: 'other_date' }] } },
      { id: 'gr4',  type: 'condition',    position: { x: 400, y: 570  }, data: { label: 'Date Selected', field: 'button_value', operator: '!=', value: 'NEVER_MATCHES' } },

      // 4. Cost confirmation
      { id: 'gr5',  type: 'send_buttons', position: { x: 400, y: 760  }, data: { label: 'Cost OK?', message: 'The cost of the expedition is *₹69,999 per person* (all inclusive). Is this okay for you?', buttons: [{ id: 'b4', label: "That's not an issue", value: 'cost_ok' }, { id: 'b5', label: 'I need to think', value: 'cost_think' }] } },
      { id: 'gr6',  type: 'condition',    position: { x: 400, y: 940  }, data: { label: 'Cost Response', field: 'button_value', operator: '!=', value: 'NEVER_MATCHES' } },

      // 5. Group size
      { id: 'gr7',  type: 'send_buttons', position: { x: 400, y: 1120 }, data: { label: 'How Many People?', message: 'How many people will be joining the expedition? 👥', buttons: [{ id: 'b6', label: 'Just me! (1)', value: 'solo' }, { id: 'b7', label: '2 People', value: 'two' }, { id: 'b8', label: '3+ People', value: 'group' }] } },
      { id: 'gr8',  type: 'condition',    position: { x: 400, y: 1300 }, data: { label: 'Group Size', field: 'button_value', operator: '!=', value: 'NEVER_MATCHES' } },

      // 6. Flights to Ladakh
      { id: 'gr9',  type: 'send_buttons', position: { x: 400, y: 1480 }, data: { label: 'Flights Booked?', message: '✈️ Are your flights to Leh/Ladakh already booked?', buttons: [{ id: 'b9', label: 'Yes, booked! ✈️', value: 'flights_yes' }, { id: 'b10', label: 'No, not yet', value: 'flights_no' }] } },
      { id: 'gr10', type: 'condition',    position: { x: 400, y: 1660 }, data: { label: 'Flights Response', field: 'button_value', operator: '!=', value: 'NEVER_MATCHES' } },

      // 7. Special requirements (free text)
      { id: 'gr11', type: 'standard',     position: { x: 400, y: 1840 }, data: { label: 'Special Requirements?', content: "Last question! 📝\n\nDo you have any special requirements?\n(Dietary needs, medical conditions, swimming ability, prior rafting experience, etc.)\n\nType your answer below, or reply *None*." } },
      { id: 'gr12', type: 'intake_form',  position: { x: 400, y: 2020 }, data: { label: 'Collect Requirements', fields: [{ id: 'f1', name: 'Special Requirements', type: 'text', required: false, saveAs: 'special_req', placeholder: 'e.g. Vegetarian, non-swimmer, first time rafting…' }] } },

      // 8. Notify the Globesome team
      { id: 'gr13', type: 'handoff',      position: { x: 400, y: 2240 }, data: { label: 'Notify Team 🔔', message: "🛶 *New Zanskar Rafting Lead!*\n\nName: {{name}}\nPhone: {{wa_phone}}\nSpecial Requirements: {{special_req}}\n\n_(Check WhatsApp conversation for date, budget, group size & flight details)_" } },

      // 9. Thank you
      { id: 'gr14', type: 'standard',     position: { x: 400, y: 2440 }, data: { label: 'Thank You 🌟', content: "Amazing! 🌟\n\nWe've got all your details! Our team will reach out to you shortly to confirm your spot on the *6N/7D Zanskar River Rafting Expedition*.\n\n🛶 Get ready for the adventure of a lifetime — the Zanskar awaits! 🏔️" } },

      // 10. End
      { id: 'gr15', type: 'end',          position: { x: 400, y: 2640 }, data: { label: 'End' } },
      { id: 'gr16', type: 'end',          position: { x: 780, y: 940  }, data: { label: 'End' } },
    ];

    const edges: Edge[] = [
      generateEdge('gr1',  'gr2'),
      generateEdge('gr2',  'gr3'),
      generateEdge('gr3',  'gr4'),
      generateEdge('gr4',  'gr5',  'true'),
      generateEdge('gr4',  'gr16', 'false'),
      generateEdge('gr5',  'gr6'),
      generateEdge('gr6',  'gr7',  'true'),
      generateEdge('gr6',  'gr16', 'false'),
      generateEdge('gr7',  'gr8'),
      generateEdge('gr8',  'gr9',  'true'),
      generateEdge('gr8',  'gr16', 'false'),
      generateEdge('gr9',  'gr10'),
      generateEdge('gr10', 'gr11', 'true'),
      generateEdge('gr10', 'gr16', 'false'),
      generateEdge('gr11', 'gr12'),
      generateEdge('gr12', 'gr13'),
      generateEdge('gr13', 'gr14'),
      generateEdge('gr14', 'gr15'),
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

export function getMezoBookingFlow(): { nodes: AppNode[], edges: Edge[] } {
  const nodes: AppNode[] = [
    // ── TRIGGER ──────────────────────────────────────────────────────────────
    {
      id: 'mz1', type: 'trigger', position: { x: 500, y: 40 },
      data: { label: 'Inbound Message', triggerType: 'keyword', keywords: ['hi','hello','hey','book','table','reserve','reservation','party','event','weekend','happening','menu','dine','dinner','lunch','cocktail','drinks','discount','offer','location','parking','valet','timing','hours'] }
    },
    // ── WELCOME ───────────────────────────────────────────────────────────────
    {
      id: 'mz2', type: 'standard', position: { x: 500, y: 200 },
      data: { label: 'Welcome Message', content: "🌿 *Welcome to Mezo — The Tropical Paradise* 🐆✨\n\nThank you for reaching out! We're thrilled to have you here.\n\n🎁 *Exclusive WhatsApp Offer:* Book directly with us and enjoy *20% OFF* your entire bill — a better deal than Swiggy or Zomato, straight from us!\n\nHow can I make your Mezo experience extraordinary today? 🌴" }
    },
    // ── MAIN MENU BUTTONS ─────────────────────────────────────────────────────
    {
      id: 'mz3', type: 'send_buttons', position: { x: 500, y: 390 },
      data: { label: 'Main Menu', message: 'Choose an option below ✨', buttons: [{ id: 'b1', label: '📅 Book a Table', value: 'book_table' }, { id: 'b2', label: '🎉 Events & Parties', value: 'events' }, { id: 'b3', label: '🍹 Menu & Info', value: 'menu_info' }] }
    },
    // ── BRANCH: BOOKING ───────────────────────────────────────────────────────
    {
      id: 'mz4', type: 'condition', position: { x: 500, y: 570 },
      data: { label: 'Book a Table?', field: 'button_value', operator: '==', value: 'book_table' }
    },
    // ── INTAKE FORM ───────────────────────────────────────────────────────────
    {
      id: 'mz5', type: 'intake_form', position: { x: 140, y: 760 },
      data: { label: 'Collect Booking Details', fields: [
        { id: 'f1', name: 'Your Name', type: 'text', required: true, saveAs: 'guest_name', placeholder: 'e.g. Rahul Sharma' },
        { id: 'f2', name: 'Date of Visit', type: 'text', required: true, saveAs: 'booking_date', placeholder: 'e.g. 5 July 2025' },
        { id: 'f3', name: 'Arrival Time', type: 'text', required: true, saveAs: 'arrival_time', placeholder: 'e.g. 8:00 PM' },
        { id: 'f4', name: 'Number of Guests', type: 'number', required: true, saveAs: 'party_size', placeholder: 'e.g. 4' },
        { id: 'f5', name: 'Any Special Request?', type: 'text', required: false, saveAs: 'special_request', placeholder: 'Birthday, anniversary, dietary needs…' }
      ]}
    },
    // ── CHECK PARTY SIZE ──────────────────────────────────────────────────────
    {
      id: 'mz6', type: 'condition', position: { x: 140, y: 1040 },
      data: { label: 'More than 6 guests?', field: 'party_size', operator: '>', value: '6' }
    },
    // ── CONFIRMED (≤ 6 guests) ────────────────────────────────────────────────
    {
      id: 'mz7', type: 'standard', position: { x: -160, y: 1240 },
      data: { label: '✅ Booking Confirmed', content: "✅ *Your Table is Confirmed at Mezo!* 🌿\n\n👤 *Name:* {{guest_name}}\n📅 *Date:* {{booking_date}}\n⏰ *Time:* {{arrival_time}}\n👥 *Guests:* {{party_size}}\n💬 *Special Request:* {{special_request}}\n\n🎁 Your *20% discount* is locked in for this booking!\n\n📍 *Finding Us:* Behind Radisson Blu Hotel, Tonk Road, Jaipur — we have our own entrance 🌴 (do not enter via Radisson lobby)\n\n🚗 *Valet parking* available\n🎶 *Live events* every weekend\n\nWe can't wait to welcome you to Mezo! 🐆✨" }
    },
    // ── NOTIFY TEAM ───────────────────────────────────────────────────────────
    {
      id: 'mz8', type: 'handoff', position: { x: -160, y: 1460 },
      data: { label: 'Notify Mezo Team', message: '🔔 *New Reservation — Mezo*\n👤 Guest: {{guest_name}}\n📅 Date: {{booking_date}}\n⏰ Time: {{arrival_time}}\n👥 Party Size: {{party_size}}\n💬 Special: {{special_request}}' }
    },
    { id: 'mz9', type: 'end', position: { x: -160, y: 1640 }, data: { label: 'End' } },

    // ── LARGE GROUP (> 6) ─────────────────────────────────────────────────────
    {
      id: 'mz10', type: 'standard', position: { x: 440, y: 1240 },
      data: { label: 'Large Group — Contact Team', content: "🌿 For groups of *7 or more*, our events team will personally ensure everything is absolutely perfect for you!\n\nPlease get in touch with us directly and we'll take care of every detail 🐆✨" }
    },
    {
      id: 'mz11', type: 'send_buttons', position: { x: 440, y: 1430 },
      data: { label: 'Contact Options', message: 'How would you like to reach us? 📲', buttons: [{ id: 'c1', label: '📞 Call Our Team', value: 'call_team' }, { id: 'c2', label: '📸 Instagram', value: 'show_instagram' }] }
    },
    {
      id: 'mz12', type: 'condition', position: { x: 440, y: 1610 },
      data: { label: 'Call Team?', field: 'button_value', operator: '==', value: 'call_team' }
    },
    // ── CALL DETAILS ──────────────────────────────────────────────────────────
    {
      id: 'mz13', type: 'standard', position: { x: 240, y: 1800 },
      data: { label: 'Share Phone Number', content: "📞 *Call or WhatsApp Us Directly:*\n\n👉 *9091559090*\n\nOur team is available daily *12 PM – 12 AM* and will personally handle your large group booking to make it a truly unforgettable experience! 🌿🐆\n\n_We look forward to hosting you at Mezo!_ ✨" }
    },
    { id: 'mz14', type: 'end', position: { x: 240, y: 1990 }, data: { label: 'End' } },
    // ── INSTAGRAM (from large group) ──────────────────────────────────────────
    {
      id: 'mz15', type: 'standard', position: { x: 680, y: 1800 },
      data: { label: 'Share Instagram', content: "📸 *Follow us on Instagram for the latest updates:*\n\n👉 https://www.instagram.com/mezo_jaipur/\n\nYou'll find our latest weekend events, parties, DJ nights & exclusive offers there first! 🎶🌴\n\nFor bookings, feel free to call us at *9091559090* 🐆✨" }
    },
    { id: 'mz16', type: 'end', position: { x: 680, y: 1990 }, data: { label: 'End' } },

    // ── EVENTS PATH ───────────────────────────────────────────────────────────
    {
      id: 'mz17', type: 'condition', position: { x: 860, y: 570 },
      data: { label: 'Events?', field: 'button_value', operator: '==', value: 'events' }
    },
    {
      id: 'mz18', type: 'standard', position: { x: 900, y: 760 },
      data: { label: 'Events & Parties Info', content: "🎉 *Events & Private Parties at Mezo!* 🌿\n\nWe host incredible experiences every weekend — DJ nights, live music, themed parties, and more! 🎶\n\nWe also specialise in:\n🎂 Birthday Celebrations\n💍 Anniversary Dinners\n🏢 Corporate Events & Team Outings\n💃 Bachelorette & Stag Parties\n\nFor the *latest weekend events*, check our Instagram 📸\n👉 https://www.instagram.com/mezo_jaipur/\n\nFor *private bookings*, our team will curate the perfect experience for you! 🐆✨" }
    },
    {
      id: 'mz19', type: 'send_buttons', position: { x: 900, y: 1000 },
      data: { label: 'Events Contact Options', message: 'Ready to make it happen? 🌴', buttons: [{ id: 'e1', label: '📞 Call to Book', value: 'call_events' }, { id: 'e2', label: '📸 View on Instagram', value: 'instagram_events' }] }
    },
    {
      id: 'mz20', type: 'condition', position: { x: 900, y: 1180 },
      data: { label: 'Call for Events?', field: 'button_value', operator: '==', value: 'call_events' }
    },
    {
      id: 'mz21', type: 'standard', position: { x: 720, y: 1370 },
      data: { label: 'Events Phone', content: "📞 *Call or WhatsApp Our Events Team:*\n\n👉 *9091559090*\n\nAvailable daily *12 PM – 12 AM*\n\nOur team will personally plan every detail to make your event absolutely extraordinary at Mezo! 🌿🐆✨" }
    },
    { id: 'mz22', type: 'end', position: { x: 720, y: 1560 }, data: { label: 'End' } },
    {
      id: 'mz23', type: 'standard', position: { x: 1100, y: 1370 },
      data: { label: 'Events Instagram', content: "📸 *Follow Mezo on Instagram for all upcoming events:*\n\n👉 https://www.instagram.com/mezo_jaipur/\n\nWe post our weekend parties, DJ nights & exclusive events first on Instagram! 🎶🌴\n\nTo book a private event, call us at *9091559090* 🐆✨" }
    },
    { id: 'mz24', type: 'end', position: { x: 1100, y: 1560 }, data: { label: 'End' } },

    // ── MENU & INFO PATH ──────────────────────────────────────────────────────
    {
      id: 'mz25', type: 'condition', position: { x: 1200, y: 570 },
      data: { label: 'Menu & Info?', field: 'button_value', operator: '==', value: 'menu_info' }
    },
    {
      id: 'mz26', type: 'standard', position: { x: 1260, y: 760 },
      data: { label: 'Menu Highlights & Info', content: "🌿 *Mezo — The Tropical Paradise* 🐆\n\n*Our Cuisines:* North Indian 🍛 | Continental | Mediterranean | Oriental | Pizza 🍕 | Biryani | Sushi & More!\n\n🍹 *Signature Cocktails* from ₹775\n🍽️ *Starters* from ₹450 | *Mains* from ₹575\n🍕 *Thin Crust Pizzas* from ₹850\n🍮 *Desserts* from ₹565\n☕ *Coffee & Cold Brews* from ₹125\n\n💰 *Average cost for two:* ₹1,400 – ₹2,300\n\n📍 Behind Radisson Blu Hotel, Tonk Road, Jaipur\n⏰ Open daily *12 PM – 12 AM*\n🚗 Valet Parking available\n🎶 Live events every weekend\n\n🎁 *Book via WhatsApp for 20% OFF!* 🌴✨" }
    },
    {
      id: 'mz27', type: 'send_buttons', position: { x: 1260, y: 1010 },
      data: { label: 'After Menu Options', message: 'What would you like to do next? 🌴', buttons: [{ id: 'm1', label: '📅 Book Now', value: 'book_table_from_menu' }, { id: 'm2', label: '📸 Instagram', value: 'instagram_menu' }] }
    },
    {
      id: 'mz28', type: 'condition', position: { x: 1260, y: 1190 },
      data: { label: 'Book from Menu?', field: 'button_value', operator: '==', value: 'book_table_from_menu' }
    },
    {
      id: 'mz29', type: 'intake_form', position: { x: 1100, y: 1390 },
      data: { label: 'Collect Booking Details', fields: [
        { id: 'g1', name: 'Your Name', type: 'text', required: true, saveAs: 'guest_name', placeholder: 'e.g. Priya Gupta' },
        { id: 'g2', name: 'Date of Visit', type: 'text', required: true, saveAs: 'booking_date', placeholder: 'e.g. 5 July 2025' },
        { id: 'g3', name: 'Arrival Time', type: 'text', required: true, saveAs: 'arrival_time', placeholder: 'e.g. 8:00 PM' },
        { id: 'g4', name: 'Number of Guests', type: 'number', required: true, saveAs: 'party_size', placeholder: 'e.g. 2' },
        { id: 'g5', name: 'Special Request?', type: 'text', required: false, saveAs: 'special_request', placeholder: 'Birthday, dietary needs…' }
      ]}
    },
    {
      id: 'mz30', type: 'standard', position: { x: 1100, y: 1660 },
      data: { label: '✅ Booking Confirmed (from menu)', content: "✅ *Your Table is Confirmed at Mezo!* 🌿\n\n👤 *Name:* {{guest_name}}\n📅 *Date:* {{booking_date}}\n⏰ *Time:* {{arrival_time}}\n👥 *Guests:* {{party_size}}\n\n🎁 Your *20% discount* is confirmed!\n\n📍 Behind Radisson Blu Hotel, Tonk Road — our own entrance 🌴\n🚗 Valet parking available\n\nWe can't wait to welcome you to Mezo! 🐆✨" }
    },
    {
      id: 'mz31', type: 'handoff', position: { x: 1100, y: 1870 },
      data: { label: 'Notify Mezo Team', message: '🔔 *New Reservation — Mezo*\n👤 Guest: {{guest_name}}\n📅 Date: {{booking_date}}\n⏰ Time: {{arrival_time}}\n👥 Party: {{party_size}}\n💬 Special: {{special_request}}' }
    },
    { id: 'mz32', type: 'end', position: { x: 1100, y: 2050 }, data: { label: 'End' } },
    {
      id: 'mz33', type: 'standard', position: { x: 1440, y: 1390 },
      data: { label: 'Instagram from Menu', content: "📸 *Follow Mezo on Instagram:*\n\n👉 https://www.instagram.com/mezo_jaipur/\n\nSee our latest events, food, cocktails & weekend parties! 🎶🌴🐆" }
    },
    { id: 'mz34', type: 'end', position: { x: 1440, y: 1580 }, data: { label: 'End' } },
    // Fallback for unmatched main menu
    {
      id: 'mz35', type: 'handoff', position: { x: 1600, y: 760 },
      data: { label: 'Connect to Mezo Team', message: 'A guest needs assistance — please attend to them at your earliest. 🌿' }
    },
    { id: 'mz36', type: 'end', position: { x: 1600, y: 940 }, data: { label: 'End' } },
  ];

  const edges: Edge[] = [
    generateEdge('mz1',  'mz2'),
    generateEdge('mz2',  'mz3'),
    generateEdge('mz3',  'mz4'),
    // Booking path
    generateEdge('mz4',  'mz5',  'true'),
    generateEdge('mz5',  'mz6'),
    generateEdge('mz6',  'mz7',  'false'),   // ≤6 guests → confirm
    generateEdge('mz7',  'mz8'),
    generateEdge('mz8',  'mz9'),
    generateEdge('mz6',  'mz10', 'true'),    // >6 guests → contact team
    generateEdge('mz10', 'mz11'),
    generateEdge('mz11', 'mz12'),
    generateEdge('mz12', 'mz13', 'true'),    // call
    generateEdge('mz13', 'mz14'),
    generateEdge('mz12', 'mz15', 'false'),   // instagram
    generateEdge('mz15', 'mz16'),
    // Events path
    generateEdge('mz4',  'mz17', 'false'),
    generateEdge('mz17', 'mz18', 'true'),
    generateEdge('mz18', 'mz19'),
    generateEdge('mz19', 'mz20'),
    generateEdge('mz20', 'mz21', 'true'),    // call for events
    generateEdge('mz21', 'mz22'),
    generateEdge('mz20', 'mz23', 'false'),   // instagram for events
    generateEdge('mz23', 'mz24'),
    // Menu & Info path
    generateEdge('mz17', 'mz25', 'false'),
    generateEdge('mz25', 'mz26', 'true'),
    generateEdge('mz26', 'mz27'),
    generateEdge('mz27', 'mz28'),
    generateEdge('mz28', 'mz29', 'true'),    // book from menu
    generateEdge('mz29', 'mz30'),
    generateEdge('mz30', 'mz31'),
    generateEdge('mz31', 'mz32'),
    generateEdge('mz28', 'mz33', 'false'),   // instagram from menu
    generateEdge('mz33', 'mz34'),
    // Fallback
    generateEdge('mz25', 'mz35', 'false'),
    generateEdge('mz35', 'mz36'),
  ];

  return { nodes, edges };
}
