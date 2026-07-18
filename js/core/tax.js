/* ============================================
   ADVISOROS v5.0 — TAX CALCULATOR
   UK Self-Assessment (configurable for global)
   ============================================ */

const TaxCalculator = {
  // Calculate tax for given profit and tax year
  calculate(profit, options = {}) {
    const config = CONFIG;
    const taxYear = options.taxYear || this.getCurrentTaxYear();

    // Personal allowance (tapers above £100k)
    let personalAllowance = config.personalAllowance;
    if (profit > 100000) {
      const reduction = Math.floor((profit - 100000) / 2);
      personalAllowance = Math.max(0, personalAllowance - reduction);
    }

    // Taxable profit
    const taxableProfit = Math.max(0, profit - personalAllowance);

    // Income tax on taxable profit after personal allowance.
    let incomeTax = 0;
    let remaining = taxableProfit;
    const taxBands = config.taxBands || [
      { limit: 37700, rate: 0.20 },
      { limit: 74870, rate: 0.40 },
      { limit: Infinity, rate: 0.45 }
    ];
    for (const band of taxBands) {
      if (remaining <= 0) break;
      const taxableInBand = Math.min(remaining, band.limit);
      incomeTax += taxableInBand * band.rate;
      remaining -= taxableInBand;
    }

    // Class 4 NIC
    let class4NIC = 0;
    const nic = config.class4NIC || {};
    const lower = nic.lowerThreshold ?? nic.threshold ?? 12570;
    const upper = nic.upperThreshold ?? 50270;
    const mainRate = nic.mainRate ?? nic.rate ?? 0.06;
    const additionalRate = nic.additionalRate ?? 0.02;
    if (profit > lower) {
      class4NIC += Math.max(0, Math.min(profit, upper) - lower) * mainRate;
      class4NIC += Math.max(0, profit - upper) * additionalRate;
    }

    // Total liability
    const totalLiability = incomeTax + class4NIC;

    // Payment on account
    const nextYearEstimate = totalLiability;
    const paymentOnAccount = nextYearEstimate / 2;

    // Due dates
    const now = new Date();
    const jan31Due = new Date(taxYear.endYear + 1, 0, 31);
    const jul31Due = new Date(taxYear.endYear + 1, 6, 31);

    // Amounts due
    let amountDueJan31 = totalLiability;
    let amountDueJul31 = 0;

    // If not first year, add payment on account
    if (!options.firstYear) {
      amountDueJan31 += paymentOnAccount;
      amountDueJul31 = paymentOnAccount;
    }

    // Recommended weekly savings
    const weeksToJan31 = Math.max(1, Math.ceil((jan31Due - now) / (7 * 24 * 60 * 60 * 1000)));
    const recommendedWeeklySave = amountDueJan31 / weeksToJan31;

    return {
      taxYear,
      profit,
      personalAllowance,
      taxableProfit,
      incomeTax,
      class4NIC,
      totalLiability,
      paymentOnAccount,
      amountDueJan31,
      amountDueJul31,
      dueDates: {
        jan31: jan31Due,
        jul31: jul31Due
      },
      recommendedWeeklySave,
      weeksToJan31,
      effectiveRate: profit > 0 ? (totalLiability / profit) * 100 : 0
    };
  },

  // Get current tax year. Delegates to Utils.getTaxYearStart(), which checks
  // the UK calendar date (via Europe/London) against the real April 6
  // cutover — not just "is it April yet" — so the tax year doesn't flip
  // 5 days early every year.
  getCurrentTaxYear() {
    const start = Utils.getTaxYearStart();
    const startYear = start.getFullYear();
    const endYear = startYear + 1;
    return {
      startYear,
      endYear,
      label: `${startYear}-${String(endYear).slice(2)}`
    };
  },

  // Calculate from actual data
  async calculateFromData(startDate, endDate) {
    // Get income from completed appointments with orders
    const appointments = await DB.db.appointments
      .where('date')
      .between(startDate, endDate)
      .and(a => a.outcome === 'ordered')
      .toArray();

    const totalIncome = appointments.reduce((sum, a) => {
      if (typeof a.commission === 'number' && a.commission > 0) return sum + a.commission;
      return sum + this.estimateCommission(a.value || 0);
    }, 0);

    // Get expenses
    const expenses = await DB.getExpensesForPeriod(startDate, endDate);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Get mileage
    const trips = await DB.getTripsForPeriod(startDate, endDate);
    const totalKm = trips.reduce((sum, t) => sum + (t.distanceKm || 0), 0);
    const mileageClaim = this.calculateMileageClaim(totalKm);

    // Total deductible expenses
    const totalDeductible = totalExpenses + mileageClaim;

    // Profit
    const profit = totalIncome - totalDeductible;

    return {
      totalIncome,
      totalExpenses,
      mileageClaim,
      totalDeductible,
      profit,
      tax: this.calculate(profit)
    };
  },

  // Estimate advisor commission from sale value when an exact commission was not recorded.
  // Fully driven by CONFIG.commission, which is editable in Settings.
  estimateCommission(orderValue) {
    const saleValue = Number(orderValue || 0);
    if (!saleValue) return 0;
    const commission = CONFIG.commission || {};

    // 'two_stage': deduct a % from the sale to get a net figure, then take a % of that net figure.
    // e.g. sale reduced by 20%, then 15.25% commission on the remaining net.
    if (commission.mode === 'two_stage') {
      const netValue = saleValue * (1 - (commission.saleReductionRate || 0) / 100);
      return netValue * ((commission.netCommissionRate || 0) / 100);
    }

    // 'simple': flat % of the sale value.
    if (commission.mode === 'simple') {
      return saleValue * ((commission.simpleRate || 0) / 100);
    }

    // Legacy config shape support (pre-v5.1): { type: 'percentage', rate: 10 }
    if (commission.type === 'percentage') {
      return saleValue * ((commission.rate || 0) / 100);
    }

    return saleValue;
  },

  // Effective commission rate as a decimal (0-1) — how much of every £1 of sale value
  // ends up as advisor earnings, given the current commission config.
  // Used to derive the sales target from the earnings target (and vice versa).
  getEffectiveCommissionRate() {
    const commission = CONFIG.commission || {};
    if (commission.mode === 'two_stage') {
      const netFraction = 1 - (commission.saleReductionRate || 0) / 100;
      const rateFraction = (commission.netCommissionRate || 0) / 100;
      return Math.max(0, netFraction * rateFraction);
    }
    if (commission.mode === 'simple') {
      return Math.max(0, (commission.simpleRate || 0) / 100);
    }
    if (commission.type === 'percentage') {
      return Math.max(0, (commission.rate || 0) / 100);
    }
    return 0;
  },

  // Required weekly sales figure to land a given weekly earnings target,
  // given the current commission structure. This is what "Weekly Sales Target"
  // now derives from — it is no longer a separately-set number.
  getRequiredWeeklySales(earningsTarget) {
    const rate = this.getEffectiveCommissionRate();
    const target = Number(earningsTarget || 0);
    if (rate <= 0) return 0;
    return target / rate;
  },

  // Calculate mileage claim from kilometres, applying UK simplified mileage bands.
  calculateMileageClaim(totalKm) {
    const miles = totalKm * 0.621371;
    const firstBand = Math.min(Math.max(0, miles), 10000) * CONFIG.mileageRate;
    const secondBand = Math.max(0, miles - 10000) * CONFIG.mileageRateOver;
    return firstBand + secondBand;
  },

  // Advisor's own minimum acceptable hourly value. This is deliberately
  // separate from mileageRate — the mileage rate already bundles fuel, wear
  // and tear, depreciation and insurance into one HMRC-approved per-mile
  // figure (that's what it's *for*), so adding insurance again here would
  // double-count it. What mileage doesn't cover is your time, which is
  // usually the bigger cost on a short-distance visit.
  //
  // Falls back to a rough estimate from weeklyTarget if the advisor hasn't
  // set a real number in Settings — flagged via isEstimate so callers can
  // tell the difference between "your number" and "a guess".
  getMinHourlyRate() {
    if (typeof CONFIG.minHourlyRate === 'number' && CONFIG.minHourlyRate > 0) {
      return { rate: CONFIG.minHourlyRate, isEstimate: false };
    }
    const fallback = (CONFIG.weeklyTarget || 0) / 25; // rough: ~25 actively-selling hours/week
    return { rate: Math.round(fallback * 100) / 100, isEstimate: true };
  },

  // Break-even "floor" for a visit at risk of being lost to a price
  // objection — the minimum sale value below which taking the deal is worse
  // than walking away, once BOTH travel cost and your own time are counted.
  //
  // This is a last-resort walk-away check, not a target to negotiate toward.
  // Deliberately not called from anywhere automatic — see
  // AppointmentsFeature.openFloorCheckModal(), which is the only caller and
  // is itself gated behind a manual tap after a price-objection outcome.
  //
  // distanceKm: ONE-WAY distance from base to the visit (this doubles it).
  // visitMinutes: length of the appointment itself (from durationSlots).
  // driveMinutesOneWay: estimated one-way drive time (this doubles it too).
  calculateVisitFloor({ distanceKm = 0, visitMinutes = 0, driveMinutesOneWay = 0 }) {
    const { rate: hourlyRate, isEstimate } = this.getMinHourlyRate();

    const roundTripKm = Math.max(0, distanceKm) * 2;
    const tripCost = this.calculateMileageClaim(roundTripKm);

    const totalMinutes = Math.max(0, visitMinutes) + Math.max(0, driveMinutesOneWay) * 2;
    const timeCost = (totalMinutes / 60) * hourlyRate;

    const minCommission = tripCost + timeCost;
    const effectiveRate = this.getEffectiveCommissionRate();
    const minSaleValue = effectiveRate > 0 ? minCommission / effectiveRate : null;

    return {
      roundTripKm,
      tripCost,
      totalMinutes,
      hourlyRate,
      hourlyRateIsEstimate: isEstimate,
      timeCost,
      minCommission,
      minSaleValue,
      effectiveRate
    };
  },

  // Running estimate for current tax year
  async getRunningEstimate() {
    const taxYear = this.getCurrentTaxYear();
    const startDate = new Date(taxYear.startYear, 3, 6).toISOString();
    const endDate = new Date().toISOString();

    return await this.calculateFromData(startDate, endDate);
  },

  // Format tax summary for display
  formatSummary(taxData) {
    const { tax } = taxData;

    return {
      income: Utils.formatCurrency(taxData.totalIncome),
      expenses: Utils.formatCurrency(taxData.totalExpenses),
      mileage: Utils.formatCurrency(taxData.mileageClaim),
      profit: Utils.formatCurrency(taxData.profit),
      incomeTax: Utils.formatCurrency(tax.incomeTax),
      class4NIC: Utils.formatCurrency(tax.class4NIC),
      taxDue: Utils.formatCurrency(tax.totalLiability),
      jan31: Utils.formatCurrency(tax.amountDueJan31),
      jul31: Utils.formatCurrency(tax.amountDueJul31),
      weeklySave: Utils.formatCurrency(tax.recommendedWeeklySave),
      effectiveRate: tax.effectiveRate.toFixed(1) + '%',
      weeksLeft: tax.weeksToJan31
    };
  }
};
