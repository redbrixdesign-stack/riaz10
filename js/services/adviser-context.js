/* Local, read-only working context. No messages, bookings or trip writes. */
const AdviserContext = {
  pending(v) { return !!v && v.status !== 'cancelled' && v.status !== 'completed' && !v.outcome; },
  state(v, trackedId = null) {
    if (!v || v.status === 'cancelled') return 'booked';
    if (this.pending(v) && v.travelStatus === 'in_transit') return 'in_transit';
    const arrived = new Date(v.arrivedAt).getTime();
    if (v.arrivedAt && Number.isFinite(arrived) && arrived > 0 && !v.leftAt && (this.pending(v) || Number(v.id) === Number(trackedId))) return 'on_site';
    return 'booked';
  },
  select(visits, day, {today = Utils.formatDate(Utils.getToday(), 'iso'), trackedId = null} = {}) {
    const rows = visits.filter(v => v.status !== 'cancelled' && Utils.formatDate(v.date, 'iso') === day);
    const pending = rows.filter(v => this.pending(v)).sort((a,b) => new Date(a.date)-new Date(b.date) || a.id-b.id);
    if (day === today) {
      const signal = v => new Date(this.state(v, trackedId) === 'on_site' ? v.arrivedAt : v.travelStartedAt || 0).getTime() || 0;
      const active = rows.filter(v => this.state(v, trackedId) !== 'booked').sort((a,b) => signal(b)-signal(a) || Number(this.state(b, trackedId)==='on_site')-Number(this.state(a, trackedId)==='on_site') || a.id-b.id);
      if (active.length) return active[0];
    }
    return pending.find(v => !v.leftAt) || pending[0] || null;
  },
  current(visits, day = Utils.formatDate(Utils.getToday(), 'iso')) {
    const trackedId = typeof VisitTiming !== 'undefined' ? VisitTiming.session?.appointmentId : null;
    return this.select(visits, day, {trackedId});
  },
  collectable(order) {
    return !!order && typeof CommunicationService !== 'undefined' && CommunicationService.collectionResponsibility(order) === 'advisor';
  },
  businessKm(trips) {
    return Utils.confirmedBusinessKm(trips);
  }
};
