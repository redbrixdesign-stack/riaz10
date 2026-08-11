
/* ============================================
   ADVISOROS v5.0 — TODAY FEATURE
   Delegates the Home screen to HomeScreenController
   ============================================ */

const TodayFeature = {
  id: 'today',
  name: 'Home',
  icon: 'home',

  // render() previously built the Morning Brief / quick actions / embedded
  // calendar / route preview / EOD prompt dashboard itself. It now
  // delegates the whole screen to HomeScreenController, which drives a
  // weekly-calendar-and-visit-list layout (see
  // js/features/today/home-screen-controller.js).
  //
  // NOTE — this is a real, visible product change, not just plumbing: the
  // old dashboard's quick-actions row, embedded calendar, weather, and EOD
  // check-in prompt are NOT part of HomeScreenController's weekly layout,
  // so they no longer appear on Home.
  init() {},

  render() {
    // A fixed-id shell HomeScreenController can mount into. Returned
    // synchronously (no promise) since HomeScreenController does its own
    // async DB work internally, after mount, inside activate() below.
    return `<div id="hsc-today-root" class="notebook-page"></div>`;
  },

  // App.navigate() calls activate() once render()'s output is actually in
  // the DOM (see js/core/app.js) — that's the correct moment to hand off,
  // rather than trying to render before #hsc-today-root exists.
  activate() {
    HomeScreenController.renderDynamicHomeScreen('hsc-today-root');
  },

  // App.navigate() calls deactivate() on whatever feature you're leaving,
  // before switching screens (js/core/app.js, "Deactivate current"). This
  // is what stops HomeScreenController's polling setInterval from
  // continuing to fire — and querying the DB — after you've left Home.
  deactivate() {
    HomeScreenController.stopDynamicHomeScreen();
  },

  async getWeekEarnings() {
    const start = Utils.getStartOfWeek();
    const end = Utils.getEndOfWeek();
    const stats = await DB.getWeekStats(start.toISOString(), end.toISOString());
    return stats.earnings;
  },

  async getWeekSales() {
    const start = Utils.getStartOfWeek();
    const end = Utils.getEndOfWeek();
    const stats = await DB.getWeekStats(start.toISOString(), end.toISOString());
    return stats.sales;
  },

  async openEODModal() {
    const today = Utils.getToday();
    let appointments = [];
    try { appointments = await DB.getAppointmentsForDate(today.toISOString()); } catch (e) {}
    const completed = appointments.filter(a => a.outcome).length;
    // "Earned" is commission, matching the Money screen - showing raw sale
    // value here under the same word made the two screens disagree about
    // what the advisor actually took home.
    const earned = appointments.reduce((sum, a) => {
      if (a.outcome !== 'ordered') return sum;
      if (typeof a.commission === 'number' && a.commission > 0) return sum + a.commission;
      return sum + TaxCalculator.estimateCommission(a.value || 0);
    }, 0);

    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>End of Day</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px;">
          <div class="stat-card">
            <div class="value">${Utils.formatCurrency(earned)}</div>
            <div class="label">Earned Today</div>
          </div>
          <div class="stat-card">
            <div class="value">${completed}/${appointments.length}</div>
            <div class="label">Visits Done</div>
          </div>
        </div>

        <div class="form-group">
          <label>Anything to remember for tomorrow?</label>
          <input type="text" class="input" id="eod-note" placeholder="e.g. Call back Mrs Jones about samples">
        </div>

        <button class="btn btn-primary btn-block" onclick="TodayFeature.completeEOD()">
          Done for Today <span class="material-symbols-rounded">check</span>
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async completeEOD() {
    const noteEl = document.getElementById('eod-note');
    const note = noteEl ? noteEl.value.trim() : '';

    if (note) {
      try {
        await DB.addCommunication({
          type: 'note',
          content: `EOD note: ${note}`,
          sentAt: new Date().toISOString()
        });
      } catch (e) { console.log('Could not save EOD note'); }
    }

    localStorage.setItem('advisoros_last_eod', Utils.formatDate(Utils.getToday(), 'iso'));
    App.closeModal();
    Toast.show('Day complete. See you tomorrow!', 'success');
    App.navigate('today');
  }
};

App.registerFeature(TodayFeature);
