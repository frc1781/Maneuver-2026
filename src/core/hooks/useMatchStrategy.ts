/**
 * Match Strategy Hook
 * 
 * Manages state for the Match Strategy page including:
 * - Team selection (6 teams: 3 red, 3 blue)
 * - Match number lookup (auto-fills teams from match data)
 * - Alliance selection (for elimination matches)
 * - Team stats retrieval using centralized useAllTeamStats
 */

import { useState, useEffect, useCallback } from "react";
import { loadScoutingData } from "@/core/lib/scoutingDataUtils";
import { loadAllPitScoutingEntries, loadScoutingEntriesByMatch } from "@/core/db/database";
import { useAllTeamStats } from "@/core/hooks/useAllTeamStats";
import type { Alliance } from "../lib/allianceTypes";
import type { TeamStats } from "@/core/types/team-stats";
import type { PitScoutingEntryBase } from "@/core/types/pit-scouting";

export type StrategyStageId = 'autonomous' | 'teleop' | 'endgame';

export type AutoRoutineSource = 'scouted' | 'reported';

const START_POSITION_LABELS = ['Left Trench', 'Left Bump', 'Hub', 'Right Bump', 'Right Trench'] as const;
type StartPositionLabel = (typeof START_POSITION_LABELS)[number];
type StartPositionIndex = 0 | 1 | 2 | 3 | 4;

const START_LABEL_TO_INDEX: Record<StartPositionLabel, StartPositionIndex> = {
    'Left Trench': 0,
    'Left Bump': 1,
    Hub: 2,
    'Right Bump': 3,
    'Right Trench': 4,
};

export interface AutoRoutineWaypoint {
    type?: string;
    action?: string;
    position: TeamSpotPoint;
    pathPoints?: TeamSpotPoint[];
}

export interface StrategyAutoRoutine {
    id: string;
    teamNumber: number;
    source: AutoRoutineSource;
    label: string;
    startPosition: StartPositionIndex;
    startLabel: StartPositionLabel;
    actions: AutoRoutineWaypoint[];
    matchNumber?: number;
    allianceColor?: 'red' | 'blue';
}

interface TeamAutoRoutines {
    scouted: StrategyAutoRoutine[];
    reported: StrategyAutoRoutine[];
}

export interface AutoRoutineSelection {
    source: AutoRoutineSource;
    routineId: string;
}

const EMPTY_TEAM_AUTO_ROUTINES: TeamAutoRoutines = {
    scouted: [],
    reported: [],
};

export interface TeamSpotPoint {
    x: number;
    y: number;
    pathPoints?: Array<{ x: number; y: number }>;
}

export interface TeamStageSpots {
    shooting: TeamSpotPoint[];
    passing: TeamSpotPoint[];
}

interface TeamSpotsByStage {
    autonomous: TeamStageSpots;
    teleop: TeamStageSpots;
}

const EMPTY_SPOTS: TeamStageSpots = { shooting: [], passing: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractStageSpotsFromPath(path: unknown): TeamStageSpots {
    if (!Array.isArray(path)) return EMPTY_SPOTS;

    const shooting: TeamSpotPoint[] = [];
    const passing: TeamSpotPoint[] = [];

    path.forEach((waypoint) => {
        if (!isRecord(waypoint)) return;

        const type = typeof waypoint.type === 'string' ? waypoint.type : '';
        if (type !== 'score' && type !== 'pass') return;

        const position = isRecord(waypoint.position) ? waypoint.position : null;
        const x = position && typeof position.x === 'number' ? position.x : null;
        const y = position && typeof position.y === 'number' ? position.y : null;

        if (x === null || y === null) return;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;

        let pathPoints: Array<{ x: number; y: number }> | undefined;
        if (Array.isArray(waypoint.pathPoints)) {
            const normalizedPathPoints = waypoint.pathPoints
                .filter((point): point is Record<string, unknown> => isRecord(point))
                .map((point) => {
                    const px = typeof point.x === 'number' ? point.x : null;
                    const py = typeof point.y === 'number' ? point.y : null;
                    if (px === null || py === null) return null;
                    if (px < 0 || px > 1 || py < 0 || py > 1) return null;
                    return { x: px, y: py };
                })
                .filter((point): point is { x: number; y: number } => point !== null);

            if (normalizedPathPoints.length >= 2) {
                pathPoints = normalizedPathPoints;
            }
        }

        const spotPoint: TeamSpotPoint = pathPoints ? { x, y, pathPoints } : { x, y };

        if (type === 'score') {
            shooting.push(spotPoint);
        } else {
            passing.push(spotPoint);
        }
    });

    return { shooting, passing };
}

function getStartLabel(position: unknown): StartPositionLabel {
    if (typeof position !== 'number' || position < 0 || position > 4) {
        return 'Hub';
    }

    return START_POSITION_LABELS[position] ?? 'Hub';
}

function extractRoutineActionsFromPath(path: unknown): AutoRoutineWaypoint[] {
    if (!Array.isArray(path)) return [];

    const actions: AutoRoutineWaypoint[] = [];

    path.forEach((waypoint) => {
        if (!isRecord(waypoint)) return;

        const position = isRecord(waypoint.position) ? waypoint.position : null;
        const x = position && typeof position.x === 'number' ? position.x : null;
        const y = position && typeof position.y === 'number' ? position.y : null;

        if (x === null || y === null) return;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;

        let pathPoints: TeamSpotPoint[] | undefined;
        if (Array.isArray(waypoint.pathPoints)) {
            const normalizedPoints = waypoint.pathPoints
                .filter((point): point is Record<string, unknown> => isRecord(point))
                .map((point) => {
                    const px = typeof point.x === 'number' ? point.x : null;
                    const py = typeof point.y === 'number' ? point.y : null;
                    if (px === null || py === null) return null;
                    if (px < 0 || px > 1 || py < 0 || py > 1) return null;
                    return { x: px, y: py };
                })
                .filter((point): point is TeamSpotPoint => point !== null);

            if (normalizedPoints.length >= 2) {
                pathPoints = normalizedPoints;
            }
        }

        actions.push({
            type: typeof waypoint.type === 'string' ? waypoint.type : undefined,
            action: typeof waypoint.action === 'string' ? waypoint.action : undefined,
            position: { x, y },
            pathPoints,
        });
    });

    return actions;
}

function routineSelectionExists(routines: TeamAutoRoutines | undefined, selection: AutoRoutineSelection | null): boolean {
    if (!routines || !selection) return false;

    const sourceList = selection.source === 'reported' ? routines.reported : routines.scouted;
    return sourceList.some((routine) => routine.id === selection.routineId);
}

function getMostRecentPitEntriesByTeam(entries: PitScoutingEntryBase[]): Record<number, PitScoutingEntryBase> {
    return entries.reduce<Record<number, PitScoutingEntryBase>>((acc, entry) => {
        const current = acc[entry.teamNumber];
        if (!current || entry.timestamp > current.timestamp) {
            acc[entry.teamNumber] = entry;
        }
        return acc;
    }, {});
}

export const useMatchStrategy = () => {
    const [selectedTeams, setSelectedTeams] = useState<(number | null)[]>(Array(6).fill(null));
    const [availableTeams, setAvailableTeams] = useState<number[]>([]);
    const [matchNumber, setMatchNumber] = useState<string>("");
    const [isLookingUpMatch, setIsLookingUpMatch] = useState(false);
    const [confirmedAlliances, setConfirmedAlliances] = useState<Alliance[]>([]);
    const [selectedBlueAlliance, setSelectedBlueAlliance] = useState<string>("");
    const [selectedRedAlliance, setSelectedRedAlliance] = useState<string>("");
    const [teamSpotsByTeam, setTeamSpotsByTeam] = useState<Record<number, TeamSpotsByStage>>({});
    const [teamAutoRoutinesByTeam, setTeamAutoRoutinesByTeam] = useState<Record<number, TeamAutoRoutines>>({});
    const [selectedAutoRoutineBySlot, setSelectedAutoRoutineBySlot] = useState<(AutoRoutineSelection | null)[]>(Array(6).fill(null));
    const applySelectedTeams = useCallback((nextSelectedTeams: (number | null)[]) => {
        setSelectedTeams((prevSelectedTeams) => {
            setSelectedAutoRoutineBySlot((prevSelections) =>
                nextSelectedTeams.map((teamNumber, slotIndex) => {
                    if (!teamNumber) return null;

                    const routines = teamAutoRoutinesByTeam[teamNumber];
                    const previousTeam = prevSelectedTeams[slotIndex];
                    const previousSelection = prevSelections[slotIndex] ?? null;

                    if (previousTeam === teamNumber && routineSelectionExists(routines, previousSelection)) {
                        return previousSelection;
                    }

                    return null;
                })
            );

            return nextSelectedTeams;
        });
    }, [teamAutoRoutinesByTeam]);


    // Get all team stats using centralized hook
    const { teamStats: allTeamStats } = useAllTeamStats();

    // Function to get stats for a specific team
    const getTeamStats = useCallback((teamNumber: number | null): TeamStats | null => {
        if (teamNumber === null) return null;
        const stats = allTeamStats.find(s => s.teamNumber === teamNumber);
        return stats || null;
    }, [allTeamStats]);

    // Debounced match number lookup
    const lookupMatchTeams = useCallback(async (matchNum: string) => {
        if (!matchNum.trim()) return;

        setIsLookingUpMatch(true);
        try {
            const matchNumberValue = parseInt(matchNum.trim());

            // First check localStorage match data (from TBA API)
            const matchDataStr = localStorage.getItem("matchData");
            if (matchDataStr) {
                try {
                    const matchData = JSON.parse(matchDataStr);
                    const match = matchData.find((m: any) => m.matchNum === matchNumberValue);

                    if (match && match.redAlliance && match.blueAlliance) {
                        const redTeams = match.redAlliance.slice(0, 3);
                        const blueTeams = match.blueAlliance.slice(0, 3);

                        const newSelectedTeams = Array(6).fill(null);

                        for (let i = 0; i < redTeams.length && i < 3; i++) {
                            newSelectedTeams[i] = Number(redTeams[i]);
                        }

                        for (let i = 0; i < blueTeams.length && i < 3; i++) {
                            newSelectedTeams[i + 3] = Number(blueTeams[i]);
                        }

                        applySelectedTeams(newSelectedTeams);
                        setIsLookingUpMatch(false);
                        return;
                    }
                } catch (error) {
                    console.error("Error parsing match data:", error);
                }
            }

            // Fallback: Try scouting database
            const matchEntries = await loadScoutingEntriesByMatch(matchNumberValue);

            const redTeams: number[] = [];
            const blueTeams: number[] = [];

            matchEntries.forEach(entry => {
                if (entry.teamNumber) {
                    if (entry.allianceColor === "red") {
                        if (!redTeams.includes(entry.teamNumber)) {
                            redTeams.push(entry.teamNumber);
                        }
                    } else if (entry.allianceColor === "blue") {
                        if (!blueTeams.includes(entry.teamNumber)) {
                            blueTeams.push(entry.teamNumber);
                        }
                    }
                }
            });

            if (redTeams.length > 0 || blueTeams.length > 0) {
                redTeams.sort((a, b) => a - b);
                blueTeams.sort((a, b) => a - b);

                const newSelectedTeams = Array(6).fill(null);

                for (let i = 0; i < 3; i++) {
                    newSelectedTeams[i] = redTeams[i] || null;
                }

                for (let i = 0; i < 3; i++) {
                    newSelectedTeams[i + 3] = blueTeams[i] || null;
                }

                applySelectedTeams(newSelectedTeams);
            } else {
                console.log("No match entries found for match number:", matchNum);
            }
        } catch (error) {
            console.error("Error looking up match teams:", error);
        } finally {
            setIsLookingUpMatch(false);
        }
    }, [applySelectedTeams]);

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await loadScoutingData();

                // Extract unique team numbers - use teamNumber field (correct field name)
                const teams = [...new Set(
                    data
                        .map((entry) => entry.teamNumber)
                        .filter(Boolean)
                )] as number[];
                teams.sort((a, b) => a - b);
                setAvailableTeams(teams);

                const spotsByTeam: Record<number, TeamSpotsByStage> = {};
                const routinesByTeam: Record<number, TeamAutoRoutines> = {};

                data.forEach((entry) => {
                    const teamNumber = entry.teamNumber;
                    if (!teamNumber || !isRecord(entry.gameData)) return;

                    const autoPath = isRecord(entry.gameData.auto)
                        ? entry.gameData.auto.autoPath
                        : undefined;
                    const teleopPath = isRecord(entry.gameData.teleop)
                        ? entry.gameData.teleop.teleopPath
                        : undefined;

                    const autoSpots = extractStageSpotsFromPath(autoPath);
                    const teleopSpots = extractStageSpotsFromPath(teleopPath);

                    if (!spotsByTeam[teamNumber]) {
                        spotsByTeam[teamNumber] = {
                            autonomous: { shooting: [], passing: [] },
                            teleop: { shooting: [], passing: [] },
                        };
                    }

                    if (!routinesByTeam[teamNumber]) {
                        routinesByTeam[teamNumber] = { scouted: [], reported: [] };
                    }
                    const teamRoutines = routinesByTeam[teamNumber];
                    if (!teamRoutines) return;

                    spotsByTeam[teamNumber].autonomous.shooting.push(...autoSpots.shooting);
                    spotsByTeam[teamNumber].autonomous.passing.push(...autoSpots.passing);
                    spotsByTeam[teamNumber].teleop.shooting.push(...teleopSpots.shooting);
                    spotsByTeam[teamNumber].teleop.passing.push(...teleopSpots.passing);

                    const scoutedActions = extractRoutineActionsFromPath(autoPath);
                    if (scoutedActions.length > 0) {
                        const startPositionRaw = isRecord(entry.gameData.auto)
                            ? entry.gameData.auto.startPosition
                            : undefined;
                        const startLabel = getStartLabel(startPositionRaw);

                        routinesByTeam[teamNumber].scouted.push({
                            id: `scouted-${entry.id}`,
                            teamNumber,
                            source: 'scouted',
                            label: `Match ${entry.matchNumber}`,
                            startPosition: START_LABEL_TO_INDEX[startLabel],
                            startLabel,
                            actions: scoutedActions,
                            matchNumber: entry.matchNumber,
                            allianceColor: entry.allianceColor,
                        });
                    }
                });

                const pitEntries = await loadAllPitScoutingEntries();
                const latestPitByTeam = getMostRecentPitEntriesByTeam(pitEntries);

                Object.entries(latestPitByTeam).forEach(([teamKey, pitEntry]) => {
                    const teamNumber = Number(teamKey);
                    if (!teamNumber || !isRecord(pitEntry.gameData)) return;

                    const reportedRaw = pitEntry.gameData.reportedAutosByStart;
                    if (!isRecord(reportedRaw)) return;

                    if (!routinesByTeam[teamNumber]) {
                        routinesByTeam[teamNumber] = { scouted: [], reported: [] };
                    }
                    const teamRoutines = routinesByTeam[teamNumber];
                    if (!teamRoutines) return;

                    START_POSITION_LABELS.forEach((startLabel) => {
                        const startAutosRaw = reportedRaw[startLabel];
                        if (!Array.isArray(startAutosRaw)) return;

                        startAutosRaw.forEach((auto, index) => {
                            if (!isRecord(auto)) return;

                            const actions = extractRoutineActionsFromPath(auto.actions);
                            if (actions.length === 0) return;

                            const autoId = typeof auto.id === 'string' && auto.id.trim()
                                ? auto.id
                                : `${pitEntry.id}-${startLabel}-${index}`;
                            const name = typeof auto.name === 'string' && auto.name.trim()
                                ? auto.name.trim()
                                : `${startLabel} Auto ${index + 1}`;

                            teamRoutines.reported.push({
                                id: `reported-${autoId}`,
                                teamNumber,
                                source: 'reported',
                                label: name,
                                startPosition: START_LABEL_TO_INDEX[startLabel],
                                startLabel,
                                actions,
                            });
                        });
                    });
                });

                Object.values(routinesByTeam).forEach((teamRoutines) => {
                    teamRoutines.scouted.sort((a, b) => a.label.localeCompare(b.label));
                    teamRoutines.reported.sort((a, b) => a.label.localeCompare(b.label));
                });

                setTeamSpotsByTeam(spotsByTeam);
                setTeamAutoRoutinesByTeam(routinesByTeam);
            } catch (error) {
                console.error("Error loading scouting data:", error);
            }
        };

        const loadConfirmedAlliances = () => {
            try {
                const savedAlliances = localStorage.getItem("confirmedAlliances");
                if (savedAlliances) {
                    setConfirmedAlliances(JSON.parse(savedAlliances));
                }
            } catch (error) {
                console.error("Error loading confirmed alliances:", error);
            }
        };

        loadData();
        loadConfirmedAlliances();
    }, []);

    useEffect(() => {
        setSelectedAutoRoutineBySlot((prevSelections) =>
            selectedTeams.map((teamNumber, slotIndex) => {
                if (!teamNumber) return null;

                const routines = teamAutoRoutinesByTeam[teamNumber];
                const previousSelection = prevSelections[slotIndex] ?? null;

                if (routineSelectionExists(routines, previousSelection)) {
                    return previousSelection;
                }

                return null;
            })
        );
    }, [selectedTeams, teamAutoRoutinesByTeam]);

    // Debounced match lookup
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (matchNumber.trim()) {
                lookupMatchTeams(matchNumber);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [matchNumber, lookupMatchTeams]);

    const handleTeamChange = (index: number, teamNumber: number | null) => {
        const newSelectedTeams = [...selectedTeams];
        newSelectedTeams[index] = teamNumber;
        applySelectedTeams(newSelectedTeams);
    };

    const getTeamAutoRoutines = useCallback((teamNumber: number | null, source?: AutoRoutineSource): StrategyAutoRoutine[] => {
        if (!teamNumber) return [];

        const teamRoutines = teamAutoRoutinesByTeam[teamNumber] ?? EMPTY_TEAM_AUTO_ROUTINES;
        if (source === 'scouted') {
            return teamRoutines.scouted;
        }

        if (source === 'reported') {
            return teamRoutines.reported;
        }

        return [...teamRoutines.scouted, ...teamRoutines.reported];
    }, [teamAutoRoutinesByTeam]);

    const getSelectedAutoRoutineForSlot = useCallback((slotIndex: number): StrategyAutoRoutine | null => {
        const selection = selectedAutoRoutineBySlot[slotIndex] ?? null;
        const teamNumber = selectedTeams[slotIndex] ?? null;
        if (!teamNumber) return null;
        if (!selection) return null;

        const teamRoutines = teamAutoRoutinesByTeam[teamNumber] ?? EMPTY_TEAM_AUTO_ROUTINES;
        const sourceList = selection.source === 'reported' ? teamRoutines.reported : teamRoutines.scouted;
        return sourceList.find((routine) => routine.id === selection.routineId) ?? null;
    }, [selectedAutoRoutineBySlot, selectedTeams, teamAutoRoutinesByTeam]);

    const getSelectedAutoRoutineSelectionForSlot = useCallback((slotIndex: number): AutoRoutineSelection | null => {
        return selectedAutoRoutineBySlot[slotIndex] ?? null;
    }, [selectedAutoRoutineBySlot]);

    const setSelectedAutoRoutineForSlot = useCallback((slotIndex: number, selection: AutoRoutineSelection | null) => {
        setSelectedAutoRoutineBySlot((prev) => {
            const next = [...prev];
            next[slotIndex] = selection;
            return next;
        });
    }, []);

    const getTeamSpots = useCallback((teamNumber: number | null, stageId: StrategyStageId): TeamStageSpots => {
        if (!teamNumber) return EMPTY_SPOTS;

        const teamSpots = teamSpotsByTeam[teamNumber];
        if (!teamSpots) return EMPTY_SPOTS;

        if (stageId === 'autonomous') {
            return teamSpots.autonomous;
        }

        if (stageId === 'teleop' || stageId === 'endgame') {
            return teamSpots.teleop;
        }

        return EMPTY_SPOTS;
    }, [teamSpotsByTeam]);

    const applyAllianceToRed = (allianceId: string) => {
        setSelectedRedAlliance(allianceId === "none" ? "" : allianceId);
        if (allianceId === "none") return;

        const alliance = confirmedAlliances.find(a => a.id.toString() === allianceId);
        if (!alliance) return;

        const newSelectedTeams = [...selectedTeams];
        newSelectedTeams[0] = alliance.captain || null;
        newSelectedTeams[1] = alliance.pick1 || null;
        newSelectedTeams[2] = alliance.pick2 || null;
        applySelectedTeams(newSelectedTeams);
    };

    const applyAllianceToBlue = (allianceId: string) => {
        setSelectedBlueAlliance(allianceId === "none" ? "" : allianceId);
        if (allianceId === "none") return;

        const alliance = confirmedAlliances.find(a => a.id.toString() === allianceId);
        if (!alliance) return;

        const newSelectedTeams = [...selectedTeams];
        newSelectedTeams[3] = alliance.captain || null;
        newSelectedTeams[4] = alliance.pick1 || null;
        newSelectedTeams[5] = alliance.pick2 || null;
        applySelectedTeams(newSelectedTeams);
    };

    return {
        // State
        selectedTeams,
        availableTeams,
        matchNumber,
        isLookingUpMatch,
        confirmedAlliances,
        selectedBlueAlliance,
        selectedRedAlliance,

        // Functions
        getTeamStats,
        getTeamSpots,
        getTeamAutoRoutines,
        getSelectedAutoRoutineForSlot,
        getSelectedAutoRoutineSelectionForSlot,
        setSelectedAutoRoutineForSlot,
        handleTeamChange,
        applyAllianceToRed,
        applyAllianceToBlue,
        setMatchNumber
    };
};
