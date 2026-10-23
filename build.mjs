import {publicConfigScript} from './env-config.mjs';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
await mkdir('public',{recursive:true});
for(const f of ['index.html','app.js','domain.js','pull-refresh.js','style.css'])await copyFile(f,`public/${f}`);

await writeFile('public/config.js',await publicConfigScript());
