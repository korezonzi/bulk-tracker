import ReactMarkdown from "react-markdown";

// Renders AI-generated markdown (weekly review etc.) with app-consistent styles.
// react-markdown ignores raw HTML by default, so AI output is safe to render.
export function MarkdownView({ text }: { text: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h2 className="text-lg md:text-xl font-bold tracking-tight mb-3">{children}</h2>
        ),
        h2: ({ children }) => (
          <h3 className="text-base md:text-lg font-bold mt-5 mb-2">{children}</h3>
        ),
        h3: ({ children }) => (
          <h4 className="text-sm md:text-base font-semibold mt-4 mb-1.5">{children}</h4>
        ),
        p: ({ children }) => (
          <p className="text-sm md:text-base leading-relaxed mb-2">{children}</p>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 space-y-2 mb-3 text-sm md:text-base leading-relaxed">
            {children}
          </ol>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-5 space-y-1.5 mb-3 text-sm md:text-base leading-relaxed">
            {children}
          </ul>
        ),
        hr: () => <hr className="border-card-hover my-4" />,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
