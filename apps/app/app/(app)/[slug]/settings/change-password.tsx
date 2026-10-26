"use client";

import { authClient } from "@crm/auth/client";
import { PASSWORD } from "@crm/auth/passwords";
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
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useId, useState } from "react";
import { toast } from "sonner";

export function ChangePassword() {
	const currentId = useId();
	const nextId = useId();
	const confirmId = useId();

	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [pending, setPending] = useState(false);

	const tooShort = next.length > 0 && next.length < PASSWORD.minLength;
	const tooLong = next.length > PASSWORD.maxLength;
	const mismatch = confirm.length > 0 && confirm !== next;
	const ready =
		current !== "" &&
		next.length >= PASSWORD.minLength &&
		!tooLong &&
		next === confirm;

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? "Could not reach the sign-in service.");
	}

	async function submit() {
		setPending(true);

		const { error } = await authClient.changePassword({
			currentPassword: current,
			newPassword: next,
			revokeOtherSessions: true,
		});

		if (error) {
			fail(error.message ?? "Could not change your password.");
			return;
		}

		setPending(false);
		setCurrent("");
		setNext("");
		setConfirm("");
		toast.success("Password changed. Your other devices are signed out.");
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Password</CardTitle>
				<CardDescription>
					Change the password you sign in with. Every other device you are
					signed in on is signed out.
				</CardDescription>

				<CardAction>
					<Button
						type="submit"
						form="change-password"
						disabled={pending || !ready}
					>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Change password
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				<form
					id="change-password"
					onSubmit={(event) => {
						event.preventDefault();
						submit().catch(() => fail());
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={currentId}>Current password</FieldLabel>
							<Input
								id={currentId}
								type="password"
								autoComplete="current-password"
								value={current}
								onChange={(event) => setCurrent(event.target.value)}
								disabled={pending}
							/>
						</Field>

						<Field data-invalid={tooShort || tooLong}>
							<FieldLabel htmlFor={nextId}>New password</FieldLabel>
							<Input
								id={nextId}
								type="password"
								autoComplete="new-password"
								value={next}
								onChange={(event) => setNext(event.target.value)}
								aria-invalid={tooShort || tooLong}
								disabled={pending}
							/>
							{tooShort ? (
								<FieldError>
									Use at least {PASSWORD.minLength} characters.
								</FieldError>
							) : tooLong ? (
								<FieldError>
									Use at most {PASSWORD.maxLength} characters.
								</FieldError>
							) : (
								<FieldDescription>
									At least {PASSWORD.minLength} characters.
								</FieldDescription>
							)}
						</Field>

						<Field data-invalid={mismatch}>
							<FieldLabel htmlFor={confirmId}>Confirm new password</FieldLabel>
							<Input
								id={confirmId}
								type="password"
								autoComplete="new-password"
								value={confirm}
								onChange={(event) => setConfirm(event.target.value)}
								aria-invalid={mismatch}
								disabled={pending}
							/>
							{mismatch ? (
								<FieldError>The two new passwords do not match.</FieldError>
							) : null}
						</Field>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
