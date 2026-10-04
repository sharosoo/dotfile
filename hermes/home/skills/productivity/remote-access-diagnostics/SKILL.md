---
name: remote-access-diagnostics
description: Use when SSH or Tailscale remote access times out.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [ssh, tailscale, networking, troubleshooting]
    related_skills: []
---

# Remote-access diagnostics

## When to Use
Use when remote SSH, Tailscale SSH, or a terminal workspace app cannot connect or suddenly times out. Diagnose the actual failing hop before changing configuration.

## Procedure
1. Identify the actual client, target, transport, authentication mode, and exact error from the connection screen. If an app name could be mistaken for a hostname, inspect local binaries/processes (`command -v`, `pgrep -af`, app `status`) before assuming it is a peer.
2. Check host health separately: `systemctl is-active sshd tailscaled`, `ss -ltn '( sport = :22 )'`, `tailscale status`, and the app's own status command. A running listener establishes only local readiness, not remote reachability.
3. Check the target's Tailscale IP and client peer with `tailscale ping --c 2 <peer>`. Check whether Tailscale SSH is enabled (`tailscale debug prefs`, `RunSSH`) and inspect `journalctl -u tailscaled --since '20 minutes ago'` for connection attempts from the client's Tailscale IP. When `RunSSH` is true, Tailscale SSH handles connections to port 22; ordinary `sshd` logs may not show them. An `ssh-conn ... handling conn` line proves arrival at Tailscale SSH, not authentication success or a usable shell.
4. Inspect firewall policy and logs only after locating the hop. Do not infer a blocked Tailscale connection merely because UFW is active or its persistent `user.rules` lacks port 22: Tailscale may install separate netfilter rules, and saved rules are not the live ruleset. If live rules require root and privilege is unavailable, say so. A local connection to the host's own Tailscale IP is not an end-to-end test from the mobile client.
5. Correlate one fresh client retry with timestamped host logs, then distinguish TCP reachability, SSH handshake, authentication, remote command, and app protocol checks. If the logs show arrival but the client times out, report the narrowed boundary and the next discriminating test; do not label an unverified cause as the fix or restart working services speculatively.

## Reporting
Answer the user's direct question first in concise Korean (반말), then give the observed evidence, the remaining unknown, and one next check. Correct an earlier misdiagnosis plainly when later logs contradict it.