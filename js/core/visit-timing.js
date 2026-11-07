/* Location-supported visit timing. No background/native tracking is implied.
   Only a journey/adviser-started session can request location; raw recovery
   coordinates stay encrypted on this device and are removed on departure. */
const VisitTiming = {
  session:null,watchId:null,queue:Promise.resolve(),persistQueue:Promise.resolve(),generation:0,
  maintenanceBusy:false,
  GAP_MS:120000,DWELL_MS:30000,MAX_ACCURACY:50,DEPARTURE_KM:0.25,

  fix(position) {
    const c=position?.coords,t=Number(position?.timestamp),now=Date.now();
    if(!c||!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180||!Number.isFinite(c.accuracy)||c.accuracy<0||c.accuracy>this.MAX_ACCURACY||!Number.isFinite(t)||t>now+5000||now-t>30000)return null;
    return {lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,at:t,speed:Number.isFinite(c.speed)?c.speed:null};
  },

  arrival(trip,position) {
    const fix=this.fix(position);if(!fix||!trip.destination||fix.at<Date.parse(trip.startTime)){trip.arrivalCandidate=null;return null;}
    const distance=Geo.calculateDistance(fix.lat,fix.lng,trip.destination.lat,trip.destination.lng);
    if(distance+fix.accuracy/1000>Geo.ARRIVAL_RADIUS_KM||fix.speed!=null&&fix.speed>2.5){trip.arrivalCandidate=null;return null;}
    const previous=trip.arrivalCandidate;
    if(previous&&fix.at<=previous.lastAt)return null;
    if(!previous||fix.at-previous.lastAt>this.GAP_MS||Geo.calculateDistance(fix.lat,fix.lng,previous.lat,previous.lng)>0.05){trip.arrivalCandidate={...fix,lastAt:fix.at};return null;}
    previous.lastAt=fix.at;
    return fix.at-previous.at>=this.DWELL_MS?{arrivedAt:previous.at,anchor:{lat:previous.lat,lng:previous.lng}}:null;
  },

  async init() {
    if(!this.timer)this.timer=setInterval(()=>{this.refreshElapsed();this.maintenance();},30000);
    try{
      const raw=localStorage.getItem('advisoros_active_site');if(!raw)return;
      const record=JSON.parse(raw);if(record.version!==1)throw Error('Unsupported on-site recovery');
      const session=JSON.parse(await decryptField(record.encrypted)),appt=await DB.getAppointment(session.appointmentId);
      if(!appt||appt.status==='cancelled'||appt.leftAt||new Date(appt.arrivedAt).getTime()!==session.arrivedAt){this.clear();return;}
      this.session=session;
      if(Date.now()-session.lastFixAt>this.GAP_MS)await this.markReview('Location gap — check the actual departure time.');
      if(Date.now()-session.arrivedAt>12*3600000){await this.markReview('Long-running timer — review visit times.');if(this.session===session)this.clear();return;}
      this.watch();
    }catch(e){this.stopWatch();Toast.show('On-site tracking could not resume. Review the visit times.','warning');}
  },

  async begin(appointmentId,arrivedAt,anchor) {
    this.stopWatch();this.generation++;const generation=this.generation;this.session={appointmentId,arrivedAt,anchor,lastFixAt:arrivedAt,lastInsideAt:arrivedAt,outside:null,needsReview:false};
    const persisted=await this.persist();if(generation!==this.generation||!this.session)return;
    if(!persisted){await this.markReview('Recovery unavailable — check visit times.');return;}
    this.watch();
    await App.setActiveVisitUnlock?.(true);
  },

  watch() {
    if(!this.session||this.watchId!==null)return;
    if(!navigator.geolocation){this.markReview('Location unavailable — review visit times.');return;}
    this.watchId=navigator.geolocation.watchPosition(p=>this.enqueue(p),error=>{if(error?.code===1)this.stopWatch();this.markReview('Location unavailable — review visit times.');this.refresh();},{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
  },

  enqueue(position) {
    const generation=this.generation;
    this.queue=this.queue.then(()=>generation===this.generation?this.position(position):null).catch(()=>this.markReview('Timing could not be saved. Review the visit times.'));return this.queue;
  },

  async position(position) {
    const session=this.session;if(!session)return;
    const fix=this.fix(position);
    if(!fix){await this.markReview('Location accuracy is insufficient — review visit times.');return;}
    if(fix.at<=session.lastFixAt)return;
    const appt=await DB.getAppointment(session.appointmentId);
    if(this.session!==session)return;
    if(!appt||appt.status==='cancelled'||appt.leftAt||new Date(appt.arrivedAt).getTime()!==session.arrivedAt){this.clear();return;}
    if(fix.at-session.lastFixAt>this.GAP_MS){session.outside=null;await this.markReview('Location gap — check the actual departure time.');if(this.session!==session)return;}
    if(Date.now()-session.arrivedAt>12*3600000){await this.markReview('Long-running timer — review visit times.');if(this.session===session)this.clear();return;}
    const distance=Geo.calculateDistance(fix.lat,fix.lng,session.anchor.lat,session.anchor.lng);
    session.lastFixAt=fix.at;
    if(distance-fix.accuracy/1000>this.DEPARTURE_KM){
      if(!session.outside)session.outside={at:fix.at,lastInsideAt:session.lastInsideAt};
      else if(fix.at-session.outside.at>=this.DWELL_MS){
        // The first reliable outside fix is an observed boundary, not a claim
        // about the unseen instant between samples. A long gap stays flagged.
        const leftAt=session.outside.at;
        const saved=await DB.endVisitTiming(session.appointmentId,session.arrivedAt,leftAt,{source:'gps_departure',needsReview:session.needsReview,from:session.outside.lastInsideAt,to:leftAt});
        if(this.session!==session)return;
        this.clear();if(!saved)return;await App.setActiveVisitUnlock?.(false);Toast.show('Departure detected — customer time saved','success');this.refresh();return;
      }
    }else{session.outside=null;session.lastInsideAt=fix.at;}
    await this.persist();
  },

  async markReview(message) {
    const session=this.session;if(!session)return;
    session.needsReview=true;
    try{const appt=await DB.getAppointment(session.appointmentId);if(this.session===session&&appt&&!appt.leftAt&&new Date(appt.arrivedAt).getTime()===session.arrivedAt)await DB.db.appointments.update(session.appointmentId,{onSiteTimeReviewRequired:true});}catch(_){}
    if(!session.warned){session.warned=true;Toast.show(message,'warning');}
    if(this.session!==session)return;await this.persist();if(this.session===session)this.refreshStatus();
  },

  async suspend() {
    if(!this.session)return;
    this.session.hiddenAt=Date.now();await this.persist();
  },

  async resume() {
    const session=this.session;if(!session)return;
    if(session.hiddenAt&&Date.now()-session.hiddenAt>this.GAP_MS)await this.markReview('Location paused while Beelo was hidden — review visit times.');
    if(this.session!==session)return;
    session.hiddenAt=null;this.watch();
    try{const p=await Geo.getCurrentPosition();if(this.session===session)await this.enqueue({coords:{latitude:p.lat,longitude:p.lng,accuracy:p.accuracy},timestamp:p.timestamp});}catch(_){if(this.session===session)await this.markReview('Location unavailable — review visit times.');}
  },

  stopWatch(){if(this.watchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(this.watchId);this.watchId=null;},
  clear(){this.generation++;this.stopWatch();this.session=null;try{localStorage.removeItem('advisoros_active_site');}catch(_){}},
  stopFor(id){if(this.session?.appointmentId===id)this.clear();},
  persist(){
    if(!this.session)return Promise.resolve(true);
    const snapshot=JSON.stringify(this.session),generation=this.generation;
    this.persistQueue=this.persistQueue.then(async()=>{const encrypted=await encryptField(snapshot);if(generation!==this.generation)return true;localStorage.setItem('advisoros_active_site',JSON.stringify({version:1,encrypted}));return true;}).catch(()=>false);return this.persistQueue;
  },

  refreshStatus(){const el=document.getElementById('visit-timing-status');if(el&&Number(el.closest('[data-visit-id]')?.dataset.visitId)===this.session?.appointmentId){el.textContent='Location tracking needs review. Times may include an unobserved gap.';const root=el.closest('.visit-time-summary');if(root){root.dataset.review='true';const total=root.querySelector('[data-time-total]');if(total)total.textContent=total.textContent.replace(/^Customer time(?: so far)?/,'Estimated customer time');}}},
  async refresh(){
    if(App.currentFeature?.id==='today'&&typeof HomeWorkspace!=='undefined')return HomeWorkspace.refreshVisitActivity();
    const token=this._refreshToken=(this._refreshToken||0)+1,revision=App._navigationRevision,root=document.getElementById('visit-time-panel')||document.getElementById('customer-time-panel'),id=Number(root?.dataset.visitId);
    if(!root||!id)return;
    let appt;try{appt=await DB.getAppointment(id);}catch(_){return;}if(token!==this._refreshToken||!root.isConnected||revision!==App._navigationRevision)return;
    root.innerHTML=root.id==='visit-time-panel'?AppointmentsFeature.renderOnSiteCard(appt):this.summary(appt);
  },

  async maintenance(){
    if(this.maintenanceBusy||!this.session)return;this.maintenanceBusy=true;
    try{const session=this.session,appt=await DB.getAppointment(session.appointmentId);if(this.session!==session)return;if(!appt||appt.leftAt||appt.status==='cancelled'||new Date(appt.arrivedAt).getTime()!==session.arrivedAt){this.clear();return;}if(Date.now()-session.arrivedAt>12*3600000){await this.markReview('Long-running timer — review visit times.');if(this.session===session)this.clear();return;}if(document.visibilityState==='visible'&&Date.now()-session.lastFixAt>=60000){const p=await Geo.getCurrentPosition();if(this.session===session)await this.enqueue({coords:{latitude:p.lat,longitude:p.lng,accuracy:p.accuracy},timestamp:p.timestamp});}}
    catch(_){await this.markReview('Timing status unavailable — review visit times.');}finally{this.maintenanceBusy=false;}
  },

  refreshElapsed(){
    for(const el of document.querySelectorAll('.visit-time-summary[data-arrived-at]')){
      if(el.dataset.active!=='true'||Number(el.dataset.arrivedAt)<=0||!Number.isFinite(Number(el.dataset.priorSiteMinutes)))continue;
      const start=Number(el.dataset.arrivedAt),prior=Number(el.dataset.priorSiteMinutes||0),travel=el.dataset.travelMinutes===''?null:Number(el.dataset.travelMinutes),minutes=Math.max(0,(Date.now()-start)/60000)+prior;
      const total=el.querySelector('[data-time-total]'),detail=el.querySelector('[data-time-detail]');
      if(total)total.textContent=`${el.dataset.review==='true'?'Estimated customer time':'Customer time so far'}: ${travel===null?'Incomplete':AppointmentsFeature.formatOnSiteDuration(Math.round(travel+minutes))}`;
      if(detail)detail.textContent=`Travel to customer: ${travel===null?'not recorded':AppointmentsFeature.formatOnSiteDuration(Math.round(travel))} · On site: ${AppointmentsFeature.formatOnSiteDuration(Math.round(minutes))}`;
    }
  },

  async resumeFor(id){
    const revision=App._navigationRevision,appt=await DB.getAppointment(id);if(!appt?.arrivedAt||appt.leftAt||appt.status==='cancelled'||revision!==App._navigationRevision)return;
    try{const p=await Geo.getCurrentPosition(),fix=this.fix({coords:{latitude:p.lat,longitude:p.lng,accuracy:p.accuracy},timestamp:p.timestamp});if(!fix)throw Error('Accurate location unavailable.');if(revision!==App._navigationRevision)return;await this.begin(id,new Date(appt.arrivedAt).getTime(),{lat:fix.lat,lng:fix.lng});if(appt.onSiteTimeReviewRequired&&this.session)this.session.needsReview=true;this.refresh();}catch(_){await DB.db.appointments.update(id,{onSiteTimeReviewRequired:true});Toast.show('Automatic detection unavailable. End the timer manually or review times.','warning');this.refresh();}
  },

  summary(appt) {
    if(!appt?.arrivedAt&&!Number.isFinite(appt?.travelDurationMinutes))return '';
    const override=appt.travelTimeReviewed&&Number.isFinite(appt.travelDurationOverrideMinutes),unknown=appt.travelTimeReviewed&&appt.travelDurationOverrideMinutes==null,travel=override?appt.travelDurationOverrideMinutes:unknown||appt.travelTimeIncomplete?null:appt.travelDurationMinutes;
    const active=!!appt.arrivedAt&&!appt.leftAt&&appt.status!=='cancelled';
    const start=new Date(appt.arrivedAt||0).getTime(),end=appt.leftAt?new Date(appt.leftAt).getTime():Date.now(),site=start>0&&end>=start&&(appt.status!=='cancelled'||appt.leftAt)?(end-start)/60000:null;
    const history=appt.onSiteSessions||[],prior=history.reduce((sum,v)=>{const duration=(new Date(v.leftAt).getTime()-new Date(v.arrivedAt).getTime())/60000;return v.arrivedAt&&v.leftAt&&new Date(v.arrivedAt).getTime()>0&&Number.isFinite(duration)&&duration>=0?sum+duration:NaN;},0),allSite=site===null||!Number.isFinite(prior)?null:site+prior;
    const review=!!appt.arrivedAt&&!appt.leftAt&&this.session?.appointmentId!==appt.id||this.session?.appointmentId===appt.id&&this.session.needsReview||appt.onSiteTimeReviewRequired||appt.status==='cancelled'&&!!appt.arrivedAt&&!appt.leftAt||history.some(v=>v.needsReview)||(!appt.travelTimeReviewed&&appt.travelTimeReviewRequired),format=m=>AppointmentsFeature.formatOnSiteDuration(Math.max(0,Math.round(m)));
    const total=Number.isFinite(travel)&&allSite!==null?format(travel+allSite):'Incomplete';
    return `<section class="card card-page visit-time-summary" aria-label="Customer time" data-arrived-at="${start>0?start:0}" data-prior-site-minutes="${prior}" data-left-at="${appt.leftAt?new Date(appt.leftAt).getTime():''}" data-travel-minutes="${Number.isFinite(travel)?travel:''}" data-review="${!!review}" data-active="${active}">${active?'<p class="hint">On-site timer running</p>':''}<strong data-time-total>${review?'Estimated customer time':active?'Customer time so far':'Customer time'}: ${Utils.escapeHtml(total)}</strong><p class="hint" data-time-detail>Travel to customer: ${Number.isFinite(travel)?Utils.escapeHtml(format(travel)):'not recorded'} · On site: ${allSite!==null?Utils.escapeHtml(format(allSite)):'not recorded'}${history.length?' · Includes earlier on-site sessions for this visit':''}</p><p id="visit-timing-status" role="status" class="hint">${review?'Timing needs review — a location gap or inferred departure was recorded.':active?'Departure detection works while Beelo receives accurate location updates. Reopen Beelo after using Maps or locking the phone.':'Times are recorded observations or adviser-reviewed values.'}</p><div class="flex gap-sm"><button class="btn btn-outline btn-sm" data-action="VisitTiming.openReview" data-args='${Utils.escapeHtml(JSON.stringify([appt.id]))}'>Review times</button>${active?`<button class="btn btn-outline btn-sm" data-action="AppointmentsFeature.finishOnSite" data-args='${Utils.escapeHtml(JSON.stringify([appt.id]))}'>End timer manually</button>`:''}</div>${active&&(this.session?.appointmentId!==appt.id||this.watchId===null)?`<button class="btn btn-outline btn-sm mt-sm" data-action="VisitTiming.resumeFor" data-args='${Utils.escapeHtml(JSON.stringify([appt.id]))}'>Resume departure detection</button>`:''}</section>`;
  },

  async openReview(id) {
    const revision=App._navigationRevision,appt=await DB.getAppointment(id);if(!appt||revision!==App._navigationRevision)return;
    const value=at=>at&&Number.isFinite(new Date(at).getTime())?`${Utils.formatDate(new Date(at),'iso')}T${Utils.formatTime(new Date(at))}`:'',travel=appt.travelTimeReviewed?appt.travelDurationOverrideMinutes:appt.travelDurationMinutes;
    App.openModal(`<div class="sheet-header"><h3>Review times</h3><button class="btn btn-ghost" data-action="App.closeModal" aria-label="Close time review">Close</button></div><div class="sheet-body visit-time-review"><div class="form-group"><label for="timing-arrival">Actual arrival (UK time)</label><input class="input" type="datetime-local" id="timing-arrival" value="${value(appt.arrivedAt)}"></div><div class="form-group"><label for="timing-departure">Actual departure (leave blank if still on site)</label><input class="input" type="datetime-local" id="timing-departure" value="${value(appt.leftAt)}"></div><div class="form-group"><label for="timing-travel">Confirm or correct travel minutes</label><input class="input" type="number" min="0" max="1440" step="1" id="timing-travel" value="${Number.isFinite(travel)?Math.round(travel):''}"></div><p class="hint">Leave travel blank if unknown. Your review is retained; mileage and visit outcome stay separate.</p><p id="timing-review-error" role="alert"></p><button class="btn btn-primary btn-block" data-action="VisitTiming.saveReview">Save reviewed times</button></div>`);
    this.review={id,revision,snapshot:DB.visitTimeSnapshot(appt),element:document.getElementById('timing-review-error')};
  },

  async saveReview(){
    const owner=this.review;if(!owner||owner.busy||owner.revision!==App._navigationRevision||!owner.element?.isConnected)return;owner.busy=true;
    try{
      const parse=id=>{const text=document.getElementById(id).value;if(!text)return null;const [date,time]=text.split('T'),iso=Utils.ukDateTimeISO(date,time);if(!iso)throw Error('Use a valid, unambiguous UK date and time.');return Date.parse(iso);};
      const arrivedAt=parse('timing-arrival'),leftAt=parse('timing-departure'),raw=document.getElementById('timing-travel').value,travelMinutes=raw.trim()===''?null:Number(raw);
      const saved=await DB.saveVisitTimeReview(owner.id,owner.snapshot,{arrivedAt,leftAt,travelMinutes});
      if(saved.leftAt)this.stopFor(owner.id);
      else if(this.session?.appointmentId===owner.id){this.session.arrivedAt=saved.arrivedAt;this.session.outside=null;this.session.needsReview=false;this.session.warned=false;await this.persist();}
      else await DB.db.appointments.update(owner.id,{onSiteTimeReviewRequired:true});
      if(owner.revision!==App._navigationRevision||this.review!==owner)return;
      App.closeModal();Toast.show('Reviewed customer times saved','success');
      this.refresh();
    }catch(e){if(owner.revision===App._navigationRevision&&owner.element.isConnected)owner.element.textContent=e.message||'Times could not be saved. Retry.';}finally{owner.busy=false;}
  }
};
