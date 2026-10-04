import React, { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn';

/** Collect the plain text of a rendered code node, for the copy button. */
function textOf(node: React.ReactNode): string {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join('');
    if (React.isValidElement(node)) return textOf((node.props as any).children);
    return '';
}

const CodeBlock: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const [copied, setCopied] = useState(false);
    const child = React.Children.only(children) as React.ReactElement<any>;
    const className: string = child?.props?.className || '';
    const lang = /language-([\w+-]+)/.exec(className)?.[1];
    const copy = () => {
        navigator.clipboard?.writeText(textOf(child?.props?.children)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        });
    };
    return (
        <div className="not-prose group/code my-4 overflow-hidden rounded-xl border border-white/10 bg-[#0b0b14] shadow-lg shadow-black/20">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-1.5">
                <span className="font-mono text-[11px] uppercase tracking-wider text-white/40">{lang || 'code'}</span>
                <button
                    onClick={copy}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-white/45 transition hover:bg-white/5 hover:text-white"
                >
                    {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <pre className="overflow-x-auto px-4 py-3.5 text-[13px] leading-relaxed text-[#e6e6f0]">{children}</pre>
        </div>
    );
};

const components = {
    pre: CodeBlock as any,
    a: ({ node, ...props }: any) => <a {...props} target="_blank" rel="noopener noreferrer" />,
    table: ({ node, ...props }: any) => (
        <div className="not-prose my-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-sm [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_th]:bg-sunken [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold" {...props} />
        </div>
    ),
};

const remarkPlugins = [remarkGfm];
const rehypePlugins: any[] = [[rehypeHighlight, { detect: true, ignoreMissing: true }]];

/**
 * Renders model output as markdown. Raw HTML in the source is never
 * rendered (react-markdown escapes it), so text from other users or from
 * uploaded documents cannot inject markup into the page.
 */
export const Markdown = memo(function Markdown({
    children, className, streaming,
}: { children: string; className?: string; streaming?: boolean }) {
    return (
        <div className={cn('prose-cognify', streaming && 'streaming', className)}>
            <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
                {children || ''}
            </ReactMarkdown>
        </div>
    );
});

export default Markdown;
