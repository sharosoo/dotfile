import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "sharosoo.sysstat"

  property int cpu: 0
  property int iowait: 0
  property int mem: 0
  property string memDetail: ""
  property real readBps: 0
  property real writeBps: 0
  property var prevIdle: 0
  property var prevIowait: 0
  property var prevTotal: 0
  property var prevRead: -1
  property var prevWrite: -1
  property var prevTime: 0

  implicitWidth: labelText.implicitWidth + Style.spacing.controlPaddingX * 2
  implicitHeight: barSize

  // Physical disks only: partitions, dm and zram would double-count the same I/O.
  readonly property var diskPattern: /^(nvme\d+n\d+|sd[a-z]+|vd[a-z]+|mmcblk\d+)$/

  function rate(bps) {
    if (bps >= 1048576) return (bps / 1048576).toFixed(bps >= 10485760 ? 0 : 1) + "M"
    return Math.round(bps / 1024) + "K"
  }

  function parse(out) {
    var lines = out.split("\n")
    var memTotal = 0, memAvail = 0, rd = 0, wr = 0
    for (var i = 0; i < lines.length; i++) {
      var f = lines[i].trim().split(/\s+/)
      if (f[0] === "cpu") {
        var idle = Number(f[4]) + Number(f[5])
        var total = 0
        for (var j = 1; j < f.length; j++) total += Number(f[j])
        var dTotal = total - prevTotal
        if (prevTotal > 0 && dTotal > 0) {
          root.cpu = Math.round(100 * (1 - (idle - prevIdle) / dTotal))
          root.iowait = Math.round(100 * (Number(f[5]) - prevIowait) / dTotal)
        }
        prevIdle = idle
        prevIowait = Number(f[5])
        prevTotal = total
      } else if (f[0] === "MemTotal:") {
        memTotal = Number(f[1])
      } else if (f[0] === "MemAvailable:") {
        memAvail = Number(f[1])
      } else if (f.length > 9 && diskPattern.test(f[2])) {
        rd += Number(f[5]) * 512
        wr += Number(f[9]) * 512
      }
    }
    if (memTotal > 0) {
      var used = memTotal - memAvail
      root.mem = Math.round(100 * used / memTotal)
      root.memDetail = (used / 1048576).toFixed(1) + " / " + (memTotal / 1048576).toFixed(1) + " GiB"
    }
    var now = Date.now()
    if (prevRead >= 0 && now > prevTime) {
      var dt = (now - prevTime) / 1000
      root.readBps = Math.max(0, (rd - prevRead) / dt)
      root.writeBps = Math.max(0, (wr - prevWrite) / dt)
    }
    prevRead = rd
    prevWrite = wr
    prevTime = now
  }

  Process {
    id: statProc
    command: ["sh", "-c", "head -1 /proc/stat; grep -E '^Mem(Total|Available):' /proc/meminfo; cat /proc/diskstats"]
    stdout: StdioCollector {
      onStreamFinished: root.parse(text)
    }
  }

  Timer {
    interval: Number(root.setting("intervalMs", 2000))
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: if (!statProc.running) statProc.running = true
  }

  Text {
    id: labelText
    anchors.centerIn: parent
    textFormat: Text.PlainText
    text: root.vertical
      ? root.cpu + "\n" + root.mem + "\n" + root.rate(root.readBps + root.writeBps)
      : " " + root.cpu + "%   " + root.mem + "%   " + root.rate(root.readBps) + "↓ " + root.rate(root.writeBps) + "↑"
    horizontalAlignment: Text.AlignHCenter
    color: root.bar ? root.bar.barForeground : Color.foreground
    font.family: root.bar ? root.bar.fontFamily : Style.font.family
    font.pixelSize: Style.font.caption
  }

  MouseArea {
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: if (root.bar) root.bar.run("omarchy-launch-or-focus-tui btop")
    onEntered: if (root.bar) root.bar.showTooltip(root, "CPU " + root.cpu + "% (I/O wait " + root.iowait + "%)\nMemory " + root.mem + "% (" + root.memDetail + ")\nDisk read " + root.rate(root.readBps) + "B/s, write " + root.rate(root.writeBps) + "B/s")
    onExited: if (root.bar) root.bar.hideTooltip(root)
  }
}
