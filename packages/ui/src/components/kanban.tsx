"use client";

import Draggable from "@carbon/icons-react/es/Draggable";
import {
	type Announcements,
	type CollisionDetection,
	DndContext,
	DragOverlay,
	KeyboardSensor,
	MouseSensor,
	pointerWithin,
	rectIntersection,
	TouchSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { type ReactNode, useState } from "react";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";

const DRAG = {
	mouseDistancePx: 6,
	touchDelayMs: 200,
	touchTolerancePx: 6,
} as const;

const collision: CollisionDetection = (args) => {
	const underPointer = pointerWithin(args);
	return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

function KanbanBoard({
	onMove,
	itemLabel,
	columnLabel,
	renderOverlay,
	className,
	children,
}: {
	onMove: (itemId: string, columnId: string) => void;
	itemLabel: (itemId: string) => string;
	columnLabel: (columnId: string) => string;
	renderOverlay: (itemId: string) => ReactNode;
	className?: string;
	children: ReactNode;
}) {
	const [active, setActive] = useState<string | null>(null);

	const sensors = useSensors(
		useSensor(MouseSensor, {
			activationConstraint: { distance: DRAG.mouseDistancePx },
		}),
		useSensor(TouchSensor, {
			activationConstraint: {
				delay: DRAG.touchDelayMs,
				tolerance: DRAG.touchTolerancePx,
			},
		}),
		useSensor(KeyboardSensor),
	);

	const announcements: Announcements = {
		onDragStart: ({ active }) => `Picked up ${itemLabel(String(active.id))}.`,
		onDragOver: ({ active, over }) =>
			over
				? `${itemLabel(String(active.id))} is over ${columnLabel(String(over.id))}.`
				: `${itemLabel(String(active.id))} is not over a column.`,
		onDragEnd: ({ active, over }) =>
			over
				? `${itemLabel(String(active.id))} dropped on ${columnLabel(String(over.id))}.`
				: `${itemLabel(String(active.id))} dropped where it started.`,
		onDragCancel: ({ active }) =>
			`Moving ${itemLabel(String(active.id))} was cancelled.`,
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={collision}
			accessibility={{ announcements }}
			onDragStart={(event) => setActive(String(event.active.id))}
			onDragCancel={() => setActive(null)}
			onDragEnd={(event) => {
				setActive(null);
				if (event.over) onMove(String(event.active.id), String(event.over.id));
			}}
		>
			<div
				data-slot="kanban"
				className={cn("flex min-h-0 gap-3 overflow-x-auto pb-2", className)}
			>
				{children}
			</div>
			<DragOverlay dropAnimation={null}>
				{active ? renderOverlay(active) : null}
			</DragOverlay>
		</DndContext>
	);
}

function KanbanColumn({
	id,
	label,
	header,
	className,
	children,
}: {
	id: string;
	label: string;
	header: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	const { setNodeRef, isOver } = useDroppable({ id });

	return (
		<section
			ref={setNodeRef}
			data-slot="kanban-column"
			data-over={isOver}
			aria-label={label}
			className={cn(
				"flex max-h-full min-w-60 flex-1 basis-60 flex-col rounded-lg border bg-muted/40 data-[over=true]:bg-muted data-[over=true]:ring-2 data-[over=true]:ring-ring",
				className,
			)}
		>
			<header className="flex items-center justify-between gap-2 border-b px-3 py-2">
				{header}
			</header>
			<div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
				{children}
			</div>
		</section>
	);
}

function KanbanCard({
	id,
	label,
	className,
	children,
}: {
	id: string;
	label: string;
	className?: string;
	children: ReactNode;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		isDragging,
	} = useDraggable({ id });
	const { onKeyDown, ...pointerListeners } = listeners ?? {};

	return (
		<div
			ref={setNodeRef}
			data-slot="kanban-card"
			data-dragging={isDragging}
			className={cn(
				"relative flex gap-2 rounded-lg border bg-card p-3 text-sm data-[dragging=true]:opacity-40",
				className,
			)}
			{...pointerListeners}
		>
			<div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
			<Button
				ref={setActivatorNodeRef}
				type="button"
				variant="ghost"
				size="icon-xs"
				className="relative z-10 shrink-0 cursor-grab text-muted-foreground"
				{...attributes}
				onKeyDown={(event) => onKeyDown?.(event)}
			>
				<Icon icon={Draggable} />
				<span className="sr-only">Move {label}</span>
			</Button>
		</div>
	);
}

function KanbanEmpty({ children }: { children: ReactNode }) {
	return (
		<p className="px-1 py-6 text-center text-muted-foreground text-xs">
			{children}
		</p>
	);
}

export { KanbanBoard, KanbanCard, KanbanColumn, KanbanEmpty };
