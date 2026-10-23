'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
for(const file of ['js/core/app.js','js/core/app.min.js']){
 const s={console,document:{addEventListener(){}}};vm.createContext(s);
 const app=vm.runInContext(fs.readFileSync(file,'utf8')+'\nApp;',s);
 const field=(tagName,type,value,extra={})=>({tagName,type,value,matches(){return type==='password'||type==='file'||!!this.secret;},...extra});
 const fields=[field('INPUT','text','SYNTHETIC edited'),field('TEXTAREA','','SYNTHETIC <markup>'),field('INPUT','checkbox','yes',{checked:true}),field('INPUT','radio','b',{checked:false}),field('SELECT','','b',{options:[{selected:false},{selected:true}]}),field('INPUT','password','DO NOT COPY'),field('INPUT','file','DO NOT COPY'),field('TEXTAREA','','DO NOT COPY',{secret:true})];
 const target=()=>({attrs:{},setAttribute(name,value){this.attrs[name]=value;},toggleAttribute(name,on){if(on)this.attrs[name]='';else delete this.attrs[name];}});
 const copies=fields.map(target);copies[4].options=[target(),target()];copies[3].attrs.checked='';
 const sheet={innerHTML:'original defaults',closest:()=>null,querySelectorAll:()=>fields,cloneNode(deep){assert(deep);return {querySelectorAll:()=>copies,get innerHTML(){return 'snapshot';}};}};
 assert.equal(app.snapshotModalContent(sheet),'snapshot');
 assert.equal(copies[0].attrs.value,'SYNTHETIC edited');assert.equal(copies[1].textContent,'SYNTHETIC <markup>');
 assert.equal(copies[2].attrs.checked,'');assert(!('checked' in copies[3].attrs));
 assert(!('selected' in copies[4].options[0].attrs));assert.equal(copies[4].options[1].attrs.selected,'');
 for(const index of [5,6,7]){assert.deepEqual(copies[index].attrs,{});assert.equal(copies[index].textContent,undefined);}
 assert.equal(fields[0].value,'SYNTHETIC edited');assert.equal(sheet.innerHTML,'original defaults','Snapshot must not mutate the visible form');
 assert.equal(app.snapshotModalContent({innerHTML:'gate defaults',closest:()=>({}),cloneNode(){throw Error('Gate must not be cloned');}}),'gate defaults');
 console.log('PASS '+file+': detached snapshot, live values/checks/options, no visible mutation, secret/file/gate exclusions');
}
