import fs from 'node:fs/promises';
await fs.rm('dist',{recursive:true,force:true});
await fs.mkdir('dist/assets',{recursive:true});await fs.mkdir('dist/data',{recursive:true});
await fs.cp('site/web','dist',{recursive:true});
await fs.copyFile('node_modules/cytoscape/dist/cytoscape.min.js','dist/assets/cytoscape.min.js');
await fs.copyFile('node_modules/cytoscape/LICENSE','dist/assets/CYTOSCAPE-LICENSE.txt');
await fs.copyFile('site/data/dataset.json','dist/data/dataset.json');
console.log('Static site assembled in dist/.');
