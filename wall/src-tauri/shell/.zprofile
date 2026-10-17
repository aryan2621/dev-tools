# Wall shell integration: forward to the user's real .zprofile.
_wall_zd="$ZDOTDIR"
ZDOTDIR="${WALL_USER_ZDOTDIR:-$HOME}"
[[ -f "$ZDOTDIR/.zprofile" ]] && source "$ZDOTDIR/.zprofile"
ZDOTDIR="$_wall_zd"
unset _wall_zd
