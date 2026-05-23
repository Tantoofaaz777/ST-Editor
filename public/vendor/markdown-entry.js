import { marked } from "marked";

marked.use({
  gfm: true,
  breaks: true,
});

export function renderMarkdown(value) {
  return marked.parse(value || "");
}
