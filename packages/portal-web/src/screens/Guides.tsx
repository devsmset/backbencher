import { useState } from "react";
import { trpc } from "../trpc.js";
import { Chip, Field, Muted, Panel, QueryState } from "../ui.js";

export function Guides() {
  const utils = trpc.useUtils();
  const guides = trpc.guides.list.useQuery();
  const invalidate = () => utils.guides.list.invalidate();
  const upsert = trpc.guides.upsert.useMutation({ onSuccess: invalidate });
  const remove = trpc.guides.remove.useMutation({ onSuccess: invalidate });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"must_read" | "reference">("reference");
  const [area, setArea] = useState("");

  const add = () =>
    upsert.mutate(
      {
        guideId: "",
        title,
        body,
        scope: { operationIds: [], flowIds: [], ...(area ? { productArea: area } : {}) },
        audience: "qa_agent",
        priority,
        updatedBy: "",
        updatedAt: 0,
      },
      {
        onSuccess: () => {
          setTitle("");
          setBody("");
          setArea("");
        },
      },
    );

  return (
    <>
      <Panel title="New guide">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Body (markdown)">
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
          <Field label="Product area (scope)">
            <input value={area} onChange={(e) => setArea(e.target.value)} />
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value as "must_read" | "reference")}>
              <option value="reference">reference</option>
              <option value="must_read">must_read</option>
            </select>
          </Field>
        </div>
        <button
          className="rounded-lg border border-[--accent] bg-[--accent] px-2.5 py-1.5 font-semibold text-[#06121f]"
          type="button"
          onClick={add}
          disabled={!title || upsert.isPending}
        >
          Add guide
        </button>
      </Panel>

      <Panel title="Guides">
        <QueryState isLoading={guides.isLoading} error={guides.error} />
        {(guides.data ?? []).map((g) => (
          <div key={g.guideId} className="flex items-center gap-2.5 border-b border-[--line] py-2">
            <b>{g.title}</b>
            <Chip variant={g.priority === "must_read" ? "warn" : "derived"}>{g.priority}</Chip>
            {g.scope.productArea && <Chip variant="human">{g.scope.productArea}</Chip>}
            <button type="button" onClick={() => remove.mutate({ guideId: g.guideId })}>
              delete
            </button>
          </div>
        ))}
        {guides.data?.length === 0 && <Muted>No guides yet.</Muted>}
      </Panel>
    </>
  );
}
