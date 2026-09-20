import { CheckResponse } from "@/types/check";
import { AlertTriangle, CheckCircle2, XCircle, Info } from "lucide-react";

interface CheckResultProps {
  result: CheckResponse;
}

export function CheckResult({ result }: CheckResultProps) {
  const riskColors = {
    HIGH: "bg-red-50 text-red-800 border-red-200",
    MEDIUM: "bg-orange-50 text-orange-800 border-orange-200",
    LOW: "bg-green-50 text-green-800 border-green-200",
  };

  const riskIcons = {
    HIGH: <XCircle className="w-8 h-8 text-red-600" />,
    MEDIUM: <AlertTriangle className="w-8 h-8 text-orange-600" />,
    LOW: <CheckCircle2 className="w-8 h-8 text-green-600" />,
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Summary Header */}
      <div className={`p-6 rounded-xl border ${riskColors[result.riskLevel]} flex items-start gap-4`}>
        {riskIcons[result.riskLevel]}
        <div>
          <h2 className="text-xl font-bold mb-1">
            {result.riskLevel === "HIGH" ? "PAUSE BEFORE SHARING" : 
             result.riskLevel === "MEDIUM" ? "REVIEW BEFORE SHARING" : 
             "LOOKS GOOD TO GO"}
          </h2>
          <p className="font-medium">{result.summary}</p>
        </div>
      </div>

      {/* Findings List */}
      {result.findings.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Findings</h3>
          <div className="space-y-4">
            {result.findings.map((finding, i) => (
              <div key={i} className="border-l-4 border-slate-200 pl-4 py-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    finding.severity === "HIGH" ? "bg-red-100 text-red-700" :
                    finding.severity === "MEDIUM" ? "bg-orange-100 text-orange-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {finding.severity}
                  </span>
                  <span className="font-semibold text-slate-800">{finding.category}</span>
                </div>
                <p className="text-slate-600 text-sm mb-1">{finding.description}</p>
                {finding.evidence && (
                  <p className="text-xs text-slate-500 font-mono bg-slate-50 p-2 rounded mb-1 break-all">
                    Detected: {finding.evidence}
                  </p>
                )}
                <p className="text-sm text-blue-700 font-medium">Action: {finding.recommendedAction}</p>
              </div>
            ))}
          </div>
        </div>
      )}

           {/* Safer Version (Specific to AI Check) */}
      {result.saferVersion && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-slate-900">✨ SAFER VERSION</h3>
            <button
              onClick={() => {
                navigator.clipboard.writeText(result.saferVersion || "");
                alert("Copied to clipboard!"); // Simple feedback for V1
              }}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
            >
               Copy
            </button>
          </div>
          <p className="text-sm text-slate-500 mb-4">This version removes the sensitive information FixMP identified. It is not guaranteed to be 100% safe.</p>
          <pre className="bg-slate-50 p-4 rounded-lg text-sm text-slate-800 whitespace-pre-wrap font-sans border border-slate-200 overflow-x-auto">
            {result.saferVersion}
          </pre>
        </div>
      )} 

      {/* FixMP Framework */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FrameworkCard icon="🚫" title="DON'T" text={result.dont} color="bg-red-50 border-red-100 text-red-900" />
        <FrameworkCard icon="⚠️" title="CHECK" text={result.check} color="bg-orange-50 border-orange-100 text-orange-900" />
        <FrameworkCard icon="✅" title="DO" text={result.do} color="bg-green-50 border-green-100 text-green-900" />
        <FrameworkCard icon="🔍" title="WHY" text={result.why} color="bg-blue-50 border-blue-100 text-blue-900" />
        <FrameworkCard icon="➡️" title="NEXT" text={result.next} color="bg-purple-50 border-purple-100 text-purple-900" />
      </div>

      {/* Limitations */}
      <div className="flex items-start gap-3 p-4 bg-slate-100 rounded-lg text-sm text-slate-600">
        <Info className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
        <p>{result.limitations}</p>
      </div>
    </div>
  );
}

function FrameworkCard({ icon, title, text, color }: { icon: string, title: string, text: string, color: string }) {
  return (
    <div className={`p-4 rounded-lg border ${color}`}>
      <h4 className="font-bold mb-1 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h4>
      <p className="text-sm">{text}</p>
    </div>
  );
}