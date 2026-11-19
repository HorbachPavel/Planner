import { Dashboard } from "@/components/Dashboard";
import { PlannerGate } from "@/components/PlannerProvider";

export default function Home() {
  return (
    <PlannerGate>
      <Dashboard />
    </PlannerGate>
  );
}
