"use client";

import { CONTEXT_DEV_SIGNUP_URL } from "@crm/db/settings";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ResearchKey() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const keyId = useId();
	const [draft, setDraft] = useState("");

	const key = useQuery(trpc.settings.myResearchKey.queryOptions());

	const save = useMutation(
		trpc.settings.setMyResearchKey.mutationOptions({
			onSuccess: async () => {
				await cache.settings();
				setDraft("");
				toast.success("Your Context API key is saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const remove = useMutation(
		trpc.settings.clearMyResearchKey.mutationOptions({
			onSuccess: async () => {
				await cache.settings();
				toast.success("Your Context API key is removed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!key.data) return null;

	const { configured, hint, teamKeys } = key.data;
	const busy = save.isPending || remove.isPending;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Your Context API key</CardTitle>
				<CardDescription>
					Context finds contact photos and researches companies. Each person can
					add their own key. The CRM uses the team's keys in turn and moves to
					the next one when a key runs out of credits for the month.{" "}
					{teamKeys === 1 ? "1 key is in use." : `${teamKeys} keys are in use.`}
				</CardDescription>

				<CardAction>
					<div className="flex gap-2">
						{configured ? (
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => remove.mutate()}
							>
								Remove
							</Button>
						) : null}
						<Button
							type="submit"
							form="research-key"
							disabled={busy || draft.trim() === ""}
						>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							{configured ? "Replace key" : "Save key"}
						</Button>
					</div>
				</CardAction>
			</CardHeader>

			<CardContent>
				<form
					id="research-key"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate({ apiKey: draft.trim() });
					}}
				>
					<FieldGroup>
						<Field>
							<div className="flex items-center justify-between gap-3">
								<FieldLabel htmlFor={keyId}>Context API key</FieldLabel>
								<StatusIndicator
									size="sm"
									tone={configured ? "success" : "warning"}
									label={configured ? "Connected" : "Not connected"}
								/>
							</div>
							<Input
								id={keyId}
								type="password"
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								placeholder={hint ?? "Paste the key"}
								autoComplete="off"
								autoCapitalize="off"
								autoCorrect="off"
								spellCheck={false}
								disabled={busy}
							/>
							<FieldDescription>
								Don't have a Context API key?{" "}
								<a
									href={CONTEXT_DEV_SIGNUP_URL}
									target="_blank"
									rel="noreferrer"
									className="underline underline-offset-4 hover:text-foreground"
								>
									Sign up here
								</a>
							</FieldDescription>
						</Field>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
