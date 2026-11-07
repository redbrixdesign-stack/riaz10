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
    if(epoch===this._enrichEpoch){this.visits=visits;this.legs=legs;this.data=data;}return data;
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
  row(v) {const time=CompanionFeature.homeVisitTime(v),name=v.clientName||v.name||'Customer';return this.button('App.navigate',['appointments',{id:v.id}],`<span><strong>${this.esc(name)}</strong><small>${this.esc(time.text)} · ${this.esc(v.address||'Address not recorded')}</small><small>${this.esc(this.travel(v.id))}</small></span><span aria-hidden="true">›</span>`,'hw-visit-row');},
  render(data) {
    const e=this.esc.bind(this),b=this.button.bind(this),nv=data.nextVisit,today=Utils.getToday(),todayVisits=(data===this.data?this.visits||[]:[]).filter(v=>Utils.isSameDay(v.date,today)&&v.status!=='completed'&&!v.outcome&&v.id!==nv?.id),w=data.weekMoney;
    const when=nv?`${Utils.isSameDay(nv.date,today)?'Today':Utils.formatDateUK(nv.date,'long')} · ${nv.time}`:'';
    const isToday=nv&&Utils.isSameDay(nv.date,today),onSite=nv?.onSiteActive;
    return `<div class="comp-home hw-home"><header class="hw-header"><div><small>Your working day</small><h1>${e(Utils.firstNameFrom(CONFIG.advisorName||'')||'Adviser')}</h1></div><div>${b('HomeWorkspace.focusSearch',[],'<span class="material-symbols-rounded" aria-hidden="true">search</span><span class="hw-sr">Find a customer</span>')}${b('HomeWorkspace.toggleCalendar',[],'<span class="material-symbols-rounded" aria-hidden="true">calendar_month</span><span class="hw-sr">Choose a day</span>')}</div></header>
      <section id="home-inline-calendar" class="hw-calendar" hidden aria-label="Choose a day"></section>
      <div id="home-workspace-body">
      <section class="hw-week" aria-label="This week"><h2>This week</h2>${w?`<div class="hw-money-grid">${b('App.navigate',['money'],`<small>Earned / target</small><strong>${e(Utils.formatCurrency(w.earnings))}</strong><small>${w.target?`of ${e(Utils.formatCurrency(w.target))}`:'Set target in Settings'}</small>`)}${b('App.navigate',['money'],`<small>Expenses</small><strong>${e(Utils.formatCurrency(w.expenses))}</strong>`)}${b('App.navigate',['money'],`<small>Est. after tax</small><strong>${e(Utils.formatCurrency(w.net))}</strong>`)}</div><details><summary>How this estimate works</summary><p>Week to date · recorded earnings, not commission received. After recorded cash expenses and an illustrative tax/Class 4 reserve of ${e(Utils.formatCurrency(w.reserve))}. Assumes this week repeats for 52 weeks, standard configured tax bands, no other income or adjustments. Not an actual take-home or filing calculation.</p><p>Confirmed business mileage deduction: ${e(Utils.formatCurrency(w.mileage))}, using annual bands. Vehicle-running categories are excluded from the tax expense deduction. Check business eligibility and private-use proportions in Money.</p></details>`:'<p role="status">Weekly figures unavailable. Open Money to review your records.</p>'}</section>
      ${data.loadError?'<p role="alert">Some visits could not be loaded. Reopen Home to retry.</p>':''}
      <section class="hw-featured comp-home-next-visit"><h2>${onSite?'With this customer':isToday?'Next customer':'Upcoming customer'}</h2>${nv?`<p>${e(when)} · ${e(nv.type)}</p>${b('App.navigate',[nv.customerId?'customer':'appointments',nv.customerId?{id:nv.customerId,visitId:nv.id,from:'today'}:{id:nv.id}],e(nv.name),'hw-customer-name')}<p>${e(nv.address)}</p><p class="hint">${e(this.travel(nv.id))} · planning estimate</p><div class="comp-home-visit-brief" data-customer-brief="${e(nv.customerBrief?.fingerprint||'')}"><strong>Before you arrive</strong><p class="prewrap">${e(nv.customerBrief?.text||nv.briefing||'No context recorded yet.')}</p></div><div class="hw-actions">${isToday&&!onSite?b('AppointmentsFeature.navigateToVisit',[nv.address,nv.id],'Navigate','btn btn-primary'):b('App.navigate',['appointments',{id:nv.id}],onSite?'Finish visit':'Open visit','btn btn-primary comp-home-next-visit-main')}${b('HomeWorkspace.toggleContact',[nv.customerId,nv.id],'Contact')}${isToday&&!onSite?b('TalkFeature.sendMessage',[nv.id,'on_my_way'],'On my way'):b('CustomerFeature.openWorkspaceNote',[nv.customerId],'Add note')}</div><div id="home-contact" hidden></div>${isToday&&!onSite?b('App.navigate',['appointments',{id:nv.id}],'Open visit','btn btn-ghost comp-home-next-visit-main'):''}`:'<p>No upcoming visits. Scan your diary or add a visit to get started.</p>'}</section>
      <input class="native-file-input" type="file" id="home-quick-capture" aria-label="Scan a visit or expense photo" accept="image/*" capture="environment" data-event="change" data-action="ControlFeature.handleQuickCapture" data-args='["__event__"]'><div class="hw-actions hw-capture">${b('HomeWorkspace.scan',[],'Scan photo','btn btn-primary')}${b('App.navigate',['appointments',{action:'add'}],'Add visit')}${b('MoneyFeature.openExpenseModal',[],'Add expense')}</div>
      <div class="hw-actions">${b('App.navigate',['appointments',{action:'today-plan'}],'Today’s plan')}${b('App.navigate',['appointments',{action:'tomorrow'}],'Plan tomorrow')}</div>
      <section class="hw-remaining"><h2>Remaining today <span>${todayVisits.length}</span></h2>${todayVisits.length?todayVisits.map(v=>this.row(v)).join(''):'<p>No other visits today.</p>'}${b('HomeWorkspace.toggleCalendar',[],'Choose another day','btn btn-ghost')}</section>
      ${data.attention?.length?`<details class="hw-attention"><summary>Needs attention · ${data.attention.length}</summary>${data.attention.map(a=>`<button type="button" class="hw-visit-row" ${App.actionAttrs(a.action)}><span><strong class="comp-home-attention-label">${e(a.label)}</strong><small>${e(a.value)}</small></span><span>${e(a.actionLabel||'Open')}</span></button>`).join('')}</details>`:''}
      <section class="hw-search"><label for="home-customer-search">Find a customer</label><input type="search" class="input" id="home-customer-search" placeholder="Name, phone, postcode, address or order" autocomplete="off" data-event="input" data-action="HomeWorkspace.search" data-args='["__event__"]'><div id="home-search-results" role="status" aria-live="polite"></div></section>
      ${b('HomeWorkspace.ask',[],'✧ Ask Beelo','btn btn-ghost hw-ask')}
      </div></div>`;
  },
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
    host.hidden=!host.hidden;if(host.hidden)return;
    if(!this.selectedDay)this.selectedDay=Utils.formatDate(Utils.getToday(),'iso');
    await this.renderCalendar();
  },
  async renderCalendar() {
    const host=document.getElementById('home-inline-calendar'),revision=App._navigationRevision,token=this._calendarToken=(this._calendarToken||0)+1;if(!host)return;
    const selected=this.selectedDay,date=this.dayInstant(selected),start=Utils.getStartOfWeek(date),end=this.addDays(start,7);
    try {
      const visits=(await DB.getAppointmentsForRange(start.toISOString(),end.toISOString())).filter(v=>v.status!=='cancelled');
      if(token!==this._calendarToken||revision!==App._navigationRevision||!host.isConnected)return;
      const e=this.esc.bind(this),b=this.button.bind(this),days=Array.from({length:7},(_,i)=>Utils.formatDate(this.addDays(start,i),'iso'));
      // Keep the calendar shell and focus owner mounted. Only counts and agenda
      // change after a day click; no whole-Home render or scrollIntoView.
      if(!host.querySelector('#home-day-choice'))host.innerHTML=`<label for="home-day-choice">Choose any date</label><input id="home-day-choice" type="date" class="input" value="${e(selected)}" data-event="change" data-action="HomeWorkspace.chooseDay" data-args='["__event__"]'><div class="hw-calendar-nav">${b('HomeWorkspace.shiftWeek',[-1],'Previous week')}${b('HomeWorkspace.shiftWeek',[1],'Next week')}</div><div id="home-calendar-days" class="hw-calendar-days"></div><div id="home-calendar-agenda"></div>`;
      document.getElementById('home-day-choice').value=selected;
      const dayHost=document.getElementById('home-calendar-days');
      if(dayHost.dataset.week!==days[0]){dayHost.dataset.week=days[0];dayHost.innerHTML=days.map(key=>`<button type="button" aria-pressed="${key===selected}" data-action="HomeWorkspace.chooseDay" data-args='${e(JSON.stringify([key]))}'><small>${e(Utils.formatDateUK(key,'weekday-short'))}</small><strong>${Number(key.slice(-2))}</strong><small>${visits.filter(v=>Utils.formatDate(v.date,'iso')===key).length} visits</small></button>`).join('');}
      for(const [index,button]of [...dayHost.children].entries())button.setAttribute('aria-pressed',String(days[index]===selected));
      const selectedVisits=visits.filter(v=>Utils.formatDate(v.date,'iso')===selected).sort((a,b)=>new Date(a.date)-new Date(b.date));
      if(token!==this._calendarToken||!host.isConnected||revision!==App._navigationRevision)return;
      const legs=this.plannedLegs(visits,this.coords(CONFIG.businessLatLng));for(const [id,leg]of legs)this.legs.set(id,leg);
      document.getElementById('home-calendar-agenda').innerHTML=`<h2>${e(Utils.formatDateUK(selected,'long'))} · ${selectedVisits.length} visits</h2>${selectedVisits.map(v=>this.row(v)).join('')||'<p>No visits on this day.</p>'}${b('App.navigate',['appointments',{action:'add',date:selected}],'Add visit on this day')}`;
    }catch(_){if(host.isConnected&&token===this._calendarToken)host.innerHTML='<p role="alert">Could not load the diary. Close and reopen to retry.</p>';}
  },
  chooseDay(value) {const day=typeof value==='string'?value:value.target.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;this.selectedDay=day;return this.renderCalendar();},
  shiftWeek(delta) {this.selectedDay=Utils.formatDate(this.addDays(this.dayInstant(this.selectedDay),Number(delta)*7),'iso');return this.renderCalendar();}
};
