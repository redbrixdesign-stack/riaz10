/* Phase 5 capacity planner: explicit leave/unavailable time and advisory diary checks. */
const CapacityFeature = {
  id: 'capacity', name: 'Availability', icon: 'event_busy', route: false,

  async render() {
    const from = new Date(); from.setHours(0,0,0,0);
    const to = new Date(from); to.setDate(to.getDate() + 90);
    let blocks = [];
    try { blocks = await DB.getAvailabilityBlocks({ from: from.toISOString(), to: to.toISOString() }); }
    catch (e) { console.error('Availability failed:', e); }
    return `<div class="fade-in">
      ${App.renderTopHeader({ title: 'Availability', showBack: true, backHref: 'control', actions: `<button class="btn btn-primary btn-sm" data-action="CapacityFeature.openAdd"><span class="material-symbols-rounded">add</span>Block time</button>` })}
      <div class="p-md">
        <div class="card mb-md"><div class="fw-600">Capacity advice, not auto-booking</div><div class="fs-13 text-secondary mt-xs">Beelo warns about leave, closed hours, clashes and overloaded days. It never moves a customer visit by itself.</div></div>
        ${blocks.length ? blocks.sort((a,b) => new Date(a.startAt)-new Date(b.startAt)).map(b => this.card(b)).join('') : `<div class="empty-state empty-state-lg"><span class="material-symbols-rounded">event_available</span><div class="fw-600">No blocked time ahead</div><div class="fs-13">Add leave or unavailable periods so booking advice reflects the day you can deliver.</div></div>`}
      </div></div>`;
  },

  card(block) {
    const label = block.label || (block.type === 'leave' ? 'Leave' : 'Unavailable');
    return `<article class="card mb-sm"><div class="flex justify-between gap-sm"><div><div class="fw-600">${Utils.escapeHtml(label)}</div><div class="fs-13 text-secondary">${Utils.formatDate(block.startAt, 'short')} · ${Utils.formatTime(block.startAt)}–${Utils.formatTime(block.endAt)}</div></div><button class="btn btn-ghost btn-sm" aria-label="Delete ${Utils.escapeHtml(label)}" data-action="CapacityFeature.remove" data-args='${JSON.stringify([block.id])}'><span class="material-symbols-rounded">delete</span></button></div></article>`;
  },

  openAdd() {
    const now = new Date(); now.setMinutes(0,0,0);
    const end = new Date(now.getTime() + 3600000);
    const local = d => `${Utils.formatDate(d,'iso')}T${Utils.formatTime(d)}`;
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Block diary time</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body">
      <div class="form-group"><label for="capacity-type">Reason</label><select class="select" id="capacity-type"><option value="unavailable">Unavailable</option><option value="leave">Leave</option></select></div>
      <div class="form-group"><label for="capacity-label">Label</label><input class="input" id="capacity-label" placeholder="Holiday, paperwork, personal appointment"></div>
      <div class="form-group"><label for="capacity-start">Starts</label><input class="input" id="capacity-start" type="datetime-local" value="${local(now)}"></div>
      <div class="form-group"><label for="capacity-end">Ends</label><input class="input" id="capacity-end" type="datetime-local" value="${local(end)}"></div>
      <button class="btn btn-primary btn-block" id="capacity-save" data-action="CapacityFeature.save">Save blocked time</button></div>`);
  },

  async save() {
    if (this._saving) return;
    const start = document.getElementById('capacity-start')?.value;
    const end = document.getElementById('capacity-end')?.value;
    if (!start || !end || new Date(start) >= new Date(end)) { Toast.show('End time must be after the start', 'warning'); return; }
    this._saving = true;
    try {
      await DB.addAvailabilityBlock({ type: document.getElementById('capacity-type')?.value, label: document.getElementById('capacity-label')?.value.trim() || '', startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() });
      App.closeModal(); Toast.show('Diary time blocked', 'success'); App.navigate('capacity');
    } catch (e) { Toast.show(e.message || 'Could not block that time', 'error'); }
    finally { this._saving = false; }
  },

  async remove(id) {
    if (!confirm('Remove this blocked time?')) return;
    await DB.deleteAvailabilityBlock(id); Toast.show('Blocked time removed', 'success'); App.navigate('capacity');
  }
};

App.registerFeature(CapacityFeature);
