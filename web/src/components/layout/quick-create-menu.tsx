import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  CalendarDays,
  Users,
  Package,
  Megaphone,
  Shield,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useGatherHub } from "@/lib/gatherhub";
import type { Role } from "@/lib/roles";
import type { Capability } from "@/lib/capabilities";

type IconType = React.ComponentType<{ className?: string }>;

interface QuickItem {
  label: string;
  icon: IconType;
  to: string;
  minRole?: Role;
  capability?: Capability;
  shortcut?: string;
}

const ITEMS: QuickItem[] = [
  {
    label: "New event",
    icon: CalendarDays,
    to: "/events",
    capability: "events.write",
  },
  {
    label: "New member",
    icon: Users,
    to: "/members",
    capability: "members.write",
  },
  {
    label: "New team",
    icon: Shield,
    to: "/teams",
    capability: "teams.write",
  },
  {
    label: "Add asset",
    icon: Package,
    to: "/assets",
    capability: "assets.admin",
  },
  {
    label: "New announcement",
    icon: Megaphone,
    to: "/announcements",
    capability: "announcements.write",
  },
];

export function QuickCreateMenu() {
  const { can, hasCapability } = useGatherHub();
  const navigate = useNavigate();
  const visible = ITEMS.filter(
    (i) =>
      (!i.minRole || can(i.minRole)) &&
      (!i.capability || hasCapability(i.capability)),
  );

  if (visible.length === 0) return null;

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New
          <ChevronDown className="h-3.5 w-3.5 opacity-80" />
        </Button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={6}
          className={cn(
            "z-50 min-w-[220px] overflow-hidden",
            "rounded-md border border-hairline bg-popover text-popover-foreground",
            "shadow-popover",
            "data-[state=open]:animate-overlay-in",
            "p-1",
          )}
        >
          {visible.map((item) => (
            <DropdownMenuPrimitive.Item
              key={item.label}
              onSelect={() => navigate(item.to)}
              className={cn(
                "flex items-center gap-2.5 rounded-xs px-2 py-1.5 outline-none cursor-pointer",
                "text-body text-ink",
                "data-[highlighted]:bg-surface-sunk data-[highlighted]:text-ink-strong",
              )}
            >
              <item.icon
                className="h-4 w-4 text-ink-soft shrink-0"
                aria-hidden="true"
              />
              <span className="flex-1 truncate font-semi">{item.label}</span>
              {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
