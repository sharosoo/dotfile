import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Bar button + popup for `omp usage`: every provider oh-my-pi is signed in
// to, every account under it, and each rate-limit window with its reset.
// The first tab is an overview (the fullest window per account); the others
// show one provider in full.
Panel {
  id: root
  moduleName: "sharosoo.omp-usage"
  ipcTarget: "sharosoo.omp-usage"
  manageIpc: false

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color accent: Color.accent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property color track: Style.selectedFillFor(foreground, Color.accent)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  readonly property int refreshIntervalSec: Math.max(60, Number(setting("refreshIntervalSec", 300)))
  readonly property bool redact: setting("redact", false) === true
  readonly property bool showPercent: setting("showPercent", true) !== false

  property var model: null
  property bool loading: false
  property string error: ""
  property double fetchedAt: 0
  property double nowMs: Date.now()

  readonly property var providers: model ? model.providers : []
  // 0 = overview, 1.. = providers[tab - 1]
  property string selectedId: ""
  readonly property int tab: {
    for (var i = 0; i < providers.length; i++)
      if (providers[i].id === selectedId) return i + 1
    return 0
  }
  readonly property var provider: tab > 0 ? providers[tab - 1] : null
  readonly property var overall: model ? model.overall : null
  readonly property bool alarming: !!overall && overall.limit.percent >= 0.9
  property bool cursorActive: false

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
  function alpha(c, a) { return Qt.rgba(c.r, c.g, c.b, a) }
  function pct(p) { return Math.round(clamp(p, 0, 9.99) * 100) + "%" }
  function levelColor(p) { return p >= 0.9 ? root.urgent : (p >= 0.7 ? root.accent : root.foreground) }

  function selectTab(index) {
    var count = providers.length + 1
    var wrapped = ((index % count) + count) % count
    selectedId = wrapped === 0 ? "" : providers[wrapped - 1].id
  }

  function formatDuration(ms) {
    if (!(ms > 0)) return "now"
    var minutes = Math.floor(ms / 60000)
    var hours = Math.floor(minutes / 60)
    var days = Math.floor(hours / 24)
    if (days > 0) return days + "d " + (hours % 24) + "h"
    if (hours > 0) return hours + "h " + (minutes % 60) + "m"
    return Math.max(1, minutes) + "m"
  }

  function resetText(limit) {
    if (!limit || !(limit.resetAt > 0)) return ""
    var ms = limit.resetAt - root.nowMs
    return ms > 0 ? "Resets in " + formatDuration(ms) : "Reset due"
  }

  function accountLabel(account, short) {
    if (!account) return ""
    return short ? Model.shortAccount(account.email) : account.email
  }

  function capitalize(text) {
    text = String(text || "")
    return text === "" ? "" : text.charAt(0).toUpperCase() + text.slice(1)
  }

  function refresh() {
    if (usageProc.running) return
    root.loading = true
    usageProc.command = root.redact ? ["omp", "usage", "--json", "--redact"] : ["omp", "usage", "--json"]
    usageProc.running = true
  }

  function footerText() {
    if (root.loading) return "Refreshing…"
    if (!(root.fetchedAt > 0)) return ""
    var ago = root.nowMs - root.fetchedAt
    var text = "Updated " + (ago < 60000 ? "just now" : formatDuration(ago) + " ago")
    if (model && model.disabled > 0) text += " · " + model.disabled + " disabled credential" + (model.disabled > 1 ? "s" : "")
    return text + " · r refresh"
  }

  function tooltip() {
    if (root.error !== "" && !model) return "omp usage: " + root.error
    if (!model || providers.length === 0) return "omp usage"
    var lines = []
    for (var i = 0; i < providers.length; i++) {
      var p = providers[i]
      if (p.peak) lines.push(p.name + "  " + pct(p.peak.percent) + "  " + p.peak.title)
    }
    return lines.join("\n")
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onOpenedChanged: if (opened) {
    cursorActive = false
    nowMs = Date.now()
    if (panelFlick) panelFlick.contentY = 0
    if (nowMs - fetchedAt > 60000) refresh()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }
  onTabChanged: if (panelFlick) panelFlick.contentY = 0
  onRedactChanged: refresh()

  Process {
    id: usageProc
    stdout: StdioCollector {
      id: usageOut
      waitForEnd: true
    }
    stderr: StdioCollector {
      id: usageErr
      waitForEnd: true
    }
    onExited: function(exitCode) {
      root.loading = false
      root.nowMs = Date.now()
      if (exitCode !== 0) {
        root.error = String(usageErr.text || "").trim().split("\n").pop() || ("exit " + exitCode)
        return
      }
      try {
        root.model = Model.build(JSON.parse(usageOut.text))
        root.fetchedAt = Date.now()
        root.error = ""
      } catch (e) {
        root.error = "Could not parse omp output"
      }
    }
  }

  Timer {
    interval: root.refreshIntervalSec * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  // Keeps the countdowns honest while the panel sits open.
  Timer {
    interval: 30000
    running: root.opened
    repeat: true
    onTriggered: root.nowMs = Date.now()
  }

  IpcHandler {
    target: root.ipcTarget
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): string { root.refresh(); return "ok" }
    function select(id: string): string { root.selectedId = id === "overview" ? "" : id; root.open(); return "ok" }
    function current(): string { return root.selectedId === "" ? "overview" : root.selectedId }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: {
      var icon = "󱚣"
      if (vertical || !root.showPercent || !root.overall) return icon
      return icon + " " + root.pct(root.overall.limit.percent)
    }
    active: root.alarming
    tooltipText: root.tooltip()
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.MiddleButton) root.refresh()
      else if (buttonCode === Qt.RightButton) {
        root.selectTab(root.tab + 1)
        if (!root.opened) root.open()
      } else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(420))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(680))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent

      onMoveRequested: function(dx, dy) {
        if (dx !== 0) {
          root.cursorActive = true
          root.selectTab(root.tab + dx)
        }
        if (dy !== 0)
          panelFlick.contentY = root.clamp(panelFlick.contentY + dy * Style.space(56), 0,
                                           Math.max(0, panelFlick.contentHeight - panelFlick.height))
      }
      onActivateRequested: root.refresh()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(t) { if (t === "r" || t === "R") root.refresh() }

      Flickable {
        id: panelFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: column.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        Column {
          id: column
          width: panelFlick.width
          spacing: Style.space(12)

          // ---------- Hero ----------
          PanelHero {
            width: parent.width
            title: root.provider ? root.provider.name : "AI usage"
            meta: {
              if (root.provider) {
                var n = root.provider.accounts.length
                return n + " account" + (n > 1 ? "s" : "") + (root.provider.peak ? " · peak " + root.pct(root.provider.peak.percent) : "")
              }
              if (!root.model) return root.loading ? "Asking omp…" : ""
              return root.providers.length + " providers · " + root.model.accountCount + " accounts"
            }
            foreground: root.foreground
            fontFamily: root.fontFamily
            iconComponent: Component {
              Text {
                textFormat: Text.PlainText
                text: "󱚣"
                color: root.alarming ? root.urgent : root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.display
              }
            }
          }

          // ---------- Tabs ----------
          Flow {
            id: tabs
            visible: root.providers.length > 0
            width: parent.width
            spacing: Style.spacing.sm

            Repeater {
              model: [{ id: "", name: "Overview" }].concat(root.providers)

              Button {
                required property var modelData
                required property int index

                text: modelData.name
                selected: index === root.tab
                hasCursor: root.cursorActive && index === root.tab
                bordered: true
                foreground: root.foreground
                fontFamily: root.fontFamily
                fontSize: Style.font.bodySmall
                verticalPadding: Style.spacing.controlPaddingY
                onClicked: {
                  root.cursorActive = true
                  root.selectTab(index)
                }
              }
            }
          }

          // ---------- Error ----------
          BorderSurface {
            visible: root.error !== ""
            width: parent.width
            implicitHeight: errorText.implicitHeight + Style.spacing.xl * 2
            color: root.alpha(root.urgent, 0.10)
            borderSpec: Border.flat(root.alpha(root.urgent, 0.35), 1)
            radius: Style.cornerRadius

            Text {
              id: errorText
              textFormat: Text.PlainText
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.leftMargin: Style.space(12)
              anchors.rightMargin: Style.space(12)
              text: "omp usage failed: " + root.error
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              wrapMode: Text.WordWrap
            }
          }

          Text {
            visible: !!root.model && root.providers.length === 0
            width: parent.width
            topPadding: Style.space(24)
            text: "omp has no provider usage to report.\nSign in with `omp` first."
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
          }

          // ---------- Overview: fullest window per account ----------
          Repeater {
            model: root.tab === 0 ? root.providers : []

            Column {
              id: overviewSection
              required property var modelData
              required property int index
              width: column.width
              spacing: Style.space(10)

              PanelSeparator { foreground: root.foreground }

              Item {
                width: parent.width
                implicitHeight: sectionHeader.implicitHeight

                PanelSectionHeader {
                  id: sectionHeader
                  anchors.left: parent.left
                  text: overviewSection.modelData.name.toUpperCase()
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                }

                Text {
                  anchors.right: parent.right
                  anchors.verticalCenter: sectionHeader.verticalCenter
                  textFormat: Text.PlainText
                  text: "details ›"
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption

                  MouseArea {
                    anchors.fill: parent
                    anchors.margins: -Style.space(4)
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.selectTab(overviewSection.index + 1)
                  }
                }
              }

              Repeater {
                model: overviewSection.modelData.accounts

                LimitRow {
                  required property var modelData
                  width: overviewSection.width
                  visible: !!modelData.peak
                  limit: modelData.peak
                  label: root.accountLabel(modelData, true)
                  sublabel: modelData.peak ? modelData.peak.title : ""
                }
              }
            }
          }

          // ---------- Provider: every account, every window ----------
          Repeater {
            model: root.provider ? root.provider.accounts : []

            Column {
              id: accountSection
              required property var modelData
              width: column.width
              spacing: Style.space(10)

              PanelSeparator { foreground: root.foreground }

              // Account header: email, plan pill, org.
              Item {
                width: parent.width
                implicitHeight: Math.max(accountName.implicitHeight, planPill.implicitHeight)

                Text {
                  id: accountName
                  textFormat: Text.PlainText
                  anchors.left: parent.left
                  anchors.right: planPill.visible ? planPill.left : parent.right
                  anchors.rightMargin: Style.spacing.sm
                  anchors.verticalCenter: parent.verticalCenter
                  text: root.accountLabel(accountSection.modelData, false)
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  font.bold: true
                  elide: Text.ElideMiddle
                }

                Rectangle {
                  id: planPill
                  visible: accountSection.modelData.plan !== ""
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  implicitWidth: planText.implicitWidth + Style.space(12)
                  implicitHeight: planText.implicitHeight + Style.space(4)
                  radius: height / 2
                  color: root.track

                  Text {
                    id: planText
                    anchors.centerIn: parent
                    textFormat: Text.PlainText
                    text: root.capitalize(accountSection.modelData.plan)
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                  }
                }
              }

              Text {
                visible: text !== ""
                width: parent.width
                textFormat: Text.PlainText
                text: {
                  var a = accountSection.modelData
                  var parts = []
                  if (a.org !== "" && a.org.indexOf(a.email) < 0) parts.push(a.org)
                  if (a.resetCredits > 0) parts.push(a.resetCredits + " reset credit" + (a.resetCredits > 1 ? "s" : "") + " available")
                  if (a.limitReached) parts.push("limit reached")
                  return parts.join(" · ")
                }
                color: accountSection.modelData.limitReached ? root.urgent : root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
                topPadding: -Style.space(6)
              }

              Repeater {
                model: accountSection.modelData.limits

                LimitRow {
                  required property var modelData
                  width: accountSection.width
                  limit: modelData
                  label: modelData.title
                  sublabel: modelData.detail
                }
              }

              Repeater {
                model: accountSection.modelData.balances

                Item {
                  required property var modelData
                  width: accountSection.width
                  implicitHeight: Math.max(balanceLabel.implicitHeight, balanceValue.implicitHeight)

                  Text {
                    id: balanceLabel
                    textFormat: Text.PlainText
                    anchors.left: parent.left
                    anchors.verticalCenter: parent.verticalCenter
                    text: modelData.title
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                  }

                  Text {
                    id: balanceValue
                    textFormat: Text.PlainText
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    text: modelData.text
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                  }
                }
              }
            }
          }

          Text {
            textFormat: Text.PlainText
            visible: text !== ""
            width: parent.width
            topPadding: Style.space(2)
            text: root.footerText()
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
          }
        }
      }
    }
  }

  // Label + percentage, meter, then the window detail and reset countdown.
  component LimitRow: Column {
    id: limitRow
    property var limit: null
    property string label: ""
    property string sublabel: ""

    readonly property real percent: limit ? limit.percent : -1

    spacing: Style.space(5)

    Item {
      width: parent.width
      implicitHeight: Math.max(limitLabel.implicitHeight, limitValue.implicitHeight)

      Text {
        id: limitLabel
        textFormat: Text.PlainText
        text: limitRow.label
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        elide: Text.ElideRight
        anchors.left: parent.left
        anchors.right: limitValue.left
        anchors.rightMargin: Style.spacing.sm
        anchors.verticalCenter: parent.verticalCenter
      }

      Text {
        id: limitValue
        textFormat: Text.PlainText
        text: limitRow.percent >= 0 ? root.pct(limitRow.percent) : "—"
        color: root.levelColor(limitRow.percent)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: limitRow.percent >= 0.7
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
      }
    }

    Meter {
      width: parent.width
      value: limitRow.percent
    }

    Item {
      width: parent.width
      implicitHeight: Math.max(subText.implicitHeight, resetLabel.implicitHeight)
      visible: subText.text !== "" || resetLabel.text !== ""

      Text {
        id: subText
        textFormat: Text.PlainText
        anchors.left: parent.left
        anchors.right: resetLabel.left
        anchors.rightMargin: Style.spacing.sm
        text: limitRow.sublabel
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
      }

      Text {
        id: resetLabel
        textFormat: Text.PlainText
        anchors.right: parent.right
        text: root.resetText(limitRow.limit)
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }
  }

  // Rounded track; the fill warms to accent at 70% and urgent at 90%.
  component Meter: Item {
    id: meter
    property real value: -1
    property real thickness: Math.max(Style.space(4), Math.round(Style.spacing.controlHeight * 0.14))

    implicitHeight: thickness

    Rectangle {
      id: meterTrack
      anchors.fill: parent
      radius: height / 2
      color: root.track
    }

    Rectangle {
      anchors.left: meterTrack.left
      anchors.verticalCenter: meterTrack.verticalCenter
      height: meterTrack.height
      radius: meterTrack.radius
      width: Math.max(meter.value > 0 ? height : 0, meterTrack.width * root.clamp(meter.value, 0, 1))
      color: root.levelColor(meter.value)

      Behavior on width {
        NumberAnimation { duration: 160; easing.type: Easing.OutCubic }
      }
    }
  }
}
