import { FlaskConical } from "lucide-react";
import { TEST_MODE, AI_ENABLED } from "@/config/flags";

export default function TestModeBanner() {
  if (!TEST_MODE) return null;
  return (
    <div role="status" className="print:hidden bg-stone-900 text-stone-200">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center font-mono text-[11px] tracking-wide">
        <FlaskConical size={13} className="shrink-0 text-amber-400" aria-hidden="true" />
        <span>
          <span className="font-bold text-amber-400">TEST BUILD</span>
          {" "}— free while testing. Nothing you enter is stored.
          {AI_ENABLED
            ? " Checks with AI analysis are processed on our server and by Google Gemini."
            : ""}
        </span>
      </div>
    </div>
  );
}