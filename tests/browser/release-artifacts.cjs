'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
exports.artifactPath=name=>{
 const directory=process.env.BEELO_ARTIFACT_DIR||os.tmpdir();
 fs.mkdirSync(directory,{recursive:true});
 return path.join(directory,name);
};
