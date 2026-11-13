import { Layers, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { Field } from "@/components/Field";
import { IconAction } from "@/components/IconAction";
import { KeyValueTable } from "@/components/KeyValueTable";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCourier } from "@/store";
import { type Environment, newEnvironment } from "@/types";

interface EnvironmentsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EnvironmentsSheet({ open, onOpenChange }: EnvironmentsSheetProps) {
  const { environments, setEnvironments, setActiveEnvironmentId } = useCourier();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const editing = environments.find((environment) => environment.id === editingId) ?? environments[0];

  const patch = (change: Partial<Environment>) =>
    setEnvironments(environments.map((environment) => (environment.id === editing?.id ? { ...environment, ...change } : environment)));

  const add = () => {
    const created = newEnvironment();
    setEnvironments([...environments, created]);
    setEditingId(created.id);
    setActiveEnvironmentId(created.id);
  };

  const remove = () => {
    if (!editing) return;
    setEnvironments(environments.filter((environment) => environment.id !== editing.id));
    setEditingId(null);
    setConfirmingDelete(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(600px,100vw)] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>Environments</SheetTitle>
          <SheetDescription>
            Variables here override collection variables in {"{{name}}"} placeholders.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 border-b border-border p-3">
          <div className="flex flex-wrap gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              aria-label="Environments"
              value={editing?.id ?? ""}
              onValueChange={(id) => id && setEditingId(id)}
              className="flex-wrap justify-start"
            >
              {environments.map((environment) => (
                <ToggleGroupItem key={environment.id} value={environment.id}>
                  {environment.name || "Untitled"}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button variant="outline" size="sm" onClick={add}>
              <Plus aria-hidden="true" />
              New
            </Button>
          </div>
          {editing && (
            <div className="flex items-end gap-2">
              <Field label="Name" error={editing.name.trim() ? undefined : "Name is required."} className="flex-1">
                {(control) => <Input {...control} value={editing.name} onChange={(event) => patch({ name: event.target.value })} />}
              </Field>
              <IconAction icon={Trash2} label="Delete environment" onClick={() => setConfirmingDelete(true)} />
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {editing ? (
            <KeyValueTable items={editing.variables} onChange={(variables) => patch({ variables })} keyLabel="Variable" />
          ) : (
            <Empty className="items-center text-center">
              <EmptyMedia>
                <Layers />
              </EmptyMedia>
              <EmptyHeader className="items-center">
                <EmptyTitle>No environments</EmptyTitle>
                <EmptyDescription>Create one to use {"{{variables}}"} in requests.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </SheetContent>
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete environment</AlertDialogTitle>
            <AlertDialogDescription>Delete "{editing?.name}"? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
