---
name: turing-network
description: "Use for the Turing office network: OPNsense router (192.168.0.1), WAN/WAN2 egress, Mac mini WAN2 pinning, HAProxy/coolify (tcms-api-prod), port forwards, DHCP static maps, Unbound DNS, WireGuard, config backups, firmware upgrades, \"machine not visible on LAN\"."
---

# Turing office network (OPNsense)

Host inventory, public addresses, port-forward list and per-host notes live in
`~/.omp/agent/managed-skills/turing-network/network.local.md` (machine-local; the dotfile repo is
public and `*.local.*` is never captured). Read it before acting. Never copy its contents into
this file, commits, PRs or public artifacts.

## Access

- `ssh root@192.168.0.1` (key auth). Root shell is **csh**: wrap scripts as `ssh root@192.168.0.1 sh -s <<'EOF' … EOF` or `sh -c '…'` (csh rejects `$(…)`, `2>&1 |` quoting, `for` loops).
- Web GUI `https://192.168.0.1:4443`. API with a session cookie: log in by POSTing the login form (hidden CSRF field + `usernamefld`/`passwordfld`), then send `X-CSRFToken` taken from any `/ui/...` page. Password only from a `chmod 600` file read with `--data-urlencode passwordfld@file`; delete the file afterwards.
- **Never `grep` `/conf/config.xml` broadly**: it holds TLS private keys and printed one once. Extract fields with `php -r '$c=simplexml_load_file("/conf/config.xml"); echo $c->…;'`. When diffing configs locally, redact any tag matching key/secret/passw/prv/crt/authorizedkeys first, and `shred` copies when done.

## Topology invariants (user rules — do not break)

- LAN `ix0` 192.168.0.0/24. WAN `ix1` and WAN2 `re0` (RTL8125, `os-realtek-re` plugin) both get DHCP addresses in the **same ISP /27**, same gateway.
- **Mac mini (static 192.168.0.65) egresses ONLY via WAN2.** Everything else, the router itself included, egresses ONLY via WAN. A WAN2 leak from anything else, or the Mac leaving via WAN, is a severity-1 bug for the user. No fallback: WAN2 down → Mac offline.
  - LAN rules at the top, in order: `Mac mini: internet only via WAN2` (route-to WAN2_DHCP), `Mac mini: never via WAN (WAN2 down)` (block), `LAN: internet only via WAN (not WAN2)` (route-to WAN_DHCP). `skip_rules_gw_down=1`.
  - Gateways: `WAN_DHCP` default, priority 1, monitor 8.8.8.8; `WAN2_DHCP` priority 255, never default, monitoring off.
  - Router-self traffic: FreeBSD 14 binds the default route to whichever interface owns the /27 first and an interface prefix route cannot be deleted. `/usr/local/sbin/pin-wan1.sh` narrows `re0` to **/26** so `ix1`'s /27 wins, then re-adds the default route. It runs every 10 s from `/usr/local/etc/rc.syshook.d/start/99-pin-wan1` (daemon, pid `/var/run/pin-wan1.pid`); DHCP renewals put re0 back to /27 and the loop fixes it within 10 s.
- **Verify egress after any network change** (all three, every time):
  - router: `ssh root@192.168.0.1 'fetch -qo - -T 5 https://ifconfig.me/ip'` → WAN address
  - LAN: `curl -s https://ifconfig.me/ip` from this box → WAN address
  - Mac: `ssh macmini 'curl -s https://ifconfig.me/ip'` → WAN2 address
  - plus `route -n get default` on the router shows `interface: ix1`.

## Inbound / HAProxy

- WAN 443 → HAProxy (TCP mode, SNI) → `coolify-backend` 192.168.0.140:443. The company API hostnames behind it (listed in the local file) resolve to the WAN address.
- Client `SSLEOFError` / TLS EOF on these hosts = HAProxy accepted but the backend is unreachable. Check the backend first: `nc -z -w3 192.168.0.140 443` from the router, `arp -an | grep 192.168.0.140`, `zgrep <mac> /var/log/dhcpd/*` for when it last appeared.
- Test from the outside, not from the LAN or the Mac mini: LAN→WAN-IP has no NAT reflection and the Mac's WAN2 path hairpins into the router's own /27. Use `check-host.net` (`/check-http?host=…`, then `/check-result/<id>`); a 405 on a POST-only endpoint means it is up.
- HAProxy log: `/var/log/haproxy/latest.log`.

## Port forwards

- Many WAN forwards exist (SSH to workstations, Redis, coolify, …); list in the local file. The user decided (2026-11-07) to **leave them as they are** — do not close or change any without an explicit request.
- 15 forwards (AI streamlit 20238-20250, ai-workstation 8123/25565, minecraft 25566) and the WAN→self SSH rule were disabled by a teammate on 2026-11-02 by editing config.xml directly. Intentional; leave them disabled.

## Config backups

- `os-git-backup` pushes `/conf/config.xml` to the company's private router-config repo (name in the local file) daily at 01:00 UTC from `/conf/backup/git` (only when something changed, so an old last commit is normal). Dry-run: `cd /conf/backup/git && GIT_SSH_COMMAND="ssh -i /conf/backup/git/identity" git push --dry-run origin master`.
- Local history: `/conf/backup/config-<epoch>.xml` (revision time/user/description inside). Compare against the git copy to find out-of-band edits (no revision entry = edited by hand over SSH; cross-check `/var/log/audit/` and `sshd` "Accepted" lines in `/var/log/system/`).

## Firmware upgrades

- One major at a time, each brought to its latest minor first (old minors fail the next set's signature check). Run `opnsense-update -sd` before each step: majors reset the mirror to a dead one.
- `os-realtek-re` must stay in `system.firmware.plugins` or a major upgrade drops the driver (WAN2 dies). Register: `php /usr/local/opnsense/scripts/firmware/register.php install os-realtek-re`.
- After package updates sshd can come back accepting TCP but closing before the banner (`kex_exchange_identification: Connection closed`). Fix: GUI API `POST /api/core/service/restart/openssh`.
- After every step: version, interfaces up, egress check above, `pluginctl -s haproxy status`, WireGuard `wg1`, `kldstat | grep if_re`, DNS (`drill github.com @127.0.0.1`, an internal override).
- Expect a few minutes of office-wide outage per reboot; the active herdr omp sessions survive (verified 2026-11-07).
- Upgraded 23.1 → 26.1.11 on 2026-11-07. 26.1 split ISC DHCP into `os-isc-dhcp` (installed automatically).

## Other services on the router

- DHCP: ISC (`/var/dhcpd/var/db/dhcpd.leases`, log `/var/log/dhcpd/`). Static maps in `dhcpd.lan.staticmap`.
- Unbound: host overrides and domain forwards (`unboundplus.hosts`, `unboundplus.dots`).
- WireGuard `wg1`, ACME client (certs renewed by cron), git-backup.
- SSH still allows password and root login; key auth works, so disabling password auth is safe when the user asks.
