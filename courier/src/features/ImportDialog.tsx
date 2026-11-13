import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { commands } from "@/commands";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { attempt } from "@/notify";
import { useCourier } from "@/store";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const { importRequest } = useCourier();
  const [curl, setCurl] = useState("");
  const [invalid, setInvalid] = useState(false);

  const close = (next: boolean) => {
    if (!next) {
      setCurl("");
      setInvalid(false);
    }
    onOpenChange(next);
  };

  const importCurl = async () => {
    const request = await attempt(() => commands.parseCurl(curl), undefined, "Could not read the cURL command");
    if (request === undefined) return;
    setInvalid(request === null);
    if (!request) return;
    importRequest(request);
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import cURL</DialogTitle>
          <DialogDescription>Paste a command from your terminal, docs or browser dev tools.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Textarea
            aria-label="cURL command"
            spellCheck={false}
            className="min-h-36 font-mono text-sm"
            placeholder="curl https://api.example.com -H 'Accept: application/json'"
            value={curl}
            onChange={(event) => setCurl(event.target.value)}
          />
          {invalid && (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>That is not a valid cURL command.</span>
            </Alert>
          )}
        </DialogBody>
        <DialogFooter>
          <Button disabled={curl.trim() === ""} onClick={importCurl}>
            Import request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
