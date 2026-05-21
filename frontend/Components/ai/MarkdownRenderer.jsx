import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

/**
 * MarkdownRenderer - Renders markdown content with custom Tailwind styling
 * Used for AI chat responses to display formatted text, lists, tables, and code blocks
 *
 * Note: react-markdown v9+ removed `inline` and `node` props from custom components
 */
export function MarkdownRenderer({ content, className = '' }) {
  if (!content) return null;

  return (
    <div className={`prose prose-slate max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
        // Headings
        h1: (props) => (
          <h1 className="text-xl font-bold mt-4 mb-2 first:mt-0" {...props} />
        ),
        h2: (props) => (
          <h2 className="text-lg font-semibold mt-3 mb-2 first:mt-0" {...props} />
        ),
        h3: (props) => (
          <h3 className="text-base font-semibold mt-2 mb-1 first:mt-0" {...props} />
        ),
        h4: (props) => (
          <h4 className="text-sm font-semibold mt-2 mb-1 first:mt-0" {...props} />
        ),

        // Paragraphs
        p: (props) => (
          <p className="mb-2 last:mb-0 leading-relaxed" {...props} />
        ),

        // Lists
        ul: (props) => (
          <ul className="list-disc ml-4 mb-2 space-y-1" {...props} />
        ),
        ol: (props) => (
          <ol className="list-decimal ml-4 mb-2 space-y-1" {...props} />
        ),
        li: (props) => (
          <li className="leading-relaxed" {...props} />
        ),

        // Text emphasis
        strong: (props) => (
          <strong className="font-semibold text-slate-900" {...props} />
        ),
        em: (props) => (
          <em className="italic" {...props} />
        ),

        // Code blocks are wrapped in <pre><code>
        // Inline code is just <code> without <pre>
        // We style <pre> for code blocks and <code> for inline
        pre: (props) => (
          <pre
            className="bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto my-2 text-sm"
            {...props}
          />
        ),
        code: ({ className, children, ...props }) => {
          // Check if this has a language class (indicates code block inside pre)
          const hasLanguage = /language-(\w+)/.test(className || '');

          // If it has a language class, it's inside a <pre> - minimal styling
          // since <pre> handles the block styling
          if (hasLanguage) {
            return (
              <code className={`font-mono ${className || ''}`} {...props}>
                {children}
              </code>
            );
          }

          // Inline code - add background and padding
          return (
            <code
              className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono"
              {...props}
            >
              {children}
            </code>
          );
        },

        // Tables
        table: (props) => (
          <div className="overflow-x-auto my-3 rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm" {...props} />
          </div>
        ),
        thead: (props) => (
          <thead className="bg-slate-50" {...props} />
        ),
        tbody: (props) => (
          <tbody className="divide-y divide-slate-200 bg-white" {...props} />
        ),
        tr: (props) => (
          <tr className="hover:bg-slate-50 transition-colors" {...props} />
        ),
        th: (props) => (
          <th
            className="px-3 py-2 text-left font-semibold text-slate-700 whitespace-nowrap"
            {...props}
          />
        ),
        td: (props) => (
          <td className="px-3 py-2 text-slate-600" {...props} />
        ),

        // Links
        a: (props) => (
          <a
            className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          />
        ),

        // Blockquotes
        blockquote: (props) => (
          <blockquote
            className="border-l-4 border-slate-300 pl-4 italic text-slate-600 my-3"
            {...props}
          />
        ),

        // Horizontal rule
        hr: (props) => (
          <hr className="border-slate-200 my-4" {...props} />
        ),

        // Task lists (GFM)
        input: (props) => (
          <input
            className="mr-2 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            disabled
            {...props}
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer;
