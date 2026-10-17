import { toast } from 'sonner';

export function copyText(text: string, label = 'Copied') {
  navigator.clipboard.writeText(text).then(
    () => toast(label),
    () => toast.error('Could not copy'),
  );
}
