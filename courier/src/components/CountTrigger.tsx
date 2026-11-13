import { TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface CountTriggerProps {
  value: string;
  label: string;
  count?: number;
}

export function CountTrigger({ value, label, count }: CountTriggerProps) {
  return (
    <TabsTrigger value={value}>
      {label}
      {count ? (
        <Badge className="h-5 px-1.5 [[data-state=active]_&]:border-primary/20 [[data-state=active]_&]:bg-primary-soft [[data-state=active]_&]:text-primary-ink">
          {count}
        </Badge>
      ) : null}
    </TabsTrigger>
  );
}
