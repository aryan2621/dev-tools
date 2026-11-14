import { toast } from "sonner";

export const errorText = (error: unknown) => (typeof error === "string" ? error : error instanceof Error ? error.message : String(error));

export async function attempt<T>(task: () => Promise<T>, success?: string, failure = "Something went wrong"): Promise<T | undefined> {
  try {
    const result = await task();
    if (success) toast.success(success);
    return result;
  } catch (error) {
    toast.error(failure, { description: errorText(error) });
    return undefined;
  }
}

export const copyWithToast = (text: string, label = "Copied to clipboard") =>
  attempt(() => navigator.clipboard.writeText(text), label, "Copy failed");
