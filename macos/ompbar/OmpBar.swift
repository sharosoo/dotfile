// OmpBar — macOS menu bar counterpart of the Omarchy bar widgets
// sharosoo.omp-usage (AI usage per provider/account, with on/off switches) and
// sharosoo.sysstat (CPU / memory).
//
// Usage comes from `omp usage --json`. Credential switches run the Omarchy
// plugin's bin/omp-accounts: over ssh on the broker host when
// OMP_AUTH_BROKER_URL is set (credentials live there), locally otherwise.
import AppKit
import Darwin
import SwiftUI

// MARK: - Environment

enum Env {
    static let home = FileManager.default.homeDirectoryForCurrentUser.path
    static let accountsScript = "~/.config/omarchy/plugins/sharosoo.omp-usage/bin/omp-accounts"

    /// Login-shell-like environment: SwiftBar/launchd start apps with a bare PATH
    /// and fish's ~/.env.local is not sourced.
    static let process: [String: String] = {
        var env = ProcessInfo.processInfo.environment
        let path = ["\(home)/.bun/bin", "\(home)/.local/share/mise/shims", "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
        env["PATH"] = path.joined(separator: ":")
        if let text = try? String(contentsOfFile: "\(home)/.env.local", encoding: .utf8) {
            for raw in text.split(separator: "\n") {
                var line = raw.trimmingCharacters(in: .whitespaces)
                if line.hasPrefix("#") { continue }
                if line.hasPrefix("export ") { line.removeFirst(7) }
                guard let eq = line.firstIndex(of: "=") else { continue }
                let key = String(line[..<eq]).trimmingCharacters(in: .whitespaces)
                let value = String(line[line.index(after: eq)...]).trimmingCharacters(in: CharacterSet(charactersIn: " '\""))
                if env[key] == nil { env[key] = value }
            }
        }
        return env
    }()

    static var brokerHost: String? {
        guard let raw = process["OMP_AUTH_BROKER_URL"], let host = URL(string: raw)?.host, !host.isEmpty else { return nil }
        return host
    }

    static var omp: String {
        for p in ["\(home)/.bun/bin/omp", "\(home)/.local/share/mise/shims/omp", "/opt/homebrew/bin/omp"] where FileManager.default.isExecutableFile(atPath: p) {
            return p
        }
        return "omp"
    }
}

struct RunResult { let status: Int32; let out: Data; let err: String }

func run(_ argv: [String], timeout: TimeInterval = 60) async -> RunResult {
    await withCheckedContinuation { cont in
        DispatchQueue.global().async {
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            p.arguments = argv
            p.environment = Env.process
            let out = Pipe(), err = Pipe()
            p.standardOutput = out
            p.standardError = err
            do { try p.run() } catch {
                cont.resume(returning: RunResult(status: -1, out: Data(), err: error.localizedDescription)); return
            }
            let timer = DispatchWorkItem { if p.isRunning { p.terminate() } }
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout, execute: timer)
            let o = out.fileHandleForReading.readDataToEndOfFile()
            let e = err.fileHandleForReading.readDataToEndOfFile()
            p.waitUntilExit()
            timer.cancel()
            cont.resume(returning: RunResult(status: p.terminationStatus, out: o, err: String(decoding: e, as: UTF8.self)))
        }
    }
}

/// omp-accounts, remotely on the broker host or locally.
func accountsCommand(_ args: [String]) -> [String] {
    if let host = Env.brokerHost {
        return ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host, ([Env.accountsScript] + args).joined(separator: " ")]
    }
    return [Env.accountsScript.replacingOccurrences(of: "~", with: Env.home)] + args
}

// MARK: - Usage model (port of Model.js)

let providerNames = [
    "anthropic": "Claude", "openai-codex": "Codex", "google-antigravity": "Antigravity",
    "google-gemini-cli": "Gemini CLI", "xai-oauth": "Grok", "github-copilot": "Copilot",
    "commandcode": "Command Code", "zai": "Z.ai", "kimi": "Kimi", "devin": "Devin",
]
let providerOrder = ["anthropic", "openai-codex", "google-antigravity", "google-gemini-cli", "xai-oauth", "github-copilot", "commandcode"]

func providerName(_ id: String) -> String {
    providerNames[id] ?? id.replacingOccurrences(of: "-", with: " ").replacingOccurrences(of: "_", with: " ").capitalized
}

struct Limit: Identifiable {
    let id = UUID()
    let title: String
    let fraction: Double
    let resetsAt: Double
    let durationMs: Double
    let detail: String
    let exhausted: Bool
}

struct Credential { let id: Int; let enabled: Bool; let userDisabled: Bool }

final class Account: Identifiable {
    let id: String
    let label: String
    let rawEmail: String
    let rawAccountId: String
    var plan: String
    var limitReached: Bool
    var limits: [Limit] = []
    var balances: [(String, String)] = []
    var credentials: [Credential] = []
    var seen = Set<String>()

    init(id: String, label: String, email: String, accountId: String, plan: String, limitReached: Bool) {
        self.id = id; self.label = label; rawEmail = email; rawAccountId = accountId; self.plan = plan; self.limitReached = limitReached
    }

    var enabled: Bool { credentials.isEmpty || credentials.contains { $0.enabled } }
    var switchable: Bool { !credentials.isEmpty && credentials.allSatisfy { $0.enabled || $0.userDisabled } }
    var peak: Limit? { limits.max { $0.fraction < $1.fraction } }
    var shortLabel: String { label.split(separator: "@").first.map(String.init) ?? label }
}

final class Provider: Identifiable {
    let id: String
    let name: String
    var accounts: [Account] = []
    var keyed: [String: Account] = [:]
    init(id: String) { self.id = id; name = providerName(id) }
    var peak: Limit? { accounts.compactMap(\.peak).max { $0.fraction < $1.fraction } }
}

func fmtAmount(_ v: Any?, unit: String? = nil) -> String {
    guard let n = (v as? NSNumber)?.doubleValue else { return "" }
    var text = abs(n) >= 100 ? String(Int(n.rounded())) : String(format: "%.2f", n)
    if abs(n) < 100 { while text.hasSuffix("0") { text.removeLast() }; if text.hasSuffix(".") { text.removeLast() } }
    if let unit, unit != "percent" { return text + " " + unit }
    return text
}

func limitTitle(_ l: [String: Any]) -> String {
    let label = (l["label"] as? String ?? "").trimmingCharacters(in: .whitespaces)
    let win = ((l["window"] as? [String: Any])?["label"] as? String ?? "").trimmingCharacters(in: .whitespaces)
    if win.isEmpty || label.lowercased().contains(win.lowercased()) { return label.isEmpty ? "Limit" : label }
    return label.isEmpty ? win : "\(label) · \(win)"
}

func buildProviders(_ data: [String: Any], credentials: [[String: Any]]) -> [Provider] {
    var byId: [String: Provider] = [:]
    var list: [Provider] = []
    func provider(_ pid: String) -> Provider {
        if let p = byId[pid] { return p }
        let p = Provider(id: pid); byId[pid] = p; list.append(p); return p
    }

    for r in data["reports"] as? [[String: Any]] ?? [] {
        let m = r["metadata"] as? [String: Any] ?? [:]
        let prov = provider(r["provider"] as? String ?? "unknown")
        let email = m["email"] as? String ?? "", accountId = m["accountId"] as? String ?? "", projectId = m["projectId"] as? String ?? ""
        let key = [email, accountId, projectId].joined(separator: "|")
        let acct: Account
        if let a = prov.keyed[key] {
            acct = a
            if acct.plan.isEmpty, let plan = m["planType"] as? String { acct.plan = plan }
        } else {
            let label = [email, accountId, projectId].first { !$0.isEmpty } ?? "account"
            acct = Account(id: prov.id + "|" + key, label: label, email: email, accountId: accountId,
                           plan: m["planType"] as? String ?? "", limitReached: m["limitReached"] as? Bool ?? false)
            prov.keyed[key] = acct
            prov.accounts.append(acct)
        }
        for l in r["limits"] as? [[String: Any]] ?? [] {
            let amount = l["amount"] as? [String: Any] ?? [:]
            let scope = l["scope"] as? [String: Any] ?? [:]
            let win = l["window"] as? [String: Any] ?? [:]
            let title = limitTitle(l)
            let dedupe = scope["sharedGroup"] as? String ?? "\(title)|\(win["id"] as? String ?? "")"
            if acct.seen.contains(dedupe) { continue }
            acct.seen.insert(dedupe)
            let unit = amount["unit"] as? String
            guard let used = (amount["usedFraction"] as? NSNumber)?.doubleValue else {
                if amount["remaining"] != nil { acct.balances.append((l["label"] as? String ?? "Balance", fmtAmount(amount["remaining"], unit: unit))) }
                continue
            }
            var detail = ""
            if let unit, unit != "percent", amount["used"] != nil, amount["limit"] != nil {
                detail = fmtAmount(amount["used"]) + " / " + fmtAmount(amount["limit"], unit: unit)
            }
            let status = l["status"] as? String
            acct.limits.append(Limit(title: title, fraction: max(0, used),
                                     resetsAt: (win["resetsAt"] as? NSNumber)?.doubleValue ?? 0,
                                     durationMs: (win["durationMs"] as? NSNumber)?.doubleValue ?? .infinity,
                                     detail: detail, exhausted: status == "exhausted" || status == "blocked"))
        }
    }

    // Hang credential rows under their accounts; accounts a person switched off
    // do not appear in `omp usage`, so they become accounts of their own.
    for c in credentials {
        guard let pid = c["provider"] as? String, !pid.isEmpty, let cid = (c["id"] as? NSNumber)?.intValue else { continue }
        var email = c["email"] as? String ?? ""
        if email.isEmpty, let key = c["identityKey"] as? String, key.hasPrefix("email:") {
            email = String(key.dropFirst(6).split(separator: "|").first ?? "")
        }
        let accountId = c["accountId"] as? String ?? ""
        let userDisabled = (c["userDisabled"] as? NSNumber)?.intValue == 1
        var acct = byId[pid]?.accounts.first { (!email.isEmpty && $0.rawEmail == email) || (!accountId.isEmpty && $0.rawAccountId == accountId) }
        if acct == nil {
            guard userDisabled else { continue }
            let prov = provider(pid)
            let label = !email.isEmpty ? email : (!accountId.isEmpty ? accountId : "credential \(cid)")
            let a = Account(id: "\(pid)|credential|\(cid)", label: label, email: email, accountId: accountId, plan: "", limitReached: false)
            prov.accounts.append(a)
            acct = a
        }
        acct?.credentials.append(Credential(id: cid, enabled: c["disabledCause"] == nil || c["disabledCause"] is NSNull, userDisabled: userDisabled))
    }

    for p in list {
        for a in p.accounts { a.limits.sort { ($0.durationMs, $0.title) < ($1.durationMs, $1.title) } }
    }
    return list.sorted {
        let a = providerOrder.firstIndex(of: $0.id) ?? providerOrder.count
        let b = providerOrder.firstIndex(of: $1.id) ?? providerOrder.count
        return a != b ? a < b : $0.name < $1.name
    }
}

// MARK: - Stores

@MainActor
final class UsageStore: ObservableObject {
    @Published var providers: [Provider] = []
    @Published var error = ""
    @Published var loading = false
    @Published var updatedAt: Date?
    @Published var switching: String?

    private var timer: Timer?

    init() {
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in Task { @MainActor in self?.refresh() } }
    }

    var overall: (provider: String, limit: Limit)? {
        var best: (String, Limit)?
        for p in providers { if let pk = p.peak, best == nil || pk.fraction > best!.1.fraction { best = (p.name, pk) } }
        return best.map { ($0.0, $0.1) }
    }

    func refresh() {
        guard !loading else { return }
        loading = true
        Task {
            async let usage = run([Env.omp, "usage", "--json"])
            async let creds = run(accountsCommand(["list"]), timeout: 20)
            let (u, c) = await (usage, creds)
            loading = false
            guard let data = try? JSONSerialization.jsonObject(with: u.out) as? [String: Any] else {
                error = u.err.split(separator: "\n").last.map(String.init) ?? "Could not parse omp output"
                return
            }
            let credentials = (try? JSONSerialization.jsonObject(with: c.out) as? [[String: Any]]) ?? []
            providers = buildProviders(data, credentials: credentials)
            error = ""
            updatedAt = Date()
        }
    }

    func setEnabled(_ account: Account, _ on: Bool) {
        switching = account.id
        Task {
            let r = await run(accountsCommand([on ? "on" : "off"] + account.credentialIds.map(String.init)), timeout: 20)
            switching = nil
            if r.status != 0 { error = r.err.isEmpty ? "switch failed" : r.err }
            refresh()
        }
    }
}

extension Account { var credentialIds: [Int] { credentials.map(\.id) } }

@MainActor
final class SysStore: ObservableObject {
    @Published var cpu = 0
    @Published var mem = 0
    @Published var memUsedGB = 0.0
    let memTotalGB = Double(ProcessInfo.processInfo.physicalMemory) / 1_073_741_824
    private var prevTicks: (busy: UInt64, total: UInt64)?
    private var timer: Timer?

    init() {
        sample()
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in Task { @MainActor in self?.sample() } }
    }

    func sample() {
        var load = host_cpu_load_info()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info>.stride / MemoryLayout<integer_t>.stride)
        let kr = withUnsafeMutablePointer(to: &load) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count) }
        }
        if kr == KERN_SUCCESS {
            let t = load.cpu_ticks
            let user = UInt64(t.0), sys = UInt64(t.1), idle = UInt64(t.2), nice = UInt64(t.3)
            let busy = user + sys + nice, total = busy + idle
            if let prev = prevTicks, total > prev.total {
                cpu = Int((Double(busy - prev.busy) / Double(total - prev.total) * 100).rounded())
            }
            prevTicks = (busy, total)
        }

        // Activity Monitor's "Memory Used": app memory + wired + compressed.
        var vm = vm_statistics64()
        var vmCount = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.stride / MemoryLayout<integer_t>.stride)
        let vkr = withUnsafeMutablePointer(to: &vm) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(vmCount)) { host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &vmCount) }
        }
        if vkr == KERN_SUCCESS {
            let page = Double(vm_kernel_page_size)
            let pages = Double(vm.internal_page_count) - Double(vm.purgeable_count) + Double(vm.wire_count) + Double(vm.compressor_page_count)
            memUsedGB = pages * page / 1_073_741_824
            mem = Int((memUsedGB / memTotalGB * 100).rounded())
        }
    }
}

// MARK: - Views

func levelColor(_ f: Double) -> Color {
    if f >= 0.9 { return Color(red: 0.94, green: 0.33, blue: 0.31) }
    if f >= 0.7 { return Color(red: 0.98, green: 0.70, blue: 0.20) }
    return Color(red: 0.36, green: 0.62, blue: 0.98)
}

func pct(_ f: Double) -> String { "\(Int((f * 100).rounded()))%" }

func resetText(_ ms: Double) -> String {
    guard ms > 0 else { return "" }
    let left = Int(ms / 1000 - Date().timeIntervalSince1970)
    if left <= 0 { return "resets now" }
    let d = left / 86400, h = left % 86400 / 3600, m = left % 3600 / 60
    if d > 0 { return "resets in \(d)d \(h)h" }
    if h > 0 { return "resets in \(h)h \(m)m" }
    return "resets in \(m)m"
}

struct Meter: View {
    let fraction: Double
    var height: CGFloat = 6
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.10))
                Capsule().fill(levelColor(fraction)).frame(width: max(height, g.size.width * min(fraction, 1)))
            }
        }
        .frame(height: height)
    }
}

struct LimitRow: View {
    let limit: Limit
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(limit.title).font(.system(size: 12))
                Spacer()
                Text(pct(limit.fraction))
                    .font(.system(size: 12, weight: .semibold).monospacedDigit())
                    .foregroundStyle(limit.exhausted || limit.fraction >= 0.9 ? levelColor(1) : .primary)
            }
            Meter(fraction: limit.fraction)
            let extra = [limit.detail, resetText(limit.resetsAt)].filter { !$0.isEmpty }.joined(separator: " · ")
            if !extra.isEmpty { Text(extra).font(.system(size: 10.5)).foregroundStyle(.secondary) }
        }
    }
}

struct AccountCard: View {
    let account: Account
    @ObservedObject var store: UsageStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(account.shortLabel).font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(account.enabled ? .primary : .secondary)
                if !account.plan.isEmpty {
                    Text(account.plan).font(.system(size: 10, weight: .medium))
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(Capsule().fill(Color.primary.opacity(0.08)))
                }
                Spacer()
                if store.switching == account.id {
                    ProgressView().controlSize(.mini)
                } else if account.switchable {
                    Toggle("", isOn: Binding(get: { account.enabled }, set: { store.setEnabled(account, $0) }))
                        .toggleStyle(.switch).controlSize(.mini).labelsHidden()
                }
            }
            if !account.enabled {
                Text("Off · omp does not use this account").font(.system(size: 10.5)).foregroundStyle(.secondary)
            } else {
                ForEach(account.limits) { LimitRow(limit: $0) }
                ForEach(Array(account.balances.enumerated()), id: \.offset) { _, b in
                    HStack { Text(b.0).font(.system(size: 12)); Spacer(); Text(b.1).font(.system(size: 12).monospacedDigit()) }
                }
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.primary.opacity(0.05)))
    }
}

struct UsagePanel: View {
    @ObservedObject var store: UsageStore
    @ObservedObject var sys: SysStore

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("AI usage").font(.system(size: 14, weight: .semibold))
                if let host = Env.brokerHost {
                    Text("via \(host)").font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Spacer()
                if store.loading { ProgressView().controlSize(.small) }
                Button { store.refresh() } label: { Image(systemName: "arrow.clockwise") }
                    .buttonStyle(.borderless).keyboardShortcut("r")
            }
            .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 8)

            if !store.error.isEmpty {
                Text(store.error).font(.system(size: 11)).foregroundStyle(levelColor(1))
                    .padding(.horizontal, 14).padding(.bottom, 6).lineLimit(3)
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(store.providers) { p in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(p.name).font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                                Spacer()
                                if let pk = p.peak { Text(pct(pk.fraction)).font(.system(size: 11).monospacedDigit()).foregroundStyle(.secondary) }
                            }
                            ForEach(p.accounts) { AccountCard(account: $0, store: store) }
                        }
                    }
                    if store.providers.isEmpty && !store.loading {
                        Text("omp has no provider usage to report.").foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 14).padding(.bottom, 10)
            }
            .frame(maxHeight: 560)

            Divider()
            HStack(spacing: 14) {
                Label("CPU \(sys.cpu)%", systemImage: "cpu")
                Label(String(format: "Mem %.1f/%.0f GB", sys.memUsedGB, sys.memTotalGB), systemImage: "memorychip")
                Spacer()
                if let at = store.updatedAt { Text(at, style: .time).foregroundStyle(.secondary) }
            }
            .font(.system(size: 11).monospacedDigit())
            .padding(.horizontal, 14).padding(.vertical, 8)
            HStack {
                Spacer()
                Button("Quit") { NSApp.terminate(nil) }.keyboardShortcut("q")
            }
            .buttonStyle(.borderless).font(.system(size: 11))
            .padding(.horizontal, 14).padding(.bottom, 10)
        }
        .frame(width: 360)
    }
}

/// One menu bar item, like the Omarchy bar: CPU, memory and the highest AI usage.
struct BarLabel: View {
    @ObservedObject var store: UsageStore
    @ObservedObject var sys: SysStore
    var body: some View {
        let ai = store.overall.map { pct($0.limit.fraction) } ?? (store.error.isEmpty ? "…" : "!")
        Text("CPU \(sys.cpu)%  MEM \(sys.mem)%  AI \(ai)").monospacedDigit()
    }
}

/// `OmpBar --dump`: fetch once with the app's environment and print what the panel would show.
func dumpAndExit() async -> Never {
    let u = await run([Env.omp, "usage", "--json"])
    let c = await run(accountsCommand(["list"]), timeout: 20)
    print("omp:", Env.omp, "status:", u.status, "broker:", Env.brokerHost ?? "-", "accounts status:", c.status)
    if !u.err.isEmpty { print("omp stderr:", u.err.suffix(400)) }
    if !c.err.isEmpty { print("accounts stderr:", c.err.suffix(400)) }
    let data = (try? JSONSerialization.jsonObject(with: u.out) as? [String: Any]) ?? [:]
    let creds = (try? JSONSerialization.jsonObject(with: c.out) as? [[String: Any]]) ?? []
    for p in buildProviders(data, credentials: creds) {
        print(p.name, p.peak.map { pct($0.fraction) } ?? "-")
        for a in p.accounts {
            print("  \(a.shortLabel) plan=\(a.plan) enabled=\(a.enabled) switchable=\(a.switchable) creds=\(a.credentialIds)")
            for l in a.limits { print("    \(pct(l.fraction)) \(l.title) \(resetText(l.resetsAt))") }
        }
    }
    exit(0)
}

@main
struct OmpBarMain {
    static func main() async {
        if CommandLine.arguments.contains("--dump") { await dumpAndExit() }
        await MainActor.run { OmpBarApp.main() }
    }
}

struct OmpBarApp: App {
    @StateObject private var usage = UsageStore()
    @StateObject private var sys = SysStore()

    var body: some Scene {
        MenuBarExtra {
            UsagePanel(store: usage, sys: sys)
        } label: {
            BarLabel(store: usage, sys: sys)
        }
        .menuBarExtraStyle(.window)
    }
}
