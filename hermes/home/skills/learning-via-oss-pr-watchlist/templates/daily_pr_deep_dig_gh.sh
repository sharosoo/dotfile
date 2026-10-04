#!/usr/bin/env bash
# Daily PR/Issue deep-dig loop using `gh` CLI (inherits user's auth: 5000 req/hr).
# Drop-in replacement for the urllib-based deep-digging that hits 60 req/hr limit.
#
# Usage:
#   ./daily_pr_deep_dig_gh.sh                    # dig all items in PR_LIST
#   PR_LIST="vllm-project/vllm:40449" ./daily_pr_deep_dig_gh.sh  # dig one PR
#
# PR_LIST format: "owner/repo:NUMBER" (one per line in $PR_LIST, or a single item)
# Reads PR_LIST from environment. If empty, digs a default hot set.

set -euo pipefail

# Default hot set — adjust to taste (recent mega-PRs from the LLM-serving ecosystem)
DEFAULT_HOT='
vllm-project/vllm:48674
sgl-project/sglang:31050
ai-dynamo/dynamo:11925
flashinfer-ai/flashinfer:4069
kvcache-ai/Mooncake:2338
LMCache/LMCache:4010
'

LIST="${PR_LIST:-$DEFAULT_HOT}"

echo "============================================="
echo "  Deep-dig loop via gh CLI"
echo "  Rate limit: 5000 req/hr (user auth)"
echo "  Items: $(echo "$LIST" | grep -c .)"
echo "============================================="
echo

for item in $LIST; do
    repo="${item%:*}"
    num="${item#*:}"
    echo "--- [$repo] #$num ---"
    # Single call: title + body + metadata + file list — everything for a deep-dive
    gh pr view "$num" -R "$repo" \
        --json title,body,additions,deletions,changedFiles,files,labels,createdAt,isDraft,author \
        --jq '.' 2>/dev/null || \
    echo "  (PR not found or auth issue)"
    echo
done

# Issues: if you want to dig a specific issue (e.g. Dynamo #11933 memory leak),
# use this shape:
#   ISSUE_LIST="ai-dynamo/dynamo:11933" ./daily_pr_deep_dig_gh.sh
if [ -n "${ISSUE_LIST:-}" ]; then
    echo "============================================="
    echo "  Issues"
    echo "============================================="
    for item in $ISSUE_LIST; do
        repo="${item%:*}"
        num="${item#*:}"
        echo "--- [$repo] #$num (issue) ---"
        gh issue view "$num" -R "$repo" \
            --json title,body,labels,state,createdAt \
            --jq '.' 2>/dev/null || \
        echo "  (Issue not found or auth issue)"
        echo
    done
fi
