const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright' : 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE});
 const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
 const page = await context.newPage(); const errors=[];
 page.on('pageerror', e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8088');
 await page.getByText('Bonjour Mohamed',{exact:true}).waitFor();
 await page.screenshot({path:'docs/accueil-iphone.png'});
 console.log('Home loaded');
 const grid = () => page.getByRole('button',{name:/Choisir la grille/});
 await grid().click();
 await page.getByRole('radio',{name:'3 colonnes'}).click();
 await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.reload(); await page.getByText('Bonjour Mohamed',{exact:true}).waitFor();
 assert.match(await grid().getAttribute('aria-label'),/3 colonnes/);
 await grid().click();
 await page.getByRole('radio',{name:'4 colonnes'}).click();
 await page.getByRole('button',{name:'Fermer',exact:true}).click();
 assert.equal(await page.locator('[data-testid^="module-"]').count(),4);
 await page.getByRole('button',{name:'Tous les modules',exact:true}).click();
 await page.getByRole('textbox',{name:'Rechercher un module'}).fill('Factures');
 await page.getByRole('button',{name:'Factures 0'}).click();
 await page.getByText('Tout est à jour dans ce module.').waitFor();
 await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await grid().click(); await page.getByRole('button',{name:'Revenir au réglage précédent',exact:true}).click();
 await page.getByRole('button',{name:'Fermer',exact:true}).click();
 assert.match(await grid().getAttribute('aria-label'),/3 colonnes/);
 await page.reload(); await page.getByText('Bonjour Mohamed',{exact:true}).waitFor();
 assert.match(await grid().getAttribute('aria-label'),/3 colonnes/);
 await grid().click(); await page.getByRole('radio',{name:'2 colonnes'}).click(); await page.getByRole('button',{name:'Fermer',exact:true}).click();
 // Every grid stays equal and within viewport at multiple mobile widths.
 for(const width of [320,390,430]) {
  await page.setViewportSize({width,height:844});
  for(const columns of [2,3,4]) {
   await grid().click(); await page.getByRole('radio',{name:`${columns} colonnes`}).click(); await page.getByRole('button',{name:'Fermer',exact:true}).click();
   const boxes=await page.locator('[data-testid^="module-"]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(); return {x:r.x,width:r.width,height:r.height,right:r.right};}));
   assert.equal(boxes.length%columns,0);
   assert.ok(boxes.every(b=>Math.abs(b.width-boxes[0].width)<1 && Math.abs(b.height-boxes[0].height)<1 && b.right<=width+1));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
 }
 await page.setViewportSize({width:390,height:844});
 await grid().click(); await page.getByRole('radio',{name:'2 colonnes'}).click(); await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.getByRole('button',{name:'Finaliser et envoyer',exact:true}).click();
 await page.getByRole('button',{name:'Montant vérifié, continuer',exact:true}).click();
 await page.getByRole('button',{name:'Confirmer la simulation d’envoi',exact:true}).click();
 await page.getByText(/Simulation terminée : devis validé/).waitFor();
 await page.getByRole('button',{name:'Revoir les actions de démonstration',exact:true}).click();
 for(const name of ['Devis Dupont, 1 200 €, à envoyer','Remplacer l’escabeau','Vérifier une facture reçue']) await page.getByRole('button',{name:`Masquer : ${name}`,exact:true}).click();
 await page.getByText('Tout est à jour. Vous pouvez souffler.').waitFor();
 await page.getByRole('button',{name:'Revoir les actions de démonstration',exact:true}).click();
 await page.getByRole('button',{name:'Fermer la confirmation',exact:true}).click();
 // The mounted home and assistant draft survive floating panel open/close.
 await page.getByRole('button',{name:'Assistant IA, parler ou poser une question',exact:true}).click();
 await page.getByRole('textbox',{name:'Votre question à l’assistant'}).fill('Préparer ma journée');
 await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.getByRole('button',{name:'Assistant IA, parler ou poser une question',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'Votre question à l’assistant'}).inputValue(),'Préparer ma journée');
 await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.setViewportSize({width:390,height:2300});
 const footer = await page.getByText('Aperçu · données de démonstration',{exact:true}).boundingBox();
 await page.setViewportSize({width:390,height:Math.ceil(footer.y+footer.height+32)});
 await page.screenshot({path:'docs/accueil-complet.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 const shots=[];
 for(const columns of [2,3,4]){
  await grid().click(); await page.getByRole('radio',{name:`${columns} colonnes`}).click(); await page.getByRole('button',{name:'Fermer',exact:true}).click();
  const section = page.getByText('Vos modules',{exact:true}).locator('..').locator('..');
  await section.screenshot({path:`docs/grille-${columns}.png`});
  shots.push({columns,count:await page.locator('[data-testid^="module-"]').count()});
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync('docs/verification.json',JSON.stringify({testedAt:new Date().toISOString(),scope:'Chromium, web export only; not a real iPhone test',viewports:[320,390,430],grids:shots,checks:['preference persistence after reload','previous setting restore and persistence','complete rows and equal tile dimensions','zero counter available through reserve','no horizontal page overflow','explicit simulated send confirmation','empty state after hiding actions','assistant draft preserved between panels'],runtimeErrors:errors},null,2));
 console.log('PASS',shots);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
