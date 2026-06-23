import React, {
    useContext,
    useEffect,
    useMemo,
    useState,
    useCallback
} from "react";
import { useNavigate } from "react-router-dom";
import { Card, Col, Form, Row } from "react-bootstrap";
import { Button, Spinner } from "../../../components";
import { ButtonType } from "../../../components/button/Button";
import AlertMessage from "../../../components/alertmessage/AlertMessage";
import PageTitle from "../../../components/pagetitle/PageTitle";
import SelectField from "../../../components/fields/SelectField";
import Firmware from "../../../panels/firmware/Firmware";
import InstallerModal from "../../../modals/installermodal/InstallerModal";
import usePageView from "../../../hooks/usePageView";
import { ControllerServiceContext } from "../../../context/ControllerServiceContext";
import {
    Command,
    ControllerStatus,
    FirmwareChoice,
    GithubRelease,
    GithubReleaseManifest,
    GithubService
} from "../../../services";
import Page from "../../../model/Page";
import { fileDataToConfig } from "../../../utils/utils";
import {
    AxisHomingSettings,
    HomingMode,
    TABLE_TYPES,
    TableTypeId,
    WizardConfig,
    applyAxisHoming,
    applyStartupHoming,
    buildConfig,
    dumpConfig,
    getAxisHoming,
    getTableType,
    homingModeCommand,
    toggleDirection,
    uploadAndActivate
} from "../../../utils/wizardConfig";
import { waitForIdle } from "../../../utils/starPattern";
import StepIndicator, {
    WIZARD_STEPS,
    WizardStep,
    getStepIndex
} from "./StepIndicator";
import "./SetupWizard.scss";

// ─── Persisted wizard state ──────────────────────────────────────────────────

type PersistedState = {
    step: WizardStep;
    hostname: string;
    tableTypeId: TableTypeId | "";
    numLeds: number;
    configYaml: string;
    homingMode: HomingMode;
    homeOnStartup: boolean;
};

const STORAGE_KEY = "dw-setup-wizard";

const DEFAULT_STATE: PersistedState = {
    step: "flash",
    hostname: "",
    tableTypeId: "",
    numLeds: 49,
    configYaml: "",
    homingMode: "sensor",
    homeOnStartup: true
};

const loadState = (): PersistedState => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        const state = saved
            ? { ...DEFAULT_STATE, ...JSON.parse(saved) }
            : { ...DEFAULT_STATE };
        // Guard against steps from an older wizard version that no longer exist.
        if (!WIZARD_STEPS.some((s) => s.key === state.step)) {
            state.step = DEFAULT_STATE.step;
        }
        // Migrate the retired "none" homing mode (no switches) to "crash".
        if (state.homingMode !== "sensor" && state.homingMode !== "crash") {
            state.homingMode = "crash";
        }
        return state;
    } catch {
        return { ...DEFAULT_STATE };
    }
};

const LED_EFFECTS = [
    { name: "Off", value: "off" },
    { name: "Static", value: "static" },
    { name: "Rainbow", value: "rainbow" },
    { name: "Comet", value: "comet" },
    { name: "Fire", value: "fire" },
    { name: "Sparkle", value: "sparkle" }
];

const LED_PALETTES = [
    { name: "Rainbow", value: "rainbow" },
    { name: "Ocean", value: "ocean" },
    { name: "Lava", value: "lava" },
    { name: "Forest", value: "forest" },
    { name: "Party", value: "party" },
    { name: "Sunset", value: "sunset" }
];

const LED_COLOR_ORDERS = [
    { name: "RGB — WS2815 / WS2811", value: "RGB" },
    { name: "GRB — WS2812 / WS2812B", value: "GRB" },
    { name: "BGR — some WS2811 variants", value: "BGR" },
    { name: "RBG — rare variant", value: "RBG" },
    { name: "GBR — rare variant", value: "GBR" },
    { name: "BRG — rare variant", value: "BRG" }
];

// Reusable explanation of the polar coordinate convention.
const CoordinateGuide = () => (
    <Form.Text className="text-muted d-block mb-3">
        Coordinate guide: <code>X</code> is in radians — <code>X 6.28</code>{" "}
        (2π) moves one full revolution clockwise. <code>Y</code> is rho —{" "}
        <code>Y 1</code> moves from the center out to the perimeter.
    </Form.Text>
);

// Shared prop bag passed to each step.
type StepProps = {
    state: PersistedState;
    update: (partial: Partial<PersistedState>) => void;
    goto: (step: WizardStep) => void;
    error?: string;
    setError: (message?: string) => void;
};

// ─── Step: Flash ─────────────────────────────────────────────────────────────

const FlashStep = ({ goto }: StepProps) => {
    const controllerService = useContext(ControllerServiceContext);
    const githubService = useMemo(() => new GithubService(), []);

    const [showModal, setShowModal] = useState(false);
    const [release, setRelease] = useState<GithubRelease>();
    const [manifest, setManifest] = useState<GithubReleaseManifest>();
    const [choice, setChoice] = useState<FirmwareChoice>();

    const alreadyFlashed = Boolean(controllerService?.version);

    return (
        <div>
            <h3>Flash the firmware</h3>
            <p>
                Select a firmware release and install it onto your board. Once
                flashing finishes and the board reconnects, the wizard will
                continue.
            </p>

            {alreadyFlashed && (
                <AlertMessage variant="info">
                    This board already runs DW firmware (
                    {controllerService?.version}). You can re-flash it or skip
                    ahead.
                    <div className="setup-actions">
                        <Button onClick={() => goto("table")}>
                            Skip flashing &amp; continue
                        </Button>
                    </div>
                </AlertMessage>
            )}

            {showModal && release && manifest && choice && (
                <InstallerModal
                    release={release}
                    manifest={manifest}
                    choice={choice}
                    onClose={() => {
                        setShowModal(false);
                        goto("table");
                    }}
                    onCancel={() => setShowModal(false)}
                />
            )}

            <Firmware
                githubService={githubService}
                onInstall={(rel, man, ch) => {
                    setRelease(rel);
                    setManifest(man);
                    setChoice(ch);
                    setShowModal(true);
                }}
            />
        </div>
    );
};

// ─── Step: Name & table type ─────────────────────────────────────────────────

const TableStep = ({ state, update, goto }: StepProps) => {
    const [name, setName] = useState(state.hostname);
    const [selected, setSelected] = useState<TableTypeId | "">(
        state.tableTypeId
    );

    // FluidNC hostnames: letters, digits and hyphens only.
    const sanitized = name.trim();
    const nameValid = /^[A-Za-z0-9-]{1,32}$/.test(sanitized);
    const valid = nameValid && !!selected;

    return (
        <div>
            <h3>Name your table &amp; pick its type</h3>
            <p>
                The name becomes the board&apos;s <code>hostname</code> — how it
                shows up on your network. The type determines the motor
                settings.
            </p>

            <Form.Group as={Row} className="mb-4">
                <Form.Label column sm="4">
                    Table name <span className="text-danger">*</span>
                </Form.Label>
                <Col sm="8">
                    <Form.Control
                        type="text"
                        required
                        value={name}
                        placeholder="Enter a name, e.g. DuneWeaver"
                        isInvalid={
                            name.length === 0 || (!nameValid && name.length > 0)
                        }
                        isValid={nameValid}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <Form.Text
                        className={
                            !nameValid && name.length > 0
                                ? "text-danger"
                                : "text-muted"
                        }
                    >
                        {!nameValid && name.length > 0
                            ? "Only letters, numbers and hyphens (1–32 characters)."
                            : "Required — give your table a name to continue."}
                    </Form.Text>
                </Col>
            </Form.Group>

            <h5>Table type</h5>
            {TABLE_TYPES.map((type) => (
                <div
                    key={type.id}
                    className={
                        "table-type-option" +
                        (selected === type.id ? " selected" : "")
                    }
                    onClick={() => setSelected(type.id)}
                >
                    <Form.Check
                        type="radio"
                        name="table-type"
                        label={type.label}
                        checked={selected === type.id}
                        onChange={() => setSelected(type.id)}
                    />
                </div>
            ))}

            <div className="setup-actions">
                <Button
                    buttonType={ButtonType.WARNING}
                    onClick={() => goto("flash")}
                >
                    Back
                </Button>
                <Button
                    disabled={!valid}
                    onClick={() => {
                        update({
                            hostname: sanitized,
                            tableTypeId: selected,
                            // Prefill LED count for the chosen table (60 LEDs/m).
                            numLeds: selected
                                ? getTableType(selected).defaultNumLeds
                                : DEFAULT_STATE.numLeds
                        });
                        goto("config");
                    }}
                >
                    Continue
                </Button>
            </div>
        </div>
    );
};

// ─── Step: Config (generate + upload + activate + restart) ───────────────────

const ConfigStep = ({ state, update, goto, error, setError }: StepProps) => {
    const controllerService = useContext(ControllerServiceContext);
    const [busy, setBusy] = useState(false);
    const tableType = state.tableTypeId
        ? getTableType(state.tableTypeId)
        : undefined;

    const onUpload = async () => {
        if (!controllerService || !tableType) return;
        setError(undefined);
        setBusy(true);
        try {
            const config = buildConfig(tableType.configText, {
                hostname: state.hostname,
                numLeds: state.numLeds,
                // Keep auto-home-on-startup OFF during setup so the board
                // doesn't home on every restart while we calibrate. The user's
                // real preference is applied at the end of the wizard.
                homeOnStartup: false
            });
            await uploadAndActivate(controllerService, config);
            // Persist the homing mode (sensor/crash) as a firmware NVS setting.
            await controllerService.send(
                new Command(homingModeCommand(state.homingMode)),
                5000
            );
            update({ configYaml: dumpConfig(config) });
            goto("direction-x");
        } catch (e) {
            setError(
                "Failed to upload configuration: " +
                    (e instanceof Error ? e.message : String(e))
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <h3>Create &amp; upload configuration</h3>
            <p>
                The wizard will generate a FluidNC config for the{" "}
                <strong>{tableType?.label}</strong> named{" "}
                <strong>{state.hostname}</strong>, upload it to the board, make
                it the active config and restart the controller.
            </p>

            <Card className="setup-card">
                <Card.Body>
                    <Card.Title>Homing preference</Card.Title>
                    <p>
                        How the table finds its zero position each time it
                        powers on.
                    </p>
                    <Form.Check
                        type="radio"
                        name="homing-mode"
                        id="homing-sensor"
                        label="Sensor homing — my table has limit switches"
                        checked={state.homingMode === "sensor"}
                        onChange={() => update({ homingMode: "sensor" })}
                    />
                    <Form.Check
                        type="radio"
                        name="homing-mode"
                        id="homing-crash"
                        label="Crash homing — no limit switches; drive into the center stop"
                        checked={state.homingMode === "crash"}
                        onChange={() => update({ homingMode: "crash" })}
                    />
                    <Form.Text className="text-muted">
                        {state.homingMode === "sensor"
                            ? "Uses the limit-switch homing cycle. You'll fine-tune each axis' homing next, then choose auto-home on startup as the final step."
                            : "The rho carriage drives blindly into its physical center stop and zeroes there — no switches or stall detection. You'll choose auto-home on startup as the final step."}
                    </Form.Text>
                </Card.Body>
            </Card>

            {error && <AlertMessage variant="danger">{error}</AlertMessage>}
            {busy ? (
                <AlertMessage variant="info">
                    Uploading config and restarting the controller… <Spinner />
                </AlertMessage>
            ) : (
                <div className="setup-actions">
                    <Button
                        buttonType={ButtonType.WARNING}
                        onClick={() => goto("table")}
                    >
                        Back
                    </Button>
                    <Button onClick={onUpload}>Upload &amp; restart</Button>
                </div>
            )}
        </div>
    );
};

// ─── Step: Direction test + fix (one axis per step) ──────────────────────────

const DIRECTION_AXIS = {
    x: {
        title: "X axis — rotation",
        prompt: (
            <>
                Send a small angular move. The ball should rotate{" "}
                <strong>clockwise</strong> (viewed from above).
            </>
        ),
        jog: "$J=G91 G21 X1 F200.0",
        confirmLabel: "✔ Moved clockwise",
        fixLabel: "✘ Moved counter-clockwise — fix & restart",
        next: "direction-y" as WizardStep
    },
    y: {
        title: "Y axis — radial",
        prompt: (
            <>
                Send a small radial move. The ball should move{" "}
                <strong>outward</strong> (toward the perimeter).
            </>
        ),
        jog: "$J=G91 G21 Y0.2 F200.0",
        confirmLabel: "✔ Moved outward",
        fixLabel: "✘ Moved inward — fix & restart",
        next: "homing" as WizardStep
    }
};

const DirectionAxisStep = ({
    axis,
    state,
    update,
    goto,
    error,
    setError
}: StepProps & { axis: "x" | "y" }) => {
    const controllerService = useContext(ControllerServiceContext);
    const [busy, setBusy] = useState(false);
    const cfg = DIRECTION_AXIS[axis];

    const run = async (fn: () => Promise<void>) => {
        if (!controllerService) return;
        setError(undefined);
        setBusy(true);
        try {
            await fn();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const jog = () =>
        run(async () => {
            // Clear any startup alarm so the relative jog is accepted. Homing
            // isn't required — these are relative moves and soft limits are off.
            await controllerService!.send(new Command("$X"), 5000);
            await controllerService!.send(new Command(cfg.jog), 30000);
        });

    const fix = () =>
        run(async () => {
            const config = fileDataToConfig(state.configYaml) as WizardConfig;
            toggleDirection(config, axis);
            await uploadAndActivate(controllerService!, config);
            update({ configYaml: dumpConfig(config) });
        });

    return (
        <div>
            <h3>Test motor direction — {axis.toUpperCase()} axis</h3>
            <p>
                Run the {axis.toUpperCase()}-axis direction test and tell the
                wizard whether the ball moved the expected way. If it&apos;s
                reversed the wizard flips it, re-uploads the config and restarts
                so you can re-test.
            </p>
            {error && <AlertMessage variant="danger">{error}</AlertMessage>}

            <Card className="setup-card">
                <Card.Body>
                    <Card.Title>{cfg.title}</Card.Title>
                    <p>{cfg.prompt}</p>
                    <CoordinateGuide />
                    <Button loading={busy} disabled={busy} onClick={jog}>
                        Send test move
                    </Button>
                    <div className="setup-actions">
                        <Button disabled={busy} onClick={() => goto(cfg.next)}>
                            {cfg.confirmLabel}
                        </Button>
                        <Button
                            buttonType={ButtonType.WARNING}
                            loading={busy}
                            disabled={busy}
                            onClick={fix}
                        >
                            {cfg.fixLabel}
                        </Button>
                    </div>
                </Card.Body>
            </Card>
        </div>
    );
};

const DirectionXStep = (props: StepProps) => (
    <DirectionAxisStep axis="x" {...props} />
);

const DirectionYStep = (props: StepProps) => (
    <DirectionAxisStep axis="y" {...props} />
);

// ─── Step: Homing (per-axis tuning, sensor homing only) ──────────────────────

const AXIS_LABELS: Record<"x" | "y", string> = {
    x: "X axis — rotation",
    y: "Y axis — radial"
};

type NumberFieldProps = {
    label: string;
    help: string;
    value: number;
    onChange: (value: number) => void;
    step?: number;
};

const HomingNumberField = ({
    label,
    help,
    value,
    onChange,
    step
}: NumberFieldProps) => (
    <Form.Group className="mb-3">
        <Form.Label>{label}</Form.Label>
        <Form.Control
            type="number"
            step={step ?? "any"}
            value={value}
            onChange={(e) =>
                onChange(e.target.value ? parseFloat(e.target.value) : 0)
            }
        />
        <Form.Text className="text-muted">
            {help}
            {step != null && ` Adjust in increments of ${step}.`}
        </Form.Text>
    </Form.Group>
);

const HomingStep = ({ state, update, goto, error, setError }: StepProps) => {
    const controllerService = useContext(ControllerServiceContext);
    const [busy, setBusy] = useState(false);

    // Walk the axes one at a time: home X first, then guide Y.
    const [subStep, setSubStep] = useState<"x" | "y">("x");
    const [xHomed, setXHomed] = useState(false);
    // Y guided sensor check.
    const [ySent, setYSent] = useState(false);
    const [ySensorOk, setYSensorOk] = useState(false);
    // Prompt shown on the X sub-step after the Y sensor failed to light.
    const [pulloffPrompt, setPulloffPrompt] = useState(false);

    const initial = useMemo(() => {
        const cfg = fileDataToConfig(state.configYaml) as WizardConfig;
        return {
            x: getAxisHoming(cfg, "x"),
            y: getAxisHoming(cfg, "y")
        };
    }, []);

    const [settings, setSettings] = useState<{
        x: AxisHomingSettings;
        y: AxisHomingSettings;
    }>(initial);

    // Skip this whole step when the table has no limit switches.
    useEffect(() => {
        if (state.homingMode !== "sensor") {
            goto("verify");
        }
    }, [state.homingMode, goto]);

    if (state.homingMode !== "sensor") {
        return null;
    }

    const setAxis = (axis: "x" | "y", patch: Partial<AxisHomingSettings>) =>
        setSettings((s) => ({ ...s, [axis]: { ...s[axis], ...patch } }));

    const run = async (fn: () => Promise<void>) => {
        if (!controllerService) return;
        setError(undefined);
        setBusy(true);
        try {
            await fn();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const saveAxis = async (axis: "x" | "y") => {
        const config = fileDataToConfig(state.configYaml) as WizardConfig;
        applyAxisHoming(config, axis, settings[axis]);
        await uploadAndActivate(controllerService!, config);
        update({ configYaml: dumpConfig(config) });
    };

    const saveAndHomeX = () =>
        run(async () => {
            await saveAxis("x");
            await controllerService!.send(new Command("$HX"), 60000);
            setXHomed(true);
            setPulloffPrompt(false);
        });

    // Jog Y toward its switch end based on the chosen direction: outward
    // (toward rho 1) for positive, inward (toward rho 0) for negative.
    const sendYTowardSwitch = () =>
        run(async () => {
            await controllerService!.send(new Command("$X"), 5000);
            const cmd = settings.y.positiveDirection
                ? "$J=G91 G21 Y1.1 F200.0"
                : "$J=G91 G21 Y-1.1 F200.0";
            await controllerService!.send(new Command(cmd), 30000);
            setYSent(true);
        });

    const saveAndHomeY = () =>
        run(async () => {
            await saveAxis("y");
            await controllerService!.send(new Command("$HY"), 60000);
        });

    const finishY = () =>
        run(async () => {
            await saveAxis("y");
            goto("verify");
        });

    const renderNumberFields = (axis: "x" | "y") => {
        const s = settings[axis];
        return (
            <>
                <HomingNumberField
                    label="Pull-off distance (mm)"
                    help="After the switch triggers, the axis backs off this far so the switch releases and is no longer held down."
                    value={s.pulloffMm}
                    onChange={(v) => setAxis(axis, { pulloffMm: v })}
                    step={0.05}
                />
                <HomingNumberField
                    label="Seek speed (mm/min)"
                    help="Fast rate used while first searching for the switch."
                    value={s.seekMmPerMin}
                    onChange={(v) => setAxis(axis, { seekMmPerMin: v })}
                />
                <HomingNumberField
                    label="Feed speed (mm/min)"
                    help="Slow rate for the precise final approach that sets the exact home position."
                    value={s.feedMmPerMin}
                    onChange={(v) => setAxis(axis, { feedMmPerMin: v })}
                />
                <HomingNumberField
                    label="Home position / MPos (mm)"
                    help="The machine coordinate this axis is assigned at the instant it finishes homing."
                    value={s.mposMm}
                    onChange={(v) => setAxis(axis, { mposMm: v })}
                    step={0.05}
                />
            </>
        );
    };

    const renderDirection = (axis: "x" | "y") => (
        <>
            <Form.Check
                type="switch"
                id={`homing-dir-${axis}`}
                className="mb-2"
                label="Home toward the positive direction"
                checked={settings[axis].positiveDirection}
                onChange={(e) => {
                    setAxis(axis, { positiveDirection: e.target.checked });
                    if (axis === "y") {
                        setYSent(false);
                        setYSensorOk(false);
                    }
                }}
            />
            <Form.Text className="text-muted d-block mb-3">
                The direction the axis drives to reach its limit switch. If the
                axis homes <em>away</em> from the switch, flip this.
            </Form.Text>
        </>
    );

    return (
        <div>
            <h3>Homing setup</h3>
            <p>
                Set up homing one axis at a time. Adjust a value, then save
                &amp; test — the wizard re-uploads the config, restarts the
                controller and exercises that axis so you can watch the result.
            </p>
            <CoordinateGuide />
            {error && <AlertMessage variant="danger">{error}</AlertMessage>}

            {subStep === "x" && (
                <Card className="setup-card">
                    <Card.Body>
                        <Card.Title>{AXIS_LABELS.x}</Card.Title>
                        {pulloffPrompt && (
                            <AlertMessage variant="warning">
                                The Y sensor didn&apos;t line up. Adjust the X
                                pull-off distance below and re-home X so the arm
                                lines up with the Y limit switch, then continue
                                to Y and test again.
                            </AlertMessage>
                        )}
                        {renderDirection("x")}
                        {renderNumberFields("x")}
                        <div className="setup-actions">
                            <Button
                                loading={busy}
                                disabled={busy}
                                onClick={saveAndHomeX}
                            >
                                Save &amp; test home X
                            </Button>
                            <Button
                                buttonType={ButtonType.WARNING}
                                disabled={busy || !xHomed}
                                onClick={() => setSubStep("y")}
                            >
                                X homed — continue to Y
                            </Button>
                        </div>
                        {!xHomed && (
                            <Form.Text className="text-muted d-block mt-2">
                                Test home X first; once it homes correctly,
                                continue to the Y axis.
                            </Form.Text>
                        )}
                    </Card.Body>
                </Card>
            )}

            {subStep === "y" && (
                <Card className="setup-card">
                    <Card.Body>
                        <Card.Title>{AXIS_LABELS.y}</Card.Title>
                        {renderDirection("y")}
                        <p className="text-muted">
                            Send the rho carriage toward its limit switch (
                            {settings.y.positiveDirection
                                ? "outward, toward the perimeter"
                                : "inward, toward the center"}
                            ) and watch the switch&apos;s LED.
                        </p>
                        <Button
                            loading={busy}
                            disabled={busy}
                            onClick={sendYTowardSwitch}
                        >
                            Send Y toward the switch
                        </Button>

                        {ySent && !ySensorOk && (
                            <div className="mt-3">
                                <p className="mb-2">
                                    Did the Y limit-switch sensor light up?
                                </p>
                                <div className="setup-actions">
                                    <Button
                                        disabled={busy}
                                        onClick={() => setYSensorOk(true)}
                                    >
                                        ✔ Yes — sensor lit
                                    </Button>
                                    <Button
                                        buttonType={ButtonType.WARNING}
                                        disabled={busy}
                                        onClick={() => {
                                            setError(undefined);
                                            setYSent(false);
                                            setPulloffPrompt(true);
                                            setSubStep("x");
                                        }}
                                    >
                                        ✘ No — it didn&apos;t light
                                    </Button>
                                </div>
                            </div>
                        )}

                        {ySensorOk && (
                            <div className="mt-3">
                                <AlertMessage variant="info">
                                    Sensor confirmed. Tune the Y homing
                                    settings, then save &amp; test the homing
                                    cycle. Repeat until Y homes cleanly.
                                </AlertMessage>
                                {renderNumberFields("y")}
                                <div className="setup-actions">
                                    <Button
                                        loading={busy}
                                        disabled={busy}
                                        onClick={saveAndHomeY}
                                    >
                                        Save &amp; test home Y
                                    </Button>
                                    <Button disabled={busy} onClick={finishY}>
                                        Y homing looks good — continue
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="setup-actions mt-2">
                            <Button
                                buttonType={ButtonType.WARNING}
                                disabled={busy}
                                onClick={() => setSubStep("x")}
                            >
                                Back to X
                            </Button>
                        </div>
                    </Card.Body>
                </Card>
            )}
        </div>
    );
};

// ─── Step: Verify (larger moves + DIP check) ─────────────────────────────────

const VerifyStep = ({ goto, error, setError }: StepProps) => {
    const controllerService = useContext(ControllerServiceContext);
    const [busy, setBusy] = useState(false);
    const [dipCheck, setDipCheck] = useState(false);
    const [homed, setHomed] = useState(false);

    // From the homed center: rho 1 = perimeter, 2π radians = one revolution.
    const radialCmds = ["$J=G91 G21 Y1 F200.0"];
    const rotationCmds = ["$J=G91 G21 X6.28 F200.0"];

    const run = (cmds: string[]) => async () => {
        if (!controllerService) return;
        setError(undefined);
        setBusy(true);
        try {
            for (const c of cmds) {
                await controllerService.send(new Command(c), 60000);
            }
            await waitForIdle(controllerService);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    // Home once (mode-aware) before running the two tests.
    const home = async () => {
        if (!controllerService) return;
        setError(undefined);
        setBusy(true);
        try {
            await controllerService.send(new Command("$Sand/Home"), 60000);
            await waitForIdle(controllerService);
            setHomed(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    if (dipCheck) {
        return (
            <div>
                <h3>Check DIP switches</h3>
                <AlertMessage variant="danger">
                    Turn the table off and disconnect power before touching any
                    hardware.
                </AlertMessage>
                <p>
                    If the ball moved only about half the expected distance, the
                    stepper-driver microstepping DIP switches are likely
                    misconfigured.
                </p>
                <ol>
                    <li>Power off the table completely.</li>
                    <li>Locate the DIP switches under each stepper driver.</li>
                    <li>Set all DIP switches to OFF.</li>
                    <li>Power back on, then re-run this verification.</li>
                </ol>
                <div className="setup-actions">
                    <Button onClick={() => setDipCheck(false)}>
                        Back to verification
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <h3>Verify movement</h3>
            <p>
                These larger moves confirm the calibration. Home the table
                first, then run the two tests from the center. A small inward
                spiral during rotation is normal (the axes are mechanically
                coupled).
            </p>
            {error && <AlertMessage variant="danger">{error}</AlertMessage>}
            <Card className="setup-card">
                <Card.Body>
                    <Card.Title>1. Home the table</Card.Title>
                    <p>
                        Home so the ball starts from the known center before the
                        tests.
                    </p>
                    <Button loading={busy} disabled={busy} onClick={home}>
                        {homed ? "Re-home" : "Home table"}
                    </Button>
                </Card.Body>
            </Card>
            <Card className="setup-card">
                <Card.Body>
                    <Card.Title>2. Radial sweep</Card.Title>
                    <p>
                        The ball should travel out from the center to the
                        perimeter.
                    </p>
                    <Button
                        loading={busy}
                        disabled={busy || !homed}
                        onClick={run(radialCmds)}
                    >
                        Run radial test
                    </Button>
                </Card.Body>
            </Card>
            <Card className="setup-card">
                <Card.Body>
                    <Card.Title>3. Full rotation</Card.Title>
                    <p>The ball should make roughly one full revolution.</p>
                    <Button
                        loading={busy}
                        disabled={busy || !homed}
                        onClick={run(rotationCmds)}
                    >
                        Run rotation test
                    </Button>
                </Card.Body>
            </Card>
            {!homed && (
                <Form.Text className="text-muted d-block mb-2">
                    Home the table to enable the tests.
                </Form.Text>
            )}
            <div className="setup-actions">
                <Button disabled={busy} onClick={() => goto("led")}>
                    Both look correct — continue
                </Button>
                <Button
                    buttonType={ButtonType.WARNING}
                    disabled={busy}
                    onClick={() => setDipCheck(true)}
                >
                    Only moved halfway
                </Button>
            </div>
        </div>
    );
};

// ─── Step: LED setup ─────────────────────────────────────────────────────────

const LedStep = ({ state, update, goto, error, setError }: StepProps) => {
    const controllerService = useContext(ControllerServiceContext);
    const [busy, setBusy] = useState(false);
    const [numLeds, setNumLeds] = useState(String(state.numLeds));
    const [colorOrder, setColorOrder] = useState(() => {
        try {
            return (
                (fileDataToConfig(state.configYaml) as WizardConfig).leds
                    ?.color_order ?? "RGB"
            );
        } catch {
            return "RGB";
        }
    });
    const [effect, setEffect] = useState("rainbow");
    const [palette, setPalette] = useState("rainbow");
    const [brightness, setBrightness] = useState(128);
    const [color, setColor] = useState("#ffaa00");

    const sendLed = async (cmd: string) => {
        if (!controllerService) return;
        await controllerService.send(new Command(cmd), 5000);
    };

    const applyEffect = async () => {
        setError(undefined);
        setBusy(true);
        try {
            await sendLed("$LED/Brightness=" + brightness);
            await sendLed("$LED/Color=" + color.replace("#", "").toUpperCase());
            await sendLed("$LED/Palette=" + palette);
            await sendLed("$LED/Effect=" + effect);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    // Light the whole strip a solid primary so the user can confirm each
    // channel maps to the right color (verifies the full color order).
    const showColor = (hex: string) => async () => {
        setError(undefined);
        setBusy(true);
        try {
            await sendLed("$LED/Brightness=128");
            await sendLed("$LED/Effect=static");
            await sendLed("$LED/Color=" + hex);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    // LED count and color order live in the config, so they need a restart.
    const applyConfig = async () => {
        if (!controllerService) return;
        const count = parseInt(numLeds, 10);
        if (!count || count < 1) {
            setError("Enter a valid LED count.");
            return;
        }
        setError(undefined);
        setBusy(true);
        try {
            const config = fileDataToConfig(state.configYaml) as WizardConfig;
            if (config.leds) {
                config.leds.num_leds = count;
                config.leds.color_order = colorOrder;
            }
            await uploadAndActivate(controllerService, config);
            update({ numLeds: count, configYaml: dumpConfig(config) });
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <h3>Set up the LEDs</h3>
            <p>
                Set how many LEDs your strip has and confirm the color order.
                The count is pre-filled for your table assuming a 60 LEDs/m
                strip — adjust it if yours differs. Count and color order are
                stored in the config (they re-upload and restart); effect, color
                and brightness apply instantly.
            </p>
            {error && <AlertMessage variant="danger">{error}</AlertMessage>}

            <Form.Group as={Row} className="mb-3">
                <Form.Label column sm="4">
                    LED count
                </Form.Label>
                <Col sm="8">
                    <Form.Control
                        type="number"
                        min={1}
                        value={numLeds}
                        onChange={(e) => setNumLeds(e.target.value)}
                    />
                </Col>
            </Form.Group>

            <SelectField
                label="Color order"
                options={LED_COLOR_ORDERS}
                value={colorOrder}
                setValue={setColorOrder}
                helpText="Channel order of your strip. Use the R/G/B tests below: if a color shows wrong (e.g. red looks green), pick the order that matches what you see, apply, and test again."
            />

            <Form.Text className="text-muted d-block mb-2">
                Test each channel — the strip should show the matching color.
                Apply the color order first if you change it.
            </Form.Text>
            <div className="setup-actions mb-3">
                <Button
                    loading={busy}
                    disabled={busy}
                    onClick={showColor("FF0000")}
                >
                    Test red
                </Button>
                <Button
                    loading={busy}
                    disabled={busy}
                    onClick={showColor("00FF00")}
                >
                    Test green
                </Button>
                <Button
                    loading={busy}
                    disabled={busy}
                    onClick={showColor("0000FF")}
                >
                    Test blue
                </Button>
                <Button loading={busy} disabled={busy} onClick={applyConfig}>
                    Apply count &amp; color order (restart)
                </Button>
            </div>

            <SelectField
                label="Effect"
                options={LED_EFFECTS}
                value={effect}
                setValue={setEffect}
            />
            <SelectField
                label="Palette"
                options={LED_PALETTES}
                value={palette}
                setValue={setPalette}
            />
            <Form.Group as={Row} className="mb-3">
                <Form.Label column sm="4">
                    Color
                </Form.Label>
                <Col sm="8">
                    <Form.Control
                        type="color"
                        value={color}
                        title="LED color"
                        onChange={(e) => setColor(e.target.value)}
                    />
                </Col>
            </Form.Group>
            <Form.Group as={Row} className="mb-3">
                <Form.Label column sm="4">
                    Brightness ({brightness})
                </Form.Label>
                <Col sm="8">
                    <Form.Range
                        min={0}
                        max={255}
                        value={brightness}
                        onChange={(e) => setBrightness(Number(e.target.value))}
                    />
                </Col>
            </Form.Group>

            <div className="setup-actions">
                <Button loading={busy} disabled={busy} onClick={applyEffect}>
                    Preview LEDs
                </Button>
                <Button disabled={busy} onClick={() => goto("startup")}>
                    Continue
                </Button>
            </div>
        </div>
    );
};

// ─── Step: Home on startup (final) ───────────────────────────────────────────

const StartupStep = ({ state, update, goto, error, setError }: StepProps) => {
    const controllerService = useContext(ControllerServiceContext);
    const [busy, setBusy] = useState(false);

    // Write the chosen auto-home preference into the config and restart once.
    const finish = async () => {
        if (!controllerService) return;
        setError(undefined);
        setBusy(true);
        try {
            const config = fileDataToConfig(state.configYaml) as WizardConfig;
            applyStartupHoming(config, state.homeOnStartup);
            await uploadAndActivate(controllerService, config);
            update({ configYaml: dumpConfig(config) });
            goto("complete");
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <h3>Home on startup</h3>
            <p>
                Finally, choose whether the table should home itself every time
                it powers on. This was kept off during setup so the board
                wouldn&apos;t auto-home while you calibrated.
            </p>
            {error && <AlertMessage variant="danger">{error}</AlertMessage>}
            <Card className="setup-card">
                <Card.Body>
                    <Form.Check
                        type="switch"
                        id="home-on-startup"
                        label="Home automatically on startup"
                        checked={state.homeOnStartup}
                        onChange={(e) =>
                            update({ homeOnStartup: e.target.checked })
                        }
                    />
                    <Form.Text className="text-muted">
                        When enabled the table homes (<code>$Sand/Home</code>,
                        honoring your {state.homingMode} homing mode) every time
                        it boots, so it always starts from a known position.
                    </Form.Text>
                </Card.Body>
            </Card>
            <div className="setup-actions">
                <Button loading={busy} disabled={busy} onClick={finish}>
                    Apply
                </Button>
            </div>
        </div>
    );
};

// ─── Step: Complete ──────────────────────────────────────────────────────────

const CompleteStep = ({ state }: StepProps) => {
    const navigate = useNavigate();
    return (
        <div>
            <h3>🎉 Setup complete</h3>
            <p>
                <strong>{state.hostname}</strong> is configured, calibrated and
                tested. A couple of things to finish off:
            </p>

            <Card className="setup-card">
                <Card.Body>
                    <Card.Title>Connect to WiFi</Card.Title>
                    <p>
                        Open the <strong>WiFi</strong> tab to join your table to
                        your network so you can control it from the Dune Weaver
                        app.
                    </p>
                    <Button onClick={() => navigate(Page.FLUIDNC_WIFI)}>
                        Go to WiFi tab
                    </Button>
                </Card.Body>
            </Card>

            <Card className="setup-card">
                <Card.Body>
                    <Card.Title>Prepare the pattern SD card</Card.Title>
                    <ol>
                        <li>
                            Format an SD card as <strong>FAT32</strong> — a{" "}
                            <strong>32&nbsp;GB</strong> card is recommended.
                        </li>
                        <li>
                            Copy the <code>patterns</code> folder from the Dune
                            Weaver repository onto the SD card.
                        </li>
                        <li>
                            Insert the SD card into the table&apos;s card slot.
                        </li>
                    </ol>
                </Card.Body>
            </Card>

            <div className="setup-actions">
                <Button onClick={() => navigate(Page.FLUIDNC_HOME)}>
                    Go to home
                </Button>
                <Button
                    buttonType={ButtonType.WARNING}
                    onClick={() => {
                        localStorage.removeItem(STORAGE_KEY);
                        navigate(0);
                    }}
                >
                    Run First Weave again
                </Button>
            </div>
        </div>
    );
};

// ─── Orchestrator ────────────────────────────────────────────────────────────

const STEP_COMPONENTS: Record<
    WizardStep,
    (props: StepProps) => React.ReactElement | null
> = {
    flash: FlashStep,
    table: TableStep,
    config: ConfigStep,
    "direction-x": DirectionXStep,
    "direction-y": DirectionYStep,
    homing: HomingStep,
    verify: VerifyStep,
    led: LedStep,
    startup: StartupStep,
    complete: CompleteStep
};

const SetupWizard = () => {
    usePageView("Setup");
    const controllerService = useContext(ControllerServiceContext);
    const [state, setState] = useState<PersistedState>(loadState);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [state]);

    const update = useCallback(
        (partial: Partial<PersistedState>) =>
            setState((s) => ({ ...s, ...partial })),
        []
    );

    const goto = useCallback(
        (step: WizardStep) => {
            setError(undefined);
            update({ step });
        },
        [update]
    );

    const startOver = useCallback(() => {
        if (
            !window.confirm(
                "Start First Weave over from the beginning? Your progress will be cleared."
            )
        ) {
            return;
        }
        localStorage.removeItem(STORAGE_KEY);
        setError(undefined);
        setState({ ...DEFAULT_STATE });
    }, []);

    const stepIndex = getStepIndex(state.step);
    const back = useCallback(() => {
        if (stepIndex > 0) {
            goto(WIZARD_STEPS[stepIndex - 1].key);
        }
    }, [stepIndex, goto]);

    const disconnected =
        !controllerService ||
        controllerService.status === ControllerStatus.DISCONNECTED;

    // Every step except flashing needs a live FluidNC connection.
    if (disconnected && state.step !== "flash") {
        return (
            <div className="setup-wizard">
                <div className="setup-header">
                    <PageTitle>First Weave</PageTitle>
                    <Button
                        buttonType={ButtonType.WARNING}
                        onClick={startOver}
                        title="Clear progress and restart First Weave"
                    >
                        Start over
                    </Button>
                </div>
                <AlertMessage variant="warning">
                    The controller is not connected. Reconnect to continue First
                    Weave.
                </AlertMessage>
            </div>
        );
    }

    const StepComponent = STEP_COMPONENTS[state.step];

    return (
        <div className="setup-wizard">
            <div className="setup-header">
                <PageTitle>First Weave</PageTitle>
                <div style={{ display: "flex", gap: 12 }}>
                    <Button
                        buttonType={ButtonType.WARNING}
                        disabled={stepIndex <= 0}
                        onClick={back}
                        title="Go back to the previous step"
                    >
                        ← Back
                    </Button>
                    <Button
                        buttonType={ButtonType.WARNING}
                        onClick={startOver}
                        title="Clear progress and restart First Weave"
                    >
                        Start over
                    </Button>
                </div>
            </div>
            <StepIndicator current={state.step} onSelect={goto} />
            <Form.Text className="text-muted d-block mb-3">
                Tip: click any earlier step above to jump back to it.
            </Form.Text>
            <StepComponent
                state={state}
                update={update}
                goto={goto}
                error={error}
                setError={setError}
            />
        </div>
    );
};

export default SetupWizard;
