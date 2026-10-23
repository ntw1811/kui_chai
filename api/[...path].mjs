import {apiHandler} from '../backend.mjs';
export default async function handler(req,res){if(!await apiHandler(req,res)){res.statusCode=404;res.end();}}
