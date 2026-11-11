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

const probed = transfers.prepare({status:'active', aria4DownloadMode:'peer', aria4PeerLimit:'32', aria4Peers:[
  {id:'pending',source:'phub',state:'probing'},
  {id:'known',source:'xphub',state:'available',rangeCount:'8',availableBytes:'65536',rangesUpdatedAt:'2026-11-10T10:00:00Z',rangesExpiresAt:'2026-11-10T10:01:00Z'},
  {id:'expired',source:'phub',state:'available',rangeCount:'4',availableBytes:'32768',rangesUpdatedAt:'2026-11-10T09:58:00Z',rangesExpiresAt:'2026-11-10T09:59:00Z'},
  {id:'empty',source:'phub',state:'no_ranges',rangeCount:'0',availableBytes:'0',rangesUpdatedAt:'2026-11-10T10:00:00Z',rangesExpiresAt:'2026-11-10T10:01:00Z'}
]}, now);
assert.equal(probed.peerLimit,32);
assert.equal(probed.peerRows[0].stateLabel,'探测区间');
assert.equal(probed.peerRows[1].hasRanges,true);
assert.equal(probed.peerRows[1].rangeCount,8);
assert.equal(probed.peerRows[1].availableBytes,65536);
assert.equal(probed.peerRows[2].hasRanges,false);
assert.equal(probed.peerRows[2].rangeNote,'待重新探测');
assert.equal(probed.peerRows[3].hasRanges,true);
assert.equal(probed.peerRows[3].rangeCount,0);
const probeHTML=Mustache.render(template,probed);
assert.ok(probeHTML.includes('持有区间'));
assert.ok(probeHTML.includes('8 段'));
assert.ok(probeHTML.includes('0 段'));
assert.ok(probeHTML.includes('待重新探测'));
assert.equal(transfers.prepare({...probed,status:'paused'},now).peerRows[0].stateLabel,'已停止');
console.log('PASS: peer probe, advertised coverage, expiry and 32 worker limit');

assert.equal(hybrid.peerDownloadSpeed, 1234 + 5678);
assert.equal(paused.peerDownloadSpeed, 0);
assert.equal(legacy.hasPeerSpeed, false);
const globalStats=transfers.prepareGlobal({downloadSpeed:'1048576',aria4PeerDownloadSpeed:'512000'});
assert.equal(globalStats.peerDownloadSpeed,512000);
assert.equal(globalStats.hasPeerSpeed,true);
const format=value=>Number(value)>=1048576 ? (Number(value)/1048576)+'MB' : (Number(value)/1024)+'KB';
assert.equal(transfers.speedTitle(globalStats,format),'↓1MB (⚡ 500KB)');
assert.equal(transfers.speedTitle(transfers.prepareGlobal({downloadSpeed:'1048576'}),format),'↓1MB');
assert.equal(transfers.prepareGlobal({aria4PeerDownloadSpeed:'NaN'}).peerDownloadSpeed,0);
const globalTemplate=html.match(/<script id="global-speed-tpl"[^>]*>([\s\S]*?)<\/script>/)[1];
const activeTemplate=html.match(/<script id="active-task-tpl"[^>]*>([\s\S]*?)<\/script>/)[1];
const view={format_size:()=>format};
const speedHTML=Mustache.render(globalTemplate,{...globalStats,_v:view});
assert.ok(speedHTML.includes('alt="P2P" width="16" height="16"> 500KB/s'));
const activeSpeed=transfers.prepare({...fixture,downloadSpeed:1048576,aria4Sources:[
 {type:'http',downloadSpeed:'536576'}, {type:'phub',downloadSpeed:'256000'}, {type:'xphub',downloadSpeed:'256000'}
],aria4DownloadMode:'hybrid'},now);
const activeHTML=Mustache.render(activeTemplate,{tasks:[activeSpeed],_v:view});
assert.ok(activeHTML.includes('alt="P2P" width="16" height="16"> 500KB/s'));
assert.ok(!Mustache.render(globalTemplate,{downloadSpeed:'1024',_v:view}).includes('p2p-speed-icon'));
console.log('PASS: global/task/title P2P speed includes PHub + XPHub and excludes HTTP/paused traffic');

const peerWorker=transfers.prepareWorkerSource({id:'7',uri:'peer://73736eabea9c',showSpeed:true,downloadSpeed:176128}, {'peer://73736eabea9c':1});
assert.equal(peerWorker.peerID,'73736eabea9c');
assert.equal(peerWorker.hasURLID,false);
const httpWorker=transfers.prepareWorkerSource({id:'1',uri:'https://example.test/file'}, {'https://example.test/file':2});
assert.equal(httpWorker.hasPeerID,false);
assert.equal(httpWorker.urlID,2);
const workerHTML=Mustache.render(template,{hasWorkers:true,aria4Workers:[peerWorker],_v:{format_size_0:()=>format}});
assert.ok(workerHTML.includes('Peer 73736eabea9c'));
assert.ok(workerHTML.includes('172KB/s'));
assert.ok(!workerHTML.includes('URL 1'));
transfers.prepareWorkerSource(Object.assign(peerWorker,{uri:''}),{});
assert.equal(peerWorker.hasPeerID,false);
assert.equal(peerWorker.peerID,'');
const multiple=transfers.prepare({status:'active',aria4DownloadMode:'peer',aria4Peers:[{id:'73736eabea9c',source:'xphub',state:'downloading',connections:'5'}]},now);
assert.equal(multiple.peerRows[0].connections,5);
assert.equal(transfers.prepare({...multiple,status:'paused'},now).peerRows[0].connections,0);
console.log('PASS: peer worker node identity, HTTP URL IDs, released worker identity and per-node connections');

const withDisk=transfers.prepare({status:'active',aria4Disk:{allocation:'fallocate',phase:'syncing',writtenBytes:1048576,writeCount:2,writeMillis:6,maxWriteMillis:4,syncCount:2,syncMillis:30,maxSyncMillis:20,waitCount:2,waitMillis:10,maxWaitMillis:8,queueBlocks:3,queueBytes:512000,peakQueueBlocks:4,checkpointCount:2,checkpointMillis:8,errors:0}},now);
assert.equal(withDisk.diskStats.writeAverage,'3.00');
assert.equal(withDisk.diskStats.syncAverage,'15.00');
assert.equal(withDisk.diskStats.waitAverage,'5.00');
const diskHTML=Mustache.render(template,{...withDisk,_v:view});
assert.ok(diskHTML.includes('磁盘写入'));
assert.ok(diskHTML.includes('空间已预留'));
assert.ok(diskHTML.includes('等待写盘 3 块'));
assert.ok(diskHTML.includes('15.00 ms'));
assert.ok(diskHTML.includes('断点保存 2 次'));
const stoppedDisk=transfers.prepare({...withDisk,status:'paused'},now);
assert.equal(stoppedDisk.diskStats.queueBlocks,0);
assert.equal(stoppedDisk.diskStats.phase,'已停止');
const fallbackDisk=transfers.prepare({status:'active',aria4Disk:{allocation:'truncate',phase:'<script>',writeMillis:'NaN',writeCount:0}},now);
assert.equal(fallbackDisk.diskStats.writeAverage,'0.00');
assert.ok(!Mustache.render(template,{...fallbackDisk,_v:view}).includes('<script>'));
assert.ok(Mustache.render(template,{...fallbackDisk,_v:view}).includes('未预留实际磁盘空间'));
assert.ok(!Mustache.render(template,transfers.prepare({status:'active'},now)).includes('磁盘写入'));
console.log('PASS: disk write/sync/queue summaries, allocation fallback, paused state and legacy compatibility');

const rangeTask=transfers.prepare({status:'active',totalLength:'1000',aria4CompletedRanges:[{start:'0',end:'125'},{start:'600',end:'650'},{start:'400',end:'500'},{start:'500',end:'610'}]},now);
assert.equal(rangeTask.hasRangeProgress,true);
assert.deepEqual(rangeTask.rangeSegments,[{left:0,width:12.5},{left:40,width:25}]);
assert.equal(rangeTask.rangeProgress,'37.50');
const rangeHTML=Mustache.render(template,rangeTask);
assert.ok(rangeHTML.includes('left:0%;width:12.5%'));
assert.ok(rangeHTML.includes('left:40%;width:25%'));
assert.ok(!rangeHTML.includes('Bitfield:'));
assert.equal(transfers.prepare({...rangeTask,status:'paused'},now).rangeProgress,'37.50');
const emptyRanges=transfers.prepare({status:'active',totalLength:1000,aria4CompletedRanges:[]},now);
assert.equal(emptyRanges.hasRangeProgress,true);
assert.equal(emptyRanges.rangeProgress,'0.00');
assert.deepEqual(emptyRanges.rangeSegments,[]);
const fullRanges=transfers.prepare({status:'complete',totalLength:1000},now);
assert.deepEqual(fullRanges.rangeSegments,[{left:0,width:100}]);
assert.equal(transfers.prepare({status:'active',totalLength:0,aria4CompletedRanges:[]},now).hasRangeProgress,false);
const badRanges=transfers.prepare({status:'active',totalLength:1000,aria4CompletedRanges:[{start:'<script>',end:100},{start:-1,end:200},{start:900,end:2000},{start:400,end:300}]},now);
assert.deepEqual(badRanges.rangeSegments,[]);
assert.ok(!Mustache.render(template,badRanges).includes('<script>'));
assert.equal(transfers.prepare({status:'active',totalLength:1000,bitfield:'ff',pieceLength:125},now).hasRangeProgress,false);
console.log('PASS: exact interval bar, partial pieces, merging, empty/full/paused states and no bitmap conversion');
