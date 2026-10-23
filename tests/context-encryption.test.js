'use strict';
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  for (const file of ['js/core/db.js', 'js/core/db.min.js']) {
    const values = new Map();
    const s = {console, crypto:require('node:crypto').webcrypto, TextEncoder, TextDecoder, Uint8Array, btoa, atob,
      localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}};
    vm.createContext(s);
    const api = vm.runInContext(fs.readFileSync(file,'utf8')+'\n({DB,initEncryption,encryptField,decryptCustomer,decryptAppointment,decryptMeasurementAudio,decryptPhoto});',s);
    await api.initEncryption('SYNTHETIC context key');
    const enc=api.encryptField;
    assert.equal((await api.decryptCustomer({fullName:await enc('SYNTHETIC Customer'),postcodeNormalized:await enc('M14 7FZ')})).fullName,'SYNTHETIC Customer');
    assert.equal((await api.decryptAppointment({access:await enc('SYNTHETIC gate 1234')})).access,'SYNTHETIC gate 1234');
    const fields={windowName:'SYNTHETIC bedroom',room:'SYNTHETIC old room',productName:'Roller',description:'SYNTHETIC control left',notes:'اردو 🪟'};
    const row={id:1,appointmentId:9,photos:[await enc('data:image/jpeg;base64,QUJD')],widthLeast:1234};
    for(const [key,value] of Object.entries(fields)) row[key]=await enc(value);
    const measure=await api.decryptMeasurementAudio(row);
    for(const [key,value] of Object.entries(fields)) assert.equal(measure[key],value);
    assert.equal(measure.widthLeast,1234);
    assert.equal(measure.photos[0],'data:image/jpeg;base64,QUJD');
    assert.equal((await api.decryptMeasurementAudio({notes:'legacy',photos:['old']})).notes,'legacy');
    const photo={id:2,customerId:3,data:await enc('QUJD'),caption:await enc('SYNTHETIC photo')};
    api.DB.db={photos:{get:async()=>photo,where:()=>({equals:()=>({toArray:async()=>[photo]})})},measurements:{where:()=>({anyOf:()=>({toArray:async()=>[row]})})}};
    assert.equal((await api.DB.getPhoto(2)).data,'QUJD');
    assert.equal((await api.DB.getPhotosForCustomer(3))[0].caption,'SYNTHETIC photo');
    assert.equal((await api.DB.getMeasurementsForAppointments([9]))[0].windowName,fields.windowName);
    assert.equal((await api.DB.getMeasurementsForAppointments([])).length,0);
    console.log('PASS '+file+': protected and legacy context readers, photos, Unicode, dimensions and batch API');
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
