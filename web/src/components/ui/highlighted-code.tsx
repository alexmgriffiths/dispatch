import { useEffect, useState } from "react"
import { codeToHtml } from "shiki"
import { Check, Copy } from "lucide-react"

interface HighlightedCodeProps {
  code: string
  language: string
  copied: string | null
  onCopy: (text: string, id: string) => void
  id: string
}

export function HighlightedCode({ code, language, copied, onCopy, id }: HighlightedCodeProps) {
  const [html, setHtml] = useState<string>("")

  useEffect(() => {
    codeToHtml(code, {
      lang: language === "typescript" ? "tsx" : language,
      theme: "github-light",
    }).then(setHtml)
  }, [code, language])

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{language}</span>
        <button
          onClick={() => onCopy(code, id)}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
        >
          {copied === id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      {html ? (
        <div
          className="text-xs leading-relaxed overflow-x-auto [&>pre]:p-4 [&>pre]:m-0 [&>pre]:bg-white"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="p-4 text-xs leading-relaxed overflow-x-auto bg-white text-foreground">
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}
