import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const modules=path.join(root,'cli/node_modules');
const notices=['# Third-party notices','', 'These dependencies are bundled in the release ZIP. Their licenses are preserved in cli/node_modules. The SDK has no bundled runtime dependencies.',''];
const inventory=[];
for(const name of fs.readdirSync(modules).filter(n=>!n.startsWith('.')).sort()){
  const dir=path.join(modules,name);
  const p=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
  const licenses=fs.readdirSync(dir).filter(n=>/^licen[cs]e(?:\.|$)/i.test(n));
  if(!licenses.length)throw Error('Missing license: '+name);
  inventory.push({name:p.name,version:p.version,license:p.license});
  notices.push(`## ${p.name} ${p.version} (${p.license})`,'');
  for(const license of licenses)notices.push(fs.readFileSync(path.join(dir,license),'utf8'),'');
}
const xdg=fs.readFileSync(path.join(modules,'open/xdg-open'),'utf8');
notices.push('## open/xdg-open (embedded notice)','',xdg.split('\n').slice(0,35).join('\n'),'');
fs.writeFileSync(path.join(root,'THIRD_PARTY_NOTICES.md'),notices.join('\n'));
fs.writeFileSync(path.join(root,'DEPENDENCIES.json'),JSON.stringify(inventory,null,2)+'\n');
