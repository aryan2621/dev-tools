import { type FormEvent, useState } from "react";
import { Field } from "@/components/Field";
import { KeyValueTable } from "@/components/KeyValueTable";
import { OptionSelect } from "@/components/OptionSelect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type NodeKind, useCourier } from "@/store";
import type { Collection } from "@/types";

export interface Target {
  kind: NodeKind;
  id: string;
  name: string;
}

export type SidebarAction =
  | { type: "rename"; target: Target }
  | { type: "delete"; target: Target }
  | { type: "move"; target: Target }
  | { type: "variables"; collectionId: string };

const SEPARATOR = "/";

const destinationOptions = (collections: Collection[]) =>
  collections.flatMap((collection) => [
    { value: collection.id, label: collection.name },
    ...collection.folders.map((folder) => ({
      value: `${collection.id}${SEPARATOR}${folder.id}`,
      label: `${collection.name} / ${folder.name}`,
    })),
  ]);

interface DialogProps<T extends SidebarAction> {
  action: T;
  onClose: () => void;
}

const closeWhenDismissed = (onClose: () => void) => (open: boolean) => {
  if (!open) onClose();
};

function RenameDialog({ action, onClose }: DialogProps<Extract<SidebarAction, { type: "rename" }>>) {
  const { rename } = useCourier();
  const [draft, setDraft] = useState(action.target.name);
  const error = draft.trim() ? undefined : "Name is required.";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (error) return;
    rename(action.target.kind, action.target.id, draft.trim());
    onClose();
  };

  return (
    <Dialog open onOpenChange={closeWhenDismissed(onClose)}>
      <DialogContent aria-describedby={undefined} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody>
            <Field label="Name" error={error}>
              {(control) => <Input {...control} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} />}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={error !== undefined}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ action, onClose }: DialogProps<Extract<SidebarAction, { type: "delete" }>>) {
  const { remove } = useCourier();
  return (
    <AlertDialog open onOpenChange={closeWhenDismissed(onClose)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {action.target.kind}</AlertDialogTitle>
          <AlertDialogDescription>Delete "{action.target.name}"? This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => remove(action.target.kind, action.target.id)}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MoveDialog({ action, onClose }: DialogProps<Extract<SidebarAction, { type: "move" }>>) {
  const { collections, moveRequest } = useCourier();
  const options = destinationOptions(collections);
  const [destination, setDestination] = useState(options[0]?.value ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const [collectionId, folderId] = destination.split(SEPARATOR);
    moveRequest(action.target.id, collectionId, folderId ?? null);
    onClose();
  };

  return (
    <Dialog open onOpenChange={closeWhenDismissed(onClose)}>
      <DialogContent aria-describedby={undefined} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move "{action.target.name}"</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody>
            <Field label="Destination">
              {(control) => <OptionSelect {...control} options={options} value={destination} onValueChange={setDestination} />}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Move</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VariablesDialog({ action, onClose }: DialogProps<Extract<SidebarAction, { type: "variables" }>>) {
  const { collections, setCollectionVariables } = useCourier();
  const collection = collections.find((item) => item.id === action.collectionId);
  if (!collection) return null;
  return (
    <Dialog open onOpenChange={closeWhenDismissed(onClose)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{collection.name} variables</DialogTitle>
          <DialogDescription>Available to every request in this collection. Environment variables take precedence.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto">
          <KeyValueTable
            items={collection.variables}
            onChange={(variables) => setCollectionVariables(collection.id, variables)}
            keyLabel="Variable"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SidebarDialogs({ action, onClose }: { action: SidebarAction | null; onClose: () => void }) {
  if (!action) return null;
  switch (action.type) {
    case "rename":
      return <RenameDialog action={action} onClose={onClose} />;
    case "delete":
      return <DeleteDialog action={action} onClose={onClose} />;
    case "move":
      return <MoveDialog action={action} onClose={onClose} />;
    case "variables":
      return <VariablesDialog action={action} onClose={onClose} />;
  }
}
