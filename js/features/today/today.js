
/* ============================================
   ADVISOROS v5.0 — TODAY FEATURE
   The Home screen is the Beelo Companion
   (a DeepSeek-style chat with the advisor's data).
   ============================================ */

const TodayFeature = {
  id: 'today',
  name: 'Home',
  icon: 'home',

  // The Home screen is now the Beelo companion — a dark DeepSeek-style chat
  // that greets the advisor and answers from their real data (see
  // js/features/companion/companion.js). The weekly calendar isn't lost:
  // "My Day" inside the chat opens it as a full-screen panel.
  init() {},

  render() {
    return `<div id="companion-root" class="comp-page"></div>`;
  },

  // App.navigate() calls activate() once render()'s output is in the DOM —
  // that's the correct moment to hand off to the companion.
  activate() {
    CompanionFeature.mount('companion-root');
  },

  // Stops the companion's clock and any open My Day calendar panel when
  // you leave the Home screen.
  deactivate() {
    CompanionFeature.unmount();
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
    const day = Utils.ukParts();
    const today = Utils.ukMidnightInstant(day.year, day.month, day.day);
    const tomorrow = Utils.ukMidnightInstant(day.year, day.month, day.day + 1);
    let appointments, stats;
    try {
      [appointments, stats] = await Promise.all([
        DB.getAppointmentsForDate(today.toISOString()),
        DB.getWeekStats(today.toISOString(), tomorrow.toISOString())
      ]);
    } catch (error) {
      console.error('End of Day records could not be read:', error);
      Toast.show('Could not load today’s records. Please try again.', 'error');
      return;
    }
    const completed = appointments.filter(a => a.outcome).length;
    // The same read-only calculation as Money: sales commission, completed
    // survey earnings and attended service fees, within this UK calendar day.
    const earned = stats.earnings;

    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>End of Day</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal"App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="grid-2 gap-12 mb-20" >
          <div class="stat-card">
            <div class="value">${Utils.formatCurrency(earned)}</div>
            <div class="label">Earned Today</div>
          </div>
          <div class="stat-card">
            <div class="value">${completed}/${appointments.length}</div>
            <div class="label">Results Logged</div>
          </div>
        </div>

        <div class="form-group">
          <label>Anything to remember for tomorrow?</label>
          <input type="text" class="input" id="eod-note" placeholder="e.g. Call back Mrs Jones about samples">
        </div>

        <button class="btn btn-primary btn-block" data-action="TodayFeature.completeEOD"TodayFeature.completeEOD()">
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
          content: `EOD note: ${note}`
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
