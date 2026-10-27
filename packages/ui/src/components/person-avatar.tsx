"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@crm/ui/components/avatar";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { initialsFromName } from "@crm/ui/lib/format";
import type * as React from "react";

export type PersonAvatarSize = "sm" | "default" | "lg";

export function PersonAvatar({
	src,
	name,
	email,
	size = "default",
	...props
}: Omit<React.ComponentProps<typeof Avatar>, "children" | "size"> & {
	src?: string | null;
	name?: string | null;
	email?: string | null;
	size?: PersonAvatarSize;
}) {
	const url = src?.trim() ? src : undefined;
	const label = name?.trim() || email?.trim() || "";

	return (
		<Avatar size={size} {...props}>
			{url ? <AvatarImage src={url} alt="" /> : null}
			<AvatarFallback>{initialsFromName(label)}</AvatarFallback>
		</Avatar>
	);
}

export function ZoomablePersonAvatar({
	src,
	name,
	email,
	size = "default",
	...props
}: React.ComponentProps<typeof PersonAvatar>) {
	const url = src?.trim() ? src : undefined;
	const label = name?.trim() || email?.trim() || "";
	const avatar = (
		<PersonAvatar src={src} name={name} email={email} size={size} {...props} />
	);

	if (!url) return avatar;

	return (
		<Dialog>
			<DialogTrigger asChild>
				<button
					type="button"
					aria-label={label ? `Show ${label}'s photo` : "Show photo"}
					className="shrink-0 cursor-zoom-in rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={(event) => event.stopPropagation()}
				>
					{avatar}
				</button>
			</DialogTrigger>
			<DialogContent
				className="sm:max-w-md"
				onClick={(event) => event.stopPropagation()}
			>
				<DialogTitle>{label || "Photo"}</DialogTitle>
				<img
					src={url}
					alt={label}
					className="aspect-square w-full rounded-lg bg-muted object-cover"
				/>
			</DialogContent>
		</Dialog>
	);
}
