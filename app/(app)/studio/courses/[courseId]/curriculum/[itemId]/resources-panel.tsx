"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Link2, Trash2, Upload } from "lucide-react";
import { Panel } from "@/components/app/panel";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatFileSize, RESOURCE_MAX_BYTES } from "@/lib/lecture-resources";
import {
  addResourceLink,
  deleteResource,
  finishResourceUpload,
  startResourceUpload,
  type ResourceState,
} from "../../../../resource-actions";
import { putWithProgress } from "../video-upload";

const initial: ResourceState = { status: "idle" };

export type StudioResource = {
  id: string;
  filename: string;
  sizeBytes: number;
  externalUrl: string | null;
};

function ResourceRow({ resource }: { resource: StudioResource }) {
  const [, remove] = useActionState(deleteResource, initial);
  const host = resource.externalUrl ? new URL(resource.externalUrl).host : null;
  return (
    <li className="flex items-center gap-3 py-2.5">
      {host ? (
        <Link2 className="size-4 shrink-0 text-graphite" aria-hidden />
      ) : (
        <FileDown className="size-4 shrink-0 text-graphite" aria-hidden />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-ink">{resource.filename}</span>
        <span className="text-sm text-graphite">{host ? `Link to ${host}` : formatFileSize(resource.sizeBytes)}</span>
      </span>
      <form action={remove}>
        <input type="hidden" name="resourceId" value={resource.id} />
        <ConfirmSubmit
          label={`Remove ${resource.filename}`}
          question="Remove it?"
          confirmLabel="Remove"
          icon={<Trash2 aria-hidden />}
        />
      </form>
    </li>
  );
}

function AddLinkForm({ itemId }: { itemId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ResourceState, formData: FormData) => {
    const result = await addResourceLink(prev, formData);
    if (result.status === "done") form.current?.reset();
    return result;
  }, initial);

  return (
    <form ref={form} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="resource-title">Link name</Label>
          <Input id="resource-title" name="title" required maxLength={120} placeholder="For example: TypeScript handbook" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="resource-url">Web address</Label>
          <Input id="resource-url" name="url" required inputMode="url" placeholder="typescriptlang.org/docs" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          <Link2 aria-hidden /> {pending ? "Adding…" : "Add link"}
        </Button>
        {state.status === "done" ? (
          <p role="status" className="text-sm font-medium text-ink">
            {state.message}
          </p>
        ) : null}
      </div>
      {state.status === "error" ? <FieldError message={state.message} /> : null}
    </form>
  );
}

type Phase = { name: "idle" } | { name: "uploading"; percent: number } | { name: "saving" } | { name: "error"; message: string };

function UploadFile({ itemId }: { itemId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });

  async function upload(file: File) {
    if (file.size > RESOURCE_MAX_BYTES) {
      setPhase({ name: "error", message: "Files can be up to 100 MB." });
      return;
    }
    setPhase({ name: "uploading", percent: 0 });
    try {
      const start = await startResourceUpload({
        itemId,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!start.ok) {
        setPhase({ name: "error", message: start.message });
        return;
      }
      await putWithProgress(start.uploadUrl, start.uploadHeaders, file, (percent) =>
        setPhase({ name: "uploading", percent }),
      );
      setPhase({ name: "saving" });
      const finished = await finishResourceUpload({ itemId, key: start.key, filename: file.name });
      if (!finished.ok) {
        setPhase({ name: "error", message: finished.message });
        return;
      }
      setPhase({ name: "idle" });
      router.refresh();
    } catch (error) {
      setPhase({ name: "error", message: error instanceof Error ? error.message : "The upload failed." });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={phase.name === "uploading" || phase.name === "saving"}
          onClick={() => input.current?.click()}
        >
          <Upload aria-hidden /> Upload a file
        </Button>
        {phase.name === "uploading" ? (
          <span className="flex min-w-40 flex-1 items-center gap-2">
            <Progress value={phase.percent} className="max-w-48" aria-label={`Upload progress ${phase.percent}%`} />
            <span className="text-sm text-graphite tabular-nums">{phase.percent}%</span>
          </span>
        ) : phase.name === "saving" ? (
          <span role="status" className="text-sm text-graphite">
            Saving…
          </span>
        ) : (
          <span className="text-sm text-graphite">Slides, worksheets, code. Up to 100 MB.</span>
        )}
      </div>
      {phase.name === "error" ? <FieldError message={phase.message} /> : null}
    </div>
  );
}

/** Links and files learners can open from this lecture's Overview tab. */
export function ResourcesPanel({
  itemId,
  resources,
  storageReady,
}: {
  itemId: string;
  resources: StudioResource[];
  storageReady: boolean;
}) {
  return (
    <Panel title="Resources" description="Links and files learners can open from this lecture.">
      {resources.length === 0 ? (
        <p className="text-sm text-graphite">No resources yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {resources.map((resource) => (
            <ResourceRow key={resource.id} resource={resource} />
          ))}
        </ul>
      )}
      {storageReady ? (
        <UploadFile itemId={itemId} />
      ) : (
        <p className="text-sm text-graphite">
          File uploads need cloud storage, which isn&apos;t set up on this site yet. You can add links now.
        </p>
      )}
      <AddLinkForm itemId={itemId} />
    </Panel>
  );
}
