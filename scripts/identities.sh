# Sourced by the capture/restore scripts. The repo is public, so personal identifiers
# (account emails, org ids) are listed in a machine-local map and never committed:
#   ${DOTFILE_IDENTITIES:-~/.config/dotfile/identities.local}, one KEY=value per line.
# Capture writes <identity:KEY> in place of each value; restore writes the value back.

identities_map() {
  local f="${DOTFILE_IDENTITIES:-$HOME/.config/dotfile/identities.local}"
  [[ -f $f ]] && grep -E '^[A-Z0-9_]+=.+' "$f" || true
}

# identities_redact DIR... : replace every mapped value in the text files under DIR.
identities_redact() {
  identities_map | python3 -c '
import os, sys
pairs = [l.rstrip("\n").split("=", 1) for l in sys.stdin if "=" in l]
# Longest value first, so an email is replaced whole before a bare handle inside it.
subs = sorted(((v.encode(), f"<identity:{k}>".encode()) for k, v in pairs), key=lambda s: -len(s[0]))
for root in sys.argv[1:]:
    paths = [root] if os.path.isfile(root) else [os.path.join(d, n) for d, _, ns in os.walk(root) for n in ns]
    for p in paths:
        if os.path.islink(p) or not os.path.isfile(p):
            continue
        data = open(p, "rb").read()
        new = data
        for v, ph in subs:
            new = new.replace(v, ph)
        if new != data:
            open(p, "wb").write(new)
' "$@"
}

# identities_restore SRC DST : for each file under SRC holding a placeholder, put the
# mapped values back into the same relative path under DST (DST may be a single file).
identities_restore() {
  identities_map | python3 -c '
import os, re, sys
vals = dict(l.rstrip("\n").split("=", 1) for l in sys.stdin if "=" in l)
src, dst = sys.argv[1:3]
pat = re.compile(rb"<identity:([A-Z0-9_]+)>")
if os.path.isfile(src):
    pairs = [(src, dst)]
else:
    pairs = [(os.path.join(d, n), os.path.join(dst, os.path.relpath(os.path.join(d, n), src)))
             for d, _, ns in os.walk(src) for n in ns]
missing = set()
for s, t in pairs:
    if not os.path.isfile(s) or os.path.islink(t) or not os.path.isfile(t):
        continue
    if b"<identity:" not in open(s, "rb").read():
        continue
    data = open(t, "rb").read()
    def put(m):
        k = m.group(1).decode()
        if k in vals:
            return vals[k].encode()
        missing.add(k)
        return m.group(0)
    new = pat.sub(put, data)
    if new != data:
        open(t, "wb").write(new)
if missing:
    print("identities: add " + ", ".join(sorted(missing)) + " to ~/.config/dotfile/identities.local", file=sys.stderr)
' "$1" "$2"
}
