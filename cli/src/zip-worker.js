import fs from 'node:fs';
import {serialize} from 'node:v8';
import {unpackZip} from './safe-zip.js';
try { process.stdout.write(serialize(unpackZip(fs.readFileSync(0)))); }
catch { process.stderr.write('Invalid or oversized ZIP'); process.exitCode=1; }
