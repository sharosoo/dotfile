import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "sharosoo.sysstat"

  property int cpu: 0
  property int mem: 0
  property string memDetail: ""
  property var prevIdle: 0
  property var prevTotal: 0

  implicitWidth: labelText.implicitWidth + Style.spacing.controlPaddingX * 2
  implicitHeight: barSize

  function parse(out) {
    var lines = out.split("\n")
    var memTotal = 0, memAvail = 0
    for (var i = 0; i < lines.length; i++) {
      var f = lines[i].trim().split(/\s+/)
      if (f[0] === "cpu") {
        var idle = Number(f[4]) + Number(f[5])
        var total = 0
        for (var j = 1; j < f.length; j++) total += Number(f[j])
        var dTotal = total - prevTotal
        if (prevTotal > 0 && dTotal > 0) root.cpu = Math.round(100 * (1 - (idle - prevIdle) / dTotal))
        prevIdle = idle
        prevTotal = total
      } else if (f[0] === "MemTotal:") {
        memTotal = Number(f[1])
      } else if (f[0] === "MemAvailable:") {
        memAvail = Number(f[1])
      }
    }
    if (memTotal > 0) {
      var used = memTotal - memAvail
      root.mem = Math.round(100 * used / memTotal)
      root.memDetail = (used / 1048576).toFixed(1) + " / " + (memTotal / 1048576).toFixed(1) + " GiB"
    }
  }

  Process {
    id: statProc
    command: ["sh", "-c", "head -1 /proc/stat; grep -E '^Mem(Total|Available):' /proc/meminfo"]
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
    text: root.vertical ? root.cpu + "\n" + root.mem : " " + root.cpu + "%   " + root.mem + "%"
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
    onEntered: if (root.bar) root.bar.showTooltip(root, "CPU " + root.cpu + "%\nMemory " + root.mem + "% (" + root.memDetail + ")")
    onExited: if (root.bar) root.bar.hideTooltip(root)
  }
}
