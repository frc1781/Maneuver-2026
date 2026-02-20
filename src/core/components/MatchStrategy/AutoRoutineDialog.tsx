import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/core/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/core/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/core/components/animate-ui/radix/tabs";
import type { AutoRoutineSelection, AutoRoutineSource, StrategyAutoRoutine } from "@/core/hooks/useMatchStrategy";

const START_POSITION_LABELS = ['Left Trench', 'Left Bump', 'Hub', 'Right Bump', 'Right Trench'] as const;

interface AutoRoutineDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    teamNumber: number | null;
    selectedSelection: AutoRoutineSelection | null;
    scoutedRoutines: StrategyAutoRoutine[];
    reportedRoutines: StrategyAutoRoutine[];
    onSelectRoutine: (selection: AutoRoutineSelection | null) => void;
}

function groupByStartPosition(routines: StrategyAutoRoutine[]) {
    return START_POSITION_LABELS.reduce<Record<string, StrategyAutoRoutine[]>>((acc, startLabel) => {
        acc[startLabel] = routines
            .filter((routine) => routine.startLabel === startLabel)
            .sort((a, b) => a.label.localeCompare(b.label));
        return acc;
    }, {});
}

function RoutineSourceTab({
    source,
    routines,
    selectedSelection,
    emptyMessage,
    onSelectRoutine,
}: {
    source: AutoRoutineSource;
    routines: StrategyAutoRoutine[];
    selectedSelection: AutoRoutineSelection | null;
    emptyMessage: string;
    onSelectRoutine: (selection: AutoRoutineSelection) => void;
}) {
    const grouped = useMemo(() => groupByStartPosition(routines), [routines]);

    if (routines.length === 0) {
        return (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="max-h-[60vh] overflow-y-auto pr-3 touch-pan-y overscroll-contain">
            <div className="space-y-4 pb-1">
                {START_POSITION_LABELS.map((startLabel) => {
                    const startRoutines = grouped[startLabel] ?? [];
                    if (startRoutines.length === 0) return null;

                    return (
                        <div key={startLabel} className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">{startLabel}</p>
                                <Badge variant="secondary">{startRoutines.length}</Badge>
                            </div>

                            <div className="space-y-2">
                                {startRoutines.map((routine) => {
                                    const isSelected = selectedSelection?.source === source
                                        && selectedSelection.routineId === routine.id;

                                    return (
                                        <button
                                            key={routine.id}
                                            type="button"
                                            className={`w-full rounded-md border p-3 text-left transition-colors ${isSelected
                                                ? 'border-primary bg-primary/10'
                                                : 'hover:bg-muted/40'
                                                }`}
                                            onClick={() => onSelectRoutine({ source, routineId: routine.id })}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-medium">{routine.label}</p>
                                                {routine.matchNumber ? (
                                                    <Badge variant="outline">Match {routine.matchNumber}</Badge>
                                                ) : null}
                                            </div>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {routine.actions.length} actions
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const AutoRoutineDialog = ({
    open,
    onOpenChange,
    teamNumber,
    selectedSelection,
    scoutedRoutines,
    reportedRoutines,
    onSelectRoutine,
}: AutoRoutineDialogProps) => {
    const [activeTab, setActiveTab] = useState<AutoRoutineSource>('scouted');

    useEffect(() => {
        if (!open) return;

        if (scoutedRoutines.length > 0) {
            setActiveTab('scouted');
            return;
        }

        setActiveTab('reported');
    }, [open, scoutedRoutines.length]);

    const handleSelectRoutine = (selection: AutoRoutineSelection) => {
        onSelectRoutine(selection);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[90vh] overflow-hidden p-4 sm:p-6 flex flex-col">
                <DialogHeader>
                    <DialogTitle>Auto Routines{teamNumber ? ` • Team ${teamNumber}` : ''}</DialogTitle>
                    <DialogDescription>
                        Scouted autos are shown first when available. Reported autos are grouped by starting location.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AutoRoutineSource)} className="w-full" enableSwipe={true}>
                    <TabsList className="grid w-full grid-cols-2 shrink-0">
                        <TabsTrigger value="scouted">Scouted Autos</TabsTrigger>
                        <TabsTrigger value="reported">Reported Autos</TabsTrigger>
                    </TabsList>

                    <TabsContent value="scouted" className="mt-4">
                        <RoutineSourceTab
                            source="scouted"
                            routines={scoutedRoutines}
                            selectedSelection={selectedSelection}
                            emptyMessage="No scouted autonomous routines found for this team."
                            onSelectRoutine={handleSelectRoutine}
                        />
                    </TabsContent>

                    <TabsContent value="reported" className="mt-4">
                        <RoutineSourceTab
                            source="reported"
                            routines={reportedRoutines}
                            selectedSelection={selectedSelection}
                            emptyMessage="No pit-reported autonomous routines found for this team."
                            onSelectRoutine={handleSelectRoutine}
                        />
                    </TabsContent>
                </Tabs>
            </DialogContent>

        </Dialog>
    );
};
