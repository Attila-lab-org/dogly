import { Wallet } from "lucide-react";
import PlaceholderPage from "@/components/PlaceholderPage";

export default function CostiPage() {
  return (
    <PlaceholderPage
      icon={Wallet}
      title="Costi"
      description="Qui controllerai quanto spendiamo per l'AI: costo per analisi, andamento nel tempo, budget del mese e avvisi quando qualcosa costa più del previsto."
    />
  );
}
