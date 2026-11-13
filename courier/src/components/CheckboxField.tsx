import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function CheckboxField({ label, checked, onCheckedChange }: CheckboxFieldProps) {
  const id = useId();
  return (
    <div className="flex min-h-6 items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <Label htmlFor={id} className="text-base font-normal">
        {label}
      </Label>
    </div>
  );
}
