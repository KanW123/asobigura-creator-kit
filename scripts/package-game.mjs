import fs from 'node:fs';
import path from 'node:path';
import {zipSync} from '../cli/node_modules/fflate/esm/index.mjs';
const [source,destination]=process.argv.slice(2);
if(!source||!destination)throw Error('Usage: node scripts/package-game.mjs <game-folder> <output.zip>');
const root=path.resolve(source),output=path.resolve(destination);
if(output===root||output.startsWith(root+path.sep))throw Error('Output must be outside game folder');
const files=Object.create(null);
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  if(item.name.startsWith('.')||['node_modules','internal'].includes(item.name))continue;
  const absolute=path.join(dir,item.name);
  if(item.isSymbolicLink())throw Error('Symlinks are not supported');
  if(item.isDirectory())walk(absolute);
  else files[path.relative(root,absolute).split(path.sep).join('/')]=fs.readFileSync(absolute);
}}
walk(root);if(!files['index.html'])throw Error('Game needs index.html at ZIP root');
fs.writeFileSync(output,zipSync(files,{level:6}));
console.log(`Created ${destination}: ${Object.keys(files).length} files`);
