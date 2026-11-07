/* Home is a view over existing records; travel plans never write trip logs. */
const HomeWorkspace = {
  esc(value) { return Utils.escapeHtml(String(value ?? '')); },
  button(action,args,label,css='btn btn-outline') { return `<button type="button" class="${css}" data-action="${action}" data-args='${this.esc(JSON.stringify(args))}'>${label}</button>`; },
  dayInstant(key) {const [y,m,d]=key.split('-').map(Number);return Utils.ukMidnightInstant(y,m,d);},
  addDays(date,days) {const p=Utils.ukParts(date);return Utils.ukMidnightInstant(p.year,p.month,p.day+days);},
  coords(value) { return Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)&&Math.abs(value[0])<=90&&Math.abs(value[1])<=180 ? value : null; },
  plannedLegs(visits,base) {
    const legs=new Map();let previous=null,day=null,origin='Base';
    for(const visit of [...visits].filter(v=>v.status!=='cancelled').sort((a,b)=>new Date(a.date)-new Date(b.date)||a.id-b.id)) {
      const key=Utils.formatDate(visit.date,'iso');if(key!==day){day=key;previous=this.coords(base);origin='Base';}
      const to=this.coords(visit.latLng),km=previous&&to?RouteFeature.calculateLegKm(previous,to):null;
      legs.set(visit.id,{from:origin,km:Number.isFinite(km)&&km>=0?km:null,minutes:Number.isFinite(km)&&km>=0?Math.max(1,Math.round(km/35*60))+10:null});
      // An unresolved predecessor breaks that leg; never silently bridge it.
      previous=to;origin=visit.clientName||'Previous visit';
    }return legs;
  },
  async enrich(data) {
    const epoch=this._enrichEpoch=(this._enrichEpoch||0)+1;let visits=[],legs=new Map();
    try {
      const start=Utils.getToday(),end=this.addDays(start,15);
      visits=(await DB.getAppointmentsForRange(start.toISOString(),end.toISOString())).filter(v=>v.status!=='cancelled');
      legs=this.plannedLegs(visits,this.coords(CONFIG.businessLatLng));
    }catch(_){data.loadError=true;}
    try {data.weekMoney=await this.weekMoney();}catch(_){data.weekMoney=null;}
    if(epoch===this._enrichEpoch){
      this.visits=visits;this.legs=legs;
      data.upcomingNext=data.nextVisit;
      data=await this.presentDay(data,this.viewDay||Utils.formatDate(Utils.getToday(),'iso'));
      if(epoch===this._enrichEpoch)this.data=data;
    }return data;
  },
  async weekMoney() {
    const start=Utils.getStartOfWeek(),end=this.addDays(start,7),now=new Date(),to=now<end?now:end;
    const stats=await DB.getWeekStats(start.toISOString(),end.toISOString());
    const expenses=(await DB.getExpensesForPeriod(start.toISOString(),end.toISOString())).filter(e=>new Date(e.date)>=start&&new Date(e.date)<end);
    const costs=expenses.reduce((s,e)=>s+Math.max(0,Number(e.amount)||0),0);
    // A budgeting illustration, not a tax return: only explicitly confirmed
    // business trips count. Apply annual mileage bands, never reset each week.
    const year=Utils.getTaxYearStart(),trips=await DB.getTripsForPeriod(year.toISOString(),to.toISOString());
    const valid=t=>t.confirmed===true&&t.purpose==='business';
    const prior=trips.filter(t=>valid(t)&&new Date(t.date)<start).reduce((s,t)=>s+Math.max(0,Number(t.distanceKm)||0),0);
    const current=trips.filter(t=>valid(t)&&new Date(t.date)>=start&&new Date(t.date)<end).reduce((s,t)=>s+Math.max(0,Number(t.distanceKm)||0),0);
    const mileage=TaxCalculator.calculateMileageClaim(prior+current)-TaxCalculator.calculateMileageClaim(prior);
    // Actual recorded expenses leave the cash estimate once. Mileage is a tax
    // deduction, not a second cash outflow. Vehicle-running categories are
    // excluded from the tax deduction to avoid claiming both methods.
    const vehicle=/fuel|petrol|diesel|vehicle|insurance|repair|servic|motor/i;
    const deductible=expenses.filter(e=>!vehicle.test(e.category||'')).reduce((s,e)=>s+Math.max(0,Number(e.amount)||0),0);
    const profit=Math.max(0,stats.earnings-deductible-mileage);
    const reserve=TaxCalculator.calculate(profit*52,{firstYear:true}).totalLiability/52;
    return {earnings:stats.earnings,expenses:costs,mileage,reserve,net:stats.earnings-costs-reserve,target:Number(CONFIG.weeklyTarget)||0};
  },
  travel(id) {const leg=this.legs?.get(id);return leg?.km!==null&&leg?.km!==undefined?`${(leg.km*0.621371).toFixed(1)} mi · ${leg.minutes} min incl. 10 min buffer`:'Travel estimate unavailable';},
  icon(name) {return `<span class="material-symbols-rounded" aria-hidden="true">${name}</span>`;},
  row(v) {
    const leg=this.legs?.get(v.id),name=v.clientName||v.name||'Customer';
    return this.button('App.navigate',['appointments',{id:v.id}],`<span class="hw-row-time">${this.esc(Utils.formatTimeUK(v.date))}</span><span class="hw-row-main"><strong>${this.esc(name)}</strong><small>${this.esc(v.type?CONFIG.appointmentTypes.find(t=>t.id===v.type)?.name||v.type:'Visit')} · ${this.esc(CompanionFeature.getAreaLabel(v))}</small><small>From ${this.esc(leg?.from||'previous stop')}</small></span><span class="hw-leg"><strong>${leg?.km!=null?(leg.km*.621371).toFixed(1)+' mi':'— mi'}</strong><small>${leg?.minutes!=null?'~'+leg.minutes+' min':'No ETA'}</small></span>${this.icon('chevron_right')}`,'hw-visit-row');
  },
  visitState(visit) {
    if(!visit||visit.status==='cancelled'||visit.status==='completed'||visit.outcome)return 'booked';
    if(visit.travelStatus==='in_transit')return 'in_transit';
    const arrived=new Date(visit.arrivedAt).getTime();
    return visit.arrivedAt&&Number.isFinite(arrived)&&arrived>0&&!visit.leftAt?'on_site':'booked';
  },
  pickDayVisit(visits,day) {
    const pending=visits.filter(v=>v.status!=='cancelled'&&v.status!=='completed'&&!v.outcome).sort((a,b)=>new Date(a.date)-new Date(b.date)||a.id-b.id);
    if(day===Utils.formatDate(Utils.getToday(),'iso')){
      const signalAt=visit=>new Date(this.visitState(visit)==='on_site'?visit.arrivedAt:visit.travelStartedAt||0).getTime()||0;
      const active=pending.filter(v=>this.visitState(v)!=='booked').sort((a,b)=>signalAt(b)-signalAt(a)||Number(this.visitState(b)==='on_site')-Number(this.visitState(a)==='on_site'));
      if(active.length)return active[0];
    }
    return pending[0]||null;
  },
  async presentDay(data,day) {
    const start=this.dayInstant(day),end=this.addDays(start,1);
    const visits=(await DB.getAppointmentsForRange(start.toISOString(),end.toISOString())).filter(v=>v.status!=='cancelled');
    const legs=this.plannedLegs(visits,this.coords(CONFIG.businessLatLng));for(const [id,leg]of legs)this.legs.set(id,leg);
    const pending=visits.filter(v=>v.status!=='completed'&&!v.outcome).sort((a,b)=>new Date(a.date)-new Date(b.date));
    const selected=this.pickDayVisit(pending,day);let nextVisit=null;
    if(selected){const promise=CompanionFeature.homeVisitTime(selected);let phone=selected.phone||'';if(!phone&&selected.customerId)phone=(await DB.getCustomer(selected.customerId))?.phone||'';
      nextVisit={id:selected.id,customerId:selected.customerId,name:selected.clientName||'Customer',time:promise.text,hasArrivalWindow:promise.isWindow,type:CONFIG.appointmentTypes.find(t=>t.id===selected.type)?.name||selected.type,address:selected.address||'No address recorded',date:selected.date,phone,customerBrief:await CompanionFeature.customerBriefFor(selected),onSiteActive:this.visitState(selected)==='on_site',travelStatus:this.visitState(selected)};
    }
    if(!nextVisit&&day===Utils.formatDate(Utils.getToday(),'iso')&&data.upcomingNext&&Utils.formatDate(data.upcomingNext.date,'iso')>day)nextVisit=data.upcomingNext;
    return {...data,shownDay:day,dayVisits:visits,nextVisit};
  },
  async changeDay(day) {
    const epoch=this._dayEpoch=(this._dayEpoch||0)+1,revision=App._navigationRevision,body=document.getElementById('home-workspace-body');if(!body)return;body.inert=true;body.setAttribute('aria-busy','true');
    try{const data=await this.presentDay(this.data,day);if(epoch!==this._dayEpoch||revision!==App._navigationRevision||body!==document.getElementById('home-workspace-body'))return;
      this.viewDay=day;this.data=data;body.innerHTML=this.renderBody(data);this.updateDayHeader();
    }catch(_){Toast.show('Could not load this day. Please try again.','warning');}
    finally{if(epoch===this._dayEpoch&&body.isConnected){body.inert=false;body.removeAttribute('aria-busy');}}
  },
  dayLabel(day) {const date=this.dayInstant(day),year=Utils.ukParts(date).year;return year!==Utils.ukParts().year?Utils.formatDateUK(date,'short')+' '+year:Utils.formatDateUK(date,'weekday-short')+' '+Utils.formatDateUK(date,'short');},
  updateDayHeader() {
    const day=this.viewDay||Utils.formatDate(Utils.getToday(),'iso'),label=document.getElementById('home-date-label'),trigger=document.getElementById('home-calendar-trigger');
    if(label)label.textContent=this.dayLabel(day);if(trigger)trigger.setAttribute('aria-label','Choose a day');
    document.querySelectorAll('.hw-day-switch [data-day]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.day===day)));
  },
  render(data) {
    const day=data.shownDay||Utils.formatDate(Utils.getToday(),'iso'),today=Utils.formatDate(Utils.getToday(),'iso'),tomorrow=Utils.formatDate(this.addDays(Utils.getToday(),1),'iso'),e=this.esc.bind(this);
    return `<div class="comp-home hw-home"><header class="hw-header"><span class="hw-brand" aria-label="Beelo">beelo<span>.</span></span><button type="button" id="home-calendar-trigger" class="hw-date" aria-label="Choose a day" aria-controls="home-inline-calendar" aria-expanded="false" data-action="HomeWorkspace.toggleCalendar">${this.icon('calendar_month')}<span id="home-date-label">${e(this.dayLabel(day))}</span>${this.icon('expand_more')}</button>${this.button('HomeWorkspace.focusSearch',[],this.icon('search')+'<span class="hw-sr">Find a customer</span>','hw-search-trigger')}</header>
      <section id="home-inline-calendar" class="hw-calendar" hidden aria-label="Choose a day"></section>
      <nav class="hw-day-switch" aria-label="Working day">${[[today,'Today'],[tomorrow,'Tomorrow']].map(([key,label])=>`<button type="button" data-day="${key}" aria-pressed="${day===key}" data-action="HomeWorkspace.selectDay" data-args='${e(JSON.stringify([key]))}'>${label}</button>`).join('')}</nav>
      <div id="home-workspace-body">${this.renderBody(data)}</div></div>`;
  },
  renderBody(data) {
    const e=this.esc.bind(this),b=this.button.bind(this),nv=data.nextVisit,today=Utils.formatDate(Utils.getToday(),'iso'),day=data.shownDay||today,isToday=day===today,isTomorrow=day===Utils.formatDate(this.addDays(Utils.getToday(),1),'iso'),visits=data.dayVisits||[],pending=visits.filter(v=>v.status!=='completed'&&!v.outcome&&v.id!==nv?.id),w=data.weekMoney,visitToday=nv&&Utils.isSameDay(nv.date,Utils.getToday()),onSite=visitToday&&nv?.onSiteActive;
    const action=(method,args,label,icon,primary=false)=>b(method,args,this.icon(icon)+`<span>${label}</span>`,primary?'hw-action hw-primary':'hw-action');
    const featured=nv?`<article class="hw-featured comp-home-next-visit" aria-label="Next visit for ${e(nv.name)}"><div class="hw-eyebrow">${visitToday?onSite?'At the customer':nv.travelStatus==='in_transit'?'Next visit · on the way':'Next visit · today':nv&&Utils.isSameDay(nv.date,this.addDays(Utils.getToday(),1))?'Tomorrow’s visit':'Upcoming visit · '+e(this.dayLabel(Utils.formatDate(nv.date,'iso')))}${onSite?'<span>On site</span>':''}</div>${b('App.navigate',[nv.customerId?'customer':'appointments',nv.customerId?{id:nv.customerId,visitId:nv.id,from:'today'}:{id:nv.id}],`<h2>${e(nv.name)}</h2>${this.icon('chevron_right')}`,'hw-customer-name')}<p class="hw-type">${e(nv.type)}</p><div class="hw-promise"><strong>Your plan ${e(Utils.formatTimeUK(nv.date))}</strong><small>${nv.hasArrivalWindow?'Customer window '+e(nv.time):e(Utils.formatDateUK(nv.date,'long'))}</small></div><p class="hw-address">${this.icon('location_on')}<span>${e(this.cleanAddress(nv.address))}</span></p><p class="hw-travel hint">${e(this.travel(nv.id))} · planning estimate</p><div class="comp-home-visit-brief" data-customer-brief="${e(nv.customerBrief?.fingerprint||'')}"><strong>${onSite?'At this visit':'Before you arrive'}</strong><p class="prewrap">${e(nv.customerBrief?.text||'No context recorded yet.')}</p></div>${b('App.navigate',['appointments',{id:nv.id}],`Open visit ${this.icon('chevron_right')}`,'hw-text-button comp-home-next-visit-main')}<div class="hw-actions">${visitToday&&!onSite?action('AppointmentsFeature.navigateToVisit',[nv.address,nv.id],'Navigate','navigation',true):action('App.navigate',['appointments',{id:nv.id}],onSite?'Finish visit':'Review visit','task_alt',true)}${onSite?action('CustomerFeature.openWorkspaceNote',[nv.customerId],'Add note','edit_note'):action('HomeWorkspace.toggleContact',[nv.customerId,nv.id],'Contact','contact_phone')}${onSite?action('HomeWorkspace.toggleContact',[nv.customerId,nv.id],'Contact','contact_phone'):visitToday?action('TalkFeature.sendMessage',[nv.id,'on_my_way'],'On my way','chat'):action('CustomerFeature.openWorkspaceNote',[nv.customerId],'Add note','edit_note')}</div><div id="home-contact" hidden></div></article>`:`<section class="hw-empty"><h2>${visits.length?'Day complete':'No visits '+(isToday?'today':isTomorrow?'tomorrow':'on this day')}</h2><p>${visits.length?'Your completed visits remain in the diary.':'Scan your diary or add a visit to get started.'}</p>${b('HomeWorkspace.toggleCalendar',[],'Choose another day','hw-text-button')}</section>`;
    const weekly=w&&isToday?`<section class="hw-week" aria-label="This week"><button type="button" class="hw-finance-link" data-action="App.navigate" data-args='["money"]'><span class="hw-finance-title">This week · earned, not necessarily paid ${this.icon('chevron_right')}</span><span class="hw-money-grid"><span><small>${w.target?'Target '+e(Utils.formatCurrency(w.target)):'No target set'}</small><strong>${e(Utils.formatCurrency(w.earnings))}</strong></span><span><small>Expenses</small><strong>${e(Utils.formatCurrency(w.expenses))}</strong></span><span><small>Est. net</small><strong>${e(Utils.formatCurrency(w.net))}</strong></span></span></button>${b('HomeWorkspace.showEstimate',[],'Budget estimate · view assumptions','hw-finance-note')}</section>`:isToday?'<p role="status" class="hint">Weekly figures unavailable. Open Money to review.</p>':'';
    return `${data.loadError?'<p role="alert">Some visits could not be loaded. Reopen Home to retry.</p>':''}${featured}${weekly}
      ${data.attention?.length?`<details class="hw-attention"><summary>Needs attention <span>${data.attention.length}</span>${this.icon('expand_more')}</summary>${data.attention.map(a=>`<button type="button" class="hw-visit-row" ${App.actionAttrs(a.action)}><span><strong class="comp-home-attention-label">${e(a.label)}</strong><small>${e(a.value)}</small></span>${this.icon('chevron_right')}</button>`).join('')}</details>`:''}
      <section class="hw-remaining"><div class="hw-section-head"><h2>${isToday?'Remaining today':isTomorrow?'Also tomorrow':'Also this day'} · ${pending.length}</h2>${isToday?b('App.navigate',['appointments',{action:'tomorrow'}],`Plan tomorrow ${this.icon('chevron_right')}`,'hw-text-button'):b('App.navigate',['appointments',{action:'today-plan',planDate:day}],'Day plan','hw-text-button')}</div><p class="hw-small">Miles · travel ETA includes 10 min buffer · estimates</p>${pending.map(v=>this.row(v)).join('')||'<p class="hint">No more visits scheduled.</p>'}</section>
      <input class="native-file-input" type="file" id="home-quick-capture" aria-label="Scan a visit or expense photo" accept="image/*" capture="environment" data-event="change" data-action="ControlFeature.handleQuickCapture" data-args='["__event__"]'><div class="hw-capture">${b('HomeWorkspace.scan',[],this.icon('document_scanner')+(visits.length?'Scan':'Scan to add'),'hw-capture-button')}${b('HomeWorkspace.toggleAdd',[],this.icon('add')+'Add','hw-capture-button')}</div><div id="home-add-choices" class="hw-add-choices" hidden>${b('App.navigate',['appointments',{action:'add',date:day}],'Add visit')}${b('MoneyFeature.openExpenseModal',[],'Add expense')}${b('App.navigate',['appointments',{action:'today-plan'}],'Today’s plan')}</div>
      <section class="hw-search"><label for="home-customer-search">Find a customer</label><input type="search" class="input" id="home-customer-search" placeholder="Name, phone, postcode, address or order" autocomplete="off" data-event="input" data-action="HomeWorkspace.search" data-args='["__event__"]'><div id="home-search-results" role="status" aria-live="polite"></div></section>${b('HomeWorkspace.ask',[],this.icon('auto_awesome')+'Ask Beelo','hw-ask')}`;
  },
  toggleAdd(){const host=document.getElementById('home-add-choices');if(host)host.hidden=!host.hidden;},
  showEstimate(){const w=this.data?.weekMoney;if(!w)return;App.openModal(`<div class="sheet-header"><h3>Weekly budget estimate</h3><button class="btn btn-ghost" data-action="App.closeModal">Close</button></div><div class="sheet-body"><p>Recorded earnings are not commission received. This illustration subtracts recorded expenses and a tax/Class 4 reserve of ${this.esc(Utils.formatCurrency(w.reserve))}.</p><p>It assumes this week repeats for 52 weeks, configured standard tax bands and no other income or adjustments. Confirmed business mileage deduction: ${this.esc(Utils.formatCurrency(w.mileage))}, using annual bands. Vehicle-running categories are excluded from the tax expense deduction.</p><p>Check expense eligibility and private-use proportions. This is not actual take-home or a filing calculation.</p></div>`);},
  async selectDay(day){this.selectedDay=day;this._calendarCursor=day;await this.changeDay(day);if(!document.getElementById('home-inline-calendar')?.hidden)await this.renderCalendar();},
  scan() { document.getElementById('home-quick-capture')?.click(); },
  ask() {const composer=document.querySelector('.comp-composer');if(composer){composer.hidden=false;document.getElementById('comp-input')?.focus();}},
  focusSearch() {document.getElementById('home-customer-search')?.focus();},
  toggleContact(customerId,appointmentId) {
    const host=document.getElementById('home-contact');if(!host)return;
    if(!host.hidden){host.hidden=true;return;}const b=this.button.bind(this);
    host.innerHTML=`<div class="hw-contact-row">${b('ContactFeature.start',[customerId,'phone',appointmentId],'Call')}${b('ContactFeature.start',[customerId,'whatsapp',appointmentId],'Message')}</div><details><summary>WhatsApp not available?</summary><p>Beelo cannot detect whether WhatsApp opened. Use your phone’s text message app instead.</p>${b('ContactFeature.start',[customerId,'sms',appointmentId],'Use text message')}</details>`;host.hidden=false;
  },
  async search(event) {
    const field=event?.target||document.getElementById('home-customer-search'),host=document.getElementById('home-search-results'),query=field?.value.trim()||'',revision=App._navigationRevision;
    const token=this._searchToken=(this._searchToken||0)+1;
    if(!query){host.innerHTML='';return;}
    host.textContent='Searching…';
    try {
      const [customers,orders]=await Promise.all([DB.getAllCustomers(),DB.db.orders.toArray()]);
      if(token!==this._searchToken||revision!==App._navigationRevision||host!==document.getElementById('home-search-results'))return;
      const normal=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''),q=normal(query),phone=s=>{let n=String(s||'').replace(/\D/g,'');return n.startsWith('0044')?'0'+n.slice(4):n.startsWith('44')?'0'+n.slice(2):n;},qp=phone(query);
      const rows=customers.map(c=>{
        const name=c.fullName||[c.firstName,c.lastName].filter(Boolean).join(' '),address=typeof c.address==='string'?c.address:[c.address?.line1,c.address?.town,c.address?.postcode].filter(Boolean).join(', '),refs=orders.filter(o=>o.customerId===c.id).map(o=>o.orderNumber).filter(Boolean),terms=[name,address,c.phone,c.customerNumber,...refs];
        const score=Math.max(...terms.map(v=>normal(v)===q?4:normal(v).startsWith(q)?3:normal(v).includes(q)?1:0),qp.length>=3&&phone(c.phone).includes(qp)?2:0);
        return {c,name,address,refs,score};
      }).filter(r=>q&&r.score>0).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
      host.innerHTML=`<p>${rows.length} matching customer${rows.length===1?'':'s'}${rows.length>20?' · showing first 20':''}</p>`+rows.slice(0,20).map(r=>this.button('App.navigate',['customer',{id:r.c.id,from:'today'}],`<span><strong>${this.esc(r.name)}</strong><small>${this.esc(this.cleanAddress(r.address))}</small><small>${this.esc([r.c.phone,...r.refs].filter(Boolean).join(' · '))}</small></span><span aria-hidden="true">›</span>`,'hw-visit-row')).join('');
    }catch(_){if(token===this._searchToken&&host.isConnected)host.textContent='Search unavailable. Please try again.';}
  },
  cleanAddress(address) {const full=String(address).match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0];if(!full)return address;const out=full.replace(/\s/g,'').slice(0,-3);return String(address).split(/,|·/).map(s=>s.trim()).filter(s=>s.toUpperCase()!==out.toUpperCase()).join(', ');},
  async toggleCalendar() {
    const host=document.getElementById('home-inline-calendar');if(!host)return;
    host.hidden=!host.hidden;document.getElementById('home-calendar-trigger')?.setAttribute('aria-expanded',String(!host.hidden));if(host.hidden)return;
    this.selectedDay=this.viewDay||Utils.formatDate(Utils.getToday(),'iso');this._calendarCursor||=this.selectedDay;await this.renderCalendar();
  },
  async renderCalendar() {
    const host=document.getElementById('home-inline-calendar'),revision=App._navigationRevision,token=this._calendarToken=(this._calendarToken||0)+1;if(!host)return;
    const selected=this.selectedDay||Utils.formatDate(Utils.getToday(),'iso'),cursor=this._calendarCursor||selected,date=this.dayInstant(cursor),parts=Utils.ukParts(date),monthView=this.calendarView==='month';
    const monthStart=Utils.ukMidnightInstant(parts.year,parts.month,1),start=Utils.getStartOfWeek(monthView?monthStart:date),last=Utils.ukMidnightInstant(parts.year,parts.month+1,0),total=monthView?Math.ceil((Number(Utils.formatDate(last,'iso').slice(-2))+((new Date(Date.UTC(parts.year,parts.month-1,1)).getUTCDay()+6)%7))/7)*7:7,end=this.addDays(start,total);
    try {
      const visits=(await DB.getAppointmentsForRange(start.toISOString(),end.toISOString())).filter(v=>v.status!=='cancelled');
      if(token!==this._calendarToken||revision!==App._navigationRevision||!host.isConnected)return;
      const e=this.esc.bind(this),b=this.button.bind(this),days=Array.from({length:total},(_,i)=>Utils.formatDate(this.addDays(start,i),'iso'));
      if(!host.querySelector('#home-calendar-month'))host.innerHTML=`<div class="hw-calendar-jump"><label for="home-calendar-month">Month<select id="home-calendar-month" class="select" data-event="change" data-action="HomeWorkspace.jumpCalendar">${Array.from({length:12},(_,i)=>`<option value="${i+1}">${new Intl.DateTimeFormat('en-GB',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,i,1)))}</option>`).join('')}</select></label><label for="home-calendar-year">Year<input type="number" inputmode="numeric" id="home-calendar-year" class="input" min="1900" max="9999" data-event="change" data-action="HomeWorkspace.jumpCalendar"></label></div><div class="hw-calendar-tabs">${b('HomeWorkspace.setCalendarView',['week'],'Week','hw-text-button')}${b('HomeWorkspace.setCalendarView',['month'],'Month','hw-text-button')}${b('HomeWorkspace.selectDay',[Utils.formatDate(Utils.getToday(),'iso')],'Today','hw-text-button')}</div><div class="hw-calendar-nav">${b('HomeWorkspace.shiftWeek',[-1],this.icon('chevron_left')+'<span class="hw-sr">Previous week or month</span>','hw-calendar-arrow')}<span id="home-calendar-range"></span>${b('HomeWorkspace.shiftWeek',[1],this.icon('chevron_right')+'<span class="hw-sr">Next week or month</span>','hw-calendar-arrow')}</div><div class="hw-calendar-head" aria-hidden="true">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<span>${d}</span>`).join('')}</div><p class="hw-small">Daily appointments: green 0–3 · yellow 4–5 · red 6+</p><div id="home-calendar-days" class="hw-calendar-days"></div><div id="home-calendar-agenda"></div>`;
      document.getElementById('home-calendar-month').value=parts.month;document.getElementById('home-calendar-year').value=parts.year;
      document.querySelectorAll('.hw-calendar-tabs [data-action="HomeWorkspace.setCalendarView"]').forEach(button=>button.setAttribute('aria-pressed',String(JSON.parse(button.dataset.args)[0]===(monthView?'month':'week'))));
      document.getElementById('home-calendar-range').textContent=monthView?new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'Europe/London'}).format(date):this.dayLabel(days[0])+' – '+this.dayLabel(days[6]);
      const dayHost=document.getElementById('home-calendar-days'),gridKey=days[0]+':'+total;
      if(dayHost.dataset.week!==gridKey){dayHost.dataset.week=gridKey;dayHost.innerHTML=days.map(key=>{const count=visits.filter(v=>Utils.formatDate(v.date,'iso')===key).length;return `<button type="button" aria-label="${e(Utils.formatDateUK(key,'long'))}, ${count} visits" aria-pressed="${key===selected}" data-date="${key}" data-action="HomeWorkspace.chooseDay" data-args='${e(JSON.stringify([key]))}'><strong>${Number(key.slice(-2))}</strong><small>${count}</small></button>`;}).join('');}
      for(const button of dayHost.children){const count=visits.filter(v=>Utils.formatDate(v.date,'iso')===button.dataset.date).length;button.dataset.workload=count<=3?'green':count<=5?'yellow':'red';button.querySelector('small').textContent=count;button.setAttribute('aria-label',`${Utils.formatDateUK(button.dataset.date,'long')}, ${count} visits`);button.setAttribute('aria-pressed',String(button.dataset.date===selected));button.classList.toggle('hw-other-month',monthView&&Number(button.dataset.date.slice(5,7))!==parts.month);}
      const selectedStart=this.dayInstant(selected),inGrid=selected>=days[0]&&selected<=days[days.length-1],selectedVisits=(inGrid?visits:await DB.getAppointmentsForRange(selectedStart.toISOString(),this.addDays(selectedStart,1).toISOString())).filter(v=>v.status!=='cancelled'&&Utils.formatDate(v.date,'iso')===selected).sort((a,b)=>new Date(a.date)-new Date(b.date));
      if(token!==this._calendarToken||!host.isConnected||revision!==App._navigationRevision)return;
      const legs=this.plannedLegs(selectedVisits,this.coords(CONFIG.businessLatLng));for(const [id,leg]of legs)this.legs.set(id,leg);
      document.getElementById('home-calendar-agenda').innerHTML=`<h2>${e(Utils.formatDateUK(selected,'long'))} · ${selectedVisits.length} visits</h2>${selectedVisits.map(v=>b('App.navigate',['appointments',{id:v.id}],`<span class="hw-row-time">${e(Utils.formatTimeUK(v.date))}</span><span><strong>${e(v.clientName||'Customer')}</strong><small>${e([CompanionFeature.homeVisitTime(v).isWindow?CompanionFeature.homeVisitTime(v).text:null,CONFIG.appointmentTypes.find(t=>t.id===v.type)?.name||v.type,v.status==='completed'?'Completed':null].filter(Boolean).join(' · '))}</small></span>${this.icon('chevron_right')}`,'hw-visit-row')).join('')||'<p class="hint">No visits on this day.</p>'}${b('App.navigate',['appointments',{action:'add',date:selected}],'Add visit on this day','hw-text-button')}`;
    }catch(_){if(host.isConnected&&token===this._calendarToken)host.innerHTML='<p role="alert">Could not load the diary. Close and reopen to retry.</p>';}
  },
  chooseDay(value) {const day=typeof value==='string'?value:value.target.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;this.selectedDay=day;return Promise.all([this.changeDay(day),this.renderCalendar()]);},
  shiftWeek(delta) {const p=Utils.ukParts(this.dayInstant(this._calendarCursor||this.selectedDay));this._calendarCursor=Utils.formatDate(this.calendarView==='month'?Utils.ukMidnightInstant(p.year,p.month+Number(delta),1):this.addDays(this.dayInstant(this._calendarCursor||this.selectedDay),Number(delta)*7),'iso');return this.renderCalendar();},
  setCalendarView(view) {if(!['week','month'].includes(view))return;this.calendarView=view;return this.renderCalendar();},
  jumpCalendar(){const month=Number(document.getElementById('home-calendar-month').value),year=Number(document.getElementById('home-calendar-year').value);if(!Number.isInteger(year)||year<1900||year>9999||!Number.isInteger(month)||month<1||month>12)return Toast.show('Choose a year between 1900 and 9999.','warning');this._calendarCursor=Utils.formatDate(Utils.ukMidnightInstant(year,month,1),'iso');this.calendarView='month';return this.renderCalendar();}
};
