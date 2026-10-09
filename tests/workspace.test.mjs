import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace, taskSpec, STORAGE_KEY } from '../dist/planner.js';
import { createWalletConnection } from '../dist/wallet.js';
import { getWallets } from '@wallet-standard/app';
const memory = () => { const data = new Map(); return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}; };
const account = '11111111111111111111111111111111';
const input = {title:'Research plan',instruction:'Research Solana and cite sources.',capability:'Research',priority:'Normal',agentId:''};
test('saved plans persist, stay planned, and export the supplied instruction',()=>{
  const storage=memory(), store=createWorkspace(storage), task=store.saveTask(null,input);
  assert.equal(createWorkspace(storage).profile(null).tasks[0].instruction,input.instruction);
  assert.equal(taskSpec(task).status,'planned'); assert.equal(taskSpec(task).required_capability,'Research');
  assert.equal(taskSpec(task).preferred_endpoint,null); assert.equal(taskSpec(task).instruction,input.instruction);
});
test('wallet and guest workspaces remain separate',()=>{
  const store=createWorkspace(memory()); store.saveTask(null,input); store.saveTask(account,{...input,title:'Wallet plan'});
  assert.equal(store.profile(null).tasks[0].title,'Research plan'); assert.equal(store.profile(account).tasks[0].title,'Wallet plan');
});
test('agent capability mismatch is rejected; export snapshots survive removal',()=>{
  const store=createWorkspace(memory()), a=store.addAgent(null,{name:'Research agent',endpoint:'https://example.com/tasks',caps:['Research']});
  assert.throws(()=>store.saveTask(null,{...input,capability:'Classification',agentId:a.id}),/capability/);
  const task=store.saveTask(null,{...input,agentId:a.id});store.favorite(null,a.id);assert.equal(store.profile(null).agents.find(agent=>agent.id===a.id).favorite,true);
  store.removeAgent(null,a.id);assert.ok(!store.profile(null).agents.some(agent=>agent.id===a.id));assert.equal(taskSpec(task).preferred_endpoint,'https://example.com/tasks');
});
test('invalid inputs and credential-bearing endpoint URLs are rejected',()=>{
  const store=createWorkspace(memory());
  for(const endpoint of ['javascript:alert(1)','http://example.com','https://user:secret@example.com'])assert.throws(()=>store.addAgent(null,{name:'A',endpoint,caps:['Research']}),/HTTPS/);
  assert.throws(()=>store.saveTask(null,{...input,instruction:' '}),/instruction/);
  assert.throws(()=>store.saveTask(null,{...input,priority:'Urgent'}),/priority/);
});
test('corrupt or unavailable storage produces a visible warning without stopping planning',()=>{
  const storage=memory();storage.setItem(STORAGE_KEY,'{');const store=createWorkspace(storage);assert.match(store.warning,/could not be read/);
  const blocked=createWorkspace({getItem(){throw Error();},setItem(){throw Error();}});blocked.saveTask(null,input);assert.equal(blocked.profile(null).tasks.length,4);assert.match(blocked.warning,/session only/);
});
globalThis.window = new EventTarget();
function standard(name='Solflare') {
  let listener, disconnected=0;
  const a={address:account,chains:['solana:mainnet']};
  const wallet={name,chains:['solana:mainnet'],accounts:[a],features:{'standard:connect':{connect:async()=>({accounts:[a]})},'standard:disconnect':{disconnect:async()=>{disconnected++;}},'standard:events':{on:(event,callback)=>{listener=callback;return ()=>listener=null;}}}};
  return {wallet,change:accounts=>listener?.({accounts}),get disconnected(){return disconnected;}};
}
test('Wallet Standard discovers arbitrary Solana wallets, tracks account changes and disconnect',async()=>{
  const changes=[], connector=createWalletConnection(s=>changes.push(s)), mock=standard('Other Solana Wallet');
  const unregister=getWallets().register(mock.wallet);const found=connector.wallets().find(w=>w.name==='Other Solana Wallet');assert.ok(found);
  await connector.connect(found);assert.equal(changes.at(-1).address,account);
  const next='22222222222222222222222222222222';mock.change([{address:next,chains:['solana:mainnet']}]);assert.equal(changes.at(-1).address,next);
  await connector.disconnect();assert.equal(changes.at(-1).address,null);assert.equal(mock.disconnected,1);unregister();
});
test('non-Solana wallets are excluded and legacy Solflare remains available',async()=>{
  const nonSolana={name:'Other Chain',chains:['ethereum:1'],features:{'standard:connect':{}}};const unregister=getWallets().register(nonSolana);
  const connector=createWalletConnection(()=>{});assert.ok(!connector.wallets().some(w=>w.name==='Other Chain'));
  window.solflare={connect:async()=>({publicKey:{toString:()=>account}}),disconnect:async()=>{}};
  assert.ok(connector.wallets().some(w=>w.name==='Solflare'));await connector.connect(connector.wallets().find(w=>w.name==='Solflare'));await connector.disconnect();delete window.solflare;unregister();
});
test('rejected wallet requests do not retain a connected profile',async()=>{
  const changes=[], connector=createWalletConnection(s=>changes.push(s)), mock=standard();mock.wallet.features['standard:connect'].connect=async()=>{throw Error('User rejected');};
  const unregister=getWallets().register(mock.wallet);await assert.rejects(connector.connect(connector.wallets().find(w=>w.wallet===mock.wallet)),/rejected/);assert.equal(changes.at(-1).address,null);assert.equal(connector.connecting,false);unregister();
});
test('unregistering the connected wallet clears the active profile',async()=>{
  const changes=[], connector=createWalletConnection(s=>changes.push(s)), mock=standard();const unregister=getWallets().register(mock.wallet);
  await connector.connect(connector.wallets().find(w=>w.wallet===mock.wallet));unregister();assert.equal(changes.at(-1).address,null);
});
test('Phantom and Backpack fallbacks connect without signing or sending transactions',async()=>{
  const changes=[], connector=createWalletConnection(s=>changes.push(s));
  for(const name of ['Phantom','Backpack']){
    const provider={connect:async()=>({publicKey:{toString:()=>account}}),disconnect:async()=>{},signMessage:()=>assert.fail('No signing expected'),signTransaction:()=>assert.fail('No transaction expected')};
    if(name==='Phantom')window.phantom={solana:provider};else window.backpack={solana:provider};
    const found=connector.wallets().find(w=>w.name===name);assert.ok(found);await connector.connect(found);assert.equal(changes.at(-1).address,account);await connector.disconnect();delete window.phantom;delete window.backpack;
  }
});
test('a wallet that returns only another chain is disconnected and not retained',async()=>{
  const changes=[], connector=createWalletConnection(s=>changes.push(s)), mock=standard();
  mock.wallet.features['standard:connect'].connect=async()=>({accounts:[{address:'0x123',chains:['ethereum:1']}]});
  const unregister=getWallets().register(mock.wallet);await assert.rejects(connector.connect(connector.wallets().find(w=>w.wallet===mock.wallet)),/Solana account/);
  assert.equal(mock.disconnected,1);assert.equal(changes.at(-1).address,null);unregister();
});

test('three agent templates populate new and existing profiles once; removal survives reload',()=>{
  const storage=memory();storage.setItem(STORAGE_KEY,JSON.stringify({profiles:{guest:{agents:[],tasks:[],events:[]}}}));
  const store=createWorkspace(storage), p=store.profile(null);
  assert.deepEqual(p.agents.map(a=>a.name),['Atlas','Relay','Vector']);
  assert.equal(new Set(p.agents.flatMap(a=>a.caps)).size,6);
  assert.equal(store.profile(account).agents.length,3);
  store.favorite(null,'template-atlas');assert.equal(store.profile(account).agents[0].favorite,false);
  store.removeAgent(null,'template-atlas');assert.equal(createWorkspace(storage).profile(null).agents.length,2);
});

test('starter plans migrate once without replacing saved work or inventing execution outcomes',()=>{
  const storage=memory();
  const existing={id:'existing',...input,createdAt:1,status:'Planned',owner:'guest',agent:null};
  storage.setItem(STORAGE_KEY,JSON.stringify({profiles:{guest:{agents:[],tasks:[existing],events:[]}}}));
  const store=createWorkspace(storage), p=store.profile(null);
  assert.equal(p.tasks.length,4);assert.equal(p.tasks[0].id,'existing');
  assert.deepEqual(p.tasks.slice(1).map(t=>t.capability),['Research','Code Generation','Data Analysis']);
  assert.ok(p.tasks.every(t=>t.status==='Planned'));
  assert.equal(createWorkspace(storage).profile(null).tasks.length,4);
  assert.equal(createWorkspace(storage).profile(null).events.length,1);
  assert.equal(store.profile(account).tasks.length,3);
  assert.equal(store.profile(account).tasks[0].owner,account);
  const copy=store.saveTask(null,{...p.tasks[1],agentId:'template-atlas'});
  assert.equal(taskSpec(copy).preferred_endpoint,'https://atlas.example/tasks');
});
