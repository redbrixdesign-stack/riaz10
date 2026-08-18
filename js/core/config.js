/* ============================================
   ADVISOROS v5.0 — CONFIG
   Trade/country/tax settings
   ============================================ */

const CONFIG = {
  // Current settings (loaded from DB on init)
  appVersion: '5.0', // single source for the backup envelope + About
  advisorMode: 'company',
  trade: 'window_coverings',
  country: 'GB',
  currency: 'GBP',
  taxSystem: 'uk_self_assessment',
  dateFormat: 'DD/MM/YYYY',
  distanceUnit: 'miles',
  measurementUnit: 'mm',

  // Advisor identity & targets (set during onboarding)
  advisorName: '',
  companyName: '', // White-label: shown in place of "AdvisorOS" wherever set, editable in Settings
  businessAddress: '',
  businessLatLng: null,
  // Weekly EARNINGS target — the number the advisor actually sets (in Onboarding/Settings).
  weeklyTarget: 600,
  // NOTE: weeklySalesTarget is no longer set directly. It is now DERIVED from
  // weeklyTarget ÷ TaxCalculator.getEffectiveCommissionRate() — see
  // TaxCalculator.getRequiredWeeklySales(). This field is kept only as a
  // last-resort fallback for any code path that reads it before TaxCalculator
  // is available; it should never be treated as the source of truth.
  weeklySalesTarget: 10000,

  // Deposit rules
  depositRules: {
    minimum: 750,
    fullPaymentThreshold: 1500,
    percentageAboveThreshold: 50
  },

  // Commission — fully configurable in Settings.
  // mode: 'simple'    -> commission = sale value x simpleRate%
  //       'two_stage'  -> net = sale value x (1 - saleReductionRate%), commission = net x netCommissionRate%
  //         (e.g. sale reduced by 20%, then 15.25% commission taken on that net figure)
  commission: {
    mode: 'two_stage',
    simpleRate: 10,          // used when mode === 'simple'
    saleReductionRate: 20,   // % deducted from sale value to get the "net" figure (two_stage)
    netCommissionRate: 15.25, // % of the net figure paid as commission (two_stage)
    tiers: null
  },

  workingWeek: {
    salesDays: [1, 2, 4],
    fittingDays: [3, 5],
    slotMinutes: 15,
    blocks: [
      { id: 'morning', name: '09:00-12:00', start: '09:00', end: '12:00' },
      { id: 'midday', name: '12:00-15:00', start: '12:00', end: '15:00' },
      { id: 'afternoon', name: '15:00-18:00', start: '15:00', end: '18:00' },
      { id: 'evening', name: '18:00-21:00', start: '18:00', end: '21:00' }
    ]
  },

  // UK 2026-27 planning defaults. These are estimates, not filing advice.
  // IMPORTANT: `limit` on each band is the WIDTH of that band (how much taxable
  // profit it covers), not a cumulative threshold — TaxCalculator.calculate()
  // consumes bands sequentially. Basic rate covers £0-£37,700 of taxable profit
  // (width 37,700). Higher rate covers £37,700-£112,570 of taxable profit, i.e.
  // £50,270-£125,140 of total income (width 74,870 — NOT 125,140-12,570=112,570,
  // which was the previous bug here and silently undercharged additional-rate
  // taxpayers by taxing too much of their income at 40% instead of 45%).
  taxBands: [
    { limit: 37700, rate: 0.20 },
    { limit: 74870, rate: 0.40 },
    { limit: Infinity, rate: 0.45 }
  ],
  personalAllowance: 12570,
  class4NIC: { lowerThreshold: 12570, upperThreshold: 50270, mainRate: 0.06, additionalRate: 0.02 },
  mileageRate: 0.55,
  mileageRateOver: 0.25,

  // Minimum acceptable value of the advisor's own time, per hour — used only
  // by TaxCalculator.calculateVisitFloor() to work out a walk-away floor price
  // after a price objection. null until the advisor sets it in Settings; a
  // rough fallback is derived from weeklyTarget in the meantime (see
  // TaxCalculator.getMinHourlyRate()).
  minHourlyRate: null,

  // Trade types
  trades: [
    { id: 'window_coverings', name: 'Window Coverings', icon: 'blinds' },
    { id: 'plumbing', name: 'Plumbing', icon: 'plumbing' },
    { id: 'electrical', name: 'Electrical', icon: 'electrical_services' },
    { id: 'hvac', name: 'HVAC', icon: 'hvac' },
    { id: 'cleaning', name: 'Cleaning', icon: 'cleaning_services' },
    { id: 'landscaping', name: 'Landscaping', icon: 'yard' },
    { id: 'beauty', name: 'Beauty/Hair', icon: 'spa' },
    { id: 'appliance', name: 'Appliance Repair', icon: 'handyman' },
    { id: 'other', name: 'Other', icon: 'build' }
  ],

  // Lead sources
  leadSources: [
    'Facebook',
    'Instagram',
    'TikTok',
    'Google',
    'Website',
    'Referral',
    'Leaflet',
    'Show Home',
    'Event',
    'Walk-in',
    'Other'
  ],

  // Expense categories
  expenseCategories: [
    { id: 'fuel', name: 'Fuel', icon: 'local_gas_station' },
    { id: 'samples', name: 'Samples', icon: 'palette' },
    { id: 'tools', name: 'Tools/Equipment', icon: 'construction' },
    { id: 'phone', name: 'Phone/Internet', icon: 'smartphone' },
    { id: 'insurance', name: 'Insurance', icon: 'shield' },
    { id: 'vehicle', name: 'Vehicle Costs', icon: 'directions_car' },
    { id: 'marketing', name: 'Marketing', icon: 'campaign' },
    { id: 'training', name: 'Training', icon: 'school' },
    { id: 'other', name: 'Other', icon: 'receipt' }
  ],

  // Appointment types
  appointmentTypes: [
    { id: 'consultation', name: 'Consultation', icon: 'chat', badgeClass: 'badge-primary' },
    { id: 'measure', name: 'Measure', icon: 'straighten', badgeClass: 'badge-info' },
    { id: 'fitting', name: 'Fitting', icon: 'handyman', badgeClass: 'badge-success' },
    { id: 'follow_up', name: 'Follow Up', icon: 'phone', badgeClass: 'badge-warning' },
    { id: 'review', name: 'Review', icon: 'rate_review', badgeClass: 'badge-accent' },
    { id: 'service_call', name: 'Service Call', icon: 'build', badgeClass: 'badge-danger' }
  ],

  // Outcomes
  outcomes: {
    consultation: [
      // Sale outcomes
      { id: 'ordered', name: 'Ordered', icon: 'shopping_cart', nextAction: 'schedule_fitting' },
      { id: 'quoted', name: 'Quoted', icon: 'receipt', nextAction: 'follow_up_3d' },

      // Why not converted (quote given, not yet bought)
      { id: 'thinking', name: 'Needs to Think', icon: 'psychology', nextAction: 'follow_up_5d' },
      { id: 'partner', name: 'Talk to Partner', icon: 'groups', nextAction: 'follow_up_joint' },
      { id: 'compare_quotes', name: 'Comparing Quotes', icon: 'compare_arrows', nextAction: 'value_follow_up' },
      { id: 'expensive', name: 'Too Expensive', icon: 'payments', nextAction: 'offer_alternative' },

      // Why couldn't quote / didn't fit
      { id: 'spec_mismatch', name: 'Spec Mismatch', icon: 'rule', nextAction: 'clarify_spec' },
      { id: 'not_looking_for', name: 'Not What They Wanted', icon: 'search_off', nextAction: 'close_lost' },
      { id: 'out_of_range', name: 'Not in Range', icon: 'block', nextAction: 'record_gap' },
      { id: 'other_no_sale', name: 'Other / No Sale', icon: 'cancel', nextAction: 'close_lost' },

      // Technical/site issue - not a sales objection, kept separate for reporting
      { id: 'windows_too_high', name: 'Windows Too High', icon: 'height', nextAction: 'safety_check' },

      // Visit didn't happen at all - kept separate from sales outcomes
      { id: 'customer_no_show', name: 'Customer No Show', icon: 'person_off', nextAction: 'rebook' },
      { id: 'advisor_unavailable', name: 'Advisor Could Not Attend', icon: 'event_busy', nextAction: 'apologise_rebook' }
    ],
    measure: [
      { id: 'measured', name: 'All Measured', icon: 'check_circle', nextAction: 'prepare_quote' },
      { id: 'partial', name: 'Partial Measure', icon: 'timelapse', nextAction: 'schedule_remeasure' },
      { id: 'remeasure', name: 'Re-measure Needed', icon: 'refresh', nextAction: 'schedule_remeasure' },
      { id: 'cancelled', name: 'Cancelled', icon: 'cancel', nextAction: 'close_lost' }
    ],
    fitting: [
      { id: 'completed', name: 'Fitted', icon: 'check_circle', nextAction: 'request_review' },
      { id: 'not_ready', name: 'Not Fitted - Customer Not Ready', icon: 'event_busy', nextAction: 'rebook' },
      { id: 'advisor_unavailable', name: 'Not Fitted - Could Not Attend', icon: 'person_off', nextAction: 'rebook' },
      { id: 'refused_child_safety', name: 'Not Fitted - Refused Child Safety Install', icon: 'warning', nextAction: 'log_compliance_refusal' },
      { id: 'partial', name: 'Partial', icon: 'timelapse', nextAction: 'schedule_return' },
      { id: 'customer_no_show', name: 'Customer No Show', icon: 'person_off', nextAction: 'rebook' },
      { id: 'spec_mismatch', name: 'Specification Mismatch', icon: 'rule', nextAction: 'resolve_spec' },
      { id: 'missing_parts', name: 'Missing Parts', icon: 'inventory_2', nextAction: 'order_parts' },
      { id: 'access_issue', name: 'Access Issue', icon: 'key_off', nextAction: 'rebook' },
      { id: 'issues', name: 'Issues Reported', icon: 'error', nextAction: 'schedule_revisit' },
      { id: 'revisit', name: 'Re-visit Needed', icon: 'refresh', nextAction: 'schedule_revisit' },
      { id: 'refused', name: 'Client Refused', icon: 'block', nextAction: 'resolve_dispute' }
    ],
    review: [
      { id: 'happy', name: 'Happy / No Issues', icon: 'thumb_up', nextAction: 'request_review' },
      { id: 'minor_issue', name: 'Minor Issue - Fixed On Site', icon: 'build', nextAction: 'request_review' },
      { id: 'needs_service_call', name: 'Needs Service Call', icon: 'event_repeat', nextAction: 'book_service_call' },
      { id: 'review_left', name: 'Review Left', icon: 'star', nextAction: 'referral_ask' },
      { id: 'customer_no_show', name: 'Customer No Show', icon: 'person_off', nextAction: 'rebook' }
    ],
    follow_up: [
      { id: 'reached', name: 'Reached - Progressing', icon: 'call', nextAction: 'continue_follow_up' },
      { id: 'no_answer', name: 'No Answer', icon: 'phone_missed', nextAction: 'retry_follow_up' },
      { id: 'ordered', name: 'Ordered', icon: 'shopping_cart', nextAction: 'schedule_fitting' },
      { id: 'lost', name: 'Lost / Not Proceeding', icon: 'cancel', nextAction: 'close_lost' }
    ],
    service_call: [
      { id: 'resolved', name: 'Resolved On Site', icon: 'check_circle', nextAction: 'request_review' },
      { id: 'parts_needed', name: 'Parts Needed', icon: 'inventory_2', nextAction: 'order_parts' },
      { id: 'revisit_needed', name: 'Re-visit Needed', icon: 'refresh', nextAction: 'schedule_revisit' },
      { id: 'access_issue', name: 'Access Issue', icon: 'key_off', nextAction: 'rebook' },
      { id: 'not_a_fault', name: 'Not a Fault / Customer Error', icon: 'info', nextAction: 'close_lost' },
      { id: 'customer_no_show', name: 'Customer No Show', icon: 'person_off', nextAction: 'rebook' }
    ]
  },

  // Communication templates
  templates: {
    // Booking-confirmation messages are now built dynamically by
    // NotificationService.buildBookingConfirmationMessage (see
    // js/services/notification.js) - the wording adapts to how far off the
    // visit is (today / tomorrow / this week / further out), which a fixed
    // per-type string here couldn't do. Kept the day-before reminder as a
    // plain template since that one's always sent with the same lead time.
    // Sent the day before - a lighter reminder, not the full ask again.
    day_before: "Hi {{firstName}}, just a reminder I'll be with you tomorrow at {{time}} at {{address}}. Let me know if anything's changed. — {{advisorName}}",
    confirmation: {
      consultation: "Hi {{firstName}}, just confirming our visit tomorrow at {{time}}. I'll see you at {{address}}. If anything changes, just reply here. — {{advisorName}}",
      measure: "Hi {{firstName}}, looking forward to measuring up for your {{productType}} tomorrow at {{time}}. — {{advisorName}}",
      fitting: "Hi {{firstName}}, your {{productType}} is ready! I'll be with you tomorrow at {{time}} for fitting. — {{advisorName}}"
    },
    follow_up: {
      quote: "Hi {{firstName}}, just checking in on the quote for your {{productType}}. Any questions I can answer? — {{advisorName}}",
      partner: "Hi {{firstName}}, would it help if I visited when you and your partner are both home? I can bring samples and answer any questions together. — {{advisorName}}",
      gentle: "Hi {{firstName}}, hope you're well. Just wanted to follow up on our conversation about your {{productType}}. No pressure, just here when you're ready. — {{advisorName}}",
      compare: "Hi {{firstName}}, I know you're comparing options. If helpful, I can talk you through the differences so you're comparing like-for-like on quality, fitting and aftercare. — {{advisorName}}",
      discount: "Hi {{firstName}}, I may have a little room today if we can get this wrapped up. Would you like me to sharpen the quote and talk you through the options? — {{advisorName}}",
      rebook: "Hi {{firstName}}, sorry we missed each other. Shall we get another visit booked in? I can send a couple of suitable times. — {{advisorName}}",
      apology: "Hi {{firstName}}, sorry I couldn't make the visit as planned. I appreciate your time and would like to get this rebooked at a time that suits you. — {{advisorName}}",
      spec: "Hi {{firstName}}, thanks for your time today. I can look at adjusting the specification to what you need — just let me know what would work better and I'll sort it out. — {{advisorName}}"
    },
    post_sale: {
      review: "Hi {{firstName}}, hope you're enjoying your new {{productType}}! If you're happy with the work, I'd love a quick review. It really helps: [link] — {{advisorName}}",
      referral: "Hi {{firstName}}, great to work with you on the {{productType}}. If you know anyone looking for window coverings, I'd love an intro — I offer £50 off their first order as a thank you. — {{advisorName}}"
    },
    // Deposit/payment reminder for a live order (used by the Follow-ups inbox
    // and the Orders board's message button). Callers pass supplierOrderNumber
    // and depositAmount via TalkFeature.sendMessage's extra variables.
    payment_reminder: "Hi {{firstName}}, a quick one about your order{{supplierOrderNumber}} — the {{depositLabel}} of {{depositAmount}} is ready whenever you are. Just reply here to arrange it. — {{advisorName}}",
    on_my_way: "Hi {{firstName}}, I'm on my way and should be with you in about {{eta}}. See you soon! — {{advisorName}}",
    running_late: "Hi {{firstName}}, running about {{delay}} minutes late due to traffic. Still on my way! — {{advisorName}}",
    // Fallback wording for the automated cadence (message-scheduler.js) when
    // Claude AI is off — the AI drafts something warmer when it's enabled.
    evening_before: "Hi {{firstName}}, just a quick one — I'm with you tomorrow at {{time}} at {{address}}. It'd help to know how many windows you're looking at and if you have specific blinds in mind. Any parking or anything else I should know about too? See you tomorrow! — {{advisorName}}",
    morning_of: "Hi {{firstName}}, looking forward to seeing you today at {{time}}. If you get a chance, let me know how many windows and which blinds you're thinking of — and any parking or access notes. See you shortly! — {{advisorName}}",
    // Intro/prep for a first-time customer's booking (Follow-ups 'intro' task).
    pre_intro: "Hi {{firstName}}, I'm {{advisorName}} and I'll be with you on {{day}} at {{time}} for your {{visitType}} at {{address}}. If you can let me know about parking, access (gates, stairs, pets) and which windows you'd like me to focus on, that would help me be fully prepared. Any questions, just reply here.",
    // Order confirmation after an 'ordered' outcome.
    outcome_ordered: "Hi {{firstName}}, thanks again for ordering today. Your {{productType}} is now in hand — I'll keep you posted on fitting dates. Anything you need in the meantime, just reply here. — {{advisorName}}",
    // Post-fitting thank-you + review/referral ask (Follow-ups 'post_fit' task).
    post_fit_followup: "Hi {{firstName}}, hope you're pleased with how the fitting looks today! If anything doesn't feel right — operation, finish or fit — just reply and I'll come back and put it right. If you're happy, a short review or a word to friends and neighbours would mean a lot. — {{advisorName}}",
    // Service/issue acknowledgement (Follow-ups 'service' task).
    service_or_issue_followup: "Hi {{firstName}}, thanks for letting me know about this — I'm sorry about the inconvenience. I've logged it and will come back to you as soon as I have next steps. If anything changes in the meantime, just reply here. — {{advisorName}}"
  },

  // Automated message cadence around each visit (js/services/message-scheduler.js):
  // evening-before and morning-of drafts fire at these UK times while the app
  // is open, and the departure message fires when a trip starts. All three
  // open the preview sheet for review — nothing is ever auto-sent.
  autoMessages: {
    enabled: false,
    eveningHour: 18,   // day before the visit, UK time
    morningHour: 8     // on the day of the visit, UK time
  },

  // Follow-up inbox (js/features/followups): payment reminders become "due"
  // this many days after an order was created. Quote-chase timing is driven
  // by Talk's OUTCOME_TEMPLATE_MAP (with learned timing where available).
  followups: {
    paymentReminderDays: 3
  },

  // Claude AI — OCR reads documents/photos, Talk drafts messages.
  // Both go through the user's own serverless proxy (which holds the
  // ANTHROPIC_API_KEY, never shipped into the PWA bundle) so it also
  // works on Vercel hosting where the browser would otherwise be
  // blocked from calling api.anthropic.com directly (CORS).
  ai: {
    enabled: false,
    proxyUrl: '',       // e.g. https://your-site.vercel.app/api/claude
    secret: '',         // optional; sent as X-AI-Key header for non-Anthropic proxies
    ocrModel: 'claude-sonnet-4-5',   // Vision — used for OCR extraction
    draftModel: 'claude-haiku-4-5'   // Fast/cheap — used for Talk drafts + companion turns
  },

  // Mapbox — paid geocoding & routing (Directions API).
  // Optional: when set, used instead of public OSRM/Nominatim.
  // Get a key at https://account.mapbox.com/access-tokens/
  geo: {
    mapboxKey: ''
  },

  // Beelo companion (js/features/companion) — the DeepSeek-style chat home
  // screen. Rule-built answers always work (offline, free); aiPhrasing lets
  // Claude rephrase the reply + suggest the next question when AI is on.
  // maxHistoryTurns caps the session context sent to the proxy so a long
  // chat can't blow up the token bill.
  companion: {
    aiPhrasing: true,
    maxHistoryTurns: 6,
    aiPreferenceKey: 'advisoros_companion_ai'
  },

  // Probability decay (days since quote → probability)
  probabilityDecay: {
    0: 0.80,
    3: 0.60,
    7: 0.40,
    14: 0.20,
    21: 0.05
  }
};
