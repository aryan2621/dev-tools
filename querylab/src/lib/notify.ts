import { toast } from "sonner";

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function attempt<T>(task: () => Promise<T>, success?: string, failure = "Something went wrong"): Promise<T | undefined> {
  try {
    const result = await task();
    if (success) toast.success(success);
    return result;
  } catch (error) {
    toast.error(failure, { description: messageOf(error) });
    return undefined;
  }
}

export const copyWithToast = (text: string, label = "Copied to clipboard") =>
  attempt(() => navigator.clipboard.writeText(text), label, "Copy failed");
