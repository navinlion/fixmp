import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import Link from "next/link";

interface ToolCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  colorClass: string;
}

export default function ToolCard({ icon: Icon, title, description, href, colorClass }: ToolCardProps) {
  return (
    <Link href={href} className="block h-full">
      <Card className="h-full border-slate-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 group">
        <CardHeader>
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${colorClass} bg-opacity-10 group-hover:bg-opacity-20 transition-colors`}>
            <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-slate-600 text-base leading-relaxed">
            {description}
          </CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
}