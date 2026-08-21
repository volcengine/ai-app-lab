import { createDemoDecisionProject } from "@/lib/decision";
import DecisionApp from "./decision-app";

export default function Home() {
  return <DecisionApp initialProject={createDemoDecisionProject()} />;
}
