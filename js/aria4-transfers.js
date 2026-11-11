/* Aria4 transfer summaries. No network calls; also usable by Node checks. */
(function(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ARIA4_TRANSFERS = factory();
}(this, function() {
  function number(value) {
    var parsed = Number(value);
    return isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  function sourceName(type) {
    return {http: "HTTP", phub: "PHub", xphub: "XPHub"}[type] || type;
  }
  function prepare(task, now) {
    now = now === undefined ? Date.now() : now;
    var hasExtension = task.aria4Sources !== undefined || task.aria4DownloadMode !== undefined;
    var running = task.status === "active";
    var sources = task.aria4Sources || [];
    var peers = task.aria4Peers || [];
    var states = {
      queued: "待连接", connecting: "连接中", ready: "已连接", downloading: "下载中",
      probing: "探测区间", available: "已探测", no_ranges: "未提供区间",
      choked: "等待节点放行", cooldown: "等待重试", rejected: "不可用", slow: "速度过低",
      stopped: "已停止"
    };
    task.isPeerOnly = task.aria4DownloadMode === "peer";
    task.isHybrid = task.aria4DownloadMode === "hybrid";
    task.hasPeerMode = task.isPeerOnly || task.isHybrid;
    task.hasSourceStats = hasExtension && sources.length > 0;
    task.peerLimit = number(task.aria4PeerLimit);
    task.activePeerCount = 0;
    task.peerDownloadSpeed = 0;
    task.hasPeerSpeed = hasExtension;
    task.sourceRows = [];
    for (var i = 0; i < sources.length; i++) {
      var source = sources[i];
      var row = {
        type: source.type, sourceLabel: sourceName(source.type),
        receivedBytes: number(source.receivedBytes), committedBytes: number(source.committedBytes),
        downloadSpeed: running ? number(source.downloadSpeed) : 0,
        connections: running ? number(source.connections) : 0,
        paused: task.isPeerOnly && source.type === "http"
      };
      if (row.paused) { row.downloadSpeed = 0; row.connections = 0; }
      if (source.type === "phub" || source.type === "xphub") {
        task.activePeerCount += row.connections;
        task.peerDownloadSpeed += row.downloadSpeed;
      }
      task.sourceRows.push(row);
    }
    task.peerRows = [];
    for (var j = 0; j < peers.length; j++) {
      var peer = peers[j];
      // Map statuses to fixed classes rather than deriving CSS from server text.
      var stateClass = {downloading: "peer-state-downloading", ready: "peer-state-ready",
        rejected: "peer-state-rejected", slow: "peer-state-slow", cooldown: "peer-state-cooldown",
        probing: "peer-state-connecting", available: "peer-state-ready",
        connecting: "peer-state-connecting", choked: "peer-state-choked"}[peer.state] || "peer-state-idle";
      var retryTime = Date.parse(peer.retryAt || "");
      var seconds = isFinite(retryTime) ? Math.max(0, Math.ceil((retryTime - now) / 1000)) : 0;
      var inactive = !running && /^(probing|connecting|ready|downloading|choked)$/.test(peer.state);
      var rangeExpiry = Date.parse(peer.rangesExpiresAt || "");
      var hasRanges = isFinite(rangeExpiry) && rangeExpiry > now;
      task.peerRows.push({
        id: peer.id, sourceLabel: sourceName(peer.source),
        stateLabel: inactive ? "已停止" : (states[peer.state] || "未知状态"), stateClass: inactive ? "peer-state-idle" : stateClass,
        receivedBytes: number(peer.receivedBytes),
        downloadSpeed: running ? number(peer.downloadSpeed) : 0,
        failures: number(peer.failures), lastError: peer.lastError || "",
        connections: running ? number(peer.connections) : 0,
        hasRanges: hasRanges, rangeCount: number(peer.rangeCount), availableBytes: number(peer.availableBytes),
        rangeNote: peer.rangesUpdatedAt ? "待重新探测" : "尚未探测",
        retrySeconds: seconds, hasRetry: seconds > 0 && running
      });
    }
    task.hasPeers = task.peerRows.length > 0;
    task.peerEmptyMessage = running ? "正在获取可用节点…" : "暂无节点记录";
    return task;
  }
  function prepareGlobal(stats) {
    stats.hasPeerSpeed = stats.aria4PeerDownloadSpeed !== undefined;
    stats.peerDownloadSpeed = number(stats.aria4PeerDownloadSpeed);
    return stats;
  }
  function speedTitle(stats, format) {
    return "↓" + format(stats.downloadSpeed) +
      (stats.hasPeerSpeed ? " (⚡ " + format(stats.peerDownloadSpeed) + ")" : "");
  }
  function prepareWorkerSource(worker, urlIDs) {
    var match = /^peer:\/\/([a-f0-9]{12})$/i.exec(worker.uri || "");
    worker.peerID = match ? match[1] : "";
    worker.hasPeerID = !!match;
    worker.urlID = match ? 0 : ((urlIDs || {})[worker.uri] || 0);
    worker.hasURLID = worker.urlID > 0;
    return worker;
  }
  return {prepare: prepare, prepareGlobal: prepareGlobal, speedTitle: speedTitle, prepareWorkerSource: prepareWorkerSource};
}));
