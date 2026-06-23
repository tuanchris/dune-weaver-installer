import React from "react";
import "./SetupWizard.scss";

export type WizardStep =
    | "flash"
    | "table"
    | "config"
    | "direction-x"
    | "direction-y"
    | "homing"
    | "verify"
    | "led"
    | "startup"
    | "complete";

export const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
    { key: "flash", label: "Flash" },
    { key: "table", label: "Table" },
    { key: "config", label: "Config" },
    { key: "direction-x", label: "Direction X" },
    { key: "direction-y", label: "Direction Y" },
    { key: "homing", label: "Homing" },
    { key: "verify", label: "Verify" },
    { key: "led", label: "LEDs" },
    { key: "startup", label: "Startup" },
    { key: "complete", label: "Done" }
];

export const getStepIndex = (step: WizardStep): number =>
    WIZARD_STEPS.findIndex((s) => s.key === step);

type Props = {
    current: WizardStep;
    onSelect?: (step: WizardStep) => void;
};

const StepIndicator = ({ current, onSelect }: Props) => {
    const currentIndex = getStepIndex(current);

    return (
        <div className="setup-step-indicator">
            {WIZARD_STEPS.map((s, i) => {
                const done = i < currentIndex;
                const active = i === currentIndex;
                const clickable = onSelect && i <= currentIndex;
                return (
                    <React.Fragment key={s.key}>
                        <button
                            type="button"
                            title={s.label}
                            disabled={!clickable}
                            onClick={() => clickable && onSelect?.(s.key)}
                            className={
                                "setup-step-dot" +
                                (done ? " done" : "") +
                                (active ? " active" : "")
                            }
                        >
                            {done ? "✓" : i + 1}
                        </button>
                        {i < WIZARD_STEPS.length - 1 && (
                            <span
                                className={
                                    "setup-step-line" + (done ? " done" : "")
                                }
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default StepIndicator;
