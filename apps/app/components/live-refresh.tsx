"use client";

import { hashKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { FRESHNESS } from "@/lib/freshness";
import { useTRPC } from "@/lib/trpc/client";

export function LiveRefresh() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const stampOptions = trpc.freshness.stamp.queryOptions();
	const stampHash = hashKey(stampOptions.queryKey);
	const stamp = useQuery({
		...stampOptions,
		staleTime: 0,
		refetchInterval: FRESHNESS.pollMs,
	});
	const seen = useRef<string | null>(null);
	const current = stamp.data?.stamp;

	useEffect(() => {
		if (!current) return;
		if (seen.current !== null && seen.current !== current) {
			void queryClient.invalidateQueries({
				predicate: (query) => query.queryHash !== stampHash,
			});
		}
		seen.current = current;
	}, [current, queryClient, stampHash]);

	return null;
}
