# Wall shell integration: source the user's real .zshrc, then install OSC 133 / OSC 7 hooks.
ZDOTDIR="${WALL_USER_ZDOTDIR:-$HOME}"
[[ -f "$ZDOTDIR/.zshrc" ]] && source "$ZDOTDIR/.zshrc"

autoload -Uz add-zsh-hook

__wall_ran=0

# C = command start (carries the command text), D = command finished with exit code,
# A = prompt start. OSC 7 reports the cwd.
__wall_preexec() {
  __wall_ran=1
  printf '\e]133;C;%s\a' "${1//[$'\a\e']/}"
}

__wall_precmd() {
  local code=$?
  if (( __wall_ran )); then
    printf '\e]133;D;%s\a' "$code"
    __wall_ran=0
  fi
  printf '\e]7;file://%s%s\a' "${HOST:-localhost}" "$PWD"
  if [[ -n "$WALL_BLOCKS" ]]; then
    # Wall draws its own prompt. Set it here, last, so themes that rebuild PROMPT in precmd lose.
    PROMPT='' RPROMPT='' PROMPT_EOL_MARK=''
    printf '\e]133;A\a\e]133;B\a'
  else
    printf '\e]133;A\a'
  fi
}

add-zsh-hook preexec __wall_preexec
add-zsh-hook precmd __wall_precmd

if [[ -n "$WALL_BLOCKS" ]]; then
  # Commands arrive from Wall's editor already complete; zle helpers would only flash in between.
  (( $+functions[_zsh_autosuggest_disable] )) && _zsh_autosuggest_disable
  # Keep __wall_precmd last so it can clear the prompt after any theme's own precmd.
  add-zsh-hook -d precmd __wall_precmd
  precmd_functions+=(__wall_precmd)
fi
