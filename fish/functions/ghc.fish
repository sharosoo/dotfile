# Clone GitHub repo to ~/workspaces/org/repo structure
function ghc --description "Clone git repo to organized workspace"
    set -l url $argv[1]
    set -l repo ""
    set -l org ""

    if string match -q "https://github.com/*" $url
        set repo (string replace -r '.*/' '' $url)
        set repo (string replace '.git' '' $repo)
        set org (string replace -r '/[^/]*$' '' $url)
        set org (string replace -r '.*/' '' $org)
    else if string match -q "git@github.com:*" $url
        set -l orgrepo (string replace 'git@github.com:' '' $url)
        set org (string split '/' $orgrepo)[1]
        set repo (string split '/' $orgrepo)[2]
        set repo (string replace '.git' '' $repo)
    else
        echo "Invalid git URL."
        return 1
    end

    set -l dir ~/workspaces/$org/$repo
    mkdir -p $dir
    git clone $url $dir
    echo "Cloned to $dir"
end
