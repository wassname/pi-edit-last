import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

type TextBlock = { type?: string; text?: string };

function extractAssistantText(content: unknown): string {
  if (!Array.isArray(content)) return "";

  return content
    .flatMap((block) => {
      if (!block || typeof block !== "object") return [];
      const b = block as TextBlock;
      return b.type === "text" && typeof b.text === "string" ? [b.text] : [];
    })
    .join("\n")
    .trim();
}

function quotePrefixLines(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function getAssistantTextSinceLastUser(ctx: any): string | null {
  const branch = ctx.sessionManager.getBranch();

  let lastUserIdx = -1;
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (
      entry?.type === "message" &&
      entry.message &&
      entry.message.role === "user"
    ) {
      lastUserIdx = i;
      break;
    }
  }

  const chunks: string[] = [];

  for (let i = Math.max(0, lastUserIdx + 1); i < branch.length; i++) {
    const entry = branch[i];
    if (entry?.type !== "message") continue;

    const msg = entry.message;
    if (!msg || msg.role !== "assistant") continue;

    const text = extractAssistantText(msg.content);
    if (text) chunks.push(text);
  }

  if (chunks.length === 0) return null;

  return chunks
    .map((chunk) => quotePrefixLines(chunk))
    .join("\n>\n");
}

function buildRevisionPrompt(editedText: string): string {
  return [
    "Please revise your reply to my last message using the edited/annotated assistant draft below.",
    "Treat my edits as the target direction.",
    "If I left inline notes, incorporate them rather than repeating them literally.",
    "",
    "--- edited assistant draft ---",
    editedText.trim(),
  ].join("\n");
}

// Open editor and wait for it to close, returning the edited content
function editInExternalEditor(content: string): string | null {
  let editor = process.env.VISUAL || process.env.EDITOR || "vi";

  // VSCode needs --wait to block until file is closed
  if (editor === "code") {
    editor = "code --wait";
  }
  
  const tmpDir = mkdtempSync(join(tmpdir(), "pi-edit-"));
  const tmpFile = join(tmpDir, "edit.txt");
  
  writeFileSync(tmpFile, content, "utf-8");
  
  try {
    execSync(`${editor} "${tmpFile}"`, {
      stdio: "inherit",
      env: { ...process.env, VISUAL: editor, EDITOR: editor },
    });
    
    const result = readFileSync(tmpFile, "utf-8");
    return result;
  } catch (e) {
    return null;
  } finally {
    unlinkSync(tmpFile);
    rmdirSync(tmpDir);
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("edit-last-external", {
    description:
      "Edit assistant text since last user message in external editor (VISUAL/EDITOR), then send for revision.",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      await ctx.waitForIdle();

      const draft = getAssistantTextSinceLastUser(ctx);
      if (!draft) {
        ctx.ui.notify(
          "No assistant text found since the last user message.",
          "warning"
        );
        return;
      }

      const prompt = buildRevisionPrompt(draft);
      
      // Open external editor and wait for it to close
      const edited = editInExternalEditor(prompt);
      
      if (edited == null || !edited.trim()) {
        ctx.ui.notify("No changes or cancelled.", "info");
        return;
      }

      // Send the edited content as a user message
      pi.sendUserMessage(edited.trim());
    },
  });

  // Also keep the UI-based version that pre-fills editor
  pi.registerCommand("edit-last", {
    description:
      "Edit all assistant text since the last user message in the built-in editor.",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      await ctx.waitForIdle();

      const draft = getAssistantTextSinceLastUser(ctx);
      if (!draft) {
        ctx.ui.notify(
          "No assistant text found since the last user message.",
          "warning"
        );
        return;
      }

      const edited = await ctx.ui.editor(
        "Edit assistant text since last user message",
        draft
      );
      if (edited == null) return;

      const cleaned = edited.trim();
      if (!cleaned) {
        ctx.ui.notify("Nothing to send.", "warning");
        return;
      }

      pi.sendUserMessage(buildRevisionPrompt(cleaned));
    },
  });
}