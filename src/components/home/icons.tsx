import {
  CalendarDays,
  Camera,
  Car,
  Coffee,
  HeartHandshake,
  Landmark,
  Map,
  Mountain,
  ShieldCheck,
  Star,
  Sun,
  UserRound,
  Users,
  UsersRound,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { IconKey } from "@/lib/home-content";

/** Icons the admin can choose for home page cards. */
export const HOME_ICONS: Record<IconKey, LucideIcon> = {
  user: UserRound,
  users: Users,
  group: UsersRound,
  heart: HeartHandshake,
  shield: ShieldCheck,
  car: Car,
  map: Map,
  mountain: Mountain,
  coffee: Coffee,
  waves: Waves,
  landmark: Landmark,
  sun: Sun,
  calendar: CalendarDays,
  star: Star,
  camera: Camera,
  utensils: UtensilsCrossed,
};

export function HomeIcon({ name, className }: { name: IconKey; className?: string }) {
  const Icon = HOME_ICONS[name] ?? Star;
  return <Icon className={className} aria-hidden="true" />;
}
