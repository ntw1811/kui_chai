import {apiHandler} from './backend.mjs';
import {publicConfigScript} from './env-config.mjs';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/domain.js':'domain.js','/style.css':'style.css'};
http.createServer(async(req,res)=>{if(await apiHandler(req,res))return;if(new URL(req.url,'http://localhost').pathname==='/config.js'){try{res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');return res.end(await publicConfigScript());}catch{res.writeHead(500);return res.end('Missing Supabase configuration');}}const file=files[new URL(req.url,'http://localhost').pathname];if(!file){res.writeHead(404);return res.end();}try{const body=await readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(body);}catch{res.writeHead(500);res.end('Unable to read application');}}).listen(5000,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5000'));
