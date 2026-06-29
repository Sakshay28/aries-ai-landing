export const BUSINESS_TYPE_CONFIG: Record<string, any> = {
  'ecommerce': {
    name: 'E-Commerce',
    icon: 'ShoppingCart',
    color: '#06B6D4',
    description: 'Online stores, product sales, order tracking, returns management',
    templates: [
      { id: 'ecom-support', name: 'E-Commerce Support', description: 'Automated order tracking and customer assistance.' },
      { id: 'product-recs', name: 'Product Recommendations', description: 'AI-driven personalized product suggestions.' },
      { id: 'order-mgmt', name: 'Order Management', description: 'End-to-end order tracking and status updates.' },
      { id: 'returns', name: 'Returns Handler', description: 'Frictionless automated returns and refunds process.' },
      { id: 'inventory', name: 'Inventory Alerts', description: 'Proactive low-stock and restock notifications.' },
    ],
    openSections: ['E-COMMERCE', 'MESSAGING', 'AI & LOGIC', 'INTEGRATIONS'],
    highlightedSection: 'E-COMMERCE',
    capabilities: ['Handles order tracking', 'Auto replies to FAQs', 'Syncs with Shopify']
  },
  
  'services': {
    name: 'Services & Appointments',
    icon: 'Calendar',
    color: '#06B6D4',
    description: 'Salons, clinics, gyms, consultants, spas, beauty services',
    templates: [
      { id: 'service-booking', name: 'Service Booking', description: 'Frictionless appointment scheduling and confirmation.' },
      { id: 'appt-reminders', name: 'Appointment Reminders', description: 'Automated multi-channel calendar reminders.' },
      { id: 'cancellation', name: 'Cancellation Handler', description: 'Smart cancellation and rescheduling flows.' },
      { id: 'reviews', name: 'Review Collector', description: 'Post-service satisfaction and review requests.' },
      { id: 'membership', name: 'Membership Manager', description: 'Subscription and membership lifecycle automation.' },
    ],
    openSections: ['APPOINTMENTS & SERVICES', 'MESSAGING', 'AI & LOGIC', 'INTEGRATIONS'],
    highlightedSection: 'APPOINTMENTS & SERVICES',
    capabilities: ['Automates scheduling', 'Reduces no-shows', 'Collects reviews']
  },
  
  'realestate': {
    name: 'Real Estate',
    icon: 'Home',
    color: '#06B6D4',
    description: 'Property sales, rentals, site visits, lead management',
    templates: [
      { id: 're-enquiry', name: 'Real Estate Enquiry', description: 'Instant response and qualification for property leads.' },
      { id: 'property-search', name: 'Property Search', description: 'Intelligent property matching based on preferences.' },
      { id: 'site-visit', name: 'Site Visit Scheduler', description: 'Automated physical and virtual tour bookings.' },
      { id: 'loan-calc', name: 'Loan Calculator', description: 'Interactive EMI and mortgage estimation.' },
      { id: 'documents', name: 'Document Collector', description: 'Secure KYC and legal document gathering.' },
    ],
    openSections: ['REAL ESTATE', 'LEAD GENERATION & CRM', 'MESSAGING', 'INTEGRATIONS'],
    highlightedSection: 'REAL ESTATE',
    capabilities: ['Qualifies property leads', 'Schedules site visits', 'Shares floor plans']
  },
  
  'education': {
    name: 'Education & Coaching',
    icon: 'BookOpen',
    color: '#06B6D4',
    description: 'Online courses, tutoring, classes, student management',
    templates: [
      { id: 'course-enroll', name: 'Course Enrollment', description: 'Automated student registration and onboarding.' },
      { id: 'study-materials', name: 'Study Materials', description: 'Instant access to course documents and syllabus.' },
      { id: 'exam-reminders', name: 'Exam Reminders', description: 'Automated notifications for upcoming assessments.' },
      { id: 'doubt-forum', name: 'Doubt Forum', description: 'AI-powered student query resolution.' },
      { id: 'parent-updates', name: 'Parent Updates', description: 'Automated progress reports and announcements.' },
    ],
    openSections: ['EDUCATION & COACHING', 'MESSAGING', 'AI & LOGIC'],
    highlightedSection: 'EDUCATION & COACHING',
    capabilities: ['Automates enrollments', 'Distributes materials', 'Answers student FAQs']
  },
  
  'recruitment': {
    name: 'Recruitment & HR',
    icon: 'Users',
    color: '#06B6D4',
    description: 'Hiring, candidate screening, interviews, onboarding',
    templates: [
      { id: 'job-posting', name: 'Job Posting Bot', description: 'Interactive role descriptions and requirements.' },
      { id: 'application', name: 'Application Handler', description: 'Automated resume parsing and data collection.' },
      { id: 'screening', name: 'Candidate Screening', description: 'AI-driven initial candidate qualification.' },
      { id: 'interview', name: 'Interview Scheduler', description: 'Calendar syncing and interview coordination.' },
      { id: 'onboarding', name: 'Onboarding Flow', description: 'Automated new hire documentation and orientation.' },
    ],
    openSections: ['RECRUITMENT & HR', 'MESSAGING', 'AI & LOGIC'],
    highlightedSection: 'RECRUITMENT & HR',
    capabilities: ['Screens candidates', 'Schedules interviews', 'Answers HR queries']
  },
  
  'restaurants': {
    name: 'Restaurants & Food',
    icon: 'UtensilsCrossed',
    color: '#06B6D4',
    description: 'Orders, reservations, delivery, menu management',
    templates: [
      { id: 'order-taker', name: 'Order Taker', description: 'Conversational menu browsing and ordering.' },
      { id: 'reservation', name: 'Table Reservation', description: 'Real-time table booking and waitlist management.' },
      { id: 'delivery-tracker', name: 'Delivery Tracker', description: 'Live updates for food preparation and delivery.' },
      { id: 'feedback', name: 'Feedback Collector', description: 'Post-meal satisfaction and rating requests.' },
      { id: 'loyalty', name: 'Loyalty Program', description: 'Automated rewards and return customer incentives.' },
    ],
    openSections: ['RESTAURANTS & FOOD', 'MESSAGING', 'INTEGRATIONS'],
    highlightedSection: 'RESTAURANTS & FOOD',
    capabilities: ['Takes food orders', 'Handles reservations', 'Manages loyalty']
  },
  
  'finance': {
    name: 'Finance & Insurance',
    icon: 'Coins',
    color: '#06B6D4',
    description: 'Loans, EMI reminders, policy management, payments',
    templates: [
      { id: 'emi-reminder', name: 'EMI Reminder', description: 'Proactive payment collection and reminders.' },
      { id: 'policy-mgmt', name: 'Policy Management', description: 'Insurance policy details and renewal alerts.' },
      { id: 'claim-tracker', name: 'Claim Tracker', description: 'Automated claim filing and status updates.' },
      { id: 'kyc-handler', name: 'KYC Handler', description: 'Secure document verification and compliance.' },
      { id: 'loan-calc', name: 'Loan Calculator', description: 'Interactive loan eligibility and EMI estimates.' },
    ],
    openSections: ['FINANCE & INSURANCE', 'MESSAGING', 'INTEGRATIONS'],
    highlightedSection: 'FINANCE & INSURANCE',
    capabilities: ['Sends EMI reminders', 'Automates KYC checks', 'Tracks claim status']
  },
  
  'healthcare': {
    name: 'Healthcare',
    icon: 'Heart',
    color: '#06B6D4',
    description: 'Doctor appointments, patient records, prescription management',
    templates: [
      { id: 'doctor-appt', name: 'Doctor Appointment', description: 'Patient scheduling and doctor availability.' },
      { id: 'prescription', name: 'Prescription Manager', description: 'Automated refill requests and dosage reminders.' },
      { id: 'test-results', name: 'Test Results', description: 'Secure delivery of lab reports and diagnostics.' },
      { id: 'follow-up', name: 'Follow-up Reminder', description: 'Post-visit check-ins and recovery tracking.' },
      { id: 'medical-records', name: 'Medical Records', description: 'Secure access to patient history and documents.' },
    ],
    openSections: ['APPOINTMENTS & SERVICES', 'MESSAGING', 'INTEGRATIONS', 'AI & LOGIC'],
    highlightedSection: 'APPOINTMENTS & SERVICES',
    capabilities: ['Books doctor visits', 'Sends test results', 'Manages prescriptions']
  },
  
  'blank': {
    name: 'Custom / Blank',
    icon: 'Zap',
    color: '#06B6D4',
    description: 'Build from scratch with full 150+ node toolkit',
    templates: [],
    openSections: ['TRIGGERS', 'MESSAGING', 'AI & LOGIC', 'E-COMMERCE', 
                   'APPOINTMENTS & SERVICES', 'LEAD GENERATION & CRM', 'REAL ESTATE',
                   'EDUCATION & COACHING', 'RECRUITMENT & HR', 'RESTAURANTS & FOOD',
                   'FINANCE & INSURANCE', 'INTEGRATIONS', 'CUSTOM'],
    highlightedSection: null,
    capabilities: ['Full 150+ node toolkit', 'Blank canvas', 'Total flexibility']
  }
};
