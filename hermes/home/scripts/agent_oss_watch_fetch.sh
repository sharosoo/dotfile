#!/usr/bin/env bash
# agent-oss watch: 24h PR/issue window across agent-ecosystem repos (including rapidly closed new issues)
# stdout = raw listing injected into the cron agent's prompt (fetcher only — enrichment is the agent's job)
START=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S)
END=$(date -u +%Y-%m-%dT%H:%M:%S)
# Contribution and design candidates across all nine repositories.
REPOS="pydantic/pydantic-ai BerriAI/litellm modelcontextprotocol/python-sdk openai/openai-agents-python google/adk-python langchain-ai/deepagents earendil-works/pi can1357/oh-my-pi NousResearch/hermes-agent"
echo "window(UTC): $START .. $END"
for r in $REPOS; do
  echo ""
  echo "=== $r ==="
  gh api -X GET "search/issues" \
    -f q="repo:$r is:pr is:merged merged:$START..$END" -f per_page=15 -f sort=updated \
    --jq '.items[] | "MERGED #\(.number) @\(.user.login) assoc:\(.author_association) \(.title)"' 2>/dev/null || echo "FETCH_ERROR repo:$r kind:merged"
  sleep 2
  gh api -X GET "search/issues" \
    -f q="repo:$r is:pr is:unmerged closed:$START..$END" -f per_page=10 -f sort=updated \
    --jq '.items[] | "REJECTED #\(.number) @\(.user.login) assoc:\(.author_association) \(.title)"' 2>/dev/null || echo "FETCH_ERROR repo:$r kind:rejected"
  sleep 2
  # Core API avoids the search API's 30/min limit. Page until the oldest
  # creation precedes START (issues endpoint includes PRs as well).
  page=1
  while :; do
    data=$(gh api -X GET "repos/$r/issues" -f state=all -f sort=created -f direction=desc -f per_page=100 -f page="$page" 2>/dev/null) || { echo "FETCH_ERROR repo:$r kind:newissue page:$page"; break; }
    count=$(jq 'length' <<< "$data")
    oldest=$(jq -r '.[-1].created_at // ""' <<< "$data")
    jq -r --arg start "${START}Z" --arg end "${END}Z" --arg page "$page" '
      (map(select((.pull_request == null) and .created_at >= $start and .created_at <= $end))) as $issues |
      "NEWISSUE_PAGE \($page) count:\($issues | length)",
      ($issues[] | "NEWISSUE #\(.number) state:\(.state) assignees:\([.assignees[].login] | join(",")) labels:\([.labels[].name] | join(",")) comments:\(.comments) \(.title) \(.html_url)")' <<< "$data"
    if ((count < 100)) || [[ "$oldest" < "${START}Z" ]]; then break; fi
    if ((page >= 10)); then echo "NEWISSUE_TRUNCATED repo:$r pages:10"; break; fi
    page=$((page + 1))
  done
  sleep 2
done
echo ""
echo "TRACKING-CANDIDATES:"
for pair in \
  "BerriAI/litellm 43494" "BerriAI/litellm 43489" "BerriAI/litellm 43487" \
  "langchain-ai/deepagents 6554" "langchain-ai/deepagents 6522" \
  "pydantic/pydantic-ai 8815" "pydantic/pydantic-ai 7171" "pydantic/pydantic-ai 8621" \
  "modelcontextprotocol/python-sdk 156" "google/adk-python 7322" \
  "earendil-works/pi 9874" "can1357/oh-my-pi 13291" "NousResearch/hermes-agent 125989"; do
  repo=${pair% *}; num=${pair#* }
  state=$(gh api "repos/$repo/issues/$num" --jq '"\(.html_url) [\(.state)] \(.title[:70]) | assignees:\([.assignees[].login] | join(",")) labels:\([.labels[].name] | join(",")) comments:\(.comments)"' 2>/dev/null) || state="FETCH_ERROR repo:$repo issue:$num"
  echo "  $state"
  sleep 2
done
echo "OWN-PR:"
gh api "repos/BerriAI/litellm/pulls/43552" \
  --jq '"\(.html_url) [\(.state)] merged:\(.merged) draft:\(.draft) updated:\(.updated_at) comments:\(.comments) review_comments:\(.review_comments)"' 2>/dev/null || echo "FETCH_ERROR repo:BerriAI/litellm pr:43552"
