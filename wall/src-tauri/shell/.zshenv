# Wall shell integration: forward to the user's real .zshenv.
_wall_zd="$ZDOTDIR"
ZDOTDIR="${WALL_USER_ZDOTDIR:-$HOME}"
[[ -f "$ZDOTDIR/.zshenv" ]] && source "$ZDOTDIR/.zshenv"
ZDOTDIR="$_wall_zd"
unset _wall_zd
