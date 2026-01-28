# Python virtualenv auto-activation
# Automatically activate/deactivate .venv when entering/leaving directories

function __auto_venv --on-variable PWD --description "Auto-activate Python venv"
    # Check if we're in a directory with .venv
    if test -f .venv/bin/activate.fish
        # Only activate if not already in this venv
        if test -z "$VIRTUAL_ENV"; or test "$VIRTUAL_ENV" != "$PWD/.venv"
            source .venv/bin/activate.fish
        end
    else
        # Deactivate if we left a venv directory
        if test -n "$VIRTUAL_ENV"
            if type -q deactivate
                deactivate
            end
        end
    end
end

# Run on shell startup
__auto_venv
