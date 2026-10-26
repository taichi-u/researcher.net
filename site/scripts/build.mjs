import fs from 'node:fs/promises';
import {writeBrowserData} from './browser-data.mjs';
await fs.rm('dist',{recursive:true,force:true});
await fs.mkdir('dist/assets',{recursive:true});await fs.mkdir('dist/data',{recursive:true});
await fs.cp('site/web','dist',{recursive:true});
await fs.copyFile('node_modules/cytoscape/dist/cytoscape.min.js','dist/assets/cytoscape.min.js');
await fs.copyFile('node_modules/cytoscape/LICENSE','dist/assets/CYTOSCAPE-LICENSE.txt');
await writeBrowserData(JSON.parse(await fs.readFile('site/data/dataset.json','utf8')),'dist/data');
console.log('Static site assembled in dist/.');
