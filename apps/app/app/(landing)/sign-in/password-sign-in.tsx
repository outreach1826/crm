"use client";

import { signIn } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";

export function PasswordSignIn() {
	const [pending, setPending] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? "Could not sign you in.");
	}

	async function handleSubmit() {
		setPending(true);

		const origin = window.location.origin;

		const { error } = await signIn.email({
			email,
			password,
			callbackURL: `${origin}/`,
		});

		if (error) fail(error.message ?? "That email or password is wrong.");
	}

	return (
		<form
			className="flex w-full flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				handleSubmit().catch(() => fail());
			}}
		>
			<div className="flex flex-col gap-2">
				<Label htmlFor="email">Email</Label>
				<Input
					autoComplete="email"
					disabled={pending}
					id="email"
					name="email"
					onChange={(event) => setEmail(event.target.value)}
					required
					type="email"
					value={email}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="password">Password</Label>
				<Input
					autoComplete="current-password"
					disabled={pending}
					id="password"
					name="password"
					onChange={(event) => setPassword(event.target.value)}
					required
					type="password"
					value={password}
				/>
			</div>

			<Button className="w-full" disabled={pending} type="submit">
				{pending ? <Spinner data-icon="inline-start" /> : null}
				Sign in
			</Button>
		</form>
	);
}
