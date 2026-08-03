import katex from "katex";
import React from "react";

export default function MathFormula({
  latex,
  display = false,
  className = "",
}: {
  latex: string;
  display?: boolean;
  className?: string;
}) {
  const html = katex.renderToString(latex, {
    displayMode: display,
    output: "htmlAndMathml",
    strict: false,
    throwOnError: false,
  });

  return <span className={className} dangerouslySetInnerHTML={{__html: html}} />;
}
