# Navigate to a cloned repo in ~/workspaces using fuzzy search
function ghcd --description "Navigate to workspace repo"
    set -l repo $argv[1]
    set -l dir (find ~/workspaces -mindepth 2 -maxdepth 2 -type d -iname "*$repo*" -print | fzf -1 -0 --header "Select a repository:")
    
    if test -n "$dir"
        cd $dir
    else
        echo "No matching repository found."
    end
end
