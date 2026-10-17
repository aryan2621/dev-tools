import { Badge } from './ui/badge';

export type Risk = 'safe' | 'caution' | 'danger';

const VARIANT = { safe: 'success', caution: 'warning', danger: 'destructive' } as const;

export function RiskBadge({ risk }: { risk: Risk }) {
  return <Badge variant={VARIANT[risk]}>{risk}</Badge>;
}
