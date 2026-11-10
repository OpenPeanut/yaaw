const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const transfers = require('../js/aria4-transfers.js');
const Mustache = require('../js/mustache.js');
const now = Date.parse('2026-11-10T10:00:00Z');
const fixture = {
 status: 'active', aria4DownloadMode: 'peer', aria4PeerLimit: '4',
 aria4Sources: [
  {type:'http', receivedBytes:'32768', committedBytes:'16384', downloadSpeed:'555', connections:'9'},
  {type:'phub', receivedBytes:'98304', committedBytes:'32768', downloadSpeed:'1234', connections:'1'},
  {type:'xphub', receivedBytes:'65536', committedBytes:'65536', downloadSpeed:'5678', connections:'1'}
 ],
 aria4Peers: [
  {id:'node-safe-id', source:'phub', state:'slow',receivedBytes:'98304',downloadSpeed:'0',failures:'2',lastError:'<img src=x onerror="alert(1)">',retryAt:'2026-11-10T10:00:12Z'},
  {id:'node-b',source:'xphub',state:'downloading',receivedBytes:'65536',downloadSpeed:'5678',failures:'0'}
 ]
};
const task = transfers.prepare(JSON.parse(JSON.stringify(fixture)), now);
assert.equal(task.activePeerCount, 2);
assert.equal(task.peerLimit, 4);
assert.equal(task.sourceRows[0].paused, true);
assert.equal(task.sourceRows[0].downloadSpeed, 0);
assert.equal(task.sourceRows[0].connections, 0);
assert.equal(task.sourceRows[1].receivedBytes, 98304);
assert.equal(task.sourceRows[1].committedBytes, 32768);
assert.equal(task.peerRows[0].stateLabel, '速度过低');
assert.equal(task.peerRows[0].retrySeconds, 12);
assert.equal(task.peerRows[1].stateLabel, '下载中');
const paused = transfers.prepare({...fixture,status:'paused'}, now);
assert.equal(paused.activePeerCount, 0);
assert.equal(paused.peerRows[1].downloadSpeed, 0);
assert.equal(paused.peerRows[1].stateLabel, '已停止');
assert.equal(paused.peerRows[0].hasRetry, false);
const legacy = transfers.prepare({status:'active',files:[]},now);
assert.equal(legacy.isPeerOnly, false);
assert.equal(legacy.hasSourceStats, false);
assert.equal(legacy.hasPeers, false);
const invalid=transfers.prepare({status:'active',aria4Sources:[{type:'http',downloadSpeed:'NaN',receivedBytes:'-1',connections:'Infinity'}]},now);
assert.equal(invalid.sourceRows[0].downloadSpeed,0);
assert.equal(invalid.sourceRows[0].receivedBytes,0);
assert.equal(invalid.sourceRows[0].connections,0);
// Render the real detail template: errors/node IDs remain escaped and all counters
// have their own columns; the existing HTTP worker view stays present.
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const template=html.match(/<script id="ib-status-tpl"[^>]*>([\s\S]*?)<\/script>/)[1];
const rendered=Mustache.render(template,task);
assert.ok(rendered.includes('仅 P2P'));
assert.ok(rendered.includes('HTTP 已暂停'));
assert.ok(rendered.includes('累计接收'));
assert.ok(rendered.includes('已落盘'));
assert.ok(rendered.includes('速度过低'));
assert.ok(rendered.includes('12 秒后重试'));
assert.ok(!rendered.includes('<img src=x'));
assert.ok(rendered.includes('&lt;img'));
assert.ok(rendered.includes('Workers:'));
assert.ok(html.indexOf('js/aria4-transfers.js')<html.indexOf('js/aria2.js'));
console.log('PASS: peer/source summary, paused state, retry timing, legacy API and escaped rendering');

const hybrid = transfers.prepare({...fixture,aria4DownloadMode:'hybrid'}, now);
assert.equal(hybrid.isPeerOnly,false);
assert.equal(hybrid.isHybrid,true);
assert.equal(hybrid.hasPeerMode,true);
assert.equal(hybrid.sourceRows[0].paused,false);
assert.equal(hybrid.sourceRows[0].downloadSpeed,555);
assert.equal(hybrid.sourceRows[0].connections,9);
assert.equal(hybrid.activePeerCount,2);
const hybridHTML=Mustache.render(template,hybrid);
assert.ok(hybridHTML.includes('HTTP + P2P'));
assert.ok(hybridHTML.includes('Peer 节点'));
assert.ok(!hybridHTML.includes('HTTP 已暂停'));
console.log('PASS: hybrid mode retains independent HTTP and peer traffic');
