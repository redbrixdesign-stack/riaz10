const fs = require('fs'); const vm = require('vm');
const source = fs.readFileSync('js/services/capacity.js', 'utf8') + '\nthis.CapacityService = CapacityService;';
const sandbox = { CONFIG: { workingWeek: { slotMinutes: 15, blocks: [{start:'09:00',end:'18:00'}] } }, Utils: { formatDate: d => new Date(d).toISOString().slice(0,10), formatTime: d => new Date(d).toISOString().slice(11,16) }, DB: { getAvailabilityBlocks: async () => [] } };
vm.createContext(sandbox); vm.runInContext(source, sandbox); const C = sandbox.CapacityService;
const ok = (name, value) => { if (!value) throw new Error(name); console.log('OK:', name); };
(async () => {
  let warnings = await C.analyse({date:'2026-08-20T08:30:00',durationSlots:2}, []);
  ok('outside-hours warning is deterministic', warnings.some(w => w.code === 'closed_hours'));
  warnings = await C.analyse({date:'2026-08-20T10:00:00',durationSlots:4}, [{id:1,date:'2026-08-20T10:30:00',durationSlots:2,status:'confirmed'}]);
  ok('duration-aware overlap detected', warnings.some(w => w.code === 'overlap'));
  sandbox.DB.getAvailabilityBlocks = async () => [{type:'leave',startAt:'2026-08-20T09:00:00',endAt:'2026-08-20T17:00:00',label:'Holiday'}];
  warnings = await C.analyse({date:'2026-08-20T11:00:00',durationSlots:2}, []);
  ok('leave blocks capacity', warnings.some(w => w.code === 'leave'));
  sandbox.DB.getAvailabilityBlocks = async () => [];
  const suggestions = await C.suggest({date:'2026-08-20',durationSlots:2}, [{id:1,date:'2026-08-20T09:00:00',durationSlots:2,status:'confirmed'}]);
  ok('suggestions are advisory and avoid occupied time', suggestions.length > 0 && suggestions[0].label !== '09:00');
  console.log('CAPACITY TEST PASSED');
})().catch(e => { console.error(e); process.exit(1); });
