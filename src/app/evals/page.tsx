import type { Metadata } from "next";
import { EvalRunner } from "@/components/EvalRunner";

export const metadata: Metadata = { title: "Evals" };

export default function EvalsPage() {
  return <EvalRunner />;
}
