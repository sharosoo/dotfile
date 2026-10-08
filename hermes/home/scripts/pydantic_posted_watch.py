#!/usr/bin/env python3
"""Read-only GitHub snapshot for a change-gated Hermes monitor."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import sys

REPO = 'pydantic/pydantic-ai'
OUT = Path('/home/sharosoo/workspaces/oss_contrib/notes/pydantic-ai-watch-latest.json')

def gh(args):
    result = subprocess.run(['gh', *args], capture_output=True, text=True, timeout=45)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f'gh failed: {args}')
    return json.loads(result.stdout)

def issue(number):
    return gh(['issue', 'view', str(number), '-R', REPO, '--json',
               'number,title,state,author,assignees,labels,comments,url'])

def pull():
    data = gh(['pr', 'view', '9965', '-R', REPO, '--json',
               'number,title,state,isDraft,author,assignees,labels,comments,reviews,reviewDecision,statusCheckRollup,files,headRefOid,headRefName,mergedAt,url'])
    data['statusCheckRollup'] = sorted([
        {key: check.get(key) for key in ('name', 'status', 'conclusion', 'state', 'context', 'detailsUrl', 'targetUrl') if key in check}
        for check in data['statusCheckRollup']
    ], key=lambda item: json.dumps(item, sort_keys=True))
    data['inline_review_comments'] = gh(['api', '--paginate', '--slurp',
                                        f'repos/{REPO}/pulls/9965/comments?per_page=100'])
    return data

def main():
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(issue, n) for n in (9962, 9963, 9964)]
            pr = pool.submit(pull)
            snapshot = {'repo': REPO, 'issues': [f.result() for f in futures], 'pr': pr.result()}
        for item in snapshot['issues'] + [snapshot['pr']]:
            item['labels'] = sorted(item['labels'], key=lambda value: value['name'])
            item['assignees'] = sorted(item['assignees'], key=lambda value: value['login'])
        text = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, indent=2) + '\n'
        OUT.parent.mkdir(parents=True, exist_ok=True)
        tmp = OUT.with_suffix('.json.tmp')
        tmp.write_text(text)
        os.replace(tmp, OUT)
        sys.stdout.write(text)
    except Exception as exc:
        print(f'GitHub watch fetch failed; last complete snapshot retained: {exc}', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
