import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SowData } from "@/lib/types";

export function SowCard({
  sowData,
  description,
}: {
  sowData: SowData;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scope of Work</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="text-xs font-semibold text-green-500 mb-3">IN SCOPE</p>
          <ul className="text-sm text-foreground list-disc pl-5 space-y-2">
            {sowData.inScope.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-red-500 mb-3">OUT OF SCOPE</p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-2">
            {sowData.outOfScope.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total Price</span>
          <span className="text-lg font-bold">${sowData.totalPrice}</span>
        </div>
      </CardContent>
    </Card>
  );
}
