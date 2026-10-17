# Wall shell integration: forward to the user's real .zlogin.
_wall_zd="$ZDOTDIR"
ZDOTDIR="${WALL_USER_ZDOTDIR:-$HOME}"
[[ -f "$ZDOTDIR/.zlogin" ]] && source "$ZDOTDIR/.zlogin"
ZDOTDIR="$_wall_zd"
unset _wall_zd
