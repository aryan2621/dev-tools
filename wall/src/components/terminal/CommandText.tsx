import { Fragment } from 'react';
import { isKnownCommand } from '../../lib/shellData';

type Tok = { text: string; cls: string };

/** Light shell syntax tinting: command words, flags, strings, variables and operators. */
export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /(\s+)|("(?:[^"\\]|\\.)*"?|'[^']*'?)|(\$\{?[\w@#?*!-]+\}?)|(\|\||&&|[|;&<>]+)|(#.*$)|([^\s|;&<>"'$#]+|[$#])/gm;
  let expectCmd = true;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const [t, ws, str, variable, op, comment, word] = m;
    if (ws) out.push({ text: t, cls: '' });
    else if (str) out.push({ text: t, cls: 'text-success' });
    else if (variable) out.push({ text: t, cls: 'text-chart-5' });
    else if (op) {
      out.push({ text: t, cls: 'text-brand' });
      expectCmd = true;
    } else if (comment) out.push({ text: t, cls: 'text-muted-foreground italic' });
    else if (word) {
      if (expectCmd && !/=/.test(word)) {
        out.push({ text: t, cls: isKnownCommand(word) || word.includes('/') ? 'text-chart-2 font-medium' : 'text-destructive' });
        expectCmd = word === 'sudo' || word === 'time' || word === 'env' || word === 'nohup';
      } else {
        out.push({ text: t, cls: word.startsWith('-') ? 'text-chart-4' : '' });
      }
    }
  }
  return out;
}

export function CommandText({ text }: { text: string }) {
  return (
    <>
      {tokenize(text).map((t, i) =>
        t.cls ? (
          <span key={i} className={t.cls}>
            {t.text}
          </span>
        ) : (
          <Fragment key={i}>{t.text}</Fragment>
        ),
      )}
    </>
  );
}
