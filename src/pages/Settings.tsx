import { useEffect, useState } from "react";
import type { SelectedFolder } from "../types/preferences";
import { usePreferences, preferenceUpdater } from "../contexts/PreferencesContext";
import { SessionType, FixedTime, CustomSchedule, IntervalGroup } from "../types/session";
import {
    ToggleButton,
    InputButton,
    ActionButton,
    ScheduleButton,
    IntervalGroupButton,
    NewIntervalButton,
} from "../components/buttons";
import { formatFileSize } from "../utils/formatters";
import { saveLastFolder, getLastFolder } from "../utils/indexDB";
import { sessionTypeToDescription } from "../utils/session";
import { useApp } from "../contexts/AppContext";
import { DragAndDropOverlay, Hero } from "../components/style";

export default function Settings({}) {
    const { preferences } = usePreferences();
    const { selectedFolder, setSelectedFolder, setImageFiles, setRunApp } = useApp();
    const runApp = () => {
        if (!selectedFolder) {
            alert("Please select a folder first");
            return;
        }
        if (preferences.fixedTime === FixedTime.Other && preferences.customFixedTime === null) {
            alert("Please enter a custom fixed time");
            return;
        }
        setRunApp(true);
    };

    const updateFolderData = async (dirHandle: FileSystemDirectoryHandle) => {
        const files = await FileScanner(dirHandle);
        if (files.length === 0) {
            alert("No image files found in the selected folder");
            return;
        }
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        setSelectedFolder({
            name: dirHandle.name,
            items: files.length,
            totalSize: totalSize,
            dirHandle: dirHandle,
        });
        setImageFiles(files);
    };

    // Uses the showDirectoryPicker API to select a folder
    const handleFolderSelect = async () => {
        if (!("showDirectoryPicker" in window)) {
            console.error(
                "Cannot select folder since the showDirectoryPicker API is not supported in your browser/OS."
            );
            return;
        }
        try {
            const dirHandle = await window.showDirectoryPicker();
            await updateFolderData(dirHandle);
            await saveLastFolder(dirHandle);
        } catch (err) {
            console.error("Error selecting folder:", err);
            if (err instanceof Error && err.name !== "AbortError") {
                alert("An error occurred while selecting the folder");
            }
        }
    };

    // Uses the file input element to select files, used as a fallback for browsers that don't support the showDirectoryPicker API
    const handleFileSelect = async () => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = "image/*";

        input.onchange = async (e: Event) => {
            const target = e.target as HTMLInputElement;
            const files = Array.from(target.files || []).filter((file) => file.type.startsWith("image/"));

            if (files.length === 0) {
                alert("No image files selected");
                return;
            }

            const totalSize = files.reduce((sum, file) => sum + file.size, 0);
            setSelectedFolder({
                name: "Selected Files",
                items: files.length,
                totalSize: totalSize,
                dirHandle: null,
            });
            setImageFiles(files);
        };
        input.click();
    };

    const restoreLastFolder = async () => {
        try {
            // Retrieve handle from IndexedDB
            const handle = await getLastFolder();
            if (!handle) {
                console.log("No saved handle found");
                return;
            }
            await updateFolderData(handle);
        } catch (err) {
            console.log("Could not restore last folder:", err);
        }
    };

    // Try to restore the last folder on component mount
    useEffect(() => {
        restoreLastFolder();
    }, []);

    // DRAG AND DROP
    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        document.body.classList.remove("drag-active");
        const items = Array.from(e.dataTransfer?.files || []).filter((file): file is File =>
            file.type.startsWith("image/")
        );
        if (items.length === 0) {
            alert("No image files found in drop");
            return;
        }
        const totalSize = items.reduce((sum, file) => sum + file.size, 0);
        setSelectedFolder({
            name: "Dropped Files",
            items: items.length,
            totalSize: totalSize,
            dirHandle: null,
        });
        setImageFiles(items);
    };
    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
    };
    const handleDragEnter = (e: DragEvent) => {
        e.preventDefault();
        document.body.classList.add("drag-active");
    };
    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault();
        if (!e.relatedTarget) {
            document.body.classList.remove("drag-active");
        }
    };
    useEffect(() => {
        document.addEventListener("drop", handleDrop);
        document.addEventListener("dragover", handleDragOver);
        document.addEventListener("dragenter", handleDragEnter);
        document.addEventListener("dragleave", handleDragLeave);

        return () => {
            document.removeEventListener("drop", handleDrop);
            document.removeEventListener("dragover", handleDragOver);
            document.removeEventListener("dragenter", handleDragEnter);
            document.removeEventListener("dragleave", handleDragLeave);
            document.body.classList.remove("drag-active");
        };
    }, []);

    return (
        <>
            <DragAndDropOverlay />
            <div className="w-screen flex justify-center px-6">
                <div className="w-full h-screen max-w-2xl p-6 flex flex-col space-y-4">
                    <Hero />
                    {"showDirectoryPicker" in window ? (
                        <ActionButton onClick={handleFolderSelect} label="Select Folder" colour="bg-blue-600" />
                    ) : (
                        <ActionButton onClick={handleFileSelect} label="Select Files" colour="bg-blue-600" />
                    )}
                    <FolderDetails selectedFolder={selectedFolder} />
                    <hr className="border-gray-300 dark:border-gray-700" />
                    <SessionToggle />
                    <SessionTypeCard />
                    <ActionButton onClick={runApp} label="Start" colour="bg-green-600" />
                </div>
            </div>
        </>
    );
}

async function FileScanner(dirHandle: FileSystemDirectoryHandle): Promise<File[]> {
    const files: File[] = [];
    for await (const entry of dirHandle.values()) {
        if (entry.kind === "file") {
            const fileHandle = entry as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            if (file.type.startsWith("image/")) {
                files.push(file);
            }
        }
    }
    return files;
}

function SessionToggle({}) {
    const { preferences, updatePreferences } = usePreferences();
    const updateSessionType = preferenceUpdater("sessionType", updatePreferences);
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold dark:text-white">Session Type</h2>
            <div className="flex gap-2">
                {Object.values(SessionType).map((type) => (
                    <ToggleButton
                        key={type}
                        label={type}
                        isSelected={preferences.sessionType === type}
                        onClick={() => updateSessionType(type)}
                    />
                ))}
            </div>
        </div>
    );
}

function FolderDetails({ selectedFolder }: { selectedFolder: SelectedFolder | null }) {
    if (!selectedFolder) {
        return (
            <div className="text-gray-500 dark:text-gray-400">
                <p>{`No ${"showDirectoryPicker" in window ? "folder" : "files"} selected`}</p>
                <p> Click the button, or drag and drop</p>
            </div>
        );
    }
    return (
        <div>
            <p className="dark:text-white font-medium">{selectedFolder.name}</p>
            <p className="dark:text-white text-sm">
                {selectedFolder.items} items • {formatFileSize(selectedFolder.totalSize)}
            </p>
        </div>
    );
}

function SessionTypeCard({}) {
    const { preferences } = usePreferences();
    let cardContent = (
        <div className="flex flex-col h-full items-center justify-center">
            <p className="text-white whitespace-pre-line text-center">
                {sessionTypeToDescription(preferences.sessionType)}
            </p>
        </div>
    );
    switch (preferences.sessionType) {
        case SessionType.Fixed:
            cardContent = <FixedCard />;
            break;
        case SessionType.Schedule:
            cardContent = <ScheduleCard />;
            break;
    }
    return <div className="overflow-y-auto space-y-4 flex flex-col min-h-24">{cardContent}</div>;
}

function FixedCard({}) {
    const { preferences, updatePreferences } = usePreferences();
    const updateFixedTime = preferenceUpdater("fixedTime", updatePreferences);
    const updateCustomFixedTime = preferenceUpdater("customFixedTime", updatePreferences);
    return (
        <>
            <h2 className="text-xl font-semibold dark:text-white">Fixed Intervals</h2>
            <div className="flex flex-wrap gap-2">
                {Object.values(FixedTime).map((time) => {
                    if (time === FixedTime.Other) {
                        return (
                            <InputButton
                                key={time}
                                value={preferences.customFixedTime ?? ""}
                                onClick={() => updateFixedTime(FixedTime.Other)}
                                onChange={(value) => {
                                    updateFixedTime(FixedTime.Other);
                                    updateCustomFixedTime(typeof value === "number" ? value : null);
                                }}
                                placeholder="Custom (s)"
                                isSelected={preferences.fixedTime === FixedTime.Other}
                            />
                        );
                    }
                    return (
                        <ToggleButton
                            key={time}
                            label={time}
                            isSelected={preferences.fixedTime === time}
                            onClick={() => updateFixedTime(time)}
                        />
                    );
                })}
            </div>
        </>
    );
}

function ScheduleCard({}) {
    const { preferences, updatePreferences } = usePreferences();
    const updateSchedules = preferenceUpdater("schedules", updatePreferences);
    const schedules = preferences.schedules.map((schedule) => CustomSchedule.fromObject(schedule));
    const { selectedSchedule, setSelectedSchedule } = useApp();
    const [showDetails, setShowDetails] = useState(false);
    const [isNarrowScreen, setIsNarrowScreen] = useState(window.innerWidth < 768);
    useEffect(() => {
        setSelectedSchedule(schedules[0]);
        checkWidth();
        const handleResize = () => checkWidth();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const checkWidth = () => {
        setIsNarrowScreen(window.innerWidth < 768);
    };
    if (isNarrowScreen) {
        return (
            <ScheduleCardNarrow
                schedules={schedules}
                selectedSchedule={selectedSchedule}
                setSelectedSchedule={setSelectedSchedule}
                showDetails={showDetails}
                setShowDetails={setShowDetails}
                updateSchedules={updateSchedules}
            />
        );
    }
    return (
        <ScheduleCardWide
            schedules={schedules}
            selectedSchedule={selectedSchedule}
            setSelectedSchedule={setSelectedSchedule}
            updateSchedules={updateSchedules}
        />
    );
}
interface ScheduleCardNarrowProps {
    schedules: CustomSchedule[];
    selectedSchedule: CustomSchedule;
    setSelectedSchedule: React.Dispatch<React.SetStateAction<CustomSchedule>>;
    showDetails: boolean;
    setShowDetails: React.Dispatch<React.SetStateAction<boolean>>;
    updateSchedules: (value: CustomSchedule[]) => void;
}
function ScheduleCardNarrow({
    schedules,
    selectedSchedule,
    setSelectedSchedule,
    showDetails,
    setShowDetails,
    updateSchedules,
}: ScheduleCardNarrowProps) {
    return (
        <div className="w-full">
            {!showDetails ? (
                <ScheduleSelector
                    schedules={schedules}
                    selectedSchedule={selectedSchedule}
                    setSelectedSchedule={setSelectedSchedule}
                    updateSchedules={updateSchedules}
                    onEdit={() => setShowDetails(true)}
                    narrowMode={true}
                />
            ) : (
                <ScheduleDetails
                    schedules={schedules}
                    selectedSchedule={selectedSchedule}
                    updateSchedules={updateSchedules}
                    onSave={() => setShowDetails(false)}
                />
            )}
        </div>
    );
}
interface ScheduleCardWideProps {
    schedules: CustomSchedule[];
    selectedSchedule: CustomSchedule;
    setSelectedSchedule: React.Dispatch<React.SetStateAction<CustomSchedule>>;
    updateSchedules: (value: CustomSchedule[]) => void;
}
function ScheduleCardWide({
    schedules,
    selectedSchedule,
    setSelectedSchedule,
    updateSchedules,
}: ScheduleCardWideProps) {
    return (
        <div className="w-full grid grid-cols-2 gap-4">
            <ScheduleSelector
                schedules={schedules}
                selectedSchedule={selectedSchedule}
                setSelectedSchedule={setSelectedSchedule}
                updateSchedules={updateSchedules}
            />
            <ScheduleDetails
                schedules={schedules}
                selectedSchedule={selectedSchedule}
                updateSchedules={updateSchedules}
            />
        </div>
    );
}

interface ScheduleSelectorProps {
    schedules: CustomSchedule[];
    selectedSchedule: CustomSchedule;
    setSelectedSchedule: React.Dispatch<React.SetStateAction<CustomSchedule>>;
    updateSchedules: (value: CustomSchedule[]) => void;
    onEdit?: () => void;
    narrowMode?: boolean;
}
function ScheduleSelector({
    schedules,
    selectedSchedule,
    setSelectedSchedule,
    updateSchedules,
    onEdit = () => {},
    narrowMode = false,
}: ScheduleSelectorProps) {
    const addNewSchedule = () => {
        const newSchedule = new CustomSchedule("Custom Schedule " + schedules.length, [new IntervalGroup(30000, 5)]);
        const updatedSchedules = [...schedules, newSchedule];
        updateSchedules(updatedSchedules);
        setSelectedSchedule(newSchedule);
    };
    const deleteSchedule = (index: number) => {
        const scheduleToDelete = schedules[index];
        const updatedSchedules = schedules.filter((_, i) => i !== index);
        updateSchedules(updatedSchedules);
        // if deleted schedule is selected, select the default schedule
        if (selectedSchedule.equals(scheduleToDelete)) {
            setSelectedSchedule(schedules[0]);
        }
    };
    return (
        <div
            className={`space-y-4
            ${narrowMode ? "" : "pr-4 border-r border-gray-300 dark:border-gray-700"}
        `}
        >
            <h2 className="text-xl font-semibold dark:text-white">Scheduled Intervals</h2>
            <div className="space-y-2">
                {schedules.map((schedule, index) => (
                    <ScheduleButton
                        key={index}
                        schedule={schedule}
                        isSelected={selectedSchedule.equals(schedule)}
                        narrowMode={narrowMode}
                        setter={() => setSelectedSchedule(schedule)}
                        deleter={() => deleteSchedule(index)}
                        editer={() => onEdit()}
                    />
                ))}
                <div
                    className="w-full p-3 text-center border rounded-lg bg-zinc-900
                    hover:bg-gray-800 border-gray-700 dark:text-white"
                    onClick={addNewSchedule}
                >
                    + Create New Schedule
                </div>
            </div>
        </div>
    );
}

interface ScheduleDetailsProps {
    schedules: CustomSchedule[];
    selectedSchedule: CustomSchedule;
    updateSchedules: (value: CustomSchedule[]) => void;
    onSave?: () => void;
}
function ScheduleDetails({ schedules, selectedSchedule, updateSchedules, onSave }: ScheduleDetailsProps) {
    const [tempSchedule, setTempSchedule] = useState(selectedSchedule);
    const intervals = tempSchedule.intervals.map((interval) => IntervalGroup.fromObject(interval));

    const saveNewSchedule = () => {
        schedules[schedules.findIndex((s) => s.equals(selectedSchedule))] = tempSchedule;
        updateSchedules(schedules);
    };
    useEffect(() => {
        setTempSchedule(selectedSchedule);
    }, [selectedSchedule]);
    return (
        <div className={`space-y-4`}>
            <div className="flex justify-center">
                <input
                    value={tempSchedule.title}
                    onChange={(e) => setTempSchedule(new CustomSchedule(e.target.value, intervals))}
                    disabled={tempSchedule.isDefault}
                    className="text-xl font-medium text-white bg-transparent border-none outline-none focus:outline-none text-center"
                />
            </div>
            <div className="">
                {intervals.map((interval, index) => (
                    <IntervalGroupButton
                        key={index}
                        interval={interval}
                        index={index}
                        tempSchedule={tempSchedule}
                        setTempSchedule={setTempSchedule}
                    />
                ))}
                {!tempSchedule.isDefault && (
                    <NewIntervalButton tempSchedule={tempSchedule} setTempSchedule={setTempSchedule} />
                )}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Total time: {tempSchedule.totalTimeString}</div>
            {!tempSchedule.isDefault && (
                <ActionButton
                    onClick={() => {
                        saveNewSchedule();
                        onSave?.();
                    }}
                    label="Save Changes"
                    colour="bg-green-600/50"
                />
            )}
        </div>
    );
}
