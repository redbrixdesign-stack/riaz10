/* ============================================
   ADVISOROS v5.0 — CONFIG
   Trade/country/tax settings
   ============================================ */

const CONFIG = {
  // Current settings (loaded from DB on init)
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
    { id: 'review', name: 'Review', icon: 'rate_review', badgeClass: 'badge-accent' }
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
      { id: 'completed', name: 'Completed', icon: 'check_circle', nextAction: 'request_review' },
      { id: 'partial', name: 'Partial', icon: 'timelapse', nextAction: 'schedule_return' },
      { id: 'customer_no_show', name: 'Customer No Show', icon: 'person_off', nextAction: 'rebook' },
      { id: 'spec_mismatch', name: 'Specification Mismatch', icon: 'rule', nextAction: 'resolve_spec' },
      { id: 'missing_parts', name: 'Missing Parts', icon: 'inventory_2', nextAction: 'order_parts' },
      { id: 'access_issue', name: 'Access Issue', icon: 'key_off', nextAction: 'rebook' },
      { id: 'issues', name: 'Issues Reported', icon: 'error', nextAction: 'schedule_revisit' },
      { id: 'revisit', name: 'Re-visit Needed', icon: 'refresh', nextAction: 'schedule_revisit' },
      { id: 'refused', name: 'Client Refused', icon: 'block', nextAction: 'resolve_dispute' }
    ]
  },

  // Communication templates
  templates: {
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
      apology: "Hi {{firstName}}, sorry I couldn't make the visit as planned. I appreciate your time and would like to get this rebooked at a time that suits you. — {{advisorName}}"
    },
    post_sale: {
      review: "Hi {{firstName}}, hope you're enjoying your new {{productType}}! If you're happy with the work, I'd love a quick review. It really helps: [link] — {{advisorName}}",
      referral: "Hi {{firstName}}, great to work with you on the {{productType}}. If you know anyone looking for window coverings, I'd love an intro — I offer £50 off their first order as a thank you. — {{advisorName}}"
    },
    on_my_way: "Hi {{firstName}}, I'm on my way and should be with you in about {{eta}}. See you soon! — {{advisorName}}",
    running_late: "Hi {{firstName}}, running about {{delay}} minutes late due to traffic. Still on my way! — {{advisorName}}"
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
