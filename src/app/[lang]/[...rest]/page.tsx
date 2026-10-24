import { notFound } from "next/navigation";

// Anything under a language that isn't a page renders that language's 404.
export default function CatchAll() {
  notFound();
}
