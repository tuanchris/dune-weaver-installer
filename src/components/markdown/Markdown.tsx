import React from "react";
import { ErrorBoundary } from "react-error-boundary";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./Markdown.scss";

type Props = {
    children: string;
};
export const Markdown = ({ children }: Props) => {
    // Guard against undefined or null children
    if (!children) {
        return null;
    }

    return (
        <ErrorBoundary
            fallback={
                <pre className="card-text" style={{ whiteSpace: "pre-wrap" }}>
                    {children}
                </pre>
            }
            resetKeys={[children]}
            onError={() => {}}
        >
            {/* react-markdown v9 removed the `className` prop, so the wrapper
                div carries the styling classes instead. */}
            <div className="markdown card-text">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {children}
                </ReactMarkdown>
            </div>
        </ErrorBoundary>
    );
};
